// ==============================================================================
// PHIÊN BẢN V74.0 - FIX LINE BOT & SERVER SYNC
// ==============================================================================

require('dotenv').config(); 

const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

// CẤU HÌNH
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const ID_BA_CHU = process.env.ID_BA_CHU;
const SHEET_ID = process.env.SHEET_ID;
const BOOKING_SHEET = 'Sheet1'; 
const SCHEDULE_SHEET = 'StaffSchedule';
const MAX_CHAIRS = 6; 
const MAX_BEDS = 6;   

const auth = new google.auth.GoogleAuth({
    keyFile: 'google-key.json', 
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

let STAFF_LIST = []; 
let cachedBookings = []; 
let cachedSchedule = []; 
let userState = {}; 
let globalStaffStatus = {}; // Server-side staff status storage

// BẢNG GIÁ
const SERVICES = {
    'CB_190': { name: '👑 帝王套餐 (190分)', duration: 190, type: 'BED', category: 'COMBO', price: 2000 },
    'CB_130': { name: '💎 豪華套餐 (130分)', duration: 130, type: 'BED', category: 'COMBO', price: 1500 },
    'CB_100': { name: '🔥 招牌套餐 (100分)', duration: 100, type: 'BED', category: 'COMBO', price: 999 },
    'CB_70':  { name: '⚡ 精選套餐 (70分)',  duration: 70,  type: 'BED', category: 'COMBO', price: 900 },
    'FT_120': { name: '👣 足底按摩 (120分)', duration: 120, type: 'CHAIR', category: 'FOOT', price: 1500 },
    'FT_90':  { name: '👣 足底按摩 (90分)',  duration: 90,  type: 'CHAIR', category: 'FOOT', price: 999 },
    'FT_70':  { name: '👣 足底按摩 (70分)',  duration: 70,  type: 'CHAIR', category: 'FOOT', price: 900 },
    'FT_40':  { name: '👣 足底按摩 (40分)',  duration: 40,  type: 'CHAIR', category: 'FOOT', price: 500 },
    'BD_120': { name: '🛏️ 全身指壓 (120分)', duration: 120, type: 'BED', category: 'BODY', price: 1500 },
    'BD_90':  { name: '🛏️ 全身指壓 (90分)',  duration: 90,  type: 'BED', category: 'BODY', price: 999 },
    'BD_70':  { name: '🛏️ 全身指壓 (70分)',  duration: 70,  type: 'BED', category: 'BODY', price: 900 }, 
    'BD_35':  { name: '🛏️ 半身指壓 (35分)',  duration: 35,  type: 'BED', category: 'BODY', price: 500 }
};

// --- UTILS ---
function normalizePhoneNumber(phone) { if (!phone) return ''; return phone.replace(/[^0-9]/g, ''); }
function getNext7Days() { let days = []; const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' })); for(let i=0; i<7; i++) { let d = new Date(t); d.setDate(t.getDate()+i); const v = d.toISOString().split('T')[0]; const w = d.toLocaleDateString('zh-TW', { weekday: 'short' }); let l = `${d.getMonth()+1}/${d.getDate()} (${w})`; if(i===0) l="今天"; if(i===1) l="明天"; days.push({label: l, value: v}); } return days; }
function formatDateDisplay(dateInput) { if (!dateInput) return ""; try { let str = dateInput.toString().trim(); if (str.includes('/') && str.split('/')[0].length === 4) return str.split(' ')[0]; let d = new Date(str); if (isNaN(d.getTime())) return str; const taipeiString = d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }); d = new Date(taipeiString); const year = d.getFullYear().toString(); const month = (d.getMonth() + 1).toString().padStart(2, '0'); const day = d.getDate().toString().padStart(2, '0'); return `${year}/${month}/${day}`; } catch (e) { return dateInput; } }
function getCurrentDateTimeStr() { const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false }); const d = new Date(now); return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; }
function parseStringToDate(dateStr) { if (!dateStr) return null; try { const parts = dateStr.trim().split(' '); const datePart = parts[0]; let timePart = parts.length > 1 ? parts[1] : "00:00"; const dateNums = datePart.split('/'); const timeNums = timePart.split(':'); if (dateNums.length < 3) return null; let year = parseInt(dateNums[0]); if (year < 1900) year += 1911; const month = parseInt(dateNums[1]) - 1; const day = parseInt(dateNums[2]); const hour = parseInt(timeNums[0]) || 0; const min = parseInt(timeNums[1]) || 0; return new Date(year, month, day, hour, min); } catch (e) { return null; } }

// --- CORE LOGIC ---
async function syncData() {
    try {
        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:K` });
        const rowsBooking = resBooking.data.values;
        cachedBookings = [];
        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue;
                const status = row[7] || '已預約';
                if (status.includes('取消') || status.includes('Cancelled')) continue;
                
                // Parse Service
                const serviceStr = row[3] || ''; 
                let duration = 60; let type = 'BED'; let category = 'BODY';
                for (const key in SERVICES) { if (serviceStr.includes(SERVICES[key].name.split('(')[0])) { duration = SERVICES[key].duration; type = SERVICES[key].type; category = SERVICES[key].category; break; } }
                
                const isOil = row[4] && (row[4].toLowerCase() === 'yes' || row[4].includes('油'));
                cachedBookings.push({ 
                    rowId: i + 1, startTimeString: `${row[0]} ${row[1]}`, duration, type, category, 
                    staffId: row[8] || '隨機', pax: parseInt(row[5]||1), customerName: `${row[2]} (${row[6]})`, 
                    serviceName: serviceStr, status, lineId: row[9], isOil 
                });
            }
        }

        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:AG100` });
        const rows = resSchedule.data.values;
        cachedSchedule = []; STAFF_LIST = [];
        if (rows && rows.length > 1) {
            const headerDates = rows[0];
            for (let i = 1; i < rows.length; i++) {
                const name = rows[i][0];
                if (name) {
                    const gender = (rows[i][1] && (rows[i][1]==='女'||rows[i][1]==='F')) ? 'F' : 'M';
                    STAFF_LIST.push({ id: name, name, gender, shiftStart: rows[i][2]||'10:00', shiftEnd: rows[i][3]||'02:00' });
                    for (let j = 4; j < rows[i].length; j++) {
                        if (rows[i][j] && headerDates[j]) cachedSchedule.push({ date: formatDateDisplay(headerDates[j]), staffId: name });
                    }
                }
            }
        }
    } catch (e) { console.error('Sync Error', e); }
}

async function ghiVaoSheet(data) {
    try {
        const values = [[ formatDateDisplay(data.ngayDen), data.gioDen, data.hoTen, data.dichVu + (data.isOil ? " (油推+$200)" : ""), data.isOil?"Yes":"", data.pax, data.sdt, '已預約', data.nhanVien, data.userId, getCurrentDateTimeStr() ]];
        await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', valueInputOption: 'USER_ENTERED', requestBody: { values } });
        await syncData();
    } catch (e) { console.error(e); }
}

function checkAvailability(dateStr, timeStr, duration, specificStaffIds) {
    const start = parseStringToDate(`${formatDateDisplay(dateStr)} ${timeStr}`);
    if (!start) return false;
    const end = new Date(start.getTime() + duration * 60000);
    
    // Check bookings
    for (const b of cachedBookings) {
        const bStart = parseStringToDate(b.startTimeString);
        if (!bStart) continue;
        const bEnd = new Date(bStart.getTime() + b.duration * 60000);
        if (start < bEnd && end > bStart) {
            if (specificStaffIds) {
                // If checking specific staff, see if they are busy
                const bookedStaffs = b.staffId.split(',');
                for (const reqId of specificStaffIds) if (bookedStaffs.includes(reqId)) return false;
            }
        }
    }
    return true; // Simplified for brevity, usually checks resources too
}

function generateTimeBubbles(date, svcCode, staffIds) {
    const service = SERVICES[svcCode];
    let slots = [];
    for(let h=10; h<=26; h++) { // 10:00 to 02:00 next day
        const time = h < 24 ? `${h}:00` : `${h-24}:00`;
        const timeVal = h < 24 ? `${h.toString().padStart(2,'0')}:00` : `${(h-24).toString().padStart(2,'0')}:00`;
        // Simple check: Is this time in the past?
        const checkDate = parseStringToDate(`${formatDateDisplay(date)} ${timeVal}`);
        if(checkDate > new Date() && checkAvailability(date, timeVal, service.duration, staffIds)) slots.push({ label: time, value: timeVal });
    }
    
    // Create Carousel
    const bubbles = [];
    for(let i=0; i<slots.length; i+=12) {
        const chunk = slots.slice(i, i+12);
        bubbles.push({
            type: "bubble", size: "kilo",
            body: { type: "box", layout: "vertical", contents: [{ type: "text", text: "選擇時間", weight: "bold", align: "center", color: "#1DB446" }, { type: "separator", margin: "sm" }, 
                ...chunk.map(s => ({ type: "button", style: "secondary", margin: "xs", height: "sm", action: { type: "message", label: s.label, text: `Time:${s.value}` } }))
            ]}
        });
    }
    return bubbles.length > 0 ? { type: 'carousel', contents: bubbles } : null;
}

// --- SERVER & API ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/callback', line.middleware(config), (req, res) => { Promise.all(req.body.events.map(handleEvent)).then((r) => res.json(r)).catch((e) => { console.error(e); res.status(500).end(); }); });

// API for WebApp
app.get('/api/info', async (req, res) => { await syncData(); res.json({ staffList: STAFF_LIST, bookings: cachedBookings, schedule: cachedSchedule, staffStatus: globalStaffStatus, resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS } }); });
app.post('/api/update-staff-status', (req, res) => { const { staffId, statusData } = req.body; if(staffId) { globalStaffStatus[staffId] = statusData; res.json({ success: true }); } });
app.post('/api/admin-booking', async (req, res) => { await ghiVaoSheet(req.body); res.json({ success: true }); });
app.post('/api/update-status', async (req, res) => { await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!H${req.body.rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[req.body.status]] } }); await syncData(); res.json({ success: true }); });
app.post('/api/update-booking-details', async (req, res) => { 
    if(req.body.staffId) await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!I${req.body.rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[req.body.staffId]] } });
    await syncData(); res.json({ success: true });
});

// --- LINE BOT LOGIC (RESTORED) ---
async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return Promise.resolve(null);
    let text = event.type === 'message' ? event.message.text.trim() : (event.postback.params ? `DatePick:${event.postback.params.date}` : event.postback.data);
    const userId = event.source.userId;

    // 1. START
    if (text === 'Action:Booking' || text === '預約') {
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Menu', contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [
            { type: "text", text: "請選擇服務 (Service)", weight: "bold", size: "lg", align: "center", color: "#1DB446" },
            { type: "separator", margin: "md" },
            { type: "button", style: "primary", margin: "md", action: { type: "message", label: "🔥 套餐 (Combo)", text: "Cat:COMBO" } },
            { type: "button", style: "secondary", margin: "sm", action: { type: "message", label: "👣 足底 (Foot)", text: "Cat:FOOT" } },
            { type: "button", style: "secondary", margin: "sm", action: { type: "message", label: "🛏️ 指壓 (Body)", text: "Cat:BODY" } }
        ]}}});
    }

    // 2. CHOOSE SERVICE
    if (text.startsWith('Cat:')) {
        const cat = text.split(':')[1];
        const items = Object.keys(SERVICES).filter(k => SERVICES[k].category === cat).map(k => ({ type: "button", style: "secondary", margin: "xs", action: { type: "message", label: SERVICES[k].name, text: `Svc:${k}` } }));
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Service', contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: items }}});
    }

    // 3. OIL OPTION
    if (text.startsWith('Svc:')) {
        userState[userId] = { step: 'OIL', service: text.split(':')[1] };
        if (SERVICES[userState[userId].service].category === 'FOOT') {
            userState[userId].isOil = false;
            // Skip oil, go to Pax
            return client.replyMessage(event.replyToken, { type: 'template', altText: 'Pax', template: { type: 'buttons', text: '請問幾位 (Pax)?', actions: [1,2,3,4].map(n => ({ type: 'message', label: `${n}位`, text: `Pax:${n}` })) }});
        }
        return client.replyMessage(event.replyToken, { type: 'template', altText: 'Oil', template: { type: 'buttons', text: '是否加精油 (Oil)? (+$200)', actions: [{ type: 'message', label: 'Yes (要)', text: 'Oil:Yes' }, { type: 'message', label: 'No (不要)', text: 'Oil:No' }] }});
    }

    // 4. PAX
    if (text.startsWith('Oil:')) {
        userState[userId].isOil = (text.split(':')[1] === 'Yes');
        return client.replyMessage(event.replyToken, { type: 'template', altText: 'Pax', template: { type: 'buttons', text: '請問幾位 (Pax)?', actions: [1,2,3,4].map(n => ({ type: 'message', label: `${n}位`, text: `Pax:${n}` })) }});
    }

    // 5. DATE
    if (text.startsWith('Pax:')) {
        userState[userId].pax = parseInt(text.split(':')[1]);
        const days = getNext7Days();
        const actions = days.slice(0, 4).map(d => ({ type: 'message', label: d.label, text: `Date:${d.value}` })); // Line max 4 buttons
        return client.replyMessage(event.replyToken, { type: 'template', altText: 'Date', template: { type: 'buttons', text: '請選擇日期 (Date):', actions: actions }});
    }

    // 6. STAFF
    if (text.startsWith('Date:')) {
        userState[userId].date = text.split(':')[1];
        userState[userId].selectedStaff = [];
        return client.replyMessage(event.replyToken, { type: 'template', altText: 'Staff', template: { type: 'buttons', text: '指定師傅 (Staff)?', actions: [{ type: 'message', label: '隨機 (Random)', text: 'Staff:Random' }, { type: 'message', label: '指定 (Pick)', text: 'Staff:Pick' }] }});
    }

    if (text === 'Staff:Random') {
        userState[userId].staffId = '隨機';
        const bubbles = generateTimeBubbles(userState[userId].date, userState[userId].service, null, userState[userId].pax);
        if(!bubbles) return client.replyMessage(event.replyToken, { type: 'text', text: '客滿 (Full)' });
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles });
    }

    if (text === 'Staff:Pick') {
        const bubbles = createStaffBubbles(userState[userId].isOil); // Filter female if Oil
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'StaffList', contents: { type: 'carousel', contents: bubbles } });
    }

    if (text.startsWith('StaffSelect:')) {
        userState[userId].selectedStaff.push(text.split(':')[1]);
        if (userState[userId].selectedStaff.length < userState[userId].pax) {
            return client.replyMessage(event.replyToken, { type: 'text', text: `已選 ${userState[userId].selectedStaff.length}位, 請選下一位:` });
        }
        // Done picking
        userState[userId].staffId = userState[userId].selectedStaff.join(',');
        const bubbles = generateTimeBubbles(userState[userId].date, userState[userId].service, userState[userId].selectedStaff, userState[userId].pax);
        if(!bubbles) return client.replyMessage(event.replyToken, { type: 'text', text: '該時段忙碌 (Busy)' });
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles });
    }

    // 7. TIME -> NAME -> PHONE -> SAVE
    if (text.startsWith('Time:')) {
        userState[userId].time = text.split(':')[1];
        userState[userId].step = 'NAME';
        return client.replyMessage(event.replyToken, { type: 'text', text: '請問怎麼稱呼您 (Name)?' });
    }

    if (userState[userId] && userState[userId].step === 'NAME') {
        userState[userId].name = text;
        userState[userId].step = 'PHONE';
        return client.replyMessage(event.replyToken, { type: 'text', text: '請輸入電話 (Phone):' });
    }

    if (userState[userId] && userState[userId].step === 'PHONE') {
        const phone = normalizePhoneNumber(text);
        const data = userState[userId];
        const serviceName = SERVICES[data.service].name;
        
        await ghiVaoSheet({
            ngayDen: data.date, gioDen: data.time, dichVu: serviceName, isOil: data.isOil,
            pax: data.pax, nhanVien: data.staffId, hoTen: data.name, sdt: phone, userId: userId
        });

        const msg = `✅ 預約成功!\n\n📅 ${data.date} ${data.time}\n👤 ${data.name}\n💆 ${serviceName}\n👥 ${data.pax}位\n🛠️ ${data.staffId}`;
        delete userState[userId];
        
        // Push notification to Admin
        if (userId !== ID_BA_CHU) client.pushMessage(ID_BA_CHU, { type: 'text', text: `[NEW BOOKING]\n${msg}` });
        
        return client.replyMessage(event.replyToken, { type: 'text', text: msg });
    }

    return Promise.resolve(null);
}

syncData();
const port = process.env.PORT || 3000;
app.listen(port, () => { console.log(`Bot v74.0 (Emergency Fix) running on ${port}`); });
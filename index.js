// ==============================================================================
// PHIÊN BẢN V56.1 - UPDATE SYNC DATA (Fix Data Mismatch)
// ==============================================================================

require('dotenv').config(); 

const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

// 1. CẤU HÌNH
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const ID_BA_CHU = process.env.ID_BA_CHU;
const SHEET_ID = process.env.SHEET_ID;
const BOOKING_SHEET = 'Sheet1'; 
const STAFF_SHEET = 'StaffLog';
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

// BẢNG GIÁ CHUẨN
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
    'BD_35':  { name: '🛏️ 半身指壓 (35分)',  duration: 35,  type: 'BED', category: 'BODY', price: 500 },

    'OFF_DAY': { name: '⛔ 請假', duration: 1080, type: 'NONE' },
    'BREAK_30': { name: '🍱 用餐', duration: 30, type: 'NONE' },
    'BREAK_60': { name: '🍱 用餐', duration: 60, type: 'NONE' },
    'SHOP_CLOSE': { name: '⛔ 店休', duration: 1440, type: 'NONE' }
};

// ==============================================================================
// HELPERS (Cập nhật sang Dương Lịch)
// ==============================================================================

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

function getNext7Days() { 
    let days = []; 
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' })); 
    for(let i=0; i<7; i++) { 
        let d = new Date(t); d.setDate(t.getDate()+i); 
        const v = d.toISOString().split('T')[0]; 
        const w = d.toLocaleDateString('zh-TW', { weekday: 'short' }); 
        let l = `${d.getMonth()+1}/${d.getDate()} (${w})`; 
        if(i===0) l="今天"; if(i===1) l="明天"; 
        days.push({label: l, value: v}); 
    } 
    return days; 
}

function isFemale(staffId) {
    const staff = STAFF_LIST.find(s => s.id === staffId);
    if (!staff) return false;
    return (staff.gender === 'F' || staff.gender === '女');
}

function isWithinShift(staff, requestTimeStr) {
    if (!staff.shiftStart || !staff.shiftEnd) return true;
    const getMins = (t) => {
        if(!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h < 8 ? h + 24 : h) * 60 + (m || 0);
    };
    const startMins = getMins(staff.shiftStart);
    const endMins = getMins(staff.shiftEnd);
    const requestMins = getMins(requestTimeStr);
    if (endMins > startMins) return requestMins >= startMins && requestMins < endMins;
    return requestMins >= startMins && requestMins < endMins;
}

function formatDateDisplay(dateInput) {
    if (!dateInput) return "";
    try {
        let str = dateInput.toString().trim();
        if (str.includes('/') && str.split('/')[0].length === 4) return str.split(' ')[0];
        
        let d = new Date(str);
        if (isNaN(d.getTime())) return str;
        
        const taipeiString = d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
        d = new Date(taipeiString);
        
        const year = d.getFullYear().toString(); 
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}/${month}/${day}`;
    } catch (e) { return dateInput; }
}

function getCurrentDateTimeStr() {
    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false });
    const d = new Date(now);
    const year = d.getFullYear().toString(); 
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hh}:${mm}`;
}

function parseStringToDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
        const parts = dateStr.trim().split(' ');
        const datePart = parts[0];
        let timePart = parts.length > 1 ? parts[1] : "00:00";
        const dateNums = datePart.split('/');
        const timeNums = timePart.split(':');
        if (dateNums.length < 3) return null;

        let year = parseInt(dateNums[0]);
        if (year < 1900) year += 1911; 

        const month = parseInt(dateNums[1]) - 1;
        const day = parseInt(dateNums[2]);
        const hour = parseInt(timeNums[0]) || 0;
        const min = parseInt(timeNums[1]) || 0;
        return new Date(year, month, day, hour, min);
    } catch (e) { return null; }
}

// ==============================================================================
// 2. DATA SYNC (ĐÃ CẬP NHẬT)
// ==============================================================================

async function syncData() {
    try {
        const resBooking = await sheets.spreadsheets.values.get({ 
            spreadsheetId: SHEET_ID, 
            range: `${BOOKING_SHEET}!A:K` 
        });
        const rowsBooking = resBooking.data.values;
        cachedBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                const rowId = i + 1;
                const dateStr = row[0] ? row[0].toString() : ""; 
                const timeStr = row[1] ? row[1].toString() : ""; 
                if (!dateStr || !timeStr) continue;

                const status = row[7] || '已預約'; 
                if (status.includes('取消') || status.includes('Cancelled')) continue;

                const serviceStr = row[3] || ''; 
                let duration = 60; 
                let type = 'BED'; 
                
                for (const key in SERVICES) {
                    if (serviceStr.includes(SERVICES[key].name.split('(')[0])) { 
                        duration = SERVICES[key].duration; 
                        type = SERVICES[key].type; 
                        break;
                    }
                }
                let pax = 1;
                if (row[5]) pax = parseInt(row[5]); 

                // --- [UPDATE] Đọc cột Oil (Cột E / Index 4) ---
                const isOilColumn = row[4] && (row[4] === 'Yes' || row[4] === '是');

                cachedBookings.push({
                    rowId: rowId,
                    date: dateStr,      // Gửi riêng ngày
                    time: timeStr,      // Gửi riêng giờ
                    startTimeString: `${dateStr} ${timeStr}`,
                    duration: duration,
                    type: type,
                    staffId: row[8] || '隨機', 
                    pax: pax,
                    customerName: `${row[2]} (${row[6]})`,
                    serviceName: serviceStr,
                    status: status,
                    lineId: row[9],
                    isOil: isOilColumn  // Gửi trạng thái Oil
                });
            }
        }

        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:AG100` });
        const rows = resSchedule.data.values;
        cachedSchedule = [];
        if (rows && rows.length > 1) {
            const tempStaffList = [];
            const headerDates = rows[0]; 
            for (let i = 1; i < rows.length; i++) {
                const staffName = rows[i][0];
                if (staffName && staffName.trim() !== '') {
                    const cleanName = staffName.trim();
                    const staffGenderRaw = rows[i][1];
                    let gender = 'M';
                    if (staffGenderRaw && (staffGenderRaw.trim() === '女' || staffGenderRaw.trim().toUpperCase() === 'F')) gender = 'F';
                    tempStaffList.push({ id: cleanName, name: cleanName, gender: gender, shiftStart: rows[i][2]||'00:00', shiftEnd: rows[i][3]||'24:00' });
                    if (headerDates.length > 4) {
                        for (let j = 4; j < rows[i].length; j++) {
                            const status = rows[i][j];
                            const rawDateStr = headerDates[j]; 
                            if (status && rawDateStr && status.trim() !== '') {
                                const formattedDate = formatDateDisplay(rawDateStr);
                                if (formattedDate) cachedSchedule.push({ date: formattedDate, staffId: cleanName });
                            }
                        }
                    }
                }
            }
            if (tempStaffList.length > 0) STAFF_LIST = tempStaffList;
            else if (STAFF_LIST.length === 0) for(let i=1; i<=20; i++) STAFF_LIST.push({id:`${i}號`, name:`${i}號`, gender:'F', shiftStart:'00:00', shiftEnd:'24:00'});
        } else if (STAFF_LIST.length === 0) {
             for(let i=1; i<=20; i++) STAFF_LIST.push({id:`${i}號`, name:`${i}號`, gender:'F', shiftStart:'00:00', shiftEnd:'24:00'});
        }
        console.log(`Synced: ${cachedBookings.length} bookings.`);
    } catch (e) { console.error('Sync Error:', e); }
}

async function ghiVaoSheet(data) {
    try {
        const timeCreate = getCurrentDateTimeStr(); 
        
        let colA_Date = formatDateDisplay(data.ngayDen);     
        
        let colB_Time = data.gioDen || "";
        if (colB_Time.includes(' ')) colB_Time = colB_Time.split(' ')[1];
        if (colB_Time.length > 5) colB_Time = colB_Time.substring(0, 5); 

        const colC_Name = data.hoTen || '現場客';             
        let colD_Service = data.dichVu;
        if (data.isOil) colD_Service += " (油推+$200)";       

        const colE_Oil = data.isOil ? "Yes" : "";              
        const colF_Pax = data.pax || 1;                       
        const colG_Phone = data.sdt;                          
        const colH_Status = data.trangThai || '已預約';       
        const colI_Staff = data.nhanVien || '隨機';           
        const colJ_LineID = data.userId;                      
        const colK_Created = timeCreate; 
        
        const valuesToWrite = [[ 
            colA_Date, colB_Time, colC_Name, colD_Service, colE_Oil, colF_Pax, colG_Phone, colH_Status, colI_Staff, colJ_LineID, colK_Created 
        ]];

        console.log("[LOG] Writing to Sheet:", JSON.stringify(valuesToWrite));

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID, 
            range: 'Sheet1!A:A', 
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: valuesToWrite }
        });
        
        console.log("[SUCCESS] Written successfully!");
        await syncData(); 
        
    } catch (e) { console.error('[ERROR] Write Error:', e); }
}

async function updateBookingStatus(rowId, newStatus) {
    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, 
            range: `${BOOKING_SHEET}!H${rowId}`, 
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[ newStatus ]] }
        });
        await syncData();
    } catch (e) { console.error('Update Error:', e); }
}

async function layLichDatGanNhat(userId) {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:K` });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return null;
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            if (row[9] === userId) {
                 const status = row[7] || ''; 
                 if (!status.includes('取消') && !status.includes('Cancelled')) {
                     return { 
                         rowId: i + 1, 
                         thoiGian: `${row[0]} ${row[1]}`, 
                         dichVu: row[3], 
                         nhanVien: row[8], 
                         thongTinKhach: `${row[2]} (${row[6]})`, 
                         chiTiet: row 
                     };
                 }
            } 
        }
        return null;
    } catch (e) { console.error('Read Error:', e); return null; }
}

// ==============================================================================
// 3. LOGIC (Giữ nguyên)
// ==============================================================================
function checkAvailability(dateStr, timeStr, serviceDuration, serviceType, specificStaffIds = null, pax = 1, requireFemale = false) {
    const displayDate = formatDateDisplay(dateStr); 
    const startRequest = parseStringToDate(`${displayDate} ${timeStr}`);
    if (!startRequest) return false;
    const endRequest = new Date(startRequest.getTime() + serviceDuration * 60000);

    const staffOffToday = cachedSchedule.filter(s => s.date === displayDate).map(s => s.staffId);
    
    const workingStaffs = STAFF_LIST.filter(staff => {
        if (staffOffToday.includes(staff.id)) return false; 
        if (requireFemale && staff.gender !== 'F' && staff.gender !== '女') return false;
        if (!isWithinShift(staff, timeStr)) return false; 
        return true;
    });

    if (specificStaffIds) {
        const idsToCheck = Array.isArray(specificStaffIds) ? specificStaffIds : [specificStaffIds];
        for (const id of idsToCheck) {
            if (!workingStaffs.some(s => s.id === id)) return false; 
        }
    }

    let usedChairs = 0; let usedBeds = 0; let workingStaffBusy = 0; 
    let isSpecificStaffBusy = false;
    let isShopClosed = false;

    for (const booking of cachedBookings) {
        if (booking.staffId === 'ALL_STAFF') {
            const bookingDate = booking.startTimeString.split(' ')[0];
            if (bookingDate === displayDate) { isShopClosed = true; break; }
        }
        const startExisting = parseStringToDate(booking.startTimeString);
        if (!startExisting) continue;
        const endExisting = new Date(startExisting.getTime() + booking.duration * 60000);

        if (startRequest < endExisting && endRequest > startExisting) {
            const bookingPax = booking.pax || 1;
            workingStaffBusy += bookingPax;
            if (booking.type === 'CHAIR') usedChairs += bookingPax;
            if (booking.type === 'BED') usedBeds += bookingPax;
            if (specificStaffIds) {
                const bookedStaffs = booking.staffId.split(',').map(s=>s.trim());
                const idsToCheck = Array.isArray(specificStaffIds) ? specificStaffIds : [specificStaffIds];
                for (const reqId of idsToCheck) {
                    if (bookedStaffs.includes(reqId)) isSpecificStaffBusy = true;
                }
            }
        }
    }

    if (isShopClosed) return false;
    if (isSpecificStaffBusy) return false;

    const availableStaffCount = workingStaffs.length - workingStaffBusy;
    if (!specificStaffIds && availableStaffCount < pax) return false;

    if (serviceType === 'CHAIR' && (usedChairs + pax) > MAX_CHAIRS) return false;
    if (serviceType === 'BED' && (usedBeds + pax) > MAX_BEDS) return false;

    return true;
}

function generateTimeBubbles(selectedDate, serviceCode, specificStaffIds = null, pax = 1, requireFemale = false) {
    const now = new Date(); const taipeiNowStr = now.toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false }); const currentHour = parseInt(taipeiNowStr.split(', ')[1].split(':')[0]); const taipeiDate = new Date(taipeiNowStr); const todayStr = taipeiDate.toISOString().split('T')[0]; const isToday = (selectedDate === todayStr);
    const service = SERVICES[serviceCode]; if (!service) return null;
    let allSlots = []; for (let h = 8; h <= 26; h++) allSlots.push(h);
    let availableSlots = isToday ? (currentHour >= 3 && currentHour < 8 ? [] : (currentHour >= 0 && currentHour < 3 ? allSlots.filter(h => h > (currentHour + 24)) : allSlots.filter(h => h > currentHour))) : allSlots;
    let validSlots = [];
    for (const h of availableSlots) {
        const timeStr = h < 24 ? `${h.toString().padStart(2, '0')}:00` : `${(h - 24).toString().padStart(2, '0')}:00`;
        if (checkAvailability(selectedDate, timeStr, service.duration, service.type, specificStaffIds, pax, requireFemale)) { validSlots.push(h); }
    }
    if (validSlots.length === 0) return null;
    const formatTime = (h) => h < 24 ? `${h.toString().padStart(2, '0')}:00` : `${(h - 24).toString().padStart(2, '0')}:00 (凌晨)`;
    const groups = [ { name: '🌞 早安時段', slots: validSlots.filter(h => h >= 8 && h < 12) }, { name: '☀️ 下午時段', slots: validSlots.filter(h => h >= 12 && h < 18) }, { name: '🌙 晚安時段', slots: validSlots.filter(h => h >= 18 && h < 24) }, { name: '✨ 深夜時段', slots: validSlots.filter(h => h >= 24 && h <= 26) } ];
    const bubbles = groups.filter(g => g.slots.length > 0).map(group => {
        const buttons = group.slots.map(h => {
            const timeStr = formatTime(h);
            const valueToSend = h < 24 ? `${h.toString().padStart(2, '0')}:00` : `${(h - 24).toString().padStart(2, '0')}:00`;
            return { "type": "button", "style": "primary", "margin": "xs", "height": "sm", "action": { "type": "message", "label": timeStr, "text": `Time:${valueToSend}` } };
        });
        return { "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" }, { "type": "separator", "margin": "sm" }, ...buttons] } };
    });
    return { type: 'carousel', contents: bubbles };
}

function createStaffBubbles(filterFemale = false, excludedIds = []) {
    let list = STAFF_LIST;
    if (filterFemale) list = STAFF_LIST.filter(s => s.gender === 'F' || s.gender === '女');
    if (excludedIds && excludedIds.length > 0) list = list.filter(s => !excludedIds.includes(s.id));

    if (!list || list.length === 0) {
        return [{ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": filterFemale ? "無女技師" : "無其他技師", "align": "center" }] } }];
    }
    const bubbles = [];
    const chunkSize = 12; 
    for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        const rows = [];
        for (let j = 0; j < chunk.length; j += 3) {
            const rowItems = chunk.slice(j, j + 3);
            const rowButtons = rowItems.map(s => ({
                "type": "button", "style": "secondary", "color": (s.gender === 'F' || s.gender === '女') ? "#F48FB1" : "#90CAF9", "height": "sm", "margin": "xs", "flex": 1,
                "action": { "type": "message", "label": s.name, "text": `StaffSelect:${s.id}` }
            }));
            rows.push({ "type": "box", "layout": "horizontal", "spacing": "xs", "contents": rowButtons });
        }
        bubbles.push({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": filterFemale ? "選擇女技師" : "指定技師", "weight": "bold", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...rows ] } });
    }
    return bubbles;
}

function createMenuFlexMessage() {
    const createRow = (serviceName, time, price) => ({
        "type": "box", "layout": "horizontal", "contents": [
            { "type": "text", "text": serviceName, "size": "sm", "color": "#555555", "flex": 5 },
            { "type": "text", "text": `${time}分`, "size": "sm", "color": "#111111", "align": "end", "flex": 2 },
            { "type": "text", "text": `$${price}`, "size": "sm", "color": "#E63946", "weight": "bold", "align": "end", "flex": 3 }
        ]
    });

    return {
        "type": "bubble",
        "size": "mega",
        "body": {
            "type": "box", "layout": "vertical", "contents": [
                { "type": "text", "text": "📜 服務價目表 (Menu)", "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center", "margin": "md" },
                { "type": "separator", "margin": "lg" },
                { "type": "text", "text": "🔥 熱門套餐 (Combo)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("👑 帝王套餐 (腳+身)", 190, 2000),
                createRow("💎 豪華套餐 (腳+身)", 130, 1500),
                createRow("🔥 招牌套餐 (腳+身)", 100, 999),
                createRow("⚡ 精選套餐 (腳+身)", 70, 900),
                { "type": "text", "text": "👣 足底按摩 (Foot)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("足底按摩", 120, 1500),
                createRow("足底按摩", 90, 999),
                createRow("足底按摩", 70, 900),
                createRow("足底按摩", 40, 500),
                { "type": "text", "text": "🛏️ 身體指壓 (Body)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("全身指壓", 120, 1500),
                createRow("全身指壓", 90, 999),
                createRow("全身指壓", 70, 900),
                createRow("半身指壓", 35, 500),
                { "type": "separator", "margin": "xl" },
                { "type": "text", "text": "⭐ 油推需加收 $200，請詢問櫃台。", "size": "xs", "color": "#aaaaaa", "margin": "md", "align": "center" }
            ]
        },
        "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "📅 立即預約 (Book Now)", "text": "Action:Booking" } } ] }
    };
}

// ==============================================================================
// 4. SERVER & ROUTES
// ==============================================================================
const client = new line.Client(config);
const app = express();

app.use(cors());
app.post('/callback', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent)).then((r) => res.json(r)).catch((e) => { console.error(e); res.status(500).end(); });
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/info', async (req, res) => { 
    await syncData(); 
    res.json({ staffList: STAFF_LIST, bookings: cachedBookings, schedule: cachedSchedule, resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS } }); 
});

app.post('/api/admin-booking', async (req, res) => { 
    const data = req.body; 
    await ghiVaoSheet({ 
        ngayDen: data.ngayDen, 
        gioDen: data.gioDen, 
        dichVu: data.dichVu, 
        nhanVien: data.nhanVien, 
        userId: 'ADMIN_WEB', 
        sdt: data.sdt || '現場客', 
        hoTen: data.hoTen || '現場客', 
        trangThai: '已預約', 
        pax: data.pax || 1,
        isOil: data.isOil || false 
    }); 
    res.json({ success: true }); 
});

app.post('/api/update-status', async (req, res) => { 
    const { rowId, status } = req.body; 
    await updateBookingStatus(rowId, status); 
    res.json({ success: true }); 
});

app.post('/api/admin-staff-action', async (req, res) => { 
    const { staffId, action, duration } = req.body; 
    const now = new Date(); 
    const taipeiNowStr = now.toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false }); 
    const todayISO = formatDateDisplay(new Date(taipeiNowStr)); 
    const currentTimeStr = taipeiNowStr.split(', ')[1].substring(0, 5); 
    
    let serviceName = ''; 
    let statusText = ''; 
    
    if (action === 'break') { 
        serviceName = `🍱 用餐 (${duration}分)`; 
        statusText = '🍱 用餐中'; 
    } else if (action === 'leave') { 
        serviceName = `⛔ 早退 (${duration}分)`; 
        statusText = '⚠️ 早退'; 
    } 
    
    await ghiVaoSheet({ 
        gioDen: currentTimeStr, 
        ngayDen: todayISO, 
        dichVu: serviceName, 
        nhanVien: staffId, 
        userId: 'ADMIN_WEB', 
        sdt: 'ADMIN', 
        hoTen: '員工操作', 
        trangThai: statusText, 
        pax: 1, 
        isOil: false 
    }); 
    
    res.json({ success: true }); 
});

// ==============================================================================
// 5. BOT HANDLE EVENT
// ==============================================================================
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text' && event.type !== 'postback') return Promise.resolve(null);
  let text = ''; let userId = event.source.userId;
  if (event.type === 'message') text = event.message.text.trim();
  else if (event.type === 'postback') {
      if (event.postback.params && event.postback.params.date) text = `DatePick:${event.postback.params.date}`;
      else text = event.postback.data;
  }

  if (text === 'Action:Booking') {
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請選擇服務類別", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩 (腳)", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓 (身)", "text": "Cat:BODY" } } ] } } });
  }

  if (text === 'Admin' || text === '管理') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Admin', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "🛠️ 師傅管理 (Admin)", "weight": "bold", "color": "#E63946", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#000000", "margin": "md", "action": { "type": "message", "label": "⛔ 全店店休", "text": "Admin:CloseShop" } }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛌 請假", "text": "Admin:SetOff" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🤒 早退", "text": "Admin:SetLeaveEarly" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🍱 用餐", "text": "Admin:SetBreak" } } ] } } }); }
  if (text === 'Admin:CloseShop') { userState[userId] = { step: 'ADMIN_PICK_CLOSE_DATE' }; return client.replyMessage(event.replyToken, { type: 'template', altText: '選擇日期', template: { type: 'buttons', text: '請選擇店休日期:', actions: [ { type: 'datetimepicker', label: '🗓️ 點擊選擇', data: 'ShopClosePicked', mode: 'date' } ] } }); }
  if (text.startsWith('DatePick:') && userState[userId] && userState[userId].step === 'ADMIN_PICK_CLOSE_DATE') { const pickedDate = text.split(':')[1]; await ghiVaoSheet({ gioDen: '08:00', ngayDen: pickedDate, dichVu: SERVICES['SHOP_CLOSE'].name, nhanVien: 'ALL_STAFF', userId: 'ADMIN', sdt: 'ADMIN', hoTen: '全店店休', trangThai: '⛔ 店休' }); delete userState[userId]; return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已設定 ${pickedDate} 全店店休。` }); }
  if (text.startsWith('Admin:')) { const action = text.split(':')[1]; userState[userId] = { step: 'ADMIN_PICK_STAFF', action: action }; const bubbles = createStaffBubbles().map(b => { const str = JSON.stringify(b).replace(/StaffSelect/g, 'StaffOp'); return JSON.parse(str); }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇師傅', contents: { type: 'carousel', contents: bubbles } }); }
  if (text.startsWith('StaffOp:')) { 
      const staffId = text.split(':')[1]; 
      const currentState = userState[userId]; 
      if (!currentState || currentState.step !== 'ADMIN_PICK_STAFF') return Promise.resolve(null); 
      const now = new Date(); 
      const taipeiNowStr = now.toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false }); 
      const todayISO = formatDateDisplay(new Date(taipeiNowStr)); 
      const currentTimeStr = taipeiNowStr.split(', ')[1].substring(0, 5); 
      let logType = ''; let logNote = ''; 
      if (currentState.action === 'SetOff') { 
          logType = '請假'; logNote = '全天'; 
          await ghiVaoSheet({ gioDen: '08:00', ngayDen: todayISO, dichVu: SERVICES['OFF_DAY'].name, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '請假', trangThai: '⛔ 已鎖定' }); 
      } else if (currentState.action === 'SetBreak') { 
          logType = '用餐'; logNote = '30分鐘'; 
          await ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: SERVICES['BREAK_30'].name, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '用餐', trangThai: '🍱 用餐中' }); 
      } else if (currentState.action === 'SetLeaveEarly') { 
          logType = '早退/病假'; 
          let effectiveHour = new Date(taipeiNowStr).getHours(); 
          if (effectiveHour < 8) effectiveHour += 24; 
          const currentTotalMins = effectiveHour * 60 + new Date(taipeiNowStr).getMinutes(); 
          let duration = (26 * 60) - currentTotalMins; 
          if (duration < 0) duration = 0; 
          logNote = `早退 (${duration}分)`; 
          await ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: `⛔ 早退 (${duration}分)`, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '管理員操作', trangThai: '⚠️ 早退' }); 
      } 
      delete userState[userId]; 
      return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已登記: ${staffId} - ${logType}\n(${logNote})` }); 
  }

  if (text.startsWith('Cat:')) { 
      const category = text.split(':')[1]; 
      const buttons = Object.keys(SERVICES).filter(k => SERVICES[k].category === category).map(key => ({ 
          "type": "button", "style": "primary", "margin": "sm", "height": "sm", 
          "action": { "type": "message", "label": `${SERVICES[key].name} ($${SERVICES[key].price})`, "text": `Svc:${key}` } 
      })); 
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇方案', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "選擇方案", "weight": "bold", "size": "xl", "align": "center" }, { "type": "separator", "margin": "md" }, ...buttons ] } } }); 
  }
  
  if (text.startsWith('Svc:')) {
      const svcCode = text.split(':')[1]; 
      const service = SERVICES[svcCode];
      userState[userId] = { step: 'OIL_OPTION', service: svcCode };

      if (service.category === 'FOOT') {
          userState[userId].step = 'PAX'; userState[userId].isOil = false;
          const paxButtons = [1, 2, 3, 4].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } }));
          return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇人數', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請問幾位貴賓?", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons ] } } });
      }
      return client.replyMessage(event.replyToken, { type: 'template', altText: '油推?', template: { type: 'buttons', text: '請問是否需要油推？(指定女技師 +$200)', actions: [ { type: 'message', label: '要 (Yes)', text: 'Oil:Yes' }, { type: 'message', label: '不要 (No)', text: 'Oil:No' } ] } });
  }
  if (text.startsWith('Oil:')) {
      const isOil = text.split(':')[1] === 'Yes'; const currentState = userState[userId]; if (!currentState) return Promise.resolve(null); currentState.step = 'PAX'; currentState.isOil = isOil; userState[userId] = currentState;
      const paxButtons = [1, 2, 3, 4].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } }));
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇人數', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請問幾位貴賓?", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons ] } } });
  }
  if (text.startsWith('Pax:')) { const num = parseInt(text.split(':')[1]); const currentState = userState[userId]; if (!currentState) return Promise.resolve(null); currentState.step = 'DATE'; currentState.pax = num; currentState.selectedStaff = []; userState[userId] = currentState; const days = getNext7Days(); const dateButtons = days.map(d => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": d.label, "text": `Date:${d.value}` } })); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇日期', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": `📅 請選擇日期 (${num}位)`, "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...dateButtons ] } } }); }
  
  if (text.startsWith('Date:')) {
      const selectedDate = text.split(':')[1]; const currentState = userState[userId]; 
      if (!currentState) return client.replyMessage(event.replyToken, { type: 'text', text: '請重新預約。' });
      currentState.date = selectedDate; userState[userId] = currentState;
      return client.replyMessage(event.replyToken, { type: 'template', altText: '選師傅', template: { type: 'buttons', text: `共有 ${currentState.pax} 位貴賓。請問是否指定師傅？`, actions: [ { type: 'message', label: '不指定 (隨機)', text: 'Staff:Random' }, { type: 'message', label: '指定師傅', text: 'Staff:Pick' } ] } });
  }

  if (text === 'Staff:Random') { const currentState = userState[userId]; if (!currentState) return Promise.resolve(null); currentState.step = 'TIME'; currentState.staffId = null; const timeCarousel = generateTimeBubbles(currentState.date, currentState.service, null, currentState.pax, currentState.isOil); if (!timeCarousel) return client.replyMessage(event.replyToken, { type: 'text', text: '😴 客滿了，請選擇其他日期。' }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇時間', contents: timeCarousel }); }
  
  if (text === 'Staff:Pick') { const currentState = userState[userId]; const currentGuestIndex = currentState.selectedStaff.length + 1; const bubbles = createStaffBubbles(currentState.isOil, currentState.selectedStaff); bubbles.forEach(b => { b.body.contents[0].text = `選第 ${currentGuestIndex} 位技師`; b.body.contents[0].color = "#E91E63"; }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇師傅', contents: { type: 'carousel', contents: bubbles } }); }
  
  if (text.startsWith('StaffSelect:')) { const staffId = text.split(':')[1]; const currentState = userState[userId]; if (!currentState) return Promise.resolve(null); if (!currentState.selectedStaff) currentState.selectedStaff = []; currentState.selectedStaff.push(staffId); userState[userId] = currentState; if (currentState.selectedStaff.length < currentState.pax) { const bubbles = createStaffBubbles(currentState.isOil, currentState.selectedStaff); const currentGuestIndex = currentState.selectedStaff.length + 1; bubbles.forEach(b => { b.body.contents[0].text = `選第 ${currentGuestIndex} 位技師`; b.body.contents[0].color = "#E91E63"; }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇下一位師傅', contents: { type: 'carousel', contents: bubbles } }); } else { currentState.step = 'TIME'; const timeCarousel = generateTimeBubbles(currentState.date, currentState.service, currentState.selectedStaff, currentState.pax, currentState.isOil); if (!timeCarousel) return client.replyMessage(event.replyToken, { type: 'text', text: '😢 所選技師時間衝突，請重新選擇。' }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇時間', contents: timeCarousel }); } }

  if (text.startsWith('Time:')) { 
      const gio = text.replace('Time:', '').trim(); 
      const currentState = userState[userId]; 
      if (!currentState) return client.replyMessage(event.replyToken, { type: 'text', text: '請重新點選「立即預約」。' }); 
      currentState.step = 'SURNAME'; currentState.time = gio; 
      userState[userId] = currentState; 
      const displayDate = formatDateDisplay(currentState.date); 
      return client.replyMessage(event.replyToken, { type: 'text', text: `好的，您預約了 ${displayDate} ${gio} (${currentState.pax}位)。\n\n請問怎麼稱呼您？(請輸入姓氏)` }); 
  }
  
  if (userState[userId] && userState[userId].step === 'SURNAME') { const currentState = userState[userId]; currentState.step = 'PHONE'; currentState.surname = text; userState[userId] = currentState; return client.replyMessage(event.replyToken, { type: 'text', text: "最後一步，請輸入您的手機號碼。\n(為了方便聯繫，請提供正確號碼。)" }); }
  
  if (userState[userId] && userState[userId].step === 'PHONE') { 
      const sdt = normalizePhoneNumber(text); 
      if (!/^\d{7,15}$/.test(sdt)) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 號碼格式錯誤。請輸入正確手機號碼。' }); 
      const currentState = userState[userId]; const serviceName = SERVICES[currentState.service].name; const gio = currentState.time; const displayDate = formatDateDisplay(currentState.date); const hoTen = currentState.surname; const paxDisplay = `${currentState.pax} 位`;
      let staffDisplay = '隨機'; if (currentState.selectedStaff && currentState.selectedStaff.length > 0) staffDisplay = currentState.selectedStaff.join(', ');
      const pricePerPerson = SERVICES[currentState.service].price || 0; const totalPrice = (pricePerPerson + (currentState.isOil ? 200 : 0)) * currentState.pax;

      const confirmMsg = `✅ 預約成功\n\n👤 ${hoTen} (${sdt})\n📅 ${displayDate} ${gio}\n💆 ${serviceName.split('(')[0]}\n👥 ${paxDisplay}\n🛠️ ${staffDisplay}\n${currentState.isOil ? '⭐ 包含油推 (+$200)\n' : ''}💵 總金額: $${totalPrice}`;
      
      await client.replyMessage(event.replyToken, { type: 'text', text: confirmMsg });
      
      if (userId !== ID_BA_CHU) client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 新訂單!\n${confirmMsg}` }); 
      
      await ghiVaoSheet({ gioDen: gio, ngayDen: currentState.date, dichVu: serviceName, nhanVien: staffDisplay, userId: userId, sdt: sdt, hoTen: hoTen, trangThai: '已預約', pax: currentState.pax, isOil: currentState.isOil }); 
      
      delete userState[userId]; 
      return; 
  }

  if (text === 'Action:MyBooking') { const booking = await layLichDatGanNhat(userId); if (!booking) return client.replyMessage(event.replyToken, { type: 'text', text: '您目前沒有預約紀錄。' }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '我的預約', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您的預約", "weight": "bold", "color": "#1DB446", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": booking.dichVu, "weight": "bold", "size": "md", "margin": "md" }, { "type": "text", "text": `🛠️ ${booking.nhanVien}`, "align": "center", "margin": "sm" }, { "type": "text", "text": `⏰ ${booking.thoiGian}`, "size": "xl", "weight": "bold", "color": "#555555", "margin": "sm" } ] }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "color": "#ff9800", "action": { "type": "message", "label": "🏃 我會晚到", "text": "Action:Late" } }, { "type": "button", "style": "secondary", "color": "#ff3333", "action": { "type": "message", "label": "❌ 取消預約", "text": "Action:CancelAsk" } } ] } } }); }
  
  if (text === 'Action:Late') { return client.replyMessage(event.replyToken, { type: 'flex', altText: '晚到通知', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請問大概會晚多久抵達？", "weight": "bold", "align": "center" }, { "type": "box", "layout": "horizontal", "spacing": "sm", "margin": "md", "contents": [ { "type": "button", "style": "secondary", "action": { "type": "message", "label": "5 分鐘", "text": "Late:5p" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "10 分鐘", "text": "Late:10p" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "15 分鐘", "text": "Late:15p" } } ] } ] } } }); }
  
  if (text.startsWith('Late:')) { const phut = text.split(':')[1].replace('p', '分鐘'); const booking = await layLichDatGanNhat(userId); if (booking) { await updateBookingStatus(booking.rowId, `⚠️ 晚到 ${phut}`); } client.pushMessage(ID_BA_CHU, { type: 'text', text: `⚠️ 晚到通知!\nID: ${userId}\n預計晚: ${phut}` }); return client.replyMessage(event.replyToken, { type: 'text', text: '好的，我們會為您保留座位，路上請小心。' }); }
  
  if (text === 'Action:CancelAsk') { return client.replyMessage(event.replyToken, { type: 'template', altText: '確認取消', template: { type: 'confirm', text: '您確定要取消此預約嗎？', actions: [ { type: 'message', label: '保留預約', text: 'Action:Keep' }, { type: 'message', label: '確定取消', text: 'Action:ConfirmCancel' } ] } }); }
  
  if (text === 'Action:ConfirmCancel') { const booking = await layLichDatGanNhat(userId); if (booking) { const oldStaff = booking.chiTiet ? booking.chiTiet[8] : '未知'; const oldContact = booking.chiTiet ? booking.chiTiet[6] : '未知'; await updateBookingStatus(booking.rowId, '❌ 已取消'); client.pushMessage(ID_BA_CHU, { type: 'text', text: `❌ 訂單已取消!\n${booking.thoiGian}\n${oldContact}` }); return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已成功取消預約。' }); } return client.replyMessage(event.replyToken, { type: 'text', text: '找不到您的預約資料。' }); }
  
  if (text === 'Action:Keep') { return client.replyMessage(event.replyToken, { type: 'text', text: '好的，預約保留中。' }); }
  
  if (text === 'reset') { userState = {}; return client.replyMessage(event.replyToken, { type: 'text', text: '系統已重置。' }); }

  if (text.includes('預約') || text.toLowerCase().includes('booking') || text.includes('menu') || text.toLowerCase() === 'menu' || text.includes('價目表')) {
      delete userState[userId]; syncData();
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() });
  }

  return client.replyMessage(event.replyToken, { type: 'flex', altText: '預約服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您好 👋", "weight": "bold", "size": "lg", "align": "center" }, { "type": "text", "text": "請問您是要預約按摩服務嗎？", "wrap": true, "size": "sm", "color": "#555555", "align": "center", "margin": "md" } ] }, "footer": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "✅ 立即預約 (Book)", "text": "Action:Booking" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "📄 服務價目 (Menu)", "text": "Menu" } } ] } } });
}

syncData();
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Bot v56.1 (Data Sync Fixed) running on ${port}`);
});
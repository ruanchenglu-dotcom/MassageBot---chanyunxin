// ==============================================================================
// PHIÊN BẢN V78.1 - STABLE CORE + NEW SMART BOOKING FLOW
// (Giữ nguyên lõi ổn định, chỉ nâng cấp quy trình đặt lịch)
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

// --- SERVER STATE (MASTER MEMORY) ---
let SERVER_RESOURCE_STATE = {}; 
let SERVER_STAFF_STATUS = {};   
// ------------------------------------

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

// --- HELPERS ---
function normalizePhoneNumber(phone) { if (!phone) return ''; return phone.replace(/[^0-9]/g, ''); }

function getNext15Days() { 
    let days = []; const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' })); 
    for(let i=0; i<15; i++) { 
        let d = new Date(t); d.setDate(t.getDate()+i); 
        const v = d.toISOString().split('T')[0]; 
        const w = d.toLocaleDateString('zh-TW', { weekday: 'short' }); 
        let l = `${d.getMonth()+1}/${d.getDate()} (${w})`; 
        if(i===0) l="今天"; if(i===1) l="明天"; 
        days.push({label: l, value: v}); 
    } 
    return days; 
}

function isWithinShift(staff, requestTimeStr) {
    if (!staff.shiftStart || !staff.shiftEnd) return true;
    const getMins = (t) => { if(!t) return 0; const [h, m] = t.split(':').map(Number); return (h < 8 ? h + 24 : h) * 60 + (m || 0); };
    const startMins = getMins(staff.shiftStart); const endMins = getMins(staff.shiftEnd); const requestMins = getMins(requestTimeStr);
    if (endMins > startMins) return requestMins >= startMins && requestMins < endMins;
    return requestMins >= startMins && requestMins < endMins;
}

function formatDateDisplay(dateInput) {
    if (!dateInput) return "";
    try {
        let str = dateInput.toString().trim(); if (str.includes('/') && str.split('/')[0].length === 4) return str.split(' ')[0];
        let d = new Date(str); if (isNaN(d.getTime())) return str;
        const taipeiString = d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }); d = new Date(taipeiString);
        return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
    } catch (e) { return dateInput; }
}

function getCurrentDateTimeStr() {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false }));
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function parseStringToDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
        const parts = dateStr.trim().split(' '); const datePart = parts[0]; let timePart = parts.length > 1 ? parts[1] : "00:00";
        const dateNums = datePart.split('/'); const timeNums = timePart.split(':'); if (dateNums.length < 3) return null;
        let year = parseInt(dateNums[0]); if (year < 1900) year += 1911; 
        return new Date(year, parseInt(dateNums[1]) - 1, parseInt(dateNums[2]), parseInt(timeNums[0])||0, parseInt(timeNums[1])||0);
    } catch (e) { return null; }
}

// --- DATA SYNC ---
async function syncData() {
    try {
        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:K` });
        const rowsBooking = resBooking.data.values;
        cachedBookings = [];
        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue;
                const status = row[7] || '已預約'; if (status.includes('取消') || status.includes('Cancelled')) continue;
                let duration = 60; let type = 'BED'; let category = 'BODY';
                // Logic lấy duration từ tên dịch vụ
                if (row[3] && row[3].includes('早退')) {
                     // Bỏ qua logic tính duration cho đơn admin
                } else {
                    for (const key in SERVICES) {
                        if (row[3] && row[3].includes(SERVICES[key].name.split('(')[0])) { 
                            duration = SERVICES[key].duration; type = SERVICES[key].type; category = SERVICES[key].category; break;
                        }
                    }
                }
                cachedBookings.push({
                    rowId: i + 1, startTimeString: `${row[0]} ${row[1]}`, duration: duration, type: type, category: category,
                    staffId: row[8] || '隨機', pax: parseInt(row[5]||1), customerName: `${row[2]} (${row[6]})`, serviceName: row[3], status: status, lineId: row[9] 
                });
            }
        }
        
        // Sync Staff List
        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:AG100` });
        const rows = resSchedule.data.values; cachedSchedule = [];
        if (rows && rows.length > 1) {
            const tempStaffList = []; const headerDates = rows[0]; 
            for (let i = 1; i < rows.length; i++) {
                const staffName = rows[i][0];
                if (staffName && staffName.trim() !== '') {
                    const cleanName = staffName.trim(); let gender = 'M'; 
                    // [QUAN TRỌNG] Xác định giới tính từ file Sheet
                    if (rows[i][1] && (rows[i][1].trim() === '女' || rows[i][1].trim().toUpperCase() === 'F')) gender = 'F';
                    
                    tempStaffList.push({ id: cleanName, name: cleanName, gender: gender, shiftStart: rows[i][2] || '10:00', shiftEnd: rows[i][3] || '02:00' });
                    if (headerDates.length > 4) {
                        for (let j = 4; j < rows[i].length; j++) {
                            if (rows[i][j] && headerDates[j]) cachedSchedule.push({ date: formatDateDisplay(headerDates[j]), staffId: cleanName });
                        }
                    }
                }
            }
            if (tempStaffList.length > 0) STAFF_LIST = tempStaffList; else if (STAFF_LIST.length === 0) for(let i=1; i<=20; i++) STAFF_LIST.push({id:`${i}號`, name:`${i}號`, gender:'F', shiftStart:'10:00', shiftEnd:'02:00'});
        } else if (STAFF_LIST.length === 0) for(let i=1; i<=20; i++) STAFF_LIST.push({id:`${i}號`, name:`${i}號`, gender:'F', shiftStart:'10:00', shiftEnd:'02:00'});
        console.log(`Synced: ${cachedBookings.length} bookings.`);
    } catch (e) { console.error('Sync Error:', e); }
}

async function ghiVaoSheet(data) {
    try {
        let colD_Service = data.dichVu; if (data.isOil) colD_Service += " (油推+$200)";
        const valuesToWrite = [[ formatDateDisplay(data.ngayDen), (data.gioDen||"").split(' ')[1]?.substring(0,5), data.hoTen || '現場客', colD_Service, data.isOil ? "Yes" : "", data.pax || 1, data.sdt, data.trangThai || '已預約', data.nhanVien || '隨機', data.userId, getCurrentDateTimeStr() ]];
        await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite } });
        await syncData(); 
    } catch (e) { console.error('[ERROR] Lỗi ghi Sheet:', e); }
}

async function updateBookingStatus(rowId, newStatus) {
    try {
        await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!H${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[ newStatus ]] } });
        await syncData();
    } catch (e) { console.error('Update Error:', e); }
}

async function layLichDatGanNhat(userId) {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:K` });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return null;
        for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i][9] === userId) {
                 const status = rows[i][7] || ''; 
                 if (!status.includes('取消') && !status.includes('Cancelled')) return { rowId: i + 1, thoiGian: `${rows[i][0]} ${rows[i][1]}`, dichVu: rows[i][3], nhanVien: rows[i][8], thongTinKhach: `${rows[i][2]} (${rows[i][6]})`, chiTiet: rows[i] };
            } 
        }
        return null;
    } catch (e) { return null; }
}

// ==============================================================================
// 3. LOGIC XỬ LÝ (UPDATED V78.1)
// ==============================================================================

// [UPDATED] Hàm checkAvailability hỗ trợ lọc Nam/Nữ/Dầu
function checkAvailability(dateStr, timeStr, serviceDuration, serviceType, specificStaffIds = null, pax = 1, requireFemale = false, requireMale = false) {
    const displayDate = formatDateDisplay(dateStr); 
    const startRequest = parseStringToDate(`${displayDate} ${timeStr}`);
    if (!startRequest) return false;
    const endRequest = new Date(startRequest.getTime() + serviceDuration * 60000);
    const now = new Date();

    const isBookingForNow = (startRequest.getTime() - now.getTime()) < 30 * 60000 && (startRequest.getTime() - now.getTime()) > -30 * 60000;

    const staffOffToday = cachedSchedule.filter(s => s.date === displayDate).map(s => s.staffId);
    
    // 1. Lọc thợ làm việc
    const workingStaffs = STAFF_LIST.filter(staff => {
        if (staffOffToday.includes(staff.id)) return false; 
        
        // Logic lọc giới tính (Mới)
        if (requireFemale && staff.gender !== 'F' && staff.gender !== '女') return false;
        if (requireMale && staff.gender !== 'M' && staff.gender !== '男') return false;

        if (!isWithinShift(staff, timeStr)) return false; 
        
        // Logic kiểm tra Server State (Real-time)
        if (isBookingForNow) {
            const status = SERVER_STAFF_STATUS[staff.id];
            if (status && (status.status === 'BUSY' || status.status === 'AWAY' || status.status === 'OUT_SHORT')) return false;
        }
        return true;
    });

    if (specificStaffIds) {
        const idsToCheck = Array.isArray(specificStaffIds) ? specificStaffIds : [specificStaffIds];
        for (const id of idsToCheck) if (!workingStaffs.some(s => s.id === id)) return false; 
    }

    let usedChairs = 0; let usedBeds = 0; let workingStaffBusy = 0; let isSpecificStaffBusy = false; let isShopClosed = false;

    // Check Bookings trong Sheet
    for (const booking of cachedBookings) {
        if (booking.staffId === 'ALL_STAFF' && booking.startTimeString.split(' ')[0] === displayDate) { isShopClosed = true; break; }
        const startExisting = parseStringToDate(booking.startTimeString);
        if (!startExisting) continue;
        const endExisting = new Date(startExisting.getTime() + booking.duration * 60000);

        if (startRequest < endExisting && endRequest > startExisting) {
            workingStaffBusy += booking.pax;
            if (booking.type === 'CHAIR') usedChairs += booking.pax;
            if (booking.type === 'BED') usedBeds += booking.pax;
            if (specificStaffIds) {
                const bookedStaffs = booking.staffId.split(',').map(s=>s.trim());
                const idsToCheck = Array.isArray(specificStaffIds) ? specificStaffIds : [specificStaffIds];
                for (const reqId of idsToCheck) if (bookedStaffs.includes(reqId)) isSpecificStaffBusy = true;
            }
        }
    }
    
    // Check Real-time Resources
    if (isBookingForNow) {
        Object.values(SERVER_RESOURCE_STATE).forEach(res => {
            if (res.isRunning && !res.isPaused) {
                if (res.booking.type === 'CHAIR') usedChairs++; 
                if (res.booking.type === 'BED') usedBeds++;
            }
        });
    }

    if (isShopClosed || isSpecificStaffBusy) return false;
    if (!specificStaffIds && (workingStaffs.length - workingStaffBusy) < pax) return false;
    if (serviceType === 'CHAIR' && (usedChairs + pax) > MAX_CHAIRS) return false;
    if (serviceType === 'BED' && (usedBeds + pax) > MAX_BEDS) return false;

    return true;
}

// [UPDATED] Hàm tạo bong bóng giờ (Smart Time Slots) có phân biệt Nam/Nữ
function generateTimeBubbles(selectedDate, serviceCode, specificStaffIds = null, pax = 1, requireFemale = false, requireMale = false) {
    const now = new Date(); const taipeiNowStr = now.toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false }); const currentHour = parseInt(taipeiNowStr.split(', ')[1].split(':')[0]); const taipeiDate = new Date(taipeiNowStr); const todayStr = taipeiDate.toISOString().split('T')[0]; const isToday = (selectedDate === todayStr);
    const service = SERVICES[serviceCode]; if (!service) return null;
    let allSlots = []; for (let h = 8; h <= 26; h++) allSlots.push(h);
    let availableSlots = isToday ? (currentHour >= 3 && currentHour < 8 ? [] : (currentHour >= 0 && currentHour < 3 ? allSlots.filter(h => h > (currentHour + 24)) : allSlots.filter(h => h > currentHour))) : allSlots;
    let validSlots = [];
    for (const h of availableSlots) {
        const timeStr = h < 24 ? `${h.toString().padStart(2, '0')}:00` : `${(h - 24).toString().padStart(2, '0')}:00`;
        // Pass gender requirements
        if (checkAvailability(selectedDate, timeStr, service.duration, service.type, specificStaffIds, pax, requireFemale, requireMale)) { validSlots.push(h); }
    }
    if (validSlots.length === 0) return null;
    const formatTime = (h) => h < 24 ? `${h.toString().padStart(2, '0')}:00` : `${(h - 24).toString().padStart(2, '0')}:00 (凌晨)`;
    // Phân loại buổi
    const groups = [ { name: '🌞 早安時段 (Sáng)', slots: validSlots.filter(h => h >= 8 && h < 12) }, { name: '☀️ 下午時段 (Chiều)', slots: validSlots.filter(h => h >= 12 && h < 18) }, { name: '🌙 晚安時段 (Tối)', slots: validSlots.filter(h => h >= 18 && h < 24) }, { name: '✨ 深夜時段 (Khuya)', slots: validSlots.filter(h => h >= 24 && h <= 26) } ];
    const bubbles = groups.filter(g => g.slots.length > 0).map(group => {
        const buttons = group.slots.map(h => ({ "type": "button", "style": "primary", "margin": "xs", "height": "sm", "action": { "type": "message", "label": formatTime(h), "text": `Time:${h < 24 ? `${h.toString().padStart(2, '0')}:00` : `${(h - 24).toString().padStart(2, '0')}:00`}` } }));
        return { "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" }, { "type": "separator", "margin": "sm" }, ...buttons] } };
    });
    return { type: 'carousel', contents: bubbles };
}

function createStaffBubbles(filterFemale = false, excludedIds = []) {
    let list = STAFF_LIST;
    if (filterFemale) list = STAFF_LIST.filter(s => s.gender === 'F' || s.gender === '女');
    if (excludedIds && excludedIds.length > 0) list = list.filter(s => !excludedIds.includes(s.id));
    if (!list || list.length === 0) return [{ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": filterFemale ? "無女技師" : "無其他技師", "align": "center" }] } }];
    const bubbles = []; const chunkSize = 12; 
    for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize); const rows = [];
        for (let j = 0; j < chunk.length; j += 3) {
            const rowButtons = chunk.slice(j, j + 3).map(s => ({ "type": "button", "style": "secondary", "color": (s.gender === 'F' || s.gender === '女') ? "#F48FB1" : "#90CAF9", "height": "sm", "margin": "xs", "flex": 1, "action": { "type": "message", "label": s.name, "text": `StaffSelect:${s.id}` } }));
            rows.push({ "type": "box", "layout": "horizontal", "spacing": "xs", "contents": rowButtons });
        }
        bubbles.push({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": filterFemale ? "選擇女技師" : "指定技師", "weight": "bold", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...rows ] } });
    }
    return bubbles;
}

function createMenuFlexMessage() {
    const createRow = (n, t, p) => ({ "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": n, "size": "sm", "color": "#555555", "flex": 5 }, { "type": "text", "text": `${t}分`, "size": "sm", "color": "#111111", "align": "end", "flex": 2 }, { "type": "text", "text": `$${p}`, "size": "sm", "color": "#E63946", "weight": "bold", "align": "end", "flex": 3 } ] });
    return { "type": "bubble", "size": "mega", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "📜 服務價目表 (Menu)", "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center", "margin": "md" }, { "type": "separator", "margin": "lg" }, { "type": "text", "text": "🔥 熱門套餐 (Combo)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, createRow("👑 帝王套餐 (腳+身)", 190, 2000), createRow("💎 豪華套餐 (腳+身)", 130, 1500), createRow("🔥 招牌套餐 (腳+身)", 100, 999), createRow("⚡ 精選套餐 (腳+身)", 70, 900), { "type": "text", "text": "👣 足底按摩 (Foot)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, createRow("足底按摩", 120, 1500), createRow("足底按摩", 90, 999), createRow("足底按摩", 70, 900), createRow("足底按摩", 40, 500), { "type": "text", "text": "🛏️ 身體指壓 (Body)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, createRow("全身指壓", 120, 1500), createRow("全身指壓", 90, 999), createRow("全身指壓", 70, 900), createRow("半身指壓", 35, 500), { "type": "separator", "margin": "xl" }, { "type": "text", "text": "⭐ 油推需加收 $200，請詢問櫃台。", "size": "xs", "color": "#aaaaaa", "margin": "md", "align": "center" } ] }, "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "📅 立即預約 (Book Now)", "text": "Action:Booking" } } ] } };
}

// 4. SERVER & ROUTES
const client = new line.Client(config);
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/info', async (req, res) => { await syncData(); res.json({ staffList: STAFF_LIST, bookings: cachedBookings, schedule: cachedSchedule, resourceState: SERVER_RESOURCE_STATE, staffStatus: SERVER_STAFF_STATUS }); });
app.post('/api/sync-resource', (req, res) => { SERVER_RESOURCE_STATE = req.body; res.json({ success: true }); });
app.post('/api/sync-staff-status', (req, res) => { SERVER_STAFF_STATUS = req.body; res.json({ success: true }); });
app.post('/api/admin-booking', async (req, res) => { const data = req.body; await ghiVaoSheet({ ngayDen: data.ngayDen, gioDen: data.gioDen, dichVu: data.dichVu, nhanVien: data.nhanVien, userId: 'ADMIN_WEB', sdt: data.sdt||'現場客', hoTen: data.hoTen||'現場客', trangThai: '已預約', pax: data.pax||1, isOil: data.isOil||false }); res.json({ success: true }); });
app.post('/api/update-status', async (req, res) => { const { rowId, status } = req.body; await updateBookingStatus(rowId, status); res.json({ success: true }); });
app.post('/api/update-booking-details', async (req, res) => { try { const { rowId, staffId, serviceName } = req.body; if (serviceName) await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!D${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[serviceName]] } }); if (staffId) await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!I${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[staffId]] } }); await syncData(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// 5. BOT HANDLE EVENT (FLOW MỚI)
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text' && event.type !== 'postback') return Promise.resolve(null);
  let text = ''; let userId = event.source.userId;
  if (event.type === 'message') text = event.message.text.trim();
  else if (event.type === 'postback') text = event.postback.params && event.postback.params.date ? `DatePick:${event.postback.params.date}` : event.postback.data;

  // --- ADMIN OPS (Giữ nguyên) ---
  if (text === 'Admin' || text === '管理') return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Admin', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "🛠️ 師傅管理 (Admin)", "weight": "bold", "color": "#E63946", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#000000", "margin": "md", "action": { "type": "message", "label": "⛔ 全店店休", "text": "Admin:CloseShop" } }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛌 請假", "text": "Admin:SetOff" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🤒 早退", "text": "Admin:SetLeaveEarly" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🍱 用餐", "text": "Admin:SetBreak" } } ] } } });
  if (text === 'Admin:CloseShop') { userState[userId] = { step: 'ADMIN_PICK_CLOSE_DATE' }; return client.replyMessage(event.replyToken, { type: 'template', altText: '選擇日期', template: { type: 'buttons', text: '請選擇店休日期:', actions: [ { type: 'datetimepicker', label: '🗓️ 點擊選擇', data: 'ShopClosePicked', mode: 'date' } ] } }); }
  if (text.startsWith('DatePick:') && userState[userId]?.step === 'ADMIN_PICK_CLOSE_DATE') { await ghiVaoSheet({ gioDen: '08:00', ngayDen: text.split(':')[1], dichVu: SERVICES['SHOP_CLOSE'].name, nhanVien: 'ALL_STAFF', userId: 'ADMIN', sdt: 'ADMIN', hoTen: '全店店休', trangThai: '⛔ 店休' }); delete userState[userId]; return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已設定 ${text.split(':')[1]} 全店店休。` }); }
  if (text.startsWith('Admin:')) { const action = text.split(':')[1]; userState[userId] = { step: 'ADMIN_PICK_STAFF', action: action }; const bubbles = createStaffBubbles().map(b => JSON.parse(JSON.stringify(b).replace(/StaffSelect/g, 'StaffOp'))); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇師傅', contents: { type: 'carousel', contents: bubbles } }); }
  if (text.startsWith('StaffOp:') && userState[userId]?.step === 'ADMIN_PICK_STAFF') { 
      const staffId = text.split(':')[1]; const act = userState[userId].action; const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' })); const nowStr = getCurrentDateTimeStr();
      let logType = ''; let logNote = '';
      if (act === 'SetOff') { logType = '⛔ 請假'; logNote = '全天'; }
      else if (act === 'SetBreak') { logType = '🍱 用餐'; logNote = '30分'; }
      else if (act === 'SetLeaveEarly') {
          let effectiveHour = now.getHours(); if(effectiveHour < 8) effectiveHour += 24;
          const currentTotalMins = effectiveHour * 60 + now.getMinutes();
          let duration = (26 * 60) - currentTotalMins; if(duration < 0) duration = 0;
          logType = `⚠️ 早退 (${duration}分)`; logNote = `${duration}分`;
      }
      await ghiVaoSheet({ gioDen: nowStr.split(' ')[1], ngayDen: nowStr.split(' ')[0], dichVu: logType, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: 'Admin Ops', trangThai: '⛔ Locked' });
      SERVER_STAFF_STATUS[staffId] = { status: act === 'SetOff' ? 'AWAY' : act === 'SetBreak' ? 'EAT' : 'OUT_SHORT', checkInTime: 0 };
      delete userState[userId]; return client.replyMessage(event.replyToken, { type: 'text', text: `✅ ${staffId} - ${logType}` }); 
  }

  // --- NEW BOOKING FLOW: 1.Svc -> 2.Date -> 3.Pref -> 4.Pax -> 5.Time ---
  
  // 1. Dịch vụ
  if (text === 'Action:Booking') return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請選擇服務類別", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩 (腳)", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓 (身)", "text": "Cat:BODY" } } ] } } });
  
  if (text.startsWith('Cat:')) { const cat = text.split(':')[1]; const btns = Object.keys(SERVICES).filter(k => SERVICES[k].category === cat).map(k => ({ "type": "button", "style": "primary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${SERVICES[k].name} ($${SERVICES[k].price})`, "text": `Svc:${k}` } })); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇方案', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "選擇方案", "weight": "bold", "size": "xl", "align": "center" }, { "type": "separator", "margin": "md" }, ...btns ] } } }); }
  
  // 2. Ngày
  if (text.startsWith('Svc:')) { 
      userState[userId] = { step: 'DATE', service: text.split(':')[1] }; 
      const days = getNext15Days(); 
      return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Date', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "📅 請選擇日期 (Date)", "align": "center", "weight": "bold" }, ...days.map(d=>({ "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": d.label, "text": `Date:${d.value}` } })) ] } } }); 
  }

  // 3. Tùy chọn Nhân viên (5 Option)
  if (text.startsWith('Date:')) {
      const selectedDate = text.split(':')[1];
      const currentState = userState[userId];
      currentState.date = selectedDate;
      currentState.step = 'PREF';
      userState[userId] = currentState;

      return client.replyMessage(event.replyToken, {
          type: 'flex',
          altText: '選擇師傅',
          contents: {
              "type": "bubble",
              "body": {
                  "type": "box",
                  "layout": "vertical",
                  "contents": [
                      { "type": "text", "text": "💆 請選擇師傅需求 (Staff)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" },
                      { "type": "separator", "margin": "md" },
                      { "type": "button", "style": "primary", "color": "#E91E63", "margin": "md", "action": { "type": "message", "label": "💧 指定女師傅推油 (+$200)", "text": "Pref:OIL" } },
                      { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👩 指定女師傅 (無油)", "text": "Pref:FEMALE" } },
                      { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👨 指定男師傅", "text": "Pref:MALE" } },
                      { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🎲 不指定 (隨機)", "text": "Pref:RANDOM" } },
                      { "type": "separator", "margin": "md" },
                      { "type": "button", "style": "primary", "color": "#333333", "margin": "sm", "action": { "type": "message", "label": "👉 指定特定號碼", "text": "Pref:SPECIFIC" } }
                  ]
              }
          }
      });
  }

  // 4. Số lượng khách
  if (text.startsWith('Pref:')) {
      const pref = text.split(':')[1];
      const currentState = userState[userId];
      currentState.pref = pref;
      currentState.step = 'PAX';
      userState[userId] = currentState;

      const paxButtons = [1, 2, 3, 4, 5, 6].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } }));
      return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Pax', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "👥 請問幾位貴賓? (Pax)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons ] } } });
  }

  // 5. Chọn Giờ (hoặc Chọn Thợ nếu là Specific)
  if (text.startsWith('Pax:')) {
      const num = parseInt(text.split(':')[1]);
      const currentState = userState[userId];
      currentState.pax = num;
      currentState.selectedStaff = []; 
      userState[userId] = currentState;

      // Nếu là Chỉ định số -> Hiện Carousel
      if (currentState.pref === 'SPECIFIC') {
          const bubbles = createStaffBubbles(false, []); 
          bubbles.forEach((b, idx) => {
              b.body.contents[0].text = `選第 1/${num} 位技師`;
              b.body.contents[0].color = "#E91E63";
          });
          return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Select Staff', contents: { type: 'carousel', contents: bubbles } });
      }

      // Các trường hợp khác: Lọc tự động & Hiện giờ
      let requireFemale = false;
      let requireMale = false;
      let isOil = false;

      if (currentState.pref === 'OIL') { isOil = true; requireFemale = true; }
      else if (currentState.pref === 'FEMALE') { requireFemale = true; }
      else if (currentState.pref === 'MALE') { requireMale = true; }

      currentState.isOil = isOil;

      const bubbles = generateTimeBubbles(currentState.date, currentState.service, null, currentState.pax, requireFemale, requireMale);
      if(!bubbles) return client.replyMessage(event.replyToken, {type:'text',text:'😢抱歉，該時段已客滿，請選擇其他日期。'});
      
      currentState.step = 'TIME';
      userState[userId] = currentState;
      return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles });
  }

  // Handle Specific Staff Carousel
  if (text.startsWith('StaffSelect:')) {
      const staffId = text.split(':')[1];
      const currentState = userState[userId];
      
      if (!currentState.selectedStaff) currentState.selectedStaff = [];
      currentState.selectedStaff.push(staffId);
      userState[userId] = currentState;

      if (currentState.selectedStaff.length < currentState.pax) {
          const bubbles = createStaffBubbles(false, currentState.selectedStaff); 
          const nextIdx = currentState.selectedStaff.length + 1;
          bubbles.forEach(b => {
              b.body.contents[0].text = `選第 ${nextIdx}/${currentState.pax} 位技師`;
              b.body.contents[0].color = "#E91E63";
          });
          return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Next Staff', contents: { type: 'carousel', contents: bubbles } });
      } else {
          const bubbles = generateTimeBubbles(currentState.date, currentState.service, currentState.selectedStaff, currentState.pax, false, false);
          if(!bubbles) return client.replyMessage(event.replyToken, {type:'text',text:'😢 所選技師時間衝突，請重新選擇。'});
          
          currentState.step = 'TIME';
          userState[userId] = currentState;
          return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles });
      }
  }

  if (text.startsWith('Time:')) { userState[userId].step = 'SURNAME'; userState[userId].time = text.replace('Time:', '').trim(); return client.replyMessage(event.replyToken, { type: 'text', text: '請問怎麼稱呼您？(姓氏)' }); }
  if (userState[userId]?.step === 'SURNAME') { userState[userId].step = 'PHONE'; userState[userId].surname = text; return client.replyMessage(event.replyToken, { type: 'text', text: '請輸入手機號碼:' }); }
  
  if (userState[userId]?.step === 'PHONE') { 
      const s = userState[userId];
      
      // Tính tiền
      let basePrice = SERVICES[s.service].price;
      if (s.pref === 'OIL') basePrice += 200;
      const totalPrice = basePrice * s.pax;

      // Format tên nhân viên
      let staffDisplay = '隨機';
      if (s.selectedStaff && s.selectedStaff.length > 0) staffDisplay = s.selectedStaff.join(', ');
      else if (s.pref === 'FEMALE') staffDisplay = '女師傅';
      else if (s.pref === 'MALE') staffDisplay = '男師傅';
      else if (s.pref === 'OIL') staffDisplay = '女師傅(油)';

      await ghiVaoSheet({ 
          gioDen: s.time, 
          ngayDen: s.date, 
          dichVu: SERVICES[s.service].name, 
          nhanVien: staffDisplay, 
          userId: userId, 
          sdt: normalizePhoneNumber(text), 
          hoTen: s.surname, 
          trangThai: '已預約', 
          pax: s.pax, 
          isOil: (s.pref === 'OIL') 
      });
      
      client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 New Booking: ${s.surname} - $${totalPrice}` });
      delete userState[userId]; 
      return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 預約成功!\n總金額: $${totalPrice}` });
  }

  // --- MY BOOKING & LATE (Giữ nguyên) ---
  if (text === 'Action:MyBooking') { const b = await layLichDatGanNhat(userId); if(!b) return client.replyMessage(event.replyToken, {type:'text',text:'No Booking'}); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Booking', contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [ { type: "text", text: b.dichVu }, { type: "text", text: b.thoiGian } ] }, footer: { type: "box", layout: "vertical", spacing: "sm", contents: [ { type: "button", style: "primary", color: "#ff9800", action: { type: "message", label: "🏃 我會晚到 (Late)", text: "Action:Late" } }, { type: "button", style: "secondary", color: "#ff3333", action: { type: "message", label: "❌ 取消預約 (Cancel)", text: "Action:ConfirmCancel" } } ] } } }); }
  if (text === 'Action:Late') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Late', contents: { type: 'bubble', body: { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [ { type: 'button', style: 'secondary', action: { type: 'message', label: '5 分', text: 'Late:5p' } }, { type: 'button', style: 'secondary', action: { type: 'message', label: '10 分', text: 'Late:10p' } }, { type: 'button', style: 'secondary', action: { type: 'message', label: '15 分', text: 'Late:15p' } } ] } } }); }
  if (text.startsWith('Late:')) { const phut = text.split(':')[1].replace('p', '分'); const b = await layLichDatGanNhat(userId); if(b) { await updateBookingStatus(b.rowId, `⚠️ 晚到 ${phut}`); client.pushMessage(ID_BA_CHU, { type: 'text', text: `⚠️ 晚到通知!\nID: ${userId}\n預計晚: ${phut}` }); return client.replyMessage(event.replyToken, { type: 'text', text: 'OK, Wait for you.' }); } }
  if (text === 'Action:ConfirmCancel') { const b = await layLichDatGanNhat(userId); if(b) { await updateBookingStatus(b.rowId, '❌ Cancelled'); return client.replyMessage(event.replyToken, {type:'text',text:'Cancelled'}); } }

  if (text.includes('booking') || text.includes('menu')) { delete userState[userId]; syncData(); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Menu', contents: createMenuFlexMessage() }); }
  return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Welcome', contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [ { type: "text", text: "Welcome", align: "center" } ] }, footer: { type: "box", layout: "horizontal", contents: [ { type: "button", style: "primary", action: { type: "message", label: "Booking", text: "Action:Booking" } } ] } } });
}

syncData();
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Bot V78.1 (Stable + New Flow) running on ${port}`);
});
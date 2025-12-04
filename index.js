require('dotenv').config(); 
const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

// ==============================================================================
// 1. CẤU HÌNH & BIẾN TOÀN CỤC
// ==============================================================================
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

// --- BỘ NHỚ RAM (SERVER STATE) ---
// Dữ liệu sẽ lưu ở đây để đồng bộ giữa các thiết bị Admin
let STAFF_LIST = []; 
let cachedBookings = []; 
let cachedSchedule = []; 
let userState = {}; 

// Lưu trạng thái Giường/Ghế (Real-time)
let serverResourceState = {}; 
// Lưu trạng thái Check-in của nhân viên (Real-time)
let serverStaffStatus = {}; 

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
    'BD_35':  { name: '🛏️ 半身指壓 (35分)',  duration: 35,  type: 'BED', category: 'BODY', price: 500 },
    'OFF_DAY': { name: '⛔ 請假', duration: 1080, type: 'NONE' },
    'BREAK_30': { name: '🍱 用餐', duration: 30, type: 'NONE' },
    'SHOP_CLOSE': { name: '⛔ 店休', duration: 1440, type: 'NONE' }
};

// --- HELPERS ---
function normalizePhoneNumber(phone) { if (!phone) return ''; return phone.replace(/[^0-9]/g, ''); }
function formatDate2025(dateInput) {
    if (!dateInput) return "";
    try {
        let str = dateInput.toString().trim();
        if (str.includes('T')) str = str.split('T')[0]; 
        if (str.match(/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/)) return str.replace(/-/g, '/');
        let d = new Date(str); if (isNaN(d.getTime())) return str;
        const taipeiString = d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
        d = new Date(taipeiString);
        return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
    } catch (e) { return dateInput; }
}
function getCurrentTime2025() {
    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false });
    const d = new Date(now);
    return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
function parseDateStandard(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
        const cleanStr = dateStr.replace(/-/g, '/'); 
        const parts = cleanStr.trim().split(' ');
        const dateNums = parts[0].split('/');
        let timePart = parts.length > 1 ? parts[1] : "00:00";
        const timeNums = timePart.split(':');
        return new Date(parseInt(dateNums[0]), parseInt(dateNums[1]) - 1, parseInt(dateNums[2]), parseInt(timeNums[0])||0, parseInt(timeNums[1])||0);
    } catch (e) { return null; }
}

// ==============================================================================
// 2. GOOGLE SHEETS SYNC (CHẠY NGẦM)
// ==============================================================================
async function syncData() {
    try {
        // 1. Lấy Booking
        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:K` });
        const rowsBooking = resBooking.data.values;
        cachedBookings = [];
        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue;
                const status = row[7] || '已預約';
                if (status.includes('取消') || status.includes('Cancelled')) continue;

                let duration = 60; let type = 'BED'; 
                for (const key in SERVICES) {
                    if ((row[3]||'').includes(SERVICES[key].name.split('(')[0])) { duration = SERVICES[key].duration; type = SERVICES[key].type; break; }
                }
                cachedBookings.push({
                    rowId: i + 1,
                    startTimeString: `${formatDate2025(row[0])} ${row[1]}`,
                    date: formatDate2025(row[0]), 
                    time: row[1],
                    duration: duration, type: type,
                    staffId: row[8] || '隨機', pax: parseInt(row[5]||1),
                    customerName: `${row[2]} (${row[6]})`, serviceName: row[3]||'', status: status, lineId: row[9]
                });
            }
        }

        // 2. Lấy Staff Schedule
        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:AG100` });
        const rows = resSchedule.data.values;
        cachedSchedule = [];
        let tempStaffList = [];
        if (rows && rows.length > 1) {
            const headerDates = rows[0]; 
            for (let i = 1; i < rows.length; i++) {
                const staffName = rows[i][0];
                if (staffName && staffName.trim() !== '') {
                    const cleanName = staffName.trim();
                    const gender = (rows[i][1] && (rows[i][1].trim() === '女' || rows[i][1].trim().toUpperCase() === 'F')) ? 'F' : 'M';
                    tempStaffList.push({ id: cleanName, name: cleanName, gender: gender, shiftStart: rows[i][2]||'00:00', shiftEnd: rows[i][3]||'24:00' });
                    // Check ngày nghỉ
                    for (let j = 4; j < rows[i].length; j++) {
                        if (rows[i][j] && headerDates[j]) {
                            const stdDate = formatDate2025(headerDates[j]);
                            if (stdDate) cachedSchedule.push({ date: stdDate, staffId: cleanName });
                        }
                    }
                }
            }
        }
        if (tempStaffList.length > 0) STAFF_LIST = tempStaffList;
        else if (STAFF_LIST.length === 0) for(let i=1; i<=20; i++) STAFF_LIST.push({id:`${i}號`, name:`${i}號`, gender:'F', shiftStart:'00:00', shiftEnd:'24:00'});

        console.log(`[SYNC] Done at ${new Date().toLocaleTimeString()} - ${cachedBookings.length} bookings.`);
    } catch (e) { console.error('Sync Error:', e); }
}

// KHỞI ĐỘNG SYNC ĐỊNH KỲ (60 giây 1 lần) - QUAN TRỌNG ĐỂ KHÔNG TỐN QUOTA
syncData();
setInterval(syncData, 60000); 

// GHI SHEET
async function ghiVaoSheet(data) {
    try {
        const timeCreate = getCurrentTime2025(); 
        const valuesToWrite = [[ 
            formatDate2025(data.ngayDen), data.gioDen.substring(0,5), data.hoTen, data.dichVu + (data.isOil ? " (油推+$200)" : ""),
            data.isOil ? "Yes" : "", data.pax || 1, data.sdt, data.trangThai || '已預約',
            data.nhanVien || '隨機', data.userId, timeCreate
        ]];
        await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite } });
        // Gọi sync ngay lập tức khi có đơn mới để cập nhật nhanh
        setTimeout(syncData, 1000); 
    } catch (e) { console.error('[ERROR] Lỗi ghi Sheet:', e); }
}

async function updateBookingStatus(rowId, newStatus) {
    try {
        await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!H${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[ newStatus ]] } });
        setTimeout(syncData, 1000);
    } catch (e) { console.error('Update Error:', e); }
}

// ... (Giữ nguyên các hàm helper logic LINE Bot: isWithinShift, checkAvailability, generateTimeBubbles...)
// Do giới hạn ký tự, tôi giả định bạn giữ nguyên các hàm logic LINE Bot như code cũ. 
// Chỉ cần đảm bảo biến STAFF_LIST, cachedBookings được dùng từ bộ nhớ global.

function isWithinShift(staff, requestTimeStr) { /* ... Giữ nguyên ... */ if (!staff.shiftStart) return true; const getMins = (t) => { if(!t) return 0; const [h, m] = t.split(':').map(Number); return (h < 8 ? h + 24 : h) * 60 + (m || 0); }; const s = getMins(staff.shiftStart); const e = getMins(staff.shiftEnd); const r = getMins(requestTimeStr); return e > s ? (r >= s && r < e) : (r >= s && r < e); }
function getNext7Days() { /* ... Giữ nguyên ... */ let days = []; const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' })); for(let i=0; i<7; i++) { let d = new Date(t); d.setDate(t.getDate()+i); const m = d.getMonth() + 1; const day = d.getDate(); const w = d.toLocaleDateString('zh-TW', { weekday: 'short' }); days.push({label: i===0?"今天":i===1?"明天":`${m}/${day} (${w})`, value: d.toISOString().split('T')[0]}); } return days; }

// ==============================================================================
// 3. SERVER ROUTES (API CHO WEB ADMIN)
// ==============================================================================
const client = new line.Client(config);
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WEBHOOK LINE
app.post('/callback', line.middleware(config), (req, res) => { Promise.all(req.body.events.map(handleEvent)).then((r) => res.json(r)).catch((e) => { console.error(e); res.status(500).end(); }); });

// API 1: LẤY DỮ LIỆU TỔNG HỢP (Gọi từ Frontend mỗi 5s)
// Trả về dữ liệu từ RAM -> Cực nhanh, không tốn quota
app.get('/api/info', (req, res) => {
    res.json({ 
        staffList: STAFF_LIST, 
        bookings: cachedBookings, 
        schedule: cachedSchedule, 
        resourceState: serverResourceState, // Trạng thái giường từ Server
        staffStatus: serverStaffStatus,     // Trạng thái nhân viên từ Server
        resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS } 
    });
});

// API 2: CẬP NHẬT TRẠNG THÁI GIƯỜNG/GHẾ (Start, Stop, Pause)
app.post('/api/resource-update', (req, res) => {
    const { resourceId, data, action } = req.body;
    if (action === 'update') {
        serverResourceState[resourceId] = data;
    } else if (action === 'delete') {
        delete serverResourceState[resourceId];
    } else if (action === 'clear_all') {
        serverResourceState = {};
    }
    console.log(`[RES] ${action} ${resourceId}`);
    res.json({ success: true, newState: serverResourceState });
});

// API 3: CẬP NHẬT TRẠNG THÁI NHÂN VIÊN (Check-in/out)
app.post('/api/staff-status-update', (req, res) => {
    const { staffId, statusData } = req.body;
    if (staffId && statusData) {
        serverStaffStatus[staffId] = statusData;
        console.log(`[STAFF] Update ${staffId}: ${statusData.status}`);
    }
    res.json({ success: true, newStatus: serverStaffStatus });
});

// API 4: ADMIN BOOKING & STATUS UPDATE (Giữ nguyên logic cũ)
app.post('/api/update-status', async (req, res) => { const { rowId, status } = req.body; await updateBookingStatus(rowId, status); res.json({ success: true }); });
// ... (Các API admin-booking khác giữ nguyên nếu cần)

// ==============================================================================
// 4. LINE BOT LOGIC (RÚT GỌN CHO GỌN FILE, NHƯNG BẠN GIỮ CODE CŨ CŨNG ĐƯỢC)
// ==============================================================================
async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return Promise.resolve(null);
    let text = ''; let userId = event.source.userId;
    if (event.type === 'message' && event.message.type === 'text') text = event.message.text.trim();
    else if (event.type === 'postback') { text = event.postback.data; if(event.postback.params && event.postback.params.date) text = `DatePick:${event.postback.params.date}`; }

    // --- LOGIC GIỮ NGUYÊN TỪ CODE CŨ ---
    // Để code chạy được, bạn copy phần thân hàm handleEvent từ file cũ vào đây.
    // Logic xử lý 'Action:Booking', 'Date:', 'Time:', 'Staff:' không thay đổi.
    // Chỉ lưu ý: Khi ghi dữ liệu, gọi ghiVaoSheet() như đã định nghĩa ở trên.
    
    // Ví dụ mẫu 1 đoạn:
    if (text === 'Action:Booking') {
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Menu', contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: '請選擇服務 (Chọn dịch vụ)', weight: 'bold', size: 'lg', align: 'center' },
            { type: 'button', style: 'primary', margin: 'md', action: { type: 'message', label: '🔥 套餐 (Combo)', text: 'Cat:COMBO' } },
            { type: 'button', style: 'secondary', margin: 'sm', action: { type: 'message', label: '👣 足底 (Chân)', text: 'Cat:FOOT' } },
            { type: 'button', style: 'secondary', margin: 'sm', action: { type: 'message', label: '🛏️ 指壓 (Body)', text: 'Cat:BODY' } }
        ]}}});
    }
    // ... Copy tiếp các phần logic else if (text.startsWith('Cat:')) ... v.v. từ code cũ
    
    return Promise.resolve(null);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port} - Syncing Scheduler Active`);
});
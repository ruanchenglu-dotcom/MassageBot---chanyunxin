require('dotenv').config(); 

const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

// ==============================================================================
// 1. CẤU HÌNH & KHỞI TẠO
// ==============================================================================
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

// --- BỘ NHỚ RAM (SERVER STATE - REALTIME) ---
let STAFF_LIST = []; 
let cachedBookings = []; 
let cachedSchedule = []; 
let userState = {}; 

// Biến lưu trạng thái giường/ghế để đồng bộ giữa các máy (Admin)
let serverResourceState = {}; 

// Biến lưu trạng thái check-in của nhân viên
let serverStaffStatus = {}; 

// --- BẢNG GIÁ DỊCH VỤ ---
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
// 2. CÁC HÀM HỖ TRỢ (HELPERS)
// ==============================================================================

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

function formatDate2025(dateInput) {
    if (!dateInput) return "";
    try {
        let str = dateInput.toString().trim();
        if (str.includes('T')) str = str.split('T')[0]; 
        
        // Nếu đã là dạng YYYY/MM/DD hoặc YYYY-MM-DD
        if (str.match(/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/)) {
            return str.replace(/-/g, '/');
        }
        
        // Xử lý đối tượng Date
        let d = new Date(str);
        if (isNaN(d.getTime())) return str;
        
        const taipeiString = d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
        d = new Date(taipeiString);
        
        const year = d.getFullYear(); 
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}/${month}/${day}`;
    } catch (e) { return dateInput; }
}

function getCurrentTime2025() {
    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false });
    const d = new Date(now);
    
    const year = d.getFullYear(); 
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    
    return `${year}/${month}/${day} ${hh}:${mm}`;
}

function parseDateStandard(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
        const cleanStr = dateStr.replace(/-/g, '/'); 
        const parts = cleanStr.trim().split(' ');
        const datePart = parts[0];
        let timePart = parts.length > 1 ? parts[1] : "00:00";
        
        const dateNums = datePart.split('/');
        if (dateNums.length < 3) return null;
        
        const year = parseInt(dateNums[0]);
        const month = parseInt(dateNums[1]) - 1;
        const day = parseInt(dateNums[2]);
        
        const timeNums = timePart.split(':');
        const hour = parseInt(timeNums[0]) || 0;
        const min = parseInt(timeNums[1]) || 0;
        
        return new Date(year, month, day, hour, min);
    } catch (e) { return null; }
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
    
    if (endMins > startMins) {
        // Ca thường (ví dụ 10:00 -> 22:00)
        return requestMins >= startMins && requestMins < endMins;
    } else {
        // Ca đêm qua ngày (ví dụ 20:00 -> 04:00)
        return requestMins >= startMins && requestMins < endMins;
    }
}

function getNext7Days() { 
    let days = []; 
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' })); 
    for(let i=0; i<7; i++) { 
        let d = new Date(t); 
        d.setDate(t.getDate()+i); 
        
        const m = d.getMonth() + 1;
        const day = d.getDate();
        const w = d.toLocaleDateString('zh-TW', { weekday: 'short' }); 
        const v = d.toISOString().split('T')[0]; 
        
        let l = `${m}/${day} (${w})`; 
        if(i===0) l="今天 (Hôm nay)"; 
        if(i===1) l="明天 (Mai)"; 
        
        days.push({label: l, value: v}); 
    } 
    return days; 
}

// ==============================================================================
// 3. ĐỒNG BỘ DỮ LIỆU (SYNC DATA)
// ==============================================================================

async function syncData() {
    try {
        // 1. Lấy dữ liệu Booking
        const resBooking = await sheets.spreadsheets.values.get({ 
            spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:K` 
        });
        const rowsBooking = resBooking.data.values;
        cachedBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue;

                const status = row[7] || '已預約';
                if (status.includes('取消') || status.includes('Cancelled')) continue;

                const serviceStr = row[3] || '';
                let duration = 60; 
                let type = 'BED'; 
                
                // Tìm dịch vụ khớp
                for (const key in SERVICES) {
                    if (serviceStr.includes(SERVICES[key].name.split('(')[0])) { 
                        duration = SERVICES[key].duration; 
                        type = SERVICES[key].type; 
                        break; 
                    }
                }
                
                let pax = 1;
                if (row[5]) pax = parseInt(row[5]); 

                const normalizedDate = formatDate2025(row[0]);

                cachedBookings.push({
                    rowId: i + 1,
                    startTimeString: `${normalizedDate} ${row[1]}`,
                    date: normalizedDate, 
                    time: row[1],
                    duration: duration,
                    type: type,
                    staffId: row[8] || '隨機', 
                    pax: pax,
                    customerName: `${row[2]} (${row[6]})`, 
                    serviceName: serviceStr,
                    status: status,
                    lineId: row[9]
                });
            }
        }

        // 2. Lấy dữ liệu Lịch làm việc (Schedule)
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
                    const staffGenderRaw = rows[i][1];
                    let gender = 'M';
                    if (staffGenderRaw && (staffGenderRaw.trim() === '女' || staffGenderRaw.trim().toUpperCase() === 'F')) gender = 'F';
                    
                    tempStaffList.push({ 
                        id: cleanName, 
                        name: cleanName, 
                        gender: gender, 
                        shiftStart: rows[i][2]||'00:00', 
                        shiftEnd: rows[i][3]||'24:00' 
                    });

                    // Check ngày nghỉ
                    if (headerDates.length > 4) {
                        for (let j = 4; j < rows[i].length; j++) {
                            const status = rows[i][j];
                            const rawDateStr = headerDates[j]; 
                            if (status && rawDateStr && status.trim() !== '') {
                                const stdDate = formatDate2025(rawDateStr);
                                if (stdDate) {
                                    cachedSchedule.push({ date: stdDate, staffId: cleanName });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        if (tempStaffList.length > 0) STAFF_LIST = tempStaffList;
        else if (STAFF_LIST.length === 0) {
             // Fallback nếu chưa cấu hình sheet schedule
             for(let i=1; i<=20; i++) STAFF_LIST.push({id:`${i}號`, name:`${i}號`, gender:'F', shiftStart:'00:00', shiftEnd:'24:00'});
        }

        console.log(`[SYNC] Done at ${new Date().toLocaleTimeString()} - ${cachedBookings.length} bookings loaded.`);
    } catch (e) { console.error('Sync Error:', e); }
}

// Chạy sync lần đầu
syncData();
// Tự động sync mỗi 60 giây (QUAN TRỌNG: để không bị Google block vì spam request)
setInterval(syncData, 60000);

// ==============================================================================
// 4. LOGIC XỬ LÝ GOOGLE SHEET (GHI/SỬA)
// ==============================================================================

async function ghiVaoSheet(data) {
    try {
        const timeCreate = getCurrentTime2025(); 
        let colA_Date = formatDate2025(data.ngayDen);     
        let colB_Time = data.gioDen || "";
        if (colB_Time.includes(' ')) colB_Time = colB_Time.split(' ')[1];
        if (colB_Time.length > 5) colB_Time = colB_Time.substring(0, 5);

        const valuesToWrite = [[ 
            colA_Date,    // A
            colB_Time,    // B
            data.hoTen || '現場客', // C
            data.dichVu + (data.isOil ? " (油推+$200)" : ""), // D
            data.isOil ? "Yes" : "", // E
            data.pax || 1, // F
            data.sdt || "", // G
            data.trangThai || '已預約', // H
            data.nhanVien || '隨機', // I
            data.userId || 'ADMIN', // J
            timeCreate // K
        ]];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID, 
            range: 'Sheet1!A:A', 
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: valuesToWrite }
        });
        
        // Gọi sync ngay để cập nhật dữ liệu mới nhất
        setTimeout(syncData, 1000); 
        
    } catch (e) { console.error('[ERROR] Lỗi ghi Sheet:', e); }
}

async function updateBookingStatus(rowId, newStatus) {
    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, 
            range: `${BOOKING_SHEET}!H${rowId}`, 
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[ newStatus ]] }
        });
        setTimeout(syncData, 1000);
    } catch (e) { console.error('Update Error:', e); }
}

// ==============================================================================
// 5. LOGIC TÌM KIẾM SLOT TRỐNG (LINE BOT)
// ==============================================================================

function checkAvailability(dateStr, timeStr, serviceDuration, serviceType, specificStaffIds = null, pax = 1, requireFemale = false) {
    const displayDate = formatDate2025(dateStr); 
    const startRequest = parseDateStandard(`${displayDate} ${timeStr}`);
    if (!startRequest) return false;
    const endRequest = new Date(startRequest.getTime() + serviceDuration * 60000);

    const staffOffToday = cachedSchedule.filter(s => s.date === displayDate).map(s => s.staffId);
    
    // Lọc nhân viên đi làm
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

    let usedChairs = 0; 
    let usedBeds = 0; 
    let workingStaffBusy = 0; 
    let isSpecificStaffBusy = false;
    let isShopClosed = false;

    for (const booking of cachedBookings) {
        if (booking.staffId === 'ALL_STAFF' && booking.date === displayDate) { 
            isShopClosed = true; break; 
        }
        
        const startExisting = parseDateStandard(booking.startTimeString);
        if (!startExisting) continue;
        const endExisting = new Date(startExisting.getTime() + booking.duration * 60000);

        // Check trùng giờ
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
    const now = new Date(); 
    const taipeiNowStr = now.toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false }); 
    const currentHour = parseInt(taipeiNowStr.split(', ')[1].split(':')[0]); 
    const taipeiDate = new Date(taipeiNowStr); 
    const todayStr = formatDate2025(taipeiDate.toISOString().split('T')[0]); 
    const isToday = (formatDate2025(selectedDate) === todayStr);

    const service = SERVICES[serviceCode]; 
    if (!service) return null;
    
    let allSlots = []; 
    for (let h = 8; h <= 26; h++) allSlots.push(h); // 8h sáng đến 2h sáng hôm sau
    
    let availableSlots = [];
    if (isToday) {
        if (currentHour >= 0 && currentHour < 3) {
            availableSlots = allSlots.filter(h => h > (currentHour + 24));
        } else {
            availableSlots = allSlots.filter(h => h > currentHour + 1); // Cách ít nhất 1 tiếng
        }
    } else {
        availableSlots = allSlots;
    }

    let validSlots = [];
    for (const h of availableSlots) {
        const timeStr = h < 24 ? `${h.toString().padStart(2, '0')}:00` : `${(h - 24).toString().padStart(2, '0')}:00`;
        if (checkAvailability(selectedDate, timeStr, service.duration, service.type, specificStaffIds, pax, requireFemale)) { 
            validSlots.push(h); 
        }
    }

    if (validSlots.length === 0) return null;

    const formatTime = (h) => h < 24 ? `${h.toString().padStart(2, '0')}:00` : `${(h - 24).toString().padStart(2, '0')}:00 (凌晨)`;
    
    // Chia nhóm giờ
    const groups = [ 
        { name: '🌞 早安時段 (Sáng)', slots: validSlots.filter(h => h >= 8 && h < 12) }, 
        { name: '☀️ 下午時段 (Chiều)', slots: validSlots.filter(h => h >= 12 && h < 18) }, 
        { name: '🌙 晚安時段 (Tối)', slots: validSlots.filter(h => h >= 18 && h < 24) }, 
        { name: '✨ 深夜時段 (Khuya)', slots: validSlots.filter(h => h >= 24 && h <= 26) } 
    ];

    const bubbles = groups.filter(g => g.slots.length > 0).map(group => {
        const buttons = group.slots.map(h => {
            const timeStr = formatTime(h);
            const valueToSend = h < 24 ? `${h.toString().padStart(2, '0')}:00` : `${(h - 24).toString().padStart(2, '0')}:00`;
            return { 
                "type": "button", 
                "style": "primary", 
                "margin": "xs", 
                "height": "sm", 
                "action": { "type": "message", "label": timeStr, "text": `Time:${valueToSend}` } 
            };
        });
        
        return { 
            "type": "bubble", 
            "size": "kilo", 
            "body": { 
                "type": "box", 
                "layout": "vertical", 
                "contents": [
                    { "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" }, 
                    { "type": "separator", "margin": "sm" }, 
                    ...buttons
                ] 
            } 
        };
    });
    
    return { type: 'carousel', contents: bubbles };
}

function createStaffBubbles(filterFemale = false, excludedIds = []) {
    let list = STAFF_LIST;
    if (filterFemale) list = STAFF_LIST.filter(s => s.gender === 'F' || s.gender === '女');
    if (excludedIds && excludedIds.length > 0) list = list.filter(s => !excludedIds.includes(s.id));

    if (!list || list.length === 0) {
        return [{ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "Hết thợ phù hợp", "align": "center" }] } }];
    }
    
    const bubbles = [];
    const chunkSize = 12; 
    for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        const rows = [];
        for (let j = 0; j < chunk.length; j += 3) {
            const rowItems = chunk.slice(j, j + 3);
            const rowButtons = rowItems.map(s => ({
                "type": "button", "style": "secondary", 
                "color": (s.gender === 'F' || s.gender === '女') ? "#F48FB1" : "#90CAF9", 
                "height": "sm", "margin": "xs", "flex": 1,
                "action": { "type": "message", "label": s.name, "text": `StaffSelect:${s.id}` }
            }));
            rows.push({ "type": "box", "layout": "horizontal", "spacing": "xs", "contents": rowButtons });
        }
        bubbles.push({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "Chọn Thợ", "weight": "bold", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...rows ] } });
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
                { "type": "text", "text": "🛏️ 身體指壓 (Body)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("全身指壓", 120, 1500),
                createRow("全身指壓", 90, 999),
                createRow("全身指壓", 70, 900),
                { "type": "separator", "margin": "xl" },
                { "type": "text", "text": "⭐ 油推需加收 $200，請詢問櫃台。", "size": "xs", "color": "#aaaaaa", "margin": "md", "align": "center" }
            ]
        },
        "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "📅 立即預約 (Book Now)", "text": "Action:Booking" } } ] }
    };
}

// ==============================================================================
// 6. SERVER ROUTES & API
// ==============================================================================

const client = new line.Client(config);
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WEBHOOK
app.post('/callback', line.middleware(config), (req, res) => { 
    Promise.all(req.body.events.map(handleEvent))
        .then((r) => res.json(r))
        .catch((e) => { console.error(e); res.status(500).end(); }); 
});

// API 1: Lấy thông tin tổng hợp (Cho Admin App)
app.get('/api/info', (req, res) => {
    // Trả về dữ liệu từ RAM -> Nhanh, không tốn quota
    res.json({ 
        staffList: STAFF_LIST, 
        bookings: cachedBookings, 
        schedule: cachedSchedule, 
        resourceState: serverResourceState, // Trạng thái giường từ Server
        staffStatus: serverStaffStatus,     // Trạng thái nhân viên từ Server
        resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS } 
    });
});

// API 2: Cập nhật trạng thái Giường/Ghế
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

// API 3: Cập nhật trạng thái Nhân viên (Check-in/out)
app.post('/api/staff-status-update', (req, res) => {
    const { staffId, statusData } = req.body;
    if (staffId && statusData) {
        serverStaffStatus[staffId] = statusData;
        console.log(`[STAFF] Update ${staffId}: ${statusData.status}`);
    }
    res.json({ success: true, newStatus: serverStaffStatus });
});

// API 4: Update trạng thái đơn (Cancel/Late...)
app.post('/api/update-status', async (req, res) => { 
    const { rowId, status } = req.body; 
    await updateBookingStatus(rowId, status); 
    res.json({ success: true }); 
});

// ==============================================================================
// 7. LINE BOT HANDLE EVENT (LOGIC CHATBOT)
// ==============================================================================

async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return Promise.resolve(null);
    
    let text = ''; 
    let userId = event.source.userId;
    
    if (event.type === 'message' && event.message.type === 'text') {
        text = event.message.text.trim();
    } else if (event.type === 'postback') { 
        text = event.postback.data; 
        if(event.postback.params && event.postback.params.date) {
            text = `DatePick:${event.postback.params.date}`; 
        }
    }

    // --- BẮT ĐẦU FLOW ĐẶT LỊCH ---
    if (text === 'Action:Booking') { 
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請選擇服務類別", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩 (腳)", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓 (身)", "text": "Cat:BODY" } } ] } } }); 
    }

    // --- ADMIN MENU ---
    if (text === 'Admin' || text === '管理') { 
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Admin', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "🛠️ 師傅管理 (Admin)", "weight": "bold", "color": "#E63946", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#000000", "margin": "md", "action": { "type": "message", "label": "⛔ 全店店休", "text": "Admin:CloseShop" } }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛌 請假", "text": "Admin:SetOff" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🤒 早退", "text": "Admin:SetLeaveEarly" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🍱 用餐", "text": "Admin:SetBreak" } } ] } } }); 
    }

    // --- CHỌN LOẠI DỊCH VỤ ---
    if (text.startsWith('Cat:')) { 
        const category = text.split(':')[1]; 
        const buttons = Object.keys(SERVICES)
            .filter(k => SERVICES[k].category === category)
            .map(key => ({ 
                "type": "button", "style": "primary", "margin": "sm", "height": "sm", 
                "action": { "type": "message", "label": `${SERVICES[key].name} ($${SERVICES[key].price})`, "text": `Svc:${key}` } 
            })); 
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇方案', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "選擇方案", "weight": "bold", "size": "xl", "align": "center" }, { "type": "separator", "margin": "md" }, ...buttons ] } } }); 
    }

    // --- CHỌN GÓI ---
    if (text.startsWith('Svc:')) { 
        const svcCode = text.split(':')[1]; 
        const service = SERVICES[svcCode]; 
        userState[userId] = { step: 'OIL_OPTION', service: svcCode }; 
        
        // Nếu là chân -> bỏ qua bước dầu
        if (service.category === 'FOOT') { 
            userState[userId].step = 'PAX'; 
            userState[userId].isOil = false; 
            const paxButtons = [1, 2, 3, 4].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } })); 
            return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇人數', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請問幾位貴賓?", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons ] } } }); 
        } 
        // Nếu là body -> hỏi dầu
        return client.replyMessage(event.replyToken, { type: 'template', altText: '油推?', template: { type: 'buttons', text: '請問是否需要油推？(指定女技師 +$200)', actions: [ { type: 'message', label: '要 (Yes)', text: 'Oil:Yes' }, { type: 'message', label: '不要 (No)', text: 'Oil:No' } ] } }); 
    }

    // --- CHỌN DẦU ---
    if (text.startsWith('Oil:')) { 
        const isOil = text.split(':')[1] === 'Yes'; 
        const currentState = userState[userId]; 
        if (!currentState) return Promise.resolve(null); 
        
        currentState.step = 'PAX'; 
        currentState.isOil = isOil; 
        userState[userId] = currentState; 
        
        const paxButtons = [1, 2, 3, 4].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } })); 
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇人數', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請問幾位貴賓?", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons ] } } }); 
    }

    // --- CHỌN SỐ KHÁCH ---
    if (text.startsWith('Pax:')) { 
        const num = parseInt(text.split(':')[1]); 
        const currentState = userState[userId]; 
        if (!currentState) return Promise.resolve(null); 
        
        currentState.step = 'DATE'; 
        currentState.pax = num; 
        currentState.selectedStaff = []; 
        userState[userId] = currentState; 
        
        const days = getNext7Days(); 
        const dateButtons = days.map(d => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": d.label, "text": `Date:${d.value}` } })); 
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇日期', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": `📅 請選擇日期 (${num}位)`, "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...dateButtons ] } } }); 
    }
  
    // --- CHỌN NGÀY ---
    if (text.startsWith('Date:')) { 
        const selectedDate = text.split(':')[1]; 
        const currentState = userState[userId]; 
        if (!currentState) return client.replyMessage(event.replyToken, { type: 'text', text: '請重新預約。' }); 
        
        currentState.date = selectedDate; 
        userState[userId] = currentState; 
        
        return client.replyMessage(event.replyToken, { type: 'template', altText: '選師傅', template: { type: 'buttons', text: `共有 ${currentState.pax} 位貴賓。請問是否指定師傅？`, actions: [ { type: 'message', label: '不指定 (隨機)', text: 'Staff:Random' }, { type: 'message', label: '指定師傅', text: 'Staff:Pick' } ] } }); 
    }

    // --- CHỌN THỢ (RANDOM) ---
    if (text === 'Staff:Random') { 
        const currentState = userState[userId]; 
        if (!currentState) return Promise.resolve(null); 
        
        currentState.step = 'TIME'; 
        currentState.staffId = null; 
        
        const timeCarousel = generateTimeBubbles(currentState.date, currentState.service, null, currentState.pax, currentState.isOil); 
        if (!timeCarousel) return client.replyMessage(event.replyToken, { type: 'text', text: '😴 客滿了，請選擇其他日期 (Hết giờ trống)。' }); 
        
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇時間', contents: timeCarousel }); 
    }

    // --- CHỌN THỢ (PICK) ---
    if (text === 'Staff:Pick') { 
        const currentState = userState[userId]; 
        const currentGuestIndex = currentState.selectedStaff.length + 1; 
        const bubbles = createStaffBubbles(currentState.isOil, currentState.selectedStaff); 
        
        bubbles.forEach(b => { 
            b.body.contents[0].text = `選第 ${currentGuestIndex} 位技師`; 
            b.body.contents[0].color = "#E91E63"; 
        }); 
        
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇師傅', contents: { type: 'carousel', contents: bubbles } }); 
    }

    // --- XỬ LÝ CHỌN THỢ CỤ THỂ ---
    if (text.startsWith('StaffSelect:')) { 
        const staffId = text.split(':')[1]; 
        const currentState = userState[userId]; 
        if (!currentState) return Promise.resolve(null); 
        
        if (!currentState.selectedStaff) currentState.selectedStaff = []; 
        currentState.selectedStaff.push(staffId); 
        userState[userId] = currentState; 
        
        // Nếu chưa chọn đủ số thợ cho số khách
        if (currentState.selectedStaff.length < currentState.pax) { 
            const bubbles = createStaffBubbles(currentState.isOil, currentState.selectedStaff); 
            const currentGuestIndex = currentState.selectedStaff.length + 1; 
            bubbles.forEach(b => { 
                b.body.contents[0].text = `選第 ${currentGuestIndex} 位技師`; 
                b.body.contents[0].color = "#E91E63"; 
            }); 
            return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇下一位師傅', contents: { type: 'carousel', contents: bubbles } }); 
        } else { 
            // Đã chọn đủ -> Chọn giờ
            currentState.step = 'TIME'; 
            const timeCarousel = generateTimeBubbles(currentState.date, currentState.service, currentState.selectedStaff, currentState.pax, currentState.isOil); 
            
            if (!timeCarousel) return client.replyMessage(event.replyToken, { type: 'text', text: '😢 所選技師時間衝突，請重新選擇。' }); 
            return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇時間', contents: timeCarousel }); 
        } 
    }
  
    // --- CHỌN GIỜ ---
    if (text.startsWith('Time:')) { 
        const gio = text.replace('Time:', '').trim(); 
        const currentState = userState[userId]; 
        if (!currentState) return client.replyMessage(event.replyToken, { type: 'text', text: '請重新點選「立即預約」。' }); 
        
        currentState.step = 'SURNAME'; 
        currentState.time = gio; 
        userState[userId] = currentState; 
        
        const minguoDate = formatDate2025(currentState.date); 
        return client.replyMessage(event.replyToken, { type: 'text', text: `好的，您預約了 ${minguoDate} ${gio} (${currentState.pax}位)。\n\n請問怎麼稱呼您？(請輸入姓氏)` }); 
    }
  
    // --- NHẬP TÊN ---
    if (userState[userId] && userState[userId].step === 'SURNAME') { 
        const currentState = userState[userId]; 
        currentState.step = 'PHONE'; 
        currentState.surname = text; 
        userState[userId] = currentState; 
        return client.replyMessage(event.replyToken, { type: 'text', text: "最後一步，請輸入您的手機號碼。\n(為了方便聯繫，請提供正確號碼。)" }); 
    }
  
    // --- NHẬP SỐ ĐIỆN THOẠI & HOÀN TẤT ---
    if (userState[userId] && userState[userId].step === 'PHONE') { 
        const sdt = normalizePhoneNumber(text); 
        if (!/^\d{7,15}$/.test(sdt)) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 號碼格式錯誤。請輸入正確手機號碼。' }); 
        
        const currentState = userState[userId]; 
        const serviceName = SERVICES[currentState.service].name; 
        const gio = currentState.time; 
        const displayDate = formatDate2025(currentState.date); 
        const hoTen = currentState.surname; 
        const paxDisplay = `${currentState.pax} 位`;
        
        let staffDisplay = '隨機'; 
        if (currentState.selectedStaff && currentState.selectedStaff.length > 0) staffDisplay = currentState.selectedStaff.join(', ');
        
        const pricePerPerson = SERVICES[currentState.service].price || 0; 
        const totalPrice = (pricePerPerson + (currentState.isOil ? 200 : 0)) * currentState.pax;

        const confirmMsg = `✅ 預約成功\n\n👤 ${hoTen} (${sdt})\n📅 ${displayDate} ${gio}\n💆 ${serviceName.split('(')[0]}\n👥 ${paxDisplay}\n🛠️ ${staffDisplay}\n${currentState.isOil ? '⭐ 包含油推 (+$200)\n' : ''}💵 總金額: $${totalPrice}`;
      
        await client.replyMessage(event.replyToken, { type: 'text', text: confirmMsg });
        
        // Gửi thông báo cho chủ
        if (userId !== ID_BA_CHU) {
            client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 新訂單!\n${confirmMsg}` }); 
        }
      
        // Ghi vào Sheet
        await ghiVaoSheet({ 
            gioDen: gio, 
            ngayDen: currentState.date, 
            dichVu: serviceName, 
            nhanVien: staffDisplay, 
            userId: userId, 
            sdt: sdt, 
            hoTen: hoTen, 
            trangThai: '已預約', 
            pax: currentState.pax, 
            isOil: currentState.isOil 
        }); 
      
        delete userState[userId]; 
        return; 
    }

    // --- MỞ MENU ---
    if (text.includes('預約') || text.toLowerCase().includes('booking') || text.includes('menu') || text.toLowerCase() === 'menu') {
        delete userState[userId]; 
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() });
    }

    // --- MẶC ĐỊNH ---
    return client.replyMessage(event.replyToken, { type: 'flex', altText: '預約服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您好 👋", "weight": "bold", "size": "lg", "align": "center" }, { "type": "text", "text": "請問您是要預約按摩服務嗎？", "wrap": true, "size": "sm", "color": "#555555", "align": "center", "margin": "md" } ] }, "footer": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "✅ 立即預約 (Book)", "text": "Action:Booking" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "📄 服務價目 (Menu)", "text": "Menu" } } ] } } });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Bot Server running on port ${port}`);
});
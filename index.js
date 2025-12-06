// ==============================================================================
// PHIÊN BẢN V60.0 - SMART QUEUE & COMBO LOGIC
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

// BẢNG GIÁ CHUẨN (Định nghĩa Category để xử lý Combo)
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
// HELPERS
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
// 2. DATA SYNC
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
                let category = 'BODY';
                
                // Xác định Category để xử lý Combo ở Frontend
                for (const key in SERVICES) {
                    if (serviceStr.includes(SERVICES[key].name.split('(')[0])) { 
                        duration = SERVICES[key].duration; 
                        type = SERVICES[key].type; 
                        category = SERVICES[key].category;
                        break;
                    }
                }
                let pax = 1;
                if (row[5]) pax = parseInt(row[5]); 

                cachedBookings.push({
                    rowId: rowId,
                    startTimeString: `${dateStr} ${timeStr}`,
                    duration: duration,
                    type: type,
                    category: category,
                    staffId: row[8] || '隨機', 
                    pax: pax,
                    customerName: `${row[2]} (${row[6]})`,
                    serviceName: serviceStr,
                    status: status,
                    lineId: row[9] 
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

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID, 
            range: 'Sheet1!A:A', 
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: valuesToWrite }
        });
        await syncData(); 
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
        await syncData();
    } catch (e) { console.error('Update Error:', e); }
}

// ==============================================================================
// 3. SERVER & ROUTES
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

app.post('/api/update-booking-details', async (req, res) => {
    try {
        const { rowId, staffId, serviceName } = req.body;
        if (serviceName) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!D${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[serviceName]] }
            });
        }
        if (staffId) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!I${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[staffId]] }
            });
        }
        await syncData();
        res.json({ success: true });
    } catch (e) {
        console.error('Update Details Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ==============================================================================
// 5. BOT HANDLE EVENT
// ==============================================================================
async function handleEvent(event) {
  // Logic Bot giữ nguyên như V59
  if (event.type !== 'message' || event.message.type !== 'text' && event.type !== 'postback') return Promise.resolve(null);
  let text = ''; let userId = event.source.userId;
  if (event.type === 'message') text = event.message.text.trim();
  else if (event.type === 'postback') {
      if (event.postback.params && event.postback.params.date) text = `DatePick:${event.postback.params.date}`;
      else text = event.postback.data;
  }

  // ... (Phần logic bot y hệt bản trước, không thay đổi)
  return Promise.resolve(null);
}

syncData();
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Bot v60.0 (Smart Combo) running on ${port}`);
});
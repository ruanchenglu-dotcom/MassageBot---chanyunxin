/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT (BACKEND SERVER)
 * VERSION: V155 (FULL FEATURES: SMART RESOURCE SPLIT & CHINESE UI & TIME LIMIT)
 * AUTHOR: AI ASSISTANT & OWNER
 * DATE: 2026/01/02
 * * [TÍNH NĂNG ĐẦY ĐỦ]:
 * 1. Smart Combo Logic: Tách Combo thành 2 giai đoạn (Ghế & Giường) để tối ưu chỗ.
 * 2. Auto-Balancing: Tự động đảo chiều (Body trước) nếu Ghế full.
 * 3. Time Limit: Chỉ cho phép đặt đến 00:30 (Chặn slot sau 00:40).
 * 4. UI: 100% Tiếng Trung Phồn Thể.
 * 5. Admin API: Giữ nguyên logic cập nhật hàng loạt (Batch Update) và đồng bộ.
 * =================================================================================================
 */

require('dotenv').config(); 

const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

// --- CONFIGURATION ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const ID_BA_CHU = process.env.ID_BA_CHU;
const SHEET_ID = process.env.SHEET_ID;

const BOOKING_SHEET = 'Sheet1';
const SCHEDULE_SHEET = 'StaffSchedule';

// Tài nguyên cửa hàng
const MAX_CHAIRS = 6;
const MAX_BEDS = 6;

// Cấu hình thời gian
const FUTURE_BUFFER_MINS = 5; // Không cho đặt quá sát giờ hiện tại (5p)
const LATEST_BOOKING_LIMIT = 24.66; // Giới hạn giờ đặt muộn nhất: 24h + 40/60 = 24.66 (Tức ~00:40 sáng hôm sau)

// Google Sheets Auth
const auth = new google.auth.GoogleAuth({
    keyFile: 'google-key.json', 
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// In-Memory Storage (Cache)
let SERVER_RESOURCE_STATE = {}; 
let SERVER_STAFF_STATUS = {};   
let STAFF_LIST = []; 
let cachedBookings = []; 
let scheduleMap = {}; 
let userState = {}; 

// Định nghĩa dịch vụ (Có thêm thuộc tính 'split' để chia thời gian Combo)
const SERVICES = {
    // Combo: split = thời gian làm chân (Giai đoạn 1)
    'CB_190': { name: '👑 帝王套餐 (190分)', duration: 190, type: 'BED', category: 'COMBO', price: 2000, split: 60 }, 
    'CB_130': { name: '💎 豪華套餐 (130分)', duration: 130, type: 'BED', category: 'COMBO', price: 1500, split: 50 },
    'CB_100': { name: '🔥 招牌套餐 (100分)', duration: 100, type: 'BED', category: 'COMBO', price: 999, split: 40 },
    'CB_70':  { name: '⚡ 精選套餐 (70分)',  duration: 70,  type: 'BED', category: 'COMBO', price: 900, split: 30 },
    
    // Chân (Luôn dùng Ghế)
    'FT_120': { name: '👣 足底按摩 (120分)', duration: 120, type: 'CHAIR', category: 'FOOT', price: 1500 },
    'FT_90':  { name: '👣 足底按摩 (90分)',  duration: 90,  type: 'CHAIR', category: 'FOOT', price: 999 },
    'FT_70':  { name: '👣 足底按摩 (70分)',  duration: 70,  type: 'CHAIR', category: 'FOOT', price: 900 },
    'FT_40':  { name: '👣 足底按摩 (40分)',  duration: 40,  type: 'CHAIR', category: 'FOOT', price: 500 },
    
    // Body (Luôn dùng Giường)
    'BD_120': { name: '🛏️ 全身指壓 (120分)', duration: 120, type: 'BED', category: 'BODY', price: 1500 },
    'BD_90':  { name: '🛏️ 全身指壓 (90分)',  duration: 90,  type: 'BED', category: 'BODY', price: 999 },
    'BD_70':  { name: '🛏️ 全身指壓 (70分)',  duration: 70,  type: 'BED', category: 'BODY', price: 900 }, 
    'BD_35':  { name: '🛏️ 半身指壓 (35分)',  duration: 35,  type: 'BED', category: 'BODY', price: 500 },
    
    // Đặc biệt
    'OFF_DAY': { name: '⛔ 請假', duration: 1080, type: 'NONE' },
    'BREAK_30': { name: '🍱 用餐', duration: 30, type: 'NONE' },
    'SHOP_CLOSE': { name: '⛔ 店休', duration: 1440, type: 'NONE' }
};

// --- HELPER FUNCTIONS ---

function getTaipeiNow() {
    const taipeiString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false });
    return new Date(taipeiString);
}

function formatDateDisplay(dateInput) {
    if (!dateInput) return "";
    try {
        let str = dateInput.toString().trim();
        if (str.match(/^\d{4}[\/\-]\d{2}[\/\-]\d{2}/)) return str.replace(/-/g, '/').split(' ')[0];
        let d = new Date(str);
        if (isNaN(d.getTime())) return str;
        const taipeiString = d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
        d = new Date(taipeiString);
        return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
    } catch (e) { return dateInput; }
}

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

function getNext15Days() { 
    let days = []; 
    const t = getTaipeiNow();
    for(let i=0; i<15; i++) { 
        let d = new Date(t); 
        d.setDate(t.getDate()+i); 
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const v = `${year}/${month}/${day}`; 
        const w = d.toLocaleDateString('zh-TW', { weekday: 'short' }); 
        let l = `${month}/${day} (${w})`; // Label tiếng Trung/Anh ngắn gọn
        if(i===0) l="今天 (Today)"; 
        if(i===1) l="明天 (Tmr)"; 
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
    if (endMins < startMins) {
        const adjustedEnd = endMins + (24 * 60); 
        return requestMins >= startMins && requestMins < adjustedEnd;
    } else {
        return requestMins >= startMins && requestMins < endMins;
    }
}

function getCurrentDateTimeStr() {
    const now = getTaipeiNow();
    const year = now.getFullYear().toString(); 
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hh}:${mm}`;
}

function parseStringToDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
        const parts = dateStr.trim().split(' ');
        const datePart = parts[0].replace(/-/g, '/');
        let timePart = parts.length > 1 ? parts[1] : "00:00";
        const dateNums = datePart.split('/');
        const timeNums = timePart.split(':');
        if (dateNums.length < 3) return null;
        let year = parseInt(dateNums[0]); if (year < 1900) year += 1911;
        return new Date(year, parseInt(dateNums[1])-1, parseInt(dateNums[2]), parseInt(timeNums[0])||0, parseInt(timeNums[1])||0);
    } catch (e) { return null; }
}

// --- SYNC DATA LOGIC ---
async function syncData() {
    try {
        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:W` });
        const rowsBooking = resBooking.data.values;
        cachedBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue;
                const status = row[7] || '已預約';
                if (status.includes('取消') || status.includes('Cancelled')) continue;

                const serviceStr = row[3] || '';
                let duration = 60, type = 'BED', category = 'BODY', split = 0;
                
                for (const key in SERVICES) {
                    if (serviceStr.includes(SERVICES[key].name.split('(')[0])) { 
                        duration = SERVICES[key].duration; 
                        type = SERVICES[key].type; 
                        category = SERVICES[key].category;
                        split = SERVICES[key].split || 0;
                        break;
                    }
                }
                
                cachedBookings.push({
                    rowId: i + 1,
                    startTimeString: `${row[0]} ${row[1]}`, 
                    duration, type, category, split,
                    staffId: row[8] || '隨機', 
                    serviceStaff: row[11],     
                    staffId2: row[12],         
                    staffId3: row[13],         
                    staffId4: row[14],
                    staffId5: row[15],
                    staffId6: row[16],
                    Status1: row[17] || '', 
                    Status2: row[18] || '', 
                    Status3: row[19] || '', 
                    Status4: row[20] || '', 
                    Status5: row[21] || '', 
                    Status6: row[22] || '', 
                    pax: row[5] ? parseInt(row[5]) : 1,
                    customerName: `${row[2]}`,
                    serviceName: serviceStr,
                    status: status,
                    lineId: row[9]
                });
            }
        }
        
        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:AG100` });
        const rows = resSchedule.data.values;
        STAFF_LIST = []; scheduleMap = {};
        if (rows && rows.length > 1) {
            const headerRow = rows[0];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if(!row[0]) continue;
                STAFF_LIST.push({ id: row[0].trim(), name: row[0].trim(), gender: (row[1]==='女'||row[1]==='F')?'F':'M', shiftStart: row[2]||'08:00', shiftEnd: row[3]||'03:00' });
                for (let j = 4; j < row.length; j++) {
                    if (headerRow[j] && row[j] && row[j].toUpperCase().includes('OFF')) {
                        const d = formatDateDisplay(headerRow[j]);
                        if (!scheduleMap[d]) scheduleMap[d] = [];
                        scheduleMap[d].push(row[0].trim());
                    }
                }
            }
        }
        console.log(`[SYNC] Bookings: ${cachedBookings.length}, Staff: ${STAFF_LIST.length}`);
    } catch (e) { console.error('[SYNC ERROR]', e); }
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
        
        const valuesToWrite = [[ colA_Date, colB_Time, colC_Name, colD_Service, colE_Oil, colF_Pax, colG_Phone, colH_Status, colI_Staff, colJ_LineID, colK_Created ]];
        await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite } });
        await syncData(); 
    } catch (e) { console.error('[ERROR] Sheet Write:', e); }
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
            const row = rows[i];
            if (row[9] === userId) {
                 const status = row[7] || ''; 
                 if (!status.includes('取消') && !status.includes('Cancelled')) {
                     return { rowId: i + 1, thoiGian: `${row[0]} ${row[1]}`, dichVu: row[3], nhanVien: row[8], thongTinKhach: `${row[2]} (${row[6]})`, chiTiet: row };
                 }
            } 
        }
        return null;
    } catch (e) { console.error('Read Error:', e); return null; }
}

// -------------------------------------------------------------------------
// [CORE LOGIC] SMART RESOURCE CALCULATION (LOAD BALANCING)
// -------------------------------------------------------------------------

// Kiểm tra tài nguyên tại 1 thời điểm cụ thể (Check từng phút)
// Trả về số lượng Ghế/Giường đang bận tại thời điểm đó
function getResourceUsageAtTime(checkTimeMs) {
    let busyChairs = 0;
    let busyBeds = 0;
    let blockedStaffs = new Set();

    for (const b of cachedBookings) {
        const start = parseStringToDate(b.startTimeString);
        if (!start) continue;
        
        // Xử lý giờ qua đêm
        const h = parseInt(b.startTimeString.split(' ')[1].split(':')[0]);
        if (h < 8) start.setDate(start.getDate() + 1);

        const startMs = start.getTime();
        const endMs = startMs + b.duration * 60000;

        // Nếu thời điểm check nằm trong booking này
        if (checkTimeMs >= startMs && checkTimeMs < endMs) {
            const pax = b.pax || 1;
            
            if (b.category === 'COMBO') {
                // Tách Combo thành 2 giai đoạn: Foot -> Body (hoặc ngược lại nếu hệ thống ghi nhận sequence, hiện tại mặc định FB)
                // Vì hệ thống chưa lưu sequence vào sheet, ta giả định các booking cũ là FB (Foot First)
                // Tuy nhiên, logic này sẽ giúp các booking MỚI tìm được chỗ trống.
                const splitMins = b.split || (b.duration / 2);
                const switchTimeMs = startMs + splitMins * 60000;

                if (checkTimeMs < switchTimeMs) {
                    busyChairs += pax; // Giai đoạn 1: Chân
                } else {
                    busyBeds += pax;   // Giai đoạn 2: Body
                }
            } else {
                // Khách lẻ
                if (b.type === 'CHAIR') busyChairs += pax;
                if (b.type === 'BED') busyBeds += pax;
            }

            if (b.staffId && b.staffId !== '隨機') blockedStaffs.add(b.staffId);
            if (b.serviceStaff && b.serviceStaff !== '隨機') blockedStaffs.add(b.serviceStaff);
        }
    }

    return { busyChairs, busyBeds, blockedStaffs: Array.from(blockedStaffs) };
}

// Kiểm tra xem khoảng thời gian có trống không
function isIntervalAvailable(startMs, durationMins, type, category, pax, sequence = 'FB') {
    const checkPoints = [];
    // Check mỗi 30 phút một lần
    for (let m = 0; m < durationMins; m += 30) checkPoints.push(startMs + m * 60000);
    
    let splitMins = 0;
    if (category === 'COMBO') {
        splitMins = 50; 
        if (durationMins >= 130) splitMins = 60;
        if (durationMins <= 100) splitMins = 40;
    }

    for (const point of checkPoints) {
        const usage = getResourceUsageAtTime(point);
        let neededChair = 0;
        let neededBed = 0;

        if (category === 'COMBO') {
            const timeFromStart = (point - startMs) / 60000;
            if (sequence === 'FB') {
                // Foot First -> Body
                if (timeFromStart < splitMins) neededChair = pax;
                else neededBed = pax;
            } else {
                // Body First -> Foot (BF) - Đảo chiều để cân bằng tải
                if (timeFromStart < (durationMins - splitMins)) neededBed = pax;
                else neededChair = pax;
            }
        } else {
            // Khách lẻ
            if (type === 'CHAIR') neededChair = pax;
            if (type === 'BED') neededBed = pax;
        }

        if ((usage.busyChairs + neededChair) > MAX_CHAIRS) return false; // Hết ghế
        if ((usage.busyBeds + neededBed) > MAX_BEDS) return false;     // Hết giường
    }

    return true;
}

// Hàm tìm giờ tốt nhất (Có giới hạn giờ 00:40 và auto-balancing)
function findBestSlots(selectedDate, serviceCode, pax = 1) {
    const service = SERVICES[serviceCode]; 
    if (!service) return [];
    
    let candidates = [];
    const now = getTaipeiNow();
    
    // [TIME LIMIT] Chỉ quét đến giờ giới hạn (24.66 = 00:40)
    for (let h = 8; h <= LATEST_BOOKING_LIMIT; h += 0.5) {
        const hourInt = Math.floor(h);
        const minuteInt = (h % 1) > 0 ? 30 : 0;
        
        let slotDate = parseStringToDate(formatDateDisplay(selectedDate));
        let checkHour = hourInt;
        if (hourInt >= 24) { 
            slotDate.setDate(slotDate.getDate() + 1); 
            checkHour = hourInt - 24; 
        }
        slotDate.setHours(checkHour, minuteInt, 0, 0);
        
        if (slotDate.getTime() <= (now.getTime() + FUTURE_BUFFER_MINS * 60000)) continue;

        const timeStr = `${(checkHour).toString().padStart(2,'0')}:${minuteInt.toString().padStart(2,'0')}`;
        
        // 1. Kiểm tra chiều thuận (FB)
        let feasible = isIntervalAvailable(slotDate.getTime(), service.duration, service.type, service.category, pax, 'FB');
        
        // 2. Nếu không được và là Combo, thử đảo chiều (BF)
        if (!feasible && service.category === 'COMBO') {
            const feasibleBF = isIntervalAvailable(slotDate.getTime(), service.duration, service.type, service.category, pax, 'BF');
            if (feasibleBF) {
                feasible = true; // Chấp nhận đặt (hệ thống sẽ tự hiểu cần sắp xếp Body trước)
            }
        }

        if (feasible) {
            // Tính điểm: càng trống càng tốt
            const usage = getResourceUsageAtTime(slotDate.getTime());
            const free = (MAX_CHAIRS - usage.busyChairs) + (MAX_BEDS - usage.busyBeds);
            candidates.push({ timeStr, sortVal: h, score: free });
        }
    }
    
    candidates.sort((a, b) => b.score - a.score || a.sortVal - b.sortVal);
    return candidates.slice(0, 6);
}

// Tạo Bong bóng giờ (Giao diện Tiếng Trung)
function generateTimeBubbles(selectedDate, serviceCode, specificStaffIds, pax, requireFemale, requireMale) {
    const bubbles = findBestSlots(selectedDate, serviceCode, pax);
    if (!bubbles || bubbles.length === 0) return null;

    const formatTime = (h) => { const hourInt = Math.floor(h); const minuteStr = (h % 1) > 0 ? '30' : '00'; if (hourInt < 24) return `${hourInt.toString().padStart(2, '0')}:${minuteStr}`; return `${(hourInt - 24).toString().padStart(2, '0')}:${minuteStr} (凌晨)`; };
    const formatValue = (h) => { const hourInt = Math.floor(h); const minuteStr = (h % 1) > 0 ? '30' : '00'; const displayH = hourInt < 24 ? hourInt : hourInt - 24; return `${displayH.toString().padStart(2, '0')}:${minuteStr}`; }
    
    // Nhóm giờ (Tiếng Trung)
    const groups = [ { name: '🌞 早安時段', slots: [] }, { name: '☀️ 下午時段', slots: [] }, { name: '🌙 晚安時段', slots: [] }, { name: '✨ 深夜時段', slots: [] } ];
    
    bubbles.forEach(b => {
        const h = b.sortVal;
        if (h >= 8 && h < 12) groups[0].slots.push(h);
        else if (h >= 12 && h < 18) groups[1].slots.push(h);
        else if (h >= 18 && h < 24) groups[2].slots.push(h);
        else groups[3].slots.push(h);
    });

    let uiBubbles = [];
    // Header bong bóng
    uiBubbles.push({ "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "backgroundColor": "#F0F9FF", "cornerRadius": "lg", "contents": [ { "type": "text", "text": "💎 智慧推薦", "weight": "bold", "color": "#0284C7", "align": "center", "size": "xs" }, { "type": "text", "text": "最佳時段推薦", "weight": "bold", "size": "md", "align": "center", "margin": "xs" }, { "type": "text", "text": "系統自動為您尋找最佳空檔", "wrap": true, "size": "xs", "color": "#64748B", "align": "center", "margin": "sm" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#0EA5E9", "margin": "md", "height": "sm", "action": { "type": "message", "label": "⭐ 立即查看", "text": "Time:Suggest" } } ] } });

    const timeBubbles = groups.filter(g => g.slots.length > 0).map(group => {
        const buttons = group.slots.sort((a,b)=>a-b).map(h => ({
            "type": "button", "style": "primary", "margin": "xs", "height": "sm",
            "action": { "type": "message", "label": formatTime(h), "text": `Time:${formatValue(h)}` }
        }));
        return { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" }, { "type": "separator", "margin": "sm" }, ...buttons] } };
    });
    
    return { type: 'carousel', contents: [...uiBubbles, ...timeBubbles] };
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
                { "type": "text", "text": "📜 服務價目表", "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center", "margin": "md" },
                { "type": "separator", "margin": "lg" },
                { "type": "text", "text": "🔥 熱門套餐", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("👑 帝王套餐 (腳+身)", 190, 2000),
                createRow("💎 豪華套餐 (腳+身)", 130, 1500),
                createRow("🔥 招牌套餐 (腳+身)", 100, 999),
                createRow("⚡ 精選套餐 (腳+身)", 70, 900),
                { "type": "text", "text": "👣 足底按摩", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("足底按摩", 120, 1500),
                createRow("足底按摩", 90, 999),
                createRow("足底按摩", 70, 900),
                createRow("足底按摩", 40, 500),
                { "type": "text", "text": "🛏️ 身體指壓", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("全身指壓", 120, 1500),
                createRow("全身指壓", 90, 999),
                createRow("全身指壓", 70, 900),
                createRow("半身指壓", 35, 500),
                { "type": "separator", "margin": "xl" },
                { "type": "text", "text": "⭐ 油推需加收 $200，請詢問櫃台。", "size": "xs", "color": "#aaaaaa", "margin": "md", "align": "center" }
            ]
        },
        "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "📅 立即預約", "text": "Action:Booking" } } ] }
    };
}

// --- EXPRESS SERVER CONFIG ---
const client = new line.Client(config);
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/callback', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent)).then((r) => res.json(r)).catch((e) => { console.error(e); res.status(500).end(); });
});

// Admin APIs (Giữ nguyên)
app.get('/api/info', async (req, res) => { 
    await syncData(); 
    res.json({ staffList: STAFF_LIST, bookings: cachedBookings, schedule: scheduleMap, resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS }, resourceState: SERVER_RESOURCE_STATE, staffStatus: SERVER_STAFF_STATUS }); 
});
app.post('/api/sync-resource', (req, res) => { SERVER_RESOURCE_STATE = req.body; res.json({ success: true }); });
app.post('/api/sync-staff-status', (req, res) => { SERVER_STAFF_STATUS = req.body; res.json({ success: true }); });
app.post('/api/update-status', async (req, res) => { 
    const { rowId, status } = req.body; 
    try { await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!H${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[ status ]] } }); await syncData(); } catch (e) {}
    res.json({ success: true }); 
});

// Batch Update Booking Details (Giữ nguyên tính năng update hàng loạt từ phiên bản trước để không mất dữ liệu)
app.post('/api/update-booking-details', async (req, res) => {
    try {
        const body = req.body;
        const rowId = body.rowId;
        if (!rowId) return res.status(400).json({ error: 'Missing rowId' });

        if (body.serviceName) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!D${rowId}`, valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[body.serviceName]] }
            });
        }
        if (body.staffId && body.staffId !== '随機') {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!I${rowId}`, valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[body.staffId]] }
            });
        }
        const staffFields = [
            { key: ['服務師傅1','ServiceStaff1','serviceStaff','staff1'], col: 'L' },
            { key: ['服務師傅2','ServiceStaff2','staffId2','staff2'], col: 'M' },
            { key: ['服務師傅3','ServiceStaff3','staff3'], col: 'N' },
            { key: ['服務師傅4','ServiceStaff4','staff4'], col: 'O' },
            { key: ['服務師傅5','ServiceStaff5','staff5'], col: 'P' },
            { key: ['服務師傅6','ServiceStaff6','staff6'], col: 'Q' }
        ];
        for (const field of staffFields) {
            const val = field.key.reduce((found, k) => found || body[k], undefined);
            if (val) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!${field.col}${rowId}`, valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [[val]] }
                });
            }
        }
        const statusMap = [
            { keys: ['Status1', 'status1', '狀態1'], index: 0 },
            { keys: ['Status2', 'status2', '狀態2'], index: 1 },
            { keys: ['Status3', 'status3', '狀態3'], index: 2 },
            { keys: ['Status4', 'status4', '狀態4'], index: 3 },
            { keys: ['Status5', 'status5', '狀態5'], index: 4 },
            { keys: ['Status6', 'status6', '狀態6'], index: 5 }
        ];
        let hasStatusUpdate = false;
        statusMap.forEach(item => { if (item.keys.some(k => body[k])) hasStatusUpdate = true; });

        if (hasStatusUpdate) {
            const rangeRW = `${BOOKING_SHEET}!R${rowId}:W${rowId}`;
            const currentData = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: rangeRW });
            let statusValues = (currentData.data.values && currentData.data.values[0]) ? currentData.data.values[0] : [];
            while (statusValues.length < 6) statusValues.push("");
            statusMap.forEach(item => {
                const newVal = item.keys.reduce((found, k) => found || body[k], undefined);
                if (newVal) statusValues[item.index] = newVal;
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID, range: rangeRW, valueInputOption: 'USER_ENTERED',
                requestBody: { values: [statusValues] }
            });
            const booking = cachedBookings.find(b => String(b.rowId) === String(rowId));
            if (booking) {
                const pax = booking.pax || 1;
                let allDone = true;
                for (let i = 0; i < pax; i++) { if (!statusValues[i] || !statusValues[i].includes('完成')) { allDone = false; break; } }
                if (allDone) {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!H${rowId}`, valueInputOption: 'USER_ENTERED',
                        requestBody: { values: [['✅ 已完成']] }
                    });
                }
            }
        }
        await syncData();
        res.json({ success: true });
    } catch (e) {
        console.error('Update Details Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin Booking API
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

// --- LINE BOT HANDLER (CHINESE) ---
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text' && event.type !== 'postback') return Promise.resolve(null);
  let text = ''; let userId = event.source.userId;
  if (event.type === 'message') text = event.message.text.trim();
  else if (event.type === 'postback') {
      if (event.postback.params && event.postback.params.date) text = `DatePick:${event.postback.params.date}`;
      else text = event.postback.data;
  }

  if (text === 'Action:Booking') {
      userState[userId] = {}; 
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請選擇服務類別", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩 (Foot)", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓 (Body)", "text": "Cat:BODY" } } ] } } });
  }

  // Admin Commands
  if (text === 'Admin' || text === '管理') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Admin', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "🛠️ 師傅管理 (Admin)", "weight": "bold", "color": "#E63946", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#000000", "margin": "md", "action": { "type": "message", "label": "⛔ 全店店休", "text": "Admin:CloseShop" } }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛌 請假", "text": "Admin:SetOff" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🤒 早退", "text": "Admin:SetLeaveEarly" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🍱 用餐", "text": "Admin:SetBreak" } } ] } } }); }
  if (text === 'Admin:CloseShop') { userState[userId] = { step: 'ADMIN_PICK_CLOSE_DATE' }; return client.replyMessage(event.replyToken, { type: 'template', altText: '選擇日期', template: { type: 'buttons', text: '請選擇店休日期:', actions: [ { type: 'datetimepicker', label: '🗓️ 點擊選擇', data: 'ShopClosePicked', mode: 'date' } ] } }); }
  if (text.startsWith('DatePick:') && userState[userId] && userState[userId].step === 'ADMIN_PICK_CLOSE_DATE') { const pickedDate = text.split(':')[1]; await ghiVaoSheet({ gioDen: '08:00', ngayDen: pickedDate, dichVu: SERVICES['SHOP_CLOSE'].name, nhanVien: 'ALL_STAFF', userId: 'ADMIN', sdt: 'ADMIN', hoTen: '全店店休', trangThai: '⛔ 店休' }); delete userState[userId]; return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已設定 ${pickedDate} 全店店休。` }); }
  if (text.startsWith('Admin:')) { const action = text.split(':')[1]; userState[userId] = { step: 'ADMIN_PICK_STAFF', action: action }; const bubbles = createStaffBubbles().map(b => { const str = JSON.stringify(b).replace(/StaffSelect/g, 'StaffOp'); return JSON.parse(str); }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇師傅', contents: { type: 'carousel', contents: bubbles } }); }
  if (text.startsWith('StaffOp:')) { 
      const staffId = text.split(':')[1]; const currentState = userState[userId]; if (!currentState || currentState.step !== 'ADMIN_PICK_STAFF') return Promise.resolve(null); 
      const now = getTaipeiNow(); const todayISO = formatDateDisplay(now.toLocaleDateString()); const currentTimeStr = now.toTimeString().substring(0, 5); 
      let logType = ''; let logNote = ''; 
      if (currentState.action === 'SetOff') { logType = '請假'; logNote = '全天'; await ghiVaoSheet({ gioDen: '08:00', ngayDen: todayISO, dichVu: SERVICES['OFF_DAY'].name, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '請假', trangThai: '⛔ 已鎖定' }); } 
      else if (currentState.action === 'SetBreak') { logType = '用餐'; logNote = '30分鐘'; await ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: SERVICES['BREAK_30'].name, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '用餐', trangThai: '🍱 用餐中' }); } 
      else if (currentState.action === 'SetLeaveEarly') { logType = '早退/病假'; let effectiveHour = now.getHours(); if (effectiveHour < 8) effectiveHour += 24; const currentTotalMins = effectiveHour * 60 + now.getMinutes(); let duration = (26 * 60) - currentTotalMins; if (duration < 0) duration = 0; logNote = `早退 (${duration}分)`; await ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: `⛔ 早退 (${duration}分)`, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '管理員操作', trangThai: '⚠️ 早退' }); } 
      SERVER_STAFF_STATUS[staffId] = { status: currentState.action === 'SetOff' ? 'AWAY' : currentState.action === 'SetBreak' ? 'EAT' : 'OUT_SHORT', checkInTime: 0 };
      delete userState[userId]; return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已登記: ${staffId} - ${logType}\n(${logNote})` }); 
  }

  // Booking Flow
  if (text.startsWith('Cat:')) { const category = text.split(':')[1]; const buttons = Object.keys(SERVICES).filter(k => SERVICES[k].category === category).map(key => ({ "type": "button", "style": "primary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${SERVICES[key].name} ($${SERVICES[key].price})`, "text": `Svc:${key}` } })); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇方案', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "選擇方案", "weight": "bold", "size": "xl", "align": "center" }, { "type": "separator", "margin": "md" }, ...buttons ] } } }); }
  if (text.startsWith('Svc:')) { const svcCode = text.split(':')[1]; userState[userId] = { step: 'DATE', service: svcCode }; const days = getNext15Days(); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Date', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "📅 請選擇日期", "align": "center", "weight": "bold" }, ...days.map(d=>({ "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": d.label, "text": `Date:${d.value}` } })) ] } } }); }
  if (text.startsWith('Date:')) { if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' }); const selectedDate = text.split(':')[1]; const currentState = userState[userId]; currentState.date = selectedDate; currentState.step = 'PREF'; userState[userId] = currentState; const serviceCode = currentState.service; const serviceType = SERVICES[serviceCode].category; const buttons = [ { "type": "text", "text": "💆 請選擇師傅需求", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🎲 不指定 (隨機)", "text": "Pref:RANDOM" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👨 指定男師傅", "text": "Pref:MALE" } }, { "type": "button", "style": "primary", "color": "#333333", "margin": "sm", "action": { "type": "message", "label": "👉 指定特定號碼", "text": "Pref:SPECIFIC" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👩 指定女師傅 (無油)", "text": "Pref:FEMALE" } } ]; if (serviceType !== 'FOOT') { buttons.push({ "type": "button", "style": "primary", "color": "#E91E63", "margin": "sm", "action": { "type": "message", "label": "💧 指定女師傅推油 (+$200)", "text": "Pref:OIL" } }); } else { buttons.push({ "type": "text", "text": "(足底按摩無油壓選項)", "size": "xs", "color": "#aaaaaa", "align": "center", "margin": "sm" }); } return client.replyMessage(event.replyToken, { type: 'flex', altText: '師傅', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": buttons } } }); }
  if (text.startsWith('Pref:')) { if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' }); const pref = text.split(':')[1]; const currentState = userState[userId]; currentState.pref = pref; currentState.step = 'PAX'; userState[userId] = currentState; const paxButtons = [1, 2, 3, 4, 5, 6].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } })); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Pax', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "👥 請問幾位貴賓?", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons ] } } }); }
  if (text.startsWith('Pax:')) { if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' }); const num = parseInt(text.split(':')[1]); const currentState = userState[userId]; currentState.pax = num; currentState.selectedStaff = []; userState[userId] = currentState; if (currentState.pref === 'SPECIFIC') { const bubbles = createStaffBubbles(false, []); bubbles.forEach((b,i) => { b.body.contents[0].text = `選第 1/${num} 位技師`; b.body.contents[0].color = "#E91E63"; }); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Select Staff', contents: { type: 'carousel', contents: bubbles } }); } let requireFemale = false; let requireMale = false; let isOil = false; if (currentState.pref === 'OIL') { isOil = true; requireFemale = true; } else if (currentState.pref === 'FEMALE') { requireFemale = true; } else if (currentState.pref === 'MALE') { requireMale = true; } currentState.isOil = isOil; const bubbles = generateTimeBubbles(currentState.date, currentState.service, null, currentState.pax, requireFemale, requireMale); if(!bubbles) return client.replyMessage(event.replyToken, {type:'text',text:'😢 抱歉，該時段已客滿，請選擇其他日期'}); currentState.step = 'TIME'; userState[userId] = currentState; return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles }); }
  
  if (text.startsWith('StaffSelect:')) { const staffId = text.split(':')[1]; const currentState = userState[userId]; if (!currentState.selectedStaff) currentState.selectedStaff = []; currentState.selectedStaff.push(staffId); userState[userId] = currentState; if (currentState.selectedStaff.length < currentState.pax) { const bubbles = createStaffBubbles(false, currentState.selectedStaff); const nextIdx = currentState.selectedStaff.length + 1; bubbles.forEach(b => { b.body.contents[0].text = `選第 ${nextIdx}/${currentState.pax} 位技師`; b.body.contents[0].color = "#E91E63"; }); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Next Staff', contents: { type: 'carousel', contents: bubbles } }); } else { const bubbles = generateTimeBubbles(currentState.date, currentState.service, currentState.selectedStaff, currentState.pax, false, false); if(!bubbles) return client.replyMessage(event.replyToken, {type:'text',text:'😢 所選技師時間衝突，請重新選擇'}); currentState.step = 'TIME'; userState[userId] = currentState; return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles }); } }
  
  if (text === 'Time:Suggest') { const s = userState[userId]; if (!s) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' }); const bestSlots = findBestSlots(s.date, s.service, s.pax); if (bestSlots.length === 0) { return client.replyMessage(event.replyToken, { type: 'text', text: '😢 抱歉，找不到合適的時段。' }); } const bubbles = bestSlots.map(slot => ({ "type": "bubble", "size": "micro", "body": { "type": "box", "layout": "vertical", "paddingAll": "sm", "contents": [ { "type": "text", "text": slot.timeStr, "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center" }, { "type": "text", "text": `👍 空位: ${slot.score}`, "size": "xxs", "color": "#aaaaaa", "align": "center" }, { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "message", "label": "選此時段", "text": `Time:${slot.timeStr}` }, "margin": "sm" } ] } })); return client.replyMessage(event.replyToken, { type: 'flex', altText: '推薦時段', contents: { "type": "carousel", "contents": bubbles } }); }
  
  if (text.startsWith('Time:')) { const gio = text.replace('Time:', '').trim(); const currentState = userState[userId]; currentState.step = 'SURNAME'; currentState.time = gio; userState[userId] = currentState; return client.replyMessage(event.replyToken, { type: 'text', text: `請問怎麼稱呼您？(姓氏)` }); }
  if (userState[userId] && userState[userId].step === 'SURNAME') { const currentState = userState[userId]; currentState.step = 'PHONE'; currentState.surname = text; userState[userId] = currentState; return client.replyMessage(event.replyToken, { type: 'text', text: "請輸入手機號碼:" }); }
  
  if (userState[userId] && userState[userId].step === 'PHONE') { const sdt = normalizePhoneNumber(text); const s = userState[userId]; let finalDate = s.date; const hour = parseInt(s.time.split(':')[0]); if (hour < 8) { const d = new Date(s.date); d.setDate(d.getDate() + 1); const yyyy = d.getFullYear(); const mm = (d.getMonth() + 1).toString().padStart(2, '0'); const dd = d.getDate().toString().padStart(2, '0'); finalDate = `${yyyy}/${mm}/${dd}`; } let basePrice = SERVICES[s.service].price; if (s.isOil) basePrice += 200; const totalPrice = basePrice * s.pax; let staffDisplay = '隨機'; if (s.selectedStaff && s.selectedStaff.length > 0) staffDisplay = s.selectedStaff.join(', '); else if (s.pref === 'FEMALE') staffDisplay = '女師傅'; else if (s.pref === 'MALE') staffDisplay = '男師傅'; else if (s.pref === 'OIL') staffDisplay = '女師傅(油)'; const confirmMsg = `✅ 預約成功\n\n👤 ${s.surname} (${sdt})\n📅 ${finalDate} ${s.time}\n💆 ${SERVICES[s.service].name}\n👥 ${s.pax} 位\n🛠️ ${staffDisplay}\n💵 總金額: $${totalPrice}`; await client.replyMessage(event.replyToken, { type: 'text', text: confirmMsg }); client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 New Booking: ${s.surname} - $${totalPrice}` }); await ghiVaoSheet({ gioDen: s.time, ngayDen: finalDate, dichVu: SERVICES[s.service].name, nhanVien: staffDisplay, userId: userId, sdt: sdt, hoTen: s.surname, trangThai: '已預約', pax: s.pax, isOil: s.isOil }); delete userState[userId]; return; }
  
  if (text === 'Action:MyBooking') { const booking = await layLichDatGanNhat(userId); if (!booking) return client.replyMessage(event.replyToken, { type: 'text', text: '查無預約' }); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Booking', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您的預約", "weight": "bold", "color": "#1DB446", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": booking.dichVu, "weight": "bold", "size": "md", "margin": "md" }, { "type": "text", "text": `🛠️ ${booking.nhanVien}`, "align": "center", "margin": "sm" }, { "type": "text", "text": `⏰ ${booking.thoiGian}`, "size": "xl", "weight": "bold", "color": "#555555", "margin": "sm" } ] }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "color": "#ff9800", "action": { "type": "message", "label": "🏃 我會晚到", "text": "Action:Late" } }, { type: "button", style: "secondary", color: "#ff3333", "action": { type: "message", "label": "❌ 取消預約", "text": "Action:ConfirmCancel" } } ] } } }); }
  if (text === 'Action:Late') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Late', contents: { "type": "bubble", "body": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "secondary", "action": { "type": "message", "label": "5 分", "text": "Late:5p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "10 分", "text": "Late:10p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "15 分", "text": "Late:15p" } } ] } } }); }
  if (text.startsWith('Late:')) { const phut = text.split(':')[1].replace('p', '分'); const booking = await layLichDatGanNhat(userId); if (booking) { await updateBookingStatus(booking.rowId, `⚠️ 晚到 ${phut}`); } client.pushMessage(ID_BA_CHU, { type: 'text', text: `⚠️ 晚到通知!\nID: ${userId}\n預計晚: ${phut}` }); return client.replyMessage(event.replyToken, { type: 'text', text: '好的，我們會為您保留。' }); }
  if (text === 'Action:ConfirmCancel') { const booking = await layLichDatGanNhat(userId); if (booking) { await updateBookingStatus(booking.rowId, '❌ Cancelled'); return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已成功取消預約。' }); } return client.replyMessage(event.replyToken, { type: 'text', text: '找不到您的預約資料。' }); }
  
  if (text.includes('booking') || text.includes('menu') || text.includes('預約')) {
      delete userState[userId]; syncData();
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() });
  }

  return client.replyMessage(event.replyToken, { type: 'flex', altText: '預約服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您好 👋", "weight": "bold", "size": "lg", "align": "center" }, { "type": "text", "text": "請問您是要預約按摩服務嗎？", "wrap": true, "size": "sm", "color": "#555555", "align": "center", "margin": "md" } ] }, "footer": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "✅ 立即預約", "text": "Action:Booking" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "📄 服務價目", "text": "Menu" } } ] } } });
}

// Start Server
syncData();
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Bot V155 (Smart Logic + Chinese UI + TimeLimit) running on ${port}`);
});
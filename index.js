/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT (BACKEND SERVER - MAIN ENTRY)
 * VERSION: V7.3 (MANUAL REFRESH SUPPORT & ROBUST LOGGING)
 * AUTHOR: AI ASSISTANT & USER
 * DATE: 2026/01/14
 * * * * * * * * * * * CHANGE LOG V7.3:
 * 1. [API UPGRADE]: 
 * - Nâng cấp API `/api/info` để xử lý tham số `forceRefresh=true`.
 * - Tinh chỉnh thời gian Debounce xuống 10s để nút "Làm mới" nhạy hơn.
 * 2. [SAFETY]:
 * - Thêm Try-Catch bao quanh API Info để tránh crash khi đồng bộ lỗi.
 * 3. [PRESERVATION]:
 * - Giữ nguyên toàn bộ logic V99 Matrix (Phase 1, Phase 2, Manual Lock).
 * - Giữ nguyên logic Line Bot Booking.
 * =================================================================================================
 */

require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

// IMPORT CORE LOGIC
// File này chứa "bộ não" tính toán xếp chỗ (V99 Logic resides here)
// Đảm bảo file resource_core.js nằm cùng thư mục
const ResourceCore = require('./resource_core'); 

// --- 1. CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION) ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const ID_BA_CHU = process.env.ID_BA_CHU;
const SHEET_ID = process.env.SHEET_ID;

// Tên các Sheet (Tab) trong Google Spreadsheet
const BOOKING_SHEET = 'Sheet1';
const STAFF_SHEET = 'StaffLog';
const SCHEDULE_SHEET = 'StaffSchedule';
const SALARY_SHEET = 'SalaryLog';
const MENU_SHEET = 'menu'; 

// Lấy config giới hạn tài nguyên từ Core
// Nếu Core chưa load kịp, dùng giá trị mặc định an toàn là 6
const MAX_CHAIRS = ResourceCore.CONFIG ? ResourceCore.CONFIG.MAX_CHAIRS : 6;
const MAX_BEDS = ResourceCore.CONFIG ? ResourceCore.CONFIG.MAX_BEDS : 6;

// Khởi tạo Google Sheets API Client
// Sử dụng key file JSON để xác thực service account
const auth = new google.auth.GoogleAuth({
    keyFile: 'google-key.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- 2. GLOBAL STATE (TRẠNG THÁI SERVER TRÊN RAM) ---
// Biến lưu trữ dữ liệu tạm thời để phục vụ nhanh, giảm tải đọc Sheet liên tục
let SERVER_RESOURCE_STATE = {}; // Trạng thái ghế/giường realtime (từ Frontend gửi lên)
let SERVER_STAFF_STATUS = {};   // Trạng thái nhân viên (Ready, Busy, Away...)
let STAFF_LIST = [];            // Danh sách nhân viên và lịch làm việc
let cachedBookings = [];        // Dữ liệu Booking đã được xử lý kèm thông tin Matrix Allocation
let scheduleMap = {};           // Bản đồ lịch nghỉ nhân viên
let userState = {};             // Lưu trạng thái hội thoại của người dùng Line (Context)
let lastSyncTime = new Date(0); // Thời điểm đồng bộ dữ liệu gần nhất
let isSystemHealthy = false;    // Cờ báo hiệu hệ thống có đang hoạt động tốt không
let isSyncing = false;          // Mutex Lock: Ngăn chặn đồng bộ chồng chéo (Race Condition)
let SERVICES = ResourceCore.SERVICES || {}; 
let LAST_CALCULATED_MATRIX = null; // Snapshot kết quả tính toán Matrix cuối cùng để debug

// =============================================================================
// PHẦN 3: CÁC HÀM TIỆN ÍCH (UTILITIES)
// =============================================================================

/**
 * Lấy đối tượng Date hiện tại theo múi giờ Đài Loan (UTC+8)
 * Quan trọng để tính toán giờ Booking chính xác
 */
function getTaipeiNow() {
    return ResourceCore.getTaipeiNow ? ResourceCore.getTaipeiNow() : new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
}

/**
 * Chuẩn hóa số điện thoại (chỉ giữ lại số)
 */
function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

/**
 * Hàm chuẩn hóa ngày tháng từ Google Sheet về định dạng YYYY/MM/DD
 * Xử lý được cả dạng ISO string và dạng chuỗi thông thường.
 */
function normalizeSheetDate(rawDateStr) {
    if (!rawDateStr) return null;
    try {
        const str = rawDateStr.toString().trim();
        
        // Trường hợp 1: Dạng chuỗi ISO có múi giờ (VD: 2026-01-13T00:00:00.000Z)
        if (str.includes('T') && (str.endsWith('Z') || str.includes('+'))) {
            const d = new Date(str);
            const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
            const taipeiTime = new Date(utc + (3600000 * 8));
            return formatDateString(taipeiTime); 
        }

        // Trường hợp 2: Dạng chuỗi thuần (VD: 2026-01-13 hoặc 2026/01/13)
        const cleanStr = str.replace(/-/g, '/');
        const parts = cleanStr.split('/');
        
        if (parts.length === 3) {
            let y = parseInt(parts[0]);
            let m = parseInt(parts[1]);
            let d = parseInt(parts[2]);
            if (y < 100) y += 2000; // Xử lý năm 2 số
            const mm = m.toString().padStart(2, '0');
            const dd = d.toString().padStart(2, '0');
            return `${y}/${mm}/${dd}`;
        }
        return null;
    } catch (e) { 
        console.error(`[DATE PARSE ERROR] Input: ${rawDateStr}`, e);
        return null; 
    }
}

/**
 * Format Date Object sang chuỗi YYYY/MM/DD
 */
function formatDateString(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

/**
 * Format Date Object sang chuỗi YYYY/MM/DD HH:mm
 */
function formatDateTimeString(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const h = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
}

/**
 * Lấy danh sách 15 ngày tiếp theo cho Line Bot Menu
 */
function getNext15Days() {
    let days = [];
    const t = getTaipeiNow();
    t.setHours(0,0,0,0);

    for(let i=0; i<15; i++) {
        let d = new Date(t);
        d.setDate(t.getDate() + i);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const v = `${year}/${month}/${day}`;
        const w = d.toLocaleDateString('zh-TW', { weekday: 'short' });
        let l = `${d.getMonth()+1}/${d.getDate()} (${w})`;
        if(i===0) l="今天 (Today)";
        if(i===1) l="明天 (Tmr)";
        days.push({label: l, value: v});
    }
    return days.reverse(); 
}

/**
 * Format hiển thị ngày tháng
 */
function formatDateDisplay(dateInput) {
    if (!dateInput) return "";
    try {
        let str = dateInput.toString().trim();
        if (str.match(/^\d{4}[\/\-]\d{2}[\/\-]\d{2}/)) {
            return str.replace(/-/g, '/').split(' ')[0];
        }
        let d = new Date(str);
        if (isNaN(d.getTime())) return str;
        const tNow = getTaipeiNow();
        tNow.setTime(d.getTime()); 
        return formatDateString(tNow);
    } catch (e) { return dateInput; }
}

function getCurrentDateTimeStr() {
    return formatDateTimeString(getTaipeiNow());
}

/**
 * Chuyển đổi index số sang tên cột Excel (0 -> A, 1 -> B...)
 */
function getColumnLetter(colIndex) {
    let temp, letter = '';
    while (colIndex >= 0) {
        temp = (colIndex) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        colIndex = (colIndex - temp - 1) / 26;
    }
    return letter;
}

// =============================================================================
// PHẦN 4: ĐỒNG BỘ DỮ LIỆU (CORE SYNC LOGIC)
// =============================================================================

/**
 * Đồng bộ Menu & Cấu hình Elastic Time từ Sheet 'menu'
 */
async function syncMenuData() {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${MENU_SHEET}!A2:F50` });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return;

        let newServices = {};
        rows.forEach(row => {
            const code = row[0] ? row[0].trim() : null; 
            const name = row[1] ? row[1].trim() : '';
            const priceStr = row[3] ? row[3].trim() : '0';
            if (!code || !name) return;

            let duration = 60;
            const timeMatch = name.match(/(\d+)分/);
            if (timeMatch) duration = parseInt(timeMatch[1]);
            const price = parseInt(priceStr.replace(/\D/g, '')) || 0;

            let elasticStep = 0;
            let elasticLimit = 0;

            // Đọc cấu hình Elastic (Bóp thời gian)
            if (row[4]) {
                const parsedStep = parseInt(row[4].toString().replace(/\D/g, '')); 
                if (!isNaN(parsedStep)) elasticStep = parsedStep;
            }
            if (row[5]) {
                const parsedLimit = parseInt(row[5].toString().replace(/\D/g, ''));
                if (!isNaN(parsedLimit)) elasticLimit = parsedLimit;
            }

            let type = 'BED'; let category = 'BODY';
            const prefix = code.charAt(0).toUpperCase();
            if (prefix === 'A') { type = 'BED'; category = 'COMBO'; } 
            else if (prefix === 'F') { type = 'CHAIR'; category = 'FOOT'; } 
            else if (prefix === 'B') { type = 'BED'; category = 'BODY'; }

            newServices[code] = { 
                name: name, 
                duration: duration, 
                type: type, 
                category: category, 
                price: price,
                elasticStep: elasticStep,
                elasticLimit: elasticLimit
            };
        });
        
        ResourceCore.setDynamicServices(newServices);
        SERVICES = ResourceCore.SERVICES; 
        console.log(`[MENU] Updated: ${Object.keys(SERVICES).length} items. Elastic Config loaded.`);
    } catch (e) { console.error('[MENU ERROR]', e); }
}

/**
 * Đồng bộ lương (Salary Log)
 */
async function syncDailySalary(dateStr, staffDataList) {
    try {
        const range = `${SALARY_SHEET}!A1:AZ100`; 
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: range });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return;
        const headerRow = rows[0]; 
        const updates = [];
        staffDataList.forEach(staff => {
            const staffName = staff.name.trim();
            const colIndex = headerRow.findIndex(cell => cell && cell.trim() === staffName);
            if (colIndex !== -1) {
                let targetRow = -1;
                for (let r = 2; r < rows.length; r++) {
                    if (rows[r][colIndex] && rows[r][colIndex].trim() === dateStr) { targetRow = r + 1; break; }
                }
                if (targetRow !== -1) {
                    const colSessions = getColumnLetter(colIndex + 1);
                    const colOil = getColumnLetter(colIndex + 2);
                    const colSalary = getColumnLetter(colIndex + 3);
                    updates.push({ range: `${SALARY_SHEET}!${colSessions}${targetRow}`, values: [[staff.sessions]] });
                    updates.push({ range: `${SALARY_SHEET}!${colOil}${targetRow}`, values: [[staff.oil]] });
                    updates.push({ range: `${SALARY_SHEET}!${colSalary}${targetRow}`, values: [[staff.salary]] });
                }
            }
        });
        if (updates.length > 0) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } });
    } catch (e) { console.error('[SALARY ERROR]', e); }
}

/**
 * HÀM TRUNG TÂM: ĐỒNG BỘ DỮ LIỆU BOOKING & SCHEDULE
 * V7.2 Update: Đọc đầy đủ cột X, Y, Z để phục vụ Matrix Logic
 */
async function syncData() {
    if (isSyncing) {
        console.log("⚠️ Skip sync: Sync process locked (Busy).");
        return;
    }

    try {
        isSyncing = true; // Lock

        // --- BƯỚC 1: ĐỌC DỮ LIỆU BOOKING (CỘT A -> Z) ---
        // Range mở rộng đến cột Z để lấy dữ liệu Phase1/Phase2
        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:Z` });
        const rowsBooking = resBooking.data.values;
        let tempBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue;
                const status = row[7] || '已預約';
                if (status.includes('取消') || status.includes('Cancelled')) continue;

                const serviceStr = row[3] || '';
                let duration = 60; let type = 'BED'; let category = 'BODY'; let price = 0;
                let foundService = false;
                
                // Map Service Definition
                for (const key in SERVICES) {
                    if (serviceStr.includes(SERVICES[key].name.split('(')[0])) {
                        duration = SERVICES[key].duration; type = SERVICES[key].type; category = SERVICES[key].category; price = SERVICES[key].price; 
                        foundService = true; break;
                    }
                }
                
                if (!foundService) {
                    // Fallback detection
                    if (serviceStr.includes('套餐')) { category = 'COMBO'; duration = 100; }
                    else if (serviceStr.includes('足')) { type = 'CHAIR'; category = 'FOOT'; }
                }
                if (row[4] === "Yes") price += 200;
                let pax = 1; if (row[5]) pax = parseInt(row[5]);
                let serviceCode = 'UNKNOWN';
                for(const key in SERVICES) { if(SERVICES[key].name === serviceStr) { serviceCode = key; break; } }

                // [MATRIX DATA FIELDS - QUAN TRỌNG CHO V99]
                // Đọc dữ liệu từ cột X, Y, Z để biết thời lượng các phase của Combo
                const rawPhase1 = row[23]; // Col X
                const phase1Duration = rawPhase1 ? parseInt(rawPhase1) : null;
                const rawLocked = row[24]; // Col Y
                const isManualLocked = (rawLocked && (rawLocked.toUpperCase() === 'TRUE' || rawLocked === 'TRUE'));
                const rawPhase2 = row[25]; // Col Z
                const phase2Duration = rawPhase2 ? parseInt(rawPhase2) : null;

                tempBookings.push({
                    rowId: i + 1, 
                    startTimeString: `${row[0]} ${row[1]}`, 
                    startTime: row[1], 
                    duration: duration, 
                    type: type, 
                    category: category, 
                    price: price,
                    staffId: row[8] || '隨機', 
                    staffName: row[8], 
                    serviceStaff: row[11], 
                    pax: pax, 
                    customerName: `${row[2]} (${row[6]})`,
                    serviceName: serviceStr, 
                    serviceCode: serviceCode, 
                    phone: row[6], 
                    date: row[0], 
                    status: status, 
                    lineId: row[9], 
                    isOil: row[4] === "Yes",
                    // New Fields for Matrix Optimization V99
                    phase1_duration: phase1Duration,
                    isManualLocked: isManualLocked,
                    phase2_duration: phase2Duration,
                    // Field này sẽ được ResourceCore điền vào sau
                    allocated_resource: null 
                });
            }
        }

        // --- BƯỚC 2: ĐỌC LỊCH LÀM VIỆC (SCHEDULE) ---
        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:BG100` });
        const rows = resSchedule.data.values;
        
        let tempStaffList = []; 
        let tempScheduleMap = {}; 

        if (rows && rows.length > 1) {
            const headerRow = rows[0]; 
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const staffName = row[0]; if (!staffName) continue;
                const cleanName = staffName.trim();
                const gender = (row[1] && (row[1] === '女' || row[1] === 'F')) ? 'F' : 'M';
                
                let startTime = row[2] ? row[2].trim().replace(/：/g, ':') : '12:00';
                let endTime = row[3] ? row[3].trim().replace(/：/g, ':') : '03:00';
                const onTimeVal = row[4] ? row[4].toString().trim().toUpperCase() : '';
                const isStrictTime = (onTimeVal === 'TRUE' || onTimeVal === 'YES' || onTimeVal === 'X');

                const staffObj = { 
                    id: cleanName, 
                    name: cleanName, 
                    gender: gender, 
                    start: startTime, 
                    end: endTime,   
                    shiftStart: startTime, 
                    shiftEnd: endTime,
                    isStrictTime: isStrictTime, 
                    sheetRowIndex: i + 1,       
                    off: false, 
                    offDays: [] 
                };
                
                const todayStr = formatDateDisplay(getTaipeiNow());
                
                // Parse Off Days
                for (let j = 5; j < headerRow.length; j++) {
                    if (headerRow[j]) {
                        const normalizedDate = normalizeSheetDate(headerRow[j]); 
                        
                        if (normalizedDate) {
                            if (row[j] && row[j].trim().toUpperCase() === 'OFF') {
                                if (!tempScheduleMap[normalizedDate]) tempScheduleMap[normalizedDate] = [];
                                tempScheduleMap[normalizedDate].push(cleanName);
                                staffObj.offDays.push(normalizedDate);
                                if (normalizedDate === todayStr) {
                                    staffObj.off = true;
                                }
                            }
                        }
                    }
                }
                tempStaffList.push(staffObj);
            }
        }
        
        if (tempStaffList.length === 0) {
            console.error("⛔ CRITICAL: Không đọc được StaffSchedule! Chuyển sang chế độ bảo trì.");
            isSystemHealthy = false;
            STAFF_LIST = []; 
        } else {
            STAFF_LIST = tempStaffList;
            scheduleMap = tempScheduleMap;
            isSystemHealthy = true;
        }

        // --- BƯỚC 3: TÍNH TOÁN RESOURCE MATRIX (V99 LOGIC) ---
        // Phần này gọi Core để tính toán việc phân bổ tài nguyên (ghế/giường)
        if (isSystemHealthy && tempBookings.length > 0) {
            try {
                // Kiểm tra sự tồn tại của Core Function
                if (typeof ResourceCore.generateResourceMatrix === 'function') {
                    // Core V8.0/V99 sẽ xử lý logic Interleaving tại đây dựa trên phase1/2 duration
                    const matrixAllocation = ResourceCore.generateResourceMatrix(tempBookings, STAFF_LIST);
                    
                    // Merge kết quả phân bổ vào cachedBookings để Frontend hiển thị
                    tempBookings.forEach(booking => {
                        if (matrixAllocation[booking.rowId]) {
                            booking.allocated_resource = matrixAllocation[booking.rowId];
                        }
                    });
                    
                    LAST_CALCULATED_MATRIX = matrixAllocation;
                    // console.log(`[MATRIX] Updated allocation for ${Object.keys(matrixAllocation).length} bookings.`);
                } else {
                    console.warn("[MATRIX] ResourceCore.generateResourceMatrix missing! Skipping.");
                }
            } catch (err) {
                console.error("[MATRIX ERROR] Calculation failed:", err);
            }
        }

        cachedBookings = tempBookings;
        lastSyncTime = new Date();
        console.log(`[SYNC SUCCESS] Bookings: ${cachedBookings.length}, Staff: ${STAFF_LIST.length}, Time: ${formatDateTimeString(lastSyncTime)}`);

    } catch (e) { 
        console.error('[SYNC FATAL ERROR]', e);
        isSystemHealthy = false; 
        STAFF_LIST = []; 
    } finally {
        isSyncing = false; // Unlock process
    }
}

// =============================================================================
// PHẦN 5: LOGIC LINE BOT BOOKING HELPERS
// =============================================================================

function findBestSlots(selectedDate, serviceCode, pax = 1, requireFemale = false, requireMale = false) {
    if (!isSystemHealthy || STAFF_LIST.length === 0) return [];
    
    const nowTaipei = getTaipeiNow();
    const todayStr = formatDateString(nowTaipei);
    const isToday = (selectedDate === todayStr);
    const currentFloatTime = nowTaipei.getHours() + (nowTaipei.getMinutes() / 60);

    const staffListMap = {};
    STAFF_LIST.forEach(s => {
        const isOffToday = s.offDays && s.offDays.includes(selectedDate);
        if (!isOffToday) {
            if (requireFemale && s.gender !== 'F') return;
            if (requireMale && s.gender !== 'M') return;
            staffListMap[s.id] = s;
        }
    });

    const relevantBookings = cachedBookings.filter(b => b.date === selectedDate && !b.status.includes('取消') && !b.status.includes('Cancel'));
    const guestList = []; for(let i=0; i<pax; i++) guestList.push({ serviceCode: serviceCode, staffName: 'RANDOM' });
    let candidates = [];
    
    // Quét từng khung giờ để tìm slot
    for (let h = 8; h <= 24; h += 1) { 
        if (isToday && h < currentFloatTime) {
            continue; 
        }

        const hourInt = Math.floor(h); const minuteInt = 0; let displayH = hourInt; if (displayH >= 24) displayH -= 24; 
        const timeStr = `${displayH.toString().padStart(2, '0')}:${minuteInt.toString().padStart(2, '0')}`;
        
        // Gọi Core để kiểm tra tính khả thi
        const result = ResourceCore.checkRequestAvailability(selectedDate, timeStr, guestList, relevantBookings, staffListMap);
        
        if (result.feasible) {
            candidates.push({ timeStr: timeStr, sortVal: h, score: 10, label: `${timeStr}` });
        }
    }
    candidates.sort((a, b) => a.sortVal - b.sortVal);
    return candidates.slice(0, 6); 
}

function generateTimeBubbles(selectedDate, serviceCode, specificStaffIds = null, pax = 1, requireFemale = false, requireMale = false) {
    if (!isSystemHealthy || STAFF_LIST.length === 0) return null;
    
    const nowTaipei = getTaipeiNow();
    const todayStr = formatDateString(nowTaipei);
    const isToday = (selectedDate === todayStr);
    const currentFloatTime = nowTaipei.getHours() + (nowTaipei.getMinutes() / 60);

    let validSlots = [];
    const staffListMap = {};
    STAFF_LIST.forEach(s => {
        if (!s.offDays.includes(selectedDate)) {
             if (!specificStaffIds || specificStaffIds.length === 0) {
                 if (requireFemale && s.gender !== 'F') return;
                 if (requireMale && s.gender !== 'M') return;
             }
             staffListMap[s.id] = s;
        }
    });
    
    const relevantBookings = cachedBookings.filter(b => b.date === selectedDate && !b.status.includes('取消') && !b.status.includes('Cancel'));
    const guestList = []; for(let i=0; i<pax; i++) { let sId = 'RANDOM'; if(specificStaffIds && specificStaffIds.length > i) sId = specificStaffIds[i]; guestList.push({ serviceCode: serviceCode, staffName: sId }); }
    
    for (let h = 8; h <= 24; h += 1) { 
        if (isToday && h < currentFloatTime) continue; 
        const hourInt = Math.floor(h); let displayH = hourInt >= 24 ? hourInt - 24 : hourInt;
        const timeStr = `${displayH.toString().padStart(2, '0')}:00`;
        
        const result = ResourceCore.checkRequestAvailability(selectedDate, timeStr, guestList, relevantBookings, staffListMap);
        if (result.feasible) validSlots.push(h);
    }
    
    if (validSlots.length === 0) return null;
    
    const formatTime = (h) => { const hourInt = Math.floor(h); if (hourInt < 24) return `${hourInt.toString().padStart(2, '0')}:00`; return `${(hourInt - 24).toString().padStart(2, '0')}:00 (凌晨)`; };
    const formatValue = (h) => { const hourInt = Math.floor(h); const displayH = hourInt < 24 ? hourInt : hourInt - 24; return `${displayH.toString().padStart(2, '0')}:00`; }
    const groups = [ { name: '🌞 早安 (Morning)', slots: validSlots.filter(h => h >= 8 && h < 12) }, { name: '☀️ 午後 (Afternoon)', slots: validSlots.filter(h => h >= 12 && h < 18) }, { name: '🌙 晚安 (Evening)', slots: validSlots.filter(h => h >= 18 && h < 24) }, { name: '✨ 深夜 (Late Night)', slots: validSlots.filter(h => h >= 24) } ];
    
    let bubbles = [];
    bubbles.push({ "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "backgroundColor": "#F0F9FF", "cornerRadius": "lg", "contents": [ { "type": "text", "text": "💎 SMART BOOKING", "weight": "bold", "color": "#0284C7", "align": "center", "size": "xs" }, { "type": "text", "text": "精選推薦時段", "weight": "bold", "size": "md", "align": "center", "margin": "xs" }, { "type": "button", "style": "primary", "color": "#0EA5E9", "margin": "md", "height": "sm", "action": { "type": "message", "label": "⭐ 查看 (View)", "text": "Time:Suggest" } } ] } });
    
    const timeBubbles = groups.filter(g => g.slots.length > 0).map(group => { const buttons = group.slots.map(h => { return { "type": "button", "style": "primary", "margin": "xs", "height": "sm", "action": { "type": "message", "label": formatTime(h), "text": `Time:${formatValue(h)}` } }; }); return { "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" }, { "type": "separator", "margin": "sm" }, ...buttons] } }; });
    return { type: 'carousel', contents: [...bubbles, ...timeBubbles] };
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
            const rowItems = chunk.slice(j, j + 3);
            const rowButtons = rowItems.map(s => ({ "type": "button", "style": "secondary", "color": (s.gender === 'F' || s.gender === '女') ? "#F48FB1" : "#90CAF9", "height": "sm", "margin": "xs", "flex": 1, "action": { "type": "message", "label": s.name, "text": `StaffSelect:${s.id}` } }));
            rows.push({ "type": "box", "layout": "horizontal", "spacing": "xs", "contents": rowButtons });
        }
        bubbles.push({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": filterFemale ? "選擇女技師" : "指定技師", "weight": "bold", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...rows ] } });
    }
    return bubbles;
}

function createMenuFlexMessage() {
    const createRow = (serviceName, time, price) => ({ "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": serviceName, "size": "sm", "color": "#555555", "flex": 5 }, { "type": "text", "text": `${time}分`, "size": "sm", "color": "#111111", "align": "end", "flex": 2 }, { "type": "text", "text": `$${price}`, "size": "sm", "color": "#E63946", "weight": "bold", "align": "end", "flex": 3 } ] });
    const comboRows = []; const footRows = []; const bodyRows = [];
    Object.values(SERVICES).forEach(svc => {
        if (svc.category === 'SYSTEM') return;
        const row = createRow(svc.name, svc.duration, svc.price);
        if (svc.category === 'COMBO') comboRows.push(row); else if (svc.category === 'FOOT') footRows.push(row); else bodyRows.push(row);
    });
    return { "type": "bubble", "size": "mega", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "📜 服務價目表 (Menu)", "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center", "margin": "md" }, { "type": "separator", "margin": "lg" }, { "type": "text", "text": "🔥 熱門套餐 (Combo)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...comboRows, { "type": "text", "text": "👣 足底按摩 (Foot)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...footRows, { "type": "text", "text": "🛏️ 身體指壓 (Body)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...bodyRows, { "type": "separator", "margin": "xl" }, { "type": "text", "text": "⭐ 油推需加收 $200，請詢問櫃台。", "size": "xs", "color": "#aaaaaa", "margin": "md", "align": "center" } ] }, "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "📅 立即預約 (Book Now)", "text": "Action:Booking" } } ] } };
}

// =============================================================================
// PHẦN 6: GHI SHEET & XỬ LÝ BOOKING (SHEET INTERACTION)
// =============================================================================

/**
 * GHI BOOKING MỚI VÀO GOOGLE SHEET (Hỗ trợ Matrix Cols X, Y, Z)
 * @param {Object} data - Thông tin booking
 * @param {Array} proposedUpdates - Danh sách các booking cũ cần bóp giờ (nếu có)
 */
async function ghiVaoSheet(data, proposedUpdates = []) {
    try {
        const timeCreate = getCurrentDateTimeStr();
        let colA_Date = formatDateDisplay(data.ngayDen);
        let colB_Time = data.gioDen || ""; if (colB_Time.includes(' ')) colB_Time = colB_Time.split(' ')[1]; if (colB_Time.length > 5) colB_Time = colB_Time.substring(0, 5);
        const colG_Phone = data.sdt; const colH_Status = data.trangThai || '已預約'; const colJ_LineID = data.userId; const colK_Created = timeCreate;
        
        // --- 1. CHUẨN BỊ DỮ LIỆU ĐỂ APPEND (DÒNG MỚI) ---
        const valuesToWrite = [];
        // Xử lý booking nhóm (Guest Details Array)
        if (data.guestDetails && Array.isArray(data.guestDetails) && data.guestDetails.length > 0) {
            data.guestDetails.forEach((guest, index) => {
                const guestNum = index + 1; const total = data.guestDetails.length;
                const colC_Name = `${data.hoTen || '現場客'} (${guestNum}/${total})`;
                let colD_Service = guest.service; if (guest.isOil) colD_Service += " (油推+$200)";
                const colE_Oil = guest.isOil ? "Yes" : ""; const colF_Pax = 1; const colI_Staff = guest.staff || '隨機';
                valuesToWrite.push([ colA_Date, colB_Time, colC_Name, colD_Service, colE_Oil, colF_Pax, colG_Phone, colH_Status, colI_Staff, colJ_LineID, colK_Created ]);
            });
        } else {
            // Xử lý booking đơn
            const colC_Name = data.hoTen || '現場客'; let colD_Service = data.dichVu; if (data.isOil) colD_Service += " (油推+$200)";
            const colE_Oil = data.isOil ? "Yes" : ""; const colF_Pax = data.pax || 1; const colI_Staff = data.nhanVien || '隨機';
            valuesToWrite.push([ colA_Date, colB_Time, colC_Name, colD_Service, colE_Oil, colF_Pax, colG_Phone, colH_Status, colI_Staff, colJ_LineID, colK_Created ]);
        }

        // --- 2. THỰC HIỆN APPEND ---
        let newRowStartIndex = -1;
        if (valuesToWrite.length > 0) {
            const appendRes = await sheets.spreadsheets.values.append({ 
                spreadsheetId: SHEET_ID, 
                range: 'Sheet1!A:A', 
                valueInputOption: 'USER_ENTERED', 
                requestBody: { values: valuesToWrite } 
            });
            
            // Tìm index dòng vừa tạo
            if (appendRes.data.updates && appendRes.data.updates.updatedRange) {
                // Range format: Sheet1!A100:K102
                const rangeStr = appendRes.data.updates.updatedRange;
                const match = rangeStr.match(/[A-Z]+(\d+):/);
                if (match) {
                    newRowStartIndex = parseInt(match[1]);
                }
            }
        }

        // --- 3. GHI DỮ LIỆU MATRIX (CỘT X, Y, Z) CHO BOOKING VỪA TẠO ---
        // V7.2: Đảm bảo dữ liệu này được ghi chính xác cho cả Booking Nhóm
        const matrixUpdates = [];
        if (newRowStartIndex !== -1) {
             const numberOfRows = valuesToWrite.length;
             for(let i = 0; i < numberOfRows; i++) {
                 const currentRow = newRowStartIndex + i;
                 
                 // Phase 1 (Col X)
                 if (data.phase1_duration !== undefined && data.phase1_duration !== null) {
                     matrixUpdates.push({ range: `${BOOKING_SHEET}!X${currentRow}`, values: [[data.phase1_duration]] });
                 }
                 
                 // Manual Lock (Col Y) - Mặc định là FALSE khi mới tạo, trừ khi có chỉ định
                 if (data.isManualLocked) {
                     matrixUpdates.push({ range: `${BOOKING_SHEET}!Y${currentRow}`, values: [['TRUE']] });
                 }
                 
                 // Phase 2 (Col Z)
                 if (data.phase2_duration !== undefined && data.phase2_duration !== null) {
                     matrixUpdates.push({ range: `${BOOKING_SHEET}!Z${currentRow}`, values: [[data.phase2_duration]] });
                 }
             }
        }

        // --- 4. XỬ LÝ PROPOSED UPDATES (BÓP GIỜ CÁC KHÁCH KHÁC) ---
        // Đây là tính năng Elastic Time V7.0
        if (proposedUpdates && proposedUpdates.length > 0) {
            console.log(`[OPTIMIZATION] Executing ${proposedUpdates.length} updates to existing bookings...`);
            proposedUpdates.forEach(update => {
                if (!update.rowId) return;
                if (update.phase1 !== undefined) matrixUpdates.push({ range: `${BOOKING_SHEET}!X${update.rowId}`, values: [[update.phase1]] });
                if (update.phase2 !== undefined) matrixUpdates.push({ range: `${BOOKING_SHEET}!Z${update.rowId}`, values: [[update.phase2]] });
            });
        }

        // --- 5. GỬI BATCH UPDATE (NẾU CÓ DỮ LIỆU MATRIX) ---
        if (matrixUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SHEET_ID,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: matrixUpdates
                }
            });
            console.log(`[SHEET WRITE] Updated Matrix Data (Cols X,Y,Z) for ${matrixUpdates.length} cells.`);
        }

        // --- 6. TRIGGER SYNC ---
        // Chờ 1s để Google Sheet index xong rồi mới đọc lại
        setTimeout(() => syncData(), 1000);

    } catch (e) { console.error('[ERROR] Sheet Write/Update:', e); }
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
        const rows = res.data.values; if (!rows || rows.length === 0) return null;
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

// =============================================================================
// PHẦN 7: EXPRESS SERVER & API & LINE BOT INTEGRATION
// =============================================================================

const client = new line.Client(config);
const app = express();
app.use(cors());

app.post('/callback', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent)).then((r) => res.json(r)).catch((e) => { console.error('[LINE WEBHOOK ERROR]', e); res.status(500).end(); });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin2', express.static(path.join(__dirname, 'XinWuChanAdmin')));

// --- API: INFO (GET STATUS & HANDLE MANUAL REFRESH) ---
app.get('/api/info', async (req, res) => { 
    try {
        // Debounce Logic & Force Refresh Handling
        const isForceRefresh = req.query.forceRefresh === 'true';
        const now = new Date();
        const timeSinceLastSync = now - lastSyncTime;
        
        // Thời gian chờ tối thiểu giữa các lần Manual Sync (10 giây để an toàn)
        // Nếu user bấm liên tục, chỉ lần đầu có tác dụng, các lần sau sẽ trả cache
        const MIN_SYNC_INTERVAL_MANUAL = 10000; 
        
        if (isForceRefresh) {
            // Log khi có yêu cầu Manual Refresh từ Frontend
            console.log(`[API INFO] Manual Refresh Requested. Time since last sync: ${timeSinceLastSync}ms`);

            if (isSyncing) {
                console.log("⚠️ Manual Sync SKIPPED: Sync process is already running/locked.");
            } else if (timeSinceLastSync > MIN_SYNC_INTERVAL_MANUAL) {
                console.log("⚡ MANUAL SYNC TRIGGERED: Fetching new data from Google Sheet...");
                await syncData(); // Gọi hàm đồng bộ ngay lập tức
            } else {
                console.log(`⚠️ Manual Sync THROTTLED: Too frequent (Wait ${Math.round((MIN_SYNC_INTERVAL_MANUAL - timeSinceLastSync)/1000)}s more). Returning cache.`);
            }
        }

        res.json({ 
            staffList: STAFF_LIST, 
            bookings: cachedBookings, // Bao gồm cả allocated_resource
            schedule: scheduleMap, 
            resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS }, 
            resourceState: SERVER_RESOURCE_STATE, 
            staffStatus: SERVER_STAFF_STATUS, 
            services: SERVICES,
            lastUpdated: lastSyncTime,
            isSystemHealthy: isSystemHealthy,
            matrixDebug: LAST_CALCULATED_MATRIX // Gửi snapshot debug về frontend
        }); 
    } catch (error) {
        console.error("[API INFO FATAL ERROR]", error);
        res.status(500).json({ error: "Internal Server Error during data fetch." });
    }
});

// --- API: SYNC STATE FROM FRONTEND ---
app.post('/api/sync-resource', (req, res) => { SERVER_RESOURCE_STATE = req.body; res.json({ success: true }); });
app.post('/api/sync-staff-status', (req, res) => { SERVER_STAFF_STATUS = req.body; res.json({ success: true }); });

// --- API: ADMIN CREATE BOOKING ---
// Hỗ trợ tạo booking với đầy đủ Phase Data
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
        isOil: data.isOil || false, 
        guestDetails: data.guestDetails,
        // Matrix Data từ Frontend V99
        phase1_duration: data.phase1_duration,
        phase2_duration: data.phase2_duration,
        isManualLocked: data.isManualLocked
    }); 
    res.json({ success: true }); 
});

app.post('/api/update-status', async (req, res) => { await updateBookingStatus(req.body.rowId, req.body.status); res.json({ success: true }); });
app.post('/api/save-salary', async (req, res) => { await syncDailySalary(req.body.date, req.body.staffData); res.json({ success: true }); });

// --- API: UPDATE BOOKING DETAILS (FULL EDIT MODE) ---
// API quan trọng cho tính năng "Cây bút" và "Chỉnh sửa thời gian Combo"
app.post('/api/update-booking-details', async (req, res) => {
    try {
        const body = req.body; 
        const rowId = body.rowId; 
        if (!rowId) return res.status(400).json({ error: 'Missing rowId' });

        console.log(`[UPDATE REQUEST] Row: ${rowId}, Body Keys: ${Object.keys(body).join(', ')}`);
        
        // --- 1. CẬP NHẬT CÁC CỘT CƠ BẢN (A-K) ---
        if (body.date) {
            const formattedDate = formatDateDisplay(body.date);
            await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[formattedDate]] }});
        }
        if (body.startTime) {
            let timeVal = body.startTime; if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);
            await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!B${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[timeVal]] }});
        }
        if (body.customerName) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!C${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.customerName]] }});
        if (body.serviceName) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!D${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.serviceName]] }});
        if (body.isOil !== undefined) {
             const val = body.isOil ? "Yes" : "";
             await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!E${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[val]] }});
        }
        if (body.pax) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!F${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.pax]] }});
        if (body.phone) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!G${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.phone]] }});
        if (body.mainStatus) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!H${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.mainStatus]] }});
        if (body.staffId && body.staffId !== '随機') await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!I${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.staffId]] }});

        // --- 2. CẬP NHẬT STAFF LOG COLUMNS (L-Q) ---
        const staffCols = ['L', 'M', 'N', 'O', 'P', 'Q'];
        for(let i=0; i<6; i++) { 
            const key = `staff${i+1}`; 
            const val = body[key] || body[`ServiceStaff${i+1}`] || body[`服務師傅${i+1}`]; 
            if(val) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!${staffCols[i]}${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[val]] }}); 
        }
        
        // --- 3. CẬP NHẬT STATUS COLUMNS (R-W) ---
        const statusCols = ['R', 'S', 'T', 'U', 'V', 'W'];
        for(let i=0; i<6; i++) { 
            const key = `Status${i+1}`; 
            if(body[key]) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!${statusCols[i]}${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body[key]]] }}); 
        }

        // --- 4. CẬP NHẬT MATRIX DATA (X, Y, Z) - QUAN TRỌNG V99 ---
        if (body.phase1_duration !== undefined && body.phase1_duration !== null) {
            await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!X${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.phase1_duration]] }});
        }
        if (body.isManualLocked !== undefined) { 
            const val = body.isManualLocked ? 'TRUE' : 'FALSE'; 
            await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!Y${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[val]] }}); 
        }
        if (body.phase2_duration !== undefined && body.phase2_duration !== null) {
            await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!Z${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.phase2_duration]] }});
        }

        // --- 5. SYNC TRIGGER ---
        if (body.forceSync) {
            await syncData(); 
        } else {
            setTimeout(() => syncData(), 500); // Debounce
        }
        
        res.json({ success: true });
    } catch (e) { 
        console.error('[UPDATE DETAIL ERROR]', e);
        res.status(500).json({ error: e.message }); 
    }
});

// API UPDATE CẤU HÌNH NHÂN VIÊN
app.post('/api/update-staff-config', async (req, res) => {
    try {
        const { staffId, isStrictTime } = req.body;
        console.log(`[API STAFF] ID: ${staffId}, Strict: ${isStrictTime}`);
        const staffIndex = STAFF_LIST.findIndex(s => s.id === staffId);
        let sheetRowIndex = -1;

        if (staffIndex !== -1) {
            STAFF_LIST[staffIndex].isStrictTime = isStrictTime;
            sheetRowIndex = STAFF_LIST[staffIndex].sheetRowIndex;
        } else {
            return res.status(404).json({ success: false, error: 'Staff not found' });
        }

        if (sheetRowIndex !== -1) {
            const valueToWrite = isStrictTime ? "TRUE" : "";
            const range = `${SCHEDULE_SHEET}!E${sheetRowIndex}`;
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: range,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[valueToWrite]] }
            });
        }
        await syncData();
        res.json({ success: true });
    } catch (e) {
        console.error('[UPDATE STAFF ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- LINE EVENT HANDLER (MAIN LOGIC) ---
async function handleEvent(event) {
  const isText = event.type === 'message' && event.message.type === 'text';
  const isPostback = event.type === 'postback';
  if (!isText && !isPostback) return Promise.resolve(null);

  let text = ''; let userId = event.source.userId;
  if (isText) text = event.message.text.trim();
  else if (isPostback) {
      if (event.postback.params && event.postback.params.date) text = `DatePick:${event.postback.params.date}`; 
      else text = event.postback.data;
  }

  // Chặn Bot nếu hệ thống đang bảo trì
  const isBookingAction = text === 'Action:Booking' || text.startsWith('Cat:') || text.startsWith('Svc:') || text.startsWith('Date:') || text.startsWith('Pref:') || text.startsWith('Pax:') || text.startsWith('Time:');
  if (isBookingAction && (!isSystemHealthy || STAFF_LIST.length === 0)) {
       return client.replyMessage(event.replyToken, { 
           type: 'flex', 
           altText: 'Hệ thống bảo trì', 
           contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "⛔ TẠM NGƯNG ĐẶT LỊCH", "weight": "bold", "color": "#E63946", "size": "lg", "align": "center" }, { "type": "text", "text": "Hệ thống đang đồng bộ dữ liệu hoặc gặp sự cố kết nối.", "margin": "md", "wrap": true, "size": "sm", "align": "center" }, { "type": "text", "text": "Vui lòng liên hệ trực tiếp quầy để đặt lịch.", "margin": "sm", "wrap": true, "size": "sm", "align": "center", "weight": "bold" } ] } }
       });
  }

  // --- ENTRY: BOOKING ---
  if (text === 'Action:Booking') {
      userState[userId] = {};
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請選擇服務類別 (Service)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩 (Foot)", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓 (Body)", "text": "Cat:BODY" } } ] } } });
  }

  // --- ENTRY: MENU ---
  if (text.includes('Menu') || text.includes('價目') || text === '服務價目') {
      if (Object.keys(SERVICES).length === 0) await syncMenuData();
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() });
  }

  // --- ADMIN FLOW ---
  if (text === 'Admin') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Admin', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "🛠️ 師傅管理 (Admin)", "weight": "bold", "color": "#E63946", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#000000", "margin": "md", "action": { "type": "message", "label": "⛔ 全店店休", "text": "Admin:CloseShop" } }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛌 請假", "text": "Admin:SetOff" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🤒 早退", "text": "Admin:SetLeaveEarly" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🍱 用餐", "text": "Admin:SetBreak" } } ] } } }); }
  if (text === 'Admin:CloseShop') { userState[userId] = { step: 'ADMIN_PICK_CLOSE_DATE' }; return client.replyMessage(event.replyToken, { type: 'template', altText: '選擇日期', template: { type: 'buttons', text: '請選擇店休日期:', actions: [ { type: 'datetimepicker', label: '🗓️ 點擊選擇', data: 'ShopClosePicked', mode: 'date' } ] } }); }
  if (text.startsWith('DatePick:') && userState[userId] && userState[userId].step === 'ADMIN_PICK_CLOSE_DATE') { const pickedDate = text.split(':')[1]; await ghiVaoSheet({ gioDen: '08:00', ngayDen: pickedDate, dichVu: SERVICES['SHOP_CLOSE'].name, nhanVien: 'ALL_STAFF', userId: 'ADMIN', sdt: 'ADMIN', hoTen: '全店店休', trangThai: '⛔ 店休' }); delete userState[userId]; return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已設定 ${pickedDate} 全店店休。` }); }
  if (text.startsWith('Admin:')) { const action = text.split(':')[1]; userState[userId] = { step: 'ADMIN_PICK_STAFF', action: action }; const bubbles = createStaffBubbles().map(b => { const str = JSON.stringify(b).replace(/StaffSelect/g, 'StaffOp'); return JSON.parse(str); }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇師傅', contents: { type: 'carousel', contents: bubbles } }); }
  if (text.startsWith('StaffOp:')) {
      const staffId = text.split(':')[1]; const currentState = userState[userId]; if (!currentState || currentState.step !== 'ADMIN_PICK_STAFF') return Promise.resolve(null);
      const now = getTaipeiNow(); const todayISO = formatDateDisplay(now.toLocaleDateString()); const currentTimeStr = now.toTimeString().substring(0, 5); let logType = ''; let logNote = '';
      if (currentState.action === 'SetOff') { logType = '請假'; logNote = '全天'; await ghiVaoSheet({ gioDen: '08:00', ngayDen: todayISO, dichVu: SERVICES['OFF_DAY'].name, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '請假', trangThai: '⛔ 已鎖定' }); } 
      else if (currentState.action === 'SetBreak') { logType = '用餐'; logNote = '30分鐘'; await ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: SERVICES['BREAK_30'].name, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '用餐', trangThai: '🍱 用餐中' }); } 
      else if (currentState.action === 'SetLeaveEarly') { logType = '早退/病假'; let duration = (26 * 60) - (now.getHours() * 60 + now.getMinutes()); if(duration<0) duration=0; logNote = `早退 (${duration}分)`; await ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: `⛔ 早退 (${duration}分)`, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '管理員操作', trangThai: '⚠️ 早退' }); }
      SERVER_STAFF_STATUS[staffId] = { status: currentState.action === 'SetOff' ? 'AWAY' : currentState.action === 'SetBreak' ? 'EAT' : 'OUT_SHORT', checkInTime: 0 }; delete userState[userId]; return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已登記: ${staffId} - ${logType}\n(${logNote})` });
  }

  // --- BOOKING STEPS ---
  if (text.startsWith('Cat:')) {
      const category = text.split(':')[1];
      const buttons = Object.keys(SERVICES).filter(k => SERVICES[k].category === category).map(key => ({ "type": "button", "style": "primary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${SERVICES[key].name} ($${SERVICES[key].price})`, "text": `Svc:${key}` } }));
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇方案', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "選擇方案", "weight": "bold", "size": "xl", "align": "center" }, { "type": "separator", "margin": "md" }, ...buttons ] } } });
  }

  if (text.startsWith('Svc:')) {
      const svcCode = text.split(':')[1]; userState[userId] = { step: 'DATE', service: svcCode }; const days = getNext15Days(); 
      return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Date', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "📅 請選擇日期 (Date)", "align": "center", "weight": "bold" }, ...days.map(d=>({ "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": d.label, "text": `Date:${d.value}` } })) ] } } });
  }

  if (text.startsWith('Date:')) {
      if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
      const selectedDate = text.split(':')[1]; const currentState = userState[userId]; currentState.date = selectedDate; currentState.step = 'PREF'; userState[userId] = currentState;
      const serviceType = SERVICES[currentState.service].category;
      const buttons = [
          { "type": "text", "text": "💆 請選擇師傅需求 (Staff)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" },
          { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🎲 不指定 (隨機)", "text": "Pref:RANDOM" } },
          { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👨 指定男師傅", "text": "Pref:MALE" } },
          { "type": "button", "style": "primary", "color": "#333333", "margin": "sm", "action": { "type": "message", "label": "👉 指定特定號碼", "text": "Pref:SPECIFIC" } },
          { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👩 指定女師傅 (無油)", "text": "Pref:FEMALE" } }
      ];
      if (serviceType !== 'FOOT') buttons.push({ "type": "button", "style": "primary", "color": "#E91E63", "margin": "sm", "action": { "type": "message", "label": "💧 指定女師傅推油 (+$200)", "text": "Pref:OIL" } });
      else buttons.push({ "type": "text", "text": "(足底按摩無油壓選項)", "size": "xs", "color": "#aaaaaa", "align": "center", "margin": "sm" });
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '師傅', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": buttons } } });
  }

  if (text.startsWith('Pref:')) {
      if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
      userState[userId].pref = text.split(':')[1]; userState[userId].step = 'PAX';
      const paxButtons = [1, 2, 3, 4, 5, 6].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } }));
      return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Pax', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "👥 請問幾位貴賓? (Pax)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons ] } } });
  }

  if (text.startsWith('Pax:')) {
      if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
      const num = parseInt(text.split(':')[1]); const currentState = userState[userId]; currentState.pax = num; currentState.selectedStaff = []; userState[userId] = currentState;
      if (currentState.pref === 'SPECIFIC') {
          const bubbles = createStaffBubbles(false, []); bubbles.forEach((b,i) => { b.body.contents[0].text = `選第 1/${num} 位技師`; b.body.contents[0].color = "#E91E63"; });
          return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Select Staff', contents: { type: 'carousel', contents: bubbles } });
      }
      let requireFemale = false; let requireMale = false; let isOil = false;
      if (currentState.pref === 'OIL') { isOil = true; requireFemale = true; } else if (currentState.pref === 'FEMALE') requireFemale = true; else if (currentState.pref === 'MALE') requireMale = true;
      currentState.isOil = isOil;
      const bubbles = generateTimeBubbles(currentState.date, currentState.service, null, currentState.pax, requireFemale, requireMale);
      if(!bubbles) return client.replyMessage(event.replyToken, {type:'text',text:'😢 抱歉，該時段已客滿，請選擇其他日期 (Full Booked)'});
      currentState.step = 'TIME'; userState[userId] = currentState;
      return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles });
  }

  if (text.startsWith('StaffSelect:')) {
      const staffId = text.split(':')[1]; const currentState = userState[userId]; currentState.selectedStaff.push(staffId); userState[userId] = currentState;
      if (currentState.selectedStaff.length < currentState.pax) {
          const bubbles = createStaffBubbles(false, currentState.selectedStaff); const nextIdx = currentState.selectedStaff.length + 1;
          bubbles.forEach(b => { b.body.contents[0].text = `選第 ${nextIdx}/${currentState.pax} 位技師`; b.body.contents[0].color = "#E91E63"; });
          return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Next Staff', contents: { type: 'carousel', contents: bubbles } });
      } else {
          const bubbles = generateTimeBubbles(currentState.date, currentState.service, currentState.selectedStaff, currentState.pax, false, false);
          if(!bubbles) return client.replyMessage(event.replyToken, {type:'text',text:'😢 所選技師時間衝突 (Conflict)'});
          currentState.step = 'TIME'; userState[userId] = currentState;
          return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles });
      }
  }

  if (text === 'Time:Suggest') {
      const s = userState[userId]; if (!s) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ Session expired.' });
      let requireFemale = false, requireMale = false; if (s.pref === 'OIL') requireFemale = true; else if (s.pref === 'FEMALE') requireFemale = true; else if (s.pref === 'MALE') requireMale = true;
      const bestSlots = findBestSlots(s.date, s.service, s.pax, requireFemale, requireMale);
      if (bestSlots.length === 0) return client.replyMessage(event.replyToken, { type: 'text', text: '😢 抱歉，未找到合適時段。' });
      const bubbles = bestSlots.map(slot => ({ "type": "bubble", "size": "micro", "body": { "type": "box", "layout": "vertical", "paddingAll": "sm", "contents": [ { "type": "text", "text": slot.timeStr, "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center" }, { "type": "text", "text": `👍 評分: ${slot.score}`, "size": "xxs", "color": "#aaaaaa", "align": "center" }, { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "message", "label": "選擇", "text": `Time:${slot.timeStr}` }, "margin": "sm" } ] } }));
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '最佳時段建議', contents: { "type": "carousel", "contents": bubbles } });
  }

  if (text.startsWith('Time:')) {
      if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ Session expired.' });
      userState[userId].step = 'SURNAME'; userState[userId].time = text.replace('Time:', '').trim();
      return client.replyMessage(event.replyToken, { type: 'text', text: `請問怎麼稱呼您？(姓氏/Surname)` });
  }

  if (userState[userId] && userState[userId].step === 'SURNAME') {
      userState[userId].step = 'PHONE'; userState[userId].surname = text;
      return client.replyMessage(event.replyToken, { type: 'text', text: "請輸入手機號碼 (Phone):" });
  }

  // --- FINAL CONFIRMATION & BOOKING COMMIT ---
  if (userState[userId] && userState[userId].step === 'PHONE') {
      const sdt = normalizePhoneNumber(text); const s = userState[userId];
      let finalDate = s.date; 
      const hour = parseInt(s.time.split(':')[0]);
      if (hour < 8) { const d = new Date(s.date); d.setDate(d.getDate() + 1); finalDate = formatDateString(d); }
      
      let basePrice = SERVICES[s.service].price; if (s.isOil) basePrice += 200; const totalPrice = basePrice * s.pax;
      let staffDisplay = '隨機'; if (s.selectedStaff && s.selectedStaff.length > 0) staffDisplay = s.selectedStaff.join(', '); else if (s.pref === 'FEMALE') staffDisplay = '女師傅'; else if (s.pref === 'MALE') staffDisplay = '男師傅'; else if (s.pref === 'OIL') staffDisplay = '女師傅(油)';

      // 1. RE-CHECK AVAILABILITY (RACE CONDITION CHECK)
      const guestList = []; 
      for(let i=0; i<s.pax; i++) { 
          let sId = 'RANDOM'; 
          if(s.selectedStaff && s.selectedStaff.length > i) sId = s.selectedStaff[i]; 
          guestList.push({ serviceCode: s.service, staffName: sId }); 
      }
      
      const relevantBookings = cachedBookings.filter(b => b.date === s.date && !b.status.includes('取消') && !b.status.includes('Cancel'));
      const staffListMap = {}; STAFF_LIST.forEach(staff => { if (!staff.offDays.includes(s.date)) staffListMap[staff.id] = staff; });

      // Gọi Core với logic Smart Load Balancing V99
      const checkResult = ResourceCore.checkRequestAvailability(s.date, s.time, guestList, relevantBookings, staffListMap);

      if (!checkResult.feasible) {
          return client.replyMessage(event.replyToken, { type: 'text', text: "😢 Rất tiếc, khung giờ này vừa bị người khác đặt mất. Vui lòng chọn giờ khác." });
      }

      // 2. CONFIRM MESSAGE
      let confirmMsg = `✅ 預約成功 (Confirmed)\n\n` +
                         `👤 ${s.surname} (${sdt})\n` +
                         `📅 ${finalDate} ${s.time}\n` +
                         `💆 ${SERVICES[s.service].name}\n` +
                         `👥 ${s.pax} 位\n` +
                         `🛠️ ${staffDisplay}\n` +
                         `💵 總金額: $${totalPrice}\n\n`;
      
      if (checkResult.proposedUpdates && checkResult.proposedUpdates.length > 0) {
           console.log(`[BOT] Confirmed with adjustments for ${checkResult.proposedUpdates.length} items.`);
      }

      confirmMsg += `⚠️ 重要須知 (Notice):\n` +
                    `若需【更改時間】或【取消預約】，請務必點擊下方「我的預約 (My Booking)」按鈕進行操作，或直接致電櫃台告知，以免影響您的權益，謝謝配合！`;
      
      await client.replyMessage(event.replyToken, { type: 'text', text: confirmMsg });
      client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 New Booking: ${s.surname} - $${totalPrice}` });
      
      // 3. PREPARE GUEST DETAILS FOR SHEET
      const guestDetails = [];
      for(let i=0; i<s.pax; i++) {
          let sId = '隨機'; if(s.selectedStaff && s.selectedStaff.length > i) sId = s.selectedStaff[i]; else if(s.pref === 'FEMALE') sId = '女'; else if(s.pref === 'MALE') sId = '男';
          guestDetails.push({ service: SERVICES[s.service].name, staff: sId, isOil: s.isOil });
      }
      
      // 4. WRITE TO SHEET (INCLUDE UPDATES)
      await ghiVaoSheet(
          { 
              gioDen: s.time, 
              ngayDen: finalDate, 
              dichVu: SERVICES[s.service].name, 
              nhanVien: staffDisplay, 
              userId: userId, 
              sdt: sdt, 
              hoTen: s.surname, 
              trangThai: '已預約', 
              pax: s.pax, 
              isOil: s.isOil, 
              guestDetails: guestDetails 
          }, 
          checkResult.proposedUpdates
      );
      
      delete userState[userId]; return;
  }

  if (text === 'Action:MyBooking') { const booking = await layLichDatGanNhat(userId); if (!booking) return client.replyMessage(event.replyToken, { type: 'text', text: '查無預約 (No Booking)' }); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Booking', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您的預約", "weight": "bold", "color": "#1DB446", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": booking.dichVu, "weight": "bold", "size": "md", "margin": "md" }, { "type": "text", "text": `🛠️ ${booking.nhanVien}`, "align": "center", "margin": "sm" }, { "type": "text", "text": `⏰ ${booking.thoiGian}`, "size": "xl", "weight": "bold", "color": "#555555", "margin": "sm" } ] }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "color": "#ff9800", "action": { "type": "message", "label": "🏃 我會晚到 (Late)", "text": "Action:Late" } }, { type: "button", style: "secondary", color: "#ff3333", "action": { type: "message", "label": "❌ 取消預約 (Cancel)", "text": "Action:ConfirmCancel" } } ] } } }); }
  if (text === 'Action:Late') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Late', contents: { "type": "bubble", "body": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "secondary", "action": { "type": "message", "label": "5 分", "text": "Late:5p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "10 分", "text": "Late:10p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "15 分", "text": "Late:15p" } } ] } } }); }
  if (text.startsWith('Late:')) { const phut = text.split(':')[1].replace('p', '分'); const booking = await layLichDatGanNhat(userId); if (booking) { await updateBookingStatus(booking.rowId, `⚠️ 晚到 ${phut}`); } client.pushMessage(ID_BA_CHU, { type: 'text', text: `⚠️ 晚到通知!\nID: ${userId}\n預計晚: ${phut}` }); return client.replyMessage(event.replyToken, { type: 'text', text: '好的，我們會為您保留 (OK, Confirmed)。' }); }
  if (text === 'Action:ConfirmCancel') { const booking = await layLichDatGanNhat(userId); if (booking) { await updateBookingStatus(booking.rowId, '❌ Cancelled'); return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已成功取消預約 (Cancelled)。' }); } return client.replyMessage(event.replyToken, { type: 'text', text: '找不到您的預約資料。' }); }
  if (text.includes('booking') || text.includes('預約')) { delete userState[userId]; syncData(); return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() }); }

  return client.replyMessage(event.replyToken, { type: 'flex', altText: '預約服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您好 👋", "weight": "bold", "size": "lg", "align": "center" }, { "type": "text", "text": "請問您是要預約按摩服務嗎？", "wrap": true, "size": "sm", "color": "#555555", "align": "center", "margin": "md" } ] }, "footer": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "✅ 立即預約 (Book)", "text": "Action:Booking" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "📄 服務價目 (Menu)", "text": "Menu" } } ] } } });
}

// 1. Initial Sync
syncMenuData().then(() => syncData());

// 2. Auto Sync Interval (30s)
// Tăng lên 30s để giảm tải, vì giờ đã có nút Manual Refresh
setInterval(() => { syncData(); }, 30000); 

// 3. Health Check
app.get('/ping', (req, res) => { res.status(200).send('Pong!'); });

const port = process.env.PORT || 3000;
app.listen(port, () => { console.log(`XinWuChan Bot V7.3 running on port ${port}`); });
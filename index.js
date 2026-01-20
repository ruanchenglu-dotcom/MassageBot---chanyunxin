/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT (BACKEND SERVER - MAIN ENTRY)
 * VERSION: V105.1 (STABLE RELEASE - FLOW CAPTURE UPGRADE)
 * FEATURE: CORE KERNEL SYNCHRONIZATION & FLOW PERSISTENCE
 * AUTHOR: AI ASSISTANT & USER
 * DATE: 2026/01/20
 * * ========================== CHANGE LOG V105.1 ==========================
 * 1. [LINE BOT LOGIC UPGRADE]
 * - Fix logic tại bước "Confirm" (PHONE step):
 * - Thay vì set flow: null, Bot sẽ đọc kết quả từ ResourceCore.checkResult.details.
 * - Lấy chính xác 'BF' hoặc 'FB' và thời gian phase1/phase2 để đẩy vào GuestDetails.
 * * 2. [ADMIN API INTELLIGENCE]
 * - API /api/admin-booking: Nếu admin không chọn Flow (null), hệ thống tự gọi Core để tính toán.
 * - Đảm bảo Admin đặt lịch cũng tối ưu hóa tài nguyên như Bot.
 * * 3. [SHEET WRITER REFINEMENT]
 * - Hàm ghiVaoSheet: Nâng cấp để đọc phase1/phase2 từ guestDetails[i] (ưu tiên) thay vì chỉ đọc global.
 * - Đảm bảo cột Y (Flow), O (Phase1), P (Phase2) được ghi chính xác 100%.
 * =================================================================================================
 */

require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

// --- IMPORT CORE LOGIC (V105 BRAIN) ---
// File này chứa "bộ não" tính toán xếp chỗ (Core Kernel đã nâng cấp)
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

// Lấy config giới hạn tài nguyên từ Core (Fallback nếu Core chưa load xong)
const MAX_CHAIRS = ResourceCore.CONFIG ? ResourceCore.CONFIG.MAX_CHAIRS : 6;
const MAX_BEDS = ResourceCore.CONFIG ? ResourceCore.CONFIG.MAX_BEDS : 6;

// Khởi tạo Google Sheets API Client
const auth = new google.auth.GoogleAuth({
    keyFile: 'google-key.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- 2. GLOBAL STATE (TRẠNG THÁI SERVER TRÊN RAM) ---
let SERVER_RESOURCE_STATE = {}; // Trạng thái ghế/giường realtime
let SERVER_STAFF_STATUS = {};   // Trạng thái nhân viên (Ăn, Nghỉ, Ra ngoài)
let STAFF_LIST = [];            // Danh sách nhân viên và lịch làm việc
let cachedBookings = [];        // Dữ liệu Booking đã được xử lý
let scheduleMap = {};           // Bản đồ lịch nghỉ nhân viên theo ngày
let userState = {};             // Lưu trạng thái hội thoại Line (Session)
let lastSyncTime = new Date(0); // Thời điểm đồng bộ gần nhất
let isSystemHealthy = false;    // Health Check Status
let isSyncing = false;          // Mutex Lock (Ngăn chặn race condition khi sync)
let SERVICES = ResourceCore.SERVICES || {}; 
let LAST_CALCULATED_MATRIX = null; // Snapshot debug cho Matrix

// =============================================================================
// PHẦN 3: CÁC HÀM TIỆN ÍCH (UTILITIES)
// =============================================================================

/**
 * Lấy thời gian hiện tại theo múi giờ Đài Loan (GMT+8)
 * Sử dụng hàm từ Core nếu có để đồng bộ, nếu không thì tự tính.
 */
function getTaipeiNow() {
    return ResourceCore.getTaipeiNow ? ResourceCore.getTaipeiNow() : new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
}

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

/**
 * Chuẩn hóa ngày tháng từ Google Sheet
 * Hỗ trợ nhiều định dạng: ISO string, YYYY/MM/DD, v.v.
 */
function normalizeSheetDate(rawDateStr) {
    if (!rawDateStr) return null;
    try {
        const str = rawDateStr.toString().trim();
        // Xử lý định dạng ISO (2025-11-20T...)
        if (str.includes('T') && (str.endsWith('Z') || str.includes('+'))) {
            const d = new Date(str);
            const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
            const taipeiTime = new Date(utc + (3600000 * 8));
            return formatDateString(taipeiTime); 
        }
        // Xử lý định dạng chuỗi thường
        const cleanStr = str.replace(/-/g, '/');
        const parts = cleanStr.split('/');
        if (parts.length === 3) {
            let y = parseInt(parts[0]);
            let m = parseInt(parts[1]);
            let d = parseInt(parts[2]);
            if (y < 100) y += 2000; 
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

function formatDateString(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

function formatDateTimeString(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const h = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
}

/**
 * Tạo danh sách 15 ngày tiếp theo để hiển thị trên nút chọn ngày
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
    return days; 
}

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
// PHẦN 4: ĐỒNG BỘ DỮ LIỆU (CORE SYNC LOGIC - V105 UPDATED)
// =============================================================================

/**
 * Đồng bộ Menu & Dynamic Services
 * Update V105: Đảm bảo ElasticStep và ElasticLimit được nạp vào ResourceCore.
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

            // Đọc cấu hình Elastic (V105)
            let elasticStep = 0;
            let elasticLimit = 0;
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
                name: name, duration: duration, type: type, category: category, price: price,
                elasticStep: elasticStep, elasticLimit: elasticLimit
            };
        });
        
        // Đẩy cấu hình mới vào CORE
        if (ResourceCore.setDynamicServices) {
            ResourceCore.setDynamicServices(newServices);
        }
        SERVICES = newServices; // Cập nhật local reference
        console.log(`[MENU V105] Updated: ${Object.keys(SERVICES).length} items. Elastic Config loaded.`);
    } catch (e) { console.error('[MENU ERROR]', e); }
}

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
 * Update V105.0: 
 * - Đọc chính xác Cột Y (Flow Persistence).
 * - Đọc Matrix Cols (O, P, Q).
 * - Chuẩn bị dữ liệu sạch nhất cho Core V105 tính toán.
 */
async function syncData() {
    if (isSyncing) {
        console.log("⚠️ Skip sync: Sync process locked (Busy).");
        return;
    }

    try {
        isSyncing = true; // Lock

        // --- BƯỚC 1: ĐỌC DỮ LIỆU BOOKING (RANGE: A -> AC) ---
        // Range bao phủ từ cột A đến cột AC (chứa Staff 6)
        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:AC` });
        const rowsBooking = resBooking.data.values;
        let tempBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                // Kiểm tra dữ liệu cơ bản
                if (!row[0] || !row[1]) continue;
                
                const status = row[7] || '已預約';
                if (status.includes('取消') || status.includes('Cancelled')) continue;

                const serviceStr = row[3] || '';
                
                // Match Service Info
                let duration = 60; let type = 'BED'; let category = 'BODY'; let price = 0;
                let foundService = false;
                
                for (const key in SERVICES) {
                    if (serviceStr.includes(SERVICES[key].name.split('(')[0])) {
                        duration = SERVICES[key].duration; 
                        type = SERVICES[key].type; 
                        category = SERVICES[key].category; 
                        price = SERVICES[key].price; 
                        foundService = true; break;
                    }
                }
                
                // Fallback nếu không tìm thấy service code
                if (!foundService) {
                    if (serviceStr.includes('套餐')) { category = 'COMBO'; duration = 100; }
                    else if (serviceStr.includes('足')) { type = 'CHAIR'; category = 'FOOT'; }
                }
                if (row[4] === "Yes") price += 200;
                let pax = 1; if (row[5]) pax = parseInt(row[5]);
                let serviceCode = 'UNKNOWN';
                for(const key in SERVICES) { if(SERVICES[key].name === serviceStr) { serviceCode = key; break; } }

                // [MATRIX DATA FIELDS - V105.0]
                // Cột O (Index 14)
                const rawPhase1 = row[14]; 
                const phase1Duration = rawPhase1 ? parseInt(rawPhase1) : null;
                // Cột P (Index 15)
                const rawPhase2 = row[15]; 
                const phase2Duration = rawPhase2 ? parseInt(rawPhase2) : null;
                // Cột Q (Index 16) - Manual Lock
                const rawLocked = row[16]; 
                const isManualLocked = (rawLocked && (rawLocked.toUpperCase() === 'TRUE' || rawLocked === 'TRUE'));

                // [FLOW DATA FIELD - V105.0]
                // Cột Y (Index 24) - Nơi lưu trữ Flow 'BF' hoặc 'FB'
                const rawFlow = row[24]; 
                let flowCode = null;
                if (rawFlow && (rawFlow === 'BF' || rawFlow === 'FB')) {
                    flowCode = rawFlow;
                }

                // Staff Columns Mapping
                const staffId = row[8] || '隨機';
                const serviceStaff1 = row[11]; // L
                const staffId2 = row[12]; // M
                const staffId3 = row[13]; // N
                const staffId4 = row[26]; // AA
                const staffId5 = row[27]; // AB
                const staffId6 = row[28]; // AC

                tempBookings.push({
                    rowId: i + 1, 
                    startTimeString: `${row[0]} ${row[1]}`, 
                    startTime: row[1], 
                    duration: duration, 
                    type: type, 
                    category: category, 
                    price: price,
                    staffId: staffId, 
                    staffName: staffId, 
                    serviceStaff: serviceStaff1,
                    staffId2: staffId2, staffId3: staffId3, staffId4: staffId4, staffId5: staffId5, staffId6: staffId6,
                    pax: pax, 
                    customerName: `${row[2]} (${row[6]})`,
                    serviceName: serviceStr, 
                    serviceCode: serviceCode, 
                    phone: row[6], 
                    date: row[0], 
                    status: status, 
                    lineId: row[9], 
                    isOil: row[4] === "Yes",
                    // --- V105 Critical Fields ---
                    phase1_duration: phase1Duration,
                    phase2_duration: phase2Duration,
                    isManualLocked: isManualLocked,
                    flow: flowCode, // Quan trọng: Truyền flow vào Booking Object để Core xử lý
                    allocated_resource: null 
                });
            }
        }

        // --- BƯỚC 2: ĐỌC LỊCH LÀM VIỆC (SCHEDULE) ---
        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:BG100` });
        const rows = resSchedule.data.values;
        let tempStaffList = []; let tempScheduleMap = {}; 

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
                    id: cleanName, name: cleanName, gender: gender, 
                    start: startTime, end: endTime, shiftStart: startTime, shiftEnd: endTime,
                    isStrictTime: isStrictTime, sheetRowIndex: i + 1, off: false, offDays: [] 
                };
                
                // Parse Off Days
                const todayStr = formatDateDisplay(getTaipeiNow());
                for (let j = 5; j < headerRow.length; j++) {
                    if (headerRow[j]) {
                        const normalizedDate = normalizeSheetDate(headerRow[j]); 
                        if (normalizedDate) {
                            if (row[j] && row[j].trim().toUpperCase() === 'OFF') {
                                if (!tempScheduleMap[normalizedDate]) tempScheduleMap[normalizedDate] = [];
                                tempScheduleMap[normalizedDate].push(cleanName);
                                staffObj.offDays.push(normalizedDate);
                                if (normalizedDate === todayStr) { staffObj.off = true; }
                            }
                        }
                    }
                }
                tempStaffList.push(staffObj);
            }
        }
        
        if (tempStaffList.length === 0) {
            console.error("⛔ CRITICAL: Không đọc được StaffSchedule! Chuyển sang chế độ bảo trì.");
            isSystemHealthy = false; STAFF_LIST = []; 
        } else {
            STAFF_LIST = tempStaffList; scheduleMap = tempScheduleMap; isSystemHealthy = true;
        }

        // --- BƯỚC 3: TÍNH TOÁN RESOURCE MATRIX (CORE V105) ---
        // Phần này cực kỳ quan trọng: Backend dùng Core để tái tạo hiện trường (Matrix)
        if (isSystemHealthy && tempBookings.length > 0) {
            try {
                if (typeof ResourceCore.generateResourceMatrix === 'function') {
                    // Gọi hàm Core để tính toán lại toàn bộ việc gán ghế/giường
                    const matrixAllocation = ResourceCore.generateResourceMatrix(tempBookings, STAFF_LIST);
                    
                    // Gán kết quả tính toán ngược lại vào booking để hiển thị hoặc debug
                    tempBookings.forEach(booking => {
                        if (matrixAllocation[booking.rowId]) {
                            booking.allocated_resource = matrixAllocation[booking.rowId];
                        }
                    });
                    LAST_CALCULATED_MATRIX = matrixAllocation;
                    // Log ngắn gọn để verify
                    console.log(`[MATRIX V105] Calculated allocations for ${Object.keys(matrixAllocation).length} bookings.`);
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
        console.error('[SYNC FATAL ERROR]', e); isSystemHealthy = false; STAFF_LIST = []; 
    } finally {
        isSyncing = false; 
    }
}

// =============================================================================
// PHẦN 5: LOGIC LINE BOT BOOKING HELPERS
// =============================================================================

/**
 * Tìm các slot tốt nhất cho tính năng "Smart Suggest"
 */
function findBestSlots(selectedDate, serviceCode, pax = 1, requireFemale = false, requireMale = false) {
    if (!isSystemHealthy || STAFF_LIST.length === 0) return [];
    
    const nowTaipei = getTaipeiNow();
    const todayStr = formatDateString(nowTaipei);
    const isToday = (selectedDate === todayStr);
    const currentFloatTime = nowTaipei.getHours() + (nowTaipei.getMinutes() / 60);

    // Chuẩn bị Map nhân viên khả dụng
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
    
    // Tạo Guest List đơn giản cho Suggestion
    const guestList = []; 
    for(let i=0; i<pax; i++) { 
        // V105 NOTE: Với suggestion, ta chưa biết khách muốn Flow nào (nếu là Combo), để mặc định.
        guestList.push({ serviceCode: serviceCode, staffName: 'RANDOM', flow: null }); 
    }
    
    let candidates = [];
    // Quét từng giờ để tìm slot
    for (let h = 8; h <= 24; h += 1) { 
        if (isToday && h < currentFloatTime) continue; 
        const hourInt = Math.floor(h); const minuteInt = 0; let displayH = hourInt; if (displayH >= 24) displayH -= 24; 
        const timeStr = `${displayH.toString().padStart(2, '0')}:${minuteInt.toString().padStart(2, '0')}`;
        
        // GỌI CORE V105:
        const result = ResourceCore.checkRequestAvailability(selectedDate, timeStr, guestList, relevantBookings, staffListMap);
        
        if (result.feasible) {
            candidates.push({ timeStr: timeStr, sortVal: h, score: 10, label: `${timeStr}` });
        }
    }
    candidates.sort((a, b) => a.sortVal - b.sortVal);
    return candidates.slice(0, 6); 
}

/**
 * Tạo danh sách Time Slots hiển thị trên Line UI
 */
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
    
    // Tạo Guest List chi tiết
    const guestList = []; 
    for(let i=0; i<pax; i++) { 
        let sId = 'RANDOM'; 
        if(specificStaffIds && specificStaffIds.length > i) sId = specificStaffIds[i]; 
        // V105 NOTE: Flow chưa được chọn ở bước này, để null. Core sẽ tự optimize.
        guestList.push({ serviceCode: serviceCode, staffName: sId, flow: null }); 
    }
    
    // Loop check từng giờ
    for (let h = 8; h <= 24; h += 1) { 
        if (isToday && h < currentFloatTime) continue; 
        const hourInt = Math.floor(h); let displayH = hourInt >= 24 ? hourInt - 24 : hourInt;
        const timeStr = `${displayH.toString().padStart(2, '0')}:00`;
        
        // CORE CHECK
        const result = ResourceCore.checkRequestAvailability(selectedDate, timeStr, guestList, relevantBookings, staffListMap);
        if (result.feasible) validSlots.push(h);
    }
    
    if (validSlots.length === 0) return null;
    
    // Format UI Bubble
    const formatTime = (h) => { const hourInt = Math.floor(h); if (hourInt < 24) return `${hourInt.toString().padStart(2, '0')}:00`; return `${(hourInt - 24).toString().padStart(2, '0')}:00 (凌晨)`; };
    const formatValue = (h) => { const hourInt = Math.floor(h); const displayH = hourInt < 24 ? hourInt : hourInt - 24; return `${displayH.toString().padStart(2, '0')}:00`; }
    const groups = [ 
        { name: '🌞 早安 (Morning)', slots: validSlots.filter(h => h >= 8 && h < 12) }, 
        { name: '☀️ 午後 (Afternoon)', slots: validSlots.filter(h => h >= 12 && h < 18) }, 
        { name: '🌙 晚安 (Evening)', slots: validSlots.filter(h => h >= 18 && h < 24) }, 
        { name: '✨ 深夜 (Late Night)', slots: validSlots.filter(h => h >= 24) } 
    ];
    
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
 * GHI BOOKING MỚI VÀO GOOGLE SHEET 
 * Update V105.1:
 * - Ưu tiên đọc phase1, phase2, flow từ guestDetails từng người (để support batch booking chính xác).
 */
async function ghiVaoSheet(data, proposedUpdates = []) {
    try {
        const timeCreate = getCurrentDateTimeStr();
        let colA_Date = formatDateDisplay(data.ngayDen);
        let colB_Time = data.gioDen || ""; if (colB_Time.includes(' ')) colB_Time = colB_Time.split(' ')[1]; if (colB_Time.length > 5) colB_Time = colB_Time.substring(0, 5);
        const colG_Phone = data.sdt; const colH_Status = data.trangThai || '已預約'; const colJ_LineID = data.userId; const colK_Created = timeCreate;
        
        // --- 1. CHUẨN BỊ DỮ LIỆU ĐỂ APPEND ---
        const valuesToWrite = [];
        // Support batch guests (đặt nhiều người)
        if (data.guestDetails && Array.isArray(data.guestDetails) && data.guestDetails.length > 0) {
            data.guestDetails.forEach((guest, index) => {
                const guestNum = index + 1; const total = data.guestDetails.length;
                const colC_Name = `${data.hoTen || '現場客'} (${guestNum}/${total})`;
                let colD_Service = guest.service; if (guest.isOil) colD_Service += " (油推+$200)";
                const colE_Oil = guest.isOil ? "Yes" : ""; const colF_Pax = 1; const colI_Staff = guest.staff || '隨機';
                valuesToWrite.push([ colA_Date, colB_Time, colC_Name, colD_Service, colE_Oil, colF_Pax, colG_Phone, colH_Status, colI_Staff, colJ_LineID, colK_Created ]);
            });
        } else {
            // Fallback booking đơn
            const colC_Name = data.hoTen || '現場客'; let colD_Service = data.dichVu; if (data.isOil) colD_Service += " (油推+$200)";
            const colE_Oil = data.isOil ? "Yes" : ""; const colF_Pax = data.pax || 1; const colI_Staff = data.nhanVien || '隨機';
            valuesToWrite.push([ colA_Date, colB_Time, colC_Name, colD_Service, colE_Oil, colF_Pax, colG_Phone, colH_Status, colI_Staff, colJ_LineID, colK_Created ]);
        }

        // --- 2. THỰC HIỆN APPEND (Ghi các cột cơ bản A->K) ---
        let newRowStartIndex = -1;
        if (valuesToWrite.length > 0) {
            const appendRes = await sheets.spreadsheets.values.append({ 
                spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', 
                valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite } 
            });
            
            if (appendRes.data.updates && appendRes.data.updates.updatedRange) {
                const rangeStr = appendRes.data.updates.updatedRange;
                const match = rangeStr.match(/[A-Z]+(\d+):/);
                if (match) newRowStartIndex = parseInt(match[1]);
            }
        }

        // --- 3. GHI DỮ LIỆU NÂNG CAO (MATRIX & FLOW) ---
        const matrixUpdates = [];
        if (newRowStartIndex !== -1) {
             const numberOfRows = valuesToWrite.length;
             for(let i = 0; i < numberOfRows; i++) {
                 const currentRow = newRowStartIndex + i;
                 
                 // [MATRIX DATA] - Cột O, P, Q
                 // V105.1 UPDATE: Ưu tiên lấy từ guestDetails (độ chính xác cao hơn cho nhóm)
                 // Nếu không có trong guestDetails thì mới lấy từ data chung (Fallback)
                 let p1 = null;
                 let p2 = null;

                 if (data.guestDetails && data.guestDetails[i]) {
                     if (data.guestDetails[i].phase1 !== undefined) p1 = data.guestDetails[i].phase1;
                     if (data.guestDetails[i].phase2 !== undefined) p2 = data.guestDetails[i].phase2;
                 }
                 
                 // Fallback nếu chưa có (dùng chung cho cả nhóm - trường hợp cũ)
                 if (p1 === null) p1 = data.phase1_duration;
                 if (p2 === null) p2 = data.phase2_duration;
                 
                 if (p1 !== undefined && p1 !== null) {
                     matrixUpdates.push({ range: `${BOOKING_SHEET}!O${currentRow}`, values: [[p1]] });
                 }
                 if (p2 !== undefined && p2 !== null) {
                     matrixUpdates.push({ range: `${BOOKING_SHEET}!P${currentRow}`, values: [[p2]] });
                 }
                 if (data.isManualLocked) {
                     matrixUpdates.push({ range: `${BOOKING_SHEET}!Q${currentRow}`, values: [['TRUE']] });
                 }

                 // [FLOW PERSISTENCE] - Cột Y (V105.1 UPDATED)
                 // Logic: Lấy Flow từ Guest Details (ưu tiên) -> hoặc từ data gốc
                 let flowToWrite = null;
                 if (data.guestDetails && data.guestDetails[i] && data.guestDetails[i].flow) {
                     flowToWrite = data.guestDetails[i].flow;
                 } else if (data.flow) {
                     flowToWrite = data.flow;
                 }

                 if (flowToWrite) {
                     matrixUpdates.push({ range: `${BOOKING_SHEET}!Y${currentRow}`, values: [[flowToWrite]] });
                 }
             }
        }

        // --- 4. XỬ LÝ PROPOSED UPDATES (ELASTIC TIME ADJUSTMENT) ---
        // Cập nhật lại các booking cũ nếu Core V105 đề xuất (để dồn chỗ)
        if (proposedUpdates && proposedUpdates.length > 0) {
            console.log(`[OPTIMIZATION] Executing ${proposedUpdates.length} updates to existing bookings...`);
            proposedUpdates.forEach(update => {
                if (!update.rowId) return;
                if (update.phase1 !== undefined) matrixUpdates.push({ range: `${BOOKING_SHEET}!O${update.rowId}`, values: [[update.phase1]] });
                if (update.phase2 !== undefined) matrixUpdates.push({ range: `${BOOKING_SHEET}!P${update.rowId}`, values: [[update.phase2]] });
            });
        }

        // --- 5. GỬI BATCH UPDATE CHO MATRIX & FLOW ---
        if (matrixUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: matrixUpdates }
            });
            console.log(`[SHEET WRITE V105.1] Updated Matrix & Flow Data (Cols O,P,Q,Y) for ${matrixUpdates.length} cells.`);
        }

        // Trigger sync sau 1s để refresh cache
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

// --- API: INFO (For Admin Dashboard) ---
app.get('/api/info', async (req, res) => { 
    try {
        const isForceRefresh = req.query.forceRefresh === 'true';
        const now = new Date();
        const timeSinceLastSync = now - lastSyncTime;
        const MIN_SYNC_INTERVAL_MANUAL = 10000; 
        
        if (isForceRefresh) {
            console.log(`[API INFO] Manual Refresh Requested. Time since: ${timeSinceLastSync}ms`);
            if (isSyncing) {
                console.log("⚠️ Manual Sync SKIPPED: Busy.");
            } else if (timeSinceLastSync > MIN_SYNC_INTERVAL_MANUAL) {
                console.log("⚡ MANUAL SYNC TRIGGERED...");
                await syncData(); 
            }
        }

        res.json({ 
            staffList: STAFF_LIST, 
            bookings: cachedBookings,
            schedule: scheduleMap, 
            resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS }, 
            resourceState: SERVER_RESOURCE_STATE, 
            staffStatus: SERVER_STAFF_STATUS, 
            services: SERVICES,
            lastUpdated: lastSyncTime,
            isSystemHealthy: isSystemHealthy,
            matrixDebug: LAST_CALCULATED_MATRIX 
        }); 
    } catch (error) {
        console.error("[API INFO FATAL ERROR]", error);
        res.status(500).json({ error: "Internal Server Error during data fetch." });
    }
});

// --- API: SYNC STATE ---
app.post('/api/sync-resource', (req, res) => { SERVER_RESOURCE_STATE = req.body; res.json({ success: true }); });
app.post('/api/sync-staff-status', (req, res) => { SERVER_STAFF_STATUS = req.body; res.json({ success: true }); });

// --- API: ADMIN CREATE BOOKING ---
// Update V105.1: Tự động tính Flow nếu Admin không nhập (NULL)
app.post('/api/admin-booking', async (req, res) => { 
    const data = req.body; 
    console.log(`[ADMIN BOOKING] Received request for ${data.hoTen}. Flow input: ${data.flow || 'NULL (Will Auto-Calc)'}`);
    
    // [V105.1] INTELLIGENT FLOW CALCULATION FOR ADMIN
    // Nếu admin không chọn Flow (data.flow null/undefined), ta sẽ nhờ Core tính toán flow tối ưu 'BF'/'FB'
    if (!data.flow && ResourceCore.checkRequestAvailability) {
        try {
            // 1. Chuẩn bị dữ liệu để gọi Core Check
            const staffListMap = {};
            STAFF_LIST.forEach(s => { staffListMap[s.id] = s; });
            const relevantBookings = cachedBookings.filter(b => b.date === data.ngayDen && !b.status.includes('取消'));
            
            // Xây dựng Guest đơn giản (Admin thường book từng đơn, nếu batch thì logic phức tạp hơn chút)
            // Giả định admin book 1 service code
            let serviceCode = 'UNKNOWN';
            for(const key in SERVICES) { if(SERVICES[key].name === data.dichVu) { serviceCode = key; break; } }
            
            if (serviceCode !== 'UNKNOWN') {
                const guestList = [];
                const pax = data.pax || 1;
                for(let i=0; i<pax; i++) {
                     // Nếu admin đã chọn staff, dùng staff đó. Nếu không thì RANDOM.
                     let sId = (data.nhanVien && data.nhanVien !== '隨機' && data.nhanVien !== 'ALL_STAFF') ? data.nhanVien : 'RANDOM';
                     guestList.push({ serviceCode: serviceCode, staffName: sId, flow: null });
                }

                // 2. Gọi Core
                // Lưu ý: data.gioDen format 'HH:mm'
                const checkResult = ResourceCore.checkRequestAvailability(data.ngayDen, data.gioDen, guestList, relevantBookings, staffListMap);
                
                if (checkResult.feasible && checkResult.details && checkResult.details.length > 0) {
                    // 3. Lấy Flow từ kết quả tính toán của Core
                    // Nếu là guest lẻ, lấy của guest đầu tiên.
                    const optimalFlow = checkResult.details[0].flow;
                    if (optimalFlow === 'BF' || optimalFlow === 'FB') {
                        data.flow = optimalFlow;
                        // Lấy luôn Phase durations để ghi matrix chính xác
                        data.phase1_duration = checkResult.details[0].phase1;
                        data.phase2_duration = checkResult.details[0].phase2;
                        console.log(`[ADMIN AUTO-FLOW] Calculated: ${optimalFlow} (P1:${data.phase1_duration}, P2:${data.phase2_duration})`);
                    }
                }
            }
        } catch (err) {
            console.error("[ADMIN AUTO-FLOW ERROR]", err);
        }
    }

    // Gọi hàm ghi Sheet với dữ liệu đã được làm giàu
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
        // Matrix & Flow (Updated from calc above if null)
        phase1_duration: data.phase1_duration,
        phase2_duration: data.phase2_duration,
        isManualLocked: data.isManualLocked,
        flow: data.flow 
    }); 
    res.json({ success: true }); 
});

app.post('/api/update-status', async (req, res) => { await updateBookingStatus(req.body.rowId, req.body.status); res.json({ success: true }); });
app.post('/api/save-salary', async (req, res) => { await syncDailySalary(req.body.date, req.body.staffData); res.json({ success: true }); });

// --- API: UPDATE BOOKING DETAILS (FULL EDIT MODE) ---
app.post('/api/update-booking-details', async (req, res) => {
    try {
        const body = req.body; 
        const rowId = body.rowId; 
        if (!rowId) return res.status(400).json({ error: 'Missing rowId' });

        console.log(`[UPDATE V105] Row: ${rowId}, Body Keys: ${Object.keys(body).join(', ')}`);
        
        // 1. Basic Columns (A-K)
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

        // 2. Staff Log Columns (L, M, N, AA, AB, AC)
        const staffCols = ['L', 'M', 'N', 'AA', 'AB', 'AC'];
        for(let i=0; i<6; i++) { 
            const key = `staff${i+1}`; 
            const val = body[key] || body[`ServiceStaff${i+1}`] || body[`服務師傅${i+1}`]; 
            if(val) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!${staffCols[i]}${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[val]] }}); 
        }
        
        // 3. Status Columns (R-W)
        const statusCols = ['R', 'S', 'T', 'U', 'V', 'W'];
        for(let i=0; i<6; i++) { 
            const key = `Status${i+1}`; 
            if(body[key]) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!${statusCols[i]}${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body[key]]] }}); 
        }

        // 4. Matrix & Flow (V105 Update)
        if (body.phase1_duration !== undefined && body.phase1_duration !== null) {
            await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!O${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.phase1_duration]] }});
        }
        if (body.phase2_duration !== undefined && body.phase2_duration !== null) {
            await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!P${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.phase2_duration]] }});
        }
        if (body.isManualLocked !== undefined) { 
            const val = body.isManualLocked ? 'TRUE' : 'FALSE'; 
            await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!Q${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[val]] }}); 
        }
        
        // [V105] Ghi Flow (Column Y) khi edit booking
        if (body.flow) {
            await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!Y${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.flow]] }});
        }

        // 5. Sync Trigger
        if (body.forceSync) {
            await syncData(); 
        } else {
            setTimeout(() => syncData(), 500); 
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
                spreadsheetId: SHEET_ID, range: range, valueInputOption: 'USER_ENTERED', requestBody: { values: [[valueToWrite]] }
            });
        }
        await syncData();
        res.json({ success: true });
    } catch (e) {
        console.error('[UPDATE STAFF ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- LINE EVENT HANDLER (MAIN BOT LOGIC) ---
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

  // Chặn request nếu hệ thống đang bảo trì hoặc chưa sync
  const isBookingAction = text === 'Action:Booking' || text.startsWith('Cat:') || text.startsWith('Svc:') || text.startsWith('Date:') || text.startsWith('Pref:') || text.startsWith('Pax:') || text.startsWith('Time:');
  if (isBookingAction && (!isSystemHealthy || STAFF_LIST.length === 0)) {
       return client.replyMessage(event.replyToken, { 
           type: 'flex', altText: 'Hệ thống bảo trì', 
           contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "⛔ TẠM NGƯNG ĐẶT LỊCH", "weight": "bold", "color": "#E63946", "size": "lg", "align": "center" }, { "type": "text", "text": "Hệ thống đang đồng bộ dữ liệu hoặc gặp sự cố kết nối.", "margin": "md", "wrap": true, "size": "sm", "align": "center" }, { "type": "text", "text": "Vui lòng liên hệ trực tiếp quầy để đặt lịch.", "margin": "sm", "wrap": true, "size": "sm", "align": "center", "weight": "bold" } ] } }
       });
  }

  // --- LOGIC LUỒNG ĐẶT LỊCH ---
  if (text === 'Action:Booking') {
      userState[userId] = {};
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請選擇服務類別 (Service)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩 (Foot)", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓 (Body)", "text": "Cat:BODY" } } ] } } });
  }

  if (text.includes('Menu') || text.includes('價目') || text === '服務價目') {
      if (Object.keys(SERVICES).length === 0) await syncMenuData();
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() });
  }

  // --- ADMIN COMMANDS ---
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

  // --- FINAL CONFIRMATION (FLOW CAPTURE LOGIC ADDED HERE) ---
  if (userState[userId] && userState[userId].step === 'PHONE') {
      const sdt = normalizePhoneNumber(text); const s = userState[userId];
      let finalDate = s.date; 
      const hour = parseInt(s.time.split(':')[0]);
      if (hour < 8) { const d = new Date(s.date); d.setDate(d.getDate() + 1); finalDate = formatDateString(d); }
      
      let basePrice = SERVICES[s.service].price; if (s.isOil) basePrice += 200; const totalPrice = basePrice * s.pax;
      let staffDisplay = '隨機'; if (s.selectedStaff && s.selectedStaff.length > 0) staffDisplay = s.selectedStaff.join(', '); else if (s.pref === 'FEMALE') staffDisplay = '女師傅'; else if (s.pref === 'MALE') staffDisplay = '男師傅'; else if (s.pref === 'OIL') staffDisplay = '女師傅(油)';

      // Xây dựng Guest List cho Core Check lần cuối
      const guestList = []; 
      for(let i=0; i<s.pax; i++) { 
          let sId = 'RANDOM'; 
          if(s.selectedStaff && s.selectedStaff.length > i) sId = s.selectedStaff[i]; 
          // V105.1: Mặc định flow NULL để Core tính toán
          guestList.push({ serviceCode: s.service, staffName: sId, flow: null }); 
      }
      
      const relevantBookings = cachedBookings.filter(b => b.date === s.date && !b.status.includes('取消') && !b.status.includes('Cancel'));
      const staffListMap = {}; STAFF_LIST.forEach(staff => { if (!staff.offDays.includes(s.date)) staffListMap[staff.id] = staff; });

      // Gọi Core V105 Check Availability lần cuối
      const checkResult = ResourceCore.checkRequestAvailability(s.date, s.time, guestList, relevantBookings, staffListMap);

      if (!checkResult.feasible) {
          return client.replyMessage(event.replyToken, { type: 'text', text: "😢 Rất tiếc, khung giờ này vừa bị người khác đặt mất. Vui lòng chọn giờ khác." });
      }

      let confirmMsg = `✅ 預約成功 (Confirmed)\n\n` +
                         `👤 ${s.surname} (${sdt})\n` +
                         `📅 ${finalDate} ${s.time}\n` +
                         `💆 ${SERVICES[s.service].name}\n` +
                         `👥 ${s.pax} 位\n` +
                         `🛠️ ${staffDisplay}\n` +
                         `💵 總金額: $${totalPrice}\n\n`;
      
      if (checkResult.proposedUpdates && checkResult.proposedUpdates.length > 0) {
           console.log(`[BOT] Confirmed with auto-adjustments for ${checkResult.proposedUpdates.length} bookings.`);
      }

      confirmMsg += `⚠️ 重要須知 (Notice):\n` +
                    `若需【更改時間】或【取消預約】，請務必點擊下方「我的預約 (My Booking)」按鈕進行操作，或直接致電櫃台告知，以免影響您的權益，謝謝配合！`;
      
      await client.replyMessage(event.replyToken, { type: 'text', text: confirmMsg });
      client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 New Booking: ${s.surname} - $${totalPrice}` });
      
      // [V105.1 KEY UPDATE] CREATE GUEST DETAILS FROM CORE RESULT
      const guestDetails = [];
      for(let i=0; i<s.pax; i++) {
          let sId = '隨機'; 
          if(s.selectedStaff && s.selectedStaff.length > i) sId = s.selectedStaff[i]; 
          else if(s.pref === 'FEMALE') sId = '女'; 
          else if(s.pref === 'MALE') sId = '男';

          // Truy xuất kết quả tính toán từ Core cho khách thứ i
          const coreDetail = checkResult.details && checkResult.details[i] ? checkResult.details[i] : null;
          
          // Lấy Flow (BF/FB) và Phase Durations từ Core
          const optimalFlow = coreDetail ? coreDetail.flow : null; 
          const p1 = coreDetail ? coreDetail.phase1 : null;
          const p2 = coreDetail ? coreDetail.phase2 : null;
          
          // Debug log nhẹ
          console.log(`[BOT CONFIRM] Guest ${i+1}: Flow=${optimalFlow}, P1=${p1}, P2=${p2}`);

          guestDetails.push({ 
              service: SERVICES[s.service].name, 
              staff: sId, 
              isOil: s.isOil, 
              flow: optimalFlow, // QUAN TRỌNG: Lưu flow vào guestDetails để ghiVaoSheet đọc
              phase1: p1,        // Lưu Phase1 vào để ghi cột O
              phase2: p2         // Lưu Phase2 vào để ghi cột P
          });
      }
      
      await ghiVaoSheet(
          { 
              gioDen: s.time, ngayDen: finalDate, dichVu: SERVICES[s.service].name, 
              nhanVien: staffDisplay, userId: userId, sdt: sdt, hoTen: s.surname, 
              trangThai: '已預約', pax: s.pax, isOil: s.isOil, guestDetails: guestDetails 
          }, 
          checkResult.proposedUpdates
      );
      
      delete userState[userId]; return;
  }

  // --- MY BOOKING & CANCELLATION ---
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
setInterval(() => { syncData(); }, 30000); 

// 3. Health Check
app.get('/ping', (req, res) => { res.status(200).send('Pong!'); });

const port = process.env.PORT || 3000;
app.listen(port, () => { console.log(`XinWuChan Bot V105.1 (Flow Capture Enabled) running on port ${port}`); });
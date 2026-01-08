/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT (BACKEND SERVER)
 * VERSION: V186 (FIXED: GOOGLE QUOTA EXCEEDED & CACHING OPTIMIZATION)
 * AUTHOR: AI ASSISTANT
 * DATE: 2026/01/08
 * UPDATE NOTE: 
 * - Implemented RAM Caching for /api/info to prevent Google API Quota errors.
 * - Added Automatic Background Sync (Interval 60s).
 * - Time range capped at 24:00 (00:00).
 * - Full Traditional Chinese.
 * =================================================================================================
 */

require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

// --- 1. CẤU HÌNH (CONFIGURATION) ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const ID_BA_CHU = process.env.ID_BA_CHU;
const SHEET_ID = process.env.SHEET_ID;

// Tên các Sheet (Tab)
const BOOKING_SHEET = 'Sheet1';
const STAFF_SHEET = 'StaffLog';
const SCHEDULE_SHEET = 'StaffSchedule';
const SALARY_SHEET = 'SalaryLog';
const MENU_SHEET = 'menu'; 

// Cấu hình tài nguyên
const MAX_CHAIRS = 6;
const MAX_BEDS = 6;
const FUTURE_BUFFER_MINS = 5;
const CLEANUP_BUFFER = 10;
const MAX_TIMELINE_MINUTES = 3000; // Đủ cho hơn 2 ngày tính theo phút

// Google Auth
const auth = new google.auth.GoogleAuth({
    keyFile: 'google-key.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Global State (Bộ nhớ RAM - Cache)
// Dữ liệu sẽ được lưu ở đây để phục vụ API nhanh chóng
let SERVER_RESOURCE_STATE = {};
let SERVER_STAFF_STATUS = {};
let STAFF_LIST = [];
let cachedBookings = [];
let scheduleMap = {}; 
let userState = {};
let lastSyncTime = new Date(); // Theo dõi thời gian cập nhật cuối cùng

// Dịch vụ mặc định (Sẽ được ghi đè bởi Sheet 'menu')
let SERVICES = {
    'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
    'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
    'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' }
};

// =============================================================================
// PHẦN 2: CÁC HÀM HỖ TRỢ (HELPER FUNCTIONS)
// =============================================================================

function getTaipeiNow() {
    const taipeiString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false });
    return new Date(taipeiString);
}

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

function normalizeSheetDate(rawDateStr) {
    if (!rawDateStr) return null;
    try {
        const str = rawDateStr.trim();
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
    } catch (e) { return null; }
}

// Danh sách 15 ngày tới (Đảo ngược để hiển thị trên điện thoại dễ bấm hơn)
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
        let l = `${d.getMonth()+1}/${d.getDate()} (${w})`;
        if(i===0) l="今天 (Today)";
        if(i===1) l="明天 (Tmr)";
        days.push({label: l, value: v});
    }
    return days.reverse();
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
        const taipeiString = d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
        d = new Date(taipeiString);
        const year = d.getFullYear().toString();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}/${month}/${day}`;
    } catch (e) { return dateInput; }
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
        let year = parseInt(dateNums[0]);
        if (year < 1900) year += 1911;
        const month = parseInt(dateNums[1]) - 1;
        const day = parseInt(dateNums[2]);
        const hour = parseInt(timeNums[0]) || 0;
        const min = parseInt(timeNums[1]) || 0;
        return new Date(year, month, day, hour, min);
    } catch (e) { return null; }
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

function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    const effectiveH = (h < 8) ? h + 24 : h;
    return effectiveH * 60 + (m || 0);
}

function isStaffWorkingAt(staff, checkMins, dateString) {
    const normalizedDate = formatDateDisplay(dateString);
    if (scheduleMap[normalizedDate] && scheduleMap[normalizedDate].includes(staff.name)) return false; 
    if (!staff.shiftStart || !staff.shiftEnd) return true; 
    const startMins = getMinsFromTimeStr(staff.shiftStart);
    const endMins = getMinsFromTimeStr(staff.shiftEnd);
    if (endMins < startMins) { 
        const adjustedEnd = endMins + (24 * 60);
        return checkMins >= startMins && checkMins < adjustedEnd; 
    } else {
        return checkMins >= startMins && checkMins < endMins;
    }
}

// =============================================================================
// PHẦN 3: TETRIS SIMULATION ENGINE (XẾP CHỖ THÔNG MINH)
// =============================================================================

function isRangeFree(slotArray, rowIdx, start, end) {
    if (rowIdx < 1 || rowIdx >= slotArray.length) return false;
    for (let t = start; t < end; t++) {
        if (t >= MAX_TIMELINE_MINUTES) break;
        if (slotArray[rowIdx][t] === 1) return false;
    }
    return true;
}

function markRangeBusy(slotArray, rowIdx, start, end) {
    if (rowIdx < 1 || rowIdx >= slotArray.length) return;
    for (let t = start; t < end; t++) {
        if (t >= MAX_TIMELINE_MINUTES) break;
        slotArray[rowIdx][t] = 1;
    }
}

function placeBookingOnMap(booking, slotMap) {
    let bStart = getMinsFromTimeStr(booking.startTimeString.split(' ')[1]);
    const duration = booking.duration || 60;
    
    if (booking.category === 'COMBO') {
        const half = duration / 2;
        const p1Start = bStart;
        const p1End = p1Start + half + CLEANUP_BUFFER; 
        const p2Start = p1Start + half; 
        const p2End = p2Start + half + CLEANUP_BUFFER; 

        let foundChair = -1;
        for (let c = 1; c <= MAX_CHAIRS; c++) {
            if (isRangeFree(slotMap.CHAIR, c, p1Start, p1End)) { foundChair = c; break; }
        }
        if (foundChair === -1) return false; 

        let foundBed = -1;
        for (let b = 1; b <= MAX_BEDS; b++) {
            if (isRangeFree(slotMap.BED, b, p2Start, p2End)) { foundBed = b; break; }
        }
        if (foundBed === -1) return false; 

        markRangeBusy(slotMap.CHAIR, foundChair, p1Start, p1End);
        markRangeBusy(slotMap.BED, foundBed, p2Start, p2End);
        return true;

    } else {
        let type = 'BED';
        if (booking.type === 'CHAIR' || booking.category === 'FOOT') type = 'CHAIR';
        const effectiveEnd = bStart + duration + CLEANUP_BUFFER;
        const maxSlots = type === 'CHAIR' ? MAX_CHAIRS : MAX_BEDS;
        const targetArray = slotMap[type];

        for (let r = 1; r <= maxSlots; r++) {
            if (isRangeFree(targetArray, r, bStart, effectiveEnd)) {
                markRangeBusy(targetArray, r, bStart, effectiveEnd);
                return true;
            }
        }
        return false;
    }
}

function simulateCurrentState(relevantBookings) {
    const slotMap = { 
        CHAIR: Array.from({length: MAX_CHAIRS + 1}, () => new Uint8Array(MAX_TIMELINE_MINUTES)), 
        BED: Array.from({length: MAX_BEDS + 1}, () => new Uint8Array(MAX_TIMELINE_MINUTES)) 
    };
    const sortedBookings = [...relevantBookings].sort((a, b) => {
        const tA = getMinsFromTimeStr(a.startTimeString.split(' ')[1]);
        const tB = getMinsFromTimeStr(b.startTimeString.split(' ')[1]);
        return tA - tB;
    });
    sortedBookings.forEach(b => {
        placeBookingOnMap(b, slotMap);
    });
    return slotMap;
}

// =============================================================================
// PHẦN 4: ĐỒNG BỘ DỮ LIỆU & MENU (SYNC)
// =============================================================================

async function syncMenuData() {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${MENU_SHEET}!A2:D50` });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return;

        SERVICES = {
            'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
            'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
            'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' }
        };

        rows.forEach(row => {
            const code = row[0] ? row[0].trim() : null; 
            const name = row[1] ? row[1].trim() : '';
            const priceStr = row[3] ? row[3].trim() : '0';
            if (!code || !name) return;

            let duration = 60;
            const timeMatch = name.match(/(\d+)分/);
            if (timeMatch) duration = parseInt(timeMatch[1]);
            const price = parseInt(priceStr.replace(/\D/g, '')) || 0;

            let type = 'BED'; let category = 'BODY';
            const prefix = code.charAt(0).toUpperCase();
            if (prefix === 'A') { type = 'BED'; category = 'COMBO'; } 
            else if (prefix === 'F') { type = 'CHAIR'; category = 'FOOT'; } 
            else if (prefix === 'B') { type = 'BED'; category = 'BODY'; }

            SERVICES[code] = { name: name, duration: duration, type: type, category: category, price: price };
        });
        console.log(`[MENU] Updated: ${Object.keys(SERVICES).length} items.`);
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

// Hàm đồng bộ chính (Core Sync Function)
async function syncData() {
    try {
        await syncMenuData(); 
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
                let duration = 60; let type = 'BED'; let category = 'BODY'; let price = 0;
                let foundService = false;
                for (const key in SERVICES) {
                    if (serviceStr.includes(SERVICES[key].name.split('(')[0])) {
                        duration = SERVICES[key].duration; type = SERVICES[key].type; category = SERVICES[key].category; price = SERVICES[key].price; foundService = true; break;
                    }
                }
                if (!foundService) {
                    if (serviceStr.includes('套餐')) { category = 'COMBO'; duration = 100; }
                    else if (serviceStr.includes('足')) { type = 'CHAIR'; category = 'FOOT'; }
                }
                if (row[4] === "Yes") price += 200;
                let pax = 1; if (row[5]) pax = parseInt(row[5]);

                cachedBookings.push({
                    rowId: i + 1, startTimeString: `${row[0]} ${row[1]}`, duration: duration, type: type, category: category, price: price,
                    staffId: row[8] || '隨機', serviceStaff: row[11], pax: pax, customerName: `${row[2]} (${row[6]})`,
                    serviceName: serviceStr, phone: row[6], date: row[0], status: status, lineId: row[9], isOil: row[4] === "Yes"
                });
            }
        }

        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:BG100` });
        const rows = resSchedule.data.values;
        STAFF_LIST = []; scheduleMap = {}; 

        if (rows && rows.length > 1) {
            const headerRow = rows[0]; 
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const staffName = row[0]; if (!staffName) continue;
                const cleanName = staffName.trim();
                const gender = (row[1] && (row[1] === '女' || row[1] === 'F')) ? 'F' : 'M';
                const staffObj = { id: cleanName, name: cleanName, gender: gender, shiftStart: row[2] || '08:00', shiftEnd: row[3] || '03:00', offDays: [] };
                for (let j = 4; j < headerRow.length; j++) {
                    if (headerRow[j] && row[j] && row[j].trim().toUpperCase() === 'OFF') {
                        const normalizedDate = normalizeSheetDate(headerRow[j]);
                        if (normalizedDate) {
                            if (!scheduleMap[normalizedDate]) scheduleMap[normalizedDate] = [];
                            scheduleMap[normalizedDate].push(cleanName);
                            staffObj.offDays.push(normalizedDate);
                        }
                    }
                }
                STAFF_LIST.push(staffObj);
            }
        }
        if (STAFF_LIST.length === 0) for(let i=1; i<=20; i++) STAFF_LIST.push({id:`${i}號`, name:`${i}號`, gender:'F', shiftStart:'08:00', shiftEnd:'03:00'});
        
        lastSyncTime = new Date();
        console.log(`[SYNC OK] Bookings: ${cachedBookings.length}, Staff: ${STAFF_LIST.length} at ${lastSyncTime.toLocaleTimeString()}`);
    } catch (e) { console.error('[SYNC ERROR]', e); }
}

// =============================================================================
// PHẦN 5: SMART CHECK AVAILABILITY
// =============================================================================

function runSmartAvailabilityCheck(dateStr, timeStr, guestList) {
    const displayDate = formatDateDisplay(dateStr);
    const startMins = getMinsFromTimeStr(timeStr);
    const now = getTaipeiNow();
    const reqDate = parseStringToDate(`${displayDate} ${timeStr}`);
    if (startMins >= 24 * 60) reqDate.setDate(reqDate.getDate() + 1);
    if (reqDate.getTime() <= (now.getTime() + FUTURE_BUFFER_MINS * 60000)) return { feasible: false, reason: '時間已過 (Time Passed)' };

    const relevantBookings = cachedBookings.filter(b => b.date === displayDate && !b.status.includes('取消') && !b.status.includes('完成'));
    const activeStaff = STAFF_LIST.filter(s => isStaffWorkingAt(s, startMins, displayDate));
    const totalActive = activeStaff.length;
    
    let busyStaffCount = 0; let maxDuration = 0;
    guestList.forEach(g => { const svc = SERVICES[g.serviceCode]; if (svc && svc.duration > maxDuration) maxDuration = svc.duration; });
    const checkEndMins = startMins + maxDuration;

    relevantBookings.forEach(b => {
        let bStart = getMinsFromTimeStr(b.startTimeString.split(' ')[1]);
        let bEnd = bStart + b.duration;
        if (Math.max(startMins, bStart) < Math.min(checkEndMins, bEnd)) busyStaffCount += (b.pax || 1);
    });

    if ((totalActive - busyStaffCount) < guestList.length) return { feasible: false, reason: `技師不足 (剩餘 ${totalActive - busyStaffCount}/${guestList.length})` };

    const simulatedMap = simulateCurrentState(relevantBookings);
    for (const guest of guestList) {
        const svcInfo = SERVICES[guest.serviceCode];
        if (!svcInfo) return { feasible: false, reason: '服務錯誤' };
        const tempBooking = { startTimeString: `${displayDate} ${timeStr}`, duration: svcInfo.duration, type: (svcInfo.type === 'CHAIR' || svcInfo.category === 'FOOT') ? 'CHAIR' : 'BED', category: svcInfo.category };
        const success = placeBookingOnMap(tempBooking, simulatedMap);
        if (!success) return { feasible: false, reason: '位置已滿 (Full)' };
    }
    return { feasible: true, freeStaff: totalActive - busyStaffCount, score: totalActive - busyStaffCount };
}

function findBestSlots(selectedDate, serviceCode, pax = 1, requireFemale = false, requireMale = false) {
    const service = SERVICES[serviceCode]; if (!service) return [];
    let candidates = [];
    
    for (let h = 9; h <= 24; h += 1) { 
        const hourInt = Math.floor(h); const minuteInt = 0; 
        let displayH = hourInt; 
        if (displayH >= 24) displayH -= 24; 
        
        const timeStr = `${displayH.toString().padStart(2, '0')}:${minuteInt.toString().padStart(2, '0')}`;
        const guestList = [];
        for(let i=0; i<pax; i++) guestList.push({ serviceCode: serviceCode, staffId: 'RANDOM', isOil: requireFemale });
        
        const res = runSmartAvailabilityCheck(selectedDate, timeStr, guestList);
        if (res.feasible) candidates.push({ timeStr: timeStr, sortVal: h, score: res.score, label: `${timeStr}` });
    }
    candidates.sort((a, b) => b.score - a.score || a.sortVal - b.sortVal);
    return candidates.slice(0, 6);
}

function generateTimeBubbles(selectedDate, serviceCode, specificStaffIds = null, pax = 1, requireFemale = false, requireMale = false) {
    const service = SERVICES[serviceCode]; if (!service) return null;
    let validSlots = [];
    
    for (let h = 9; h <= 24; h += 1) { 
        const hourInt = Math.floor(h); const minuteInt = 0; 
        let displayH = hourInt; 
        if (displayH >= 24) displayH -= 24; 
        const timeStr = `${displayH.toString().padStart(2, '0')}:${minuteInt.toString().padStart(2, '0')}`;

        const guestList = [];
        for(let i=0; i<pax; i++) {
            let sId = 'RANDOM';
            if(specificStaffIds && specificStaffIds.length > i) sId = specificStaffIds[i];
            else if(requireFemale) sId = 'FEMALE'; else if(requireMale) sId = 'MALE';
            guestList.push({ serviceCode: serviceCode, staffId: sId, isOil: requireFemale });
        }
        if (runSmartAvailabilityCheck(selectedDate, timeStr, guestList).feasible) validSlots.push(h);
    }
    if (validSlots.length === 0) return null;

    const formatTime = (h) => { 
        const hourInt = Math.floor(h); 
        if (hourInt < 24) return `${hourInt.toString().padStart(2, '0')}:00`; 
        return `${(hourInt - 24).toString().padStart(2, '0')}:00 (凌晨)`; 
    };
    const formatValue = (h) => { 
        const hourInt = Math.floor(h); 
        const displayH = hourInt < 24 ? hourInt : hourInt - 24; 
        return `${displayH.toString().padStart(2, '0')}:00`; 
    }

    const groups = [
        { name: '🌞 早安 (Morning)', slots: validSlots.filter(h => h >= 8 && h < 12) },
        { name: '☀️ 午後 (Afternoon)', slots: validSlots.filter(h => h >= 12 && h < 18) },
        { name: '🌙 晚安 (Evening)', slots: validSlots.filter(h => h >= 18 && h < 24) },
        { name: '✨ 深夜 (Late Night)', slots: validSlots.filter(h => h >= 24) }
    ];

    let bubbles = [];
    bubbles.push({
        "type": "bubble", "size": "kilo",
        "body": {
            "type": "box", "layout": "vertical", "backgroundColor": "#F0F9FF", "cornerRadius": "lg",
            "contents": [
                { "type": "text", "text": "💎 SMART BOOKING", "weight": "bold", "color": "#0284C7", "align": "center", "size": "xs" },
                { "type": "text", "text": "精選推薦時段", "weight": "bold", "size": "md", "align": "center", "margin": "xs" },
                { "type": "button", "style": "primary", "color": "#0EA5E9", "margin": "md", "height": "sm", "action": { "type": "message", "label": "⭐ 查看 (View)", "text": "Time:Suggest" } }
            ]
        }
    });

    const timeBubbles = groups.filter(g => g.slots.length > 0).map(group => {
        const buttons = group.slots.map(h => {
            return { "type": "button", "style": "primary", "margin": "xs", "height": "sm", "action": { "type": "message", "label": formatTime(h), "text": `Time:${formatValue(h)}` } };
        });
        return { "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" }, { "type": "separator", "margin": "sm" }, ...buttons] } };
    });
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
    const comboRows = []; const footRows = []; const bodyRows = [];
    Object.values(SERVICES).forEach(svc => {
        if (svc.category === 'SYSTEM') return;
        const row = createRow(svc.name, svc.duration, svc.price);
        if (svc.category === 'COMBO') comboRows.push(row); else if (svc.category === 'FOOT') footRows.push(row); else bodyRows.push(row);
    });
    return {
        "type": "bubble", "size": "mega",
        "body": {
            "type": "box", "layout": "vertical", "contents": [
                { "type": "text", "text": "📜 服務價目表 (Menu)", "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center", "margin": "md" },
                { "type": "separator", "margin": "lg" },
                { "type": "text", "text": "🔥 熱門套餐 (Combo)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...comboRows,
                { "type": "text", "text": "👣 足底按摩 (Foot)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...footRows,
                { "type": "text", "text": "🛏️ 身體指壓 (Body)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...bodyRows,
                { "type": "separator", "margin": "xl" }, { "type": "text", "text": "⭐ 油推需加收 $200，請詢問櫃台。", "size": "xs", "color": "#aaaaaa", "margin": "md", "align": "center" }
            ]
        },
        "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "📅 立即預約 (Book Now)", "text": "Action:Booking" } } ] }
    };
}

// =============================================================================
// PHẦN 6: GHI SHEET & UPDATE STATUS
// =============================================================================

async function ghiVaoSheet(data) {
    try {
        const timeCreate = getCurrentDateTimeStr();
        let colA_Date = formatDateDisplay(data.ngayDen);
        let colB_Time = data.gioDen || ""; if (colB_Time.includes(' ')) colB_Time = colB_Time.split(' ')[1]; if (colB_Time.length > 5) colB_Time = colB_Time.substring(0, 5);
        const colG_Phone = data.sdt; const colH_Status = data.trangThai || '已預約'; const colJ_LineID = data.userId; const colK_Created = timeCreate;
        const valuesToWrite = [];

        if (data.guestDetails && Array.isArray(data.guestDetails) && data.guestDetails.length > 0) {
            data.guestDetails.forEach((guest, index) => {
                const guestNum = index + 1; const total = data.guestDetails.length;
                const colC_Name = `${data.hoTen || '現場客'} (${guestNum}/${total})`;
                let colD_Service = guest.service; if (guest.isOil) colD_Service += " (油推+$200)";
                const colE_Oil = guest.isOil ? "Yes" : ""; const colF_Pax = 1; const colI_Staff = guest.staff || '隨機';
                valuesToWrite.push([ colA_Date, colB_Time, colC_Name, colD_Service, colE_Oil, colF_Pax, colG_Phone, colH_Status, colI_Staff, colJ_LineID, colK_Created ]);
            });
        } else {
            const colC_Name = data.hoTen || '現場客'; let colD_Service = data.dichVu; if (data.isOil) colD_Service += " (油推+$200)";
            const colE_Oil = data.isOil ? "Yes" : ""; const colF_Pax = data.pax || 1; const colI_Staff = data.nhanVien || '隨機';
            valuesToWrite.push([ colA_Date, colB_Time, colC_Name, colD_Service, colE_Oil, colF_Pax, colG_Phone, colH_Status, colI_Staff, colJ_LineID, colK_Created ]);
        }

        if (valuesToWrite.length > 0) {
            await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite } });
        }
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
// PHẦN 7: EXPRESS SERVER & API & LINE BOT (CORE)
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

// --- API ENDPOINTS (ĐÃ TỐI ƯU Caching) ---

// ⚡ CACHING FIX: Trả về dữ liệu từ RAM ngay lập tức, KHÔNG gọi Google Sheet
app.get('/api/info', (req, res) => { 
    res.json({ 
        staffList: STAFF_LIST, 
        bookings: cachedBookings, 
        schedule: scheduleMap, 
        resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS }, 
        resourceState: SERVER_RESOURCE_STATE, 
        staffStatus: SERVER_STAFF_STATUS, 
        services: SERVICES,
        lastUpdated: lastSyncTime
    }); 
});

app.post('/api/sync-resource', (req, res) => { SERVER_RESOURCE_STATE = req.body; res.json({ success: true }); });
app.post('/api/sync-staff-status', (req, res) => { SERVER_STAFF_STATUS = req.body; res.json({ success: true }); });
app.post('/api/admin-booking', async (req, res) => { const data = req.body; await ghiVaoSheet({ ngayDen: data.ngayDen, gioDen: data.gioDen, dichVu: data.dichVu, nhanVien: data.nhanVien, userId: 'ADMIN_WEB', sdt: data.sdt || '現場客', hoTen: data.hoTen || '現場客', trangThai: '已預約', pax: data.pax || 1, isOil: data.isOil || false, guestDetails: data.guestDetails }); res.json({ success: true }); });
app.post('/api/update-status', async (req, res) => { await updateBookingStatus(req.body.rowId, req.body.status); res.json({ success: true }); });
app.post('/api/save-salary', async (req, res) => { await syncDailySalary(req.body.date, req.body.staffData); res.json({ success: true }); });
app.post('/api/update-booking-details', async (req, res) => {
    try {
        const body = req.body; const rowId = body.rowId; if (!rowId) return res.status(400).json({ error: 'Missing rowId' });
        if (body.serviceName) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!D${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.serviceName]] }});
        if (body.staffId && body.staffId !== '随機') await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!I${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.staffId]] }});
        if (body.mainStatus) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!H${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body.mainStatus]] }});
        const staffCols = ['L', 'M', 'N', 'O', 'P', 'Q'];
        for(let i=0; i<6; i++) { const key = `staff${i+1}`; const val = body[key] || body[`ServiceStaff${i+1}`] || body[`服務師傅${i+1}`]; if(val) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!${staffCols[i]}${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[val]] }}); }
        const statusCols = ['R', 'S', 'T', 'U', 'V', 'W'];
        for(let i=0; i<6; i++) { const key = `Status${i+1}`; if(body[key]) await sheets.spreadsheets.values.update({spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!${statusCols[i]}${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[body[key]]] }}); }
        await syncData(); res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- LINE EVENT HANDLER (MAIN LOGIC) ---
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text' && event.type !== 'postback') return Promise.resolve(null);
  let text = ''; let userId = event.source.userId;
  if (event.type === 'message') text = event.message.text.trim();
  else if (event.type === 'postback') {
      if (event.postback.params && event.postback.params.date) text = `DatePick:${event.postback.params.date}`; else text = event.postback.data;
  }

  // --- ENTRY: BOOKING ---
  if (text === 'Action:Booking') {
      userState[userId] = {};
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請選擇服務類別 (Service)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩 (Foot)", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓 (Body)", "text": "Cat:BODY" } } ] } } });
  }

  // --- ENTRY: MENU ---
  if (text.includes('Menu') || text.includes('價目') || text === '服務價目') {
      if (Object.keys(SERVICES).length <= 3) await syncMenuData();
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() });
  }

  // --- ADMIN ---
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

  // --- BOOKING FLOW ---
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

  // [UPDATED] BOOKING CONFIRMATION WITH WARNING
  if (userState[userId] && userState[userId].step === 'PHONE') {
      const sdt = normalizePhoneNumber(text); const s = userState[userId];
      let finalDate = s.date; const hour = parseInt(s.time.split(':')[0]);
      if (hour < 8) { const d = new Date(s.date); d.setDate(d.getDate() + 1); finalDate = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`; }
      let basePrice = SERVICES[s.service].price; if (s.isOil) basePrice += 200; const totalPrice = basePrice * s.pax;
      let staffDisplay = '隨機'; if (s.selectedStaff && s.selectedStaff.length > 0) staffDisplay = s.selectedStaff.join(', '); else if (s.pref === 'FEMALE') staffDisplay = '女師傅'; else if (s.pref === 'MALE') staffDisplay = '男師傅'; else if (s.pref === 'OIL') staffDisplay = '女師傅(油)';

      // ⚠️ WARNING MESSAGE
      const confirmMsg = `✅ 預約成功 (Confirmed)\n\n` +
                         `👤 ${s.surname} (${sdt})\n` +
                         `📅 ${finalDate} ${s.time}\n` +
                         `💆 ${SERVICES[s.service].name}\n` +
                         `👥 ${s.pax} 位\n` +
                         `🛠️ ${staffDisplay}\n` +
                         `💵 總金額: $${totalPrice}\n\n` +
                         `⚠️ 重要須知 (Notice):\n` +
                         `若需【更改時間】或【取消預約】，請務必點擊下方「我的預約 (My Booking)」按鈕進行操作，或直接致電櫃台告知，以免影響您的權益，謝謝配合！`;
      
      await client.replyMessage(event.replyToken, { type: 'text', text: confirmMsg });
      client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 New Booking: ${s.surname} - $${totalPrice}` });
      
      const guestDetails = [];
      for(let i=0; i<s.pax; i++) {
          let sId = '隨機'; if(s.selectedStaff && s.selectedStaff.length > i) sId = s.selectedStaff[i]; else if(s.pref === 'FEMALE') sId = '女'; else if(s.pref === 'MALE') sId = '男';
          guestDetails.push({ service: SERVICES[s.service].name, staff: sId, isOil: s.isOil });
      }
      await ghiVaoSheet({ gioDen: s.time, ngayDen: finalDate, dichVu: SERVICES[s.service].name, nhanVien: staffDisplay, userId: userId, sdt: sdt, hoTen: s.surname, trangThai: '已預約', pax: s.pax, isOil: s.isOil, guestDetails: guestDetails });
      delete userState[userId]; return;
  }

  if (text === 'Action:MyBooking') { const booking = await layLichDatGanNhat(userId); if (!booking) return client.replyMessage(event.replyToken, { type: 'text', text: '查無預約 (No Booking)' }); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Booking', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您的預約", "weight": "bold", "color": "#1DB446", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": booking.dichVu, "weight": "bold", "size": "md", "margin": "md" }, { "type": "text", "text": `🛠️ ${booking.nhanVien}`, "align": "center", "margin": "sm" }, { "type": "text", "text": `⏰ ${booking.thoiGian}`, "size": "xl", "weight": "bold", "color": "#555555", "margin": "sm" } ] }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "color": "#ff9800", "action": { "type": "message", "label": "🏃 我會晚到 (Late)", "text": "Action:Late" } }, { type: "button", style: "secondary", color: "#ff3333", "action": { type: "message", "label": "❌ 取消預約 (Cancel)", "text": "Action:ConfirmCancel" } } ] } } }); }
  if (text === 'Action:Late') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Late', contents: { "type": "bubble", "body": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "secondary", "action": { "type": "message", "label": "5 分", "text": "Late:5p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "10 分", "text": "Late:10p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "15 分", "text": "Late:15p" } } ] } } }); }
  if (text.startsWith('Late:')) { const phut = text.split(':')[1].replace('p', '分'); const booking = await layLichDatGanNhat(userId); if (booking) { await updateBookingStatus(booking.rowId, `⚠️ 晚到 ${phut}`); } client.pushMessage(ID_BA_CHU, { type: 'text', text: `⚠️ 晚到通知!\nID: ${userId}\n預計晚: ${phut}` }); return client.replyMessage(event.replyToken, { type: 'text', text: '好的，我們會為您保留 (OK, Confirmed)。' }); }
  if (text === 'Action:ConfirmCancel') { const booking = await layLichDatGanNhat(userId); if (booking) { await updateBookingStatus(booking.rowId, '❌ Cancelled'); return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已成功取消預約 (Cancelled)。' }); } return client.replyMessage(event.replyToken, { type: 'text', text: '找不到您的預約資料。' }); }
  if (text.includes('booking') || text.includes('預約')) { delete userState[userId]; syncData(); return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() }); }

  return client.replyMessage(event.replyToken, { type: 'flex', altText: '預約服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您好 👋", "weight": "bold", "size": "lg", "align": "center" }, { "type": "text", "text": "請問您是要預約按摩服務嗎？", "wrap": true, "size": "sm", "color": "#555555", "align": "center", "margin": "md" } ] }, "footer": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "✅ 立即預約 (Book)", "text": "Action:Booking" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "📄 服務價目 (Menu)", "text": "Menu" } } ] } } });
}

// 1. Chạy sync lần đầu khi khởi động
syncData();

// 2. ⚡ AUTO SYNC: Tự động cập nhật mỗi 60 giây (để Google không chặn)
setInterval(() => {
    console.log('[AUTO SYNC] Updating data from Sheet...');
    syncData();
}, 60000); // 60000ms = 1 phút

// --- BẮT ĐẦU ĐOẠN CODE CHỐNG NGỦ ---
app.get('/ping', (req, res) => {
    console.log('Server đã được đánh thức bởi UptimeRobot!');
    res.status(200).send('Pong! Server đang thức.');
});
// --- KẾT THÚC ĐOẠN CODE CHỐNG NGỦ ---
const port = process.env.PORT || 3000;
app.listen(port, () => { console.log(`Bot running on ${port}`); });
/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT (BACKEND SERVER)
 * VERSION: V195 (FULL LOGIC FIX - SMART SWAP INTEGRATED)
 * AUTHOR: AI ASSISTANT
 * DATE: 2026/01/09
 * FIX NOTE: 
 * - Khắc phục lỗi hiển thị text placeholder khi chọn Category.
 * - Viết lại toàn bộ luồng Booking Flow (Category -> Service -> Date -> Time -> Staff -> Confirm).
 * - Tích hợp chặt chẽ với ResourceCore V4.
 * =================================================================================================
 */

require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

// IMPORT CORE LOGIC (File resource_core.js cùng cấp - Đảm bảo file này đã update bản V4)
const ResourceCore = require('./resource_core'); 

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

// Cấu hình tài nguyên (Lấy từ Core để đồng bộ)
const MAX_CHAIRS = ResourceCore.CONFIG.MAX_CHAIRS;
const MAX_BEDS = ResourceCore.CONFIG.MAX_BEDS;
const FUTURE_BUFFER_MINS = ResourceCore.CONFIG.FUTURE_BUFFER;

// Google Auth
const auth = new google.auth.GoogleAuth({
    keyFile: 'google-key.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Global State
let SERVER_RESOURCE_STATE = {};
let SERVER_STAFF_STATUS = {};
let STAFF_LIST = [];
let cachedBookings = [];
let scheduleMap = {}; 
let userState = {}; // Lưu trạng thái người dùng tạm thời
let lastSyncTime = new Date(); 

// Dịch vụ (Sẽ được đồng bộ vào Core)
let SERVICES = ResourceCore.SERVICES; 

// =============================================================================
// PHẦN 2: CÁC HÀM HỖ TRỢ (UTILS)
// =============================================================================

function getTaipeiNow() {
    return ResourceCore.getTaipeiNow();
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

function formatDateDisplay(dateInput) {
    if (!dateInput) return "";
    try {
        let str = dateInput.toString().trim();
        if (str.match(/^\d{4}[\/\-]\d{2}[\/\-]\d{2}/)) {
            return str.replace(/-/g, '/').split(' ')[0];
        }
        let d = new Date(str);
        if (isNaN(d.getTime())) return str;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}/${m}/${day}`;
    } catch (e) { return dateInput; }
}

function getCurrentDateTimeStr() {
    const now = getTaipeiNow();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
}

// Tạo danh sách 15 ngày tới cho Quick Reply
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
    return days; 
}

// =============================================================================
// PHẦN 3: ĐỒNG BỘ DỮ LIỆU (SYNC LOGIC)
// =============================================================================

async function syncMenuData() {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${MENU_SHEET}!A2:D50` });
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

            let type = 'BED'; let category = 'BODY';
            const prefix = code.charAt(0).toUpperCase();
            if (prefix === 'A') { type = 'BED'; category = 'COMBO'; } 
            else if (prefix === 'F') { type = 'CHAIR'; category = 'FOOT'; } 
            else if (prefix === 'B') { type = 'BED'; category = 'BODY'; }

            newServices[code] = { name: name, duration: duration, type: type, category: category, price: price };
        });
        
        // Cập nhật vào Core để tính toán Logic
        ResourceCore.setDynamicServices(newServices);
        SERVICES = ResourceCore.SERVICES; 
        console.log(`[MENU] Updated: ${Object.keys(SERVICES).length} items.`);
    } catch (e) { console.error('[MENU ERROR]', e); }
}

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

                // Lưu dữ liệu thô, Core sẽ parse kỹ hơn khi cần tính toán
                cachedBookings.push({
                    rowId: i + 1, 
                    startTimeString: `${row[0]} ${row[1]}`, 
                    startTime: row[1], 
                    duration: 60, // Duration thực tế sẽ lấy từ SERVICES khi check
                    staffName: row[8], 
                    staffId: row[8],
                    serviceCode: 'UNKNOWN', // Mapping logic nếu cần
                    date: row[0], 
                    status: status, 
                    lineId: row[9]
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
                
                const staffObj = { 
                    id: cleanName, name: cleanName, gender: gender, 
                    start: row[2] || '08:00', end: row[3] || '03:00',   
                    off: false, offDays: [] 
                };
                
                const todayStr = formatDateDisplay(getTaipeiNow());
                for (let j = 4; j < headerRow.length; j++) {
                    if (headerRow[j] && row[j] && row[j].trim().toUpperCase() === 'OFF') {
                        const normalizedDate = normalizeSheetDate(headerRow[j]);
                        if (normalizedDate) {
                            if (!scheduleMap[normalizedDate]) scheduleMap[normalizedDate] = [];
                            scheduleMap[normalizedDate].push(cleanName);
                            staffObj.offDays.push(normalizedDate);
                            if (normalizedDate === todayStr) staffObj.off = true;
                        }
                    }
                }
                STAFF_LIST.push(staffObj);
            }
        }
        
        lastSyncTime = new Date();
        console.log(`[SYNC OK] Bookings: ${cachedBookings.length}, Staff: ${STAFF_LIST.length}`);
    } catch (e) { console.error('[SYNC ERROR]', e); }
}

// =============================================================================
// PHẦN 4: FLEX MESSAGE BUILDERS (UI)
// =============================================================================

function createMenuFlexMessage() {
    const createRow = (serviceName, time, price) => ({
        "type": "box", "layout": "horizontal", "contents": [
            { "type": "text", "text": serviceName, "size": "sm", "color": "#555555", "flex": 5, "wrap": true },
            { "type": "text", "text": `${time}分`, "size": "sm", "color": "#111111", "align": "end", "flex": 2 },
            { "type": "text", "text": `$${price}`, "size": "sm", "color": "#E63946", "weight": "bold", "align": "end", "flex": 3 }
        ]
    });
    const comboRows = [], footRows = [], bodyRows = [];
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

// [FIX] Hàm tạo danh sách dịch vụ chi tiết khi user chọn Category
function createServiceListBubble(category) {
    const validServices = Object.keys(SERVICES).filter(k => SERVICES[k].category === category && SERVICES[k].category !== 'SYSTEM');
    
    if (validServices.length === 0) {
        return { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "❌ Tạm không có dịch vụ", "align": "center" }] } };
    }

    const rows = validServices.map(code => {
        const svc = SERVICES[code];
        return {
            "type": "button", "style": "secondary", "height": "sm", "margin": "sm",
            "action": { "type": "message", "label": `${svc.name} ($${svc.price})`, "text": `Svc:${code}` }
        };
    });

    let title = "Danh sách dịch vụ";
    if (category === 'COMBO') title = "🔥 Chọn Gói Combo";
    if (category === 'FOOT') title = "👣 Chọn Gói Chân";
    if (category === 'BODY') title = "🛏️ Chọn Gói Body";

    return {
        "type": "bubble", 
        "body": { 
            "type": "box", "layout": "vertical", 
            "contents": [ 
                { "type": "text", "text": title, "weight": "bold", "size": "lg", "color": "#1DB446", "align": "center" }, 
                { "type": "separator", "margin": "md" }, 
                ...rows 
            ] 
        } 
    };
}

// Tạo danh sách giờ trống (Đã tích hợp ResourceCore V4)
function generateTimeBubbles(selectedDate, serviceCode, specificStaffIds = null, pax = 1) {
    const service = SERVICES[serviceCode]; if (!service) return null;
    let validSlots = [];
    
    // Lọc Staff làm việc hôm đó
    const staffListMap = {};
    STAFF_LIST.forEach(s => { if (!s.offDays.includes(selectedDate)) staffListMap[s.id] = s; });
    
    // Lấy booking liên quan
    const relevantBookings = cachedBookings.filter(b => b.date === selectedDate);
    
    // Tạo request ảo để check
    const guestList = [];
    for(let i=0; i<pax; i++) {
        // Mặc định check Any Staff nếu chưa chọn
        guestList.push({ serviceCode: serviceCode, staffName: 'Any' });
    }

    // Loop check từng giờ (08:00 -> 03:00 sáng hôm sau)
    const checkPoints = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26];
    
    checkPoints.forEach(h => {
        let hour = h >= 24 ? h - 24 : h;
        const timeStr = `${hour.toString().padStart(2,'0')}:00`;
        
        // GỌI HÀM CORE V4 ĐỂ CHECK (Bao gồm Logic Smart Swap)
        const result = ResourceCore.checkRequestAvailability(selectedDate, timeStr, guestList, relevantBookings, staffListMap);
        
        if (result.feasible) validSlots.push(h);
    });

    if (validSlots.length === 0) return null; // Full kín

    // UI Formatting
    const formatTime = (h) => { 
        const hourInt = Math.floor(h); 
        if (hourInt < 24) return `${hourInt.toString().padStart(2, '0')}:00`; 
        return `${(hourInt - 24).toString().padStart(2, '0')}:00 (Late)`; 
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

    const timeBubbles = groups.filter(g => g.slots.length > 0).map(group => {
        const buttons = group.slots.map(h => ({ 
            "type": "button", "style": "primary", "margin": "xs", "height": "sm", 
            "action": { "type": "message", "label": formatTime(h), "text": `Time:${formatValue(h)}` } 
        }));
        return { "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" }, { "type": "separator", "margin": "sm" }, ...buttons] } };
    });
    return { type: 'carousel', contents: timeBubbles };
}

function createStaffBubbles(filterFemale = false, excludedIds = []) {
    let list = STAFF_LIST;
    // Có thể thêm logic filter nếu cần
    if (!list || list.length === 0) return [{ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "No Staff Found", "align": "center" }] } }];
    
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
        bubbles.push({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "Chọn Kỹ Thuật Viên", "weight": "bold", "align": "center", "color": "#1DB446" }, { "type": "text", "text": "Màu hồng: Nữ | Màu xanh: Nam", "size": "xs", "align": "center", "color": "#aaaaaa" }, { "type": "separator", "margin": "md" }, ...rows, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "action": { "type": "message", "label": "🎲 Ngẫu nhiên (Random)", "text": "StaffSelect:隨機" } } ] } });
    }
    return bubbles;
}

// =============================================================================
// PHẦN 5: GHI SHEET & SERVER
// =============================================================================

async function ghiVaoSheet(data) {
    try {
        const timeCreate = getCurrentDateTimeStr();
        let colA_Date = formatDateDisplay(data.ngayDen);
        let colB_Time = data.gioDen;
        
        // Nếu userState chưa có thông tin chi tiết (do dùng Line Bot luồng đơn giản), ta construct lại
        const serviceName = SERVICES[data.dichVu] ? SERVICES[data.dichVu].name : data.dichVu;
        
        const valuesToWrite = [
            [ colA_Date, colB_Time, data.hoTen, serviceName, "", 1, data.sdt, '已預約', data.nhanVien, data.userId, timeCreate ]
        ];

        if (valuesToWrite.length > 0) {
            await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite } });
        }
        // Sync lại ngay để cập nhật slot
        setTimeout(syncData, 1000); 
    } catch (e) { console.error('[ERROR] Sheet Write:', e); }
}

const client = new line.Client(config);
const app = express();
app.use(cors());

// --- LINE EVENT HANDLER (FULL LOGIC) ---
async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return Promise.resolve(null);
    
    let text = event.type === 'message' ? event.message.text : event.postback.data;
    // Xử lý DatePicker Postback
    if (event.type === 'postback' && event.postback.params) {
        text = `DatePick:${event.postback.params.date}`;
    }
    
    let userId = event.source.userId;

    // 1. Kích hoạt Booking -> Reset State -> Hiện Category
    if (text === 'Action:Booking') {
        userState[userId] = { step: 'CATEGORY' };
        return client.replyMessage(event.replyToken, { 
            type: 'flex', altText: 'Category', 
            contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ 
                { "type": "text", "text": "Xin chào! Bạn muốn đặt dịch vụ gì?", "weight": "bold", "align": "center", "size": "md" },
                { "type": "separator", "margin": "md" },
                { "type": "button", "style": "primary", "margin":"md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, 
                { "type": "button", "style": "secondary", "margin": "md", "action": { "type": "message", "label": "👣 足底 (Foot)", "text": "Cat:FOOT" } }, 
                { "type": "button", "style": "secondary", "margin": "md", "action": { "type": "message", "label": "🛏️ 身體 (Body)", "text": "Cat:BODY" } } 
            ] } } 
        });
    }

    // 2. Chọn Category -> Hiện Service List [FIXED]
    if (text.startsWith('Cat:')) {
        const cat = text.split(':')[1];
        if(!userState[userId]) userState[userId] = {};
        userState[userId].category = cat;
        
        // Gọi hàm tạo Bubble danh sách dịch vụ (đã fix ở trên)
        const bubble = createServiceListBubble(cat);
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Select Service', contents: bubble });
    }

    // 3. Chọn Service -> Hỏi Ngày (Quick Reply)
    if (text.startsWith('Svc:')) {
        const code = text.split(':')[1];
        if(!userState[userId]) userState[userId] = {};
        userState[userId].serviceCode = code;
        
        const days = getNext15Days();
        // Tạo Quick Reply chọn ngày
        const quickReplyItems = days.map(d => ({
            type: 'action', action: { type: 'postback', label: d.label, data: `DatePick:${d.value}`, displayText: `Chọn ngày: ${d.value}` }
        }));
        // Thêm nút mở lịch Calendar native
        quickReplyItems.push({
            type: 'action', action: { type: 'datetimepicker', label: "📅 Lịch khác", data: "DatePick:Manual", mode: "date" }
        });

        return client.replyMessage(event.replyToken, {
            type: 'text', text: `Bạn đã chọn: ${SERVICES[code].name}\nVui lòng chọn ngày đến:`,
            quickReply: { items: quickReplyItems }
        });
    }

    // 4. Chọn Ngày -> Hiện Giờ (Carousel)
    if (text.startsWith('DatePick:')) {
        const dateVal = text.split(':')[1];
        if(!userState[userId]) userState[userId] = {};
        userState[userId].date = dateVal;

        // Gọi hàm generateTimeBubbles (Đã dùng ResourceCore V4)
        // Mặc định pax = 1 cho Line Bot đơn giản
        const bubbles = generateTimeBubbles(dateVal, userState[userId].serviceCode, null, 1);
        
        if (!bubbles) {
            return client.replyMessage(event.replyToken, { type: 'text', text: `Rất tiếc, ngày ${dateVal} đã kín lịch hoặc không có giờ phù hợp. Vui lòng chọn ngày khác.` });
        }
        
        return client.replyMessage(event.replyToken, { 
            type: 'flex', altText: 'Select Time', contents: bubbles 
        });
    }

    // 5. Chọn Giờ -> Chọn Staff
    if (text.startsWith('Time:')) {
        const timeVal = text.split(':')[1];
        if(!userState[userId]) userState[userId] = {};
        userState[userId].time = timeVal;

        // Hiện danh sách Staff
        const staffBubbles = createStaffBubbles();
        return client.replyMessage(event.replyToken, { 
            type: 'flex', altText: 'Select Staff', contents: { type: 'carousel', contents: staffBubbles } 
        });
    }

    // 6. Chọn Staff -> Xác nhận & Lưu
    if (text.startsWith('StaffSelect:')) {
        const staffId = text.split(':')[1];
        if(!userState[userId]) return; // Session expired or invalid
        userState[userId].staff = staffId;
        
        // Lấy thông tin user
        const profile = await client.getProfile(userId);
        const displayName = profile.displayName;

        // Tạo payload lưu
        const bookingData = {
            hoTen: displayName,
            sdt: "LineUser", // Line không lấy được sdt trực tiếp
            dichVu: userState[userId].serviceCode,
            pax: 1,
            ngayDen: userState[userId].date,
            gioDen: userState[userId].time,
            nhanVien: staffId,
            userId: userId
        };

        // Ghi vào sheet
        await ghiVaoSheet(bookingData);

        // Reply Success
        const svcName = SERVICES[userState[userId].serviceCode].name;
        const msg = `✅ Đặt lịch thành công!\n\n📅 Ngày: ${bookingData.ngayDen}\n⏰ Giờ: ${bookingData.gioDen}\n💆 Dv: ${svcName}\n👤 KTV: ${staffId}\n\nCảm ơn bạn đã ủng hộ!`;
        
        // Clear state
        userState[userId] = {};
        
        return client.replyMessage(event.replyToken, { type: 'text', text: msg });
    }

    // Default: Show Menu nếu không khớp lệnh nào
    return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Welcome', contents: createMenuFlexMessage() });
}

// --- SERVER SETUP ---
app.post('/callback', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent)).then((r) => res.json(r)).catch((e) => { console.error(e); res.status(500).end(); });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
// API cho Web Admin (nếu có)
app.get('/api/info', (req, res) => { res.json({ staffList: STAFF_LIST, bookings: cachedBookings, services: SERVICES }); });

// 1. Initial Sync
syncData();
// 2. Auto Sync (60s)
setInterval(() => { console.log('[AUTO SYNC]...'); syncData(); }, 60000);
// 3. Ping
app.get('/ping', (req, res) => res.status(200).send('Pong!'));

const port = process.env.PORT || 3000;
app.listen(port, () => { console.log(`Bot running on ${port}`); });
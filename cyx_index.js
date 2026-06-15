/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT (BACKEND SERVER - MAIN ENTRY)
 * VERSION: V134 (FAIL-SAFE & ANTI SILENT FAILURE)
 * DESCRIPTION: MAIN CONTROLLER & ROUTER
 * * UPDATES IN THIS VERSION:
 * 1. [CRITICAL FIX] Đảo ngược trình tự xử lý: Bắt buộc ghi Google Sheet thành công (isSaved = true) 
 * mới gửi tin nhắn xác nhận cho khách hàng. Chống lỗi báo thành công ảo (Silent Failure).
 * 2. [FEATURE] Thêm cảnh báo cho cả Khách hàng và Admin khi Sheet API bị lỗi/từ chối.
 * * AUTHOR: AI ASSISTANT & USER
 * =================================================================================================
 */

require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const cors = require('cors');
const path = require('path');
const https = require('https'); // Thêm module https để phục vụ Anti-Hibernation
const http = require('http');   // Thêm module http để phục vụ Anti-Hibernation
const fs = require('fs');       // Thêm module fs để lưu trữ trạng thái nhắc nhở

// --- IMPORT MODULES ---
const ResourceCore = require('./cyx_resource_core');
const StaffBot = require('./cyx_staff_bot');
const SheetService = require('./cyx_sheet_service'); // Module Sheet Service: Single Source of Truth

// Lấy thông số cấu hình động từ cyx_data để tự động cập nhật không cần restart
let cachedConfig = null;
let lastConfigLoadTime = 0;
const CONFIG_CACHE_TTL = 10000; // 10 giây cache

function getConfig() {
    const now = Date.now();
    if (!cachedConfig || (now - lastConfigLoadTime > CONFIG_CACHE_TTL)) {
        try {
            delete require.cache[require.resolve('./cyx_data.js')];
            cachedConfig = require('./cyx_data.js').SYSTEM_CONFIG;
            lastConfigLoadTime = now;
        } catch (e) {
            console.error('[getConfig] Error loading cyx_data.js in index, using cached config:', e);
            if (!cachedConfig) {
                cachedConfig = require('./cyx_data.js').SYSTEM_CONFIG;
            }
        }
    }
    return cachedConfig;
}

// --- 1. CẤU HÌNH HỆ THỐNG (SYSTEM CONFIG) ---
const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};

const ID_BA_CHU = process.env.ID_BA_CHU;

// --- 2. GLOBAL STATE (CACHE ONLY) ---
let SERVER_RESOURCE_STATE = {};
let SERVER_STAFF_STATUS = {};
let userState = {};

// =============================================================================
// PHẦN 3: CÁC HÀM TIỆN ÍCH BOT KHÁCH HÀNG (CUSTOMER BOT UTILS)
// =============================================================================

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

function formatDateDisplay(dateInput) {
    return SheetService.normalizeDateStrict(dateInput);
}

// Tạo danh sách 15 ngày tới cho khách chọn
function getNext15Days() {
    let days = [];
    const t = SheetService.getTaipeiNow();
    t.setHours(0, 0, 0, 0);

    const todayYear = t.getFullYear();
    const todayMonth = (t.getMonth() + 1).toString().padStart(2, '0');
    const todayDay = t.getDate().toString().padStart(2, '0');
    const todayVal = `${todayYear}/${todayMonth}/${todayDay}`;
    const weekdayArr = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

    days.push({
        label: `今天${todayMonth}/${todayDay}(${weekdayArr[t.getDay()]})`,
        value: todayVal
    });

    for (let i = 1; i < 15; i++) {
        let d = new Date(t);
        d.setDate(t.getDate() + i);

        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const v = `${year}/${month}/${day}`;

        const wStr = weekdayArr[d.getDay()];
        let l = `${d.getMonth() + 1}/${d.getDate()}(${wStr})`;

        if (i === 1) l = `明天${d.getMonth() + 1}/${d.getDate()}(${wStr})`;

        days.push({ label: l, value: v });
    }
    return days.reverse();
}

// --- BỘ LỌC TUYỆT ĐỐI ±8 TIẾNG (Chống vẽ đè ca đêm) ---
function prepareBookingsForTimeline(bookings, opDateCheck) {
    const dParts = opDateCheck.replace(/\//g, '-').split('-');
    const refDateObj = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10), 0, 0, 0);
    const refTimeMs = refDateObj.getTime();
    
    // We want bookings from a 48-hour window around opDateCheck to cover all possible +-8h slots
    const MIN_MS = refTimeMs - (12 * 60 * 60 * 1000);
    const MAX_MS = refTimeMs + (36 * 60 * 60 * 1000);
    
    return bookings.filter(b => {
        if (!b || !b.startTimeString) return false;
        const isInactive = b.status && (
            b.status.includes('hủy') || b.status.includes('Cancel') || b.status.includes('取消') ||
            b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅')
        );
        if (isInactive) return false;
        
        let bDateObj;
        try { bDateObj = new Date(b.startTimeString.replace(/\//g, '-')); } catch(e) {}
        if (!bDateObj || isNaN(bDateObj.getTime())) {
            let bOpDate = b.opDate || b.startTimeString.split(' ')[0];
            return SheetService.normalizeDateStrict(bOpDate) === opDateCheck;
        }
        
        const bTimeMs = bDateObj.getTime();
        return bTimeMs >= MIN_MS && bTimeMs <= MAX_MS;
    }).map(b => {
        let bDateObj = new Date(b.startTimeString.replace(/\//g, '-'));
        const diffMins = Math.round((bDateObj.getTime() - refTimeMs) / 60000);
        
        let h_final = Math.floor(diffMins / 60);
        let m = diffMins % 60;
        if (m < 0) { m += 60; h_final -= 1; }
        
        let h_str = h_final < 8 ? h_final - 24 : h_final;
        let mappedStartTime = `${h_str}:${String(m).padStart(2, '0')}`;
        
        return { ...b, startTimeString: mappedStartTime, startTime: mappedStartTime, originalStartTime: b.startTimeString };
    });
}

// Thuật toán tìm giờ trống tốt nhất (Sử dụng ResourceCore)
function findBestSlots(selectedDate, serviceCode, guestPrefs, travelTime = 0) {
    const STAFF_LIST = SheetService.getStaffList();
    const isSystemHealthy = SheetService.getIsSystemHealthy();
    const cachedBookings = SheetService.getBookings();

    if (!isSystemHealthy || STAFF_LIST.length === 0) return [];

    const cleanSelectedDate = SheetService.normalizeDateStrict(selectedDate);
    if (!cleanSelectedDate) return [];

    const nowTaipei = SheetService.getTaipeiNow();
    const dateParts = cleanSelectedDate.split('/');
    const sYear = parseInt(dateParts[0]);
    const sMonth = parseInt(dateParts[1]);
    const sDay = parseInt(dateParts[2]);

    // Chuẩn bị ngày hôm qua cho ca đêm
    const tempD = new Date(cleanSelectedDate);
    tempD.setDate(tempD.getDate() - 1);
    const cleanYesterdayDate = SheetService.normalizeDateStrict(tempD);

    const staffListMapToday = {};
    STAFF_LIST.forEach(s => {
        if (!s.offDays.includes(cleanSelectedDate)) {
            staffListMapToday[s.id] = s;
        }
    });

    const staffListMapYesterday = {};
    STAFF_LIST.forEach(s => {
        if (!s.offDays.includes(cleanYesterdayDate)) {
            staffListMapYesterday[s.id] = s;
        }
    });

    const relevantBookingsToday = prepareBookingsForTimeline(cachedBookings, cleanSelectedDate);
    const relevantBookingsYesterday = prepareBookingsForTimeline(cachedBookings, cleanYesterdayDate);

    const guestList = [];
    guestPrefs.forEach(pref => {
        let sId = 'RANDOM';
        if (pref.type === 'SPECIFIC') sId = pref.staffId;
        else if (pref.type === 'MALE') sId = 'MALE';
        else if (pref.type === 'FEMALE') sId = 'FEMALE';
        else if (pref.type === 'OIL') sId = 'FEMALE';
        guestList.push({ serviceCode: serviceCode, staffName: sId, staff: sId, flow: null });
    });

    let candidates = [];
    const openHour = getConfig().OPERATION_TIME.OPEN_HOUR || 8;
    const minTimeMs = nowTaipei.getTime() + (travelTime * 60000);

    for (let h = 0; h < 24; h += 1) {
        for (let m = 0; m < 60; m += 20) {
            const slotTime = new Date(sYear, sMonth - 1, sDay, h, m, 0);
            if (slotTime.getTime() <= minTimeMs) continue;

            const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            const isNightShift = h < openHour;
            const activeBookings = isNightShift ? relevantBookingsYesterday : relevantBookingsToday;
            const activeStaffMap = isNightShift ? staffListMapYesterday : staffListMapToday;

            const result = ResourceCore.checkRequestAvailability(cleanSelectedDate, timeStr, guestList, activeBookings, activeStaffMap);
            if (result.feasible) candidates.push({ timeStr: timeStr, sortVal: h * 60 + m, score: 10, label: `${timeStr}` });
        }
    }
    candidates.sort((a, b) => a.sortVal - b.sortVal);
    return candidates.slice(0, 6);
}

// Tạo Bubble chọn giờ (Time Bubbles)
function generateTimeBubbles(selectedDate, serviceCode, guestPrefs, travelTime = 0) {
    const STAFF_LIST = SheetService.getStaffList();
    const isSystemHealthy = SheetService.getIsSystemHealthy();
    const cachedBookings = SheetService.getBookings();

    if (!isSystemHealthy || STAFF_LIST.length === 0) return null;
    const cleanSelectedDate = SheetService.normalizeDateStrict(selectedDate);
    if (!cleanSelectedDate) return null;

    const nowTaipei = SheetService.getTaipeiNow();
    const dateParts = cleanSelectedDate.split('/');
    const sYear = parseInt(dateParts[0]);
    const sMonth = parseInt(dateParts[1]);
    const sDay = parseInt(dateParts[2]);

    // Chuẩn bị ngày hôm qua cho ca đêm
    const tempD = new Date(cleanSelectedDate);
    tempD.setDate(tempD.getDate() - 1);
    const cleanYesterdayDate = SheetService.normalizeDateStrict(tempD);

    let validSlots = [];
    const staffListMapToday = {};
    STAFF_LIST.forEach(s => {
        if (!s.offDays.includes(cleanSelectedDate)) {
            staffListMapToday[s.id] = s;
        }
    });

    const staffListMapYesterday = {};
    STAFF_LIST.forEach(s => {
        if (!s.offDays.includes(cleanYesterdayDate)) {
            staffListMapYesterday[s.id] = s;
        }
    });

    const relevantBookingsToday = prepareBookingsForTimeline(cachedBookings, cleanSelectedDate);
    const relevantBookingsYesterday = prepareBookingsForTimeline(cachedBookings, cleanYesterdayDate);

    const guestList = [];
    guestPrefs.forEach(pref => {
        let sId = 'RANDOM';
        if (pref.type === 'SPECIFIC') sId = pref.staffId;
        else if (pref.type === 'MALE') sId = 'MALE';
        else if (pref.type === 'FEMALE') sId = 'FEMALE';
        else if (pref.type === 'OIL') sId = 'FEMALE';
        guestList.push({ serviceCode: serviceCode, staffName: sId, staff: sId, flow: null });
    });

    const openHour = getConfig().OPERATION_TIME.OPEN_HOUR || 8;
    const minTimeMs = nowTaipei.getTime() + (travelTime * 60000);

    for (let h = 0; h < 24; h += 1) {
        for (let m = 0; m < 60; m += 20) {
            const slotTime = new Date(sYear, sMonth - 1, sDay, h, m, 0);
            if (slotTime.getTime() <= minTimeMs) continue;

            const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            const isNightShift = h < openHour;
            const activeBookings = isNightShift ? relevantBookingsYesterday : relevantBookingsToday;
            const activeStaffMap = isNightShift ? staffListMapYesterday : staffListMapToday;

            const result = ResourceCore.checkRequestAvailability(cleanSelectedDate, timeStr, guestList, activeBookings, activeStaffMap);
            if (result.feasible) validSlots.push({ h, m, timeStr });
        }
    }

    if (validSlots.length === 0) return null;

    validSlots.sort((a, b) => (a.h * 60 + a.m) - (b.h * 60 + b.m));

    const groups = [
        { name: '🦉 凌晨', slots: validSlots.filter(v => v.h >= 0 && v.h < openHour) },
        { name: '🌞 早安', slots: validSlots.filter(v => v.h >= openHour && v.h < 12) },
        { name: '☀️ 午後', slots: validSlots.filter(v => v.h >= 12 && v.h < 18) },
        { name: '🌙 晚安', slots: validSlots.filter(v => v.h >= 18 && v.h <= 23) }
    ];

    let bubbles = [];
    bubbles.push({
        "type": "bubble", "size": "kilo",
        "body": {
            "type": "box", "layout": "vertical", "backgroundColor": "#F0F9FF", "cornerRadius": "lg",
            "contents": [
                { "type": "text", "text": "💎 智能預約", "weight": "bold", "color": "#0284C7", "align": "center", "size": "xs" },
                { "type": "text", "text": "精選推薦時段", "weight": "bold", "size": "md", "align": "center", "margin": "xs" },
                { "type": "button", "style": "primary", "color": "#0EA5E9", "margin": "md", "height": "sm", "action": { "type": "message", "label": "⭐ 最佳推薦", "text": "Time:Suggest" } }
            ]
        }
    });

    const timeBubbles = groups.filter(g => g.slots.length > 0).map(group => {
        const slotButtons = group.slots.map(v => ({
            "type": "button", "style": "primary", "margin": "xs", "height": "sm",
            "action": { "type": "message", "label": v.timeStr, "text": `Time:${v.timeStr}` }
        }));
        
        const rows = [];
        for (let i = 0; i < slotButtons.length; i += 2) {
            const rowContents = [slotButtons[i]];
            if (i + 1 < slotButtons.length) rowContents.push(slotButtons[i + 1]);
            else rowContents.push({ "type": "box", "layout": "vertical", "flex": 1, "contents": [] });
            rows.push({ "type": "box", "layout": "horizontal", "spacing": "sm", "margin": "xs", "contents": rowContents });
        }

        return {
            "type": "bubble", "size": "kilo",
            "body": {
                "type": "box", "layout": "vertical",
                "contents": [
                    { "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" },
                    { "type": "separator", "margin": "sm" },
                    ...rows
                ]
            }
        };
    });

    return { type: 'carousel', contents: [...bubbles, ...timeBubbles] };
}

// Tạo Bubble chọn nhân viên (Staff Bubbles)
function createStaffBubbles(filterFemale = false, excludedIds = []) {
    let list = SheetService.getStaffList();
    if (filterFemale) list = list.filter(s => s.gender === 'F' || s.gender === '女');
    if (excludedIds && excludedIds.length > 0) list = list.filter(s => !excludedIds.includes(s.id));
    if (!list || list.length === 0) return [{ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": filterFemale ? "無女技師" : "無其他技師", "align": "center" }] } }];

    // Khối chú thích (Legend Box)
    const legendBox = {
        "type": "box",
        "layout": "horizontal",
        "margin": "md",
        "spacing": "sm",
        "justifyContent": "center",
        "contents": [
            {
                "type": "box", "layout": "horizontal", "spacing": "sm", "alignItems": "center",
                "contents": [
                    { "type": "box", "layout": "vertical", "width": "12px", "height": "12px", "backgroundColor": "#90CAF9", "cornerRadius": "2px", "contents": [] },
                    { "type": "text", "text": "男師傅", "size": "xs", "color": "#555555", "flex": 0 }
                ]
            },
            {
                "type": "box", "layout": "horizontal", "spacing": "sm", "alignItems": "center",
                "contents": [
                    { "type": "box", "layout": "vertical", "width": "12px", "height": "12px", "backgroundColor": "#F48FB1", "cornerRadius": "2px", "contents": [] },
                    { "type": "text", "text": "女師傅", "size": "xs", "color": "#555555", "flex": 0 }
                ]
            }
        ]
    };

    const bubbles = [];
    const chunkSize = 16;

    for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        const rows = [];
        for (let j = 0; j < chunk.length; j += 4) {
            const rowItems = chunk.slice(j, j + 4);

            const rowButtons = rowItems.map(s => {
                let numMatch = s.name.match(/\d+/);
                let displayName = s.name;
                if (numMatch) {
                    let num = parseInt(numMatch[0], 10);
                    displayName = num < 10 ? `0${num}` : `${num}`;
                }

                return {
                    "type": "button",
                    "style": "secondary",
                    "color": (s.gender === 'F' || s.gender === '女') ? "#F48FB1" : "#90CAF9",
                    "height": "sm",
                    "margin": "xs",
                    "flex": 1,
                    "action": { "type": "message", "label": displayName, "text": `StaffSelect:${s.id}` }
                };
            });

            while (rowButtons.length < 4) {
                rowButtons.push({ "type": "box", "layout": "vertical", "flex": 1, "contents": [] });
            }

            rows.push({ "type": "box", "layout": "horizontal", "spacing": "xs", "contents": rowButtons });
        }

        bubbles.push({
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    { "type": "text", "text": filterFemale ? "選擇女技師" : "指定技師", "weight": "bold", "align": "center", "color": "#1DB446" },
                    legendBox,
                    { "type": "separator", "margin": "md" },
                    ...rows
                ]
            }
        });
    }
    return bubbles;
}

// Tạo Menu dịch vụ
function createMenuFlexMessage() {
    const SERVICES = SheetService.getServices();
    const createRow = (serviceName, time, price) => ({ "type": "box", "layout": "horizontal", "contents": [{ "type": "text", "text": serviceName, "size": "sm", "color": "#555555", "flex": 5 }, { "type": "text", "text": `${time}分`, "size": "sm", "color": "#111111", "align": "end", "flex": 2 }, { "type": "text", "text": `$${price}`, "size": "sm", "color": "#E63946", "weight": "bold", "align": "end", "flex": 3 }] });
    const comboRows = []; const footRows = []; const bodyRows = [];
    Object.values(SERVICES).forEach(svc => {
        if (svc.category === 'SYSTEM') return;
        const row = createRow(svc.name, svc.duration, svc.price);
        if (svc.category === 'COMBO') comboRows.push(row); else if (svc.category === 'FOOT') footRows.push(row); else bodyRows.push(row);
    });
    return { "type": "bubble", "size": "mega", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "📜 服務價目表", "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center", "margin": "md" }, { "type": "separator", "margin": "lg" }, { "type": "text", "text": "🔥 熱門套餐", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...comboRows, { "type": "text", "text": "👣 足底按摩", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...footRows, { "type": "text", "text": "🛏️ 身體指壓", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...bodyRows, { "type": "separator", "margin": "xl" }, { "type": "text", "text": `⭐ 油推需加收 $${getConfig().FINANCE.OIL_BONUS}，請詢問櫃台。`, "size": "xs", "color": "#aaaaaa", "margin": "md", "align": "center" }] }, "footer": { "type": "box", "layout": "vertical", "contents": [{ "type": "button", "style": "primary", "action": { "type": "message", "label": "📅 立即預約", "text": "Action:Booking" } }] } };
}

// =============================================================================
// PHẦN 4: SERVER & API INTEGRATION (CẦU NỐI CHÍNH)
// =============================================================================

const client = new line.Client(config);
const app = express();
app.use(cors());

// --- ROUTE CHO BOT KHÁCH HÀNG (CUSTOMER BOT) ---
app.post('/callback', line.middleware(config), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((r) => res.json(r))
        .catch((e) => {
            console.error('[LINE CUSTOMER BOT ERROR]', e);
            res.status(500).end();
        });
});

// --- ROUTE CHO BOT NHÂN VIÊN (STAFF BOT) - CRITICAL BRIDGE ---
app.post('/callback-staff', StaffBot.middleware(StaffBot.config), (req, res) => {
    Promise.all(req.body.events.map(event => {

        const staffBotContext = {
            ghiVaoSheet: SheetService.ghiVaoSheet,
            normalizeDateStrict: SheetService.normalizeDateStrict,
            getTaipeiNow: SheetService.getTaipeiNow,
            formatDateTimeString: SheetService.formatDateTimeString,
            STAFF_LIST: SheetService.getStaffList(),
            ID_BA_CHU: ID_BA_CHU,
            clientMain: client,

            findStaffRowByLineId: SheetService.findStaffByLineId,

            updateScheduleCell: async (dateStr, staffName, value) => {
                const userId = event.source.userId;
                return await SheetService.updateScheduleCell(userId, dateStr, value);
            },

            updateDailyStatus: async (staffName, dateStr, type, startVal, endVal) => {
                const userId = event.source.userId;
                return await SheetService.updateDailyActivity(userId, type, startVal, endVal);
            }
        };

        return StaffBot.handleEvent(event, staffBotContext);
    }))
        .then((r) => res.json(r))
        .catch((e) => {
            console.error('[STAFF BOT ERROR - BRIDGE]', e);
            res.status(500).end();
        });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin2', express.static(path.join(__dirname, 'XinWuChanAdmin')));

// Serve cyx_data.js dynamically to frontend so it doesn't 404
app.get('/admin2/js/cyx_data.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'cyx_data.js'));
});
app.get('/js/cyx_data.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'cyx_data.js'));
});

// --- API: INFO ---
app.get('/api/info', async (req, res) => {
    try {
        const isForceRefresh = req.query.forceRefresh === 'true';
        if (isForceRefresh) {
            await SheetService.syncData();
        }
        res.json({
            staffList: SheetService.getStaffList(),
            bookings: SheetService.getBookings(),
            schedule: SheetService.getScheduleMap(),
            resources: { chairs: getConfig().SCALE.MAX_CHAIRS, beds: getConfig().SCALE.MAX_BEDS, oppChairs: getConfig().SCALE.OPP_CHAIRS || 4, oppBeds: getConfig().SCALE.OPP_BEDS || 6 },
            resourceState: SERVER_RESOURCE_STATE,
            staffStatus: SERVER_STAFF_STATUS,
            services: SheetService.getServices(),
            lastUpdated: SheetService.getLastSyncTime(),
            isSystemHealthy: SheetService.getIsSystemHealthy(),
            matrixDebug: SheetService.getMatrixDebug(),
            blacklist: SheetService.getBlacklist(),
            quickNotes: SheetService.getQuickNotes()
        });
    } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
});

// --- API: STAFF LOGIN ---
app.post('/api/staff-login', (req, res) => {
    try {
        const { staffId, pin } = req.body;
        const configPin = process.env.STAFF_PORTAL_PIN || '8888';
        
        if (!staffId || !pin) {
            return res.status(400).json({ error: "技師工號與密碼不能為空" });
        }
        
        if (pin.toString().trim() !== configPin.toString().trim()) {
            return res.status(401).json({ error: "安全密碼錯誤" });
        }
        
        // Chuẩn hóa staffId
        const cleanId = String(staffId).trim().toUpperCase();
        const normalizeStaffId = (id) => {
            if (!id) return "";
            const strId = String(id).trim();
            if (/^0+\d+$/.test(strId)) return parseInt(strId, 10).toString();
            return strId;
        };
        const normTarget = normalizeStaffId(cleanId);
        
        const staffList = SheetService.getStaffList() || [];
        const found = staffList.find(s => {
            const sId = normalizeStaffId(s.id).toUpperCase();
            const sName = String(s.name || '').trim().toUpperCase();
            return sId === normTarget || sName === normTarget;
        });
        
        if (!found) {
            return res.status(404).json({ error: "查無此技師工號" });
        }
        
        res.json({
            success: true,
            staff: {
                id: found.id,
                name: found.name,
                gender: found.gender || 'F',
                start: found.start,
                end: found.end,
                off: found.off
            }
        });
    } catch (e) {
        console.error("Staff login error:", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- API: STAFF SCHEDULE ---
app.get('/api/staff-schedule', async (req, res) => {
    try {
        const rawStaffId = req.query.staffId;
        if (!rawStaffId) {
            return res.status(400).json({ error: "缺少技師工號" });
        }
        
        // Chuẩn hóa staffId
        const normalizeStaffId = (id) => {
            if (!id) return "";
            const strId = String(id).trim();
            if (/^0+\d+$/.test(strId)) return parseInt(strId, 10).toString();
            return strId;
        };
        const targetId = normalizeStaffId(rawStaffId).toUpperCase();
        
        // 1. Lấy thông tin kỹ thuật viên
        const staffList = SheetService.getStaffList() || [];
        const staffInfo = staffList.find(s => normalizeStaffId(s.id).toUpperCase() === targetId);
        
        if (!staffInfo) {
            return res.status(404).json({ error: "找不到該技師的排班資訊" });
        }
        
        // 2. Lấy danh sách booking trong ngày hôm nay
        const bookings = SheetService.getBookings() || [];
        const staffStatusMap = SERVER_STAFF_STATUS || {};
        const currentStaffStatus = staffStatusMap[staffInfo.id] || { status: staffInfo.off ? 'AWAY' : 'READY', stafftime: Date.now() };
        
        // 3. Lọc bookings liên quan đến kỹ thuật viên này
        const myBookings = [];
        
        // Helper lọc
        bookings.forEach(b => {
            // Loại bỏ các booking đã bị hủy hoặc noshow hoặc done
            const statusRaw = String(b.status || '');
            const isCancelled = statusRaw.toLowerCase().includes('cancel') || statusRaw.includes('取消') || statusRaw.includes('爽約') || statusRaw.toUpperCase().includes('NOSHOW');
            const isDone = statusRaw.includes('完成') || statusRaw.includes('Done') || statusRaw.includes('✅');
            
            if (isCancelled || isDone) return;
            
            // So khớp tên/id kỹ thuật viên
            const staffCols = [
                b.serviceStaff, b.staffId, b.staffId2, b.staffId3, 
                b.staffId4, b.staffId5, b.staffId6, b.ServiceStaff, b.technician
            ].map(s => s ? normalizeStaffId(s).toUpperCase() : '');
            
            if (staffCols.includes(targetId)) {
                myBookings.push(b);
            }
        });
        
        // 4. Xử lý chi tiết từng booking (thời gian bắt đầu, kết thúc, vị trí) cho kỹ thuật viên này
        // Tương tự logic getSmartSplit trên client và ResourceCore
        const scheduleSlots = [];
        
        const openHour = getConfig().OPERATION_TIME?.OPEN_HOUR || 5;
        const timeStrToMins = (str) => {
            if (!str) return -1;
            try {
                if (str.includes(' ')) str = str.split(' ')[1];
                const parts = str.split(':');
                let h = parseInt(parts[0], 10);
                let m = parseInt(parts[1], 10);
                if (h < openHour) h += 24;
                return h * 60 + m;
            } catch (e) { return -1; }
        };
        const minsToTimeStr = (mins) => {
            let h = Math.floor(mins / 60);
            let m = mins % 60;
            if (h >= 24) h -= 24;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };
        
        // Duyệt qua từng booking của nhân viên này để tính toán slot cụ thể
        myBookings.forEach(b => {
            const startMins = timeStrToMins(b.startTime || b.gioDen);
            if (startMins === -1) return;
            
            const duration = parseInt(b.duration) || 60;
            const isCombo = b.category === 'COMBO' || (b.serviceName && b.serviceName.includes('套餐'));
            
            // Chia giai đoạn
            let p1 = Math.floor(duration / 2);
            let p2 = duration - p1;
            if (b.phase1_duration !== undefined && b.phase1_duration !== "" && b.phase1_duration !== null) {
                p1 = parseInt(b.phase1_duration);
            }
            if (b.phase2_duration !== undefined && b.phase2_duration !== "" && b.phase2_duration !== null) {
                p2 = parseInt(b.phase2_duration);
            }
            
            const transitionBuffer = getConfig().BUFFERS?.TRANSITION_MINUTES || 5;
            const realDuration = isCombo ? (p1 + p2 + transitionBuffer) : duration;
            const endMins = startMins + realDuration;
            
            // Xác định kỹ thuật viên này đảm nhận vai trò gì (Staff 1, 2, hay 3...)
            const staffCols = [
                b.serviceStaff, b.staffId, b.staffId2, b.staffId3, 
                b.staffId4, b.staffId5, b.staffId6, b.ServiceStaff, b.technician
            ].map(s => s ? normalizeStaffId(s).toUpperCase() : '');
            
            let staffIndex = 0; // 0 là staff1, 1 là staff2...
            for (let i = 0; i < staffCols.length; i++) {
                if (staffCols[i] === targetId) {
                    if (i < 2 || i === 7 || i === 8) staffIndex = 0; // serviceStaff, staffId, ServiceStaff, technician
                    else if (i === 2) staffIndex = 1; // staffId2
                    else if (i === 3) staffIndex = 2; // staffId3
                    else if (i === 4) staffIndex = 3; // staffId4
                    else if (i === 5) staffIndex = 4; // staffId5
                    else if (i === 6) staffIndex = 5; // staffId6
                    break;
                }
            }
            
            // Lấy phân bổ tài nguyên thực tế cho khách hàng tương ứng với index này
            // b.guestDetails chứa phân bổ tài nguyên của từng khách trong nhóm
            const guestIndex = Math.min(staffIndex, (b.guestDetails || []).length - 1);
            const guestDetail = (b.guestDetails && b.guestDetails.length > 0) ? b.guestDetails[Math.max(0, guestIndex)] : null;
            
            let phase1Location = guestDetail ? (guestDetail.phase1_res_idx || guestDetail.phase1_resource || b.phase1_res_idx || b.location || b.current_resource_id) : (b.phase1_res_idx || b.location || b.current_resource_id);
            let phase2Location = guestDetail ? (guestDetail.phase2_res_idx || guestDetail.phase2_resource || b.phase2_res_idx) : b.phase2_res_idx;
            
            if (!phase1Location && b.allocated_resource) {
                phase1Location = b.allocated_resource.split('+')[0].trim();
            }
            if (!phase2Location && b.allocated_resource && b.allocated_resource.includes('+')) {
                phase2Location = b.allocated_resource.split('+')[1].trim();
            }
            
            const seq = b.flow || 'FB';
            
            if (isCombo) {
                // Ca Combo: Gồm hai phase riêng biệt
                const p1EndMins = startMins + p1;
                const p2StartMins = p1EndMins + transitionBuffer;
                const p2EndMins = p2StartMins + p2;
                
                // Add Phase 1 slot
                scheduleSlots.push({
                    bookingId: b.rowId,
                    customerName: b.customerName || '顧客',
                    serviceName: b.serviceName || '項目',
                    phase: 1,
                    startTime: minsToTimeStr(startMins),
                    endTime: minsToTimeStr(p1EndMins),
                    startMins: startMins,
                    endMins: p1EndMins,
                    location: phase1Location ? phase1Location.toUpperCase() : '座位',
                    isCombo: true,
                    status: b.status
                });
                
                // Add Phase 2 slot
                scheduleSlots.push({
                    bookingId: b.rowId,
                    customerName: b.customerName || '顧客',
                    serviceName: b.serviceName || '項目',
                    phase: 2,
                    startTime: minsToTimeStr(p2StartMins),
                    endTime: minsToTimeStr(p2EndMins),
                    startMins: p2StartMins,
                    endMins: p2EndMins,
                    location: phase2Location ? phase2Location.toUpperCase() : '床位',
                    isCombo: true,
                    status: b.status
                });
            } else {
                // Ca đơn lẻ (Single)
                scheduleSlots.push({
                    bookingId: b.rowId,
                    customerName: b.customerName || '顧客',
                    serviceName: b.serviceName || '項目',
                    phase: 1,
                    startTime: minsToTimeStr(startMins),
                    endTime: minsToTimeStr(endMins),
                    startMins: startMins,
                    endMins: endMins,
                    location: phase1Location ? phase1Location.toUpperCase() : (b.flow === 'BODYSINGLE' ? '床位' : '座位'),
                    isCombo: false,
                    status: b.status
                });
            }
        });
        
        // Sắp xếp các slot theo thời gian
        scheduleSlots.sort((a, b) => a.startMins - b.startMins);
        
        // 5. Xác định vị trí hiện tại và ca bận tiếp theo để tạo cảnh báo dịch chuyển
        const nowObj = (typeof getTaipeiDate === 'function') ? getTaipeiDate() : new Date();
        const currentMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < openHour ? 1440 : 0);
        
        let currentSlot = null;
        let nextSlot = null;
        
        for (let i = 0; i < scheduleSlots.length; i++) {
            const slot = scheduleSlots[i];
            if (currentMins >= slot.startMins && currentMins < slot.endMins) {
                currentSlot = slot;
            } else if (slot.startMins > currentMins) {
                if (!nextSlot || slot.startMins < nextSlot.startMins) {
                    nextSlot = slot;
                }
            }
        }
        
        // 6. Tính toán cảnh báo dịch chuyển (Transitions)
        // Nếu vị trí ca tiếp theo khác vị trí hiện tại -> Đưa ra nhắc nhở dịch chuyển vị trí làm việc
        let transitionAlert = null;
        if (currentSlot && nextSlot && currentSlot.location !== nextSlot.location) {
            transitionAlert = {
                fromLocation: currentSlot.location,
                toLocation: nextSlot.location,
                switchTime: currentSlot.endTime,
                nextCustomer: nextSlot.customerName,
                message: `⚠️ 轉移提醒：請於 ${currentSlot.endTime} 結束當前服務後，移至 ${nextSlot.location} 服務 ${nextSlot.customerName}`
            };
        } else if (!currentSlot && nextSlot) {
            // Nếu hiện tại đang rảnh nhưng sắp có ca mới
            transitionAlert = {
                fromLocation: '空閒',
                toLocation: nextSlot.location,
                switchTime: nextSlot.startTime,
                nextCustomer: nextSlot.customerName,
                message: `📢 下一任務提醒：請於 ${nextSlot.startTime} 前，至 ${nextSlot.location} 準備服務 ${nextSlot.customerName}`
            };
        }
        
        res.json({
            staff: {
                id: staffInfo.id,
                name: staffInfo.name,
                start: staffInfo.start,
                end: staffInfo.end,
                off: staffInfo.off,
                status: currentStaffStatus.status || 'READY'
            },
            currentSlot: currentSlot,
            nextSlot: nextSlot,
            scheduleSlots: scheduleSlots,
            transitionAlert: transitionAlert,
            lastUpdated: SheetService.getLastSyncTime()
        });
        
    } catch (e) {
        console.error("Staff schedule fetch error:", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/sync-resource', (req, res) => { SERVER_RESOURCE_STATE = req.body; res.json({ success: true }); });
app.post('/api/sync-staff-status', (req, res) => { SERVER_STAFF_STATUS = req.body; res.json({ success: true }); });

// --- API: UPDATE SINGLE STAFF STATUS ---
app.post('/api/update-single-staff-status', (req, res) => {
    try {
        const { staffId, status } = req.body;
        if (!staffId || !status) {
            return res.status(400).json({ error: "缺少技師工號或工作狀態" });
        }
        
        // Chuẩn hóa staffId
        const normalizeStaffId = (id) => {
            if (!id) return "";
            const strId = String(id).trim();
            if (/^0+\d+$/.test(strId)) return parseInt(strId, 10).toString();
            return strId;
        };
        const targetId = normalizeStaffId(staffId);
        
        // Kiểm tra xem SERVER_STAFF_STATUS có được khởi tạo chưa
        if (typeof SERVER_STAFF_STATUS !== 'object' || SERVER_STAFF_STATUS === null) {
            SERVER_STAFF_STATUS = {};
        }
        
        // Cập nhật trạng thái
        SERVER_STAFF_STATUS[targetId] = {
            status: status,
            stafftime: Date.now()
        };
        
        res.json({ 
            success: true, 
            staffStatus: SERVER_STAFF_STATUS[targetId] 
        });
    } catch (e) {
        console.error("Update single staff status error:", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- API: ADMIN BOOKING ---
app.post('/api/admin-booking', async (req, res) => {
    const releaseLock = await SheetService.bookingLock.acquire();
    try {
        const SERVICES = SheetService.getServices();
        let items = [];
        
        if (Array.isArray(req.body)) {
            items = req.body;
        } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            const keys = Object.keys(req.body);
            const isNumericKeys = keys.every(k => !isNaN(parseInt(k, 10)));
            if (isNumericKeys && req.body['0'] && typeof req.body['0'] === 'object') {
                items = Object.values(req.body);
            } else {
                items = [req.body];
            }
        } else if (req.body && typeof req.body === 'object') {
            items = [req.body];
        }

        if (items.length === 0) {
            return res.status(400).json({ success: false, error: "無效的數據格式 (Invalid Data)" });
        }

        let allSaved = true;
        let rejectError = null;

        for (let i = 0; i < items.length; i++) {
            let cyx_data = items[i];

            if (cyx_data.ngayDen) cyx_data.ngayDen = SheetService.normalizeDateStrict(cyx_data.ngayDen);
            let opDateCheck = cyx_data.ngayDen;
            const adminHr = parseInt(cyx_data.gioDen ? cyx_data.gioDen.split(':')[0] : "12", 10);
            const openHour = getConfig().OPERATION_TIME.OPEN_HOUR || 8;
            if (!isNaN(adminHr) && adminHr < openHour) {
                const tempD = new Date(cyx_data.ngayDen);
                tempD.setDate(tempD.getDate() - 1);
                opDateCheck = SheetService.normalizeDateStrict(tempD);
            }

            if (!cyx_data.serviceCode || cyx_data.serviceCode === "") {
                cyx_data.serviceCode = SheetService.smartFindServiceCode(cyx_data.dichVu);
                console.log(`[API ADMIN] Auto-mapped Service Code: ${cyx_data.serviceCode}`);
            }

            const hasExistingAllocation = cyx_data.guestDetails && cyx_data.guestDetails.length > 0 && 
                                          (cyx_data.guestDetails[0].phase1_res_idx || cyx_data.guestDetails[0].phase1_resource);

            let hasConflict = false;
            let serviceDuration = cyx_data.duration;
            if (!serviceDuration && cyx_data.serviceCode && SERVICES[cyx_data.serviceCode]) {
                serviceDuration = SERVICES[cyx_data.serviceCode].duration;
            }

            if (hasExistingAllocation && typeof SheetService._checkOverlapConflict === 'function') {
                for (let j = 0; j < cyx_data.guestDetails.length; j++) {
                    const item = cyx_data.guestDetails[j];
                    let itemServiceCode = item.serviceCode || cyx_data.serviceCode;
                    let itemDuration = serviceDuration;
                    if (item.serviceCode && SERVICES[item.serviceCode]) {
                        itemDuration = SERVICES[item.serviceCode].duration || serviceDuration;
                    }
                    
                    let flow = item.flow || item.flowCode || cyx_data.flow || cyx_data.flowCode;
                    let p1 = item.phase1_duration !== undefined ? item.phase1_duration : cyx_data.phase1_duration;
                    let p2 = item.phase2_duration !== undefined ? item.phase2_duration : cyx_data.phase2_duration;
                    if (p1 === undefined || p1 === null || p1 === "") p1 = itemDuration;
                    
                    const conflict = SheetService._checkOverlapConflict(
                        cyx_data.rowId || 'TEMP_ID_NEW', opDateCheck, cyx_data.gioDen, itemDuration,
                        item.phase1_res_idx || item.phase1_resource || cyx_data.phase1_res_idx || cyx_data.phase1_resource,
                        item.phase2_res_idx || item.phase2_resource || cyx_data.phase2_res_idx || cyx_data.phase2_resource,
                        p1, p2, flow
                    );
                    
                    if (conflict) {
                        console.log(`[ADMIN BOOKING] Conflict found for pre-allocated resource ${conflict.resource}. Conflict with RowId: ${conflict.conflictId}, Name: ${conflict.conflictName}. Re-allocating...`);
                        hasConflict = true;
                        break;
                    }
                }
            }

            if ((!cyx_data.flow && !hasExistingAllocation && ResourceCore.checkRequestAvailability) || hasConflict) {
                try {
                    const staffListMap = {}; SheetService.getStaffList().forEach(s => { staffListMap[s.id] = s; });
                    const allBookingsForCheck = cyx_data.rowId ? SheetService.getBookings().filter(b => String(b.rowId) !== String(cyx_data.rowId)) : SheetService.getBookings();
                    const relevantBookings = prepareBookingsForTimeline(allBookingsForCheck, opDateCheck);
                    let serviceCode = 'UNKNOWN';
                    if (cyx_data.serviceCode) serviceCode = cyx_data.serviceCode;
                    else for (const key in SERVICES) { if (SERVICES[key].name === cyx_data.dichVu) { serviceCode = key; break; } }

                    if (serviceCode !== 'UNKNOWN') {
                        const guestList = []; const pax = cyx_data.pax || 1;
                        for (let k = 0; k < pax; k++) {
                            let sId = (cyx_data.nhanVien && cyx_data.nhanVien !== '隨機' && cyx_data.nhanVien !== 'ALL_STAFF') ? cyx_data.nhanVien : 'RANDOM';
                            let preferredFlow = null;
                            let iServiceCode = serviceCode;
                            if (cyx_data.guestDetails && cyx_data.guestDetails[k]) {
                                if (cyx_data.guestDetails[k].serviceCode) iServiceCode = cyx_data.guestDetails[k].serviceCode;
                                if (cyx_data.guestDetails[k].staff) sId = cyx_data.guestDetails[k].staff;
                                if (cyx_data.guestDetails[k].flow || cyx_data.guestDetails[k].flowCode) preferredFlow = cyx_data.guestDetails[k].flow || cyx_data.guestDetails[k].flowCode;
                            }
                            guestList.push({ serviceCode: iServiceCode, staffName: sId, flow: preferredFlow });
                        }
                        const checkResult = ResourceCore.checkRequestAvailability(opDateCheck, cyx_data.gioDen, guestList, relevantBookings, staffListMap, { location: cyx_data.location || '本館' });

                        if (checkResult.feasible && checkResult.details && checkResult.details.length > 0) {
                            const optimalDetail = checkResult.details[0];
                            const optimalFlow = optimalDetail.flow;

                            if (['BF', 'FB', 'FOOTSINGLE', 'BODYSINGLE'].includes(optimalFlow)) {
                                cyx_data.flow = optimalFlow;
                                if (cyx_data.phase1_duration === undefined) cyx_data.phase1_duration = optimalDetail.phase1_duration || optimalDetail.phase1;
                                if (cyx_data.phase2_duration === undefined) cyx_data.phase2_duration = optimalDetail.phase2_duration || optimalDetail.phase2;
                            }

                            if (!cyx_data.guestDetails) cyx_data.guestDetails = [];

                            if (cyx_data.guestDetails.length === 0) {
                                cyx_data.guestDetails.push({
                                    serviceCode: serviceCode,
                                    staff: cyx_data.nhanVien || 'RANDOM',
                                    flow: optimalFlow,
                                    phase1_duration: cyx_data.phase1_duration,
                                    phase2_duration: cyx_data.phase2_duration,
                                    phase1_res_idx: optimalDetail.phase1_res_idx ? String(optimalDetail.phase1_res_idx).toUpperCase() : undefined,
                                    phase2_res_idx: optimalDetail.phase2_res_idx ? String(optimalDetail.phase2_res_idx).toUpperCase() : undefined,
                                    resource_type: optimalFlow === 'FOOTSINGLE' ? 'CHAIR' : (optimalFlow === 'BODYSINGLE' ? 'BED' : 'COMBO')
                                });
                            } else {
                                for (let k = 0; k < cyx_data.guestDetails.length; k++) {
                                    const detail = checkResult.details[k] || optimalDetail;
                                    if (detail) {
                                        let r1 = detail.phase1_res_idx || cyx_data.guestDetails[k].phase1_res_idx;
                                        let r2 = detail.phase2_res_idx || cyx_data.guestDetails[k].phase2_res_idx;
                                        cyx_data.guestDetails[k].phase1_res_idx = r1 ? String(r1).toUpperCase() : r1;
                                        cyx_data.guestDetails[k].phase2_res_idx = r2 ? String(r2).toUpperCase() : r2;
                                        if (!cyx_data.guestDetails[k].flow) cyx_data.guestDetails[k].flow = detail.flow || optimalFlow;
                                        if (!cyx_data.guestDetails[k].resource_type) {
                                            cyx_data.guestDetails[k].resource_type = (detail.flow || optimalFlow) === 'FOOTSINGLE' ? 'CHAIR' : ((detail.flow || optimalFlow) === 'BODYSINGLE' ? 'BED' : 'COMBO');
                                        }
                                    }
                                }
                            }
                        } else {
                            rejectError = "⚠️ 系統滿載：沒有足夠的連續空位給此預約。";
                            break;
                        }
                    }
                } catch (err) { console.error("[ADMIN AUTO-FLOW ERROR]", err); }
            }
            
            if (rejectError) break;

            if (cyx_data.flowCode && !cyx_data.flow) cyx_data.flow = cyx_data.flowCode;

            // [V134 NÂNG CẤP] Bắt kết quả ghi Sheet
            const isSaved = await SheetService.ghiVaoSheet({
                ngayDen: cyx_data.ngayDen, gioDen: cyx_data.gioDen, dichVu: cyx_data.dichVu, nhanVien: cyx_data.nhanVien,
                userId: 'ADMIN_WEB', sdt: cyx_data.sdt || '現場客', hoTen: cyx_data.hoTen || '現場客',
                trangThai: '已預約', pax: cyx_data.pax || 1, isOil: cyx_data.isOil || false,
                duration: serviceDuration,
                guestDetails: cyx_data.guestDetails,
                phase1_duration: cyx_data.phase1_duration, phase2_duration: cyx_data.phase2_duration,
                isManualLocked: cyx_data.isManualLocked, flow: cyx_data.flow, serviceCode: cyx_data.serviceCode,
                adminNote: cyx_data.adminNote, location: cyx_data.location
            });

            if (!isSaved) {
                allSaved = false;
            }
        }

        if (rejectError) {
            return res.status(400).json({ success: false, error: rejectError });
        }

        if (allSaved) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, error: '儲存失敗' });
        }
    } finally {
        releaseLock();
    }
});

// --- API: INLINE UPDATE BOOKING ROW ---
app.post('/api/inline-update-booking', async (req, res) => {
    const releaseLock = await SheetService.bookingLock.acquire();
    try {
        const { rowId, updatedData } = req.body;
        if (!rowId || !updatedData) {
            return res.status(400).json({ success: false, error: 'Thiếu thông欠 rowId hoặc updatedData' });
        }
        await SheetService.updateInlineBooking(rowId, updatedData);
        res.json({ success: true, message: 'Cập nhật thành công (Update Success)' });
    } catch (e) {
        console.error('[INLINE UPDATE ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        releaseLock();
    }
});

// --- API: UPDATE STATUS ---
app.post('/api/update-status', async (req, res) => {
    try {
        const { rowId, status, syncStartTime } = req.body;
        let timeToUpdate = null;

        if (syncStartTime === true) {
            const now = SheetService.getTaipeiNow();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            timeToUpdate = `${hours}:${minutes}`;
        }

        await SheetService.updateBookingStatus(rowId, status, timeToUpdate);
        res.json({ success: true });

    } catch (e) {
        console.error('[UPDATE STATUS ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/save-salary', async (req, res) => { await SheetService.syncDailySalary(req.body.date, req.body.staffcyx_data); res.json({ success: true }); });

app.post('/api/update-checkin-time', async (req, res) => {
    try {
        const { rowIds, timeStr } = req.body;
        const success = await SheetService.updateCheckinTimeBatch(rowIds, timeStr);
        res.json({ success });
    } catch (e) {
        console.error('[UPDATE CHECKIN TIME ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/update-booking-details', async (req, res) => {
    try {
        await SheetService.updateBookingDetails(req.body);
        res.json({ success: true });
    } catch (e) { console.error('[UPDATE DETAIL ERROR]', e); res.status(500).json({ error: e.message }); }
});

// --- API: BATCH PROCESS BOOKINGS (CHỐNG QUOTA LIMIT) ---
app.post('/api/batch-process-bookings', async (req, res) => {
    try {
        if (!req.body || !Array.isArray(req.body.payloads)) {
            return res.status(400).json({ success: false, error: 'Invalid payload format (expected an array called payloads)' });
        }
        console.log("=== BATCH CHECKOUT PAYLOADS ===");
        console.log(JSON.stringify(req.body.payloads, null, 2));
        await SheetService.batchUpdateMultipleBookings(req.body.payloads);
        res.json({ success: true });
    } catch (e) { 
        console.error('[BATCH PROCESS ERROR]', e); 
        res.status(500).json({ success: false, error: e.message }); 
    }
});

app.post('/api/update-staff-config', async (req, res) => {
    try {
        await SheetService.updateStaffConfig(req.body.staffId, req.body.isStrictTime);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/today-salary', async (req, res) => {
    try {
        const salaryData = await SheetService.getTodaySalary();
        res.json({ success: true, data: salaryData });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// =============================================================================
// PHẦN 5: LINE EVENT HANDLER (BOT KHÁCH HÀNG)
// =============================================================================

function askGuaSha(userId, guestIndex, event, client) {
    const buttons = [
        { "type": "text", "text": `💆 第 ${guestIndex + 1} 位貴賓是否需要加購刮痧/拔罐？`, "weight": "bold", "size": "md", "align": "center", "color": "#1DB446" },
        { "type": "separator", "margin": "md" },
        { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "不需要", "text": `GuaSha:${guestIndex}:NO` } },
        { "type": "button", "style": "primary", "color": "#E91E63", "margin": "sm", "action": { "type": "message", "label": "需要 (刮痧/拔罐)", "text": `GuaSha:${guestIndex}:YES` } }
    ];
    return client.replyMessage(event.replyToken, { type: 'flex', altText: `第 ${guestIndex + 1} 位貴賓是否加購刮痧/拔罐`, contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": buttons } } });
}

function askHasPref(userId, guestIndex, event, client) {
    const buttons = [
        { "type": "text", "text": `💆 第 ${guestIndex + 1} 位貴賓是否需要指定師傅？`, "weight": "bold", "size": "md", "align": "center", "color": "#1DB446" },
        { "type": "separator", "margin": "md" },
        { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🎲 不指定", "text": `HasPref:${guestIndex}:NO` } },
        { "type": "button", "style": "primary", "color": "#E91E63", "margin": "sm", "action": { "type": "message", "label": "🎯 我要指定", "text": `HasPref:${guestIndex}:YES` } }
    ];
    return client.replyMessage(event.replyToken, { type: 'flex', altText: `第 ${guestIndex + 1} 位貴賓是否指定`, contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": buttons } } });
}

function askGuestPref(userId, guestIndex, event, client) {
    const s = userState[userId];
    const buttons = [
        { "type": "text", "text": `💆 請選擇第 ${guestIndex + 1} 位貴賓的指定方式`, "weight": "bold", "size": "md", "align": "center", "color": "#1DB446" },
        { "type": "separator", "margin": "md" },
        { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👨 指定男師傅", "text": `GuestPref:${guestIndex}:MALE` } },
        { "type": "button", "style": "primary", "color": "#333333", "margin": "sm", "action": { "type": "message", "label": "👉 指定特定號碼", "text": `GuestPref:${guestIndex}:SPECIFIC` } },
        { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👩 指定女師傅 (無油)", "text": `GuestPref:${guestIndex}:FEMALE` } }
    ];
    
    const SERVICES = SheetService.getServices();
    const serviceType = SERVICES[s.service] ? SERVICES[s.service].category : '';
    if (serviceType !== 'FOOT') {
        buttons.push({ "type": "button", "style": "primary", "color": "#E91E63", "margin": "sm", "action": { "type": "message", "label": `💧 指定女師傅推油 (+$${getConfig().FINANCE.OIL_BONUS})`, "text": `GuestPref:${guestIndex}:OIL` } });
    } else {
        buttons.push({ "type": "text", "text": "(足底按摩無油壓選項)", "size": "xs", "color": "#aaaaaa", "align": "center", "margin": "sm" });
    }
    
    return client.replyMessage(event.replyToken, { type: 'flex', altText: `第 ${guestIndex + 1} 位師傅需求`, contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": buttons } } });
}

async function proceedAfterGuestPrefs(userId, event, client) {
    const s = userState[userId];
    const todayStr = SheetService.normalizeDateStrict(SheetService.getTaipeiNow().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }));
    
    if (s.date === todayStr) {
        s.step = 'TRAVEL_TIME';
        const rows = [
            [{ label: "10分鐘", val: 10 }, { label: "20分鐘", val: 20 }, { label: "30分鐘", val: 30 }],
            [{ label: "40分鐘", val: 40 }, { label: "50分鐘", val: 50 }, { label: "1小時", val: 60 }],
            [{ label: "2小時", val: 120 }, { label: "3小時", val: 180 }, { label: "4小時", val: 240 }],
            [{ label: "5小時", val: 300 }, { label: "現場", val: 0 }]
        ];
        
        const contents = [
            { "type": "text", "text": "🚶 請問您大約多久抵達？", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" },
            { "type": "separator", "margin": "md" }
        ];

        rows.forEach(row => {
            const buttons = row.map(btn => ({
                "type": "button", "style": "secondary", "margin": "sm", "height": "sm",
                "action": { "type": "message", "label": btn.label, "text": `TravelTime:${btn.val}` }
            }));
            while (buttons.length < 3) buttons.push({ "type": "box", "layout": "vertical", "flex": 1, "contents": [] });
            contents.push({ "type": "box", "layout": "horizontal", "spacing": "sm", "margin": "sm", "contents": buttons });
        });

        return client.replyMessage(event.replyToken, { type: 'flex', altText: '抵達時間', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": contents } } });
    } else {
        s.travelTime = 0;
        return await generateAndSendTimeBubbles(userId, event, client);
    }
}

async function generateAndSendTimeBubbles(userId, event, client) {
    const s = userState[userId];
    await SheetService.syncData(); // Real-time sync before checking bubbles
    const bubbles = generateTimeBubbles(s.date, s.service, s.guestPrefs, s.travelTime);
    if (!bubbles) return client.replyMessage(event.replyToken, { type: 'text', text: '😢 抱歉，該時段已客滿或無符合條件的師傅，請選擇其他日期或師傅配置。' });
    s.step = 'TIME';
    return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇時間', contents: bubbles });
}

async function handleEvent(event) {
    const isText = event.type === 'message' && event.message.type === 'text';
    const isPostback = event.type === 'postback';
    if (!isText && !isPostback) return Promise.resolve(null);

    const SERVICES = SheetService.getServices();
    const STAFF_LIST = SheetService.getStaffList();

    let text = ''; let userId = event.source.userId;
    if (isText) text = event.message.text.trim();
    else if (isPostback) {
        if (event.postback.params && event.postback.params.date) text = `DatePick:${event.postback.params.date}`;
        else text = event.postback.cyx_data;
    }

    // --- 1. HEALTH CHECK & MAINTENANCE ---
    const isMenuAction = text.includes('Menu') || text.includes('價目') || text === '服務價目';
    const isBookingAction = text === 'Action:Booking' || text.startsWith('Cat:') || text.startsWith('Svc:') || text.startsWith('Date:') || text.startsWith('Pref:') || text.startsWith('Pax:') || text.startsWith('Time:') || isMenuAction;

    if (isBookingAction && (!SheetService.getIsSystemHealthy() || STAFF_LIST.length === 0)) {
        return client.replyMessage(event.replyToken, {
            type: 'flex', altText: '系統初始化中',
            contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "⏳ 系統正在初始化", "weight": "bold", "color": "#E63946", "size": "lg", "align": "center" }, { "type": "text", "text": "請等待 3-5 秒後再試一次。", "margin": "md", "wrap": true, "size": "sm", "align": "center" }] } }
        });
    }

    // --- 2. ENTRY POINT ---
    if (text === 'Action:Booking') {
        userState[userId] = {};
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "請選擇服務類別", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓", "text": "Cat:BODY" } }] } } });
    }

    // Hiển thị Menu khi hệ thống đã sẵn sàng
    if (isMenuAction) {
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() });
    }

    // --- 3. ADMIN LOGIC (BOT KHÁCH - QUYỀN CHỦ) ---
    if (text === 'Admin') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Admin', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "🛠️ 師傅管理", "weight": "bold", "color": "#E63946", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#000000", "margin": "md", "action": { "type": "message", "label": "⛔ 全店店休", "text": "Admin:CloseShop" } }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛌 請假", "text": "Admin:SetOff" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🤒 早退", "text": "Admin:SetLeaveEarly" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🍱 用餐", "text": "Admin:SetBreak" } }] } } }); }

    if (text === 'Admin:CloseShop') { userState[userId] = { step: 'ADMIN_PICK_CLOSE_DATE' }; return client.replyMessage(event.replyToken, { type: 'template', altText: '選擇日期', template: { type: 'buttons', text: '請選擇店休日期:', actions: [{ type: 'datetimepicker', label: '🗓️ 點擊選擇', cyx_data: 'ShopClosePicked', mode: 'date' }] } }); }

    // [V134 NÂNG CẤP] Bảo vệ tính năng Đóng cửa tiệm
    if (text.startsWith('DatePick:') && userState[userId] && userState[userId].step === 'ADMIN_PICK_CLOSE_DATE') {
        const pickedDate = SheetService.normalizeDateStrict(text.split(':')[1]);
        const isSaved = await SheetService.ghiVaoSheet({ gioDen: '08:00', ngayDen: pickedDate, dichVu: SERVICES['SHOP_CLOSE'] ? SERVICES['SHOP_CLOSE'].name : 'SHOP_CLOSE', nhanVien: 'ALL_STAFF', userId: 'ADMIN', sdt: 'ADMIN', hoTen: '全店店休', trangThai: '⛔ 店休' });
        delete userState[userId];
        if (isSaved) {
            return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已設定 ${pickedDate} 全店店休。` });
        } else {
            return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 寫入失敗，請檢查 Google Sheet 連線狀態。` });
        }
    }

    if (text.startsWith('Admin:')) { const action = text.split(':')[1]; userState[userId] = { step: 'ADMIN_PICK_STAFF', action: action }; const bubbles = createStaffBubbles().map(b => { const str = JSON.stringify(b).replace(/StaffSelect/g, 'StaffOp'); return JSON.parse(str); }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇師傅', contents: { type: 'carousel', contents: bubbles } }); }

    // [V134 NÂNG CẤP] Bảo vệ tính năng Nghỉ phép/Ăn trưa của nhân viên
    if (text.startsWith('StaffOp:')) {
        const staffId = text.split(':')[1]; const currentState = userState[userId]; if (!currentState || currentState.step !== 'ADMIN_PICK_STAFF') return Promise.resolve(null);
        const now = SheetService.getTaipeiNow(); const todayISO = formatDateDisplay(now.toLocaleDateString()); const currentTimeStr = now.toTimeString().substring(0, 5); let logType = ''; let logNote = '';
        let isSaved = false;

        if (currentState.action === 'SetOff') { logType = '請假'; logNote = '全天'; isSaved = await SheetService.ghiVaoSheet({ gioDen: '08:00', ngayDen: todayISO, dichVu: 'OFF_DAY', nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '請假', trangThai: '⛔ 已鎖定' }); }
        else if (currentState.action === 'SetBreak') { logType = '用餐'; logNote = '30分鐘'; isSaved = await SheetService.ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: 'BREAK_30', nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '用餐', trangThai: '🍱 用餐中' }); }
        else if (currentState.action === 'SetLeaveEarly') { logType = '早退/病假'; let duration = (26 * 60) - (now.getHours() * 60 + now.getMinutes()); if (duration < 0) duration = 0; logNote = `早退 (${duration}分)`; isSaved = await SheetService.ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: `⛔ 早退 (${duration}分)`, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '管理員操作', trangThai: '⚠️ 早退' }); }

        delete userState[userId];

        if (isSaved) {
            SERVER_STAFF_STATUS[staffId] = { status: currentState.action === 'SetOff' ? 'AWAY' : currentState.action === 'SetBreak' ? 'EAT' : 'OUT_SHORT', checkInTime: 0 };
            return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已登記: ${staffId} - ${logType}\n(${logNote})` });
        } else {
            return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 寫入失敗，請檢查 Google Sheet 連線狀態。` });
        }
    }

    // --- 4. BOOKING FLOW (STEP BY STEP) ---
    if (text.startsWith('Cat:')) {
        const category = text.split(':')[1];
        const buttons = Object.keys(SERVICES).filter(k => SERVICES[k].category === category).map(key => ({ "type": "button", "style": "primary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${SERVICES[key].name} ($${SERVICES[key].price})`, "text": `Svc:${key}` } }));
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇方案', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "選擇方案", "weight": "bold", "size": "xl", "align": "center" }, { "type": "separator", "margin": "md" }, ...buttons] } } });
    }

    if (text.startsWith('Svc:')) {
        const svcCode = text.split(':')[1]; userState[userId] = { step: 'DATE', service: svcCode };
        const days = getNext15Days();
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Date', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "📅 請選擇日期", "align": "center", "weight": "bold" }, ...days.map(d => ({ "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": d.label, "text": `Date:${d.value}` } }))] } } });
    }

    if (text.startsWith('Date:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        const selectedDate = SheetService.normalizeDateStrict(text.split(':')[1]);

        const currentState = userState[userId]; currentState.date = selectedDate; currentState.step = 'PAX'; userState[userId] = currentState;
        const paxButtons = [1, 2, 3, 4, 5, 6].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } }));
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Pax', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "👥 請問幾位貴賓？", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons] } } });
    }

    if (text.startsWith('Pax:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        const num = parseInt(text.split(':')[1]); const currentState = userState[userId]; currentState.pax = num; currentState.guestPrefs = []; currentState.step = 'GUASHA'; userState[userId] = currentState;
        return askGuaSha(userId, 0, event, client);
    }

    if (text.startsWith('GuaSha:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        const parts = text.split(':');
        const gIdx = parseInt(parts[1]);
        const choice = parts[2];
        const s = userState[userId];
        
        s.guestPrefs[gIdx] = s.guestPrefs[gIdx] || {};
        s.guestPrefs[gIdx].isGuaSha = (choice === 'YES');
        
        s.step = 'HAS_PREF';
        return askHasPref(userId, gIdx, event, client);
    }

    if (text.startsWith('HasPref:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        const parts = text.split(':');
        const gIdx = parseInt(parts[1]);
        const choice = parts[2];
        const s = userState[userId];
        
        if (choice === 'NO') {
            s.guestPrefs[gIdx] = s.guestPrefs[gIdx] || {};
            s.guestPrefs[gIdx].type = 'RANDOM';
            if (gIdx + 1 < s.pax) {
                s.step = 'GUASHA';
                return askGuaSha(userId, gIdx + 1, event, client);
            } else {
                return proceedAfterGuestPrefs(userId, event, client);
            }
        } else if (choice === 'YES') {
            s.step = 'GUEST_PREF';
            return askGuestPref(userId, gIdx, event, client);
        }
    }

    if (text.startsWith('GuestPref:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        const parts = text.split(':');
        const gIdx = parseInt(parts[1]);
        const pref = parts[2];
        const s = userState[userId];
        
        if (pref === 'SPECIFIC') {
            s.step = 'GUEST_STAFF';
            s.currentGuestIndex = gIdx;
            const bubbles = createStaffBubbles(false, []); 
            bubbles.forEach((b) => { b.body.contents[0].text = `選第 ${gIdx + 1} 位技師`; b.body.contents[0].color = "#E91E63"; });
            return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Select Staff', contents: { type: 'carousel', contents: bubbles } });
        } else {
            s.guestPrefs[gIdx] = s.guestPrefs[gIdx] || {};
            s.guestPrefs[gIdx].type = pref;
            if (gIdx + 1 < s.pax) {
                s.step = 'GUASHA';
                return askGuaSha(userId, gIdx + 1, event, client);
            } else {
                return proceedAfterGuestPrefs(userId, event, client);
            }
        }
    }
    
    if (text.startsWith('StaffSelect:')) {
        if (!userState[userId] || userState[userId].step !== 'GUEST_STAFF') return Promise.resolve(null);
        const staffId = text.split(':')[1]; 
        const s = userState[userId];
        const gIdx = s.currentGuestIndex;
        s.guestPrefs[gIdx] = s.guestPrefs[gIdx] || {};
        s.guestPrefs[gIdx].type = 'SPECIFIC';
        s.guestPrefs[gIdx].staffId = staffId;
        
        if (gIdx + 1 < s.pax) {
            s.step = 'GUASHA';
            return askGuaSha(userId, gIdx + 1, event, client);
        } else {
            return await proceedAfterGuestPrefs(userId, event, client);
        }
    }

    if (text.startsWith('TravelTime:')) {
        if (!userState[userId] || userState[userId].step !== 'TRAVEL_TIME') return Promise.resolve(null);
        userState[userId].travelTime = parseInt(text.split(':')[1]);
        return await generateAndSendTimeBubbles(userId, event, client);
    }

    if (text === 'Time:Suggest') {
        const s = userState[userId]; if (!s) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        await SheetService.syncData(); // Real-time sync before suggestions
        const bestSlots = findBestSlots(s.date, s.service, s.guestPrefs, s.travelTime);
        if (bestSlots.length === 0) return client.replyMessage(event.replyToken, { type: 'text', text: '😢 抱歉，未找到合適時段。' });
        const bubbles = bestSlots.map(slot => ({ "type": "bubble", "size": "micro", "body": { "type": "box", "layout": "vertical", "paddingAll": "sm", "contents": [{ "type": "text", "text": slot.timeStr, "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center" }, { "type": "text", "text": `👍 評分: ${slot.score}`, "size": "xxs", "color": "#aaaaaa", "align": "center" }, { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "message", "label": "選擇", "text": `Time:${slot.timeStr}` }, "margin": "sm" }] } }));
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '最佳時段建議', contents: { "type": "carousel", "contents": bubbles } });
    }

    if (text.startsWith('Time:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        userState[userId].step = 'SURNAME'; userState[userId].time = text.replace('Time:', '').trim();
        return client.replyMessage(event.replyToken, { type: 'text', text: `請問怎麼稱呼您？(姓氏)` });
    }

    if (userState[userId] && userState[userId].step === 'SURNAME') {
        userState[userId].step = 'TITLE'; userState[userId].surname = text;
        return client.replyMessage(event.replyToken, {
            type: 'flex', altText: '選擇稱呼',
            contents: {
                "type": "bubble",
                "size": "micro",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        { "type": "text", "text": "請問您的稱呼？", "weight": "bold", "align": "center", "color": "#1DB446" },
                        { "type": "separator", "margin": "md" },
                        { "type": "button", "style": "primary", "margin": "sm", "action": { "type": "message", "label": "先生", "text": "Title:先生" } },
                        { "type": "button", "style": "secondary", "margin": "sm", "color": "#F48FB1", "action": { "type": "message", "label": "小姐", "text": "Title:小姐" } }
                    ]
                }
            }
        });
    }

    if (text.startsWith('Title:')) {
        if (!userState[userId] || userState[userId].step !== 'TITLE') return Promise.resolve(null);

        const title = text.replace('Title:', '').trim();
        userState[userId].step = 'PHONE';
        userState[userId].fullName = userState[userId].surname + title;

        return client.replyMessage(event.replyToken, { type: 'text', text: "請輸入手機號碼:" });
    }

    // [V134 NÂNG CẤP] Xử lý rẽ nhánh an toàn tại bước cuối cùng của luồng đặt lịch
    if (userState[userId] && userState[userId].step === 'PHONE') {
        const sdt = normalizePhoneNumber(text); const s = userState[userId];
        
        // --- BƯỚC QUAN TRỌNG: CHECK BLACKLIST TRƯỚC KHI CHO ĐẶT ---
        const blacklist = SheetService.getBlacklist() || [];
        if (sdt && blacklist.some(b => b.phone === sdt)) {
            delete userState[userId]; // Xóa session
            return client.replyMessage(event.replyToken, { 
                type: 'text', 
                text: "⚠️ 抱歉，此電話號碼已被系統限制預約功能，無法完成線上預約。如有疑問請直接致電櫃台處理，謝謝。" 
            });
        }

        let finalDate = s.date;
        const hour = parseInt(s.time.split(':')[0]);
        let targetOpDate = s.date;
        if (hour < (getConfig().OPERATION_TIME.OPEN_HOUR || 6)) {
            const d = new Date(s.date);
            d.setDate(d.getDate() - 1);
            targetOpDate = SheetService.normalizeDateStrict(d);
        }

        // --- ĐÓNG GÓI DỮ LIỆU ---
        let totalOilPremium = 0;
        const guestDetails = [];
        const guestList = [];
        const staffDisplayParts = [];
        let anyOil = false;

        for (let i = 0; i < s.pax; i++) {
            const pref = s.guestPrefs && s.guestPrefs[i] ? s.guestPrefs[i] : { type: 'RANDOM' };
            const isGuaSha = pref.isGuaSha === true;

            let sId = '隨機';
            let isOilForGuest = false;

            if (s.selectedStaff && s.selectedStaff.length > i) {
                sId = s.selectedStaff[i];
                staffDisplayParts.push(sId);
            } else if (pref.type === 'FEMALE') {
                sId = '女';
                staffDisplayParts.push('女師傅');
            } else if (pref.type === 'MALE') {
                sId = '男';
                staffDisplayParts.push('男師傅');
            } else if (pref.type === 'OIL') {
                sId = '女';
                isOilForGuest = true;
                anyOil = true;
                totalOilPremium += getConfig().FINANCE.OIL_BONUS;
                staffDisplayParts.push('女師傅(油)');
            } else if (pref.type === 'SPECIFIC') {
                sId = pref.staffId;
                staffDisplayParts.push(sId);
            } else {
                staffDisplayParts.push('隨機');
            }

            let resourceStaffId = 'RANDOM';
            if (s.selectedStaff && s.selectedStaff.length > i) {
                resourceStaffId = s.selectedStaff[i];
            } else if (pref.type === 'SPECIFIC') {
                resourceStaffId = pref.staffId;
            } else if (pref.type === 'FEMALE' || pref.type === 'OIL') {
                resourceStaffId = 'FEMALE';
            } else if (pref.type === 'MALE') {
                resourceStaffId = 'MALE';
            }

            guestList.push({ serviceCode: s.service, staffName: resourceStaffId, flow: null });
            
            guestDetails.push({
                service: SERVICES[s.service].name,
                staff: sId, 
                isOil: isOilForGuest,
                isGuaSha: isGuaSha,
                serviceCode: s.service
            });
        }

        const staffDisplay = staffDisplayParts.join(', ');
        let basePrice = SERVICES[s.service].price;
        const totalPrice = (basePrice * s.pax) + totalOilPremium;

        // --- BẮT BUỘC ĐỒNG BỘ REAL-TIME TRƯỚC KHI CHECK TRỐNG LỊCH ---
        await SheetService.syncData();
        const cachedBookings = SheetService.getBookings();

        // --- ĐỒNG NHẤT CHUẨN HÓA GIỜ ÂM CHO CA ĐÊM ---
        const hr = parseInt(s.time.split(':')[0], 10);
        const openHour = getConfig().OPERATION_TIME.OPEN_HOUR || 8;
        let opDate = s.date;
        if (!isNaN(hr) && hr < openHour) {
            const tempD = new Date(s.date);
            tempD.setDate(tempD.getDate() - 1);
            opDate = SheetService.normalizeDateStrict(tempD);
        }
        const relevantBookings = prepareBookingsForTimeline(cachedBookings, opDate);
        const staffListMap = {}; SheetService.getStaffList().forEach(staff => { if (!staff.offDays.includes(opDate)) staffListMap[staff.id] = staff; });

        const checkResult = ResourceCore.checkRequestAvailability(s.date, s.time, guestList, relevantBookings, staffListMap);

        if (!checkResult.feasible) {
            return client.replyMessage(event.replyToken, { type: 'text', text: "😢 抱歉，該時段剛好被其他人預約了，請選擇其他時間。" });
        }

        for (let i = 0; i < s.pax; i++) {
            const coreDetail = checkResult.details && checkResult.details[i] ? checkResult.details[i] : null;
            let optimalFlow = coreDetail ? coreDetail.flow : null;

            if (!optimalFlow || optimalFlow === 'SINGLE' || optimalFlow === null) {
                const svcDef = SERVICES[s.service];
                if (svcDef) {
                    if (svcDef.category === 'COMBO') optimalFlow = 'FB';
                    else if (svcDef.type === 'CHAIR' || svcDef.category === 'FOOT') optimalFlow = 'FOOTSINGLE';
                    else optimalFlow = 'BODYSINGLE';
                } else {
                    optimalFlow = 'BODYSINGLE';
                }
            }

            const p1 = coreDetail ? (coreDetail.phase1_duration !== undefined ? coreDetail.phase1_duration : coreDetail.phase1) : null;
            const p2 = coreDetail ? (coreDetail.phase2_duration !== undefined ? coreDetail.phase2_duration : coreDetail.phase2) : null;

            let resType = '';
            if (optimalFlow === 'FOOTSINGLE') resType = 'CHAIR';
            else if (optimalFlow === 'BODYSINGLE') resType = 'BED';
            else resType = 'COMBO';

            guestDetails[i].flow = optimalFlow;
            guestDetails[i].phase1_duration = p1;
            guestDetails[i].phase2_duration = p2;
            guestDetails[i].phase1_res_idx = coreDetail ? coreDetail.phase1_res_idx : undefined;
            guestDetails[i].phase2_res_idx = coreDetail ? coreDetail.phase2_res_idx : undefined;
            guestDetails[i].resource_type = resType;
        }

        // --- BƯỚC QUAN TRỌNG: GHI VÀO DB TRƯỚC ---
        const isSaved = await SheetService.ghiVaoSheet(
            {
                gioDen: s.time, ngayDen: finalDate, dichVu: SERVICES[s.service].name,
                nhanVien: staffDisplay, userId: userId, sdt: sdt,
                hoTen: s.fullName,
                trangThai: '已預約', pax: s.pax, isOil: anyOil,
                guestDetails: guestDetails, serviceCode: s.service,
                isManualLocked: false
            },
            checkResult.proposedUpdates
        );

        // --- RẼ NHÁNH DỰA TRÊN KẾT QUẢ DB ---
        if (isSaved) {
            // Nhánh thành công: Gửi tin nhắn Confirm cho khách
            let confirmMsg = `✅ 預約成功\n\n` +
                `👤 ${s.fullName} (${sdt})\n` +
                `📅 ${finalDate} ${s.time}\n` +
                `💆 ${SERVICES[s.service].name}\n` +
                `👥 ${s.pax} 位\n` +
                `🛠️ ${staffDisplay}\n`;

            const addedGuaShaCount = guestDetails.filter(g => g.isGuaSha).length;
            if (addedGuaShaCount > 0) {
                confirmMsg += `🔥 加購項目: 刮痧/拔罐 (${addedGuaShaCount} 位)\n`;
            }

            confirmMsg += `💵 總金額: $${totalPrice}\n\n`;

            confirmMsg += `⚠️ 提醒您：\n我們為您保留10分鐘，如果您遲到且後面有其他客人預約滿檔需要位置，我們將會優先安排給現場客人，感謝您的諒解。\n\n` +
                `若需【更改時間】或【取消預約】，請務必點擊下方「我的預約」按鈕進行操作，或直接致電櫃台告知，以免影響您的權益，謝謝配合！`;

            await client.replyMessage(event.replyToken, { type: 'text', text: confirmMsg });

            // Thông báo cho chủ tiệm
            if (ID_BA_CHU) {
                client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 新預約：${s.fullName} - $${totalPrice}` }).catch(e => console.error(e));
            }
        } else {
            // Nhánh thất bại: Báo lỗi để khách không đến nhầm
            await client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ 系統繁忙，預約寫入失敗。請稍後再試，或直接致電櫃台為您安排！` });

            // Cảnh báo khẩn cấp cho chủ tiệm
            if (ID_BA_CHU) {
                client.pushMessage(ID_BA_CHU, { type: 'text', text: `⚠️ 系統警告: 客人 ${s.fullName} 的預約寫入 Google Sheet 失敗！請檢查。` }).catch(e => console.error(e));
            }
        }

        // Xóa state để khách có thể đặt lại
        delete userState[userId];
        return;
    }

    // --- 5. MY BOOKING & CANCELLATION ---
    if (text === 'Action:MyBooking') { const booking = await SheetService.layLichDatGanNhat(userId); if (!booking) return client.replyMessage(event.replyToken, { type: 'text', text: '查無預約' }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '我的預約', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "您的預約", "weight": "bold", "color": "#1DB446", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": booking.dichVu, "weight": "bold", "size": "md", "margin": "md" }, { "type": "text", "text": `🛠️ ${booking.nhanVien}`, "align": "center", "margin": "sm" }, { "type": "text", "text": `⏰ ${booking.thoiGian}`, "size": "xl", "weight": "bold", "color": "#555555", "margin": "sm" }] }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [{ "type": "button", "style": "primary", "color": "#ff9800", "action": { "type": "message", "label": "🏃 我會晚到", "text": "Action:Late" } }, { type: "button", style: "secondary", color: "#ff3333", "action": { type: "message", "label": "❌ 取消預約", "text": "Action:ConfirmCancel" } }] } } }); }
    if (text === 'Action:Late') { return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇晚到時間', contents: { "type": "bubble", "body": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [{ "type": "button", "style": "secondary", "action": { "type": "message", "label": "5分鐘", "text": "Late:5" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "10分鐘", "text": "Late:10" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "15分鐘", "text": "Late:15" } }] } } }); }
    if (text.startsWith('Late:')) { const minutes = text.split(':')[1]; const phut = `${minutes}分鐘`; const booking = await SheetService.layLichDatGanNhat(userId); if (booking) { await SheetService.updateBookingStatus(booking.rowId, `⚠️ 晚到 ${phut}`); } client.pushMessage(ID_BA_CHU, { type: 'text', text: `⚠️ 晚到通知!\nID: ${userId}\n預計晚: ${phut}` }); return client.replyMessage(event.replyToken, { type: 'text', text: '好的，我們會為您保留。' }); }
    if (text === 'Action:ConfirmCancel') { const booking = await SheetService.layLichDatGanNhat(userId); if (booking) { await SheetService.updateBookingStatus(booking.rowId, '❌ 已取消'); return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已成功取消預約。' }); } return client.replyMessage(event.replyToken, { type: 'text', text: '找不到您的預約資料。' }); }
    if (text.includes('booking') || text.includes('預約')) { delete userState[userId]; await SheetService.syncData(); return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() }); }

    return client.replyMessage(event.replyToken, { type: 'flex', altText: '預約服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "您好 👋", "weight": "bold", "size": "lg", "align": "center" }, { "type": "text", "text": "請問您是要預約按摩服務嗎？", "wrap": true, "size": "sm", "color": "#555555", "align": "center", "margin": "md" }] }, "footer": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [{ "type": "button", "style": "primary", "action": { "type": "message", "label": "✅ 立即預約", "text": "Action:Booking" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "📄 服務價目", "text": "Menu" } }] } } });
}

// =============================================================================
// PHẦN 6: AUTO REMINDER LOGIC (Nhắc nhở tự động 8h, 1h, 30m)
// =============================================================================
const REMINDERS_FILE = 'cyx_reminders.json';
let sentReminders = {};

function loadReminders() {
    try {
        if (!fs.existsSync(REMINDERS_FILE)) {
            fs.writeFileSync(REMINDERS_FILE, JSON.stringify({}), 'utf8');
        } else {
            const data = fs.readFileSync(REMINDERS_FILE, 'utf8');
            sentReminders = JSON.parse(data || '{}');
        }
    } catch (e) {
        console.error('[REMINDER] Error loading reminders:', e);
    }
}

function saveReminders() {
    try {
        fs.writeFileSync(REMINDERS_FILE, JSON.stringify(sentReminders, null, 2), 'utf8');
    } catch (e) {
        console.error('[REMINDER] Error saving reminders:', e);
    }
}

loadReminders(); // Tải trạng thái nhắc nhở khi khởi động

function createReminderFlex(booking, type) {
    let headerText = "溫馨提醒：您的預約即將到來！";
    let bodyText = "";
    
    if (type === '8h') {
        bodyText = "距離您的預約大約還有 8 小時，期待您的光臨！";
    } else if (type === '1h') {
        bodyText = "距離您的預約還有 1 小時，請提早出發，以免耽誤您的寶貴時間。";
    } else if (type === '30m') {
        bodyText = "距離您的預約僅剩 30 分鐘，我們已經為您準備好服務，不見不散！";
    }

    let displayName = booking.customerName || "貴賓";
    // Xóa các hậu tố như (1/6) hoặc (Số điện thoại) để chỉ hiển thị tên khách
    if (displayName.includes('(')) {
        displayName = displayName.split('(')[0].trim();
    }

    return {
        "type": "flex",
        "altText": "預約提醒通知",
        "contents": {
            "type": "bubble",
            "size": "mega",
            "header": {
                "type": "box",
                "layout": "vertical",
                "backgroundColor": "#1DB446",
                "contents": [
                    {
                        "type": "text",
                        "text": "📅 預約提醒",
                        "weight": "bold",
                        "color": "#ffffff",
                        "size": "xl",
                        "align": "center"
                    }
                ]
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": headerText,
                        "weight": "bold",
                        "size": "md",
                        "color": "#333333",
                        "wrap": true
                    },
                    {
                        "type": "separator",
                        "margin": "md"
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "margin": "md",
                        "spacing": "sm",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    { "type": "text", "text": "👤 貴賓", "color": "#aaaaaa", "size": "sm", "flex": 2 },
                                    { "type": "text", "text": displayName, "color": "#333333", "size": "sm", "weight": "bold", "flex": 5, "wrap": true }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    { "type": "text", "text": "⏰ 時間", "color": "#aaaaaa", "size": "sm", "flex": 2 },
                                    { "type": "text", "text": booking.startTimeString || booking.startTime || "", "color": "#E63946", "size": "sm", "weight": "bold", "flex": 5, "wrap": true }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    { "type": "text", "text": "💆 服務", "color": "#aaaaaa", "size": "sm", "flex": 2 },
                                    { "type": "text", "text": booking.serviceName || "精選服務", "color": "#333333", "size": "sm", "weight": "bold", "flex": 5, "wrap": true }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    { "type": "text", "text": "🛠️ 技師", "color": "#aaaaaa", "size": "sm", "flex": 2 },
                                    { "type": "text", "text": booking.staffName || booking.requestedStaff || "隨機", "color": "#333333", "size": "sm", "weight": "bold", "flex": 5, "wrap": true }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "separator",
                        "margin": "md"
                    },
                    {
                        "type": "text",
                        "text": bodyText,
                        "wrap": true,
                        "size": "sm",
                        "color": "#555555",
                        "margin": "md"
                    }
                ]
            }
        }
    };
}

async function checkAndSendReminders() {
    const isSystemHealthy = SheetService.getIsSystemHealthy();
    if (!isSystemHealthy) return;

    const bookings = SheetService.getBookings();
    if (!bookings || bookings.length === 0) return;

    const nowTaipei = SheetService.getTaipeiNow();
    let isChanged = false;

    for (const b of bookings) {
        if (!b.lineId || String(b.lineId).trim().toUpperCase().startsWith('ADMIN')) continue;
        
        // Bỏ qua các booking đã hủy hoặc hoàn thành
        const status = String(b.status || '').toLowerCase();
        const inactiveKeywords = ['hủy', 'cancel', '取消', 'hoàn thành', 'done', '完成', '✅', '❌'];
        const isInactive = inactiveKeywords.some(kw => status.includes(kw));
        if (isInactive) continue;

        let bookingDateStr = b.opDate || b.date;
        let timeStr = b.startTime;
        
        // Ưu tiên dùng startTimeString
        if (b.startTimeString && b.startTimeString.includes(' ')) {
            const parts = b.startTimeString.split(' ');
            bookingDateStr = parts[0];
            timeStr = parts[1];
        }
        
        if (!bookingDateStr || !timeStr) continue;

        const dateParts = bookingDateStr.replace(/-/g, '/').split('/');
        const timeParts = timeStr.split(':');
        
        if (dateParts.length < 3 || timeParts.length < 2) continue;

        const bookingTime = new Date(
            parseInt(dateParts[0]), 
            parseInt(dateParts[1]) - 1, 
            parseInt(dateParts[2]), 
            parseInt(timeParts[0]), 
            parseInt(timeParts[1]), 
            0
        );

        const timeDiffMins = (bookingTime.getTime() - nowTaipei.getTime()) / 60000;

        const safePhone = b.phone ? String(b.phone).replace(/\|/g, '-') : 'noPhone';
        const safeLineId = b.lineId ? String(b.lineId).replace(/\|/g, '-') : 'noLineId';
        const reminderKey = `Group|${safeLineId}|${safePhone}|${bookingDateStr}|${timeStr}`;

        if (!sentReminders[reminderKey]) {
            sentReminders[reminderKey] = { '8h': false, '1h': false, '30m': false };
        }

        const history = sentReminders[reminderKey];

        // Mốc 8 tiếng (<= 480 && > 60)
        if (timeDiffMins <= 480 && timeDiffMins > 60 && !history['8h']) {
            try {
                const flexMsg = createReminderFlex(b, '8h');
                await client.pushMessage(b.lineId, flexMsg);
                history['8h'] = true;
                isChanged = true;
                console.log(`[REMINDER] Sent 8h reminder to ${b.customerName} (${b.lineId})`);
            } catch (e) { console.error(`[REMINDER] Error sending 8h to ${b.lineId}`, e); }
        }
        // Mốc 1 tiếng (<= 60 && > 30)
        else if (timeDiffMins <= 60 && timeDiffMins > 30 && !history['1h']) {
            try {
                const flexMsg = createReminderFlex(b, '1h');
                await client.pushMessage(b.lineId, flexMsg);
                history['1h'] = true;
                history['8h'] = true; 
                isChanged = true;
                console.log(`[REMINDER] Sent 1h reminder to ${b.customerName} (${b.lineId})`);
            } catch (e) { console.error(`[REMINDER] Error sending 1h to ${b.lineId}`, e); }
        }
        // Mốc 30 phút (<= 30 && > 0)
        else if (timeDiffMins <= 30 && timeDiffMins > 0 && !history['30m']) {
            try {
                const flexMsg = createReminderFlex(b, '30m');
                await client.pushMessage(b.lineId, flexMsg);
                history['30m'] = true;
                history['1h'] = true; 
                history['8h'] = true; 
                isChanged = true;
                console.log(`[REMINDER] Sent 30m reminder to ${b.customerName} (${b.lineId})`);
            } catch (e) { console.error(`[REMINDER] Error sending 30m to ${b.lineId}`, e); }
        }
    }

    if (isChanged) {
        // Dọn dẹp cache cũ (quá 24 giờ)
        const oldThresholdMins = -24 * 60;
        for (const key of Object.keys(sentReminders)) {
            let dateStr, timeStr;
            
            if (key.startsWith('Group|')) {
                const parts = key.split('|');
                if (parts.length >= 5) {
                    dateStr = parts[3];
                    timeStr = parts[4];
                }
            } else {
                // Tương thích ngược với định dạng cũ: Row123_2026/05/19_18:00
                const parts = key.split('_');
                if (parts.length >= 3) {
                    dateStr = parts[parts.length - 2];
                    timeStr = parts[parts.length - 1];
                }
            }

            if (dateStr && timeStr) {
                const dateParts = dateStr.split('/');
                const timeParts = timeStr.split(':');
                if (dateParts.length >= 3 && timeParts.length >= 2) {
                    const bTime = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), parseInt(timeParts[0]), parseInt(timeParts[1]), 0);
                    const diff = (bTime.getTime() - nowTaipei.getTime()) / 60000;
                    if (diff < oldThresholdMins) {
                        delete sentReminders[key];
                    }
                }
            } else {
                // Xóa các key bị hỏng hoặc không xác định
                delete sentReminders[key];
            }
        }
        saveReminders();
    }
}


// 1. Initial Sync (Khởi động đồng bộ)
SheetService.syncMenuData()
    .then(() => SheetService.syncQuickNotes())
    .then(() => SheetService.syncData())
    .catch(err => console.error("Lỗi trong quá trình Initial Sync:", err));

// 2. Auto Sync Interval & Error Tracking [V130 NÂNG CẤP]
const SYNC_INTERVAL = getConfig().API_CONFIG?.SYNC_INTERVAL || 30000; // Mặc định 30 giây
const LONG_SYNC_INTERVAL = 600000; // Mặc định 10 phút (600,000ms)
const MAX_RETRIES = getConfig().API_CONFIG?.MAX_RETRIES || 3;
let alarmSent = false; // Trạng thái đã gửi cảnh báo hay chưa

// Chu kỳ siêu dài: Menu Data & Quick Notes (Cấu hình ít thay đổi)
setInterval(async () => {
    try {
        await SheetService.syncMenuData();
        await SheetService.syncQuickNotes();
    } catch (error) {
        console.error("Lỗi trong chu kỳ siêu dài:", error);
    }
}, LONG_SYNC_INTERVAL);

// Chu kỳ ngắn: Cập nhật Lịch hẹn Booking & Trạng thái Nhân viên
setInterval(async () => {
    try {
        await SheetService.syncData();
        
        // Gọi tính năng tự động nhắc nhở (Auto Reminders)
        await checkAndSendReminders();
        const errors = SheetService.getConsecutiveErrors();

        if (errors >= MAX_RETRIES && !alarmSent) {
            // Kích hoạt báo động LINE khi vượt quá số lần retry
            const msg = `⚠️ 系統警告: Google Sheet 連線失敗!\n(Cảnh báo: Lỗi kết nối Google Sheet quá ${errors} lần)`;
            if (ID_BA_CHU) {
                client.pushMessage(ID_BA_CHU, { type: 'text', text: msg })
                    .catch(err => console.error("[LINE PUSH ERROR]", err));
            }
            console.log(`[ALERT TRIGGERED] ${msg}`);
            alarmSent = true;
        } else if (errors === 0 && alarmSent) {
            // Hệ thống khôi phục thành công
            const msg = `✅ 系統恢復: Google Sheet 連線已恢復正常。`;
            if (ID_BA_CHU) {
                client.pushMessage(ID_BA_CHU, { type: 'text', text: msg })
                    .catch(err => console.error("[LINE PUSH ERROR]", err));
            }
            console.log(`[ALERT RECOVERED] ${msg}`);
            alarmSent = false;
        }
    } catch (error) {
        console.error("Lỗi trong chu kỳ ngắn (syncData/checkAndSendReminders):", error);
    }
}, SYNC_INTERVAL);

// 3. Health Check
app.get('/ping', (req, res) => { res.status(200).send('Pong!'); });

// 4. [V133 NÂNG CẤP] Active Anti-Hibernation (Tự động đánh thức)
function startAntiHibernation() {
    const serverUrl = process.env.SERVER_URL; // Yêu cầu thêm SERVER_URL vào file .env
    if (serverUrl) {
        const pingInterval = 14 * 60 * 1000; // 14 phút (840,000 milliseconds)
        setInterval(() => {
            const reqModule = serverUrl.startsWith('https') ? https : http;
            reqModule.get(`${serverUrl}/ping`, (res) => {
                console.log(`[ANTI-HIBERNATION] Self-ping thành công (Status: ${res.statusCode}) lúc ${new Date().toISOString()}`);
            }).on('error', (err) => {
                console.error(`[ANTI-HIBERNATION] Lỗi khi tự ping:`, err.message);
            });
        }, pingInterval);
        console.log(`[ANTI-HIBERNATION] Đã kích hoạt cơ chế tự đánh thức mỗi 14 phút đối với URL: ${serverUrl}`);
    } else {
        console.warn(`[ANTI-HIBERNATION] CẢNH BÁO: Chưa cấu hình biến SERVER_URL trong file .env. Hệ thống có thể bị ngủ đông!`);
    }
}

const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`XinWuChan Bot V134 running on port ${port}`);
    startAntiHibernation(); // Khởi chạy Anti-Hibernation ngay sau khi server lên
});

// Tránh crash server khi có lỗi không mong muốn từ API ngoài hoặc cuộc gọi nhắc nhở thất bại
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [CRITICAL] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ [CRITICAL] Uncaught Exception:', err);
});
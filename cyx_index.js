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

// --- IMPORT MODULES ---
const ResourceCore = require('./cyx_resource_core');
const StaffBot = require('./cyx_staff_bot');
const SheetService = require('./cyx_sheet_service'); // Module Sheet Service: Single Source of Truth
const { SYSTEM_CONFIG } = require('./cyx_data');     // Import Centralized Config

// --- 1. CẤU HÌNH HỆ THỐNG (SYSTEM CONFIG) ---
const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};

const ID_BA_CHU = process.env.ID_BA_CHU;

// Lấy thông số từ SYSTEM_CONFIG thay vì hardcode hoặc phụ thuộc hoàn toàn vào ResourceCore
const MAX_CHAIRS = SYSTEM_CONFIG.SCALE.MAX_CHAIRS;
const MAX_BEDS = SYSTEM_CONFIG.SCALE.MAX_BEDS;
const CUT_OFF_HOUR = SYSTEM_CONFIG.OPERATION_TIME.CUT_OFF_HOUR;
const OIL_BONUS = SYSTEM_CONFIG.FINANCE.OIL_BONUS;

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

    days.push({
        label: "今天 (Today)",
        value: todayVal
    });

    for (let i = 1; i < 15; i++) {
        let d = new Date(t);
        d.setDate(t.getDate() + i);

        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const v = `${year}/${month}/${day}`;

        const w = d.toLocaleDateString('zh-TW', { weekday: 'short' });
        let l = `${d.getMonth() + 1}/${d.getDate()} (${w})`;

        if (i === 1) l = "明天 (Tmr)";

        days.push({ label: l, value: v });
    }
    return days.reverse();
}

// Thuật toán tìm giờ trống tốt nhất (Sử dụng ResourceCore)
function findBestSlots(selectedDate, serviceCode, pax = 1, requireFemale = false, requireMale = false) {
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

    const staffListMap = {};
    STAFF_LIST.forEach(s => {
        if (!s.offDays.includes(cleanSelectedDate)) {
            if (requireFemale && s.gender !== 'F') return;
            if (requireMale && s.gender !== 'M') return;
            staffListMap[s.id] = s;
        }
    });

    const relevantBookings = cachedBookings.filter(b => b.date === cleanSelectedDate && !b.status.includes('取消'));
    const guestList = [];
    for (let i = 0; i < pax; i++) { guestList.push({ serviceCode: serviceCode, staffName: 'RANDOM', flow: null }); }

    let candidates = [];
    const maxHour = 24 + CUT_OFF_HOUR;
    for (let h = 8; h <= maxHour; h += 1) {
        const slotTime = new Date(sYear, sMonth - 1, sDay, h, 0, 0);
        if (slotTime.getTime() <= nowTaipei.getTime()) continue;

        const hourInt = Math.floor(h); const displayH = hourInt >= 24 ? hourInt - 24 : hourInt;
        const timeStr = `${displayH.toString().padStart(2, '0')}:00`;
        const result = ResourceCore.checkRequestAvailability(cleanSelectedDate, timeStr, guestList, relevantBookings, staffListMap);
        if (result.feasible) candidates.push({ timeStr: timeStr, sortVal: h, score: 10, label: `${timeStr}` });
    }
    candidates.sort((a, b) => a.sortVal - b.sortVal);
    return candidates.slice(0, 6);
}

// Tạo Bubble chọn giờ (Time Bubbles)
function generateTimeBubbles(selectedDate, serviceCode, specificStaffIds = null, pax = 1, requireFemale = false, requireMale = false) {
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

    let validSlots = [];
    const staffListMap = {};
    STAFF_LIST.forEach(s => {
        if (!s.offDays.includes(cleanSelectedDate)) {
            if (!specificStaffIds || specificStaffIds.length === 0) {
                if (requireFemale && s.gender !== 'F') return;
                if (requireMale && s.gender !== 'M') return;
            }
            staffListMap[s.id] = s;
        }
    });

    const relevantBookings = cachedBookings.filter(b => b.date === cleanSelectedDate && !b.status.includes('取消'));
    const guestList = [];
    for (let i = 0; i < pax; i++) {
        let sId = 'RANDOM'; if (specificStaffIds && specificStaffIds.length > i) sId = specificStaffIds[i];
        guestList.push({ serviceCode: serviceCode, staffName: sId, flow: null });
    }

    const maxHour = 24 + CUT_OFF_HOUR;
    for (let h = 8; h <= maxHour; h += 1) {
        const slotTime = new Date(sYear, sMonth - 1, sDay, h, 0, 0);
        if (slotTime.getTime() <= nowTaipei.getTime()) continue;

        const hourInt = Math.floor(h); const displayH = hourInt >= 24 ? hourInt - 24 : hourInt;
        const timeStr = `${displayH.toString().padStart(2, '0')}:00`;
        const result = ResourceCore.checkRequestAvailability(cleanSelectedDate, timeStr, guestList, relevantBookings, staffListMap);
        if (result.feasible) validSlots.push(h);
    }

    if (validSlots.length === 0) return null;
    const formatTime = (h) => { const hourInt = Math.floor(h); if (hourInt < 24) return `${hourInt.toString().padStart(2, '0')}:00`; return `${(hourInt - 24).toString().padStart(2, '0')}:00 (凌晨)`; };
    const formatValue = (h) => { const hourInt = Math.floor(h); const displayH = hourInt < 24 ? hourInt : hourInt - 24; return `${displayH.toString().padStart(2, '0')}:00`; }
    const groups = [
        { name: '🌞 早安 (Morning)', slots: validSlots.filter(h => h >= 8 && h < 12) },
        { name: '☀️ 午後 (Afternoon)', slots: validSlots.filter(h => h >= 12 && h < 18) },
        { name: '🌙 晚安 (Evening)', slots: validSlots.filter(h => h >= 18 && h < 24) },
        { name: '✨ 深夜 (Late Night)', slots: validSlots.filter(h => h >= 24 && h <= maxHour) }
    ];
    let bubbles = [];
    bubbles.push({ "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "backgroundColor": "#F0F9FF", "cornerRadius": "lg", "contents": [{ "type": "text", "text": "💎 SMART BOOKING", "weight": "bold", "color": "#0284C7", "align": "center", "size": "xs" }, { "type": "text", "text": "精選推薦時段", "weight": "bold", "size": "md", "align": "center", "margin": "xs" }, { "type": "button", "style": "primary", "color": "#0EA5E9", "margin": "md", "height": "sm", "action": { "type": "message", "label": "⭐ 查看 (View)", "text": "Time:Suggest" } }] } });
    const timeBubbles = groups.filter(g => g.slots.length > 0).map(group => { const buttons = group.slots.map(h => { return { "type": "button", "style": "primary", "margin": "xs", "height": "sm", "action": { "type": "message", "label": formatTime(h), "text": `Time:${formatValue(h)}` } }; }); return { "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" }, { "type": "separator", "margin": "sm" }, ...buttons] } }; });
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
    return { "type": "bubble", "size": "mega", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "📜 服務價目表 (Menu)", "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center", "margin": "md" }, { "type": "separator", "margin": "lg" }, { "type": "text", "text": "🔥 熱門套餐 (Combo)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...comboRows, { "type": "text", "text": "👣 足底按摩 (Foot)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...footRows, { "type": "text", "text": "🛏️ 身體指壓 (Body)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" }, ...bodyRows, { "type": "separator", "margin": "xl" }, { "type": "text", "text": `⭐ 油推需加收 $${OIL_BONUS}，請詢問櫃台。`, "size": "xs", "color": "#aaaaaa", "margin": "md", "align": "center" }] }, "footer": { "type": "box", "layout": "vertical", "contents": [{ "type": "button", "style": "primary", "action": { "type": "message", "label": "📅 立即預約 (Book Now)", "text": "Action:Booking" } }] } };
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

// --- API: INFO ---
app.get('/api/info', async (req, res) => {
    try {
        const isForceRefresh = req.query.forceRefresh === 'true';
        if (isForceRefresh) {
            await SheetService.synccyx_data();
        }
        res.json({
            staffList: SheetService.getStaffList(),
            bookings: SheetService.getBookings(),
            schedule: SheetService.getScheduleMap(),
            resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS },
            resourceState: SERVER_RESOURCE_STATE,
            staffStatus: SERVER_STAFF_STATUS,
            services: SheetService.getServices(),
            lastUpdated: SheetService.getLastSyncTime(),
            isSystemHealthy: SheetService.getIsSystemHealthy(),
            matrixDebug: SheetService.getMatrixDebug()
        });
    } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
});

app.post('/api/sync-resource', (req, res) => { SERVER_RESOURCE_STATE = req.body; res.json({ success: true }); });
app.post('/api/sync-staff-status', (req, res) => { SERVER_STAFF_STATUS = req.body; res.json({ success: true }); });

// --- API: ADMIN BOOKING ---
app.post('/api/admin-booking', async (req, res) => {
    const cyx_data = req.body;
    const SERVICES = SheetService.getServices();

    if (cyx_data.ngayDen) cyx_data.ngayDen = SheetService.normalizeDateStrict(cyx_data.ngayDen);

    if (!cyx_data.serviceCode || cyx_data.serviceCode === "") {
        cyx_data.serviceCode = SheetService.smartFindServiceCode(cyx_data.dichVu);
        console.log(`[API ADMIN] Auto-mapped Service Code: ${cyx_data.serviceCode}`);
    }

    if (!cyx_data.flow && ResourceCore.checkRequestAvailability) {
        try {
            const staffListMap = {}; SheetService.getStaffList().forEach(s => { staffListMap[s.id] = s; });
            const relevantBookings = SheetService.getBookings().filter(b => b.date === cyx_data.ngayDen && !b.status.includes('取消'));
            let serviceCode = 'UNKNOWN';
            if (cyx_data.serviceCode) serviceCode = cyx_data.serviceCode;
            else for (const key in SERVICES) { if (SERVICES[key].name === cyx_data.dichVu) { serviceCode = key; break; } }

            if (serviceCode !== 'UNKNOWN') {
                const guestList = []; const pax = cyx_data.pax || 1;
                for (let i = 0; i < pax; i++) {
                    let sId = (cyx_data.nhanVien && cyx_data.nhanVien !== '隨機' && cyx_data.nhanVien !== 'ALL_STAFF') ? cyx_data.nhanVien : 'RANDOM';
                    guestList.push({ serviceCode: serviceCode, staffName: sId, flow: null });
                }
                const checkResult = ResourceCore.checkRequestAvailability(cyx_data.ngayDen, cyx_data.gioDen, guestList, relevantBookings, staffListMap);

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
                            phase1_res_idx: optimalDetail.phase1_res_idx,
                            phase2_res_idx: optimalDetail.phase2_res_idx,
                            resource_type: optimalFlow === 'FOOTSINGLE' ? 'CHAIR' : (optimalFlow === 'BODYSINGLE' ? 'BED' : 'COMBO')
                        });
                    } else {
                        if (cyx_data.guestDetails[0]) {
                            cyx_data.guestDetails[0].phase1_res_idx = optimalDetail.phase1_res_idx;
                            cyx_data.guestDetails[0].phase2_res_idx = optimalDetail.phase2_res_idx;
                            if (!cyx_data.guestDetails[0].flow) cyx_data.guestDetails[0].flow = optimalFlow;
                            if (!cyx_data.guestDetails[0].resource_type) {
                                cyx_data.guestDetails[0].resource_type = optimalFlow === 'FOOTSINGLE' ? 'CHAIR' : (optimalFlow === 'BODYSINGLE' ? 'BED' : 'COMBO');
                            }
                        }
                    }
                }
            }
        } catch (err) { console.error("[ADMIN AUTO-FLOW ERROR]", err); }
    }

    if (cyx_data.flowCode && !cyx_data.flow) cyx_data.flow = cyx_data.flowCode;

    // [V134 NÂNG CẤP] Bắt kết quả ghi Sheet
    const isSaved = await SheetService.ghiVaoSheet({
        ngayDen: cyx_data.ngayDen, gioDen: cyx_data.gioDen, dichVu: cyx_data.dichVu, nhanVien: cyx_data.nhanVien,
        userId: 'ADMIN_WEB', sdt: cyx_data.sdt || '現場客', hoTen: cyx_data.hoTen || '現場客',
        trangThai: '已預約', pax: cyx_data.pax || 1, isOil: cyx_data.isOil || false,
        guestDetails: cyx_data.guestDetails,
        phase1_duration: cyx_data.phase1_duration, phase2_duration: cyx_data.phase2_duration,
        isManualLocked: cyx_data.isManualLocked, flow: cyx_data.flow, serviceCode: cyx_data.serviceCode
    });

    if (isSaved) {
        res.json({ success: true });
    } else {
        res.status(500).json({ success: false, error: 'cyx_database Write Failed' });
    }
});

// --- API: INLINE UPDATE BOOKING ROW ---
app.post('/api/inline-update-booking', async (req, res) => {
    try {
        const { rowId, updatedcyx_data } = req.body;
        if (!rowId || !updatedcyx_data) {
            return res.status(400).json({ success: false, error: 'Thiếu thông欠 rowId hoặc updatedcyx_data' });
        }
        await SheetService.updateInlineBooking(rowId, updatedcyx_data);
        res.json({ success: true, message: 'Cập nhật thành công (Update Success)' });
    } catch (e) {
        console.error('[INLINE UPDATE ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
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

app.post('/api/update-booking-details', async (req, res) => {
    try {
        await SheetService.updateBookingDetails(req.body);
        res.json({ success: true });
    } catch (e) { console.error('[UPDATE DETAIL ERROR]', e); res.status(500).json({ error: e.message }); }
});

app.post('/api/update-staff-config', async (req, res) => {
    try {
        await SheetService.updateStaffConfig(req.body.staffId, req.body.isStrictTime);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// =============================================================================
// PHẦN 5: LINE EVENT HANDLER (BOT KHÁCH HÀNG)
// =============================================================================

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
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "請選擇服務類別 (Service)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩 (Foot)", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓 (Body)", "text": "Cat:BODY" } }] } } });
    }

    // Hiển thị Menu khi hệ thống đã sẵn sàng
    if (isMenuAction) {
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() });
    }

    // --- 3. ADMIN LOGIC (BOT KHÁCH - QUYỀN CHỦ) ---
    if (text === 'Admin') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Admin', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "🛠️ 師傅管理 (Admin)", "weight": "bold", "color": "#E63946", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#000000", "margin": "md", "action": { "type": "message", "label": "⛔ 全店店休", "text": "Admin:CloseShop" } }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛌 請假", "text": "Admin:SetOff" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🤒 早退", "text": "Admin:SetLeaveEarly" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🍱 用餐", "text": "Admin:SetBreak" } }] } } }); }

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
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Date', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "📅 請選擇日期 (Date)", "align": "center", "weight": "bold" }, ...days.map(d => ({ "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": d.label, "text": `Date:${d.value}` } }))] } } });
    }

    if (text.startsWith('Date:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        const selectedDate = SheetService.normalizeDateStrict(text.split(':')[1]);

        const currentState = userState[userId]; currentState.date = selectedDate; currentState.step = 'PREF'; userState[userId] = currentState;
        const serviceType = SERVICES[currentState.service].category;
        const buttons = [
            { "type": "text", "text": "💆 請選擇師傅需求 (Staff)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" },
            { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🎲 不指定 (隨機)", "text": "Pref:RANDOM" } },
            { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👨 指定男師傅", "text": "Pref:MALE" } },
            { "type": "button", "style": "primary", "color": "#333333", "margin": "sm", "action": { "type": "message", "label": "👉 指定特定號碼", "text": "Pref:SPECIFIC" } },
            { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👩 指定女師傅 (無油)", "text": "Pref:FEMALE" } }
        ];
        if (serviceType !== 'FOOT') buttons.push({ "type": "button", "style": "primary", "color": "#E91E63", "margin": "sm", "action": { "type": "message", "label": `💧 指定女師傅推油 (+$${OIL_BONUS})`, "text": "Pref:OIL" } });
        else buttons.push({ "type": "text", "text": "(足底按摩無油壓選項)", "size": "xs", "color": "#aaaaaa", "align": "center", "margin": "sm" });
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '師傅', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": buttons } } });
    }

    if (text.startsWith('Pref:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        userState[userId].pref = text.split(':')[1]; userState[userId].step = 'PAX';
        const paxButtons = [1, 2, 3, 4, 5, 6].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } }));
        return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Pax', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "👥 請問幾位貴賓? (Pax)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons] } } });
    }

    if (text.startsWith('Pax:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
        const num = parseInt(text.split(':')[1]); const currentState = userState[userId]; currentState.pax = num; currentState.selectedStaff = []; userState[userId] = currentState;
        if (currentState.pref === 'SPECIFIC') {
            const bubbles = createStaffBubbles(false, []); bubbles.forEach((b, i) => { b.body.contents[0].text = `選第 1/${num} 位技師`; b.body.contents[0].color = "#E91E63"; });
            return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Select Staff', contents: { type: 'carousel', contents: bubbles } });
        }
        let requireFemale = false; let requireMale = false; let isOil = false;
        if (currentState.pref === 'OIL') { isOil = true; requireFemale = true; } else if (currentState.pref === 'FEMALE') requireFemale = true; else if (currentState.pref === 'MALE') requireMale = true;
        currentState.isOil = isOil;
        const bubbles = generateTimeBubbles(currentState.date, currentState.service, null, currentState.pax, requireFemale, requireMale);
        if (!bubbles) return client.replyMessage(event.replyToken, { type: 'text', text: '😢 抱歉，該時段已客滿，請選擇其他日期 (Full Booked)' });
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
            if (!bubbles) return client.replyMessage(event.replyToken, { type: 'text', text: '😢 所選技師時間衝突 (Conflict)' });
            currentState.step = 'TIME'; userState[userId] = currentState;
            return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles });
        }
    }

    if (text === 'Time:Suggest') {
        const s = userState[userId]; if (!s) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ Session expired.' });
        let requireFemale = false, requireMale = false; if (s.pref === 'OIL') requireFemale = true; else if (s.pref === 'FEMALE') requireFemale = true; else if (s.pref === 'MALE') requireMale = true;
        const bestSlots = findBestSlots(s.date, s.service, s.pax, requireFemale, requireMale);
        if (bestSlots.length === 0) return client.replyMessage(event.replyToken, { type: 'text', text: '😢 抱歉，未找到合適時段。' });
        const bubbles = bestSlots.map(slot => ({ "type": "bubble", "size": "micro", "body": { "type": "box", "layout": "vertical", "paddingAll": "sm", "contents": [{ "type": "text", "text": slot.timeStr, "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center" }, { "type": "text", "text": `👍 評分: ${slot.score}`, "size": "xxs", "color": "#aaaaaa", "align": "center" }, { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "message", "label": "選擇", "text": `Time:${slot.timeStr}` }, "margin": "sm" }] } }));
        return client.replyMessage(event.replyToken, { type: 'flex', altText: '最佳時段建議', contents: { "type": "carousel", "contents": bubbles } });
    }

    if (text.startsWith('Time:')) {
        if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ Session expired.' });
        userState[userId].step = 'SURNAME'; userState[userId].time = text.replace('Time:', '').trim();
        return client.replyMessage(event.replyToken, { type: 'text', text: `請問怎麼稱呼您？(姓氏/Surname)` });
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
                        { "type": "button", "style": "primary", "margin": "sm", "action": { "type": "message", "label": "先生 (Mr.)", "text": "Title:先生" } },
                        { "type": "button", "style": "secondary", "margin": "sm", "color": "#F48FB1", "action": { "type": "message", "label": "小姐 (Ms.)", "text": "Title:小姐" } }
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

        return client.replyMessage(event.replyToken, { type: 'text', text: "請輸入手機號碼 (Phone):" });
    }

    // [V134 NÂNG CẤP] Xử lý rẽ nhánh an toàn tại bước cuối cùng của luồng đặt lịch
    if (userState[userId] && userState[userId].step === 'PHONE') {
        const sdt = normalizePhoneNumber(text); const s = userState[userId];
        let finalDate = s.date;
        const hour = parseInt(s.time.split(':')[0]);
        if (hour < 8) {
            const d = new Date(s.date); d.setDate(d.getDate() + 1); finalDate = formatDateDisplay(d.toLocaleDateString());
        }

        let basePrice = SERVICES[s.service].price;
        if (s.isOil) basePrice += OIL_BONUS;
        const totalPrice = basePrice * s.pax;

        let staffDisplay = '隨機'; if (s.selectedStaff && s.selectedStaff.length > 0) staffDisplay = s.selectedStaff.join(', '); else if (s.pref === 'FEMALE') staffDisplay = '女師傅'; else if (s.pref === 'MALE') staffDisplay = '男師傅'; else if (s.pref === 'OIL') staffDisplay = '女師傅(油)';

        const guestList = [];
        for (let i = 0; i < s.pax; i++) {
            let sId = 'RANDOM';
            if (s.selectedStaff && s.selectedStaff.length > i) sId = s.selectedStaff[i];
            guestList.push({ serviceCode: s.service, staffName: sId, flow: null });
        }

        const relevantBookings = SheetService.getBookings().filter(b => b.date === s.date && !b.status.includes('取消'));
        const staffListMap = {}; SheetService.getStaffList().forEach(staff => { if (!staff.offDays.includes(s.date)) staffListMap[staff.id] = staff; });

        const checkResult = ResourceCore.checkRequestAvailability(s.date, s.time, guestList, relevantBookings, staffListMap);

        if (!checkResult.feasible) {
            return client.replyMessage(event.replyToken, { type: 'text', text: "😢 抱歉，該時段剛好被其他人預約了，請選擇其他時間。" });
        }

        // --- ĐÓNG GÓI DỮ LIỆU ---
        const guestDetails = [];
        for (let i = 0; i < s.pax; i++) {
            let sId = '隨機';
            if (s.selectedStaff && s.selectedStaff.length > i) sId = s.selectedStaff[i];
            else if (s.pref === 'FEMALE') sId = '女';
            else if (s.pref === 'MALE') sId = '男';

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

            guestDetails.push({
                service: SERVICES[s.service].name,
                staff: sId, isOil: s.isOil, flow: optimalFlow,
                phase1_duration: p1, phase2_duration: p2,
                serviceCode: s.service,
                phase1_res_idx: coreDetail ? coreDetail.phase1_res_idx : undefined,
                phase2_res_idx: coreDetail ? coreDetail.phase2_res_idx : undefined,
                resource_type: resType
            });
        }

        // --- BƯỚC QUAN TRỌNG: GHI VÀO DB TRƯỚC ---
        const isSaved = await SheetService.ghiVaoSheet(
            {
                gioDen: s.time, ngayDen: finalDate, dichVu: SERVICES[s.service].name,
                nhanVien: staffDisplay, userId: userId, sdt: sdt,
                hoTen: s.fullName,
                trangThai: '已預約', pax: s.pax, isOil: s.isOil,
                guestDetails: guestDetails, serviceCode: s.service,
                isManualLocked: false
            },
            checkResult.proposedUpdates
        );

        // --- RẼ NHÁNH DỰA TRÊN KẾT QUẢ DB ---
        if (isSaved) {
            // Nhánh thành công: Gửi tin nhắn Confirm cho khách
            let confirmMsg = `✅ 預約成功 (Confirmed)\n\n` +
                `👤 ${s.fullName} (${sdt})\n` +
                `📅 ${finalDate} ${s.time}\n` +
                `💆 ${SERVICES[s.service].name}\n` +
                `👥 ${s.pax} 位\n` +
                `🛠️ ${staffDisplay}\n` +
                `💵 總金額: $${totalPrice}\n\n`;

            confirmMsg += `⚠️ 重要須知 (Notice):\n` +
                `若需【更改時間】或【取消預約】，請務必點擊下方「我的預約 (My Booking)」按鈕進行操作，或直接致電櫃台告知，以免影響您的權益，謝謝配合！`;

            await client.replyMessage(event.replyToken, { type: 'text', text: confirmMsg });

            // Thông báo cho chủ tiệm
            if (ID_BA_CHU) {
                client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 New Booking: ${s.fullName} - $${totalPrice}` }).catch(e => console.error(e));
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
    if (text === 'Action:MyBooking') { const booking = await SheetService.layLichDatGanNhat(userId); if (!booking) return client.replyMessage(event.replyToken, { type: 'text', text: '查無預約 (No Booking)' }); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Booking', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "您的預約", "weight": "bold", "color": "#1DB446", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": booking.dichVu, "weight": "bold", "size": "md", "margin": "md" }, { "type": "text", "text": `🛠️ ${booking.nhanVien}`, "align": "center", "margin": "sm" }, { "type": "text", "text": `⏰ ${booking.thoiGian}`, "size": "xl", "weight": "bold", "color": "#555555", "margin": "sm" }] }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [{ "type": "button", "style": "primary", "color": "#ff9800", "action": { "type": "message", "label": "🏃 我會晚到 (Late)", "text": "Action:Late" } }, { type: "button", style: "secondary", color: "#ff3333", "action": { type: "message", "label": "❌ 取消預約 (Cancel)", "text": "Action:ConfirmCancel" } }] } } }); }
    if (text === 'Action:Late') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Late', contents: { "type": "bubble", "body": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [{ "type": "button", "style": "secondary", "action": { "type": "message", "label": "5 分", "text": "Late:5p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "10 分", "text": "Late:10p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "15 分", "text": "Late:15p" } }] } } }); }
    if (text.startsWith('Late:')) { const phut = text.split(':')[1].replace('p', '分'); const booking = await SheetService.layLichDatGanNhat(userId); if (booking) { await SheetService.updateBookingStatus(booking.rowId, `⚠️ 晚到 ${phut}`); } client.pushMessage(ID_BA_CHU, { type: 'text', text: `⚠️ 晚到通知!\nID: ${userId}\n預計晚: ${phut}` }); return client.replyMessage(event.replyToken, { type: 'text', text: '好的，我們會為您保留 (OK, Confirmed)。' }); }
    if (text === 'Action:ConfirmCancel') { const booking = await SheetService.layLichDatGanNhat(userId); if (booking) { await SheetService.updateBookingStatus(booking.rowId, '❌ Cancelled'); return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已成功取消預約 (Cancelled)。' }); } return client.replyMessage(event.replyToken, { type: 'text', text: '找不到您的預約資料。' }); }
    if (text.includes('booking') || text.includes('預約')) { delete userState[userId]; SheetService.synccyx_data(); return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() }); }

    return client.replyMessage(event.replyToken, { type: 'flex', altText: '預約服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "您好 👋", "weight": "bold", "size": "lg", "align": "center" }, { "type": "text", "text": "請問您是要預約按摩服務嗎？", "wrap": true, "size": "sm", "color": "#555555", "align": "center", "margin": "md" }] }, "footer": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [{ "type": "button", "style": "primary", "action": { "type": "message", "label": "✅ 立即預約 (Book)", "text": "Action:Booking" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "📄 服務價目 (Menu)", "text": "Menu" } }] } } });
}

// 1. Initial Sync (Khởi động đồng bộ)
SheetService.syncMenuData().then(() => SheetService.syncData());

// 2. Auto Sync Interval & Error Tracking [V130 NÂNG CẤP]
const SYNC_INTERVAL = SYSTEM_CONFIG.API_CONFIG.SYNC_INTERVAL || 30000; // Mặc định 30 giây
const MAX_RETRIES = SYSTEM_CONFIG.API_CONFIG.MAX_RETRIES || 3;
let alarmSent = false; // Trạng thái đã gửi cảnh báo hay chưa

setInterval(async () => {
    await SheetService.syncMenucyx_data(); // [V130 CẬP NHẬT] Đồng bộ Menu định kỳ mỗi chu kỳ
    await SheetService.synccyx_data();
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

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`XinWuChan Bot V134 running on port ${port}`);
    startAntiHibernation(); // Khởi chạy Anti-Hibernation ngay sau khi server lên
});
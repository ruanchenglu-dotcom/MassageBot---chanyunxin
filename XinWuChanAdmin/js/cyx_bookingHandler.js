/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - FRONTEND CONTROLLER & LOGIC BRIDGE
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V116.2 (STATUS SSOT, REAL_DURATION, ID NORMALIZATION & MULTI-STAFF COLLISION FIX)
 * =================================================================================================
 */

(function () {
    console.log("🚀 BookingHandler V116.2: Multi-Staff Array Supported (Columns L,M,N) for Collision Checks.");

    // Kiểm tra môi trường React
    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React not found. Cannot start BookingHandler.");
        return;
    }

    // --- DANH SÁCH HỌ TỪ SHEET 'NAME' (HARDCODED FOR SPEED) ---
    const PREDEFINED_SURNAMES = [
        "陳", "林", "王", "黃", "李", "吳", "蔡", "張", "許", "謝", "簡", "曾", "高", "葉", "盧", "劉", "周", "曾", "丁",
        "鄭", "朱", "趙", "郭", "洪", "彭", "邱", "廖", "賴", "徐", "游", "楊", "康", "紀", "方", "杜", "易", "汪", "曹",
        "呂", "錢", "蘇", "莊", "江", "何", "余", "羅", "薛", "蕭", "潘", "武", "毛", "史", "崔", "陶", "陸", "段", "溫",
        "柯", "孫", "程", "鍾", "董", "傅", "詹", "胡", "施", "沈", "馬", "蔣", "唐", "卓", "藍", "馮", "白", "石", "官",
        "秦", "姚", "范", "宋", "喬", "梁", "顏", "魏", "翁", "戴", "袁", "於", "顧", "孟", "平", "湯", "尹", "黎", "常",
        "邵", "鄧", "賀", "韓", "侯", "龔", "司馬", "公孫", "諸葛", "歐陽", "上官", "東方", "", "", "", "", "", "", ""
    ];

    // ========================================================================
    // PHẦN 0: UNIVERSAL UTILS & STATUS MANAGEMENT
    // ========================================================================

    const normalizeStaffId = (id) => {
        if (!id) return "";
        const strId = String(id).trim();
        // Nếu chuỗi là số và có số 0 ở đầu (ví dụ: "01", "05", "007") -> chuyển thành "1", "5", "7"
        if (/^0+\d+$/.test(strId)) {
            return parseInt(strId, 10).toString();
        }
        return strId;
    };

    const getBookingStatus = () => {
        if (window.BOOKING_STATUS) return window.BOOKING_STATUS;
        return {
            WAITING: '等待中',
            SERVING: '服務中',
            COMPLETED: '已完成',
            CANCELLED: '已取消'
        };
    };

    const normalizeDateStrict = (input) => {
        if (!input) return "";
        try {
            let dateObj;
            if (typeof input === 'object' && input instanceof Date) {
                dateObj = input;
            } else if (typeof input === 'string' && input.includes('T')) {
                dateObj = new Date(input);
            } else if (typeof input === 'number' && input > 40000) {
                dateObj = new Date(Math.round((input - 25569) * 86400 * 1000));
            } else {
                const dateString = input.toString().trim().replace(/-/g, '/');
                dateObj = new Date(dateString);
            }

            if (isNaN(dateObj.getTime())) return "";

            const taipeiTimeStr = dateObj.toLocaleString("en-US", { timeZone: "Asia/Taipei" });
            const taipeiDate = new Date(taipeiTimeStr);
            const y = taipeiDate.getFullYear();
            const m = String(taipeiDate.getMonth() + 1).padStart(2, '0');
            const d = String(taipeiDate.getDate()).padStart(2, '0');
            return `${y}/${m}/${d}`;
        } catch (e) { return input; }
    };

    const getServiceCodeByName = (serviceName) => {
        const rawServices = window.SERVICES_DATA || {};
        for (const [code, details] of Object.entries(rawServices)) {
            if (details.name === serviceName) return code;
        }
        return "";
    };

    // ========================================================================
    // PHẦN 1: CORE KERNEL (CLIENT-SIDE BRAIN)
    // ========================================================================
    const CoreKernel = (function () {
// --- START CORE LOGIC V118.0 ---
﻿/*
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL (SERVER SIDE)
 * FILE: resource_core.js
 * PHIÃŠN Báº¢N: V118.0 (UNIVERSAL SYNC & CONTINUOUS GUARDRAIL)
 * NGÃ€Y Cáº¬P NHáº¬T: Má»›i nháº¥t
 * TÃC GIáº¢: AI ASSISTANT & USER
 *
 * * * * * CHANGE LOG V118.0 (DATA & LOGIC SYNC) * * * * *
 * 1. [CONFIG INJECTION] Loáº¡i bá» Hardcode. Tá»± Ä‘á»™ng Ä‘á»c cáº¥u hÃ¬nh MAX_CHAIRS, MAX_BEDS, OPEN_HOUR
 * tá»« file cyx_data.js (SYSTEM_CONFIG). Há»— trá»£ cháº¡y trÃªn cáº£ Node.js vÃ  Browser.
 * 2. [ALGORITHM SYNC] BÃª nguyÃªn thuáº­t toÃ¡n "Continuous Scan Guardrail" (chá»‘ng phÃ¢n máº£nh
 * khoáº£ng trá»‘ng) tá»« bookingHandler.js (Frontend) sang. Äáº£m báº£o Backend vÃ  Frontend
 * Ä‘á»“ng bá»™ 100% káº¿t quáº£ kiá»ƒm tra chá»— trá»‘ng.
 * 3. [PRESERVED] Giá»¯ nguyÃªn logic V117.0 (Squeeze Logic, Phase Resource Coordinate Mapping).
 * =================================================================================================
 */

// ============================================================================
// PHáº¦N 1: LIÃŠN Káº¾T Cáº¤U HÃŒNH TRUNG TÃ‚M (cyx_data.js)
// ============================================================================

function getSystemConfig() {
    let dynamicConfig = null;

    // Thá»­ táº£i cyx_data.js trong mÃ´i trÆ°á»ng Node.js (Backend)
    if (typeof require !== 'undefined') {
        try {
            const dataModule = require('./cyx_data.js');
            dynamicConfig = dataModule.SYSTEM_CONFIG;
        } catch (e) {
            console.warn("âš ï¸ [CORE V118.0] KhÃ´ng tÃ¬m tháº¥y file ./cyx_data.js qua require. Chá» Fallback.");
        }
    }

    // Thá»­ táº£i tá»« Global Window náº¿u cháº¡y dÆ°á»›i dáº¡ng script trÃªn trÃ¬nh duyá»‡t (Frontend fallback)
    if (!dynamicConfig && typeof window !== 'undefined' && window.SYSTEM_CONFIG) {
        dynamicConfig = window.SYSTEM_CONFIG;
    }

    // FALLBACK AN TOÃ€N Tá»I Háº¬U (PhÃ²ng trÆ°á»ng há»£p file cyx_data.js bá»‹ lá»—i/máº¥t)
    if (!dynamicConfig) {
        dynamicConfig = {
            SCALE: { MAX_CHAIRS: 9, MAX_BEDS: 9 },
            OPERATION_TIME: { OPEN_HOUR: 3 },
            BUFFERS: { CLEANUP_MINUTES: 5, TRANSITION_MINUTES: 5 },
            LOGIC_RULES: { TOLERANCE: 5, CAPACITY_CHECK_STEP: 10 }
        };
    }
    return dynamicConfig;
}

// Alias Ã¡nh xáº¡ cáº¥u hÃ¬nh Ä‘á»™ng Ä‘á»ƒ code phÃ­a dÆ°á»›i ngáº¯n gá»n vÃ  tÆ°Æ¡ng thÃ­ch ngÆ°á»£c, sá»­ dá»¥ng getter
const CONF = {
    get MAX_CHAIRS() { return getSystemConfig().SCALE.MAX_CHAIRS; },
    get MAX_BEDS() { return getSystemConfig().SCALE.MAX_BEDS; },
    get OPEN_HOUR() { return getSystemConfig().OPERATION_TIME.OPEN_HOUR; },
    get CLEANUP_BUFFER() { return getSystemConfig().BUFFERS.CLEANUP_MINUTES; },
    get TRANSITION_BUFFER() { return getSystemConfig().BUFFERS.TRANSITION_MINUTES; },
    get TOLERANCE() { return getSystemConfig().LOGIC_RULES?.TOLERANCE || 1; },
    get CAPACITY_CHECK_STEP() { return getSystemConfig().LOGIC_RULES?.CAPACITY_CHECK_STEP || 10; }
};

// ============================================================================
// PHáº¦N 2: Dá»® LIá»†U Dá»ŠCH Vá»¤ VÃ€ UTILS THá»œI GIAN
// ============================================================================

let SERVICES = {};

function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: 'â›” è«‹å‡ (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: 'ðŸ± ç”¨é¤ (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: 'â›” åº—ä¼‘ (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: 'âš ï¸ å»¶é² (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
}

function getServiceInfo(code, name) {
    if (code && SERVICES[code]) return SERVICES[code];
    if (name) {
        const cleanName = name.toString().trim().toUpperCase();
        for (const key in SERVICES) {
            const svc = SERVICES[key];
            if (svc.name && svc.name.toString().trim().toUpperCase() === cleanName) return svc;
        }
    }
    return { name: name || 'Unknown', duration: 60, price: 0, type: 'CHAIR' };
}

function normalizeDateStrict(input) {
    if (!input) return "";
    try {
        let dateObj;
        if (typeof input === 'object' && input instanceof Date) {
            dateObj = input;
        } else if (typeof input === 'string' && input.includes('T')) {
            dateObj = new Date(input);
        } else if (typeof input === 'number' && input > 40000) {
            dateObj = new Date(Math.round((input - 25569) * 86400 * 1000));
        } else {
            const dateString = input.toString().trim().replace(/-/g, '/');
            dateObj = new Date(dateString);
        }

        if (isNaN(dateObj.getTime())) return "";

        const taipeiTimeStr = dateObj.toLocaleString("en-US", { timeZone: "Asia/Taipei" });
        const taipeiDate = new Date(taipeiTimeStr);
        const y = taipeiDate.getFullYear();
        const m = String(taipeiDate.getMonth() + 1).padStart(2, '0');
        const d = String(taipeiDate.getDate()).padStart(2, '0');
        return `${y}/${m}/${d}`;
    } catch (e) {
        console.error("[CORE V118.0] Date Normalize Error:", e);
        return input;
    }
}

function getTaipeiNow() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8));
}

function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1;
    try {
        let str = timeStr.toString();
        if (str.includes('T') || str.includes(' ')) {
            const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) str = timeMatch[0];
        }
        let cleanStr = str.trim().replace(/ï¼š/g, ':');
        const parts = cleanStr.split(':');
        if (parts.length < 2) return -1;

        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);

        if (isNaN(h) || isNaN(m)) return -1;
        // [V118.2] PhÃ³ng chiáº¿u giá» ráº¡ng sÃ¡ng cho thuáº­t toÃ¡n váº¯t chÃ©o ngÃ y (0h-8h)
        if (h < 8) h += 24;
        return (h * 60) + m;
    } catch (e) { return -1; }
}

function getTimeStrFromMins(mins) {
    let h = Math.floor(mins / 60); let m = mins % 60;
    if (h >= 24) h -= 24;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isOverlap(startA, endA, startB, endB) {
    const safeEndA = endA - CONF.TOLERANCE;
    const safeEndB = endB - CONF.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

function isActiveBookingStatus(statusRaw) {
    if (!statusRaw) return true; // Cáº¦N ÄÆ¯á»¢C COI LÃ€ ACTIVE nÃªÌu status trÃ´Ìng
    const s = statusRaw.toString().toLowerCase().trim();
    const inactiveKeywords = ['cancel', 'há»§y', 'huá»·', 'finish', 'done', 'xong', 'check-out', 'checkout', 'å–æ¶ˆ', 'å®Œæˆ', 'ç©º'];
    for (const kw of inactiveKeywords) { if (s.includes(kw)) return false; }
    return true;
}

// ============================================================================
// PHáº¦N 3: Bá»˜ NHáº¬N DIá»†N THÃ”NG MINH
// ============================================================================

function isComboService(serviceObj, serviceNameRaw = '', explicitFlow = null) {
    if (explicitFlow) {
        const flowUpper = explicitFlow.toString().toUpperCase().trim();
        if (['SINGLE', 'FOOTSINGLE', 'BODYSINGLE'].includes(flowUpper)) return false;
        if (flowUpper === 'BF' || flowUpper === 'FB') return true;
    }
    if (!serviceObj && !serviceNameRaw) return false;
    const cat = (serviceObj && serviceObj.category ? serviceObj.category : '').toString().toUpperCase().trim();
    if (cat === 'COMBO' || cat === 'MIXED') return true;

    const dbName = (serviceObj && serviceObj.name ? serviceObj.name : '').toString().toUpperCase();
    const rawName = (serviceNameRaw || '').toString().toUpperCase();
    const nameToCheck = dbName + " | " + rawName;
    const comboKeywords = ['COMBO', 'å¥—é¤', 'MIX', '+', 'SET', 'è…³èº«', 'å…¨é¤', 'FOOT AND BODY', 'BODY AND FOOT', 'é›™äºº', 'Aé¤', 'Bé¤', 'Cé¤', 'æ²¹å£“+è¶³'];
    for (const kw of comboKeywords) { if (nameToCheck.includes(kw)) return true; }
    return false;
}

function inferFlowFromService(serviceObj, fallbackFlow = null) {
    if (fallbackFlow) {
        const f = fallbackFlow.toString().toUpperCase().trim();
        if (f === 'FOOTSINGLE' || f === 'BODYSINGLE') return f;
    }
    if (!serviceObj) return 'BODYSINGLE';
    const type = (serviceObj.type || '').toUpperCase();
    const name = (serviceObj.name || '').toUpperCase();

    if (type === 'FOOT' || type === 'CHAIR' || type === 'LEG') return 'FOOTSINGLE';
    if (type === 'BODY' || type === 'BED' || type === 'OIL' || type === 'SPA') return 'BODYSINGLE';

    const cat = (serviceObj.category || '').toUpperCase();
    if (cat === 'FOOT') return 'FOOTSINGLE';
    if (cat === 'BODY') return 'BODYSINGLE';

    if (name.match(/FOOT|CHAIR|è…³|è¶³|LEG/)) return 'FOOTSINGLE';
    if (name.match(/BODY|BED|æŒ‡å£“|æ²¹|å…¨èº«|BACK/)) return 'BODYSINGLE';
    return 'BODYSINGLE';
}

function detectResourceType(serviceObj) {
    if (!serviceObj) return 'CHAIR';
    if (serviceObj.type === 'BED' || serviceObj.type === 'CHAIR') return serviceObj.type;
    const name = (serviceObj.name || '').toUpperCase();
    if (name.match(/BODY|æŒ‡å£“|æ²¹|BED|TOAN THAN|å…¨èº«|æ²¹å£“|SPA|BACK/)) return 'BED';
    return 'CHAIR';
}

function calculateRealDurations(booking, defaultDuration, isCombo) {
    let p1 = Math.floor(defaultDuration / 2);
    let p2 = defaultDuration - p1;

    const parseDuration = (val) => {
        if (val === undefined || val === null) return null;
        const strVal = String(val).trim();
        if (strVal === "") return null;
        const num = parseInt(strVal, 10);
        return isNaN(num) ? null : num;
    };

    const parsedP1 = parseDuration(booking.phase1_duration) ?? parseDuration(booking.originalData?.phase1_duration);
    if (parsedP1 !== null) p1 = parsedP1;

    const parsedP2 = parseDuration(booking.phase2_duration) ?? parseDuration(booking.originalData?.phase2_duration);
    if (parsedP2 !== null) p2 = parsedP2;

    const realDuration = isCombo ? (p1 + p2 + CONF.TRANSITION_BUFFER) : defaultDuration;
    return { p1, p2, realDuration };
}

function parseStaffStatus(staffInfo, queryDateStr = null) {
    if (!staffInfo) return { isAvailable: false };
    let isOff = false;
    
    const normDate = queryDateStr ? normalizeDateStrict(queryDateStr) : null;

    // Check offDays first
    if (normDate && staffInfo.offDays && staffInfo.offDays.includes(normDate)) {
        isOff = true;
    } else if (!normDate && staffInfo.off === true) {
        isOff = true;
    }
    
    if (typeof staffInfo.off === 'string' && ['TRUE', 'YES', 'OFF'].includes(staffInfo.off.toUpperCase())) isOff = true;

    // Resolve shift times
    let currentStartStr = staffInfo.start;
    let currentEndStr = staffInfo.end;
    
    if (normDate && staffInfo.customShifts && staffInfo.customShifts[normDate]) {
        currentStartStr = staffInfo.customShifts[normDate].start;
        currentEndStr = staffInfo.customShifts[normDate].end;
    }

    const startStr = (currentStartStr || "").toString().toUpperCase();
    if (startStr.includes('OFF') || startStr.includes('NGHá»ˆ') || startStr.includes('CLOSE')) isOff = true;
    if (isOff) return { isAvailable: false, reason: "MARKED_OFF" };

    let startMins = getMinsFromTimeStr(currentStartStr);
    let endMins = getMinsFromTimeStr(currentEndStr);
    if (startMins === -1 || endMins === -1) return { isAvailable: false, reason: "INVALID_TIME" };

    // [CORE V118.1] Fix Overnight Shifts (Ca XuyÃªn ÄÃªm)
    if (endMins < startMins) {
        endMins += 1440;
    }

    return { isAvailable: true, startMins: startMins, endMins: endMins, isStrict: staffInfo.isStrictTime === true };
}

function getEligibleStaffCount(staffList, currentTimeMins, requiredEndTime, queryDateStr = null) {
    let count = 0;
    for (const [staffName, info] of Object.entries(staffList)) {
        const status = parseStaffStatus(info);
        if (!status.isAvailable) continue;
        const shiftStart = status.startMins; const shiftEnd = status.endMins;
        // [CORE V118.1] Thuáº­t toÃ¡n PhÃ¢n Ä‘oáº¡n Ca ÄÃªm
        let inMain = true;
        if (currentTimeMins < shiftStart) inMain = false;
        else if (status.isStrict && shiftEnd < (requiredEndTime - CONF.TOLERANCE)) inMain = false;
        else if (currentTimeMins >= shiftEnd) inMain = false;

        let inTail = false;
        if (shiftEnd > 1440) {
            const origEnd = shiftEnd - 1440;
            inTail = true;
            if (currentTimeMins < 0) inTail = false;
            else if (status.isStrict && origEnd < (requiredEndTime - CONF.TOLERANCE)) inTail = false;
            else if (currentTimeMins >= origEnd) inTail = false;
        }

        if (inMain || inTail) {
            count++;
        }
    }
    return count;
}

// ============================================================================
// PHáº¦N 4: HÃ€NG RÃ€O DUNG LÆ¯á»¢NG (GUARDRAIL V118.0)
// Ãp dá»¥ng thuáº­t toÃ¡n Continuous Scan tá»« bookingHandler.js
// ============================================================================

function checkLaneContinuity(laneOccupiedArr, start, end, customCleanup = null) {
    const cleanup = customCleanup !== null ? customCleanup : CONF.CLEANUP_BUFFER;
    const safeEnd = end + cleanup;
    for (let block of laneOccupiedArr) {
        if (isOverlap(start, safeEnd, block.start, block.end)) return false;
    }
    return true;
}

function validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, isSimulation = false) {
    // Helper to trigger smart search if not in simulation
    const triggerSmartFailure = (reasonMsg) => {
        if (isSimulation) return { pass: false, reason: reasonMsg };
        
        let foundMins = -1;
        let searchStart = Math.max(requestStart + 10, 0); 
        
        // QuÃ©t Ä‘áº¿n cuá»‘i ngÃ y hoáº·c ca Ä‘Ãªm (1440 + 360 = 1800)
        for (let t = searchStart; t <= 1800; t += 10) {
            let sim = validateGlobalCapacity(t, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, true);
            if (sim.pass) {
                foundMins = t;
                break;
            }
        }
        
        if (foundMins !== -1) {
            const timeStr = getTimeStrFromMins(foundMins);
            return { pass: false, reason: `${reasonMsg}\nðŸ’¡ æ™ºèƒ½å»ºè­°ï¼šæœ€å¿«å¯å®Œæ•´å®‰æŽ’ (å«æ‰€æœ‰éšŽæ®µ) çš„æ™‚é–“ç‚º ${timeStr} ä¹‹å¾Œã€‚`, debug: {} };
        } else {
            return { pass: false, reason: `${reasonMsg}\nâš ï¸ ä»Šæ—¥å¾ŒçºŒæ™‚æ®µå·²ç„¡è¶³å¤ è³‡æºå¯å®Œæ•´å®‰æŽ’æ­¤é ç´„ã€‚`, debug: {} };
        }
    };

    // 1. Lá»c Booking há»£p lá»‡
    const relevantBookings = currentBookingsRaw.filter(b => {
        const bStart = getMinsFromTimeStr(b.startTimeString || b.startTime);
        if (bStart === -1) return false;
        if (!isActiveBookingStatus(b.status)) return false;
        const svcInfo = getServiceInfo(b.serviceCode, b.serviceName);
        const storedFlow = b.originalData?.flowCode || b.flow;
        const isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
        const { realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);
        const bEnd = bStart + realDuration + CONF.CLEANUP_BUFFER;
        return bEnd > requestStart;
    });

    // 2. Kiá»ƒm tra NhÃ¢n sá»± (Staff Capacity - V118.6 ÄÃ£ Ä‘á»“ng bá»™ Gender & Specific Staff Logic)
    const normId = (id) => String(id || '').replace(/^0+/, '').trim().toUpperCase();

    // [NEW] Táº¡o danh sÃ¡ch cÃ¡c Ä‘iá»ƒm cháº¡m thá»i gian (Time Points) Ä‘á»ƒ quÃ©t liÃªn tá»¥c (Continuous Scan)
    let timePoints = new Set();
    timePoints.add(requestStart);
    
    guestList.forEach(g => {
        const svcInfo = getServiceInfo(g.serviceCode, g.serviceName);
        const dur = svcInfo.duration || 60;
        timePoints.add(requestStart + dur);
    });

    let staffBusyPeriods = {};
    relevantBookings.forEach(b => {
        const bS = getMinsFromTimeStr(b.startTimeString || b.startTime);
        const bE = bS + (b.duration || 60) + CONF.CLEANUP_BUFFER;

        let staffsInBooking = b.assignedStaffs && b.assignedStaffs.length > 0 ? b.assignedStaffs : [b.staffName];
        for (const stf of staffsInBooking) {
            if (stf) {
                const sId = normId(stf);
                if (!staffBusyPeriods[sId]) staffBusyPeriods[sId] = [];
                staffBusyPeriods[sId].push({ start: bS, end: bE });
            }
        }
        
        // ThÃªm cÃ¡c Ä‘iá»ƒm Ä‘áº§u/cuá»‘i cá»§a booking cÅ© náº¿u nÃ³ rÆ¡i vÃ o khung giá» khÃ¡ch má»›i Ä‘ang xÃ©t
        if (bS > requestStart && bS < requestStart + maxDuration) timePoints.add(bS);
        if (bE > requestStart && bE < requestStart + maxDuration) timePoints.add(bE);
    });

    let sortedPoints = Array.from(timePoints).sort((a, b) => a - b);

    // [NEW] Thuáº­t toÃ¡n Interval Overlap Continuous Scan cho NhÃ¢n sá»±
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        let tCheck = sortedPoints[i];
        
        let currentStaffBusy = 0;
        let currentFemaleBusy = 0;
        let currentMaleBusy = 0;
        
        relevantBookings.forEach(b => {
            const bS = getMinsFromTimeStr(b.startTimeString || b.startTime);
            const svcInfo = getServiceInfo(b.serviceCode, b.serviceName);
            const storedFlow = b.originalData?.flowCode || b.flow;
            const isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
            const { realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);
            const bE = bS + realDuration + CONF.CLEANUP_BUFFER;
            let staffsInBooking = b.assignedStaffs && b.assignedStaffs.length > 0 ? b.assignedStaffs : [b.staffName];
            
            if (tCheck >= bS && tCheck < bE) {
                currentStaffBusy += staffsInBooking.length;
                for (const staffName of staffsInBooking) {
                    const sInfo = staffList[staffName] || Object.values(staffList).find(s => normId(s.name) === normId(staffName) || normId(s.id) === normId(staffName)) || {};
                    if (sInfo.gender === 'F' || sInfo.gender === 'å¥³' || sInfo.group === 'å¥³') currentFemaleBusy++;
                    else if (sInfo.gender === 'M' || sInfo.gender === 'ç”·' || sInfo.group === 'ç”·') currentMaleBusy++;
                }
            }
        });
        
        let newGuestsActive = 0;
        let newFemaleReq = 0;
        let newMaleReq = 0;
        
        guestList.forEach(g => {
            const svcInfo = getServiceInfo(g.serviceCode, g.serviceName);
            const dur = svcInfo.duration || 60;
            if (tCheck >= requestStart && tCheck < requestStart + dur) {
                newGuestsActive++;
                const req = g.staff;
                // Náº¿u khÃ¡ch chá»n dáº§u (OIL), máº·c Ä‘á»‹nh yÃªu cáº§u ná»¯ (trá»« khi cÃ³ config khÃ¡c)
                if (req === 'FEMALE' || req === 'å¥³' || req === 'å¥³å¸«' || req === 'OIL') newFemaleReq++;
                else if (req === 'MALE' || req === 'ç”·' || req === 'ç”·å¸«') newMaleReq++;
            }
        });

        // Äáº¿m sá»‘ nhÃ¢n viÃªn ÄANG LÃ€M VIá»†C táº¡i Ä‘Ãºng thá»i Ä‘iá»ƒm tCheck (Ä‘Ã£ trá»« lÃºc háº¿t ca)
        const currentAvailableStaff = Object.values(staffList).filter(s => {
            const status = parseStaffStatus(s, queryDateStr);
            if (!status.isAvailable) return false;
            let inMain = (tCheck >= status.startMins && tCheck < status.endMins);
            let inTail = false;
            if (status.endMins > 1440) {
                const origEnd = status.endMins - 1440;
                inTail = (tCheck >= 0 && tCheck < origEnd);
            }
            return inMain || inTail;
        });

        const currentSupplyCount = currentAvailableStaff.length;
        const currentFemaleSupply = currentAvailableStaff.filter(s => s.gender === 'F' || s.gender === 'å¥³').length;
        const currentMaleSupply = currentAvailableStaff.filter(s => s.gender === 'M' || s.gender === 'ç”·').length;
        
        if (newFemaleReq > 0 && (currentFemaleBusy + newFemaleReq) > currentFemaleSupply) {
            return triggerSmartFailure(`âš ï¸ è©²æ™‚æ®µå¥³æŠ€å¸«ä¸è¶³ã€‚å¥³å¸«ç¸½å…±: ${currentFemaleSupply}, å¿™ç¢Œä¸­: ${currentFemaleBusy}, æ¬²é ç´„: ${newFemaleReq}`);
        }
        if (newMaleReq > 0 && (currentMaleBusy + newMaleReq) > currentMaleSupply) {
            return triggerSmartFailure(`âš ï¸ è©²æ™‚æ®µç”·æŠ€å¸«ä¸è¶³ã€‚ç”·å¸«ç¸½å…±: ${currentMaleSupply}, å¿™ç¢Œä¸­: ${currentMaleBusy}, æ¬²é ç´„: ${newMaleReq}`);
        }
        if ((currentStaffBusy + newGuestsActive) > currentSupplyCount) {
            return triggerSmartFailure(`âš ï¸ è©²æ™‚æ®µæŠ€å¸«ç¸½æ•¸ä¸è¶³ã€‚ç¸½å…±: ${currentSupplyCount}, å¿™ç¢Œä¸­: ${currentStaffBusy}, æ–°å®¢: ${newGuestsActive}`);
        }
    }

    // Kiá»ƒm tra trÃ¹ng lá»‹ch cho nhÃ¢n viÃªn ÄÆ¯á»¢C CHá»ˆ Äá»ŠNH cá»¥ thá»ƒ (Specific Staff)
    let specificStaffReqs = [];
    guestList.forEach(g => {
        const req = g.staff;
        const svcInfo = getServiceInfo(g.serviceCode, g.serviceName);
        const dur = svcInfo.duration || 60;
        if (req && req !== 'RANDOM' && req !== 'éš¨æ©Ÿ' && req !== 'Any' && req !== 'undefined' && req !== 'null' 
            && req !== 'FEMALE' && req !== 'MALE' && req !== 'å¥³' && req !== 'ç”·' && req !== 'å¥³å¸«' && req !== 'ç”·å¸«' && req !== 'OIL') {
            const sId = normId(req);
            specificStaffReqs.push({ req: sId, rawReq: req, duration: dur });
        }
    });

    const reqCounts = {};
    for (const specificReq of specificStaffReqs) {
        reqCounts[specificReq.req] = (reqCounts[specificReq.req] || 0) + 1;
    }
    for (const [req, count] of Object.entries(reqCounts)) {
        if (count > 1) {
            if (isSimulation) return { pass: false, reason: 'Duplicate staff assigned' };
            return { pass: false, reason: `âš ï¸ éŒ¯èª¤: ä¸å¯åŒæ™‚æŒ‡æ´¾ ${count} ä½å®¢äººçµ¦åŒä¸€æŠ€å¸« ${req}ã€‚`, debug: {} };
        }
    }

    for (const specificReq of specificStaffReqs) {
        const reqId = specificReq.req;
        const rawName = specificReq.rawReq;
        const dur = specificReq.duration;
        const requiredEnd = requestStart + dur;

        const sInfo = staffList[reqId] || Object.values(staffList).find(s => normId(s.name) === reqId || normId(s.id) === reqId);
        if (sInfo) {
            const status = parseStaffStatus(sInfo, queryDateStr);
            // [CORE V118.0] Thuáº­t toÃ¡n PhÃ¢n Ä‘oáº¡n Ca ÄÃªm
            let inMain = (requestStart >= status.startMins && requestStart < status.endMins);
            let inTail = false;
            if (status.endMins > 1440) {
                const origEnd = status.endMins - 1440;
                inTail = (requestStart >= 0 && requestStart < origEnd);
            }
            
            if (!status.isAvailable || (!inMain && !inTail)) {
                return triggerSmartFailure(`âš ï¸ æŠ€å¸« ${rawName} è©²æ™‚æ®µæœªæŽ’ç­æˆ–å·²ä¸‹ç­ã€‚`);
            }

            let busyBlocks = staffBusyPeriods[reqId] || [];
            busyBlocks.sort((a, b) => a.start - b.start);

            let isBusy = false;
            for (const blk of busyBlocks) {
                if (isOverlap(requestStart, requiredEnd, blk.start, blk.end)) {
                    isBusy = true;
                    break;
                }
            }

            if (isBusy) {
                return triggerSmartFailure(`âš ï¸ æŠ€å¸« ${rawName} è©²æ™‚æ®µå·²æœ‰é ç´„ã€‚`);
            }
        }
    }

    // 3. PhÃ¢n tÃ­ch tÃ i nguyÃªn chá»‘ng phÃ¢n máº£nh (Continuous Scan)
    const resourceMap = {
        'BED': Array.from({ length: CONF.MAX_BEDS }, () => []),
        'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, () => [])
    };

    relevantBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTimeString || b.startTime);
        const svcInfo = getServiceInfo(b.serviceCode, b.serviceName);
        const storedFlow = b.originalData?.flowCode || b.flow;
        const isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
        const { p1, realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);

        const rIdStr = (b.phase1_res_idx || "") + " " + (b.phase2_res_idx || "") + " " + (b.allocated_resource || "") + " " + (b.location || "") + " " + (b.current_resource_id || "") + " " + (b.rowId || "");
        const matches = [...rIdStr.matchAll(/((?:BED|CHAIR|åºŠ|è¶³)[-_ ]?\d+)/gi)].map(m => m[1].toUpperCase());
        let uniqueMatches = [...new Set(matches)];

        // [V118.8 FIX] Há»— trá»£ trÃ­ch xuáº¥t sá»‘ gháº¿/giÆ°á»ng náº¿u chuá»—i chá»‰ cÃ³ sá»‘ Ä‘Æ¡n thuáº§n (phÃ²ng ngá»«a BÃ³ng Ma Toáº¡ Äá»™)
        if (uniqueMatches.length === 0) {
            const backupMatches = [...rIdStr.matchAll(/(\d+)/gi)].map(m => m[1]);
            let inferredType = 'CHAIR';
            if (svcInfo) {
                if (svcInfo.type === 'BED' || svcInfo.type === 'CHAIR') inferredType = svcInfo.type;
                else {
                    const name = (svcInfo.name || '').toUpperCase();
                    if (name.match(/BODY|æŒ‡å£“|æ²¹|BED|TOAN THAN|å…¨èº«|æ²¹å£“|SPA|BACK/)) inferredType = 'BED';
                }
            }
            uniqueMatches = [...new Set(backupMatches)].map(num => `${inferredType}-${num}`);
        }

        const pushToMapFallback = (type, startT, endT) => {
            let found = false;
            let limit = (type === 'BED') ? CONF.MAX_BEDS : CONF.MAX_CHAIRS;
            for (let i = 0; i < limit; i++) {
                if (resourceMap[type] && resourceMap[type][i] && checkLaneContinuity(resourceMap[type][i], startT, endT - CONF.CLEANUP_BUFFER)) {
                    resourceMap[type][i].push({ start: startT, end: endT });
                    found = true;
                    break;
                }
            }
            if (!found && resourceMap[type] && resourceMap[type][0]) {
                resourceMap[type][0].push({ start: startT, end: endT });
            }
        };

        const pushToMap = (res, startT, endT, fallbackType) => {
            let success = false;
            if (res) {
                const laneMatch = res.match(/(BED|CHAIR|åºŠ|è¶³)[-_ ]?(\d+)/i);
                if (laneMatch) {
                    const type = (laneMatch[1].toUpperCase().includes('BED') || laneMatch[1].includes('åºŠ')) ? 'BED' : 'CHAIR';
                    const idx = parseInt(laneMatch[2]) - 1;
                    if (resourceMap[type] && resourceMap[type][idx]) {
                        resourceMap[type][idx].push({ start: startT, end: endT });
                        success = true;
                    }
                }
            }
            if (!success && fallbackType) {
                pushToMapFallback(fallbackType, startT, endT);
            }
        };

        if (isCombo) {
            let res1 = null, res2 = null;
            let type1 = 'BED'; let type2 = 'CHAIR';
            let isBodyFirst = true;

            if (storedFlow === 'BF') isBodyFirst = true;
            else if (storedFlow === 'FB') isBodyFirst = false;
            else {
                const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
                if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('å…ˆåšèº«é«”')) isBodyFirst = true;
                else if (b._impliedFlow === 'BF') isBodyFirst = true;
            }

            if (uniqueMatches.length >= 2) {
                if (isBodyFirst) {
                    res1 = uniqueMatches.find(r => r.includes('BED') || r.includes('åºŠ')) || uniqueMatches[0];
                    res2 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('è¶³')) || uniqueMatches[1];
                } else {
                    res1 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('è¶³')) || uniqueMatches[0];
                    res2 = uniqueMatches.find(r => r.includes('BED') || r.includes('åºŠ')) || uniqueMatches[1];
                }
            } else if (uniqueMatches.length === 1) {
                const mType = (uniqueMatches[0].toUpperCase().includes('BED') || uniqueMatches[0].includes('åºŠ')) ? 'BED' : 'CHAIR';
                if (isBodyFirst) {
                    if (mType === 'BED') res1 = uniqueMatches[0];
                    else res2 = uniqueMatches[0];
                } else {
                    if (mType === 'CHAIR') res1 = uniqueMatches[0];
                    else res2 = uniqueMatches[0];
                }
            }
            
            if (!isBodyFirst) { type1 = 'CHAIR'; type2 = 'BED'; }

            pushToMap(res1, bStart, bStart + p1 + CONF.CLEANUP_BUFFER, type1);
            pushToMap(res2, bStart + p1 + CONF.TRANSITION_BUFFER, bStart + realDuration + CONF.CLEANUP_BUFFER, type2);
        } else {
            let rType = (inferFlowFromService(svcInfo, storedFlow) === 'FOOTSINGLE') ? 'CHAIR' : 'BED';
            if (uniqueMatches.length > 0) {
                uniqueMatches.forEach(res => {
                    pushToMap(res, bStart, bStart + realDuration + CONF.CLEANUP_BUFFER, rType);
                });
            } else {
                pushToMapFallback(rType, bStart, bStart + realDuration + CONF.CLEANUP_BUFFER);
            }
        }
    });

    // MÃ´ phá»ng luá»“ng khÃ¡ch má»›i
    const simulationMap = JSON.parse(JSON.stringify(resourceMap));
    const suggestedLanes = {}; // [NEW V118.6] LÆ°u láº¡i toáº¡ Ä‘á»™ gá»£i Ã½ chÃ­nh xÃ¡c

    for (let i = 0; i < guestList.length; i++) {
        const g = guestList[i];
        const svc = getServiceInfo(g.serviceCode, g.serviceName);
        const duration = svc.duration || 60;
        const explicitFlow = g.flowCode || null;
        const isCombo = isComboService(svc, g.serviceCode, explicitFlow);
        const guestIdKey = g.idx !== undefined ? g.idx : i; // Äáº£m báº£o mapping Ä‘Ãºng index cá»§a khÃ¡ch

        if (isCombo) {
            let foundValidSplit = false;
            const eStep = svc.elasticStep || 1;
            const eLimit = svc.elasticLimit || 20;
            const flowPrimary = (explicitFlow === 'FB' || explicitFlow === 'BF') ? explicitFlow : 'FB';
            const flowSecondary = flowPrimary === 'FB' ? 'BF' : 'FB';
            const flowsToTry = [flowPrimary, flowSecondary];
            
            for (const testFlow of flowsToTry) {
                const splitsToTry = generateElasticSplits(duration, eStep, eLimit, null, svc.minFoot, svc.maxFoot, svc.minBody, svc.maxBody, testFlow);
                
                for (const split of splitsToTry) {
                    const p1 = split.p1;
                    const p2 = split.p2;
                    const tStart = requestStart;
                    const tSwitch = tStart + p1 + CONF.TRANSITION_BUFFER;
                    const comboGuestsCount = guestList.filter(g => isComboService(getServiceInfo(g.serviceCode, g.serviceName), g.serviceCode, g.flowCode)).length;
                    const isCrossSwapGroup = comboGuestsCount >= 2;
                    const phase1Cleanup = isCrossSwapGroup ? Math.min(CONF.CLEANUP_BUFFER, CONF.TRANSITION_BUFFER) : CONF.CLEANUP_BUFFER;
                    
                    let bedIdx = -1, chairIdx = -1;
                    
                    if (testFlow === 'BF') {
                        // Ká»‹ch báº£n A: Body TrÆ°á»›c (BED -> CHAIR)
                        for (let b = 0; b < CONF.MAX_BEDS; b++) { if (checkLaneContinuity(simulationMap.BED[b], tStart, tStart + p1, phase1Cleanup)) { bedIdx = b; break; } }
                        for (let c = 0; c < CONF.MAX_CHAIRS; c++) { if (checkLaneContinuity(simulationMap.CHAIR[c], tSwitch, tSwitch + p2)) { chairIdx = c; break; } }

                        if (bedIdx !== -1 && chairIdx !== -1) {
                            simulationMap.BED[bedIdx].push({ start: tStart, end: tStart + p1 + phase1Cleanup });
                            simulationMap.CHAIR[chairIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                            suggestedLanes[guestIdKey] = { BED: bedIdx + 1, CHAIR: chairIdx + 1 };
                            foundValidSplit = true;
                            break;
                        }
                    } else {
                        // Ká»‹ch báº£n B: ChÃ¢n TrÆ°á»›c (CHAIR -> BED)
                        for (let c = 0; c < CONF.MAX_CHAIRS; c++) { if (checkLaneContinuity(simulationMap.CHAIR[c], tStart, tStart + p1, phase1Cleanup)) { chairIdx = c; break; } }
                        for (let b = 0; b < CONF.MAX_BEDS; b++) { if (checkLaneContinuity(simulationMap.BED[b], tSwitch, tSwitch + p2)) { bedIdx = b; break; } }

                        if (chairIdx !== -1 && bedIdx !== -1) {
                            simulationMap.CHAIR[chairIdx].push({ start: tStart, end: tStart + p1 + phase1Cleanup });
                            simulationMap.BED[bedIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                            suggestedLanes[guestIdKey] = { CHAIR: chairIdx + 1, BED: bedIdx + 1 };
                            foundValidSplit = true;
                            break;
                        }
                    }
                }
                if (foundValidSplit) break;
            }

            if (!foundValidSplit) {
                return triggerSmartFailure(`âš ï¸ åœ¨ ${getTimeStrFromMins(requestStart)} æ²’æœ‰è¶³å¤ çš„é€£çºŒç©ºä½çµ¦å¥—é¤ã€‚`);
            }

        } else {
            // KhÃ¡ch láº»
            const smartFlow = inferFlowFromService(svc, explicitFlow);
            let rType = (smartFlow === 'FOOTSINGLE') ? 'CHAIR' : 'BED';
            let foundIdx = -1;

            for (let k = 0; k < (rType === 'BED' ? CONF.MAX_BEDS : CONF.MAX_CHAIRS); k++) {
                if (checkLaneContinuity(simulationMap[rType][k], requestStart, requestStart + duration)) {
                    foundIdx = k; break;
                }
            }

            if (foundIdx !== -1) {
                simulationMap[rType][foundIdx].push({ start: requestStart, end: requestStart + duration + CONF.CLEANUP_BUFFER });
                suggestedLanes[guestIdKey] = { [rType]: foundIdx + 1 };
            } else {
                return triggerSmartFailure(`âš ï¸ å·²ç¶“æ²’æœ‰é€£çºŒ ${duration} åˆ†é˜çš„ç©º${rType === 'BED' ? 'åºŠä½' : 'åº§ä½'}ã€‚`);
            }
        }
    }
    return { pass: true, debug: { msg: "V118.0 Continuous Scan Passed" }, resourceMap: resourceMap, suggestedLanes: suggestedLanes };
}

// ============================================================================
// PHáº¦N 5: MATRIX ENGINE (CORE ALLOCATION)
// ============================================================================

class VirtualMatrix {
    constructor() {
        this.lanes = {
            'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i + 1}`, occupied: [] })),
            'BED': Array.from({ length: CONF.MAX_BEDS }, (_, i) => ({ id: `BED-${i + 1}`, occupied: [] }))
        };
        this.blockLog = [];
    }
    checkLaneFree(lane, start, end) {
        for (let block of lane.occupied) {
            if (isOverlap(start, end, block.start, block.end)) {
                return { free: false, blocker: block };
            }
        }
        return { free: true };
    }
    allocateToLane(lane, start, end, ownerId) {
        lane.occupied.push({ start, end, ownerId });
        lane.occupied.sort((a, b) => a.start - b.start);
        return lane.id;
    }
    tryAllocate(type, start, end, ownerId, preferredIndex = null, isForced = false) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null;

        if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
            const targetLane = resourceGroup[preferredIndex - 1];
            if (isForced || this.checkLaneFree(targetLane, start, end).free) {
                return this.allocateToLane(targetLane, start, end, ownerId);
            }
        }
        
        // [V118.9 FIX] æ¢å¾©ã€Œå¾žä¸Šåˆ°ä¸‹ç·Šæ¹ŠæŽ’åˆ—ã€(Top-Down Packing) é‚è¼¯ï¼Œå–æ¶ˆç©ºä½å„ªå…ˆåˆ†é…ä»¥é¿å…è¦–è¦ºç©ºéš™ã€‚
        // ä¸å†æ ¹æ“š occupied.length é€²è¡ŒæŽ’åºï¼Œè€Œæ˜¯ä¿ç•™åŽŸå§‹é †åº (CHAIR-1, CHAIR-2...) é€²è¡Œåˆ†é…ã€‚
        let sortedLanes = [...resourceGroup];

        for (let lane of sortedLanes) {
            const check = this.checkLaneFree(lane, start, end);
            if (check.free) {
                return this.allocateToLane(lane, start, end, ownerId);
            } else {
                this.blockLog.push(`âŒ ${lane.id} è¢« ${check.blocker.ownerId} æ“‹ä½`);
            }
        }
        
        return null;
    }
}

// ============================================================================
// PHáº¦N 6: LOGIC TÃŒM NHÃ‚N VIÃŠN & CO GIÃƒN
// ============================================================================

function findAvailableStaff(staffReq, start, end, staffListRef, busyList, queryDateStr = null) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        const status = parseStaffStatus(staffInfo, queryDateStr);
        if (!status.isAvailable) return false;

        const shiftStart = status.startMins; const shiftEnd = status.endMins;
        // [CORE V118.0] Thuáº­t toÃ¡n PhÃ¢n Ä‘oáº¡n Ca ÄÃªm
        let inMain = true;
        if ((start + CONF.TOLERANCE) < shiftStart) inMain = false;
        else if (status.isStrict) {
            if ((end - CONF.TOLERANCE) > shiftEnd) inMain = false;
        } else {
            if (start >= shiftEnd) inMain = false;
        }

        let inTail = false;
        if (shiftEnd > 1440) {
            const origEnd = shiftEnd - 1440;
            inTail = true;
            if (start < 0) inTail = false;
            else if (status.isStrict) {
                if ((end - CONF.TOLERANCE) > origEnd) inTail = false;
            } else {
                if (start >= origEnd) inTail = false;
            }
        }

        if (!inMain && !inTail) return false;

        for (const b of busyList) { if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; }

        if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
        if ((staffReq === 'FEMALE' || staffReq === 'å¥³') && staffInfo.gender !== 'F') return false;
        return true;
    };

    if (staffReq && !['RANDOM', 'MALE', 'FEMALE', 'éš¨æ©Ÿ', 'Any', 'undefined'].includes(staffReq)) {
        return checkOneStaff(staffReq) ? staffReq : null;
    } else {
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) { if (checkOneStaff(name)) return name; }
        return null;
    }
}

function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null, minFoot = null, maxFoot = null, minBody = null, maxBody = null, flow = 'FB') {
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
        return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999 }];
    }
    const standardHalf = Math.floor(totalDuration / 2);
    let options = [];

    let minP1 = 15, maxP1 = totalDuration - 15;
    let minP2 = 15, maxP2 = totalDuration - 15;

    const isBF = (flow === 'BF');
    if (isBF) {
        if (minBody) minP1 = Math.max(minP1, minBody);
        if (maxBody) maxP1 = Math.min(maxP1, maxBody);
        if (minFoot) minP2 = Math.max(minP2, minFoot);
        if (maxFoot) maxP2 = Math.min(maxP2, maxFoot);
    } else {
        if (minFoot) minP1 = Math.max(minP1, minFoot);
        if (maxFoot) maxP1 = Math.min(maxP1, maxFoot);
        if (minBody) minP2 = Math.max(minP2, minBody);
        if (maxBody) maxP2 = Math.min(maxP2, maxBody);
    }

    let p2_standard = totalDuration - standardHalf;
    if (standardHalf >= minP1 && standardHalf <= maxP1 && p2_standard >= minP2 && p2_standard <= maxP2) {
        options.push({ p1: standardHalf, p2: p2_standard, deviation: 0 });
    }

    if (!step || !limit || step <= 0 || limit <= 0) {
        if (options.length === 0) options.push({ p1: standardHalf, p2: p2_standard, deviation: 0 });
        return options;
    }

    // QuÃ©t Zic-Zac (Zig-Zag)
    for (let d = step; d <= limit; d += step) {
        // Thá»­ giáº£m (vÃ­ dá»¥ 49/51)
        let p1_minus = standardHalf - d;
        let p2_minus = totalDuration - p1_minus;
        if (p1_minus >= minP1 && p1_minus <= maxP1 && p2_minus >= minP2 && p2_minus <= maxP2) {
            options.push({ p1: p1_minus, p2: p2_minus, deviation: -d });
        }

        // Thá»­ tÄƒng (vÃ­ dá»¥ 51/49)
        let p1_plus = standardHalf + d;
        let p2_plus = totalDuration - p1_plus;
        if (p1_plus >= minP1 && p1_plus <= maxP1 && p2_plus >= minP2 && p2_plus <= maxP2) {
            options.push({ p1: p1_plus, p2: p2_plus, deviation: d });
        }
    }

    const uniqueOptions = [];
    const seen = new Set();
    for (const opt of options) {
        const key = `${opt.p1}-${opt.p2}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueOptions.push(opt);
        }
    }
    if (uniqueOptions.length === 0) uniqueOptions.push({ p1: standardHalf, p2: p2_standard, deviation: 0 });
    return uniqueOptions;
}

function isBlockSetAllocatable(blocks, matrix) {
    for (const b of blocks) {
        const laneGroup = matrix.lanes[b.type];
        if (!laneGroup) return false;
        let foundLane = false;
        if (b.forcedIndex && b.forcedIndex > 0 && b.forcedIndex <= laneGroup.length) {
            const targetLane = laneGroup[b.forcedIndex - 1];
            if (matrix.checkLaneFree(targetLane, b.start, b.end).free) return true;
        }
        for (const lane of laneGroup) {
            if (matrix.checkLaneFree(lane, b.start, b.end).free) { foundLane = true; break; }
        }
        if (!foundLane) return false;
    }
    return true;
}

// ============================================================================
// PHáº¦N 7: CORE ENGINE V118.0
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "âŒ éŒ¯èª¤ï¼šæ™‚é–“æ ¼å¼ç„¡æ•ˆ" };

    const normalizedQueryDate = normalizeDateStrict(dateStr);
    const hrReq = parseInt(timeStr.split(':')[0], 10);
    let shiftedQueryDate = normalizedQueryDate;
    if (!isNaN(hrReq) && hrReq < (CONF.OPEN_HOUR || 6)) {
        const tempD = new Date(normalizedQueryDate.replace(/\//g, '-'));
        tempD.setDate(tempD.getDate() - 1);
        shiftedQueryDate = normalizeDateStrict(tempD);
    }

    const filteredBookings = currentBookingsRaw.filter(b => {
        if (!b || !b.startTimeString) return false;
        if (b.opDate) return normalizeDateStrict(b.opDate) === shiftedQueryDate;

        let rawDate = b.startTimeString.split(' ')[0];
        let rawTime = b.startTimeString.split(' ')[1] || "12:00";
        let tempOpDate = rawDate;
        const hr = parseInt(rawTime.split(':')[0], 10);
        if (!isNaN(hr) && hr < (CONF.OPEN_HOUR || 6)) {
            const tempD = new Date(rawDate);
            tempD.setDate(tempD.getDate() - 1);
            tempOpDate = normalizeDateStrict(tempD);
        }
        return tempOpDate === shiftedQueryDate;
    });

    let maxGuestDuration = 0;
    guestList.forEach(g => {
        const dur = getServiceInfo(g.serviceCode, g.serviceName).duration || 60;
        if (dur > maxGuestDuration) maxGuestDuration = dur;
    });

    // 1. GUARDRAIL CHECK (Äá»“ng bá»™ Backend & Frontend V118)
    const guardrailCheck = validateGlobalCapacity(requestStartMins, maxGuestDuration, guestList, filteredBookings, staffList, normalizedQueryDate);
    if (!guardrailCheck.pass) return { feasible: false, reason: guardrailCheck.reason, debug: guardrailCheck.debug };
    const resourceMap = guardrailCheck.resourceMap || { 'BED': [], 'CHAIR': [] };

    // 2. TIá»€N Xá»¬ LÃ BOOKING CÅ¨
    let sortedRaw = [...filteredBookings].sort((a, b) => getMinsFromTimeStr(a.startTimeString || a.startTime) - getMinsFromTimeStr(b.startTimeString || b.startTime));
    const bookingGroups = {};

    sortedRaw.forEach(b => {
        if (!isActiveBookingStatus(b.status)) return;
        const timeKey = ((b.startTimeString || b.startTime) || "").split(' ')[1] || "00:00";
        const contactInfo = b.originalData?.phone || b.originalData?.sdt || b.originalData?.custPhone || b.originalData?.customerName || "Unknown";
        const contactKey = contactInfo.toString().replace(/\D/g, '').slice(-6) || contactInfo.toString().trim();
        const statusLower = (b.status || '').toLowerCase();
        const isRunning = statusLower.includes('running') || 
                          statusLower.includes('doing') || 
                          statusLower.includes('æœå‹™ä¸­') || 
                          statusLower.includes('serving') || 
                          statusLower.includes('ðŸŸ¡');
        const groupKey = isRunning ? `RUNNING_${b.rowId}` : `${timeKey}_${contactKey}`;
        if (!bookingGroups[groupKey]) bookingGroups[groupKey] = [];
        bookingGroups[groupKey].push(b);
    });

    let remappedBookings = [];
    Object.values(bookingGroups).forEach(group => {
        group.sort((a, b) => parseInt(a.rowId) - parseInt(b.rowId));
        const groupSize = group.length; const halfSize = Math.ceil(groupSize / 2);
        group.forEach((b, idx) => {
            b._virtualInheritanceIndex = null; b._impliedFlow = null;
            const bStatus = (b.status || '').toLowerCase();
            const isBRunning = bStatus.includes('running') || 
                               bStatus.includes('doing') || 
                               bStatus.includes('æœå‹™ä¸­') || 
                               bStatus.includes('serving') || 
                               bStatus.includes('ðŸŸ¡');
            if (!isBRunning) {
                b._virtualInheritanceIndex = (groupSize >= 2) ? (idx % halfSize) + 1 : idx + 1;
                if (groupSize >= 2) b._impliedFlow = (idx < halfSize) ? 'BF' : 'FB';
            }
            remappedBookings.push(b);
        });
    });

    // 3. Táº O KHá»I THá»œI GIAN
    let existingBookingsProcessed = [];
    remappedBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTimeString || b.startTime);
        if (bStart === -1) return;
        let svcInfo = getServiceInfo(b.serviceCode, b.serviceName);
        let storedFlow = b.flow || b.originalData?.flowCode || b.originalData?.flow || null;
        let isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
        if (!isCombo) storedFlow = inferFlowFromService(svcInfo, storedFlow);

        let duration = b.duration || svcInfo.duration || 60;
        let anchorIndex = null;
        const bStatusStr = (b.status || '').toLowerCase();
        const isRunning = bStatusStr.includes('running') || 
                          bStatusStr.includes('doing') || 
                          bStatusStr.includes('æœå‹™ä¸­') || 
                          bStatusStr.includes('serving') || 
                          bStatusStr.includes('ðŸŸ¡');

        // [V135 FIX] LUÃ”N Æ°u tiÃªn láº¥y toáº¡ Ä‘á»™ thá»±c táº¿ má»™t cÃ¡ch toÃ n diá»‡n nhÆ° Guardrail
        // Äiá»u nÃ y ngÄƒn cháº·n BÃ³ng Ma Toáº¡ Äá»™ do Matrix gÃ¡n nháº§m gháº¿/giÆ°á»ng Ä‘Ã£ cÃ³ khÃ¡ch.
        const rIdStr = (b.phase1_res_idx || "") + " " + (b.phase2_res_idx || "") + " " + (b.allocated_resource || "") + " " + (b.location || "") + " " + (b.current_resource_id || "") + " " + (b.rowId || "");
        const matches = [...rIdStr.matchAll(/((?:BED|CHAIR|åºŠ|è¶³)[-_ ]?\d+)/gi)].map(m => m[1].toUpperCase());
        let uniqueMatches = [...new Set(matches)];

        if (uniqueMatches.length === 0) {
            const backupMatches = [...rIdStr.matchAll(/(\d+)/gi)].map(m => m[1]);
            let inferredType = 'CHAIR';
            if (svcInfo) {
                if (svcInfo.type === 'BED' || svcInfo.type === 'CHAIR') inferredType = svcInfo.type;
                else {
                    const name = (svcInfo.name || '').toUpperCase();
                    if (name.match(/BODY|æŒ‡å£“|æ²¹|BED|TOAN THAN|å…¨èº«|æ²¹å£“|SPA|BACK/)) inferredType = 'BED';
                }
            }
            uniqueMatches = [...new Set(backupMatches)].map(num => `${inferredType}-${num}`);
        }

        if (!anchorIndex && b._virtualInheritanceIndex && !isRunning) {
            anchorIndex = b._virtualInheritanceIndex;
        }

        const isLockedRaw = b.originalData?.isManualLocked || b.isManualLocked;
        const isLocked = (isLockedRaw === true || isLockedRaw === 'TRUE');
        let processedB = {
            id: b.rowId, originalData: b, staffName: b.staffName, serviceName: b.serviceName, category: svcInfo.category,
            isElastic: isCombo && (!isLocked) && (!isRunning),
            elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
            minFoot: svcInfo.minFoot, maxFoot: svcInfo.maxFoot, minBody: svcInfo.minBody, maxBody: svcInfo.maxBody,
            startMins: bStart, duration: duration, blocks: [], anchorIndex: anchorIndex
        };

        if (isCombo) {
            let p1 = 0;
            if (b.phase1_duration !== undefined && b.phase1_duration !== null && b.phase1_duration !== "") p1 = parseInt(b.phase1_duration, 10);
            else if (b.originalData && b.originalData.phase1_duration !== undefined && b.originalData.phase1_duration !== null && b.originalData.phase1_duration !== "") p1 = parseInt(b.originalData.phase1_duration, 10);
            else p1 = Math.floor(duration / 2);

            let p2 = duration - p1; const p1End = bStart + p1; const p2Start = p1End + CONF.TRANSITION_BUFFER;
            let isBodyFirst = false;
            const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();

            if (storedFlow === 'BF') isBodyFirst = true;
            else if (storedFlow === 'FB') isBodyFirst = false;
            else {
                if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('å…ˆåšèº«é«”')) isBodyFirst = true;
                else if (isRunning && b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) isBodyFirst = true;
                else if (b._impliedFlow === 'BF') isBodyFirst = true;
            }

            let p1Index = null;
            let p2Index = null;

            if (uniqueMatches.length >= 2) {
                let res1, res2;
                if (isBodyFirst) {
                    res1 = uniqueMatches.find(r => r.includes('BED') || r.includes('åºŠ')) || uniqueMatches[0];
                    res2 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('è¶³')) || uniqueMatches[1];
                } else {
                    res1 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('è¶³')) || uniqueMatches[0];
                    res2 = uniqueMatches.find(r => r.includes('BED') || r.includes('åºŠ')) || uniqueMatches[1];
                }
                if (res1) { const m = res1.match(/(\d+)/); if (m) p1Index = parseInt(m[0], 10); }
                if (res2) { const m = res2.match(/(\d+)/); if (m) p2Index = parseInt(m[0], 10); }
            } else if (uniqueMatches.length === 1) {
                const mType = (uniqueMatches[0].toUpperCase().includes('BED') || uniqueMatches[0].includes('åºŠ')) ? 'BED' : 'CHAIR';
                const m = uniqueMatches[0].match(/(\d+)/);
                if (m) {
                    const parsedIdx = parseInt(m[0], 10);
                    if (isBodyFirst) {
                        if (mType === 'BED') p1Index = parsedIdx;
                        else p2Index = parsedIdx;
                    } else {
                        if (mType === 'CHAIR') p1Index = parsedIdx;
                        else p2Index = parsedIdx;
                    }
                }
            }

            if (!p1Index) p1Index = anchorIndex;

            if (isBodyFirst) {
                processedB.blocks.push({ start: bStart, end: p1End + CONF.CLEANUP_BUFFER, type: 'BED', forcedIndex: p1Index });
                processedB.blocks.push({ start: p2Start, end: p2Start + p2 + CONF.CLEANUP_BUFFER, type: 'CHAIR', forcedIndex: p2Index });
                processedB.flow = 'BF';
            } else {
                processedB.blocks.push({ start: bStart, end: p1End + CONF.CLEANUP_BUFFER, type: 'CHAIR', forcedIndex: p1Index });
                processedB.blocks.push({ start: p2Start, end: p2Start + p2 + CONF.CLEANUP_BUFFER, type: 'BED', forcedIndex: p2Index });
                processedB.flow = 'FB';
            }
            processedB.p1_current = p1; processedB.p2_current = p2;
        } else {
            processedB.flow = storedFlow;
            let rType = (storedFlow === 'FOOTSINGLE') ? 'CHAIR' : 'BED';
            let resHint = rIdStr.toUpperCase();
            if (resHint.includes('CHAIR') || resHint.includes('è¶³')) rType = 'CHAIR';
            else if (resHint.includes('BED') || resHint.includes('åºŠ')) rType = 'BED';
            
            let forcedIdx = anchorIndex;
            if (uniqueMatches.length > 0) {
                const m = uniqueMatches[0].match(/(\d+)/);
                if (m) forcedIdx = parseInt(m[0], 10);
            }
            
            const { realDuration } = calculateRealDurations(b, duration, isCombo); processedB.blocks.push({ start: bStart, end: bStart + realDuration + CONF.CLEANUP_BUFFER, type: rType, forcedIndex: forcedIdx });
        }
        existingBookingsProcessed.push(processedB);
    });

    // 4. Ká»ŠCH Báº¢N MATRIX KHÃCH Má»šI
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => isComboService(getServiceInfo(g.serviceCode, g.serviceName), g.serviceCode, g.flowCode));
    const newGuestHalfSize = Math.ceil(comboGuests.length / 2);
    const maxBF = comboGuests.length;
    let trySequence = [];

    if (maxBF === 2) { trySequence = [0, 2, 1]; }
    else if (maxBF > 0) {
        let mid = maxBF / 2;
        trySequence.push(Math.ceil(mid));
        if (Math.floor(mid) !== Math.ceil(mid)) trySequence.push(Math.floor(mid));
        let step = 1;
        while (true) {
            let nextUp = Math.ceil(mid) + step; let nextDown = Math.floor(mid) - step;
            if (nextUp > maxBF && nextDown < 0) break;
            if (nextUp <= maxBF) trySequence.push(nextUp);
            if (nextDown >= 0) trySequence.push(nextDown);
            step++;
        }
    } else { trySequence.push(0); }

    let successfulScenario = null;
    let failureLog = [];

    for (let numBF of trySequence) {
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;

        let softsToSqueezeCandidates = [];
        for (const exB of existingBookingsProcessed) {
            let placedSuccessfully = true; let allocatedSlots = [];
            for (const block of exB.blocks) {
                const realEnd = block.end;
                // --- V118.4 FIX: Ã‰p buá»™c Ä‘áº·t chá»— (isForced = true) cho cÃ¡c Booking Ä‘Ã£ cÃ³ sáºµn ---
                const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id, block.forcedIndex, true);
                if (!slotId) { placedSuccessfully = false; break; }
                allocatedSlots.push(slotId);
            }
            if (exB.isElastic) {
                if (placedSuccessfully) exB.allocatedSlots = allocatedSlots;
                softsToSqueezeCandidates.push(exB);
            }
        }

        let newGuestBlocksMap = [];
        for (const ng of newGuests) {
            const svc = getServiceInfo(ng.serviceCode, ng.serviceName);
            let flow = 'FB';
            let isThisGuestCombo = isComboService(svc, ng.serviceCode, ng.flowCode);

            if (isThisGuestCombo) {
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                if (cIdx >= 0 && cIdx < numBF) { flow = 'BF'; }
            } else { flow = inferFlowFromService(svc, ng.flowCode); }

            const duration = svc.duration || 60; let blocks = []; let elasticOptions = [];
            if (isThisGuestCombo) {
                const p1Standard = Math.floor(duration / 2); const p2Standard = duration - p1Standard;
                const isCrossSwapGroup = comboGuests.length >= 2 && numBF > 0 && numBF < comboGuests.length;
                const phase1Cleanup = isCrossSwapGroup ? Math.min(CONF.CLEANUP_BUFFER, CONF.TRANSITION_BUFFER) : CONF.CLEANUP_BUFFER;

                const splits = generateElasticSplits(duration, svc.elasticStep || 5, svc.elasticLimit || 15, null, svc.minFoot, svc.maxFoot, svc.minBody, svc.maxBody, flow);

                if (flow === 'FB') {
                    const t1End = requestStartMins + p1Standard; const t2Start = t1End + CONF.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + phase1Cleanup, type: 'CHAIR' });
                    blocks.push({ start: t2Start, end: t2Start + p2Standard + CONF.CLEANUP_BUFFER, type: 'BED' });
                    scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'FB', timeStr: timeStr, allocated: [] });
                    
                    splits.forEach(split => {
                        const sT1End = requestStartMins + split.p1; const sT2Start = sT1End + CONF.TRANSITION_BUFFER;
                        elasticOptions.push({
                            p1: split.p1, p2: split.p2,
                            blocks: [
                                { start: requestStartMins, end: sT1End + phase1Cleanup, type: 'CHAIR' },
                                { start: sT2Start, end: sT2Start + split.p2 + CONF.CLEANUP_BUFFER, type: 'BED' }
                            ]
                        });
                    });
                } else {
                    const t1End = requestStartMins + p2Standard; const t2Start = t1End + CONF.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + phase1Cleanup, type: 'BED' });
                    blocks.push({ start: t2Start, end: t2Start + p1Standard + CONF.CLEANUP_BUFFER, type: 'CHAIR' });
                    scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'BF', timeStr: timeStr, allocated: [] });

                    splits.forEach(split => {
                        const sT1End = requestStartMins + split.p2; const sT2Start = sT1End + CONF.TRANSITION_BUFFER;
                        elasticOptions.push({
                            p1: split.p1, p2: split.p2,
                            blocks: [
                                { start: requestStartMins, end: sT1End + phase1Cleanup, type: 'BED' },
                                { start: sT2Start, end: sT2Start + split.p1 + CONF.CLEANUP_BUFFER, type: 'CHAIR' }
                            ]
                        });
                    });
                }
            } else {
                let rType = (flow === 'FOOTSINGLE') ? 'CHAIR' : 'BED';
                blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONF.CLEANUP_BUFFER, type: rType });
                scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, flow: flow, timeStr: timeStr, allocated: [] });
            }
            newGuestBlocksMap.push({ guest: ng, blocks: blocks, isCombo: isThisGuestCombo, duration: duration, flow: flow });
        }

        let conflictFound = false;
        for (const item of newGuestBlocksMap) {
            let guestAllocations = [];
            
            // [V118.10 FIX] é—œé–‰ suggestedLanes å¼·åˆ¶ç¶å®šï¼Œè®“ Top-Down Packing èƒ½å¤ åœ¨äº¤å‰å®‰æŽ’ (BF/FB) æ™‚è‡ªç„¶å¡«è£œç©ºéš™ã€‚
            const useSuggestedLanes = false;
            let preferredIdx = null;

            if (!useSuggestedLanes && newGuestHalfSize > 0 && newGuests.length >= 2) {
                preferredIdx = (item.guest.idx % newGuestHalfSize) + 1;
                if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdx = item.guest.idx + 1;
            }

            for (const block of item.blocks) {
                let specificPrefIdx = preferredIdx;
                let isPrefForced = false;

                if (useSuggestedLanes) {
                    specificPrefIdx = guardrailCheck.suggestedLanes[item.guest.idx][block.type] || preferredIdx;
                    if (specificPrefIdx !== null) isPrefForced = true; // Báº¯t buá»™c Æ°u tiÃªn toáº¡ Ä‘á»™ Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c minh lÃ  an toÃ n
                }

                const slotId = matrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, specificPrefIdx, isPrefForced);
                if (!slotId) { conflictFound = true; break; }
                guestAllocations.push(slotId);
            }
            if (conflictFound) break;
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) {
                detail.allocated = guestAllocations;
                // [V117.0/V118.0] PhÃ¢n tÃ¡ch tá»a Ä‘á»™ Ä‘á»ƒ Sheet hiá»ƒu chÃ­nh xÃ¡c
                detail.phase1_res_idx = guestAllocations[0] || null;
                detail.phase2_res_idx = guestAllocations[1] || null;
            }
        }

        // 5. SQUEEZE LOGIC (Co giÃ£n lá»‹ch)
        if (conflictFound) {
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];

        const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
        hardBookings.forEach(hb => { hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end, hb.id, blk.forcedIndex, true)); });

                    let squeezeScenarioPossible = false;
                    const placeNewGuestsElastically = (guestIndex, currentMatrix, currentDetails, currentUpdates) => {
                        if (guestIndex >= newGuestBlocksMap.length) return true;
                        
                        const item = newGuestBlocksMap[guestIndex];
                        const useSuggestedLanes = false;
                        let preferredIdxSqueeze = null;
                        if (!useSuggestedLanes && newGuestHalfSize > 0 && newGuests.length >= 2) {
                            preferredIdxSqueeze = (item.guest.idx % newGuestHalfSize) + 1;
                            if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdxSqueeze = item.guest.idx + 1;
                        }

                        let splitsToTry = [];
                        if (item.isCombo) {
                            // Backend version: Use full generator parameters to respect sheet config bounds
                            const minFoot = item.guest.minFoot; const maxFoot = item.guest.maxFoot;
                            const minBody = item.guest.minBody; const maxBody = item.guest.maxBody;
                            const elasticStep = item.guest.elasticStep || 1;
                            const elasticLimit = item.guest.elasticLimit || 20;
                            splitsToTry = generateElasticSplits(item.duration, elasticStep, elasticLimit, null, minFoot, maxFoot, minBody, maxBody, item.flow);
                        } else {
                            splitsToTry = [{ p1: item.duration, p2: 0, deviation: 0 }];
                        }

                        for (const split of splitsToTry) {
                            let testBlocks = [];
                            if (item.isCombo) {
                                if (item.flow === 'FB') {
                                    const t1End = requestStartMins + split.p1;
                                    const t2Start = t1End + CONF.TRANSITION_BUFFER;
                                    testBlocks.push({ start: requestStartMins, end: t1End + CONF.CLEANUP_BUFFER, type: 'CHAIR' });
                                    testBlocks.push({ start: t2Start, end: t2Start + split.p2 + CONF.CLEANUP_BUFFER, type: 'BED' });
                                } else {
                                    const t1End = requestStartMins + split.p1;
                                    const t2Start = t1End + CONF.TRANSITION_BUFFER;
                                    testBlocks.push({ start: requestStartMins, end: t1End + CONF.CLEANUP_BUFFER, type: 'BED' });
                                    testBlocks.push({ start: t2Start, end: t2Start + split.p2 + CONF.CLEANUP_BUFFER, type: 'CHAIR' });
                                }
                            } else {
                                testBlocks = item.blocks;
                            }

                            let fit = true;
                            let clonedMatrix = new VirtualMatrix();
                            clonedMatrix.lanes = JSON.parse(JSON.stringify(currentMatrix.lanes));
                            clonedMatrix.blockLog = [...currentMatrix.blockLog];
                            
                            let currentGuestAllocations = [];
                            for (const block of testBlocks) {
                                let specificPrefIdx = preferredIdxSqueeze;
                                let isPrefForced = false;
                                if (useSuggestedLanes) {
                                    specificPrefIdx = guardrailCheck.suggestedLanes[item.guest.idx][block.type] || preferredIdxSqueeze;
                                    if (specificPrefIdx !== null) isPrefForced = true;
                                }
                                const slotId = clonedMatrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, specificPrefIdx, isPrefForced);
                                if (!slotId) { fit = false; break; }
                                currentGuestAllocations.push(slotId);
                            }

                            if (fit) {
                                const detail = currentDetails.find(d => d.guestIndex === item.guest.idx);
                                let oldP1, oldP2, oldAllocated;
                                if (detail) {
                                    oldAllocated = detail.allocated;
                                    detail.allocated = currentGuestAllocations;
                                    if (item.isCombo) {
                                        oldP1 = detail.phase1_duration; oldP2 = detail.phase2_duration;
                                        detail.phase1_duration = split.p1;
                                        detail.phase2_duration = split.p2;
                                    }
                                }
                                
                                let nextUpdates = [...currentUpdates];
                                if (item.isCombo && split.deviation !== 0) {
                                    nextUpdates.push({ rowId: 'NEW', customerName: 'æ–°å®¢', newPhase1: split.p1, newPhase2: split.p2, reason: 'âš ï¸ ç³»çµ±å·²è‡ªå‹•å•Ÿå‹•å½ˆæ€§æ™‚é–“å®‰æŽ’ä»¥ç¬¦åˆç©ºä½' });
                                }

                                if (placeNewGuestsElastically(guestIndex + 1, clonedMatrix, currentDetails, nextUpdates)) {
                                    Object.assign(currentMatrix.lanes, clonedMatrix.lanes);
                                    currentMatrix.blockLog = clonedMatrix.blockLog;
                                    updatesProposed.push(...nextUpdates);
                                    return true;
                                }
                                
                                if (detail) {
                                    detail.allocated = oldAllocated;
                                    if (item.isCombo) {
                                        detail.phase1_duration = oldP1;
                                        detail.phase2_duration = oldP2;
                                    }
                                }
                            }
                        }
                        return false;
                    };
                    
                    squeezeScenarioPossible = placeNewGuestsElastically(0, matrixSqueeze, scenarioDetails, []);
                    if (!squeezeScenarioPossible) {
                        if (matrixSqueeze.blockLog.length > 0) failureLog = matrixSqueeze.blockLog;
                        scenarioFailed = true; continue;
                    }

            const softBookings = existingBookingsProcessed.filter(b => b.isElastic);
            for (const sb of softBookings) {
                const splits = generateElasticSplits(sb.duration, sb.elasticStep, sb.elasticLimit, null, sb.minFoot, sb.maxFoot, sb.minBody, sb.maxBody, sb.flow);
                let fit = false;
                for (const split of splits) {
                    const sP1End = sb.startMins + split.p1; const sP2Start = sP1End + CONF.TRANSITION_BUFFER; const sP2End = sP2Start + split.p2;
                    const testBlocks = [
                        { type: sb.blocks[0].type, start: sb.startMins, end: sP1End + CONF.CLEANUP_BUFFER, forcedIndex: sb.blocks[0].forcedIndex },
                        { type: sb.blocks[1].type, start: sP2Start, end: sP2End + CONF.CLEANUP_BUFFER, forcedIndex: sb.blocks[1] ? sb.blocks[1].forcedIndex : null }
                    ];
                    if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                        let allocatedSlot1 = null; let allocatedSlot2 = null;
                        testBlocks.forEach((tb, idx) => {
                            let slotId = matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id, tb.forcedIndex);
                            if (idx === 0) allocatedSlot1 = slotId;
                            else if (idx === 1) allocatedSlot2 = slotId;
                        });
                        fit = true;
                        
                        const originalP1Res = sb.blocks[0].type + '-' + (sb.blocks[0].forcedIndex || 'X');
                        const originalP2Res = sb.blocks[1] ? (sb.blocks[1].type + '-' + (sb.blocks[1].forcedIndex || 'X')) : null;
                        let coordChanged = false;
                        if (allocatedSlot1 && sb.blocks[0].forcedIndex && allocatedSlot1 !== originalP1Res) coordChanged = true;
                        if (allocatedSlot2 && sb.blocks[1] && sb.blocks[1].forcedIndex && allocatedSlot2 !== originalP2Res) coordChanged = true;

                        if (split.deviation !== 0 || coordChanged) {
                            updatesProposed.push({
                                rowId: sb.id,
                                customerName: sb.originalData.customerName,
                                newPhase1: split.p1,
                                newPhase2: split.p2,
                                newPhase1Res: allocatedSlot1,
                                newPhase2Res: allocatedSlot2,
                                reason: 'âš ï¸ ç³»çµ±å·²è‡ªå‹•å•Ÿå‹•å½ˆæ€§æ™‚é–“å®‰æŽ’ä¸¦é‡æ–°åˆ†é…è³‡æº'
                            });
                        }
                        break;
                    }
                }
                if (!fit) { squeezeScenarioPossible = false; break; }
            }
            if (squeezeScenarioPossible) {
                scenarioUpdates = updatesProposed;
                matrix = matrixSqueeze;

            } else {
                if (matrixSqueeze.blockLog.length > 0) failureLog = matrixSqueeze.blockLog;
                scenarioFailed = true; continue;
            }
        }

        // 6. STAFF ASSIGNMENT
        let flatTimeline = [];
        Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
            const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
            if (ex) flatTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
        })));

        let staffAssignmentSuccess = true;
        for (const item of newGuestBlocksMap) {
            const assignedStaff = findAvailableStaff(item.guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length - 1].end, staffList, flatTimeline, dateStr);
            if (!assignedStaff) { staffAssignmentSuccess = false; break; }
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) detail.staff = assignedStaff;
            item.blocks.forEach(b => flatTimeline.push({ start: b.start, end: b.end, staffName: assignedStaff }));
        }

        if (!staffAssignmentSuccess) { scenarioFailed = true; continue; }

        // --- V118.4 DOUBLE-CHECK GUARDRAIL: Removed because resourceMap is static and fails valid squeeze scenarios ---
        let collisionDetected = false;
        // -------------------------------------------------------------

        successfulScenario = { details: scenarioDetails, updates: scenarioUpdates, matrixDump: matrix.lanes }; break;
    }

    if (successfulScenario) {
        successfulScenario.details.sort((a, b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true, strategy: 'MATRIX_UNIVERSAL_V118.0',
            details: successfulScenario.details, proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price || 0), 0),
            debug: guardrailCheck.debug
        };
    } else {
        const debugReason = failureLog.slice(-2).join(' | ');
        const failMessage = debugReason ? `âŒ ç³»çµ±æ»¿è¼‰ï¼š${debugReason}` : "âŒ å·²é¡æ»¿ï¼ˆç³»çµ±æ»¿è¼‰ï¼‰";
        return { feasible: false, reason: failMessage, debug: guardrailCheck.debug };
    }
}

// ============================================================================
// PHáº¦N 8: MODULE EXPORT
// ============================================================================
const CoreAPI = {
    checkRequestAvailability, setDynamicServices, get SERVICES() { return SERVICES; },
    CONFIG: CONF, // Giá»¯ tÃªn biáº¿n CONFIG khi xuáº¥t ra Ä‘á»ƒ tÆ°Æ¡ng thÃ­ch ngÆ°á»£c vá»›i index.js cÅ© náº¿u cÃ³
    getMinsFromTimeStr, getTimeStrFromMins, getTaipeiNow, normalizeDateStrict, inferFlowFromService
};


// --- END CORE LOGIC ---
    return {
        checkRequestAvailability: CoreAPI.checkRequestAvailability,
        setDynamicServices: CoreAPI.setDynamicServices,
        getSystemConfig: () => CoreAPI.CONFIG,
        CONFIG: CoreAPI.CONFIG
    };
})();

    // ========================================================================
    // PHẦN 2: DATA FETCHER
    // ========================================================================
    const fetchLiveServerData = async (isForceRefresh = false) => {
        const apiUrl = window.API_URL || window.GAS_API_URL || (window.CONFIG && window.CONFIG.API_URL);
        if (!apiUrl) { console.warn("⚠️ Warning: API_URL missing."); return null; }
        try {
            const params = [`_t=${new Date().getTime()}`];
            if (isForceRefresh) params.push('forceRefresh=true');
            const targetUrl = apiUrl.includes('?') ? `${apiUrl}&${params.join('&')}` : `${apiUrl}?${params.join('&')}`;
            const response = await fetch(targetUrl);
            const data = await response.json();
            if (data && data.staffList && data.bookings) return data;
            return null;
        } catch (err) { console.error("❌ Fetch Failed", err); return null; }
    };

    // ========================================================================
    // PHẦN 3: BRIDGE LOGIC & REACT COMPONENT
    // ========================================================================
    const { useState, useEffect, useMemo, useCallback } = React;

    const syncServicesToCore = () => {
        const rawServices = window.SERVICES_DATA || {};
        const formattedServices = {};
        Object.keys(rawServices).forEach(key => {
            const svc = rawServices[key];
            const sType = svc.type ? svc.type.toUpperCase() : 'BODY';
            let defFlow = 'BODYSINGLE';
            if (sType === 'FOOT' || sType === 'CHAIR') defFlow = 'FOOTSINGLE';
            else if (sType === 'BODY' || sType === 'BED') defFlow = 'BODYSINGLE';
            formattedServices[key] = {
                name: svc.name || key, duration: parseInt(svc.duration) || 60,
                type: sType, category: svc.category || 'SINGLE', price: svc.price || 0,
                elasticStep: svc.elasticStep || 0, elasticLimit: svc.elasticLimit || 0,
                defaultFlow: defFlow
            };
        });
        CoreKernel.setDynamicServices(formattedServices);
    };

    const mergeBookingData = (serverBookings, localBookings) => {
        if (!Array.isArray(serverBookings)) serverBookings = [];
        if (!Array.isArray(localBookings)) localBookings = [];
        const mergedMap = new Map();
        serverBookings.forEach(b => { if (b.rowId) mergedMap.set(b.rowId, b); });
        localBookings.forEach(b => { if (b.rowId) mergedMap.set(b.rowId, b); });
        return Array.from(mergedMap.values());
    };

    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList) => {
        syncServicesToCore();
        const now = new Date();
        const STATUS = getBookingStatus();

        const coreGuests = guests.map(g => {
            let foundCode = getServiceCodeByName(g.service);
            const svcDef = window.SERVICES_DATA && foundCode ? window.SERVICES_DATA[foundCode] : null;
            let impliedFlow = undefined;
            if (svcDef) {
                const cat = (svcDef.category || '').toUpperCase();
                const sType = (svcDef.type || 'BODY').toUpperCase();
                if (cat !== 'COMBO' && cat !== 'MIXED') {
                    if (sType === 'FOOT' || sType === 'CHAIR') impliedFlow = 'FOOTSINGLE';
                    else impliedFlow = 'BODYSINGLE';
                }
            }

            // CHUẨN HÓA ID THỢ TỪ GUEST
            let rawStaff = g.staff;
            let normalizedStaff = 'RANDOM';
            if (rawStaff === '隨機') normalizedStaff = 'RANDOM';
            else if (rawStaff === '女' || rawStaff === '女師') normalizedStaff = 'FEMALE';
            else if (rawStaff === '男' || rawStaff === '男師') normalizedStaff = 'MALE';
            else normalizedStaff = normalizeStaffId(rawStaff);

            return {
                serviceCode: foundCode || g.service,
                staffName: normalizedStaff,
                flowCode: impliedFlow
            };
        });

        const targetDateStandard = normalizeDateStrict(date);
        
        // --- XỬ LÝ THEO QUY TẮC TUYỆT ĐỐI ±8 TIẾNG ---
        const reqDateParts = targetDateStandard.replace(/\//g, '-').split('-');
        const reqTimeParts = (time || "12:00").split(':');
        const reqDateObj = new Date(parseInt(reqDateParts[0], 10), parseInt(reqDateParts[1], 10) - 1, parseInt(reqDateParts[2], 10), parseInt(reqTimeParts[0], 10), parseInt(reqTimeParts[1], 10), 0);
        const reqTimeMs = reqDateObj.getTime();

        const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

        let reqH = parseInt(reqTimeParts[0], 10);
        let reqM = parseInt(reqTimeParts[1], 10);
        if (reqH < 8) reqH += 24;
        const reqMinsCore = (reqH * 60) + reqM;

        const coreBookings = (Array.isArray(bookings) ? bookings : []).filter(b => {
            if (!b || !b.startTimeString) return false;

            // [V116.7 LỖI TRẠNG THÁI] Lọc bỏ hoàn toàn các đơn Đã Hủy hoặc Đã Hoàn Thành bằng chuẩn SSOT
            // Ngăn chặn việc đơn cũ bị tái sinh thành "Đang Phục Vụ" do thời gian quá khứ
            const isInactive = b.status && (
                b.status.includes('hủy') || b.status.includes('Cancel') || b.status.includes('取消') || b.status.includes(STATUS.CANCELLED) ||
                b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅') || b.status.includes(STATUS.COMPLETED)
            );
            if (isInactive) return false;

            let bDateObj;
            try { 
                bDateObj = new Date(b.startTimeString.replace(/\//g, '-')); 
            } catch (e) {}

            if (!bDateObj || isNaN(bDateObj.getTime())) {
                const rawDate = b.startTimeString.split(' ')[0];
                let bOpDate = b.opDate || rawDate;
                return normalizeDateStrict(bOpDate) === targetDateStandard;
            }

            const diffMs = bDateObj.getTime() - reqTimeMs;
            return Math.abs(diffMs) <= EIGHT_HOURS_MS;
        }).map(b => {
            let isPastOrRunning = false;
            let bDateObjRaw;
            try { bDateObjRaw = new Date(b.startTimeString.replace(/\//g, '-')); } catch (e) {}
            
            if (bDateObjRaw && !isNaN(bDateObjRaw.getTime())) {
                if (bDateObjRaw.getTime() <= now.getTime()) isPastOrRunning = true;
            } else {
                try { if (new Date(b.startTimeString) <= now) isPastOrRunning = true; } catch (e) { }
            }
            
            // Tính toán Fake StartTime
            let mappedStartTime = b.startTimeString;
            if (bDateObjRaw && !isNaN(bDateObjRaw.getTime())) {
                const diffMins = Math.round((bDateObjRaw.getTime() - reqTimeMs) / 60000);
                const targetMins = reqMinsCore + diffMins;
                let h_final = Math.floor(targetMins / 60);
                let m_final = targetMins % 60;
                if (m_final < 0) { m_final += 60; h_final -= 1; }
                let h_str = h_final < 8 ? h_final - 24 : h_final;
                mappedStartTime = `${h_str}:${String(m_final).padStart(2, '0')}`;
            }

            let serverLockSignal = b.isManualLocked;
            if (serverLockSignal === undefined && b.originalData) serverLockSignal = b.originalData.isManualLocked;
            const isExplicitlyLocked = (serverLockSignal === true || String(serverLockSignal).toUpperCase() === 'TRUE' || serverLockSignal === 1);
            const finalLockState = isExplicitlyLocked || isPastOrRunning;

            // Gán giá trị trạng thái SSOT mới
            let normalizedStatus = b.status || STATUS.WAITING;
            if (isPastOrRunning) normalizedStatus = STATUS.SERVING;

            // ==============================================================
            // TRỌNG TÂM: GOM TOÀN BỘ THỢ (CỘT L, M, N...) THÀNH MẢNG
            // ==============================================================
            let rawStaffs = [];
            if (b.technician) rawStaffs.push(b.technician);
            if (b.staffId) rawStaffs.push(b.staffId);

            // Quét các cột phụ từ staffId2 đến staffId9 (hoặc tương đương)
            for (let i = 2; i <= 9; i++) {
                if (b[`staffId${i}`]) rawStaffs.push(b[`staffId${i}`]);
                if (b.originalData && b.originalData[`staffId${i}`]) rawStaffs.push(b.originalData[`staffId${i}`]);
            }

            // Lọc bỏ undefined/null/Unassigned và trùng lặp
            let uniqueRawStaffs = [...new Set(rawStaffs.filter(s => s && String(s).trim() !== "" && s !== "Unassigned"))];
            let normalizedStaffs = uniqueRawStaffs.map(s => normalizeStaffId(s));

            // Lấy ID chính để tương thích với các UI hiện hành
            let primaryStaff = normalizedStaffs.length > 0 ? normalizedStaffs[0] : "Unassigned";

            return {
                serviceCode: b.serviceCode || b.serviceName, serviceName: b.serviceName,
                startTime: mappedStartTime, duration: parseInt(b.duration) || 60,
                staffName: primaryStaff,
                assignedStaffs: normalizedStaffs, // MẢNG THỢ MỚI
                rowId: b.rowId,
                allocated_resource: b.resourceId || b.allocated_resource || b.rowId,
                location: b.location || (b.originalData ? b.originalData.location : null),
                current_resource_id: b.current_resource_id || (b.originalData ? b.originalData.current_resource_id : null),
                phase1_res_idx: b.phase1_res_idx || (b.originalData ? b.originalData.phase1_res_idx : null),
                phase2_res_idx: b.phase2_res_idx || (b.originalData ? b.originalData.phase2_res_idx : null),
                originalData: b, isManualLocked: finalLockState,
                phase1_duration: b.phase1_duration !== undefined ? parseInt(b.phase1_duration) : (b.originalData?.phase1_duration ? parseInt(b.originalData.phase1_duration) : null),
                phase2_duration: b.phase2_duration !== undefined ? parseInt(b.phase2_duration) : (b.originalData?.phase2_duration ? parseInt(b.originalData.phase2_duration) : null),
                status: normalizedStatus,
                note: b.ghiChu || b.note, ghiChu: b.ghiChu || b.note,
                flow: b.flow || b.originalData?.flowCode || b.originalData?.mainFlow
            };
        });

        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                // CHUẨN HÓA ID KEY CHO STAFFMAP
                const sId = normalizeStaffId(String(s.id).trim());
                const rawStart = s['上班'] || s.start || s.shiftStart || "00:00";
                const rawEnd = s['下班'] || s.end || s.shiftEnd || "00:00";
                const dayStatus = s[targetDateStandard] || s[targetDateStandard.replace(/\//g, '-')] || "";
                let isOff = (String(s.offDays || "").includes(targetDateStandard) || String(dayStatus).toUpperCase().includes('OFF') || String(dayStatus).toUpperCase() === 'X');
                staffMap[sId] = {
                    id: sId, gender: s.gender, start: rawStart, end: rawEnd,
                    isStrictTime: (s.isStrictTime === true || String(s.isStrictTime).toUpperCase() === 'TRUE'), off: isOff,
                    offDays: s.offDays, customShifts: s.customShifts
                };
                // Đồng bộ cả key name nếu có
                if (s.name) staffMap[normalizeStaffId(String(s.name).trim())] = staffMap[sId];
            });
        }
        try {
            const result = CoreKernel.checkRequestAvailability(targetDateStandard, time, coreGuests, coreBookings, staffMap);
            return result.feasible
                ? { valid: true, details: result.details, proposedUpdates: result.proposedUpdates, debug: result.debug }
                : { valid: false, reason: result.reason, debug: result.debug };
        } catch (err) { return { valid: false, reason: "System Error: " + err.message }; }
    };

    const forceGlobalRefresh = () => { if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender(); else window.location.reload(); };

    // ==================================================================================
    // 4. COMPONENT: PHONE BOOKING MODAL
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate, editingBooking }) => {
        // Chuẩn hóa ID thợ ngay từ list đầu vào để tránh lỗi Map/Dropdown
        const safeStaffList = useMemo(() => {
            if (!staffList) return [];
            return staffList.map(s => ({ ...s, id: normalizeStaffId(s.id) }));
        }, [staffList]);

        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [isChecking, setIsChecking] = useState(false);
        const [serverData, setServerData] = useState(null);

        // SURNAME PICKER STATE
        const [showSurnamePicker, setShowSurnamePicker] = useState(false);

        // Default: "套餐 (120分)"
        const defaultService = useMemo(() => {
            if (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) {
                if (window.SERVICES_LIST.includes("套餐 (120分)")) {
                    return "套餐 (120分)";
                }
                return window.SERVICES_LIST[0];
            }
            return "Body Massage";
        }, []);

        const getRoundedCurrentTime = () => {
            const now = new Date();
            let h = now.getHours();
            let m = now.getMinutes();
            let remainder = m % 10;
            if (remainder !== 0) {
                m += (10 - remainder);
                if (m >= 60) {
                    m = 0;
                    h = (h + 1) % 24;
                }
            }
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };

        // --- NÂNG CẤP CA ĐÊM (OVERNIGHT SHIFT) ---
        // initialDate truyền từ cyx_app.js vốn dĩ là Operation Date (VD: 02:30 sáng ngày 21 thì initialDate = 20)
        // Ta cần phục hồi nó thành Physical Date (21) để Lễ tân hiển thị đúng
        const getInitialPhysicalDate = () => {
            let baseDateStr = initialDate;

            // Nếu là Walk-in (tạo mới từ UI), initialDate được truyền vào (VD "2026-04-20")
            // Nếu không có, dùng Date hiện tại theo timezone (không dùng ISOString() vì bị lệch UTC)
            if (!baseDateStr) {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                baseDateStr = `${y}-${m}-${d}`;
            }

            return baseDateStr;
        };

        // --- TITLE STATE ---
        const [form, setForm] = useState({
            date: getInitialPhysicalDate(),
            time: getRoundedCurrentTime(), pax: 1, custName: '', custTitle: '', custPhone: '09', adminNote: ''
        });

        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isYouTui: false, isGuaSha: false, isHuaGuan: false, isBaGuan: false }]);

        useEffect(() => {
            if (editingBooking) {
                let timeStr = getRoundedCurrentTime(); let dateStr = initialDate;
                if (editingBooking.startTimeString) {
                    const parts = editingBooking.startTimeString.split(' ');
                    if (parts.length >= 2) {
                        dateStr = parts[0].replace(/\//g, '-');
                        timeStr = parts[1].substring(0, 5);
                    }
                }

                let rawName = (editingBooking.customerName || "").split('(')[0].trim();
                let parsedTitle = '';
                if (rawName.endsWith('先生')) {
                    parsedTitle = '先生';
                    rawName = rawName.slice(0, -2).trim();
                } else if (rawName.endsWith('小姐')) {
                    parsedTitle = '小姐';
                    rawName = rawName.slice(0, -2).trim();
                }

                const noteStr = editingBooking.ghiChu || editingBooking.note || "";

                setForm({
                    date: dateStr, time: timeStr, pax: editingBooking.pax || 1,
                    custName: rawName,
                    custTitle: parsedTitle,
                    custPhone: editingBooking.phone || "09",
                    adminNote: editingBooking.adminNote || ""
                });
                setGuestDetails([{
                    service: editingBooking.serviceName || defaultService,
                    staff: editingBooking.staffId ? normalizeStaffId(editingBooking.staffId) : '隨機',
                    isYouTui: editingBooking.isYouTui || false,
                    isGuaSha: noteStr.includes('刮痧/拔罐')
                }]);
            }
            fetchLiveServerData(true).then(data => { if (data) setServerData(data); });
        }, [editingBooking, initialDate, defaultService]);



        const safeQuickNotes = useMemo(() => {
            const rawList = serverData?.quickNotes || window.QUICK_NOTES || [];
            if (!Array.isArray(rawList)) return [];
            return rawList.filter(n => typeof n === 'string' && n.trim() !== '');
        }, [serverData]);

        const handleTimeChange = useCallback((type, value) => {
            setForm(prev => {
                const parts = (prev.time || "12:00").split(':');
                const newHour = type === 'HOUR' ? value : parts[0];
                const newMinute = type === 'MINUTE' ? value : parts[1];
                let newDate = prev.date;

                return { ...prev, date: newDate, time: `${newHour}:${newMinute}` };
            });
            setCheckResult(null); setSuggestions([]);
        }, []);

        const handleDateShift = useCallback((days) => {
            setForm(prev => {
                const dParts = prev.date.replace(/\//g, '-').split('-');
                if (dParts.length === 3) {
                    let d = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
                    d.setDate(d.getDate() + days);
                    return { ...prev, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
                }
                return prev;
            });
            setCheckResult(null); setSuggestions([]);
        }, []);

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
            setForm(prev => ({ ...prev, pax: num })); setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const newD = [...prev];
                if (num > prev.length) for (let i = prev.length; i < num; i++) newD.push({ service: prev[0]?.service || defaultService, staff: '隨機', isYouTui: false, isGuaSha: false, isHuaGuan: false, isBaGuan: false });
                else newD.length = num;
                return newD;
            });
        };

        const handleGuestUpdate = (idx, field, val) => {
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const c = [...prev]; c[idx] = { ...c[idx] };
                if (field === 'service') {
                    c[idx].service = val;
                    if (val && (val.includes('足') || val.includes('Foot'))) c[idx].isYouTui = false;
                }
                else if (field === 'staff') {
                    c[idx].staff = val;
                }
                else if (field === 'toggleYouTui') {
                    c[idx].isYouTui = !c[idx].isYouTui;
                }
                else if (field === 'toggleGuaSha') {
                    c[idx].isGuaSha = !c[idx].isGuaSha;
                }
                else if (field === 'toggleHuaGuan') {
                    c[idx].isHuaGuan = !c[idx].isHuaGuan;
                }
                else if (field === 'toggleBaGuan') {
                    c[idx].isBaGuan = !c[idx].isBaGuan;
                }
                return c;
            });
        };

        const handleSurnameSelect = (char) => {
            setForm(prev => ({ ...prev, custName: char }));
            setShowSurnamePicker(false);
        };

        const handleTitleToggle = (titleOption) => {
            setForm(prev => ({
                ...prev,
                custTitle: prev.custTitle === titleOption ? '' : titleOption
            }));
        };

        const performCheck = async (e) => {
            if (e) e.preventDefault();
            setIsChecking(true); setCheckResult(null); setSuggestions([]);
            let freshData = await fetchLiveServerData(true);
            let serverBookingsList = freshData ? freshData.bookings : (serverData?.bookings || []);
            let serverStaffList = freshData ? freshData.staff : (serverData?.staff || safeStaffList);
            let localBookingsList = safeBookings;
            let finalBookings = mergeBookingData(serverBookingsList, localBookingsList);
            if (editingBooking) { finalBookings = finalBookings.filter(b => b.rowId !== editingBooking.rowId); }
            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, finalBookings, serverStaffList);
            if (res.valid) {
                setCheckResult({ status: 'OK', message: "✅ 此時段可預約", coreDetails: res.details, debug: res.debug });
            } else {
                setCheckResult({ status: 'FAIL', message: res.reason, debug: res.debug });
                // NÂNG CẤP V118.9: Thuật toán gợi ý thời gian thông minh dựa trên CLEANUP_MINUTES & TRANSITION_MINUTES
                const found = [];
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0] || 0) * 60 + (parts[1] || 0);
                
                // Lấy thông số đệm từ cấu hình
                const ext = window.SYSTEM_CONFIG || (typeof CoreKernel !== 'undefined' ? CoreKernel.CONFIG : {});
                const CLEANUP_BUFFER = (ext.BUFFERS && ext.BUFFERS.CLEANUP_MINUTES) || ext.CLEANUP_BUFFER || 5;
                const TRANSITION_BUFFER = (ext.BUFFERS && ext.BUFFERS.TRANSITION_MINUTES) || ext.TRANSITION_BUFFER || 5;

                let candidateMins = [];

                // 1. Dựng các mốc ứng viên theo chu kỳ 10 phút (Dự phòng trường hợp quán rỗng)
                for (let i = 1; i <= 24; i++) {
                    candidateMins.push(currMins + (i * 10));
                }

                // 2. Thu thập thời gian kết thúc của các đơn đang chiếm dụng
                const reqDate = form.date.replace(/\//g, '-');
                finalBookings.forEach(b => {
                    let bDate = b.opDate;
                    if (!bDate && b.startTimeString) {
                        bDate = b.startTimeString.split(' ')[0].replace(/\//g, '-');
                    }
                    if (bDate === reqDate) {
                        let bTime = b.startTimeString ? b.startTimeString.split(' ')[1] : b.startTime;
                        if (bTime) {
                            let [hStr, mStr] = bTime.split(':');
                            let h = parseInt(hStr, 10);
                            let m = parseInt(mStr, 10);
                            if (!isNaN(h) && !isNaN(m)) {
                                let startMins = h * 60 + m;
                                let duration = parseInt(b.duration, 10) || 60;
                                let endMins = startMins + duration;

                                // Gợi ý khách mới vào ngay sau khi giường/ghế được dọn dẹp hoặc chuyển tiếp
                                candidateMins.push(endMins + CLEANUP_BUFFER);
                                candidateMins.push(endMins + TRANSITION_BUFFER);
                                
                                // Lấy thêm mốc kết thúc của Phase 1 nếu là Combo
                                let p1Dur = parseInt(b.phase1_duration, 10);
                                if (isNaN(p1Dur) && b.originalData && b.originalData.phase1_duration) {
                                    p1Dur = parseInt(b.originalData.phase1_duration, 10);
                                }
                                if (!isNaN(p1Dur) && p1Dur > 0) {
                                    candidateMins.push(startMins + p1Dur + CLEANUP_BUFFER);
                                    candidateMins.push(startMins + p1Dur + TRANSITION_BUFFER);
                                }
                            }
                        }
                    }
                });

                // 3. Lọc và sắp xếp các mốc thời gian ứng viên
                let uniqueCandidates = [...new Set(candidateMins)]
                    .filter(mins => mins > currMins)
                    .sort((a, b) => a - b);

                // 4. Kiểm tra sự khả dụng của từng mốc
                for (let nM of uniqueCandidates) {
                    let daysToAdd = Math.floor(nM / 1440);
                    let localM = nM % 1440;
                    let h = Math.floor(localM / 60);
                    let m = localM % 60;
                    
                    let tStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    let sugDate = form.date;
                    
                    if (daysToAdd > 0) {
                        const dParts = sugDate.replace(/\//g, '-').split('-');
                        if (dParts.length === 3) {
                            let d = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
                            d.setDate(d.getDate() + daysToAdd);
                            sugDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        }
                    }

                    let checkRes = callCoreAvailabilityCheck(sugDate, tStr, guestDetails, finalBookings, serverStaffList);
                    if (checkRes.valid) {
                        if (!found.some(f => f.time === tStr && f.date === sugDate)) {
                            found.push({ time: tStr, date: sugDate, daysToAdd });
                        }
                        if (found.length >= 4) break;
                    } else {
                        console.log(`[DEBUG] getSuggestions rejected ${tStr} because: ${checkRes.reason}`);
                    }
                }
                setSuggestions(found);
            }
            setIsChecking(false);
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;

            const finalCustName = (form.custName.trim() + (form.custTitle || '')).trim();
            if (!finalCustName) { Swal.fire('系統提示', '⚠️ 請輸入顧客姓名！', 'warning'); return; }

            const blacklist = serverData?.blacklist || window.SYSTEM_DATA?.blacklist || [];
            if (blacklist.length > 0 && form.custPhone) {
                const cleanPhone = form.custPhone.trim().replace(/\D/g, '');
                if (cleanPhone) {
                    const isBlacklisted = blacklist.some(b => b.phone === cleanPhone);
                    if (isBlacklisted) {
                        Swal.fire('系統提示', '⚠️ 此電話號碼已列入黑名單，拒絕預約！', 'error');
                        return;
                    }
                }
            }

            setIsSubmitting(true);
            try {
                let checkBookings = mergeBookingData(serverData?.bookings || [], safeBookings);
                if (editingBooking) checkBookings = checkBookings.filter(b => b.rowId !== editingBooking.rowId);
                const finalCheck = callCoreAvailabilityCheck(form.date, form.time, guestDetails, checkBookings, serverData?.staff || safeStaffList);

                if (!finalCheck.valid) {
                    Swal.fire('系統提示', "⚠️ 數據已變更，無法預約：" + finalCheck.reason, 'error');
                    setIsSubmitting(false);
                    return;
                }

                const detailedGuests = guestDetails.map((g, i) => {
                    const detail = finalCheck.details ? finalCheck.details.find(d => d.guestIndex === i) : null;
                    let finalFlow = detail ? detail.flow : 'SINGLE';

                    if (finalFlow === 'SINGLE') {
                        const svcCode = getServiceCodeByName(g.service);
                        if (svcCode && window.SERVICES_DATA && window.SERVICES_DATA[svcCode]) {
                            const svcDef = window.SERVICES_DATA[svcCode];
                            const sType = (svcDef.type || 'BODY').toUpperCase();
                            if (sType === 'FOOT' || sType === 'CHAIR') finalFlow = 'FOOTSINGLE';
                            else finalFlow = 'BODYSINGLE';
                        } else {
                            if (g.service.toUpperCase().match(/FOOT|CHAIR|足/)) finalFlow = 'FOOTSINGLE';
                            else finalFlow = 'BODYSINGLE';
                        }
                    }

                    let allocatedRes = "";
                    let phase1Res = "";
                    let phase2Res = "";
                    if (detail && detail.allocated && Array.isArray(detail.allocated)) {
                        allocatedRes = detail.allocated.join(' + ');
                        if (detail.allocated.length > 0) phase1Res = detail.allocated[0];
                        if (detail.allocated.length > 1) phase2Res = detail.allocated[1];
                    }

                    // [V116.3 FIX] Determine explicit resource_type (Column AD)
                    let explicitResourceType = 'CHAIR';
                    if (finalFlow === 'BODYSINGLE') explicitResourceType = 'BED';
                    else if (finalFlow === 'FOOTSINGLE') explicitResourceType = 'CHAIR';
                    else if (finalFlow === 'BF' || finalFlow === 'FB' || finalFlow === 'COMBO') explicitResourceType = 'COMBO';

                    return {
                        ...g,
                        serviceCode: getServiceCodeByName(g.service) || "",
                        staff: normalizeStaffId(g.staff),
                        flow: finalFlow,
                        flowCode: finalFlow,
                        phase1_duration: detail ? detail.phase1_duration : null,
                        phase2_duration: detail ? detail.phase2_duration : null,
                        allocated_resource: allocatedRes,
                        phase1_resource: phase1Res,
                        phase2_resource: phase2Res,
                        phase1_res_idx: phase1Res,
                        phase2_res_idx: phase2Res,
                        resource_type: explicitResourceType
                    };
                });

                const oils = detailedGuests.map((g, i) => g.isYouTui ? `K${i + 1}:油推` : null).filter(Boolean);
                const guaShas = detailedGuests.map((g, i) => g.isGuaSha ? `K${i + 1}:刮痧` : null).filter(Boolean);
                const huaGuans = detailedGuests.map((g, i) => g.isHuaGuan ? `K${i + 1}:滑罐` : null).filter(Boolean);
                const baGuans = detailedGuests.map((g, i) => g.isBaGuan ? `K${i + 1}:拔罐` : null).filter(Boolean);
                const flows = detailedGuests.map((g, i) => {
                    if (g.flow === 'BF') return `K${i + 1}:先做身體`;
                    if (g.flow === 'FB') return `K${i + 1}:先做腳`;
                    return null;
                }).filter(Boolean);

                const noteParts = [...oils, ...guaShas, ...huaGuans, ...baGuans, ...flows];
                const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";

                const payload = {
                    hoTen: finalCustName,
                    sdt: form.custPhone || "",
                    dichVu: detailedGuests.map(g => g.service).join(','),
                    pax: form.pax,
                    ngayDen: normalizeDateStrict(form.date), // [V134.1 NÂNG CẤP] Use Calendar Date
                    gioDen: form.time,
                    nhanVien: detailedGuests[0].staff,
                    isYouTui: detailedGuests[0].isYouTui,
                    isGuaSha: detailedGuests[0].isGuaSha,
                    isHuaGuan: detailedGuests[0].isHuaGuan,
                    isBaGuan: detailedGuests[0].isBaGuan,
                    serviceCode: detailedGuests[0].serviceCode,
                    staffId2: detailedGuests[1]?.staff || null,
                    staffId3: detailedGuests[2]?.staff || null,
                    staffId4: detailedGuests[3]?.staff || null,
                    staffId5: detailedGuests[4]?.staff || null,
                    staffId6: detailedGuests[5]?.staff || null,
                    staffId7: detailedGuests[6]?.staff || null,
                    staffId8: detailedGuests[7]?.staff || null,
                    staffId9: detailedGuests[8]?.staff || null,
                    ghiChu: noteStr,
                    adminNote: form.adminNote,
                    guestDetails: detailedGuests,
                    flow: detailedGuests[0].flowCode,
                    flowCode: detailedGuests[0].flowCode,
                    mainFlow: detailedGuests[0].flowCode,
                    phase1_duration: detailedGuests[0].phase1_duration,
                    phase2_duration: detailedGuests[0].phase2_duration,

                    allocated_resource: detailedGuests[0].allocated_resource,
                    phase1_resource: detailedGuests[0].phase1_resource,
                    phase2_resource: detailedGuests[0].phase2_resource,

                    proposedUpdates: finalCheck.proposedUpdates || [],
                    rowId: editingBooking ? editingBooking.rowId : null
                };

                if (onSave) {
                    await Promise.resolve(onSave(payload));
                    forceGlobalRefresh();
                    setTimeout(() => { onClose(); setIsSubmitting(false); }, 500);
                }
            } catch (err) { Swal.fire('系統提示', "儲存失敗：" + err.message, 'error'); setIsSubmitting(false); }
        };

        const HOURS_LIST = ['05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '00', '01', '02', '03', '04'];
        const MINUTES_STEP = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
        const [cH, cM] = (form.time || "12:00").split(':');

        let dynamicMaxPax = 18;
        if (typeof CoreKernel !== 'undefined' && CoreKernel.getSystemConfig) {
            const config = CoreKernel.getSystemConfig();
            dynamicMaxPax = config.MAX_TOTAL_GUESTS || ((config.MAX_CHAIRS || 6) + (config.MAX_BEDS || 6));
        }
        const paxOptions = Array.from({ length: dynamicMaxPax }, (_, i) => i + 1);

        return (
            <>
                {/* --- MÀN HÌNH CHỌN HỌ (FULL-SCREEN OVERLAY) --- */}
                {showSurnamePicker && (
                    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-fadeIn">
                        <div className="bg-orange-600 p-6 text-white flex justify-between items-center shadow-md">
                            <h2 className="text-3xl font-bold">請選擇姓氏</h2>
                            <button onClick={() => setShowSurnamePicker(false)} className="text-5xl px-4">&times;</button>
                        </div>
                        <div className="flex-1 p-2 sm:p-4 overflow-y-auto custom-scrollbar">
                            <div className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: 'repeat(19, minmax(0, 1fr))' }}>
                                {PREDEFINED_SURNAMES.map((char, index) => {
                                    if (!char) return <div key={`empty-${index}`} className="aspect-square"></div>;
                                    return (
                                        <button
                                            key={`${char}-${index}`}
                                            onClick={(e) => { e.preventDefault(); handleSurnameSelect(char); }}
                                            className="aspect-square flex items-center justify-center bg-orange-50 hover:bg-orange-500 hover:text-white border border-orange-200 rounded-lg font-bold text-4xl transition-colors shadow-sm"
                                        >
                                            {char}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="p-3 bg-slate-100 border-t border-slate-300">
                            <button
                                onClick={(e) => { e.preventDefault(); setShowSurnamePicker(false); }}
                                className="w-full bg-gray-400 text-white text-lg py-2.5 rounded-lg font-bold shadow-md hover:bg-gray-500 transition-colors"
                            >
                                關閉
                            </button>
                        </div>
                    </div>
                )}

                {/* --- MÀN HÌNH MODAL CHÍNH --- */}
                <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-2 sm:p-6">
                    <div className="bg-white w-full max-w-[1200px] rounded-2xl shadow-2xl flex flex-col h-[98vh] sm:h-[90vh] overflow-hidden animate-fadeIn">
                        <div className={`${editingBooking ? 'bg-orange-600' : 'bg-[#0891b2]'} p-4 sm:p-6 text-white flex justify-between items-center shrink-0`}>
                            <h3 className="font-bold text-xl sm:text-2xl whitespace-nowrap">{editingBooking ? "✏️ 修改預約" : "📅 預約"}</h3>
                            <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
                                {step === 'CHECK' && (
                                    <>
                                        {!checkResult ? (
                                            <button
                                                onClick={performCheck}
                                                disabled={isChecking}
                                                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-bold text-sm sm:text-lg shadow-lg border-2 transition-all flex items-center gap-2 ${isChecking ? 'bg-orange-800 border-orange-700 text-orange-300 cursor-not-allowed' : 'bg-yellow-400 text-yellow-900 border-yellow-200 hover:bg-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.4)]'}`}
                                            >
                                                {isChecking ? "⏳..." : "🔍 查詢空位"}
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2 animate-fadeIn bg-white/10 p-1 sm:p-1.5 rounded-xl border border-white/20">
                                                {/* Removed the green checkResult message banner per request */}

                                                {checkResult.status === 'OK' ? (
                                                    <button onClick={(e) => {
                                                        e.preventDefault();
                                                        const blacklist = serverData?.blacklist || window.SYSTEM_DATA?.blacklist || [];
                                                        if (blacklist.length > 0 && form.custPhone) {
                                                            const cleanPhone = form.custPhone.trim().replace(/\D/g, '');
                                                            if (cleanPhone) {
                                                                const isBlacklisted = blacklist.some(b => b.phone === cleanPhone);
                                                                if (isBlacklisted) {
                                                                    Swal.fire('系統提示', '⚠️ 此電話號碼已列入黑名單，拒絕預約！', 'error');
                                                                    return;
                                                                }
                                                            }
                                                        }
                                                        setStep('INFO');
                                                    }} className="px-3 sm:px-4 py-1.5 bg-emerald-500 text-white rounded-lg font-bold shadow-lg hover:bg-emerald-600 border border-emerald-400 whitespace-nowrap animate-pulse flex items-center gap-1">
                                                        <span>下一步</span> <span>➡️</span>
                                                    </button>
                                                ) : (
                                                    <button onClick={() => { setCheckResult(null); setSuggestions([]) }} className="px-3 sm:px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg font-bold shadow-md hover:bg-gray-300 border border-gray-400 whitespace-nowrap">
                                                        🔄 重新查詢
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                                {step === 'INFO' && (
                                    <div className="flex items-center gap-2 animate-fadeIn bg-white/10 p-1 sm:p-1.5 rounded-xl border border-white/20">
                                        <button onClick={(e) => { e.preventDefault(); if (!isSubmitting) setStep('CHECK'); }} className="px-3 sm:px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg font-bold shadow-md hover:bg-gray-300 border border-gray-400 whitespace-nowrap flex items-center gap-1" disabled={isSubmitting}>
                                            <span>⬅️</span> <span>返回</span>
                                        </button>
                                        <button onClick={handleFinalSave} className="px-3 sm:px-4 py-1.5 bg-indigo-500 text-white rounded-lg font-bold shadow-lg hover:bg-indigo-600 border border-indigo-400 whitespace-nowrap flex items-center gap-1" disabled={isSubmitting}>
                                            {isSubmitting ? "⏳ 處理中..." : (editingBooking ? "💾 保存修改" : "✅ 確認")}
                                        </button>
                                    </div>
                                )}
                                <button onClick={onClose} className="text-4xl hover:text-red-100 leading-none ml-1 sm:ml-2">&times;</button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                            {step === 'CHECK' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-lg font-bold text-gray-500 block">日期</label>
                                                <div className="flex gap-1.5 pl-2">
                                                    <button onClick={(e) => { e.preventDefault(); handleDateShift(-1); }} className="w-10 h-8 flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg shadow-sm font-bold border border-slate-300 transition-colors tooltip tooltip-bottom" data-tip="前一天">◀</button>
                                                    <button onClick={(e) => { e.preventDefault(); handleDateShift(1); }} className="w-10 h-8 flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg shadow-sm font-bold border border-slate-300 transition-colors tooltip tooltip-bottom" data-tip="後一天">▶</button>
                                                </div>
                                            </div>
                                            <input type="date" className="w-full border-2 p-3 rounded-xl font-bold text-xl h-[64px] bg-slate-50" value={form.date} onChange={e => { setForm({ ...form, date: e.target.value }); setCheckResult(null); }} />
                                        </div>
                                        <div>
                                            <label className="text-lg font-bold text-gray-500 mb-1 block">時間</label>
                                            <div className="flex items-center gap-2">
                                                <div className="relative flex-1">
                                                    <select className="w-full border-2 p-3 rounded-xl font-bold text-xl h-[64px] text-center bg-slate-50" value={cH} onChange={e => handleTimeChange('HOUR', e.target.value)}>
                                                        {HOURS_LIST.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </div>
                                                <span className="font-bold text-2xl">:</span>
                                                <div className="relative flex-1">
                                                    <select className="w-full border-2 p-3 rounded-xl font-bold text-xl h-[64px] text-center bg-slate-50" value={cM} onChange={e => handleTimeChange('MINUTE', e.target.value)}>
                                                        {MINUTES_STEP.map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-1 block">電話號碼</label>
                                        <input
                                            className="w-full border-2 border-slate-300 p-3 rounded-xl font-bold text-xl outline-none focus:border-indigo-500 bg-slate-50 h-[64px]"
                                            value={form.custPhone}
                                            onChange={e => setForm({ ...form, custPhone: e.target.value })}
                                            placeholder="09xx..."
                                            disabled={isSubmitting}
                                            type="tel"
                                        />
                                    </div>

                                    <div className="pt-2">
                                        {checkResult && checkResult.status === 'FAIL' && (
                                            <div className="space-y-4 animate-slideIn">
                                                <div className="p-5 rounded-xl text-center font-bold text-xl border-2 bg-red-50 text-red-700 border-red-300">{checkResult.message}</div>
                                                {suggestions.length > 0 && (
                                                    <div className="bg-yellow-50 p-4 rounded-xl border-2 border-yellow-300">
                                                        <div className="text-base font-bold text-yellow-800 mb-3">💡 建議時段:</div>
                                                        <div className="flex gap-3 flex-wrap">
                                                            {suggestions.map(s => {
                                                                let displayLabel = s.time;
                                                                if (s.daysToAdd > 0) {
                                                                    const dParts = s.date.replace(/\//g, '-').split('-');
                                                                    if (dParts.length === 3) displayLabel = `${dParts[1]}/${dParts[2]} ${s.time}`;
                                                                }
                                                                return (
                                                                    <button key={`${s.date}-${s.time}`} onClick={() => { setForm(f => ({ ...f, time: s.time, date: s.date })); setCheckResult(null); setSuggestions([]); }} className="px-5 py-2 bg-white border-2 border-yellow-400 text-yellow-900 rounded-lg font-bold text-lg hover:bg-yellow-200 whitespace-nowrap">
                                                                        {displayLabel}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-1 block">人數</label>
                                        <select className="w-full border-2 p-3 rounded-xl font-bold text-xl text-center h-[64px] bg-slate-50" value={form.pax} onChange={e => handlePaxChange(e.target.value)}>
                                            {paxOptions.map(n => <option key={n} value={n}>{n} 位</option>)}
                                        </select>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-xl border-2 space-y-3">
                                        <div className="text-base font-bold text-gray-500 uppercase">詳細需求</div>
                                        {guestDetails.map((g, i) => {
                                            const svcCode = getServiceCodeByName(g.service);
                                            const svcDef = window.SERVICES_DATA ? window.SERVICES_DATA[svcCode] : null;
                                            const cat = svcDef?.category || '';
                                            const isCombo = cat === 'COMBO' || cat === 'MIXED';
                                            let p1 = 0, p2 = 0;
                                            let isDefault = true;
                                            let flow = 'FB';
                                            if (isCombo && svcDef) {
                                                if (checkResult && checkResult.coreDetails && checkResult.coreDetails[i]) {
                                                    const detail = checkResult.coreDetails[i];
                                                    if (detail.phase1_duration !== undefined && detail.phase2_duration !== undefined) {
                                                        p1 = detail.phase1_duration;
                                                        p2 = detail.phase2_duration;
                                                        flow = detail.flow || 'FB';
                                                        isDefault = false;
                                                    }
                                                }
                                                if (isDefault) {
                                                    const dur = svcDef.duration || 60;
                                                    p1 = Math.floor(dur / 2);
                                                    p2 = dur - p1;
                                                }
                                            }
                                            
                                            return (
                                            <div key={i} className="flex flex-col gap-2">
                                                <div className="flex gap-2 items-center overflow-x-auto pb-1">
                                                    <div className="w-10 shrink-0 h-[64px] rounded-lg bg-gray-200 hidden sm:flex items-center justify-center font-black text-lg text-slate-500">#{i + 1}</div>

                                                    <select className="flex-[1] min-w-[100px] border-2 p-1 sm:p-2 rounded-lg font-bold text-sm sm:text-lg h-[64px] bg-white shrink-0" value={g.service} onChange={e => handleGuestUpdate(i, 'service', e.target.value)}>
                                                        {(window.SERVICES_LIST || []).map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>

                                                    <select className="w-[80px] border-2 p-1 sm:p-2 rounded-lg font-bold text-sm sm:text-lg h-[64px] bg-white shrink-0" value={g.staff} onChange={e => handleGuestUpdate(i, 'staff', e.target.value)}>
                                                        <option value="隨機">🎲 隨機</option>
                                                        <option value="女">🚺 女師</option>
                                                        <option value="男">🚹 男師</option>
                                                        <optgroup label="技師">{safeStaffList.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</optgroup>
                                                    </select>

                                                    <button
                                                        onClick={(e) => { e.preventDefault(); if (!svcCode.startsWith('F')) handleGuestUpdate(i, 'toggleYouTui'); }}
                                                        disabled={svcCode.startsWith('F')}
                                                        className={`w-10 sm:w-12 px-0.5 shrink-0 border-2 rounded-lg font-bold text-xs sm:text-sm h-[64px] transition-colors flex flex-col items-center justify-center gap-0.5 ${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isYouTui ? 'bg-orange-100 text-orange-700 border-orange-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200')}`}
                                                    >
                                                        <span className={g.isYouTui ? "opacity-100" : "opacity-50"}>💧</span>
                                                        <span>油推</span>
                                                    </button>

                                                    <button
                                                        onClick={(e) => { e.preventDefault(); if (!svcCode.startsWith('F')) handleGuestUpdate(i, 'toggleGuaSha'); }}
                                                        disabled={svcCode.startsWith('F')}
                                                        className={`w-10 sm:w-12 px-0.5 shrink-0 border-2 rounded-lg font-bold text-xs sm:text-sm h-[64px] transition-colors flex flex-col items-center justify-center gap-0.5 ${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isGuaSha ? 'bg-red-100 text-red-700 border-red-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200')}`}
                                                    >
                                                        <span className={g.isGuaSha ? "opacity-100" : "opacity-50"}>🩸</span>
                                                        <span>刮痧</span>
                                                    </button>

                                                    <button
                                                        onClick={(e) => { e.preventDefault(); if (!svcCode.startsWith('F')) handleGuestUpdate(i, 'toggleHuaGuan'); }}
                                                        disabled={svcCode.startsWith('F')}
                                                        className={`w-10 sm:w-12 px-0.5 shrink-0 border-2 rounded-lg font-bold text-xs sm:text-sm h-[64px] transition-colors flex flex-col items-center justify-center gap-0.5 ${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isHuaGuan ? 'bg-purple-100 text-purple-700 border-purple-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200')}`}
                                                    >
                                                        <span className={g.isHuaGuan ? "opacity-100" : "opacity-50"}>🏺</span>
                                                        <span>滑罐</span>
                                                    </button>
                                                    
                                                    <button
                                                        onClick={(e) => { e.preventDefault(); if (!svcCode.startsWith('F')) handleGuestUpdate(i, 'toggleBaGuan'); }}
                                                        disabled={svcCode.startsWith('F')}
                                                        className={`w-10 sm:w-12 px-0.5 shrink-0 border-2 rounded-lg font-bold text-xs sm:text-sm h-[64px] transition-colors flex flex-col items-center justify-center gap-0.5 ${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isBaGuan ? 'bg-blue-100 text-blue-700 border-blue-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200')}`}
                                                    >
                                                        <span className={g.isBaGuan ? "opacity-100" : "opacity-50"}>🎯</span>
                                                        <span>拔罐</span>
                                                    </button>

                                                    {isCombo && (
                                                        <div className="shrink-0 flex items-center pl-1">
                                                            <span className="text-sm sm:text-base text-orange-600 font-bold font-mono bg-orange-50 px-2 py-1.5 rounded-lg border border-orange-200 whitespace-nowrap">
                                                                {flow === 'BF' ? `身:${p1} ; 腳:${p2}` : `腳:${p1} ; 身:${p2}`}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {step === 'INFO' && (
                                <div className="space-y-6 animate-slideIn flex flex-col h-full">
                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-2 block">顧客姓名</label>
                                        <div className="flex gap-3">
                                            <input
                                                className="flex-[2] border-2 border-slate-300 p-4 rounded-xl font-bold text-2xl outline-none focus:border-indigo-500"
                                                value={form.custName}
                                                onChange={e => setForm({ ...form, custName: e.target.value })}
                                                placeholder="輸入姓名..."
                                                disabled={isSubmitting}
                                            />
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleTitleToggle('先生'); }}
                                                className={`flex-[1] border-2 rounded-xl font-bold text-xl transition-colors whitespace-nowrap ${form.custTitle === '先生' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'}`}
                                            >
                                                先生
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleTitleToggle('小姐'); }}
                                                className={`flex-[1] border-2 rounded-xl font-bold text-xl transition-colors whitespace-nowrap ${form.custTitle === '小姐' ? 'bg-pink-600 text-white border-pink-600 shadow-md' : 'bg-pink-50 text-pink-700 border-pink-300 hover:bg-pink-100'}`}
                                            >
                                                小姐
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); setShowSurnamePicker(true); }}
                                                className="flex-[1] bg-orange-100 text-orange-700 border-2 border-orange-400 rounded-xl font-bold text-xl hover:bg-orange-200 transition-colors shadow-sm whitespace-nowrap"
                                                title="選擇姓氏"
                                            >
                                                姓
                                            </button>
                                        </div>
                                    </div>



                                    <div className="mb-4">
                                        <label className="text-lg font-bold text-gray-500 mb-2 block">電話號碼</label>
                                        <input
                                            className="w-full border-2 border-slate-300 p-4 rounded-xl font-bold text-xl outline-none focus:border-indigo-500 bg-slate-50"
                                            value={form.custPhone}
                                            onChange={e => setForm({ ...form, custPhone: e.target.value })}
                                            placeholder="09xx..."
                                            disabled={isSubmitting}
                                            type="tel"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-2 block">特別要求 / 備註</label>
                                        <div className="flex gap-3">
                                            <input
                                                className="flex-[2] border-2 border-slate-300 p-4 rounded-xl font-bold text-xl outline-none focus:border-indigo-500"
                                                value={form.adminNote}
                                                onChange={e => setForm({ ...form, adminNote: e.target.value })}
                                                placeholder="輸入特別要求..."
                                                disabled={isSubmitting}
                                            />
                                            <select
                                                className="flex-[1] border-2 border-orange-300 bg-orange-50 text-orange-800 p-4 rounded-xl font-bold text-xl outline-none cursor-pointer"
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        setForm(prev => ({
                                                            ...prev,
                                                            adminNote: prev.adminNote ? prev.adminNote + ' ' + val : val
                                                        }));
                                                        e.target.value = ""; // Reset dropdown after selection
                                                    }
                                                }}
                                                disabled={isSubmitting}
                                            >
                                                <option value="">⚡ 快速選擇</option>
                                                {safeQuickNotes.map((note, idx) => (
                                                    <option key={idx} value={note}>{note}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="bg-green-50 p-4 rounded-xl border-2 border-green-300 text-green-900 font-bold mt-auto mb-4">
                                        <div className="flex justify-between border-b-2 border-green-200 pb-3 mb-3 text-xl">
                                            <span>{form.date}</span>
                                            <span>{form.time}</span>
                                        </div>
                                        <div className="text-lg font-normal space-y-2">
                                            {checkResult && checkResult.coreDetails && checkResult.coreDetails.map((d, i) => (
                                                <div key={i} className="flex justify-between items-center bg-white p-2 rounded-lg border border-green-200 shadow-sm">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold">#{i + 1} {d.service}</span>
                                                        {(d.phase1_duration && d.phase2_duration) && (
                                                            <span className="text-sm sm:text-base text-orange-600 font-bold font-mono">
                                                                {d.flow === 'BF' ? `身:${d.phase1_duration} ; 腳:${d.phase2_duration}` : `腳:${d.phase1_duration} ; 身:${d.phase2_duration}`}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="flex gap-2">
                                                            <span className="bg-green-100 px-3 py-1 rounded-md text-green-800 text-sm font-bold">{d.staff}</span>
                                                            {d.flow === 'BF' && <span className="bg-orange-100 px-3 py-1 rounded-md text-orange-800 border border-orange-300 text-sm font-bold">⚠️ 先做身體</span>}
                                                            {d.flow === 'FB' && <span className="bg-blue-100 px-3 py-1 rounded-md text-blue-800 border border-blue-300 text-sm font-bold">🦶 先做腳</span>}
                                                        </div>
                                                        {d.allocated && d.allocated.length > 0 && (
                                                            <div className="text-sm text-gray-500 font-mono mt-1">
                                                                📍 {d.allocated.join(' -> ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </>
        );
    };

    const overrideInterval = setInterval(() => {
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) {
            window.AvailabilityCheckModal = NewAvailabilityCheckModal;
            console.log("♻️ AvailabilityModal Injected (V116.6 - SMART DUAL-DATE, BUTTONS & UI FIX)");
        }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);

})();
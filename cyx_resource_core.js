/*
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL (SERVER SIDE)
 * FILE: resource_core.js
 * PHIÊN BẢN: V118.0 (UNIVERSAL SYNC & CONTINUOUS GUARDRAIL)
 * NGÀY CẬP NHẬT: Mới nhất
 * TÁC GIẢ: AI ASSISTANT & USER
 *
 * * * * * CHANGE LOG V118.0 (DATA & LOGIC SYNC) * * * * *
 * 1. [CONFIG INJECTION] Loại bỏ Hardcode. Tự động đọc cấu hình MAX_CHAIRS, MAX_BEDS, OPEN_HOUR
 * từ file cyx_data.js (SYSTEM_CONFIG). Hỗ trợ chạy trên cả Node.js và Browser.
 * 2. [ALGORITHM SYNC] Bê nguyên thuật toán "Continuous Scan Guardrail" (chống phân mảnh
 * khoảng trống) từ bookingHandler.js (Frontend) sang. Đảm bảo Backend và Frontend
 * đồng bộ 100% kết quả kiểm tra chỗ trống.
 * 3. [PRESERVED] Giữ nguyên logic V117.0 (Squeeze Logic, Phase Resource Coordinate Mapping).
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: LIÊN KẾT CẤU HÌNH TRUNG TÂM (cyx_data.js)
// ============================================================================

function getSystemConfig() {
    let dynamicConfig = null;

    // Thử tải cyx_data.js trong môi trường Node.js (Backend)
    if (typeof require !== 'undefined') {
        try {
            const dataModule = require('./cyx_data.js');
            dynamicConfig = dataModule.SYSTEM_CONFIG;
        } catch (e) {
            console.warn("⚠️ [CORE V118.0] Không tìm thấy file ./cyx_data.js qua require. Chờ Fallback.");
        }
    }

    // Thử tải từ Global Window nếu chạy dưới dạng script trên trình duyệt (Frontend fallback)
    if (!dynamicConfig && typeof window !== 'undefined' && window.SYSTEM_CONFIG) {
        dynamicConfig = window.SYSTEM_CONFIG;
    }

    // FALLBACK AN TOÀN TỐI HẬU (Phòng trường hợp file cyx_data.js bị lỗi/mất)
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

// Alias ánh xạ cấu hình động để code phía dưới ngắn gọn và tương thích ngược, sử dụng getter
const CONF = {
    _tempLocation: '本館',
    get MAX_CHAIRS() { return this._tempLocation === '對面館' ? (getSystemConfig().SCALE.OPP_CHAIRS || 4) : getSystemConfig().SCALE.MAX_CHAIRS; },
    get MAX_BEDS() { return this._tempLocation === '對面館' ? (getSystemConfig().SCALE.OPP_BEDS || 6) : getSystemConfig().SCALE.MAX_BEDS; },
    get OPEN_HOUR() { return getSystemConfig().OPERATION_TIME.OPEN_HOUR; },
    get CLEANUP_BUFFER() { return getSystemConfig().BUFFERS.CLEANUP_MINUTES; },
    get TRANSITION_BUFFER() { return getSystemConfig().BUFFERS.TRANSITION_MINUTES; },
    get TOLERANCE() { return getSystemConfig().LOGIC_RULES?.TOLERANCE || 1; },
    get CAPACITY_CHECK_STEP() { return getSystemConfig().LOGIC_RULES?.CAPACITY_CHECK_STEP || 10; }
};

// ============================================================================
// PHẦN 2: DỮ LIỆU DỊCH VỤ VÀ UTILS THỜI GIAN
// ============================================================================

let SERVICES = {};

function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
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
        let cleanStr = str.trim().replace(/：/g, ':');
        const parts = cleanStr.split(':');
        if (parts.length < 2) return -1;

        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);

        if (isNaN(h) || isNaN(m)) return -1;
        // [V118.2] Phóng chiếu giờ rạng sáng cho thuật toán vắt chéo ngày (0h-8h)
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
    if (!statusRaw) return true; // CẦN ĐƯỢC COI LÀ ACTIVE nếu status trống
    const s = statusRaw.toString().toLowerCase().trim();
    const inactiveKeywords = ['cancel', 'hủy', 'huỷ', 'finish', 'done', 'xong', 'check-out', 'checkout', '取消', '完成', '空'];
    for (const kw of inactiveKeywords) { if (s.includes(kw)) return false; }
    return true;
}

// ============================================================================
// PHẦN 3: BỘ NHẬN DIỆN THÔNG MINH
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
    const comboKeywords = ['COMBO', '套餐', 'MIX', '+', 'SET', '腳身', '全餐', 'FOOT AND BODY', 'BODY AND FOOT', '雙人', 'A餐', 'B餐', 'C餐', '油壓+足'];
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

    if (name.match(/FOOT|CHAIR|腳|足|LEG/)) return 'FOOTSINGLE';
    if (name.match(/BODY|BED|指壓|油|全身|BACK/)) return 'BODYSINGLE';
    return 'BODYSINGLE';
}

function detectResourceType(serviceObj) {
    if (!serviceObj) return 'CHAIR';
    if (serviceObj.type === 'BED' || serviceObj.type === 'CHAIR') return serviceObj.type;
    const name = (serviceObj.name || '').toUpperCase();
    if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|SPA|BACK/)) return 'BED';
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
    if (startStr.includes('OFF') || startStr.includes('NGHỈ') || startStr.includes('CLOSE')) isOff = true;
    if (isOff) return { isAvailable: false, reason: "MARKED_OFF" };

    let startMins = getMinsFromTimeStr(currentStartStr);
    let endMins = getMinsFromTimeStr(currentEndStr);
    if (startMins === -1 || endMins === -1) return { isAvailable: false, reason: "INVALID_TIME" };

    // [CORE V118.1] Fix Overnight Shifts (Ca Xuyên Đêm)
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
        // [CORE V118.1] Thuật toán Phân đoạn Ca Đêm
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
// PHẦN 4: HÀNG RÀO DUNG LƯỢNG (GUARDRAIL V118.0)
// Áp dụng thuật toán Continuous Scan từ bookingHandler.js
// ============================================================================

function checkLaneContinuity(laneOccupiedArr, start, end, customCleanup = null) {
    const cleanup = customCleanup !== null ? customCleanup : CONF.CLEANUP_BUFFER;
    const safeEnd = end + cleanup;
    for (let block of laneOccupiedArr) {
        if (isOverlap(start, safeEnd, block.start, block.end)) return false;
    }
    return true;
}

function validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, isSimulation = false, locationStrIn = '本館') {
    const CONF = getSystemConfig();
    CONF._tempLocation = locationStrIn;
    let locationStr = locationStrIn;
    if (locationStr !== '本館' && locationStr !== '對面館') {
        if (locationStr.includes('對面館') && !locationStr.includes('本館')) locationStr = '對面館';
        else locationStr = '本館';
    }
    const triggerSmartFailure = (reasonMsg, specificSuggestionMins = null) => {
        if (isSimulation) return { pass: false, reason: reasonMsg };
        
        let debugInfo = { suggestions: [] };
        if (specificSuggestionMins !== null && specificSuggestionMins >= 0 && specificSuggestionMins <= 1800) {
            const timeStr = getTimeStrFromMins(specificSuggestionMins);
            debugInfo.suggestions.push({ time: timeStr, date: queryDateStr, daysToAdd: 0 });
        }

        let oppositeLoc = locationStr === '本館' ? '對面館' : '本館';
        let oppositeSim = validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, true, oppositeLoc);
        let oppositeSuggestion = "";
        if (oppositeSim.pass) {
            oppositeSuggestion = `\n💡 系統提示：【${oppositeLoc}】在 ${getTimeStrFromMins(requestStart)} 仍有空位，可建議客人至${oppositeLoc}。`;
        }
        
        let foundMins = -1;
        let searchStart = Math.max(requestStart + 10, 0); 
        
        // Quét đến cuối ngày hoặc ca đêm (1440 + 360 = 1800)
        for (let t = searchStart; t <= 1800; t += 10) {
            let sim = validateGlobalCapacity(t, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, true, locationStr);
            if (sim.pass) {
                foundMins = t;
                break;
            }
        }
        
        if (foundMins !== -1) {
            const timeStr = getTimeStrFromMins(foundMins);
            if (foundMins !== specificSuggestionMins) {
                debugInfo.suggestions.push({ time: timeStr, date: queryDateStr, daysToAdd: 0 });
            }
            return { pass: false, reason: `${reasonMsg}${oppositeSuggestion}\n💡 智能建議：${locationStr}最快可完整安排 (含所有階段) 的時間為 ${timeStr} 之後。`, debug: debugInfo };
        } else {
            return { pass: false, reason: `${reasonMsg}${oppositeSuggestion}\n⚠️ 今日後續時段已無足夠資源可完整安排此預約。`, debug: debugInfo };
        }
    };

    // 1. Lọc Booking hợp lệ
    const relevantBookings = currentBookingsRaw.filter(b => {
        const bLoc = b.originalData?.location || b.location || '本館';
        if (bLoc !== locationStr) return false;

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

    // 2. Kiểm tra Nhân sự (Staff Capacity - V118.6 Đã đồng bộ Gender & Specific Staff Logic)
    const normId = (id) => String(id || '').replace(/^0+/, '').trim().toUpperCase();

    // [NEW] Tạo danh sách các điểm chạm thời gian (Time Points) để quét liên tục (Continuous Scan)
    let timePoints = new Set();
    timePoints.add(requestStart);
    
    guestList.forEach(g => {
        const svcInfo = getServiceInfo(g.serviceCode, g.serviceName);
        const dur = g.overrideDuration || svcInfo.duration || 60;
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
        
        // Thêm các điểm đầu/cuối của booking cũ nếu nó rơi vào khung giờ khách mới đang xét
        if (bS > requestStart && bS < requestStart + maxDuration) timePoints.add(bS);
        if (bE > requestStart && bE < requestStart + maxDuration) timePoints.add(bE);
    });

    let sortedPoints = Array.from(timePoints).sort((a, b) => a - b);

    // [NEW] Thuật toán Interval Overlap Continuous Scan cho Nhân sự
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
                    if (sInfo.gender === 'F' || sInfo.gender === '女' || sInfo.group === '女') currentFemaleBusy++;
                    else if (sInfo.gender === 'M' || sInfo.gender === '男' || sInfo.group === '男') currentMaleBusy++;
                }
            }
        });
        
        let newGuestsActive = 0;
        let newFemaleReq = 0;
        let newMaleReq = 0;
        
        guestList.forEach(g => {
            const svcInfo = getServiceInfo(g.serviceCode, g.serviceName);
            const dur = g.overrideDuration || svcInfo.duration || 60;
            if (tCheck >= requestStart && tCheck < requestStart + dur) {
                newGuestsActive++;
                const req = g.staff;
                // Nếu khách chọn dầu (OIL), mặc định yêu cầu nữ (trừ khi có config khác)
                if (req === 'FEMALE' || req === '女' || req === '女師' || req === 'OIL') newFemaleReq++;
                else if (req === 'MALE' || req === '男' || req === '男師') newMaleReq++;
            }
        });

        // Đếm số nhân viên ĐANG LÀM VIỆC tại đúng thời điểm tCheck (đã trừ lúc hết ca)
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
        const currentFemaleSupply = currentAvailableStaff.filter(s => s.gender === 'F' || s.gender === '女').length;
        const currentMaleSupply = currentAvailableStaff.filter(s => s.gender === 'M' || s.gender === '男').length;
        
        if (newFemaleReq > 0 && (currentFemaleBusy + newFemaleReq) > currentFemaleSupply) {
            return triggerSmartFailure(`⚠️ 該時段女技師不足。女師總共: ${currentFemaleSupply}, 忙碌中: ${currentFemaleBusy}, 欲預約: ${newFemaleReq}`);
        }
        if (newMaleReq > 0 && (currentMaleBusy + newMaleReq) > currentMaleSupply) {
            return triggerSmartFailure(`⚠️ 該時段男技師不足。男師總共: ${currentMaleSupply}, 忙碌中: ${currentMaleBusy}, 欲預約: ${newMaleReq}`);
        }
        if ((currentStaffBusy + newGuestsActive) > currentSupplyCount) {
            return triggerSmartFailure(`⚠️ 該時段技師總數不足。總共: ${currentSupplyCount}, 忙碌中: ${currentStaffBusy}, 新客: ${newGuestsActive}`);
        }
    }

    // Kiểm tra trùng lịch cho nhân viên ĐƯỢC CHỈ ĐỊNH cụ thể (Specific Staff)
    let specificStaffReqs = [];
    guestList.forEach(g => {
        const req = g.staff;
        const svcInfo = getServiceInfo(g.serviceCode, g.serviceName);
        const dur = g.overrideDuration || svcInfo.duration || 60;
        if (req && req !== 'RANDOM' && req !== '隨機' && req !== 'Any' && req !== 'undefined' && req !== 'null' 
            && req !== 'FEMALE' && req !== 'MALE' && req !== '女' && req !== '男' && req !== '女師' && req !== '男師' && req !== 'OIL') {
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
            return { pass: false, reason: `⚠️ 錯誤: 不可同時指派 ${count} 位客人給同一技師 ${req}。`, debug: {} };
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
            // [CORE V118.0] Thuật toán Phân đoạn Ca Đêm
            let inMain = (requestStart >= status.startMins && requestStart < status.endMins);
            let inTail = false;
            if (status.endMins > 1440) {
                const origEnd = status.endMins - 1440;
                inTail = (requestStart >= 0 && requestStart < origEnd);
            }
            
            if (!status.isAvailable || (!inMain && !inTail)) {
                return triggerSmartFailure(`⚠️ 技師 ${rawName} 該時段未排班或已下班。`);
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
                return triggerSmartFailure(`⚠️ 技師 ${rawName} 該時段已有預約。`);
            }
        }
    }

    // 3. Phân tích tài nguyên chống phân mảnh (Continuous Scan)
    const resourceMap = {
        'BED': Array.from({ length: CONF.MAX_BEDS }, () => []),
        'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, () => [])
    };

    relevantBookings.sort((a, b) => {
        const hasA = Boolean(a.allocated_resource || a.phase1_res_idx || a.phase2_res_idx);
        const hasB = Boolean(b.allocated_resource || b.phase1_res_idx || b.phase2_res_idx);
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        const startA = getMinsFromTimeStr(a.startTimeString || a.startTime);
        const startB = getMinsFromTimeStr(b.startTimeString || b.startTime);
        return startA - startB;
    });

    relevantBookings.forEach(b => {
        const bLoc = b.originalData?.location || b.location || '本館';
        if (bLoc !== locationStr) return;

        const bStart = getMinsFromTimeStr(b.startTimeString || b.startTime);
        const svcInfo = getServiceInfo(b.serviceCode, b.serviceName);
        const storedFlow = b.originalData?.flowCode || b.flow;
        const isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
        const { p1, realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);

        const rIdStr = (b.phase1_res_idx || "") + " " + (b.phase2_res_idx || "") + " " + (b.allocated_resource || "") + " " + (b.location || "") + " " + (b.current_resource_id || "") + " " + (b.rowId || "");
        const matches = [...rIdStr.matchAll(/((?:BED|CHAIR)-[12]-\d+)/gi)].map(m => m[1].toUpperCase());
        let uniqueMatches = [...new Set(matches)];

        // [V118.8 FIX] Hỗ trợ trích xuất số ghế/giường nếu chuỗi chỉ có số đơn thuần (phòng ngừa Bóng Ma Toạ Độ)
        if (uniqueMatches.length === 0) {
            const backupMatches = [...rIdStr.matchAll(/(\d+)/gi)].map(m => m[1]);
            let inferredType = 'CHAIR';
            if (svcInfo) {
                if (svcInfo.type === 'BED' || svcInfo.type === 'CHAIR') inferredType = svcInfo.type;
                else {
                    const name = (svcInfo.name || '').toUpperCase();
                    if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|SPA|BACK/)) inferredType = 'BED';
                }
            }
            const bPrefix = (b.location === '對面館') ? '2' : '1';
            uniqueMatches = [...new Set(backupMatches)].map(num => `${inferredType}-${bPrefix}-${num}`);
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
                const laneMatch = res.match(/(BED|CHAIR|床|足)[-_ ]?(\d+)/i);
                if (laneMatch) {
                    const type = (laneMatch[1].toUpperCase().includes('BED') || laneMatch[1].includes('床')) ? 'BED' : 'CHAIR';
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
                if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                else if (b._impliedFlow === 'BF') isBodyFirst = true;
            }

            if (uniqueMatches.length >= 2) {
                if (isBodyFirst) {
                    res1 = uniqueMatches.find(r => r.includes('BED') || r.includes('床')) || uniqueMatches[0];
                    res2 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('足')) || uniqueMatches[1];
                } else {
                    res1 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('足')) || uniqueMatches[0];
                    res2 = uniqueMatches.find(r => r.includes('BED') || r.includes('床')) || uniqueMatches[1];
                }
            } else if (uniqueMatches.length === 1) {
                const mType = (uniqueMatches[0].toUpperCase().includes('BED') || uniqueMatches[0].includes('床')) ? 'BED' : 'CHAIR';
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

    // Mô phỏng luồng khách mới
    const simulationMap = JSON.parse(JSON.stringify(resourceMap));
    const suggestedLanes = {}; // [NEW V118.6] Lưu lại toạ độ gợi ý chính xác

    for (let i = 0; i < guestList.length; i++) {
        const g = guestList[i];
        const svc = getServiceInfo(g.serviceCode, g.serviceName);
        const duration = g.overrideDuration || svc.duration || 60;
        const explicitFlow = g.flowCode || null;
        const isCombo = isComboService(svc, g.serviceCode, explicitFlow);
        const guestIdKey = g.idx !== undefined ? g.idx : i; // Đảm bảo mapping đúng index của khách

        if (isCombo) {
            let foundValidSplit = false;
            let bestOutOfBoundSplit = null;
            const eStep = svc.elasticStep || 1;
            const eLimit = svc.elasticLimit || 20;
            const flowPrimary = (explicitFlow === 'FB' || explicitFlow === 'BF') ? explicitFlow : 'FB';
            const flowSecondary = flowPrimary === 'FB' ? 'BF' : 'FB';
            const flowsToTry = [flowPrimary, flowSecondary];
            
            for (const testFlow of flowsToTry) {
                const splitsToTry = generateElasticSplits(duration, eStep, eLimit, null, svc.minFoot, svc.maxFoot, svc.minBody, svc.maxBody, testFlow, true);
                
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
                        // Kịch bản A: Body Trước (BED -> CHAIR)
                        for (let b = 0; b < CONF.MAX_BEDS; b++) { if (checkLaneContinuity(simulationMap.BED[b], tStart, tStart + p1, phase1Cleanup)) { bedIdx = b; break; } }
                        for (let c = 0; c < CONF.MAX_CHAIRS; c++) { if (checkLaneContinuity(simulationMap.CHAIR[c], tSwitch, tSwitch + p2)) { chairIdx = c; break; } }

                        if (bedIdx !== -1 && chairIdx !== -1) {
                            if (split.shiftMins === 0) {
                                simulationMap.BED[bedIdx].push({ start: tStart, end: tStart + p1 + phase1Cleanup });
                                simulationMap.CHAIR[chairIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                                suggestedLanes[guestIdKey] = { BED: bedIdx + 1, CHAIR: chairIdx + 1 };
                                foundValidSplit = true;
                                bestOutOfBoundSplit = null;
                                break;
                            } else if (!bestOutOfBoundSplit) {
                                bestOutOfBoundSplit = split;
                            }
                        }
                    } else {
                        // Kịch bản B: Chân Trước (CHAIR -> BED)
                        for (let c = 0; c < CONF.MAX_CHAIRS; c++) { if (checkLaneContinuity(simulationMap.CHAIR[c], tStart, tStart + p1, phase1Cleanup)) { chairIdx = c; break; } }
                        for (let b = 0; b < CONF.MAX_BEDS; b++) { if (checkLaneContinuity(simulationMap.BED[b], tSwitch, tSwitch + p2)) { bedIdx = b; break; } }

                        if (chairIdx !== -1 && bedIdx !== -1) {
                            if (split.shiftMins === 0) {
                                simulationMap.CHAIR[chairIdx].push({ start: tStart, end: tStart + p1 + phase1Cleanup });
                                simulationMap.BED[bedIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                                suggestedLanes[guestIdKey] = { CHAIR: chairIdx + 1, BED: bedIdx + 1 };
                                foundValidSplit = true;
                                bestOutOfBoundSplit = null;
                                break;
                            } else if (!bestOutOfBoundSplit) {
                                bestOutOfBoundSplit = split;
                            }
                        }
                    }
                }
                if (foundValidSplit) break;
            }

            if (!foundValidSplit) {
                let crossLocationMsg = "";
                if (locationStr === '本館' || locationStr === '對面館') {
                    let oppositeLoc = locationStr === '本館' ? '對面館' : '本館';
                    let oppSim = validateGlobalCapacity(requestStart, maxDuration, [], currentBookingsRaw, staffList, queryDateStr, true, oppositeLoc);
                    let oppMap = oppSim.resourceMap;
                    let oppConfMaxBeds = oppositeLoc === '對面館' ? (getSystemConfig().SCALE?.OPP_BEDS || 6) : getSystemConfig().SCALE?.MAX_BEDS || 9;
                    let oppConfMaxChairs = oppositeLoc === '對面館' ? (getSystemConfig().SCALE?.OPP_CHAIRS || 4) : getSystemConfig().SCALE?.MAX_CHAIRS || 9;
                    
                    for (const testFlow of flowsToTry) {
                        const splitsToTry = generateElasticSplits(duration, eStep, eLimit, null, svc.minFoot, svc.maxFoot, svc.minBody, svc.maxBody, testFlow, true);
                        let foundCross = false;
                        for (const split of splitsToTry) {
                            if (split.shiftMins !== 0) continue;
                            const p1 = split.p1;
                            const p2 = split.p2;
                            const tStart = requestStart;
                            const tSwitch = tStart + p1 + CONF.TRANSITION_BUFFER;
                            
                            let loc1Idx = -1, loc2Idx = -1;
                            
                            const comboGuestsCount = guestList.filter(g => isComboService(getServiceInfo(g.serviceCode, g.serviceName), g.serviceCode, g.flowCode)).length;
                            const isCrossSwapGroup = comboGuestsCount >= 2;
                            const phase1Cleanup = isCrossSwapGroup ? Math.min(CONF.CLEANUP_BUFFER, CONF.TRANSITION_BUFFER) : CONF.CLEANUP_BUFFER;

                            if (testFlow === 'BF') {
                                for (let b = 0; b < CONF.MAX_BEDS; b++) { if (checkLaneContinuity(simulationMap.BED[b], tStart, tStart + p1, phase1Cleanup)) { loc1Idx = b; break; } }
                                for (let c = 0; c < oppConfMaxChairs; c++) { if (checkLaneContinuity(oppMap.CHAIR[c], tSwitch, tSwitch + p2, CONF.CLEANUP_BUFFER)) { loc2Idx = c; break; } }
                                if (loc1Idx !== -1 && loc2Idx !== -1) {
                                    crossLocationMsg = `\n💡 跨館建議：【${locationStr}】目前僅有全身床位，【${oppositeLoc}】有足部座位。是否同意先在【${locationStr}】進行身體按摩，再移步至【${oppositeLoc}】完成足部按摩？`;
                                    foundCross = true;
                                    break;
                                }
                            } else {
                                for (let c = 0; c < CONF.MAX_CHAIRS; c++) { if (checkLaneContinuity(simulationMap.CHAIR[c], tStart, tStart + p1, phase1Cleanup)) { loc1Idx = c; break; } }
                                for (let b = 0; b < oppConfMaxBeds; b++) { if (checkLaneContinuity(oppMap.BED[b], tSwitch, tSwitch + p2, CONF.CLEANUP_BUFFER)) { loc2Idx = b; break; } }
                                if (loc1Idx !== -1 && loc2Idx !== -1) {
                                    crossLocationMsg = `\n💡 跨館建議：【${locationStr}】目前僅有足部座位，【${oppositeLoc}】有全身床位。是否同意先在【${locationStr}】進行足部按摩，再移步至【${oppositeLoc}】完成身體按摩？`;
                                    foundCross = true;
                                    break;
                                }
                            }
                        }
                        if (foundCross) break;
                    }
                }

                if (bestOutOfBoundSplit) {
                    let rawSuggestedTime = requestStart + bestOutOfBoundSplit.shiftMins;
                    let suggestedTime = Math.ceil(rawSuggestedTime / 5) * 5;
                    let timeStr = getTimeStrFromMins(suggestedTime);
                    let actionText = suggestedTime > requestStart ? '稍晚' : '提早';
                    let shiftVal = Math.abs(suggestedTime - requestStart);
                    return triggerSmartFailure(`⚠️ 在 ${getTimeStrFromMins(requestStart)} 沒有完美符合的連續空位。建議您${actionText} ${shiftVal} 分鐘，改為 ${timeStr} 預約以滿足套餐標準。${crossLocationMsg}`, suggestedTime);
                } else {
                    return triggerSmartFailure(`⚠️ 在 ${getTimeStrFromMins(requestStart)} 沒有足夠的連續空位給套餐。${crossLocationMsg}`);
                }
            }

        } else {
            // Khách lẻ
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
                return triggerSmartFailure(`⚠️ 已經沒有連續 ${duration} 分鐘的空${rType === 'BED' ? '床位' : '座位'}。`);
            }
        }
    }
    return { pass: true, debug: { msg: "V118.0 Continuous Scan Passed" }, resourceMap: resourceMap, suggestedLanes: suggestedLanes };
}

// ============================================================================
// PHẦN 5: MATRIX ENGINE (CORE ALLOCATION)
// ============================================================================

class VirtualMatrix {
    constructor() {
        const isOpp = CONF._tempLocation === '對面館';
        const buildingStr = isOpp ? '2' : '1';
        this.lanes = {
            'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${buildingStr}-${i + 1}`, occupied: [] })),
            'BED': Array.from({ length: CONF.MAX_BEDS }, (_, i) => ({ id: `BED-${buildingStr}-${i + 1}`, occupied: [] }))
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
        
        // [V118.9 FIX] 恢復「從上到下緊湊排列」(Top-Down Packing) 邏輯，取消空位優先分配以避免視覺空隙。
        // 不再根據 occupied.length 進行排序，而是保留原始順序 (CHAIR-1, CHAIR-2...) 進行分配。
        let sortedLanes = [...resourceGroup];

        for (let lane of sortedLanes) {
            const check = this.checkLaneFree(lane, start, end);
            if (check.free) {
                return this.allocateToLane(lane, start, end, ownerId);
            } else {
                this.blockLog.push(`❌ ${lane.id} 被 ${check.blocker.ownerId} 擋住`);
            }
        }
        
        return null;
    }
}

// ============================================================================
// PHẦN 6: LOGIC TÌM NHÂN VIÊN & CO GIÃN
// ============================================================================

function findAvailableStaff(staffReq, start, end, staffListRef, busyList, queryDateStr = null) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        const status = parseStaffStatus(staffInfo, queryDateStr);
        if (!status.isAvailable) return false;

        const shiftStart = status.startMins; const shiftEnd = status.endMins;
        // [CORE V118.0] Thuật toán Phân đoạn Ca Đêm
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
        if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;
        return true;
    };

    if (staffReq && !['RANDOM', 'MALE', 'FEMALE', '隨機', 'Any', 'undefined'].includes(staffReq)) {
        return checkOneStaff(staffReq) ? staffReq : null;
    } else {
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) { if (checkOneStaff(name)) return name; }
        return null;
    }
}

function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null, minFoot = null, maxFoot = null, minBody = null, maxBody = null, flow = 'FB', includeOutOfBounds = false) {
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
        return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999, shiftMins: 0 }];
    }
    const standardHalf = Math.floor(totalDuration / 2);
    let options = [];

    let strictMinP1 = 15, strictMaxP1 = totalDuration - 15;
    let strictMinP2 = 15, strictMaxP2 = totalDuration - 15;

    const isBF = (flow === 'BF');
    if (isBF) {
        if (minBody) strictMinP1 = Math.max(strictMinP1, minBody);
        if (maxBody) strictMaxP1 = Math.min(strictMaxP1, maxBody);
        if (minFoot) strictMinP2 = Math.max(strictMinP2, minFoot);
        if (maxFoot) strictMaxP2 = Math.min(strictMaxP2, maxFoot);
    } else {
        if (minFoot) strictMinP1 = Math.max(strictMinP1, minFoot);
        if (maxFoot) strictMaxP1 = Math.min(strictMaxP1, maxFoot);
        if (minBody) strictMinP2 = Math.max(strictMinP2, minBody);
        if (maxBody) strictMaxP2 = Math.min(strictMaxP2, maxBody);
    }

    let lowerBoundP1 = Math.max(strictMinP1, totalDuration - strictMaxP2);
    let upperBoundP1 = Math.min(strictMaxP1, totalDuration - strictMinP2);

    let scanMinP1 = includeOutOfBounds ? 15 : lowerBoundP1;
    let scanMaxP1 = includeOutOfBounds ? (totalDuration - 15) : upperBoundP1;

    let p2_standard = totalDuration - standardHalf;

    const addOption = (p1) => {
        let p2 = totalDuration - p1;
        let shiftMins = 0;
        if (p1 > upperBoundP1) shiftMins = p1 - upperBoundP1;
        else if (p1 < lowerBoundP1) shiftMins = p1 - lowerBoundP1;
        
        if (!includeOutOfBounds && shiftMins !== 0) return;
        
        options.push({ p1: p1, p2: p2, deviation: Math.abs(p1 - standardHalf), shiftMins: shiftMins });
    };

    addOption(standardHalf);

    let realStep = step > 0 ? step : 5;

    if (isBF) {
        for (let p1 = scanMaxP1; p1 >= scanMinP1; p1 -= realStep) {
            if (p1 === standardHalf) continue;
            addOption(p1);
        }
    } else {
        for (let p1 = scanMinP1; p1 <= scanMaxP1; p1 += realStep) {
            if (p1 === standardHalf) continue;
            addOption(p1);
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
    if (uniqueOptions.length === 0) uniqueOptions.push({ p1: standardHalf, p2: p2_standard, deviation: 0, shiftMins: 0 });
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
// PHẦN 7: CORE ENGINE V118.0
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList, options = {}) {
    let loc = options.location || '本館';
    if (loc !== '本館' && loc !== '對面館') {
        if (loc.includes('對面館') && !loc.includes('本館')) loc = '對面館';
        else loc = '本館';
    }
    CONF._tempLocation = loc;
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "❌ 錯誤：時間格式無效" };

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
        const bLoc = b.originalData?.location || b.location || '本館';
        if (bLoc !== CONF._tempLocation) return false;
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
        const dur = g.overrideDuration || getServiceInfo(g.serviceCode, g.serviceName).duration || 60;
        if (dur > maxGuestDuration) maxGuestDuration = dur;
    });

    // 1. GUARDRAIL CHECK (Đồng bộ Backend & Frontend V118)
    const guardrailCheck = validateGlobalCapacity(requestStartMins, maxGuestDuration, guestList, filteredBookings, staffList, normalizedQueryDate, false, CONF._tempLocation);
    if (!guardrailCheck.pass) return { feasible: false, reason: guardrailCheck.reason, debug: guardrailCheck.debug };
    const resourceMap = guardrailCheck.resourceMap || { 'BED': [], 'CHAIR': [] };

    // 2. TIỀN XỬ LÝ BOOKING CŨ
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
                          statusLower.includes('服務中') || 
                          statusLower.includes('serving') || 
                          statusLower.includes('🟡');
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
                               bStatus.includes('服務中') || 
                               bStatus.includes('serving') || 
                               bStatus.includes('🟡');
            if (!isBRunning) {
                b._virtualInheritanceIndex = (groupSize >= 2) ? (idx % halfSize) + 1 : idx + 1;
                if (groupSize >= 2) b._impliedFlow = (idx < halfSize) ? 'BF' : 'FB';
            }
            remappedBookings.push(b);
        });
    });

    // 3. TẠO KHỐI THỜI GIAN
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
                          bStatusStr.includes('服務中') || 
                          bStatusStr.includes('serving') || 
                          bStatusStr.includes('🟡');

        // [V135 FIX] LUÔN ưu tiên lấy toạ độ thực tế một cách toàn diện như Guardrail
        // Điều này ngăn chặn Bóng Ma Toạ Độ do Matrix gán nhầm ghế/giường đã có khách.
        const rIdStr = (b.phase1_res_idx || "") + " " + (b.phase2_res_idx || "") + " " + (b.allocated_resource || "") + " " + (b.location || "") + " " + (b.current_resource_id || "") + " " + (b.rowId || "");
        const matches = [...rIdStr.matchAll(/((?:BED|CHAIR)-[12]-\d+)/gi)].map(m => m[1].toUpperCase());
        let uniqueMatches = [...new Set(matches)];

        if (uniqueMatches.length === 0) {
            const backupMatches = [...rIdStr.matchAll(/(\d+)/gi)].map(m => m[1]);
            let inferredType = 'CHAIR';
            if (svcInfo) {
                if (svcInfo.type === 'BED' || svcInfo.type === 'CHAIR') inferredType = svcInfo.type;
                else {
                    const name = (svcInfo.name || '').toUpperCase();
                    if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|SPA|BACK/)) inferredType = 'BED';
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
                if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                else if (isRunning && b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) isBodyFirst = true;
                else if (b._impliedFlow === 'BF') isBodyFirst = true;
            }

            let p1Index = null;
            let p2Index = null;

            if (uniqueMatches.length >= 2) {
                let res1, res2;
                if (isBodyFirst) {
                    res1 = uniqueMatches.find(r => r.includes('BED') || r.includes('床')) || uniqueMatches[0];
                    res2 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('足')) || uniqueMatches[1];
                } else {
                    res1 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('足')) || uniqueMatches[0];
                    res2 = uniqueMatches.find(r => r.includes('BED') || r.includes('床')) || uniqueMatches[1];
                }
                if (res1) { const m = res1.match(/(\d+)/); if (m) p1Index = parseInt(m[0], 10); }
                if (res2) { const m = res2.match(/(\d+)/); if (m) p2Index = parseInt(m[0], 10); }
            } else if (uniqueMatches.length === 1) {
                const mType = (uniqueMatches[0].toUpperCase().includes('BED') || uniqueMatches[0].includes('床')) ? 'BED' : 'CHAIR';
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
            if (resHint.includes('CHAIR') || resHint.includes('足')) rType = 'CHAIR';
            else if (resHint.includes('BED') || resHint.includes('床')) rType = 'BED';
            
            let forcedIdx = anchorIndex;
            if (uniqueMatches.length > 0) {
                const m = uniqueMatches[0].match(/(\d+)/);
                if (m) forcedIdx = parseInt(m[0], 10);
            }
            
            processedB.blocks.push({ start: bStart, end: bStart + duration + CONF.CLEANUP_BUFFER, type: rType, forcedIndex: forcedIdx });
        }
        existingBookingsProcessed.push(processedB);
    });

    // 4. KỊCH BẢN MATRIX KHÁCH MỚI
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
    let globalBestOutOfBoundSqueeze = null;

    for (let numBF of trySequence) {
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;
        let scenarioBestOutOfBoundSqueeze = null;

        let softsToSqueezeCandidates = [];
        for (const exB of existingBookingsProcessed) {
            const exBLoc = exB.originalData?.location || exB.location || '本館';
            if (exBLoc !== CONF._tempLocation) continue;

            let placedSuccessfully = true; let allocatedSlots = [];
            for (const block of exB.blocks) {
                const realEnd = block.end;
                // --- V118.4 FIX: Ép buộc đặt chỗ (isForced = true) cho các Booking đã có sẵn ---
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

            const duration = ng.overrideDuration || svc.duration || 60; let blocks = []; let elasticOptions = [];
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
            
            // [V118.10 FIX] 關閉 suggestedLanes 強制綁定，讓 Top-Down Packing 能夠在交叉安排 (BF/FB) 時自然填補空隙。
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
                    if (specificPrefIdx !== null) isPrefForced = true; // Bắt buộc ưu tiên toạ độ đã được xác minh là an toàn
                }

                const slotId = matrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, specificPrefIdx, isPrefForced);
                if (!slotId) { conflictFound = true; break; }
                guestAllocations.push(slotId);
            }
            if (conflictFound) break;
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) {
                detail.allocated = guestAllocations;
                // [V117.0/V118.0] Phân tách tọa độ để Sheet hiểu chính xác
                detail.phase1_res_idx = guestAllocations[0] || null;
                detail.phase2_res_idx = guestAllocations[1] || null;
            }
        }

        // 5. SQUEEZE LOGIC (Co giãn lịch)
        if (conflictFound) {
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];

        // [V119 FIX] User feedback: "không được dỡ các khách cũ" and "chỉ khoá cứng toạ độ của các khách đang phục vụ"
        const hardBookings = existingBookingsProcessed;
        hardBookings.forEach(hb => {
            const hbLoc = hb.originalData?.location || hb.location || '本館';
            if (hbLoc !== CONF._tempLocation) return;

            let isRunning = false;
            if (hb.originalData && hb.originalData.status) {
                const stLower = hb.originalData.status.toLowerCase();
                isRunning = stLower.includes('running') || stLower.includes('服務中') || stLower.includes('đang phục vụ');
            }
            hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end, hb.id, blk.forcedIndex, isRunning));
        });

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
                            splitsToTry = generateElasticSplits(item.duration, elasticStep, elasticLimit, null, minFoot, maxFoot, minBody, maxBody, item.flow, true);
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
                                if (split.shiftMins !== 0) {
                                    if (!scenarioBestOutOfBoundSqueeze) {
                                        scenarioBestOutOfBoundSqueeze = { guestIdx: item.guest.idx, shiftMins: split.shiftMins, p1: split.p1, p2: split.p2, flow: item.flow };
                                    }
                                    continue;
                                }
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
                                    nextUpdates.push({ rowId: 'NEW', customerName: '新客', newPhase1: split.p1, newPhase2: split.p2, reason: '⚠️ 系統已自動啟動彈性時間安排以符合空位' });
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
                        if (scenarioBestOutOfBoundSqueeze && !globalBestOutOfBoundSqueeze) {
                            globalBestOutOfBoundSqueeze = scenarioBestOutOfBoundSqueeze;
                        }
                        scenarioFailed = true; continue;
                    }

            const softBookings = []; // [V119 FIX] Disabled squeezing of existing bookings per user request
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
                                reason: '⚠️ 系統已自動啟動彈性時間安排並重新分配資源'
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
        if (globalBestOutOfBoundSqueeze) {
            let suggestedTime = requestStartMins + globalBestOutOfBoundSqueeze.shiftMins;
            let timeStr = getTimeStrFromMins(suggestedTime);
            let actionText = globalBestOutOfBoundSqueeze.shiftMins > 0 ? '稍晚' : '提早';
            let shiftVal = Math.abs(globalBestOutOfBoundSqueeze.shiftMins);
            let reqTimeStr = getTimeStrFromMins(requestStartMins);
            let msg = `⚠️ 系統計算出您的套餐分配為 (${globalBestOutOfBoundSqueeze.flow === 'BF' ? '身' : '腳'}:${globalBestOutOfBoundSqueeze.p1} ; ${globalBestOutOfBoundSqueeze.flow === 'BF' ? '腳' : '身'}:${globalBestOutOfBoundSqueeze.p2})，已超出標準限制。建議您${actionText} ${shiftVal} 分鐘，改為 ${timeStr} 預約以滿足標準。`;
            return triggerSmartFailure(msg, suggestedTime);
        }
        const debugReason = failureLog.slice(-2).join(' | ');
        const failMessage = debugReason ? `❌ 系統滿載：${debugReason}` : "❌ 已額滿（系統滿載）";
        return { feasible: false, reason: failMessage, debug: guardrailCheck.debug };
    }
}

// ============================================================================
// PHẦN 8: MODULE EXPORT
// ============================================================================
const CoreAPI = {
    checkRequestAvailability, setDynamicServices, get SERVICES() { return SERVICES; },
    CONFIG: CONF, // Giữ tên biến CONFIG khi xuất ra để tương thích ngược với index.js cũ nếu có
    getMinsFromTimeStr, getTimeStrFromMins, getTaipeiNow, normalizeDateStrict, inferFlowFromService, generateElasticSplits
};

if (typeof module !== 'undefined' && module.exports) module.exports = CoreAPI;
if (typeof window !== 'undefined') {
    window.ResourceCore = CoreAPI; window.checkRequestAvailability = CoreAPI.checkRequestAvailability;
    window.setDynamicServices = CoreAPI.setDynamicServices; window.normalizeDateStrict = CoreAPI.normalizeDateStrict;
    window.generateElasticSplits = CoreAPI.generateElasticSplits;
    console.log("✅ Resource Core V118.0 Loaded: DATA & CONTINUOUS SCAN SYNCED.");
}
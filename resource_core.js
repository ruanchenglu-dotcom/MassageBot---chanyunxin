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
 * từ file data.js (SYSTEM_CONFIG). Hỗ trợ chạy trên cả Node.js và Browser.
 * 2. [ALGORITHM SYNC] Bê nguyên thuật toán "Continuous Scan Guardrail" (chống phân mảnh
 * khoảng trống) từ bookingHandler.js (Frontend) sang. Đảm bảo Backend và Frontend
 * đồng bộ 100% kết quả kiểm tra chỗ trống.
 * 3. [PRESERVED] Giữ nguyên logic V117.0 (Squeeze Logic, Phase Resource Coordinate Mapping).
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: LIÊN KẾT CẤU HÌNH TRUNG TÂM (DATA.JS)
// ============================================================================

let SYSTEM_CONFIG = null;

// Thử tải data.js trong môi trường Node.js (Backend)
if (typeof require !== 'undefined') {
    try {
        const dataModule = require('./data.js');
        SYSTEM_CONFIG = dataModule.SYSTEM_CONFIG;
        console.log("✅ [CORE V118.0] Đã nạp thành công SYSTEM_CONFIG từ data.js (Backend)");
    } catch (e) {
        console.warn("⚠️ [CORE V118.0] Không tìm thấy file ./data.js qua require. Chờ Fallback.");
    }
}

// Thử tải từ Global Window nếu chạy dưới dạng script trên trình duyệt (Frontend fallback)
if (!SYSTEM_CONFIG && typeof window !== 'undefined' && window.SYSTEM_CONFIG) {
    SYSTEM_CONFIG = window.SYSTEM_CONFIG;
    console.log("✅ [CORE V118.0] Đã nạp thành công SYSTEM_CONFIG từ window (Frontend)");
}

// FALLBACK AN TOÀN TỐI HẬU (Phòng trường hợp file data.js bị lỗi/mất)
if (!SYSTEM_CONFIG) {
    console.error("❌ [CORE V118.0] CRITICAL: Không tìm thấy SYSTEM_CONFIG. Đang dùng Fallback mặc định 9-9.");
    SYSTEM_CONFIG = {
        SCALE: { MAX_CHAIRS: 9, MAX_BEDS: 9 },
        OPERATION_TIME: { OPEN_HOUR: 3 },
        BUFFERS: { CLEANUP_MINUTES: 5, TRANSITION_MINUTES: 5 },
        LOGIC_RULES: { TOLERANCE: 1, CAPACITY_CHECK_STEP: 10 }
    };
}

// Alias ánh xạ cấu hình để code phía dưới ngắn gọn và tương thích ngược
const CONF = {
    MAX_CHAIRS: SYSTEM_CONFIG.SCALE.MAX_CHAIRS,
    MAX_BEDS: SYSTEM_CONFIG.SCALE.MAX_BEDS,
    OPEN_HOUR: SYSTEM_CONFIG.OPERATION_TIME.OPEN_HOUR,
    CLEANUP_BUFFER: SYSTEM_CONFIG.BUFFERS.CLEANUP_MINUTES,
    TRANSITION_BUFFER: SYSTEM_CONFIG.BUFFERS.TRANSITION_MINUTES,
    TOLERANCE: SYSTEM_CONFIG.LOGIC_RULES?.TOLERANCE || 1,
    CAPACITY_CHECK_STEP: SYSTEM_CONFIG.LOGIC_RULES?.CAPACITY_CHECK_STEP || 10
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
        let str = input.toString().trim();
        if (str.includes('T')) str = str.split('T')[0];
        if (str.includes(' ')) str = str.split(' ')[0];
        str = str.replace(/-/g, '/').replace(/\./g, '/');
        const parts = str.split('/');
        if (parts.length !== 3) return str;

        const partA = parts[0]; const partB = parts[1]; const partC = parts[2];
        if (partA.length === 4) return `${partA}/${partB.padStart(2, '0')}/${partC.padStart(2, '0')}`;
        if (partC.length === 4) return `${partC}/${partB.padStart(2, '0')}/${partA.padStart(2, '0')}`;
        return str;
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
        // Sử dụng OPEN_HOUR từ cấu hình trung tâm (Mặc định 3:00 sáng)
        if (h < CONF.OPEN_HOUR) h += 24;

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
    if (!statusRaw) return false;
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

function parseStaffStatus(staffInfo) {
    if (!staffInfo) return { isAvailable: false };
    let isOff = false;
    if (staffInfo.off === true) isOff = true;
    if (typeof staffInfo.off === 'string' && ['TRUE', 'YES', 'OFF'].includes(staffInfo.off.toUpperCase())) isOff = true;

    const startStr = (staffInfo.start || "").toString().toUpperCase();
    if (startStr.includes('OFF') || startStr.includes('NGHỈ') || startStr.includes('CLOSE')) isOff = true;
    if (isOff) return { isAvailable: false, reason: "MARKED_OFF" };

    const startMins = getMinsFromTimeStr(staffInfo.start);
    const endMins = getMinsFromTimeStr(staffInfo.end);
    if (startMins === -1 || endMins === -1) return { isAvailable: false, reason: "INVALID_TIME" };

    return { isAvailable: true, startMins: startMins, endMins: endMins, isStrict: staffInfo.isStrictTime === true };
}

function getEligibleStaffCount(staffList, currentTimeMins, requiredEndTime) {
    let count = 0;
    for (const [staffName, info] of Object.entries(staffList)) {
        const status = parseStaffStatus(info);
        if (!status.isAvailable) continue;
        const shiftStart = status.startMins; const shiftEnd = status.endMins;
        if (currentTimeMins >= shiftStart && currentTimeMins < shiftEnd) {
            if (status.isStrict && shiftEnd < (requiredEndTime - CONF.TOLERANCE)) continue;
            count++;
        }
    }
    return count;
}

// ============================================================================
// PHẦN 4: HÀNG RÀO DUNG LƯỢNG (GUARDRAIL V118.0)
// Áp dụng thuật toán Continuous Scan từ bookingHandler.js
// ============================================================================

function checkLaneContinuity(laneOccupiedArr, start, end) {
    const safeEnd = end + CONF.CLEANUP_BUFFER;
    for (let block of laneOccupiedArr) {
        if (isOverlap(start, safeEnd, block.start, block.end)) return false;
    }
    return true;
}

function validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr) {
    // 1. Lọc Booking hợp lệ
    const relevantBookings = currentBookingsRaw.filter(b => {
        const bStart = getMinsFromTimeStr(b.startTimeString || b.startTime);
        if (bStart === -1) return false;
        if (!isActiveBookingStatus(b.status)) return false;
        const bEnd = bStart + (b.duration || 60) + CONF.CLEANUP_BUFFER;
        return bEnd > requestStart;
    });

    // 2. Kiểm tra Nhân sự (Staff Capacity)
    const supplyCount = getEligibleStaffCount(staffList, requestStart, requestStart + maxDuration);
    let staffBusyCount = 0;
    relevantBookings.forEach(b => {
        const bS = getMinsFromTimeStr(b.startTimeString || b.startTime);
        const bE = bS + (b.duration || 60) + CONF.CLEANUP_BUFFER;
        if (requestStart >= bS && requestStart < bE) staffBusyCount++;
    });

    if ((staffBusyCount + guestList.length) > supplyCount) {
        return { pass: false, reason: `⚠️ 技師不足 (Not Enough Staff)。總共: ${supplyCount}, 忙碌中: ${staffBusyCount}, 新客: ${guestList.length}`, debug: {} };
    }

    // 3. Phân tích tài nguyên chống phân mảnh (Continuous Scan)
    const resourceMap = {
        'BED': Array.from({ length: CONF.MAX_BEDS }, () => []),
        'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, () => [])
    };

    relevantBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTimeString || b.startTime);
        const duration = b.duration || 60;
        const rId = b.allocated_resource || b.rowId || "";
        const laneMatch = rId.toString().match(/(BED|CHAIR)[-_ ]?(\d+)/i);

        if (laneMatch) {
            const type = laneMatch[1].toUpperCase().includes('BED') ? 'BED' : 'CHAIR';
            const idx = parseInt(laneMatch[2]) - 1;
            if (resourceMap[type] && resourceMap[type][idx]) {
                resourceMap[type][idx].push({ start: bStart, end: bStart + duration + CONF.CLEANUP_BUFFER });
            }
        }
    });

    // Mô phỏng luồng khách mới
    const simulationMap = JSON.parse(JSON.stringify(resourceMap));

    for (let i = 0; i < guestList.length; i++) {
        const g = guestList[i];
        const svc = getServiceInfo(g.serviceCode, g.serviceName);
        const duration = svc.duration || 60;
        const explicitFlow = g.flowCode || null;
        const isCombo = isComboService(svc, g.serviceCode, explicitFlow);

        if (isCombo) {
            const p1 = Math.floor(duration / 2);
            const p2 = duration - p1;
            const tStart = requestStart;
            const tSwitch = tStart + p1 + CONF.TRANSITION_BUFFER;

            let successBF = false; let successFB = false;
            let bedIdx = -1, chairIdx = -1;

            // Kịch bản A: Body Trước (BED -> CHAIR)
            for (let b = 0; b < CONF.MAX_BEDS; b++) { if (checkLaneContinuity(simulationMap.BED[b], tStart, tStart + p1)) { bedIdx = b; break; } }
            for (let c = 0; c < CONF.MAX_CHAIRS; c++) { if (checkLaneContinuity(simulationMap.CHAIR[c], tSwitch, tSwitch + p2)) { chairIdx = c; break; } }

            if (bedIdx !== -1 && chairIdx !== -1) {
                successBF = true;
                simulationMap.BED[bedIdx].push({ start: tStart, end: tStart + p1 + CONF.CLEANUP_BUFFER });
                simulationMap.CHAIR[chairIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
            } else {
                // Kịch bản B: Chân Trước (CHAIR -> BED)
                chairIdx = -1; bedIdx = -1;
                for (let c = 0; c < CONF.MAX_CHAIRS; c++) { if (checkLaneContinuity(simulationMap.CHAIR[c], tStart, tStart + p1)) { chairIdx = c; break; } }
                for (let b = 0; b < CONF.MAX_BEDS; b++) { if (checkLaneContinuity(simulationMap.BED[b], tSwitch, tSwitch + p2)) { bedIdx = b; break; } }

                if (chairIdx !== -1 && bedIdx !== -1) {
                    successFB = true;
                    simulationMap.CHAIR[chairIdx].push({ start: tStart, end: tStart + p1 + CONF.CLEANUP_BUFFER });
                    simulationMap.BED[bedIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                }
            }

            if (!successBF && !successFB) {
                return { pass: false, reason: `⚠️ 在 ${getTimeStrFromMins(requestStart)} 沒有足夠的連續空位 (Continuous Gap) 給套餐。`, debug: { msg: "Logic V118.0 detected gap fragmentation." } };
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
            } else {
                return { pass: false, reason: `⚠️ 已經沒有連續 ${duration} 分鐘的空${rType === 'BED' ? '床位' : '座位'}。`, debug: {} };
            }
        }
    }
    return { pass: true, debug: { msg: "V118.0 Continuous Scan Passed" } };
}

// ============================================================================
// PHẦN 5: MATRIX ENGINE (CORE ALLOCATION)
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
    tryAllocate(type, start, end, ownerId, preferredIndex = null) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null;

        if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
            const targetLane = resourceGroup[preferredIndex - 1];
            if (this.checkLaneFree(targetLane, start, end).free) {
                return this.allocateToLane(targetLane, start, end, ownerId);
            }
        }
        for (let lane of resourceGroup) {
            const check = this.checkLaneFree(lane, start, end);
            if (check.free) return this.allocateToLane(lane, start, end, ownerId);
            else this.blockLog.push(`❌ ${lane.id} 被 ${check.blocker.ownerId} 擋住`);
        }
        return null;
    }
}

// ============================================================================
// PHẦN 6: LOGIC TÌM NHÂN VIÊN & CO GIÃN
// ============================================================================

function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        const status = parseStaffStatus(staffInfo);
        if (!status.isAvailable) return false;

        const shiftStart = status.startMins; const shiftEnd = status.endMins;
        if ((start + CONF.TOLERANCE) < shiftStart) return false;
        if (status.isStrict) { if ((end - CONF.TOLERANCE) > shiftEnd) return false; }
        else { if (start > shiftEnd) return false; }

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

function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
        return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999 }];
    }
    const standardHalf = Math.floor(totalDuration / 2);
    let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];
    if (!step || !limit || step <= 0 || limit <= 0) return options;

    let currentDeviation = step;
    while (currentDeviation <= limit) {
        let p1_A = standardHalf - currentDeviation; let p2_A = totalDuration - p1_A;
        if (p1_A >= 15 && p2_A >= 15) options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });

        let p1_B = standardHalf + currentDeviation; let p2_B = totalDuration - p1_B;
        if (p1_B >= 15 && p2_B >= 15) options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
        currentDeviation += step;
    }
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
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

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    const normalizedQueryDate = normalizeDateStrict(dateStr);
    const filteredBookings = currentBookingsRaw.filter(b => {
        if (!b || !b.startTimeString) return false;
        return normalizeDateStrict(b.startTimeString.split(' ')[0]) === normalizedQueryDate;
    });

    let maxGuestDuration = 0;
    guestList.forEach(g => {
        const dur = getServiceInfo(g.serviceCode, g.serviceName).duration || 60;
        if (dur > maxGuestDuration) maxGuestDuration = dur;
    });

    // 1. GUARDRAIL CHECK (Đồng bộ Backend & Frontend V118)
    const guardrailCheck = validateGlobalCapacity(requestStartMins, maxGuestDuration, guestList, filteredBookings, staffList, normalizedQueryDate);
    if (!guardrailCheck.pass) return { feasible: false, reason: `SYSTEM REJECT: ${guardrailCheck.reason}`, debug: guardrailCheck.debug };

    // 2. TIỀN XỬ LÝ BOOKING CŨ
    let sortedRaw = [...filteredBookings].sort((a, b) => getMinsFromTimeStr(a.startTimeString || a.startTime) - getMinsFromTimeStr(b.startTimeString || b.startTime));
    const bookingGroups = {};

    sortedRaw.forEach(b => {
        if (!isActiveBookingStatus(b.status)) return;
        const timeKey = ((b.startTimeString || b.startTime) || "").split(' ')[1] || "00:00";
        const contactInfo = b.originalData?.phone || b.originalData?.sdt || b.originalData?.custPhone || b.originalData?.customerName || "Unknown";
        const contactKey = contactInfo.toString().replace(/\D/g, '').slice(-6) || contactInfo.toString().trim();
        const statusLower = (b.status || '').toLowerCase();
        const groupKey = (statusLower.includes('running') || statusLower.includes('doing')) ? `RUNNING_${b.rowId}` : `${timeKey}_${contactKey}`;
        if (!bookingGroups[groupKey]) bookingGroups[groupKey] = [];
        bookingGroups[groupKey].push(b);
    });

    let remappedBookings = [];
    Object.values(bookingGroups).forEach(group => {
        group.sort((a, b) => parseInt(a.rowId) - parseInt(b.rowId));
        const groupSize = group.length; const halfSize = Math.ceil(groupSize / 2);
        group.forEach((b, idx) => {
            b._virtualInheritanceIndex = null; b._impliedFlow = null;
            if (!(b.status || '').toLowerCase().includes('running')) {
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
        const isRunning = (b.status || '').toLowerCase().includes('running');

        if (isRunning) {
            if (b.allocated_resource) { const match = b.allocated_resource.toString().match(/(\d+)/); if (match) anchorIndex = parseInt(match[0]); }
            else if (b.rowId && typeof b.rowId === 'string' && (b.rowId.includes('BED') || b.rowId.includes('CHAIR'))) { const match = b.rowId.toString().match(/(\d+)/); if (match) anchorIndex = parseInt(match[0]); }
        } else {
            if (b._virtualInheritanceIndex) anchorIndex = b._virtualInheritanceIndex;
            else if (b.allocated_resource) { const match = b.allocated_resource.toString().match(/(\d+)/); if (match) anchorIndex = parseInt(match[0]); }
        }

        const isLockedRaw = b.originalData?.isManualLocked || b.isManualLocked;
        const isLocked = (isLockedRaw === true || isLockedRaw === 'TRUE');
        let processedB = {
            id: b.rowId, originalData: b, staffName: b.staffName, serviceName: b.serviceName, category: svcInfo.category,
            isElastic: isCombo && (!isLocked) && (!isRunning),
            elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
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

            if (isBodyFirst) {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: anchorIndex });
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'CHAIR', forcedIndex: anchorIndex });
                processedB.flow = 'BF';
            } else {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: anchorIndex });
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED', forcedIndex: anchorIndex });
                processedB.flow = 'FB';
            }
            processedB.p1_current = p1; processedB.p2_current = p2;
        } else {
            processedB.flow = storedFlow;
            let rType = (storedFlow === 'FOOTSINGLE') ? 'CHAIR' : 'BED';
            processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
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

    for (let numBF of trySequence) {
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;

        let softsToSqueezeCandidates = [];
        for (const exB of existingBookingsProcessed) {
            let placedSuccessfully = true; let allocatedSlots = [];
            for (const block of exB.blocks) {
                const realEnd = block.end + CONF.CLEANUP_BUFFER;
                const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id, block.forcedIndex);
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

            const duration = svc.duration || 60; let blocks = [];
            if (isThisGuestCombo) {
                const p1Standard = Math.floor(duration / 2); const p2Standard = duration - p1Standard;
                if (flow === 'FB') {
                    const t1End = requestStartMins + p1Standard; const t2Start = t1End + CONF.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONF.CLEANUP_BUFFER, type: 'CHAIR' });
                    blocks.push({ start: t2Start, end: t2Start + p2Standard + CONF.CLEANUP_BUFFER, type: 'BED' });
                    scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'FB', timeStr: timeStr, allocated: [] });
                } else {
                    const t1End = requestStartMins + p2Standard; const t2Start = t1End + CONF.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONF.CLEANUP_BUFFER, type: 'BED' });
                    blocks.push({ start: t2Start, end: t2Start + p1Standard + CONF.CLEANUP_BUFFER, type: 'CHAIR' });
                    scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'BF', timeStr: timeStr, allocated: [] });
                }
            } else {
                let rType = (flow === 'FOOTSINGLE') ? 'CHAIR' : 'BED';
                blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONF.CLEANUP_BUFFER, type: rType });
                scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, flow: flow, timeStr: timeStr, allocated: [] });
            }
            newGuestBlocksMap.push({ guest: ng, blocks: blocks });
        }

        let conflictFound = false;
        for (const item of newGuestBlocksMap) {
            let guestAllocations = [];
            let preferredIdx = null;
            if (newGuestHalfSize > 0 && newGuests.length >= 2) {
                preferredIdx = (item.guest.idx % newGuestHalfSize) + 1;
                if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdx = item.guest.idx + 1;
            }
            for (const block of item.blocks) {
                const slotId = matrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, preferredIdx);
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

            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => { hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONF.CLEANUP_BUFFER, hb.id, blk.forcedIndex)); });

            let squeezeScenarioPossible = true;
            let squeezeAllocationsMap = [];
            for (const item of newGuestBlocksMap) {
                let preferredIdxSqueeze = null;
                if (newGuestHalfSize > 0 && newGuests.length >= 2) {
                    preferredIdxSqueeze = (item.guest.idx % newGuestHalfSize) + 1;
                    if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdxSqueeze = item.guest.idx + 1;
                }
                let guestSqueezeAllocations = [];
                for (const block of item.blocks) {
                    const slotId = matrixSqueeze.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, preferredIdxSqueeze);
                    if (!slotId) { squeezeScenarioPossible = false; break; }
                    guestSqueezeAllocations.push(slotId);
                }
                if (!squeezeScenarioPossible) break;
                squeezeAllocationsMap.push({ guestIndex: item.guest.idx, allocated: guestSqueezeAllocations });
            }

            if (!squeezeScenarioPossible) {
                if (matrixSqueeze.blockLog.length > 0) failureLog = matrixSqueeze.blockLog;
                scenarioFailed = true; continue;
            }

            const softBookings = existingBookingsProcessed.filter(b => b.isElastic);
            for (const sb of softBookings) {
                const splits = generateElasticSplits(sb.duration, sb.elasticStep, sb.elasticLimit, null);
                let fit = false;
                for (const split of splits) {
                    const sP1End = sb.startMins + split.p1; const sP2Start = sP1End + CONF.TRANSITION_BUFFER; const sP2End = sP2Start + split.p2;
                    const testBlocks = [
                        { type: 'CHAIR', start: sb.startMins, end: sP1End + CONF.CLEANUP_BUFFER, forcedIndex: sb.blocks[0].forcedIndex },
                        { type: 'BED', start: sP2Start, end: sP2End + CONF.CLEANUP_BUFFER, forcedIndex: sb.blocks[1] ? sb.blocks[1].forcedIndex : null }
                    ];
                    if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                        testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id, tb.forcedIndex)); fit = true;
                        if (split.deviation !== 0) updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze V118.0' });
                        break;
                    }
                }
                if (!fit) { squeezeScenarioPossible = false; break; }
            }
            if (squeezeScenarioPossible) {
                scenarioUpdates = updatesProposed;
                matrix = matrixSqueeze;
                squeezeAllocationsMap.forEach(mapItem => {
                    const detail = scenarioDetails.find(d => d.guestIndex === mapItem.guestIndex);
                    if (detail) {
                        detail.allocated = mapItem.allocated;
                        detail.phase1_res_idx = mapItem.allocated[0] || null;
                        detail.phase2_res_idx = mapItem.allocated[1] || null;
                    }
                });
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
            const assignedStaff = findAvailableStaff(item.guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length - 1].end, staffList, flatTimeline);
            if (!assignedStaff) { staffAssignmentSuccess = false; break; }
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) detail.staff = assignedStaff;
            item.blocks.forEach(b => flatTimeline.push({ start: b.start, end: b.end, staffName: assignedStaff }));
        }

        if (!staffAssignmentSuccess) { scenarioFailed = true; continue; }
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
        const failMessage = debugReason ? `❌ Matrix Full: ${debugReason}` : "❌ 已額滿 (Matrix System Full)";
        return { feasible: false, reason: failMessage, debug: guardrailCheck.debug };
    }
}

// ============================================================================
// PHẦN 8: MODULE EXPORT
// ============================================================================
const CoreAPI = {
    checkRequestAvailability, setDynamicServices, get SERVICES() { return SERVICES; },
    CONFIG: CONF, // Giữ tên biến CONFIG khi xuất ra để tương thích ngược với index.js cũ nếu có
    getMinsFromTimeStr, getTimeStrFromMins, getTaipeiNow, normalizeDateStrict, inferFlowFromService
};

if (typeof module !== 'undefined' && module.exports) module.exports = CoreAPI;
if (typeof window !== 'undefined') {
    window.ResourceCore = CoreAPI; window.checkRequestAvailability = CoreAPI.checkRequestAvailability;
    window.setDynamicServices = CoreAPI.setDynamicServices; window.normalizeDateStrict = CoreAPI.normalizeDateStrict;
    console.log("✅ Resource Core V118.0 Loaded: DATA & CONTINUOUS SCAN SYNCED.");
}
/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: SUPER LOGIC V3.0 (BROWSER & SERVER COMPATIBLE)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/09
 * * MÔ TẢ CHI TIẾT:
 * Đây là trái tim xử lý logic của hệ thống. Nó chịu trách nhiệm:
 * 1. Đọc hiểu cấu hình dịch vụ và tài nguyên (Ghế/Giường).
 * 2. Chuẩn hóa thời gian cực gắt (Loại bỏ hoàn toàn giây, làm tròn phút).
 * 3. Logic so sánh giờ vào ca có dung sai (Tolerance).
 * 4. SMART BALANCE: Thuật toán tự động cân bằng tải.
 * 5. [NEW] UNIVERSAL EXPORT: Tự động tương thích Browser (window) và Node.js.
 * =================================================================================================
 */

// --- CẤU HÌNH HỆ THỐNG ---
const CONFIG = {
    MAX_CHAIRS: 6,        // Tối đa 6 ghế Foot Massage
    MAX_BEDS: 6,          // Tối đa 6 giường Body Massage
    MAX_TOTAL_GUESTS: 12, // Tổng dung lượng tối đa (Full House)
    
    OPEN_HOUR: 8,         // Giờ mở cửa
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp (phút)
    TRANSITION_BUFFER: 5, // Thời gian chuyển phase Combo (phút)
    
    // Dung sai cho phép lệch 1 phút để xử lý giây lẻ
    TOLERANCE: 1,         
    
    FUTURE_BUFFER: 5,     
    MAX_TIMELINE_MINS: 1440 
};

// Database dịch vụ (Lưu trong RAM)
let SERVICES = {}; 

// ============================================================================
// PHẦN 1: QUẢN LÝ DỊCH VỤ (SERVICE MANAGEMENT)
// ============================================================================

function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ LATE', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE KERNEL] Services Database Updated: ${Object.keys(SERVICES).length} entries active.`);
}

// ============================================================================
// PHẦN 2: HELPER THỜI GIAN (TIME HELPERS)
// ============================================================================

function getTaipeiNow() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const taipeiOffset = 8;
    return new Date(utc + (3600000 * taipeiOffset));
}

function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; 
    try {
        let cleanStr = timeStr.toString().trim().replace(/：/g, ':');
        const parts = cleanStr.split(':');
        if (parts.length < 2) return -1;

        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);

        if (isNaN(h) || isNaN(m)) return -1;

        if (h < CONFIG.OPEN_HOUR) {
            h += 24; // Xử lý qua đêm (01:00 -> 25:00)
        }

        return (h * 60) + m;
    } catch (e) {
        console.error(`[TIME ERROR] Cannot parse time: ${timeStr}`, e);
        return -1;
    }
}

function getTimeStrFromMins(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    if (h >= 24) h -= 24; 
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isOverlap(startA, endA, startB, endB) {
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

// ============================================================================
// PHẦN 3: KIỂM TRA TÀI NGUYÊN (RESOURCE CHECKING)
// ============================================================================

function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; 

    // Sweep Line Logic
    let points = [];
    for (const bk of bookings) {
        let isRelevant = (resourceType === 'TOTAL') ? true : (bk.resourceType === resourceType);
        if (isRelevant && isOverlap(start, end, bk.start, bk.end)) {
            let pStart = Math.max(start, bk.start);
            let pEnd = Math.min(end, bk.end);
            if (pEnd - pStart > CONFIG.TOLERANCE) {
                points.push({ time: pStart, type: 'start' });
                points.push({ time: pEnd, type: 'end' });
            }
        }
    }

    if (points.length === 0) return true; 
    points.sort((a, b) => (a.time === b.time) ? (a.type === 'start' ? -1 : 1) : (a.time - b.time));

    let currentLoad = 0;
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else currentLoad--;
        if (currentLoad >= limit) return false; 
    }
    return true; 
}

function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo || staffInfo.off) return false; 
        
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        if (shiftStart === -1 || shiftEnd === -1) return false; 

        // Tolerance Check
        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
        if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 

        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }
        return true; 
    };

    if (staffReq && staffReq !== 'Any' && staffReq !== 'RANDOM') {
        return checkOneStaff(staffReq) ? staffReq : null;
    } else {
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

// ============================================================================
// PHẦN 4: LOGIC CHÍNH (MAIN LOGIC)
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Lỗi định dạng giờ (Invalid Time Format)." };
    
    // Chuẩn hóa Bookings hiện tại
    let committedBookings = currentBookingsRaw.map(b => {
        let rType = 'CHAIR'; 
        if (SERVICES[b.serviceCode] && SERVICES[b.serviceCode].type) rType = SERVICES[b.serviceCode].type;
        // Fallback detection
        if (b.serviceName.includes('Foot') || b.serviceName.includes('足')) rType = 'CHAIR';
        if (b.serviceName.includes('Body') || b.serviceName.includes('指壓') || b.serviceName.includes('油')) rType = 'BED';
        if (b.serviceName.includes('Combo') || b.serviceName.includes('套餐')) rType = 'BED'; 

        return {
            start: getMinsFromTimeStr(b.startTime),
            end: b.duration ? getMinsFromTimeStr(b.startTime) + b.duration : getMinsFromTimeStr(b.startTime) + 60, 
            resourceType: rType,
            staffName: b.staffName
        };
    }).filter(b => b.start !== -1); 

    // Safety Gate
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
        return { feasible: false, reason: "Tiệm đang quá tải (Max 12 khách)." };
    }

    let singleGuests = [];
    let comboGuests = [];

    for (let i = 0; i < guestList.length; i++) {
        const g = guestList[i];
        const svc = SERVICES[g.serviceCode];
        if (!svc) return { feasible: false, reason: `Dịch vụ chưa được đồng bộ: ${g.serviceCode}` };

        const guestData = {
            id: i,
            serviceCode: g.serviceCode,
            serviceName: svc.name,
            staffReq: g.staffName,
            price: svc.price,
            duration: svc.duration,
            type: svc.type,
            category: svc.category
        };
        if (svc.category === 'COMBO') comboGuests.push(guestData);
        else singleGuests.push(guestData);
    }

    let tentativeBookings = []; 
    let finalDetails = new Array(guestList.length);

    // 1. Xếp khách lẻ
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; 
        const allCurrent = [...committedBookings, ...tentativeBookings];
        
        if (!checkResourceCapacity(guest.type, start, end, allCurrent)) {
            return { feasible: false, reason: `Hết ${guest.type === 'BED' ? 'Giường' : 'Ghế'} cho khách lẻ.` };
        }

        const assignedStaff = findAvailableStaff(guest.staffReq, start, end, staffList, allCurrent);
        if (!assignedStaff) return { feasible: false, reason: `Không có nhân viên rảnh lúc ${timeStr} (Khách lẻ).` };

        tentativeBookings.push({ start: start, end: end, resourceType: guest.type, staffName: assignedStaff });
        finalDetails[guest.id] = {
            guestIndex: guest.id, staff: assignedStaff, service: guest.serviceName, price: guest.price,
            timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
        };
    }

    if (comboGuests.length === 0) return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((s, x) => s + x.price, 0) };

    // 2. Xếp khách Combo (Smart Balance)
    const tryScenario = (scenarioConfig) => {
        let scenarioBookings = JSON.parse(JSON.stringify(tentativeBookings)); 
        let scenarioDetails = []; 

        for (const item of scenarioConfig) {
            const guest = comboGuests.find(g => g.id === item.guestId);
            const halfDuration = Math.floor(guest.duration / 2); 
            
            const p1Start = requestStartMins;
            const p1End = p1Start + halfDuration; 
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            const p2End = p2Start + halfDuration;
            const p1BlockEnd = p1End + CONFIG.CLEANUP_BUFFER;
            const p2BlockEnd = p2End + CONFIG.CLEANUP_BUFFER;
            const staffEnd = p2BlockEnd; 

            let phase1Res = (item.mode === 'FB') ? 'CHAIR' : 'BED';
            let phase2Res = (item.mode === 'FB') ? 'BED' : 'CHAIR';

            let allBusy = [...committedBookings, ...scenarioBookings];

            if (!checkResourceCapacity(phase1Res, p1Start, p1BlockEnd, allBusy)) return null; 
            allBusy.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: 'TEMP' });
            if (!checkResourceCapacity(phase2Res, p2Start, p2BlockEnd, allBusy)) return null; 

            const staff = findAvailableStaff(guest.staffReq, p1Start, staffEnd, staffList, [...committedBookings, ...scenarioBookings]);
            if (!staff) return null; 

            scenarioBookings.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: staff });
            scenarioBookings.push({ start: p2Start, end: p2BlockEnd, resourceType: phase2Res, staffName: staff });

            scenarioDetails.push({
                guestIndex: guest.id, staff: staff, service: guest.serviceName, price: guest.price, mode: item.mode, 
                timeStr: `${timeStr} - ${getTimeStrFromMins(p2End)}`
            });
        }
        return scenarioDetails; 
    };

    // Thử nghiệm các kịch bản
    let successScenario = null;
    successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }))); // All FB
    if (!successScenario) successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }))); // All BF
    
    // Mixed Balance
    if (!successScenario && comboGuests.length >= 2) {
        const splitConfig = [];
        for (let i = 0; i < comboGuests.length; i++) {
            splitConfig.push({ guestId: comboGuests[i].id, mode: (i < CONFIG.MAX_CHAIRS) ? 'FB' : 'BF' });
        }
        successScenario = tryScenario(splitConfig);
    }
    
    // Reverse Balance
    if (!successScenario && comboGuests.length >= 2) {
        const splitConfig = [];
        for (let i = 0; i < comboGuests.length; i++) {
            splitConfig.push({ guestId: comboGuests[i].id, mode: (i < CONFIG.MAX_BEDS) ? 'BF' : 'FB' });
        }
        successScenario = tryScenario(splitConfig);
    }

    if (successScenario) {
        successScenario.forEach(item => { finalDetails[item.guestIndex] = item; });
        return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0) };
    } else {
        return { feasible: false, reason: "Combo: Hết tài nguyên hoặc không đủ nhân viên (đã thử cân bằng tải)." };
    }
}

// ============================================================================
// PHẦN 5: UNIVERSAL EXPORT (FIX LỖI TRÌNH DUYỆT)
// ============================================================================
const CoreAPI = {
    checkRequestAvailability,
    setDynamicServices,
    get SERVICES() { return SERVICES; },
    CONFIG,
    getMinsFromTimeStr,
    getTaipeiNow
};

// 1. Dành cho Node.js (Backend)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreAPI;
}

// 2. Dành cho Browser (Frontend - Quan trọng để sửa lỗi của bạn)
if (typeof window !== 'undefined') {
    window.ResourceCore = CoreAPI;
    // Expose trực tiếp hàm để bookingHandler.js dễ tìm thấy
    window.checkRequestAvailability = CoreAPI.checkRequestAvailability;
    window.setDynamicServices = CoreAPI.setDynamicServices;
    console.log("✅ Resource Core V3.0: Loaded successfully into Window Scope.");
}
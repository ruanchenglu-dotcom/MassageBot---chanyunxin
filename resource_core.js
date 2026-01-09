/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V3.2 (FIXED: SMART COMBO SPLITTING FOR EXISTING BOOKINGS)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/10
 * * * CẬP NHẬT QUAN TRỌNG V3.2:
 * - Fix lỗi chiếm dụng tài nguyên sai của đơn hàng cũ.
 * - Đơn hàng Combo cũ (Existing Bookings) giờ đây được hiểu là 2 giai đoạn (Ghế -> Giường).
 * - Tối ưu hóa khả năng nhận khách đan xen (Zig-zag scheduling).
 * =================================================================================================
 */

const CONFIG = {
    MAX_CHAIRS: 6,        
    MAX_BEDS: 6,          
    MAX_TOTAL_GUESTS: 12, 
    
    OPEN_HOUR: 8,         
    CLEANUP_BUFFER: 5,    
    TRANSITION_BUFFER: 5, 
    
    TOLERANCE: 1, // Dung sai 1 phút        
    
    FUTURE_BUFFER: 5,     
    MAX_TIMELINE_MINS: 1440 
};

let SERVICES = {}; 

// ============================================================================
// PHẦN 1: QUẢN LÝ DỊCH VỤ (SERVICE MANAGEMENT)
// ============================================================================

function setDynamicServices(newServicesObj) {
    // Tên dịch vụ hệ thống chuyển sang Tiếng Trung
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
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
            h += 24; 
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
    // 1. Kiểm tra định dạng giờ (Tiếng Trung)
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "時間格式錯誤 (Invalid Time Format)" };
    
    // =================================================================
    // 2. CHUẨN HÓA BOOKINGS (FIXED LOGIC V3.2)
    // =================================================================
    let committedBookings = [];

    currentBookingsRaw.forEach(b => {
        const startMins = getMinsFromTimeStr(b.startTime);
        if (startMins === -1) return;

        // Xác định loại dịch vụ
        let rType = 'CHAIR'; // Mặc định
        let isCombo = false;
        let duration = b.duration || 60; // Mặc định 60 phút nếu thiếu dữ liệu
        
        // Kiểm tra logic loại dịch vụ dựa trên ServiceCode hoặc Tên
        if (SERVICES[b.serviceCode]) {
            if (SERVICES[b.serviceCode].type) rType = SERVICES[b.serviceCode].type;
            if (SERVICES[b.serviceCode].category === 'COMBO') isCombo = true;
        } else {
            // Fallback nếu không tìm thấy trong DB (Dựa vào tên)
            if (b.serviceName.includes('Combo') || b.serviceName.includes('套餐')) isCombo = true;
            else if (b.serviceName.includes('Body') || b.serviceName.includes('指壓') || b.serviceName.includes('油')) rType = 'BED';
            else rType = 'CHAIR'; // Foot mặc định là Chair
        }

        // --- FIX LOGIC TẠI ĐÂY: Xử lý tách Combo ---
        if (isCombo) {
            // Nếu là Combo, tách thành 2 khoảng thời gian
            // Giả định chuẩn: Giai đoạn 1 = CHAIR, Giai đoạn 2 = BED (FB mode)
            const halfDuration = Math.floor(duration / 2);
            
            // Giai đoạn 1: Ngồi Ghế (Từ đầu -> Giữa)
            committedBookings.push({
                start: startMins,
                end: startMins + halfDuration, // Hết giai đoạn 1
                resourceType: 'CHAIR',
                staffName: b.staffName
            });

            // Giai đoạn 2: Nằm Giường (Từ Giữa + Buffer -> Kết thúc)
            // Lưu ý: Thêm Buffer chuyển đổi vào để an toàn
            committedBookings.push({
                start: startMins + halfDuration + CONFIG.TRANSITION_BUFFER,
                end: startMins + duration, 
                resourceType: 'BED',
                staffName: b.staffName
            });
        } else {
            // Nếu là dịch vụ đơn (Single), giữ nguyên logic cũ
            committedBookings.push({
                start: startMins,
                end: startMins + duration,
                resourceType: rType,
                staffName: b.staffName
            });
        }
    });

    // 3. Safety Gate (Full House Check)
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
        return { feasible: false, reason: "目前預約已滿 (Full House - Max 12 Guests)" };
    }

    let singleGuests = [];
    let comboGuests = [];

    for (let i = 0; i < guestList.length; i++) {
        const g = guestList[i];
        const svc = SERVICES[g.serviceCode];
        if (!svc) return { feasible: false, reason: `未知服務項目 (Unknown Service): ${g.serviceCode}` };

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

    // --- BƯỚC 1: XẾP KHÁCH LẺ (SINGLE) ---
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; 
        const allCurrent = [...committedBookings, ...tentativeBookings];
        
        // Kiểm tra tài nguyên
        if (!checkResourceCapacity(guest.type, start, end, allCurrent)) {
            const resName = guest.type === 'BED' ? '指壓床 (Bed)' : '按摩椅 (Chair)';
            return { feasible: false, reason: `${resName} 已滿 (Resource Full)` };
        }

        // Kiểm tra nhân viên
        const assignedStaff = findAvailableStaff(guest.staffReq, start, end, staffList, allCurrent);
        if (!assignedStaff) return { feasible: false, reason: `該時段無可用技師 (No Staff Available): ${timeStr}` };

        tentativeBookings.push({ start: start, end: end, resourceType: guest.type, staffName: assignedStaff });
        finalDetails[guest.id] = {
            guestIndex: guest.id, staff: assignedStaff, service: guest.serviceName, price: guest.price,
            timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
        };
    }

    if (comboGuests.length === 0) return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((s, x) => s + x.price, 0) };

    // --- BƯỚC 2: XẾP KHÁCH COMBO (SMART BALANCE) ---
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

    let successScenario = null;
    successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }))); 
    if (!successScenario) successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }))); 
    
    // Smart Balance
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
        return { feasible: false, reason: "無法安排：資源不足或技師忙碌 (Cannot Arrange: Resources Full or Staff Busy)" };
    }
}

// ============================================================================
// PHẦN 5: UNIVERSAL EXPORT
// ============================================================================
const CoreAPI = {
    checkRequestAvailability,
    setDynamicServices,
    get SERVICES() { return SERVICES; },
    CONFIG,
    getMinsFromTimeStr,
    getTaipeiNow
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreAPI;
}

if (typeof window !== 'undefined') {
    window.ResourceCore = CoreAPI;
    window.checkRequestAvailability = CoreAPI.checkRequestAvailability;
    window.setDynamicServices = CoreAPI.setDynamicServices;
    console.log("✅ Resource Core V3.2 (ZH-TW): Loaded successfully with SMART COMBO SPLITTING.");
}
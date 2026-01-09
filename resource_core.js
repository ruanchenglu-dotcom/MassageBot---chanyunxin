/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V4.1 (FIX: ANTI-DOPPELGANGER - CHỐNG NHÂN ĐÔI KHÁCH)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/10
 * * * * * CẬP NHẬT MỚI (V4.1):
 * 1. [FIX DOUBLE COUNTING]: Khắc phục lỗi hệ thống hiểu lầm 1 khách Combo (có 2 block Chân/Body)
 * thành 2 khách riêng biệt, gây báo ảo "Hết chỗ" dù thực tế còn trống.
 * 2. [SMART DEDUPLICATION]: Tự động nhận diện và gộp các block rời rạc của cùng 1 nhân viên.
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION)
// ============================================================================

const CONFIG = {
    // Tài nguyên phần cứng
    MAX_CHAIRS: 6,        
    MAX_BEDS: 6,          
    MAX_TOTAL_GUESTS: 12, 
    
    // Cấu hình thời gian (Đơn vị: Giờ)
    OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
    
    // Bộ đệm thời gian (Đơn vị: Phút)
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi khách
    TRANSITION_BUFFER: 5, // Thời gian khách di chuyển giữa 2 dịch vụ (Combo)
    
    // Dung sai cho phép (Tránh lỗi làm tròn số học)
    TOLERANCE: 1,         
    
    // Giới hạn lịch trình
    MAX_TIMELINE_MINS: 1440 // 24 giờ * 60 phút
};

// Cơ sở dữ liệu dịch vụ
let SERVICES = {}; 

/**
 * Cập nhật danh sách dịch vụ từ bên ngoài (Backend/Sheet)
 */
function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE V4.1] Services Database Updated: ${Object.keys(SERVICES).length} entries.`);
}

// ============================================================================
// PHẦN 2: BỘ CÔNG CỤ XỬ LÝ THỜI GIAN (TIME UTILITIES)
// ============================================================================

function getTaipeiNow() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8)); // UTC+8
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
        if (h < CONFIG.OPEN_HOUR) h += 24; 
        return (h * 60) + m;
    } catch (e) {
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
// PHẦN 3: LOGIC KIỂM TRA TÀI NGUYÊN (CAPACITY CHECK)
// ============================================================================

/**
 * Kiểm tra sức chứa Tài Nguyên sử dụng thuật toán Quét Đường (Line Sweep)
 */
function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; 

    // Lọc ra các booking có liên quan đến khung giờ này
    let relevantBookings = bookings.filter(bk => {
        let isTypeMatch = (resourceType === 'TOTAL') ? true : (bk.resourceType === resourceType);
        return isTypeMatch && isOverlap(start, end, bk.start, bk.end);
    });

    if (relevantBookings.length === 0) return true;

    // Tạo các điểm sự kiện (Vào/Ra)
    let points = [];
    points.push({ time: start, type: 'check_start' });
    points.push({ time: end, type: 'check_end' });

    relevantBookings.forEach(bk => {
        points.push({ time: bk.start, type: 'start' });
        points.push({ time: bk.end, type: 'end' });
    });

    // Sắp xếp: Thời gian tăng dần
    points.sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        const priority = { 'start': 1, 'check_start': 2, 'check_end': 3, 'end': 4 };
        return priority[a.type] - priority[b.type];
    });

    let currentLoad = 0;
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else if (p.type === 'end') currentLoad--;
        
        if (p.time >= start && p.time < end) {
             if (currentLoad > limit) return false;
        }
    }
    return true; 
}

// ============================================================================
// PHẦN 4: LOGIC TÌM NHÂN VIÊN (STAFF FINDER)
// ============================================================================

function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo || staffInfo.off) return false; 
        
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        if (shiftStart === -1 || shiftEnd === -1) return false; 

        // Rule: Thời gian khách đặt phải nằm trong ca làm việc
        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
        
        const isStrict = staffInfo.isStrictTime === true;
        if (isStrict) {
            if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
        } else {
            if (start > shiftEnd) return false;
        }

        // Rule: Không trùng lịch bận
        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

        if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
        if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;

        return true; 
    };

    if (staffReq && staffReq !== 'RANDOM' && staffReq !== 'MALE' && staffReq !== 'FEMALE' && staffReq !== '隨機' && staffReq !== 'Any') {
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
// PHẦN 5: BỘ XỬ LÝ TRUNG TÂM - GLOBAL OPTIMIZER (MAIN LOGIC)
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ========================================================================
    // BƯỚC A: PHÂN LOẠI & TIỀN XỬ LÝ DỮ LIỆU (FIXED DOUBLE COUNTING)
    // ========================================================================
    
    let hardBookings = [];
    let flexibleIntentions = [];
    
    // Set này dùng để ghi nhớ Staff nào đã được tính là "Flexible" rồi.
    // Nếu gặp block thứ 2 của cùng Staff đó trong khoảng thời gian liền kề, ta sẽ bỏ qua
    // để tránh tính nhân đôi tài nguyên.
    let processedFlexibleStaff = new Set();

    // Sắp xếp booking cũ theo giờ để xử lý thứ tự chuẩn
    let sortedBookings = [...currentBookingsRaw].sort((a,b) => getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime));

    sortedBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO';
        // Fallback nhận diện qua tên
        if (!svcInfo.category && (b.serviceName.includes('Combo') || b.serviceName.includes('套餐'))) isCombo = true;

        let duration = b.duration || 60;
        
        // LOGIC THÔNG MINH MỚI:
        // Chỉ coi là Flexible nếu:
        // 1. Là Combo
        // 2. Bắt đầu cùng lúc hoặc sau request (để có thể đảo)
        // 3. Nhân viên này chưa được xử lý Flexible trước đó (TRÁNH TRÙNG LẶP BLOCK)
        if (isCombo && bStart >= requestStartMins) {
             if (processedFlexibleStaff.has(b.staffName)) {
                 // Đã xử lý staff này rồi -> Đây là block "đuôi" của combo (ví dụ phần Body sau phần Chân)
                 // Bỏ qua block này vì block đầu đã đại diện cho cả quy trình.
                 return; 
             }
             
             flexibleIntentions.push({
                 source: 'OLD',
                 staffName: b.staffName,
                 start: bStart,
                 duration: svcInfo.duration || 90, // Quan trọng: Lấy tổng thời gian gốc của dịch vụ
                 price: 0,
                 serviceName: b.serviceName
             });
             
             // Đánh dấu staff này đã "vào nồi" tính toán
             processedFlexibleStaff.add(b.staffName);

        } else {
            // Đây là Hard Booking (Khách lẻ hoặc Combo đã lỡ làm một nửa)
            // Với Hard Booking, ta tôn trọng dữ liệu thô: nó chiếm cái gì thì block cái đó.
            // Không tự ý chia đôi nữa vì dữ liệu đầu vào có thể đã chia sẵn rồi.
            
            let rType = svcInfo.type || 'CHAIR'; 
            // Nếu không có type chuẩn, đoán qua tên
            if (b.serviceName.includes('Body') || b.serviceName.includes('指壓') || b.serviceName.includes('油')) rType = 'BED';
            
            // Nếu dữ liệu gốc là Combo nhưng đã quá giờ, nó sẽ vào đây.
            // Lúc này block b chỉ là 1 phần (ví dụ 45p), ta add đúng 45p đó.
            hardBookings.push({ 
                start: bStart, 
                end: bStart + duration, 
                resourceType: rType, 
                staffName: b.staffName 
            });
        }
    });

    // --- Xử lý Khách Mới (Request) ---
    let newSingleGuests = [];
    let newComboGuests = [];

    guestList.forEach((g, index) => {
        const svc = SERVICES[g.serviceCode];
        if (!svc) return; 
        
        const guestObj = {
            id: index,
            staffReq: g.staffName,
            serviceName: svc.name,
            duration: svc.duration,
            price: svc.price,
            type: svc.type,
            category: svc.category
        };

        if (svc.category === 'COMBO') {
            flexibleIntentions.push({
                source: 'NEW',
                guestRef: guestObj,
                start: requestStartMins,
                duration: svc.duration,
                staffReq: g.staffName
            });
            newComboGuests.push(guestObj);
        } else {
            newSingleGuests.push(guestObj);
        }
    });

    // ========================================================================
    // BƯỚC B: XẾP KHÁCH MỚI LẺ (SINGLE) TRƯỚC
    // ========================================================================
    
    let tentativeHardBookings = [...hardBookings];
    let finalDetails = new Array(guestList.length);

    for (const g of newSingleGuests) {
        const start = requestStartMins;
        const end = start + g.duration + CONFIG.CLEANUP_BUFFER;
        
        if (!checkResourceCapacity(g.type, start, end, tentativeHardBookings)) {
             return { feasible: false, reason: `資源不足 (Resource Full): ${g.type}` };
        }

        // Khi tìm Staff cho khách lẻ, cần né cả lịch dự kiến của khách Combo (Flexible)
        let allBusyStaffRanges = [...tentativeHardBookings];
        flexibleIntentions.forEach(f => {
            if (f.source === 'OLD') {
                // Với khách OLD Flexible, họ chắc chắn chiếm dụng nhân viên đó trong khoảng thời gian đó
                allBusyStaffRanges.push({ start: f.start, end: f.start + f.duration, staffName: f.staffName });
            }
        });

        const staff = findAvailableStaff(g.staffReq, start, end, staffList, allBusyStaffRanges);
        if (!staff) return { feasible: false, reason: `無可用技師 (No Staff): ${g.staffReq || 'Random'}` };

        tentativeHardBookings.push({ start: start, end: end, resourceType: g.type, staffName: staff });
        
        finalDetails[g.id] = {
            guestIndex: g.id, staff: staff, service: g.serviceName, price: g.price, 
            timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
        };
    }

    // Nếu không có Combo nào cần tính -> Return luôn
    if (flexibleIntentions.length === 0) {
         if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins+1, tentativeHardBookings))
            return { feasible: false, reason: "Full House (12 Guests)" };
         return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((a,b)=>a+(b?b.price:0),0) };
    }

    // ========================================================================
    // BƯỚC C: GIẢ LẬP ĐA VŨ TRỤ (MULTIVERSE SIMULATION)
    // ========================================================================

    const scenarios = ['ALL_FB', 'ALL_BF', 'BALANCE_A', 'BALANCE_B'];
    
    for (const scenName of scenarios) {
        let simulationBookings = JSON.parse(JSON.stringify(tentativeHardBookings)); 
        let scenarioValid = true;
        let scenarioDetails = []; 

        for (let i = 0; i < flexibleIntentions.length; i++) {
            const item = flexibleIntentions[i];
            const half = Math.floor(item.duration / 2);
            
            let mode = 'FB';
            if (scenName === 'ALL_FB') mode = 'FB';
            else if (scenName === 'ALL_BF') mode = 'BF';
            else if (scenName === 'BALANCE_A') mode = (i % 2 === 0) ? 'FB' : 'BF';
            else if (scenName === 'BALANCE_B') mode = (i % 2 === 0) ? 'BF' : 'FB';

            const p1Res = (mode === 'FB') ? 'CHAIR' : 'BED';
            const p2Res = (mode === 'FB') ? 'BED' : 'CHAIR';
            
            const tStart = item.start;
            const p1End = tStart + half;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            const p2End = p2Start + half;
            const fullEnd = p2End + CONFIG.CLEANUP_BUFFER;

            // Check P1
            if (!checkResourceCapacity(p1Res, tStart, p1End + CONFIG.CLEANUP_BUFFER, simulationBookings)) {
                scenarioValid = false; break;
            }
            // Push Placeholder P1
            simulationBookings.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: 'TEMP' });

            // Check P2
            if (!checkResourceCapacity(p2Res, p2Start, fullEnd, simulationBookings)) {
                scenarioValid = false; break;
            }

            let assignedStaff = item.staffName; 
            if (item.source === 'NEW') {
                // Với khách mới, cần tìm staff thực sự rảnh
                // simulationBookings lúc này đã chứa các booking cứng + booking của khách combo trước trong vòng lặp
                assignedStaff = findAvailableStaff(item.staffReq, tStart, fullEnd, staffList, simulationBookings);
                if (!assignedStaff) {
                    scenarioValid = false; break;
                }
                scenarioDetails.push({
                    guestIndex: item.guestRef.id,
                    staff: assignedStaff,
                    service: item.guestRef.serviceName,
                    price: item.guestRef.price,
                    mode: mode, 
                    timeStr: `${timeStr} - ${getTimeStrFromMins(p2End)}`
                });
            }

            // Push Booking thật vào simulation để chiếm chỗ cho vòng lặp tiếp theo
            simulationBookings.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: assignedStaff });
            simulationBookings.push({ start: p2Start, end: fullEnd, resourceType: p2Res, staffName: assignedStaff });
        }

        // Check tổng Total Guests
        if (scenarioValid) {
             if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins+1, simulationBookings)) {
                 scenarioValid = false;
             }
        }

        if (scenarioValid) {
            scenarioDetails.forEach(d => { finalDetails[d.guestIndex] = d; });
            const cleanDetails = finalDetails.filter(d => d);
            
            return {
                feasible: true,
                strategy: scenName,
                details: cleanDetails,
                totalPrice: cleanDetails.reduce((sum, item) => sum + item.price, 0)
            };
        }
    }

    return { feasible: false, reason: "Hết giường/ghế dù đã thử đảo lịch (All Configurations Failed)" };
}

// ============================================================================
// PHẦN 6: MODULE EXPORT
// ============================================================================
const CoreAPI = {
    checkRequestAvailability,
    setDynamicServices,
    get SERVICES() { return SERVICES; },
    CONFIG,
    getMinsFromTimeStr,
    getTimeStrFromMins,
    getTaipeiNow
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreAPI;
}
if (typeof window !== 'undefined') {
    window.ResourceCore = CoreAPI;
    window.checkRequestAvailability = CoreAPI.checkRequestAvailability;
    window.setDynamicServices = CoreAPI.setDynamicServices;
    console.log("✅ Resource Core V4.1 (Anti-Doppelganger Fix): Loaded.");
}
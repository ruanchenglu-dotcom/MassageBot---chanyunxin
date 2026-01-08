/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: SUPER LOGIC V2.7 (BOUNDARY FIX: 10:00 AM ISSUE)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/09
 * * MÔ TẢ CHI TIẾT:
 * Đây là trái tim xử lý logic của hệ thống. Nó chịu trách nhiệm:
 * 1. Đọc hiểu cấu hình dịch vụ và tài nguyên (Ghế/Giường).
 * 2. [FIXED] Chuẩn hóa thời gian cực gắt (Loại bỏ hoàn toàn giây, làm tròn phút).
 * 3. [FIXED] Logic so sánh giờ vào ca có dung sai (Tolerance) để nhận khách lúc giao ca (10:00).
 * 4. [FEATURE] SMART BALANCE: Thuật toán tự động cân bằng tải giữa Ghế và Giường (12 khách).
 * 5. Kiểm tra tính khả thi khi nhận khách (Availability Check).
 * =================================================================================================
 */

// [LƯU Ý KỸ THUẬT]
// Không sử dụng thư viện bên ngoài (moment.js) để đảm bảo tốc độ.
// Sử dụng Native Javascript Date & Math.

const CONFIG = {
    MAX_CHAIRS: 6,        // Tối đa 6 ghế Foot Massage
    MAX_BEDS: 6,          // Tối đa 6 giường Body Massage
    MAX_TOTAL_GUESTS: 12, // Tổng dung lượng tối đa (Full House)
    
    // --- CẤU HÌNH THỜI GIAN (TIME SETTINGS) ---
    OPEN_HOUR: 8,         // Giờ mở cửa (dùng để xác định mốc qua đêm)
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi ca (5 phút)
    TRANSITION_BUFFER: 5, // Thời gian khách di chuyển giữa 2 phase của Combo (5 phút)
    
    // [QUAN TRỌNG] ĐỘ DUNG SAI (TOLERANCE)
    // Cho phép chênh lệch 1 phút khi so sánh giờ vào ca.
    // Giúp xử lý trường hợp Excel có giây lẻ (VD: 10:00:30) hoặc khách đặt sát giờ.
    TOLERANCE: 1,         
    
    FUTURE_BUFFER: 5,     // Khách phải đặt trước ít nhất 5 phút so với hiện tại
    MAX_TIMELINE_MINS: 1440 // Giới hạn timeline trong 24h
};

// Biến lưu trữ danh sách dịch vụ (sẽ được sync từ Sheet Menu)
let SERVICES = {}; 

// ============================================================================
// PHẦN 1: QUẢN LÝ DỊCH VỤ & KHỞI TẠO (SERVICE MANAGEMENT)
// ============================================================================

/**
 * Cập nhật danh sách dịch vụ động từ bên ngoài (Index.js gọi vào).
 * Tự động thêm các dịch vụ hệ thống (Nghỉ, Ăn, Đóng cửa).
 */
function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ LATE', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    // Merge dịch vụ mới vào danh sách hiện tại
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE KERNEL] Services Database Updated: ${Object.keys(SERVICES).length} entries active.`);
}

// ============================================================================
// PHẦN 2: CÁC HÀM HỖ TRỢ XỬ LÝ THỜI GIAN (TIME HELPERS - CRITICAL FIX)
// ============================================================================

/**
 * Lấy thời gian hiện tại theo múi giờ Đài Loan (UTC+8)
 * Sử dụng phép tính Offset thủ công để chính xác trên mọi môi trường Server.
 */
function getTaipeiNow() {
    const d = new Date();
    // 1. Lấy thời gian UTC chuẩn (ms)
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    // 2. Cộng thêm 8 giờ cho Taiwan (3600000ms * 8)
    const taipeiOffset = 8;
    return new Date(utc + (3600000 * taipeiOffset));
}

/**
 * [HÀM QUAN TRỌNG NHẤT - FIX LỖI 8H/10H SÁNG]
 * Chuyển đổi chuỗi giờ "HH:mm" thành số phút (Integer).
 * - Tự động cắt bỏ giây (Seconds) để tránh lỗi so sánh lẻ.
 * - Xử lý giờ qua đêm (01:00 -> 25:00).
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; // Trả về -1 nếu dữ liệu lỗi
    
    try {
        // 1. Chuẩn hóa chuỗi: Xóa space, fix dấu hai chấm to
        let cleanStr = timeStr.toString().trim().replace(/：/g, ':');
        
        // [FIX] Nếu chuỗi dài (VD: 10:00:00), chỉ lấy 5 ký tự đầu (10:00) để loại bỏ giây
        // Tuy nhiên cách an toàn nhất là split và chỉ lấy 2 phần tử đầu
        const parts = cleanStr.split(':');
        if (parts.length < 2) return -1;

        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);

        // 3. Kiểm tra tính hợp lệ
        if (isNaN(h) || isNaN(m)) return -1;

        // 4. Logic qua đêm (Overnight Logic)
        // Nếu giờ nhỏ hơn giờ mở cửa (8h), hệ thống hiểu là rạng sáng hôm sau
        // Ví dụ: Làm đến 02:00 sáng -> 26:00
        if (h < CONFIG.OPEN_HOUR) {
            h += 24;
        }

        return (h * 60) + m;
    } catch (e) {
        console.error(`[TIME ERROR] Cannot parse time: ${timeStr}`, e);
        return -1;
    }
}

/**
 * Chuyển đổi ngược từ số phút sang chuỗi giờ hiển thị "HH:mm"
 */
function getTimeStrFromMins(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    
    // Hiển thị lại giờ chuẩn (trừ 24 nếu qua đêm)
    if (h >= 24) h -= 24; 
    
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Kiểm tra trùng lặp thời gian giữa 2 khoảng [startA, endA] và [startB, endB]
 * Có sử dụng độ dung sai (TOLERANCE) để bỏ qua các va chạm nhỏ.
 */
function isOverlap(startA, endA, startB, endB) {
    // Thu hẹp khoảng check bằng Tolerance
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    // Logic overlap chuẩn: StartA < EndB AND StartB < EndA
    return (startA < safeEndB) && (startB < safeEndA);
}

// ============================================================================
// PHẦN 3: KIỂM TRA TÀI NGUYÊN (RESOURCE CHECKING)
// ============================================================================

/**
 * Quét toàn bộ Booking hiện tại để xem Ghế/Giường/Tổng có bị quá tải không.
 */
function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; // Không cần check loại khác

    // Sweep Line Algorithm
    let points = [];
    
    for (const bk of bookings) {
        let isRelevant = false;
        if (resourceType === 'TOTAL') isRelevant = true; 
        else if (bk.resourceType === resourceType) isRelevant = true; 

        if (isRelevant) {
            if (isOverlap(start, end, bk.start, bk.end)) {
                let pStart = Math.max(start, bk.start);
                let pEnd = Math.min(end, bk.end);
                
                if (pEnd - pStart > CONFIG.TOLERANCE) {
                    points.push({ time: pStart, type: 'start' });
                    points.push({ time: pEnd, type: 'end' });
                }
            }
        }
    }

    if (points.length === 0) return true; 

    points.sort((a, b) => {
        if (a.time === b.time) return a.type === 'start' ? -1 : 1; 
        return a.time - b.time;
    });

    let currentLoad = 0;
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else currentLoad--;

        if (currentLoad >= limit) return false; // Quá tải
    }

    return true; // Đủ chỗ
}

/**
 * [QUAN TRỌNG] Tìm nhân viên phù hợp
 * Logic được nâng cấp với "Dung sai" (Tolerance) để xử lý lỗi biên 10:00 vs 10:00:05.
 */
function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo) return false; 
        
        if (staffInfo.off) return false; // Staff OFF

        // --- 1. KIỂM TRA CA LÀM VIỆC (SHIFT CHECK WITH TOLERANCE) ---
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        
        if (shiftStart === -1 || shiftEnd === -1) return false; 

        // [FIX CHÍNH] Thêm Tolerance vào phép so sánh
        // Logic cũ: if (start < shiftStart) return false; (Quá cứng nhắc)
        // Logic mới: Cho phép khách đến sớm hơn ca làm 1 phút (xử lý giây lẻ)
        // VD: Khách 10:00 (600), Ca 10:00 (600) => 601 < 600 (False -> Nhận)
        // VD: Khách 10:00 (600), Ca 10:01 (601) => 601 < 601 (False -> Nhận)
        // VD: Khách 10:00 (600), Ca 10:02 (602) => 601 < 602 (True -> Loại)
        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
        
        // Tương tự cho giờ về: Khách phải xong trước giờ về (hoặc lố 1 xíu cũng OK)
        if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 

        // --- 2. KIỂM TRA TRÙNG LỊCH (BUSY CHECK) ---
        for (const b of busyList) {
            if (b.staffName === name) {
                if (isOverlap(start, end, b.start, b.end)) return false; // Đụng lịch
            }
        }
        return true; 
    };

    // Nếu khách yêu cầu đích danh
    if (staffReq && staffReq !== 'Any' && staffReq !== 'RANDOM') {
        if (checkOneStaff(staffReq)) return staffReq;
        return null;
    } else {
        // Random
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

// ============================================================================
// PHẦN 4: LOGIC KIỂM TRA KHẢ THI (SUPER LOGIC V2.7)
// ============================================================================

/**
 * Hàm chính kiểm tra xem yêu cầu đặt lịch có khả thi không.
 * Áp dụng thuật toán "Smart Balance" cho đoàn khách lớn.
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    // 1. Chuyển giờ khách đặt sang số phút
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Lỗi định dạng giờ (Invalid Time Format)." };
    
    // 2. Chuẩn bị dữ liệu Booking cũ
    let committedBookings = currentBookingsRaw.map(b => {
        let rType = 'CHAIR'; 
        if (SERVICES[b.serviceCode] && SERVICES[b.serviceCode].type) {
            rType = SERVICES[b.serviceCode].type;
        }
        // Fallback nhận diện
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

    // BƯỚC 0: CHECK TỔNG QUÁT (Safety Gate)
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
        return { feasible: false, reason: "Tiệm đang quá tải (Max 12 khách)." };
    }

    // PHÂN LOẠI KHÁCH
    let singleGuests = [];
    let comboGuests = [];

    for (let i = 0; i < guestList.length; i++) {
        const g = guestList[i];
        const svc = SERVICES[g.serviceCode];
        if (!svc) return { feasible: false, reason: `Dịch vụ không tồn tại: ${g.serviceCode}` };

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

    // ========================================================================
    // BƯỚC 1: XẾP KHÁCH LẺ (PRIORITY 1)
    // ========================================================================
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; 
        const allCurrent = [...committedBookings, ...tentativeBookings];
        
        if (!checkResourceCapacity(guest.type, start, end, allCurrent)) {
            return { feasible: false, reason: `Hết ${guest.type === 'BED' ? 'Giường' : 'Ghế'} cho dịch vụ lẻ.` };
        }

        const assignedStaff = findAvailableStaff(guest.staffReq, start, end, staffList, allCurrent);
        if (!assignedStaff) {
            return { feasible: false, reason: `Không có nhân viên rảnh lúc ${timeStr} cho khách lẻ.` };
        }

        tentativeBookings.push({ start: start, end: end, resourceType: guest.type, staffName: assignedStaff });
        finalDetails[guest.id] = {
            guestIndex: guest.id, staff: assignedStaff, service: guest.serviceName, price: guest.price,
            timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
        };
    }

    if (comboGuests.length === 0) {
        return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((s, x) => s + x.price, 0) };
    }

    // ========================================================================
    // BƯỚC 2: XẾP KHÁCH COMBO (SMART BALANCE V2.5)
    // ========================================================================
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

            let phase1Res, phase2Res;
            if (item.mode === 'FB') { phase1Res = 'CHAIR'; phase2Res = 'BED'; } 
            else { phase1Res = 'BED'; phase2Res = 'CHAIR'; }

            let allBusy = [...committedBookings, ...scenarioBookings];

            // Check Resources
            if (!checkResourceCapacity(phase1Res, p1Start, p1BlockEnd, allBusy)) return null; 
            allBusy.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: 'TEMP' });
            if (!checkResourceCapacity(phase2Res, p2Start, p2BlockEnd, allBusy)) return null; 

            // Check Staff (Strict but Tolerant)
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

    // --- CÁC KỊCH BẢN THỬ NGHIỆM ---
    let successScenario = null;

    // A. Tất cả FB (Ưu tiên Ghế)
    successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'FB' })));

    // B. Tất cả BF (Ưu tiên Giường)
    if (!successScenario) {
        successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'BF' })));
    }

    // C. Cân bằng tải (Smart Balance) - Nửa nạc nửa mỡ
    if (!successScenario && comboGuests.length >= 2) {
        const splitConfig = [];
        const maxChairsForCombo = CONFIG.MAX_CHAIRS; 
        for (let i = 0; i < comboGuests.length; i++) {
            if (i < maxChairsForCombo) splitConfig.push({ guestId: comboGuests[i].id, mode: 'FB' });
            else splitConfig.push({ guestId: comboGuests[i].id, mode: 'BF' });
        }
        successScenario = tryScenario(splitConfig);
    }

    // D. Cân bằng tải ngược (Reverse Balance)
    if (!successScenario && comboGuests.length >= 2) {
        const splitConfig = [];
        const maxBedsForCombo = CONFIG.MAX_BEDS; 
        for (let i = 0; i < comboGuests.length; i++) {
            if (i < maxBedsForCombo) splitConfig.push({ guestId: comboGuests[i].id, mode: 'BF' });
            else splitConfig.push({ guestId: comboGuests[i].id, mode: 'FB' });
        }
        successScenario = tryScenario(splitConfig);
    }

    // E. Brute-force (Cho nhóm nhỏ < 6)
    if (!successScenario && comboGuests.length >= 2 && comboGuests.length < 6) {
        const count = comboGuests.length;
        const totalPermutations = 1 << count; 
        for (let i = 1; i < totalPermutations - 1; i++) {
            const bfConfig = [];
            for (let j = 0; j < count; j++) {
                const mode = ((i >> j) & 1) ? 'BF' : 'FB';
                bfConfig.push({ guestId: comboGuests[j].id, mode: mode });
            }
            successScenario = tryScenario(bfConfig);
            if (successScenario) break;
        }
    }

    if (successScenario) {
        successScenario.forEach(item => { finalDetails[item.guestIndex] = item; });
        return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0) };
    } else {
        return { feasible: false, reason: "Không thể sắp xếp: Hết Ghế/Giường hoặc Nhân viên không đủ." };
    }
}

// Export module
module.exports = {
    checkRequestAvailability,
    setDynamicServices,
    get SERVICES() { return SERVICES; },
    CONFIG,
    getMinsFromTimeStr,
    getTaipeiNow,
    isOverlap,
    checkResourceCapacity
};
/**
 * ============================================================================
 * FILE: resource_core.js
 * PHIÊN BẢN: SUPER LOGIC V2 (Smart Gap & Tolerance)
 * MÔ TẢ: Hệ thống kiểm tra tài nguyên thông minh với logic xếp chỗ đa tầng.
 * CẬP NHẬT: 
 * - Giảm Buffer dọn dẹp xuống 5 phút.
 * - Thêm Buffer chuyển tiếp 5 phút giữa 2 phases combo.
 * - Thêm cơ chế Tolerance (Dung sai) 1 phút cho phép trùng nhỏ.
 * ============================================================================
 */

const moment = require('moment-timezone'); 

const CONFIG = {
    MAX_CHAIRS: 6,        // Tối đa 6 ghế
    MAX_BEDS: 6,          // Tối đa 6 giường
    MAX_TOTAL_GUESTS: 12, // Tối đa 12 khách cùng lúc
    
    // --- CẤU HÌNH THỜI GIAN (UPDATED) ---
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau khi dùng xong (Giảm từ 10 -> 5)
    TRANSITION_BUFFER: 5, // Thời gian nghỉ/di chuyển giữa Phase 1 và Phase 2 của Combo
    TOLERANCE: 1,         // Độ dung sai (phút). Cho phép trùng 1 phút vẫn tính là OK.
    
    FUTURE_BUFFER: 5,     // Đặt trước ít nhất 5 phút
    MAX_TIMELINE_MINS: 1440 
};

// Biến lưu trữ dịch vụ toàn cục
let SERVICES = {}; 

// ============================================================================
// PHẦN 1: QUẢN LÝ DỊCH VỤ & KHỞI TẠO
// ============================================================================

function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE V2] Updated Services List: ${Object.keys(SERVICES).length} items loaded.`);
}

// ============================================================================
// PHẦN 2: CÁC HÀM HỖ TRỢ (HELPER FUNCTIONS)
// ============================================================================

function getTaipeiNow() {
    return moment().tz("Asia/Taipei");
}

function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function getTimeStrFromMins(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    if (h >= 24) h -= 24; // Handle qua ngày
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Kiểm tra trùng lặp thời gian với ĐỘ DUNG SAI (Tolerance)
 * Logic cũ: (StartA < EndB) && (StartB < EndA)
 * Logic mới: Thu hẹp khoảng check bằng Tolerance để cho phép "chạm nhẹ"
 */
function isOverlap(startA, endA, startB, endB) {
    // Giảm biên End đi một chút (Tolerance) để nếu chỉ trùng 1 phút thì coi như không trùng
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    
    // Nếu start >= safeEnd, nghĩa là nó bắt đầu ngay lúc thằng kia vừa dứt (hoặc lấn 1p), return false (không trùng)
    return (startA < safeEndB) && (startB < safeEndA);
}

/**
 * Kiểm tra xem tài nguyên (Giường/Ghế/Tổng) có bị quá tải không
 * @param {string} resourceType 'BED', 'CHAIR', 'TOTAL'
 * @param {number} start kiểm tra từ phút này
 * @param {number} end đến phút này
 * @param {Array} bookings danh sách tất cả booking đang có
 */
function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; // Type NONE không check

    // Tạo mảng các điểm thời gian (events) để quét timeline
    let points = [];
    
    for (const bk of bookings) {
        let isRelevant = false;
        if (resourceType === 'TOTAL') isRelevant = true; // Check tổng khách
        else if (bk.resourceType === resourceType) isRelevant = true; // Check đúng loại ghế/giường

        if (isRelevant) {
            // Kiểm tra overlap có tính Tolerance
            if (isOverlap(start, end, bk.start, bk.end)) {
                // Xác định vùng giao thoa thực tế để tính tải trọng
                let pStart = Math.max(start, bk.start);
                let pEnd = Math.min(end, bk.end);
                
                // Nếu sau khi tính max/min mà vùng giao thoa < Tolerance -> Bỏ qua
                if (pEnd - pStart > CONFIG.TOLERANCE) {
                    points.push({ time: pStart, type: 'start' });
                    points.push({ time: pEnd, type: 'end' });
                }
            }
        }
    }

    if (points.length === 0) return true; // Không có ai tranh chấp

    // Sắp xếp timeline: Start tính trước End nếu cùng thời điểm
    points.sort((a, b) => {
        if (a.time === b.time) {
            return a.type === 'start' ? -1 : 1; 
        }
        return a.time - b.time;
    });

    let currentLoad = 0;
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else currentLoad--;

        if (currentLoad >= limit) return false; // Quá tải tại thời điểm này
    }

    return true; // Đủ chỗ
}

/**
 * Tìm nhân viên phù hợp
 * @param {string} staffReq Tên chỉ định hoặc 'Any'
 * @param {number} start
 * @param {number} end
 * @param {Object} staffListRef Dữ liệu gốc nhân viên
 * @param {Array} busyList Danh sách bận (DB + booking tạm)
 */
function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo) return false;
        if (staffInfo.off) return false; // Nghỉ phép

        // 1. Check Ca làm việc
        const shiftStart = getMinsFromTimeStr(staffInfo.start);
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);
        
        if (start < shiftStart) return false;
        if (end > shiftEnd) return false; 

        // 2. Check Trùng lịch (Busy)
        for (const b of busyList) {
            if (b.staffName === name) {
                if (isOverlap(start, end, b.start, b.end)) return false;
            }
        }
        return true;
    };

    if (staffReq && staffReq !== 'Any') {
        if (checkOneStaff(staffReq)) return staffReq;
        return null;
    } else {
        // Random: Tìm người rảnh
        const allStaffNames = Object.keys(staffListRef);
        // Có thể thêm logic ưu tiên nhân viên ít việc, nhưng ở đây lấy first match
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

// ============================================================================
// PHẦN 3: LOGIC KIỂM TRA KHẢ THI (SUPER LOGIC V2)
// ============================================================================

/**
 * Hàm chính kiểm tra booking
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    // --- CHUẨN BỊ DỮ LIỆU ---
    const requestStartMins = getMinsFromTimeStr(timeStr);
    
    // Convert DB bookings -> Minutes format
    let committedBookings = currentBookingsRaw.map(b => {
        let rType = 'CHAIR'; 
        if (SERVICES[b.serviceCode] && SERVICES[b.serviceCode].type) {
            rType = SERVICES[b.serviceCode].type;
        }
        return {
            start: getMinsFromTimeStr(b.startTime),
            end: getMinsFromTimeStr(b.endTime), 
            resourceType: rType,
            staffName: b.staffName
        };
    });

    // --- BƯỚC 0: CHECK TỔNG QUÁT ---
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
        return { feasible: false, reason: "Tiệm đang quá tải (Max 12 khách)." };
    }

    // --- PHÂN LOẠI KHÁCH ---
    let singleGuests = [];
    let comboGuests = [];

    for (let i = 0; i < guestList.length; i++) {
        const g = guestList[i];
        const svc = SERVICES[g.serviceCode];
        if (!svc) return { feasible: false, reason: `Dịch vụ lỗi: ${g.serviceCode}` };

        const guestData = {
            id: i,
            serviceCode: g.serviceCode,
            serviceName: svc.name,
            staffReq: g.staffName,
            price: svc.price,
            duration: svc.duration,
            type: svc.type // 'BED', 'CHAIR', 'COMBO'
        };

        if (svc.type === 'COMBO') comboGuests.push(guestData);
        else singleGuests.push(guestData);
    }

    let tentativeBookings = []; 
    let finalDetails = new Array(guestList.length);

    // ========================================================================
    // BƯỚC 1: XẾP KHÁCH LẺ (SINGLE SERVICES)
    // ========================================================================
    
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; // +5p dọn dẹp
        
        const allCurrent = [...committedBookings, ...tentativeBookings];
        
        // 1.1 Check Resource
        if (!checkResourceCapacity(guest.type, start, end, allCurrent)) {
            return { feasible: false, reason: `Hết ${guest.type === 'BED' ? 'Giường' : 'Ghế'} cho khách lẻ.` };
        }

        // 1.2 Check Staff
        const assignedStaff = findAvailableStaff(guest.staffReq, start, end, staffList, allCurrent);
        if (!assignedStaff) {
            return { feasible: false, reason: `Không có nhân viên cho ${guest.serviceName}.` };
        }

        tentativeBookings.push({
            start: start, end: end, resourceType: guest.type, staffName: assignedStaff
        });

        finalDetails[guest.id] = {
            guestIndex: guest.id,
            staff: assignedStaff,
            service: guest.serviceName,
            price: guest.price,
            timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
        };
    }

    if (comboGuests.length === 0) {
        return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((s, x) => s + x.price, 0) };
    }

    // ========================================================================
    // BƯỚC 2: XẾP KHÁCH COMBO (LOGIC THÔNG MINH V2)
    // ========================================================================
    // Logic mới: Thêm 5 phút nghỉ (Transition Buffer) giữa Phase 1 và Phase 2.
    // Việc này giúp "né" được thời gian dọn dẹp của khách trước đó.

    const tryScenario = (scenarioConfig) => {
        let scenarioBookings = JSON.parse(JSON.stringify(tentativeBookings)); 
        let scenarioDetails = []; 

        for (const item of scenarioConfig) {
            const guest = comboGuests.find(g => g.id === item.guestId);
            const halfDuration = Math.floor(guest.duration / 2);
            
            // --- TÍNH TOÁN THỜI GIAN CÁC PHASE ---
            // Phase 1: Bắt đầu từ requestStart
            const p1Start = requestStartMins;
            const p1End = p1Start + halfDuration; 
            
            // Phase 2: Bắt đầu = p1End + TRANSITION_BUFFER (5 phút)
            // Đây là chìa khóa để giải quyết Deadlock!
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            const p2End = p2Start + halfDuration;
            
            // Tổng thời gian nhân viên bận: Từ lúc bắt đầu làm đến lúc xong hẳn
            const staffEnd = p2End; 

            // Xác định loại tài nguyên
            let phase1Res, phase2Res;
            if (item.mode === 'FB') { // Foot -> Body
                phase1Res = 'CHAIR';
                phase2Res = 'BED';
            } else { // BF: Body -> Foot
                phase1Res = 'BED';
                phase2Res = 'CHAIR';
            }

            // --- CHECK RESOURCE PHASE 1 ---
            // Thời gian chiếm dụng = p1Start -> p1End + CLEANUP_BUFFER (5p)
            // Lưu ý: TRANSITION_BUFFER (5p) đã bao gồm thời gian dọn dẹp Phase 1 hoặc khách di chuyển
            // Ta block tài nguyên Phase 1 thêm 5p để dọn.
            const p1BlockEnd = p1End + CONFIG.CLEANUP_BUFFER;
            
            let allBusy = [...committedBookings, ...scenarioBookings];
            if (!checkResourceCapacity(phase1Res, p1Start, p1BlockEnd, allBusy)) return null;

            // --- CHECK RESOURCE PHASE 2 ---
            // Thời gian chiếm dụng = p2Start -> p2End + CLEANUP_BUFFER (5p)
            const p2BlockEnd = p2End + CONFIG.CLEANUP_BUFFER;
            
            // Cập nhật booking ảo của phase 1 để check phase 2
            // (Thực ra phase 1 và 2 khác loại tài nguyên nên ít ảnh hưởng nhau, 
            // nhưng cần thêm vào để tính tải TOTAL nếu cần)
            allBusy.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: 'TEMP' });

            if (!checkResourceCapacity(phase2Res, p2Start, p2BlockEnd, allBusy)) return null;

            // --- CHECK NHÂN VIÊN (TOÀN TUYẾN) ---
            // Nhân viên bận liên tục từ p1Start -> staffEnd (bao gồm cả lúc khách nghỉ 5p)
            const staff = findAvailableStaff(guest.staffReq, p1Start, staffEnd, staffList, [...committedBookings, ...scenarioBookings]);
            
            if (!staff) return null; 

            // --- THÀNH CÔNG KHÁCH NÀY -> LƯU TẠM ---
            scenarioBookings.push({
                start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: staff
            });
            scenarioBookings.push({
                start: p2Start, end: p2BlockEnd, resourceType: phase2Res, staffName: staff
            });

            scenarioDetails.push({
                guestIndex: guest.id,
                staff: staff,
                service: guest.serviceName,
                price: guest.price,
                mode: item.mode, 
                // Hiển thị giờ kết thúc (không tính thời gian dọn cuối cùng)
                timeStr: `${timeStr} - ${getTimeStrFromMins(p2End)}`
            });
        }

        return scenarioDetails;
    };

    // --- CHIẾN LƯỢC THỬ NGHIỆM ---

    let successScenario = null;

    // 1. Ưu tiên FB (Truyền thống)
    const scenarioFB = comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }));
    successScenario = tryScenario(scenarioFB);

    // 2. Nếu kẹt, thử BF (Đảo ngược quy trình)
    if (!successScenario) {
        const scenarioBF = comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }));
        successScenario = tryScenario(scenarioBF);
    }

    // 3. Nếu vẫn kẹt và có nhiều khách -> Thử Tách Nhóm (Brute-force)
    if (!successScenario && comboGuests.length >= 2) {
        const count = comboGuests.length;
        // Giới hạn thử tối đa 16 trường hợp (4 bit) để hiệu năng cao
        const totalPermutations = Math.min(1 << count, 16); 

        for (let i = 1; i < totalPermutations - 1; i++) {
            const splitConfig = [];
            for (let j = 0; j < count; j++) {
                const mode = ((i >> j) & 1) ? 'BF' : 'FB';
                splitConfig.push({ guestId: comboGuests[j].id, mode: mode });
            }
            successScenario = tryScenario(splitConfig);
            if (successScenario) break;
        }
    }

    // --- TỔNG KẾT ---
    if (successScenario) {
        successScenario.forEach(item => {
            finalDetails[item.guestIndex] = item;
        });
        
        return {
            feasible: true,
            details: finalDetails,
            totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0)
        };
    } else {
        return { 
            feasible: false, 
            reason: "Rất tiếc, đã thử đảo tua (Làm Body trước) và tách nhóm nhưng vẫn kẹt thời gian với khách khác." 
        };
    }
}

module.exports = {
    checkRequestAvailability,
    setDynamicServices,
    get SERVICES() { return SERVICES; },
    CONFIG,
    getMinsFromTimeStr,
    getTaipeiNow
};
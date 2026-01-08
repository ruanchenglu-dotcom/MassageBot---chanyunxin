/**
 * ============================================================================
 * FILE: resource_core.js
 * PHIÊN BẢN: SUPER LOGIC V2.3 (FIXED STAFF CLEANUP)
 * MÔ TẢ: Hệ thống kiểm tra tài nguyên thông minh (Chạy bằng JS thuần).
 * ƯU ĐIỂM: Không cần cài đặt moment-timezone, không lo lỗi deploy.
 * ============================================================================
 */

// [QUAN TRỌNG] Không require 'moment' hay 'moment-timezone' ở đây nữa để tránh lỗi.

const CONFIG = {
    MAX_CHAIRS: 6,        // Tối đa 6 ghế
    MAX_BEDS: 6,          // Tối đa 6 giường
    MAX_TOTAL_GUESTS: 12, // Tối đa 12 khách cùng lúc
    
    // --- CẤU HÌNH THỜI GIAN (LOGIC MỚI) ---
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp (5 phút)
    TRANSITION_BUFFER: 5, // Thời gian nghỉ chuyển tiếp giữa 2 phase của Combo (5 phút)
    TOLERANCE: 1,         // Độ dung sai (1 phút) cho phép trùng lặp nhỏ
    
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
    console.log(`[CORE V2] Services Updated: ${Object.keys(SERVICES).length} services loaded.`);
}

// ============================================================================
// PHẦN 2: CÁC HÀM HỖ TRỢ (HELPER FUNCTIONS - NATIVE JS)
// ============================================================================

/**
 * [FIX] Hàm lấy giờ hiện tại của Đài Loan (UTC+8) bằng Javascript thuần.
 * Thay thế hoàn toàn cho moment().tz("Asia/Taipei")
 */
function getTaipeiNow() {
    const d = new Date();
    // 1. Lấy thời gian UTC (tính bằng ms)
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    // 2. Cộng thêm 8 giờ (3600000ms * 8) để ra giờ Đài Loan
    const taipeiOffset = 8;
    return new Date(utc + (3600000 * taipeiOffset));
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
 */
function isOverlap(startA, endA, startB, endB) {
    // Thu hẹp khoảng check bằng Tolerance để nếu chỉ chạm nhẹ 1 phút thì vẫn OK
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

/**
 * Kiểm tra tải trọng tài nguyên (Giường/Ghế/Tổng)
 */
function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; // Không cần check loại khác

    // Tạo mảng các điểm thời gian (events) để quét timeline
    let points = [];
    
    for (const bk of bookings) {
        let isRelevant = false;
        if (resourceType === 'TOTAL') isRelevant = true; 
        else if (bk.resourceType === resourceType) isRelevant = true; 

        if (isRelevant) {
            if (isOverlap(start, end, bk.start, bk.end)) {
                let pStart = Math.max(start, bk.start);
                let pEnd = Math.min(end, bk.end);
                
                // Chỉ tính là chiếm dụng nếu khoảng giao thoa > Tolerance
                if (pEnd - pStart > CONFIG.TOLERANCE) {
                    points.push({ time: pStart, type: 'start' });
                    points.push({ time: pEnd, type: 'end' });
                }
            }
        }
    }

    if (points.length === 0) return true; // Không có ai tranh chấp

    // Sắp xếp timeline: Start tính trước End nếu cùng thời điểm
    // (Để tính trạng thái "xấu nhất" tại thời điểm giao thoa)
    points.sort((a, b) => {
        if (a.time === b.time) return a.type === 'start' ? -1 : 1; 
        return a.time - b.time;
    });

    let currentLoad = 0;
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else currentLoad--;

        // [QUAN TRỌNG] Nếu tải hiện tại ĐÃ bằng limit, thì không thể nhét thêm người mới
        if (currentLoad >= limit) return false; 
    }

    return true; // Đủ chỗ
}

/**
 * Tìm nhân viên phù hợp (Native JS Logic)
 */
function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo) return false;
        if (staffInfo.off) return false; // Nghỉ phép

        // 1. Check Ca làm việc
        const shiftStart = getMinsFromTimeStr(staffInfo.start);
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);
        
        // Logic ca đêm (ví dụ 20:00 - 03:00)
        if (shiftEnd < shiftStart) {
            // Tạm thời chưa xử lý sâu ca đêm, giả định làm việc trong ngày
            // Nếu cần, có thể mở rộng logic này sau
        } else {
            if (start < shiftStart) return false;
            // [QUAN TRỌNG] Nhân viên phải rảnh đến hết giờ (bao gồm cả dọn dẹp nếu 'end' đã cộng buffer)
            if (end > shiftEnd) return false; 
        }

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
        // Random: Tìm người rảnh bất kỳ
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

// ============================================================================
// PHẦN 3: LOGIC KIỂM TRA KHẢ THI (SUPER LOGIC V2.3)
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
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

    // BƯỚC 0: CHECK TỔNG QUÁT (Không vượt quá 12 khách)
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
        return { feasible: false, reason: "Tiệm đang quá tải (Max 12 khách)." };
    }

    // PHÂN LOẠI KHÁCH
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
            type: svc.type 
        };

        if (svc.type === 'COMBO') comboGuests.push(guestData);
        else singleGuests.push(guestData);
    }

    let tentativeBookings = []; 
    let finalDetails = new Array(guestList.length);

    // ========================================================================
    // BƯỚC 1: XẾP KHÁCH LẺ
    // ========================================================================
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; // Đã bao gồm dọn dẹp
        
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
    
    const tryScenario = (scenarioConfig) => {
        let scenarioBookings = JSON.parse(JSON.stringify(tentativeBookings)); 
        let scenarioDetails = []; 

        for (const item of scenarioConfig) {
            const guest = comboGuests.find(g => g.id === item.guestId);
            const halfDuration = Math.floor(guest.duration / 2);
            
            // --- TÍNH TOÁN THỜI GIAN CÁC PHASE ---
            const p1Start = requestStartMins;
            const p1End = p1Start + halfDuration; 
            
            // [QUAN TRỌNG] Thêm Transition Buffer để nhân viên di chuyển & khách đổi chỗ
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            const p2End = p2Start + halfDuration;
            
            const p1BlockEnd = p1End + CONFIG.CLEANUP_BUFFER;
            const p2BlockEnd = p2End + CONFIG.CLEANUP_BUFFER;

            // [FIXED HERE] Nhân viên phải rảnh đến tận lúc DỌN DẸP xong của Phase 2
            const staffEnd = p2BlockEnd; 

            let phase1Res, phase2Res;
            if (item.mode === 'FB') { 
                phase1Res = 'CHAIR';
                phase2Res = 'BED';
            } else { 
                phase1Res = 'BED';
                phase2Res = 'CHAIR';
            }

            // CHECK PHASE 1 (Ghế/Giường)
            let allBusy = [...committedBookings, ...scenarioBookings];
            if (!checkResourceCapacity(phase1Res, p1Start, p1BlockEnd, allBusy)) return null;

            // CHECK PHASE 2 (Giường/Ghế)
            // Thêm booking ảo của phase 1 vào để check phase 2
            allBusy.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: 'TEMP' });

            if (!checkResourceCapacity(phase2Res, p2Start, p2BlockEnd, allBusy)) return null;

            // CHECK STAFF
            // Nhân viên phải rảnh liên tục từ đầu đến cuối (bao gồm cả dọn dẹp phase 2)
            const staff = findAvailableStaff(guest.staffReq, p1Start, staffEnd, staffList, [...committedBookings, ...scenarioBookings]);
            if (!staff) return null; 

            // LƯU TẠM
            scenarioBookings.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: staff });
            scenarioBookings.push({ start: p2Start, end: p2BlockEnd, resourceType: phase2Res, staffName: staff });

            scenarioDetails.push({
                guestIndex: guest.id,
                staff: staff,
                service: guest.serviceName,
                price: guest.price,
                mode: item.mode, 
                timeStr: `${timeStr} - ${getTimeStrFromMins(p2End)}`
            });
        }
        return scenarioDetails;
    };

    // --- CHIẾN LƯỢC THỬ NGHIỆM ---
    let successScenario = null;

    // 1. Ưu tiên FB (Chân trước)
    const scenarioFB = comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }));
    successScenario = tryScenario(scenarioFB);

    // 2. Nếu kẹt, thử BF (Body trước - Đảo ngược)
    if (!successScenario) {
        const scenarioBF = comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }));
        successScenario = tryScenario(scenarioBF);
    }

    // 3. Nếu vẫn kẹt -> Thử Tách Nhóm (Brute-force permutations)
    // Ví dụ: 1 người làm FB, 1 người làm BF để so le
    if (!successScenario && comboGuests.length >= 2) {
        const count = comboGuests.length;
        const totalPermutations = Math.min(1 << count, 16); // Giới hạn 16 trường hợp để không lag

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
        successScenario.forEach(item => { finalDetails[item.guestIndex] = item; });
        return {
            feasible: true,
            details: finalDetails,
            totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0)
        };
    } else {
        return { 
            feasible: false, 
            reason: "Rất tiếc, đã thử đảo tua và tách nhóm nhưng vẫn kẹt thời gian (hết giường/ghế hoặc nhân viên)." 
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
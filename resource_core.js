/**
 * ============================================================================
 * FILE: resource_core.js
 * PHIÊN BẢN: SUPER LOGIC V2.5 (SMART BALANCE - FIX 12 PAX)
 * MÔ TẢ: Hệ thống kiểm tra tài nguyên thông minh (Native JS).
 * CẬP NHẬT: Thêm thuật toán cân bằng tải để xử lý đoàn khách lớn (12 người).
 * ============================================================================
 */

// [QUAN TRỌNG] Không require 'moment' hay 'moment-timezone' để tránh lỗi deploy.

const CONFIG = {
    MAX_CHAIRS: 6,        // Tối đa 6 ghế
    MAX_BEDS: 6,          // Tối đa 6 giường
    MAX_TOTAL_GUESTS: 12, // Tối đa 12 khách cùng lúc (Full House)
    
    // --- CẤU HÌNH THỜI GIAN ---
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp (5 phút)
    TRANSITION_BUFFER: 5, // Thời gian nghỉ chuyển tiếp giữa 2 phase của Combo (5 phút)
    TOLERANCE: 1,         // Độ dung sai (1 phút) cho phép trùng lặp nhỏ
    
    FUTURE_BUFFER: 5,     // Đặt trước ít nhất 5 phút
    MAX_TIMELINE_MINS: 1440 // 24h
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
    console.log(`[CORE V2.5] Services Updated: ${Object.keys(SERVICES).length} services loaded.`);
}

// ============================================================================
// PHẦN 2: CÁC HÀM HỖ TRỢ (HELPER FUNCTIONS - NATIVE JS)
// ============================================================================

/**
 * Hàm lấy giờ hiện tại của Đài Loan (UTC+8) bằng Javascript thuần.
 * Đảm bảo chính xác thời gian server.
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
 * Kiểm tra tải trọng tài nguyên (Giường/Ghế/Tổng) tại một khoảng thời gian
 * Hàm này quét qua tất cả booking hiện có để đếm số lượng sử dụng.
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
 * Kiểm tra cả lịch làm việc (Shift) và lịch bận (Busy)
 */
function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo) return false;
        if (staffInfo.off) return false; // Nghỉ phép

        // 1. Check Ca làm việc
        const shiftStart = getMinsFromTimeStr(staffInfo.start);
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);
        
        // Logic cơ bản: Nếu end > shiftEnd -> từ chối
        if (shiftEnd < shiftStart) {
            // Ca đêm (tạm chưa xử lý phức tạp)
        } else {
            if (start < shiftStart) return false;
            // Nhân viên phải rảnh đến hết giờ (bao gồm dọn dẹp)
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
// PHẦN 3: LOGIC KIỂM TRA KHẢ THI (SUPER LOGIC V2.5 - FIX 12 PAX)
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    
    // --- CHUẨN BỊ DỮ LIỆU ---
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

    // BƯỚC 0: CHECK TỔNG QUÁT (Safety Gate)
    // Nếu tổng số khách hiện tại + khách mới > 12 -> Loại ngay
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
        return { feasible: false, reason: "Tiệm đang quá tải (Max 12 khách)." };
    }

    // PHÂN LOẠI KHÁCH: Tách Khách Lẻ (Single) và Khách Combo
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

    let tentativeBookings = []; // Các slot dự kiến sẽ chiếm
    let finalDetails = new Array(guestList.length);

    // ========================================================================
    // BƯỚC 1: XẾP KHÁCH LẺ (ƯU TIÊN CAO NHẤT)
    // ========================================================================
    // Khách lẻ không linh động (chỉ có 1 loại tài nguyên), nên xếp trước cho chắc.
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; 
        
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

    // Nếu không có khách Combo, trả về kết quả ngay
    if (comboGuests.length === 0) {
        return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((s, x) => s + x.price, 0) };
    }

    // ========================================================================
    // BƯỚC 2: XẾP KHÁCH COMBO (LOGIC THÔNG MINH ĐA KỊCH BẢN)
    // ========================================================================
    
    // Hàm cốt lõi: Thử nghiệm một kịch bản sắp xếp (scenarioConfig)
    const tryScenario = (scenarioConfig) => {
        let scenarioBookings = JSON.parse(JSON.stringify(tentativeBookings)); 
        let scenarioDetails = []; 

        for (const item of scenarioConfig) {
            const guest = comboGuests.find(g => g.id === item.guestId);
            const halfDuration = Math.floor(guest.duration / 2);
            
            // --- TÍNH TOÁN THỜI GIAN CÁC PHASE ---
            const p1Start = requestStartMins;
            const p1End = p1Start + halfDuration; 
            
            // [LOGIC] Phase 2 bắt đầu sau khi Phase 1 kết thúc + nghỉ chuyển tiếp
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            const p2End = p2Start + halfDuration;
            
            const p1BlockEnd = p1End + CONFIG.CLEANUP_BUFFER;
            const p2BlockEnd = p2End + CONFIG.CLEANUP_BUFFER;
            
            const staffEnd = p2BlockEnd; // Staff làm đến cùng

            let phase1Res, phase2Res;
            if (item.mode === 'FB') { 
                phase1Res = 'CHAIR'; phase2Res = 'BED';
            } else { 
                phase1Res = 'BED'; phase2Res = 'CHAIR';
            }

            let allBusy = [...committedBookings, ...scenarioBookings];

            // 1. CHECK PHASE 1
            if (!checkResourceCapacity(phase1Res, p1Start, p1BlockEnd, allBusy)) return null;

            // 2. CHECK PHASE 2 (Phải tính cả tải do Phase 1 vừa thêm vào)
            allBusy.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: 'TEMP' });
            if (!checkResourceCapacity(phase2Res, p2Start, p2BlockEnd, allBusy)) return null;

            // 3. CHECK STAFF (Phải rảnh toàn bộ chu trình)
            const staff = findAvailableStaff(guest.staffReq, p1Start, staffEnd, staffList, [...committedBookings, ...scenarioBookings]);
            if (!staff) return null; 

            // GHI NHẬN TẠM THỜI
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

    // --- CHIẾN LƯỢC TỰ ĐỘNG (AUTO-PILOT) ---
    let successScenario = null;

    // Kịch bản A: Ưu tiên FB (Tất cả làm Chân trước)
    // Phù hợp khi còn nhiều Ghế
    const scenarioFB = comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }));
    successScenario = tryScenario(scenarioFB);

    // Kịch bản B: Ưu tiên BF (Tất cả làm Giường trước)
    // Phù hợp khi còn nhiều Giường
    if (!successScenario) {
        const scenarioBF = comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }));
        successScenario = tryScenario(scenarioBF);
    }

    // Kịch bản C: [SMART BALANCE] Cân bằng tải - Lấp Ghế trước
    // Logic: Nếu có 12 khách, 6 người đầu vào Ghế (FB), 6 người sau vào Giường (BF).
    if (!successScenario && comboGuests.length >= 2) {
        const splitConfig = [];
        const maxChairsForCombo = CONFIG.MAX_CHAIRS; // Mốc cân bằng
        
        for (let i = 0; i < comboGuests.length; i++) {
            if (i < maxChairsForCombo) {
                // Ưu tiên lấp đầy ghế
                splitConfig.push({ guestId: comboGuests[i].id, mode: 'FB' });
            } else {
                // Tràn sang giường
                splitConfig.push({ guestId: comboGuests[i].id, mode: 'BF' });
            }
        }
        successScenario = tryScenario(splitConfig);
    }

    // Kịch bản D: [SMART BALANCE REVERSE] Cân bằng tải - Lấp Giường trước
    // Logic: Ngược lại, ưu tiên lấp đầy Giường trước (BF), còn dư mới đẩy sang Ghế (FB).
    if (!successScenario && comboGuests.length >= 2) {
        const splitConfig = [];
        const maxBedsForCombo = CONFIG.MAX_BEDS; 
        
        for (let i = 0; i < comboGuests.length; i++) {
            if (i < maxBedsForCombo) {
                splitConfig.push({ guestId: comboGuests[i].id, mode: 'BF' });
            } else {
                splitConfig.push({ guestId: comboGuests[i].id, mode: 'FB' });
            }
        }
        successScenario = tryScenario(splitConfig);
    }

    // Kịch bản E: Brute-force (Chỉ dùng cho nhóm nhỏ < 6 người)
    // Nếu nhóm nhỏ mà các cách chia trên vẫn thất bại (do kẹt staff cụ thể), thì mới chạy vòng lặp
    // Để tránh treo server khi nhóm quá đông.
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

    // --- TỔNG KẾT & TRẢ KẾT QUẢ ---
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
            reason: "Không thể sắp xếp: Hết Ghế/Giường hoặc Nhân viên không đủ (Đã thử tách nhóm)." 
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
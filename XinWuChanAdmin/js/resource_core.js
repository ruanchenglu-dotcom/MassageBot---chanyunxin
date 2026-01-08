/**
 * ============================================================================
 * FILE: resource_core.js
 * PHIÊN BẢN: SUPER LOGIC (4 Steps Algorithm)
 * MÔ TẢ: Hệ thống kiểm tra tài nguyên thông minh với logic xếp chỗ đa tầng.
 * ============================================================================
 */

const moment = require('moment-timezone'); 

const CONFIG = {
    MAX_CHAIRS: 6,        // Tối đa 6 ghế
    MAX_BEDS: 6,          // Tối đa 6 giường
    MAX_TOTAL_GUESTS: 12, // Tối đa 12 khách cùng lúc (Bước 0)
    CLEANUP_BUFFER: 10,   // Thời gian dọn dẹp (phút)
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
    // Lưu ý: Nếu service là COMBO, cần đảm bảo trong Sheet có cột type là 'COMBO'
    // hoặc logic nhận diện qua tên. Ở đây ta giả định dữ liệu chuẩn.
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE] Updated Services List: ${Object.keys(SERVICES).length} items loaded.`);
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

// Kiểm tra trùng lặp thời gian: (StartA < EndB) && (StartB < EndA)
function isOverlap(startA, endA, startB, endB) {
    return (startA < endB) && (startB < endA);
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

    // Quét qua từng booking, nếu có overlap thì tăng counter
    // Để chính xác tuyệt đối, ta nên quét từng phút hoặc các điểm mốc, 
    // nhưng để hiệu năng tốt, ta đếm overlap max.
    
    // Cách tối ưu: Tìm số lượng trùng lặp lớn nhất tại bất kỳ thời điểm nào trong khoảng [start, end]
    // Tạo mảng các điểm thời gian (events)
    let points = [];
    
    // Chỉ lấy các booking liên quan đến resourceType
    for (const bk of bookings) {
        // Nếu check TOTAL thì lấy hết, nếu check cụ thể thì lọc type
        let isRelevant = false;
        if (resourceType === 'TOTAL') isRelevant = true;
        else if (bk.resourceType === resourceType) isRelevant = true;

        if (isRelevant) {
            // Nếu booking này overlap với khoảng cần check
            if (isOverlap(start, end, bk.start, bk.end)) {
                // Chỉ quan tâm phần giao nhau
                let pStart = Math.max(start, bk.start);
                let pEnd = Math.min(end, bk.end);
                points.push({ time: pStart, type: 'start' });
                points.push({ time: pEnd, type: 'end' });
            }
        }
    }

    if (points.length === 0) return true; // Không có ai tranh chấp

    points.sort((a, b) => {
        if (a.time === b.time) {
            // Nếu cùng giờ, xử lý 'start' trước để tính worst-case
            return a.type === 'start' ? -1 : 1; 
        }
        return a.time - b.time;
    });

    let currentLoad = 0;
    // Điểm khởi đầu load có thể > 0 nếu có booking bao trùm cả start.
    // Tuy nhiên logic overlap ở trên đã lọc, ta chỉ cần chạy point.
    
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else currentLoad--;

        if (currentLoad >= limit) return false; // Quá tải
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
    // Helper check 1 nhân viên
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo) return false;
        if (staffInfo.off) return false; // Nghỉ phép

        // 1. Check Ca làm việc (Shift)
        const shiftStart = getMinsFromTimeStr(staffInfo.start);
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);
        
        // Khách vào (start) phải sau giờ làm
        if (start < shiftStart) return false;
        
        // *QUAN TRỌNG (Bước 2)*: Khách ra (end) phải trước giờ về.
        // Nếu ca qua đêm (VD 20:00 - 02:00), shiftEnd sẽ nhỏ hơn shiftStart, cần logic xử lý ngày hôm sau.
        // Ở đây giả định ca làm trong ngày (8h-24h) như yêu cầu.
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
        // Khách chọn đích danh
        if (checkOneStaff(staffReq)) return staffReq;
        return null;
    } else {
        // Khách chọn ngẫu nhiên -> Tìm người rảnh
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

// ============================================================================
// PHẦN 3: LOGIC KIỂM TRA KHẢ THI (SUPER LOGIC)
// ============================================================================

/**
 * Hàm chính kiểm tra booking
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    // --- CHUẨN BỊ DỮ LIỆU ---
    const requestStartMins = getMinsFromTimeStr(timeStr);
    
    // Chuẩn hóa currentBookings từ DB về dạng số phút để dễ tính toán
    let committedBookings = currentBookingsRaw.map(b => {
        let rType = 'CHAIR'; // Mặc định
        if (SERVICES[b.serviceCode] && SERVICES[b.serviceCode].type) {
            rType = SERVICES[b.serviceCode].type;
            if (rType === 'COMBO') {
                 // Với booking cũ trong DB, nếu là combo, ta cần biết nó đang ở phase nào.
                 // Tuy nhiên để đơn giản, DB thường lưu tách dòng (dòng làm chân, dòng làm body).
                 // Nếu DB lưu gộp, ta tạm coi nó chiếm cả giường/ghế (worst case) hoặc cần logic parse kỹ hơn.
                 // Ở đây giả định DB đã lưu thành các slot chiếm resource cụ thể.
            }
        }
        return {
            start: getMinsFromTimeStr(b.startTime),
            end: getMinsFromTimeStr(b.endTime), // Đã gồm buffer
            resourceType: rType,
            staffName: b.staffName
        };
    });

    // --- BƯỚC 0: LOGIC CỐ ĐỊNH (CHECK MAX 12 KHÁCH) ---
    // Kiểm tra sơ bộ: Tổng số khách dự kiến + khách đang có không được quá 12 tại thời điểm bắt đầu
    // (Kiểm tra sâu hơn sẽ ở trong logic chi tiết)
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
        return { feasible: false, reason: "Tiệm đang quá tải (Max 12 khách)." };
    }

    // --- PHÂN LOẠI KHÁCH ---
    let singleGuests = [];
    let comboGuests = [];

    // Duyệt qua request để phân loại và lấy thông tin service
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
            type: svc.type // 'BED', 'CHAIR', 'COMBO', 'NONE'
        };

        if (svc.type === 'COMBO') {
            comboGuests.push(guestData);
        } else {
            singleGuests.push(guestData);
        }
    }

    // Danh sách booking TẠM THỜI cho request này (sẽ cộng dồn qua các bước)
    let tentativeBookings = []; 
    // Kết quả chi tiết trả về
    let finalDetails = new Array(guestList.length);

    // ========================================================================
    // BƯỚC 1: XẾP KHÁCH LẺ (SINGLE SERVICES) TRƯỚC
    // ========================================================================
    // Ưu tiên chiếm tài nguyên cho các gói đơn (Chân hoặc Body)
    
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER;
        
        // 1.1 Kiểm tra Tài nguyên (Ghế/Giường)
        // Check với committedBookings + tentativeBookings (các khách cùng request đã xếp trước đó)
        const allCurrent = [...committedBookings, ...tentativeBookings];
        
        if (!checkResourceCapacity(guest.type, start, end, allCurrent)) {
            return { feasible: false, reason: `Không đủ ${guest.type === 'BED' ? 'Giường' : 'Ghế'} cho dịch vụ lẻ.` };
        }

        // 1.2 Kiểm tra Nhân viên (Bước 2 áp dụng cho khách lẻ)
        const assignedStaff = findAvailableStaff(guest.staffReq, start, end, staffList, allCurrent);
        
        if (!assignedStaff) {
            return { feasible: false, reason: `Không tìm được nhân viên phù hợp cho gói ${guest.serviceName}.` };
        }

        // 1.3 Thành công -> Ghi vào temporary
        const bookingEntry = {
            start: start,
            end: end,
            resourceType: guest.type,
            staffName: assignedStaff,
            serviceCode: guest.serviceCode // để debug
        };
        tentativeBookings.push(bookingEntry);

        finalDetails[guest.id] = {
            guestIndex: guest.id,
            staff: assignedStaff,
            service: guest.serviceName,
            price: guest.price,
            timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
        };
    }

    // Nếu không có khách Combo, return luôn
    if (comboGuests.length === 0) {
        return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((s, x) => s + x.price, 0) };
    }

    // ========================================================================
    // BƯỚC 3: KIỂM TRA GÓI COMBO (LOGIC THÔNG MINH - 3 PHƯƠNG ÁN)
    // ========================================================================
    // Combo gồm 2 giai đoạn. Giả sử chia đôi thời gian (VD: 60p -> 30p Chân + 30p Body)
    // Cần tìm ra một kịch bản (Scenario) mà TẤT CẢ khách combo đều xếp được lịch.

    // Hàm thử một kịch bản xếp chỗ cho danh sách Combo
    // inputs: danh sách guest kèm định hướng (FB hay BF)
    const tryScenario = (scenarioConfig) => {
        // scenarioConfig = [ { guestId: 0, mode: 'FB' }, { guestId: 1, mode: 'BF' } ... ]
        
        // Clone mảng booking hiện tại để thử nghiệm (không làm bẩn mảng chính)
        let scenarioBookings = JSON.parse(JSON.stringify(tentativeBookings)); 
        let scenarioDetails = []; // Lưu kết quả tạm của scenario

        for (const item of scenarioConfig) {
            const guest = comboGuests.find(g => g.id === item.guestId);
            const halfDuration = Math.floor(guest.duration / 2);
            
            // Định nghĩa 2 giai đoạn dựa trên mode
            let phase1, phase2;
            
            if (item.mode === 'FB') { // Foot -> Body
                phase1 = { type: 'CHAIR', start: requestStartMins, end: requestStartMins + halfDuration };
                phase2 = { type: 'BED', start: requestStartMins + halfDuration, end: requestStartMins + guest.duration + CONFIG.CLEANUP_BUFFER };
            } else { // BF: Body -> Foot
                phase1 = { type: 'BED', start: requestStartMins, end: requestStartMins + halfDuration };
                phase2 = { type: 'CHAIR', start: requestStartMins + halfDuration, end: requestStartMins + guest.duration + CONFIG.CLEANUP_BUFFER };
            }

            // --- CHECK TÀI NGUYÊN (PHASE 1 & 2) ---
            const allBusy = [...committedBookings, ...scenarioBookings];
            
            if (!checkResourceCapacity(phase1.type, phase1.start, phase1.end, allBusy)) return null; // Fail Phase 1
            
            // Cập nhật tạm để check phase 2 (vì cùng 1 khách chiếm 2 tài nguyên nối tiếp)
            // Lưu ý: Phase 1 xong mới qua Phase 2, nhưng tài nguyên Phase 1 đã free? 
            // Đúng, tài nguyên free, nhưng nhân viên thì vẫn là người đó (thường là vậy) hoặc đổi tua?
            // Code này giả định 1 khách 1 nhân viên làm suốt tuyến.
            
            // Để check phase 2, ta cần tính luôn phase 1 vào tải của hệ thống
            // Nhưng khi check phase 2 (lúc sau), phase 1 đã xong.
            // Tuy nhiên hàm checkResourceCapacity check theo timeline nên không lo.
            if (!checkResourceCapacity(phase2.type, phase2.start, phase2.end, allBusy)) return null; // Fail Phase 2

            // --- CHECK NHÂN VIÊN (Toàn tuyến) ---
            // Nhân viên phải rảnh từ Start -> End (Tổng duration)
            const totalEnd = phase2.end;
            const staff = findAvailableStaff(guest.staffReq, requestStartMins, totalEnd, staffList, allBusy);
            
            if (!staff) return null; // Không có nhân viên

            // Nếu OK, đẩy vào scenarioBookings
            scenarioBookings.push({
                start: phase1.start, end: phase1.end, resourceType: phase1.type, staffName: staff
            });
            scenarioBookings.push({
                start: phase2.start, end: phase2.end, resourceType: phase2.type, staffName: staff
            });

            scenarioDetails.push({
                guestIndex: guest.id,
                staff: staff,
                service: guest.serviceName,
                price: guest.price,
                mode: item.mode, // FB or BF
                timeStr: `${timeStr} - ${getTimeStrFromMins(totalEnd - CONFIG.CLEANUP_BUFFER)}`
            });
        }

        return scenarioDetails; // Thành công trả về details
    };

    // --- THỰC HIỆN CHIẾN LƯỢC ---

    let successScenario = null;

    // PHƯƠNG ÁN 1: TẤT CẢ LÀM FB (Chân trước - Body sau)
    // Ưu điểm: Dễ quản lý. Nhược điểm: Tắc nghẽn ghế lúc đầu.
    const scenarioFB = comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }));
    successScenario = tryScenario(scenarioFB);

    if (!successScenario) {
        // PHƯƠNG ÁN 2: TẤT CẢ LÀM BF (Body trước - Chân sau)
        // Đảo lại quy trình nếu phương án 1 thất bại.
        const scenarioBF = comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }));
        successScenario = tryScenario(scenarioBF);
    }

    if (!successScenario && comboGuests.length >= 2) {
        // PHƯƠNG ÁN 3: TÁCH NHÓM (SPLIT GROUP)
        // Nếu cả 2 đều không được, thử chia nhóm: Một nửa làm FB, một nửa làm BF.
        // Dùng vòng lặp nhị phân để thử mọi tổ hợp (Brute-force permutations)
        // VD: 00 (đã thử), 11 (đã thử), thử 01, 10...
        
        const count = comboGuests.length;
        const totalPermutations = 1 << count; // 2^n

        for (let i = 1; i < totalPermutations - 1; i++) {
            // Tạo config từ bitmask
            const splitConfig = [];
            for (let j = 0; j < count; j++) {
                // Bit 0 -> FB, Bit 1 -> BF
                const mode = ((i >> j) & 1) ? 'BF' : 'FB';
                splitConfig.push({ guestId: comboGuests[j].id, mode: mode });
            }
            
            successScenario = tryScenario(splitConfig);
            if (successScenario) break; // Tìm thấy phương án ngon rồi! Stop.
        }
    }

    // --- TỔNG KẾT ---
    if (successScenario) {
        // Merge kết quả từ Single và Combo
        successScenario.forEach(item => {
            finalDetails[item.guestIndex] = item;
        });
        
        // Sắp xếp lại finalDetails theo đúng thứ tự mảng guestList
        return {
            feasible: true,
            details: finalDetails,
            totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0)
        };
    } else {
        return { 
            feasible: false, 
            reason: "Đã thử mọi phương án (FB, BF, Tách nhóm) nhưng không xếp đủ Ghế/Giường hoặc Nhân viên." 
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
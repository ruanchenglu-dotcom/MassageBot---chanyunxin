/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: SUPER LOGIC V2.6 (STRICT TIME & SMART BALANCE INTEGRATION)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/09
 * * MÔ TẢ CHI TIẾT:
 * Đây là trái tim xử lý logic của hệ thống. Nó chịu trách nhiệm:
 * 1. Đọc hiểu cấu hình dịch vụ và tài nguyên (Ghế/Giường).
 * 2. Chuẩn hóa thời gian từ chuỗi (String) sang số phút (Integer) để so sánh chính xác tuyệt đối.
 * 3. Kiểm tra tính khả thi khi nhận khách (Availability Check).
 * 4. [FEATURE] SMART BALANCE: Thuật toán tự động cân bằng tải giữa Ghế và Giường để đón đoàn lớn (12 khách).
 * 5. [FIX] Chặn đứng việc nhận khách khi nhân viên chưa vào ca (Shift Enforcement).
 * =================================================================================================
 */

// [LƯU Ý KỸ THUẬT]
// Không sử dụng thư viện bên ngoài (moment.js) để đảm bảo tốc độ và tránh lỗi module not found khi deploy.
// Sử dụng Native Javascript Date & Math.

const CONFIG = {
    MAX_CHAIRS: 6,        // Tối đa 6 ghế Foot Massage
    MAX_BEDS: 6,          // Tối đa 6 giường Body Massage
    MAX_TOTAL_GUESTS: 12, // Tổng dung lượng tối đa (Full House)
    
    // --- CẤU HÌNH THỜI GIAN (TIME SETTINGS) ---
    OPEN_HOUR: 8,         // Giờ mở cửa (dùng để xác định mốc qua đêm)
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi ca (5 phút)
    TRANSITION_BUFFER: 5, // Thời gian khách di chuyển giữa 2 phase của Combo (5 phút)
    TOLERANCE: 1,         // Độ dung sai (1 phút) cho phép trùng lặp không đáng kể
    
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
 * Sử dụng phép tính Offset thủ công để chính xác trên mọi môi trường Server (Render/Heroku/Local).
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
 * [HÀM QUAN TRỌNG NHẤT - FIX LỖI 8H SÁNG]
 * Chuyển đổi chuỗi giờ "HH:mm" thành số phút (Interger) tính từ 00:00.
 * - Tự động sửa lỗi dấu hai chấm (：-> :)
 * - Tự động loại bỏ khoảng trắng thừa.
 * - Xử lý giờ qua đêm: Nếu giờ < giờ mở cửa (8h), cộng thêm 24h (Ví dụ 02:00 -> 26:00).
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; // Trả về -1 nếu dữ liệu lỗi
    
    try {
        // 1. Chuẩn hóa chuỗi (Xóa space, fix dấu :)
        const cleanStr = timeStr.toString().trim().replace(/：/g, ':');
        
        // 2. Tách giờ và phút
        const parts = cleanStr.split(':');
        if (parts.length < 2) return -1;

        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);

        // 3. Kiểm tra tính hợp lệ
        if (isNaN(h) || isNaN(m)) return -1;

        // 4. Logic qua đêm (Overnight Logic)
        // Nếu giờ nhỏ hơn giờ mở cửa (ví dụ 01:00, 02:00), hệ thống hiểu là rạng sáng hôm sau
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
    
    // Nếu giờ lớn hơn 24 (qua đêm), trừ bớt để hiển thị đúng (ví dụ 26:00 -> 02:00)
    // Hoặc giữ nguyên nếu muốn hiển thị kiểu 25:00. Ở đây ta trả về giờ chuẩn.
    if (h >= 24) h -= 24; 
    
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Kiểm tra trùng lặp thời gian giữa 2 khoảng [startA, endA] và [startB, endB]
 * Có sử dụng độ dung sai (TOLERANCE) để bỏ qua các va chạm nhỏ (1 phút).
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
 * @param {string} resourceType - 'BED', 'CHAIR', hoặc 'TOTAL'
 * @param {number} start - Phút bắt đầu
 * @param {number} end - Phút kết thúc
 * @param {Array} bookings - Danh sách các booking đã convert sang phút
 */
function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; // Không cần check loại khác

    // Tạo timeline các điểm Start/End để quét (Sweep Line Algorithm đơn giản)
    let points = [];
    
    for (const bk of bookings) {
        let isRelevant = false;
        if (resourceType === 'TOTAL') isRelevant = true; 
        else if (bk.resourceType === resourceType) isRelevant = true; 

        if (isRelevant) {
            // Chỉ quan tâm nếu booking đó nằm trong khoảng thời gian ta đang xét
            if (isOverlap(start, end, bk.start, bk.end)) {
                // Cắt gọt timeline cho khớp với cửa sổ [start, end]
                let pStart = Math.max(start, bk.start);
                let pEnd = Math.min(end, bk.end);
                
                if (pEnd - pStart > CONFIG.TOLERANCE) {
                    points.push({ time: pStart, type: 'start' });
                    points.push({ time: pEnd, type: 'end' });
                }
            }
        }
    }

    if (points.length === 0) return true; // Không có ai tranh chấp -> OK

    // Sắp xếp timeline: Start tính trước End nếu cùng thời điểm
    points.sort((a, b) => {
        if (a.time === b.time) return a.type === 'start' ? -1 : 1; 
        return a.time - b.time;
    });

    let currentLoad = 0;
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else currentLoad--;

        // [QUAN TRỌNG] Nếu tại bất kỳ thời điểm nào tải >= limit -> FAILED
        if (currentLoad >= limit) return false; 
    }

    return true; // Đủ chỗ
}

/**
 * [QUAN TRỌNG] Tìm nhân viên phù hợp
 * Logic được nâng cấp để so sánh số nguyên (Integer Comparison).
 * Đảm bảo: Giờ Khách Đặt >= Giờ Vào Ca VÀ Giờ Khách Xong <= Giờ Về.
 */
function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo) return false; // Không tồn tại staff này
        
        if (staffInfo.off) return false; // Staff đang nghỉ phép/OFF

        // --- 1. KIỂM TRA CA LÀM VIỆC (SHIFT CHECK - STRICT) ---
        const shiftStart = getMinsFromTimeStr(staffInfo.start); // Đã chuẩn hóa
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     // Đã chuẩn hóa
        
        if (shiftStart === -1 || shiftEnd === -1) return false; // Lỗi data

        // Khách đến trước khi nhân viên vào làm -> REJECT
        if (start < shiftStart) return false;
        
        // Khách làm xong sau khi nhân viên đã về -> REJECT
        if (end > shiftEnd) return false; 

        // --- 2. KIỂM TRA TRÙNG LỊCH (BUSY CHECK) ---
        // Xem nhân viên này có đang phục vụ khách nào khác trong khoảng [start, end] không
        for (const b of busyList) {
            if (b.staffName === name) {
                if (isOverlap(start, end, b.start, b.end)) return false; // Đụng lịch
            }
        }
        return true; // Passed all checks
    };

    // Nếu khách yêu cầu đích danh (hoặc yêu cầu giới tính - logic xử lý ở Index.js rồi truyền ID vào đây)
    if (staffReq && staffReq !== 'Any' && staffReq !== 'RANDOM') {
        if (checkOneStaff(staffReq)) return staffReq;
        return null;
    } else {
        // Random: Tìm người rảnh bất kỳ trong danh sách
        const allStaffNames = Object.keys(staffListRef);
        // Có thể thêm logic Random shuffle để không dồn việc cho 1 người, nhưng ở đây dùng tuần tự cho đơn giản
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

// ============================================================================
// PHẦN 4: LOGIC KIỂM TRA KHẢ THI (SUPER LOGIC V2.5 + V2.6 STRICT)
// ============================================================================

/**
 * Hàm chính kiểm tra xem yêu cầu đặt lịch có khả thi không.
 * Áp dụng thuật toán "Smart Balance" cho đoàn khách lớn.
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    // 1. Chuyển giờ khách đặt sang số phút
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Lỗi định dạng giờ (Invalid Time Format)." };
    
    // 2. Chuyển đổi dữ liệu Booking cũ trong DB sang dạng số phút
    let committedBookings = currentBookingsRaw.map(b => {
        let rType = 'CHAIR'; 
        if (SERVICES[b.serviceCode] && SERVICES[b.serviceCode].type) {
            rType = SERVICES[b.serviceCode].type;
        }
        // Fallback service types
        if (b.serviceName.includes('Foot') || b.serviceName.includes('足')) rType = 'CHAIR';
        if (b.serviceName.includes('Body') || b.serviceName.includes('指壓') || b.serviceName.includes('油')) rType = 'BED';
        if (b.serviceName.includes('Combo') || b.serviceName.includes('套餐')) rType = 'BED'; // Combo usually starts or occupies bed

        return {
            start: getMinsFromTimeStr(b.startTime),
            end: b.duration ? getMinsFromTimeStr(b.startTime) + b.duration : getMinsFromTimeStr(b.startTime) + 60, 
            resourceType: rType,
            staffName: b.staffName
        };
    }).filter(b => b.start !== -1); // Loại bỏ data lỗi

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

    let tentativeBookings = []; // Các slot dự kiến sẽ chiếm (nếu thành công)
    let finalDetails = new Array(guestList.length);

    // ========================================================================
    // BƯỚC 1: XẾP KHÁCH LẺ (PRIORITY 1)
    // ========================================================================
    // Khách lẻ không linh động (chỉ có 1 loại tài nguyên), nên xếp trước để chiếm chỗ cứng.
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; 
        
        const allCurrent = [...committedBookings, ...tentativeBookings];
        
        // 1.1 Check Resource (Ghế hoặc Giường)
        if (!checkResourceCapacity(guest.type, start, end, allCurrent)) {
            return { feasible: false, reason: `Hết ${guest.type === 'BED' ? 'Giường' : 'Ghế'} cho dịch vụ lẻ.` };
        }

        // 1.2 Check Staff
        const assignedStaff = findAvailableStaff(guest.staffReq, start, end, staffList, allCurrent);
        if (!assignedStaff) {
            return { feasible: false, reason: `Không có nhân viên rảnh lúc ${timeStr} cho khách lẻ.` };
        }

        // Ghi nhận thành công
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
    // BƯỚC 2: XẾP KHÁCH COMBO - SUPER LOGIC V2.5 (SMART SWAP)
    // ========================================================================
    
    // Hàm cốt lõi: Thử nghiệm một kịch bản sắp xếp (Scenario Testing)
    const tryScenario = (scenarioConfig) => {
        // Clone lại trạng thái hiện tại để thử nghiệm, không làm hỏng dữ liệu gốc
        let scenarioBookings = JSON.parse(JSON.stringify(tentativeBookings)); 
        let scenarioDetails = []; 

        for (const item of scenarioConfig) {
            const guest = comboGuests.find(g => g.id === item.guestId);
            const halfDuration = Math.floor(guest.duration / 2); // Thường là 50p cho combo 100p
            
            // --- TÍNH TOÁN TIMELINE CHI TIẾT ---
            const p1Start = requestStartMins;
            const p1End = p1Start + halfDuration; 
            
            // [LOGIC] Phase 2 bắt đầu sau khi Phase 1 kết thúc + nghỉ chuyển tiếp
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            const p2End = p2Start + halfDuration;
            
            // Thời gian chiếm dụng tài nguyên (bao gồm cả dọn dẹp)
            const p1BlockEnd = p1End + CONFIG.CLEANUP_BUFFER;
            const p2BlockEnd = p2End + CONFIG.CLEANUP_BUFFER;
            
            const staffEnd = p2BlockEnd; // Staff phải làm đến cùng

            // Xác định loại tài nguyên cho từng Phase dựa trên Mode
            let phase1Res, phase2Res;
            if (item.mode === 'FB') { 
                phase1Res = 'CHAIR'; phase2Res = 'BED'; // Foot -> Body
            } else { 
                phase1Res = 'BED'; phase2Res = 'CHAIR'; // Body -> Foot
            }

            let allBusy = [...committedBookings, ...scenarioBookings];

            // 1. CHECK PHASE 1
            if (!checkResourceCapacity(phase1Res, p1Start, p1BlockEnd, allBusy)) return null; // Fail

            // 2. CHECK PHASE 2 (Phải tính cả tải do Phase 1 vừa thêm vào)
            // Thêm booking ảo của Phase 1 vào để check Phase 2 (nếu trùng giờ)
            allBusy.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: 'TEMP' });
            if (!checkResourceCapacity(phase2Res, p2Start, p2BlockEnd, allBusy)) return null; // Fail

            // 3. CHECK STAFF (Phải rảnh toàn bộ chu trình từ đầu đến cuối)
            const staff = findAvailableStaff(guest.staffReq, p1Start, staffEnd, staffList, [...committedBookings, ...scenarioBookings]);
            if (!staff) return null; // Không có staff đủ thời gian

            // GHI NHẬN TẠM THỜI (Để tính cho người tiếp theo trong Scenario)
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
        return scenarioDetails; // Success
    };

    // --- CHIẾN LƯỢC TỰ ĐỘNG (AUTO-PILOT STRATEGY) ---
    let successScenario = null;

    // Kịch bản A: Tất cả làm Chân trước (FB)
    // Phù hợp khi còn nhiều Ghế
    const scenarioFB = comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }));
    successScenario = tryScenario(scenarioFB);

    // Kịch bản B: Tất cả làm Giường trước (BF)
    // Phù hợp khi còn nhiều Giường
    if (!successScenario) {
        const scenarioBF = comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }));
        successScenario = tryScenario(scenarioBF);
    }

    // Kịch bản C: [SMART BALANCE] Cân bằng tải - Ưu tiên lấp Ghế trước
    // Logic: Nếu có 12 khách, hệ thống thử chia đôi: Nhóm 1 làm FB, Nhóm 2 làm BF.
    if (!successScenario && comboGuests.length >= 2) {
        const splitConfig = [];
        const maxChairsForCombo = CONFIG.MAX_CHAIRS; 
        
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

    // Kịch bản D: [SMART BALANCE REVERSE] Cân bằng tải - Ưu tiên lấp Giường trước
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

    // Kịch bản E: Brute-force (Chỉ dùng cho nhóm nhỏ < 6 người để vét cạn các khả năng)
    // Nếu nhóm nhỏ mà các cách chia trên vẫn thất bại (do kẹt staff cụ thể), thì mới chạy vòng lặp
    // Để tránh treo server khi nhóm quá đông.
    if (!successScenario && comboGuests.length >= 2 && comboGuests.length < 6) {
        const count = comboGuests.length;
        const totalPermutations = 1 << count; // 2^n trường hợp

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
            reason: "Không thể sắp xếp: Hết Ghế/Giường hoặc Nhân viên không đủ (Đã thử mọi phương án tách nhóm)." 
        };
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
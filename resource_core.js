/**
 * ============================================================================
 * FILE: resource_core.js
 * PHIÊN BẢN: SUPER LOGIC V4 (SMART SWAP - FULL HOUSE 12 PAX)
 * TÍNH NĂNG:
 * - Native JS (Không cần moment-timezone, chạy tốt trên mọi môi trường Node).
 * - Smart Permutations: Tự động thử hoán vị (FB: Foot-Body, BF: Body-Foot) để nhận đủ 12 khách.
 * - Precision Timing: Tính toán tài nguyên chính xác từng phút.
 * - Transition Buffer: Tự động thêm 5 phút nghỉ giữa 2 phase của Combo.
 * ============================================================================
 */

const CONFIG = {
    MAX_CHAIRS: 6,        // Tối đa 6 ghế massage chân
    MAX_BEDS: 6,          // Tối đa 6 giường massage body
    MAX_TOTAL_GUESTS: 12, // Tổng tải trọng shop (6 ghế + 6 giường)
    
    // --- CẤU HÌNH THỜI GIAN ---
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi dịch vụ (5 phút)
    TRANSITION_BUFFER: 5, // Thời gian khách di chuyển/ngâm chân/thay đồ giữa 2 phase (5 phút)
    TOLERANCE: 1,         // Dung sai 1 phút (cho phép điểm cuối ca trước chạm điểm đầu ca sau)
    
    FUTURE_BUFFER: 5,     // Đặt trước tối thiểu 5 phút
    MAX_TIMELINE_MINS: 1440 // 24 giờ x 60 phút
};

// Biến lưu trữ cấu hình dịch vụ (được nạp từ Google Sheet qua index.js)
let SERVICES = {}; 

// ============================================================================
// PHẦN 1: QUẢN LÝ DỊCH VỤ & KHỞI TẠO
// ============================================================================

function setDynamicServices(newServicesObj) {
    // Các dịch vụ hệ thống mặc định
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    // Gộp dịch vụ từ Sheet và dịch vụ hệ thống
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE V4] Services Updated: ${Object.keys(SERVICES).length} items loaded successfully.`);
}

// ============================================================================
// PHẦN 2: CÁC HÀM HỖ TRỢ (NATIVE JS - NO LIB)
// ============================================================================

/**
 * Lấy giờ hiện tại theo múi giờ Đài Loan (UTC+8)
 * Thay thế hoàn toàn cho moment-timezone để fix lỗi deploy trên Render/Heroku
 */
function getTaipeiNow() {
    const d = new Date();
    // Tính offset thủ công: UTC time + (8 giờ * 60 phút * 60 giây * 1000 mili giây)
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const taipeiOffset = 8;
    return new Date(utc + (3600000 * taipeiOffset));
}

/**
 * Chuyển đổi chuỗi giờ "HH:mm" thành số phút trong ngày (0-1439)
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return h * 60 + m;
}

/**
 * Chuyển đổi số phút thành chuỗi giờ "HH:mm"
 */
function getTimeStrFromMins(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    // Xử lý trường hợp qua đêm (ví dụ 25:00 -> 01:00)
    if (h >= 24) h -= 24; 
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Kiểm tra va chạm thời gian (Overlap)
 * Logic: Hai khoảng thời gian [A, B] và [C, D] trùng nhau khi A < D VÀ C < B
 */
function isOverlap(startA, endA, startB, endB) {
    // Trừ đi dung sai để các ca liền kề (ví dụ 14:00-15:00 và 15:00-16:00) không bị tính là trùng
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

/**
 * Kiểm tra sức chứa của tài nguyên (Ghế/Giường) tại một khoảng thời gian cụ thể
 * Đây là hàm quan trọng nhất để đảm bảo không bị Overbooking
 */
function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; // Các loại dịch vụ ảo (System) không tốn tài nguyên vật lý

    // Thuật toán quét dòng thời gian (Line Sweep Algorithm) đơn giản hóa
    // Ta kiểm tra xem tại bất kỳ thời điểm nào trong khoảng [start, end], số lượng khách có vượt quá limit không
    
    // 1. Lấy danh sách các booking có liên quan và có va chạm
    const relevantBookings = bookings.filter(bk => {
        let isRelevant = false;
        if (resourceType === 'TOTAL') isRelevant = true; // Check tổng thì tính tất cả
        else if (bk.resourceType === resourceType) isRelevant = true; 
        
        if (!isRelevant) return false;
        return isOverlap(start, end, bk.start, bk.end);
    });

    if (relevantBookings.length === 0) return true; // Không có ai trùng -> OK

    // 2. Tạo các điểm kiểm tra (Start/End points)
    let points = [];
    relevantBookings.forEach(bk => {
        // Chỉ lấy phần giao thoa nằm trong khoảng thời gian chúng ta đang check
        let pStart = Math.max(start, bk.start);
        let pEnd = Math.min(end, bk.end);
        
        if (pEnd - pStart > CONFIG.TOLERANCE) {
            points.push({ time: pStart, type: 'start' });
            points.push({ time: pEnd, type: 'end' });
        }
    });

    // Sắp xếp thời gian tăng dần. Nếu cùng thời gian, xử lý 'start' trước để tính tải trọng cực đại (Safety first)
    points.sort((a, b) => {
        if (a.time === b.time) return a.type === 'start' ? -1 : 1; 
        return a.time - b.time;
    });

    let currentLoad = 0; // Tải trọng hiện tại (số khách đang dùng dịch vụ)
    // Nếu đây là check cho booking mới, thì tải trọng khởi điểm là 1 (chính là booking đang check)
    // Tuy nhiên hàm này check capacity "còn lại", nên ta tính load của các booking cũ, nếu load >= limit thì fail.
    
    // Logic đúng: Chúng ta đang check xem liệu thêm 1 slot [start, end] vào thì có bị quá tải không.
    // Cách làm: Tìm maxLoad của các booking cũ trong khoảng này. Nếu maxLoad < Limit thì OK.
    
    let maxExistingLoad = 0;
    
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else currentLoad--;

        if (currentLoad > maxExistingLoad) maxExistingLoad = currentLoad;
    }

    // Nếu tải trọng hiện tại đã bằng giới hạn, thì không thể nhét thêm booking mới
    if (maxExistingLoad >= limit) return false; 

    return true; // Còn chỗ
}

/**
 * Tìm nhân viên phù hợp
 * staffReq: Yêu cầu của khách ('Any', 'MALE', 'FEMALE', hoặc ID cụ thể)
 */
function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    // Helper check 1 nhân viên
    const checkOneStaff = (nameOrId) => {
        const staffInfo = staffListRef[nameOrId];
        if (!staffInfo) return false; // Không tồn tại
        if (staffInfo.off) return false; // Nghỉ phép trong ngày

        // 1. Check Ca làm việc (Shift)
        const shiftStart = getMinsFromTimeStr(staffInfo.start);
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);
        
        // Xử lý ca đêm (ví dụ 20:00 - 03:00)
        let isOverNight = shiftEnd < shiftStart;
        
        // Logic kiểm tra xem [start, end] có nằm TRỌN VẸN trong ca làm việc không
        if (isOverNight) {
            // Ca đêm hơi phức tạp, để đơn giản ta giả định nếu staff có ca đêm thì họ làm việc
            // Cần logic chặt chẽ hơn nếu muốn chính xác tuyệt đối, nhưng tạm thời chấp nhận.
        } else {
            // Ca ngày thường
            if (start < shiftStart) return false; // Khách đến sớm hơn giờ làm
            if (end > shiftEnd) return false;     // Khách về muộn hơn giờ về
        }

        // 2. Check Trùng lịch với booking khác (Busy)
        for (const b of busyList) {
            // So sánh ID hoặc Name
            if (b.staffName === staffInfo.id || b.staffName === staffInfo.name) {
                if (isOverlap(start, end, b.start, b.end)) return false;
            }
        }
        return true;
    };

    // Case 1: Khách chỉ định cụ thể (ID hoặc Tên)
    if (staffReq && staffReq !== 'Any' && staffReq !== '隨機' && staffReq !== 'MALE' && staffReq !== 'FEMALE' && staffReq !== '女' && staffReq !== '男') {
        if (checkOneStaff(staffReq)) return staffReq;
        return null;
    }

    // Case 2: Tìm theo tiêu chí (Nam/Nữ/Bất kỳ)
    const allStaffIds = Object.keys(staffListRef);
    // Shuffle danh sách để phân phối đều tour (công bằng cho nhân viên)
    const shuffledStaff = allStaffIds.sort(() => 0.5 - Math.random());

    for (const id of shuffledStaff) {
        const s = staffListRef[id];
        let genderMatch = true;
        if (staffReq === 'FEMALE' || staffReq === '女') {
            if (s.gender !== 'F' && s.gender !== '女') genderMatch = false;
        } else if (staffReq === 'MALE' || staffReq === '男') {
            if (s.gender !== 'M' && s.gender !== '男') genderMatch = false;
        }

        if (genderMatch && checkOneStaff(id)) return id;
    }

    return null;
}

// ============================================================================
// PHẦN 3: LOGIC KIỂM TRA KHẢ THI (SUPER LOGIC V4 - SMART SWAP)
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    
    // 1. CHUẨN HÓA DỮ LIỆU CŨ (Bookings đã có trong DB)
    // Chuyển đổi từ format hiển thị sang dạng phút để tính toán
    let committedBookings = currentBookingsRaw.map(b => {
        let rType = 'CHAIR'; 
        // Xác định loại tài nguyên của booking cũ
        if (SERVICES[b.serviceCode] && SERVICES[b.serviceCode].type) {
            rType = SERVICES[b.serviceCode].type;
        }
        
        // Lưu ý: Booking cũ lưu trong DB thường không tách phase.
        // Để an toàn, nếu là Combo, ta tạm coi nó chiếm tài nguyên chính (BED) hoặc cả 2 nếu cần chặt chẽ.
        // Ở version này, ta lấy type từ config dịch vụ.
        
        return {
            start: getMinsFromTimeStr(b.startTime),
            end: getMinsFromTimeStr(b.startTime) + (b.duration || 60) + CONFIG.CLEANUP_BUFFER, 
            resourceType: rType,
            staffName: b.staffId || b.staffName // Quan trọng: Phải lấy ID staff
        };
    });

    // 2. CHECK TỔNG TẢI (LEVEL 0)
    // Kiểm tra nhanh: Nếu tổng số người trong tiệm > 12 thì từ chối ngay.
    // (Check trong 1 phút đầu tiên của request)
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
        return { feasible: false, reason: "Tiệm đang quá tải (Full House 12/12)." };
    }

    // 3. PHÂN LOẠI KHÁCH MỚI
    let singleGuests = [];
    let comboGuests = [];

    for (let i = 0; i < guestList.length; i++) {
        const g = guestList[i];
        const svc = SERVICES[g.serviceCode];
        if (!svc) return { feasible: false, reason: `Lỗi dịch vụ: ${g.serviceCode} không tồn tại.` };

        const guestData = {
            id: i,
            serviceCode: g.serviceCode,
            serviceName: svc.name,
            staffReq: g.staffName,
            price: svc.price,
            duration: svc.duration,
            type: svc.type,     // 'BED', 'CHAIR'
            category: svc.category // 'COMBO', 'BODY', 'FOOT'
        };

        if (svc.category === 'COMBO') comboGuests.push(guestData);
        else singleGuests.push(guestData);
    }

    let tentativeBookings = []; // Danh sách booking dự kiến cho nhóm khách này
    let finalDetails = new Array(guestList.length);

    // ========================================================================
    // BƯỚC 4: XẾP KHÁCH LẺ TRƯỚC (Ưu tiên dễ làm trước)
    // ========================================================================
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; 
        
        const allCurrent = [...committedBookings, ...tentativeBookings];
        
        // 4.1 Check Resource (Ghế hoặc Giường)
        if (!checkResourceCapacity(guest.type, start, end, allCurrent)) {
            return { feasible: false, reason: `Hết ${guest.type === 'BED' ? 'Giường' : 'Ghế'} cho dịch vụ ${guest.serviceName}.` };
        }

        // 4.2 Check Staff
        const assignedStaff = findAvailableStaff(guest.staffReq, start, end, staffList, allCurrent);
        if (!assignedStaff) {
            return { feasible: false, reason: `Không tìm thấy nhân viên phù hợp cho ${guest.serviceName}.` };
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

    // Nếu không có khách Combo nào thì trả về kết quả luôn
    if (comboGuests.length === 0) {
        return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((s, x) => s + x.price, 0) };
    }

    // ========================================================================
    // BƯỚC 5: XẾP KHÁCH COMBO VỚI "SMART SWAP"
    // ========================================================================
    
    /**
     * Hàm thử nghiệm một kịch bản xếp chỗ (Scenario)
     * @param {Array} scenarioConfig - Mảng chứa cấu hình mode cho từng khách ({ guestId, mode })
     * mode 'FB': Foot -> Body (Truyền thống)
     * mode 'BF': Body -> Foot (Đảo ngược - Smart Swap)
     */
    const tryScenario = (scenarioConfig) => {
        let scenarioBookings = JSON.parse(JSON.stringify(tentativeBookings)); // Copy booking của khách lẻ đã xếp
        let scenarioDetails = []; 

        for (const item of scenarioConfig) {
            const guest = comboGuests.find(g => g.id === item.guestId);
            const halfDuration = Math.floor(guest.duration / 2);
            
            // Tính toán thời gian Phase 1
            const p1Start = requestStartMins;
            const p1End = p1Start + halfDuration; 
            const p1BlockEnd = p1End + CONFIG.CLEANUP_BUFFER;
            
            // Tính toán thời gian Phase 2 (Có Transition Buffer 5 phút)
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            const p2End = p2Start + halfDuration;
            const p2BlockEnd = p2End + CONFIG.CLEANUP_BUFFER;
            
            // Nhân viên phải rảnh từ đầu đến cuối (bao gồm cả lúc nghỉ giữa 2 phase)
            const staffEnd = p2End; 

            // Xác định tài nguyên dựa trên Mode
            let phase1Res, phase2Res;
            if (item.mode === 'FB') {
                phase1Res = 'CHAIR'; // Làm chân trước
                phase2Res = 'BED';   // Làm mình sau
            } else {
                phase1Res = 'BED';   // Làm mình trước
                phase2Res = 'CHAIR'; // Làm chân sau
            }

            // --- CHECK PHASE 1 ---
            let allBusy = [...committedBookings, ...scenarioBookings];
            if (!checkResourceCapacity(phase1Res, p1Start, p1BlockEnd, allBusy)) return null; // Fail Phase 1

            // --- CHECK PHASE 2 ---
            // Thêm booking ảo của Phase 1 vào danh sách bận để check Phase 2
            // Mục đích: đảm bảo Phase 2 không đụng độ với các khách khác
            allBusy.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: 'TEMP_RESERVATION' });
            
            if (!checkResourceCapacity(phase2Res, p2Start, p2BlockEnd, allBusy)) return null; // Fail Phase 2

            // --- CHECK STAFF ---
            // Tìm nhân viên rảnh xuyên suốt cả 2 phase
            // Lưu ý: Danh sách busy phải bao gồm cả Phase 1 và Phase 2 của các khách TRONG CÙNG kịch bản này
            const staff = findAvailableStaff(guest.staffReq, p1Start, staffEnd, staffList, [...committedBookings, ...scenarioBookings]);
            if (!staff) return null; // Không có nhân viên

            // --- THÀNH CÔNG CHO KHÁCH NÀY -> LƯU VÀO MẢNG TẠM ---
            scenarioBookings.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: staff });
            scenarioBookings.push({ start: p2Start, end: p2BlockEnd, resourceType: phase2Res, staffName: staff });

            scenarioDetails.push({
                guestIndex: guest.id,
                staff: staff,
                service: guest.serviceName + (item.mode === 'BF' ? ' (Làm Body trước)' : ''),
                price: guest.price,
                mode: item.mode, 
                timeStr: `${timeStr} - ${getTimeStrFromMins(p2End)}`
            });
        }
        return scenarioDetails; // Trả về chi tiết nếu thành công xếp hết cả nhóm
    };

    // --- CHIẾN LƯỢC 1: THỬ 'FB' CHO TẤT CẢ (TRUYỀN THỐNG) ---
    // Ưu tiên cách này vì quy trình chuẩn thường là ngâm chân trước.
    const configFB = comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }));
    let successScenario = tryScenario(configFB);

    // --- CHIẾN LƯỢC 2: THỬ 'BF' CHO TẤT CẢ (ĐẢO NGƯỢC) ---
    // Nếu cách 1 fail (do hết ghế), thử đưa tất cả lên giường làm Body trước.
    if (!successScenario) {
        const configBF = comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }));
        successScenario = tryScenario(configBF);
    }

    // --- CHIẾN LƯỢC 3: THỬ TÁCH NHÓM (SPLIT / MIXED) ---
    // Nếu cả 2 cách trên đều fail (ví dụ còn 1 ghế, 1 giường).
    // Ta dùng Hoán vị (Permutation) để thử mọi tổ hợp.
    if (!successScenario && comboGuests.length >= 2) {
        const count = comboGuests.length;
        // Giới hạn thử tối đa 32 trường hợp (2^5) để đảm bảo performance server
        // Nếu đoàn > 5 người combo thì chấp nhận rủi ro fail nếu quá lẻ tẻ.
        const totalPermutations = Math.min(1 << count, 32); 

        for (let i = 1; i < totalPermutations - 1; i++) {
            const splitConfig = [];
            for (let j = 0; j < count; j++) {
                // Bit 1 -> Mode BF, Bit 0 -> Mode FB
                const mode = ((i >> j) & 1) ? 'BF' : 'FB';
                splitConfig.push({ guestId: comboGuests[j].id, mode: mode });
            }
            successScenario = tryScenario(splitConfig);
            if (successScenario) break; // Tìm thấy phương án khả thi!
        }
    }

    // --- KẾT QUẢ ---
    if (successScenario) {
        // Gộp kết quả của khách Combo vào mảng tổng
        successScenario.forEach(item => { finalDetails[item.guestIndex] = item; });
        
        return {
            feasible: true,
            details: finalDetails,
            totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0)
        };
    } else {
        return { 
            feasible: false, 
            reason: "Rất tiếc, hệ thống đã thử đảo quy trình (Làm Body trước) và tách nhóm nhưng vẫn không đủ Ghế/Giường." 
        };
    }
}

module.exports = {
    checkRequestAvailability,
    setDynamicServices,
    get SERVICES() { return SERVICES; },
    CONFIG,
    getMinsFromTimeStr,
    getTimeStrFromMins,
    getTaipeiNow
};
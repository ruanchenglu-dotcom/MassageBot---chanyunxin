/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V3.4 (STABLE RELEASE - STRICT TIME & SMART COMBO)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/10
 * * * * TÍNH NĂNG NỔI BẬT (HIGHLIGHTS):
 * 1. [SMART COMBO]: Tự động thử 2 kịch bản (Ghế->Giường hoặc Giường->Ghế) để tìm chỗ trống.
 * 2. [STRICT TIME MODE]: 
 * - Đọc thuộc tính 'isStrictTime' từ nhân viên.
 * - Nếu TRUE: Không nhận khách nếu giờ kết thúc vượt quá giờ tan ca.
 * - Nếu FALSE: Nhận khách tăng ca (OT) miễn là khách vào trước giờ tan ca.
 * 3. [RESOURCE SAFEGUARD]: Đảm bảo không bao giờ nhận quá số ghế/giường thực tế.
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

// Cơ sở dữ liệu dịch vụ (Sẽ được cập nhật từ Google Sheet thông qua hàm setDynamicServices)
let SERVICES = {}; 

/**
 * Cập nhật danh sách dịch vụ từ bên ngoài (Backend/Sheet)
 * @param {Object} newServicesObj - Danh sách dịch vụ mới
 */
function setDynamicServices(newServicesObj) {
    // Các dịch vụ hệ thống mặc định (Không thể xóa)
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' } // Dùng để đánh dấu khách đến trễ
    };
    
    // Gộp dịch vụ mới và dịch vụ hệ thống
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE KERNEL] Services Database Updated: ${Object.keys(SERVICES).length} entries active.`);
}

// ============================================================================
// PHẦN 2: BỘ CÔNG CỤ XỬ LÝ THỜI GIAN (TIME UTILITIES)
// ============================================================================

/**
 * Lấy thời gian hiện tại chuẩn múi giờ Đài Loan (UTC+8)
 * @returns {Date} Đối tượng Date
 */
function getTaipeiNow() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const taipeiOffset = 8;
    return new Date(utc + (3600000 * taipeiOffset));
}

/**
 * Chuyển đổi chuỗi giờ "HH:mm" thành tổng số phút trong ngày
 * Ví dụ: "01:00" (sáng hôm sau) -> 25 * 60 = 1500 phút
 * @param {string} timeStr - Chuỗi giờ
 * @returns {number} Số phút (Hoặc -1 nếu lỗi)
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; 
    try {
        // Chuẩn hóa chuỗi (thay dấu ： thành :)
        let cleanStr = timeStr.toString().trim().replace(/：/g, ':');
        const parts = cleanStr.split(':');
        if (parts.length < 2) return -1;

        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);

        if (isNaN(h) || isNaN(m)) return -1;

        // Xử lý giờ qua đêm (Ví dụ quán mở từ 8h sáng, thì 1h sáng = 25h)
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
 * Chuyển đổi số phút ngược lại thành chuỗi "HH:mm"
 * @param {number} mins - Tổng số phút
 * @returns {string} Chuỗi giờ hiển thị
 */
function getTimeStrFromMins(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    // Chuẩn hóa lại về 24h (ví dụ 25h -> 01h)
    if (h >= 24) h -= 24; 
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Kiểm tra xem 2 khoảng thời gian có trùng nhau không
 * Logic: (StartA < EndB) AND (StartB < EndA)
 */
function isOverlap(startA, endA, startB, endB) {
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

// ============================================================================
// PHẦN 3: KIỂM TRA TÀI NGUYÊN & NHÂN VIÊN (CORE CHECKING)
// ============================================================================

/**
 * Kiểm tra sức chứa của Tài Nguyên (Giường/Ghế) tại một khoảng thời gian
 * @param {string} resourceType - 'BED', 'CHAIR', hoặc 'TOTAL'
 * @param {number} start - Phút bắt đầu
 * @param {number} end - Phút kết thúc
 * @param {Array} bookings - Danh sách các booking đã có
 * @returns {boolean} True nếu còn chỗ, False nếu đã đầy
 */
function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; // Loại tài nguyên không giới hạn

    // Thuật toán quét điểm (Line Sweep) để tìm số lượng khách tối đa tại mọi thời điểm
    let points = [];
    for (const bk of bookings) {
        let isRelevant = (resourceType === 'TOTAL') ? true : (bk.resourceType === resourceType);
        
        // Chỉ xét những booking có dính líu đến khoảng thời gian đang check
        if (isRelevant && isOverlap(start, end, bk.start, bk.end)) {
            // Cắt gọn khoảng thời gian check để tối ưu
            let pStart = Math.max(start, bk.start);
            let pEnd = Math.min(end, bk.end);
            
            if (pEnd - pStart > CONFIG.TOLERANCE) {
                points.push({ time: pStart, type: 'start' });
                points.push({ time: pEnd, type: 'end' });
            }
        }
    }

    if (points.length === 0) return true; // Không có ai trùng giờ -> Còn chỗ

    // Sắp xếp điểm thời gian
    points.sort((a, b) => (a.time === b.time) ? (a.type === 'start' ? -1 : 1) : (a.time - b.time));

    let currentLoad = 0;
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else currentLoad--;
        
        // Nếu tại bất kỳ thời điểm nào tải > giới hạn -> Fail
        if (currentLoad >= limit) return false; 
    }
    return true; 
}

/**
 * [CRITICAL UPDATE V3.4] Hàm tìm nhân viên phù hợp
 * Xử lý logic Strict Time (Về đúng giờ) vs Flexible (Tăng ca)
 * * @param {string} staffReq - Yêu cầu nhân viên ('RANDOM', 'MALE', 'FEMALE', hoặc Tên cụ thể)
 * @param {number} start - Phút bắt đầu dịch vụ
 * @param {number} end - Phút kết thúc dịch vụ
 * @param {Object} staffListRef - Danh sách toàn bộ nhân viên (kèm thuộc tính isStrictTime)
 * @param {Array} busyList - Danh sách các booking đã cam kết (để check trùng)
 * @returns {string|null} Tên nhân viên tìm được hoặc null
 */
function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    
    // Hàm con: Kiểm tra 1 nhân viên cụ thể
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        
        // 1. Check cơ bản: Có tồn tại và không OFF
        if (!staffInfo || staffInfo.off) return false; 
        
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        if (shiftStart === -1 || shiftEnd === -1) return false; 

        // 2. Check Giờ Bắt đầu (Start Time Rule)
        // Quy tắc chung: Khách không thể đến trước khi nhân viên đi làm
        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;

        // 3. Check Giờ Kết thúc & Chế độ Về Đúng Giờ (End Time & Strict Mode Logic)
        // Đây là phần cập nhật quan trọng nhất của V3.4
        const isStrict = staffInfo.isStrictTime === true; // Lấy trạng thái Checkbox

        if (isStrict) {
            // === CHẾ ĐỘ NGHIÊM NGẶT (STRICT) ===
            // Nhân viên muốn về đúng giờ, không nhận thêm việc lố giờ.
            // Điều kiện: Thời gian KẾT THÚC của khách phải <= Giờ tan ca.
            if ((end - CONFIG.TOLERANCE) > shiftEnd) {
                // console.log(`[REJECT] ${name} is Strict. Finish ${end} > ShiftEnd ${shiftEnd}`);
                return false; 
            }
        } else {
            // === CHẾ ĐỘ LINH HOẠT (FLEXIBLE / OT) ===
            // Nhân viên chấp nhận làm quá giờ (tăng ca).
            // Điều kiện: Chỉ cần Khách VÀO (Bắt đầu) trước khi hết giờ làm việc chính thức.
            // Ví dụ: Ca đến 22:00. Khách vào 21:55 làm 60p -> OK. Khách vào 22:05 -> Fail.
            if ((start + CONFIG.TOLERANCE) >= shiftEnd) {
                // console.log(`[REJECT] ${name} OT Mode. Start ${start} >= ShiftEnd ${shiftEnd}`);
                return false;
            }
        }

        // 4. Check Trùng lịch với khách khác (Conflict Check)
        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

        // 5. Check Giới tính (Nếu yêu cầu Random có lọc giới tính)
        // Lưu ý: Nếu khách chọn đích danh (Specific) thì bỏ qua check giới tính ở đây
        if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
        if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;

        return true; // Thỏa mãn tất cả điều kiện
    };

    // --- LOGIC ĐIỀU PHỐI ---
    if (staffReq && staffReq !== 'RANDOM' && staffReq !== 'MALE' && staffReq !== 'FEMALE' && staffReq !== '隨機' && staffReq !== 'Any') {
        // Trường hợp 1: Khách chọn đích danh (Ví dụ: "Số 99")
        return checkOneStaff(staffReq) ? staffReq : null;
    } else {
        // Trường hợp 2: Khách chọn Random / Nam / Nữ
        // Duyệt qua tất cả nhân viên để tìm người phù hợp
        const allStaffNames = Object.keys(staffListRef);
        // Có thể thêm logic xáo trộn (shuffle) ở đây để công bằng, nhưng tạm thời duyệt tuần tự
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

// ============================================================================
// PHẦN 4: LOGIC XỬ LÝ YÊU CẦU CHÍNH (MAIN PROCESSING)
// ============================================================================

/**
 * Hàm trung tâm xử lý yêu cầu đặt lịch
 * @param {string} dateStr - Ngày đặt (YYYY/MM/DD)
 * @param {string} timeStr - Giờ đặt (HH:mm)
 * @param {Array} guestList - Danh sách khách và dịch vụ yêu cầu
 * @param {Array} currentBookingsRaw - Danh sách booking hiện tại từ Google Sheet
 * @param {Object} staffList - Danh sách nhân viên (đã cấu trúc dạng Map)
 * @returns {Object} Kết quả { feasible: boolean, reason: string, details: Array }
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    // 1. Parse thời gian yêu cầu
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "時間格式錯誤 (Invalid Time Format)" };
    
    // =================================================================
    // 2. CHUẨN HÓA DỮ LIỆU ĐANG CÓ (SMART SPLIT)
    // Biến đổi các booking Combo cũ thành các block thời gian cụ thể (Ghế & Giường)
    // để tính toán tài nguyên chính xác hơn.
    // =================================================================
    let committedBookings = [];

    currentBookingsRaw.forEach(b => {
        const startMins = getMinsFromTimeStr(b.startTime);
        if (startMins === -1) return;

        let rType = 'CHAIR'; 
        let isCombo = false;
        let duration = b.duration || 60; 
        
        // Xác định loại tài nguyên dựa trên Service Code hoặc Tên
        if (SERVICES[b.serviceCode]) {
            if (SERVICES[b.serviceCode].type) rType = SERVICES[b.serviceCode].type;
            if (SERVICES[b.serviceCode].category === 'COMBO') isCombo = true;
        } else {
            // Fallback nếu không tìm thấy Service Code (Dữ liệu cũ hoặc Admin nhập tay)
            if (b.serviceName.includes('Combo') || b.serviceName.includes('套餐')) isCombo = true;
            else if (b.serviceName.includes('Body') || b.serviceName.includes('指壓') || b.serviceName.includes('油')) rType = 'BED';
            else rType = 'CHAIR';
        }

        if (isCombo) {
            // Nếu là Combo đã đặt, giả định chia đôi thời gian 50/50
            const halfDuration = Math.floor(duration / 2);
            committedBookings.push({
                start: startMins,
                end: startMins + halfDuration, 
                resourceType: 'CHAIR',
                staffName: b.staffName
            });
            committedBookings.push({
                start: startMins + halfDuration + CONFIG.TRANSITION_BUFFER,
                end: startMins + duration, 
                resourceType: 'BED',
                staffName: b.staffName
            });
        } else {
            // Dịch vụ đơn
            committedBookings.push({
                start: startMins,
                end: startMins + duration,
                resourceType: rType,
                staffName: b.staffName
            });
        }
    });

    // 3. Safety Gate: Kiểm tra tổng số khách (Full House Check)
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
        return { feasible: false, reason: "目前預約已滿 (Full House - Max 12 Guests)" };
    }

    // 4. Phân loại khách trong Request mới
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

    let tentativeBookings = []; // Các booking tạm thời của nhóm khách này
    let finalDetails = new Array(guestList.length);

    // --- BƯỚC 4A: XẾP KHÁCH LẺ (SINGLE SERVICES) TRƯỚC ---
    // Vì khách lẻ dễ xếp hơn, ít chiếm dụng tài nguyên phức tạp
    for (const guest of singleGuests) {
        const start = requestStartMins;
        const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; 
        const allCurrent = [...committedBookings, ...tentativeBookings];
        
        // Check Tài Nguyên
        if (!checkResourceCapacity(guest.type, start, end, allCurrent)) {
            const resName = guest.type === 'BED' ? '指壓床 (Bed)' : '按摩椅 (Chair)';
            return { feasible: false, reason: `${resName} 已滿 (Resource Full)` };
        }

        // Check Nhân Viên (Gọi hàm findAvailableStaff mới)
        const assignedStaff = findAvailableStaff(guest.staffReq, start, end, staffList, allCurrent);
        if (!assignedStaff) return { feasible: false, reason: `該時段無可用技師 (No Staff Available): ${timeStr}` };

        // Ghi nhận thành công
        tentativeBookings.push({ start: start, end: end, resourceType: guest.type, staffName: assignedStaff });
        finalDetails[guest.id] = {
            guestIndex: guest.id, staff: assignedStaff, service: guest.serviceName, price: guest.price,
            timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
        };
    }

    // Nếu không có khách Combo nào thì xong việc
    if (comboGuests.length === 0) return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((s, x) => s + x.price, 0) };

    // --- BƯỚC 4B: XẾP KHÁCH COMBO (SMART BALANCE SCENARIO) ---
    // Thử các kịch bản: Chân trước (FB) hoặc Mình trước (BF) để lấp đầy chỗ trống
    
    const tryScenario = (scenarioConfig) => {
        let scenarioBookings = JSON.parse(JSON.stringify(tentativeBookings)); 
        let scenarioDetails = []; 

        for (const item of scenarioConfig) {
            const guest = comboGuests.find(g => g.id === item.guestId);
            const halfDuration = Math.floor(guest.duration / 2); 
            
            // Tính toán khung giờ cho 2 giai đoạn
            const p1Start = requestStartMins;
            const p1End = p1Start + halfDuration; 
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            const p2End = p2Start + halfDuration;
            const p1BlockEnd = p1End + CONFIG.CLEANUP_BUFFER;
            const p2BlockEnd = p2End + CONFIG.CLEANUP_BUFFER;
            const staffEnd = p2BlockEnd; // Nhân viên làm thông cả 2 giai đoạn

            // Xác định tài nguyên theo kịch bản
            // FB (Foot-Body): Ghế trước -> Giường sau
            // BF (Body-Foot): Giường trước -> Ghế sau
            let phase1Res = (item.mode === 'FB') ? 'CHAIR' : 'BED';
            let phase2Res = (item.mode === 'FB') ? 'BED' : 'CHAIR';

            let allBusy = [...committedBookings, ...scenarioBookings];

            // 1. Check Tài Nguyên Phase 1
            if (!checkResourceCapacity(phase1Res, p1Start, p1BlockEnd, allBusy)) return null; 
            // Đặt chỗ ảo (Placeholder) để check Phase 2 không bị trùng chính mình
            allBusy.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: 'TEMP' });
            
            // 2. Check Tài Nguyên Phase 2
            if (!checkResourceCapacity(phase2Res, p2Start, p2BlockEnd, allBusy)) return null; 

            // 3. Check Nhân Viên (Làm xuyên suốt từ đầu đến cuối)
            const staff = findAvailableStaff(guest.staffReq, p1Start, staffEnd, staffList, [...committedBookings, ...scenarioBookings]);
            if (!staff) return null; 

            // Thành công -> Ghi vào booking tạm
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
    
    // Kịch bản 1: Tất cả Chân trước (Ưu tiên)
    successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }))); 
    
    // Kịch bản 2: Tất cả Mình trước (Nếu kịch bản 1 hết ghế)
    if (!successScenario) successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }))); 
    
    // Kịch bản 3: Chia đôi (Smart Balance) - Một nửa Chân trước, Một nửa Mình trước
    if (!successScenario && comboGuests.length >= 2) {
        const splitConfig = [];
        for (let i = 0; i < comboGuests.length; i++) {
            // Nửa đầu list đi FB, nửa sau đi BF
            splitConfig.push({ guestId: comboGuests[i].id, mode: (i < Math.ceil(comboGuests.length/2)) ? 'FB' : 'BF' });
        }
        successScenario = tryScenario(splitConfig);
    }
    
    // Kịch bản 4: Chia đôi đảo ngược (Reverse Balance)
    if (!successScenario && comboGuests.length >= 2) {
        const splitConfig = [];
        for (let i = 0; i < comboGuests.length; i++) {
            splitConfig.push({ guestId: comboGuests[i].id, mode: (i < Math.ceil(comboGuests.length/2)) ? 'BF' : 'FB' });
        }
        successScenario = tryScenario(splitConfig);
    }

    // Kết luận
    if (successScenario) {
        successScenario.forEach(item => { finalDetails[item.guestIndex] = item; });
        return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0) };
    } else {
        return { feasible: false, reason: "無法安排：資源不足或技師忙碌 (Cannot Arrange: Resources Full or Staff Busy)" };
    }
}

// ============================================================================
// PHẦN 5: XUẤT KHẨU MODULE (MODULE EXPORT)
// ============================================================================
const CoreAPI = {
    checkRequestAvailability,
    setDynamicServices,
    get SERVICES() { return SERVICES; },
    CONFIG,
    getMinsFromTimeStr,
    getTaipeiNow
};

// Hỗ trợ cả môi trường Node.js (Backend) và Browser (Nếu cần Debug)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreAPI;
}

if (typeof window !== 'undefined') {
    window.ResourceCore = CoreAPI;
    window.checkRequestAvailability = CoreAPI.checkRequestAvailability;
    window.setDynamicServices = CoreAPI.setDynamicServices;
    console.log("✅ Resource Core V3.4 (ZH-TW): Loaded with STRICT TIME + SMART COMBO.");
}
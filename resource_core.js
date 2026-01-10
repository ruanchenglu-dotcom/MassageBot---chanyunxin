/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V5.0 (MAJOR UPGRADE: ELASTIC TIME OPTIMIZER)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/11
 *
 * * * * * CẬP NHẬT MỚI (V5.0):
 * 1. [ELASTIC TIME ENGINE]: Tích hợp bộ xử lý thời gian linh hoạt (Co giãn).
 * - Không còn fix cứng chia đôi 50/50 cho Combo.
 * - Tự động đọc cấu hình `elasticStep` (bước nhảy) và `elasticLimit` (giới hạn) từ Service.
 * - Thuật toán tự động thử các phương án: 50/50 -> 45/55 -> 55/45 -> ... để tìm khe trống.
 * 2. [SMART PRIORITY]: Ưu tiên xếp lịch chuẩn trước, chỉ co giãn khi thực sự cần thiết.
 * 3. [DATA INTEGRITY]: Giữ nguyên các bản vá lỗi Time Parser và Resource Type của V4.2.
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

// Cơ sở dữ liệu dịch vụ (Sẽ được cập nhật từ index.js)
let SERVICES = {}; 

/**
 * Cập nhật danh sách dịch vụ từ bên ngoài (Backend/Sheet)
 * V5.0: Đảm bảo không ghi đè các tham số elasticStep/elasticLimit
 */
function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE V5.0] Services Database Updated: ${Object.keys(SERVICES).length} entries (Ready for Elastic Mode).`);
}

// ============================================================================
// PHẦN 2: BỘ CÔNG CỤ XỬ LÝ THỜI GIAN (TIME UTILITIES)
// ============================================================================

function getTaipeiNow() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8)); // UTC+8
}

/**
 * Phân tích chuỗi giờ thành số phút trong ngày (0 - 1440)
 * Hỗ trợ các định dạng: "HH:mm", "YYYY-MM-DD HH:mm", "HH:mm:ss"
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; 
    try {
        let str = timeStr.toString();
        
        // Xử lý chuỗi Date ISO (ví dụ: "2026-10-01T15:00:00")
        if (str.includes('T') || str.includes(' ')) {
            const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) str = timeMatch[0];
        }

        let cleanStr = str.trim().replace(/：/g, ':');
        const parts = cleanStr.split(':');
        
        if (parts.length < 2) return -1;
        
        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);
        
        if (isNaN(h) || isNaN(m)) return -1;
        
        // Logic xử lý qua đêm (Nếu shop làm việc khuya)
        if (h < CONFIG.OPEN_HOUR) h += 24; 
        
        return (h * 60) + m;
    } catch (e) {
        console.error("Error parsing time:", timeStr, e);
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
    // Logic Overlap an toàn với dung sai
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

// ============================================================================
// PHẦN 3: LOGIC KIỂM TRA TÀI NGUYÊN (CAPACITY CHECK - LINE SWEEP)
// ============================================================================

/**
 * Kiểm tra sức chứa Tài Nguyên sử dụng thuật toán Quét Đường (Line Sweep)
 * Đảm bảo độ chính xác tuyệt đối khi check chồng lấn nhiều booking
 */
function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; 

    // Lọc ra các booking có liên quan đến khung giờ và loại tài nguyên này
    let relevantBookings = bookings.filter(bk => {
        let isTypeMatch = (resourceType === 'TOTAL') ? true : (bk.resourceType === resourceType);
        return isTypeMatch && isOverlap(start, end, bk.start, bk.end);
    });

    if (relevantBookings.length === 0) return true;

    // Tạo các điểm sự kiện (Events)
    let points = [];
    
    // Thêm điểm bắt đầu và kết thúc của khoảng thời gian cần check (Window)
    points.push({ time: start, type: 'check_start' });
    points.push({ time: end, type: 'check_end' });

    relevantBookings.forEach(bk => {
        points.push({ time: bk.start, type: 'start' });
        points.push({ time: bk.end, type: 'end' });
    });

    // Sắp xếp sự kiện theo thời gian
    points.sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        // Priority: Start Booking > Check Window > End Booking
        const priority = { 'start': 1, 'check_start': 2, 'check_end': 3, 'end': 4 };
        return priority[a.type] - priority[b.type];
    });

    let currentLoad = 0;
    
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else if (p.type === 'end') currentLoad--;
        
        // Chỉ kiểm tra quá tải NẾU điểm thời gian nằm trong khoảng cần check
        if (p.time >= start && p.time < end) {
             if (currentLoad > limit) {
                 return false; // QUÁ TẢI
             }
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
// PHẦN 5: BỘ HELPER SINH BIẾN THỂ THỜI GIAN (ELASTIC GENERATOR) [NEW V5.0]
// ============================================================================

/**
 * Hàm sinh ra danh sách các cặp thời gian (Phase1, Phase2)
 * Dựa trên tổng thời gian, bước nhảy (step) và giới hạn (limit)
 */
function generateElasticSplits(totalDuration, step = 0, limit = 0) {
    const standardHalf = Math.floor(totalDuration / 2);
    
    // 1. Luôn thêm phương án CHUẨN (50/50) đầu tiên
    let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];

    // Nếu không có cấu hình co giãn hoặc step = 0, trả về chuẩn ngay
    if (!step || !limit || step <= 0 || limit <= 0) {
        return options;
    }

    // 2. Sinh các biến thể dựa trên limit
    // Ví dụ: Step 5, Limit 20 -> Thử lệch 5, 10, 15, 20
    let currentDeviation = step;
    while (currentDeviation <= limit) {
        // Biến thể A: Phase 1 giảm, Phase 2 tăng (Ví dụ: Chân ít hơn)
        // Kiểm tra an toàn: Không để phase nào < 15 phút (trừ khi tổng quá ngắn)
        let p1_A = standardHalf - currentDeviation;
        let p2_A = totalDuration - p1_A;
        if (p1_A >= 15 && p2_A >= 15) {
            options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
        }

        // Biến thể B: Phase 1 tăng, Phase 2 giảm (Ví dụ: Chân nhiều hơn)
        let p1_B = standardHalf + currentDeviation;
        let p2_B = totalDuration - p1_B;
        if (p1_B >= 15 && p2_B >= 15) {
            options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
        }

        currentDeviation += step;
    }

    // Sắp xếp options: Ưu tiên deviation thấp (Gần chuẩn nhất)
    // Để thuật toán thử 50/50 -> 45/55 -> 40/60...
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    
    return options;
}

// ============================================================================
// PHẦN 6: BỘ XỬ LÝ TRUNG TÂM - GLOBAL OPTIMIZER (MAIN LOGIC)
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ========================================================================
    // BƯỚC A: PHÂN LOẠI & TIỀN XỬ LÝ DỮ LIỆU (PRE-PROCESSING)
    // ========================================================================
    
    let hardBookings = [];
    let flexibleIntentions = []; // Chứa cả Old Combo và New Combo
    let processedFlexibleStaff = new Set();
    let sortedBookings = [...currentBookingsRaw].sort((a,b) => getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime));

    sortedBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO';
        // Fallback nhận diện combo qua tên
        if (!svcInfo.category && (b.serviceName.includes('Combo') || b.serviceName.includes('套餐'))) isCombo = true;

        let duration = b.duration || 60;
        
        // [LOGIC KHÁCH CŨ]
        // Nếu là Combo và bắt đầu SAU thời điểm đang check -> Có thể điều chỉnh (Flexible)
        // Nhưng để đơn giản và an toàn, V5.0 sẽ coi khách cũ là "bán cố định"
        // Chỉ khách MỚI mới áp dụng Co Giãn mạnh mẽ. Khách cũ giữ nguyên 50/50 để tránh làm phiền.
        // Tuy nhiên, logic dưới đây vẫn cho phép gom nhóm nếu cần.
        
        // Phân loại tài nguyên cho khách cũ (Hard Booking)
        let rType = svcInfo.type || 'CHAIR'; 
        const nameUpper = b.serviceName.toUpperCase();
        
        if (nameUpper.includes('BODY') || nameUpper.includes('指壓') || nameUpper.includes('油') || nameUpper.includes('BED')) {
            rType = 'BED';
        } else if (isCombo || nameUpper.includes('COMBO') || nameUpper.includes('套餐')) {
             // Combo cũ đang diễn ra -> Ưu tiên giữ Bed để an toàn
             rType = 'BED';
        }
        
        hardBookings.push({ 
            start: bStart, 
            end: bStart + duration, 
            resourceType: rType, 
            staffName: b.staffName 
        });
    });

    // --- Xử lý Khách Mới (Request Guests) ---
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
            category: svc.category,
            // [NEW V5.0] Lấy thông tin Elastic
            elasticStep: svc.elasticStep || 0,
            elasticLimit: svc.elasticLimit || 0
        };

        if (svc.category === 'COMBO') {
            flexibleIntentions.push(guestObj);
            newComboGuests.push(guestObj);
        } else {
            newSingleGuests.push(guestObj);
        }
    });

    // ========================================================================
    // BƯỚC B: XẾP KHÁCH MỚI LẺ (SINGLE) TRƯỚC (STANDARD FIT)
    // ========================================================================
    // Khách lẻ (Chân/Body) dễ xếp nhất nên ưu tiên xếp trước để chiếm chỗ cứng.
    
    let baseTimeline = [...hardBookings]; // Timeline cơ sở
    let finalDetails = new Array(guestList.length);

    for (const g of newSingleGuests) {
        const start = requestStartMins;
        const end = start + g.duration + CONFIG.CLEANUP_BUFFER;
        
        // Check Tài nguyên
        if (!checkResourceCapacity(g.type, start, end, baseTimeline)) {
             return { feasible: false, reason: `資源不足 (Resource Full): ${g.type}` };
        }

        // Tìm Staff (Tránh trùng với hardBookings)
        const staff = findAvailableStaff(g.staffReq, start, end, staffList, baseTimeline);
        if (!staff) return { feasible: false, reason: `無可用技師 (No Staff): ${g.staffReq || 'Random'}` };

        baseTimeline.push({ start: start, end: end, resourceType: g.type, staffName: staff });
        
        finalDetails[g.id] = {
            guestIndex: g.id, 
            staff: staff, 
            service: g.serviceName, 
            price: g.price, 
            timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
        };
    }

    // Nếu không có khách Combo nào -> Check Tổng và Return
    if (flexibleIntentions.length === 0) {
         if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 10, baseTimeline))
            return { feasible: false, reason: "Full House (Max Guests)" };
            
         return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((a,b)=>a+(b?b.price:0),0) };
    }

    // ========================================================================
    // BƯỚC C: THUẬT TOÁN CO GIÃN THỜI GIAN (ELASTIC TIME SIMULATION) [CORE V5.0]
    // ========================================================================
    // Thay vì thử theo kịch bản (Scenario), ta sẽ thử từng khách Combo một.
    // Với mỗi khách, ta thử các biến thể thời gian từ Chuẩn -> Lệch nhiều nhất.
    
    // Copy timeline hiện tại để bắt đầu giả lập
    let currentSimulation = JSON.parse(JSON.stringify(baseTimeline));
    let comboSuccessCount = 0;

    for (const guest of flexibleIntentions) {
        let isGuestFitted = false;

        // 1. Sinh ra các phương án chia giờ (Splits)
        // Kết quả trả về dạng: [{p1:50, p2:50}, {p1:45, p2:55}, {p1:55, p2:45}...]
        const splitOptions = generateElasticSplits(guest.duration, guest.elasticStep, guest.elasticLimit);

        // 2. Thử từng phương án chia giờ
        for (const split of splitOptions) {
            // Với mỗi cách chia giờ, thử 2 chế độ: FB (Foot-Body) và BF (Body-Foot)
            // Ưu tiên FB (Foot trước) vì quy trình chuẩn thường là vậy.
            const modes = ['FB', 'BF'];
            
            for (const mode of modes) {
                const p1Res = (mode === 'FB') ? 'CHAIR' : 'BED';
                const p2Res = (mode === 'FB') ? 'BED' : 'CHAIR';
                
                const tStart = requestStartMins;
                const p1End = tStart + split.p1;
                const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                const p2End = p2Start + split.p2;
                const fullEnd = p2End + CONFIG.CLEANUP_BUFFER;

                // Check Tài nguyên Phase 1
                if (!checkResourceCapacity(p1Res, tStart, p1End + CONFIG.CLEANUP_BUFFER, currentSimulation)) continue;
                
                // Check Tài nguyên Phase 2
                // Lưu ý: Phải giả định Phase 1 đã chiếm chỗ khi check Phase 2
                // Tạo timeline tạm cho bước này
                let tempTimelineForCheck = [...currentSimulation, { start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: 'TEMP' }];
                
                if (!checkResourceCapacity(p2Res, p2Start, fullEnd, tempTimelineForCheck)) continue;

                // Check Staff (Phải rảnh toàn bộ thời gian)
                // Staff phải rảnh: Phase 1 + Buffer + Phase 2
                const staffParams = [...currentSimulation]; // Staff bận theo lịch hiện tại
                const assignedStaff = findAvailableStaff(guest.staffReq, tStart, fullEnd, staffList, staffParams);
                
                if (assignedStaff) {
                    // ==> TÌM THẤY KHE TRỐNG PHÙ HỢP! <==
                    
                    // Cập nhật Simulation Timeline (để khách sau né ra)
                    currentSimulation.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: assignedStaff });
                    currentSimulation.push({ start: p2Start, end: fullEnd, resourceType: p2Res, staffName: assignedStaff });

                    // Lưu kết quả
                    finalDetails[guest.id] = {
                        guestIndex: guest.id,
                        staff: assignedStaff,
                        service: guest.serviceName,
                        price: guest.price,
                        // [IMPORTANT] Trả về chi tiết chia giờ để Frontend vẽ
                        phase1_duration: split.p1,
                        phase2_duration: split.p2,
                        breakdown: `(足:${split.p1} → 身:${split.p2})`, // Text hiển thị
                        is_elastic: split.deviation !== 0, // Cờ báo hiệu có co giãn
                        mode: mode,
                        timeStr: `${timeStr} - ${getTimeStrFromMins(p2End)}`
                    };

                    isGuestFitted = true;
                    break; // Thoát vòng lặp Mode
                }
            } // End Loop Modes

            if (isGuestFitted) break; // Thoát vòng lặp Split Options (đã tìm được phương án tối ưu nhất)
        } // End Loop Splits

        if (isGuestFitted) {
            comboSuccessCount++;
        } else {
            // Nếu thử hết mọi cách (Splits + Modes) mà khách này vẫn không nhét vào được
            // => Thất bại toàn tập. (Backtracking có thể tốt hơn nhưng phức tạp hơn, Greedy này đủ dùng)
            return { feasible: false, reason: "Không tìm được giờ phù hợp (Elastic Failed)" };
        }
    } // End Loop Flexible Guests

    // ========================================================================
    // BƯỚC D: KIỂM TRA TỔNG THỂ CUỐI CÙNG (FINAL SAFETY CHECK)
    // ========================================================================

    if (comboSuccessCount === flexibleIntentions.length) {
        // Kiểm tra Total Capacity (Max 12 khách cùng lúc tại thời điểm bắt đầu)
        if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 5, currentSimulation)) {
            return { feasible: false, reason: "Quá tải tổng số khách (Max 12)" };
        }

        // Lọc bỏ các slot trống (null) trong finalDetails
        const cleanDetails = finalDetails.filter(d => d);
        
        return {
            feasible: true,
            strategy: 'ELASTIC_OPTIMIZED',
            details: cleanDetails,
            totalPrice: cleanDetails.reduce((sum, item) => sum + item.price, 0)
        };
    }

    return { feasible: false, reason: "Unknown Error" };
}

// ============================================================================
// PHẦN 7: MODULE EXPORT
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
    console.log("✅ Resource Core V5.0: Loaded with Elastic Time Engine.");
}
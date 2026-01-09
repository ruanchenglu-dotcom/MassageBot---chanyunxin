/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V4.2 (FIX: TIME PARSING & RESOURCE MISMATCH)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/10
 *
 * * * * * CẬP NHẬT MỚI (V4.2):
 * 1. [CRITICAL FIX] TIME PARSER: Nâng cấp bộ đọc giờ để xử lý được cả chuỗi Date-Time 
 * (ví dụ: "2026-10-01 14:00" vẫn hiểu là 14:00). Khắc phục lỗi đếm thiếu khách cũ.
 * 2. [RESOURCE INFERENCE]: Cải thiện logic đoán Tài nguyên (Giường/Ghế) cho khách cũ.
 * Khách Combo cũ sẽ được ưu tiên giữ Giường để tránh Overbooking.
 * 3. [CAPACITY CHECK]: Tăng độ chính xác khi kiểm tra tổng số khách (Total limit).
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
    console.log(`[CORE V4.2] Services Database Updated: ${Object.keys(SERVICES).length} entries.`);
}

// ============================================================================
// PHẦN 2: BỘ CÔNG CỤ XỬ LÝ THỜI GIAN (TIME UTILITIES - ENHANCED)
// ============================================================================

function getTaipeiNow() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8)); // UTC+8
}

/**
 * Phân tích chuỗi giờ thành số phút trong ngày (0 - 1440)
 * Nâng cấp V4.2: Xử lý được các định dạng "YYYY-MM-DD HH:mm", "HH:mm:ss", "T" separator
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; 
    try {
        let str = timeStr.toString();
        
        // Bước 1: Nếu chuỗi chứa ngày tháng (có khoảng trắng hoặc chữ T), tách lấy phần giờ
        // Ví dụ: "2026-10-01 15:00:00" -> lấy "15:00:00"
        if (str.includes('T') || str.includes(' ')) {
            // Regex tìm pattern HH:mm hoặc HH:mm:ss
            const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
                str = timeMatch[0]; // Lấy "15:00"
            }
        }

        // Bước 2: Làm sạch và parse
        let cleanStr = str.trim().replace(/：/g, ':');
        const parts = cleanStr.split(':');
        
        if (parts.length < 2) return -1;
        
        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);
        
        if (isNaN(h) || isNaN(m)) return -1;
        
        // Xử lý logic qua ngày (nếu shop mở 24h hoặc làm đêm, nhưng ở đây fix theo OPEN_HOUR)
        // Nếu input là 01:00 mà Open Hour là 08:00, hệ thống hiểu là 25:00 (1h sáng hôm sau)
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
    // Logic Overlap chuẩn: (StartA < EndB) và (StartB < EndA)
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

    // Tạo các điểm sự kiện (Vào/Ra) để quét
    let points = [];
    
    // Thêm điểm bắt đầu và kết thúc của khoảng thời gian cần check (Window)
    // Để đảm bảo ta check được tải tại mọi thời điểm trong window
    points.push({ time: start, type: 'check_start' });
    points.push({ time: end, type: 'check_end' });

    relevantBookings.forEach(bk => {
        points.push({ time: bk.start, type: 'start' });
        points.push({ time: bk.end, type: 'end' });
    });

    // Sắp xếp: Thời gian tăng dần
    points.sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        // Nếu cùng thời gian: Xử lý START (cộng tải) trước, sau đó mới đến các sự kiện khác
        // Thứ tự ưu tiên: start booking > check_start > check_end > end booking
        const priority = { 'start': 1, 'check_start': 2, 'check_end': 3, 'end': 4 };
        return priority[a.type] - priority[b.type];
    });

    let currentLoad = 0;
    // Pre-scan: Nếu có booking bắt đầu từ trước start window, ta cần tính load ban đầu
    // Tuy nhiên Line Sweep đã xử lý việc này bằng cách quét từ điểm nhỏ nhất.
    
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else if (p.type === 'end') currentLoad--;
        
        // Chỉ kiểm tra quá tải NẾU điểm thời gian nằm trong khoảng cần check (start -> end)
        // và không phải là điểm cuối cùng (vì điểm cuối là lúc khách ra về)
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
// PHẦN 5: BỘ XỬ LÝ TRUNG TÂM - GLOBAL OPTIMIZER (MAIN LOGIC)
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ========================================================================
    // BƯỚC A: PHÂN LOẠI & TIỀN XỬ LÝ DỮ LIỆU
    // ========================================================================
    
    let hardBookings = [];
    let flexibleIntentions = [];
    
    // Set này dùng để ghi nhớ Staff nào đã được tính là "Flexible" rồi.
    let processedFlexibleStaff = new Set();

    // Sắp xếp booking cũ theo giờ để xử lý thứ tự chuẩn
    let sortedBookings = [...currentBookingsRaw].sort((a,b) => getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime));

    sortedBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        
        // [FIX V4.2] Nếu parse lỗi, log warning nhưng không crash.
        // Cố gắng cứu vãn bằng cách bỏ qua hoặc gán mặc định (ở đây chọn bỏ qua để an toàn)
        if (bStart === -1) {
            console.warn(`[CORE] Skipped booking due to time error: ${b.startTime}`);
            return;
        }

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO';
        // Fallback nhận diện qua tên
        if (!svcInfo.category && (b.serviceName.includes('Combo') || b.serviceName.includes('套餐'))) isCombo = true;

        let duration = b.duration || 60;
        
        // LOGIC "FLEXIBLE" (Khách cũ có thể đảo chiều):
        // Chỉ áp dụng nếu booking bắt đầu SAU hoặc CÙNG LÚC request mới.
        if (isCombo && bStart >= requestStartMins) {
             if (processedFlexibleStaff.has(b.staffName)) return; 
             
             flexibleIntentions.push({
                 source: 'OLD',
                 staffName: b.staffName,
                 start: bStart,
                 duration: svcInfo.duration || 90, 
                 price: 0,
                 serviceName: b.serviceName
             });
             
             processedFlexibleStaff.add(b.staffName);

        } else {
            // LOGIC "HARD" (Khách cũ đã an bài / đang diễn ra):
            // [FIX V4.2]: Cải thiện logic đoán Resource Type
            
            let rType = svcInfo.type || 'CHAIR'; 
            
            const nameUpper = b.serviceName.toUpperCase();
            
            // 1. Nếu tên có Body/Oil/Pressure -> Chắc chắn là BED
            if (nameUpper.includes('BODY') || nameUpper.includes('指壓') || nameUpper.includes('油') || nameUpper.includes('BED')) {
                rType = 'BED';
            }
            // 2. [FIX V4.2] Nếu là Combo hoặc Set (套餐) đang diễn ra:
            // Để an toàn và tránh báo ảo "Còn chỗ" khi thực tế giường đã full, ta ưu tiên gán là BED.
            // (Vì Combo thường tốn Giường nhiều hơn hoặc quan trọng hơn Ghế)
            else if (isCombo || nameUpper.includes('COMBO') || nameUpper.includes('套餐') || nameUpper.includes('SET')) {
                 rType = 'BED';
            }
            
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
        
        // Check Tài nguyên riêng (Giường/Ghế)
        if (!checkResourceCapacity(g.type, start, end, tentativeHardBookings)) {
             return { feasible: false, reason: `資源不足 (Resource Full): ${g.type}` };
        }

        // Tìm Staff
        let allBusyStaffRanges = [...tentativeHardBookings];
        flexibleIntentions.forEach(f => {
            if (f.source === 'OLD') {
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

    // Nếu không có Combo nào cần tính -> Check tổng rồi Return
    if (flexibleIntentions.length === 0) {
         // [FIX V4.2] Check Total Capacity một cách cẩn thận với toàn bộ danh sách
         if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 10, tentativeHardBookings))
            return { feasible: false, reason: "Full House (Max 12 Guests)" };
            
         return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((a,b)=>a+(b?b.price:0),0) };
    }

    // ========================================================================
    // BƯỚC C: GIẢ LẬP ĐA VŨ TRỤ (MULTIVERSE SIMULATION)
    // ========================================================================

    const scenarios = ['ALL_FB', 'ALL_BF', 'BALANCE_A', 'BALANCE_B'];
    
    for (const scenName of scenarios) {
        // Deep copy danh sách hard bookings hiện tại để làm nền tảng cho kịch bản này
        let simulationBookings = JSON.parse(JSON.stringify(tentativeHardBookings)); 
        let scenarioValid = true;
        let scenarioDetails = []; 

        for (let i = 0; i < flexibleIntentions.length; i++) {
            const item = flexibleIntentions[i];
            const half = Math.floor(item.duration / 2);
            
            // Quyết định chiến thuật đảo (Foot-Body hay Body-Foot) dựa trên kịch bản
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

            // 1. Kiểm tra tài nguyên Giai đoạn 1
            if (!checkResourceCapacity(p1Res, tStart, p1End + CONFIG.CLEANUP_BUFFER, simulationBookings)) {
                scenarioValid = false; break;
            }
            // Tạm giữ chỗ Giai đoạn 1
            simulationBookings.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: 'TEMP_P1' });

            // 2. Kiểm tra tài nguyên Giai đoạn 2
            if (!checkResourceCapacity(p2Res, p2Start, fullEnd, simulationBookings)) {
                scenarioValid = false; break;
            }

            // 3. Xử lý Staff (Chỉ với khách NEW, khách OLD đã có staff cố định)
            let assignedStaff = item.staffName; 
            if (item.source === 'NEW') {
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

            // 4. Chốt Booking vào Simulation cho vòng lặp kế tiếp
            simulationBookings.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: assignedStaff });
            simulationBookings.push({ start: p2Start, end: fullEnd, resourceType: p2Res, staffName: assignedStaff });
        }

        // 5. Kiểm tra TỔNG SỐ KHÁCH (TOTAL LIMIT) lần cuối
        if (scenarioValid) {
             // Kiểm tra tại thời điểm bắt đầu request xem tổng số người (bao gồm Old + New Single + New Combo + Old Combo) có vượt quá 12 không
             if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 5, simulationBookings)) {
                 scenarioValid = false;
             }
        }

        if (scenarioValid) {
            // Apply kết quả thành công
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

    return { feasible: false, reason: "Hết giường/ghế hoặc quá tải (All Plans Failed)" };
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
    console.log("✅ Resource Core V4.2 (Full Fix): Loaded & Ready.");
}
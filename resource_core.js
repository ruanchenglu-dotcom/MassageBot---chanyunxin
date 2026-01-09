/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V4.0 (GLOBAL OPTIMIZER - REVOLUTIONARY UPDATE)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/10
 * * * * * TÍNH NĂNG ĐỘT PHÁ (V4.0 HIGHLIGHTS):
 * 1. [GLOBAL RESHUFFLING]: Khi có khách mới, hệ thống tự động tính toán lại trật tự (Ghế<->Giường)
 * của cả khách CŨ (nếu là Combo) để tìm khe hở cho khách MỚI.
 * 2. [SMART RESOURCE BALANCE]: Giải quyết triệt để lỗi "Báo hết giường ảo" bằng cách chia tải 50/50.
 * 3. [STRICT TIME & OT]: Vẫn giữ nguyên logic kiểm soát giờ về của nhân viên.
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
    console.log(`[CORE V4] Services Database Updated: ${Object.keys(SERVICES).length} entries.`);
}

// ============================================================================
// PHẦN 2: BỘ CÔNG CỤ XỬ LÝ THỜI GIAN (TIME UTILITIES)
// ============================================================================

function getTaipeiNow() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8)); // UTC+8
}

function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; 
    try {
        let cleanStr = timeStr.toString().trim().replace(/：/g, ':');
        const parts = cleanStr.split(':');
        if (parts.length < 2) return -1;
        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m)) return -1;
        if (h < CONFIG.OPEN_HOUR) h += 24; 
        return (h * 60) + m;
    } catch (e) {
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

    // Tạo các điểm sự kiện (Vào/Ra)
    let points = [];
    // Thêm điểm bắt đầu và kết thúc của khoảng check để làm mốc
    points.push({ time: start, type: 'check_start' });
    points.push({ time: end, type: 'check_end' });

    relevantBookings.forEach(bk => {
        points.push({ time: bk.start, type: 'start' });
        points.push({ time: bk.end, type: 'end' });
    });

    // Sắp xếp: Thời gian tăng dần. Nếu trùng giờ, ưu tiên 'start' trước để tính tải max
    points.sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        // Priority: start > check_start > check_end > end
        const priority = { 'start': 1, 'check_start': 2, 'check_end': 3, 'end': 4 };
        return priority[a.type] - priority[b.type];
    });

    let currentLoad = 0;
    let maxLoadFound = 0;

    // Chạy mô phỏng timeline
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else if (p.type === 'end') currentLoad--;
        
        // Chỉ kiểm tra quá tải trong phạm vi thời gian yêu cầu (start -> end)
        if (p.time >= start && p.time < end) {
             if (currentLoad > limit) return false;
        }
    }
    return true; 
}

// ============================================================================
// PHẦN 4: LOGIC TÌM NHÂN VIÊN (STAFF FINDER - STRICT TIME UPDATED)
// ============================================================================

function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo || staffInfo.off) return false; 
        
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        if (shiftStart === -1 || shiftEnd === -1) return false; 

        // Rule 1: Khách không thể đến trước giờ làm
        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;

        // Rule 2: Strict Time vs Flexible
        const isStrict = staffInfo.isStrictTime === true;
        if (isStrict) {
            // Nghiêm ngặt: Phải xong trước giờ về
            if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
        } else {
            // Linh hoạt: Chỉ cần bắt đầu trước giờ về
            if (start > shiftEnd) return false;
        }

        // Rule 3: Trùng lịch
        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

        // Rule 4: Giới tính
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

/**
 * Hàm kiểm tra tính khả thi siêu cấp (V4.0)
 * Logic: Gom tất cả (Cũ + Mới) -> Thử sắp xếp lại Combo -> Kết luận
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    // 1. Validate Input
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ========================================================================
    // BƯỚC A: PHÂN LOẠI & TIỀN XỬ LÝ DỮ LIỆU
    // ========================================================================
    
    // Nhóm 1: Hard Blocks (Không thể thay đổi)
    // Bao gồm: Khách lẻ đã đặt, Combo đã qua giờ bắt đầu, hoặc dịch vụ đơn lẻ
    let hardBookings = [];
    
    // Nhóm 2: Flexible Combo Intentions (Ý định đặt Combo có thể đảo thứ tự)
    // Bao gồm: Combo cũ (trong tương lai) và Combo mới đang request
    let flexibleIntentions = [];

    // --- Xử lý Booking cũ từ Google Sheet ---
    currentBookingsRaw.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO';
        // Fallback nhận diện Combo qua tên
        if (!svcInfo.category && (b.serviceName.includes('Combo') || b.serviceName.includes('套餐'))) isCombo = true;

        let duration = b.duration || 60;
        
        // Nếu là Combo VÀ chưa diễn ra (tính tương đối so với request này để an toàn)
        // Lưu ý: Chỉ dám đảo lịch những khách có cùng giờ bắt đầu hoặc tương lai
        if (isCombo && bStart >= requestStartMins) {
             flexibleIntentions.push({
                 source: 'OLD',
                 staffName: b.staffName,
                 start: bStart,
                 duration: duration,
                 price: 0, // Giá cũ không quan trọng
                 serviceName: b.serviceName
             });
        } else {
            // Nếu là khách lẻ, hoặc Combo đã lỡ làm rồi -> Coi là Cứng (Fixed)
            // Cần tái tạo lại blocks cho đúng loại tài nguyên
            if (isCombo) {
                // Combo đã cứng (đã qua giờ) -> Mặc định FB (Ghế trước) cho an toàn hoặc giữ nguyên logic cũ
                const half = Math.floor(duration/2);
                hardBookings.push({ start: bStart, end: bStart+half, resourceType: 'CHAIR', staffName: b.staffName });
                hardBookings.push({ start: bStart+half+CONFIG.TRANSITION_BUFFER, end: bStart+duration, resourceType: 'BED', staffName: b.staffName });
            } else {
                let rType = svcInfo.type || 'CHAIR'; // Mặc định ghế
                if (b.serviceName.includes('Body') || b.serviceName.includes('指壓') || b.serviceName.includes('油')) rType = 'BED';
                hardBookings.push({ start: bStart, end: bStart+duration, resourceType: rType, staffName: b.staffName });
            }
        }
    });

    // --- Xử lý Khách Mới (Request) ---
    // Tách khách mới thành 2 phần: Khách Lẻ (vào Hard) và Khách Combo (vào Flexible)
    let newSingleGuests = [];
    let newComboGuests = [];

    guestList.forEach((g, index) => {
        const svc = SERVICES[g.serviceCode];
        if (!svc) return; // Skip invalid
        
        const guestObj = {
            id: index, // Để map lại kết quả
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
    // BƯỚC B: XẾP KHÁCH MỚI MÀ LÀ GÓI LẺ (SINGLE) TRƯỚC
    // ========================================================================
    // Khách lẻ không thể đổi loại tài nguyên, nên phải xếp cứng vào trước.
    // Đồng thời kiểm tra nhân viên cho họ.
    
    let tentativeHardBookings = [...hardBookings];
    let finalDetails = new Array(guestList.length);

    for (const g of newSingleGuests) {
        const start = requestStartMins;
        const end = start + g.duration + CONFIG.CLEANUP_BUFFER;
        
        // Check Tài nguyên
        if (!checkResourceCapacity(g.type, start, end, tentativeHardBookings)) {
             return { feasible: false, reason: `資源不足 (Resource Full): ${g.type}` };
        }

        // Check Nhân viên (Lưu ý: Lúc này chưa chốt nhân viên cho các Combo Flexible, nên tạm coi họ rảnh? 
        // KHÔNG, nhân viên của Combo Flexible đã bị xí chỗ trong khoảng giờ đó rồi, dù làm gì trước thì cũng bận)
        // -> Cần danh sách busy của cả Flexible
        let allBusyStaffRanges = [...tentativeHardBookings];
        flexibleIntentions.forEach(f => {
            if (f.source === 'OLD') {
                allBusyStaffRanges.push({ start: f.start, end: f.start + f.duration, staffName: f.staffName });
            }
        });

        const staff = findAvailableStaff(g.staffReq, start, end, staffList, allBusyStaffRanges);
        if (!staff) return { feasible: false, reason: `無可用技師 (No Staff): ${g.staffReq || 'Random'}` };

        // Thành công -> Đưa vào Hard
        tentativeHardBookings.push({ start: start, end: end, resourceType: g.type, staffName: staff });
        
        // Ghi kết quả
        finalDetails[g.id] = {
            guestIndex: g.id, staff: staff, service: g.serviceName, price: g.price, 
            timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
        };
    }

    // Nếu không còn ai cần xếp Combo -> Xong
    if (flexibleIntentions.length === 0) {
         if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins+1, tentativeHardBookings))
            return { feasible: false, reason: "Full House (12 Guests)" };
         return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((a,b)=>a+(b?b.price:0),0) };
    }

    // ========================================================================
    // BƯỚC C: GIẢ LẬP ĐA VŨ TRỤ (MULTIVERSE SIMULATION)
    // Thử các kịch bản sắp xếp cho nhóm Flexible (Cả cũ và mới)
    // ========================================================================

    // Các kịch bản chiến thuật:
    // 0: Tất cả Chân -> Giường (Truyền thống)
    // 1: Tất cả Giường -> Chân (Đảo ngược)
    // 2: Cân bằng (Xen kẽ 1-1)
    // 3: Cân bằng (Xen kẽ ngược)
    
    const scenarios = ['ALL_FB', 'ALL_BF', 'BALANCE_A', 'BALANCE_B'];
    
    for (const scenName of scenarios) {
        let simulationBookings = JSON.parse(JSON.stringify(tentativeHardBookings)); // Copy nền tảng
        let scenarioValid = true;
        let scenarioDetails = []; // Chỉ lưu chi tiết của khách NEW

        // Duyệt qua từng Combo trong "Bể chứa"
        for (let i = 0; i < flexibleIntentions.length; i++) {
            const item = flexibleIntentions[i];
            const half = Math.floor(item.duration / 2);
            
            // Quyết định Mode dựa trên kịch bản
            let mode = 'FB';
            if (scenName === 'ALL_FB') mode = 'FB';
            else if (scenName === 'ALL_BF') mode = 'BF';
            else if (scenName === 'BALANCE_A') mode = (i % 2 === 0) ? 'FB' : 'BF';
            else if (scenName === 'BALANCE_B') mode = (i % 2 === 0) ? 'BF' : 'FB';

            const p1Res = (mode === 'FB') ? 'CHAIR' : 'BED';
            const p2Res = (mode === 'FB') ? 'BED' : 'CHAIR';
            
            // Tính time blocks
            const tStart = item.start;
            const p1End = tStart + half;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            const p2End = p2Start + half;
            const fullEnd = p2End + CONFIG.CLEANUP_BUFFER;

            // 1. Check Tài nguyên Phase 1
            if (!checkResourceCapacity(p1Res, tStart, p1End + CONFIG.CLEANUP_BUFFER, simulationBookings)) {
                scenarioValid = false; break;
            }
            // Push ảo để giữ chỗ cho Phase 2 check
            simulationBookings.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: 'TEMP_SIM' });

            // 2. Check Tài nguyên Phase 2
            if (!checkResourceCapacity(p2Res, p2Start, fullEnd, simulationBookings)) {
                scenarioValid = false; break;
            }

            // 3. Xử lý Nhân viên (Chỉ quan trọng với Khách NEW, khách OLD đã có staff rồi)
            let assignedStaff = item.staffName; // Nếu là OLD
            if (item.source === 'NEW') {
                // Với khách mới, phải tìm nhân viên rảnh full time
                // Lưu ý: simulationBookings đã chứa các booking cứng và booking của vòng lặp trước
                assignedStaff = findAvailableStaff(item.staffReq, tStart, fullEnd, staffList, simulationBookings);
                if (!assignedStaff) {
                    scenarioValid = false; break;
                }
                // Lưu lại kết quả cho khách mới
                scenarioDetails.push({
                    guestIndex: item.guestRef.id,
                    staff: assignedStaff,
                    service: item.guestRef.serviceName,
                    price: item.guestRef.price,
                    mode: mode, // Quan trọng: Ghi nhớ Mode để Frontend biết
                    timeStr: `${timeStr} - ${getTimeStrFromMins(p2End)}`
                });
            }

            // Push thật vào simulation để các loop sau tính tiếp
            simulationBookings.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: assignedStaff });
            simulationBookings.push({ start: p2Start, end: fullEnd, resourceType: p2Res, staffName: assignedStaff });
        }

        // Check tổng Total Guests lần cuối cho kịch bản này
        if (scenarioValid) {
             if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins+1, simulationBookings)) {
                 scenarioValid = false;
             }
        }

        // Nếu kịch bản này OK -> CHỐT NGAY
        if (scenarioValid) {
            // Merge kết quả khách lẻ và khách combo mới
            scenarioDetails.forEach(d => { finalDetails[d.guestIndex] = d; });
            
            // Lọc bỏ các phần tử undefined (nếu có)
            const cleanDetails = finalDetails.filter(d => d);
            
            return {
                feasible: true,
                strategy: scenName, // Debug info
                details: cleanDetails,
                totalPrice: cleanDetails.reduce((sum, item) => sum + item.price, 0)
            };
        }
    }

    // Nếu chạy hết mọi kịch bản mà vẫn tạch
    return { feasible: false, reason: "Hết giường/ghế dù đã thử đảo lịch (All Configurations Failed)" };
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
    console.log("✅ Resource Core V4.0 (Global Optimizer): Loaded.");
}
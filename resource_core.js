/*
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL (SERVER SIDE)
 * FILE: resource_core.js
 * PHIÊN BẢN: V113.1 (EXPLICIT FLOW & DATA MAPPING SYNC)
 * NGÀY CẬP NHẬT: 2026/01/23
 * TÁC GIẢ: AI ASSISTANT & USER
 *
 * * * * * CHANGE LOG V113.1 (EXPLICIT FLOW SYNC) * * * * *
 * 1. [CRITICAL] EXPLICIT FLOW SUPPORT (Hỗ trợ luồng định danh):
 * - Tích hợp logic nhận diện mã 'FOOTSINGLE' (Chân/Ghế) và 'BODYSINGLE' (Body/Giường).
 * - Đồng bộ hoàn toàn với logic Frontend V112.4.
 * * 2. [GUARDRAIL UPGRADE] INTELLIGENT RESOURCE INFERENCE:
 * - Cập nhật hàm `inferResourceAtTime`: Ưu tiên Flow Code (Cột AA) hơn đoán tên dịch vụ.
 * - Đảm bảo tính toán tải trọng chính xác 100% theo ý định của Client.
 * * 3. [MAINTAIN] V113.0 FEATURES PRESERVED:
 * - Giữ nguyên Service Code Priority (Ưu tiên Mã Dịch Vụ).
 * - Giữ nguyên Hard Matrix Sync (Đọc dữ liệu cứng từ DB).
 * - Giữ nguyên Universal Date Adapter.
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION)
// Mô tả: Định nghĩa các giới hạn vật lý và thời gian của tiệm.
// ============================================================================

const CONFIG = {
    // --- Tài nguyên vật lý (Physical Limits) ---
    MAX_CHAIRS: 6,          // Số lượng ghế chân tối đa
    MAX_BEDS: 6,            // Số lượng giường body tối đa
    MAX_TOTAL_GUESTS: 12,   // Tổng dung lượng khách tối đa cùng lúc
    
    // --- Cấu hình thời gian (Time Settings) ---
    OPEN_HOUR: 8,           // Giờ mở cửa: 08:00 Sáng
    
    // --- Bộ đệm (Buffers - Đơn vị: Phút) ---
    CLEANUP_BUFFER: 5,      // Thời gian dọn dẹp bắt buộc sau mỗi ca
    TRANSITION_BUFFER: 5,   // Thời gian chuyển đổi giữa Chân <-> Body hoặc thay đồ
    
    // --- Giới hạn tính toán (Computational Limits) ---
    TOLERANCE: 1,           // Sai số cho phép (tránh lỗi làm tròn giây)
    MAX_TIMELINE_MINS: 1680, // Hỗ trợ ca đêm (24h + 4h sáng hôm sau = 28h * 60)
    
    // --- Cấu hình Guardrail ---
    // Bước nhảy khi quét tải trọng. Để 10 phút như Frontend để đảm bảo độ chính xác cao.
    CAPACITY_CHECK_STEP: 10 
};

// Cơ sở dữ liệu dịch vụ (Dynamic Services Database)
// Key: Service Code (Cột A Menu - VD: 'A6', 'F4')
// Value: Object chứa info { name, duration, price, type, category... }
let SERVICES = {}; 

/**
 * Cập nhật danh sách dịch vụ và thêm các dịch vụ hệ thống mặc định.
 * Hàm này cần được gọi ngay khi Server khởi động hoặc nạp dữ liệu mới.
 * @param {Object} newServicesObj - Object chứa danh sách dịch vụ (Key = Code)
 */
function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    
    // Merge dịch vụ từ nguồn ngoài với dịch vụ hệ thống
    SERVICES = { ...newServicesObj, ...systemServices };
    
    // Log kiểm tra để đảm bảo Service Code được load đúng
    // console.log(`[CORE V113.1] Services Database Synced. Total Items: ${Object.keys(SERVICES).length}`);
}

/**
 * [HELPER V113] Lấy thông tin dịch vụ an toàn.
 * Ưu tiên tìm theo CODE (Cột A), nếu không thấy tìm theo NAME (Cột B).
 * @param {string} code - Mã dịch vụ (VD: 'A6')
 * @param {string} name - Tên dịch vụ (VD: 'Foot Massage 60min')
 */
function getServiceInfo(code, name) {
    // 1. Thử tìm bằng Code trước (Độ chính xác cao nhất)
    if (code && SERVICES[code]) {
        return SERVICES[code];
    }
    
    // 2. Nếu không có Code, hoặc Code không khớp, tìm bằng Name
    if (name) {
        const cleanName = name.toString().trim().toUpperCase();
        for (const key in SERVICES) {
            const svc = SERVICES[key];
            if (svc.name && svc.name.toString().trim().toUpperCase() === cleanName) {
                return svc;
            }
        }
    }
    
    // 3. Fallback: Trả về object mặc định để không crash code
    return { name: name || 'Unknown', duration: 60, price: 0, type: 'CHAIR' };
}

// ============================================================================
// PHẦN 2: UNIVERSAL DATE ADAPTER (CÔNG CỤ XỬ LÝ NGÀY TUYỆT ĐỐI)
// Mô tả: Trái tim của bản cập nhật V112/V113. Xử lý sự bất nhất về định dạng ngày.
// ============================================================================

/**
 * [CRITICAL] HÀM CHUẨN HÓA NGÀY TUYỆT ĐỐI.
 * Chuyển mọi định dạng (DD/MM/YYYY, YYYY-MM-DD, dấu chấm, dấu gạch) về YYYY/MM/DD.
 * Đảm bảo Server luôn hiểu đúng ngày mà Client gửi lên hoặc đọc từ Database.
 * * @param {string|Date} input - Chuỗi ngày đầu vào
 * @returns {string} - Chuỗi ngày chuẩn dạng "YYYY/MM/DD"
 */
function normalizeDateStrict(input) {
    if (!input) return "";
    try {
        let str = input.toString().trim();
        
        // 1. Vệ sinh dữ liệu: Loại bỏ giờ giấc nếu dính (VD: 2026-01-20T00:00:00)
        if (str.includes('T')) str = str.split('T')[0];
        if (str.includes(' ')) str = str.split(' ')[0];

        // 2. Thay thế tất cả gạch ngang (-), chấm (.) bằng gạch chéo (/)
        str = str.replace(/-/g, '/').replace(/\./g, '/');

        // 3. Phân tách các phần
        const parts = str.split('/');
        
        // Nếu không đủ 3 phần, trả về nguyên gốc (fail safe mechanism)
        if (parts.length !== 3) return str;

        // 4. Logic nhận diện thông minh (Heuristic Detection)
        const partA = parts[0]; // Có thể là YYYY hoặc DD
        const partB = parts[1]; // MM
        const partC = parts[2]; // Có thể là DD hoặc YYYY

        // TRƯỜNG HỢP 1: Dạng YYYY/MM/DD (VD: 2026/01/20) - Chuẩn quốc tế/ISO
        if (partA.length === 4) {
            return `${partA}/${partB.padStart(2, '0')}/${partC.padStart(2, '0')}`;
        }
        
        // TRƯỜNG HỢP 2: Dạng DD/MM/YYYY (VD: 20/01/2026) - Chuẩn Việt Nam/Châu Á
        // Cần đảo ngược lại thành YYYY/MM/DD để hệ thống so sánh chuỗi chính xác
        if (partC.length === 4) {
            return `${partC}/${partB.padStart(2, '0')}/${partA.padStart(2, '0')}`;
        }

        // Mặc định trả về nguyên gốc nếu không nhận diện được (ví dụ năm 2 số)
        return str;
    } catch (e) {
        console.error("[CORE V113.1] Date Normalize Error:", e);
        return input;
    }
}

// ============================================================================
// PHẦN 3: TIỆN ÍCH THỜI GIAN & DATA (TIME & DATA UTILITIES)
// Mô tả: Các hàm bổ trợ xử lý chuỗi thời gian, so sánh va chạm.
// ============================================================================

/**
 * Lấy giờ hiện tại theo múi giờ Đài Loan (UTC+8)
 */
function getTaipeiNow() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8)); // UTC+8
}

/**
 * Chuyển đổi chuỗi giờ "HH:mm" thành tổng số phút tính từ 00:00.
 * Hỗ trợ xử lý giờ qua đêm (VD: 01:00 sáng hôm sau = 25:00).
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; 
    try {
        let str = timeStr.toString();
        // Xử lý định dạng ISO hoặc có ngày tháng (VD: "2026-01-20 12:00")
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
        
        // Logic qua đêm: Nếu giờ < giờ mở cửa, coi như là ngày hôm sau (cộng thêm 24h)
        if (h < CONFIG.OPEN_HOUR) h += 24; 
        
        return (h * 60) + m;
    } catch (e) {
        return -1;
    }
}

/**
 * Chuyển đổi tổng số phút thành chuỗi "HH:mm".
 */
function getTimeStrFromMins(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    if (h >= 24) h -= 24; 
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Kiểm tra sự trùng lặp thời gian (Overlap) giữa 2 khoảng [startA, endA] và [startB, endB].
 * Sử dụng CONFIG.TOLERANCE để tránh lỗi làm tròn số.
 */
function isOverlap(startA, endA, startB, endB) {
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

/**
 * [V112 Synced] Normalize Booking Status
 * Kiểm tra xem trạng thái booking có đang chiếm chỗ (Active) hay không.
 * Các trạng thái trong Cột O, P, Q (Status1, 2, 3) cũng nên được map qua đây.
 */
function isActiveBookingStatus(statusRaw) {
    if (!statusRaw) return false;
    const s = statusRaw.toString().toLowerCase().trim();
    
    // Các trạng thái KHÔNG chiếm chỗ (Đã xong, Đã hủy, Checkout)
    const inactiveKeywords = [
        'cancel', 'hủy', 'huỷ', 'finish', 'done', 'xong', 
        'check-out', 'checkout', '取消', '完成', '空'
    ];
    for (const kw of inactiveKeywords) {
        if (s.includes(kw)) return false;
    }

    // Mặc định: Nếu không phải trạng thái Hủy/Xong thì là Active (Running, Waiting, Reserved...)
    return true; 
}

// ============================================================================
// PHẦN 4: BỘ NHẬN DIỆN THÔNG MINH (SMART CLASSIFIER)
// Mô tả: Phân loại dịch vụ Combo/Single và loại tài nguyên (Bed/Chair).
// ============================================================================

/**
 * Kiểm tra xem một dịch vụ có phải là COMBO (làm cả chân và mình) hay không.
 * Cập nhật V113.1: Nhận thêm explicitFlow để loại trừ các mã Single mới.
 */
function isComboService(serviceObj, serviceNameRaw = '', explicitFlow = null) {
    // [V113.1] EXPLICIT FLOW CHECK
    // Nếu explicitFlow là các mã Single, return false ngay lập tức.
    if (explicitFlow) {
        const flowUpper = explicitFlow.toString().toUpperCase().trim();
        if (['SINGLE', 'FOOTSINGLE', 'BODYSINGLE'].includes(flowUpper)) return false;
        // Nếu là BF hoặc FB -> Chắc chắn là Combo
        if (flowUpper === 'BF' || flowUpper === 'FB') return true;
    }

    // Check nếu obj không tồn tại
    if (!serviceObj && !serviceNameRaw) return false;

    // Ưu tiên check Category trong Database (Do Service Code đã map đúng)
    const cat = (serviceObj && serviceObj.category ? serviceObj.category : '').toString().toUpperCase().trim();
    if (cat === 'COMBO' || cat === 'MIXED') return true;

    // Fallback: Check theo tên (Keyword Matching)
    const dbName = (serviceObj && serviceObj.name ? serviceObj.name : '').toString().toUpperCase();
    const rawName = (serviceNameRaw || '').toString().toUpperCase();
    const nameToCheck = dbName + " | " + rawName;
    
    const comboKeywords = [
        'COMBO', '套餐', 'MIX', '+', 'SET', 
        '腳身', '全餐', 'FOOT AND BODY', 'BODY AND FOOT',
        '雙人', 'A餐', 'B餐', 'C餐', '油壓+足'
    ];
    
    for (const kw of comboKeywords) {
        if (nameToCheck.includes(kw)) return true;
    }
    return false;
}

/**
 * Xác định loại tài nguyên chính (BED hoặc CHAIR) dựa trên dịch vụ.
 * Chỉ dùng làm fallback nếu không có Explicit Flow.
 */
function detectResourceType(serviceObj) {
    if (!serviceObj) return 'CHAIR'; // Mặc định là ghế nếu không rõ
    
    // Nếu trong DB đã định nghĩa type
    if (serviceObj.type === 'BED' || serviceObj.type === 'CHAIR') return serviceObj.type;
    
    // Fallback: Check theo tên
    const name = (serviceObj.name || '').toUpperCase();
    if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|SPA|BACK/)) return 'BED';
    
    return 'CHAIR'; 
}

// ============================================================================
// PHẦN 5: HÀNG RÀO DUNG LƯỢNG & STRICT RESOURCE (GUARDRAIL V112.4+ SYNC)
// Mô tả: Logic kiểm tra tải trọng toàn cục, đồng bộ tuyệt đối với Frontend.
// ============================================================================

/**
 * [UPDATED V113.1] Suy luận loại tài nguyên đang bị chiếm dụng tại một thời điểm cụ thể.
 * Tích hợp logic nhận diện 'FOOTSINGLE' và 'BODYSINGLE' từ cột AA.
 */
function inferResourceAtTime(booking, timeMins) {
    const bStart = getMinsFromTimeStr(booking.startTime);
    // V113: Lấy duration chính xác từ Service Code
    const svcInfo = getServiceInfo(booking.serviceCode, booking.serviceName);
    
    const duration = parseInt(booking.duration) || svcInfo.duration || 60;
    const bEnd = bStart + duration + CONFIG.CLEANUP_BUFFER;

    // Nếu thời gian kiểm tra nằm ngoài phạm vi booking -> Không chiếm
    if (timeMins < bStart || timeMins >= bEnd) return null; 

    // [V113.1] PRIORITY 1: CHECK EXPLICIT SINGLE FLOW
    const storedFlow = booking.flow || booking.originalData?.flowCode;
    
    if (storedFlow === 'FOOTSINGLE') return 'CHAIR';
    if (storedFlow === 'BODYSINGLE') return 'BED';

    // [V113.1] PRIORITY 2: COMBO LOGIC
    // Sử dụng hàm isComboService đã nâng cấp
    const isCombo = isComboService(svcInfo, booking.serviceName, storedFlow);

    if (!isCombo) {
        // [V113.1] PRIORITY 3: LEGACY SINGLE (Fallback)
        // Nếu là SINGLE cũ hoặc không có mã, dùng đoán tên
        return detectResourceType(svcInfo);
    } else {
        // Nếu là Combo, phải xem đang ở giai đoạn nào.
        // --- LOGIC V113: ƯU TIÊN DỮ LIỆU CỨNG TỪ DB ---
        let isBodyFirst = false;
        
        // 1. Kiểm tra cột AA (Flow Code)
        const noteContent = (booking.note || booking.ghiChu || "").toString().toUpperCase();

        if (storedFlow === 'BF') isBodyFirst = true;
        else if (storedFlow === 'FB') isBodyFirst = false;
        else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
        else if (booking.allocated_resource && (booking.allocated_resource.includes('BED') || booking.allocated_resource.includes('BODY'))) isBodyFirst = true;

        // 2. Kiểm tra cột Y (Phase 1 Duration) - Nếu có thì dùng, nếu không chia đôi
        let p1 = 0;
        if (booking.originalData && booking.originalData.phase1_duration) {
             p1 = parseInt(booking.originalData.phase1_duration);
        } else if (booking.phase1_duration) {
             p1 = parseInt(booking.phase1_duration);
        } else {
             p1 = Math.floor(duration / 2);
        }
        
        const splitTime = bStart + p1;

        if (timeMins < splitTime) {
            // Đang ở Phase 1
            return isBodyFirst ? 'BED' : 'CHAIR';
        } else {
            // Đang ở Phase 2
            return isBodyFirst ? 'CHAIR' : 'BED';
        }
    }
}

/**
 * [STRICT STAFF COUNTING]
 * Đếm số lượng nhân viên thực tế có thể phục vụ (xét cả giờ làm việc và Strict Mode).
 * Hiện tại kiểm tra Staff 1 (Primary). Staff 2 và 3 chỉ mang tính chất tham chiếu trong hiển thị.
 */
function getEligibleStaffCount(staffList, currentTimeMins, requiredEndTime) {
    let count = 0;
    for (const [staffName, info] of Object.entries(staffList)) {
        // 1. Bỏ qua nếu OFF hoặc không hợp lệ
        if (!info || info.off) continue;

        const shiftStart = getMinsFromTimeStr(info.start);
        const shiftEnd = getMinsFromTimeStr(info.end);

        if (shiftStart === -1 || shiftEnd === -1) continue;

        // 2. Kiểm tra xem thời điểm hiện tại t có nằm trong ca làm việc không
        if (currentTimeMins >= shiftStart && currentTimeMins < shiftEnd) {
            
            // 3. [STRICT TIME CHECK] - Nếu thợ về sớm, không tính là available cho ca này
            if (info.isStrictTime === true) {
                if (shiftEnd < (requiredEndTime - CONFIG.TOLERANCE)) {
                    continue; // Thợ này không đủ thời gian phục vụ
                }
            }
            
            // Nếu qua hết các vòng kiểm tra -> Đếm
            count++;
        }
    }
    return count;
}

/**
 * [GLOBAL SCANNER V113.1]
 * Quét toàn bộ dòng thời gian để đảm bảo không lúc nào bị thiếu Giường, Ghế hoặc Thợ.
 */
function validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr) {
    const requestEnd = requestStart + maxDuration + CONFIG.CLEANUP_BUFFER;
    
    // 1. Lọc ra các booking cũ đang thực sự chiếm chỗ (Active & Overlap)
    const activeExistingBookings = currentBookingsRaw.filter(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return false;
        
        if (!isActiveBookingStatus(b.status)) return false;

        const bEnd = bStart + (b.duration || 60) + CONFIG.CLEANUP_BUFFER;
        
        // Chỉ lấy những booking có giao thoa với khoảng thời gian khách mới yêu cầu
        return isOverlap(requestStart, requestEnd, bStart, bEnd);
    });

    // Biến lưu snapshot debug đầu tiên bị lỗi (nếu có)
    let failureSnapshot = null;

    // 2. QUÉT TỪNG LÁT CẮT THỜI GIAN (Time Slicing Loop)
    for (let t = requestStart; t < requestEnd; t += CONFIG.CAPACITY_CHECK_STEP) {
        
        // A. KIỂM TRA NHÂN VIÊN (STAFF SUPPLY vs DEMAND)
        const supplyCount = getEligibleStaffCount(staffList, t, requestEnd);
        
        let currentStaffLoad = 0;
        for (const b of activeExistingBookings) {
            const bStart = getMinsFromTimeStr(b.startTime);
            const bEnd = bStart + (b.duration || 60) + CONFIG.CLEANUP_BUFFER;
            // Nếu thời điểm t nằm trong khoảng booking cũ
            if (t >= bStart && t < bEnd) {
                currentStaffLoad++;
            }
        }
        
        const totalStaffDemand = currentStaffLoad + guestList.length;

        // B. KIỂM TRA TÀI NGUYÊN VẬT LÝ (BEDS & CHAIRS)
        let usedBeds = 0;
        let usedChairs = 0;

        // Đếm tài nguyên bị khách cũ chiếm
        for (const b of activeExistingBookings) {
            // [V113.1] inferResourceAtTime đã được nâng cấp để hiểu FOOTSINGLE/BODYSINGLE
            const resType = inferResourceAtTime(b, t);
            if (resType === 'BED') usedBeds++;
            else if (resType === 'CHAIR') usedChairs++;
        }

        // Đếm tài nguyên khách mới cần
        let neededBeds = 0;
        let neededChairs = 0;
        let neededFlexible = 0; // Dành cho Combo (chưa biết xếp vào đâu)

        for (const g of guestList) {
            // Dùng getServiceInfo để đảm bảo lấy đúng duration
            const svc = getServiceInfo(g.serviceCode, g.serviceName);
            
            // [V113.1] Explicit Flow Check cho khách mới (gửi từ Client)
            const explicitFlow = g.flowCode || null;
            const isCombo = isComboService(svc, g.serviceCode, explicitFlow);
            
            const gDuration = svc.duration || 60;
            const elapsed = t - requestStart; 

            // Nếu khách này đã làm xong tại thời điểm t -> không tính
            if (elapsed >= gDuration + CONFIG.CLEANUP_BUFFER) continue; 

            if (!isCombo) {
                // [V113.1] Check Explicit Single
                let rType = null;
                if (explicitFlow === 'FOOTSINGLE') rType = 'CHAIR';
                else if (explicitFlow === 'BODYSINGLE') rType = 'BED';
                else rType = detectResourceType(svc); // Fallback cũ

                if (rType === 'BED') neededBeds++;
                else neededChairs++;
            } else {
                // Combo: Tạm tính logic đơn giản cho Guardrail
                // Ở phase nào cũng cần 1 chỗ. Ta sẽ check tổng thể.
                neededFlexible++;
            }
        }

        const availableBeds = CONFIG.MAX_BEDS - usedBeds;
        const availableChairs = CONFIG.MAX_CHAIRS - usedChairs;

        // Tạo Snapshot cho thời điểm này (để debug)
        const snapshot = {
            queryDate: queryDateStr,
            time: getTimeStrFromMins(t),
            activeStaff: supplyCount,
            guestsRunning: currentStaffLoad,
            usedBeds: usedBeds,
            usedChairs: usedChairs,
            maxBeds: CONFIG.MAX_BEDS,
            maxChairs: CONFIG.MAX_CHAIRS
        };

        // C. SO SÁNH (GUARDRAIL CONDITIONS)
        
        // 1. Check Thợ
        if (totalStaffDemand > supplyCount) {
            return {
                pass: false,
                reason: `Quá tải THỢ lúc ${getTimeStrFromMins(t)}. Cần ${totalStaffDemand}, có ${supplyCount}.`,
                debug: snapshot
            };
        }

        // 2. Check Giường cứng
        if (neededBeds > availableBeds) {
            return { 
                pass: false, 
                reason: `Hết GIƯỜNG lúc ${getTimeStrFromMins(t)}. (Trống: ${availableBeds}, Cần: ${neededBeds})`,
                debug: snapshot
            };
        }
        
        // 3. Check Ghế cứng
        if (neededChairs > availableChairs) {
            return { 
                pass: false, 
                reason: `Hết GHẾ lúc ${getTimeStrFromMins(t)}. (Trống: ${availableChairs}, Cần: ${neededChairs})`,
                debug: snapshot
            };
        }

        // 4. Check Tổng thể (cho Combo)
        const remainingBeds = availableBeds - neededBeds;
        const remainingChairs = availableChairs - neededChairs;
        const totalSlots = remainingBeds + remainingChairs;

        if (neededFlexible > totalSlots) {
            return { 
                pass: false, 
                reason: `Không đủ GIƯỜNG/GHẾ Combo lúc ${getTimeStrFromMins(t)}. (Dư: ${totalSlots}, Cần: ${neededFlexible})`,
                debug: snapshot
            };
        }
        
        // Lưu lại snapshot đầu tiên nếu chưa có (để trả về nếu thành công)
        if (!failureSnapshot) failureSnapshot = snapshot;
    }

    return { pass: true, debug: failureSnapshot };
}

// ============================================================================
// PHẦN 6: MATRIX ENGINE (CORE ALLOCATION)
// Mô tả: Máy ảo xếp chỗ vào Giường/Ghế.
// ============================================================================

class VirtualMatrix {
    constructor() {
        // Khởi tạo các làn (Lanes) cho Ghế và Giường
        this.lanes = {
            'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
            'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
        };
    }

    /**
     * Kiểm tra xem một làn cụ thể có trống trong khoảng [start, end] không.
     */
    checkLaneFree(lane, start, end) {
        for (let block of lane.occupied) {
            if (isOverlap(start, end, block.start, block.end)) return false; 
        }
        return true; 
    }

    /**
     * Đánh dấu chiếm chỗ trên một làn.
     */
    allocateToLane(lane, start, end, ownerId) {
        lane.occupied.push({ start, end, ownerId });
        // Sort lại để dễ debug/visualize
        lane.occupied.sort((a, b) => a.start - b.start);
        return lane.id;
    }

    /**
     * Cố gắng xếp một block vào nhóm tài nguyên (Bed/Chair).
     * @param {string} type - 'BED' hoặc 'CHAIR'
     * @param {number} preferredIndex - Ưu tiên xếp vào vị trí số mấy (1-based)
     */
    tryAllocate(type, start, end, ownerId, preferredIndex = null) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null; 
        
        // Chiến thuật 1: Targeted Allocation (Ưu tiên vị trí cũ/yêu cầu)
        if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
            const targetLane = resourceGroup[preferredIndex - 1]; 
            if (this.checkLaneFree(targetLane, start, end)) {
                return this.allocateToLane(targetLane, start, end, ownerId);
            }
        }

        // Chiến thuật 2: First-Fit (Tìm chỗ trống đầu tiên)
        for (let lane of resourceGroup) {
            if (this.checkLaneFree(lane, start, end)) {
                return this.allocateToLane(lane, start, end, ownerId);
            }
        }
        
        return null; // Hết chỗ
    }
}

// ============================================================================
// PHẦN 7: LOGIC TÌM NHÂN VIÊN & CO GIÃN (STAFF & ELASTIC LOGIC)
// ============================================================================

/**
 * Tìm nhân viên phù hợp cho một booking cụ thể.
 */
function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo || staffInfo.off) return false; 
        
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        if (shiftStart === -1 || shiftEnd === -1) return false; 
        
        // Rule 1: Khách đến sau khi thợ đi làm
        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
        
        // Rule 2: Strict Time Check (Đồng bộ với Guardrail)
        const isStrict = staffInfo.isStrictTime === true;
        if (isStrict) {
            // Nghiêm ngặt: Phải làm xong TRƯỚC khi hết ca
            if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
        } else {
            // Không nghiêm ngặt: Chỉ cần nhận khách TRƯỚC khi hết ca
            if (start > shiftEnd) return false;
        }

        // Rule 3: Kiểm tra trùng lịch (Collision Check)
        for (const b of busyList) {
            // Nếu cùng tên nhân viên và thời gian chồng chéo -> Bận
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

        // Rule 4: Kiểm tra giới tính
        if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
        if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;
        
        return true; 
    };

    // Nếu yêu cầu đích danh hoặc giới tính
    if (staffReq && !['RANDOM', 'MALE', 'FEMALE', '隨機', 'Any', 'undefined'].includes(staffReq)) {
        return checkOneStaff(staffReq) ? staffReq : null;
    } else {
        // Nếu chọn ngẫu nhiên -> Tìm ai rảnh thì lấy
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

/**
 * Sinh ra các phương án chia cắt thời gian (Split) cho dịch vụ Combo.
 */
function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
    // Nếu đã bị khóa Phase 1 (do User chỉnh tay) -> Chỉ trả về 1 phương án duy nhất
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
        return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999 }];
    }

    const standardHalf = Math.floor(totalDuration / 2);
    let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];
    
    if (!step || !limit || step <= 0 || limit <= 0) return options;

    let currentDeviation = step;
    while (currentDeviation <= limit) {
        // Lệch trái
        let p1_A = standardHalf - currentDeviation;
        let p2_A = totalDuration - p1_A;
        if (p1_A >= 15 && p2_A >= 15) options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
        
        // Lệch phải
        let p1_B = standardHalf + currentDeviation;
        let p2_B = totalDuration - p1_B;
        if (p1_B >= 15 && p2_B >= 15) options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
        
        currentDeviation += step;
    }
    
    // Ưu tiên độ lệch thấp nhất (gần chuẩn nhất)
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
}

/**
 * Helper: Kiểm tra nhanh xem một bộ block có nhét vừa ma trận không (dùng cho Squeeze)
 */
function isBlockSetAllocatable(blocks, matrix) {
    for (const b of blocks) {
        const laneGroup = matrix.lanes[b.type];
        if (!laneGroup) return false;
        let foundLane = false;
        if (b.forcedIndex && b.forcedIndex > 0 && b.forcedIndex <= laneGroup.length) {
            const targetLane = laneGroup[b.forcedIndex - 1];
            let isFree = true;
            for (const occ of targetLane.occupied) {
                if (isOverlap(b.start, b.end, occ.start, occ.end)) { isFree = false; break; }
            }
            if (isFree) return true; 
        }
        for (const lane of laneGroup) {
            let isFree = true;
            for (const occ of lane.occupied) {
                if (isOverlap(b.start, b.end, occ.start, occ.end)) { isFree = false; break; }
            }
            if (isFree) { foundLane = true; break; }
        }
        if (!foundLane) return false;
    }
    return true;
}

// ============================================================================
// PHẦN 8: CORE ENGINE V113.1 (INTEGRATED SINGLE SOURCE OF TRUTH)
// Mô tả: Hàm chính xử lý logic.
// ============================================================================

/**
 * HÀM KIỂM TRA KHẢ DỤNG CHÍNH - PHIÊN BẢN V113.1
 * @param {string} dateStr - Ngày kiểm tra (Bất kỳ định dạng nào)
 * @param {string} timeStr - Giờ kiểm tra "HH:mm"
 * @param {Array} guestList - Danh sách khách mới { serviceCode, serviceName, staffName, flowCode... }
 * @param {Array} currentBookingsRaw - Danh sách booking hiện tại từ DB (Raw)
 * @param {Object} staffList - Danh sách nhân viên và ca làm việc
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    // ------------------------------------------------------------------------
    // [V112.0] BƯỚC PRE-CHECK: CHUẨN HÓA DỮ LIỆU ĐẦU VÀO
    // ------------------------------------------------------------------------
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // 1. Chuẩn hóa ngày yêu cầu về chuẩn duy nhất YYYY/MM/DD
    const normalizedQueryDate = normalizeDateStrict(dateStr);

    // 2. Lọc và chuẩn hóa ngày của Booking từ Database
    // Đây là bước quan trọng nhất để fix lỗi Server "mù".
    const filteredBookings = currentBookingsRaw.filter(b => {
        if (!b || !b.startTimeString) return false;
        
        // Trích xuất ngày từ chuỗi booking (VD: "2026-01-20 12:00")
        const rawDate = b.startTimeString.split(' ')[0];
        const bDateNormalized = normalizeDateStrict(rawDate);
        
        // So sánh chuỗi đã chuẩn hóa.
        // Nếu khác ngày -> Bỏ qua.
        return bDateNormalized === normalizedQueryDate;
    });

    // Tìm duration lớn nhất của nhóm khách mới để tính khung thời gian quét
    let maxGuestDuration = 0;
    guestList.forEach(g => {
        // V113: Dùng getServiceInfo để tìm theo code (A6, F4...)
        const s = getServiceInfo(g.serviceCode, g.serviceName);
        const dur = s.duration || 60;
        if (dur > maxGuestDuration) maxGuestDuration = dur;
    });

    // ------------------------------------------------------------------------
    // [V113.1] BƯỚC 0: STRICT GUARDRAIL CHECK (HÀNG RÀO BẢO VỆ)
    // ------------------------------------------------------------------------
    // Thực hiện quét toàn cục Demand/Supply trước khi chạy Matrix.
    // Logic V113.1 sẽ nhận diện FOOTSINGLE/BODYSINGLE để tính toán chính xác.
    const guardrailCheck = validateGlobalCapacity(
        requestStartMins, 
        maxGuestDuration, 
        guestList, 
        filteredBookings, // Sử dụng danh sách đã filter chuẩn ngày
        staffList,
        normalizedQueryDate
    );

    if (!guardrailCheck.pass) {
        // console.warn(`[CORE V113] GUARDRAIL REJECTED: ${guardrailCheck.reason}`);
        return { 
            feasible: false, 
            reason: `SYSTEM REJECT: ${guardrailCheck.reason}`,
            debug: guardrailCheck.debug // Trả về debug info để hiển thị
        };
    }

    // ------------------------------------------------------------------------
    // BƯỚC A: TIỀN XỬ LÝ - GOM NHÓM (VISUAL SYNC)
    // ------------------------------------------------------------------------
    // Sắp xếp booking theo thời gian để xử lý tuần tự
    let sortedRaw = [...filteredBookings].sort((a, b) => {
        return getMinsFromTimeStr(a.startTimeString || a.startTime) - getMinsFromTimeStr(b.startTimeString || b.startTime);
    });

    // Gom nhóm các booking đi cùng nhau (Couple/Group) dựa trên Contact hoặc RowID
    const bookingGroups = {};
    sortedRaw.forEach(b => {
        // Chỉ gom nhóm các booking Active
        if (!isActiveBookingStatus(b.status)) return;

        const bTime = b.startTimeString || b.startTime;
        const timeKey = (bTime || "").split(' ')[1] || "00:00";
        // Lấy SĐT hoặc tên làm key gom nhóm
        const contactInfo = b.originalData?.phone || b.originalData?.sdt || b.originalData?.custPhone || b.originalData?.customerName || "Unknown";
        const contactKey = contactInfo.toString().replace(/\D/g, '').slice(-6) || contactInfo.toString().trim();
        const statusLower = (b.status||'').toLowerCase();
        
        // Nếu đang Running, gom theo RowID (vì khách đang làm thì vị trí đã cố định)
        const groupKey = (statusLower.includes('running') || statusLower.includes('doing')) 
            ? `RUNNING_${b.rowId}` 
            : `${timeKey}_${contactKey}`;
            
        if (!bookingGroups[groupKey]) bookingGroups[groupKey] = [];
        bookingGroups[groupKey].push(b);
    });

    // Gán thông tin thừa kế (Inheritance) cho việc hiển thị Matrix
    let remappedBookings = [];
    Object.values(bookingGroups).forEach(group => {
        group.sort((a,b) => parseInt(a.rowId) - parseInt(b.rowId));
        const groupSize = group.length;
        const halfSize = Math.ceil(groupSize / 2);
        group.forEach((b, idx) => {
            b._virtualInheritanceIndex = null;
            b._impliedFlow = null;
            // Chỉ gán logic sync cho booking chưa chạy
            const statusLower = (b.status||'').toLowerCase();
            if (!statusLower.includes('running')) {
                let virtualIndex = (groupSize >= 2) ? (idx % halfSize) + 1 : idx + 1;
                b._virtualInheritanceIndex = virtualIndex; 
                if (groupSize >= 2) {
                    b._impliedFlow = (idx < halfSize) ? 'BF' : 'FB';
                }
            }
            remappedBookings.push(b);
        });
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: XỬ LÝ CHI TIẾT BOOKING (BLOCK CREATION & EXPLICIT FLOW)
    // ------------------------------------------------------------------------
    let existingBookingsProcessed = [];
    remappedBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTimeString || b.startTime);
        if (bStart === -1) return;

        // V113: Dùng helper để lấy Service Info chuẩn
        let svcInfo = getServiceInfo(b.serviceCode, b.serviceName);
        
        // --- [CRITICAL V113.1 LOGIC: EXPLICIT FLOW & PHASES] ---
        // Ưu tiên đọc từ cột flow/flowCode đã được lưu trong DB (Cột AA)
        let storedFlow = b.flow || b.originalData?.flowCode || b.originalData?.flow || null;

        // Pass storedFlow into isCombo check
        let isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
        
        let duration = b.duration || svcInfo.duration || 60;
        let anchorIndex = null;
        const statusLower = (b.status||'').toLowerCase();
        const isRunning = statusLower.includes('running');

        // Logic giữ chỗ (Anchor) để Matrix hiển thị đẹp
        if (isRunning) {
             if (b.allocated_resource) {
                const match = b.allocated_resource.toString().match(/(\d+)/);
                if (match) anchorIndex = parseInt(match[0]);
             } else if (b.rowId && typeof b.rowId === 'string' && (b.rowId.includes('BED') || b.rowId.includes('CHAIR'))) {
                 const match = b.rowId.toString().match(/(\d+)/);
                 if (match) anchorIndex = parseInt(match[0]);
             }
        } else {
            if (b._virtualInheritanceIndex) anchorIndex = b._virtualInheritanceIndex;
            else if (b.allocated_resource) {
                const match = b.allocated_resource.toString().match(/(\d+)/);
                if (match) anchorIndex = parseInt(match[0]);
            }
        }

        // --- [V113 CRITICAL: LOCKED CHECK] ---
        // Kiểm tra xem booking có bị khóa thủ công không (Cột AE/30)
        const isLockedRaw = b.originalData?.isManualLocked || b.isManualLocked;
        const isLocked = (isLockedRaw === true || isLockedRaw === 'TRUE');

        // Tạo đối tượng xử lý
        let processedB = {
            id: b.rowId, originalData: b, staffName: b.staffName, serviceName: b.serviceName, 
            category: svcInfo.category, 
            // Chỉ cho phép Squeeze (Co giãn) nếu KHÔNG phải booking đang chạy VÀ KHÔNG BỊ KHÓA
            isElastic: isCombo && (!isLocked) && (!isRunning),
            elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
            startMins: bStart, duration: duration, blocks: [], anchorIndex: anchorIndex
        };

        if (isCombo) {
            // 1. Xác định Phase Duration từ DB (Cột Y) nếu có
            let p1 = 0;
            if (b.originalData && b.originalData.phase1_duration) {
                p1 = parseInt(b.originalData.phase1_duration);
            } else if (b.phase1_duration) {
                p1 = parseInt(b.phase1_duration);
            } else {
                p1 = Math.floor(duration / 2); // Fallback chia đôi
            }
            
            let p2 = duration - p1;
            const p1End = bStart + p1;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            let isBodyFirst = false;
            
            // Logic xác định Flow: Explicit Code -> Note -> Implied -> Default
            const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
            
            if (storedFlow === 'BF') {
                isBodyFirst = true; // DB bảo BF thì là BF
            } else if (storedFlow === 'FB') {
                isBodyFirst = false; // DB bảo FB thì là FB
            } else {
                // Nếu DB chưa có (booking cũ), đọc Note hoặc dùng Implied logic
                if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體') || noteContent.includes('先身')) isBodyFirst = true;
                else if (isRunning && b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) isBodyFirst = true; 
                else if (b._impliedFlow === 'BF') isBodyFirst = true;
            }

            if (isBodyFirst) {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: anchorIndex }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'CHAIR', forcedIndex: anchorIndex });
                processedB.flow = 'BF'; 
            } else {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: anchorIndex }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED', forcedIndex: anchorIndex });
                processedB.flow = 'FB'; 
            }
            processedB.p1_current = p1; processedB.p2_current = p2;
        } else {
            // [V113.1] XỬ LÝ SINGLE FLOW VỚI EXPLICIT CHECK
            // Check nếu là Explicit Single Flow
            if (storedFlow === 'FOOTSINGLE' || storedFlow === 'BODYSINGLE') {
                processedB.flow = storedFlow;
                // Force loại tài nguyên theo Flow Code
                let rType = (storedFlow === 'FOOTSINGLE') ? 'CHAIR' : 'BED';
                processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
            } else {
                // Fallback cũ (Backward Compatibility)
                processedB.flow = 'SINGLE';
                let rType = detectResourceType(svcInfo);
                processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
            }
        }
        existingBookingsProcessed.push(processedB);
    });

    // ------------------------------------------------------------------------
    // BƯỚC C: KỊCH BẢN KHÁCH MỚI (NEW GUESTS & COUPLE SYNC)
    // ------------------------------------------------------------------------
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => { 
        const s = getServiceInfo(g.serviceCode, g.serviceName); 
        // V113.1: Pass explicitFlow code from Client into Combo Check
        return isComboService(s, g.serviceCode, g.flowCode); 
    });
    const newGuestHalfSize = Math.ceil(comboGuests.length / 2);
    const maxBF = comboGuests.length;
    let trySequence = [];

    // Tạo danh sách các trường hợp thử nghiệm (Bao nhiêu người làm BF?)
    if (maxBF === 2) {
        trySequence = [0, 2, 1]; // Couple Strategy: Cả 2 FB, Cả 2 BF, hoặc lệch
    } else if (maxBF > 0) {
        let mid = maxBF / 2; 
        trySequence.push(Math.ceil(mid));
        if (Math.floor(mid) !== Math.ceil(mid)) trySequence.push(Math.floor(mid));
        // Thử lan ra các giá trị xung quanh
        let step = 1;
        while (true) {
            let nextUp = Math.ceil(mid) + step; let nextDown = Math.floor(mid) - step;
            if (nextUp > maxBF && nextDown < 0) break;
            if (nextUp <= maxBF) trySequence.push(nextUp);     
            if (nextDown >= 0) trySequence.push(nextDown);     
            step++;
        }
    } else {
        trySequence.push(0);
    }
    
    // ------------------------------------------------------------------------
    // BƯỚC D: VÒNG LẶP VÉT CẠN (EXHAUSTIVE MATRIX LOOP)
    // ------------------------------------------------------------------------
    let successfulScenario = null;

    for (let numBF of trySequence) {
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;
        
        // --- 1. NẠP KHÁCH CŨ (Hard vs Soft) ---
        let softsToSqueezeCandidates = []; 
        for (const exB of existingBookingsProcessed) {
            let placedSuccessfully = true;
            let allocatedSlots = []; 
            for (const block of exB.blocks) {
                const realEnd = block.end + CONFIG.CLEANUP_BUFFER;
                const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id, block.forcedIndex);
                if (!slotId) { placedSuccessfully = false; break; }
                allocatedSlots.push(slotId);
            }
            if (exB.isElastic) {
                if (placedSuccessfully) exB.allocatedSlots = allocatedSlots; 
                softsToSqueezeCandidates.push(exB); 
            }
        }

        // --- 2. TÍNH TOÁN BLOCK KHÁCH MỚI ---
        let newGuestBlocksMap = []; 
        for (const ng of newGuests) {
            const svc = getServiceInfo(ng.serviceCode, ng.serviceName); 
            let flow = 'FB'; 
            
            // [V113.1] Explicit Flow Logic for New Guest
            let isThisGuestCombo = isComboService(svc, ng.serviceCode, ng.flowCode);
            
            if (isThisGuestCombo) {
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                // Quyết định BF/FB cho khách mới dựa trên kịch bản vòng lặp
                if (cIdx >= 0 && cIdx < numBF) { flow = 'BF'; }
            } else {
                // Nếu không phải Combo, kiểm tra xem có Explicit Single Flow không?
                // Nếu client gửi FOOTSINGLE/BODYSINGLE, dùng nó. Nếu không, fallback về SINGLE.
                flow = ng.flowCode || 'SINGLE';
            }

            const duration = svc.duration || 60;
            let blocks = [];
            if (isThisGuestCombo) {
                const p1Standard = Math.floor(duration / 2);
                const p2Standard = duration - p1Standard;
                if (flow === 'FB') { 
                    const t1End = requestStartMins + p1Standard;
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                    blocks.push({ start: t2Start, end: t2Start + p2Standard + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'FB', timeStr: timeStr, allocated: [] });
                } else { 
                    const t1End = requestStartMins + p2Standard; 
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    blocks.push({ start: t2Start, end: t2Start + p1Standard + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                    scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'BF', timeStr: timeStr, allocated: [] });
                }
            } else { 
                // [V113.1] Explicit Resource Allocation for Single
                let rType = 'CHAIR'; // Default safe
                
                if (flow === 'FOOTSINGLE') rType = 'CHAIR';
                else if (flow === 'BODYSINGLE') rType = 'BED';
                else rType = detectResourceType(svc); // Fallback old logic

                blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONFIG.CLEANUP_BUFFER, type: rType });
                scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, flow: flow, timeStr: timeStr, allocated: [] });
            }
            newGuestBlocksMap.push({ guest: ng, blocks: blocks });
        }

        // --- 3. XẾP KHÁCH MỚI VÀO MATRIX (MODULO PLACEMENT) ---
        let conflictFound = false;
        for (const item of newGuestBlocksMap) {
            let guestAllocations = [];
            let preferredIdx = null;
            if (newGuestHalfSize > 0 && newGuests.length >= 2) {
                preferredIdx = (item.guest.idx % newGuestHalfSize) + 1;
                // Couple Sync Logic: Cố gắng xếp cặp cùng số thứ tự
                if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdx = item.guest.idx + 1;
            }
            for (const block of item.blocks) {
                const slotId = matrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, preferredIdx);
                if (!slotId) { conflictFound = true; break; }
                guestAllocations.push(slotId);
            }
            if (conflictFound) break;
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) detail.allocated = guestAllocations;
        }

        // --- 4. SQUEEZE LOGIC (CO GIÃN KHÁCH CŨ NẾU CẦN) ---
        if (conflictFound) {
            // Tạo ma trận tạm để thử nghiệm co giãn
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            
            // Xếp lại khách cứng trước
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
            });

            // Thử xếp khách mới vào trước (để xem có chỗ không)
            let squeezeScenarioPossible = true;
            for (const item of newGuestBlocksMap) {
                let preferredIdxSqueeze = null;
                if (newGuestHalfSize > 0 && newGuests.length >= 2) {
                    preferredIdxSqueeze = (item.guest.idx % newGuestHalfSize) + 1;
                    if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdxSqueeze = item.guest.idx + 1;
                }
                for (const block of item.blocks) {
                    if (!matrixSqueeze.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, preferredIdxSqueeze)) {
                        squeezeScenarioPossible = false; break;
                    }
                }
                if (!squeezeScenarioPossible) break;
            }

            if (!squeezeScenarioPossible) { scenarioFailed = true; continue; }

            // Nhét khách mềm (Elastic) vào các chỗ còn lại, thử các phương án split
            const softBookings = existingBookingsProcessed.filter(b => b.isElastic);
            for (const sb of softBookings) {
                const splits = generateElasticSplits(sb.duration, sb.elasticStep, sb.elasticLimit, null);
                let fit = false;
                for (const split of splits) {
                    const sP1End = sb.startMins + split.p1;
                    const sP2Start = sP1End + CONFIG.TRANSITION_BUFFER;
                    const sP2End = sP2Start + split.p2;
                    const testBlocks = [
                        { type: 'CHAIR', start: sb.startMins, end: sP1End + CONFIG.CLEANUP_BUFFER, forcedIndex: sb.blocks[0].forcedIndex },
                        { type: 'BED', start: sP2Start, end: sP2End + CONFIG.CLEANUP_BUFFER, forcedIndex: sb.blocks[1] ? sb.blocks[1].forcedIndex : null }
                    ];
                    if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                        testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id, tb.forcedIndex));
                        fit = true;
                        if (split.deviation !== 0) updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze V113.1' });
                        break; 
                    }
                }
                if (!fit) { squeezeScenarioPossible = false; break; }
            }
            if (squeezeScenarioPossible) {
                scenarioUpdates = updatesProposed;
                matrix = matrixSqueeze; // Chấp nhận kịch bản squeeze
            } else {
                scenarioFailed = true; continue;
            }
        }

        // --- 5. STAFF CHECK & ASSIGNMENT ---
        // Dù đã qua Guardrail, vẫn cần tìm đích danh nhân viên
        let flatTimeline = [];
        Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
            const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
            if (ex) flatTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
        })));

        let staffAssignmentSuccess = true;
        for (const item of newGuestBlocksMap) {
            // Tìm nhân viên phù hợp
            const assignedStaff = findAvailableStaff(item.guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length - 1].end, staffList, flatTimeline);
            
            if (!assignedStaff) { staffAssignmentSuccess = false; break; }
            
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) detail.staff = assignedStaff;
            item.blocks.forEach(b => flatTimeline.push({ start: b.start, end: b.end, staffName: assignedStaff }));
        }

        if (!staffAssignmentSuccess) { scenarioFailed = true; continue; }

        // Nếu thành công mọi bước -> Lưu lại kịch bản
        successfulScenario = { details: scenarioDetails, updates: scenarioUpdates, matrixDump: matrix.lanes };
        break; // Thoát khỏi vòng lặp thử nghiệm
    }

    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true, 
            strategy: 'MATRIX_COUPLE_SYNC_V113.1', 
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0),
            debug: guardrailCheck.debug // Kèm theo debug info để audit
        };
    } else {
        return { 
            feasible: false, 
            reason: "Hết chỗ (Không tìm thấy khe hở phù hợp hoặc không đủ nhân viên)",
            debug: guardrailCheck.debug // Kèm theo debug info kể cả khi fail
        };
    }
}

// ============================================================================
// PHẦN 9: MODULE EXPORT (NODE.JS & GOOGLE APPS SCRIPT COMPATIBLE)
// ============================================================================
const CoreAPI = {
    checkRequestAvailability,
    setDynamicServices,
    get SERVICES() { return SERVICES; },
    CONFIG,
    getMinsFromTimeStr,
    getTimeStrFromMins,
    getTaipeiNow,
    normalizeDateStrict // Export để index.js có thể dùng nếu cần
};

// Môi trường Node.js (Cho Local Test hoặc Cloud Function)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreAPI;
}

// Môi trường Browser (Nếu file này được nhúng trực tiếp vào HTML)
if (typeof window !== 'undefined') {
    window.ResourceCore = CoreAPI;
    window.checkRequestAvailability = CoreAPI.checkRequestAvailability;
    window.setDynamicServices = CoreAPI.setDynamicServices;
    window.normalizeDateStrict = CoreAPI.normalizeDateStrict;
    console.log("✅ Resource Core V113.1 Loaded: EXPLICIT FLOW & DATA MAPPING ACTIVE.");
}
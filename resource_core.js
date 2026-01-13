
/*
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V101.1 (STRICT PHYSICAL INHERITANCE & SYNC FIX)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/13
 *
 * * * * * CHANGE LOG V101.1 (THE "REALITY CHECK" UPDATE):
 * 1. [CRITICAL FIX] PHYSICAL SLOT INHERITANCE (Thừa kế vị trí vật lý thực tế):
 * - Vấn đề cũ (V101.0): Hệ thống dùng `b.rowId` (VD: dòng 120) làm `anchorIndex`. 
 * Vì 120 > 6 (số ghế tối đa), hệ thống hủy bỏ ưu tiên và chuyển sang chế độ xếp ngẫu nhiên (First-Fit).
 * Điều này khiến khách cũ bị "trôi" sang các slot trống khác, gây báo đầy ảo.
 * - Giải pháp V101.1: Ưu tiên đọc trường `allocated_resource` (VD: "BED-3", "CHAIR-2") được truyền từ Server/Index.
 * Chỉ số `anchorIndex` bây giờ sẽ chính xác là 3 hoặc 2, buộc Core phải giữ nguyên vị trí này.
 *
 * 2. [LOGIC] ROBUST PARSING:
 * - Thêm cơ chế Regex thông minh để trích xuất số ghế từ chuỗi định danh tài nguyên.
 *
 * 3. [PRESERVED] MODULO ALLOCATION:
 * - Giữ nguyên thuật toán chia bài "Cuốn chiếu" cho nhóm khách mới để tối ưu tài nguyên như Timeline.
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION)
// ============================================================================

const CONFIG = {
    // Tài nguyên phần cứng (Giới hạn vật lý)
    MAX_CHAIRS: 6,        
    MAX_BEDS: 6,          
    MAX_TOTAL_GUESTS: 12, // Tổng dung lượng phục vụ tối đa
    
    // Cấu hình thời gian hoạt động
    OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
    
    // Bộ đệm thời gian (Time Buffers - Đơn vị: Phút)
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi ca
    TRANSITION_BUFFER: 5, // Thời gian khách di chuyển hoặc thay đồ
    
    // Dung sai và giới hạn tính toán
    TOLERANCE: 1,         // Sai số cho phép (phút) khi so sánh trùng lặp
    MAX_TIMELINE_MINS: 1440 // Tổng số phút trong 24h
};

// Cơ sở dữ liệu dịch vụ (Dynamic Services Database)
// Được cập nhật realtime từ Google Sheets
let SERVICES = {}; 

/**
 * Cập nhật danh sách dịch vụ và thêm các dịch vụ hệ thống mặc định (System Services).
 * Hàm này đảm bảo Core luôn hiểu được các loại booking đặc biệt như Nghỉ, Ăn trưa.
 * @param {Object} newServicesObj - Danh sách dịch vụ từ nguồn bên ngoài
 */
function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE V101.1] Services Synced. Total: ${Object.keys(SERVICES).length} items loaded.`);
}

// ============================================================================
// PHẦN 2: TIỆN ÍCH THỜI GIAN (TIME UTILITIES)
// ============================================================================

/**
 * Lấy thời gian hiện tại theo múi giờ Đài Loan (UTC+8)
 */
function getTaipeiNow() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8)); // UTC+8
}

/**
 * Chuyển đổi chuỗi giờ (HH:mm) thành số phút tính từ 00:00.
 * Hỗ trợ xử lý qua đêm (VD: 01:00 sáng -> 25:00 -> 1500 phút).
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; 
    try {
        let str = timeStr.toString();
        // Xử lý định dạng ISO "2023-10-10T12:00:00" hoặc có ngày đi kèm
        if (str.includes('T') || str.includes(' ')) {
            const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) str = timeMatch[0];
        }
        // Chuẩn hóa dấu hai chấm
        let cleanStr = str.trim().replace(/：/g, ':');
        const parts = cleanStr.split(':');
        if (parts.length < 2) return -1;
        
        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);
        
        if (isNaN(h) || isNaN(m)) return -1;
        
        // Logic giờ qua đêm: Nếu giờ nhỏ hơn giờ mở cửa (8h), coi như thuộc ngày hôm sau (cộng thêm 24h)
        if (h < CONFIG.OPEN_HOUR) h += 24; 
        
        return (h * 60) + m;
    } catch (e) {
        return -1;
    }
}

/**
 * Chuyển đổi số phút thành chuỗi giờ (HH:mm).
 */
function getTimeStrFromMins(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    if (h >= 24) h -= 24; 
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Kiểm tra sự trùng lặp giữa 2 khoảng thời gian [StartA, EndA] và [StartB, EndB].
 * Có sử dụng TOLERANCE để tránh các trường hợp tiếp xúc quá sát gây lỗi làm tròn.
 */
function isOverlap(startA, endA, startB, endB) {
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    // Hai khoảng trùng nhau khi Start này nhỏ hơn End kia và ngược lại
    return (startA < safeEndB) && (startB < safeEndA);
}

// ============================================================================
// PHẦN 3: BỘ NHẬN DIỆN THÔNG MINH (SMART CLASSIFIER)
// ============================================================================

/**
 * Xác định xem một dịch vụ có phải là Combo (kết hợp nhiều công đoạn) hay không.
 */
function isComboService(serviceObj, serviceNameRaw = '') {
    // Trường hợp tệ nhất: Không có dữ liệu gì
    if (!serviceObj && !serviceNameRaw) return false;
    
    // 1. Kiểm tra Category chuẩn trong Database
    const cat = (serviceObj && serviceObj.category ? serviceObj.category : '').toString().toUpperCase().trim();
    if (cat === 'COMBO' || cat === 'MIXED') return true;

    // 2. Kiểm tra Tên Dịch vụ (Robust Check - Kiểm tra cả tên DB và tên Raw)
    const dbName = (serviceObj && serviceObj.name ? serviceObj.name : '').toString().toUpperCase();
    const rawName = (serviceNameRaw || '').toString().toUpperCase();
    const nameToCheck = dbName + " | " + rawName;
    
    const comboKeywords = [
        'COMBO', '套餐', 'MIX', '+', 'SET', 
        '腳身', '全餐', 'FOOT AND BODY', 'BODY AND FOOT',
        '雙人', 'A餐', 'B餐', 'C餐', '油壓+足'
    ];
    
    for (const kw of comboKeywords) {
        if (nameToCheck.includes(kw)) {
            return true;
        }
    }
    return false;
}

/**
 * Xác định loại tài nguyên (CHAIR hoặc BED) dựa trên thông tin dịch vụ.
 */
function detectResourceType(serviceObj) {
    if (!serviceObj) return 'CHAIR';
    
    // Ưu tiên config cứng
    if (serviceObj.type === 'BED' || serviceObj.type === 'CHAIR') return serviceObj.type;

    // Phân tích tên nếu config không rõ ràng
    const name = (serviceObj.name || '').toUpperCase();
    if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|SPA|BACK/)) return 'BED';
    
    return 'CHAIR'; // Mặc định an toàn
}

// ============================================================================
// PHẦN 4: MATRIX ENGINE V101.1 (STRICT INHERITANCE READY)
// ============================================================================

class VirtualMatrix {
    constructor() {
        // Khởi tạo các làn chứa (Lanes) cho từng loại tài nguyên
        this.lanes = {
            'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
            'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
        };
    }

    /**
     * Helper: Kiểm tra xem một làn cụ thể có trống không trong khoảng thời gian cho trước.
     */
    checkLaneFree(lane, start, end) {
        for (let block of lane.occupied) {
            if (isOverlap(start, end, block.start, block.end)) {
                return false; // Bị trùng
            }
        }
        return true; // Trống
    }

    /**
     * Helper: Thực hiện đặt chỗ vào làn
     */
    allocateToLane(lane, start, end, ownerId) {
        lane.occupied.push({ start, end, ownerId });
        // Sort lại để dễ debug và hiển thị timeline
        lane.occupied.sort((a, b) => a.start - b.start);
        return lane.id;
    }

    /**
     * [V101.1 UPDATED] Try Allocate with Preferred Index
     * Hàm này đóng vai trò quyết định trong việc xếp chỗ.
     * @param {string} type - 'BED' hoặc 'CHAIR'
     * @param {number} start - Phút bắt đầu
     * @param {number} end - Phút kết thúc
     * @param {string} ownerId - ID booking
     * @param {number|null} preferredIndex - Chỉ số ưu tiên (1-based). 
     * - Nếu là khách cũ: Đây là Anchor Index (vị trí thực tế trên timeline).
     * - Nếu là khách mới: Đây là Modulo Index (vị trí chia bài).
     */
    tryAllocate(type, start, end, ownerId, preferredIndex = null) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null; 

        // CHIẾN LƯỢC 1: TARGETED ALLOCATION (Ưu tiên vị trí định sẵn)
        // Đây là nơi "Strict Inheritance" hoạt động. Nếu khách cũ đã có preferredIndex (VD: 3),
        // hệ thống sẽ KIỂM TRA SLOT 3 ĐẦU TIÊN.
        if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
            const targetLane = resourceGroup[preferredIndex - 1]; // Array index là 0-based
            if (this.checkLaneFree(targetLane, start, end)) {
                return this.allocateToLane(targetLane, start, end, ownerId);
            }
            // Nếu vị trí ưu tiên đã bị chiếm, mới rơi xuống Chiến lược 2 (Fallback)
        }

        // CHIẾN LƯỢC 2: FIRST-FIT (Vét cạn tìm chỗ trống bất kỳ)
        // Duyệt qua tất cả các làn, làn nào trống thì điền vào ngay
        for (let lane of resourceGroup) {
            if (this.checkLaneFree(lane, start, end)) {
                return this.allocateToLane(lane, start, end, ownerId);
            }
        }

        return null; // Hết sạch chỗ
    }
}

// ============================================================================
// PHẦN 5: LOGIC TÌM NHÂN VIÊN (STAFF FINDER)
// ============================================================================

function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        // 1. Staff phải tồn tại và không OFF
        if (!staffInfo || staffInfo.off) return false; 
        
        // 2. Kiểm tra giờ làm việc (Shift)
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        if (shiftStart === -1 || shiftEnd === -1) return false; 

        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
        
        // Xử lý cờ Strict Time (Nghiêm ngặt giờ về)
        const isStrict = staffInfo.isStrictTime === true;
        if (isStrict) {
            if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
        } else {
            if (start > shiftEnd) return false;
        }

        // 3. Kiểm tra trùng lịch (Busy List)
        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

        // 4. Kiểm tra giới tính
        if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
        if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;

        return true; 
    };

    if (staffReq && !['RANDOM', 'MALE', 'FEMALE', '隨機', 'Any', 'undefined'].includes(staffReq)) {
        return checkOneStaff(staffReq) ? staffReq : null;
    } 
    else {
        // Tìm random: Ưu tiên ai rảnh thì lấy
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

// ============================================================================
// PHẦN 6: BỘ HELPER SINH BIẾN THỂ THỜI GIAN (ELASTIC GENERATOR)
// ============================================================================

function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
    // Nếu đã bị khóa Phase 1 (Do người dùng chỉnh tay hoặc hệ thống chốt)
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
        return [{ 
            p1: parseInt(customLockedPhase1), 
            p2: totalDuration - parseInt(customLockedPhase1), 
            deviation: 999 
        }];
    }

    const standardHalf = Math.floor(totalDuration / 2);
    let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];

    if (!step || !limit || step <= 0 || limit <= 0) return options;

    let currentDeviation = step;
    while (currentDeviation <= limit) {
        // Biến thể A: Giảm Phase 1 (Chân ít hơn)
        let p1_A = standardHalf - currentDeviation;
        let p2_A = totalDuration - p1_A;
        if (p1_A >= 15 && p2_A >= 15) options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
        
        // Biến thể B: Tăng Phase 1 (Chân nhiều hơn)
        let p1_B = standardHalf + currentDeviation;
        let p2_B = totalDuration - p1_B;
        if (p1_B >= 15 && p2_B >= 15) options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
        currentDeviation += step;
    }
    // Sắp xếp các phương án theo độ lệch chuẩn tăng dần (Ưu tiên 50/50 nhất)
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
}

// ============================================================================
// PHẦN 7: CORE ENGINE V101.1 (MAIN LOGIC WITH SYNC FIX)
// ============================================================================

/**
 * HÀM KIỂM TRA KHẢ DỤNG CHÍNH - PHIÊN BẢN V101.1
 * Tích hợp: 
 * - Modulo Allocation (Cho khách mới)
 * - Strict Physical Inheritance (Cho khách cũ - Fix lỗi trôi slot)
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: CHUẨN BỊ DỮ LIỆU KHÁCH CŨ (PRE-PROCESSING & INDEX PARSING)
    // ------------------------------------------------------------------------
    let existingBookingsProcessed = [];
    // Sắp xếp booking hiện tại theo thời gian để xử lý tuần tự
    let sortedCurrentBookings = [...currentBookingsRaw].sort((a, b) => {
        return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
    });

    sortedCurrentBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = isComboService(svcInfo, b.serviceName);
        let duration = b.duration || 60;
        
        // [V101.1 CRITICAL FIX] STRICT PHYSICAL INHERITANCE
        // Thay vì dùng RowID (số dòng Excel) làm chỉ số ghế, ta dùng 'allocated_resource'.
        let anchorIndex = null;
        
        // Ưu tiên 1: Lấy từ trường allocated_resource (được sync từ Server/Timeline)
        // Định dạng mong đợi: "BED-3", "CHAIR-2", "3", "2"
        if (b.allocated_resource) {
            const match = b.allocated_resource.toString().match(/(\d+)/);
            if (match) {
                anchorIndex = parseInt(match[0]);
            }
        } 
        
        // Fallback (An toàn): Nếu không có allocated_resource, kiểm tra xem rowId có phải dạng Resource ID không
        // Nếu rowId là "123" (số dòng) thì BỎ QUA, không gán anchorIndex (để First-Fit xử lý).
        // Chỉ gán nếu rowId có dạng đặc biệt (hiếm khi xảy ra nhưng đề phòng).
        else if (b.rowId && typeof b.rowId === 'string' && (b.rowId.includes('BED') || b.rowId.includes('CHAIR'))) {
             const match = b.rowId.toString().match(/(\d+)/);
             if (match) anchorIndex = parseInt(match[0]);
        }
        
        // Lưu ý: Nếu anchorIndex vẫn là null, booking này sẽ được xếp theo chế độ First-Fit (lấp chỗ trống).

        let processedB = {
            id: b.rowId, 
            originalData: b, 
            staffName: b.staffName, 
            serviceName: b.serviceName, 
            category: svcInfo.category,
            isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
            elasticStep: svcInfo.elasticStep || 5, 
            elasticLimit: svcInfo.elasticLimit || 15,
            startMins: bStart,
            duration: duration,
            blocks: [], 
            anchorIndex: anchorIndex // Lưu lại index này để dùng cho logic thừa kế
        };

        if (isCombo) {
            let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
            let p2 = duration - p1;
            const p1End = bStart + p1;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            
            // --- LOGIC NHẬN DIỆN FLOW KHÁCH CŨ ---
            let isBodyFirst = false;
            const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
            
            // 1. Kiểm tra Tag tường minh
            if (b.flow === 'BF' || noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體') || noteContent.includes('先身')) {
                isBodyFirst = true;
            }
            // 2. Kiểm tra vị trí vật lý (Fallback Logic)
            else if (b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) {
                isBodyFirst = true; // Nếu đang nằm ở BED thì chắc chắn là Body First (hoặc đang làm Body)
            }

            // [V101.1 LOGIC] Áp dụng Anchor Index vào các Block (Inheritance)
            // Nếu anchorIndex tồn tại (VD: 3), ta gán nó vào `forcedIndex` của block tương ứng.
            // Điều này ép Core phải thử đặt vào Slot 3 trước.
            if (isBodyFirst) {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: anchorIndex }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'CHAIR', forcedIndex: anchorIndex });
                processedB.flow = 'BF'; 
            } else {
                // Mặc định là FB (Chân trước)
                processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: anchorIndex }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED', forcedIndex: anchorIndex });
                processedB.flow = 'FB'; 
            }
            
            processedB.p1_current = p1; 
            processedB.p2_current = p2;
        } else {
            let rType = detectResourceType(svcInfo);
            // Single Service cũng tôn trọng vị trí hiện tại
            processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
        }
        existingBookingsProcessed.push(processedB);
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: TẠO DANH SÁCH "PENDULUM" (CON LẮC) - PHÂN PHỐI FLOW
    // ------------------------------------------------------------------------
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return isComboService(s, g.serviceCode); });
    
    // [V101.0] Tính toán kích thước "Nửa nhóm" (Half Size) để dùng cho công thức Modulo
    const halfSize = Math.ceil(comboGuests.length / 2);

    const maxBF = comboGuests.length;
    let trySequence = [];

    if (maxBF > 0) {
        let mid = maxBF / 2; 
        trySequence.push(Math.ceil(mid));
        if (Math.floor(mid) !== Math.ceil(mid)) trySequence.push(Math.floor(mid));
        
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
    // BƯỚC C: THỰC THI VÒNG LẶP VÉT CẠN (EXHAUSTIVE LOOP)
    // ------------------------------------------------------------------------
    let successfulScenario = null;

    for (let numBF of trySequence) {
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;
        
        // === GIAI ĐOẠN 1: XẾP CỨNG KHÁCH CŨ (ÁP DỤNG INHERITANCE) ===
        let softsToSqueezeCandidates = []; 
        for (const exB of existingBookingsProcessed) {
            let placedSuccessfully = true;
            let allocatedSlots = []; 
            for (const block of exB.blocks) {
                const realEnd = block.end + CONFIG.CLEANUP_BUFFER;
                
                // [V101.1 CRITICAL] Truyền forcedIndex (Inheritance)
                // Hệ thống sẽ cố gắng đặt khách cũ vào đúng số ghế/giường cũ của họ (Anchor Index)
                const slotId = matrix.tryAllocate(
                    block.type, 
                    block.start, 
                    realEnd, 
                    exB.id, 
                    block.forcedIndex // <-- Đây là chìa khóa của Strict Inheritance
                );
                
                if (!slotId) { placedSuccessfully = false; break; }
                allocatedSlots.push(slotId);
            }
            if (exB.isElastic) {
                if (placedSuccessfully) exB.allocatedSlots = allocatedSlots; 
                softsToSqueezeCandidates.push(exB); 
            }
        }

        // === GIAI ĐOẠN 2: TÍNH TOÁN BLOCKS CHO KHÁCH MỚI ===
        let newGuestBlocksMap = []; 

        for (const ng of newGuests) {
            const svc = SERVICES[ng.serviceCode] || { name: ng.serviceCode || 'Unknown', duration: 60, price: 0 }; 
            let flow = 'FB'; 
            let isThisGuestCombo = isComboService(svc, ng.serviceCode);

            if (isThisGuestCombo) {
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                // Pendulum: Chia nhóm thành FB và BF
                if (cIdx >= 0 && cIdx < numBF) { flow = 'BF'; }
            }

            const duration = svc.duration || 60;
            let blocks = [];
            
            if (isThisGuestCombo) {
                const p1Standard = Math.floor(duration / 2);
                const p2Standard = duration - p1Standard;

                if (flow === 'FB') { // FOOT -> BODY
                    const t1End = requestStartMins + p1Standard;
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                    blocks.push({ start: t2Start, end: t2Start + p2Standard + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'FB', timeStr: timeStr, allocated: [] });
                } else { // BODY -> FOOT
                    const t1End = requestStartMins + p2Standard; 
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    blocks.push({ start: t2Start, end: t2Start + p1Standard + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                    scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'BF', timeStr: timeStr, allocated: [] });
                }
            } else { // Single Service
                let rType = detectResourceType(svc);
                blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONFIG.CLEANUP_BUFFER, type: rType });
                scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, flow: 'SINGLE', timeStr: timeStr, allocated: [] });
            }
            newGuestBlocksMap.push({ guest: ng, blocks: blocks });
        }

        // === GIAI ĐOẠN 3: CỐ GẮNG XẾP KHÁCH MỚI (ÁP DỤNG MODULO ALLOCATION) ===
        let conflictFound = false;
        
        for (const item of newGuestBlocksMap) {
            let guestAllocations = [];
            
            // [V101.0 LOGIC] Tính toán Preferred Index (Chỉ số ưu tiên) dựa trên Modulo
            // Logic: Chia bài so le để tối ưu tài nguyên
            let preferredIdx = null;
            if (halfSize > 0) {
                // Chúng ta sử dụng global index (item.guest.idx) để tính toán
                preferredIdx = (item.guest.idx % halfSize) + 1;
            }

            for (const block of item.blocks) {
                // Gọi hàm cấp phát mới với tham số preferredIndex
                const slotId = matrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, preferredIdx);
                if (!slotId) {
                    conflictFound = true;
                    break;
                }
                guestAllocations.push(slotId);
            }
            if (conflictFound) break;

            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) detail.allocated = guestAllocations;
        }

        // === GIAI ĐOẠN 4: CHIẾN THUẬT SQUEEZE (BÓP MỀM) ===
        // Chiến thuật này chỉ chạy khi Giai đoạn 3 thất bại (không tìm thấy chỗ)
        if (conflictFound) {
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                // Squeeze cũng phải tôn trọng Inheritance (forcedIndex)
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
            });

            let squeezeScenarioPossible = true;
            // Với Squeeze, ta cũng áp dụng Modulo Allocation để tối ưu
            for (const item of newGuestBlocksMap) {
                let preferredIdxSqueeze = (halfSize > 0) ? (item.guest.idx % halfSize) + 1 : null;
                for (const block of item.blocks) {
                    if (!matrixSqueeze.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, preferredIdxSqueeze)) {
                        squeezeScenarioPossible = false; break;
                    }
                }
                if (!squeezeScenarioPossible) break;
            }

            if (!squeezeScenarioPossible) { scenarioFailed = true; continue; }

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
                    
                    // Sử dụng hàm kiểm tra set block mới (Updated V101)
                    if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                        testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id, tb.forcedIndex));
                        fit = true;
                        if (split.deviation !== 0) {
                            updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze V101.0' });
                        }
                        break; 
                    }
                }
                if (!fit) { squeezeScenarioPossible = false; break; }
            }

            if (squeezeScenarioPossible) {
                scenarioUpdates = updatesProposed;
                matrix = matrixSqueeze; 
            } else {
                scenarioFailed = true; continue;
            }
        }

        // === GIAI ĐOẠN 5: KIỂM TRA NHÂN SỰ ===
        let flatTimeline = [];
        Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
            const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
            if (ex) flatTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
        })));

        let staffAssignmentSuccess = true;
        for (const item of newGuestBlocksMap) {
            const assignedStaff = findAvailableStaff(item.guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length - 1].end, staffList, flatTimeline);
            if (!assignedStaff) { staffAssignmentSuccess = false; break; }
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) detail.staff = assignedStaff;
            item.blocks.forEach(b => flatTimeline.push({ start: b.start, end: b.end, staffName: assignedStaff }));
        }

        if (!staffAssignmentSuccess) { scenarioFailed = true; continue; }

        successfulScenario = { details: scenarioDetails, updates: scenarioUpdates, matrixDump: matrix.lanes };
        break; 
    }

    // ------------------------------------------------------------------------
    // BƯỚC D: KẾT QUẢ CUỐI CÙNG TRẢ VỀ
    // ------------------------------------------------------------------------
    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true, 
            strategy: 'MATRIX_PENDULUM_V101.1_SYNC', 
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
        };
    } else {
        return { feasible: false, reason: "Hết chỗ (Không tìm thấy khe hở phù hợp)" };
    }
}

/**
 * Hàm phụ trợ cho logic Squeeze (Bóp mềm): Kiểm tra xem một tập hợp các block có thể nhét vào matrix không.
 * [V101.0 UPDATE] Hỗ trợ kiểm tra forcedIndex trong quá trình Squeeze.
 */
function isBlockSetAllocatable(blocks, matrix) {
    for (const b of blocks) {
        const laneGroup = matrix.lanes[b.type];
        if (!laneGroup) return false;
        
        let foundLane = false;
        
        // [V101.0] Kiểm tra ưu tiên index trước
        if (b.forcedIndex && b.forcedIndex > 0 && b.forcedIndex <= laneGroup.length) {
            const targetLane = laneGroup[b.forcedIndex - 1];
            let isFree = true;
            for (const occ of targetLane.occupied) {
                if (isOverlap(b.start, b.end, occ.start, occ.end)) { isFree = false; break; }
            }
            if (isFree) return true; // Nếu vị trí cũ còn trống thì chắc chắn OK (Short-circuit success)
        }

        // Nếu không có ưu tiên hoặc ưu tiên bị bận, quét tất cả (Fallback)
        for (const lane of laneGroup) {
            let isFree = true;
            for (const occ of lane.occupied) {
                if (isOverlap(b.start, b.end, occ.start, occ.end)) {
                    isFree = false; break;
                }
            }
            if (isFree) { foundLane = true; break; }
        }
        if (!foundLane) return false;
    }
    return true;
}

// ============================================================================
// PHẦN 8: MODULE EXPORT (DÙNG CHO CẢ NODEJS VÀ BROWSER)
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

// Môi trường Node.js (Backend)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreAPI;
}

// Môi trường Browser (Frontend)
if (typeof window !== 'undefined') {
    window.ResourceCore = CoreAPI;
    window.checkRequestAvailability = CoreAPI.checkRequestAvailability;
    window.setDynamicServices = CoreAPI.setDynamicServices;
    console.log("✅ Resource Core V101.1 Loaded: Strict Physical Inheritance.");
}

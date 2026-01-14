/*
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V102.0 (COUPLE SYNC STRATEGY & VISUAL PARITY)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/14
 *
 * * * * * CHANGE LOG V102.0 (THE "COUPLE SYNC" UPDATE) * * * * *
 * 1. [FEATURE] COUPLE SYNC PRIORITIZATION (Ưu tiên cặp đôi):
 * - Logic cũ (V101.3): Luôn chia tách nhóm 2 người (1 BF, 1 FB) để cân bằng Matrix.
 * - Logic mới (V102.0): Nếu phát hiện nhóm 2 khách Combo:
 * + Ưu tiên 1: Thử xếp cả 2 cùng là FB (Foot First) -> Để nằm cạnh nhau lúc làm chân.
 * + Ưu tiên 2: Thử xếp cả 2 cùng là BF (Body First) -> Để nằm cạnh nhau lúc làm Body.
 * + Ưu tiên 3: Mới dùng logic chia tách (Split) nếu không còn đủ cặp slot.
 *
 * 2. [SYNC] ENHANCED MATRIX LOOK-AHEAD:
 * - Đồng bộ phương thức `countFreeSlots` từ BookingHandler.
 * - Cải thiện logic tính `preferredIdx` để tránh chồng slot khi chạy chế độ Sync.
 *
 * 3. [PRESERVED] CORE STABILITY:
 * - Giữ nguyên toàn bộ logic Squeeze (Bóp mềm), Elastic (Co giãn), và Manual Lock.
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
    console.log(`[CORE V102.0] Services Synced. Total: ${Object.keys(SERVICES).length} items loaded.`);
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
// PHẦN 4: MATRIX ENGINE V102.0
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
     * [V102.0 UPDATED] Đếm số lượng slot trống của một loại trong khoảng thời gian.
     * Hỗ trợ cho việc đánh giá nhanh khả năng chứa của Matrix.
     */
    countFreeSlots(type, start, end) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return 0;
        let count = 0;
        for (let lane of resourceGroup) {
            if (this.checkLaneFree(lane, start, end)) count++;
        }
        return count;
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
     * [V102.0 UPDATED] Try Allocate with Preferred Index
     * Hàm này đóng vai trò quyết định trong việc xếp chỗ.
     * @param {string} type - 'BED' hoặc 'CHAIR'
     * @param {number} start - Phút bắt đầu
     * @param {number} end - Phút kết thúc
     * @param {string} ownerId - ID booking
     * @param {number|null} preferredIndex - Chỉ số ưu tiên (1-based). 
     */
    tryAllocate(type, start, end, ownerId, preferredIndex = null) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null; 

        // CHIẾN LƯỢC 1: TARGETED ALLOCATION (Ưu tiên vị trí định sẵn)
        if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
            const targetLane = resourceGroup[preferredIndex - 1]; // Array index là 0-based
            if (this.checkLaneFree(targetLane, start, end)) {
                return this.allocateToLane(targetLane, start, end, ownerId);
            }
            // Nếu vị trí ưu tiên đã bị chiếm, rơi xuống Chiến lược 2 (Fallback)
        }

        // CHIẾN LƯỢC 2: FIRST-FIT (Vét cạn tìm chỗ trống bất kỳ)
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
    // Nếu đã bị khóa Phase 1
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
        let p1_A = standardHalf - currentDeviation;
        let p2_A = totalDuration - p1_A;
        if (p1_A >= 15 && p2_A >= 15) options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
        
        let p1_B = standardHalf + currentDeviation;
        let p2_B = totalDuration - p1_B;
        if (p1_B >= 15 && p2_B >= 15) options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
        currentDeviation += step;
    }
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
}

// ============================================================================
// PHẦN 7: CORE ENGINE V102.0 (COUPLE SYNC ENABLED)
// ============================================================================

/**
 * HÀM KIỂM TRA KHẢ DỤNG CHÍNH - PHIÊN BẢN V102.0
 * Tích hợp: 
 * - Group Folding (Gom nhóm hiển thị)
 * - Modulo Wrapping (Cuộn chỉ số slot ảo)
 * - Couple Sync Strategy (Ưu tiên đi cùng nhau cho cặp đôi)
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: TIỀN XỬ LÝ - GOM NHÓM & TÍNH TOÁN SLOT ẢO (VISUAL SYNC)
    // ------------------------------------------------------------------------
    // Mục tiêu: Biến đổi danh sách bookings phẳng thành danh sách có cấu trúc nhóm (Folding)
    // giống hệt cách Timeline đang hiển thị, để Core không báo đầy ảo.
    
    // 1. Sắp xếp sơ bộ
    let sortedRaw = [...currentBookingsRaw].sort((a, b) => {
        return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
    });

    // 2. Gom nhóm (Grouping)
    const bookingGroups = {};
    sortedRaw.forEach(b => {
        // Tạo Key định danh nhóm: Giờ + (SĐT hoặc Tên)
        const timeKey = (b.startTime || "").split(' ')[1] || "00:00";
        // Lấy 6 số cuối SĐT để định danh, nếu không có thì lấy tên
        const contactInfo = b.originalData?.phone || b.originalData?.sdt || b.originalData?.custPhone || b.originalData?.customerName || "Unknown";
        const contactKey = contactInfo.toString().replace(/\D/g, '').slice(-6) || contactInfo.toString().trim();
        
        // Nếu booking đang chạy (Running), ưu tiên dùng rowId làm key riêng để không bị gộp (vì nó đã có chỗ cố định)
        const groupKey = (b.status === 'Running') ? `RUNNING_${b.rowId}` : `${timeKey}_${contactKey}`;
        
        if (!bookingGroups[groupKey]) bookingGroups[groupKey] = [];
        bookingGroups[groupKey].push(b);
    });

    // 3. Remapping (Tính toán lại Index và Flow cho từng booking trong nhóm)
    let remappedBookings = [];
    Object.values(bookingGroups).forEach(group => {
        // Sort lại theo rowId để đảm bảo thứ tự 1, 2, 3...
        group.sort((a,b) => parseInt(a.rowId) - parseInt(b.rowId));
        
        const groupSize = group.length;
        const halfSize = Math.ceil(groupSize / 2);

        group.forEach((b, idx) => {
            // Mặc định reset các tag ảo
            b._virtualInheritanceIndex = null;
            b._impliedFlow = null;

            // [LOGIC FOLDING]: Chỉ áp dụng cho booking Tương lai (Reserved)
            if (b.status !== 'Running') {
                // --- 1. MODULO WRAPPING (Tính Slot Ảo) ---
                let virtualIndex = null;
                if (groupSize >= 2) {
                    virtualIndex = (idx % halfSize) + 1;
                } else {
                    virtualIndex = idx + 1; // Nhóm 1 người thì cứ Slot 1
                }
                b._virtualInheritanceIndex = virtualIndex; 

                // --- 2. PENDULUM FLOW DISTRIBUTION (Tự động chia bài) ---
                // Chỉ định ngầm Flow để booking cũ được xếp vào đúng chỗ như trên UI
                if (groupSize >= 2) {
                    if (idx < halfSize) {
                        b._impliedFlow = 'BF'; // Nửa đầu làm Body trước
                    } else {
                        b._impliedFlow = 'FB'; // Nửa sau làm Foot trước
                    }
                }
            }
            remappedBookings.push(b);
        });
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: XỬ LÝ CHI TIẾT BOOKING (BLOCK CREATION)
    // ------------------------------------------------------------------------
    let existingBookingsProcessed = [];

    remappedBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = isComboService(svcInfo, b.serviceName);
        let duration = b.duration || 60;
        
        // [V102.0 LOGIC] XÁC ĐỊNH ANCHOR INDEX (VỊ TRÍ NEO)
        let anchorIndex = null;
        
        // Ưu tiên 1: Nếu booking đang chạy (Running), TUYỆT ĐỐI TUÂN THỦ allocated_resource
        if (b.status === 'Running') {
             if (b.allocated_resource) {
                const match = b.allocated_resource.toString().match(/(\d+)/);
                if (match) anchorIndex = parseInt(match[0]);
             } else if (b.rowId && typeof b.rowId === 'string' && (b.rowId.includes('BED') || b.rowId.includes('CHAIR'))) {
                 const match = b.rowId.toString().match(/(\d+)/);
                 if (match) anchorIndex = parseInt(match[0]);
             }
        } 
        // Ưu tiên 2: Nếu là booking tương lai (Reserved), ƯU TIÊN VIRTUAL INDEX (Folding)
        else {
            if (b._virtualInheritanceIndex) {
                anchorIndex = b._virtualInheritanceIndex;
            }
            // Fallback: Nếu không tính được virtual, thử check xem có gán cứng không
            else if (b.allocated_resource) {
                const match = b.allocated_resource.toString().match(/(\d+)/);
                if (match) anchorIndex = parseInt(match[0]);
            }
        }

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
            anchorIndex: anchorIndex
        };

        if (isCombo) {
            let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
            let p2 = duration - p1;
            const p1End = bStart + p1;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            
            // LOGIC FLOW (HIERARCHY V102.0)
            let isBodyFirst = false;
            const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
            
            // Priority 1: Manual Note (Tag tường minh)
            if (b.flow === 'BF' || noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體') || noteContent.includes('先身')) {
                isBodyFirst = true;
            }
            // Priority 2: Running Status (Vị trí vật lý)
            else if (b.status === 'Running' && b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) {
                isBodyFirst = true; 
            }
            // Priority 3: Implied Flow (Tự động chia bài)
            else if (b._impliedFlow === 'BF') {
                isBodyFirst = true;
            }

            // Gán forcedIndex (Strict Inheritance)
            if (isBodyFirst) {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: anchorIndex }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'CHAIR', forcedIndex: anchorIndex });
                processedB.flow = 'BF'; 
            } else {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: anchorIndex }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED', forcedIndex: anchorIndex });
                processedB.flow = 'FB'; 
            }
            processedB.p1_current = p1; 
            processedB.p2_current = p2;
        } else {
            let rType = detectResourceType(svcInfo);
            processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
        }
        existingBookingsProcessed.push(processedB);
    });

    // ------------------------------------------------------------------------
    // BƯỚC C: TẠO KỊCH BẢN CHO KHÁCH MỚI (V102.0 COUPLE STRATEGY)
    // ------------------------------------------------------------------------
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return isComboService(s, g.serviceCode); });
    
    // Half Size cho nhóm khách mới
    const newGuestHalfSize = Math.ceil(comboGuests.length / 2);
    const maxBF = comboGuests.length;

    // [V102.0] SMART SEQUENCE GENERATION
    // Xác định thứ tự ưu tiên thử nghiệm Flow (Sync vs Split)
    let trySequence = [];

    if (maxBF === 2) {
        // CHIẾN THUẬT CẶP ĐÔI: Ưu tiên SYNC (0 hoặc 2) trước khi thử SPLIT (1)
        // 0: Cả 2 đều FB (Foot First) -> Ưu tiên cao nhất
        // 2: Cả 2 đều BF (Body First) -> Ưu tiên nhì
        // 1: Tách ra (Split) -> Ưu tiên cuối
        trySequence = [0, 2, 1]; 
    } else if (maxBF > 0) {
        // Nhóm khác: Dùng chiến thuật con lắc (Pendulum) cân bằng
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
    // BƯỚC D: THỰC THI VÒNG LẶP VÉT CẠN (EXHAUSTIVE LOOP)
    // ------------------------------------------------------------------------
    let successfulScenario = null;

    for (let numBF of trySequence) {
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;
        
        // === GIAI ĐOẠN 1: NẠP KHÁCH CŨ VÀO MATRIX ===
        let softsToSqueezeCandidates = []; 
        for (const exB of existingBookingsProcessed) {
            let placedSuccessfully = true;
            let allocatedSlots = []; 
            for (const block of exB.blocks) {
                const realEnd = block.end + CONFIG.CLEANUP_BUFFER;
                
                // Cố gắng đặt vào slot chỉ định (forcedIndex)
                // Nhờ bước Pre-processing, forcedIndex ở đây đã được Folding cho nhóm Reserved
                const slotId = matrix.tryAllocate(
                    block.type, 
                    block.start, 
                    realEnd, 
                    exB.id, 
                    block.forcedIndex 
                );
                
                if (!slotId) { placedSuccessfully = false; break; }
                allocatedSlots.push(slotId);
            }
            if (exB.isElastic) {
                if (placedSuccessfully) exB.allocatedSlots = allocatedSlots; 
                softsToSqueezeCandidates.push(exB); 
            }
        }

        // === GIAI ĐOẠN 2: TÍNH TOÁN KHÁCH MỚI ===
        let newGuestBlocksMap = []; 

        for (const ng of newGuests) {
            const svc = SERVICES[ng.serviceCode] || { name: ng.serviceCode || 'Unknown', duration: 60, price: 0 }; 
            let flow = 'FB'; 
            let isThisGuestCombo = isComboService(svc, ng.serviceCode);

            if (isThisGuestCombo) {
                // Logic chia bài: numBF quy định số lượng khách làm BF trong Scenario này
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
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

        // === GIAI ĐOẠN 3: XẾP KHÁCH MỚI (MODULO ALLOCATION) ===
        let conflictFound = false;
        
        for (const item of newGuestBlocksMap) {
            let guestAllocations = [];
            // Tính toán Preferred Index cho khách mới
            let preferredIdx = null;
            if (newGuestHalfSize > 0 && newGuests.length >= 2) {
                preferredIdx = (item.guest.idx % newGuestHalfSize) + 1;
                
                // [V102.0 COUPLE SYNC FIX]
                // Nếu đang chạy chế độ SYNC (Cùng flow), ta muốn khách nằm cạnh nhau (1, 2)
                // chứ không phải chồng lên nhau (1, 1).
                // numBF = 0 (All FB) hoặc numBF = max (All BF) => SYNC MODE
                if (maxBF === 2 && (numBF === 0 || numBF === 2)) {
                    // Sync Mode: Xếp tuyến tính (1, 2)
                    preferredIdx = item.guest.idx + 1;
                }
            }

            for (const block of item.blocks) {
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

        // === GIAI ĐOẠN 4: SQUEEZE (NẾU CẦN) ===
        if (conflictFound) {
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            
            // Re-allocate Hard Bookings
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
            });

            let squeezeScenarioPossible = true;
            
            // Check New Guests first in Squeeze matrix
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

            // Try to fit Soft Bookings
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
                        if (split.deviation !== 0) {
                            updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze V102.0' });
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
    // BƯỚC E: KẾT QUẢ CUỐI CÙNG
    // ------------------------------------------------------------------------
    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true, 
            strategy: 'MATRIX_COUPLE_SYNC_V102.0', 
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
        };
    } else {
        return { feasible: false, reason: "Hết chỗ (Không tìm thấy khe hở phù hợp)" };
    }
}

/**
 * Hàm phụ trợ cho logic Squeeze
 */
function isBlockSetAllocatable(blocks, matrix) {
    for (const b of blocks) {
        const laneGroup = matrix.lanes[b.type];
        if (!laneGroup) return false;
        
        let foundLane = false;
        
        // Kiểm tra ưu tiên index trước
        if (b.forcedIndex && b.forcedIndex > 0 && b.forcedIndex <= laneGroup.length) {
            const targetLane = laneGroup[b.forcedIndex - 1];
            let isFree = true;
            for (const occ of targetLane.occupied) {
                if (isOverlap(b.start, b.end, occ.start, occ.end)) { isFree = false; break; }
            }
            if (isFree) return true; 
        }

        // Fallback
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
// PHẦN 8: MODULE EXPORT
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
    console.log("✅ Resource Core V102.0 Loaded: Full Logic Sync with Couple Strategy.");
}
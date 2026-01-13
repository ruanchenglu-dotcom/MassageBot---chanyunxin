/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V100.0 (MODULO INTERLEAVING - THE TETRIS ALGORITHM)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/13
 *
 * * * * * CHANGE LOG V100.0 (RESOURCE COMPRESSION):
 * 1. [NEW] MODULO ALLOCATION STRATEGY:
 * - Vấn đề cũ: Cấp phát tuyến tính (Linear) khiến 6 khách Combo chiếm 6 Ghế + 6 Giường.
 * - Giải pháp: Áp dụng công thức Modulo: PreferredSlot = (Index % HalfSize) + 1.
 * - Kết quả: Khách BF (Thân trước) sẽ tự động điền vào chỗ trống (Gap) của khách FB (Chân trước).
 * - Hiệu quả: 6 Khách Combo giờ đây chỉ chiếm 3 Ghế + 3 Giường (Tiết kiệm 50% không gian).
 *
 * 2. [UPGRADE] VIRTUAL MATRIX TARGETING:
 * - Matrix giờ đây chấp nhận tham số `preferredIndex` để ưu tiên xếp đúng chỗ định sẵn trước khi tìm chỗ ngẫu nhiên.
 *
 * * * * * CHANGE LOG V99.4 (PREVIOUS):
 * - Robust Combo Detection (Nối chuỗi tên DB + Menu để nhận diện Combo chính xác).
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION)
// ============================================================================

const CONFIG = {
    // Tài nguyên phần cứng
    MAX_CHAIRS: 6,        
    MAX_BEDS: 6,          
    MAX_TOTAL_GUESTS: 12, // Tổng tải trọng tối đa (Nhân sự + Không gian)
    
    // Cấu hình thời gian (Đơn vị: Giờ)
    OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
    
    // Bộ đệm thời gian (Đơn vị: Phút)
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi khách
    TRANSITION_BUFFER: 5, // Thời gian khách di chuyển giữa 2 dịch vụ (Combo)
    
    // Dung sai cho phép (Tránh lỗi làm tròn số học javascript)
    TOLERANCE: 1,         
    
    // Giới hạn lịch trình
    MAX_TIMELINE_MINS: 1440 // 24 giờ * 60 phút
};

// Cơ sở dữ liệu dịch vụ (Được nạp động từ Google Sheet hoặc Database bên ngoài)
let SERVICES = {}; 

/**
 * Cập nhật danh sách dịch vụ từ bên ngoài
 * Tự động thêm các dịch vụ hệ thống (OFF, BREAK, CLOSE)
 */
function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE V100.0] Services Updated. Total: ${Object.keys(SERVICES).length}`);
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
 * Chuyển đổi chuỗi giờ "HH:mm" thành số phút trong ngày (0 - 1440+)
 * Hỗ trợ xử lý giờ qua đêm (VD: 01:00 sáng hôm sau tính là 25:00)
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; 
    try {
        let str = timeStr.toString();
        // Xử lý định dạng ISO "2023-10-10T12:00:00"
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
        
        // Logic giờ qua đêm: Nếu giờ nhỏ hơn giờ mở cửa, cộng thêm 24h
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

/**
 * Kiểm tra sự trùng lặp giữa 2 khoảng thời gian
 * [StartA, EndA] vs [StartB, EndB]
 */
function isOverlap(startA, endA, startB, endB) {
    // Sử dụng Tolerance để tránh biên chạm nhau gây lỗi giả
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

// ============================================================================
// PHẦN 3: HELPER NHẬN DIỆN DỊCH VỤ (SERVICE CLASSIFIER - V99.4 KEEP)
// ============================================================================

/**
 * Hàm kiểm tra thông minh xem một dịch vụ có phải là Combo (2 giai đoạn) hay không.
 * Logic này cực kỳ mạnh mẽ: Kiểm tra cả Database lẫn Tên người dùng nhập (Raw).
 */
function isComboService(serviceObj, serviceNameRaw = '') {
    // Trường hợp tệ nhất: Không có dữ liệu gì
    if (!serviceObj && !serviceNameRaw) return false;
    
    // 1. Kiểm tra Category chuẩn trong Database (Ưu tiên số 1)
    const cat = (serviceObj && serviceObj.category ? serviceObj.category : '').toString().toUpperCase().trim();
    if (cat === 'COMBO' || cat === 'MIXED') return true;

    // 2. Kiểm tra Tên Dịch vụ (Robust Check)
    const dbName = (serviceObj && serviceObj.name ? serviceObj.name : '').toString().toUpperCase();
    const rawName = (serviceNameRaw || '').toString().toUpperCase();
    
    // KẾT HỢP: Kiểm tra trên cả 2 tên để tránh sót
    const nameToCheck = dbName + " | " + rawName;
    
    // Các từ khóa nhận diện Combo mở rộng
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
 * Hàm xác định loại tài nguyên dựa trên tên dịch vụ
 * Trả về 'BED' hoặc 'CHAIR'
 */
function detectResourceType(serviceObj) {
    if (!serviceObj) return 'CHAIR';
    
    // Ưu tiên config cứng
    if (serviceObj.type === 'BED' || serviceObj.type === 'CHAIR') return serviceObj.type;

    // Phân tích tên
    const name = (serviceObj.name || '').toUpperCase();
    if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|BACK|SPA/)) return 'BED';
    
    return 'CHAIR'; // Mặc định an toàn
}

// ============================================================================
// PHẦN 4: MATRIX ENGINE CORE (V100.0 - TARGETED ALLOCATION)
// ============================================================================

class VirtualMatrix {
    constructor() {
        // Khởi tạo các làn chứa (Lanes)
        this.lanes = {
            'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
            'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
        };
        this.totalLoad = []; 
    }

    /**
     * Helper: Kiểm tra xem một làn cụ thể có trống trong khoảng thời gian không
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
     * Helper: Thực hiện việc đặt chỗ vào làn
     */
    allocateToLane(lane, start, end, ownerId) {
        lane.occupied.push({ start, end, ownerId });
        lane.occupied.sort((a, b) => a.start - b.start);
        return lane.id;
    }

    /**
     * [V100.0 UPGRADE] Try Allocate with Preferred Index (Targeted Allocation)
     * @param {string} type - 'BED' hoặc 'CHAIR'
     * @param {number} start - Phút bắt đầu
     * @param {number} end - Phút kết thúc
     * @param {string} ownerId - ID booking
     * @param {number|null} preferredIndex - (Optional) Chỉ số ưu tiên (1-based: 1, 2, 3...)
     * @returns {string|null} ID tài nguyên được cấp (VD: "BED-1") hoặc null
     */
    tryAllocate(type, start, end, ownerId, preferredIndex = null) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null; 

        // CHIẾN LƯỢC 1: TARGETED ALLOCATION (Ưu tiên vị trí định sẵn)
        // Nếu có preferredIndex, hệ thống sẽ cố gắng nhét vào đúng làn đó đầu tiên.
        // Đây là cốt lõi của thuật toán "Tetris Interleaving".
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
        // Biến thể A: Giảm Phase 1
        let p1_A = standardHalf - currentDeviation;
        let p2_A = totalDuration - p1_A;
        if (p1_A >= 15 && p2_A >= 15) options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
        
        // Biến thể B: Tăng Phase 1
        let p1_B = standardHalf + currentDeviation;
        let p2_B = totalDuration - p1_B;
        if (p1_B >= 15 && p2_B >= 15) options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
        currentDeviation += step;
    }
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
}

// ============================================================================
// PHẦN 7: CORE ENGINE V100.0 (MODULO INTERLEAVING + COMBO FIX)
// ============================================================================

/**
 * Hàm kiểm tra khả dụng chính - PHIÊN BẢN V100.0
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: CHUẨN BỊ DỮ LIỆU KHÁCH CŨ (PRE-PROCESSING)
    // ------------------------------------------------------------------------
    let existingBookingsProcessed = [];
    let sortedCurrentBookings = [...currentBookingsRaw].sort((a, b) => {
        return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
    });

    sortedCurrentBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = isComboService(svcInfo, b.serviceName);
        let duration = b.duration || 60;
        
        let processedB = {
            id: b.rowId, originalData: b, staffName: b.staffName, serviceName: b.serviceName, category: svcInfo.category,
            isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
            elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
            blocks: [] 
        };

        if (isCombo) {
            let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
            let p2 = duration - p1;
            const p1End = bStart + p1;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            
            // Logic nhận diện Flow khách cũ (Persistence)
            let isBodyFirst = false;
            const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
            if (b.flow === 'BF' || noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體') || noteContent.includes('先身')) {
                isBodyFirst = true;
            }

            if (isBodyFirst) {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'BED' }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'CHAIR' });
                processedB.flow = 'BF'; 
            } else {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR' }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED' });
                processedB.flow = 'FB'; 
            }
            
            processedB.p1_current = p1; processedB.p2_current = p2; processedB.startMins = bStart; processedB.duration = duration;
        } else {
            let rType = detectResourceType(svcInfo);
            processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType });
        }
        existingBookingsProcessed.push(processedB);
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: TẠO DANH SÁCH "PENDULUM" (CON LẮC) - V99.4/V100.0
    // ------------------------------------------------------------------------
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return isComboService(s, g.serviceCode); });
    
    // [V100.0] Tính toán kích thước "Nửa nhóm" (Half Size) để dùng cho công thức Modulo
    // Nếu có 6 khách Combo -> halfSize = 3.
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
        
        // === GIAI ĐOẠN 1: XẾP CỨNG KHÁCH CŨ ===
        let softsToSqueezeCandidates = []; 
        for (const exB of existingBookingsProcessed) {
            let placedSuccessfully = true;
            let allocatedSlots = []; 
            for (const block of exB.blocks) {
                const realEnd = block.end + CONFIG.CLEANUP_BUFFER;
                const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id);
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
        // [V100.0 LOGIC START]
        let conflictFound = false;
        
        for (const item of newGuestBlocksMap) {
            let guestAllocations = [];
            
            // Tính toán Preferred Index (Chỉ số ưu tiên) dựa trên Modulo
            // Công thức: Nếu index < halfSize thì lấy index + 1
            // Nếu index >= halfSize thì lấy (index % halfSize) + 1
            // VD: 6 khách. Half=3. Khách 0->1, Khách 3->1.
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
        // [V100.0 LOGIC END]

        // === GIAI ĐOẠN 4: CHIẾN THUẬT SQUEEZE (BÓP MỀM) ===
        if (conflictFound) {
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id));
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
                        { type: 'CHAIR', start: sb.startMins, end: sP1End + CONFIG.CLEANUP_BUFFER },
                        { type: 'BED', start: sP2Start, end: sP2End + CONFIG.CLEANUP_BUFFER }
                    ];
                    if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                        testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id));
                        fit = true;
                        if (split.deviation !== 0) {
                            updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze V100.0' });
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
            feasible: true, strategy: 'MATRIX_PENDULUM_V100.0_MODULO', 
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
        };
    } else {
        return { feasible: false, reason: "Hết chỗ (Không tìm thấy khe hở phù hợp)" };
    }
}

/**
 * Hàm phụ trợ: Kiểm tra block set
 */
function isBlockSetAllocatable(blocks, matrix) {
    for (const b of blocks) {
        const laneGroup = matrix.lanes[b.type];
        if (!laneGroup) return false;
        let foundLane = false;
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
    checkRequestAvailability, setDynamicServices, get SERVICES() { return SERVICES; },
    CONFIG, getMinsFromTimeStr, getTimeStrFromMins, getTaipeiNow
};

if (typeof module !== 'undefined' && module.exports) module.exports = CoreAPI;
if (typeof window !== 'undefined') {
    window.ResourceCore = CoreAPI;
    window.checkRequestAvailability = CoreAPI.checkRequestAvailability;
    window.setDynamicServices = CoreAPI.setDynamicServices;
    console.log("✅ Resource Core V100.0 Loaded: Modulo Interleaving & Targeted Allocation.");
}
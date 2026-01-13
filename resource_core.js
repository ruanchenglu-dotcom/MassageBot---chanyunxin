/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V9.1 (ROBUST PENDULUM PATCH)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/13
 *
 * * * * * CHANGE LOG V9.1 (THE CATEGORY FIX):
 * 1. [CRITICAL FIX] COMBO DETECTION:
 * - Khắc phục lỗi hệ thống không nhận diện được gói "Signature Combo" (招牌套餐) 
 * do sai lệch Category trong Database.
 * - Cơ chế nhận diện mới: Quét sâu vào Tên dịch vụ, Category và Type.
 * - Hỗ trợ đa ngôn ngữ: Nhận diện từ khóa "Combo", "Mixed", "套餐", "All".
 * * 2. [DIAGNOSTIC LOGGING]:
 * - Thêm Log chi tiết vào Console để hiển thị chuỗi thử nghiệm (Try Sequence).
 * - Giúp Admin biết tại sao hệ thống chọn phương án hiện tại.
 *
 * * * * * CHANGE LOG V9.0 (THE PERSISTENCE UPDATE):
 * 1. [PENDULUM STRATEGY]: Chiến thuật con lắc lò xo (Center-Out).
 * 2. [ROBUSTNESS]: Vét cạn mọi trường hợp từ cân bằng đến cực đoan.
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
    console.log(`[CORE V9.1] Services Updated. Total: ${Object.keys(SERVICES).length}`);
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
// PHẦN 3: HELPER NHẬN DIỆN DỊCH VỤ (SERVICE CLASSIFIER - V9.1 UPDATE)
// ============================================================================

/**
 * Hàm kiểm tra thông minh xem một dịch vụ có phải là Combo (2 giai đoạn) hay không
 * Logic này mạnh mẽ hơn so với việc chỉ so sánh category === 'COMBO'
 */
function isComboService(serviceObj, serviceNameRaw = '') {
    if (!serviceObj) return false;
    
    // 1. Kiểm tra Category chuẩn
    const cat = (serviceObj.category || '').toString().toUpperCase().trim();
    if (cat === 'COMBO' || cat === 'MIXED') return true;

    // 2. Kiểm tra tên Dịch vụ (Service Name)
    const name = (serviceObj.name || serviceNameRaw || '').toString().toUpperCase();
    
    // Các từ khóa nhận diện Combo: "COMBO", "套餐" (Set Meal), "ALL" (Toàn thân + Chân)
    const comboKeywords = ['COMBO', '套餐', 'MIX', '+', 'SET', '腳身', '全餐'];
    for (const kw of comboKeywords) {
        if (name.includes(kw)) return true;
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
    if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓/)) return 'BED';
    
    return 'CHAIR'; // Mặc định an toàn
}

// ============================================================================
// PHẦN 4: MATRIX ENGINE CORE (V8.5 LEGACY)
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
     * Cố gắng nhét một block thời gian vào ma trận (First-Fit Algorithm)
     * @returns {string|null} Trả về ID làn (VD: "BED-5") nếu thành công, null nếu thất bại
     */
    tryAllocate(type, start, end, ownerId) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return 'N/A'; 

        // Duyệt qua từng làn
        for (let lane of resourceGroup) {
            let isLaneFree = true;
            // Kiểm tra va chạm
            for (let block of lane.occupied) {
                if (isOverlap(start, end, block.start, block.end)) {
                    isLaneFree = false;
                    break;
                }
            }

            if (isLaneFree) {
                // Đánh dấu
                lane.occupied.push({ start, end, ownerId });
                // Sắp xếp lại timeline
                lane.occupied.sort((a, b) => a.start - b.start);
                return lane.id; 
            }
        }

        return null; // Không còn làn nào vừa
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
        
        // Xử lý cờ Strict Time
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
    // Phương án mặc định: 50-50
    let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];

    if (!step || !limit || step <= 0 || limit <= 0) {
        return options;
    }

    let currentDeviation = step;
    while (currentDeviation <= limit) {
        // Biến thể A: Giảm Phase 1
        let p1_A = standardHalf - currentDeviation;
        let p2_A = totalDuration - p1_A;
        if (p1_A >= 15 && p2_A >= 15) {
            options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
        }
        
        // Biến thể B: Tăng Phase 1
        let p1_B = standardHalf + currentDeviation;
        let p2_B = totalDuration - p1_B;
        if (p1_B >= 15 && p2_B >= 15) {
            options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
        }
        currentDeviation += step;
    }
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
}

// ============================================================================
// PHẦN 7: CORE ENGINE V9.1 (PENDULUM EXHAUSTIVE SEARCH + ROBUST FILTER)
// ============================================================================

/**
 * Hàm kiểm tra khả dụng chính - PHIÊN BẢN V9.1
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: CHUẨN BỊ DỮ LIỆU KHÁCH CŨ (PRE-PROCESSING)
    // ------------------------------------------------------------------------
    let existingBookingsProcessed = [];

    // Sắp xếp khách cũ theo thời gian
    let sortedCurrentBookings = [...currentBookingsRaw].sort((a, b) => {
        return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
    });

    sortedCurrentBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        // Sử dụng hàm detect thông minh mới
        let isCombo = isComboService(svcInfo, b.serviceName);
        let duration = b.duration || 60;
        
        let processedB = {
            id: b.rowId,
            originalData: b,
            staffName: b.staffName,
            serviceName: b.serviceName,
            category: svcInfo.category,
            // Cờ Elastic: Cho phép hệ thống bóp lại thời gian nếu cần
            isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
            elasticStep: svcInfo.elasticStep || 5,
            elasticLimit: svcInfo.elasticLimit || 15,
            blocks: [] 
        };

        if (isCombo) {
            let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
            let p2 = duration - p1;
            const p1End = bStart + p1;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            
            // Hiện tại giả định khách cũ là FB (Foot -> Body) để an toàn
            processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR' }); // Phase 1
            processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED' }); // Phase 2
            
            processedB.p1_current = p1;
            processedB.p2_current = p2;
            processedB.startMins = bStart;
            processedB.duration = duration;

        } else {
            let rType = detectResourceType(svcInfo);
            processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType });
        }
        existingBookingsProcessed.push(processedB);
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: TẠO DANH SÁCH "PENDULUM" (CON LẮC) - V9.1 UPDATE
    // ------------------------------------------------------------------------
    
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    
    // [FIX V9.1] Bộ lọc Combo mạnh mẽ hơn (Robust Filter)
    const comboGuests = newGuests.filter(g => {
        const s = SERVICES[g.serviceCode];
        // Kiểm tra xem khách này có khả năng đảo chiều không
        // Nếu không tìm thấy service trong DB, vẫn cố gắng check xem nó có phải combo không
        return isComboService(s); 
    });
    
    const maxBF = comboGuests.length;
    let trySequence = [];

    // [PENDULUM GENERATOR LOGIC]
    if (maxBF > 0) {
        // Tìm điểm cân bằng (Giữa)
        let mid = maxBF / 2; 
        
        // 1. Luôn ưu tiên điểm giữa (Cân bằng nhất)
        trySequence.push(Math.ceil(mid));

        // 2. Nếu là số lẻ (VD: 2.5), điểm làm tròn xuống (2) cũng quan trọng
        if (Math.floor(mid) !== Math.ceil(mid)) {
            trySequence.push(Math.floor(mid));
        }

        // 3. Vòng lặp xoắn ốc (Spiral Loop)
        let step = 1;
        while (true) {
            let nextUp = Math.ceil(mid) + step;   // Lệch về Body
            let nextDown = Math.floor(mid) - step; // Lệch về Foot
            
            if (nextUp > maxBF && nextDown < 0) break;

            if (nextUp <= maxBF) trySequence.push(nextUp);     
            if (nextDown >= 0) trySequence.push(nextDown);     
            
            step++;
        }
    } else {
        // Không có khách Combo nào -> Chạy 1 lần (0 BF)
        trySequence.push(0);
    }
    
    // [DEBUG LOGGING] - Giúp phát hiện lỗi logic
    console.log(`[V9.1 ANALYZER] Total Guests: ${newGuests.length}, Combo Guests Detected: ${maxBF}`);
    console.log(`[V9.1 STRATEGY] Pending Pendulum Sequence: ${JSON.stringify(trySequence)}`);

    // ------------------------------------------------------------------------
    // BƯỚC C: THỰC THI VÒNG LẶP VÉT CẠN (EXHAUSTIVE LOOP)
    // ------------------------------------------------------------------------
    
    let successfulScenario = null;

    // Duyệt qua từng kịch bản (numBF = số lượng khách làm Body First)
    for (let numBF of trySequence) {
        
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;
        
        // === GIAI ĐOẠN 1: XẾP CỨNG KHÁCH CŨ (PINNING) ===
        let softsToSqueezeCandidates = []; 

        for (const exB of existingBookingsProcessed) {
            let placedSuccessfully = true;
            let allocatedSlots = []; 

            for (const block of exB.blocks) {
                const realEnd = block.end + CONFIG.CLEANUP_BUFFER;
                const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id);
                if (!slotId) {
                    placedSuccessfully = false;
                    break;
                }
                allocatedSlots.push(slotId);
            }

            if (exB.isElastic) {
                if (placedSuccessfully) {
                    exB.allocatedSlots = allocatedSlots; 
                    softsToSqueezeCandidates.push(exB); 
                } else {
                    softsToSqueezeCandidates.push(exB);
                }
            }
        }

        // === GIAI ĐOẠN 2: TÍNH TOÁN BLOCKS CHO KHÁCH MỚI ===
        let newGuestBlocksMap = []; 

        for (const ng of newGuests) {
            const svc = SERVICES[ng.serviceCode] || { name: 'Unknown', duration: 60, price: 0 }; 
            
            // Logic xác định Flow: FB hay BF
            let flow = 'FB'; // Mặc định: Chân trước
            let isThisGuestCombo = isComboService(svc);

            if (isThisGuestCombo) {
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                // Nếu khách này nằm trong danh sách Combo Guests
                // Và chỉ số của họ nhỏ hơn numBF -> Họ sẽ làm Body First (để cân bằng)
                if (cIdx >= 0 && cIdx < numBF) {
                    flow = 'BF'; 
                }
            }

            const duration = svc.duration || 60;
            let blocks = [];
            
            if (isThisGuestCombo) {
                const p1Standard = Math.floor(duration / 2);
                const p2Standard = duration - p1Standard;

                if (flow === 'FB') {
                    // FOOT -> BODY
                    const t1End = requestStartMins + p1Standard;
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                    blocks.push({ start: t2Start, end: t2Start + p2Standard + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    
                    scenarioDetails.push({
                        guestIndex: ng.idx, service: svc.name, price: svc.price,
                        phase1_duration: p1Standard, phase2_duration: p2Standard,
                        flow: 'FB', timeStr: timeStr, allocated: []
                    });
                } else { 
                    // BODY -> FOOT (BF)
                    const t1End = requestStartMins + p2Standard; 
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    blocks.push({ start: t2Start, end: t2Start + p1Standard + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });

                    scenarioDetails.push({
                        guestIndex: ng.idx, service: svc.name, price: svc.price,
                        phase1_duration: p1Standard, phase2_duration: p2Standard,
                        flow: 'BF', timeStr: timeStr, allocated: []
                    });
                }
            } else { // Khách lẻ (Single Service)
                let rType = detectResourceType(svc);
                blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONFIG.CLEANUP_BUFFER, type: rType });
                
                scenarioDetails.push({
                    guestIndex: ng.idx, service: svc.name, price: svc.price,
                    flow: 'SINGLE', timeStr: timeStr, allocated: []
                });
            }
            newGuestBlocksMap.push({ guest: ng, blocks: blocks });
        }

        // === GIAI ĐOẠN 3: CỐ GẮNG XẾP KHÁCH MỚI ===
        let conflictFound = false;
        
        for (const item of newGuestBlocksMap) {
            let guestAllocations = [];
            for (const block of item.blocks) {
                const slotId = matrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`);
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

        // === GIAI ĐOẠN 4: CHIẾN THUẬT SQUEEZE (BÓP MỀM) NẾU CÓ XUNG ĐỘT ===
        if (conflictFound) {
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            
            // 4.1. Xếp lại Hard Bookings (Khách không thể di dời)
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id));
            });

            let squeezeScenarioPossible = true;
            
            // 4.2. Ưu tiên xếp Khách Mới
            for (const item of newGuestBlocksMap) {
                for (const block of item.blocks) {
                    if (!matrixSqueeze.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`)) {
                        squeezeScenarioPossible = false; 
                        break;
                    }
                }
                if (!squeezeScenarioPossible) break;
            }

            if (!squeezeScenarioPossible) {
                scenarioFailed = true; 
                continue; // Fail kịch bản này -> Next numBF
            }

            // 4.3. Tìm khe hở cho Soft Bookings
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
                            updatesProposed.push({
                                rowId: sb.id,
                                customerName: sb.originalData.customerName,
                                newPhase1: split.p1,
                                newPhase2: split.p2,
                                reason: 'Matrix Squeeze V9.1'
                            });
                        }
                        break; 
                    }
                }

                if (!fit) {
                    squeezeScenarioPossible = false;
                    break;
                }
            }

            if (squeezeScenarioPossible) {
                scenarioUpdates = updatesProposed;
                matrix = matrixSqueeze; 
            } else {
                scenarioFailed = true;
                continue;
            }
        }

        // === GIAI ĐOẠN 5: KIỂM TRA NHÂN SỰ (STAFF AVAILABILITY) ===
        let flatTimeline = [];
        Object.values(matrix.lanes).forEach(group => {
            group.forEach(lane => {
                lane.occupied.forEach(occ => {
                    const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
                    if (ex) {
                        flatTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
                    }
                });
            });
        });

        let staffAssignmentSuccess = true;
        
        for (const item of newGuestBlocksMap) {
            const guest = item.guest;
            const startT = item.blocks[0].start;
            const endT = item.blocks[item.blocks.length - 1].end; 
            
            const assignedStaff = findAvailableStaff(
                guest.staffName, 
                startT, 
                endT, 
                staffList, 
                flatTimeline
            );

            if (!assignedStaff) {
                staffAssignmentSuccess = false;
                break;
            }

            const detail = scenarioDetails.find(d => d.guestIndex === guest.idx);
            if (detail) detail.staff = assignedStaff;

            item.blocks.forEach(b => {
                flatTimeline.push({ start: b.start, end: b.end, staffName: assignedStaff });
            });
        }

        if (!staffAssignmentSuccess) {
            scenarioFailed = true;
            continue;
        }

        // === SUCCESS: TÌM THẤY KỊCH BẢN THÀNH CÔNG ===
        successfulScenario = {
            details: scenarioDetails,
            updates: scenarioUpdates,
            matrixDump: matrix.lanes 
        };
        break; // Dừng ngay khi tìm thấy (Vì đã sắp xếp ưu tiên từ Tâm ra ngoài)
    }

    // ------------------------------------------------------------------------
    // BƯỚC D: KẾT QUẢ CUỐI CÙNG TRẢ VỀ CHO GIAO DIỆN
    // ------------------------------------------------------------------------

    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true,
            strategy: 'MATRIX_PENDULUM_V9.1', 
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
        };
    } else {
        return { 
            feasible: false, 
            reason: "Hết chỗ (Đã thử mọi phương án hoán vị nhưng không tìm thấy khe trống)" 
        };
    }
}

/**
 * Hàm phụ trợ: Kiểm tra xem một tập hợp các khối thời gian có thể nhét vào Matrix hiện tại không
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
                    isFree = false;
                    break;
                }
            }
            if (isFree) {
                foundLane = true;
                break;
            }
        }
        if (!foundLane) return false;
    }
    return true;
}

// ============================================================================
// PHẦN 8: MODULE EXPORT (HỖ TRỢ CẢ NODEJS VÀ BROWSER)
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
    console.log("✅ Resource Core V9.1 Loaded: Robust Pendulum Engine Active.");
}
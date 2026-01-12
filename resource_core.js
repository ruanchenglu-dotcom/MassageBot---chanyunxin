/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V9.0 (PENDULUM EXHAUSTIVE SEARCH)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/13
 *
 * * * * * CHANGE LOG V9.0 (THE PERSISTENCE UPDATE):
 * 1. [PENDULUM STRATEGY - CHIẾN THUẬT CON LẮC]:
 * - Thay thế logic thử giới hạn cũ bằng logic "Vét cạn từ tâm" (Center-Out Exhaustive).
 * - Nguyên lý: Xuất phát từ tỷ lệ cân bằng nhất (50/50), sau đó mở rộng dần ra hai phía (lệch Body -> lệch Foot)
 * - Mục tiêu: Tìm kiếm mọi khe hở khả thi trong lịch trình, không bỏ sót bất kỳ phương án phối hợp nào.
 * - Áp dụng cho mọi nhóm khách có nhu cầu Combo (maxBF >= 2).
 * * 2. [ROBUSTNESS - SỰ KIÊN TRÌ]:
 * - Hệ thống sẽ thử từ phương án đẹp nhất (chia đều) đến phương án cực đoan nhất (dồn 100% về một phía).
 * - Đảm bảo tỷ lệ Booking thành công đạt mức tối đa.
 * * 3. [LEGACY COMPATIBILITY]:
 * - Giữ nguyên Matrix Engine V8.5 (Spatial Allocation).
 * - Giữ nguyên Logic Squeeze (Chèn ép khách mềm).
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION)
// ============================================================================

const CONFIG = {
    // Tài nguyên phần cứng
    MAX_CHAIRS: 6,        
    MAX_BEDS: 6,          
    MAX_TOTAL_GUESTS: 12, // Tổng tải trọng tối đa của cửa hàng (Nhân sự + Không gian)
    
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
// PHẦN 3: MATRIX ENGINE CORE - SPATIAL ALLOCATION (V8.5 LEGACY)
// ============================================================================

class VirtualMatrix {
    constructor() {
        // Khởi tạo các làn chứa (Lanes)
        // Mỗi lane đại diện cho 1 thiết bị vật lý (Ghế 1-6, Giường 1-6)
        this.lanes = {
            'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
            'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
        };
        this.totalLoad = []; 
    }

    /**
     * Cố gắng nhét một block thời gian vào ma trận (First-Fit Algorithm)
     * @param {string} type 'CHAIR' | 'BED' 
     * @param {number} start 
     * @param {number} end 
     * @param {string} ownerId ID định danh của booking (để trace lỗi)
     * @returns {string|null} Trả về ID làn (VD: "BED-5") nếu thành công, null nếu thất bại
     */
    tryAllocate(type, start, end, ownerId) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return 'N/A'; // Loại tài nguyên không cần track slot (VD: NONE)

        // Duyệt qua từng làn (Lane 1 -> Lane 6)
        for (let lane of resourceGroup) {
            let isLaneFree = true;
            // Kiểm tra va chạm với các booking đã có trong làn này
            for (let block of lane.occupied) {
                if (isOverlap(start, end, block.start, block.end)) {
                    isLaneFree = false;
                    break;
                }
            }

            if (isLaneFree) {
                // Tìm thấy làn trống! Đánh dấu luôn vào bộ nhớ đệm
                lane.occupied.push({ start, end, ownerId });
                // Sắp xếp lại timeline của làn để gọn gàng
                lane.occupied.sort((a, b) => a.start - b.start);
                return lane.id; // Return "BED-1", "CHAIR-3"...
            }
        }

        return null; // Không còn làn nào vừa
    }
}

// ============================================================================
// PHẦN 4: LOGIC TÌM NHÂN VIÊN (STAFF FINDER)
// ============================================================================

function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        // 1. Staff phải tồn tại và không trong trạng thái OFF
        if (!staffInfo || staffInfo.off) return false; 
        
        // 2. Kiểm tra giờ làm việc (Shift)
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        if (shiftStart === -1 || shiftEnd === -1) return false; 

        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
        
        // Xử lý cờ Strict Time (Không làm quá giờ)
        const isStrict = staffInfo.isStrictTime === true;
        if (isStrict) {
            if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
        } else {
            if (start > shiftEnd) return false;
        }

        // 3. Kiểm tra trùng lịch với khách khác (Busy List)
        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

        // 4. Kiểm tra giới tính (Nếu có yêu cầu)
        if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
        if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;

        return true; 
    };

    // Nếu yêu cầu chỉ định staff cụ thể
    if (staffReq && !['RANDOM', 'MALE', 'FEMALE', '隨機', 'Any', 'undefined'].includes(staffReq)) {
        return checkOneStaff(staffReq) ? staffReq : null;
    } 
    // Nếu yêu cầu ngẫu nhiên hoặc theo giới tính
    else {
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

// ============================================================================
// PHẦN 5: BỘ HELPER SINH BIẾN THỂ THỜI GIAN (ELASTIC GENERATOR)
// ============================================================================

function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
    // Nếu đã bị khóa cứng pha 1 (do User chỉnh tay), chỉ trả về 1 phương án duy nhất
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
        return [{ 
            p1: parseInt(customLockedPhase1), 
            p2: totalDuration - parseInt(customLockedPhase1), 
            deviation: 999 
        }];
    }

    const standardHalf = Math.floor(totalDuration / 2);
    // Phương án mặc định: Chia đôi 50-50
    let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];

    if (!step || !limit || step <= 0 || limit <= 0) {
        return options;
    }

    let currentDeviation = step;
    while (currentDeviation <= limit) {
        // Biến thể A: Giảm Phase 1 (Ít chân, Nhiều body)
        let p1_A = standardHalf - currentDeviation;
        let p2_A = totalDuration - p1_A;
        if (p1_A >= 15 && p2_A >= 15) {
            options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
        }
        
        // Biến thể B: Tăng Phase 1 (Nhiều chân, Ít body)
        let p1_B = standardHalf + currentDeviation;
        let p2_B = totalDuration - p1_B;
        if (p1_B >= 15 && p2_B >= 15) {
            options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
        }
        currentDeviation += step;
    }
    // Sắp xếp ưu tiên độ lệch nhỏ nhất trước
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
}

// ============================================================================
// PHẦN 6: CORE ENGINE V9.0 (PENDULUM EXHAUSTIVE SEARCH)
// ============================================================================

/**
 * Hàm kiểm tra khả dụng chính - PHIÊN BẢN V9.0
 * * Upgrade: Sử dụng chiến thuật Con Lắc Lò Xo để thử mọi hoán vị Flow (BF/FB).
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: CHUẨN BỊ DỮ LIỆU KHÁCH CŨ (PRE-PROCESSING)
    // ------------------------------------------------------------------------
    let existingBookingsProcessed = [];

    // Sắp xếp khách cũ theo thời gian bắt đầu (để mô phỏng thực tế dòng thời gian)
    let sortedCurrentBookings = [...currentBookingsRaw].sort((a, b) => {
        return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
    });

    sortedCurrentBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO' || b.serviceName.includes('Combo') || b.serviceName.includes('套餐');
        let duration = b.duration || 60;
        
        let processedB = {
            id: b.rowId,
            originalData: b,
            staffName: b.staffName,
            serviceName: b.serviceName,
            category: svcInfo.category,
            // Cờ Elastic: Cho phép hệ thống bóp lại thời gian nếu cần (trừ khi user đã khóa)
            isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
            elasticStep: svcInfo.elasticStep || 5,
            elasticLimit: svcInfo.elasticLimit || 15,
            blocks: [] 
        };

        // Tính toán Blocks hình học cứng
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
            let rType = svcInfo.type || 'CHAIR';
            if (b.serviceName.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
            processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType });
        }
        existingBookingsProcessed.push(processedB);
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: TẠO DANH SÁCH "PENDULUM" (CON LẮC) ĐỂ THỬ NGHIỆM
    // ------------------------------------------------------------------------
    
    // Gắn index cho khách để theo dõi
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    // Lọc ra những khách làm Combo (có thể đảo chiều BF/FB)
    const comboGuests = newGuests.filter(g => {
        const s = SERVICES[g.serviceCode];
        return s && s.category === 'COMBO';
    });
    
    const maxBF = comboGuests.length;
    let trySequence = [];

    // >>> LOGIC V9.0 PENDULUM GENERATOR <<<
    if (maxBF > 0) {
        // Tìm điểm cân bằng (Giữa)
        let mid = maxBF / 2; 
        
        // 1. Luôn ưu tiên điểm giữa (làm tròn lên nếu lẻ - VD 2.5 -> 3)
        // Đây là kịch bản cân bằng nhất: 50% Body First - 50% Foot First
        trySequence.push(Math.ceil(mid));

        // 2. Nếu là số lẻ (VD: 2.5), điểm làm tròn xuống (2) cũng quan trọng ngang ngửa
        if (Math.floor(mid) !== Math.ceil(mid)) {
            trySequence.push(Math.floor(mid));
        }

        // 3. Vòng lặp xoắn ốc (Spiral Loop) mở rộng ra 2 biên
        // Chiến thuật: Lệch 1 bước về Body -> Lệch 1 bước về Foot -> Lệch 2 bước về Body...
        let step = 1;
        while (true) {
            let nextUp = Math.ceil(mid) + step;   // Lệch về phía Body (Tăng số lượng BF)
            let nextDown = Math.floor(mid) - step; // Lệch về phía Foot (Giảm số lượng BF)
            
            // Điều kiện thoát: Khi cả 2 hướng đều văng ra khỏi phạm vi [0, maxBF]
            if (nextUp > maxBF && nextDown < 0) break;

            if (nextUp <= maxBF) trySequence.push(nextUp);     
            if (nextDown >= 0) trySequence.push(nextDown);     
            
            step++;
        }
    } else {
        // Nếu không có khách Combo nào thì chạy 1 lần duy nhất (0 BF)
        trySequence.push(0);
    }
    
    // Debug log để kiểm tra thứ tự thử nghiệm (Có thể bật lên để xem console)
    // console.log(`[PENDULUM V9] Try Sequence for ${maxBF} combo guests:`, trySequence);

    // ------------------------------------------------------------------------
    // BƯỚC C: THỰC THI VÒNG LẶP VÉT CẠN (EXHAUSTIVE LOOP)
    // ------------------------------------------------------------------------
    
    let successfulScenario = null;

    // Duyệt qua từng kịch bản trong danh sách ưu tiên
    // numBF = Số lượng khách sẽ làm Body First trong kịch bản này
    for (let numBF of trySequence) {
        
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;
        
        // === GIAI ĐOẠN 1: XẾP CỨNG KHÁCH CŨ (PINNING) ===
        // Khách cũ được coi là các vật thể rắn (Hard Objects) trong Matrix
        let softsToSqueezeCandidates = []; 

        for (const exB of existingBookingsProcessed) {
            let placedSuccessfully = true;
            let allocatedSlots = []; 

            for (const block of exB.blocks) {
                // Tính toán slot thực tế (bao gồm thời gian dọn dẹp)
                const realEnd = block.end + CONFIG.CLEANUP_BUFFER;
                const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id);
                if (!slotId) {
                    placedSuccessfully = false;
                    break;
                }
                allocatedSlots.push(slotId);
            }

            // Nếu khách cũ có tính đàn hồi (Elastic)
            if (exB.isElastic) {
                if (placedSuccessfully) {
                    exB.allocatedSlots = allocatedSlots; 
                    // Lưu vào danh sách "Ứng viên có thể bị bóp" nếu sau này cần chỗ
                    softsToSqueezeCandidates.push(exB); 
                } else {
                    // Nếu ngay cả khách cũ cũng không xếp được (do lỗi dữ liệu), đưa vào danh sách chờ xử lý sau
                    softsToSqueezeCandidates.push(exB);
                }
            } else if (!placedSuccessfully) {
                // Khách cũ loại cứng (Hard) mà lỗi -> Data lỗi nghiêm trọng, nhưng vẫn phải cố chạy tiếp
                // (Trong thực tế nên log cảnh báo)
            }
        }

        // === GIAI ĐOẠN 2: TÍNH TOÁN BLOCKS CHO KHÁCH MỚI ===
        let newGuestBlocksMap = []; 

        for (const ng of newGuests) {
            const svc = SERVICES[ng.serviceCode];
            if (!svc) continue; 

            // Logic xác định Flow: FB hay BF
            let flow = 'FB'; // Mặc định là Chân trước
            if (svc.category === 'COMBO') {
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                // Nếu index của khách nằm trong nhóm được chỉ định làm BF
                if (cIdx >= 0 && cIdx < numBF) flow = 'BF'; 
            }

            const duration = svc.duration;
            let blocks = [];
            
            if (svc.category === 'COMBO') {
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
            } else { // Dịch vụ đơn (Single Service)
                let rType = svc.type || 'CHAIR';
                if (svc.name.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
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
        // Nếu cách xếp thông thường thất bại, kích hoạt chế độ "Bóp khách cũ"
        if (conflictFound) {
            // Tạo một Matrix tạm thời mới
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            
            // 4.1. Xếp lại Hard Bookings (Khách không thể di dời)
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id));
            });

            let squeezeScenarioPossible = true;
            
            // 4.2. Ưu tiên xếp Khách Mới vào trước (Để đảm bảo doanh thu mới)
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
                scenarioFailed = true; // Kể cả bóp hết cỡ thì khách mới vẫn đụng tường -> Thất bại kịch bản này
                continue; // Chuyển sang numBF tiếp theo trong vòng lặp Con Lắc
            }

            // 4.3. Tìm khe hở cho Soft Bookings (Khách cũ có thể bóp)
            const softBookings = existingBookingsProcessed.filter(b => b.isElastic);
            
            for (const sb of softBookings) {
                // Sinh ra các biến thể thời gian (VD: 30-60, 25-65, 35-55...)
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

                    // Kiểm tra xem biến thể này có nhét vừa không
                    if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                        testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id));
                        fit = true;
                        
                        // Nếu phải bóp méo, ghi lại đề xuất cập nhật DB
                        if (split.deviation !== 0) {
                            updatesProposed.push({
                                rowId: sb.id,
                                customerName: sb.originalData.customerName,
                                newPhase1: split.p1,
                                newPhase2: split.p2,
                                reason: 'Matrix Squeeze V9.0'
                            });
                        }
                        break; // Đã tìm thấy khe vừa, dừng thử biến thể
                    }
                }

                if (!fit) {
                    squeezeScenarioPossible = false; // Không còn chỗ nào cho khách cũ này -> Thất bại
                    break;
                }
            }

            if (squeezeScenarioPossible) {
                scenarioUpdates = updatesProposed;
                matrix = matrixSqueeze; // Chấp nhận Matrix đã bóp làm Matrix chính thức
            } else {
                scenarioFailed = true;
                continue;
            }
        }

        // === GIAI ĐOẠN 5: KIỂM TRA NHÂN SỰ (STAFF AVAILABILITY) ===
        // Sau khi đã xếp xong Ghế/Giường, kiểm tra xem có người làm không
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
        // CỰC KỲ QUAN TRỌNG: Break ngay lập tức vì trySequence đã được sắp xếp theo độ ưu tiên tốt nhất
        break; 
    }

    // ------------------------------------------------------------------------
    // BƯỚC D: KẾT QUẢ CUỐI CÙNG TRẢ VỀ CHO GIAO DIỆN
    // ------------------------------------------------------------------------

    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true,
            strategy: 'MATRIX_PENDULUM_V9.0', // Đánh dấu phiên bản chiến thuật
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
 * (Dùng để kiểm thử giả định mà không làm bẩn Matrix chính)
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
    console.log("✅ Resource Core V9.0: Pendulum Strategy Active.");
}
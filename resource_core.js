/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V8.1 (DOUBLE PERMUTATION & RESOURCE BALANCING)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/12
 *
 * * * * * CHANGE LOG V8.1 (THE BALANCING ACT):
 * 1. [EXISTING GUEST RESHUFFLE - TÍNH NĂNG MỚI QUAN TRỌNG]:
 * - Khắc phục điểm yếu của V8.0: Giờ đây hệ thống có thể tự động đề xuất khách cũ (Combo)
 * đảo ngược quy trình (Foot->Body thành Body->Foot) để nhường tài nguyên cho khách mới.
 * - Giải quyết triệt để bài toán: 6 khách cũ chiếm 6 ghế -> Khách mới vào làm chân bị báo hết chỗ.
 * * 2. [DOUBLE LOOP STRATEGY]:
 * - Loop 1 (Outer): Hoán vị dòng chảy của khách CŨ (0 đến N khách đổi Flow).
 * - Loop 2 (Inner): Hoán vị dòng chảy của khách MỚI (0 đến M khách đổi Flow).
 * -> Tìm ra "Điểm cân bằng vàng" (Sweet Spot) nơi cả khách cũ và mới đều xếp vừa Matrix.
 *
 * 3. [LEGACY PRESERVATION]:
 * - Giữ nguyên Matrix Tetris.
 * - Giữ nguyên Smart Squeeze (Elastic Time).
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION)
// ============================================================================

const CONFIG = {
    // Tài nguyên phần cứng
    MAX_CHAIRS: 6,        
    MAX_BEDS: 6,          
    MAX_TOTAL_GUESTS: 12, // Tổng tải trọng
    
    // Cấu hình thời gian (Đơn vị: Giờ)
    OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
    
    // Bộ đệm thời gian (Đơn vị: Phút)
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp
    TRANSITION_BUFFER: 5, // Thời gian chuyển tiếp Combo
    
    // Dung sai cho phép
    TOLERANCE: 1,         
    
    // Giới hạn
    MAX_TIMELINE_MINS: 1440 
};

// Cơ sở dữ liệu dịch vụ
let SERVICES = {}; 

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

function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return -1; 
    try {
        let str = timeStr.toString();
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
// PHẦN 3: MATRIX ENGINE (SPATIAL AWARENESS)
// ============================================================================

class VirtualMatrix {
    constructor() {
        this.lanes = {
            'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
            'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
        };
    }

    tryAllocate(type, start, end, ownerId) {
        if (type === 'NONE') return 'SYSTEM-OK'; // Các loại dịch vụ ảo

        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null; // Loại tài nguyên không xác định

        // Thuật toán First-Fit: Tìm làn đầu tiên còn trống
        for (let lane of resourceGroup) {
            let isLaneFree = true;
            for (let block of lane.occupied) {
                if (isOverlap(start, end, block.start, block.end)) {
                    isLaneFree = false;
                    break;
                }
            }

            if (isLaneFree) {
                // Book slot này
                lane.occupied.push({ start, end, ownerId });
                // Sort lại để dễ debug
                lane.occupied.sort((a, b) => a.start - b.start);
                return lane.id; 
            }
        }
        return null; // Full
    }
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

        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
        
        const isStrict = staffInfo.isStrictTime === true;
        if (isStrict) {
            if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
        } else {
            if (start > shiftEnd) return false;
        }

        // Check trùng lịch
        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

        // Check giới tính
        if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
        if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;

        return true; 
    };

    if (staffReq && staffReq !== 'RANDOM' && staffReq !== 'MALE' && staffReq !== 'FEMALE' && staffReq !== '隨機' && staffReq !== 'Any' && staffReq !== 'undefined') {
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
// PHẦN 5: BỘ HELPER SINH BIẾN THỂ THỜI GIAN (ELASTIC GENERATOR)
// ============================================================================

function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
    if (customLockedPhase1 !== null && !isNaN(customLockedPhase1)) {
        return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999 }];
    }
    const standardHalf = Math.floor(totalDuration / 2);
    let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];

    if (!step || !limit) return options;

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
// PHẦN 6: CORE ENGINE V8.1 (DOUBLE PERMUTATION LOGIC)
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Lỗi định dạng thời gian" };

    // ------------------------------------------------------------------------
    // BƯỚC A: CHUẨN BỊ DỮ LIỆU KHÁCH CŨ (PRE-PROCESSING - V8.1 UPGRADED)
    // ------------------------------------------------------------------------
    let existingBookingsProcessed = [];

    // Sắp xếp khách cũ theo thời gian bắt đầu
    let sortedCurrentBookings = [...currentBookingsRaw].sort((a, b) => {
        return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
    });

    // Lọc ra danh sách những khách cũ CÓ THỂ ĐẢO CHIỀU (Swappable Candidates)
    // Điều kiện: Là Combo, Trạng thái chưa bắt đầu (hoặc đang chờ), Không bị lock thủ công
    let swappableCandidates = [];

    sortedCurrentBookings.forEach((b, idx) => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO' || b.serviceName.includes('Combo') || b.serviceName.includes('套餐');
        let duration = b.duration || 60;
        
        // Khác biệt với V8.0: Ta không tạo "blocks" cứng ngay lập tức.
        // Ta tạo một object trung gian chứa khả năng linh hoạt.
        let processedB = {
            id: b.rowId,
            originalData: b,
            staffName: b.staffName,
            serviceName: b.serviceName,
            category: svcInfo.category,
            // Khả năng co giãn thời gian (Elastic Squeeze)
            isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
            elasticStep: svcInfo.elasticStep || 5,
            elasticLimit: svcInfo.elasticLimit || 15,
            
            // Khả năng đảo chiều quy trình (V8.1 Feature)
            // Chỉ đảo chiều được nếu khách chưa làm (ví dụ: chưa status Running hoặc Done)
            isSwappable: isCombo && (b.status !== 'Running' && b.status !== 'Done'),
            
            startMins: bStart,
            duration: duration,
            p1_standard: b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2),
            
            // Index tạm để dùng trong vòng lặp hoán vị
            tempIndex: -1 
        };

        if (processedB.isSwappable) {
            processedB.tempIndex = swappableCandidates.length;
            swappableCandidates.push(processedB);
        }

        existingBookingsProcessed.push(processedB);
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: VÒNG LẶP HOÁN VỊ KÉP (DOUBLE PERMUTATION LOOP - V8.1 CORE)
    // ------------------------------------------------------------------------
    // Loop 1: Số lượng khách CŨ sẽ đảo thành Body First (BF)
    // Loop 2: Số lượng khách MỚI sẽ đảo thành Body First (BF)
    
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const newComboGuests = newGuests.filter(g => {
        const s = SERVICES[g.serviceCode];
        return s && s.category === 'COMBO';
    });
    
    // Giới hạn số vòng lặp để đảm bảo hiệu năng (tối đa check 6 người cũ đảo chiều nếu quá đông)
    const maxExistingSwap = Math.min(swappableCandidates.length, 6); 
    const maxNewSwap = newComboGuests.length;

    let successfulScenario = null;

    // --- OUTER LOOP: THỬ ĐẢO CHIỀU KHÁCH CŨ ---
    // numExistingBF: Số lượng khách cũ chuyển sang làm Body trước
    // VD: Có 6 khách cũ Combo. Loop chạy 0->6. Nếu i=3 nghĩa là 3 người làm Body trước, 3 người làm Chân trước.
    for (let numExistingBF = 0; numExistingBF <= maxExistingSwap; numExistingBF++) {
        
        // --- INNER LOOP: THỬ ĐẢO CHIỀU KHÁCH MỚI ---
        // numNewBF: Số lượng khách mới chuyển sang làm Body trước
        for (let numNewBF = 0; numNewBF <= maxNewSwap; numNewBF++) {

            let matrix = new VirtualMatrix();
            let scenarioDetails = [];
            let scenarioUpdates = []; // Chứa các update cho khách cũ (Swap Flow hoặc Squeeze Time)
            let scenarioFailed = false;
            let softsToSqueezeCandidates = []; // Dành cho logic squeeze sau này

            // 1. XẾP KHÁCH CŨ VÀO MATRIX (Với cấu hình Flow hiện tại của Loop)
            for (const exB of existingBookingsProcessed) {
                // Xác định Flow cho khách cũ này dựa trên vòng lặp Outer
                let flow = 'FB'; // Mặc định Foot First
                
                if (exB.isSwappable) {
                    // Logic phân chia: numExistingBF người đầu tiên trong list swappable sẽ bị đảo
                    if (exB.tempIndex < numExistingBF) {
                        flow = 'BF';
                    }
                }
                
                // Tính toán Blocks dựa trên Flow và Time
                let p1 = exB.p1_standard;
                let blocks = [];

                if (flow === 'FB') {
                    const t1End = exB.startMins + p1;
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: exB.startMins, end: t1End, type: 'CHAIR' });
                    blocks.push({ start: t2Start, end: exB.startMins + exB.duration, type: 'BED' });
                } else { // BF
                    const t1End = exB.startMins + (exB.duration - p1);
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: exB.startMins, end: t1End, type: 'BED' });
                    blocks.push({ start: t2Start, end: exB.startMins + exB.duration, type: 'CHAIR' });
                }

                // Cấp phát vào Matrix
                let placedOk = true;
                let allocatedIds = [];
                for (const blk of blocks) {
                    const slot = matrix.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, exB.id);
                    if (!slot) {
                        placedOk = false;
                        break;
                    }
                    allocatedIds.push(slot);
                }

                if (!placedOk) {
                    // Nếu khách cũ đặt không vừa (do xung đột data gốc), ta ưu tiên đưa vào danh sách cần Squeeze
                    if (exB.isElastic) {
                        softsToSqueezeCandidates.push({ ...exB, currentFlow: flow });
                    }
                } else {
                    // Nếu khách cũ bị đổi Flow so với mặc định (FB), ghi nhận update
                    // Để frontend biết đường nhắc user hoặc update DB
                    if (flow === 'BF') {
                        scenarioUpdates.push({
                            rowId: exB.id,
                            type: 'FLOW_SWAP',
                            newFlow: 'BF', // Body First
                            reason: 'Balancing Resource for New Guest'
                        });
                    }
                    if (exB.isElastic) {
                         // Lưu lại để có thể tháo ra squeeze lại nếu cần thiết ở bước sau
                         softsToSqueezeCandidates.push({ ...exB, currentFlow: flow, allocatedIds: allocatedIds });
                    }
                }
            }

            // 2. TÍNH TOÁN BLOCKS CHO KHÁCH MỚI
            let newGuestBlocksMap = [];
            
            for (const ng of newGuests) {
                const svc = SERVICES[ng.serviceCode];
                if (!svc) continue;

                // Xác định Flow khách mới dựa trên vòng lặp Inner
                let flow = 'FB';
                if (svc.category === 'COMBO') {
                    const cIdx = newComboGuests.findIndex(cg => cg.idx === ng.idx);
                    if (cIdx < numNewBF) flow = 'BF';
                }

                let blocks = [];
                const duration = svc.duration;

                if (svc.category === 'COMBO') {
                    const p1 = Math.floor(duration / 2);
                    const p2 = duration - p1;
                    if (flow === 'FB') {
                        const t1End = requestStartMins + p1;
                        const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                        blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                        blocks.push({ start: t2Start, end: t2Start + p2 + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    } else { // BF
                        const t1End = requestStartMins + p2;
                        const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                        blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                        blocks.push({ start: t2Start, end: t2Start + p1 + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                    }
                    scenarioDetails.push({
                        guestIndex: ng.idx, service: svc.name, price: svc.price,
                        phase1_duration: p1, phase2_duration: p2, flow: flow, allocated: []
                    });
                } else {
                    // Single Service
                    let rType = svc.type || 'CHAIR';
                    if (svc.name.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
                    blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONFIG.CLEANUP_BUFFER, type: rType });
                    scenarioDetails.push({
                        guestIndex: ng.idx, service: svc.name, price: svc.price, flow: 'SINGLE', allocated: []
                    });
                }
                newGuestBlocksMap.push({ guest: ng, blocks: blocks });
            }

            // 3. XẾP KHÁCH MỚI VÀO MATRIX
            let conflictFound = false;
            for (const item of newGuestBlocksMap) {
                let allocated = [];
                for (const blk of item.blocks) {
                    const slot = matrix.tryAllocate(blk.type, blk.start, blk.end, `NEW_${item.guest.idx}`);
                    if (!slot) {
                        conflictFound = true;
                        break;
                    }
                    allocated.push(slot);
                }
                if (conflictFound) break;
                // Update detail
                const det = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
                if (det) det.allocated = allocated;
            }

            // 4. SMART SQUEEZE (NẾU CẦN THIẾT)
            // Nếu conflictFound = true, nghĩa là việc HOÁN VỊ FLOW vẫn chưa đủ.
            // Ta kích hoạt tiếp vũ khí "CO GIÃN THỜI GIAN" (Elastic Squeeze).
            if (conflictFound) {
                // Reset Matrix Squeeze (Clean slate)
                let matrixSq = new VirtualMatrix();
                let squeezeUpdates = [];
                let squeezeSuccess = true;

                // 4.1. Xếp lại Hard Bookings (Những người không thể co giãn)
                // Lưu ý: Hard bookings vẫn tuân theo Flow của vòng lặp hiện tại
                const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
                hardBookings.forEach(hb => {
                     // Nếu Hard booking nằm trong diện bị đảo flow, ta cũng phải tôn trọng
                     let hFlow = 'FB';
                     if (hb.isSwappable && hb.tempIndex < numExistingBF) hFlow = 'BF';
                     
                     let p1 = hb.p1_standard;
                     // Logic tính toán block như trên...
                     let blocks = [];
                     if (hFlow === 'FB') {
                         blocks.push({ type: 'CHAIR', start: hb.startMins, end: hb.startMins + p1 + CONFIG.CLEANUP_BUFFER });
                         blocks.push({ type: 'BED', start: hb.startMins + p1 + CONFIG.TRANSITION_BUFFER, end: hb.startMins + hb.duration + CONFIG.CLEANUP_BUFFER });
                     } else {
                         blocks.push({ type: 'BED', start: hb.startMins, end: hb.startMins + (hb.duration - p1) + CONFIG.CLEANUP_BUFFER });
                         blocks.push({ type: 'CHAIR', start: hb.startMins + (hb.duration - p1) + CONFIG.TRANSITION_BUFFER, end: hb.startMins + hb.duration + CONFIG.CLEANUP_BUFFER });
                     }
                     
                     blocks.forEach(b => matrixSq.tryAllocate(b.type, b.start, b.end, hb.id));
                });

                // 4.2. Ưu tiên xếp KHÁCH MỚI vào trước (để xem có vừa không đã)
                for (const item of newGuestBlocksMap) {
                    for (const blk of item.blocks) {
                        if (!matrixSq.tryAllocate(blk.type, blk.start, blk.end, `NEW_${item.guest.idx}`)) {
                            squeezeSuccess = false; break;
                        }
                    }
                    if (!squeezeSuccess) break;
                }

                if (!squeezeSuccess) {
                    scenarioFailed = true;
                    continue; // Next permutation
                }

                // 4.3. Nhét Khách Elastic Cũ vào các kẽ hở (Squeeze)
                // Lưu ý: Vẫn tôn trọng cái Flow (BF/FB) mà vòng lặp hiện tại đang thử!
                for (const sb of softsToSqueezeCandidates) {
                    const currentFlow = sb.currentFlow; // Flow do vòng lặp quy định
                    const splits = generateElasticSplits(sb.duration, sb.elasticStep, sb.elasticLimit);
                    let fit = false;

                    for (const split of splits) {
                        // Tạo blocks theo Split + Current Flow
                        let sP1 = split.p1;
                        let sP2 = split.p2;
                        let blocks = [];

                        if (currentFlow === 'FB') {
                            const t1End = sb.startMins + sP1;
                            const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                            blocks.push({ type: 'CHAIR', start: sb.startMins, end: t1End + CONFIG.CLEANUP_BUFFER });
                            blocks.push({ type: 'BED', start: t2Start, end: sb.startMins + sb.duration + CONFIG.CLEANUP_BUFFER });
                        } else { // BF
                            const t1End = sb.startMins + sP2;
                            const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                            blocks.push({ type: 'BED', start: sb.startMins, end: t1End + CONFIG.CLEANUP_BUFFER });
                            blocks.push({ type: 'CHAIR', start: t2Start, end: sb.startMins + sb.duration + CONFIG.CLEANUP_BUFFER });
                        }

                        // Check allocatable?
                        if (isBlockSetAllocatable(blocks, matrixSq)) {
                            // Allocate thật
                            blocks.forEach(b => matrixSq.tryAllocate(b.type, b.start, b.end, sb.id));
                            fit = true;
                            
                            // Ghi nhận thay đổi (Bao gồm cả Flow Swap và Time Squeeze)
                            let updates = [];
                            if (currentFlow === 'BF') updates.push("FLOW: BF");
                            if (split.deviation !== 0) updates.push(`TIME: ${sP1}/${sP2}`);
                            
                            if (updates.length > 0) {
                                squeezeUpdates.push({
                                    rowId: sb.id,
                                    type: 'COMBINED_OPTIMIZE',
                                    newPhase1: sP1,
                                    newPhase2: sP2,
                                    newFlow: currentFlow,
                                    reason: updates.join(', ')
                                });
                            }
                            break;
                        }
                    }
                    if (!fit) { squeezeSuccess = false; break; }
                }

                if (squeezeSuccess) {
                    matrix = matrixSq; // Swap matrix
                    scenarioUpdates = squeezeUpdates; // Use squeeze updates
                } else {
                    scenarioFailed = true;
                    continue;
                }
            }

            // 5. CHECK STAFF AVAILABILITY
            // Xây dựng Timeline phẳng từ Matrix
            let flatTimeline = [];
            Object.values(matrix.lanes).forEach(group => {
                group.forEach(lane => {
                    lane.occupied.forEach(occ => {
                        // Tìm chủ nhân
                        const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
                        if (ex) {
                            flatTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
                        }
                    });
                });
            });

            let staffOk = true;
            for (const item of newGuestBlocksMap) {
                const startT = item.blocks[0].start;
                const endT = item.blocks[item.blocks.length - 1].end;
                
                const assigned = findAvailableStaff(item.guest.staffName, startT, endT, staffList, flatTimeline);
                if (!assigned) { staffOk = false; break; }
                
                // Update result detail
                const det = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
                if (det) det.staff = assigned;

                // Add to timeline for next check
                item.blocks.forEach(b => flatTimeline.push({ start: b.start, end: b.end, staffName: assigned }));
            }

            if (!staffOk) {
                scenarioFailed = true;
                continue;
            }

            // --- TÌM THẤY KỊCH BẢN THÀNH CÔNG! ---
            successfulScenario = {
                details: scenarioDetails,
                updates: scenarioUpdates
            };
            break; // Break inner loop
        }
        if (successfulScenario) break; // Break outer loop
    }

    // ------------------------------------------------------------------------
    // BƯỚC C: KẾT QUẢ CUỐI CÙNG
    // ------------------------------------------------------------------------
    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true,
            strategy: 'MATRIX_RESHUFFLE_V8.1',
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates, // Frontend cần check cái này để update DB nếu cần
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
        };
    } else {
        return { 
            feasible: false, 
            reason: "Hết chỗ (Matrix Full - Đã thử đảo chiều khách cũ nhưng vẫn không đủ tài nguyên)" 
        };
    }
}

// Helper: Check chay xem blocks có nhét vừa matrix không (không allocate)
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
            if (isFree) { foundLane = true; break; }
        }
        if (!foundLane) return false;
    }
    return true;
}

// ============================================================================
// PHẦN 7: EXPORT
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
    console.log("✅ Resource Core V8.1: Matrix Balancing Engine Active.");
}
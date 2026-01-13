/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V101.0 (INHERITANCE & MODULO SYNC)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/13
 *
 * * * * * CHANGE LOG V101.0 (THE "TETRIS" UPDATE):
 * 1. [CRITICAL] STRICT INHERITANCE (Cơ chế thừa kế vị trí cho khách cũ):
 * - Vấn đề: Khách cũ từ BED-1 xuống làm Chân bị trôi sang CHAIR-4,5,6 (do thuật toán First-Fit tìm chỗ rộng nhất).
 * - Giải pháp: Trích xuất Index từ RowID (BED-1 -> 1). Ép pha tiếp theo phải thử Slot 1 trước.
 * - Kết quả: Đồng bộ hóa hoàn toàn tư duy của Core với Timeline. Giải phóng Slot 4,5,6 cho khách lẻ.
 *
 * 2. [PRESERVED] MODULO ALLOCATION (Cho khách mới):
 * - Giữ nguyên logic chia bài "Cuốn chiếu" cho nhóm khách mới (Khách 1,4 đổi chỗ cho nhau).
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
    
    // Cấu hình thời gian
    OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
    
    // Bộ đệm thời gian (Đơn vị: Phút)
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp
    TRANSITION_BUFFER: 5, // Thời gian di chuyển
    
    // Dung sai và giới hạn
    TOLERANCE: 1,         
    MAX_TIMELINE_MINS: 1440 
};

// Cơ sở dữ liệu dịch vụ (Dynamic)
let SERVICES = {}; 

/**
 * Cập nhật danh sách dịch vụ và thêm các dịch vụ hệ thống mặc định
 */
function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE V101.0] Services Synced. Total: ${Object.keys(SERVICES).length}`);
}

// ============================================================================
// PHẦN 2: TIỆN ÍCH THỜI GIAN (TIME UTILITIES)
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
// PHẦN 3: BỘ NHẬN DIỆN THÔNG MINH (SMART CLASSIFIER)
// ============================================================================

function isComboService(serviceObj, serviceNameRaw = '') {
    if (!serviceObj && !serviceNameRaw) return false;
    
    const cat = (serviceObj && serviceObj.category ? serviceObj.category : '').toString().toUpperCase().trim();
    if (cat === 'COMBO' || cat === 'MIXED') return true;

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

function detectResourceType(serviceObj) {
    if (!serviceObj) return 'CHAIR';
    if (serviceObj.type === 'BED' || serviceObj.type === 'CHAIR') return serviceObj.type;
    const name = (serviceObj.name || '').toUpperCase();
    if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|SPA|BACK/)) return 'BED';
    return 'CHAIR'; 
}

// ============================================================================
// PHẦN 4: MATRIX ENGINE V101.0 (INHERITANCE READY)
// ============================================================================

class VirtualMatrix {
    constructor() {
        this.lanes = {
            'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
            'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
        };
    }

    checkLaneFree(lane, start, end) {
        for (let block of lane.occupied) {
            if (isOverlap(start, end, block.start, block.end)) return false; 
        }
        return true; 
    }

    allocateToLane(lane, start, end, ownerId) {
        lane.occupied.push({ start, end, ownerId });
        lane.occupied.sort((a, b) => a.start - b.start);
        return lane.id;
    }

    /**
     * [V101.0] Try Allocate with Preferred Index
     * Hỗ trợ cả Khách Cũ (Inheritance) và Khách Mới (Modulo)
     */
    tryAllocate(type, start, end, ownerId, preferredIndex = null) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null; 

        // CHIẾN LƯỢC 1: TARGETED ALLOCATION (Ưu tiên vị trí định sẵn)
        if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
            const targetLane = resourceGroup[preferredIndex - 1]; 
            if (this.checkLaneFree(targetLane, start, end)) {
                return this.allocateToLane(targetLane, start, end, ownerId);
            }
        }

        // CHIẾN LƯỢC 2: FIRST-FIT (Vét cạn)
        for (let lane of resourceGroup) {
            if (this.checkLaneFree(lane, start, end)) {
                return this.allocateToLane(lane, start, end, ownerId);
            }
        }
        return null; 
    }
}

// ============================================================================
// PHẦN 5: LOGIC TÌM NHÂN VIÊN (STAFF FINDER)
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

        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

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
// PHẦN 7: CORE ENGINE V101.0 (SYNC TIMELINE LOGIC)
// ============================================================================

/**
 * Hàm kiểm tra khả dụng chính - PHIÊN BẢN V101.0
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: CHUẨN BỊ DỮ LIỆU KHÁCH CŨ (PRE-PROCESSING & INDEX PARSING)
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
        
        // [V101.0 NEW] Phân tích RowID để tìm "Anchor Index" (Index neo đậu)
        // Nếu khách đang ở "BED-3", anchorIndex sẽ là 3.
        let anchorIndex = null;
        if (b.rowId) {
            const rowIdStr = b.rowId.toString().toUpperCase();
            const match = rowIdStr.match(/(\d+)/); // Regex tìm số
            if (match) {
                anchorIndex = parseInt(match[0]);
            }
        }

        let processedB = {
            id: b.rowId, originalData: b, staffName: b.staffName, serviceName: b.serviceName, category: svcInfo.category,
            isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
            elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
            blocks: [],
            anchorIndex: anchorIndex // Lưu lại index này
        };

        if (isCombo) {
            let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
            let p2 = duration - p1;
            const p1End = bStart + p1;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            
            let isBodyFirst = false;
            const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
            if (b.flow === 'BF' || noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體') || noteContent.includes('先身')) {
                isBodyFirst = true;
            }

            // [V101.0 LOGIC] Áp dụng Anchor Index vào các Block (Inheritance)
            if (isBodyFirst) {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: anchorIndex }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'CHAIR', forcedIndex: anchorIndex });
                processedB.flow = 'BF'; 
            } else {
                processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: anchorIndex }); 
                processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED', forcedIndex: anchorIndex });
                processedB.flow = 'FB'; 
            }
            
            processedB.p1_current = p1; processedB.p2_current = p2; processedB.startMins = bStart; processedB.duration = duration;
        } else {
            let rType = detectResourceType(svcInfo);
            // Single Service cũng tôn trọng vị trí hiện tại
            processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
        }
        existingBookingsProcessed.push(processedB);
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: TẠO DANH SÁCH "PENDULUM" (CON LẮC)
    // ------------------------------------------------------------------------
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return isComboService(s, g.serviceCode); });
    
    // [V100.0] Tính toán kích thước "Nửa nhóm" (Half Size) cho Modulo
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
                
                // [V101.0 FIX] Truyền forcedIndex (Inheritance)
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
            
            // Tính toán Preferred Index (Modulo)
            let preferredIdx = null;
            if (halfSize > 0) {
                preferredIdx = (item.guest.idx % halfSize) + 1;
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

        // === GIAI ĐOẠN 4: CHIẾN THUẬT SQUEEZE (BÓP MỀM) ===
        if (conflictFound) {
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                // Squeeze cũng tôn trọng Inheritance
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
            });

            let squeezeScenarioPossible = true;
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
                    
                    // Update check logic to respect forcedIndex
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
            feasible: true, strategy: 'MATRIX_PENDULUM_V101.0_SYNC', 
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
        };
    } else {
        return { feasible: false, reason: "Hết chỗ (Không tìm thấy khe hở phù hợp)" };
    }
}

/**
 * Hàm phụ trợ: Kiểm tra block set (Cập nhật V101.0 xử lý forcedIndex)
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
            if (isFree) return true; // Nếu vị trí cũ còn trống thì chắc chắn OK
        }

        // Nếu không có ưu tiên hoặc ưu tiên bị bận, quét tất cả
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
    console.log("✅ Resource Core V101.0 Loaded: Index Matching & Sync Logic.");
}
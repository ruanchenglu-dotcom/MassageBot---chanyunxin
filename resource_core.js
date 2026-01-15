/*
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V103.0 (GLOBAL CAPACITY GUARDRAIL)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/15
 *
 * * * * * CHANGE LOG V103.0 (THE "CAPACITY GUARDRAIL" UPDATE) * * * * *
 * 1. [CRITICAL] GLOBAL CAPACITY CHECK (Kiểm tra dung lượng tổng):
 * - Trước khi chạy Matrix xếp giường/ghế, hệ thống kiểm tra ngay "Tổng đầu người".
 * - Nguyên lý: Tại mọi thời điểm t trong khung giờ khách đặt:
 * (Số khách cũ đang làm + Số khách mới) KHÔNG ĐƯỢC LỚN HƠN (Tổng nhân viên đang đi làm).
 * - Ngăn chặn triệt để việc hệ thống cố nhét khách vào khe hở của từng thợ
 * trong khi tổng quán đã hết sạch người làm.
 *
 * 2. [PRESERVED] ALL V102.0 FEATURES:
 * - Giữ nguyên Couple Sync (Ưu tiên cặp đôi đi cùng Flow).
 * - Giữ nguyên Matrix Look-ahead & Modulo Wrapping.
 * - Giữ nguyên Logic Squeeze (Bóp mềm) và Elastic (Co giãn).
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION)
// ============================================================================

const CONFIG = {
    // Tài nguyên phần cứng (Giới hạn vật lý)
    MAX_CHAIRS: 6,        
    MAX_BEDS: 6,          
    MAX_TOTAL_GUESTS: 12, // Tổng dung lượng phục vụ tối đa (Ghế + Giường)
    
    // Cấu hình thời gian hoạt động
    OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
    
    // Bộ đệm thời gian (Time Buffers - Đơn vị: Phút)
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi ca
    TRANSITION_BUFFER: 5, // Thời gian khách di chuyển hoặc thay đồ
    
    // Dung sai và giới hạn tính toán
    TOLERANCE: 1,         // Sai số cho phép (phút) khi so sánh trùng lặp
    MAX_TIMELINE_MINS: 1440, // Tổng số phút trong 24h
    
    // Cấu hình Guardrail (V103.0)
    CAPACITY_CHECK_STEP: 15 // Kiểm tra tải trọng mỗi 15 phút
};

// Cơ sở dữ liệu dịch vụ (Dynamic Services Database)
let SERVICES = {}; 

/**
 * Cập nhật danh sách dịch vụ và thêm các dịch vụ hệ thống mặc định.
 */
function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE V103.0] Services Synced. Total: ${Object.keys(SERVICES).length} items loaded.`);
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
// PHẦN 4: HÀNG RÀO DUNG LƯỢNG TỔNG (GLOBAL CAPACITY GUARDRAIL - V103.0)
// ============================================================================

/**
 * Đếm số lượng nhân viên thực tế CÓ MẶT và SẴN SÀNG làm việc tại một thời điểm cụ thể.
 * Không tính nhân viên OFF, chưa vào ca, hoặc đã hết ca.
 */
function getActiveStaffCountAtTime(staffList, timePointMins) {
    let count = 0;
    for (const [staffName, info] of Object.entries(staffList)) {
        // 1. Nếu OFF cả ngày -> Bỏ qua
        if (info.off) continue;

        // 2. Parse giờ làm việc
        const shiftStart = getMinsFromTimeStr(info.start);
        const shiftEnd = getMinsFromTimeStr(info.end);

        if (shiftStart === -1 || shiftEnd === -1) continue;

        // 3. Kiểm tra xem timePoint có nằm trong ca làm việc không
        // Lưu ý: timePoint phải >= Start và < End (Strict inequality at end to match logic)
        if (timePointMins >= shiftStart && timePointMins < shiftEnd) {
            count++;
        }
    }
    return count;
}

/**
 * Kiểm tra tải trọng toàn cục của hệ thống.
 * Quét qua từng lát cắt thời gian (Time Slice) để đảm bảo không bị quá tải nhân sự.
 * * @param {number} requestStart - Phút bắt đầu của khách mới
 * @param {number} maxDuration - Thời lượng dài nhất của khách mới
 * @param {number} newGuestCount - Số lượng khách mới
 * @param {Array} currentBookingsRaw - Danh sách booking hiện tại
 * @param {Object} staffList - Danh sách nhân viên và ca làm việc
 */
function validateGlobalCapacity(requestStart, maxDuration, newGuestCount, currentBookingsRaw, staffList) {
    const requestEnd = requestStart + maxDuration + CONFIG.CLEANUP_BUFFER;
    
    // Lọc ra các booking cũ đang có hiệu lực (Running hoặc Reserved, trừ Cancelled/Finished)
    // Và chỉ lấy những booking có thể ảnh hưởng tới khung giờ này
    const activeExistingBookings = currentBookingsRaw.filter(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return false;
        const bEnd = bStart + (b.duration || 60) + CONFIG.CLEANUP_BUFFER;
        const status = b.status ? b.status.toLowerCase() : '';
        
        // Chỉ quan tâm booking Đang chạy hoặc Đã đặt
        if (status !== 'running' && status !== 'reserved' && status !== 'waiting') return false;
        
        // Kiểm tra xem có trùng với khoảng khách mới không (Sơ bộ)
        return isOverlap(requestStart, requestEnd, bStart, bEnd);
    });

    // QUÉT TỪNG LÁT CẮT THỜI GIAN (TIME SLICE CHECK)
    // Bước nhảy 15 phút để đảm bảo độ chính xác
    for (let t = requestStart; t < requestEnd; t += CONFIG.CAPACITY_CHECK_STEP) {
        
        // 1. Tính tổng nhân viên đi làm tại thời điểm t
        const availableStaffCount = getActiveStaffCountAtTime(staffList, t);
        
        // Nếu tại thời điểm t mà không có ai đi làm (ngoài giờ hoặc chưa đến giờ)
        // Mà khách lại muốn đặt -> Chắc chắn Fail (trừ khi shop chưa mở, nhưng logic này cover luôn)
        if (availableStaffCount === 0 && newGuestCount > 0) {
            return { 
                pass: false, 
                reason: `Giờ này (${getTimeStrFromMins(t)}) không có nhân viên nào làm việc.` 
            };
        }

        // 2. Tính số lượng khách cũ đang chiếm dụng nhân sự tại thời điểm t
        let currentLoad = 0;
        for (const b of activeExistingBookings) {
            const bStart = getMinsFromTimeStr(b.startTime);
            const bEnd = bStart + (b.duration || 60) + CONFIG.CLEANUP_BUFFER;
            // Nếu thời điểm t nằm trong khoảng booking cũ
            if (t >= bStart && t < bEnd) {
                currentLoad++;
            }
        }

        // 3. Tính tổng tải trọng dự kiến
        // Tải trọng = Khách cũ tại t + Khách mới (Khách mới chắc chắn chiếm dụng t vì t nằm trong range của họ)
        const totalLoad = currentLoad + newGuestCount;

        // 4. SO SÁNH (THE GUARDRAIL)
        if (totalLoad > availableStaffCount) {
            return {
                pass: false,
                reason: `Quá tải nhân sự lúc ${getTimeStrFromMins(t)}. Cần ${totalLoad} thợ, chỉ có ${availableStaffCount} thợ.`
            };
        }
    }

    return { pass: true };
}

// ============================================================================
// PHẦN 5: MATRIX ENGINE
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
    tryAllocate(type, start, end, ownerId, preferredIndex = null) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null; 
        // Strategy 1: Targeted
        if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
            const targetLane = resourceGroup[preferredIndex - 1]; 
            if (this.checkLaneFree(targetLane, start, end)) {
                return this.allocateToLane(targetLane, start, end, ownerId);
            }
        }
        // Strategy 2: First-Fit
        for (let lane of resourceGroup) {
            if (this.checkLaneFree(lane, start, end)) {
                return this.allocateToLane(lane, start, end, ownerId);
            }
        }
        return null; 
    }
}

// ============================================================================
// PHẦN 6: LOGIC TÌM NHÂN VIÊN & CO GIÃN
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
    } else {
        const allStaffNames = Object.keys(staffListRef);
        for (const name of allStaffNames) {
            if (checkOneStaff(name)) return name;
        }
        return null;
    }
}

function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
        return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999 }];
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
// PHẦN 7: CORE ENGINE V103.0 (GUARDRAIL INTEGRATED)
// ============================================================================

/**
 * HÀM KIỂM TRA KHẢ DỤNG CHÍNH - PHIÊN BẢN V103.0
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // Tìm duration lớn nhất của nhóm khách mới để xác định khoảng thời gian check
    let maxGuestDuration = 0;
    guestList.forEach(g => {
        const s = SERVICES[g.serviceCode] || { duration: 60 };
        const dur = s.duration || 60;
        if (dur > maxGuestDuration) maxGuestDuration = dur;
    });

    // ------------------------------------------------------------------------
    // [NEW V103.0] BƯỚC 0: GLOBAL CAPACITY GUARDRAIL (HÀNG RÀO KIỂM TRA)
    // ------------------------------------------------------------------------
    // Trước khi làm bất cứ việc gì tốn tài nguyên tính toán, kiểm tra tổng đầu người trước.
    const guardrailCheck = validateGlobalCapacity(
        requestStartMins, 
        maxGuestDuration, 
        guestList.length, 
        currentBookingsRaw, 
        staffList
    );

    if (!guardrailCheck.pass) {
        console.warn(`[CORE V103.0] GUARDRAIL REJECTED: ${guardrailCheck.reason}`);
        return { 
            feasible: false, 
            reason: `SYSTEM REJECT: ${guardrailCheck.reason}` // Trả về lý do cụ thể cho Client
        };
    }

    // ------------------------------------------------------------------------
    // BƯỚC A: TIỀN XỬ LÝ - GOM NHÓM (VISUAL SYNC) - GIỮ NGUYÊN V102.0
    // ------------------------------------------------------------------------
    let sortedRaw = [...currentBookingsRaw].sort((a, b) => {
        return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
    });

    const bookingGroups = {};
    sortedRaw.forEach(b => {
        const timeKey = (b.startTime || "").split(' ')[1] || "00:00";
        const contactInfo = b.originalData?.phone || b.originalData?.sdt || b.originalData?.custPhone || b.originalData?.customerName || "Unknown";
        const contactKey = contactInfo.toString().replace(/\D/g, '').slice(-6) || contactInfo.toString().trim();
        const groupKey = (b.status === 'Running') ? `RUNNING_${b.rowId}` : `${timeKey}_${contactKey}`;
        if (!bookingGroups[groupKey]) bookingGroups[groupKey] = [];
        bookingGroups[groupKey].push(b);
    });

    let remappedBookings = [];
    Object.values(bookingGroups).forEach(group => {
        group.sort((a,b) => parseInt(a.rowId) - parseInt(b.rowId));
        const groupSize = group.length;
        const halfSize = Math.ceil(groupSize / 2);
        group.forEach((b, idx) => {
            b._virtualInheritanceIndex = null;
            b._impliedFlow = null;
            if (b.status !== 'Running') {
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
    // BƯỚC B: XỬ LÝ CHI TIẾT BOOKING (BLOCK CREATION)
    // ------------------------------------------------------------------------
    let existingBookingsProcessed = [];
    remappedBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = isComboService(svcInfo, b.serviceName);
        let duration = b.duration || 60;
        let anchorIndex = null;
        
        if (b.status === 'Running') {
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

        let processedB = {
            id: b.rowId, originalData: b, staffName: b.staffName, serviceName: b.serviceName, 
            category: svcInfo.category, isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
            elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
            startMins: bStart, duration: duration, blocks: [], anchorIndex: anchorIndex
        };

        if (isCombo) {
            let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
            let p2 = duration - p1;
            const p1End = bStart + p1;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            let isBodyFirst = false;
            const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
            
            if (b.flow === 'BF' || noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體') || noteContent.includes('先身')) isBodyFirst = true;
            else if (b.status === 'Running' && b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) isBodyFirst = true; 
            else if (b._impliedFlow === 'BF') isBodyFirst = true;

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
            let rType = detectResourceType(svcInfo);
            processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
        }
        existingBookingsProcessed.push(processedB);
    });

    // ------------------------------------------------------------------------
    // BƯỚC C: KỊCH BẢN KHÁCH MỚI & COUPLE SYNC (V102.0)
    // ------------------------------------------------------------------------
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return isComboService(s, g.serviceCode); });
    const newGuestHalfSize = Math.ceil(comboGuests.length / 2);
    const maxBF = comboGuests.length;
    let trySequence = [];

    if (maxBF === 2) {
        trySequence = [0, 2, 1]; // Couple Strategy
    } else if (maxBF > 0) {
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
    // BƯỚC D: VÒNG LẶP VÉT CẠN (EXHAUSTIVE LOOP)
    // ------------------------------------------------------------------------
    let successfulScenario = null;

    for (let numBF of trySequence) {
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;
        
        // --- 1. NẠP KHÁCH CŨ ---
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
            const svc = SERVICES[ng.serviceCode] || { name: ng.serviceCode || 'Unknown', duration: 60, price: 0 }; 
            let flow = 'FB'; 
            let isThisGuestCombo = isComboService(svc, ng.serviceCode);
            if (isThisGuestCombo) {
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                if (cIdx >= 0 && cIdx < numBF) { flow = 'BF'; }
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
                let rType = detectResourceType(svc);
                blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONFIG.CLEANUP_BUFFER, type: rType });
                scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, flow: 'SINGLE', timeStr: timeStr, allocated: [] });
            }
            newGuestBlocksMap.push({ guest: ng, blocks: blocks });
        }

        // --- 3. XẾP KHÁCH MỚI (MODULO) ---
        let conflictFound = false;
        for (const item of newGuestBlocksMap) {
            let guestAllocations = [];
            let preferredIdx = null;
            if (newGuestHalfSize > 0 && newGuests.length >= 2) {
                preferredIdx = (item.guest.idx % newGuestHalfSize) + 1;
                // Couple Sync Logic
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

        // --- 4. SQUEEZE LOGIC ---
        if (conflictFound) {
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
            });

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
                        if (split.deviation !== 0) updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze V103.0' });
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

        // --- 5. STAFF CHECK ---
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

    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true, 
            strategy: 'MATRIX_COUPLE_SYNC_V103.0', 
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
        };
    } else {
        return { feasible: false, reason: "Hết chỗ (Không tìm thấy khe hở phù hợp hoặc không đủ nhân viên)" };
    }
}

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
    console.log("✅ Resource Core V103.0 Loaded: GLOBAL CAPACITY GUARDRAIL ACTIVE.");
}
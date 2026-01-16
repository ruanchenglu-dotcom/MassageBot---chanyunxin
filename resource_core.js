/*
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V104.0 (STRICT GUARDRAIL & SMART SCANNER)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/16
 *
 * * * * * CHANGE LOG V104.0 (THE "STRICT GUARDRAIL" UPDATE) * * * * *
 * 1. [UPGRADE] DATA NORMALIZATION (Chuẩn hóa dữ liệu):
 * - Xử lý trạng thái đa ngôn ngữ (Running, Waiting, Reserved, 已預約, Đã đặt...)
 * - Đảm bảo hệ thống đếm đúng các booking đang chiếm chỗ bất kể ngôn ngữ.
 *
 * 2. [NEW] SMART STAFF COUNTING (Đếm thợ thông minh):
 * - Logic cũ: Chỉ kiểm tra thợ có đang ở quán tại thời điểm t không.
 * - Logic V104.0: Thợ phải ở quán tại t VÀ phải đáp ứng điều kiện "Strict Time" (Chuẩn Hạ).
 * - Nếu thợ có cờ 'isStrictTime = true', và giờ về (Shift End) < giờ khách làm xong -> LOẠI NGAY.
 *
 * 3. [OPTIMIZED] GLOBAL SCANNER LOOP (Vòng lặp quét timeline):
 * - Quét từng lát cắt 15 phút.
 * - So sánh: Nhu cầu (Khách cũ + Mới) vs Cung ứng (Thợ khả dụng & Đủ giờ làm).
 * - Ngăn chặn triệt để việc nhận khách Combo vào sát giờ giao ca của thợ "về đúng giờ".
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
    TOLERANCE: 1,         // Sai số cho phép (phút)
    MAX_TIMELINE_MINS: 1440, // Tổng số phút trong 24h
    
    // Cấu hình Guardrail (V104.0)
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
    console.log(`[CORE V104.0] Services Synced. Total: ${Object.keys(SERVICES).length} items loaded.`);
}

// ============================================================================
// PHẦN 2: TIỆN ÍCH THỜI GIAN & DATA (TIME & DATA UTILITIES)
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
        // Xử lý định dạng ISO hoặc có ngày tháng
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
        if (h < CONFIG.OPEN_HOUR) h += 24; // Xử lý qua đêm (00:00 -> 24:00)
        
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

/**
 * [V104.0] Normalize Booking Status
 * Chuẩn hóa trạng thái booking để nhận diện booking đang chiếm chỗ.
 * Hỗ trợ: Tiếng Anh, Tiếng Việt, Tiếng Trung.
 */
function isActiveBookingStatus(statusRaw) {
    if (!statusRaw) return false;
    const s = statusRaw.toString().toLowerCase().trim();
    
    // Các trạng thái KHÔNG chiếm chỗ (Đã xong, Đã hủy, Checkout)
    const inactiveKeywords = ['cancel', 'hủy', 'huỷ', 'finish', 'done', 'xong', 'check-out', 'checkout', '取消', '完成', '空'];
    for (const kw of inactiveKeywords) {
        if (s.includes(kw)) return false;
    }

    // Các trạng thái CHIẾM CHỖ (Mặc định nếu không phải cancel/finish thì là active)
    // Bao gồm: Running, Waiting, Reserved, Booked, Đã đặt, Đang làm, Chờ, v.v.
    return true; 
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
// PHẦN 4: HÀNG RÀO DUNG LƯỢNG TỔNG & STRICT TIME (GUARDRAIL V104.0)
// ============================================================================

/**
 * [V104.0 - SMART STAFF COUNTING]
 * Đếm số lượng nhân viên thực tế có thể phục vụ cho một yêu cầu cụ thể.
 * Logic:
 * 1. Nhân viên phải có mặt tại thời điểm `currentTimeMins`.
 * 2. Nếu nhân viên có `isStrictTime === true`, giờ `Shift End` của họ phải >= `requiredEndTime`.
 * (Nếu khách làm đến 13:40 mà thợ phải về chuẩn giờ lúc 13:00 -> Thợ đó bị loại).
 * * @param {Object} staffList - Danh sách nhân viên
 * @param {number} currentTimeMins - Thời điểm đang quét (lát cắt thời gian)
 * @param {number} requiredEndTime - Thời điểm kết thúc dự kiến của khách mới
 */
function getEligibleStaffCount(staffList, currentTimeMins, requiredEndTime) {
    let count = 0;
    for (const [staffName, info] of Object.entries(staffList)) {
        // 1. Bỏ qua nếu OFF
        if (info.off) continue;

        const shiftStart = getMinsFromTimeStr(info.start);
        const shiftEnd = getMinsFromTimeStr(info.end);

        if (shiftStart === -1 || shiftEnd === -1) continue;

        // 2. Kiểm tra xem thời điểm hiện tại t có nằm trong ca làm việc không
        if (currentTimeMins >= shiftStart && currentTimeMins < shiftEnd) {
            
            // 3. [STRICT TIME CHECK - NEW V104.0]
            if (info.isStrictTime === true) {
                // Nếu là thợ nghiêm ngặt giờ giấc
                // Ca làm việc kết thúc phải LỚN HƠN HOẶC BẰNG giờ khách xong việc
                // (Trừ đi Tolerance để tránh lỗi làm tròn giây)
                if (shiftEnd < (requiredEndTime - CONFIG.TOLERANCE)) {
                    // Thợ này tuy đang đi làm lúc này, nhưng sẽ về trước khi khách làm xong
                    // -> Không tính vào nguồn cung (Supply)
                    continue; 
                }
            }
            
            // Nếu qua hết các vòng kiểm tra -> Đủ điều kiện
            count++;
        }
    }
    return count;
}

/**
 * [V104.0 - GLOBAL SCANNER]
 * Kiểm tra tải trọng toàn cục với logic "Demand vs Supply" từng lát cắt thời gian.
 */
function validateGlobalCapacity(requestStart, maxDuration, newGuestCount, currentBookingsRaw, staffList) {
    const requestEnd = requestStart + maxDuration + CONFIG.CLEANUP_BUFFER;
    
    // 1. Lọc ra các booking cũ đang chiếm chỗ (Dùng hàm normalizeStatus mới)
    const activeExistingBookings = currentBookingsRaw.filter(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return false;
        
        // Kiểm tra trạng thái đa ngôn ngữ
        if (!isActiveBookingStatus(b.status)) return false;

        // Thời gian kết thúc booking cũ
        const bEnd = bStart + (b.duration || 60) + CONFIG.CLEANUP_BUFFER;
        
        // Chỉ lấy những booking có giao thoa với khoảng thời gian khách mới yêu cầu
        return isOverlap(requestStart, requestEnd, bStart, bEnd);
    });

    // 2. QUÉT TỪNG LÁT CẮT THỜI GIAN (TIMELINE LOOP)
    for (let t = requestStart; t < requestEnd; t += CONFIG.CAPACITY_CHECK_STEP) {
        
        // A. Tính Cung (Supply): Số lượng thợ khả dụng & đủ thời gian phục vụ
        const supplyCount = getEligibleStaffCount(staffList, t, requestEnd);

        // B. Tính Cầu (Demand): Khách cũ đang làm tại t + Khách mới
        let currentLoad = 0;
        for (const b of activeExistingBookings) {
            const bStart = getMinsFromTimeStr(b.startTime);
            const bEnd = bStart + (b.duration || 60) + CONFIG.CLEANUP_BUFFER;
            // Nếu thời điểm t nằm trong khoảng booking cũ
            if (t >= bStart && t < bEnd) {
                currentLoad++;
            }
        }
        
        // Tổng cầu = Khách cũ + Khách mới (Vì khách mới chắc chắn chiếm dụng thời gian này)
        const totalDemand = currentLoad + newGuestCount;

        // C. SO SÁNH (GUARDRAIL CONDITION)
        // Nếu tại bất kỳ thời điểm nào, Cầu > Cung -> BÁO HẾT CHỖ NGAY
        if (totalDemand > supplyCount) {
            return {
                pass: false,
                reason: `Quá tải lúc ${getTimeStrFromMins(t)}. Cần ${totalDemand} thợ (bao gồm khách mới), chỉ có ${supplyCount} thợ đáp ứng đủ giờ.`
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
        // Strategy 1: Targeted (Cố nhét vào chỗ cũ/ưu tiên)
        if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
            const targetLane = resourceGroup[preferredIndex - 1]; 
            if (this.checkLaneFree(targetLane, start, end)) {
                return this.allocateToLane(targetLane, start, end, ownerId);
            }
        }
        // Strategy 2: First-Fit (Tìm chỗ trống đầu tiên)
        for (let lane of resourceGroup) {
            if (this.checkLaneFree(lane, start, end)) {
                return this.allocateToLane(lane, start, end, ownerId);
            }
        }
        return null; 
    }
}

// ============================================================================
// PHẦN 6: LOGIC TÌM NHÂN VIÊN & CO GIÃN (STAFF & ELASTIC LOGIC)
// ============================================================================

function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        if (!staffInfo || staffInfo.off) return false; 
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        if (shiftStart === -1 || shiftEnd === -1) return false; 
        
        // Check 1: Khách đến sau khi thợ đi làm
        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
        
        // Check 2: Strict Time (Đồng bộ với logic Guardrail V104.0)
        const isStrict = staffInfo.isStrictTime === true;
        if (isStrict) {
            // Nếu nghiêm ngặt: Phải làm xong TRƯỚC khi hết ca
            if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
        } else {
            // Nếu không nghiêm ngặt: Chỉ cần nhận khách TRƯỚC khi hết ca
            if (start > shiftEnd) return false;
        }

        // Check 3: Trùng lịch booking khác
        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

        // Check 4: Giới tính
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
// PHẦN 7: CORE ENGINE V104.0 (INTEGRATED)
// ============================================================================

/**
 * HÀM KIỂM TRA KHẢ DỤNG CHÍNH - PHIÊN BẢN V104.0
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // Tìm duration lớn nhất của nhóm khách mới
    let maxGuestDuration = 0;
    guestList.forEach(g => {
        const s = SERVICES[g.serviceCode] || { duration: 60 };
        const dur = s.duration || 60;
        if (dur > maxGuestDuration) maxGuestDuration = dur;
    });

    // ------------------------------------------------------------------------
    // [V104.0] BƯỚC 0: STRICT GUARDRAIL CHECK (HÀNG RÀO BẢO VỆ NGHIÊM NGẶT)
    // ------------------------------------------------------------------------
    // Thực hiện quét toàn cục Demand/Supply trước khi chạy Matrix.
    const guardrailCheck = validateGlobalCapacity(
        requestStartMins, 
        maxGuestDuration, 
        guestList.length, 
        currentBookingsRaw, 
        staffList
    );

    if (!guardrailCheck.pass) {
        console.warn(`[CORE V104.0] GUARDRAIL REJECTED: ${guardrailCheck.reason}`);
        return { 
            feasible: false, 
            reason: `SYSTEM REJECT: ${guardrailCheck.reason}` // Trả về lý do cụ thể
        };
    }

    // ------------------------------------------------------------------------
    // BƯỚC A: TIỀN XỬ LÝ - GOM NHÓM (VISUAL SYNC)
    // ------------------------------------------------------------------------
    let sortedRaw = [...currentBookingsRaw].sort((a, b) => {
        return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
    });

    const bookingGroups = {};
    sortedRaw.forEach(b => {
        // Chỉ gom nhóm các booking Active
        if (!isActiveBookingStatus(b.status)) return;

        const timeKey = (b.startTime || "").split(' ')[1] || "00:00";
        const contactInfo = b.originalData?.phone || b.originalData?.sdt || b.originalData?.custPhone || b.originalData?.customerName || "Unknown";
        const contactKey = contactInfo.toString().replace(/\D/g, '').slice(-6) || contactInfo.toString().trim();
        const statusLower = (b.status||'').toLowerCase();
        
        // Nếu đang Running, gom theo RowID
        const groupKey = (statusLower.includes('running') || statusLower.includes('doing')) 
            ? `RUNNING_${b.rowId}` 
            : `${timeKey}_${contactKey}`;
            
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
        const statusLower = (b.status||'').toLowerCase();
        const isRunning = statusLower.includes('running');

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

        let processedB = {
            id: b.rowId, originalData: b, staffName: b.staffName, serviceName: b.serviceName, 
            category: svcInfo.category, 
            // Chỉ cho phép Squeeze (Co giãn) nếu KHÔNG phải booking đang chạy
            isElastic: isCombo && (b.isManualLocked !== true) && (!isRunning),
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
            else if (isRunning && b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) isBodyFirst = true; 
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
    // BƯỚC C: KỊCH BẢN KHÁCH MỚI & COUPLE SYNC
    // ------------------------------------------------------------------------
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return isComboService(s, g.serviceCode); });
    const newGuestHalfSize = Math.ceil(comboGuests.length / 2);
    const maxBF = comboGuests.length;
    let trySequence = [];

    if (maxBF === 2) {
        trySequence = [0, 2, 1]; // Couple Strategy: Cả 2 FB, Cả 2 BF, hoặc lệch
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

        // --- 3. XẾP KHÁCH MỚI (MODULO PLACEMENT) ---
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

        // --- 4. SQUEEZE LOGIC (CO GIÃN KHÁCH CŨ NẾU CẦN) ---
        if (conflictFound) {
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            
            // Xếp lại khách cứng (Hard Bookings)
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
            });

            // Thử xếp khách mới vào trước
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

            // Nhét khách mềm (Soft Bookings) vào chỗ còn lại
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
                        if (split.deviation !== 0) updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze V104.0' });
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

        // --- 5. STAFF CHECK (ASSIGNMENT) ---
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

        successfulScenario = { details: scenarioDetails, updates: scenarioUpdates, matrixDump: matrix.lanes };
        break; 
    }

    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true, 
            strategy: 'MATRIX_COUPLE_SYNC_V104.0', 
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
    console.log("✅ Resource Core V104.0 Loaded: STRICT GUARDRAIL & SMART SCANNER ACTIVE.");
}
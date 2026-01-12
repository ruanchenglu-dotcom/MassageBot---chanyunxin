/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V7.0 (ELASTIC ANCHOR & SMART SQUEEZE)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/12
 *
 * * * * * CHANGE LOG V7.0 (THE ARCHITECT UPGRADE):
 * 1. [ELASTIC ANCHOR STRATEGY]:
 * - Khách cũ được coi là "Móng nhà": Giữ nguyên Giờ bắt đầu (Start Time) & Nhân viên.
 * - Tuy nhiên, khách cũ Combo (chưa lock) có thể "biến hình" (co giãn Phase 1/2) tại chỗ.
 * * 2. [SMART SQUEEZE ALGORITHM]:
 * - Khi khách mới không tìm được chỗ, hệ thống KHÔNG báo lỗi ngay.
 * - Hệ thống sẽ tìm các khách cũ đang chiếm dụng tài nguyên đó và thử "bóp" (Squeeze) họ.
 * - Ví dụ: Khách cũ đang làm chân 45p -> Bóp xuống 30p để nhường 15p cho khách mới vào giường.
 * * 3. [CONFLICT RESOLUTION]:
 * - Thay vì "System Conflict", hệ thống sẽ trả về phương án:
 * + Create: Khách mới.
 * + Update: Khách cũ (với thông số Phase mới).
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
    
    // Cấu hình thời gian (Đơn vị: Giờ)
    OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
    
    // Bộ đệm thời gian (Đơn vị: Phút)
    CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi khách
    TRANSITION_BUFFER: 5, // Thời gian khách di chuyển giữa 2 dịch vụ (Combo)
    
    // Dung sai cho phép (Tránh lỗi làm tròn số học)
    TOLERANCE: 1,         
    
    // Giới hạn lịch trình
    MAX_TIMELINE_MINS: 1440 // 24 giờ * 60 phút
};

// Cơ sở dữ liệu dịch vụ (Sẽ được cập nhật động từ Google Sheet)
let SERVICES = {}; 

function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
        'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    // console.log(`[CORE V7.0] Services Updated: ${Object.keys(SERVICES).length} entries.`);
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
        
        // Xử lý giờ qua đêm (01:00 -> 25:00)
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
    // Sử dụng Tolerance để tránh các lỗi làm tròn mili-giây hoặc biên
    const safeEndA = endA - CONFIG.TOLERANCE; 
    const safeEndB = endB - CONFIG.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

// ============================================================================
// PHẦN 3: LOGIC KIỂM TRA TÀI NGUYÊN (CAPACITY CHECK - LINE SWEEP)
// ============================================================================

/**
 * Kiểm tra xem tài nguyên (Giường/Ghế) có bị quá tải trong khoảng thời gian không
 * Sử dụng thuật toán Line Sweep (Quét đường thẳng) để đếm tải trọng tức thời
 */
function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; // Loại tài nguyên không giới hạn

    // Lọc ra các booking có liên quan đến loại tài nguyên và khung giờ này
    let relevantBookings = bookings.filter(bk => {
        let isTypeMatch = (resourceType === 'TOTAL') ? true : (bk.resourceType === resourceType);
        return isTypeMatch && isOverlap(start, end, bk.start, bk.end);
    });

    if (relevantBookings.length === 0) return true;

    // Tạo các điểm sự kiện (Start/End)
    let points = [];
    // Thêm điểm kiểm tra (chúng ta muốn check xem trong khoảng này có lúc nào quá tải không)
    points.push({ time: start, type: 'check_start' });
    points.push({ time: end, type: 'check_end' });

    relevantBookings.forEach(bk => {
        points.push({ time: bk.start, type: 'start' });
        points.push({ time: bk.end, type: 'end' });
    });

    // Sắp xếp sự kiện theo thời gian
    points.sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        // Nếu cùng thời gian, thứ tự ưu tiên xử lý:
        // 1. Booking bắt đầu (Tăng tải)
        // 2. Check bắt đầu
        // 3. Check kết thúc
        // 4. Booking kết thúc (Giảm tải)
        const priority = { 'start': 1, 'check_start': 2, 'check_end': 3, 'end': 4 };
        return priority[a.type] - priority[b.type];
    });

    let currentLoad = 0;
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else if (p.type === 'end') currentLoad--;
        
        // Chỉ kiểm tra tải trọng TRONG khoảng thời gian yêu cầu
        if (p.time >= start && p.time < end) {
             if (currentLoad > limit) return false; 
        }
    }
    return true; 
}

// ============================================================================
// PHẦN 4: LOGIC TÌM NHÂN VIÊN (STAFF FINDER)
// ============================================================================

function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
    const checkOneStaff = (name) => {
        const staffInfo = staffListRef[name];
        // 1. Staff phải tồn tại và không OFF
        if (!staffInfo || staffInfo.off) return false; 
        
        // 2. Kiểm tra giờ làm việc (Ca kíp)
        const shiftStart = getMinsFromTimeStr(staffInfo.start); 
        const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
        if (shiftStart === -1 || shiftEnd === -1) return false; 

        // Khách vào TRƯỚC giờ làm -> Loại
        if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
        
        // Khách ra SAU giờ về
        const isStrict = staffInfo.isStrictTime === true;
        if (isStrict) {
            // Chế độ nghiêm ngặt: Phải xong trước khi về
            if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
        } else {
            // Chế độ linh hoạt: Chỉ cần bắt đầu trước khi về
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

    // Nếu yêu cầu đích danh 1 nhân viên (hoặc Male/Female)
    if (staffReq && staffReq !== 'RANDOM' && staffReq !== 'MALE' && staffReq !== 'FEMALE' && staffReq !== '隨機' && staffReq !== 'Any' && staffReq !== 'undefined') {
        return checkOneStaff(staffReq) ? staffReq : null;
    } else {
        // Nếu Random -> Duyệt tất cả nhân viên khả dụng
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

/**
 * Sinh ra các tùy chọn chia Phase cho Combo.
 * Trả về mảng các phương án { p1, p2, deviation }
 */
function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
    // Nếu đã bị khóa cứng (Manual Lock), chỉ trả về đúng 1 phương án duy nhất
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
        return [{ 
            p1: parseInt(customLockedPhase1), 
            p2: totalDuration - parseInt(customLockedPhase1), 
            deviation: 999 // Đánh dấu đặc biệt
        }];
    }

    const standardHalf = Math.floor(totalDuration / 2);
    // Phương án chuẩn (50/50) luôn là ưu tiên số 1
    let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];

    if (!step || !limit || step <= 0 || limit <= 0) {
        return options;
    }

    let currentDeviation = step;
    while (currentDeviation <= limit) {
        // Biến thể A: Giảm Phase 1, Tăng Phase 2 (Làm chân ít hơn)
        let p1_A = standardHalf - currentDeviation;
        let p2_A = totalDuration - p1_A;
        if (p1_A >= 15 && p2_A >= 15) { // Giới hạn tối thiểu 15p
            options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
        }
        
        // Biến thể B: Tăng Phase 1, Giảm Phase 2 (Làm chân nhiều hơn)
        let p1_B = standardHalf + currentDeviation;
        let p2_B = totalDuration - p1_B;
        if (p1_B >= 15 && p2_B >= 15) {
            options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
        }
        
        currentDeviation += step;
    }

    // Sắp xếp: Ưu tiên gần chuẩn nhất (Deviation thấp nhất) để ít ảnh hưởng khách nhất
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
}

// ============================================================================
// PHẦN 6: GLOBAL OPTIMIZER V7.0 (SMART SQUEEZE LOGIC)
// ============================================================================

/**
 * Hàm kiểm tra khả dụng chính (Main Logic)
 * V7.0 Logic: 
 * 1. Xây dựng Timeline Cứng (Hard).
 * 2. Neo các Timeline Mềm (Soft Existing) vào Timeline Cứng.
 * 3. Thử xếp Khách Mới. Nếu va chạm với Khách Mềm -> Thử bóp Khách Mềm.
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: PHÂN LOẠI DỮ LIỆU (HARD vs SOFT vs NEW)
    // ------------------------------------------------------------------------
    
    let hardBookings = [];      // Các booking không thể di dời/co giãn
    let softBookings = [];      // Các booking cũ có thể co giãn (Elastic Anchors)
    
    // --- 1. Duyệt và phân loại Khách Cũ ---
    currentBookingsRaw.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO' || b.serviceName.includes('Combo') || b.serviceName.includes('套餐');
        let duration = b.duration || 60;
        
        // Điều kiện để là "Soft" (Elastic Candidate):
        // 1. Là Combo (chỉ Combo mới chia phase được)
        // 2. Không bị khóa tay (isManualLocked != true)
        // 3. Không phải đang chạy (status != Running)
        const isElasticCandidate = isCombo && (b.isManualLocked !== true) && (b.status !== 'Running');

        if (isElasticCandidate) {
            // [SOFT]: Khách cũ linh hoạt
            softBookings.push({
                id: b.rowId,
                originalData: b,
                staffName: b.staffName,
                serviceName: b.serviceName,
                duration: duration,
                startMins: bStart, // Anchor: Giờ bắt đầu bị ghim chặt
                elasticStep: svcInfo.elasticStep || 5,
                elasticLimit: svcInfo.elasticLimit || 15,
                // Mặc định hiện tại (lấy từ DB hoặc chia đôi)
                currentPhase1: b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration/2)
            });
        } else {
            // [HARD]: Khách cũ cố định (Đá tảng)
            if (isCombo) {
                // Nếu combo bị lock, chia theo thông số lock hoặc chia đôi
                let p1 = Math.floor(duration / 2);
                if (b.phase1_duration) p1 = parseInt(b.phase1_duration);
                const p1End = bStart + p1;
                const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                
                hardBookings.push({ start: bStart, end: p1End, resourceType: 'CHAIR', staffName: b.staffName, ownerId: b.rowId });
                hardBookings.push({ start: p2Start, end: bStart + duration, resourceType: 'BED', staffName: b.staffName, ownerId: b.rowId });
            } else {
                // Single
                let rType = svcInfo.type || 'CHAIR';
                if (b.serviceName.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
                hardBookings.push({ start: bStart, end: bStart + duration, resourceType: rType, staffName: b.staffName, ownerId: b.rowId });
            }
        }
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: XÂY DỰNG TIMELINE NỀN TẢNG (BASELINE)
    // ------------------------------------------------------------------------

    // Timeline hiện tại bao gồm Hard Bookings
    let currentTimeline = [...hardBookings];

    // Neo các Soft Bookings vào Timeline với cấu hình Mặc định (Standard/Current)
    // Để tạo ra một bức tranh toàn cảnh "Nếu không có gì thay đổi"
    softBookings.forEach(soft => {
        const p1 = soft.currentPhase1;
        const p2 = soft.duration - p1;
        
        const tStart = soft.startMins;
        const p1End = tStart + p1;
        const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
        
        // Mặc định khách cũ FB (Foot -> Body)
        currentTimeline.push({ 
            start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, 
            resourceType: 'CHAIR', staffName: soft.staffName, 
            isSoft: true, softId: soft.id // Đánh dấu để biết đây là khối mềm
        });
        currentTimeline.push({ 
            start: p2Start, end: p2Start + p2 + CONFIG.CLEANUP_BUFFER, 
            resourceType: 'BED', staffName: soft.staffName, 
            isSoft: true, softId: soft.id 
        });
    });

    // ------------------------------------------------------------------------
    // BƯỚC C: XỬ LÝ KHÁCH MỚI (NEW GUESTS - THE ROOF)
    // ------------------------------------------------------------------------
    
    let finalDetails = []; 
    let proposedUpdates = []; // Danh sách các thay đổi đề xuất cho khách cũ

    // Sắp xếp khách mới (đơn giản theo index)
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));

    for (const newGuest of newGuests) {
        const svc = SERVICES[newGuest.serviceCode];
        if (!svc) continue;

        let isFitted = false;
        let conflictReason = "";

        // Xác định loại tài nguyên cần cho khách mới
        // (Đơn giản hóa: Khách mới ở đây coi như Single hoặc Combo chuẩn, không co giãn phức tạp để tránh đệ quy)
        // Nếu khách mới là Combo, ta thử các split của khách mới trước.
        
        const newGuestSplits = (svc.category === 'COMBO') 
            ? generateElasticSplits(svc.duration, svc.elasticStep, svc.elasticLimit)
            : [{ p1: svc.duration, p2: 0, deviation: 0 }]; // Single coi như 1 cục

        for (const ngSplit of newGuestSplits) {
            // Xác định các khối thời gian của Khách Mới
            let blocksNeeded = [];
            const ngStart = requestStartMins;
            
            if (svc.category === 'COMBO') {
                // Thử Mode FB (Mặc định cho khách mới)
                const p1End = ngStart + ngSplit.p1;
                const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                const p2End = p2Start + ngSplit.p2;
                blocksNeeded.push({ start: ngStart, end: p1End + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                blocksNeeded.push({ start: p2Start, end: p2End + CONFIG.CLEANUP_BUFFER, type: 'BED' });
            } else {
                // Single
                let rType = svc.type || 'CHAIR';
                if (svc.name.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
                blocksNeeded.push({ start: ngStart, end: ngStart + svc.duration + CONFIG.CLEANUP_BUFFER, type: rType });
            }

            // --- KIỂM TRA VA CHẠM (COLLISION CHECK) ---
            // Kiểm tra xem blocksNeeded có vừa với currentTimeline không?
            
            let hardConflict = false;
            let softConflictIds = new Set(); // Danh sách các ông Soft đang ngáng đường

            for (const block of blocksNeeded) {
                if (!checkResourceCapacity(block.type, block.start, block.end, currentTimeline)) {
                    // Có va chạm! Tìm xem va vào ai?
                    // Lọc ra các booking trong timeline trùng giờ và cùng loại resource
                    const blockers = currentTimeline.filter(existing => 
                        existing.resourceType === block.type && 
                        isOverlap(block.start, block.end, existing.start, existing.end)
                    );
                    
                    // Kiểm tra xem blockers là Hard hay Soft
                    // Nếu TẤT CẢ blockers đều là Soft và tổng tải trọng (Hard + Soft) > Limit -> Thì mới là SoftConflict.
                    // Nếu có Hard blocker làm quá tải -> Hard Conflict -> Không cứu được.
                    
                    // Cách đơn giản: Thử loại bỏ Soft ra xem có vừa không?
                    const hardLoad = blockers.filter(b => !b.isSoft).length;
                    const softBlockers = blockers.filter(b => b.isSoft);
                    
                    let limit = (block.type === 'BED') ? CONFIG.MAX_BEDS : CONFIG.MAX_CHAIRS;
                    
                    // Nếu tải trọng Hard đã full -> Hard Conflict
                    if (hardLoad >= limit) {
                        hardConflict = true;
                        break;
                    }
                    
                    // Nếu Hard chưa full, nghĩa là do mấy ông Soft làm đầy -> Ghi lại ID ông Soft
                    softBlockers.forEach(sb => softConflictIds.add(sb.softId));
                }
            }

            // --- XỬ LÝ KẾT QUẢ KIỂM TRA ---

            if (!hardConflict && softConflictIds.size === 0) {
                // 1. NGON: Không va chạm ai cả -> Xếp luôn
                // Tìm staff
                const assignedStaff = findAvailableStaff(newGuest.staffName, ngStart, ngStart + svc.duration + 20, staffList, currentTimeline);
                if (assignedStaff) {
                    blocksNeeded.forEach(b => currentTimeline.push({ ...b, resourceType: b.type, staffName: assignedStaff }));
                    finalDetails.push({
                        guestIndex: newGuest.idx,
                        staff: assignedStaff,
                        service: svc.name,
                        price: svc.price,
                        phase1_duration: ngSplit.p1,
                        phase2_duration: ngSplit.p2,
                        timeStr: `${getTimeStrFromMins(ngStart)} - ...`
                    });
                    isFitted = true;
                    break;
                }
            } else if (!hardConflict && softConflictIds.size > 0) {
                // 2. CÓ CƠ HỘI: Va chạm với Soft -> Kích hoạt SMART SQUEEZE
                // Thử "bóp" từng ông Soft đang ngáng đường
                
                let squeezeSuccess = true;
                let tempUpdates = [];
                
                // Sao chép timeline để thử nghiệm (Snapshot)
                let trialTimeline = currentTimeline.filter(b => !Array.from(softConflictIds).includes(b.softId)); // Bỏ mấy ông Soft đang xét ra

                for (const softId of softConflictIds) {
                    const softBooking = softBookings.find(s => s.id === softId);
                    if (!softBooking) { squeezeSuccess = false; break; }

                    // Sinh ra các biến thể của ông Soft này
                    const softSplits = generateElasticSplits(softBooking.duration, softBooking.elasticStep, softBooking.elasticLimit);
                    
                    let foundFitForSoft = false;
                    for (const sSplit of softSplits) {
                        // Tạo hình dáng mới cho ông Soft
                        const sP1End = softBooking.startMins + sSplit.p1;
                        const sP2Start = sP1End + CONFIG.TRANSITION_BUFFER;
                        const sP2End = sP2Start + sSplit.p2;

                        const softBlocks = [
                            { start: softBooking.startMins, end: sP1End + CONFIG.CLEANUP_BUFFER, resourceType: 'CHAIR', staffName: softBooking.staffName, isSoft: true, softId: softId },
                            { start: sP2Start, end: sP2End + CONFIG.CLEANUP_BUFFER, resourceType: 'BED', staffName: softBooking.staffName, isSoft: true, softId: softId }
                        ];

                        // Kiểm tra xem hình dáng mới này có va vào Hard/NewGuest/OtherSofts trong trialTimeline không?
                        // Lưu ý: trialTimeline hiện tại đang chứa (Hard + Các Soft KHÔNG bị conflict + NewGuest Blocks???)
                        // Chưa, ta phải check xem Soft mới có vừa với trialTimeline + NewGuestBlocks không.
                        
                        // Check 1: Soft mới vs TrialTimeline
                        let sFitTrial = true;
                        for(const sb of softBlocks) {
                            if(!checkResourceCapacity(sb.resourceType, sb.start, sb.end, trialTimeline)) sFitTrial = false;
                        }
                        if(!sFitTrial) continue; // Biến thể này vẫn cấn Hard/Other, thử cái khác

                        // Check 2: Soft mới vs NewGuest (Mục tiêu chính là né NewGuest)
                        let sFitNewGuest = true;
                        for(const nb of blocksNeeded) {
                            // Logic check chéo: Resource của NewGuest có bị Soft mới chiếm không?
                            // Ta tạm add Soft mới vào Trial, sau đó check NewGuest
                            const tempTimelineWithNewSoft = [...trialTimeline, ...softBlocks];
                             if(!checkResourceCapacity(nb.type, nb.start, nb.end, tempTimelineWithNewSoft)) sFitNewGuest = false;
                        }

                        if (sFitNewGuest) {
                            // TUYỆT VỜI! Tìm được hình dáng phù hợp cho ông Soft này
                            foundFitForSoft = true;
                            // Cập nhật trialTimeline
                            trialTimeline.push(...softBlocks);
                            // Ghi nhận update
                            if (sSplit.deviation !== 0) {
                                tempUpdates.push({
                                    rowId: softId,
                                    customerName: softBooking.originalData.customerName,
                                    newPhase1: sSplit.p1,
                                    newPhase2: sSplit.p2,
                                    reason: 'Squeezed for New Guest'
                                });
                            }
                            break; 
                        }
                    }

                    if (!foundFitForSoft) {
                        squeezeSuccess = false; // Không cứu được ông Soft này
                        break; 
                    }
                }

                if (squeezeSuccess) {
                    // Nếu cứu được hết đám Soft -> Chốt đơn
                    // Tìm staff cho New Guest
                    // Lưu ý: Staff finder cần chạy trên trialTimeline (đã cập nhật Soft mới)
                    // Và phải thêm New Guest Blocks vào trialTimeline để check staff busy
                    
                    // Thêm New Guest Blocks vào trialTimeline để hoàn thiện bức tranh tài nguyên
                    // Nhưng staff finder cần timeline ĐÃ CÓ resource blocks để check overlap
                    const timelineForStaffCheck = [...trialTimeline, ...blocksNeeded.map(b=>({...b, resourceType: b.type, staffName: 'TEMP'}))];
                    
                    const assignedStaff = findAvailableStaff(newGuest.staffName, ngStart, ngStart + svc.duration + 20, staffList, timelineForStaffCheck);
                    
                    if (assignedStaff) {
                        // Commit mọi thứ
                        currentTimeline = trialTimeline; // Cập nhật timeline chính thức với các Soft đã bóp
                        blocksNeeded.forEach(b => currentTimeline.push({ ...b, resourceType: b.type, staffName: assignedStaff }));
                        
                        finalDetails.push({
                            guestIndex: newGuest.idx,
                            staff: assignedStaff,
                            service: svc.name,
                            price: svc.price,
                            phase1_duration: ngSplit.p1,
                            phase2_duration: ngSplit.p2,
                            timeStr: `${getTimeStrFromMins(ngStart)} - ...`
                        });
                        
                        // Merge proposed updates
                        proposedUpdates.push(...tempUpdates);
                        
                        isFitted = true;
                        break;
                    }
                }
            } // End Else If Soft Conflict
        } // End Loop NewGuestSplits
        
        if (!isFitted) {
            return { feasible: false, reason: "Không tìm được chỗ (Đã thử co giãn khách cũ nhưng thất bại)" };
        }
    } // End Loop NewGuests

    // ------------------------------------------------------------------------
    // BƯỚC D: KẾT QUẢ CUỐI CÙNG
    // ------------------------------------------------------------------------

    // Check tổng
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 5, currentTimeline)) {
        return { feasible: false, reason: "Quá tải tổng số khách (Max 12)" };
    }

    finalDetails.sort((a,b) => a.guestIndex - b.guestIndex);

    return {
        feasible: true,
        strategy: 'ELASTIC_ANCHOR_V7',
        details: finalDetails,
        proposedUpdates: proposedUpdates, // Danh sách khách cũ cần update (Server sẽ xử lý)
        totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0)
    };
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
    console.log("✅ Resource Core V7.0: Elastic Anchor & Smart Squeeze Active.");
}
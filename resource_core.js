/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V7.5 (HYBRID INTERLEAVING & ELASTIC ANCHOR)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/12
 *
 * * * * * CHANGE LOG V7.5 (THE HYBRID UPGRADE):
 * 1. [RESOURCE INTERLEAVING]:
 * - Giải quyết bài toán "Tắc nghẽn cục bộ" (Ví dụ: Có 2 ghế, 4 giường nhưng khách đông đòi làm chân hết).
 * - Hệ thống tự động thử nghiệm các tổ hợp quy trình (Permutations):
 * + Kịch bản A: Tất cả làm Chân -> Body (FB).
 * + Kịch bản B: Một số làm Body -> Chân (BF) để lấp vào chỗ trống của giường.
 * * 2. [HIERARCHY STRATEGY]:
 * - Ưu tiên 1: Interleaving (Đan xen) với thời gian chuẩn.
 * - Ưu tiên 2: Smart Squeeze (Bóp thời gian khách cũ) nếu Đan xen vẫn không vừa.
 * * 3. [LEGACY PRESERVATION]:
 * - Giữ nguyên toàn bộ logic Elastic Anchor & Smart Squeeze của V7.0.
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
    // console.log(`[CORE V7.5] Services Updated: ${Object.keys(SERVICES).length} entries.`);
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
    points.push({ time: start, type: 'check_start' });
    points.push({ time: end, type: 'check_end' });

    relevantBookings.forEach(bk => {
        points.push({ time: bk.start, type: 'start' });
        points.push({ time: bk.end, type: 'end' });
    });

    // Sắp xếp sự kiện theo thời gian
    points.sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        // Priority: StartBooking > CheckStart > CheckEnd > EndBooking
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
        
        // 2. Kiểm tra giờ làm việc
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

        // 3. Kiểm tra trùng lịch
        for (const b of busyList) {
            if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
        }

        // 4. Kiểm tra giới tính
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
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
        return [{ 
            p1: parseInt(customLockedPhase1), 
            p2: totalDuration - parseInt(customLockedPhase1), 
            deviation: 999 
        }];
    }

    const standardHalf = Math.floor(totalDuration / 2);
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
    // Sắp xếp theo độ lệch tăng dần (Ưu tiên ít biến đổi nhất)
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
}

// ============================================================================
// PHẦN 6: CORE ENGINE V7.5 (HYBRID INTERLEAVING + SMART SQUEEZE)
// ============================================================================

/**
 * Hàm kiểm tra khả dụng chính
 * V7.5 Strategy: 
 * 1. Hard/Soft Classification (Phân loại khách cũ).
 * 2. Permutation Loop (Vòng lặp hoán vị): Thử các tỉ lệ FB/BF khác nhau cho nhóm khách mới.
 * 3. Smart Squeeze (Bóp khách cũ): Được gọi bên trong mỗi kịch bản nếu tài nguyên bị thiếu.
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: PHÂN LOẠI DỮ LIỆU CŨ (HARD vs SOFT)
    // ------------------------------------------------------------------------
    
    let hardBookings = [];      
    let softBookings = [];      
    
    currentBookingsRaw.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO' || b.serviceName.includes('Combo') || b.serviceName.includes('套餐');
        let duration = b.duration || 60;
        
        // [ELASTIC ANCHOR]: Xác định khách nào có thể "bóp" được
        const isElasticCandidate = isCombo && (b.isManualLocked !== true) && (b.status !== 'Running');

        if (isElasticCandidate) {
            softBookings.push({
                id: b.rowId,
                originalData: b,
                staffName: b.staffName,
                serviceName: b.serviceName,
                duration: duration,
                startMins: bStart, 
                elasticStep: svcInfo.elasticStep || 5,
                elasticLimit: svcInfo.elasticLimit || 15,
                currentPhase1: b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration/2)
            });
        } else {
            // Hard Bookings: Cố định vị trí
            if (isCombo) {
                let p1 = Math.floor(duration / 2);
                if (b.phase1_duration) p1 = parseInt(b.phase1_duration);
                // Mặc định khách cũ coi như đang chạy FB nếu không có chỉ định khác (để đơn giản)
                const p1End = bStart + p1;
                const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                
                hardBookings.push({ start: bStart, end: p1End, resourceType: 'CHAIR', staffName: b.staffName, ownerId: b.rowId });
                hardBookings.push({ start: p2Start, end: bStart + duration, resourceType: 'BED', staffName: b.staffName, ownerId: b.rowId });
            } else {
                let rType = svcInfo.type || 'CHAIR';
                if (b.serviceName.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
                hardBookings.push({ start: bStart, end: bStart + duration, resourceType: rType, staffName: b.staffName, ownerId: b.rowId });
            }
        }
    });

    // ------------------------------------------------------------------------
    // BƯỚC B: TIMELINE CƠ SỞ (BASELINE)
    // ------------------------------------------------------------------------
    
    // Xây dựng timeline với khách Soft ở trạng thái mặc định
    let baselineTimeline = [...hardBookings];
    softBookings.forEach(soft => {
        const p1 = soft.currentPhase1;
        const p2 = soft.duration - p1;
        const tStart = soft.startMins;
        const p1End = tStart + p1;
        const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
        
        baselineTimeline.push({ 
            start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, 
            resourceType: 'CHAIR', staffName: soft.staffName, 
            isSoft: true, softId: soft.id 
        });
        baselineTimeline.push({ 
            start: p2Start, end: p2Start + p2 + CONFIG.CLEANUP_BUFFER, 
            resourceType: 'BED', staffName: soft.staffName, 
            isSoft: true, softId: soft.id 
        });
    });

    // ------------------------------------------------------------------------
    // BƯỚC C: VÒNG LẶP HOÁN VỊ (PERMUTATION LOOP - THE V7.5 UPGRADE)
    // ------------------------------------------------------------------------

    // Sắp xếp khách mới
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    
    // Xác định số lượng khách có thể Interleave (Chỉ Combo mới đảo chiều được)
    // Để đơn giản, ta chỉ đảo chiều các khách chọn Combo. Khách Single giữ nguyên.
    const comboGuests = newGuests.filter(g => {
        const s = SERVICES[g.serviceCode];
        return s && s.category === 'COMBO';
    });
    
    // Nếu không có khách combo hoặc ít hơn 2 khách, chỉ chạy kịch bản mặc định (0 BF)
    // Nhưng để nhất quán, ta cứ chạy loop.
    // Loop: i là số lượng khách Combo sẽ làm Body First (BF).
    // i chạy từ 0 đến comboGuests.length.
    
    const maxBF = comboGuests.length;
    // Thứ tự ưu tiên: Ưu tiên ít đảo lộn nhất (0 BF) -> tăng dần số lượng BF
    let successfulScenario = null;

    for (let numBF = 0; numBF <= maxBF; numBF++) {
        
        // --- CẤU HÌNH KỊCH BẢN (SCENARIO SETUP) ---
        // Trong kịch bản này: 'numBF' khách Combo đầu tiên sẽ làm Body trước.
        // Những khách còn lại làm Foot trước (FB).
        
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioTimeline = [...baselineTimeline]; // Bắt đầu từ baseline
        let scenarioFailed = false;

        // Clone soft bookings để track trạng thái squeeze trong kịch bản này
        let scenarioSofts = [...softBookings]; 
        let softConflictIds = new Set(); 

        // 1. Tạo Blocks cho từng khách mới dựa trên Flow của kịch bản
        let newGuestBlocksMap = []; // Lưu blocks của từng khách để check staff sau

        for (const ng of newGuests) {
            const svc = SERVICES[ng.serviceCode];
            if (!svc) continue;

            // Xác định Flow: FB hay BF?
            let flow = 'FB'; // Mặc định
            if (svc.category === 'COMBO') {
                // Kiểm tra xem khách này có nằm trong nhóm BF của kịch bản không
                // Lấy index trong mảng comboGuests
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                if (cIdx < numBF) {
                    flow = 'BF'; // Interleaving: Đảo chiều
                }
            }

            // Tính toán khung thời gian (Blocks)
            // Với khách mới, ta dùng Standard Duration (chưa squeeze khách mới vội)
            const duration = svc.duration;
            let blocks = [];
            
            if (svc.category === 'COMBO') {
                const p1Standard = Math.floor(duration / 2);
                const p2Standard = duration - p1Standard;

                if (flow === 'FB') {
                    // Foot -> Body
                    const t1End = requestStartMins + p1Standard;
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                    blocks.push({ start: t2Start, end: t2Start + p2Standard + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    
                    scenarioDetails.push({
                        guestIndex: ng.idx, service: svc.name, price: svc.price,
                        phase1_duration: p1Standard, phase2_duration: p2Standard,
                        flow: 'FB', timeStr: timeStr
                    });

                } else {
                    // Body -> Foot (BF)
                    // P2 (Body) làm trước, P1 (Foot) làm sau
                    const t1End = requestStartMins + p2Standard; // Body time
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    
                    // Lưu ý: Resource Type đảo ngược theo flow
                    blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    blocks.push({ start: t2Start, end: t2Start + p1Standard + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });

                    scenarioDetails.push({
                        guestIndex: ng.idx, service: svc.name, price: svc.price,
                        phase1_duration: p1Standard, phase2_duration: p2Standard,
                        flow: 'BF', timeStr: timeStr // Đánh dấu flow để UI biết
                    });
                }
            } else {
                // Single Service
                let rType = svc.type || 'CHAIR';
                if (svc.name.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
                blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONFIG.CLEANUP_BUFFER, type: rType });
                
                scenarioDetails.push({
                    guestIndex: ng.idx, service: svc.name, price: svc.price,
                    flow: 'SINGLE', timeStr: timeStr
                });
            }

            newGuestBlocksMap.push({ guest: ng, blocks: blocks });
        }

        // 2. Kiểm tra va chạm tài nguyên (Resource Conflict Check)
        // Duyệt qua tất cả các blocks của TẤT CẢ khách mới trong kịch bản này
        let allNewBlocks = [];
        newGuestBlocksMap.forEach(item => allNewBlocks.push(...item.blocks));

        let hardConflict = false;
        
        // Check từng block mới với Scenario Timeline
        for (const block of allNewBlocks) {
            if (!checkResourceCapacity(block.type, block.start, block.end, scenarioTimeline)) {
                // Có va chạm. Phân tích va chạm.
                const blockers = scenarioTimeline.filter(existing => 
                    existing.resourceType === block.type && 
                    isOverlap(block.start, block.end, existing.start, existing.end)
                );

                const hardLoad = blockers.filter(b => !b.isSoft).length;
                const softBlockers = blockers.filter(b => b.isSoft);
                
                let limit = (block.type === 'BED') ? CONFIG.MAX_BEDS : CONFIG.MAX_CHAIRS;

                if (hardLoad >= limit) {
                    hardConflict = true; // Va Hard -> Kịch bản này hỏng ngay
                    break;
                }
                
                // Va Soft -> Ghi nhận để lát nữa Squeeze
                softBlockers.forEach(sb => softConflictIds.add(sb.softId));
            }
        }

        if (hardConflict) {
            scenarioFailed = true; // Kịch bản này không khả thi do vướng Hard Booking
            continue; // Thử kịch bản tiếp theo (numBF + 1)
        }

        // 3. Xử lý Soft Conflicts (SMART SQUEEZE WITHIN SCENARIO)
        if (softConflictIds.size > 0) {
            // Chúng ta cần bóp các ông Soft bị va chạm để nhường chỗ cho kịch bản hiện tại
            let squeezeSuccess = true;
            
            // Tạo timeline tạm (bỏ các soft đang bị va chạm ra)
            let trialTimeline = scenarioTimeline.filter(b => !Array.from(softConflictIds).includes(b.softId));

            for (const softId of softConflictIds) {
                const softBooking = softBookings.find(s => s.id === softId);
                if (!softBooking) { squeezeSuccess = false; break; }

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

                    // Check 1: Soft mới vs TrialTimeline (Hard + Other Softs)
                    let sFitTrial = true;
                    for(const sb of softBlocks) {
                        if(!checkResourceCapacity(sb.resourceType, sb.start, sb.end, trialTimeline)) sFitTrial = false;
                    }
                    if(!sFitTrial) continue;

                    // Check 2: Soft mới vs ALL New Blocks của kịch bản này
                    let sFitNewGuest = true;
                    const tempTimelineWithNewSoft = [...trialTimeline, ...softBlocks];
                    for(const nb of allNewBlocks) {
                         if(!checkResourceCapacity(nb.type, nb.start, nb.end, tempTimelineWithNewSoft)) sFitNewGuest = false;
                    }

                    if (sFitNewGuest) {
                        foundFitForSoft = true;
                        trialTimeline.push(...softBlocks); // Cập nhật soft đã bóp vào
                        if (sSplit.deviation !== 0) {
                            scenarioUpdates.push({
                                rowId: softId,
                                customerName: softBooking.originalData.customerName,
                                newPhase1: sSplit.p1,
                                newPhase2: sSplit.p2,
                                reason: 'Squeezed for Interleaving'
                            });
                        }
                        break; 
                    }
                }
                if (!foundFitForSoft) { squeezeSuccess = false; break; }
            }

            if (!squeezeSuccess) {
                scenarioFailed = true; // Squeeze thất bại
                continue; // Next scenario
            } else {
                scenarioTimeline = trialTimeline; // Squeeze thành công -> Cập nhật timeline
            }
        }

        // 4. Kiểm tra Staff (Bước cuối cùng của kịch bản)
        // Timeline lúc này đã sạch (Hard + Squeezed Softs). Giờ check Staff cho từng Guest.
        // Ta cần add blocks của các guest đã assign staff vào timeline để check guest tiếp theo
        
        let staffAssignmentSuccess = true;
        let finalTimelineForStaffCheck = [...scenarioTimeline];

        for (const item of newGuestBlocksMap) {
            // Temporary add blocks to timeline as 'BUSY' just for resource check? 
            // Staff check needs specific resource timeline? 
            // findAvailableStaff needs to know if the staff is busy. Staff busy check relies on `busyList`.
            // `busyList` in findAvailableStaff is usually the timeline.
            
            // Add other new guests' blocks (allocated so far) to timeline?
            // Yes, we accumulate blocks.
            
            const guest = item.guest;
            const assignedStaff = findAvailableStaff(
                guest.staffName, 
                item.blocks[0].start, 
                item.blocks[item.blocks.length-1].end, // End time of last block
                staffList, 
                finalTimelineForStaffCheck
            );

            if (!assignedStaff) {
                staffAssignmentSuccess = false;
                break;
            }

            // Gán Staff thành công -> Update Details
            const detail = scenarioDetails.find(d => d.guestIndex === guest.idx);
            if (detail) detail.staff = assignedStaff;

            // Add blocks to finalTimeline for next iteration
            item.blocks.forEach(b => finalTimelineForStaffCheck.push({ ...b, staffName: assignedStaff }));
        }

        if (!staffAssignmentSuccess) {
            scenarioFailed = true;
            continue;
        }

        // 5. Kiểm tra tổng thể (Total Guests Limit)
        if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 5, finalTimelineForStaffCheck)) {
             scenarioFailed = true;
             continue;
        }

        // --- SUCCESS FOUND! ---
        // Nếu chạy đến đây nghĩa là Kịch bản này (Interleaving + Squeeze) thành công.
        // Dừng luôn không cần thử kịch bản khác (vì ta ưu tiên numBF nhỏ nhất có thể).
        successfulScenario = {
            details: scenarioDetails,
            updates: scenarioUpdates,
            timeline: finalTimelineForStaffCheck
        };
        break; // BREAK LOOP
    }

    // ------------------------------------------------------------------------
    // BƯỚC D: KẾT QUẢ CUỐI CÙNG
    // ------------------------------------------------------------------------

    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true,
            strategy: 'HYBRID_INTERLEAVING_V7.5',
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
        };
    } else {
        return { 
            feasible: false, 
            reason: "Hết chỗ (Đã thử đan xen & co giãn nhưng vẫn quá tải)" 
        };
    }
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
    console.log("✅ Resource Core V7.5: Hybrid Interleaving & Elastic Anchor Active.");
}
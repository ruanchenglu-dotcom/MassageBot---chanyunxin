/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V6.0 (GLOBAL OPTIMIZATION & MANUAL LOCK INTEGRATION)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/12
 *
 * * * * * CHANGE LOG V6.0 (THE BRAIN UPGRADE):
 * 1. [GLOBAL OPTIMIZATION]: 
 * - Không còn coi khách cũ là "Đá tảng" (Hard Block) mặc định.
 * - Khách cũ chưa làm + chưa khóa (isManualLocked=false) sẽ được coi là "Đất sét" (Elastic).
 * - Thuật toán sẽ thử co giãn khách cũ để nhường chỗ cho khách mới.
 * 2. [MANUAL LOCK RESPECT]:
 * - Tôn trọng tuyệt đối cờ 'isManualLocked' từ Giai đoạn 2.
 * - Nếu khách đã sửa tay, thuật toán giữ nguyên Phase 1, không tự ý thay đổi.
 * 3. [PROPOSED CHANGES]:
 * - Trả về danh sách các thay đổi cần áp dụng cho cả khách cũ (Update) và khách mới (Create).
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
    console.log(`[CORE V6.0] Services Database Updated: ${Object.keys(SERVICES).length} entries (Global Optimization Ready).`);
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
// PHẦN 3: LOGIC KIỂM TRA TÀI NGUYÊN (CAPACITY CHECK - LINE SWEEP)
// ============================================================================

function checkResourceCapacity(resourceType, start, end, bookings) {
    let limit = 0;
    if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
    else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
    else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
    else return true; 

    let relevantBookings = bookings.filter(bk => {
        let isTypeMatch = (resourceType === 'TOTAL') ? true : (bk.resourceType === resourceType);
        return isTypeMatch && isOverlap(start, end, bk.start, bk.end);
    });

    if (relevantBookings.length === 0) return true;

    let points = [];
    points.push({ time: start, type: 'check_start' });
    points.push({ time: end, type: 'check_end' });

    relevantBookings.forEach(bk => {
        points.push({ time: bk.start, type: 'start' });
        points.push({ time: bk.end, type: 'end' });
    });

    points.sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        const priority = { 'start': 1, 'check_start': 2, 'check_end': 3, 'end': 4 };
        return priority[a.type] - priority[b.type];
    });

    let currentLoad = 0;
    for (const p of points) {
        if (p.type === 'start') currentLoad++;
        else if (p.type === 'end') currentLoad--;
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

/**
 * Sinh ra các tùy chọn co giãn (Phase 1 / Phase 2)
 * V6.0: Đã tích hợp Custom Phase 1 (Manual Lock)
 */
function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
    // Nếu đã bị khóa cứng (Manual Lock), chỉ trả về đúng 1 phương án
    if (customLockedPhase1 !== null && customLockedPhase1 !== undefined) {
        return [{ 
            p1: parseInt(customLockedPhase1), 
            p2: totalDuration - parseInt(customLockedPhase1), 
            deviation: 999 // Đánh dấu là Locked
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

    // Sắp xếp: Ưu tiên gần chuẩn nhất (Deviation thấp nhất)
    options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
    return options;
}

// ============================================================================
// PHẦN 6: BỘ XỬ LÝ TRUNG TÂM - GLOBAL OPTIMIZER (V6.0 LOGIC)
// ============================================================================

function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ========================================================================
    // BƯỚC A: PHÂN LOẠI "ĐÁ TẢNG" (HARD) VÀ "ĐẤT SÉT" (SOFT)
    // ========================================================================
    
    let hardBookings = [];      // Danh sách booking không thể thay đổi
    let optimizationQueue = []; // Danh sách cần sắp xếp (bao gồm khách cũ Soft + khách mới)
    
    // --- 1. Xử lý khách cũ (Existing Bookings) ---
    currentBookingsRaw.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO' || b.serviceName.includes('Combo') || b.serviceName.includes('套餐');
        let duration = b.duration || 60;

        // Kiểm tra điều kiện "Đất Sét" (Elastic Candidate)
        // 1. Phải là Combo
        // 2. Chưa bắt đầu (Start > Now) - Ở đây dùng mốc tương đối, thực tế có thể check thêm time
        // 3. Chưa bị khóa tay (isManualLocked !== true)
        // 4. Không phải là booking đang chạy (Running)
        
        // Trong context checkAvailability, ta giả định mọi booking chưa diễn ra trong tương lai đều có thể tối ưu
        // Tuy nhiên, để an toàn, ta chỉ tối ưu các booking bắt đầu sau thời điểm hiện tại 1 chút
        // Đơn giản hóa cho V6: Chỉ tối ưu nếu isManualLocked = false
        
        const isCandidateForOptimization = isCombo && (b.isManualLocked !== true) && (b.status !== 'Running');

        if (isCandidateForOptimization) {
            // [OPTIMIZATION]: Đưa vào hàng đợi tối ưu lại
            // Chúng ta giữ nguyên Staff và StartTime của khách cũ, chỉ co giãn Phase Duration
            optimizationQueue.push({
                type: 'EXISTING',
                originalData: b,
                id: b.rowId, // Định danh
                staffReq: b.staffName, // Giữ nguyên Staff cũ
                serviceName: b.serviceName,
                duration: duration,
                startMins: bStart, // Giờ bắt đầu CỐ ĐỊNH
                elasticStep: svcInfo.elasticStep || 5, // Lấy từ cấu hình dịch vụ
                elasticLimit: svcInfo.elasticLimit || 15
            });
        } else {
            // [HARD BLOCK]: Giữ nguyên như cũ (Tách phase nếu là combo để giải phóng giường)
            if (isCombo) {
                // Logic tách cứng (Hard Split) dựa trên dữ liệu hiện có
                let p1 = duration / 2;
                // Nếu đã có thông số phase1 lưu trong DB (dù lock hay ko), dùng nó
                if (b.phase1_duration) p1 = parseInt(b.phase1_duration);
                
                const p1End = bStart + p1;
                const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                
                // Phase 1 (Chair)
                hardBookings.push({ start: bStart, end: p1End, resourceType: 'CHAIR', staffName: b.staffName });
                // Phase 2 (Bed)
                hardBookings.push({ start: p2Start, end: bStart + duration, resourceType: 'BED', staffName: b.staffName });
            } else {
                // Single
                let rType = svcInfo.type || 'CHAIR';
                if (b.serviceName.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
                hardBookings.push({ start: bStart, end: bStart + duration, resourceType: rType, staffName: b.staffName });
            }
        }
    });

    // --- 2. Xử lý khách mới (New Request) ---
    guestList.forEach((g, index) => {
        const svc = SERVICES[g.serviceCode];
        if (!svc) return;
        
        optimizationQueue.push({
            type: 'NEW',
            id: `new_${index}`,
            staffReq: g.staffName,
            serviceName: svc.name,
            duration: svc.duration,
            price: svc.price,
            resourceType: svc.type,
            category: svc.category,
            startMins: requestStartMins, // Giờ bắt đầu theo yêu cầu
            elasticStep: svc.elasticStep || 0,
            elasticLimit: svc.elasticLimit || 0
        });
    });

    // ========================================================================
    // BƯỚC B: GIẢI QUYẾT HÀNG ĐỢI (GREEDY OPTIMIZATION LOOP)
    // ========================================================================
    
    // Sắp xếp hàng đợi: Ưu tiên khách cũ trước (để giữ chỗ cho họ), sau đó đến khách mới
    // Hoặc sắp xếp theo thời gian bắt đầu
    optimizationQueue.sort((a, b) => {
        if (a.type === 'EXISTING' && b.type === 'NEW') return -1;
        if (a.type === 'NEW' && b.type === 'EXISTING') return 1;
        return a.startMins - b.startMins;
    });

    let currentTimeline = [...hardBookings];
    let finalDetails = []; // Kết quả cho khách mới
    let proposedUpdates = []; // Kết quả update cho khách cũ

    for (const item of optimizationQueue) {
        let isFitted = false;
        
        // 1. Nếu là SINGLE (Chỉ khách mới mới có Single trong hàng đợi này, vì khách cũ Single đã vào HardBookings)
        if (item.category !== 'COMBO' && !item.serviceName.includes('套餐')) {
            const start = item.startMins;
            const end = start + item.duration + CONFIG.CLEANUP_BUFFER;
            
            if (checkResourceCapacity(item.resourceType, start, end, currentTimeline)) {
                // Tìm staff
                const staff = findAvailableStaff(item.staffReq, start, end, staffList, currentTimeline);
                if (staff) {
                    currentTimeline.push({ start, end, resourceType: item.resourceType, staffName: staff });
                    if (item.type === 'NEW') {
                        finalDetails.push({
                            guestIndex: parseInt(item.id.replace('new_', '')),
                            staff: staff,
                            service: item.serviceName,
                            price: item.price,
                            timeStr: `${getTimeStrFromMins(item.startMins)} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
                        });
                    }
                    isFitted = true;
                }
            }
        } 
        // 2. Nếu là COMBO (Cả cũ và mới)
        else {
            // Sinh ra các phương án co giãn
            // Với khách cũ, nếu có phase1_duration nhưng chưa lock, ta vẫn dùng nó làm gốc tham chiếu hoặc reset?
            // Ở đây ta dùng thuật toán sinh mới hoàn toàn dựa trên Duration gốc.
            const splits = generateElasticSplits(item.duration, item.elasticStep, item.elasticLimit);
            
            for (const split of splits) {
                // Thử cả 2 chiều FB và BF (Chỉ áp dụng cho khách mới, khách cũ thường giữ nguyên sequence để đỡ phiền)
                // Tuy nhiên để tối ưu Global, ta có thể đảo chiều khách cũ nếu cần? 
                // V6.0 Safe: Khách cũ giữ nguyên chiều (Mặc định FB), Khách mới thử cả hai.
                
                let modes = ['FB', 'BF'];
                // Nếu là khách cũ, lấy sequence từ booking gốc (nếu có) hoặc mặc định FB
                if (item.type === 'EXISTING') {
                    // Logic check sequence khách cũ phức tạp, tạm default FB cho an toàn
                     modes = ['FB']; 
                }

                for (const mode of modes) {
                    const p1Res = (mode === 'FB') ? 'CHAIR' : 'BED';
                    const p2Res = (mode === 'FB') ? 'BED' : 'CHAIR';
                    
                    const tStart = item.startMins;
                    const p1End = tStart + split.p1;
                    const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                    const p2End = p2Start + split.p2;
                    const fullEnd = p2End + CONFIG.CLEANUP_BUFFER;

                    // Check Resource Phase 1
                    if (!checkResourceCapacity(p1Res, tStart, p1End + CONFIG.CLEANUP_BUFFER, currentTimeline)) continue;
                    
                    // Temp Timeline check Phase 2
                    let tempTimeline = [...currentTimeline, { start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: 'TEMP' }];
                    if (!checkResourceCapacity(p2Res, p2Start, fullEnd, tempTimeline)) continue;

                    // Check Staff
                    // Nếu khách cũ, bắt buộc dùng staff cũ
                    let assignedStaff = null;
                    if (item.type === 'EXISTING') {
                        // Check xem staff cũ có rảnh theo giờ mới không (thường là rảnh vì ta chỉ bóp giờ, nhưng cần check overlap với hard bookings khác)
                         if (findAvailableStaff(item.staffReq, tStart, fullEnd, staffList, currentTimeline) === item.staffReq) {
                             assignedStaff = item.staffReq;
                         }
                    } else {
                        assignedStaff = findAvailableStaff(item.staffReq, tStart, fullEnd, staffList, currentTimeline);
                    }

                    if (assignedStaff) {
                        // Success! Commit to timeline
                        currentTimeline.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: assignedStaff });
                        currentTimeline.push({ start: p2Start, end: fullEnd, resourceType: p2Res, staffName: assignedStaff });

                        // Ghi nhận kết quả
                        if (item.type === 'NEW') {
                            finalDetails.push({
                                guestIndex: parseInt(item.id.replace('new_', '')),
                                staff: assignedStaff,
                                service: item.serviceName,
                                price: item.price,
                                phase1_duration: split.p1,
                                phase2_duration: split.p2,
                                breakdown: `(足:${split.p1} → 身:${split.p2})`,
                                is_elastic: split.deviation !== 0,
                                mode: mode,
                                timeStr: `${getTimeStrFromMins(tStart)} - ${getTimeStrFromMins(p2End)}`
                            });
                        } else {
                            // Khách cũ: Ghi nhận cần Update nếu thời gian khác chuẩn
                            // Nếu deviation != 0, nghĩa là đã co giãn -> Cần báo Backend update
                            if (split.deviation !== 0) {
                                proposedUpdates.push({
                                    rowId: item.id,
                                    customerName: item.originalData.customerName, // Để hiển thị log
                                    newPhase1: split.p1,
                                    newPhase2: split.p2,
                                    reason: 'Global Optimization'
                                });
                            }
                        }
                        isFitted = true;
                        break; // Thoát vòng lặp Mode
                    }
                }
                if (isFitted) break; // Thoát vòng lặp Split
            }
        }
        
        if (!isFitted) {
            // Nếu khách cũ mà không xếp lại được (vô lý vì nó đã ở đó), 
            // có thể do khách mới chen vào trước làm hết chỗ?
            // Với logic sort EXISTING lên đầu, khách cũ luôn được ưu tiên giữ chỗ.
            // Nếu khách mới không xếp được -> Fail.
            if (item.type === 'NEW') {
                return { feasible: false, reason: `Không tìm được chỗ cho khách mới (Elastic Failed)` };
            } else {
                // Khách cũ bị lỗi -> Critical Error (Không nên xảy ra)
                console.error("CRITICAL: Existing booking pushed out by optimization!", item);
                // Fallback: Force add hard booking cũ vào để không mất dữ liệu hiển thị?
                // Ở đây ta return fail để an toàn
                return { feasible: false, reason: "Lỗi hệ thống: Xung đột dữ liệu khách cũ." };
            }
        }
    }

    // ========================================================================
    // BƯỚC C: KẾT QUẢ CUỐI CÙNG
    // ========================================================================
    
    // Check tổng một lần nữa
    if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 5, currentTimeline)) {
        return { feasible: false, reason: "Quá tải tổng số khách (Max 12)" };
    }

    // Sort lại details theo index
    finalDetails.sort((a,b) => a.guestIndex - b.guestIndex);

    return {
        feasible: true,
        strategy: 'GLOBAL_ELASTIC_V6',
        details: finalDetails,
        proposedUpdates: proposedUpdates, // [NEW] Danh sách khách cũ cần update
        totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0)
    };
}

// ============================================================================
// PHẦN 7: MODULE EXPORT
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
    console.log("✅ Resource Core V6.0: Global Optimization Active.");
}
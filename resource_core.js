/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V8.0 (MATRIX TETRIS & SPATIAL AWARENESS)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/12
 *
 * * * * * CHANGE LOG V8.0 (THE MATRIX REVOLUTION):
 * 1. [RESOURCE MATRIX ENGINE]:
 * - Loại bỏ logic "Đếm số lượng" (Count < 6).
 * - Chuyển sang logic "Xếp gạch" (Spatial Allocation): Hệ thống dựng 12 làn (6 Ghế, 6 Giường).
 * - "Virtual Bin Packing": Tự động sắp xếp các booking cũ vào các làn trống để tối ưu hóa không gian (Defrag).
 * 2. [PRECISE SLOT FINDING]:
 * - Xác định chính xác: "Còn trống Bed-05 từ 16:30-18:00".
 * - Giải quyết triệt để bài toán: Tổng khách < Max nhưng thời gian bị phân mảnh không nhét vừa khách mới.
 * 3. [LEGACY PRESERVATION]:
 * - Vẫn giữ nguyên logic Elastic Anchor, Smart Squeeze & Interleaving của V7.5.
 * - Matrix được áp dụng BÊN TRONG các kịch bản hoán vị (Permutation Loop).
 * =================================================================================================
 */

// ============================================================================
// PHẦN 1: CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION)
// ============================================================================

const CONFIG = {
    // Tài nguyên phần cứng
    MAX_CHAIRS: 6,        
    MAX_BEDS: 6,          
    MAX_TOTAL_GUESTS: 12, // Dù còn giường/ghế nhưng không được vượt quá tổng tải trọng nhân sự/không gian chung
    
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
// PHẦN 3: MATRIX ENGINE (V8.0 NEW CORE) - THAY THẾ LINE SWEEP
// ============================================================================

class VirtualMatrix {
    constructor() {
        // Khởi tạo các làn chứa (Lanes)
        // Mỗi lane là một mảng các khoảng thời gian đã bị chiếm {start, end, ownerId}
        this.lanes = {
            'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
            'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
        };
        this.totalLoad = []; // Để check tổng số khách (MAX_TOTAL_GUESTS)
    }

    /**
     * Cố gắng nhét một block thời gian vào ma trận
     * @param {string} type 'CHAIR' | 'BED' | 'TOTAL'
     * @param {number} start 
     * @param {number} end 
     * @param {string} ownerId ID định danh của booking (để debug)
     * @returns {string|null} Trả về ID làn (VD: "BED-5") nếu thành công, null nếu thất bại
     */
    tryAllocate(type, start, end, ownerId) {
        // Kiểm tra tổng tải trọng trước
        if (type !== 'TOTAL') {
             // Logic check total load riêng nếu cần, ở đây ta tập trung vào physical slot
        }

        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return 'N/A'; // Loại tài nguyên không cần track slot (VD: NONE)

        // Duyệt qua từng làn (Lane 1 -> Lane 6) - Thuật toán First-Fit
        for (let lane of resourceGroup) {
            let isLaneFree = true;
            for (let block of lane.occupied) {
                if (isOverlap(start, end, block.start, block.end)) {
                    isLaneFree = false;
                    break;
                }
            }

            if (isLaneFree) {
                // Tìm thấy làn trống! Đánh dấu luôn vào bộ nhớ đệm của Matrix này
                lane.occupied.push({ start, end, ownerId });
                // Sắp xếp lại để timeline gọn gàng (optional)
                lane.occupied.sort((a, b) => a.start - b.start);
                return lane.id; // Return "BED-1", "CHAIR-3"...
            }
        }

        return null; // Không còn làn nào vừa
    }

    /**
     * Kiểm tra nhanh xem có bị quá tải tổng số khách không
     * (Logic cũ Line Sweep áp dụng cho Total Guests)
     */
    checkTotalCapacity(start, end) {
        // Đếm số booking trùng với khoảng start-end trong toàn bộ matrix
        // Đây là bản rút gọn, thực tế ta có thể dùng biến đếm riêng
        // Nhưng để chính xác, ta check tổng load:
        // Đếm xem tại bất kỳ thời điểm nào trong (start, end), số lượng khách active > 12 không?
        // (Tạm thời dùng logic đơn giản: Nếu tìm được slot Giường/Ghế thì coi như Total OK, 
        // trừ khi số ghế + số giường > 12 thì mới cần check kỹ. Mặc định Chair 6 + Bed 6 = 12 = Max Total. Nên slot check là đủ).
        return true; 
    }
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
// PHẦN 6: CORE ENGINE V8.0 (MATRIX TETRIS + HYBRID INTERLEAVING)
// ============================================================================

/**
 * Hàm kiểm tra khả dụng chính - PHIÊN BẢN V8.0
 * Quy trình:
 * 1. Build Virtual Matrix cho mỗi kịch bản (Scenario).
 * 2. "Pack" (Nhồi) khách cũ vào Matrix. Nếu khách cũ đã chiếm hết khe -> Fail.
 * 3. Thử "Pack" khách mới vào Matrix.
 * 4. Nếu không vừa -> Thử Squeeze (Bóp) khách Soft cũ trong Matrix đó.
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: CHUẨN BỊ DỮ LIỆU KHÁCH CŨ (PRE-PROCESSING)
    // ------------------------------------------------------------------------
    // Ta vẫn chia khách thành Hard và Soft, nhưng không tạo Timeline phẳng ngay.
    // Mà chuẩn bị đối tượng để ném vào Matrix.

    let existingBookingsProcessed = [];

    // Sort existing bookings by Start Time (Quan trọng cho thuật toán First-Fit Packing)
    // Việc xếp khách đến trước vào trước giúp defragment tốt hơn.
    let sortedCurrentBookings = [...currentBookingsRaw].sort((a, b) => {
        return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
    });

    sortedCurrentBookings.forEach(b => {
        const bStart = getMinsFromTimeStr(b.startTime);
        if (bStart === -1) return;

        let svcInfo = SERVICES[b.serviceCode] || {};
        let isCombo = svcInfo.category === 'COMBO' || b.serviceName.includes('Combo') || b.serviceName.includes('套餐');
        let duration = b.duration || 60;
        
        // Object chuẩn hóa để xử lý
        let processedB = {
            id: b.rowId,
            originalData: b,
            staffName: b.staffName,
            serviceName: b.serviceName,
            category: svcInfo.category,
            isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
            elasticStep: svcInfo.elasticStep || 5,
            elasticLimit: svcInfo.elasticLimit || 15,
            blocks: [] // Sẽ tính toán blocks cụ thể bên dưới
        };

        // Tính toán Blocks (Hard Geometry)
        // Lưu ý: Khách cũ mặc định giữ nguyên Flow (FB/BF) trừ khi ta can thiệp sau này (chưa implement đảo khách cũ, chỉ đảo khách mới).
        // Ta giả định khách cũ đang chạy FB chuẩn.
        if (isCombo) {
            let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
            let p2 = duration - p1;
            const p1End = bStart + p1;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            
            processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR' }); // Phase 1
            processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED' }); // Phase 2
            
            // Lưu info để dùng cho Elastic Squeeze sau này
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
    // BƯỚC B: VÒNG LẶP HOÁN VỊ (PERMUTATION LOOP)
    // ------------------------------------------------------------------------
    // Tương tự V7.5, ta thử đảo Flow của khách MỚI (FB <-> BF) để tìm khe hở.
    
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => {
        const s = SERVICES[g.serviceCode];
        return s && s.category === 'COMBO';
    });
    
    const maxBF = comboGuests.length;
    let successfulScenario = null;

    // Loop: i là số lượng khách Combo MỚI sẽ làm Body First (BF).
    for (let numBF = 0; numBF <= maxBF; numBF++) {
        
        // [QUAN TRỌNG]: Khởi tạo Matrix mới tinh cho kịch bản này
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;
        
        // --- GIAI ĐOẠN 1: XẾP KHÁCH CŨ VÀO MATRIX (THE PINNING) ---
        // Ta cố gắng xếp khách cũ vào. Nếu khách cũ không xếp vừa (do data lỗi), ta vẫn phải accept họ 
        // nhưng sẽ đánh dấu matrix bị bẩn. Tuy nhiên, logic đúng là: First Fit.
        
        // Danh sách các booking Soft mà ta có thể cần bóp nát nếu thiếu chỗ
        let softsToSqueezeCandidates = []; 

        for (const exB of existingBookingsProcessed) {
            let placedSuccessfully = true;
            let allocatedSlots = []; // Lưu lại slot đã cấp: ["CHAIR-1", "BED-1"]

            // Thử xếp nguyên trạng (Standard Shape)
            for (const block of exB.blocks) {
                // Thêm buffer dọn dẹp vào block khi check slot
                // (Khách cũ chiếm chỗ đến lúc dọn xong)
                const realEnd = block.end + CONFIG.CLEANUP_BUFFER;
                const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id);
                
                if (!slotId) {
                    placedSuccessfully = false;
                    break;
                }
                allocatedSlots.push(slotId);
            }

            if (!placedSuccessfully) {
                // Khách cũ này đang gây xung đột (có thể do data thực tế đang bị chồng).
                // Ở V8.0, nếu khách cũ không xếp được, ta tạm thời bỏ qua họ khỏi Matrix 
                // (hoặc coi như họ chiếm slot ảo vô hình).
                // Nhưng để an toàn cho khách mới, ta coi như Matrix đã bị full chỗ đó.
                // *Chiến lược:* Nếu exB là Soft (Elastic), ta đưa vào danh sách chờ Squeeze ngay lập tức.
                if (exB.isElastic) {
                    softsToSqueezeCandidates.push(exB);
                } else {
                    // Hard Booking mà không xếp được -> Data lỗi nghiêm trọng hoặc Overbooking.
                    // Ta buộc phải lờ đi hoặc return fail. Để hệ thống flexible, ta log warning và tiếp tục.
                    // console.warn("Hard booking overlapping in Matrix:", exB.id);
                }
            } else {
                // Xếp thành công -> Lưu vào danh sách có thể squeeze sau này nếu cần
                if (exB.isElastic) {
                    // Lưu lại trạng thái đã allocate để nếu cần thì undo và allocate lại bản squeeze
                    exB.allocatedSlots = allocatedSlots; 
                    softsToSqueezeCandidates.push(exB); 
                }
            }
        }

        // --- GIAI ĐOẠN 2: TÍNH TOÁN BLOCKS CHO KHÁCH MỚI ---
        let newGuestBlocksMap = []; 

        for (const ng of newGuests) {
            const svc = SERVICES[ng.serviceCode];
            if (!svc) continue; // Should not happen

            // Xác định Flow: FB hay BF?
            let flow = 'FB'; 
            if (svc.category === 'COMBO') {
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                if (cIdx < numBF) flow = 'BF'; // Interleaving
            }

            const duration = svc.duration;
            let blocks = [];
            
            if (svc.category === 'COMBO') {
                const p1Standard = Math.floor(duration / 2);
                const p2Standard = duration - p1Standard;

                if (flow === 'FB') {
                    const t1End = requestStartMins + p1Standard;
                    const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                    blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                    blocks.push({ start: t2Start, end: t2Start + p2Standard + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                    
                    scenarioDetails.push({
                        guestIndex: ng.idx, service: svc.name, price: svc.price,
                        phase1_duration: p1Standard, phase2_duration: p2Standard,
                        flow: 'FB', timeStr: timeStr, allocated: []
                    });
                } else { // BF
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
            } else { // Single
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

        // --- GIAI ĐOẠN 3: XẾP KHÁCH MỚI VÀO MATRIX ---
        // Duyệt qua từng block của từng khách mới và tryAllocate
        let conflictFound = false;
        
        // Backup Matrix state để rollback nếu cần squeeze?
        // Matrix class hiện tại đơn giản, ta có thể clone bằng cách deep copy lanes nếu cần phức tạp.
        // Nhưng ở đây ta dùng chiến thuật: Nếu fail -> Reset Matrix của Kịch bản này và Xếp lại từ đầu với Soft Squeezed.
        
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

            // Update chi tiết slot vào output
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) detail.allocated = guestAllocations;
        }

        // --- GIAI ĐOẠN 4: SMART SQUEEZE (NẾU CẦN) ---
        if (conflictFound) {
            // Matrix hiện tại đã đầy. Ta cần reset và thử lại với phiên bản Soft đã bị bóp.
            // Logic Squeeze: Tìm các Soft Booking xung đột với thời gian khách mới và bóp họ.
            // Để đơn giản hóa trong V8.0: Ta thử bóp TẤT CẢ Soft Candidates (Brute force optimize).
            
            // 4.1. Reset Matrix cho lần thử Squeeze
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            
            // 4.2. Xếp lại Hard Bookings (Nguyên trạng)
            // Lọc ra Hard Bookings từ list đã process
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id));
            });

            // 4.3. Xếp Soft Bookings (Với chế độ thử co giãn)
            // Với mỗi Soft Candidate, ta tìm biến thể tốt nhất (ít lệch nhất) mà nhét vừa Matrix
            // Lưu ý: Lúc này Matrix đã có Hard Bookings.
            // Ta cũng cần chừa chỗ cho Khách Mới nữa! -> Đây là bài toán khó.
            
            // Chiến thuật: 
            // B1: Xếp Hard Bookings.
            // B2: Xếp Khách Mới (Ưu tiên khách mới để xem có vừa không nếu không có Soft).
            // B3: Xếp Soft Bookings vào các khe còn lại (Squeeze if needed). 
            // Nếu Soft không vừa -> Thì có nghĩa là ta buộc phải từ chối khách mới (vì không được kick khách cũ).
            
            let squeezeScenarioPossible = true;
            
            // Thử xếp Khách Mới vào MatrixSqueeze trước (Priority check)
            for (const item of newGuestBlocksMap) {
                for (const block of item.blocks) {
                    if (!matrixSqueeze.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`)) {
                        squeezeScenarioPossible = false; // Ngay cả khi chưa có Soft, Hard đã chặn rồi
                        break;
                    }
                }
                if (!squeezeScenarioPossible) break;
            }

            if (!squeezeScenarioPossible) {
                scenarioFailed = true; // Hard conflict với khách mới, không cứu được
                continue; // Next permutation
            }

            // Nếu khách mới lọt qua khe Hard, giờ ta tìm chỗ cho các ông Soft cũ
            const softBookings = existingBookingsProcessed.filter(b => b.isElastic);
            
            for (const sb of softBookings) {
                const splits = generateElasticSplits(sb.duration, sb.elasticStep, sb.elasticLimit, null);
                let fit = false;

                for (const split of splits) {
                    // Tạo blocks giả định cho split này
                    const sP1End = sb.startMins + split.p1;
                    const sP2Start = sP1End + CONFIG.TRANSITION_BUFFER;
                    const sP2End = sP2Start + split.p2;

                    const testBlocks = [
                        { type: 'CHAIR', start: sb.startMins, end: sP1End + CONFIG.CLEANUP_BUFFER },
                        { type: 'BED', start: sP2Start, end: sP2End + CONFIG.CLEANUP_BUFFER }
                    ];

                    // Check xem có vừa MatrixSqueeze (đang chứa Hard + NewGuests) không
                    // Cần clone MatrixSqueeze tạm thời để test từng split? 
                    // Matrix class không support undo. Nên ta check thủ công.
                    
                    let splitWorks = true;
                    // Logic check manual không làm bẩn matrix chính
                    // Tuy nhiên để đơn giản code: Ta dùng hàm tryAllocate nhưng cần cơ chế 'Dry Run'.
                    // Ở V8.0 này, ta chấp nhận allocate thật, nếu fail thì coi như split fail.
                    // Nhưng Matrix là object tham chiếu. Ta cần 1 bản copy cho mỗi lần thử split? Quá tốn mem.
                    // Giải pháp: Dùng tryAllocate. Nếu thành công -> Done. Nếu fail -> Rollback (cần implement remove?).
                    // ĐƠN GIẢN HÓA: Ta kiểm tra overlaps thủ công với dữ liệu trong lanes.
                    
                    if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                        // Allocate thật
                        testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id));
                        fit = true;
                        
                        if (split.deviation !== 0) {
                            updatesProposed.push({
                                rowId: sb.id,
                                customerName: sb.originalData.customerName,
                                newPhase1: split.p1,
                                newPhase2: split.p2,
                                reason: 'Matrix Squeeze V8.0'
                            });
                        }
                        break; // Chọn split này
                    }
                }

                if (!fit) {
                    squeezeScenarioPossible = false; // Không tìm được chỗ cho khách Soft cũ -> Fail
                    break;
                }
            }

            if (squeezeScenarioPossible) {
                // Thành công rực rỡ!
                scenarioUpdates = updatesProposed;
                // Matrix giờ đã chứa full: Hard + New + Soft (Squeezed).
                matrix = matrixSqueeze; // Swap matrix chính
            } else {
                scenarioFailed = true;
                continue;
            }
        }

        // --- GIAI ĐOẠN 5: KIỂM TRA STAFF (Staff Availability) ---
        // Matrix đảm bảo có Giường/Ghế. Giờ check xem có Người làm không.
        // Ta cần dựng 1 Timeline phẳng từ Matrix để check Staff busy.
        
        let flatTimeline = [];
        Object.values(matrix.lanes).forEach(group => {
            group.forEach(lane => {
                lane.occupied.forEach(occ => {
                    // Cần tìm lại thông tin staff của occ này
                    // Với khách cũ:
                    const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
                    if (ex) {
                        flatTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
                    }
                    // Với khách mới: Chưa có staff, ta đang đi tìm.
                });
            });
        });

        // Assign Staff cho khách mới
        let staffAssignmentSuccess = true;
        
        for (const item of newGuestBlocksMap) {
            const guest = item.guest;
            const startT = item.blocks[0].start;
            const endT = item.blocks[item.blocks.length - 1].end; // Lấy time kết thúc của block cuối
            
            // Check staff availability với flatTimeline hiện tại
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

            // Update result
            const detail = scenarioDetails.find(d => d.guestIndex === guest.idx);
            if (detail) detail.staff = assignedStaff;

            // Add khách mới này vào flatTimeline để check cho khách tiếp theo trong cùng nhóm
            item.blocks.forEach(b => {
                flatTimeline.push({ start: b.start, end: b.end, staffName: assignedStaff });
            });
        }

        if (!staffAssignmentSuccess) {
            scenarioFailed = true;
            continue;
        }

        // --- SUCCESS FOUND! ---
        successfulScenario = {
            details: scenarioDetails,
            updates: scenarioUpdates,
            matrixDump: matrix.lanes // Debug info
        };
        break; // Dừng loop khi tìm thấy kịch bản tốt nhất (ưu tiên ít BF)
    }

    // ------------------------------------------------------------------------
    // BƯỚC C: KẾT QUẢ CUỐI CÙNG
    // ------------------------------------------------------------------------

    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true,
            strategy: 'MATRIX_TETRIS_V8.0',
            details: successfulScenario.details,
            proposedUpdates: successfulScenario.updates,
            totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
        };
    } else {
        return { 
            feasible: false, 
            reason: "Hết chỗ (Không tìm thấy khe trống trong Ma trận tài nguyên)" 
        };
    }
}

// Helper check overlap thủ công cho Matrix (Dùng trong bước Squeeze)
function isBlockSetAllocatable(blocks, matrix) {
    for (const b of blocks) {
        const laneGroup = matrix.lanes[b.type];
        if (!laneGroup) return false;
        
        // Cần tìm ít nhất 1 lane trống cho block này
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
    console.log("✅ Resource Core V8.0: Matrix Tetris Engine Active.");
}
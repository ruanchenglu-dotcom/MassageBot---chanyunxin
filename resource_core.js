/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - CORE LOGIC KERNEL
 * FILE: resource_core.js
 * PHIÊN BẢN: V8.5 (MATRIX TETRIS & AUTO LOAD BALANCER)
 * TÁC GIẢ: AI ASSISTANT & USER
 * NGÀY CẬP NHẬT: 2026/01/13
 *
 * * * * * CHANGE LOG V8.5 (THE BALANCING ACT):
 * 1. [AUTO LOAD BALANCER]:
 * - Logic cũ: Luôn ưu tiên xếp tất cả khách làm Chân trước (FB), nếu hết chỗ mới thử đảo khách.
 * - Logic mới: Với nhóm khách > 2 người, hệ thống tự động ưu tiên kịch bản "Chia đôi" 
 * (50% FB - 50% BF) ngay từ đầu để tận dụng đồng thời Giường và Ghế.
 * * 2. [SMART PERMUTATION SEQUENCE]:
 * - Tạo ra danh sách ưu tiên thử nghiệm (Try Sequence). 
 * - VD khách 4 người: Thử kịch bản 2-2 trước -> rồi mới thử 1-3 -> cuối cùng mới thử 0-4.
 * * 3. [LEGACY MATRIX ENGINE]:
 * - Giữ nguyên toàn bộ sức mạnh của Matrix V8.0 (Spatial Allocation, Virtual Bin Packing).
 * - Giữ nguyên Logic Squeeze (Bóp khách Soft cũ) để nhét khách mới.
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
// PHẦN 3: MATRIX ENGINE (V8.0/V8.5 CORE) - SPATIAL ALLOCATION
// ============================================================================

class VirtualMatrix {
    constructor() {
        // Khởi tạo các làn chứa (Lanes)
        // Mỗi lane là một mảng các khoảng thời gian đã bị chiếm {start, end, ownerId}
        this.lanes = {
            'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
            'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
        };
        this.totalLoad = []; 
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
                // Sắp xếp lại để timeline gọn gàng
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
// PHẦN 6: CORE ENGINE V8.5 (MATRIX TETRIS + LOAD BALANCING)
// ============================================================================

/**
 * Hàm kiểm tra khả dụng chính - PHIÊN BẢN V8.5 LOAD BALANCING
 * * Nâng cấp: Tự động cân bằng số lượng khách FB/BF cho nhóm > 2 người.
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

    // ------------------------------------------------------------------------
    // BƯỚC A: CHUẨN BỊ DỮ LIỆU KHÁCH CŨ (PRE-PROCESSING)
    // ------------------------------------------------------------------------
    let existingBookingsProcessed = [];

    // Sort existing bookings by Start Time (First-Fit Logic)
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
            isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
            elasticStep: svcInfo.elasticStep || 5,
            elasticLimit: svcInfo.elasticLimit || 15,
            blocks: [] 
        };

        // Tính toán Blocks (Hard Geometry) - Giữ nguyên flow khách cũ
        if (isCombo) {
            let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
            let p2 = duration - p1;
            const p1End = bStart + p1;
            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
            
            // Xử lý logic đảo chiều của khách cũ nếu có note (chưa implement full, giả định flow chuẩn FB)
            // Trong bản này ta mặc định khách cũ là FB trừ khi có cờ đặc biệt, nhưng Matrix sẽ tự động tránh.
            // (TODO: Nếu muốn hệ thống biết khách cũ BF, cần parse note. Nhưng để an toàn ta giữ FB cho khách cũ đã chốt).
            
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
    // BƯỚC B: VÒNG LẶP HOÁN VỊ THÔNG MINH (SMART PERMUTATION LOOP)
    // ------------------------------------------------------------------------
    
    const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
    const comboGuests = newGuests.filter(g => {
        const s = SERVICES[g.serviceCode];
        return s && s.category === 'COMBO';
    });
    
    const maxBF = comboGuests.length;
    let successfulScenario = null;

    // [UPGRADE V8.5]: TẠO DANH SÁCH THỨ TỰ ƯU TIÊN (Priority Sequence)
    // Thay vì lặp 0 -> maxBF, ta tạo danh sách trySequence
    let trySequence = [];

    if (maxBF > 2) {
        // --- CHẾ ĐỘ LOAD BALANCING (Khách đông) ---
        // Ưu tiên chia đều quân số (VD: 4 khách -> Thử 2 trước)
        const idealHalf = Math.floor(maxBF / 2);
        trySequence.push(idealHalf);
        
        // Nếu lẻ, thử thêm cận trên (VD 5 khách -> Thử 2 rồi 3)
        if (maxBF % 2 !== 0) {
            trySequence.push(idealHalf + 1);
        }

        // Sau đó lan toả ra 2 bên (Thử các phương án lệch hơn)
        // Logic: Từ điểm giữa, toả ra dần về 0 và về Max
        let left = idealHalf - 1;
        let right = idealHalf + (maxBF % 2 !== 0 ? 2 : 1);
        
        while (left >= 0 || right <= maxBF) {
            if (left >= 0) trySequence.push(left);
            if (right <= maxBF) trySequence.push(right);
            left--;
            right++;
        }
    } else {
        // --- CHẾ ĐỘ TIÊU CHUẨN (Khách ít: 1 hoặc 2) ---
        // Ưu tiên đi cùng nhau (All FB = 0 BF) để tình cảm, nếu không được mới tách
        for (let i = 0; i <= maxBF; i++) {
            trySequence.push(i);
        }
    }

    // console.log("Permutation Sequence:", trySequence); // Debug nếu cần

    // Bắt đầu lặp theo trình tự ưu tiên đã tính
    for (let numBF of trySequence) {
        
        let matrix = new VirtualMatrix();
        let scenarioDetails = [];
        let scenarioUpdates = [];
        let scenarioFailed = false;
        
        // --- GIAI ĐOẠN 1: XẾP KHÁCH CŨ (PINNING) ---
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

            if (!placedSuccessfully) {
                // Khách cũ này bị conflict, nếu là Elastic thì đưa vào danh sách chờ Squeeze
                if (exB.isElastic) {
                    softsToSqueezeCandidates.push(exB);
                }
            } else {
                // Nếu thành công cũng lưu vào danh sách chờ Squeeze phòng hờ
                if (exB.isElastic) {
                    exB.allocatedSlots = allocatedSlots; 
                    softsToSqueezeCandidates.push(exB); 
                }
            }
        }

        // --- GIAI ĐOẠN 2: TÍNH TOÁN BLOCKS CHO KHÁCH MỚI ---
        let newGuestBlocksMap = []; 

        for (const ng of newGuests) {
            const svc = SERVICES[ng.serviceCode];
            if (!svc) continue; 

            // Xác định Flow: FB hay BF dựa trên numBF
            // numBF là số lượng khách sẽ làm Body First
            let flow = 'FB'; 
            if (svc.category === 'COMBO') {
                const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                // Những người có index < numBF sẽ làm BF (Body First)
                if (cIdx < numBF) flow = 'BF'; 
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
            } else { // Single Service
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

        // --- GIAI ĐOẠN 4: SMART SQUEEZE (BÓP KHÁCH MỀM NẾU CẦN) ---
        if (conflictFound) {
            // Chiến thuật: Reset Matrix -> Xếp Hard Booking -> Xếp Khách Mới -> Bóp Soft Booking chèn vào khe
            let matrixSqueeze = new VirtualMatrix();
            let updatesProposed = [];
            
            // 4.1. Xếp lại Hard Bookings
            const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
            hardBookings.forEach(hb => {
                hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id));
            });

            let squeezeScenarioPossible = true;
            
            // 4.2. Xếp Khách Mới (Ưu tiên)
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
                scenarioFailed = true; // Kể cả bóp hết cỡ khách cũ thì khách mới vẫn đụng khách Hard -> Thua
                continue; // Next numBF
            }

            // 4.3. Bóp và Xếp Soft Bookings
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
                                reason: 'Matrix Squeeze V8.5'
                            });
                        }
                        break; 
                    }
                }

                if (!fit) {
                    squeezeScenarioPossible = false; // Không chỗ cho khách cũ -> Fail
                    break;
                }
            }

            if (squeezeScenarioPossible) {
                scenarioUpdates = updatesProposed;
                matrix = matrixSqueeze; // Swap matrix chính
            } else {
                scenarioFailed = true;
                continue;
            }
        }

        // --- GIAI ĐOẠN 5: KIỂM TRA STAFF (Staff Availability) ---
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

        // --- SUCCESS FOUND! ---
        successfulScenario = {
            details: scenarioDetails,
            updates: scenarioUpdates,
            matrixDump: matrix.lanes 
        };
        break; // Dừng loop ngay khi tìm thấy kịch bản tốt nhất trong Priority Sequence
    }

    // ------------------------------------------------------------------------
    // BƯỚC C: KẾT QUẢ CUỐI CÙNG
    // ------------------------------------------------------------------------

    if (successfulScenario) {
        successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
        return {
            feasible: true,
            strategy: 'MATRIX_TETRIS_V8.5_BALANCED',
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
    console.log("✅ Resource Core V8.5: Load Balanced Matrix Engine Active.");
}
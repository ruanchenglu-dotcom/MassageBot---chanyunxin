/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - FRONTEND CONTROLLER & LOGIC BRIDGE
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V103.0 (GLOBAL CAPACITY GUARDRAIL & COUPLE SYNC)
 * NGÀY CẬP NHẬT: 2026/01/15
 * TÁC GIẢ: AI ASSISTANT & USER
 *
 * * * * * CHANGE LOG V103.0 (THE "GUARDRAIL" UPDATE) * * * * *
 * 1. [CRITICAL] GLOBAL CAPACITY GUARDRAIL (HÀNG RÀO DUNG LƯỢNG TỔNG):
 * - Logic cũ (V102): Chỉ tìm khe hở giường/ghế. Nếu thợ chưa gán tên (Random), hệ thống dễ bị đánh lừa.
 * - Logic mới (V103): Trước khi xếp giường, hệ thống đếm tổng số đầu người (Headcount).
 * Công thức: (Khách đang làm + Khách mới) <= (Tổng nhân viên đi làm lúc đó).
 * Nếu vi phạm -> REJECT ngay lập tức (Báo lỗi: "Not enough staff").
 *
 * 2. [CORE] DYNAMIC STAFF COUNTING:
 * - Tính toán số lượng nhân viên thực tế theo từng phút (xét cả giờ vào ca/tan ca).
 * - Một nhân viên làm ca 14:00 sẽ không được tính vào dung lượng của slot 13:00.
 *
 * 3. [INHERITANCE] GIỮ NGUYÊN TÍNH NĂNG V102.0:
 * - Couple Sync Strategy (Ưu tiên cặp đôi đi cùng Flow).
 * - Modulo Wrapping (Chia bài đều).
 * - Matrix Squeeze (Bóp méo thời gian để nhét khách).
 * =================================================================================================
 */

(function() {
    console.log("🚀 BookingHandler V103.0: Global Capacity Guardrail Loaded.");

    // Kiểm tra môi trường React
    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React not found. Cannot start BookingHandler V103.0.");
        return;
    }

    // ========================================================================
    // PHẦN 1: CORE KERNEL V103.0 (CLIENT-SIDE BRAIN)
    // Mô tả: Bộ não tính toán trung tâm, tích hợp Guardrail & Matrix.
    // ========================================================================
    const CoreKernel = (function() {
        
        // --- 1. CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION) ---
        const CONFIG = {
            // Tài nguyên phần cứng
            MAX_CHAIRS: 6,        
            MAX_BEDS: 6,          
            MAX_TOTAL_GUESTS: 12, 
            
            // Cấu hình thời gian hoạt động
            OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
            CLOSE_HOUR: 28,       // 04:00 Sáng hôm sau (28h)
            
            // Bộ đệm thời gian (Time Buffers - Đơn vị: Phút)
            CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi ca
            TRANSITION_BUFFER: 5, // Thời gian khách di chuyển hoặc thay đồ
            
            // Dung sai và giới hạn tính toán
            TOLERANCE: 1,         // Sai số cho phép (phút) khi so sánh trùng lặp
            MAX_TIMELINE_MINS: 1680 // Tổng số phút (28h * 60)
        };

        // Cơ sở dữ liệu dịch vụ (Dynamic Services Database)
        let SERVICES = {}; 

        // --- 2. QUẢN LÝ DỊCH VỤ (SERVICE MANAGEMENT) ---
        function setDynamicServices(newServicesObj) {
            const systemServices = {
                'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
                'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
                'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
                'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
            };
            SERVICES = { ...newServicesObj, ...systemServices };
        }

        // --- 3. TIỆN ÍCH THỜI GIAN (TIME UTILITIES) ---
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
                // Nếu giờ < 8 (ví dụ 01:00, 02:00) thì hiểu là ca đêm của ngày hôm sau (25h, 26h...)
                if (h < CONFIG.OPEN_HOUR) h += 24; 
                
                return (h * 60) + m;
            } catch (e) {
                return -1;
            }
        }

        function isOverlap(startA, endA, startB, endB) {
            const safeEndA = endA - CONFIG.TOLERANCE; 
            const safeEndB = endB - CONFIG.TOLERANCE;
            return (startA < safeEndB) && (startB < safeEndA);
        }

        // --- 4. BỘ NHẬN DIỆN THÔNG MINH (SMART CLASSIFIER) ---
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

        // --- 5. MATRIX ENGINE V103.0 (CORE ALLOCATION LOGIC) ---
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

            countFreeSlots(type, start, end) {
                const resourceGroup = this.lanes[type];
                if (!resourceGroup) return 0;
                let count = 0;
                for (let lane of resourceGroup) {
                    if (this.checkLaneFree(lane, start, end)) count++;
                }
                return count;
            }

            allocateToLane(lane, start, end, ownerId) {
                lane.occupied.push({ start, end, ownerId });
                lane.occupied.sort((a, b) => a.start - b.start);
                return lane.id;
            }

            tryAllocate(type, start, end, ownerId, preferredIndex = null) {
                const resourceGroup = this.lanes[type];
                if (!resourceGroup) return null; 

                // CHIẾN LƯỢC 1: TARGETED ALLOCATION (Ưu tiên vị trí định sẵn/ảo)
                if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
                    const targetLane = resourceGroup[preferredIndex - 1];
                    if (this.checkLaneFree(targetLane, start, end)) {
                        return this.allocateToLane(targetLane, start, end, ownerId);
                    }
                }

                // CHIẾN LƯỢC 2: FIRST-FIT (Vét cạn các slot còn lại)
                for (let lane of resourceGroup) {
                    if (this.checkLaneFree(lane, start, end)) {
                        return this.allocateToLane(lane, start, end, ownerId);
                    }
                }
                return null; 
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

        // --- 6. LOGIC TÌM NHÂN VIÊN & TÍNH TOÁN DUNG LƯỢNG (GUARDRAIL LOGIC) ---
        
        // [V103.0] Hàm đếm số nhân viên ĐANG ĐI LÀM tại thời điểm T
        function countActiveStaffAtTime(staffListRef, timePointMins) {
            let count = 0;
            const staffArray = Object.values(staffListRef);
            for (const staff of staffArray) {
                if (staff.off) continue; // Bỏ qua người nghỉ
                
                const shiftStart = getMinsFromTimeStr(staff.start);
                const shiftEnd = getMinsFromTimeStr(staff.end);
                
                if (shiftStart === -1 || shiftEnd === -1) continue;
                
                // Kiểm tra xem thời điểm T có nằm trong ca làm việc không
                // Thêm buffer nhỏ để tránh biên
                if (timePointMins >= shiftStart && timePointMins < shiftEnd) {
                    count++;
                }
            }
            return count;
        }

        // [V103.0] Logic gán thợ cụ thể (đã có từ V102, giữ nguyên)
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
                if (!staffInfo || staffInfo.off) return false; 
                
                const shiftStart = getMinsFromTimeStr(staffInfo.start); 
                const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
                if (shiftStart === -1 || shiftEnd === -1) return false; 

                if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
                
                const isStrict = staffInfo.isStrictTime === true;
                if (isStrict) { if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; } 
                else { if (start > shiftEnd) return false; }

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
                for (const name of allStaffNames) { if (checkOneStaff(name)) return name; }
                return null;
            }
        }

        // --- 7. BỘ HELPER SINH BIẾN THỂ THỜI GIAN (ELASTIC GENERATOR) ---
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

        // --- 8. MAIN LOGIC V103.0 (GUARDRAIL + COUPLE SYNC) ---
        
        /**
         * HÀM KIỂM TRA KHẢ DỤNG CHÍNH - PHIÊN BẢN V103.0
         * Tích hợp: 
         * 1. Global Capacity Guardrail (NEW) - Chặn quá tải nhân sự ngay lập tức.
         * 2. Group Folding & Modulo Wrapping - Gom nhóm tối ưu.
         * 3. Couple Sync Strategy - Ưu tiên đi cùng nhau.
         */
        function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

            // Xác định thời gian kết thúc dự kiến của nhóm khách mới (để check Guardrail)
            let maxDuration = 60;
            guestList.forEach(g => {
                const svc = SERVICES[g.serviceCode] || { duration: 60 };
                if (svc.duration > maxDuration) maxDuration = svc.duration;
            });
            const requestEndMins = requestStartMins + maxDuration;

            // ------------------------------------------------------------------------
            // [V103.0 FEATURE] BƯỚC 0: GLOBAL CAPACITY GUARDRAIL (HÀNG RÀO DUNG LƯỢNG)
            // ------------------------------------------------------------------------
            // Nguyên lý: Tổng người đang làm + Tổng khách mới <= Tổng nhân viên đi làm
            // Kiểm tra tại 2 điểm: Lúc bắt đầu (Start) và lúc giữa (Start + 30) để đảm bảo an toàn.
            
            const timeCheckPoints = [requestStartMins, requestStartMins + 30]; // Check điểm đầu và điểm giữa
            const newGuestCount = guestList.length;

            for (const timePoint of timeCheckPoints) {
                if (timePoint >= requestEndMins) break; // Không check quá thời gian

                // 1. Tính tổng nhân viên đi làm lúc này
                const totalWorkingStaff = countActiveStaffAtTime(staffList, timePoint);

                // 2. Tính tổng khách đang phục vụ (Existing Load)
                let currentLoad = 0;
                for (const b of currentBookingsRaw) {
                    const bStart = getMinsFromTimeStr(b.startTime);
                    const bDuration = parseInt(b.duration) || 60;
                    const bEnd = bStart + bDuration;
                    
                    // Nếu booking này đè lên thời điểm timePoint -> Tính là 1 slot
                    if (timePoint >= bStart && timePoint < bEnd) {
                        currentLoad++;
                    }
                }

                // 3. So sánh (THE GUARDRAIL CHECK)
                if ((currentLoad + newGuestCount) > totalWorkingStaff) {
                    console.warn(`⛔ GUARDRAIL BLOCKED: Time ${timePoint} | Load: ${currentLoad} + New: ${newGuestCount} > Staff: ${totalWorkingStaff}`);
                    return { 
                        feasible: false, 
                        reason: `Hết nhân viên (Staff Limit): Đang bận ${currentLoad}/${totalWorkingStaff} người. Cần thêm ${newGuestCount} người.` 
                    };
                }
            }
            
            // Nếu qua được Guardrail -> Hệ thống còn đủ người -> Tiếp tục chạy logic Matrix phức tạp bên dưới

            // ------------------------------------------------------------------------
            // BƯỚC A: TIỀN XỬ LÝ & GOM NHÓM (EXISTING BOOKINGS)
            // ------------------------------------------------------------------------
            
            // 1. Sắp xếp sơ bộ các booking hiện có
            let sortedRaw = [...currentBookingsRaw].sort((a, b) => {
                return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
            });

            // 2. Gom nhóm (Grouping Strategy)
            const bookingGroups = {};
            sortedRaw.forEach(b => {
                const timeKey = (b.startTime || "").split(' ')[1] || "00:00";
                const contactInfo = b.originalData?.phone || b.originalData?.sdt || b.originalData?.custPhone || b.originalData?.customerName || "Unknown";
                const contactKey = contactInfo.toString().replace(/\D/g, '').slice(-6) || contactInfo.toString().trim();
                const groupKey = (b.status === 'Running') ? `RUNNING_${b.rowId}` : `${timeKey}_${contactKey}`;
                if (!bookingGroups[groupKey]) bookingGroups[groupKey] = [];
                bookingGroups[groupKey].push(b);
            });

            // 3. Remapping với Modulo & Pendulum
            let remappedBookings = [];
            Object.values(bookingGroups).forEach(group => {
                group.sort((a,b) => parseInt(a.rowId) - parseInt(b.rowId));
                const groupSize = group.length;
                const halfSize = Math.ceil(groupSize / 2);

                group.forEach((b, idx) => {
                    b._virtualInheritanceIndex = null;
                    b._impliedFlow = null;

                    if (b.status !== 'Running') {
                        // LOGIC: MODULO WRAPPING
                        let virtualIndex = null;
                        if (groupSize >= 2) {
                            virtualIndex = (idx % halfSize) + 1;
                        } else {
                            virtualIndex = idx + 1;
                        }
                        b._virtualInheritanceIndex = virtualIndex;

                        // LOGIC: PENDULUM FLOW (Nếu chưa có chỉ định cứng)
                        if (groupSize >= 2) {
                            if (idx < halfSize) b._impliedFlow = 'BF';
                            else b._impliedFlow = 'FB';
                        }
                    }
                    remappedBookings.push(b);
                });
            });

            // ------------------------------------------------------------------------
            // BƯỚC B: XỬ LÝ CHI TIẾT BOOKING THÀNH BLOCKS
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
                     } else if (b.rowId && (b.rowId.includes('BED') || b.rowId.includes('CHAIR'))) {
                         const match = b.rowId.toString().match(/(\d+)/);
                         if (match) anchorIndex = parseInt(match[0]);
                     }
                } else {
                    if (b._virtualInheritanceIndex) {
                        anchorIndex = b._virtualInheritanceIndex;
                    } else if (b.allocated_resource) {
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
                    
                    // Ưu tiên theo thứ tự: Note > Running > Implied
                    if (b.flow === 'BF' || noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體') || noteContent.includes('先身')) {
                        isBodyFirst = true;
                    } else if (b.status === 'Running' && b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) {
                        isBodyFirst = true;
                    } else if (b._impliedFlow === 'BF') {
                        isBodyFirst = true;
                    }

                    if (isBodyFirst) {
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: anchorIndex }); 
                        processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'CHAIR', forcedIndex: anchorIndex });
                        processedB.flow = 'BF'; 
                    } else {
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: anchorIndex }); 
                        processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED', forcedIndex: anchorIndex });
                        processedB.flow = 'FB'; 
                    }
                    processedB.p1_current = p1; 
                    processedB.p2_current = p2;
                } else {
                    let rType = detectResourceType(svcInfo);
                    processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
                }
                existingBookingsProcessed.push(processedB);
            });

            // ------------------------------------------------------------------------
            // BƯỚC C: TẠO KỊCH BẢN CHO KHÁCH MỚI (V102.0 COUPLE STRATEGY)
            // ------------------------------------------------------------------------
            const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
            const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return isComboService(s, g.serviceCode); });
            
            const maxBF = comboGuests.length;
            const newGuestHalfSize = Math.ceil(comboGuests.length / 2);
            
            // [V102.0] SMART SEQUENCE GENERATION
            // Xác định thứ tự ưu tiên thử nghiệm Flow (Sync vs Split)
            let trySequence = [];
            
            if (maxBF === 2) {
                // CHIẾN THUẬT CẶP ĐÔI: Ưu tiên SYNC (0 hoặc 2) trước khi thử SPLIT (1)
                trySequence = [0, 2, 1]; 
            } else if (maxBF > 0) {
                // Nhóm khác: Dùng chiến thuật con lắc (Pendulum) cân bằng
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
            } else { trySequence.push(0); }
            
            // ------------------------------------------------------------------------
            // BƯỚC D: VÒNG LẶP VÉT CẠN (EXHAUSTIVE SEARCH)
            // ------------------------------------------------------------------------
            let successfulScenario = null;

            for (let numBF of trySequence) {
                let matrix = new VirtualMatrix();
                let scenarioDetails = [];
                let scenarioUpdates = [];
                let scenarioFailed = false;
                
                // === GIAI ĐOẠN 1: XẾP CHỖ CHO KHÁCH CŨ ===
                let softsToSqueezeCandidates = []; 
                for (const exB of existingBookingsProcessed) {
                    let placedSuccessfully = true;
                    let allocatedSlots = []; 
                    for (const block of exB.blocks) {
                        const realEnd = block.end + CONFIG.CLEANUP_BUFFER;
                        // Cố gắng đặt vào slot chỉ định (forcedIndex)
                        const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id, block.forcedIndex);
                        if (!slotId) { placedSuccessfully = false; break; }
                        allocatedSlots.push(slotId);
                    }
                    if (exB.isElastic) {
                        if (placedSuccessfully) exB.allocatedSlots = allocatedSlots; 
                        softsToSqueezeCandidates.push(exB); 
                    }
                }

                // === GIAI ĐOẠN 2: TẠO BLOCK CHO KHÁCH MỚI ===
                // Dựa trên numBF (số lượng khách làm BF) hiện tại đang thử nghiệm
                let newGuestBlocksMap = []; 
                for (const ng of newGuests) {
                    const svc = SERVICES[ng.serviceCode] || { name: ng.serviceCode || 'Unknown', duration: 60, price: 0 }; 
                    let flow = 'FB'; 
                    let isThisGuestCombo = isComboService(svc, ng.serviceCode);

                    if (isThisGuestCombo) {
                        // Logic chia bài Pendulum
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

                // === GIAI ĐOẠN 3: XẾP CHỖ KHÁCH MỚI (ÁP DỤNG MODULO) ===
                let conflictFound = false;
                
                for (const item of newGuestBlocksMap) {
                    let guestAllocations = [];
                    // Tính chỉ số ưu tiên Modulo
                    let preferredIdx = null;
                    if (newGuestHalfSize > 0 && newGuests.length >= 2) {
                        preferredIdx = (item.guest.idx % newGuestHalfSize) + 1;
                        
                        // [V102.0 Fix] Nếu đang chạy chế độ SYNC (Cùng flow),
                        // Ta muốn khách nằm cạnh nhau (1, 2) chứ không phải chồng lên nhau (1, 1).
                        if (maxBF === 2 && (numBF === 0 || numBF === 2)) {
                            preferredIdx = item.guest.idx + 1;
                        }
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

                // === GIAI ĐOẠN 4: CHIẾN THUẬT SQUEEZE (BÓP MỀM KHI CẦN THIẾT) ===
                if (conflictFound) {
                    let matrixSqueeze = new VirtualMatrix();
                    let updatesProposed = [];
                    const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
                    hardBookings.forEach(hb => {
                        hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
                    });

                    let squeezeScenarioPossible = true;
                    // Thử xếp lại khách mới vào Matrix sạch
                    for (const item of newGuestBlocksMap) {
                        // Copy logic preferredIdx từ trên xuống
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

                    // Nhét các booking mềm (Elastic) vào khe hở còn lại
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
                                if (split.deviation !== 0) {
                                    updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze V102.0' });
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

                // === GIAI ĐOẠN 5: KIỂM TRA NHÂN SỰ CỤ THỂ (ASSIGNMENT) ===
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
            // BƯỚC E: KẾT QUẢ CUỐI CÙNG
            // ------------------------------------------------------------------------
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
                return { feasible: false, reason: "Hết chỗ (Full - Matrix Scan Failed)" };
            }
        }

        return { checkRequestAvailability, setDynamicServices };
    })();

    // ========================================================================
    // PHẦN 2: ANTI-CACHE DATA FETCHER (GIỮ NGUYÊN)
    // ========================================================================
    const fetchLiveServerData = async (isForceRefresh = false) => {
        const apiUrl = window.API_URL || window.GAS_API_URL || (window.CONFIG && window.CONFIG.API_URL);
        if (!apiUrl) { console.warn("⚠️ Warning: API_URL missing."); return null; }
        try {
            const params = [`_t=${new Date().getTime()}`];
            if (isForceRefresh) params.push('forceRefresh=true');
            const targetUrl = apiUrl.includes('?') ? `${apiUrl}&${params.join('&')}` : `${apiUrl}?${params.join('&')}`;
            const response = await fetch(targetUrl);
            const data = await response.json();
            if (data && data.staff && data.bookings) return data;
            return null;
        } catch (err) { console.error("❌ Fetch Failed", err); return null; }
    };

    // ========================================================================
    // PHẦN 3: BRIDGE LOGIC & REACT COMPONENT
    // ========================================================================
    const { useState, useEffect, useMemo, useCallback } = React;

    const syncServicesToCore = () => {
        const rawServices = window.SERVICES_DATA || {};
        const formattedServices = {};
        Object.keys(rawServices).forEach(key => {
            const svc = rawServices[key];
            formattedServices[key] = {
                name: svc.name || key, duration: parseInt(svc.duration) || 60,
                type: svc.type ? svc.type.toUpperCase() : 'BODY', category: svc.category || 'SINGLE', price: svc.price || 0,
                elasticStep: svc.elasticStep || 0, elasticLimit: svc.elasticLimit || 0
            };
        });
        CoreKernel.setDynamicServices(formattedServices);
    };

    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList) => {
        syncServicesToCore();
        const now = new Date();
        const coreGuests = guests.map(g => ({
            serviceCode: g.service,
            staffName: g.staff === '隨機' ? 'RANDOM' : (g.staff === '女' || g.staff === 'FEMALE_OIL') ? 'FEMALE' : (g.staff === '男') ? 'MALE' : g.staff
        }));

        const targetDateStandard = date.replace(/-/g, '/');
        const targetDateSheetHeader = date.replace(/\//g, '-');

        const coreBookings = (Array.isArray(bookings) ? bookings : []).filter(b => {
            if (!b || !b.startTimeString || (b.status && (b.status.includes('hủy') || b.status.includes('Cancel')))) return false;
            return b.startTimeString.split(' ')[0].replace(/-/g, '/') === targetDateStandard;
        }).map(b => {
            let isPastOrRunning = false;
            try { if (new Date(b.startTimeString) <= now) isPastOrRunning = true; } catch (e) {}
            
            return {
                serviceCode: b.serviceName, serviceName: b.serviceName, startTime: b.startTimeString, 
                duration: parseInt(b.duration) || 60, staffName: b.technician || b.staffId || "Unassigned", rowId: b.rowId,
                allocated_resource: b.resourceId || b.allocated_resource || b.rowId,
                originalData: b, 
                isManualLocked: (b.isManualLocked === true || String(b.isManualLocked) === 'true') || isPastOrRunning, 
                phase1_duration: b.phase1_duration ? parseInt(b.phase1_duration) : null,
                phase2_duration: b.phase2_duration ? parseInt(b.phase2_duration) : null,
                status: isPastOrRunning ? 'Running' : (b.status || 'Reserved'),
                note: b.ghiChu || b.note,
                ghiChu: b.ghiChu || b.note,
                flow: b.flow 
            };
        });

        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = String(s.id).trim();
                const rawStart = s['上班'] || s.shiftStart || s.start || "00:00";
                const rawEnd = s['下班'] || s.shiftEnd || s.end || "00:00";
                const dayStatus = s[targetDateSheetHeader] || s[targetDateStandard] || "";
                let isOff = (String(s.offDays || "").includes(targetDateStandard) || String(dayStatus).toUpperCase().includes('OFF'));
                staffMap[sId] = {
                    id: sId, gender: s.gender, start: rawStart, end: rawEnd,
                    isStrictTime: (s.isStrictTime === true || s.isStrictTime === 'TRUE'), off: isOff
                };
                if (s.name) staffMap[s.name] = staffMap[sId];
            });
        }

        try {
            const result = CoreKernel.checkRequestAvailability(date, time, coreGuests, coreBookings, staffMap);
            return result.feasible 
                ? { valid: true, details: result.details, proposedUpdates: result.proposedUpdates } 
                : { valid: false, reason: result.reason };
        } catch (err) {
            console.error("Core Check Error:", err);
            return { valid: false, reason: "System Error: " + err.message };
        }
    };

    const forceGlobalRefresh = () => { if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender(); else window.location.reload(); };

    // ==================================================================================
    // 4. COMPONENT: PHONE BOOKING MODAL
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate, editingBooking }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [isChecking, setIsChecking] = useState(false); 
        const [serverData, setServerData] = useState(null);

        const defaultService = (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) ? window.SERVICES_LIST[2] : "Body Massage";
        const [form, setForm] = useState({ 
            date: initialDate || new Date().toISOString().slice(0, 10), 
            time: "12:00", pax: 1, custName: '', custPhone: '' 
        });
        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

        useEffect(() => {
            if (editingBooking) {
                let timeStr = "12:00"; let dateStr = initialDate;
                if (editingBooking.startTimeString) {
                    const parts = editingBooking.startTimeString.split(' ');
                    if (parts.length >= 2) { dateStr = parts[0].replace(/\//g, '-'); timeStr = parts[1].substring(0, 5); }
                }
                setForm({
                    date: dateStr, time: timeStr, pax: editingBooking.pax || 1,
                    custName: (editingBooking.customerName || "").split('(')[0].trim(),
                    custPhone: editingBooking.phone || ""
                });
                setGuestDetails([{
                    service: editingBooking.serviceName || defaultService,
                    staff: editingBooking.staffId || '隨機',
                    isOil: editingBooking.isOil || false
                }]);
            }
            fetchLiveServerData(true).then(data => { if (data) setServerData(data); });
        }, [editingBooking, initialDate, defaultService]);

        const handleTimeChange = useCallback((type, value) => {
            setForm(prev => {
                const parts = (prev.time || "12:00").split(':');
                return { ...prev, time: type === 'HOUR' ? `${value}:${parts[1]}` : `${parts[0]}:${value}` };
            });
            setCheckResult(null); setSuggestions([]);
        }, []);

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
            setForm(prev => ({ ...prev, pax: num })); setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const newD = [...prev];
                if (num > prev.length) for(let i=prev.length; i<num; i++) newD.push({ service: prev[0]?.service||defaultService, staff: '隨機', isOil: false });
                else newD.length = num;
                return newD;
            });
        };

        const handleGuestUpdate = (idx, field, val) => {
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const c = [...prev]; c[idx] = { ...c[idx] };
                if (field === 'service') { c[idx].service = val; if(val && (val.includes('足')||val.includes('Foot'))) c[idx].isOil = false; }
                else if (field === 'staff') {
                    if (val === 'FEMALE_OIL') { c[idx].staff='女'; c[idx].isOil=true; }
                    else if (val === '女') { c[idx].staff='女'; c[idx].isOil=false; }
                    else { c[idx].staff=val; c[idx].isOil=false; }
                }
                return c;
            });
        };

        const performCheck = async (e) => {
            if (e) e.preventDefault();
            setIsChecking(true); setCheckResult(null); setSuggestions([]);
            let currentStaffList = serverData?.staff || safeStaffList;
            let currentBookings = serverData?.bookings || safeBookings;
            if (editingBooking) { currentBookings = currentBookings.filter(b => b.rowId !== editingBooking.rowId); }
            if (!serverData) {
                const freshData = await fetchLiveServerData(false);
                if (freshData) { setServerData(freshData); currentStaffList = freshData.staff; currentBookings = freshData.bookings; }
            }
            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, currentBookings, currentStaffList);
            if (res.valid) { 
                setCheckResult({ status: 'OK', message: "✅ 此時段可預約 (Available)", coreDetails: res.details }); 
            } else {
                setCheckResult({ status: 'FAIL', message: res.reason });
                const found = [];
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0]||0)*60 + (parts[1]||0);
                for (let i=1; i<=24; i++) {
                    let nM = currMins + (i*10); let h = Math.floor(nM/60); let m = nM%60; if(h>=24) h-=24;
                    let tStr = `${String(h).padStart(2,'0')}:${String(Math.floor(m/10)*10).padStart(2,'0')}`;
                    if (callCoreAvailabilityCheck(form.date, tStr, guestDetails, currentBookings, currentStaffList).valid) {
                        found.push(tStr); if(found.length>=4) break;
                    }
                }
                setSuggestions(found);
            }
            setIsChecking(false);
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入顧客姓名！"); return; }
            setIsSubmitting(true);
            try {
                let checkBookings = serverData?.bookings || safeBookings;
                if (editingBooking) checkBookings = checkBookings.filter(b => b.rowId !== editingBooking.rowId);
                const finalCheck = callCoreAvailabilityCheck(form.date, form.time, guestDetails, checkBookings, serverData?.staff || safeStaffList);
                
                const detailedGuests = guestDetails.map((g, i) => {
                    const detail = finalCheck.details ? finalCheck.details.find(d => d.guestIndex === i) : null;
                    return {
                        ...g, staff: g.staff, 
                        flow: detail ? detail.flow : 'FB', 
                        phase1_duration: detail ? detail.phase1_duration : null,
                        phase2_duration: detail ? detail.phase2_duration : null,
                    };
                });
                
                const oils = detailedGuests.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean);
                const flows = detailedGuests.map((g, i) => {
                    if (g.flow === 'BF') return `K${i+1}:先做身體`; 
                    if (g.flow === 'FB') return `K${i+1}:先做腳`;   
                    return null;
                }).filter(Boolean);
                const noteParts = [...oils, ...flows];
                const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";

                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: detailedGuests.map(g=>g.service).join(','), pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: detailedGuests[0].staff, isOil: detailedGuests[0].isOil,
                    staffId2: detailedGuests[1]?.staff||null, staffId3: detailedGuests[2]?.staff||null,
                    staffId4: detailedGuests[3]?.staff||null, staffId5: detailedGuests[4]?.staff||null, staffId6: detailedGuests[5]?.staff||null,
                    ghiChu: noteStr, guestDetails: detailedGuests, proposedUpdates: finalCheck.proposedUpdates || [],
                    phase1_duration: detailedGuests[0].phase1_duration, phase2_duration: detailedGuests[0].phase2_duration,
                    rowId: editingBooking ? editingBooking.rowId : null
                };
                
                if (onSave) { await Promise.resolve(onSave(payload)); forceGlobalRefresh(); setTimeout(()=>{onClose();setIsSubmitting(false);}, 500); }
            } catch(err) { alert("儲存失敗: "+err.message); setIsSubmitting(false); }
        };

        const HOURS_LIST = ['08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','00','01','02'];
        const MINUTES_STEP = ['00', '10', '20', '30', '40', '50'];
        const [cH, cM] = (form.time || "12:00").split(':');
        const paxOptions = [1,2,3,4,5,6];

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
                    <div className={`${editingBooking ? 'bg-orange-600' : 'bg-[#0891b2]'} p-4 text-white flex justify-between items-center shrink-0`}>
                        <h3 className="font-bold text-lg">{editingBooking ? "✏️ 修改預約 (Edit)" : "📅 電話預約 (V103.0)"}</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step==='CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold text-gray-500">日期</label><input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form,date:e.target.value});setCheckResult(null);}}/></div>
                                    <div><label className="text-xs font-bold text-gray-500">時間</label>
                                    <div className="flex items-center gap-1"><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cH} onChange={e=>handleTimeChange('HOUR',e.target.value)}>{HOURS_LIST.map(h=><option key={h} value={h}>{h}</option>)}</select></div><span className="font-bold">:</span><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cM} onChange={e=>handleTimeChange('MINUTE',e.target.value)}>{MINUTES_STEP.map(m=><option key={m} value={m}>{m}</option>)}</select></div></div></div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2"><div className="text-xs font-bold text-gray-400">詳細需求</div>
                                    {guestDetails.map((g,i)=>(
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師</option><option value="FEMALE_OIL">🚺+油</option><option value="男">🚹 男師</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
                                    ))}
                                </div>
                                <div>
                                    {!checkResult ? 
                                        <button onClick={performCheck} disabled={isChecking} className={`w-full text-white p-3 rounded font-bold shadow-lg flex justify-center items-center ${isChecking ? 'bg-gray-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                                            {isChecking ? "正在計算 (Guardrail V103)..." : "🔍 查詢空位 (Instant Check)"}
                                        </button> 
                                        : 
                                        <div className="space-y-3">
                                            <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>
                                            {checkResult.status==='FAIL'&&suggestions.length>0&&(<div className="bg-yellow-50 p-3 rounded border border-yellow-200"><div className="text-xs font-bold text-yellow-700 mb-2">💡 建議時段:</div><div className="flex gap-2 flex-wrap">{suggestions.map(t=><button key={t} onClick={()=>{setForm(f=>({...f,time:t}));setCheckResult(null);setSuggestions([]);}} className="px-3 py-1 bg-white border border-yellow-300 text-yellow-800 rounded font-bold hover:bg-yellow-100">{t}</button>)}</div></div>)}
                                            {checkResult.status==='OK'?<button onClick={()=>setStep('INFO')} className="w-full bg-emerald-600 text-white p-3 rounded font-bold shadow-lg animate-pulse hover:bg-emerald-700">➡️ 下一步</button>:<button onClick={()=>{setCheckResult(null);setSuggestions([])}} className="w-full bg-gray-400 text-white p-3 rounded font-bold hover:bg-gray-500">🔄 重新選擇</button>}
                                        </div>
                                    }
                                </div>
                            </>
                        )}
                        {step==='INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-green-50 p-3 rounded border border-green-200 text-green-800 font-bold">
                                    <div className="flex justify-between border-b border-green-200 pb-2 mb-2"><span>{form.date}</span><span>{form.time}</span></div>
                                    <div className="text-sm font-normal space-y-1">
                                        {checkResult && checkResult.coreDetails && checkResult.coreDetails.map((d, i) => (
                                            <div key={i} className="flex justify-between items-center bg-white p-1 rounded border border-green-100">
                                                <span>#{i+1} {d.service}</span>
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex gap-1">
                                                        <span className="bg-green-100 px-2 py-0.5 rounded text-green-700 text-xs font-bold">{d.staff}</span>
                                                        {d.flow === 'BF' && <span className="bg-orange-100 px-2 py-0.5 rounded text-orange-700 border border-orange-300 text-xs font-bold">⚠️ 先做身體</span>}
                                                        {d.flow === 'FB' && <span className="bg-blue-100 px-2 py-0.5 rounded text-blue-700 border border-blue-300 text-xs font-bold">🦶 先做腳</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full border p-3 rounded font-bold outline-none" value={form.custName} onChange={e=>setForm({...form,custName:e.target.value})} placeholder="請輸入顧客姓名..." disabled={isSubmitting}/></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼</label><input className="w-full border p-3 rounded font-bold outline-none" value={form.custPhone} onChange={e=>setForm({...form,custPhone:e.target.value})} placeholder="09xx..." disabled={isSubmitting}/></div>
                                <div className="flex gap-2 pt-2"><button onClick={(e)=>{e.preventDefault();if(!isSubmitting)setStep('CHECK');}} className="flex-1 bg-gray-200 p-3 rounded font-bold text-gray-700 hover:bg-gray-300" disabled={isSubmitting}>⬅️ 返回</button><button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting?"處理中...": (editingBooking ? "💾 保存修改" : "✅ 確認預約")}</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 5. COMPONENT: WALK-IN MODAL
    // ==================================================================================
    const NewWalkInModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);
        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [waitSuggestion, setWaitSuggestion] = useState(null); 
        const [isSubmitting, setIsSubmitting] = useState(false); 
        const [isChecking, setIsChecking] = useState(false);
        const [serverData, setServerData] = useState(null);

        useEffect(() => { fetchLiveServerData(true).then(data => { if (data) setServerData(data); }); }, []);

        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2,'0');
        let currentMin = Math.ceil(now.getMinutes() / 10) * 10;
        let startHour = parseInt(currentHour);
        if (currentMin >= 60) { currentMin = 0; startHour += 1; }
        const currentTimeStr = `${startHour.toString().padStart(2,'0')}:${currentMin === 0 ? '00' : currentMin}`;
        const todayStr = initialDate || now.toISOString().slice(0, 10);
        
        const defaultService = (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) ? window.SERVICES_LIST[2] : "Body Massage";
        const [form, setForm] = useState({ pax: 1, custName: '現場客', custPhone: '', time: currentTimeStr, date: todayStr });
        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
            setForm(prev => ({ ...prev, pax: num })); setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const newD = [...prev];
                if (num > prev.length) for(let i=prev.length; i<num; i++) newD.push({ service: prev[0]?.service||defaultService, staff: '隨機', isOil: false });
                else newD.length = num;
                return newD;
            });
        };

        const handleGuestUpdate = (idx, field, val) => {
            setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const c = [...prev]; c[idx] = { ...c[idx] };
                if (field === 'service') { c[idx].service = val; if(val && (val.includes('足')||val.includes('Foot'))) c[idx].isOil = false; }
                else if (field === 'staff') {
                    if (val === 'FEMALE_OIL') { c[idx].staff='女'; c[idx].isOil=true; }
                    else if (val === '女') { c[idx].staff='女'; c[idx].isOil=false; }
                    else { c[idx].staff=val; c[idx].isOil=false; }
                }
                return c;
            });
        };

        const performCheck = async (e) => {
            if (e) e.preventDefault();
            setIsChecking(true); setCheckResult(null); setWaitSuggestion(null);
            let currentStaffList = serverData?.staff || safeStaffList;
            let currentBookings = serverData?.bookings || safeBookings;
            if (!serverData) {
                const freshData = await fetchLiveServerData(false);
                if (freshData) { setServerData(freshData); currentStaffList = freshData.staff; currentBookings = freshData.bookings; }
            }
            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, currentBookings, currentStaffList);
            if (res.valid) { 
                setCheckResult({ status: 'OK', message: "✅ 目前有空位 (Available Now)", coreDetails: res.details }); 
                setWaitSuggestion(null); 
            } else {
                if (res.reason.includes("System") || res.reason.includes("Error")) { setCheckResult({ status: 'FAIL', message: res.reason }); setIsChecking(false); return; }
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0]||0)*60 + (parts[1]||0);
                let foundTime = null, foundDate = form.date, waitMins = 0, isNextDay = false;
                for (let i=1; i<=18; i++) {
                    let nM = currMins + (i*10); let h = Math.floor(nM/60); let m = nM%60; if(h>=24) h-=24;
                    let tStr = `${String(h).padStart(2,'0')}:${String(Math.floor(m/10)*10).padStart(2,'0')}`;
                    if (callCoreAvailabilityCheck(form.date, tStr, guestDetails, currentBookings, currentStaffList).valid) { foundTime=tStr; waitMins=i*10; break; }
                }
                if (!foundTime) {
                    const tmr = new Date(form.date); tmr.setDate(tmr.getDate() + 1);
                    const tomorrowStr = tmr.toISOString().slice(0, 10);
                    const openH = 8;
                    for (let t = openH*60; t < openH*60 + 240; t += 10) {
                        const h = Math.floor(t / 60); const m = t % 60;
                        const tStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                        if (callCoreAvailabilityCheck(tomorrowStr, tStr, guestDetails, currentBookings, currentStaffList).valid) { foundTime=tStr; foundDate=tomorrowStr; isNextDay=true; break; }
                    }
                }
                if (foundTime) { setCheckResult({ status: 'FAIL', message: isNextDay?"⛔ 今日已滿":"⚠️ 需等待" }); setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay }); }
                else { setCheckResult({ status: 'FAIL', message: "❌ 預約已滿 (Fully Booked)" }); setWaitSuggestion(null); }
            }
            setIsChecking(false);
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入姓名！"); return; }
            setIsSubmitting(true);
            try {
                const finalCheck = callCoreAvailabilityCheck(form.date, form.time, guestDetails, serverData?.bookings || safeBookings, serverData?.staff || safeStaffList);
                const detailedGuests = guestDetails.map((g, i) => {
                    const detail = finalCheck.details ? finalCheck.details.find(d => d.guestIndex === i) : null;
                    return { 
                        ...g, staff: g.staff, 
                        flow: detail ? detail.flow : 'FB', 
                        phase1_duration: detail ? detail.phase1_duration : null,
                        phase2_duration: detail ? detail.phase2_duration : null
                    };
                });
                const oils = detailedGuests.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean);
                const flows = detailedGuests.map((g, i) => {
                    if (g.flow === 'BF') return `K${i+1}:先做身體`;
                    if (g.flow === 'FB') return `K${i+1}:先做腳`;
                    return null;
                }).filter(Boolean);
                const noteParts = [...oils, ...flows];
                const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";

                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: detailedGuests.map(g=>g.service).join(','), pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: detailedGuests[0].staff, isOil: detailedGuests[0].isOil,
                    staffId2: detailedGuests[1]?.staff||null, staffId3: detailedGuests[2]?.staff||null,
                    staffId4: detailedGuests[3]?.staff||null, staffId5: detailedGuests[4]?.staff||null, staffId6: detailedGuests[5]?.staff||null,
                    ghiChu: noteStr, guestDetails: detailedGuests, proposedUpdates: finalCheck.proposedUpdates || [],
                    phase1_duration: detailedGuests[0].phase1_duration, phase2_duration: detailedGuests[0].phase2_duration
                };
                if (onSave) { await Promise.resolve(onSave(payload)); forceGlobalRefresh(); setTimeout(()=>{onClose();setIsSubmitting(false);}, 500); }
            } catch(err) { alert("錯誤: "+err.message); setIsSubmitting(false); }
        };

        const paxOptions = [1,2,3,4,5,6];

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-600 p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">⚡ 現場客 (V103.0)</h3>
                        <button onClick={onClose}><i className="fas fa-times text-xl"></i></button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    {guestDetails.map((g, i) => (
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師</option><option value="FEMALE_OIL">🚺+油</option><option value="男">🚹 男師</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
                                    ))}
                                </div>
                                {checkResult && (<div className="space-y-2"><div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>{waitSuggestion&&(<div className="bg-blue-50 border border-blue-200 p-3 rounded animate-fadeIn text-center"><div className={`mb-2 font-bold text-lg ${waitSuggestion.isNextDay?'text-orange-600':'text-blue-700'}`}>{waitSuggestion.isNextDay ? `🌅 最快明天: ${waitSuggestion.time}` : `⏳ 需等待 ${waitSuggestion.mins} 分鐘 (${waitSuggestion.time})`}</div><button onClick={(e) => { e.preventDefault(); setForm({...form, time: waitSuggestion.time, date: waitSuggestion.date}); setStep('INFO'); }} className="w-full bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">➡️ 接受安排</button></div>)}</div>)}
                                <div className="pt-2 grid grid-cols-2 gap-3"><button onClick={onClose} className="bg-gray-100 text-gray-500 font-bold p-3 rounded hover:bg-gray-200">取消</button>
                                {(!checkResult || checkResult.status === 'FAIL') ? 
                                    <button onClick={performCheck} disabled={isChecking} className={`font-bold p-3 rounded shadow-lg flex justify-center items-center text-white ${isChecking?'bg-gray-400':'bg-amber-500 hover:bg-amber-600'}`}>
                                        {isChecking ? "計算中 (Guardrail V103)..." : "🔍 檢查"}
                                    </button> : 
                                    <button onClick={() => setStep('INFO')} className="bg-emerald-600 text-white font-bold p-3 rounded hover:bg-emerald-700 shadow-lg animate-pulse">➡️ 下一步</button>}
                                </div>
                            </>
                        )}
                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-amber-50 p-3 rounded border border-amber-200 text-amber-900 font-bold">
                                    <div className="flex justify-between border-b border-amber-200 pb-2 mb-2"><span>{form.date}</span><span>{form.time}</span></div>
                                    <div className="text-sm font-normal space-y-1">
                                        {checkResult && checkResult.coreDetails && checkResult.coreDetails.map((d, i) => (
                                            <div key={i} className="flex justify-between items-center bg-white p-1 rounded border border-amber-100">
                                                <span>#{i+1} {d.service}</span>
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex gap-1">
                                                        <span className="bg-amber-100 px-2 py-0.5 rounded text-amber-700 text-xs font-bold">{d.staff}</span>
                                                        {d.flow === 'BF' && <span className="bg-red-100 px-2 py-0.5 rounded text-red-700 border border-red-300 text-xs font-bold">⚠️ 先做身體</span>}
                                                        {d.flow === 'FB' && <span className="bg-blue-100 px-2 py-0.5 rounded text-blue-700 border border-blue-300 text-xs font-bold">🦶 先做腳</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custName} onChange={e=>setForm({...form,custName:e.target.value})} placeholder="顧客姓名..." disabled={isSubmitting}/>
                                <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custPhone} onChange={e=>setForm({...form,custPhone:e.target.value})} placeholder="電話號碼..." disabled={isSubmitting}/>
                                <div className="grid grid-cols-2 gap-3 pt-2"><button onClick={(e) => {e.preventDefault(); if(!isSubmitting) setStep('CHECK');}} className="bg-gray-200 text-gray-600 p-3 rounded font-bold" disabled={isSubmitting}>⬅️ 返回</button><button onClick={handleFinalSave} className="bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting ? "處理中..." : "✅ 確認開單"}</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 6. SYSTEM INJECTION (AUTO UPGRADE)
    // ==================================================================================
    const overrideInterval = setInterval(() => {
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) { 
            window.AvailabilityCheckModal = NewAvailabilityCheckModal; 
            console.log("♻️ AvailabilityModal Injected (V103.0 Guardrail)"); 
        }
        if (window.WalkInModal !== NewWalkInModal) { 
            window.WalkInModal = NewWalkInModal; 
            console.log("♻️ WalkInModal Injected (V103.0 Guardrail)"); 
        }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);

})();
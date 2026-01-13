/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - FRONTEND CONTROLLER & LOGIC BRIDGE
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V101.1 (SYNCED WITH CORE: STRICT PHYSICAL INHERITANCE)
 * NGÀY CẬP NHẬT: 2026/01/13
 * TÁC GIẢ: AI ASSISTANT & USER
 *
 * * * * * CHANGE LOG V101.1 (THE "REALITY CHECK" UPDATE):
 * 1. [CRITICAL] CORE KERNEL REPLACEMENT (V101.1):
 * - Đã thay thế hoàn toàn bộ não cũ bằng Core V101.1.
 * - Tích hợp "Strict Physical Inheritance": Hệ thống ưu tiên đọc trường `allocated_resource` 
 * để xác định vị trí thực tế của khách cũ, ngăn chặn hiện tượng trôi lịch (Drifting).
 * - Regex Parser thông minh hơn để trích xuất số ghế/giường từ ID.
 *
 * 2. [LOGIC] BRIDGE DATA MAPPING:
 * - Cập nhật hàm `callCoreAvailabilityCheck` để map dữ liệu từ API vào Core chính xác hơn.
 * - Đảm bảo `allocated_resource` được truyền vào từ dữ liệu đặt phòng hiện tại.
 *
 * 3. [UI/UX] PRESERVED & ENHANCED:
 * - Giữ nguyên giao diện Modal Đặt lịch và Walk-in.
 * - Code được viết theo phong cách Long-form, chú thích chi tiết để dễ bảo trì.
 * =================================================================================================
 */

(function() {
    console.log("🚀 BookingHandler V101.1: Reality Check & Strict Inheritance Loaded.");

    // Kiểm tra môi trường React
    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React not found. Cannot start BookingHandler V101.1.");
        return;
    }

    // ========================================================================
    // PHẦN 1: CORE KERNEL V101.1 (CLIENT-SIDE BRAIN - FULLY SYNCED)
    // Mô tả: Bộ não tính toán trung tâm, đồng bộ 100% với file resource_core.js V101.1
    // ========================================================================
    const CoreKernel = (function() {
        
        // --- 1. CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION) ---
        // Các tham số này quyết định giới hạn vật lý và thời gian của tiệm
        const CONFIG = {
            // Tài nguyên phần cứng
            MAX_CHAIRS: 6,        
            MAX_BEDS: 6,          
            MAX_TOTAL_GUESTS: 12, 
            
            // Cấu hình thời gian hoạt động
            OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
            
            // Bộ đệm thời gian (Time Buffers - Đơn vị: Phút)
            CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi ca
            TRANSITION_BUFFER: 5, // Thời gian khách di chuyển hoặc thay đồ
            
            // Dung sai và giới hạn tính toán
            TOLERANCE: 1,         // Sai số cho phép (phút) khi so sánh trùng lặp
            MAX_TIMELINE_MINS: 1440 // Tổng số phút trong 24h
        };

        // Cơ sở dữ liệu dịch vụ (Dynamic Services Database)
        // Sẽ được cập nhật từ Google Sheets thông qua hàm setDynamicServices
        let SERVICES = {}; 

        // --- 2. QUẢN LÝ DỊCH VỤ (SERVICE MANAGEMENT) ---
        /**
         * Cập nhật danh sách dịch vụ từ nguồn bên ngoài và merge với dịch vụ hệ thống.
         * @param {Object} newServicesObj - Danh sách dịch vụ mới
         */
        function setDynamicServices(newServicesObj) {
            const systemServices = {
                'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
                'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
                'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
                'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
            };
            // Merge dịch vụ mới vào, ưu tiên dịch vụ hệ thống nếu trùng key
            SERVICES = { ...newServicesObj, ...systemServices };
            // console.log(`[CoreKernel V101.1] Services synced. Total: ${Object.keys(SERVICES).length}`);
        }

        // --- 3. TIỆN ÍCH THỜI GIAN (TIME UTILITIES) ---
        
        /**
         * Chuyển đổi chuỗi giờ (HH:mm) thành số phút tính từ 00:00.
         * Hỗ trợ xử lý qua đêm (VD: 01:00 sáng -> 25:00 -> 1500 phút).
         */
        function getMinsFromTimeStr(timeStr) {
            if (!timeStr) return -1; 
            try {
                let str = timeStr.toString();
                // Xử lý định dạng ISO "2023-10-10T12:00:00" hoặc có ngày đi kèm
                if (str.includes('T') || str.includes(' ')) {
                    const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
                    if (timeMatch) str = timeMatch[0];
                }
                // Chuẩn hóa dấu hai chấm
                let cleanStr = str.trim().replace(/：/g, ':');
                const parts = cleanStr.split(':');
                if (parts.length < 2) return -1;
                
                let h = parseInt(parts[0], 10);
                let m = parseInt(parts[1], 10);
                
                if (isNaN(h) || isNaN(m)) return -1;
                
                // Logic giờ qua đêm: Nếu giờ nhỏ hơn giờ mở cửa (8h), coi như thuộc ngày hôm sau (cộng thêm 24h)
                if (h < CONFIG.OPEN_HOUR) h += 24; 
                
                return (h * 60) + m;
            } catch (e) {
                return -1;
            }
        }

        /**
         * Chuyển đổi số phút thành chuỗi giờ (HH:mm).
         */
        function getTimeStrFromMins(mins) {
            let h = Math.floor(mins / 60);
            let m = mins % 60;
            if (h >= 24) h -= 24; 
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

        /**
         * Kiểm tra sự trùng lặp giữa 2 khoảng thời gian [StartA, EndA] và [StartB, EndB].
         * Có sử dụng TOLERANCE để tránh các trường hợp tiếp xúc quá sát gây lỗi làm tròn.
         */
        function isOverlap(startA, endA, startB, endB) {
            const safeEndA = endA - CONFIG.TOLERANCE; 
            const safeEndB = endB - CONFIG.TOLERANCE;
            // Hai khoảng trùng nhau khi Start này nhỏ hơn End kia và ngược lại
            return (startA < safeEndB) && (startB < safeEndA);
        }

        // --- 4. BỘ NHẬN DIỆN THÔNG MINH (SMART CLASSIFIER) ---
        
        /**
         * Xác định xem một dịch vụ có phải là Combo (kết hợp nhiều công đoạn) hay không.
         */
        function isComboService(serviceObj, serviceNameRaw = '') {
            // Trường hợp tệ nhất: Không có dữ liệu gì
            if (!serviceObj && !serviceNameRaw) return false;
            
            // 1. Kiểm tra Category chuẩn trong Database
            const cat = (serviceObj && serviceObj.category ? serviceObj.category : '').toString().toUpperCase().trim();
            if (cat === 'COMBO' || cat === 'MIXED') return true;

            // 2. Kiểm tra Tên Dịch vụ (Robust Check - Kiểm tra cả tên DB và tên Raw)
            const dbName = (serviceObj && serviceObj.name ? serviceObj.name : '').toString().toUpperCase();
            const rawName = (serviceNameRaw || '').toString().toUpperCase();
            const nameToCheck = dbName + " | " + rawName;
            
            const comboKeywords = [
                'COMBO', '套餐', 'MIX', '+', 'SET', 
                '腳身', '全餐', 'FOOT AND BODY', 'BODY AND FOOT',
                '雙人', 'A餐', 'B餐', 'C餐', '油壓+足'
            ];
            
            for (const kw of comboKeywords) {
                if (nameToCheck.includes(kw)) {
                    return true;
                }
            }
            return false;
        }

        /**
         * Xác định loại tài nguyên (CHAIR hoặc BED) dựa trên thông tin dịch vụ.
         */
        function detectResourceType(serviceObj) {
            if (!serviceObj) return 'CHAIR';
            
            // Ưu tiên config cứng
            if (serviceObj.type === 'BED' || serviceObj.type === 'CHAIR') return serviceObj.type;

            // Phân tích tên nếu config không rõ ràng
            const name = (serviceObj.name || '').toUpperCase();
            if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|SPA|BACK/)) return 'BED';
            
            return 'CHAIR'; // Mặc định an toàn
        }

        // --- 5. MATRIX ENGINE V101.1 (STRICT INHERITANCE READY) ---
        
        class VirtualMatrix {
            constructor() {
                // Khởi tạo các làn chứa (Lanes) cho từng loại tài nguyên
                this.lanes = {
                    'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
                    'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
                };
            }

            /**
             * Helper: Kiểm tra xem một làn cụ thể có trống không trong khoảng thời gian cho trước.
             */
            checkLaneFree(lane, start, end) {
                for (let block of lane.occupied) {
                    if (isOverlap(start, end, block.start, block.end)) {
                        return false; // Bị trùng
                    }
                }
                return true; // Trống
            }

            /**
             * Helper: Thực hiện đặt chỗ vào làn
             */
            allocateToLane(lane, start, end, ownerId) {
                lane.occupied.push({ start, end, ownerId });
                // Sort lại để dễ debug và hiển thị timeline
                lane.occupied.sort((a, b) => a.start - b.start);
                return lane.id;
            }

            /**
             * [V101.1 UPDATED] Try Allocate with Preferred Index
             * Hàm này hỗ trợ cả Khách Cũ (Physical Inheritance) và Khách Mới (Modulo).
             * @param {string} type - Loại tài nguyên ('BED', 'CHAIR')
             * @param {number} start - Phút bắt đầu
             * @param {number} end - Phút kết thúc
             * @param {string} ownerId - ID booking để tracking
             * @param {number|null} preferredIndex - Chỉ số ưu tiên (1-based). 
             * - Nếu là khách cũ: Đây là Anchor Index (vị trí thực tế trên timeline).
             * - Nếu là khách mới: Đây là Modulo Index (vị trí chia bài).
             */
            tryAllocate(type, start, end, ownerId, preferredIndex = null) {
                const resourceGroup = this.lanes[type];
                if (!resourceGroup) return null; 

                // CHIẾN LƯỢC 1: TARGETED ALLOCATION (Ưu tiên vị trí định sẵn)
                // Đây là nơi "Strict Inheritance" hoạt động. Nếu khách cũ đã có preferredIndex (VD: 3),
                // hệ thống sẽ KIỂM TRA SLOT 3 ĐẦU TIÊN.
                if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
                    const targetLane = resourceGroup[preferredIndex - 1]; // Array index là 0-based
                    if (this.checkLaneFree(targetLane, start, end)) {
                        return this.allocateToLane(targetLane, start, end, ownerId);
                    }
                    // Nếu vị trí ưu tiên đã bị chiếm, rơi xuống Chiến lược 2 (Fallback)
                }

                // CHIẾN LƯỢC 2: FIRST-FIT (Vét cạn tìm chỗ trống bất kỳ)
                // Duyệt qua tất cả các làn, làn nào trống thì điền vào ngay
                for (let lane of resourceGroup) {
                    if (this.checkLaneFree(lane, start, end)) {
                        return this.allocateToLane(lane, start, end, ownerId);
                    }
                }

                return null; // Hết sạch chỗ
            }
        }

        /**
         * Hàm phụ trợ cho logic Squeeze (Bóp mềm): Kiểm tra xem một tập hợp các block có thể nhét vào matrix không.
         * [V101.1 UPDATE] Hỗ trợ kiểm tra forcedIndex trong quá trình Squeeze.
         */
        function isBlockSetAllocatable(blocks, matrix) {
            for (const b of blocks) {
                const laneGroup = matrix.lanes[b.type];
                if (!laneGroup) return false;
                
                let foundLane = false;
                
                // [V101.1] Kiểm tra ưu tiên index trước
                if (b.forcedIndex && b.forcedIndex > 0 && b.forcedIndex <= laneGroup.length) {
                    const targetLane = laneGroup[b.forcedIndex - 1];
                    let isFree = true;
                    for (const occ of targetLane.occupied) {
                        if (isOverlap(b.start, b.end, occ.start, occ.end)) { isFree = false; break; }
                    }
                    if (isFree) return true; // Nếu vị trí cũ còn trống thì chắc chắn OK
                }

                // Nếu không có ưu tiên hoặc ưu tiên bị bận, quét tất cả (Fallback)
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

        // --- 6. LOGIC TÌM NHÂN VIÊN (STAFF FINDER) ---
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
                // 1. Staff phải tồn tại và không OFF
                if (!staffInfo || staffInfo.off) return false; 
                
                // 2. Kiểm tra giờ làm việc (Shift)
                const shiftStart = getMinsFromTimeStr(staffInfo.start); 
                const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
                if (shiftStart === -1 || shiftEnd === -1) return false; 

                if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
                
                // Xử lý cờ Strict Time (Nghiêm ngặt giờ về - không nhận khách quá giờ)
                const isStrict = staffInfo.isStrictTime === true;
                if (isStrict) {
                    if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
                } else {
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

            if (staffReq && !['RANDOM', 'MALE', 'FEMALE', '隨機', 'Any', 'undefined'].includes(staffReq)) {
                return checkOneStaff(staffReq) ? staffReq : null;
            } 
            else {
                // Tìm random: Ưu tiên ai rảnh thì lấy
                const allStaffNames = Object.keys(staffListRef);
                for (const name of allStaffNames) {
                    if (checkOneStaff(name)) return name;
                }
                return null;
            }
        }

        // --- 7. BỘ HELPER SINH BIẾN THỂ THỜI GIAN (ELASTIC GENERATOR) ---
        function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
            // Nếu đã bị khóa Phase 1 (Do người dùng chỉnh tay hoặc hệ thống chốt)
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
                // Biến thể A: Giảm Phase 1 (Chân ít hơn)
                let p1_A = standardHalf - currentDeviation;
                let p2_A = totalDuration - p1_A;
                if (p1_A >= 15 && p2_A >= 15) options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
                
                // Biến thể B: Tăng Phase 1 (Chân nhiều hơn)
                let p1_B = standardHalf + currentDeviation;
                let p2_B = totalDuration - p1_B;
                if (p1_B >= 15 && p2_B >= 15) options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
                currentDeviation += step;
            }
            // Sắp xếp các phương án theo độ lệch chuẩn tăng dần (Ưu tiên 50/50 nhất)
            options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
            return options;
        }

        // --- 8. MAIN LOGIC V101.1 (MODULO INTERLEAVING & PHYSICAL INHERITANCE) ---
        
        /**
         * HÀM KIỂM TRA KHẢ DỤNG CHÍNH - PHIÊN BẢN V101.1
         * Tích hợp: 
         * - Modulo Allocation (Cho khách mới)
         * - Strict Physical Inheritance (Cho khách cũ - Chống trôi lịch)
         */
        function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

            // ------------------------------------------------------------------------
            // BƯỚC A: CHUẨN BỊ DỮ LIỆU KHÁCH CŨ (PRE-PROCESSING & INDEX PARSING)
            // ------------------------------------------------------------------------
            let existingBookingsProcessed = [];
            // Sắp xếp booking hiện tại theo thời gian để xử lý tuần tự
            let sortedCurrentBookings = [...currentBookingsRaw].sort((a, b) => {
                return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
            });

            sortedCurrentBookings.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                if (bStart === -1) return;

                let svcInfo = SERVICES[b.serviceCode] || {};
                let isCombo = isComboService(svcInfo, b.serviceName);
                let duration = b.duration || 60;
                
                // [V101.1 CRITICAL FIX] STRICT PHYSICAL INHERITANCE
                // Logic: Thay vì dùng RowID (có thể là số dòng Excel 100+), ta dùng 'allocated_resource'
                // để tìm đúng số ghế/giường (1-6).
                let anchorIndex = null;
                
                // Ưu tiên 1: Lấy từ trường allocated_resource (được sync từ Server/Timeline)
                if (b.allocated_resource) {
                    const match = b.allocated_resource.toString().match(/(\d+)/);
                    if (match) {
                        anchorIndex = parseInt(match[0]);
                    }
                } 
                // Fallback (An toàn): Kiểm tra rowId nếu nó có dạng Resource ID (VD: BED-3)
                else if (b.rowId && typeof b.rowId === 'string' && (b.rowId.includes('BED') || b.rowId.includes('CHAIR'))) {
                     const match = b.rowId.toString().match(/(\d+)/);
                     if (match) anchorIndex = parseInt(match[0]);
                }
                
                // Nếu anchorIndex là null, booking này sẽ được xếp theo chế độ First-Fit.

                let processedB = {
                    id: b.rowId, 
                    originalData: b, 
                    staffName: b.staffName, 
                    serviceName: b.serviceName, 
                    category: svcInfo.category,
                    isElastic: isCombo && (b.isManualLocked !== true) && (b.status !== 'Running'),
                    elasticStep: svcInfo.elasticStep || 5, 
                    elasticLimit: svcInfo.elasticLimit || 15,
                    startMins: bStart,
                    duration: duration,
                    blocks: [], 
                    anchorIndex: anchorIndex // Lưu lại index này để dùng cho logic thừa kế
                };

                if (isCombo) {
                    let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
                    let p2 = duration - p1;
                    const p1End = bStart + p1;
                    const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                    
                    // --- LOGIC NHẬN DIỆN FLOW KHÁCH CŨ ---
                    let isBodyFirst = false;
                    const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
                    
                    // 1. Kiểm tra Tag tường minh
                    if (b.flow === 'BF' || noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體') || noteContent.includes('先身')) {
                        isBodyFirst = true;
                    }
                    // 2. Kiểm tra vị trí vật lý (Fallback Logic)
                    else if (b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) {
                        isBodyFirst = true;
                    }

                    // [V101.1 LOGIC] Áp dụng Anchor Index vào các Block (Inheritance)
                    // Nếu anchorIndex tồn tại (VD: 3), ta gán nó vào `forcedIndex` của block tương ứng.
                    if (isBodyFirst) {
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: anchorIndex }); 
                        processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'CHAIR', forcedIndex: anchorIndex });
                        processedB.flow = 'BF'; 
                    } else {
                        // Mặc định là FB (Chân trước)
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: anchorIndex }); 
                        processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED', forcedIndex: anchorIndex });
                        processedB.flow = 'FB'; 
                    }
                    
                    processedB.p1_current = p1; 
                    processedB.p2_current = p2;
                } else {
                    let rType = detectResourceType(svcInfo);
                    // Single Service cũng tôn trọng vị trí hiện tại
                    processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
                }
                existingBookingsProcessed.push(processedB);
            });

            // ------------------------------------------------------------------------
            // BƯỚC B: TẠO DANH SÁCH "PENDULUM" (CON LẮC) - PHÂN PHỐI FLOW
            // ------------------------------------------------------------------------
            const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
            const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return isComboService(s, g.serviceCode); });
            
            // [V101.1] Tính toán kích thước "Nửa nhóm" (Half Size) để dùng cho công thức Modulo
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
                        
                        // [V101.1 CRITICAL] Truyền forcedIndex (Inheritance)
                        // Hệ thống sẽ cố gắng đặt khách cũ vào đúng số ghế/giường cũ của họ (Anchor Index)
                        const slotId = matrix.tryAllocate(
                            block.type, 
                            block.start, 
                            realEnd, 
                            exB.id, 
                            block.forcedIndex // <-- Đây là chìa khóa của Strict Inheritance
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
                    
                    // [V101.1 LOGIC] Tính toán Preferred Index (Chỉ số ưu tiên) dựa trên Modulo
                    // Logic: Chia bài so le để tối ưu tài nguyên
                    let preferredIdx = null;
                    if (halfSize > 0) {
                        // Chúng ta sử dụng global index (item.guest.idx) để tính toán
                        preferredIdx = (item.guest.idx % halfSize) + 1;
                    }

                    for (const block of item.blocks) {
                        // Gọi hàm cấp phát mới với tham số preferredIndex
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

                // === GIAI ĐOẠN 4: CHIẾN THUẬT SQUEEZE (BÓP MỀM) - V101.1 ===
                if (conflictFound) {
                    let matrixSqueeze = new VirtualMatrix();
                    let updatesProposed = [];
                    const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
                    hardBookings.forEach(hb => {
                        // Squeeze cũng phải tôn trọng Inheritance (forcedIndex)
                        hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
                    });

                    let squeezeScenarioPossible = true;
                    // Với Squeeze, ta cũng áp dụng Modulo Allocation để tối ưu
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
                            
                            // Sử dụng hàm kiểm tra set block mới (Updated V101.1)
                            if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                                testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id, tb.forcedIndex));
                                fit = true;
                                if (split.deviation !== 0) {
                                    updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze V101.1' });
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
                    feasible: true, 
                    strategy: 'MATRIX_PENDULUM_V101.1_SYNC', 
                    details: successfulScenario.details,
                    proposedUpdates: successfulScenario.updates,
                    totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0)
                };
            } else {
                return { feasible: false, reason: "Hết chỗ (Không tìm thấy khe hở phù hợp)" };
            }
        }

        return { checkRequestAvailability, setDynamicServices };
    })();

    // ========================================================================
    // PHẦN 2: ANTI-CACHE DATA FETCHER
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

    // Hàm gọi Core Check - Cầu nối giữa UI và Logic V101.1
    // [V101.1 UPDATE] Map thêm trường allocated_resource
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
                // [V101.1] Truyền allocated_resource vào Core để xử lý Strict Inheritance
                allocated_resource: b.resourceId || b.allocated_resource || b.rowId, 
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
            // GỌI HÀM CORE KERNEL V101.1
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
    // 4. COMPONENT: PHONE BOOKING MODAL (V101.1 PRESERVED)
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
            time: "12:00", 
            pax: 1, 
            custName: '', 
            custPhone: '' 
        });
        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

        useEffect(() => {
            if (editingBooking) {
                let timeStr = "12:00";
                let dateStr = initialDate;
                if (editingBooking.startTimeString) {
                    const parts = editingBooking.startTimeString.split(' ');
                    if (parts.length >= 2) {
                        dateStr = parts[0].replace(/\//g, '-'); 
                        timeStr = parts[1].substring(0, 5);
                    }
                }
                setForm({
                    date: dateStr,
                    time: timeStr,
                    pax: editingBooking.pax || 1,
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
            // Nếu là sửa booking, loại bỏ booking hiện tại ra khỏi danh sách check
            if (editingBooking) {
                currentBookings = currentBookings.filter(b => b.rowId !== editingBooking.rowId);
            }
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
                        ...g,
                        staff: g.staff, 
                        flow: detail ? detail.flow : 'FB', 
                        phase1_duration: detail ? detail.phase1_duration : null,
                        phase2_duration: detail ? detail.phase2_duration : null,
                    };
                });

                // Tags cho tinh dau (Oil)
                const oils = detailedGuests.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean);
                
                // EXPLICIT FLOW TAGGING
                const flows = detailedGuests.map((g, i) => {
                    if (g.flow === 'BF') return `K${i+1}:先做身體`; 
                    if (g.flow === 'FB') return `K${i+1}:先做腳`;   
                    return null;
                }).filter(Boolean);
                
                const noteParts = [...oils, ...flows];
                const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";
                
                console.log(`[V101.1 Note Generated]: ${noteStr}`);

                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: detailedGuests.map(g=>g.service).join(','), pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    
                    nhanVien: detailedGuests[0].staff, 
                    isOil: detailedGuests[0].isOil,
                    
                    staffId2: detailedGuests[1]?.staff||null, staffId3: detailedGuests[2]?.staff||null,
                    staffId4: detailedGuests[3]?.staff||null, staffId5: detailedGuests[4]?.staff||null, staffId6: detailedGuests[5]?.staff||null,
                    ghiChu: noteStr, 
                    guestDetails: detailedGuests,
                    proposedUpdates: finalCheck.proposedUpdates || [],
                    
                    phase1_duration: detailedGuests[0].phase1_duration,
                    phase2_duration: detailedGuests[0].phase2_duration,
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
                        <h3 className="font-bold text-lg">
                            {editingBooking ? "✏️ 修改預約 (Edit Booking)" : "📅 電話預約 (V101.1)"}
                        </h3>
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
                                            {isChecking ? "正在計算 (Matrix V101.1)..." : "🔍 查詢空位 (Instant Check)"}
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
                                                    {d.allocated && d.allocated.length > 0 && (
                                                        <span className="text-[10px] text-blue-500 font-mono">
                                                            📍 {d.allocated.join(', ')}
                                                        </span>
                                                    )}
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
    // 5. COMPONENT: WALK-IN MODAL (V101.1 PRESERVED)
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

        useEffect(() => {
            fetchLiveServerData(true).then(data => { if (data) setServerData(data); });
        }, []);

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
                if (res.reason.includes("System")) { setCheckResult({ status: 'FAIL', message: res.reason }); setIsChecking(false); return; }
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
                        ...g, 
                        staff: g.staff, 
                        flow: detail ? detail.flow : 'FB', 
                        phase1_duration: detail ? detail.phase1_duration : null,
                        phase2_duration: detail ? detail.phase2_duration : null
                    };
                });

                // Tags cho tinh dau (Oil)
                const oils = detailedGuests.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean);
                
                // EXPLICIT FLOW TAGGING
                const flows = detailedGuests.map((g, i) => {
                    if (g.flow === 'BF') return `K${i+1}:先做身體`;
                    if (g.flow === 'FB') return `K${i+1}:先做腳`;
                    return null;
                }).filter(Boolean);
                
                const noteParts = [...oils, ...flows];
                const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";
                console.log(`[V101.1 Explicit Walk-in Note]: ${noteStr}`);

                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: detailedGuests.map(g=>g.service).join(','), pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    
                    nhanVien: detailedGuests[0].staff, 
                    isOil: detailedGuests[0].isOil,
                    
                    staffId2: detailedGuests[1]?.staff||null, staffId3: detailedGuests[2]?.staff||null,
                    staffId4: detailedGuests[3]?.staff||null, staffId5: detailedGuests[4]?.staff||null, staffId6: detailedGuests[5]?.staff||null,
                    ghiChu: noteStr, guestDetails: detailedGuests,
                    proposedUpdates: finalCheck.proposedUpdates || [],
                    
                    phase1_duration: detailedGuests[0].phase1_duration,
                    phase2_duration: detailedGuests[0].phase2_duration
                };
                if (onSave) { await Promise.resolve(onSave(payload)); forceGlobalRefresh(); setTimeout(()=>{onClose();setIsSubmitting(false);}, 500); }
            } catch(err) { alert("錯誤: "+err.message); setIsSubmitting(false); }
        };

        const paxOptions = [1,2,3,4,5,6];

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-600 p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">⚡ 現場客 (V101.1)</h3>
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
                                        {isChecking ? "計算中 (Matrix V101.1)..." : "🔍 檢查"}
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
                                                    {d.allocated && d.allocated.length > 0 && (
                                                        <span className="text-[10px] text-blue-500 font-mono">
                                                            📍 {d.allocated.join(', ')}
                                                        </span>
                                                    )}
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
    // 6. SYSTEM INJECTION
    // ==================================================================================
    // Ghi đè Component toàn cục để ứng dụng chính (Index.html) có thể gọi
    const overrideInterval = setInterval(() => {
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) { 
            window.AvailabilityCheckModal = NewAvailabilityCheckModal; 
            console.log("♻️ AvailabilityModal Injected (V101.1 Synced)"); 
        }
        if (window.WalkInModal !== NewWalkInModal) { 
            window.WalkInModal = NewWalkInModal; 
            console.log("♻️ WalkInModal Injected (V101.1 Synced)"); 
        }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);

})();
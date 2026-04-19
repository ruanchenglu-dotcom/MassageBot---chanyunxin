// File: js/cyx_staffSorter.js
// Phiên bản: V13.4 (Nâng cấp: SSOT - Giới hạn quét đích danh Cột I "指定師傅" trong enrichStaffListWithDesignated)
// Cập nhật: 2026-04-15 - Sửa logic quét thợ khách đoàn & kết hợp trạng thái (已取消, 已完成, 進行中)

(function () {
    console.log("🚀 StaffSorter Module: Loaded (V13.4 - SSOT Auto-Assign & Strict Column I Sync + ID Normalization)");

    const StaffSorter = {
        // =========================================================================
        // 1. CÁC HÀM HELPER (HỖ TRỢ HIỆN TẠI)
        // =========================================================================

        // Hàm mới: Chuẩn hóa ID (Loại bỏ khoảng trắng và số 0 ở đầu nếu là số)
        normalizeStaffId: (id) => {
            if (id === null || id === undefined) return '';
            const str = String(id).trim();
            // Nếu là chuỗi số có số 0 ở đầu (VD: '01', '002') -> chuyển thành '1', '2'
            if (/^0+\d+$/.test(str)) {
                return String(parseInt(str, 10));
            }
            return str;
        },

        isActuallyBusy: (staffId, resourceState) => {
            if (!resourceState) return false;
            const normStaffId = StaffSorter.normalizeStaffId(staffId);

            return Object.values(resourceState).some(r => {
                if (!r.isRunning || r.isPaused || r.isPreview === true) return false;
                const b = r.booking || {};
                const keys = [
                    b.serviceStaff, b.staffId, b.ServiceStaff, b.technician,
                    b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6
                ];
                // So sánh bằng ID đã được chuẩn hóa
                return keys.some(k => StaffSorter.normalizeStaffId(k) === normStaffId);
            });
        },

        getStaffIdFromPaymentItem: (item) => {
            const b = item.booking;
            const resId = item.resourceId || "";
            const num = parseInt(resId.replace(/\D/g, '')) || 1;

            let targetStaff = "";
            if (num === 1) targetStaff = b.serviceStaff || b.staffId || b.technician;
            else if (num === 2) targetStaff = b.staffId2;
            else if (num === 3) targetStaff = b.staffId3;
            else if (num === 4) targetStaff = b.staffId4;
            else if (num === 5) targetStaff = b.staffId5;
            else if (num === 6) targetStaff = b.staffId6;

            if (!targetStaff) targetStaff = b.serviceStaff || b.staffId;
            return targetStaff; // Chỉ lấy ID gốc ra để dò trạng thái, không cần normalize ở đây
        },

        // =========================================================================
        // 2. LOGIC SẮP XẾP THANH TOÁN
        // =========================================================================

        sortPaymentItems: (itemsToPay, statusData) => {
            const sorted = [...itemsToPay];
            const safeStatus = statusData || {};

            sorted.sort((a, b) => {
                const bookingA = a.booking;
                const bookingB = b.booking;

                const priceA = (window.getPrice ? window.getPrice(bookingA.serviceName) : 0) +
                    (window.getOilPrice ? window.getOilPrice(bookingA.isOil) : 0);
                const priceB = (window.getPrice ? window.getPrice(bookingB.serviceName) : 0) +
                    (window.getOilPrice ? window.getOilPrice(bookingB.isOil) : 0);

                if (Math.abs(priceA - priceB) > 1) return priceA - priceB;

                const staffIdA = StaffSorter.getStaffIdFromPaymentItem(a);
                const staffIdB = StaffSorter.getStaffIdFromPaymentItem(b);

                const timeA = safeStatus[staffIdA]?.stafftime || Number.MAX_SAFE_INTEGER;
                const timeB = safeStatus[staffIdB]?.stafftime || Number.MAX_SAFE_INTEGER;

                if (timeA !== timeB) return timeA - timeB;

                const getSeatWeight = (resId) => {
                    const num = parseInt((resId || "").replace(/\D/g, '')) || 99;
                    return (resId || "").includes('bed') ? 2000 + num : 1000 + num;
                };
                return getSeatWeight(a.resourceId) - getSeatWeight(b.resourceId);
            });

            return sorted;
        },

        // =========================================================================
        // 3. LOGIC HIỂN THỊ HÀNG ĐỢI (QUEUE)
        // =========================================================================

        organizeStaff: (staffList, statusData, resourceState) => {
            const safeStaffList = Array.isArray(staffList) ? staffList : [];
            const safeStatus = statusData || {};
            const safeRes = resourceState || {};

            const busyList = [];
            const readyList = [];
            const awayList = [];

            safeStaffList.forEach(s => {
                const currentStat = safeStatus[s.id] || { status: 'AWAY' };

                if (StaffSorter.isActuallyBusy(s.id, safeRes) || currentStat.status === 'BUSY') {
                    busyList.push(s);
                } else {
                    const status = currentStat.status;
                    if (status === 'READY' || status === 'EAT' || status === 'OUT_SHORT') {
                        readyList.push(s);
                    } else {
                        awayList.push(s);
                    }
                }
            });

            busyList.sort((a, b) => {
                const timeA = safeStatus[a.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                const timeB = safeStatus[b.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                if (timeA !== timeB) return timeA - timeB;
                return (window.sortIdAsc && typeof window.sortIdAsc === 'function') ? window.sortIdAsc(a, b) : 0;
            });

            readyList.sort((a, b) => {
                const timeA = safeStatus[a.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                const timeB = safeStatus[b.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                if (timeA !== timeB) return timeA - timeB;
                return (window.sortIdAsc && typeof window.sortIdAsc === 'function') ? window.sortIdAsc(a, b) : 0;
            });

            if (window.sortIdAsc && typeof window.sortIdAsc === 'function') {
                awayList.sort(window.sortIdAsc);
            }

            return {
                busy: busyList,
                ready: readyList,
                away: awayList,
                busyQueueIds: busyList.map(s => s.id),
                readyQueueIds: readyList.filter(s => safeStatus[s.id]?.status === 'READY').map(s => s.id)
            };
        },

        // =========================================================================
        // 4. TẦNG 1 & 1.5: KIỂM TRA & CHẤM ĐIỂM SỰ PHÙ HỢP (COMPATIBILITY)
        // =========================================================================

        checkCompatibility: (staff, booking, designatedReq) => {
            const req = designatedReq || booking.serviceStaff || booking.staffId || booking.requestedStaff || '隨機';
            const reqStr = String(req).trim();
            
            // [V116.5 Logic] Nếu ô chỉ định để trống (hoặc Random), và dịch vụ là tinh dầu/cạo gió -> Gán cứng (Hard-lock) bắt buộc Nữ
            if (!reqStr || reqStr === '隨機' || reqStr === 'undefined' || reqStr === 'null') {
                const isOil = booking.isOil === true || (booking.serviceName && (booking.serviceName.includes('油推') || booking.serviceName.includes('Oil')));
                const note = (booking.ghiChu || booking.note || booking.originalNote || "").toString().toUpperCase();
                const isGuaSha = booking.isGuaSha === true || note.includes('刮痧') || note.includes('拔罐');
                
                if (isOil || isGuaSha) {
                    const staffGender = staff.gender || staff.group || '';
                    return staffGender === '女' || staffGender === 'F';
                }
                return true;
            }

            // Kiểm tra yêu cầu đích danh qua hàm chuẩn hóa
            if (reqStr !== '男' && reqStr !== '女' && reqStr !== '男師' && reqStr !== '女師' && reqStr !== 'MALE' && reqStr !== 'FEMALE') {
                return StaffSorter.normalizeStaffId(staff.id) === StaffSorter.normalizeStaffId(reqStr);
            }

            // Kiểm tra yêu cầu giới tính
            const staffGender = staff.gender || staff.group || '';
            if (reqStr === '男' || reqStr === '男師' || reqStr === 'MALE') return staffGender === '男' || staffGender === 'M';
            if (reqStr === '女' || reqStr === '女師' || reqStr === 'FEMALE') return staffGender === '女' || staffGender === 'F';

            return true;
        },

        scoreCompatibility: (staff, booking, designatedReq, statusData) => {
            let score = 0;
            const req = designatedReq || booking.serviceStaff || booking.staffId || booking.requestedStaff || '隨機';

            // Ưu tiên 1: Đích danh chính xác (Dùng hàm chuẩn hóa)
            if (req !== '隨機' && req !== '男' && req !== '女' && req !== '男師' && req !== '女師' && req !== 'MALE' && req !== 'FEMALE' && StaffSorter.normalizeStaffId(staff.id) === StaffSorter.normalizeStaffId(req)) {
                score += 1000;
            }

            // Ưu tiên 2: Khớp giới tính
            if ((req === '男' || req === '女' || req === '男師' || req === '女師' || req === 'MALE' || req === 'FEMALE') && StaffSorter.checkCompatibility(staff, booking, req)) {
                score += 500;
            }

            // Ưu tiên 3: Thời gian chờ (stafftime nhỏ nhất = đợi lâu nhất -> cộng điểm)
            const time = statusData?.[staff.id]?.stafftime || Number.MAX_SAFE_INTEGER;
            const waitScore = (Number.MAX_SAFE_INTEGER - time) / 1e12;
            score += waitScore;

            return score;
        },

        // =========================================================================
        // 5. TẦNG 2: THUẬT TOÁN LOOK-AHEAD (CHỐNG TRÙNG LỊCH TƯƠNG LAI)
        // =========================================================================

        checkFutureAvailability: (staffId, proposedDuration, allBookings, currentMins, currentRowId, currentPhone) => {
            if (!allBookings || !Array.isArray(allBookings)) return true;

            const bufferMins = 10;
            const estimatedEndTime = currentMins + parseInt(proposedDuration || 60);
            const normStaffId = StaffSorter.normalizeStaffId(staffId);

            for (const b of allBookings) {
                // Bỏ qua chính booking hiện tại hoặc những booking đi cùng nhóm khách đoàn
                if (b.id === currentRowId || (currentPhone && b.phone === currentPhone)) continue;

                // Thu thập tất cả các yêu cầu thợ của booking này
                const keys = [
                    b.serviceStaff, b.staffId, b.ServiceStaff, b.technician,
                    b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6
                ];

                // So sánh xem có thợ đang xét hay không (đã chuẩn hóa)
                const isTargetStaff = keys.some(k => StaffSorter.normalizeStaffId(k) === normStaffId);

                if (isTargetStaff) {
                    const bStartTime = parseInt(b.startTimeMins || b.timeInMins || b.start_time || 0);

                    // Nếu ca tương lai bắt đầu trong lúc hoặc ngay sau ca hiện tại đang xét -> Xung đột
                    if (bStartTime > currentMins && bStartTime < (estimatedEndTime + bufferMins)) {
                        return false;
                    }
                }
            }
            return true;
        },

        // =========================================================================
        // 6. CÁC HÀM THỰC THI (HIGH-LEVEL EXECUTORS CHO FRONTEND)
        // =========================================================================

        findBestStaffForSingle: (booking, readyCandidates, statusData, allBookings, currentMins) => {
            const req = booking.serviceStaff || booking.staffId || booking.requestedStaff || '隨機';
            const duration = parseInt(booking.duration || 60);

            let bestStaff = null;
            let highestScore = -1;

            for (const staff of readyCandidates) {
                if (!StaffSorter.checkCompatibility(staff, booking, req)) continue;

                if (!StaffSorter.checkFutureAvailability(staff.id, duration, allBookings, currentMins, booking.id, booking.phone)) {
                    continue;
                }

                const score = StaffSorter.scoreCompatibility(staff, booking, req, statusData);
                if (score > highestScore) {
                    highestScore = score;
                    bestStaff = staff;
                }
            }
            return bestStaff;
        },

        // [V119 Lấy Nhân Viên Làm Gốc (Staff-Centric)] Thay vì duyệt Booking, duyệt Staff theo thứ tự đợi
        assignStaffForBatch: (validItems, readyCandidates, statusData, allBookings, currentMins) => {
            const assignment = {};
            let unassignedItems = [...validItems];

            // 1. Tuyệt đối ưu tiên: Xếp thợ thành hàng thẳng tắp từ người đợi lâu nhất (số nhỏ nhất)
            const sortedStaff = [...readyCandidates].sort((a, b) => {
                const timeA = statusData[a.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                const timeB = statusData[b.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                return timeA - timeB; 
            });

            // 2. Thợ đợi lâu nhất sẽ đi dò từng khách để nhận việc
            for (const staff of sortedStaff) {
                if (unassignedItems.length === 0) break; // Hết khách thì ngừng chọn

                let bestItemIndex = -1;
                let highestScore = -1;

                // Thợ này tự quét toàn bộ danh sách Khách
                unassignedItems.forEach((item, idx) => {
                    const req = item.booking?.serviceStaff || item.booking?.staffId || item.booking?.requestedStaff || '隨機';
                    const duration = parseInt(item.booking?.duration || 60);

                    // A. Bộ Lọc Cơ Bản (Tẩy chay khách không thoả mãn)
                    if (!StaffSorter.checkCompatibility(staff, item.booking, req)) return;
                    if (!StaffSorter.checkFutureAvailability(staff.id, duration, allBookings, currentMins, item.booking.id, item.booking.phone)) return;

                    // B. Chấm Điểm Giá Trị Của Yêu Cầu Khách Hàng
                    // Ví dụ: Nam không nên nhận khách Random, hãy để dành Random cho nữ và nhận khách Nam!
                    let itemScore = 0;
                    
                    if (req !== '隨機' && req !== '男' && req !== '女' && req !== '男師' && req !== '女師' && req !== 'MALE' && req !== 'FEMALE') {
                        // Khách ruột chỉ định đích danh ID -> Bắt buộc nhận (Ngũ Kiếm)
                        itemScore += 5000;
                    } else if (req !== '隨機') {
                        // Khách kén chọn Giới Tính (Nam/Nữ) -> Thợ nam ôm vội tránh lọt vào tay nữ
                        itemScore += 1000;
                    } else {
                        // Khách bừa bụi (Random) -> Nhận tạm
                        itemScore += 100;
                    }
                    
                    // Phân định phụ (Tie-breaker): Khách thời gian dài nên ưu tiên thợ mốc cũ?
                    itemScore += (duration / 100);

                    if (itemScore > highestScore) {
                        highestScore = itemScore;
                        bestItemIndex = idx;
                    }
                });

                // C. Nếu thợ tìm thấy Khách lý tưởng nhất cho mình
                if (bestItemIndex !== -1) {
                    const assignedItem = unassignedItems[bestItemIndex];
                    assignment[assignedItem.resourceId] = staff.id;
                    unassignedItems.splice(bestItemIndex, 1); // Rút khách này khỏi kho
                }
            }

            return assignment;
        },

        // =========================================================================
        // 7. CẬP NHẬT TRẠNG THÁI GIAO DIỆN (UI ENRICHMENT)
        // =========================================================================

        enrichStaffListWithDesignated: (staffList, todaysBookings, currentMins) => {
            return staffList.map(staff => {
                let hasUpcoming = false;
                if (todaysBookings && Array.isArray(todaysBookings)) {
                    hasUpcoming = todaysBookings.some(b => {
                        // 1. Lọc bỏ các booking đã hủy, đã hoàn thành, hoặc ĐÃ BẮT ĐẦU phục vụ (進行中)
                        const status = b.status || '';
                        if (status === '已取消' || status === '已完成' || status === '進行中') {
                            return false;
                        }

                        // 2. Tính toán khoảng cách thời gian từ hiện tại đến lúc bắt đầu
                        const bStartTime = parseInt(b.startTimeMins || b.timeInMins || b.start_time || 0);
                        const timeDiff = bStartTime - currentMins;

                        // Điều kiện kích hoạt: Khách đến trong vòng 120p tới, hoặc đã trễ không quá 20p
                        if (timeDiff > 120 || timeDiff < -20) {
                            return false;
                        }

                        // 3. CHỈ quét cột "指定師傅" (Cột I) - Loại bỏ hoàn toàn mảng khách đoàn
                        const assignedStaffs = [
                            b.technician, b.staffId, b.requestedStaff
                        ];

                        // Kiểm tra xem mã nhân viên có nằm trong danh sách đích danh hay không (áp dụng chuẩn hóa ID)
                        return assignedStaffs.some(req => {
                            if (!req) return false;
                            const reqStr = String(req).trim();
                            return reqStr !== '隨機' && reqStr !== '男' && reqStr !== '女' && reqStr !== '男師' && reqStr !== '女師' && reqStr !== 'MALE' && reqStr !== 'FEMALE' &&
                                StaffSorter.normalizeStaffId(reqStr) === StaffSorter.normalizeStaffId(staff.id);
                        });
                    });
                }
                return { ...staff, hasUpcomingDesignated: hasUpcoming };
            });
        },

        // =========================================================================
        // 8. LIFECYCLE STATE MANAGERS (QUẢN LÝ VÒNG ĐỜI TRẠNG THÁI VÀ STAFFTIME)
        // =========================================================================

        /**
         * GIAI ĐOẠN 1: CHECK-IN
         * Khi thợ bắt đầu đi làm hoặc chuyển từ AWAY -> READY.
         * Logic: Tìm người mới nhất đang đứng ở nhóm READY (maxReadyTime), cộng thêm 100ms.
         * Kết quả: Ép thợ mới check-in phải xếp cuối hàng, không được chen ngang người bét nhất hiện tại.
         */
        processCheckIn: (staffId, statusData, staffList, newCheckInTime) => {
            let maxStaffTime = 0;
            if (staffList && Array.isArray(staffList)) {
                // Lọc ra các thợ đang sẵn sàng (READY, EAT, OUT_SHORT)
                const readyTimes = Object.entries(statusData || {})
                    .filter(([id, staff]) => {
                        const sStatus = staff.status;
                        return sStatus === 'READY' || sStatus === 'EAT' || sStatus === 'OUT_SHORT';
                    })
                    .map(([_, staff]) => Number(staff.stafftime))
                    .filter(t => !isNaN(t));

                if (readyTimes.length > 0) {
                    maxStaffTime = Math.max(...readyTimes);
                }
            }

            let newStaffTime;
            if (maxStaffTime > 0) {
                newStaffTime = maxStaffTime + 100;
            } else {
                newStaffTime = newCheckInTime || Date.now();
            }

            return newStaffTime;
        },

        /**
         * GIAI ĐOẠN 2: START WORK (BẬT COMPONENT CHẾ ĐỘ PHỤC VỤ)
         * Cập nhật từ READY -> BUSY.
         * Logic: Delay 100ms (0.1s) để UI mượt mà -> Gán bằng thời gian nhận khách (baseNow + offsetMins).
         * @returns Bảng statusData mới.
         */
        processStartWork: async (staffListToStart, currentStatusData, baseNow = Date.now()) => {
            // Giảm tốc độ thực hiện 0.1s theo yêu cầu
            await new Promise(resolve => setTimeout(resolve, 100));

            const newStatusData = { ...currentStatusData };

            staffListToStart.forEach((staffId, index) => {
                const currentStaffTime = currentStatusData[staffId]?.stafftime || baseNow;
                
                // Mốc thời gian mới (Giờ bắt đầu làm việc + khoảnh khắc offset 10ms để không bị trùng lặp UI)
                const newStaffTime = baseNow + (index * 10);

                newStatusData[staffId] = {
                    ...currentStatusData[staffId],
                    status: 'BUSY',
                    stafftime: newStaffTime,
                    previousStafftime: currentStaffTime // Cất Lịch Sử chờ cũ vào túi dự phòng
                };
            });

            return newStatusData;
        },

        /**
         * GIAI ĐOẠN 3: CHECKOUT (KẾT THÚC DỊCH VỤ - TRỞ VỀ READY)
         * Logic: Tính Penalty dựa trên thời gian thực hiện, kết hợp chốt chặn "maxReadyTime" không cho chen ngang.
         */
        processCheckout: async (checkoutStaffInfo, currentStatusData, staffList, baseTime = Date.now(), isGroup = false) => {
            // [V120 Tính Năng] Bỏ hàm Delay 100ms vì Checkout cần lưu nhanh vào UI để tránh lỗi đè dữ liệu (Race Condition).
            const newStatusData = { ...currentStatusData };
            const uniqueBlocks = [...new Set(checkoutStaffInfo.map(i => i.blocks))];
            const minGroupDuration = checkoutStaffInfo.length > 0 ? Math.min(...checkoutStaffInfo.map(i => i.duration)) : 0;

            // [Tìm Chốt Chặn MaxReadyTime] Ai đang đứng bét bảng trong hàng chờ Sẵn Sàng?
            let maxReadyTime = 0;
            if (staffList) {
                staffList.forEach(s => {
                    const stat = newStatusData[s.id] || currentStatusData[s.id];
                    if (stat && stat.status === 'READY') {
                        const st = stat.stafftime || 0;
                        if (st > maxReadyTime) maxReadyTime = st;
                    }
                });
            }

            checkoutStaffInfo.forEach(info => {
                // Thò tay lấy túi `previousStafftime` chứa Lịch sử chờ gốc trước khi đi làm của thợ
                const currentStaffTime = currentStatusData[info.staffId]?.previousStafftime 
                                         || currentStatusData[info.staffId]?.stafftime 
                                         || baseTime;
                                         
                let newStaffTime = currentStaffTime;

                // --- LOGIC PHẠT THỜI GIAN THEO LÝ THUYẾT (TIME PENALTY) ---
                if (!isGroup) {
                    newStaffTime = currentStaffTime + (info.duration * 60000); // 1 block = phạt điểm độc lập
                }
                else if (isGroup && uniqueBlocks.length === 1) {
                    newStaffTime = currentStaffTime + (minGroupDuration * 60000); // Penalty chung nhóm
                }
                else if (isGroup && uniqueBlocks.length > 1) {
                    newStaffTime = currentStaffTime + (info.duration * 60000); // Penalty riêng lẽ
                }

                // --- ÉP KHUÔN CUỐI HÀNG CHỜ (ANTI-CUT-IN-LINE) ---
                // Luôn xếp sau người rảnh rỗi chờ lâu nhất thời điểm hiện tại (chặn chen ngang)
                if (newStaffTime <= maxReadyTime) {
                    // Cài đặt vị trí mới sát đằng sau maxReadyTime + 1000ms
                    // Tính độ trễ mili-giây nguyên bản để tái tạo hàng ngũ (0ms, 10ms, 20ms...)
                    const busyOffsetMs = (currentStatusData[info.staffId]?.stafftime % 1000) || 0;
                    newStaffTime = maxReadyTime + 1000 + busyOffsetMs;
                }

                newStatusData[info.staffId] = {
                    ...currentStatusData[info.staffId],
                    status: 'READY',
                    checkInTime: baseTime,
                    stafftime: newStaffTime,
                    previousStafftime: null // Reset lại sau khi sử dụng xong
                };
            });

            return newStatusData;
        }
    };

    window.StaffSorter = StaffSorter;
    window.normalizeStaffId = StaffSorter.normalizeStaffId;

})();
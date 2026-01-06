// File: js/staffSorter.js
// Phiên bản: V5 (Fix: Giữ nguyên thứ tự thẻ bài/Queue Badge khi thanh toán nhóm)

(function() {
    console.log("🚀 StaffSorter Module: Loaded (V5 - Badge Priority)");

    const StaffSorter = {
        // =========================================================================
        // 1. CÁC HÀM HELPER (HỖ TRỢ)
        // =========================================================================

        /**
         * Kiểm tra xem nhân viên có đang thực sự bận không
         */
        isActuallyBusy: (staffId, resourceState) => {
            if (!resourceState) return false;
            return Object.values(resourceState).some(r => {
                if (!r.isRunning || r.isPaused || r.isPreview === true) return false;
                const b = r.booking || {};
                // Các trường có thể chứa ID nhân viên
                const keys = [
                    b.serviceStaff, b.staffId, b.ServiceStaff, b.technician,
                    b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6
                ];
                return keys.some(k => String(k).trim() === String(staffId).trim());
            });
        },

        /**
         * Lấy thời gian bắt đầu làm việc (để sắp xếp danh sách Bận)
         */
        getBusyStartTime: (staffId, resourceState) => {
            const res = Object.values(resourceState).find(r => {
                if (!r.isRunning || r.isPaused || r.isPreview === true) return false;
                const b = r.booking || {};
                const keys = [b.serviceStaff, b.staffId, b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6];
                return keys.some(k => String(k).trim() === String(staffId).trim());
            });
            return res && res.startTime ? new Date(res.startTime).getTime() : 0;
        },

        /**
         * Tìm ID nhân viên đang làm tại vị trí ghế/giường này
         * Dựa vào resourceId (ví dụ chair-1) để ánh xạ sang cột nhân viên tương ứng trong booking
         */
        getStaffIdFromPaymentItem: (item) => {
            const b = item.booking;
            const resId = item.resourceId || "";
            
            // Logic ánh xạ: Ghế số mấy -> Lấy nhân viên cột số mấy
            // chair-1 -> Staff 1 (serviceStaff)
            // chair-2 -> Staff 2 (staffId2)
            // ...
            const num = parseInt(resId.replace(/\D/g, '')) || 1;
            
            // Tìm tên thợ trong cột tương ứng
            // Lưu ý: Logic này giả định thợ chính luôn ở ghế 1, thợ phụ ở ghế 2... 
            // Nếu có sự xáo trộn (người chính ngồi ghế 2), logic này vẫn hoạt động tốt 
            // vì ta đang cần tìm "người đang ngồi ở ghế đó là ai".
            
            let targetStaff = "";
            if (num === 1) targetStaff = b.serviceStaff || b.staffId || b.technician;
            else if (num === 2) targetStaff = b.staffId2;
            else if (num === 3) targetStaff = b.staffId3;
            else if (num === 4) targetStaff = b.staffId4;
            else if (num === 5) targetStaff = b.staffId5;
            else if (num === 6) targetStaff = b.staffId6;

            // Nếu không tìm thấy theo số ghế (trường hợp lẻ), lấy thợ chính
            if (!targetStaff) targetStaff = b.serviceStaff || b.staffId;

            return targetStaff;
        },

        // =========================================================================
        // 2. LOGIC SẮP XẾP THANH TOÁN (QUAN TRỌNG NHẤT)
        // =========================================================================

        /**
         * Sắp xếp danh sách thanh toán để quyết định ai về hàng trước.
         * Logic:
         * 1. Gói dịch vụ khác nhau -> Gói rẻ/nhanh về trước.
         * 2. Cùng gói (nhóm) -> So sánh THỜI GIAN CHECK-IN CŨ (Số thứ tự thẻ).
         * Người có số thẻ nhỏ hơn (vào làm với tư cách người đến trước) sẽ được về trước.
         */
        sortPaymentItems: (itemsToPay, statusData) => {
            // Tạo bản sao để sắp xếp
            const sorted = [...itemsToPay];
            const safeStatus = statusData || {};

            sorted.sort((a, b) => {
                const bookingA = a.booking;
                const bookingB = b.booking;

                // --- BƯỚC 1: SO SÁNH GIÁ TRỊ GÓI (Ưu tiên gói nhỏ về trước) ---
                const priceA = (window.getPrice ? window.getPrice(bookingA.serviceName) : 0) + 
                               (window.getOilPrice ? window.getOilPrice(bookingA.isOil) : 0);
                
                const priceB = (window.getPrice ? window.getPrice(bookingB.serviceName) : 0) + 
                               (window.getOilPrice ? window.getOilPrice(bookingB.isOil) : 0);

                // Nếu giá tiền chênh lệch (khác gói), xếp theo tiền
                if (Math.abs(priceA - priceB) > 1) { 
                    return priceA - priceB;
                }

                // --- BƯỚC 2: SO SÁNH SỐ THỨ TỰ THẺ (Check-In Time) ---
                // Đây là logic bạn cần: Giữ nguyên thứ tự thẻ bài cũ.
                
                // Lấy ID nhân viên của 2 item này
                const staffIdA = StaffSorter.getStaffIdFromPaymentItem(a);
                const staffIdB = StaffSorter.getStaffIdFromPaymentItem(b);

                // Tra cứu thời gian check-in trong quá khứ (lúc họ nhận số)
                // Dữ liệu này vẫn còn trong statusData ngay cả khi họ đang BUSY
                const timeA = safeStatus[staffIdA]?.checkInTime || 0;
                const timeB = safeStatus[staffIdB]?.checkInTime || 0;

                // Nếu lấy được thời gian check-in hợp lệ, so sánh nó
                // Time nhỏ hơn = Check-in sớm hơn = Số thẻ nhỏ hơn (VD: thẻ số 1) -> Xếp trước
                if (timeA > 0 && timeB > 0 && timeA !== timeB) {
                    return timeA - timeB;
                }

                // --- BƯỚC 3: DỰ PHÒNG (Fallback) ---
                // Nếu không có check-in time (hiếm), so sánh theo số ghế để ổn định
                // Chair-1 (1001) < Chair-2 (1002)
                const getSeatWeight = (resId) => {
                    const num = parseInt((resId||"").replace(/\D/g, '')) || 99;
                    return (resId||"").includes('bed') ? 2000 + num : 1000 + num;
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
                if (StaffSorter.isActuallyBusy(s.id, safeRes)) {
                    busyList.push(s);
                } else {
                    const currentStat = safeStatus[s.id] || { status: 'AWAY' };
                    const status = currentStat.status;
                    if (status === 'READY' || status === 'EAT' || status === 'OUT_SHORT') {
                        readyList.push(s);
                    } else {
                        awayList.push(s);
                    }
                }
            });

            // Sắp xếp nhóm BUSY: Ai làm trước xếp trước
            busyList.sort((a, b) => {
                const timeA = StaffSorter.getBusyStartTime(a.id, safeRes);
                const timeB = StaffSorter.getBusyStartTime(b.id, safeRes);
                if (timeA !== timeB) return timeA - timeB;
                return window.sortIdAsc(a, b);
            });

            // Sắp xếp nhóm READY: Quan trọng nhất - Xếp theo thời gian Check-in
            // Vì hàm sortPaymentItems đã gán thời gian check-in mới dựa trên thứ tự ưu tiên
            // nên ở đây chỉ cần sort time là ra đúng thứ tự mong muốn.
            readyList.sort((a, b) => {
                const timeA = safeStatus[a.id]?.checkInTime || 0;
                const timeB = safeStatus[b.id]?.checkInTime || 0;
                if (timeA !== timeB) return timeA - timeB;
                return window.sortIdAsc(a, b);
            });

            // Sắp xếp nhóm AWAY
            awayList.sort(window.sortIdAsc);

            return {
                busy: busyList,
                ready: readyList,
                away: awayList,
                readyQueueIds: readyList.filter(s => safeStatus[s.id]?.status === 'READY').map(s => s.id)
            };
        }
    };

    // Export ra global window
    window.StaffSorter = StaffSorter;

})();
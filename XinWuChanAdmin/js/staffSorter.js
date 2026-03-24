// File: js/staffSorter.js
// Phiên bản: V7 (Nâng cấp: Tối ưu Auto-Increment Time - Lõi stafftime tuyệt đối, loại bỏ fallback cũ)

(function () {
    console.log("🚀 StaffSorter Module: Loaded (V7 - Pure stafftime Priority for READY Queue)");

    const StaffSorter = {
        // =========================================================================
        // 1. CÁC HÀM HELPER (HỖ TRỢ) - GIỮ NGUYÊN
        // =========================================================================

        isActuallyBusy: (staffId, resourceState) => {
            if (!resourceState) return false;
            return Object.values(resourceState).some(r => {
                if (!r.isRunning || r.isPaused || r.isPreview === true) return false;
                const b = r.booking || {};
                const keys = [
                    b.serviceStaff, b.staffId, b.ServiceStaff, b.technician,
                    b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6
                ];
                return keys.some(k => String(k).trim() === String(staffId).trim());
            });
        },

        getBusyStartTime: (staffId, resourceState) => {
            const res = Object.values(resourceState).find(r => {
                if (!r.isRunning || r.isPaused || r.isPreview === true) return false;
                const b = r.booking || {};
                const keys = [b.serviceStaff, b.staffId, b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6];
                return keys.some(k => String(k).trim() === String(staffId).trim());
            });
            return res && res.startTime ? new Date(res.startTime).getTime() : 0;
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
            return targetStaff;
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

                // --- BƯỚC 1: SO SÁNH GIÁ TRỊ GÓI ---
                const priceA = (window.getPrice ? window.getPrice(bookingA.serviceName) : 0) +
                    (window.getOilPrice ? window.getOilPrice(bookingA.isOil) : 0);
                const priceB = (window.getPrice ? window.getPrice(bookingB.serviceName) : 0) +
                    (window.getOilPrice ? window.getOilPrice(bookingB.isOil) : 0);

                if (Math.abs(priceA - priceB) > 1) {
                    return priceA - priceB;
                }

                // --- BƯỚC 2: SO SÁNH THEO STAFFTIME (Ưu tiên tuyệt đối) ---
                const staffIdA = StaffSorter.getStaffIdFromPaymentItem(a);
                const staffIdB = StaffSorter.getStaffIdFromPaymentItem(b);

                // Dọn dẹp logic fallback checkInTime, chỉ dùng stafftime nguyên thủy
                const timeA = safeStatus[staffIdA]?.stafftime || 0;
                const timeB = safeStatus[staffIdB]?.stafftime || 0;

                if (timeA > 0 && timeB > 0 && timeA !== timeB) {
                    return timeA - timeB;
                }

                // --- BƯỚC 3: DỰ PHÒNG THEO SỐ GHẾ ---
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
                if (StaffSorter.isActuallyBusy(s.id, safeRes)) {
                    busyList.push(s);
                } else {
                    const currentStat = safeStatus[s.id] || { status: 'AWAY' };
                    const status = currentStat.status;
                    // Bổ sung các trạng thái rảnh/tạm nghỉ vào hàng đợi READY (待命)
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
                return (window.sortIdAsc && typeof window.sortIdAsc === 'function') ? window.sortIdAsc(a, b) : 0;
            });

            // Sắp xếp nhóm READY: Lõi thuật toán mới - Tịnh tiến thời gian
            readyList.sort((a, b) => {
                // Chỉ đọc stafftime nguyên thủy, KHÔNG dùng fallback checkInTime để tránh rác dữ liệu
                const timeA = safeStatus[a.id]?.stafftime || 0;
                const timeB = safeStatus[b.id]?.stafftime || 0;

                // Nếu có sự chênh lệch (dù chỉ 1 mili-giây do Auto-Increment tạo ra), xếp chính xác theo đó
                if (timeA !== timeB) return timeA - timeB;

                // Dự phòng cuối cùng nếu trùng lặp (lý tưởng nhất là không bao giờ chạy vào đây)
                return (window.sortIdAsc && typeof window.sortIdAsc === 'function') ? window.sortIdAsc(a, b) : 0;
            });

            // Sắp xếp nhóm AWAY
            if (window.sortIdAsc && typeof window.sortIdAsc === 'function') {
                awayList.sort(window.sortIdAsc);
            }

            return {
                busy: busyList,
                ready: readyList,
                away: awayList,
                readyQueueIds: readyList.filter(s => safeStatus[s.id]?.status === 'READY').map(s => s.id)
            };
        }
    };

    window.StaffSorter = StaffSorter;

})();
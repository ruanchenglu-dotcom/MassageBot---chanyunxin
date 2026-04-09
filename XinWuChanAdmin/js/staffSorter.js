// File: js/staffSorter.js
// Phiên bản: V12 (Nâng cấp: Xử lý an toàn stafftime & Tối ưu hóa thứ tự BUSY/READY)
// Cập nhật: 2026-04-07

(function () {
    console.log("🚀 StaffSorter Module: Loaded (V12 - Safe Stafftime & Strict Queue Sync)");

    const StaffSorter = {
        // =========================================================================
        // 1. CÁC HÀM HELPER (HỖ TRỢ)
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

                // --- BƯỚC 2: SO SÁNH THEO STAFFTIME ---
                const staffIdA = StaffSorter.getStaffIdFromPaymentItem(a);
                const staffIdB = StaffSorter.getStaffIdFromPaymentItem(b);

                // Dùng Number.MAX_SAFE_INTEGER để chống lỗi dữ liệu trống (undefined)
                const timeA = safeStatus[staffIdA]?.stafftime || Number.MAX_SAFE_INTEGER;
                const timeB = safeStatus[staffIdB]?.stafftime || Number.MAX_SAFE_INTEGER;

                if (timeA !== timeB) {
                    return timeA - timeB; // Tăng dần (FIFO)
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

            // --- SẮP XẾP NHÓM BUSY ---
            // Sắp xếp TĂNG DẦN (timeA - timeB): Người làm lâu nhất nằm đầu mảng (index 0).
            // Do view render ở app.js dùng flex-row-reverse, index 0 sẽ được đẩy qua góc phải cùng.
            busyList.sort((a, b) => {
                const timeA = safeStatus[a.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                const timeB = safeStatus[b.id]?.stafftime || Number.MAX_SAFE_INTEGER;

                if (timeA !== timeB) {
                    return timeA - timeB;
                }

                return (window.sortIdAsc && typeof window.sortIdAsc === 'function') ? window.sortIdAsc(a, b) : 0;
            });

            // --- SẮP XẾP NHÓM READY ---
            // Sắp xếp TĂNG DẦN (timeA - timeB): Người đợi lâu nhất nằm đầu mảng (index 0).
            readyList.sort((a, b) => {
                const timeA = safeStatus[a.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                const timeB = safeStatus[b.id]?.stafftime || Number.MAX_SAFE_INTEGER;

                if (timeA !== timeB) {
                    return timeA - timeB;
                }

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
                // Trả về ID của nhóm Bận để App.js có thể map queueIndex tương ứng
                busyQueueIds: busyList.map(s => s.id),
                readyQueueIds: readyList.filter(s => safeStatus[s.id]?.status === 'READY').map(s => s.id)
            };
        }
    };

    window.StaffSorter = StaffSorter;

})();
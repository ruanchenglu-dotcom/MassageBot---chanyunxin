/**
 * ============================================================================
 * FILE: js/utils.js
 * PHIÊN BẢN: V109.0 (CENTRALIZED & DYNAMIC)
 * MÔ TẢ: CÁC HÀM HỖ TRỢ TOÀN CỤC (GLOBAL UTILITIES)
 * CẬP NHẬT: 
 * 1. Chuyển toàn bộ tham số cứng sang tham chiếu window.SYSTEM_CONFIG.
 * 2. Cập nhật nhãn giao diện sang Tiếng Trung Phồn Thể (Traditional Chinese).
 * 3. Thêm các hàm lấy Buffer Time (Dọn dẹp/Chuyển đổi) từ cấu hình.
 * ============================================================================
 */

(function () {
    // Kiểm tra cấu hình hệ thống, dự phòng nếu chưa load kịp
    const CONFIG = window.SYSTEM_CONFIG || {
        SHOP_INFO: { VERSION: 'V109.0 fallback' },
        OPERATION_TIME: { OPEN_HOUR: 5 },
        BUFFERS: { CLEANUP_MINUTES: 5, TRANSITION_MINUTES: 5 },
        UI_LABELS: { CHAIR_PREFIX: '足', BED_PREFIX: '床' },
        FINANCE: { OIL_BONUS: 0 }
    };

    console.log(`🚀 Utils Module Loaded: ${CONFIG.SHOP_INFO.VERSION} (Dynamic Logic Ready)`);

    // ========================================================================
    // 1. QUẢN LÝ DỊCH VỤ & THỜI GIAN (TIME MANAGEMENT)
    // ========================================================================

    /**
     * Lấy thời lượng dịch vụ an toàn
     */
    window.getSafeDuration = (serviceName, fallbackDuration) => {
        if (!serviceName) return fallbackDuration || 60;
        if (window.SERVICES_DATA && window.SERVICES_DATA[serviceName]) {
            return window.SERVICES_DATA[serviceName].duration;
        }
        if (window.SERVICES_LIST) {
            const key = window.SERVICES_LIST.find(k => serviceName.includes(k));
            if (key && window.SERVICES_DATA[key]) {
                return window.SERVICES_DATA[key].duration;
            }
        }
        return fallbackDuration || 60;
    };

    /**
     * Lấy ngày giờ chuẩn Đài Loan (UTC+8)
     */
    window.getTaipeiDate = () => {
        return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    };

    /**
     * Định dạng ngày cho <input type="date"> (YYYY-MM-DD)
     * Dựa trên OPEN_HOUR trong cấu hình
     */
    window.getOperationalDateInputFormat = () => {
        const now = window.getTaipeiDate();
        const openHour = CONFIG.OPERATION_TIME.OPEN_HOUR;

        // Nếu giờ hiện tại < giờ mở cửa, tính là ngày làm việc hôm trước
        if (now.getHours() < openHour) {
            now.setDate(now.getDate() - 1);
        }
        const y = now.getFullYear();
        const m = (now.getMonth() + 1).toString().padStart(2, '0');
        const d = now.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    /**
     * Kiểm tra booking có thuộc ngày vận hành không (Hỗ trợ qua đêm)
     */
    window.isWithinOperationalDay = (bookingDateStr, bookingTimeStr, targetViewDateStr) => {
        if (!bookingDateStr || !bookingTimeStr) return false;
        const openHour = CONFIG.OPERATION_TIME.OPEN_HOUR;

        const opDateStr = targetViewDateStr
            ? targetViewDateStr.replace(/-/g, '/')
            : window.getOperationalDateInputFormat().replace(/-/g, '/');

        let d = new Date(bookingDateStr);
        if (isNaN(d.getTime())) {
            d = new Date(bookingDateStr.replace(/-/g, '/'));
        }

        const bDateStr = `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
        const [h, m] = bookingTimeStr.split(':').map(Number);

        // TH1: Cùng ngày dương lịch và >= giờ mở cửa
        if (bDateStr === opDateStr && h >= openHour) return true;

        // TH2: Ngày hôm sau nhưng < giờ mở cửa (Ca đêm)
        const nextDay = new Date(opDateStr);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = `${nextDay.getFullYear()}/${(nextDay.getMonth() + 1).toString().padStart(2, '0')}/${nextDay.getDate().toString().padStart(2, '0')}`;

        if (bDateStr === nextDayStr && h < openHour) return true;

        return false;
    };

    /**
     * Chuyển đổi giờ thành phút tính từ mốc 00:00 của ngày vận hành
     * Ví dụ: 01:00 AM -> 1500 phút (vì thuộc ca đêm ngày hôm trước)
     */
    window.normalizeToTimelineMins = (timeStr) => {
        if (!timeStr) return 0;
        const openHour = CONFIG.OPERATION_TIME.OPEN_HOUR;
        try {
            const [h, m] = timeStr.split(':').map(Number);
            if (isNaN(h) || isNaN(m)) return 0;

            let totalMins = h * 60 + m;
            // Nếu giờ < giờ mở cửa, coi như là giờ ca đêm (cộng 24h)
            if (h < openHour) totalMins += 24 * 60;
            return totalMins;
        } catch (e) {
            return 0;
        }
    };

    /**
     * Chuyển phút timeline ngược lại thành HH:mm hiển thị
     */
    window.formatMinutesToTime = (totalMins) => {
        let h = Math.floor(totalMins / 60);
        let m = totalMins % 60;
        if (h >= 24) h -= 24;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // ========================================================================
    // 2. THỜI GIAN ĐỆM (BUFFERS) - NEW IN V109.0
    // ========================================================================

    window.getCleanupBuffer = () => {
        return (CONFIG.BUFFERS && CONFIG.BUFFERS.CLEANUP_MINUTES) ? CONFIG.BUFFERS.CLEANUP_MINUTES : 10;
    };

    window.getTransitionBuffer = () => {
        return (CONFIG.BUFFERS && CONFIG.BUFFERS.TRANSITION_MINUTES) ? CONFIG.BUFFERS.TRANSITION_MINUTES : 5;
    };

    // ========================================================================
    // 3. TÍNH TOÁN GIÁ & LOGIC COMBO
    // ========================================================================

    window.getPrice = (name) => {
        if (!name) return 0;
        if (window.SERVICES_DATA && window.SERVICES_DATA[name]) {
            return window.SERVICES_DATA[name].price;
        }
        return 0;
    };

    window.getOilPrice = (isOil) => {
        const oilRate = (CONFIG.FINANCE && CONFIG.FINANCE.OIL_BONUS) || 100;
        if (isOil === true || isOil === 'true' || isOil === 'Yes' || isOil === '是') return oilRate;
        return 0;
    };

    window.stringToColor = (str) => {
        if (!str) return '#cccccc';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    };

    window.getComboSplit = (duration, isMaxMode, sequence = 'FB', customPhase1 = null) => {
        const dur = parseInt(duration);
        if (!dur || isNaN(dur)) return { phase1: 0, phase2: 0, type1: '?', type2: '?' };

        let p1 = (customPhase1 !== null && !isNaN(customPhase1) && customPhase1 > 0)
            ? parseInt(customPhase1)
            : Math.floor(dur / 2);
        let p2 = dur - p1;

        if (sequence === 'BF') {
            return { phase1: p1, phase2: p2, type1: 'BODY', type2: 'FOOT' };
        } else {
            return { phase1: p1, phase2: p2, type1: 'FOOT', type2: 'BODY' };
        }
    };

    // ========================================================================
    // 4. SẮP XẾP & HIỂN THỊ (UI RENDERING)
    // ========================================================================

    /**
     * Tính trọng số sắp xếp dựa trên cấu hình PREFIX từ SYSTEM_CONFIG
     * Giúp Timeline luôn hiển thị 足 (Ghế) trước, 床 (Giường) sau
     */
    window.getWeight = (id) => {
        if (!id) return 9999;
        const chairPrefix = CONFIG.UI_LABELS.CHAIR_PREFIX; // 足
        const bedPrefix = CONFIG.UI_LABELS.BED_PREFIX;     // 床

        const num = parseInt(id.replace(/\D/g, ''));
        const base = isNaN(num) ? 9000 + id.charCodeAt(0) : num;

        // Nếu ID chứa ký hiệu Giường hoặc chữ BED/BODY -> Đẩy xuống dưới (2000+)
        if (id.includes(bedPrefix) || id.toLowerCase().includes('bed') || id.toUpperCase().includes('BODY')) {
            return 2000 + base;
        }
        // Nếu ID chứa ký hiệu Ghế hoặc chữ CHAIR/FOOT -> Xếp lên trên (1000+)
        if (id.includes(chairPrefix) || id.toLowerCase().includes('chair') || id.toUpperCase().includes('FOOT')) {
            return 1000 + base;
        }
        return base;
    };

    window.sortIdAsc = (a, b) => window.getWeight(a.id) - window.getWeight(b.id);

    /**
     * Nhãn hiển thị quy trình dịch vụ (Tiếng Trung Phồn Thể)
     */
    window.getFlowLabel = (sequence) => {
        if (sequence === 'BF') return "🛏️ 身體 (Body) ➜ 👣 足部 (Foot)";
        return "👣 足部 (Foot) ➜ 🛏️ 身體 (Body)";
    };

})();
/**
 * ============================================================================
 * FILE: js/utils.js
 * PHIÊN BẢN: V5.0 (ELASTIC TIME SUPPORT)
 * MÔ TẢ: CÁC HÀM HỖ TRỢ TOÀN CỤC (GLOBAL UTILITIES)
 * TÁC GIẢ: AI ASSISTANT & USER
 * ============================================================================
 */

(function() {
    console.log("🚀 Utils Module Loaded: V5.0 (Elastic Time Ready)");

    // 1. LẤY THỜI LƯỢNG DỊCH VỤ AN TOÀN
    // Nếu không tìm thấy dịch vụ, trả về thời gian mặc định (fallback)
    window.getSafeDuration = (serviceName, fallbackDuration) => {
        if (!serviceName) return fallbackDuration || 60;
        
        // Tìm chính xác trong DB
        if (window.SERVICES_DATA && window.SERVICES_DATA[serviceName]) {
            return window.SERVICES_DATA[serviceName].duration;
        }
        
        // Tìm tương đối (nếu tên dịch vụ bị kẹp thêm chữ)
        if (window.SERVICES_LIST) {
            const key = window.SERVICES_LIST.find(k => serviceName.includes(k));
            if (key && window.SERVICES_DATA[key]) {
                return window.SERVICES_DATA[key].duration;
            }
        }
        
        return fallbackDuration || 60;
    };

    // 2. LẤY NGÀY GIỜ CHUẨN ĐÀI LOAN (UTC+8)
    window.getTaipeiDate = () => {
        return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    };

    // 3. ĐỊNH DẠNG NGÀY CHO INPUT DATE (YYYY-MM-DD)
    // Logic: Nếu đang là 0h-8h sáng, thì tính là ngày hôm qua (Operational Day)
    window.getOperationalDateInputFormat = () => {
        const now = window.getTaipeiDate();
        // Nếu hiện tại nhỏ hơn 8h sáng, lùi lại 1 ngày
        if (now.getHours() < 8) {
            now.setDate(now.getDate() - 1);
        }
        const y = now.getFullYear();
        const m = (now.getMonth() + 1).toString().padStart(2, '0');
        const d = now.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    // 4. KIỂM TRA ĐƠN CÓ THUỘC NGÀY LÀM VIỆC KHÔNG
    window.isWithinOperationalDay = (bookingDateStr, bookingTimeStr, targetViewDateStr) => {
        if (!bookingDateStr || !bookingTimeStr) return false;

        // Chuẩn hóa dấu gạch ngang (-) thành gạch chéo (/) để so sánh
        const opDateStr = targetViewDateStr 
            ? targetViewDateStr.replace(/-/g, '/') 
            : window.getOperationalDateInputFormat().replace(/-/g, '/');
        
        let d = new Date(bookingDateStr); 
        // Fix lỗi Safari/Firefox kén định dạng ngày
        if(isNaN(d.getTime())) {
            d = new Date(bookingDateStr.replace(/-/g, '/'));
        }

        const bDateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
        const [h, m] = bookingTimeStr.split(':').map(Number);

        // Trường hợp 1: Booking cùng ngày với ngày xem, và giờ >= 8h sáng
        if (bDateStr === opDateStr && h >= 8) return true;

        // Trường hợp 2: Booking là ngày hôm sau của ngày xem, nhưng giờ < 8h sáng (Ca đêm)
        const nextDay = new Date(opDateStr); 
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = `${nextDay.getFullYear()}/${(nextDay.getMonth()+1).toString().padStart(2,'0')}/${nextDay.getDate().toString().padStart(2,'0')}`;
        
        if (bDateStr === nextDayStr && h < 8) return true;

        return false;
    };

    // 5. CHUYỂN ĐỔI GIỜ (HH:mm) THÀNH PHÚT TRONG TIMELINE
    // 08:00 -> 480, 01:00 (sáng hôm sau) -> 25*60 = 1500
    window.normalizeToTimelineMins = (timeStr) => {
        if (!timeStr) return 0;
        try {
            const [h, m] = timeStr.split(':').map(Number);
            if (isNaN(h) || isNaN(m)) return 0;
            
            let totalMins = h * 60 + m;
            // Logic shop mở từ 8h sáng -> 3h sáng hôm sau
            // Nếu giờ < 8, coi như là giờ của ngày hôm sau (cộng thêm 24h)
            if (h < 8) totalMins += 24 * 60; 
            return totalMins;
        } catch (e) {
            console.error("Error normalizing time:", timeStr);
            return 0;
        }
    };

    // 6. LẤY GIÁ TIỀN DỊCH VỤ
    window.getPrice = (name) => { 
        if (!name) return 0;
        if (window.SERVICES_DATA && window.SERVICES_DATA[name]) {
            return window.SERVICES_DATA[name].price;
        }
        if (window.SERVICES_DATA) {
            for(let k in window.SERVICES_DATA) {
                if(name.includes(k)) return window.SERVICES_DATA[k].price;
            }
        }
        return 0; 
    };

    // 7. TÍNH GIÁ DẦU (PHỤ THU)
    window.getOilPrice = (isOil) => {
        // Hỗ trợ cả boolean true/false và string "true"/"false"/"Yes"
        if (isOil === true || isOil === 'true' || isOil === 'Yes') return 200;
        return 0;
    };

    // 8. TẠO MÀU TỪ CHUỖI (HASH COLOR)
    window.stringToColor = (str) => {
        if (!str) return '#cccccc';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    };

    /**
     * [CORE UPDATE V5.0] TÍNH TOÁN CHIA GIỜ COMBO (CÓ HỖ TRỢ ELASTIC)
     * @param {number|string} duration Tổng thời gian
     * @param {boolean} isMaxMode (Cũ - Giữ lại để tương thích ngược)
     * @param {string} sequence Thứ tự: 'FB' (Chân trước) hoặc 'BF' (Thân trước)
     * @param {number|null} customPhase1 [MỚI] Thời gian Phase 1 thực tế từ Backend (nếu có)
     */
    window.getComboSplit = (duration, isMaxMode, sequence = 'FB', customPhase1 = null) => {
        const dur = parseInt(duration);
        if (!dur || isNaN(dur)) return { phase1: 0, phase2: 0, type1: '?', type2: '?' };
        
        let p1, p2;

        // [LOGIC MỚI]: Nếu có customPhase1 (do Backend tính co giãn), dùng ngay!
        if (customPhase1 !== null && customPhase1 !== undefined && !isNaN(customPhase1) && customPhase1 > 0) {
            p1 = parseInt(customPhase1);
            p2 = dur - p1;
        } else {
            // [LOGIC CŨ]: Mặc định chia đôi 50/50
            p1 = Math.floor(dur / 2);
            p2 = dur - p1;
        }

        // Gán loại dịch vụ dựa trên thứ tự
        if (sequence === 'FB') {
            // FB: Foot -> Body
            return { 
                phase1: p1, 
                phase2: p2, 
                type1: 'FOOT', 
                type2: 'BODY',
                isElastic: (customPhase1 !== null && customPhase1 !== Math.floor(dur/2)) // Cờ báo hiệu có bị lệch chuẩn không
            };
        } else {
            // BF: Body -> Foot
            return { 
                phase1: p1, 
                phase2: p2, 
                type1: 'BODY', 
                type2: 'FOOT',
                isElastic: (customPhase1 !== null && customPhase1 !== Math.floor(dur/2))
            };
        }
    };

    // 9. TÍNH TRỌNG SỐ SẮP XẾP (SORT WEIGHT)
    // Ghế 1 -> 1001, Giường 1 -> 2001 (Để giường luôn nằm sau ghế)
    window.getWeight = (id) => { 
        if (!id) return 9999;
        const num = parseInt(id.replace(/\D/g, '')); 
        const base = isNaN(num) ? 9000 + id.charCodeAt(0) : num;
        
        // Nếu là giường (bed), cộng thêm 2000 điểm để đẩy xuống dưới
        if (id.toLowerCase().includes('bed') || id.includes('身')) {
            return 2000 + base;
        }
        // Nếu là ghế (chair), cộng 1000 điểm
        return 1000 + base; 
    };

    // 10. HÀM SORT ID TĂNG DẦN
    window.sortIdAsc = (a, b) => window.getWeight(a.id) - window.getWeight(b.id);

})();
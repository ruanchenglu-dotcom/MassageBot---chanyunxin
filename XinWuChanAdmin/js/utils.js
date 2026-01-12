/**
 * ============================================================================
 * FILE: js/utils.js
 * PHIÊN BẢN: V5.2 (VISUAL UPGRADE SUPPORT)
 * MÔ TẢ: CÁC HÀM HỖ TRỢ TOÀN CỤC (GLOBAL UTILITIES)
 * CẬP NHẬT: Thêm formatMinutesToTime, tối ưu getComboSplit
 * TÁC GIẢ: AI ASSISTANT & USER
 * ============================================================================
 */

(function() {
    console.log("🚀 Utils Module Loaded: V5.2 (Visual Upgrade Ready)");

    // 1. LẤY THỜI LƯỢNG DỊCH VỤ AN TOÀN
    window.getSafeDuration = (serviceName, fallbackDuration) => {
        if (!serviceName) return fallbackDuration || 60;
        
        // Tìm chính xác trong DB
        if (window.SERVICES_DATA && window.SERVICES_DATA[serviceName]) {
            return window.SERVICES_DATA[serviceName].duration;
        }
        
        // Tìm tương đối
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
    window.getOperationalDateInputFormat = () => {
        const now = window.getTaipeiDate();
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

        const opDateStr = targetViewDateStr 
            ? targetViewDateStr.replace(/-/g, '/') 
            : window.getOperationalDateInputFormat().replace(/-/g, '/');
        
        let d = new Date(bookingDateStr); 
        if(isNaN(d.getTime())) {
            d = new Date(bookingDateStr.replace(/-/g, '/'));
        }

        const bDateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
        const [h, m] = bookingTimeStr.split(':').map(Number);

        if (bDateStr === opDateStr && h >= 8) return true;

        const nextDay = new Date(opDateStr); 
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = `${nextDay.getFullYear()}/${(nextDay.getMonth()+1).toString().padStart(2,'0')}/${nextDay.getDate().toString().padStart(2,'0')}`;
        
        if (bDateStr === nextDayStr && h < 8) return true;

        return false;
    };

    // 5. CHUYỂN ĐỔI GIỜ (HH:mm) THÀNH PHÚT TRONG TIMELINE
    window.normalizeToTimelineMins = (timeStr) => {
        if (!timeStr) return 0;
        try {
            const [h, m] = timeStr.split(':').map(Number);
            if (isNaN(h) || isNaN(m)) return 0;
            
            let totalMins = h * 60 + m;
            if (h < 8) totalMins += 24 * 60; 
            return totalMins;
        } catch (e) {
            console.error("Error normalizing time:", timeStr);
            return 0;
        }
    };

    // [NEW V5.2] CHUYỂN ĐỔI PHÚT THÀNH GIỜ HIỂN THỊ (HH:mm)
    // Ví dụ: 750 -> "12:30", 1500 -> "01:00"
    window.formatMinutesToTime = (totalMins) => {
        let h = Math.floor(totalMins / 60);
        let m = totalMins % 60;
        
        // Xử lý giờ quá 24h (cho ca đêm)
        if (h >= 24) h -= 24;
        
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
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

    // 7. TÍNH GIÁ DẦU
    window.getOilPrice = (isOil) => {
        if (isOil === true || isOil === 'true' || isOil === 'Yes') return 200;
        return 0;
    };

    // 8. TẠO MÀU TỪ CHUỖI
    window.stringToColor = (str) => {
        if (!str) return '#cccccc';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    };

    // 9. TÍNH TOÁN CHIA GIỜ COMBO
    window.getComboSplit = (duration, isMaxMode, sequence = 'FB', customPhase1 = null) => {
        const dur = parseInt(duration);
        if (!dur || isNaN(dur)) return { phase1: 0, phase2: 0, type1: '?', type2: '?' };
        
        let p1, p2;

        // Ưu tiên dùng customPhase1 (từ Sheet Cột O)
        if (customPhase1 !== null && customPhase1 !== undefined && !isNaN(customPhase1) && customPhase1 > 0) {
            p1 = parseInt(customPhase1);
            p2 = dur - p1;
        } else {
            // Mặc định chia đôi
            p1 = Math.floor(dur / 2);
            p2 = dur - p1;
        }

        if (sequence === 'FB') {
            return { 
                phase1: p1, 
                phase2: p2, 
                type1: 'FOOT', 
                type2: 'BODY',
                isElastic: (customPhase1 !== null && customPhase1 !== Math.floor(dur/2))
            };
        } else {
            return { 
                phase1: p1, 
                phase2: p2, 
                type1: 'BODY', 
                type2: 'FOOT',
                isElastic: (customPhase1 !== null && customPhase1 !== Math.floor(dur/2))
            };
        }
    };

    // 10. TÍNH TRỌNG SỐ SẮP XẾP
    window.getWeight = (id) => { 
        if (!id) return 9999;
        const num = parseInt(id.replace(/\D/g, '')); 
        const base = isNaN(num) ? 9000 + id.charCodeAt(0) : num;
        if (id.toLowerCase().includes('bed') || id.includes('身')) {
            return 2000 + base;
        }
        return 1000 + base; 
    };

    window.sortIdAsc = (a, b) => window.getWeight(a.id) - window.getWeight(b.id);

})();
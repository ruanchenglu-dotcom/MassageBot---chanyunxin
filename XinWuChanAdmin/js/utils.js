/**
 * ============================================================================
 * FILE: js/utils.js
 * PHIÊN BẢN: V5.3 (PENDULUM LOGIC SUPPORT)
 * MÔ TẢ: CÁC HÀM HỖ TRỢ TOÀN CỤC (GLOBAL UTILITIES)
 * CẬP NHẬT: 
 * 1. [getComboSplit]: Hỗ trợ tham số 'sequence' (FB/BF) để đảo ngược loại dịch vụ.
 * 2. [Phase Logic]: Định nghĩa lại Phase 1 là "Bước đi đầu tiên" thay vì cố định là Chân.
 * TÁC GIẢ: AI ASSISTANT & USER
 * ============================================================================
 */

(function() {
    console.log("🚀 Utils Module Loaded: V5.3 (Pendulum Strategy Ready)");

    // ========================================================================
    // 1. QUẢN LÝ DỊCH VỤ & THỜI GIAN
    // ========================================================================

    /**
     * Lấy thời lượng dịch vụ an toàn (Tránh lỗi null/undefined)
     */
    window.getSafeDuration = (serviceName, fallbackDuration) => {
        if (!serviceName) return fallbackDuration || 60;
        
        // Tìm chính xác trong DB (Object Lookup)
        if (window.SERVICES_DATA && window.SERVICES_DATA[serviceName]) {
            return window.SERVICES_DATA[serviceName].duration;
        }
        
        // Tìm tương đối (String Matching)
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
        // Tạo đối tượng Date mới dựa trên chuỗi thời gian locale của Taipei
        return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    };

    /**
     * Định dạng ngày cho thẻ <input type="date"> (YYYY-MM-DD)
     * * Logic: Nếu < 8h sáng thì vẫn tính là ngày làm việc hôm trước (Operational Day)
     */
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

    /**
     * Kiểm tra một booking có thuộc ngày làm việc đang xem không
     * Hỗ trợ logic qua đêm (00:00 - 08:00 sáng hôm sau vẫn thuộc ngày hôm nay)
     */
    window.isWithinOperationalDay = (bookingDateStr, bookingTimeStr, targetViewDateStr) => {
        if (!bookingDateStr || !bookingTimeStr) return false;

        // Chuẩn hóa định dạng ngày đích (Target View Date)
        const opDateStr = targetViewDateStr 
            ? targetViewDateStr.replace(/-/g, '/') 
            : window.getOperationalDateInputFormat().replace(/-/g, '/');
        
        // Parse ngày của booking
        let d = new Date(bookingDateStr); 
        if(isNaN(d.getTime())) {
            d = new Date(bookingDateStr.replace(/-/g, '/'));
        }

        const bDateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
        const [h, m] = bookingTimeStr.split(':').map(Number);

        // Trường hợp 1: Cùng ngày dương lịch và giờ >= 8:00
        if (bDateStr === opDateStr && h >= 8) return true;

        // Trường hợp 2: Là ngày dương lịch hôm sau nhưng giờ < 8:00 (Ca đêm)
        const nextDay = new Date(opDateStr); 
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = `${nextDay.getFullYear()}/${(nextDay.getMonth()+1).toString().padStart(2,'0')}/${nextDay.getDate().toString().padStart(2,'0')}`;
        
        if (bDateStr === nextDayStr && h < 8) return true;

        return false;
    };

    /**
     * Chuyển đổi giờ (HH:mm) thành phút tính từ 00:00 của ngày vận hành
     * * Lưu ý: 01:00 sáng hôm sau sẽ được tính là 25:00 (1500 phút)
     */
    window.normalizeToTimelineMins = (timeStr) => {
        if (!timeStr) return 0;
        try {
            const [h, m] = timeStr.split(':').map(Number);
            if (isNaN(h) || isNaN(m)) return 0;
            
            let totalMins = h * 60 + m;
            // Nếu giờ < 8, coi như là giờ của ngày hôm sau (+24h)
            if (h < 8) totalMins += 24 * 60; 
            return totalMins;
        } catch (e) {
            console.error("Error normalizing time:", timeStr);
            return 0;
        }
    };

    /**
     * Chuyển đổi phút timeline ngược lại thành giờ hiển thị (HH:mm)
     * * Ví dụ: 1500 phút -> "01:00"
     */
    window.formatMinutesToTime = (totalMins) => {
        let h = Math.floor(totalMins / 60);
        let m = totalMins % 60;
        
        // Xử lý giờ qua đêm
        if (h >= 24) h -= 24;
        
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    };

    // ========================================================================
    // 2. TÍNH TOÁN GIÁ & LOGIC COMBO
    // ========================================================================

    /**
     * Lấy giá tiền cơ bản của dịch vụ
     */
    window.getPrice = (name) => { 
        if (!name) return 0;
        if (window.SERVICES_DATA && window.SERVICES_DATA[name]) {
            return window.SERVICES_DATA[name].price;
        }
        // Fallback: Tìm theo tên gần đúng
        if (window.SERVICES_DATA) {
            for(let k in window.SERVICES_DATA) {
                if(name.includes(k)) return window.SERVICES_DATA[k].price;
            }
        }
        return 0; 
    };

    /**
     * Tính phụ thu tiền dầu
     */
    window.getOilPrice = (isOil) => {
        if (isOil === true || isOil === 'true' || isOil === 'Yes') return 200;
        return 0;
    };

    /**
     * Tạo mã màu Hex từ chuỗi bất kỳ (Dùng cho Avatar/ID)
     */
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
     * [CORE LOGIC V5.3]: TÍNH TOÁN CHIA PHA COMBO (Phase Splitter)
     * * Cập nhật: Hỗ trợ đảo chiều Sequence (BF/FB)
     * @param {number} duration Tổng thời gian
     * @param {boolean} isMaxMode (Legacy flag)
     * @param {string} sequence 'FB' (Foot->Body) hoặc 'BF' (Body->Foot)
     * @param {number|null} customPhase1 Thời gian tùy chỉnh của PHA ĐẦU TIÊN
     */
    window.getComboSplit = (duration, isMaxMode, sequence = 'FB', customPhase1 = null) => {
        const dur = parseInt(duration);
        if (!dur || isNaN(dur)) return { phase1: 0, phase2: 0, type1: '?', type2: '?' };
        
        let p1, p2;

        // 1. Xác định thời lượng Phase 1 (First Step)
        // Nếu có customPhase1, đó chính là thời lượng của bước đi đầu tiên
        if (customPhase1 !== null && customPhase1 !== undefined && !isNaN(customPhase1) && customPhase1 > 0) {
            p1 = parseInt(customPhase1);
        } else {
            // Mặc định chia đôi 50-50
            p1 = Math.floor(dur / 2);
        }
        
        // Phase 2 là phần còn lại
        p2 = dur - p1;

        // 2. Gán loại tài nguyên (Type) dựa trên Sequence
        if (sequence === 'BF') {
            // Trường hợp BODY FIRST (BF)
            // Phase 1: Làm Body trước -> Type = BODY (BED)
            // Phase 2: Làm Chân sau -> Type = FOOT (CHAIR)
            return { 
                phase1: p1, 
                phase2: p2, 
                type1: 'BODY', 
                type2: 'FOOT',
                isElastic: (customPhase1 !== null && customPhase1 !== Math.floor(dur/2))
            };
        } else {
            // Trường hợp FOOT FIRST (FB) - Mặc định
            // Phase 1: Làm Chân trước -> Type = FOOT (CHAIR)
            // Phase 2: Làm Body sau -> Type = BODY (BED)
            return { 
                phase1: p1, 
                phase2: p2, 
                type1: 'FOOT', 
                type2: 'BODY',
                isElastic: (customPhase1 !== null && customPhase1 !== Math.floor(dur/2))
            };
        }
    };

    // ========================================================================
    // 3. SẮP XẾP & HIỂN THỊ
    // ========================================================================

    /**
     * Tính trọng số để sắp xếp thẻ tài nguyên
     * Ghế (Chair) nhẹ hơn -> Xếp trước
     * Giường (Bed) nặng hơn -> Xếp sau
     */
    window.getWeight = (id) => { 
        if (!id) return 9999;
        const num = parseInt(id.replace(/\D/g, '')); 
        const base = isNaN(num) ? 9000 + id.charCodeAt(0) : num;
        
        // Bed hoặc Body thì cộng thêm 2000 điểm để đẩy xuống dưới
        if (id.toLowerCase().includes('bed') || id.includes('身') || id.toUpperCase().includes('BODY')) {
            return 2000 + base;
        }
        // Chair hoặc Foot thì cộng 1000 điểm
        return 1000 + base; 
    };

    /**
     * Hàm sort mảng object có thuộc tính id
     */
    window.sortIdAsc = (a, b) => window.getWeight(a.id) - window.getWeight(b.id);

    /**
     * [New] Helper lấy Label cho Sequence (Dùng cho UI hiển thị)
     */
    window.getFlowLabel = (sequence) => {
        if (sequence === 'BF') return "🛏️ Body ➜ 👣 Foot";
        return "👣 Foot ➜ 🛏️ Body";
    };

})();
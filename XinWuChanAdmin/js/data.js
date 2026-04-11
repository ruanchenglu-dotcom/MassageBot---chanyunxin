/**
 * ============================================================================
 * FILE: js/data.js (HOẶC dùng cho Backend)
 * PHIÊN BẢN: V1.1 (UNIVERSAL CONFIGURATION)
 * ============================================================================
 * MỤC TIÊU: 
 * 1. Quản lý toàn bộ thông số kỹ thuật của tiệm 禪云心養生館 tại một nơi.
 * 2. Cung cấp dữ liệu dự phòng (Fallback) cho bảng giá và quy mô hệ thống.
 * 3. Hỗ trợ chạy trên cả môi trường Frontend (Browser/React) và Backend (Node.js).
 */

// ============================================================================
// 1. KHAI BÁO CẤU HÌNH TRUNG TÂM (Độc lập môi trường)
// ============================================================================

const SYSTEM_CONFIG = {
    SHOP_INFO: {
        NAME: '禪云心養生館',
        BRANCH: 'Zhonghe', // Chi nhánh Trung Hòa
        VERSION: 'V1.1_Universal'
    },

    // Quy mô chi nhánh
    SCALE: {
        MAX_CHAIRS: 9, // Số lượng ghế (足)
        MAX_BEDS: 9,   // Số lượng giường (床)
        get TOTAL_RESOURCES() { return this.MAX_CHAIRS + this.MAX_BEDS; }
    },

    // Quản lý thời gian vận hành
    OPERATION_TIME: {
        OPEN_HOUR: 3,        // Giờ bắt đầu Timeline (03:00 AM)
        CUT_OFF_HOUR: 3,     // Giờ chốt sổ ngày hôm sau (03:00 AM)
        MINUTES_PER_SLOT: 1, // Đơn vị chia nhỏ nhất trên Timeline
        // Tự động tính tổng số phút vận hành trong ngày (24 tiếng = 1440 phút)
        get TOTAL_TIMELINE_MINS() {
            let hours = (24 - this.OPEN_HOUR) + this.CUT_OFF_HOUR;
            return hours * 60;
        }
    },

    // Thời gian đệm (Buffers)
    BUFFERS: {
        CLEANUP_MINUTES: 5,    // Thời gian dọn dẹp sau mỗi ca
        TRANSITION_MINUTES: 5  // Thời gian chuyển giữa ghế và giường (nếu có combo)
    },

    // Logic nhân viên và dịch vụ
    LOGIC_RULES: {
        STAFF_ID_MODE: 'NUMBER',         // Sử dụng số thay vì họ tên (ID Numbers)
        USE_TIME_PRECISION: true,        // Sử dụng miliseconds để xếp hàng công bằng
        SHORT_SERVICE_NO_PRIORITY: true, // Dịch vụ 1 block (35-40p) không được ưu tiên về đầu hàng
        AUTO_SYNC_GOOGLE_SHEETS: true
    },

    // Nhãn giao diện (Tiếng Trung Phồn Thể)
    UI_LABELS: {
        CHAIR_PREFIX: '足',
        BED_PREFIX: '床',
        MINUTES_UNIT: '分',
        PRICE_UNIT: '元'
    },

    // Tham số tài chính
    FINANCE: {
        DEFAULT_JIE_PRICE: 250, // Giá 1 tiết cơ bản
        OIL_BONUS: 0          // Thưởng tinh dầu (Đã đồng bộ với logic Backend cũ)
    }
};

// ============================================================================
// 2. DỮ LIỆU DỊCH VỤ DỰ PHÒNG (FALLBACK)
// ============================================================================

const DYNAMIC_PRICES_MAP = null;

const SERVICES_DATA = {
    '👑 帝王套餐 (190分)': { duration: 190, price: 2000, type: 'BED', category: 'COMBO', blocks: 6 },
    '💎 豪華套餐 (130分)': { duration: 130, price: 1500, type: 'BED', category: 'COMBO', blocks: 4 },
    '🔥 招牌套餐 (100分)': { duration: 100, price: 999, type: 'BED', category: 'COMBO', blocks: 3 },
    '⚡ 精選套餐 (70分)': { duration: 70, price: 900, type: 'BED', category: 'COMBO', blocks: 2 },
    '👣 足底按摩 (120分)': { duration: 120, price: 1500, type: 'CHAIR', category: 'FOOT', blocks: 4 },
    '👣 足底按摩 (90分)': { duration: 90, price: 999, type: 'CHAIR', category: 'FOOT', blocks: 3 },
    '👣 足底按摩 (70分)': { duration: 70, price: 900, type: 'CHAIR', category: 'FOOT', blocks: 2 },
    '👣 足底按摩 (40分)': { duration: 40, price: 500, type: 'CHAIR', category: 'FOOT', blocks: 1 },
    '🛏️ 全身指壓 (120分)': { duration: 120, price: 1500, type: 'BED', category: 'BODY', blocks: 4 },
    '🛏️ 全身指壓 (90分)': { duration: 90, price: 999, type: 'BED', category: 'BODY', blocks: 3 },
    '🛏️ 全身指壓 (70分)': { duration: 70, price: 900, type: 'BED', category: 'BODY', blocks: 2 },
    '🛏️ 半身指壓 (35分)': { duration: 35, price: 500, type: 'BED', category: 'BODY', blocks: 1 }
};

const SERVICES_LIST = Object.keys(SERVICES_DATA);

// ============================================================================
// 3. XUẤT MODULE (UNIVERSAL EXPORT LOGIC)
// ============================================================================

// A. Môi trường Browser / Frontend (Gắn vào window)
if (typeof window !== 'undefined') {
    window.SYSTEM_CONFIG = SYSTEM_CONFIG;
    window.DYNAMIC_PRICES_MAP = DYNAMIC_PRICES_MAP;
    window.SERVICES_DATA = SERVICES_DATA;
    window.SERVICES_LIST = SERVICES_LIST;

    console.log(`[Frontend Data] Loaded config for ${SYSTEM_CONFIG.SHOP_INFO.NAME} - ${SYSTEM_CONFIG.SHOP_INFO.BRANCH}`);
}

// B. Môi trường Node.js / Backend (Sử dụng module.exports)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SYSTEM_CONFIG,
        DYNAMIC_PRICES_MAP,
        SERVICES_DATA,
        SERVICES_LIST
    };

    console.log(`[Backend Data] Loaded config for ${SYSTEM_CONFIG.SHOP_INFO.NAME} - ${SYSTEM_CONFIG.SHOP_INFO.BRANCH}`);
}
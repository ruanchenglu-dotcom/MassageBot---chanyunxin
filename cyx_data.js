/**
 * ============================================================================
 * FILE: js/cyx_data.js (HOẶC dùng cho Backend)
 * PHIÊN BẢN: V1.5 (EXACT SHEET NAMES, VARIABLES & GLOBAL STATUS)
 * ============================================================================
 * MỤC TIÊU: 
 * 1. Quản lý toàn bộ thông số kỹ thuật của tiệm 禪云心養生館 tại một nơi.
 * 2. Cung cấp dữ liệu dự phòng (Fallback) cho bảng giá và quy mô hệ thống.
 * 3. Hỗ trợ chạy trên cả môi trường Frontend (Browser/React) và Backend (Node.js).
 * * * * * UPDATE V1.5:
 * + [FEATURE] Khai báo Object BOOKING_STATUS toàn cục bằng tiếng Trung Phồn Thể để quản lý trạng thái đồng nhất (SSOT).
 * * * * * UPDATE V1.4:
 * + [FIX] Cập nhật block SHEET_NAMES với đúng cấu trúc tên biến và tên sheet Phồn Thể (預約表, 技師班表, 服務價目).
 * * * * * UPDATE V1.3:
 * + [FIX] Đổi toàn bộ Key của SERVICES_DATA sang service_code (A3, A2, F3...) để đồng bộ với Sheet.
 * + [FEATURE] Cập nhật giá tiền, thời gian, số tiết (blocks) và hoa hồng (commission) khớp 100% với Sheet mới.
 * * * * * UPDATE V1.2:
 * + [FEATURE] Thêm block API_CONFIG để quản lý tập trung tần suất đồng bộ (SYNC_INTERVAL).
 */

// ============================================================================
// 1. KHAI BÁO CẤU HÌNH TRUNG TÂM (Độc lập môi trường)
// ============================================================================

const SYSTEM_CONFIG = {
    SHOP_INFO: {
        NAME: '禪云心養生館',
        BRANCH: '古亭', // Chi nhánh 古亭
        VERSION: 'V1.5_Universal'
    },

    // Cấu hình Database (Google Sheets) - Chuẩn tên biến & tên sheet Phồn Thể
    SHEET_NAMES: {
        BOOKING_SHEET_NAME: '預約表',       // Dữ liệu đặt lịch chung
        STAFF_SHEET_NAME: '技師班表',       // Bảng chia ca/lịch làm việc của kỹ thuật viên
        MENU_SHEET_NAME: '服務價目',        // Bảng giá dịch vụ hệ thống

        // Các sheet bổ sung (dựa trên cấu trúc tab hiện tại)
        STAFF_LIST_SHEET_NAME: 'name',      // Danh sách hồ sơ kỹ thuật viên
        SALARY_SHEET_NAME: 'Salary',        // Bảng lương
        SALARY_LOG_SHEET_NAME: 'SalaryLog'  // Lịch sử thanh toán lương/hoa hồng
    },

    // Quy mô chi nhánh
    SCALE: {
        MAX_CHAIRS: 6, // Số lượng ghế (足)
        MAX_BEDS: 6,   // Số lượng giường (床)
        get TOTAL_RESOURCES() { return this.MAX_CHAIRS + this.MAX_BEDS; }
    },

    // Quản lý thời gian vận hành
    OPERATION_TIME: {
        OPEN_HOUR: 8,        // Giờ bắt đầu Timeline (03:00 AM)
        CUT_OFF_HOUR: 2,     // Giờ chốt sổ ngày hôm sau (03:00 AM)
        MINUTES_PER_SLOT: 1, // Đơn vị chia nhỏ nhất trên Timeline
        // Tự động tính tổng số phút vận hành trong ngày (24 tiếng = 1440 phút + 120 phút)
        get TOTAL_TIMELINE_MINS() {
            let hours = (24 - this.OPEN_HOUR) + this.CUT_OFF_HOUR + 2;
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

    // Cấu hình tối ưu hóa API & Mạng
    API_CONFIG: {
        SYNC_INTERVAL: 30000, // Tần suất đồng bộ Google Sheets (30 giây/lần)
        MAX_RETRIES: 3        // Số lần lỗi API liên tiếp tối đa trước khi gửi cảnh báo LINE
    },

    // Nhãn giao diện (Tiếng Trung Phồn Thể)
    UI_LABELS: {
        CHAIR_PREFIX: '足',
        BED_PREFIX: '床',
        MINUTES_UNIT: '分',
        PRICE_UNIT: '元',
        LOADING_DATA: '資料庫連接中...',
        SYSTEM_UPDATE: '系統更新中請稍後'
    },

    // Tham số tài chính
    FINANCE: {
        DEFAULT_JIE_PRICE: 250, // Giá 1 tiết cơ bản
        OIL_BONUS: 0            // Thưởng tinh dầu
    }
};

// ============================================================================
// 2. TRẠNG THÁI BOOKING & DỮ LIỆU DỊCH VỤ DỰ PHÒNG (FALLBACK)
// ============================================================================

// Hằng số quản lý trạng thái Booking (Single Source of Truth)
const BOOKING_STATUS = {
    WAITING: '等待中',     // Đang chờ tới lượt
    SERVING: '服務中',     // Đang trong quá trình phục vụ
    COMPLETED: '已完成',   // Đã hoàn thành xong dịch vụ
    CANCELLED: '已取消'    // Đã hủy lịch
};

const DYNAMIC_PRICES_MAP = null;

const SERVICES_DATA = {
    'A3': { name: '套餐 (120分)', duration: 120, price: 1200, type: 'BED', category: 'COMBO', blocks: 3, commission: 250 },
    'A2': { name: '套餐 (70分)', duration: 70, price: 800, type: 'BED', category: 'COMBO', blocks: 2, commission: 250 },

    'F3': { name: '腳底按摩 (110分)', duration: 110, price: 1200, type: 'CHAIR', category: 'FOOT', blocks: 3, commission: 250 },
    'F2': { name: '腳底按摩 (70分)', duration: 70, price: 800, type: 'CHAIR', category: 'FOOT', blocks: 2, commission: 250 },
    'F1': { name: '腳底按摩 (40分)', duration: 40, price: 500, type: 'CHAIR', category: 'FOOT', blocks: 1, commission: 250 },

    'B3': { name: '身體按摩 (110分)', duration: 110, price: 1200, type: 'BED', category: 'BODY', blocks: 3, commission: 250 },
    'B2': { name: '身體按摩 (70分)', duration: 70, price: 800, type: 'BED', category: 'BODY', blocks: 2, commission: 250 },
    'B1': { name: '身體按摩 (35分)', duration: 35, price: 500, type: 'BED', category: 'BODY', blocks: 1, commission: 250 },

    'C1': { name: '拔罐/刮痧 (35分)', duration: 35, price: 500, type: 'BED', category: 'ADDON', blocks: 1, commission: 250 },
    'C2': { name: '修指甲/修腳皮 (35分)', duration: 35, price: 500, type: 'CHAIR', category: 'ADDON', blocks: 1, commission: 250 }
};

const SERVICES_LIST = Object.keys(SERVICES_DATA);

// ============================================================================
// 3. XUẤT MODULE (UNIVERSAL EXPORT LOGIC)
// ============================================================================

// A. Môi trường Browser / Frontend (Gắn vào window)
if (typeof window !== 'undefined') {
    window.SYSTEM_CONFIG = SYSTEM_CONFIG;
    window.BOOKING_STATUS = BOOKING_STATUS;
    window.DYNAMIC_PRICES_MAP = DYNAMIC_PRICES_MAP;
    window.SERVICES_DATA = SERVICES_DATA;
    window.SERVICES_LIST = SERVICES_LIST;

    console.log(`[Frontend Data] Loaded config for ${SYSTEM_CONFIG.SHOP_INFO.NAME} - ${SYSTEM_CONFIG.SHOP_INFO.BRANCH}`);
}

// B. Môi trường Node.js / Backend (Sử dụng module.exports)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SYSTEM_CONFIG,
        BOOKING_STATUS,
        DYNAMIC_PRICES_MAP,
        SERVICES_DATA,
        SERVICES_LIST
    };

    console.log(`[Backend Data] Loaded config for ${SYSTEM_CONFIG.SHOP_INFO.NAME} - ${SYSTEM_CONFIG.SHOP_INFO.BRANCH}`);
}
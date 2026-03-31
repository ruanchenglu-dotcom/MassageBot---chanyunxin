/**
 * ============================================================================
 * FILE: js/data.js
 * PHIÊN BẢN: V108.19 (DYNAMIC PRICING FALLBACK)
 * ============================================================================
 * LƯU Ý QUAN TRỌNG: 
 * Kể từ phiên bản này, giá tiền (price) ở file này CHỈ LÀ DỮ LIỆU DỰ PHÒNG (Fallback).
 * Mục đích của nó là tạo bộ khung (Skeleton) giúp giao diện không bị lỗi trắng trang 
 * trong 1-2 giây đầu tiên khởi động hệ thống.
 * * Ngay khi app.js kết nối API Google Sheets thành công, toàn bộ bảng giá này sẽ 
 * BỊ GHI ĐÈ HOÀN TOÀN bởi giá trị thực tế (Cột D) lấy từ Sheet Menu.
 */

// Khởi tạo trạm trung chuyển để views.js và app.js giao tiếp giá động
window.DYNAMIC_PRICES_MAP = null;

// Dữ liệu dịch vụ tĩnh dự phòng (Sẽ được cập nhật động bởi app.js)
window.SERVICES_DATA = {
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

window.SERVICES_LIST = Object.keys(window.SERVICES_DATA);
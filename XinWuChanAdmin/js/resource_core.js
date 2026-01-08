/**
 * ============================================================================
 * FILE: resource_core.js
 * CẬP NHẬT: Hỗ trợ nạp Menu từ Google Sheet
 * ============================================================================
 */

const CONFIG = {
    MAX_CHAIRS: 6,
    MAX_BEDS: 6,
    CLEANUP_BUFFER: 10,
    FUTURE_BUFFER: 5,
    MAX_TIMELINE_MINS: 3000
};

// Khởi tạo mặc định (Fallback nếu chưa load được sheet)
let SERVICES = {}; 

/**
 * Hàm này sẽ được index.js gọi mỗi khi sync dữ liệu từ Sheet
 * @param {Object} newServicesObj - Danh sách dịch vụ mới từ Sheet
 */
function setDynamicServices(newServicesObj) {
    // Luôn giữ lại các dịch vụ hệ thống (System Services)
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' }
    };

    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE] Updated Services List: ${Object.keys(SERVICES).length} items loaded.`);
}

// ... (Giữ nguyên các hàm helper: getMinsFromTimeStr, formatDateDisplay, getTaipeiNow) ...
// ... (Giữ nguyên các hàm logic: isStaffWorkingAt, isRangeFree, markRangeBusy, placeBookingOnMap) ...

/**
 * LOGIC QUAN TRỌNG: Cập nhật hàm checkRequestAvailability để dùng SERVICES mới nhất
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookings, staffList, scheduleMap) {
    // ... (Giữ nguyên logic cũ) ...
    
    // Trong vòng lặp kiểm tra guestList, đảm bảo gọi SERVICES (biến global đã update)
    for (const guest of guestList) {
        const svcInfo = SERVICES[guest.serviceCode]; // Lấy từ danh sách động
        if (!svcInfo) return { feasible: false, reason: `Dịch vụ không tồn tại: ${guest.serviceCode}` };

        // ... (Logic xếp chỗ giữ nguyên) ...
    }
    
    // ... (Giữ nguyên phần return) ...
}

module.exports = {
    checkRequestAvailability,
    setDynamicServices, // Xuất hàm này để index.js gọi
    get SERVICES() { return SERVICES; }, // Getter để lấy dữ liệu mới nhất
    CONFIG
};
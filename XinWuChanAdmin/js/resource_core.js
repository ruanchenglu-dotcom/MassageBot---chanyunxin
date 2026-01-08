/**
 * ============================================================================
 * FILE: resource_core.js
 * PHIÊN BẢN: HOÀN THIỆN (Full Logic Check Availability)
 * ============================================================================
 */

const moment = require('moment-timezone'); // Cần cài đặt: npm install moment-timezone

const CONFIG = {
    MAX_CHAIRS: 6,       // Tối đa 6 ghế
    MAX_BEDS: 6,         // Tối đa 6 giường
    CLEANUP_BUFFER: 10,  // Thời gian dọn dẹp giữa các ca (phút)
    FUTURE_BUFFER: 5,    // Chỉ cho phép đặt trước ít nhất 5 phút
    MAX_TIMELINE_MINS: 1440 // 24h * 60
};

// Khởi tạo mặc định
let SERVICES = {}; 

// ============================================================================
// PHẦN 1: QUẢN LÝ DỊCH VỤ (SERVICES)
// ============================================================================

/**
 * Hàm nạp danh sách dịch vụ từ index.js (sau khi sync Sheet)
 */
function setDynamicServices(newServicesObj) {
    const systemServices = {
        'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
        'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
        'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' }
    };
    SERVICES = { ...newServicesObj, ...systemServices };
    console.log(`[CORE] Updated Services List: ${Object.keys(SERVICES).length} items loaded.`);
}

// ============================================================================
// PHẦN 2: CÁC HÀM HỖ TRỢ (HELPER FUNCTIONS)
// ============================================================================

/**
 * Lấy giờ hiện tại ở Đài Loan
 */
function getTaipeiNow() {
    return moment().tz("Asia/Taipei");
}

/**
 * Chuyển đổi "HH:mm" thành số phút từ đầu ngày (00:00)
 * VD: "08:30" -> 510
 */
function getMinsFromTimeStr(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Kiểm tra 2 khoảng thời gian có trùng nhau không
 * (StartA < EndB) && (StartB < EndA)
 */
function isOverlap(startA, endA, startB, endB) {
    return (startA < endB) && (startB < endA);
}

/**
 * Kiểm tra nhân viên có đang trong ca làm việc không
 * staffList format: { "StaffA": { start: "10:00", end: "22:00", off: false }, ... }
 */
function isStaffWorkingAt(staffName, timeMins, staffList) {
    const staff = staffList[staffName];
    if (!staff) return false; // Không tìm thấy nhân viên
    if (staff.off) return false; // Nhân viên xin nghỉ

    const shiftStart = getMinsFromTimeStr(staff.start);
    const shiftEnd = getMinsFromTimeStr(staff.end);

    // Xử lý ca làm việc qua đêm (VD: 20:00 -> 02:00 sáng hôm sau) - logic đơn giản cho ca trong ngày
    // Nếu shiftEnd < shiftStart (qua đêm), ta cần logic phức tạp hơn, nhưng ở đây giả sử ca nằm trong ngày 8h-24h
    return timeMins >= shiftStart && timeMins < shiftEnd;
}

/**
 * Kiểm tra tài nguyên (Giường/Ghế) có bị full tại khoảng thời gian này không
 */
function isResourceAvailable(type, startMins, endMins, currentBookings, tentativeBookings) {
    if (type === 'NONE') return true; // Dịch vụ không cần giường/ghế
    
    const limit = (type === 'BED') ? CONFIG.MAX_BEDS : CONFIG.MAX_CHAIRS;
    
    // Gộp tất cả booking hiện tại và các booking đang "dự tính" trong request này
    const allBookings = [...currentBookings, ...tentativeBookings];

    // Đếm số lượng sử dụng tại thời điểm startMins (hoặc quét qua range)
    // Cách đơn giản và hiệu quả: Kiểm tra overlap
    let count = 0;
    for (const bk of allBookings) {
        // Chỉ tính những booking dùng cùng loại tài nguyên (BED/CHAIR)
        // Lưu ý: bk.serviceCode cần map ngược ra type, hoặc bk đã lưu type
        let bkType = 'CHAIR'; // Mặc định
        if (SERVICES[bk.serviceCode]) {
            bkType = SERVICES[bk.serviceCode].type;
        }
        
        if (bkType === type) {
            const bkStart = getMinsFromTimeStr(bk.startTime);
            const bkEnd = getMinsFromTimeStr(bk.endTime); // endTime này nên bao gồm buffer nếu cần
            
            if (isOverlap(startMins, endMins, bkStart, bkEnd)) {
                count++;
            }
        }
    }

    return count < limit;
}

// ============================================================================
// PHẦN 3: LOGIC KIỂM TRA KHẢ THI (CORE)
// ============================================================================

/**
 * Kiểm tra xem yêu cầu đặt lịch có khả thi không
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {string} timeStr "HH:mm" (Giờ bắt đầu)
 * @param {Array} guestList [{ serviceCode: 'A', staffName: 'Any' }, { serviceCode: 'B', staffName: 'Lisa' }]
 * @param {Array} currentBookings Danh sách booking đã có trong DB ngày hôm đó
 * @param {Object} staffList Danh sách nhân viên và ca làm việc
 */
function checkRequestAvailability(dateStr, timeStr, guestList, currentBookings, staffList) {
    const requestStartMins = getMinsFromTimeStr(timeStr);
    
    // Kiểm tra quá khứ (nếu check cho ngày hôm nay)
    const now = getTaipeiNow();
    const checkDate = moment(dateStr, "YYYY-MM-DD");
    if (checkDate.isSame(now, 'day')) {
        const currentMins = now.hours() * 60 + now.minutes();
        if (requestStartMins < currentMins + CONFIG.FUTURE_BUFFER) {
            return { feasible: false, reason: "Thời gian đã qua hoặc quá sát giờ!" };
        }
    }

    // Danh sách booking tạm thời (để xử lý trường hợp 1 request có nhiều khách)
    let tentativeBookings = [];
    
    // Kết quả trả về chi tiết cho từng khách
    let assignedDetails = [];

    for (let i = 0; i < guestList.length; i++) {
        const guest = guestList[i];
        const svcInfo = SERVICES[guest.serviceCode];

        // 1. Validate Dịch vụ
        if (!svcInfo) {
            return { feasible: false, reason: `Dịch vụ không tồn tại: ${guest.serviceCode}` };
        }

        const duration = svcInfo.duration;
        const type = svcInfo.type; // BED, CHAIR, NONE
        // Thời gian kết thúc = Bắt đầu + Thời lượng + Thời gian dọn dẹp
        const requestEndMins = requestStartMins + duration + CONFIG.CLEANUP_BUFFER;

        // 2. Validate Tài nguyên (Giường/Ghế) Tổng quát
        // Kiểm tra xem tại khung giờ này, loại tài nguyên đó có còn trống không (tính cả khách trước trong cùng request)
        if (!isResourceAvailable(type, requestStartMins, requestEndMins, currentBookings, tentativeBookings)) {
            return { 
                feasible: false, 
                reason: `Hết ${type === 'BED' ? 'Giường' : 'Ghế'} vào lúc ${timeStr}` 
            };
        }

        // 3. Validate Nhân viên (Staff)
        let assignedStaff = null;

        if (guest.staffName && guest.staffName !== 'Any') {
            // === KHÁCH CHỌN NHÂN VIÊN CỤ THỂ ===
            const staffName = guest.staffName;

            // a. Có đi làm không?
            if (!isStaffWorkingAt(staffName, requestStartMins, staffList)) {
                return { feasible: false, reason: `Nhân viên ${staffName} không làm việc giờ này.` };
            }

            // b. Có bị trùng giờ không? (Check DB + Tentative)
            const allBusyRanges = [...currentBookings, ...tentativeBookings].filter(b => b.staffName === staffName);
            let isBusy = false;
            for (const b of allBusyRanges) {
                const bStart = getMinsFromTimeStr(b.startTime);
                const bEnd = getMinsFromTimeStr(b.endTime); // Đã có buffer trong DB
                if (isOverlap(requestStartMins, requestEndMins, bStart, bEnd)) {
                    isBusy = true;
                    break;
                }
            }

            if (isBusy) {
                return { feasible: false, reason: `Nhân viên ${staffName} đã kẹt lịch.` };
            }

            assignedStaff = staffName;

        } else {
            // === KHÁCH CHỌN NGẪU NHIÊN (ANY) ===
            // Tìm nhân viên: Đang đi làm AND Chưa bị kẹt lịch
            const availableStaffs = Object.keys(staffList).filter(name => {
                // Check đi làm
                if (!isStaffWorkingAt(name, requestStartMins, staffList)) return false;

                // Check kẹt lịch
                const allBusyRanges = [...currentBookings, ...tentativeBookings].filter(b => b.staffName === name);
                for (const b of allBusyRanges) {
                    const bStart = getMinsFromTimeStr(b.startTime);
                    const bEnd = getMinsFromTimeStr(b.endTime);
                    if (isOverlap(requestStartMins, requestEndMins, bStart, bEnd)) {
                        return false; // Bận
                    }
                }
                return true; // Rảnh
            });

            if (availableStaffs.length === 0) {
                return { feasible: false, reason: "Không còn nhân viên nào rảnh vào giờ này." };
            }

            // Chọn người đầu tiên (hoặc random nếu muốn)
            assignedStaff = availableStaffs[0];
        }

        // 4. Thành công cho khách này -> Thêm vào danh sách tạm để check cho khách tiếp theo
        tentativeBookings.push({
            serviceCode: guest.serviceCode,
            staffName: assignedStaff,
            startTime: timeStr,
            endTime: moment().startOf('day').add(requestEndMins, 'minutes').format('HH:mm') // Quy đổi ngược lại HH:mm cho đồng bộ
        });

        assignedDetails.push({
            guestIndex: i,
            staff: assignedStaff,
            service: svcInfo.name,
            price: svcInfo.price
        });
    }

    // Nếu chạy hết vòng lặp mà không return false -> OK
    return {
        feasible: true,
        details: assignedDetails,
        totalPrice: assignedDetails.reduce((sum, item) => sum + item.price, 0)
    };
}

module.exports = {
    checkRequestAvailability,
    setDynamicServices,
    get SERVICES() { return SERVICES; },
    CONFIG,
    // Xuất thêm các helper nếu cần dùng ở nơi khác
    getMinsFromTimeStr,
    getTaipeiNow
};
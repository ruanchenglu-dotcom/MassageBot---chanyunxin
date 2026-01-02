/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT (BACKEND SERVER)
 * VERSION: V144 (FIXED: MIDDLEWARE ORDER)
 * AUTHOR: AI ASSISTANT & OWNER
 * DATE: 2025/12/27
 * * [CHI TIẾT CẬP NHẬT V144]:
 * 1. MỞ RỘNG PHẠM VI ĐỒNG BỘ (SYNC DATA):
 * - Range đọc: 'Sheet1!A:Q' (Đọc hết từ cột A đến cột Q).
 * - Mục đích: Lấy thông tin của tối đa 6 thợ phục vụ (Staff 1 -> Staff 6).
 * * 2. NÂNG CẤP API CẬP NHẬT (/api/update-booking-details):
 * - Hỗ trợ ghi dữ liệu độc lập vào 6 cột nhân viên phục vụ:
 * + Cột L (Index 11): Service Staff 1 (服務師傅1) - Thợ chính
 * + Cột M (Index 12): Service Staff 2 (服務師傅2) - Thợ phụ / Nhóm
 * + Cột N (Index 13): Service Staff 3 (服務師傅3)
 * + Cột O (Index 14): Service Staff 4 (服務師傅4)
 * + Cột P (Index 15): Service Staff 5 (服務師傅5)
 * + Cột Q (Index 16): Service Staff 6 (服務師傅6)
 * * 3. LOGIC TƯƠNG THÍCH (COMPATIBILITY):
 * - Vẫn giữ logic nhận diện "Shotgun Payload" từ Frontend V251.
 * - Hỗ trợ cả JSON và Form Data để đảm bảo Google App Script không bị miss dữ liệu.
 * * 4. GIỮ NGUYÊN TÍNH NĂNG CỐT LÕI (CORE FEATURES):
 * - Overlap Tolerance: 45 giây (Chống lỗi lệch giây trên Kiosk).
 * - Buffer Time: 5 phút (Cho phép đặt sát giờ).
 * - Line Bot: Đặt lịch, Xem menu, Admin quản lý.
 * =================================================================================================
 */

// ==============================================================================
// PHẦN 1: KHAI BÁO THƯ VIỆN VÀ CẤU HÌNH (LIBRARIES & CONFIG)
// ==============================================================================

// Nạp biến môi trường từ file .env (Chứa token, secret, sheet ID)
require('dotenv').config(); 

// Các thư viện lõi (Core Libraries)
const express = require('express');       // Framework Web Server
const line = require('@line/bot-sdk');    // SDK cho LINE Messaging API
const { google } = require('googleapis'); // SDK cho Google Sheets API
const cors = require('cors');             // Xử lý Cross-Origin Resource Sharing (cho phép Kiosk gọi API)
const path = require('path');             // Xử lý đường dẫn file hệ thống
const bodyParser = require('body-parser'); // Hỗ trợ đọc body request phức tạp

// --- CẤU HÌNH LINE BOT ---
// Các thông tin này lấy từ LINE Developers Console
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// --- CẤU HÌNH GOOGLE SHEETS & ADMIN ---
const ID_BA_CHU = process.env.ID_BA_CHU; // ID Line của chủ quán để nhận thông báo quan trọng
const SHEET_ID = process.env.SHEET_ID;   // ID của Google Spreadsheet (lấy từ URL)

// Tên các Sheet dữ liệu trong file Google Sheet
const BOOKING_SHEET = 'Sheet1';          // Sheet lưu đơn đặt lịch chính
const STAFF_SHEET = 'StaffLog';          // Sheet lưu log nhân viên (chấm công/nghỉ)
const SCHEDULE_SHEET = 'StaffSchedule';  // Sheet lưu lịch làm việc cố định & ngày nghỉ

// --- GIỚI HẠN TÀI NGUYÊN CỨNG (HARD LIMITS) ---
// Số lượng ghế và giường thực tế tại quán để thuật toán tính toán
const MAX_CHAIRS = 6; // Tổng số ghế làm chân
const MAX_BEDS = 6;   // Tổng số giường làm body

// --- CẤU HÌNH LOGIC THỜI GIAN (V141 LEGACY) ---
const FUTURE_BUFFER_MINS = 5; // Chỉ chặn nếu giờ đặt < hiện tại + 5 phút (Cho phép khách đặt gấp)
const OVERLAP_TOLERANCE_MS = 45000; // 45 giây. Nếu trùng nhau dưới 45s thì coi như không trùng (Fix lỗi Kiosk lệch giây)

// --- CẤU HÌNH XÁC THỰC GOOGLE API ---
// Sử dụng file key JSON (Service Account) để xác thực quyền truy cập Sheet
const auth = new google.auth.GoogleAuth({
    keyFile: 'google-key.json', 
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ==============================================================================
// PHẦN 2: QUẢN LÝ TRẠNG THÁI TOÀN CỤC (GLOBAL STATE MANAGEMENT)
// ==============================================================================

// SERVER_RESOURCE_STATE:
// Lưu trạng thái các đơn đang chạy thực tế trên Kiosk (Real-time).
// Dữ liệu này giúp Bot biết khách vãng lai đang ngồi ghế nào để không xếp trùng.
let SERVER_RESOURCE_STATE = {}; 

// SERVER_STAFF_STATUS:
// Lưu trạng thái làm việc hiện tại của nhân viên (Đang bận, Ra ngoài, Ăn cơm...).
// Đồng bộ từ Kiosk lên Server để Bot biết ai đang rảnh.
let SERVER_STAFF_STATUS = {};   

// STAFF_LIST:
// Danh sách toàn bộ nhân viên và ca làm việc của họ (được đồng bộ từ Sheet Schedule).
let STAFF_LIST = []; 

// cachedBookings:
// Danh sách các đơn đặt lịch đã được lưu trong Google Sheet.
// Dùng để cache dữ liệu, giảm số lần gọi Google API.
let cachedBookings = []; 

// scheduleMap:
// Bản đồ lịch nghỉ (OFF) của nhân viên theo từng ngày.
// Cấu trúc: { "2025/12/25": ["Vương", "Lý"], ... }
let scheduleMap = {}; 

// userState:
// Lưu trạng thái hội thoại của người dùng LINE (đang chọn dịch vụ, chọn ngày, hay chọn giờ...)
// Giúp Bot nhớ ngữ cảnh khi chat.
let userState = {}; 

// ==============================================================================
// PHẦN 3: DANH MỤC DỊCH VỤ (SERVICE CATALOG)
// ==============================================================================
// Định nghĩa chi tiết các gói dịch vụ, thời gian, loại tài nguyên cần dùng và giá tiền.
const SERVICES = {
    // --- GÓI COMBO (KẾT HỢP CHÂN & THÂN) ---
    // Loại này cần cả Ghế và Giường. Bot sẽ ưu tiên tìm slot liền mạch.
    // QUAN TRỌNG: Type là BED để ưu tiên kiểm tra giường trước (tài nguyên khan hiếm hơn).
    'CB_190': { name: '👑 帝王套餐 (190分)', duration: 190, type: 'BED', category: 'COMBO', price: 2000 },
    'CB_130': { name: '💎 豪華套餐 (130分)', duration: 130, type: 'BED', category: 'COMBO', price: 1500 },
    'CB_100': { name: '🔥 招牌套餐 (100分)', duration: 100, type: 'BED', category: 'COMBO', price: 999 },
    'CB_70':  { name: '⚡ 精選套餐 (70分)',  duration: 70,  type: 'BED', category: 'COMBO', price: 900 },
    
    // --- GÓI FOOT (CHÂN - DÙNG GHẾ) ---
    'FT_120': { name: '👣 足底按摩 (120分)', duration: 120, type: 'CHAIR', category: 'FOOT', price: 1500 },
    'FT_90':  { name: '👣 足底按摩 (90分)',  duration: 90,  type: 'CHAIR', category: 'FOOT', price: 999 },
    'FT_70':  { name: '👣 足底按摩 (70分)',  duration: 70,  type: 'CHAIR', category: 'FOOT', price: 900 },
    'FT_40':  { name: '👣 足底按摩 (40分)',  duration: 40,  type: 'CHAIR', category: 'FOOT', price: 500 },
    
    // --- GÓI BODY (THÂN - DÙNG GIƯỜNG) ---
    'BD_120': { name: '🛏️ 全身指壓 (120分)', duration: 120, type: 'BED', category: 'BODY', price: 1500 },
    'BD_90':  { name: '🛏️ 全身指壓 (90分)',  duration: 90,  type: 'BED', category: 'BODY', price: 999 },
    'BD_70':  { name: '🛏️ 全身指壓 (70分)',  duration: 70,  type: 'BED', category: 'BODY', price: 900 }, 
    'BD_35':  { name: '🛏️ 半身指壓 (35分)',  duration: 35,  type: 'BED', category: 'BODY', price: 500 },

    // --- CÁC TRẠNG THÁI ĐẶC BIỆT (DÙNG CHO ADMIN) ---
    'OFF_DAY': { name: '⛔ 請假', duration: 1080, type: 'NONE' },
    'BREAK_30': { name: '🍱 用餐', duration: 30, type: 'NONE' },
    'SHOP_CLOSE': { name: '⛔ 店休', duration: 1440, type: 'NONE' }
};

// ==============================================================================
// PHẦN 4: CÁC HÀM TIỆN ÍCH XỬ LÝ THỜI GIAN & DỮ LIỆU (UTILITIES)
// ==============================================================================

/**
 * Lấy đối tượng Date đại diện cho thời gian hiện tại ở Đài Loan (Asia/Taipei).
 * Đây là hàm quan trọng nhất để fix lỗi lệch múi giờ giữa Server và Khách hàng.
 */
function getTaipeiNow() {
    // Lấy chuỗi thời gian địa phương theo múi giờ Đài Loan
    const taipeiString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false });
    // Tạo đối tượng Date từ chuỗi đó để so sánh toán học
    return new Date(taipeiString);
}

/**
 * Chuẩn hóa số điện thoại: Xóa các ký tự đặc biệt, chỉ giữ lại số.
 * Ví dụ: "0912-345-678" -> "0912345678"
 */
function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

/**
 * Tạo danh sách 15 ngày tiếp theo (theo giờ Đài Loan) để hiển thị menu chọn ngày trên Line.
 */
function getNext15Days() { 
    let days = []; 
    const t = getTaipeiNow();
    
    for(let i=0; i<15; i++) { 
        let d = new Date(t); 
        d.setDate(t.getDate()+i); 
        
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const v = `${year}/${month}/${day}`; 
        
        const w = d.toLocaleDateString('zh-TW', { weekday: 'short' }); 
        let l = `${d.getMonth()+1}/${d.getDate()} (${w})`; 
        
        if(i===0) l="今天 (Today)"; 
        if(i===1) l="明天 (Tmr)"; 
        
        days.push({label: l, value: v}); 
    } 
    return days; 
}

/**
 * Kiểm tra xem một mốc giờ (requestTimeStr) có nằm trong ca làm việc của thợ không.
 * Hỗ trợ xử lý ca đêm (VD: Làm từ 14:00 đến 02:00 sáng hôm sau).
 */
function isWithinShift(staff, requestTimeStr) {
    if (!staff.shiftStart || !staff.shiftEnd) return true; // Mặc định cho phép nếu thiếu dữ liệu
    
    // Hàm con: Chuyển đổi giờ HH:MM thành số phút từ đầu ngày (0h = 0)
    // Lưu ý: Các giờ 00:00, 01:00... 07:00 được coi là thuộc ngày hôm sau (+24h) để so sánh ca đêm
    const getMins = (t) => {
        if(!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h < 8 ? h + 24 : h) * 60 + (m || 0);
    };
    
    const startMins = getMins(staff.shiftStart);
    const endMins = getMins(staff.shiftEnd);
    const requestMins = getMins(requestTimeStr);
    
    // Nếu ca làm việc qua đêm (End < Start)
    if (endMins < startMins) {
        // Chuyển End thành dạng > 24h (VD: 02:00 -> 26:00)
        const adjustedEnd = endMins + (24 * 60); 
        return requestMins >= startMins && requestMins < adjustedEnd;
    } else {
        // Ca ngày thường
        return requestMins >= startMins && requestMins < endMins;
    }
}

/**
 * Định dạng ngày hiển thị chuẩn (YYYY/MM/DD) từ input bất kỳ.
 */
function formatDateDisplay(dateInput) {
    if (!dateInput) return "";
    try {
        let str = dateInput.toString().trim();
        // Nếu chuỗi đã có dạng YYYY/MM/DD hoặc YYYY-MM-DD
        if (str.match(/^\d{4}[\/\-]\d{2}[\/\-]\d{2}/)) {
            return str.replace(/-/g, '/').split(' ')[0];
        }
        let d = new Date(str);
        if (isNaN(d.getTime())) return str;
        
        // Convert input sang giờ Đài Loan trước khi format
        const taipeiString = d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
        d = new Date(taipeiString);
        
        const year = d.getFullYear().toString(); 
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}/${month}/${day}`;
    } catch (e) { return dateInput; }
}

/**
 * Lấy chuỗi thời gian hiện tại để ghi log (Giờ Đài Loan).
 * Format: YYYY/MM/DD HH:MM
 */
function getCurrentDateTimeStr() {
    const now = getTaipeiNow();
    const year = now.getFullYear().toString(); 
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hh}:${mm}`;
}

/**
 * Chuyển chuỗi "YYYY/MM/DD HH:MM" thành đối tượng Date.
 * Hàm này rất quan trọng để tính toán khoảng thời gian cho thuật toán tìm giờ.
 */
function parseStringToDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
        const parts = dateStr.trim().split(' ');
        const datePart = parts[0].replace(/-/g, '/');
        let timePart = parts.length > 1 ? parts[1] : "00:00";
        const dateNums = datePart.split('/');
        const timeNums = timePart.split(':');
        
        if (dateNums.length < 3) return null;
        
        let year = parseInt(dateNums[0]);
        if (year < 1900) year += 1911; // Xử lý năm Dân Quốc nếu có
        const month = parseInt(dateNums[1]) - 1;
        const day = parseInt(dateNums[2]);
        const hour = parseInt(timeNums[0]) || 0;
        const min = parseInt(timeNums[1]) || 0;
        
        return new Date(year, month, day, hour, min);
    } catch (e) { return null; }
}

// ==============================================================================
// PHẦN 5: ĐỒNG BỘ DỮ LIỆU (DATA SYNCHRONIZATION)
// ==============================================================================

async function syncData() {
    try {
        // --- 5.1. ĐỌC DỮ LIỆU ĐẶT CHỖ TỪ SHEET ---
        // [QUAN TRỌNG V144]: Đọc mở rộng từ A đến Q để lấy đủ thông tin Staff 1->6
        const resBooking = await sheets.spreadsheets.values.get({ 
            spreadsheetId: SHEET_ID, 
            range: `${BOOKING_SHEET}!A:Q` 
        });
        const rowsBooking = resBooking.data.values;
        cachedBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            // Duyệt từ dòng 2 (bỏ header)
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                // Kiểm tra dữ liệu cơ bản (Ngày, Giờ phải có)
                if (!row[0] || !row[1]) continue;

                const status = row[7] || '已預約'; 
                // Bỏ qua các đơn đã Hủy hoặc Hoàn thành để giải phóng tài nguyên bộ nhớ
                if (status.includes('取消') || status.includes('Cancelled') || status.includes('完成') || status.includes('Done')) continue;

                const serviceStr = row[3] || ''; 
                let duration = 60; 
                let type = 'BED'; 
                let category = 'BODY';
                
                // Map thông tin dịch vụ từ tên dịch vụ
                for (const key in SERVICES) {
                    if (serviceStr.includes(SERVICES[key].name.split('(')[0])) { 
                        duration = SERVICES[key].duration; 
                        type = SERVICES[key].type; 
                        category = SERVICES[key].category;
                        break;
                    }
                }
                
                let pax = 1;
                if (row[5]) pax = parseInt(row[5]); 

                // MAPPING CỘT (V144):
                // Col I (Index 8)  : Designated Staff (Chỉ định lúc đặt)
                // Col L (Index 11) : Service Staff 1 (Thực làm 1)
                // Col M (Index 12) : Service Staff 2 (Thực làm 2)
                // Col N (Index 13) : Service Staff 3
                // Col O (Index 14) : Service Staff 4
                // Col P (Index 15) : Service Staff 5
                // Col Q (Index 16) : Service Staff 6
                
                cachedBookings.push({
                    rowId: i + 1,
                    startTimeString: `${row[0]} ${row[1]}`, // Format: YYYY/MM/DD HH:MM
                    duration: duration,
                    type: type,
                    category: category,
                    staffId: row[8] || '隨機', // Thợ chỉ định (Col I)
                    serviceStaff: row[11],     // Thợ thực tế 1 (Col L)
                    staffId2: row[12],         // Thợ thực tế 2 (Col M)
                    staffId3: row[13],         // Thợ thực tế 3 (Col N)
                    staffId4: row[14],         // Thợ thực tế 4 (Col O)
                    pax: pax,
                    customerName: `${row[2]} (${row[6]})`,
                    serviceName: serviceStr,
                    status: status,
                    lineId: row[9]
                });
            }
        }

        // --- 5.2. ĐỌC LỊCH LÀM VIỆC & NGÀY NGHỈ TỪ SHEET ---
        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:AG100` });
        const rows = resSchedule.data.values;
        
        STAFF_LIST = [];
        scheduleMap = {}; // Reset map ngày nghỉ

        if (rows && rows.length > 1) {
            const headerRow = rows[0]; // Dòng tiêu đề chứa ngày tháng
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const staffName = row[0];
                if (!staffName) continue;
                
                const cleanName = staffName.trim();
                const genderRaw = row[1];
                const gender = (genderRaw && (genderRaw === '女' || genderRaw === 'F')) ? 'F' : 'M';
                
                // Cột C: Giờ vào làm | Cột D: Giờ tan ca
                // QUAN TRỌNG: Mặc định là 08:00 nếu trống, để tránh lỗi báo đầy lúc 8h sáng
                const shiftStart = row[2] || '08:00'; 
                const shiftEnd = row[3] || '03:00';

                STAFF_LIST.push({
                    id: cleanName,
                    name: cleanName,
                    gender: gender,
                    shiftStart: shiftStart,
                    shiftEnd: shiftEnd
                });

                // Duyệt các cột ngày tháng (Từ cột E - index 4 trở đi) để tìm chữ "OFF"
                for (let j = 4; j < row.length; j++) {
                    const dateHeader = headerRow[j];
                    const cellValue = row[j];
                    
                    if (dateHeader && cellValue && cellValue.toUpperCase().includes('OFF')) {
                        const formattedDate = formatDateDisplay(dateHeader);
                        if (!scheduleMap[formattedDate]) {
                            scheduleMap[formattedDate] = [];
                        }
                        scheduleMap[formattedDate].push(cleanName);
                    }
                }
            }
        }
        
        // Nếu không đọc được sheet, tạo dữ liệu giả để tránh crash server
        if (STAFF_LIST.length === 0) {
            for(let i=1; i<=20; i++) STAFF_LIST.push({id:`${i}號`, name:`${i}號`, gender:'F', shiftStart:'08:00', shiftEnd:'03:00'});
        }
        
        console.log(`[SYNC SUCCESS] Bookings: ${cachedBookings.length}, Staff: ${STAFF_LIST.length}`);
    } catch (e) { console.error('[SYNC ERROR]', e); }
}

// --- CÁC HÀM GHI DỮ LIỆU (WRITE UTILS) ---

async function ghiVaoSheet(data) {
    try {
        const timeCreate = getCurrentDateTimeStr(); 
        let colA_Date = formatDateDisplay(data.ngayDen);     
        
        let colB_Time = data.gioDen || "";
        if (colB_Time.includes(' ')) colB_Time = colB_Time.split(' ')[1];
        if (colB_Time.length > 5) colB_Time = colB_Time.substring(0, 5); 

        const colC_Name = data.hoTen || '現場客';             
        let colD_Service = data.dichVu;
        if (data.isOil) colD_Service += " (油推+$200)";       

        const colE_Oil = data.isOil ? "Yes" : "";              
        const colF_Pax = data.pax || 1;                       
        const colG_Phone = data.sdt;                          
        const colH_Status = data.trangThai || '已預約';       
        const colI_Staff = data.nhanVien || '隨機';           
        const colJ_LineID = data.userId;                      
        const colK_Created = timeCreate; 
        
        const valuesToWrite = [[ 
            colA_Date, colB_Time, colC_Name, colD_Service, colE_Oil, colF_Pax, colG_Phone, colH_Status, colI_Staff, colJ_LineID, colK_Created 
        ]];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID, 
            range: 'Sheet1!A:A', 
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: valuesToWrite }
        });
        
        await syncData(); // Đồng bộ lại ngay sau khi ghi
        
    } catch (e) { console.error('[ERROR] Lỗi ghi Sheet:', e); }
}

async function updateBookingStatus(rowId, newStatus) {
    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, 
            range: `${BOOKING_SHEET}!H${rowId}`, 
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[ newStatus ]] }
        });
        await syncData();
    } catch (e) { console.error('Update Error:', e); }
}

async function layLichDatGanNhat(userId) {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:K` });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return null;
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            if (row[9] === userId) {
                 const status = row[7] || ''; 
                 if (!status.includes('取消') && !status.includes('Cancelled')) {
                     return { 
                         rowId: i + 1, 
                         thoiGian: `${row[0]} ${row[1]}`, 
                         dichVu: row[3], 
                         nhanVien: row[8], 
                         thongTinKhach: `${row[2]} (${row[6]})`, 
                         chiTiet: row 
                     };
                 }
            } 
        }
        return null;
    } catch (e) { console.error('Read Error:', e); return null; }
}

// ==============================================================================
// PHẦN 6: LOGIC LÕI - KIỂM TRA TÀI NGUYÊN (CORE BUSINESS LOGIC)
// ==============================================================================

/**
 * Hàm 6.1: Đếm tài nguyên bận (Ghế/Giường/Thợ) trong một khoảng thời gian.
 * Hàm này kết hợp dữ liệu từ 2 nguồn: Google Sheet và Kiosk Realtime.
 * * @param {number} startMs - Thời gian bắt đầu (timestamp)
 * @param {number} endMs - Thời gian kết thúc (timestamp)
 * @param {string} displayDate - Ngày hiển thị (YYYY/MM/DD)
 */
function countResourcesInInterval(startMs, endMs, displayDate) {
    let busyChairs = 0;
    let busyBeds = 0;
    let blockedStaffs = [];

    // --- A. Kiểm tra Bookings từ Google Sheet ---
    for (const booking of cachedBookings) {
        // Kiểm tra lệnh đóng cửa toàn quán
        if (booking.staffId === 'ALL_STAFF') {
            const bookingDate = booking.startTimeString.split(' ')[0];
            if (bookingDate === displayDate) return { closed: true };
        }
        
        let bStart = parseStringToDate(booking.startTimeString);
        if (!bStart) continue;
        
        // Xử lý giờ đêm (0h-7h) -> Là ngày hôm sau
        const bHour = parseInt(booking.startTimeString.split(' ')[1].split(':')[0]);
        if (bHour < 8) bStart.setDate(bStart.getDate() + 1);
        
        const bEnd = new Date(bStart.getTime() + booking.duration * 60000);

        // *** STRICT OVERLAP CHECK (GIAO THOA THỜI GIAN CHẶT CHẼ) ***
        const overlapStart = Math.max(startMs, bStart.getTime());
        const overlapEnd = Math.min(endMs, bEnd.getTime());

        // [FIX V141]: Sử dụng TOLERANCE để bỏ qua trùng lặp nhỏ (do lệch giây)
        if ((overlapEnd - overlapStart) > OVERLAP_TOLERANCE_MS) {
            // Có chồng lấn đáng kể -> Tính là bận
            const pax = booking.pax || 1;
            if (booking.type === 'CHAIR') busyChairs += pax;
            if (booking.type === 'BED') busyBeds += pax;
            
            // Check Col I (Designated)
            if (booking.staffId && booking.staffId !== '隨機') {
                const sIds = booking.staffId.split(',').map(s=>s.trim());
                blockedStaffs.push(...sIds);
            }
            // Check Col L (Actual) - Staff 1
            if (booking.serviceStaff && booking.serviceStaff !== '隨機') {
                blockedStaffs.push(booking.serviceStaff);
            }
            // Check Col M (Actual) - Staff 2
            if (booking.staffId2 && booking.staffId2 !== '隨機') {
                blockedStaffs.push(booking.staffId2);
            }
        }
    }

    // --- B. Kiểm tra Kiosk Realtime (Đơn vãng lai đang chạy) ---
    // Đây là phần quan trọng để đồng bộ với thực tế tại quán.
    Object.values(SERVER_RESOURCE_STATE).forEach(res => {
        if (res.isRunning && !res.isPaused) {
            // Thời gian thực của đơn trên Kiosk
            let kStart = new Date(res.startTime).getTime();
            let kEnd = kStart + (res.booking.duration * 60000);
            
            // Kiểm tra chồng lấn
            const kOverlapStart = Math.max(startMs, kStart);
            const kOverlapEnd = Math.min(endMs, kEnd);

            // [FIX V141]: Áp dụng TOLERANCE cho dữ liệu Kiosk (quan trọng vì Kiosk có giây)
            if ((kOverlapEnd - kOverlapStart) > OVERLAP_TOLERANCE_MS) {
                // Để tránh cộng 2 lần (nếu đơn đã được sync vào Sheet), ta kiểm tra ID
                const existsInSheet = cachedBookings.some(b => b.rowId === res.booking.rowId);
                
                // Nếu chưa có trong Sheet (đơn mới Walk-in chưa sync kịp)
                if (!existsInSheet) {
                    if (res.booking.type === 'CHAIR') busyChairs++;
                    if (res.booking.type === 'BED') busyBeds++;
                    
                    const designated = res.booking.staffId;
                    const active = res.booking.serviceStaff;
                    if (designated && designated !== '隨機') blockedStaffs.push(designated);
                    if (active && active !== '隨機') blockedStaffs.push(active);
                }
            }
        }
    });

    return { closed: false, busyChairs, busyBeds, blockedStaffs };
}

/**
 * Hàm 6.2: Đếm số lượng thợ khả dụng (có thể làm việc) tại thời điểm đó.
 */
function countAvailableStaff(startMs, endMs, timeStr, displayDate, requireFemale, requireMale, specificStaffIds, blockedStaffs) {
    const offList = scheduleMap[displayDate] || [];
    
    const validStaffs = STAFF_LIST.filter(staff => {
        // 1. Kiểm tra nghỉ OFF trong ngày
        if (offList.includes(staff.name)) return false;
        
        // 2. Kiểm tra giới tính
        if (requireFemale && staff.gender !== 'F') return false;
        if (requireMale && staff.gender !== 'M') return false;
        
        // 3. Kiểm tra ca làm việc (Shift)
        if (!isWithinShift(staff, timeStr)) return false;
        
        // 4. Kiểm tra trạng thái hiện tại (Realtime Status trên Kiosk)
        const status = SERVER_STAFF_STATUS[staff.id];
        if (status && (status.status === 'AWAY')) return false;

        // 5. Kiểm tra xem có bị block bởi booking khác không (từ hàm countResourcesInInterval)
        if (blockedStaffs.includes(staff.id)) return false;

        return true;
    });

    // Nếu khách yêu cầu thợ cụ thể
    if (specificStaffIds) {
        const ids = Array.isArray(specificStaffIds) ? specificStaffIds : [specificStaffIds];
        for (const id of ids) {
            // Nếu một trong các thợ yêu cầu không rảnh -> Fail
            if (!validStaffs.some(s => s.id === id)) return 0;
        }
        return ids.length; 
    }

    return validStaffs.length;
}

/**
 * Hàm 6.3: Tính toán chỉ số khả dụng (Metrics) cho một Slot giờ cụ thể.
 * Hàm này trả về điểm số để xếp hạng giờ "tốt nhất".
 */
function getSlotMetrics(dateStr, timeStr, serviceDuration, specificStaffIds = null, requireFemale = false, requireMale = false) {
    const displayDate = formatDateDisplay(dateStr); 
    const startRequest = parseStringToDate(`${displayDate} ${timeStr}`);
    
    // Xử lý 0h đêm -> +1 ngày để so sánh đúng
    const hourVal = parseInt(timeStr.split(':')[0]);
    if (hourVal < 8) startRequest.setDate(startRequest.getDate() + 1);

    // --- CRITICAL FIX: CHẶN GIỜ QUÁ KHỨ (STRICT FUTURE) ---
    // Sử dụng giờ chuẩn Đài Loan để so sánh
    const now = getTaipeiNow();
    
    // [FIX V141]: Giảm buffer từ 10 phút xuống 5 phút
    if (startRequest.getTime() <= (now.getTime() + FUTURE_BUFFER_MINS * 60000)) {
        return { feasible: false, reason: 'past' };
    }

    const endRequest = new Date(startRequest.getTime() + serviceDuration * 60000);
    
    // Đếm tài nguyên bận
    const stats = countResourcesInInterval(startRequest.getTime(), endRequest.getTime(), displayDate);
    
    if (stats.closed) return { feasible: false, reason: 'closed' };

    // Đếm thợ rảnh
    const availStaff = countAvailableStaff(startRequest.getTime(), endRequest.getTime(), timeStr, displayDate, requireFemale, requireMale, specificStaffIds, stats.blockedStaffs);

    // Tính số ghế/giường còn trống
    const freeChairs = Math.max(0, MAX_CHAIRS - stats.busyChairs);
    const freeBeds = Math.max(0, MAX_BEDS - stats.busyBeds);

    return {
        feasible: true,
        freeStaff: availStaff,
        freeChairs,
        freeBeds,
        // Điểm số dùng để gợi ý (Càng nhiều thợ càng tốt)
        score: (availStaff * 2) + freeChairs + freeBeds
    };
}

/**
 * Hàm 6.4: Kiểm tra tính khả thi (Wrapper chính dùng cho Bot).
 * Trả về TRUE nếu có thể đặt, FALSE nếu không.
 * [FIX V140]: Strict Mode cho Bed/Chair.
 */
function checkAvailability(dateStr, timeStr, serviceDuration, serviceType, specificStaffIds = null, pax = 1, requireFemale = false, requireMale = false) {
    const metrics = getSlotMetrics(dateStr, timeStr, serviceDuration, specificStaffIds, requireFemale, requireMale);
    
    // Nếu metrics báo không khả thi (do quá khứ, đóng cửa...) -> Chặn ngay
    if (!metrics.feasible) return false;

    // Kiểm tra đủ thợ không
    if (!specificStaffIds && metrics.freeStaff < pax) return false;

    // --- FIX V140: STRICT RESOURCE CHECK ---
    // Loại bỏ hoàn toàn logic "Smart Split" cộng gộp dung lượng cũ.
    
    // Logic mới (Strict):
    if (serviceType === 'BED') {
        // Gói Body hoặc Combo (được định nghĩa là BED): Bắt buộc phải còn Giường.
        if (metrics.freeBeds >= pax) return true;
        return false;
    }

    if (serviceType === 'CHAIR') {
        // Gói Foot: Bắt buộc phải còn Ghế.
        if (metrics.freeChairs >= pax) return true;
        return false;
    }

    // Các loại dịch vụ khác (nếu có)
    return true;
}

/**
 * Hàm 6.5: Tìm 6 khung giờ tốt nhất (Smart Suggestion)
 */
function findBestSlots(selectedDate, serviceCode, pax = 1, requireFemale = false, requireMale = false) {
    const service = SERVICES[serviceCode];
    if (!service) return [];

    let candidates = [];
    // Quét từ 8h sáng đến 26h (2h sáng hôm sau), bước nhảy 30 phút
    for (let h = 8; h <= 26; h += 0.5) {
        const hourInt = Math.floor(h);
        const minuteInt = (h % 1) > 0 ? 30 : 0;
        let displayH = hourInt;
        if (displayH >= 24) displayH -= 24;

        const timeStr = `${displayH.toString().padStart(2, '0')}:${minuteInt.toString().padStart(2, '0')}`;
        
        // Dùng checkAvailability mới (Strict) để tìm giờ gợi ý
        const isFeasible = checkAvailability(selectedDate, timeStr, service.duration, service.type, null, pax, requireFemale, requireMale);
        
        if (isFeasible) {
            const metrics = getSlotMetrics(selectedDate, timeStr, service.duration, null, requireFemale, requireMale);
            candidates.push({
                timeStr: timeStr,
                sortVal: h,
                score: metrics.score,
                label: `${timeStr} (Free: ${metrics.freeStaff}👤)`
            });
        }
    }

    // Sắp xếp: Điểm cao nhất lên đầu, sau đó đến giờ sớm nhất
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.sortVal - b.sortVal;
    });

    // Lấy top 6 kết quả
    return candidates.slice(0, 6);
}

/**
 * Hàm 6.6: Tạo danh sách nút giờ (Bubbles) để gửi cho khách qua LINE
 */
function generateTimeBubbles(selectedDate, serviceCode, specificStaffIds = null, pax = 1, requireFemale = false, requireMale = false) {
    const now = getTaipeiNow(); // Dùng giờ chuẩn Đài Loan
    
    const service = SERVICES[serviceCode]; 
    if (!service) return null;
    
    let allSlots = []; 
    // Tạo khung giờ từ 08:00 sáng đến 02:30 sáng hôm sau (26.5)
    for (let h = 8; h <= 26.5; h += 0.5) { allSlots.push(h); }
    
    let validSlots = [];
    for (const h of allSlots) {
        const hourInt = Math.floor(h);
        const minuteInt = (h % 1) > 0 ? 30 : 0;
        
        let slotDate = parseStringToDate(formatDateDisplay(selectedDate)); 
        let checkHour = hourInt;
        
        if (hourInt >= 24) {
            slotDate.setDate(slotDate.getDate() + 1);
            checkHour = hourInt - 24;
        }
        
        slotDate.setHours(checkHour, minuteInt, 0, 0);

        // --- STRICT FUTURE CHECK (QUAN TRỌNG) ---
        // [FIX V141]: Chỉ chặn nếu giờ đặt < hiện tại + 5 phút
        if (slotDate.getTime() > (now.getTime() + FUTURE_BUFFER_MINS * 60000)) {
            const displayH = checkHour; 
            const timeStr = `${displayH.toString().padStart(2, '0')}:${minuteInt.toString().padStart(2, '0')}`;
            
            // Gọi hàm kiểm tra tài nguyên
            if (checkAvailability(selectedDate, timeStr, service.duration, service.type, specificStaffIds, pax, requireFemale, requireMale)) { 
                validSlots.push(h); 
            }
        }
    }
    
    if (validSlots.length === 0) return null;
    
    // Format hiển thị trên nút bấm (VD: 00:30 (rạng sáng))
    const formatTime = (h) => {
        const hourInt = Math.floor(h);
        const minuteStr = (h % 1) > 0 ? '30' : '00';
        if (hourInt < 24) return `${hourInt.toString().padStart(2, '0')}:${minuteStr}`;
        return `${(hourInt - 24).toString().padStart(2, '0')}:${minuteStr} (凌晨)`;
    };
    
    // Giá trị gửi về server khi khách bấm (HH:MM)
    const formatValue = (h) => {
        const hourInt = Math.floor(h);
        const minuteStr = (h % 1) > 0 ? '30' : '00';
        const displayH = hourInt < 24 ? hourInt : hourInt - 24;
        return `${displayH.toString().padStart(2, '0')}:${minuteStr}`;
    }
    
    const groups = [ 
        { name: '🌞 早安時段 (Sáng)', slots: validSlots.filter(h => h >= 8 && h < 12) }, 
        { name: '☀️ 下午時段 (Chiều)', slots: validSlots.filter(h => h >= 12 && h < 18) }, 
        { name: '🌙 晚安時段 (Tối)', slots: validSlots.filter(h => h >= 18 && h < 24) }, 
        { name: '✨ 深夜時段 (Khuya)', slots: validSlots.filter(h => h >= 24) } 
    ];
    
    let bubbles = [];

    // [NEW] NÚT GỢI Ý THÔNG MINH
    bubbles.push({
        "type": "bubble",
        "size": "kilo",
        "body": {
            "type": "box", "layout": "vertical", "backgroundColor": "#F0F9FF", "cornerRadius": "lg",
            "contents": [
                { "type": "text", "text": "💎 SMART SUGGEST", "weight": "bold", "color": "#0284C7", "align": "center", "size": "xs" },
                { "type": "text", "text": "Gợi ý giờ tốt nhất", "weight": "bold", "size": "md", "align": "center", "margin": "xs" },
                { "type": "text", "text": "Hệ thống tự động tìm giờ rảnh cho bạn", "wrap": true, "size": "xs", "color": "#64748B", "align": "center", "margin": "sm" },
                { "type": "separator", "margin": "md" },
                {
                    "type": "button", "style": "primary", "color": "#0EA5E9", "margin": "md", "height": "sm",
                    "action": { "type": "message", "label": "⭐ Xem Ngay", "text": "Time:Suggest" }
                }
            ]
        }
    });

    const timeBubbles = groups.filter(g => g.slots.length > 0).map(group => {
        const buttons = group.slots.map(h => {
            const labelStr = formatTime(h);
            const valueStr = formatValue(h);
            return { "type": "button", "style": "primary", "margin": "xs", "height": "sm", "action": { "type": "message", "label": labelStr, "text": `Time:${valueStr}` } };
        });
        return { "type": "bubble", "size": "kilo", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": group.name, "weight": "bold", "color": "#1DB446", "align": "center" }, { "type": "separator", "margin": "sm" }, ...buttons] } };
    });

    return { type: 'carousel', contents: [...bubbles, ...timeBubbles] };
}

// Hàm tạo danh sách chọn thợ (Carousel)
function createStaffBubbles(filterFemale = false, excludedIds = []) {
    let list = STAFF_LIST;
    if (filterFemale) list = STAFF_LIST.filter(s => s.gender === 'F' || s.gender === '女');
    if (excludedIds && excludedIds.length > 0) list = list.filter(s => !excludedIds.includes(s.id));

    if (!list || list.length === 0) {
        return [{ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": filterFemale ? "無女技師" : "無其他技師", "align": "center" }] } }];
    }
    const bubbles = [];
    const chunkSize = 12; 
    for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        const rows = [];
        for (let j = 0; j < chunk.length; j += 3) {
            const rowItems = chunk.slice(j, j + 3);
            const rowButtons = rowItems.map(s => ({
                "type": "button", "style": "secondary", "color": (s.gender === 'F' || s.gender === '女') ? "#F48FB1" : "#90CAF9", "height": "sm", "margin": "xs", "flex": 1,
                "action": { "type": "message", "label": s.name, "text": `StaffSelect:${s.id}` }
            }));
            rows.push({ "type": "box", "layout": "horizontal", "spacing": "xs", "contents": rowButtons });
        }
        bubbles.push({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": filterFemale ? "選擇女技師" : "指定技師", "weight": "bold", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...rows ] } });
    }
    return bubbles;
}

// Hàm tạo Menu dịch vụ (Flex Message)
function createMenuFlexMessage() {
    const createRow = (serviceName, time, price) => ({
        "type": "box", "layout": "horizontal", "contents": [
            { "type": "text", "text": serviceName, "size": "sm", "color": "#555555", "flex": 5 },
            { "type": "text", "text": `${time}分`, "size": "sm", "color": "#111111", "align": "end", "flex": 2 },
            { "type": "text", "text": `$${price}`, "size": "sm", "color": "#E63946", "weight": "bold", "align": "end", "flex": 3 }
        ]
    });

    return {
        "type": "bubble",
        "size": "mega",
        "body": {
            "type": "box", "layout": "vertical", "contents": [
                { "type": "text", "text": "📜 服務價目表 (Menu)", "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center", "margin": "md" },
                { "type": "separator", "margin": "lg" },
                { "type": "text", "text": "🔥 熱門套餐 (Combo)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("👑 帝王套餐 (腳+身)", 190, 2000),
                createRow("💎 豪華套餐 (腳+身)", 130, 1500),
                createRow("🔥 招牌套餐 (腳+身)", 100, 999),
                createRow("⚡ 精選套餐 (腳+身)", 70, 900),
                { "type": "text", "text": "👣 足底按摩 (Foot)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("足底按摩", 120, 1500),
                createRow("足底按摩", 90, 999),
                createRow("足底按摩", 70, 900),
                createRow("足底按摩", 40, 500),
                { "type": "text", "text": "🛏️ 身體指壓 (Body)", "weight": "bold", "size": "md", "color": "#111111", "margin": "lg" },
                createRow("全身指壓", 120, 1500),
                createRow("全身指壓", 90, 999),
                createRow("全身指壓", 70, 900),
                createRow("半身指壓", 35, 500),
                { "type": "separator", "margin": "xl" },
                { "type": "text", "text": "⭐ 油推需加收 $200，請詢問櫃台。", "size": "xs", "color": "#aaaaaa", "margin": "md", "align": "center" }
            ]
        },
        "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "📅 立即預約 (Book Now)", "text": "Action:Booking" } } ] }
    };
}

// ==============================================================================
// 8. SERVER & API ROUTES (CHO ADMIN KIOSK & LINE BOT)
// ==============================================================================
const client = new line.Client(config);
const app = express();

// --- 8.1 CẤU HÌNH MIDDLEWARE (QUAN TRỌNG: THỨ TỰ PHẢI CHUẨN) ---
app.use(cors());

// [FIX]: Chuyển Webhook lên TRƯỚC body-parser để LINE đọc được Raw Buffer
// Webhook nhận tin nhắn từ LINE
app.post('/callback', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((r) => res.json(r))
    .catch((e) => { 
        console.error('[LINE WEBHOOK ERROR]', e); 
        res.status(500).end(); 
    });
});

// [SAU ĐÓ MỚI DÙNG BODY PARSER CHO CÁC API KHÁC]
// Cấu hình Body Parser để hỗ trợ JSON và URL-Encoded (Form Data)
// Điều này rất quan trọng để nhận dữ liệu từ các phiên bản Frontend khác nhau (Kiosk)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- 8.2 CÁC API KHÁC (ADMIN / KIOSK) ---

// API lấy dữ liệu tổng hợp (Polling từ Kiosk)
app.get('/api/info', async (req, res) => { 
    await syncData(); 
    res.json({ 
        staffList: STAFF_LIST, 
        bookings: cachedBookings, 
        schedule: scheduleMap, 
        resources: { chairs: MAX_CHAIRS, beds: MAX_BEDS },
        resourceState: SERVER_RESOURCE_STATE,
        staffStatus: SERVER_STAFF_STATUS 
    }); 
});

// API đồng bộ tài nguyên (Kiosk -> Server)
app.post('/api/sync-resource', (req, res) => { SERVER_RESOURCE_STATE = req.body; res.json({ success: true }); });

// API đồng bộ trạng thái nhân viên (Kiosk -> Server)
app.post('/api/sync-staff-status', (req, res) => { SERVER_STAFF_STATUS = req.body; res.json({ success: true }); });

// API tạo booking từ Admin
app.post('/api/admin-booking', async (req, res) => { 
    const data = req.body; 
    await ghiVaoSheet({ 
        ngayDen: data.ngayDen, 
        gioDen: data.gioDen, 
        dichVu: data.dichVu, 
        nhanVien: data.nhanVien, 
        userId: 'ADMIN_WEB', 
        sdt: data.sdt || '現場客', 
        hoTen: data.hoTen || '現場客', 
        trangThai: '已預約', 
        pax: data.pax || 1,
        isOil: data.isOil || false 
    }); 
    res.json({ success: true }); 
});

// API cập nhật trạng thái đơn (Hủy, Check-in, Hoàn thành)
app.post('/api/update-status', async (req, res) => { 
    const { rowId, status } = req.body; 
    await updateBookingStatus(rowId, status); 
    res.json({ success: true }); 
});

// API CẬP NHẬT CHI TIẾT ĐƠN (QUAN TRỌNG NHẤT V144)
// ======================================================
app.post('/api/update-booking-details', async (req, res) => {
    try {
        const body = req.body;
        const rowId = body.rowId;

        if (!rowId) return res.status(400).json({ error: 'Missing rowId' });

        // 1. Cập nhật Dịch Vụ (Cột D)
        if (body.serviceName) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!D${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[body.serviceName]] }
            });
        }

        // 2. Cập nhật Thợ Chỉ Định (Cột I) - Dữ liệu cũ
        if (body.staffId && body.staffId !== '随機') {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!I${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[body.staffId]] }
            });
        }

        // --- LOGIC GHI ĐA CỘT (L -> Q) ---
        // Sử dụng các biến thể tên để đảm bảo bắt được dữ liệu từ Frontend

        // 3. Cập nhật SERVICE STAFF 1 (Cột L)
        const staff1 = 
            body['服務師傅1'] || body['ServiceStaff1'] || body['serviceStaff'] || 
            body['service_staff_1'] || body['staff1'] || body['technician'] || body['technician1'];

        if (staff1) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!L${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[staff1]] }
            });
        }

        // 4. Cập nhật SERVICE STAFF 2 (Cột M)
        const staff2 = 
            body['服務師傅2'] || body['ServiceStaff2'] || body['serviceStaff2'] || 
            body['service_staff_2'] || body['staff2'] || body['technician2'] || body['staffId2'];

        if (staff2) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!M${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[staff2]] }
            });
        }

        // 5. Cập nhật SERVICE STAFF 3 (Cột N)
        const staff3 = body['服務師傅3'] || body['ServiceStaff3'] || body['staff3'] || body['technician3'];
        if (staff3) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!N${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[staff3]] }
            });
        }

        // 6. Cập nhật SERVICE STAFF 4 (Cột O)
        const staff4 = body['服務師傅4'] || body['ServiceStaff4'] || body['staff4'] || body['technician4'];
        if (staff4) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!O${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[staff4]] }
            });
        }

        // 7. Cập nhật SERVICE STAFF 5 (Cột P)
        const staff5 = body['服務師傅5'] || body['ServiceStaff5'] || body['staff5'];
        if (staff5) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!P${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[staff5]] }
            });
        }

        // 8. Cập nhật SERVICE STAFF 6 (Cột Q)
        const staff6 = body['服務師傅6'] || body['ServiceStaff6'] || body['staff6'];
        if (staff6) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET}!Q${rowId}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[staff6]] }
            });
        }

        // Đồng bộ lại dữ liệu cache ngay sau khi ghi để Admin thấy ngay lập tức
        await syncData();
        res.json({ success: true });

    } catch (e) {
        console.error('Update Details Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ==============================================================================
// 9. XỬ LÝ SỰ KIỆN LINE BOT (EVENT HANDLER)
// ==============================================================================
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text' && event.type !== 'postback') return Promise.resolve(null);
  let text = ''; let userId = event.source.userId;
  if (event.type === 'message') text = event.message.text.trim();
  else if (event.type === 'postback') {
      if (event.postback.params && event.postback.params.date) text = `DatePick:${event.postback.params.date}`;
      else text = event.postback.data;
  }

  // --- MENU CHÍNH (MAIN MENU) ---
  if (text === 'Action:Booking') {
      userState[userId] = {}; 
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "請選擇服務類別 (Service)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#A17DF5", "margin": "md", "action": { "type": "message", "label": "🔥 套餐 (Combo)", "text": "Cat:COMBO" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👣 足底按摩 (Foot)", "text": "Cat:FOOT" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛏️ 身體指壓 (Body)", "text": "Cat:BODY" } } ] } } });
  }

  // --- ADMIN ACTIONS (QUẢN LÝ) ---
  if (text === 'Admin' || text === '管理') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Admin', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "🛠️ 師傅管理 (Admin)", "weight": "bold", "color": "#E63946", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "primary", "color": "#000000", "margin": "md", "action": { "type": "message", "label": "⛔ 全店店休", "text": "Admin:CloseShop" } }, { "type": "separator", "margin": "md" }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🛌 請假", "text": "Admin:SetOff" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🤒 早退", "text": "Admin:SetLeaveEarly" } }, { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🍱 用餐", "text": "Admin:SetBreak" } } ] } } }); }
  if (text === 'Admin:CloseShop') { userState[userId] = { step: 'ADMIN_PICK_CLOSE_DATE' }; return client.replyMessage(event.replyToken, { type: 'template', altText: '選擇日期', template: { type: 'buttons', text: '請選擇店休日期:', actions: [ { type: 'datetimepicker', label: '🗓️ 點擊選擇', data: 'ShopClosePicked', mode: 'date' } ] } }); }
  if (text.startsWith('DatePick:') && userState[userId] && userState[userId].step === 'ADMIN_PICK_CLOSE_DATE') { const pickedDate = text.split(':')[1]; await ghiVaoSheet({ gioDen: '08:00', ngayDen: pickedDate, dichVu: SERVICES['SHOP_CLOSE'].name, nhanVien: 'ALL_STAFF', userId: 'ADMIN', sdt: 'ADMIN', hoTen: '全店店休', trangThai: '⛔ 店休' }); delete userState[userId]; return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已設定 ${pickedDate} 全店店休。` }); }
  if (text.startsWith('Admin:')) { const action = text.split(':')[1]; userState[userId] = { step: 'ADMIN_PICK_STAFF', action: action }; const bubbles = createStaffBubbles().map(b => { const str = JSON.stringify(b).replace(/StaffSelect/g, 'StaffOp'); return JSON.parse(str); }); return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇師傅', contents: { type: 'carousel', contents: bubbles } }); }
  if (text.startsWith('StaffOp:')) { 
      const staffId = text.split(':')[1]; 
      const currentState = userState[userId]; 
      if (!currentState || currentState.step !== 'ADMIN_PICK_STAFF') return Promise.resolve(null); 
      const now = getTaipeiNow(); 
      const todayISO = formatDateDisplay(now.toLocaleDateString()); 
      const currentTimeStr = now.toTimeString().substring(0, 5); 
      let logType = ''; let logNote = ''; 
      if (currentState.action === 'SetOff') { 
          logType = '請假'; logNote = '全天'; 
          await ghiVaoSheet({ gioDen: '08:00', ngayDen: todayISO, dichVu: SERVICES['OFF_DAY'].name, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '請假', trangThai: '⛔ 已鎖定' }); 
      } else if (currentState.action === 'SetBreak') { 
          logType = '用餐'; logNote = '30分鐘'; 
          await ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: SERVICES['BREAK_30'].name, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '用餐', trangThai: '🍱 用餐中' }); 
      } else if (currentState.action === 'SetLeaveEarly') { 
          logType = '早退/病假'; 
          let effectiveHour = now.getHours(); 
          if (effectiveHour < 8) effectiveHour += 24; 
          const currentTotalMins = effectiveHour * 60 + now.getMinutes(); 
          let duration = (26 * 60) - currentTotalMins; 
          if (duration < 0) duration = 0; 
          logNote = `早退 (${duration}分)`; 
          await ghiVaoSheet({ gioDen: currentTimeStr, ngayDen: todayISO, dichVu: `⛔ 早退 (${duration}分)`, nhanVien: staffId, userId: 'ADMIN', sdt: 'ADMIN', hoTen: '管理員操作', trangThai: '⚠️ 早退' }); 
      } 
      SERVER_STAFF_STATUS[staffId] = { status: currentState.action === 'SetOff' ? 'AWAY' : currentState.action === 'SetBreak' ? 'EAT' : 'OUT_SHORT', checkInTime: 0 };
      delete userState[userId]; 
      return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已登記: ${staffId} - ${logType}\n(${logNote})` }); 
  }

  // --- BOOKING FLOW (LUỒNG ĐẶT LỊCH) ---
  if (text.startsWith('Cat:')) { 
      const category = text.split(':')[1]; 
      const buttons = Object.keys(SERVICES).filter(k => SERVICES[k].category === category).map(key => ({ 
          "type": "button", "style": "primary", "margin": "sm", "height": "sm", 
          "action": { "type": "message", "label": `${SERVICES[key].name} ($${SERVICES[key].price})`, "text": `Svc:${key}` } 
      })); 
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '選擇方案', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "選擇方案", "weight": "bold", "size": "xl", "align": "center" }, { "type": "separator", "margin": "md" }, ...buttons ] } } }); 
  }
  
  if (text.startsWith('Svc:')) {
      const svcCode = text.split(':')[1]; 
      userState[userId] = { step: 'DATE', service: svcCode };
      const days = getNext15Days(); 
      return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Date', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "📅 請選擇日期 (Date)", "align": "center", "weight": "bold" }, ...days.map(d=>({ "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": d.label, "text": `Date:${d.value}` } })) ] } } }); 
  }

  if (text.startsWith('Date:')) {
      if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。(Session expired)' });
      
      const selectedDate = text.split(':')[1]; 
      const currentState = userState[userId];
      currentState.date = selectedDate; 
      currentState.step = 'PREF';
      userState[userId] = currentState;

      const serviceCode = currentState.service;
      const serviceType = SERVICES[serviceCode].category; 

      const buttons = [
          { "type": "text", "text": "💆 請選擇師傅需求 (Staff)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" },
          { "type": "separator", "margin": "md" },
          
          { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "🎲 不指定 (隨機)", "text": "Pref:RANDOM" } },
          { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👨 指定男師傅", "text": "Pref:MALE" } },
          { "type": "button", "style": "primary", "color": "#333333", "margin": "sm", "action": { "type": "message", "label": "👉 指定特定號碼", "text": "Pref:SPECIFIC" } },
          { "type": "button", "style": "secondary", "margin": "sm", "action": { "type": "message", "label": "👩 指定女師傅 (無油)", "text": "Pref:FEMALE" } }
      ];

      if (serviceType !== 'FOOT') {
          buttons.push(
              { "type": "button", "style": "primary", "color": "#E91E63", "margin": "sm", "action": { "type": "message", "label": "💧 指定女師傅推油 (+$200)", "text": "Pref:OIL" } }
          );
      } else {
           buttons.push({ "type": "text", "text": "(足底按摩無油壓選項)", "size": "xs", "color": "#aaaaaa", "align": "center", "margin": "sm" });
      }

      return client.replyMessage(event.replyToken, {
          type: 'flex',
          altText: '師傅',
          contents: {
              "type": "bubble",
              "body": {
                  "type": "box",
                  "layout": "vertical",
                  "contents": buttons
              }
          }
      });
  }

  if (text.startsWith('Pref:')) {
      if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
      const pref = text.split(':')[1]; 
      const currentState = userState[userId];
      currentState.pref = pref; 
      currentState.step = 'PAX';
      userState[userId] = currentState;

      const paxButtons = [1, 2, 3, 4, 5, 6].map(n => ({ "type": "button", "style": "secondary", "margin": "sm", "height": "sm", "action": { "type": "message", "label": `${n} 位`, "text": `Pax:${n}` } }));
      return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Pax', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "👥 請問幾位貴賓? (Pax)", "weight": "bold", "size": "lg", "align": "center", "color": "#1DB446" }, { "type": "separator", "margin": "md" }, ...paxButtons ] } } });
  }

  if (text.startsWith('Pax:')) {
      if (!userState[userId]) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 連線逾時，請重新點擊「立即預約」。' });
      const num = parseInt(text.split(':')[1]); 
      const currentState = userState[userId];
      currentState.pax = num; 
      currentState.selectedStaff = []; 
      userState[userId] = currentState;

      if (currentState.pref === 'SPECIFIC') {
          const bubbles = createStaffBubbles(false, []); 
          bubbles.forEach((b,i) => { b.body.contents[0].text = `選第 1/${num} 位技師`; b.body.contents[0].color = "#E91E63"; }); 
          return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Select Staff', contents: { type: 'carousel', contents: bubbles } }); 
      }

      let requireFemale = false;
      let requireMale = false;
      let isOil = false;

      if (currentState.pref === 'OIL') { isOil = true; requireFemale = true; }
      else if (currentState.pref === 'FEMALE') { requireFemale = true; }
      else if (currentState.pref === 'MALE') { requireMale = true; }

      currentState.isOil = isOil;

      const bubbles = generateTimeBubbles(currentState.date, currentState.service, null, currentState.pax, requireFemale, requireMale);
      if(!bubbles) return client.replyMessage(event.replyToken, {type:'text',text:'😢抱歉，該時段已客滿，請選擇其他日期 (Full Booked)'});
      
      currentState.step = 'TIME';
      userState[userId] = currentState;
      return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles });
  }

  if (text.startsWith('StaffSelect:')) {
      const staffId = text.split(':')[1]; 
      const currentState = userState[userId]; 
      if (!currentState.selectedStaff) currentState.selectedStaff = [];
      currentState.selectedStaff.push(staffId);
      userState[userId] = currentState;

      if (currentState.selectedStaff.length < currentState.pax) {
          const bubbles = createStaffBubbles(false, currentState.selectedStaff); 
          const nextIdx = currentState.selectedStaff.length + 1;
          bubbles.forEach(b => {
              b.body.contents[0].text = `選第 ${nextIdx}/${currentState.pax} 位技師`;
              b.body.contents[0].color = "#E91E63";
          });
          return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Next Staff', contents: { type: 'carousel', contents: bubbles } }); 
      } else {
          const bubbles = generateTimeBubbles(currentState.date, currentState.service, currentState.selectedStaff, currentState.pax, false, false);
          if(!bubbles) return client.replyMessage(event.replyToken, {type:'text',text:'😢 所選技師時間衝突，請重新選擇 (Conflict)'});
          
          currentState.step = 'TIME';
          userState[userId] = currentState;
          return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Time', contents: bubbles });
      }
  }

  // --- SMART SUGGESTION CLICK ---
  if (text === 'Time:Suggest') {
      const s = userState[userId];
      if (!s) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ Session expired. Please restart.' });

      let requireFemale = false, requireMale = false;
      if (s.pref === 'OIL') { requireFemale = true; } 
      else if (s.pref === 'FEMALE') { requireFemale = true; } 
      else if (s.pref === 'MALE') { requireMale = true; }

      const bestSlots = findBestSlots(s.date, s.service, s.pax, requireFemale, requireMale);

      if (bestSlots.length === 0) {
          return client.replyMessage(event.replyToken, { type: 'text', text: '😢 Xin lỗi, không tìm thấy khung giờ nào phù hợp.' });
      }

      const bubbles = bestSlots.map(slot => ({
          "type": "bubble",
          "size": "micro",
          "body": {
              "type": "box", "layout": "vertical", "paddingAll": "sm",
              "contents": [
                  { "type": "text", "text": slot.timeStr, "weight": "bold", "size": "xl", "color": "#1DB446", "align": "center" },
                  { "type": "text", "text": `👍 Điểm: ${slot.score}`, "size": "xxs", "color": "#aaaaaa", "align": "center" },
                  { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "message", "label": "Chọn", "text": `Time:${slot.timeStr}` }, "margin": "sm" }
              ]
          }
      }));

      return client.replyMessage(event.replyToken, {
          type: 'flex',
          altText: 'Gợi ý giờ tốt nhất',
          contents: {
              "type": "carousel",
              "contents": bubbles
          }
      });
  }

  if (text.startsWith('Time:')) { 
      const gio = text.replace('Time:', '').trim(); 
      const currentState = userState[userId]; 
      currentState.step = 'SURNAME'; 
      currentState.time = gio; 
      userState[userId] = currentState; 
      return client.replyMessage(event.replyToken, { type: 'text', text: `請問怎麼稱呼您？(姓氏/Surname)` }); 
  }
  
  if (userState[userId] && userState[userId].step === 'SURNAME') { 
      const currentState = userState[userId];
      currentState.step = 'PHONE'; 
      currentState.surname = text; 
      userState[userId] = currentState; 
      return client.replyMessage(event.replyToken, { type: 'text', text: "請輸入手機號碼 (Phone):" }); 
  }
  
  if (userState[userId] && userState[userId].step === 'PHONE') { 
      const sdt = normalizePhoneNumber(text); 
      const s = userState[userId];
      
      // AUTO FIX DATE IF NIGHT SHIFT (00:00 - 08:00)
      let finalDate = s.date;
      const hour = parseInt(s.time.split(':')[0]);
      if (hour < 8) {
          const d = new Date(s.date);
          d.setDate(d.getDate() + 1);
          const yyyy = d.getFullYear();
          const mm = (d.getMonth() + 1).toString().padStart(2, '0');
          const dd = d.getDate().toString().padStart(2, '0');
          finalDate = `${yyyy}/${mm}/${dd}`;
      }

      let basePrice = SERVICES[s.service].price; 
      if (s.isOil) basePrice += 200; 
      const totalPrice = basePrice * s.pax;

      let staffDisplay = '隨機'; 
      if (s.selectedStaff && s.selectedStaff.length > 0) staffDisplay = s.selectedStaff.join(', ');
      else if (s.pref === 'FEMALE') staffDisplay = '女師傅';
      else if (s.pref === 'MALE') staffDisplay = '男師傅';
      else if (s.pref === 'OIL') staffDisplay = '女師傅(油)';

      const confirmMsg = `✅ 預約成功\n\n👤 ${s.surname} (${sdt})\n📅 ${finalDate} ${s.time}\n💆 ${SERVICES[s.service].name}\n👥 ${s.pax} 位\n🛠️ ${staffDisplay}\n💵 總金額: $${totalPrice}`;
      
      await client.replyMessage(event.replyToken, { type: 'text', text: confirmMsg });
      client.pushMessage(ID_BA_CHU, { type: 'text', text: `💰 New Booking: ${s.surname} - $${totalPrice}` });
      
      await ghiVaoSheet({ gioDen: s.time, ngayDen: finalDate, dichVu: SERVICES[s.service].name, nhanVien: staffDisplay, userId: userId, sdt: sdt, hoTen: s.surname, trangThai: '已預約', pax: s.pax, isOil: s.isOil });
      
      delete userState[userId]; 
      return; 
  }

  if (text === 'Action:MyBooking') { const booking = await layLichDatGanNhat(userId); if (!booking) return client.replyMessage(event.replyToken, { type: 'text', text: '查無預約 (No Booking)' }); return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Booking', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您的預約", "weight": "bold", "color": "#1DB446", "size": "lg" }, { "type": "separator", "margin": "md" }, { "type": "text", "text": booking.dichVu, "weight": "bold", "size": "md", "margin": "md" }, { "type": "text", "text": `🛠️ ${booking.nhanVien}`, "align": "center", "margin": "sm" }, { "type": "text", "text": `⏰ ${booking.thoiGian}`, "size": "xl", "weight": "bold", "color": "#555555", "margin": "sm" } ] }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "color": "#ff9800", "action": { "type": "message", "label": "🏃 我會晚到 (Late)", "text": "Action:Late" } }, { type: "button", style: "secondary", color: "#ff3333", "action": { type: "message", "label": "❌ 取消預約 (Cancel)", "text": "Action:ConfirmCancel" } } ] } } }); }
  
  if (text === 'Action:Late') { return client.replyMessage(event.replyToken, { type: 'flex', altText: 'Late', contents: { "type": "bubble", "body": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "secondary", "action": { "type": "message", "label": "5 分", "text": "Late:5p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "10 分", "text": "Late:10p" } }, { type: "button", "style": "secondary", "action": { "type": "message", "label": "15 分", "text": "Late:15p" } } ] } } }); }
  
  if (text.startsWith('Late:')) { const phut = text.split(':')[1].replace('p', '分'); const booking = await layLichDatGanNhat(userId); if (booking) { await updateBookingStatus(booking.rowId, `⚠️ 晚到 ${phut}`); } client.pushMessage(ID_BA_CHU, { type: 'text', text: `⚠️ 晚到通知!\nID: ${userId}\n預計晚: ${phut}` }); return client.replyMessage(event.replyToken, { type: 'text', text: '好的，我們會為您保留 (OK, Confirmed)。' }); }
  
  if (text === 'Action:ConfirmCancel') { const booking = await layLichDatGanNhat(userId); if (booking) { await updateBookingStatus(booking.rowId, '❌ Cancelled'); return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已成功取消預約 (Cancelled)。' }); } return client.replyMessage(event.replyToken, { type: 'text', text: '找不到您的預約資料。' }); }
  
  if (text.includes('booking') || text.includes('menu') || text.includes('預約')) {
      delete userState[userId]; syncData();
      return client.replyMessage(event.replyToken, { type: 'flex', altText: '服務價目表', contents: createMenuFlexMessage() });
  }

  return client.replyMessage(event.replyToken, { type: 'flex', altText: '預約服務', contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "您好 👋", "weight": "bold", "size": "lg", "align": "center" }, { "type": "text", "text": "請問您是要預約按摩服務嗎？", "wrap": true, "size": "sm", "color": "#555555", "align": "center", "margin": "md" } ] }, "footer": { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "action": { "type": "message", "label": "✅ 立即預約 (Book)", "text": "Action:Booking" } }, { "type": "button", "style": "secondary", "action": { "type": "message", "label": "📄 服務價目 (Menu)", "text": "Menu" } } ] } } });
}

// ==============================================================================
// 10. KHỞI ĐỘNG SERVER (SERVER STARTUP)
// ==============================================================================

syncData();
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Bot V144 (Ultimate Sync Cols L-Q) running on ${port}`);
});
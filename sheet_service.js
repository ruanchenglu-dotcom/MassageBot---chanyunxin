/**
 * =================================================================================================
 * MODULE: SHEET SERVICE (DATA LAYER) - REFACTORED V4.1 STRICT
 * PROJECT: XINWUCHAN MASSAGE BOT
 * DESCRIPTION: Handles Google Sheets interactions with STRICT Locking States.
 * UPDATED FEATURES (V4.1): 
 * - STRICT COLUMN AE HANDLING: Column AE is NEVER left empty. It is always "TRUE" or "FALSE".
 * - AUTO-LOCK LOGIC: Modifying Phase durations automatically forces Lock = "TRUE".
 * - UNLOCK LOGIC: Explicitly setting isManualLocked = false writes "FALSE".
 * - INHERITED FEATURES: Bi-directional Phase Logic, Matrix Sync, Robust Error Handling.
 * AUTHOR: AI ASSISTANT & USER
 * DATE: 2026/01/25
 * =================================================================================================
 */

require('dotenv').config();
const { google } = require('googleapis');
const ResourceCore = require('./resource_core'); // Cần để tính Matrix khi Sync và lấy logic Service

// --- CONFIGURATION ---
const SHEET_ID = process.env.SHEET_ID;
// Define Sheet Names
const BOOKING_SHEET = 'Sheet1';
const STAFF_SHEET = 'StaffLog';
const SCHEDULE_SHEET = 'StaffSchedule';
const SALARY_SHEET = 'SalaryLog';
const MENU_SHEET = 'menu';

// --- GOOGLE AUTHENTICATION ---
const auth = new google.auth.GoogleAuth({
    keyFile: 'google-key.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- INTERNAL STATE (IN-MEMORY CACHE) ---
let STATE = {
    STAFF_LIST: [],
    cachedBookings: [],
    scheduleMap: {},
    SERVICES: ResourceCore.SERVICES || {},
    lastSyncTime: new Date(0),
    isSystemHealthy: false,
    isSyncing: false,
    LAST_CALCULATED_MATRIX: null
};

// =============================================================================
// PHẦN 1: UTILITIES (CÁC HÀM HỖ TRỢ & XỬ LÝ DỮ LIỆU)
// =============================================================================

/**
 * Lấy thời gian hiện tại theo múi giờ Đài Bắc (Taipei)
 */
function getTaipeiNow() {
    return ResourceCore.getTaipeiNow ? ResourceCore.getTaipeiNow() : new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
}

/**
 * Chuẩn hóa ngày tháng chặt chẽ.
 * Trả về định dạng YYYY/MM/DD hoặc null nếu lỗi.
 * Hỗ trợ cả định dạng String và Excel Serial Date.
 */
function normalizeDateStrict(inputDate) {
    if (!inputDate) return null;
    try {
        let dateObj;
        if (typeof inputDate === 'string' && inputDate.includes('T')) {
            dateObj = new Date(inputDate);
        } else if (typeof inputDate === 'number' && inputDate > 40000) {
            // Xử lý Excel Serial Date (ví dụ: 45000)
            dateObj = new Date(Math.round((inputDate - 25569) * 86400 * 1000));
        } else {
            const dateString = inputDate.toString().trim().replace(/-/g, '/');
            dateObj = new Date(dateString);
        }

        if (isNaN(dateObj.getTime())) return null;

        const taipeiTimeStr = dateObj.toLocaleString("en-US", {timeZone: "Asia/Taipei"});
        const taipeiDate = new Date(taipeiTimeStr);
        const y = taipeiDate.getFullYear();
        const m = String(taipeiDate.getMonth() + 1).padStart(2, '0');
        const d = String(taipeiDate.getDate()).padStart(2, '0');
        return `${y}/${m}/${d}`; 
    } catch (e) {
        console.error(`[DATE ERROR] Input: ${inputDate}`, e);
        return null;
    }
}

/**
 * Format Date Object thành chuỗi YYYY/MM/DD HH:mm
 */
function formatDateTimeString(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const h = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
}

function getCurrentDateTimeStr() {
    return formatDateTimeString(getTaipeiNow());
}

/**
 * [HELPER] Safe Integer Parser
 * Đảm bảo giá trị trả về luôn là số nguyên hoặc fallback (thường là null hoặc 0)
 */
function safeParseInt(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
}

/**
 * [HELPER] Boolean String Checker
 * Kiểm tra xem một giá trị có phải là TRUE (string hoặc boolean) hay không.
 */
function isTrueString(val) {
    if (!val) return false;
    return String(val).trim().toUpperCase() === 'TRUE';
}

/**
 * [HELPER] SMART SERVICE FINDER
 * Tìm mã dịch vụ từ tên hoặc mã, hỗ trợ tìm kiếm mờ (fuzzy match).
 */
function smartFindServiceCode(inputName) {
    if (!inputName) return null;
    const cleanInput = inputName.trim();
    const upperInput = cleanInput.toUpperCase();

    // 1. Check Key (Code) trực tiếp
    if (STATE.SERVICES[upperInput]) return upperInput;

    // 2. Check Exact Name
    for (const code in STATE.SERVICES) {
        if (STATE.SERVICES[code].name === cleanInput) return code;
    }

    // 3. Fuzzy Match (Bỏ qua phần trong ngoặc, ví dụ: "Body Massage (60min)")
    const baseInput = upperInput.split('(')[0].trim();
    for (const code in STATE.SERVICES) {
        const dbName = STATE.SERVICES[code].name.toUpperCase();
        const baseDbName = dbName.split('(')[0].trim();
        if (baseDbName === baseInput) {
            return code;
        }
    }
    return null;
}

// =============================================================================
// PHẦN 2: SYNC ENGINE (ĐỌC VÀ ĐỒNG BỘ DỮ LIỆU TỪ GOOGLE SHEETS)
// =============================================================================

/**
 * Đồng bộ Menu/Services từ sheet 'menu'
 */
async function syncMenuData() {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${MENU_SHEET}!A2:F50` });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return;

        let newServices = {};
        rows.forEach(row => {
            const code = row[0] ? row[0].trim() : null; 
            const name = row[1] ? row[1].trim() : ''; 
            const priceStr = row[3] ? row[3].trim() : '0'; 
            
            if (!code || !name) return;

            let duration = 60;
            const timeMatch = name.match(/(\d+)分/);
            if (timeMatch) duration = parseInt(timeMatch[1]);
            const price = parseInt(priceStr.replace(/\D/g, '')) || 0;

            // Elastic Search parameters
            let elasticStep = 0; let elasticLimit = 0;
            if (row[4]) { const ps = parseInt(row[4].toString().replace(/\D/g, '')); if (!isNaN(ps)) elasticStep = ps; }
            if (row[5]) { const pl = parseInt(row[5].toString().replace(/\D/g, '')); if (!isNaN(pl)) elasticLimit = pl; }

            // Categorization
            let type = 'BED'; let category = 'BODY';
            const prefix = code.charAt(0).toUpperCase();
            if (prefix === 'A') { type = 'BED'; category = 'COMBO'; } 
            else if (prefix === 'F') { type = 'CHAIR'; category = 'FOOT'; } 
            else if (prefix === 'B') { type = 'BED'; category = 'BODY'; }

            newServices[code] = { 
                name: name, duration: duration, type: type, category: category, price: price,
                elasticStep: elasticStep, elasticLimit: elasticLimit
            };
        });
        
        // Update ResourceCore logic if needed
        if (ResourceCore.setDynamicServices) {
            ResourceCore.setDynamicServices(newServices);
        }
        STATE.SERVICES = newServices; 
        console.log(`[MENU SYNC] Updated: ${Object.keys(STATE.SERVICES).length} items.`);
    } catch (e) { console.error('[MENU ERROR]', e); }
}

/**
 * Đồng bộ Dữ liệu chính (Bookings & Schedule)
 * Hàm này đọc toàn bộ dữ liệu cần thiết để tái lập trạng thái hệ thống.
 */
async function syncData() {
    if (STATE.isSyncing) { console.log("⚠️ Skip sync: System is busy."); return; }

    try {
        STATE.isSyncing = true; 

        // --- BƯỚC 1: ĐỌC BOOKING TỪ SHEET1 ---
        // Range A:AE covers all needed columns including Locked status at AE (Column Index 30)
        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:AE` });
        const rowsBooking = resBooking.data.values;
        let tempBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue; // Bỏ qua nếu không có ngày/giờ
                
                const status = row[7] || '已預約';
                if (status.includes('取消') || status.includes('Cancelled')) continue;

                const cleanDate = normalizeDateStrict(row[0]); 
                if (!cleanDate) continue;

                const serviceStr = row[3] || ''; 
                let duration = 60; let type = 'BED'; let category = 'BODY'; let price = 0;
                let foundService = false;
                
                // Lookup Service details
                for (const key in STATE.SERVICES) {
                    if (serviceStr.includes(STATE.SERVICES[key].name.split('(')[0])) {
                        duration = STATE.SERVICES[key].duration; 
                        type = STATE.SERVICES[key].type; 
                        category = STATE.SERVICES[key].category; 
                        price = STATE.SERVICES[key].price; 
                        foundService = true; break;
                    }
                }
                // Fallback nếu không tìm thấy service trong Menu
                if (!foundService) {
                    if (serviceStr.includes('套餐')) { category = 'COMBO'; duration = 100; }
                    else if (serviceStr.includes('足')) { type = 'CHAIR'; category = 'FOOT'; }
                }

                if (row[4] === "Yes") price += 200; // Phụ thu dầu
                let pax = 1; if (row[5]) pax = safeParseInt(row[5], 1);

                // Mapping fields
                const staffId = row[8] || '隨機';
                const serviceStaff1 = row[11]; 
                const staffId2 = row[12];      
                const staffId3 = row[13];      
                
                let serviceCode = row[20]; 
                if (!serviceCode || serviceCode === '') {
                     for(const key in STATE.SERVICES) { if(STATE.SERVICES[key].name === serviceStr) { serviceCode = key; break; } }
                }

                // --- [PHASE & LOCK LOGIC UPDATE] ---
                // Cột Y (Index 24) = Phase 1 Duration
                // Cột Z (Index 25) = Phase 2 Duration
                // Cột AA (Index 26) = Flow Code
                // Cột AE (Index 30) = Manual Locked Flag (STRICT "TRUE" CHECK)
                
                const phase1Duration = safeParseInt(row[24], null);
                const phase2Duration = safeParseInt(row[25], null);
                
                const rawFlow = row[26]; 
                let flowCode = null;
                if (rawFlow && ['BF','FB','FOOTSINGLE','BODYSINGLE'].includes(rawFlow)) { flowCode = rawFlow; }
                
                // Read Lock Status: Only "TRUE" is considered locked.
                const rawLocked = row[30]; 
                const isManualLocked = isTrueString(rawLocked);

                tempBookings.push({
                    rowId: i + 1, 
                    startTimeString: `${cleanDate} ${row[1]}`, 
                    startTime: row[1], 
                    duration: duration, 
                    type: type, category: category, price: price,
                    staffId: staffId, staffName: staffId, 
                    serviceStaff: serviceStaff1,
                    staffId2: staffId2, staffId3: staffId3, 
                    pax: pax, 
                    customerName: `${row[2]} (${row[6]})`,
                    serviceName: serviceStr, serviceCode: serviceCode, 
                    phone: row[6], 
                    date: cleanDate, 
                    status: status, 
                    lineId: row[9], 
                    isOil: row[4] === "Yes",
                    // Enhanced Phase Properties
                    phase1_duration: phase1Duration,
                    phase2_duration: phase2Duration,
                    isManualLocked: isManualLocked, 
                    flow: flowCode, 
                    allocated_resource: null 
                });
            }
        }

        // --- BƯỚC 2: ĐỌC SCHEDULE ---
        const resSchedule = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!A1:BG100` });
        const rows = resSchedule.data.values;
        let tempStaffList = []; let tempScheduleMap = {}; 

        if (rows && rows.length > 1) {
            const headerRow = rows[0]; 
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const staffName = row[0]; if (!staffName) continue;
                const cleanName = staffName.trim();
                const gender = (row[1] && (row[1] === '女' || row[1] === 'F')) ? 'F' : 'M';
                
                let startTime = row[2] ? row[2].trim().replace(/：/g, ':') : '12:00';
                let endTime = row[3] ? row[3].trim().replace(/：/g, ':') : '03:00';
                const onTimeVal = row[4] ? row[4].toString().trim().toUpperCase() : '';
                const isStrictTime = (onTimeVal === 'TRUE' || onTimeVal === 'YES' || onTimeVal === 'X');

                const staffObj = { 
                    id: cleanName, name: cleanName, gender: gender, 
                    start: startTime, end: endTime, shiftStart: startTime, shiftEnd: endTime,
                    isStrictTime: isStrictTime, sheetRowIndex: i + 1, off: false, offDays: [] 
                };
                
                const todayStr = normalizeDateStrict(getTaipeiNow()); 
                for (let j = 5; j < headerRow.length; j++) {
                    if (headerRow[j]) {
                        const normalizedDate = normalizeDateStrict(headerRow[j]); 
                        if (normalizedDate) {
                            if (row[j] && row[j].trim().toUpperCase() === 'OFF') {
                                if (!tempScheduleMap[normalizedDate]) tempScheduleMap[normalizedDate] = [];
                                tempScheduleMap[normalizedDate].push(cleanName);
                                staffObj.offDays.push(normalizedDate);
                                if (normalizedDate === todayStr) { staffObj.off = true; }
                            }
                        }
                    }
                }
                tempStaffList.push(staffObj);
            }
        }
        
        if (tempStaffList.length === 0) {
            console.error("⛔ CRITICAL: Không đọc được StaffSchedule!");
            STATE.isSystemHealthy = false; STATE.STAFF_LIST = []; 
        } else {
            STATE.STAFF_LIST = tempStaffList; STATE.scheduleMap = tempScheduleMap; STATE.isSystemHealthy = true;
        }

        // --- BƯỚC 3: TÍNH TOÁN MATRIX (Resource Allocation) ---
        if (STATE.isSystemHealthy && tempBookings.length > 0) {
            try {
                if (typeof ResourceCore.generateResourceMatrix === 'function') {
                    // ResourceCore sẽ nhận biết isManualLocked để giữ nguyên resource đã gán
                    const matrixAllocation = ResourceCore.generateResourceMatrix(tempBookings, STATE.STAFF_LIST);
                    tempBookings.forEach(booking => {
                        if (matrixAllocation[booking.rowId]) {
                            booking.allocated_resource = matrixAllocation[booking.rowId];
                        }
                    });
                    STATE.LAST_CALCULATED_MATRIX = matrixAllocation;
                    console.log(`[MATRIX] Calculated allocations for ${Object.keys(matrixAllocation).length} bookings.`);
                }
            } catch (err) {
                console.error("[MATRIX ERROR] Calculation failed:", err);
            }
        }

        STATE.cachedBookings = tempBookings;
        STATE.lastSyncTime = new Date();

    } catch (e) { 
        console.error('[SYNC FATAL ERROR]', e); STATE.isSystemHealthy = false; STATE.STAFF_LIST = []; 
    } finally {
        STATE.isSyncing = false; 
    }
}

// =============================================================================
// PHẦN 3: WRITE & UPDATE LOGIC (CORE UPGRADE V4.1 STRICT)
// =============================================================================

/**
 * Ghi booking mới vào Google Sheets.
 * V4.1: Đảm bảo cột AE (Lock) luôn được ghi là "TRUE" hoặc "FALSE", không bao giờ để trống.
 */
async function ghiVaoSheet(data, proposedUpdates = []) {
    try {
        const timeCreate = getCurrentDateTimeStr();
        let colA_Date = normalizeDateStrict(data.ngayDen);
        if (!colA_Date) colA_Date = data.ngayDen; 

        let colB_Time = data.gioDen || ""; 
        if (colB_Time.includes(' ')) colB_Time = colB_Time.split(' ')[1]; 
        if (colB_Time.length > 5) colB_Time = colB_Time.substring(0, 5);
        
        const colG_Phone = data.sdt; 
        const colH_Status = data.trangThai || '已預約'; 
        const colJ_LineID = data.userId; 
        const colK_Created = timeCreate;
        
        const valuesToWrite = [];
        let loopCount = 1;
        if (data.guestDetails && Array.isArray(data.guestDetails) && data.guestDetails.length > 0) {
            loopCount = data.guestDetails.length;
        }

        for (let i = 0; i < loopCount; i++) {
            // Khởi tạo mảng với 31 phần tử (đến index 30 là cột AE)
            const row = new Array(31).fill("");
            let guestDetail = (data.guestDetails && data.guestDetails[i]) ? data.guestDetails[i] : null;

            const guestNum = i + 1; const total = loopCount;
            row[0] = colA_Date; 
            row[1] = colB_Time; 
            row[2] = `${data.hoTen || '現場客'} (${guestNum}/${total})`; 
            
            let svcName = data.dichVu;
            if (guestDetail) svcName = guestDetail.service;
            let isOil = data.isOil;
            if (guestDetail && guestDetail.isOil !== undefined) isOil = guestDetail.isOil;

            if (isOil) svcName += " (油推+$200)";
            row[3] = svcName; 
            row[4] = isOil ? "Yes" : ""; 
            row[5] = 1; 
            row[6] = colG_Phone; 
            row[7] = colH_Status; 
            
            if (guestDetail && guestDetail.staff) row[8] = guestDetail.staff;
            else row[8] = data.nhanVien || '隨機';
            
            row[9] = colJ_LineID; 
            row[10] = colK_Created; 

            if (guestDetail) {
                if (guestDetail.staffId2) row[12] = guestDetail.staffId2; 
                if (guestDetail.staffId3) row[13] = guestDetail.staffId3; 
            }

            row[18] = normalizeDateStrict(colA_Date);

            // [SMART SERVICE CODE]
            let sCode = data.serviceCode;
            if (guestDetail && guestDetail.serviceCode) sCode = guestDetail.serviceCode;
            if (!sCode && svcName) {
                const cleanSvcName = svcName.replace(" (油推+$200)", "");
                sCode = smartFindServiceCode(cleanSvcName);
            }
            row[20] = sCode || "";

            // [PHASE DURATION & LOCKING]
            let p1 = null; let p2 = null;
            if (guestDetail) { 
                p1 = (guestDetail.phase1_duration !== undefined) ? guestDetail.phase1_duration : guestDetail.phase1;
                p2 = (guestDetail.phase2_duration !== undefined) ? guestDetail.phase2_duration : guestDetail.phase2;
            }
            if (p1 === null || p1 === undefined) p1 = data.phase1_duration;
            if (p2 === null || p2 === undefined) p2 = data.phase2_duration;
            
            row[24] = (p1 !== null && p1 !== undefined) ? p1 : "";
            row[25] = (p2 !== null && p2 !== undefined) ? p2 : "";

            // [FLOW LOGIC]
            let flowVal = null;
            if (guestDetail && (guestDetail.flow || guestDetail.flowCode)) flowVal = guestDetail.flow || guestDetail.flowCode;
            if (!flowVal) flowVal = data.flow || data.flowCode;
            // Auto detect flow if missing
            if (!flowVal && sCode && STATE.SERVICES[sCode]) {
                const svcDef = STATE.SERVICES[sCode];
                if (svcDef.category === 'FOOT') flowVal = "FOOTSINGLE";
                else if (svcDef.category === 'BODY') flowVal = "BODYSINGLE";
                else if (svcDef.category === 'COMBO') flowVal = "FB";
            }
            row[26] = flowVal || "FB";

            // [LOCKING LOGIC - STRICT V4.1]
            // Nếu có Phase 1 tùy chỉnh (manual phase) HOẶC cờ isManualLocked bật -> TRUE
            // Ngược lại -> FALSE (Tuyệt đối không để chuỗi rỗng)
            const hasManualPhase = (p1 !== null && p1 !== undefined && p1 !== "");
            const explicitLock = (data.isManualLocked === true);
            
            if (explicitLock || hasManualPhase) {
                row[30] = 'TRUE'; 
            } else {
                row[30] = 'FALSE'; 
            }

            valuesToWrite.push(row);
        }

        if (valuesToWrite.length > 0) {
            console.log(`[WRITE] Atomic Appending ${valuesToWrite.length} rows to Sheet1. Strict Lock logic applied.`);
            await sheets.spreadsheets.values.append({ 
                spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', 
                valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite } 
            });
            console.log(`[WRITE] Success.`);
        }
        
        setTimeout(() => syncData(), 500);

    } catch (e) { console.error('[WRITE ERROR] One-Shot Write Failed:', e); }
}

async function updateBookingStatus(rowId, newStatus) {
    try {
        await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!H${rowId}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[ newStatus ]] } });
        await syncData();
    } catch (e) { console.error('Update Status Error:', e); }
}

/**
 * [CRITICAL] UPDATE BOOKING DETAILS
 * Nâng cấp V4.1: Xử lý logic 2 chiều cho Phase 1 <-> Phase 2 & Strict Locking.
 * 1. Nếu sửa Phase 1 -> Tự tính Phase 2 -> Tự động LOCK ("TRUE").
 * 2. Nếu sửa Phase 2 -> Tự tính Phase 1 -> Tự động LOCK ("TRUE").
 * 3. Nếu gửi `isManualLocked: false` -> Ghi đè thành UNLOCK ("FALSE").
 */
async function updateBookingDetails(body) {
    const rowId = body.rowId;
    if (!rowId) throw new Error('Missing rowId');
    
    // Helper function để ghi vào 1 cell cụ thể
    const updateCell = async (col, val) => {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, 
            range: `${BOOKING_SHEET}!${col}${rowId}`, 
            valueInputOption: 'USER_ENTERED', 
            requestBody: { values: [[val]] }
        });
    };

    console.log(`[UPDATE] Processing update for Row ${rowId}`, body);

    // --- 1. Basic Field Updates ---
    if (body.date) {
        const formattedDate = normalizeDateStrict(body.date);
        await updateCell('A', formattedDate);
        await updateCell('S', formattedDate);
    }
    if (body.startTime) {
        let timeVal = body.startTime; if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);
        await updateCell('B', timeVal);
    }
    if (body.customerName) await updateCell('C', body.customerName);
    if (body.serviceName) await updateCell('D', body.serviceName);
    if (body.isOil !== undefined) await updateCell('E', body.isOil ? "Yes" : "");
    if (body.pax) await updateCell('F', body.pax);
    if (body.phone) await updateCell('G', body.phone);
    if (body.mainStatus) await updateCell('H', body.mainStatus);
    
    // Staff Updates
    if (body.staffId && body.staffId !== '随機') await updateCell('I', body.staffId);
    if (body.staffId2) await updateCell('M', body.staffId2);
    if (body.staffId3) await updateCell('N', body.staffId3);
    if (body.flow) await updateCell('AA', body.flow);

    // --- 2. [ADVANCED] PHASE & LOCK LOGIC ---
    
    // Lấy thông tin booking hiện tại để có Total Duration
    let bookingData = STATE.cachedBookings.find(b => b.rowId == rowId);
    let totalDuration = 60; // Mặc định an toàn
    
    if (bookingData) {
        totalDuration = bookingData.duration;
    } else {
        console.warn(`[UPDATE WARNING] Row ${rowId} not found in cache. Using default duration (60) or body duration.`);
        if (body.duration) totalDuration = safeParseInt(body.duration, 60);
    }

    // Biến cờ xác định trạng thái Lock cuối cùng
    // null = không thay đổi, "TRUE" = khóa, "FALSE" = mở khóa
    let finalLockState = null; 

    // CASE 1: Update Phase 1 => Auto Phase 2 => Force LOCK
    if (body.phase1_duration !== undefined && body.phase1_duration !== null) {
        const p1 = parseInt(body.phase1_duration); 
        const p2 = totalDuration - p1;             
        
        console.log(`[UPDATE LOGIC] Row ${rowId}: Phase 1 set to ${p1}. Auto-calc Phase 2 = ${p2}. FORCING LOCK.`);

        await updateCell('Y', p1);       // Cột Y
        await updateCell('Z', p2);       // Cột Z
        finalLockState = 'TRUE';         // Tác động vào biến cờ
    } 
    // CASE 2: Update Phase 2 => Auto Phase 1 => Force LOCK
    else if (body.phase2_duration !== undefined && body.phase2_duration !== null) {
        const p2 = parseInt(body.phase2_duration); 
        const p1 = totalDuration - p2;             

        console.log(`[UPDATE LOGIC] Row ${rowId}: Phase 2 set to ${p2}. Auto-calc Phase 1 = ${p1}. FORCING LOCK.`);

        await updateCell('Y', p1);       // Cột Y
        await updateCell('Z', p2);       // Cột Z
        finalLockState = 'TRUE';         // Tác động vào biến cờ
    }

    // CASE 3: Explicit Manual Lock Override
    // Nếu Client gửi yêu cầu Lock/Unlock cụ thể, nó sẽ ghi đè hoặc xác nhận trạng thái
    if (body.isManualLocked !== undefined) {
        if (body.isManualLocked === true) {
            finalLockState = 'TRUE';
        } else if (body.isManualLocked === false) {
            finalLockState = 'FALSE';
            console.log(`[UPDATE LOGIC] Row ${rowId}: Explicit UNLOCK requested.`);
        }
    }

    // --- 3. FINAL EXECUTION OF LOCK STATE ---
    // Chỉ update cột AE nếu có quyết định thay đổi trạng thái
    if (finalLockState !== null) {
        await updateCell('AE', finalLockState);
    } else {
        // Fallback: Nếu không có thay đổi Phase và không có lệnh Lock cụ thể, giữ nguyên.
        // Tuy nhiên, nếu user update Staff hay Time, có thể ta muốn giữ nguyên trạng thái cũ.
    }

    // 4. Trigger Sync
    if (body.forceSync) await syncData(); 
    else setTimeout(() => syncData(), 500); 
    
    return true;
}

async function updateStaffConfig(staffId, isStrictTime) {
    try {
        const staffIndex = STATE.STAFF_LIST.findIndex(s => s.id === staffId);
        let sheetRowIndex = -1;
        if (staffIndex !== -1) { 
            STATE.STAFF_LIST[staffIndex].isStrictTime = isStrictTime; 
            sheetRowIndex = STATE.STAFF_LIST[staffIndex].sheetRowIndex; 
        } 
        else { throw new Error('Staff not found'); }

        if (sheetRowIndex !== -1) {
            const valueToWrite = isStrictTime ? "TRUE" : "";
            await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!E${sheetRowIndex}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[valueToWrite]] } });
        }
        await syncData();
        return true;
    } catch (e) { console.error(e); throw e; }
}

async function layLichDatGanNhat(userId) {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:K` });
        const rows = res.data.values; if (!rows || rows.length === 0) return null;
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            if (row[9] === userId) {
                 const status = row[7] || '';
                 if (!status.includes('取消') && !status.includes('Cancelled')) {
                     return { rowId: i + 1, thoiGian: `${row[0]} ${row[1]}`, dichVu: row[3], nhanVien: row[8], thongTinKhach: `${row[2]} (${row[6]})`, chiTiet: row };
                 }
            }
        }
        return null;
    } catch (e) { console.error('Read Error:', e); return null; }
}

async function syncDailySalary(dateStr, staffDataList) {
    try {
        // Placeholder cho chức năng tính lương, sẽ mở rộng sau
        const range = `${SALARY_SHEET}!A1:AZ100`; 
        await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: range });
    } catch (e) { console.error('[SALARY ERROR]', e); }
}

// =============================================================================
// PHẦN 4: EXPORTS
// =============================================================================

module.exports = {
    // Getters for State
    getServices: () => STATE.SERVICES,
    getStaffList: () => STATE.STAFF_LIST,
    getBookings: () => STATE.cachedBookings,
    getScheduleMap: () => STATE.scheduleMap,
    getLastSyncTime: () => STATE.lastSyncTime,
    getIsSystemHealthy: () => STATE.isSystemHealthy,
    getMatrixDebug: () => STATE.LAST_CALCULATED_MATRIX,

    // Methods
    syncMenuData,
    syncData,
    syncDailySalary,
    ghiVaoSheet,
    updateBookingStatus,
    updateBookingDetails,
    updateStaffConfig,
    layLichDatGanNhat,
    
    // Helpers
    normalizeDateStrict,
    smartFindServiceCode,
    getTaipeiNow,
    formatDateTimeString
};
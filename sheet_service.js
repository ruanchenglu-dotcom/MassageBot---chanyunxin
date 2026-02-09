/**
 * =================================================================================================
 * MODULE: SHEET SERVICE (DATA LAYER) - REFACTORED V4.5 STATUS SSOT & RESOURCE AWARE
 * PROJECT: XINWUCHAN MASSAGE BOT
 * DESCRIPTION: Handles Google Sheets interactions. 
 * NOW IMPLEMENTS "SINGLE SOURCE OF TRUTH" FOR BOOKING STATUS.
 * * * * * VERSION HISTORY:
 * - V4.2: Strict Fail-Safe Locking (Column AE).
 * - V4.3: Infinite Horizon (Dynamic A1:150).
 * - V4.4: Resource Upgrade (Columns AB, AC, AD).
 * - V4.5 [CURRENT - STATUS SSOT]: 
 * + [SYNC LOGIC] Trạng thái "Running" (Đang chạy) hiện được xác định trực tiếp từ nội dung Cột H (Status).
 * + [FLAGGING] Tự động gắn cờ 'isRunning: true' nếu Status chứa từ khóa "Running" hoặc "服務中".
 * + [STABILITY] Loại bỏ sự phụ thuộc vào RAM/RowID cho trạng thái hoạt động. Dữ liệu Sheet là chân lý.
 * * * * * AUTHOR: AI ASSISTANT & USER
 * DATE: 2026/02/08 (Updated V4.5)
 * =================================================================================================
 */

require('dotenv').config();
const { google } = require('googleapis');
const ResourceCore = require('./resource_core'); // Core logic for Matrix & Rules

// --- CONFIGURATION ---
const SHEET_ID = process.env.SHEET_ID;

// Define Sheet Names
const BOOKING_SHEET = 'Sheet1';
const STAFF_SHEET = 'StaffLog';
const SCHEDULE_SHEET = 'StaffSchedule';
const SALARY_SHEET = 'SalaryLog';
const MENU_SHEET = 'menu';

// Define Status Keywords (The Source of Truth)
const STATUS_KEYWORDS = {
    RUNNING: ['Running', '服務中', 'Serving', '🟡'],
    CANCELLED: ['取消', 'Cancelled', 'Cancel', '❌'],
    WAITING: ['Waiting', 'chờ', 'waiting'],
    DONE: ['Done', 'hoàn thành', 'Completed']
};

// --- GOOGLE AUTHENTICATION ---
const auth = new google.auth.GoogleAuth({
    keyFile: 'google-key.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- INTERNAL STATE (IN-MEMORY CACHE) ---
// Note: In V4.5, STATE is used for caching read data, but logic decisions rely on Sheet content.
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
 */
function safeParseInt(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
}

/**
 * [HELPER] Boolean String Checker (Strict)
 * Kiểm tra xem một giá trị có phải là TRUE (string hoặc boolean) hay không.
 */
function isTrueString(val) {
    if (val === undefined || val === null) return false;
    if (val === true) return true;
    return String(val).trim().toUpperCase() === 'TRUE';
}

/**
 * [HELPER V4.5] Check Status String for Running State
 * Checks if the status string contains keywords implying the service is active.
 */
function checkIsRunning(statusString) {
    if (!statusString) return false;
    const normalized = statusString.toString();
    // Check against defined keywords (e.g., "Running", "服務中")
    return STATUS_KEYWORDS.RUNNING.some(keyword => normalized.includes(keyword));
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

    // 3. Fuzzy Match
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

/**
 * [HELPER V4.2] Resolve Strict Lock State
 * Centralized logic to determine the "TRUE" or "FALSE" string for Column AE.
 */
function resolveStrictLockState(explicitLock, hasManualPhase, currentStatus = "FALSE") {
    // Priority 1: Explicit Lock Request overrides everything
    if (explicitLock === true) return "TRUE";
    if (explicitLock === false) return "FALSE";

    // Priority 2: Logic-based Lock (If Phases are manually set/edited -> Lock)
    if (hasManualPhase === true) return "TRUE";

    // Priority 3: Fallback / Maintain existing state
    if (isTrueString(currentStatus)) return "TRUE";
    
    // Default safe state
    return "FALSE";
}

// =============================================================================
// PHẦN 2: SYNC ENGINE (ĐỌC VÀ ĐỒNG BỘ DỮ LIỆU TỪ GOOGLE SHEETS)
// =============================================================================

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

            let elasticStep = 0; let elasticLimit = 0;
            if (row[4]) { const ps = parseInt(row[4].toString().replace(/\D/g, '')); if (!isNaN(ps)) elasticStep = ps; }
            if (row[5]) { const pl = parseInt(row[5].toString().replace(/\D/g, '')); if (!isNaN(pl)) elasticLimit = pl; }

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
        
        if (ResourceCore.setDynamicServices) {
            ResourceCore.setDynamicServices(newServices);
        }
        STATE.SERVICES = newServices; 
        console.log(`[MENU SYNC] Updated: ${Object.keys(STATE.SERVICES).length} items.`);
    } catch (e) { console.error('[MENU ERROR]', e); }
}

async function syncData() {
    if (STATE.isSyncing) { console.log("⚠️ Skip sync: System is busy."); return; }

    try {
        STATE.isSyncing = true; 

        // --- BƯỚC 1: ĐỌC BOOKING TỪ SHEET1 ---
        // Range A:AE includes:
        // Col H (7) = Status (SOURCE OF TRUTH FOR RUNNING STATE)
        // Col AA (26) = Flow
        // Col AB (27) = Phase 1 Resource
        // Col AC (28) = Phase 2 Resource
        // Col AD (29) = Resource Type
        // Col AE (30) = Locked Status
        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:AE` });
        const rowsBooking = resBooking.data.values;
        let tempBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue; 
                
                // --- STATUS PARSING (V4.5 UPGRADE) ---
                const status = row[7] || '已預約';
                
                // 1. Filter Cancelled
                if (STATUS_KEYWORDS.CANCELLED.some(k => status.includes(k))) continue;

                // 2. Detect Running State (The Logic Shift)
                // Instead of relying on app.js to guess, we trust the Sheet column H.
                const isRunning = checkIsRunning(status);

                const cleanDate = normalizeDateStrict(row[0]); 
                if (!cleanDate) continue;

                const serviceStr = row[3] || ''; 
                let duration = 60; let type = 'BED'; let category = 'BODY'; let price = 0;
                let foundService = false;
                
                for (const key in STATE.SERVICES) {
                    if (serviceStr.includes(STATE.SERVICES[key].name.split('(')[0])) {
                        duration = STATE.SERVICES[key].duration; 
                        type = STATE.SERVICES[key].type; 
                        category = STATE.SERVICES[key].category; 
                        price = STATE.SERVICES[key].price; 
                        foundService = true; break;
                    }
                }
                if (!foundService) {
                    if (serviceStr.includes('套餐')) { category = 'COMBO'; duration = 100; }
                    else if (serviceStr.includes('足')) { type = 'CHAIR'; category = 'FOOT'; }
                }

                if (row[4] === "Yes") price += 200; 
                let pax = 1; if (row[5]) pax = safeParseInt(row[5], 1);

                const staffId = row[8] || '隨機';
                const serviceStaff1 = row[11]; 
                const staffId2 = row[12];      
                const staffId3 = row[13];      
                
                let serviceCode = row[20]; 
                if (!serviceCode || serviceCode === '') {
                     for(const key in STATE.SERVICES) { if(STATE.SERVICES[key].name === serviceStr) { serviceCode = key; break; } }
                }

                // [V4.2] Phase & Flow Reading
                const phase1Duration = safeParseInt(row[24], null);
                const phase2Duration = safeParseInt(row[25], null);
                
                const rawFlow = row[26]; 
                let flowCode = null;
                if (rawFlow && ['BF','FB','FOOTSINGLE','BODYSINGLE'].includes(rawFlow)) { flowCode = rawFlow; }
                
                // [V4.4] RESOURCE READING (Columns AB, AC, AD)
                const phase1Resource = row[27] || null; // Column AB
                const phase2Resource = row[28] || null; // Column AC
                const resourceType   = row[29] || null; // Column AD

                // Read Lock Status (Strictly Boolean)
                const rawLocked = row[30]; // Column AE
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
                    // [V4.5 NEW FIELD] Export the running state explicitly
                    isRunning: isRunning, 
                    lineId: row[9], 
                    isOil: row[4] === "Yes",
                    phase1_duration: phase1Duration,
                    phase2_duration: phase2Duration,
                    isManualLocked: isManualLocked, 
                    flow: flowCode, 
                    // [V4.4] Include explicit resource data in the object
                    phase1_resource: phase1Resource,
                    phase2_resource: phase2Resource,
                    resource_type: resourceType,
                    allocated_resource: null 
                });
            }
        }

        // --- BƯỚC 2: ĐỌC SCHEDULE VỚI INFINITE HORIZON (V4.3 UPGRADE) ---
        // Range: A1:150 (Lấy toàn bộ cột từ A đến vô tận)
        const resSchedule = await sheets.spreadsheets.values.get({ 
            spreadsheetId: SHEET_ID, 
            range: `${SCHEDULE_SHEET}!A1:150` 
        });
        
        const rows = resSchedule.data.values;
        let tempStaffList = []; let tempScheduleMap = {}; 
        
        // Memory Guardrail: Only load history from 30 days ago
        const today = getTaipeiNow();
        const pastThreshold = new Date(today);
        pastThreshold.setDate(today.getDate() - 30); 

        if (rows && rows.length > 1) {
            const headerRow = rows[0]; 
            
            if (STATE.isSystemHealthy === false) { 
                console.log(`[SCHEDULE V4.3] Detected ${headerRow.length} columns in StaffSchedule.`);
            }

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
                
                const todayStr = normalizeDateStrict(today); 
                
                // --- LOOP VÔ TẬN (DYNAMIC COLUMNS) ---
                for (let j = 15; j < headerRow.length; j++) {
                    if (!headerRow[j]) continue;
                    const normalizedDate = normalizeDateStrict(headerRow[j]); 
                    
                    if (normalizedDate) {
                        const dateObj = new Date(normalizedDate);
                        if (dateObj < pastThreshold) continue; 

                        const cellValue = row[j] ? row[j].trim().toUpperCase() : "";
                        
                        if (cellValue === 'OFF') {
                            if (!tempScheduleMap[normalizedDate]) tempScheduleMap[normalizedDate] = [];
                            tempScheduleMap[normalizedDate].push(cleanName);
                            staffObj.offDays.push(normalizedDate);
                            
                            if (normalizedDate === todayStr) { staffObj.off = true; }
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
                    const matrixAllocation = ResourceCore.generateResourceMatrix(tempBookings, STATE.STAFF_LIST);
                    // Merge allocation results
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
// PHẦN 3: WRITE & UPDATE LOGIC (UPDATED V4.5 STATUS & V4.4 RESOURCES)
// =============================================================================

/**
 * Ghi booking mới vào Google Sheets.
 * V4.5 NOTE: Trạng thái mặc định là "已預約". 
 * Nếu muốn tạo booking ở trạng thái "Running" ngay lập tức, cần truyền tham số status.
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
        // Default status is Reserved, unless overridden
        const colH_Status = data.trangThai || '已預約'; 
        const colJ_LineID = data.userId; 
        const colK_Created = timeCreate;
        
        const valuesToWrite = [];
        let loopCount = 1;
        if (data.guestDetails && Array.isArray(data.guestDetails) && data.guestDetails.length > 0) {
            loopCount = data.guestDetails.length;
        }

        for (let i = 0; i < loopCount; i++) {
            // Khởi tạo mảng với 31 phần tử (index 0 -> 30)
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

            // [PHASE DURATION CALCULATION]
            let p1 = null; let p2 = null;
            if (guestDetail) { 
                p1 = (guestDetail.phase1_duration !== undefined) ? guestDetail.phase1_duration : guestDetail.phase1;
                p2 = (guestDetail.phase2_duration !== undefined) ? guestDetail.phase2_duration : guestDetail.phase2;
            }
            if (p1 === null || p1 === undefined) p1 = data.phase1_duration;
            if (p2 === null || p2 === undefined) p2 = data.phase2_duration;
            
            row[24] = (p1 !== null && p1 !== undefined && p1 !== "") ? p1 : "";
            row[25] = (p2 !== null && p2 !== undefined && p2 !== "") ? p2 : "";

            // [FLOW LOGIC]
            let flowVal = null;
            if (guestDetail && (guestDetail.flow || guestDetail.flowCode)) flowVal = guestDetail.flow || guestDetail.flowCode;
            if (!flowVal) flowVal = data.flow || data.flowCode;
            if (!flowVal && sCode && STATE.SERVICES[sCode]) {
                const svcDef = STATE.SERVICES[sCode];
                if (svcDef.category === 'FOOT') flowVal = "FOOTSINGLE";
                else if (svcDef.category === 'BODY') flowVal = "BODYSINGLE";
                else if (svcDef.category === 'COMBO') flowVal = "FB";
            }
            row[26] = flowVal || "FB";

            // [V4.4] RESOURCE COLUMNS WRITING (AB, AC, AD)
            let r1 = null; let r2 = null; let rType = null;
            if (guestDetail) {
                r1 = guestDetail.phase1Resource || guestDetail.phase1_resource;
                r2 = guestDetail.phase2Resource || guestDetail.phase2_resource;
                rType = guestDetail.resourceType || guestDetail.resource_type;
            }
            if (!r1) r1 = data.phase1Resource || data.phase1_resource;
            if (!r2) r2 = data.phase2Resource || data.phase2_resource;
            if (!rType) rType = data.resourceType || data.resource_type;

            row[27] = r1 || ""; // Column AB
            row[28] = r2 || ""; // Column AC
            row[29] = rType || ""; // Column AD

            // [CRITICAL: STRICT LOCK LOGIC]
            const hasManualPhase = (p1 !== null && p1 !== undefined && p1 !== "");
            const finalLockVal = resolveStrictLockState(data.isManualLocked, hasManualPhase, "FALSE");
            
            row[30] = finalLockVal; 

            console.log(`[WRITE] Row generated. Phase1: ${p1}, Res1: ${r1}, Res2: ${r2}, Type: ${rType}, Lock: ${finalLockVal}`);
            valuesToWrite.push(row);
        }

        if (valuesToWrite.length > 0) {
            console.log(`[WRITE] Atomic Appending ${valuesToWrite.length} rows to Sheet1.`);
            await sheets.spreadsheets.values.append({ 
                spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', 
                valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite } 
            });
            console.log(`[WRITE] Success.`);
        }
        
        // Fast sync after write to update SSOT
        setTimeout(() => syncData(), 500);

    } catch (e) { console.error('[WRITE ERROR] One-Shot Write Failed:', e); }
}

/**
 * [HELPER] Direct Status Update
 * Updates Column H directly. Critical for SSOT strategy.
 */
async function updateBookingStatus(rowId, newStatus) {
    try {
        if (!rowId) throw new Error("RowID required for status update");
        
        console.log(`[STATUS SSOT] Updating Row ${rowId} to '${newStatus}'`);
        
        await sheets.spreadsheets.values.update({ 
            spreadsheetId: SHEET_ID, 
            range: `${BOOKING_SHEET}!H${rowId}`, 
            valueInputOption: 'USER_ENTERED', 
            requestBody: { values: [[ newStatus ]] } 
        });
        
        await syncData(); // Sync immediately to propagate 'isRunning' status
        return true;
    } catch (e) { console.error('Update Status Error:', e); return false; }
}

/**
 * [CRITICAL] UPDATE BOOKING DETAILS (V4.5 STATUS & V4.4 RESOURCE AWARE)
 * Handles updating various fields including Status, Resources, and Locks.
 */
async function updateBookingDetails(body) {
    const rowId = body.rowId;
    if (!rowId) throw new Error('Missing rowId');
    
    // Helper write function
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
    
    // [V4.5] Status Update - Direct Write to Col H
    // If body.mainStatus is passed (e.g., "🟡 服務中"), it writes to Sheet.
    // syncData will then read it and set isRunning=true.
    if (body.mainStatus) {
        console.log(`[UPDATE STATUS] Writing '${body.mainStatus}' to Row ${rowId} (Col H)`);
        await updateCell('H', body.mainStatus);
    }
    
    // Staff Updates
    if (body.staffId && body.staffId !== '随機') await updateCell('I', body.staffId);
    if (body.staffId2) await updateCell('M', body.staffId2);
    if (body.staffId3) await updateCell('N', body.staffId3);
    if (body.flow) await updateCell('AA', body.flow);

    // --- 2. [V4.4] RESOURCE COLUMN UPDATES (AB, AC, AD) ---
    // Cho phép cập nhật thủ công tài nguyên nếu UI gửi lên
    if (body.phase1Resource !== undefined) await updateCell('AB', body.phase1Resource);
    if (body.phase2Resource !== undefined) await updateCell('AC', body.phase2Resource);
    if (body.resourceType !== undefined)   await updateCell('AD', body.resourceType);

    // --- 3. [ADVANCED] PHASE & LOCK LOGIC WITH FAIL-SAFE ---
    
    // Step A: Get Context
    let bookingData = STATE.cachedBookings.find(b => b.rowId == rowId);
    let totalDuration = 60; 
    let currentLockState = false; 

    if (bookingData) {
        totalDuration = bookingData.duration;
        currentLockState = bookingData.isManualLocked;
    } else {
        console.warn(`[UPDATE WARNING] Row ${rowId} missing in cache. Using defaults.`);
        if (body.duration) totalDuration = safeParseInt(body.duration, 60);
    }

    // Step B: Calculate Phases & Detect Logic Changes
    let hasManualPhaseChange = false;

    // CASE 1: Update Phase 1 => Auto Phase 2
    if (body.phase1_duration !== undefined && body.phase1_duration !== null) {
        const p1 = parseInt(body.phase1_duration); 
        const p2 = totalDuration - p1;             
        
        console.log(`[UPDATE LOGIC] Row ${rowId}: Phase 1 set to ${p1}. Auto-calc Phase 2 = ${p2}.`);
        await updateCell('Y', p1);       
        await updateCell('Z', p2);       
        hasManualPhaseChange = true;
    } 
    // CASE 2: Update Phase 2 => Auto Phase 1
    else if (body.phase2_duration !== undefined && body.phase2_duration !== null) {
        const p2 = parseInt(body.phase2_duration); 
        const p1 = totalDuration - p2;             

        console.log(`[UPDATE LOGIC] Row ${rowId}: Phase 2 set to ${p2}. Auto-calc Phase 1 = ${p1}.`);
        await updateCell('Y', p1);       
        await updateCell('Z', p2);       
        hasManualPhaseChange = true;
    }

    // Step C: Resolve Strict Lock State (FAIL-SAFE)
    const currentLockString = currentLockState ? "TRUE" : "FALSE";
    
    const finalLockString = resolveStrictLockState(
        body.isManualLocked, // Explicit override provided?
        hasManualPhaseChange, // Logic override?
        currentLockString     // Fallback
    );

    // Step D: Write Lock State
    let needsLockUpdate = false;
    
    if (finalLockString !== currentLockString) needsLockUpdate = true;
    if (body.isManualLocked !== undefined) needsLockUpdate = true;
    if (hasManualPhaseChange) needsLockUpdate = true;

    if (needsLockUpdate) {
        console.log(`[UPDATE LOCK] Forcing AE to ${finalLockString} (Prev: ${currentLockString})`);
        await updateCell('AE', finalLockString);
    } else {
        // [FAIL-SAFE EXTENSION]
        if (bookingData && (bookingData.isManualLocked === null || bookingData.isManualLocked === undefined)) {
             console.log(`[UPDATE FAIL-SAFE] AE was undefined. Healing to FALSE.`);
             await updateCell('AE', 'FALSE');
        }
    }

    // 4. Trigger Sync to refresh state across the app
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
        // Placeholder cho chức năng tính lương
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
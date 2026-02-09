/**
 * =================================================================================================
 * MODULE: SHEET SERVICE (DATA LAYER) - REFACTORED V5.0 FULL FEATURES
 * PROJECT: XINWUCHAN MASSAGE BOT
 * DESCRIPTION: Handles Google Sheets interactions. 
 * NOW IMPLEMENTS FULL STAFF SCHEDULE MANAGEMENT via LINE ID.
 * * * * * VERSION HISTORY:
 * - V4.2: Strict Fail-Safe Locking (Column AE).
 * - V4.3: Infinite Horizon (Dynamic A1:150).
 * - V4.4: Resource Upgrade (Columns AB, AC, AD).
 * - V4.5: Status Single Source of Truth (SSOT).
 * - V5.0 [CURRENT - STAFF INTEGRATION]:
 * + [NEW] Auto-Map LINE ID (Col F) to Staff Object.
 * + [NEW] Dynamic Date Column Mapping (Tìm cột ngày tự động).
 * + [NEW] writeScheduleCell: Ghi "OFF" hoặc giờ trễ vào đúng ô ngày tháng.
 * + [NEW] writeDailyActivity: Ghi giờ Ăn (H,I) và Ra ngoài (J,K).
 * + [HELPER] Column Letter Converter (0 -> A, 26 -> AA).
 * * * * * AUTHOR: AI ASSISTANT & USER
 * DATE: 2026/02/09 (Updated V5.0)
 * =================================================================================================
 */

require('dotenv').config();
const { google } = require('googleapis');
const ResourceCore = require('./resource_core'); // Core logic for Matrix & Rules

// --- CONFIGURATION ---
const SHEET_ID = process.env.SHEET_ID;

// Define Sheet Names
const BOOKING_SHEET = 'Sheet1';
const STAFF_SHEET = 'StaffLog'; // (Ít dùng, giữ legacy)
const SCHEDULE_SHEET = 'StaffSchedule'; // Sheet Chấm công chính
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
let STATE = {
    STAFF_LIST: [],
    cachedBookings: [],
    scheduleMap: {}, // Maps Date -> List of OFF Staff
    dateColumnMap: {}, // [NEW V5.0] Maps 'YYYY/MM/DD' -> Column Index (e.g., 15 for 'P')
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
 * [NEW V5.0] Convert Column Index (0-based) to Excel Letter (e.g. 0->A, 26->AA)
 * Cực kỳ quan trọng để ghi dữ liệu vào đúng cột động.
 */
function getColumnLetter(colIndex) {
    let letter = '';
    while (colIndex >= 0) {
        letter = String.fromCharCode((colIndex % 26) + 65) + letter;
        colIndex = Math.floor(colIndex / 26) - 1;
    }
    return letter;
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
 */
function isTrueString(val) {
    if (val === undefined || val === null) return false;
    if (val === true) return true;
    return String(val).trim().toUpperCase() === 'TRUE';
}

/**
 * [HELPER V4.5] Check Status String for Running State
 */
function checkIsRunning(statusString) {
    if (!statusString) return false;
    const normalized = statusString.toString();
    return STATUS_KEYWORDS.RUNNING.some(keyword => normalized.includes(keyword));
}

/**
 * [HELPER] SMART SERVICE FINDER
 */
function smartFindServiceCode(inputName) {
    if (!inputName) return null;
    const cleanInput = inputName.trim();
    const upperInput = cleanInput.toUpperCase();
    if (STATE.SERVICES[upperInput]) return upperInput;
    for (const code in STATE.SERVICES) {
        if (STATE.SERVICES[code].name === cleanInput) return code;
    }
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
 */
function resolveStrictLockState(explicitLock, hasManualPhase, currentStatus = "FALSE") {
    if (explicitLock === true) return "TRUE";
    if (explicitLock === false) return "FALSE";
    if (hasManualPhase === true) return "TRUE";
    if (isTrueString(currentStatus)) return "TRUE";
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
        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!A:AE` });
        const rowsBooking = resBooking.data.values;
        let tempBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue; 
                
                const status = row[7] || '已預約';
                if (STATUS_KEYWORDS.CANCELLED.some(k => status.includes(k))) continue;
                const isRunning = checkIsRunning(status);
                const cleanDate = normalizeDateStrict(row[0]); 
                if (!cleanDate) continue;

                // (Giữ nguyên logic parse booking như cũ...)
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

                let serviceCode = row[20]; 
                if (!serviceCode || serviceCode === '') {
                     for(const key in STATE.SERVICES) { if(STATE.SERVICES[key].name === serviceStr) { serviceCode = key; break; } }
                }

                tempBookings.push({
                    rowId: i + 1, 
                    startTimeString: `${cleanDate} ${row[1]}`, 
                    startTime: row[1], 
                    duration: duration, 
                    type: type, category: category, price: price,
                    staffId: staffId, staffName: staffId, 
                    serviceStaff: row[11], staffId2: row[12], staffId3: row[13], 
                    pax: pax, 
                    customerName: `${row[2]} (${row[6]})`,
                    serviceName: serviceStr, serviceCode: serviceCode, 
                    phone: row[6], date: cleanDate, status: status, 
                    isRunning: isRunning, lineId: row[9], isOil: row[4] === "Yes",
                    phase1_duration: safeParseInt(row[24], null),
                    phase2_duration: safeParseInt(row[25], null),
                    isManualLocked: isTrueString(row[30]), 
                    flow: row[26], 
                    phase1_resource: row[27], phase2_resource: row[28], resource_type: row[29],
                    allocated_resource: null 
                });
            }
        }

        // --- BƯỚC 2: ĐỌC SCHEDULE & LINE MAPPING (V5.0 UPGRADE) ---
        const resSchedule = await sheets.spreadsheets.values.get({ 
            spreadsheetId: SHEET_ID, 
            range: `${SCHEDULE_SHEET}!A1:150` 
        });
        
        const rows = resSchedule.data.values;
        let tempStaffList = []; 
        let tempScheduleMap = {}; 
        let tempDateColumnMap = {}; // [NEW] Lưu mapping ngày -> cột
        
        const today = getTaipeiNow();
        const pastThreshold = new Date(today);
        pastThreshold.setDate(today.getDate() - 30); 

        if (rows && rows.length > 1) {
            const headerRow = rows[0]; 
            
            // [NEW V5.0] MAP HEADER DATES TO COLUMN INDICES
            // Bắt đầu từ cột P (index 15) trở đi là ngày tháng
            for (let j = 15; j < headerRow.length; j++) {
                if (!headerRow[j]) continue;
                const normalizedDate = normalizeDateStrict(headerRow[j]);
                if (normalizedDate) {
                    tempDateColumnMap[normalizedDate] = j; // Lưu index cột (0-based)
                }
            }
            STATE.dateColumnMap = tempDateColumnMap; // Update global state
            console.log(`[SYNC V5.0] Mapped ${Object.keys(tempDateColumnMap).length} date columns.`);

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const staffName = row[0]; if (!staffName) continue;
                const cleanName = staffName.trim();
                const gender = (row[1] && (row[1] === '女' || row[1] === 'F')) ? 'F' : 'M';
                
                let startTime = row[2] ? row[2].trim().replace(/：/g, ':') : '12:00';
                let endTime = row[3] ? row[3].trim().replace(/：/g, ':') : '03:00';
                const onTimeVal = row[4] ? row[4].toString().trim().toUpperCase() : '';
                const isStrictTime = (onTimeVal === 'TRUE' || onTimeVal === 'YES' || onTimeVal === 'X');

                // [NEW V5.0] READ LINE ID FROM COLUMN F (INDEX 5)
                const lineId = row[5] ? row[5].trim() : null;

                const staffObj = { 
                    id: cleanName, name: cleanName, gender: gender, 
                    lineId: lineId, // Gắn Line ID vào object nhân viên
                    start: startTime, end: endTime, shiftStart: startTime, shiftEnd: endTime,
                    isStrictTime: isStrictTime, sheetRowIndex: i + 1, off: false, offDays: [] 
                };
                
                const todayStr = normalizeDateStrict(today); 
                
                // --- LOOP VÔ TẬN (DYNAMIC COLUMNS) ---
                for (let j = 15; j < headerRow.length; j++) {
                    const normalizedDate = normalizeDateStrict(headerRow[j]);
                    if (!normalizedDate) continue;

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
                    tempBookings.forEach(booking => {
                        if (matrixAllocation[booking.rowId]) {
                            booking.allocated_resource = matrixAllocation[booking.rowId];
                        }
                    });
                    STATE.LAST_CALCULATED_MATRIX = matrixAllocation;
                }
            } catch (err) { console.error("[MATRIX ERROR]", err); }
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
// PHẦN 3: WRITE & UPDATE LOGIC (UPDATED V5.0)
// =============================================================================

/**
 * Ghi booking mới vào Google Sheets.
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
            const row = new Array(31).fill("");
            let guestDetail = (data.guestDetails && data.guestDetails[i]) ? data.guestDetails[i] : null;

            const guestNum = i + 1; const total = loopCount;
            row[0] = colA_Date; row[1] = colB_Time; 
            row[2] = `${data.hoTen || '現場客'} (${guestNum}/${total})`; 
            
            let svcName = data.dichVu;
            if (guestDetail) svcName = guestDetail.service;
            let isOil = data.isOil;
            if (guestDetail && guestDetail.isOil !== undefined) isOil = guestDetail.isOil;
            if (isOil) svcName += " (油推+$200)";

            row[3] = svcName; row[4] = isOil ? "Yes" : ""; row[5] = 1; 
            row[6] = colG_Phone; row[7] = colH_Status; 
            
            if (guestDetail && guestDetail.staff) row[8] = guestDetail.staff;
            else row[8] = data.nhanVien || '隨機';
            
            row[9] = colJ_LineID; row[10] = colK_Created; 

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

            // [PHASE & FLOW & LOCK LOGIC]
            let p1 = null; let p2 = null;
            if (guestDetail) { 
                p1 = (guestDetail.phase1_duration !== undefined) ? guestDetail.phase1_duration : guestDetail.phase1;
                p2 = (guestDetail.phase2_duration !== undefined) ? guestDetail.phase2_duration : guestDetail.phase2;
            }
            if (p1 === null || p1 === undefined) p1 = data.phase1_duration;
            if (p2 === null || p2 === undefined) p2 = data.phase2_duration;
            row[24] = (p1 !== null && p1 !== "") ? p1 : "";
            row[25] = (p2 !== null && p2 !== "") ? p2 : "";

            let flowVal = null;
            if (guestDetail) flowVal = guestDetail.flow || guestDetail.flowCode;
            if (!flowVal) flowVal = data.flow || data.flowCode;
            if (!flowVal && sCode && STATE.SERVICES[sCode]) {
                const svcDef = STATE.SERVICES[sCode];
                if (svcDef.category === 'FOOT') flowVal = "FOOTSINGLE";
                else if (svcDef.category === 'BODY') flowVal = "BODYSINGLE";
                else if (svcDef.category === 'COMBO') flowVal = "FB";
            }
            row[26] = flowVal || "FB";

            // Resource
            let r1 = null; let r2 = null; let rType = null;
            if (guestDetail) {
                r1 = guestDetail.phase1Resource || guestDetail.phase1_resource;
                r2 = guestDetail.phase2Resource || guestDetail.phase2_resource;
                rType = guestDetail.resourceType || guestDetail.resource_type;
            }
            if (!r1) r1 = data.phase1Resource || data.phase1_resource;
            if (!r2) r2 = data.phase2Resource || data.phase2_resource;
            if (!rType) rType = data.resourceType || data.resource_type;
            row[27] = r1 || ""; row[28] = r2 || ""; row[29] = rType || "";

            const hasManualPhase = (p1 !== null && p1 !== undefined && p1 !== "");
            const finalLockVal = resolveStrictLockState(data.isManualLocked, hasManualPhase, "FALSE");
            row[30] = finalLockVal; 

            valuesToWrite.push(row);
        }

        if (valuesToWrite.length > 0) {
            await sheets.spreadsheets.values.append({ 
                spreadsheetId: SHEET_ID, range: 'Sheet1!A:A', 
                valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite } 
            });
            console.log(`[WRITE] Appended ${valuesToWrite.length} rows.`);
        }
        setTimeout(() => syncData(), 500);

    } catch (e) { console.error('[WRITE ERROR]', e); }
}

async function updateBookingStatus(rowId, newStatus) {
    try {
        if (!rowId) throw new Error("RowID required");
        await sheets.spreadsheets.values.update({ 
            spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!H${rowId}`, 
            valueInputOption: 'USER_ENTERED', requestBody: { values: [[ newStatus ]] } 
        });
        await syncData(); 
        return true;
    } catch (e) { console.error('Update Status Error:', e); return false; }
}

async function updateBookingDetails(body) {
    const rowId = body.rowId;
    if (!rowId) throw new Error('Missing rowId');
    
    const updateCell = async (col, val) => {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET}!${col}${rowId}`, 
            valueInputOption: 'USER_ENTERED', requestBody: { values: [[val]] }
        });
    };

    if (body.date) {
        const formattedDate = normalizeDateStrict(body.date);
        await updateCell('A', formattedDate); await updateCell('S', formattedDate);
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
    
    if (body.staffId && body.staffId !== '随機') await updateCell('I', body.staffId);
    if (body.staffId2) await updateCell('M', body.staffId2);
    if (body.staffId3) await updateCell('N', body.staffId3);
    if (body.flow) await updateCell('AA', body.flow);

    if (body.phase1Resource !== undefined) await updateCell('AB', body.phase1Resource);
    if (body.phase2Resource !== undefined) await updateCell('AC', body.phase2Resource);
    if (body.resourceType !== undefined)   await updateCell('AD', body.resourceType);

    // Advanced Phase & Lock Logic
    let bookingData = STATE.cachedBookings.find(b => b.rowId == rowId);
    let totalDuration = bookingData ? bookingData.duration : (safeParseInt(body.duration, 60));
    let currentLockState = bookingData ? bookingData.isManualLocked : false; 
    let hasManualPhaseChange = false;

    if (body.phase1_duration !== undefined && body.phase1_duration !== null) {
        const p1 = parseInt(body.phase1_duration); const p2 = totalDuration - p1;             
        await updateCell('Y', p1); await updateCell('Z', p2); hasManualPhaseChange = true;
    } else if (body.phase2_duration !== undefined && body.phase2_duration !== null) {
        const p2 = parseInt(body.phase2_duration); const p1 = totalDuration - p2;             
        await updateCell('Y', p1); await updateCell('Z', p2); hasManualPhaseChange = true;
    }

    const currentLockString = currentLockState ? "TRUE" : "FALSE";
    const finalLockString = resolveStrictLockState(body.isManualLocked, hasManualPhaseChange, currentLockString);

    if (finalLockString !== currentLockString || body.isManualLocked !== undefined || hasManualPhaseChange) {
        await updateCell('AE', finalLockString);
    }

    if (body.forceSync) await syncData(); else setTimeout(() => syncData(), 500); 
    return true;
}

// =============================================================================
// PHẦN 4: STAFF SCHEDULE & ACTIVITY METHODS (NEW V5.0)
// =============================================================================

/**
 * [NEW V5.0] Tìm nhân viên bằng Line ID từ cache
 */
function findStaffByLineId(lineId) {
    if (!lineId || !STATE.STAFF_LIST) return null;
    return STATE.STAFF_LIST.find(s => s.lineId === lineId);
}

/**
 * [NEW V5.0] Generic Schedule Update
 * Dùng cho các nút: Xin nghỉ (OFF), Đi trễ (ghi giờ)
 */
async function updateScheduleCell(lineId, dateStr, value) {
    try {
        const staff = findStaffByLineId(lineId);
        if (!staff) { console.warn(`[SCHED] Staff not found for LINE ID: ${lineId}`); return false; }
        
        const normalizedDate = normalizeDateStrict(dateStr);
        if (!normalizedDate) return false;

        const colIndex = STATE.dateColumnMap[normalizedDate];
        if (!colIndex) { console.warn(`[SCHED] No column found for date: ${normalizedDate}`); return false; }

        const colLetter = getColumnLetter(colIndex); // Convert index to A, B, AA...
        const range = `${SCHEDULE_SHEET}!${colLetter}${staff.sheetRowIndex}`;

        console.log(`[SCHED] Updating ${staff.name} at ${range} with value: ${value}`);
        
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[value]] }
        });

        await syncData(); // Refresh cache
        return true;
    } catch (e) { console.error('[SCHED ERROR]', e); return false; }
}

/**
 * [NEW V5.0] Update Daily Status (Eat/Out)
 * Dùng cho nút: Ăn cơm (Col H, I), Ra ngoài (Col J, K)
 * @param {string} lineId - LINE ID của nhân viên
 * @param {string} type - 'EAT' hoặc 'OUT'
 * @param {string} startVal - Giờ bắt đầu (VD: "12:00")
 * @param {string} endVal - Giờ kết thúc (VD: "13:00")
 */
async function updateDailyActivity(lineId, type, startVal, endVal) {
    try {
        const staff = findStaffByLineId(lineId);
        if (!staff) return false;

        // Xác định cột dựa trên loại hoạt động
        // EAT: Start=H (Index 7), End=I (Index 8)
        // OUT: Start=J (Index 9), End=K (Index 10)
        let startCol = 'H'; let endCol = 'I';
        if (type === 'OUT') { startCol = 'J'; endCol = 'K'; }

        const row = staff.sheetRowIndex;
        
        // Cập nhật 2 ô liên tiếp
        // Lưu ý: Có thể dùng batchUpdate, nhưng 2 request nhỏ cũng ổn
        if (startVal) {
             await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!${startCol}${row}`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: [[startVal]] }
            });
        }
        
        if (endVal) {
             await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID, range: `${SCHEDULE_SHEET}!${endCol}${row}`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: [[endVal]] }
            });
        }

        console.log(`[ACTIVITY] Updated ${type} for ${staff.name}: ${startVal}-${endVal}`);
        await syncData();
        return true;
    } catch (e) { console.error('[ACTIVITY ERROR]', e); return false; }
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
        const range = `${SALARY_SHEET}!A1:AZ100`; 
        await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: range });
    } catch (e) { console.error('[SALARY ERROR]', e); }
}

// =============================================================================
// PHẦN 5: EXPORTS
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
    
    // [NEW V5.0 METHODS]
    findStaffByLineId,    // Tìm nhân viên bằng Line ID
    updateScheduleCell,   // Ghi OFF hoặc giờ trễ vào cột ngày
    updateDailyActivity,  // Ghi giờ Ăn/Ra ngoài
    
    // Helpers
    normalizeDateStrict,
    smartFindServiceCode,
    getTaipeiNow,
    formatDateTimeString
};
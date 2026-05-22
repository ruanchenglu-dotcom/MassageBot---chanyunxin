/**
 * =================================================================================================
 * MODULE: SHEET SERVICE (DATA LAYER) - REFACTORED V1.5 (DYNAMIC CONFIG & ERROR HANDLING)
 * PROJECT: XINWUCHAN MASSAGE BOT (禪云心養生館)
 * DESCRIPTION: Handles Google Sheets interactions & Fallback Systems.
 * * * * * UPDATE V1.5 (CRITICAL FIX - ANTI SILENT FAILURE):
 * + [FIX] Hàm ghiVaoSheet nay sẽ trả về 'true' nếu ghi thành công và 'false' nếu thất bại, 
 * giúp Lớp Controller (index.js) nhận biết để rẽ nhánh thông báo cho khách hàng.
 * * * * * UPDATE V1.4 (DYNAMIC SHEET NAMES):
 * + [FIX] Loại bỏ hoàn toàn hardcode tên Sheet. Kế thừa từ SYSTEM_CONFIG.SHEET_NAMES.
 * + [FIX] Sửa lỗi hardcode 'Sheet1!A:A' trong hàm ghiVaoSheet.
 * * * * * UPDATE V131 (DYNAMIC COLUMNS & HARD FALLBACK):
 * + [FIX] Loại bỏ hardcode cột 15. Tự động dò tìm các cột chứa ngày tháng trên dòng Header.
 * + [FEATURE] Thêm hàm generateVirtualStaffList(). Luôn có dữ liệu nhân viên để tránh lỗi Cold Start.
 * + [FEATURE] Đảm bảo isSystemHealthy luôn True (Graceful Degradation tuyệt đối).
 * =================================================================================================
 */

require('dotenv').config();
const { google } = require('googleapis');
const ResourceCore = require('./cyx_resource_core'); // Core logic for Matrix & Rules
let BOOKING_SHEET_NAME, STAFF_SHEET_NAME, MENU_SHEET_NAME, STAFF_LIST_SHEET_NAME, SALARY_LOG_SHEET_NAME, BLACKLIST_SHEET_NAME;

function getConfig() {
    delete require.cache[require.resolve('./cyx_data.js')];
    const config = require('./cyx_data.js').SYSTEM_CONFIG;
    if (config && config.SHEET_NAMES) {
        BOOKING_SHEET_NAME = config.SHEET_NAMES.BOOKING_SHEET_NAME;
        STAFF_SHEET_NAME = config.SHEET_NAMES.STAFF_SHEET_NAME;
        MENU_SHEET_NAME = config.SHEET_NAMES.MENU_SHEET_NAME;
        STAFF_LIST_SHEET_NAME = config.SHEET_NAMES.STAFF_LIST_SHEET_NAME;
        SALARY_LOG_SHEET_NAME = config.SHEET_NAMES.SALARY_LOG_SHEET_NAME;
        BLACKLIST_SHEET_NAME = config.SHEET_NAMES.BLACKLIST_SHEET_NAME;
    }
    return config;
}

// Initial load
getConfig();
const SERVICES_DATA = require('./cyx_data.js').SERVICES_DATA;

// --- CONFIGURATION ---
const SHEET_ID = process.env.SHEET_ID;

// Define Status Keywords (The Source of Truth)
const STATUS_KEYWORDS = {
    RUNNING: ['Running', '服務中', 'Serving', '🟡'],
    CANCELLED: ['取消', 'Cancelled', 'Cancel', '❌'],
    NOSHOW: ['爽約', 'Noshow', 'No Show'],
    WAITING: ['Waiting', 'chờ', 'waiting'],
    DONE: ['Done', 'hoàn thành', 'Completed', '✅']
};

// --- GOOGLE AUTHENTICATION ---
let auth;
if (process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_CLIENT_EMAIL) {
    auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
} else {
    auth = new google.auth.GoogleAuth({
        keyFile: 'google-key.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
}

const sheets = google.sheets({ version: 'v4', auth });

// --- INTERNAL STATE (IN-MEMORY CACHE) ---
let STATE = {
    STAFF_LIST: [],
    cachedBookings: [],
    scheduleMap: {},
    dateColumnMap: {},
    SERVICES: SERVICES_DATA || ResourceCore.SERVICES || {},
    QUICK_NOTES: [],
    BLACKLIST: [],
    lastSyncTime: new Date(0),
    isSystemHealthy: false,
    isSyncing: false,
    LAST_CALCULATED_MATRIX: null,
    consecutiveSyncErrors: 0
};

// =============================================================================
// PHẦN 1: UTILITIES (CÁC HÀM HỖ TRỢ & XỬ LÝ DỮ LIỆU)
// =============================================================================

function getTaipeiNow() {
    return ResourceCore.getTaipeiNow ? ResourceCore.getTaipeiNow() : new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
}

function getColumnLetter(colIndex) {
    let letter = '';
    while (colIndex >= 0) {
        letter = String.fromCharCode((colIndex % 26) + 65) + letter;
        colIndex = Math.floor(colIndex / 26) - 1;
    }
    return letter;
}

function normalizeDateStrict(inputDate) {
    if (!inputDate) return null;
    try {
        let dateObj;
        if (typeof inputDate === 'string' && inputDate.includes('T')) {
            dateObj = new Date(inputDate);
        } else if (typeof inputDate === 'number' && inputDate > 40000) {
            dateObj = new Date(Math.round((inputDate - 25569) * 86400 * 1000));
        } else {
            const dateString = inputDate.toString().trim().replace(/-/g, '/');
            dateObj = new Date(dateString);
        }

        if (isNaN(dateObj.getTime())) return null;

        const taipeiTimeStr = dateObj.toLocaleString("en-US", { timeZone: "Asia/Taipei" });
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

function formatDateTimeString(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const h = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
}

function getCurrentDateTimeStr() { return formatDateTimeString(getTaipeiNow()); }

function safeParseInt(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
}

function isTrueString(val) {
    if (val === undefined || val === null) return false;
    if (val === true) return true;
    return String(val).trim().toUpperCase() === 'TRUE';
}

function checkIsRunning(statusString) {
    if (!statusString) return false;
    const normalized = statusString.toString();
    return STATUS_KEYWORDS.RUNNING.some(keyword => normalized.includes(keyword));
}

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

function resolveStrictLockState(explicitLock, hasManualPhase, currentStatus = "FALSE") {
    if (explicitLock === true) return "TRUE";
    if (explicitLock === false) return "FALSE";
    if (hasManualPhase === true) return "TRUE";
    if (isTrueString(currentStatus)) return "TRUE";
    return "FALSE";
}

function getOilSuffixText() {
    const bonus = getConfig().FINANCE.OIL_BONUS;
    return bonus > 0 ? ` (油推+$${bonus})` : ` (油推)`;
}

// [V131 NÂNG CẤP]: Hàm tạo danh sách nhân sự ảo khi Sheet/API lỗi hoặc trống
function generateVirtualStaffList() {
    const virtualStaff = [];
    const config = getConfig();
    // Tính toán số lượng thợ tối đa có thể phục vụ dựa vào số giường/ghế
    const maxCapacity = Math.max(config.SCALE.MAX_BEDS, config.SCALE.MAX_CHAIRS) || 9;

    for (let i = 1; i <= maxCapacity; i++) {
        const genderVal = (i % 2 === 0) ? 'F' : 'M';
        virtualStaff.push({
            id: `0${i}`.slice(-2), // 01, 02, 03...
            name: `技師${i}號`,     // 技師1號
            gender: genderVal,
            lineId: null,
            start: '08:00',
            end: '23:59',
            shiftStart: '08:00',
            shiftEnd: '23:59',
            isStrictTime: false,
            sheetRowIndex: 0,
            off: false,
            offDays: [],
            isVirtual: true // Cờ đánh dấu dữ liệu ảo
        });
    }
    return virtualStaff;
}

// =============================================================================
// PHẦN 2: SYNC ENGINE (ĐỌC VÀ ĐỒNG BỘ DỮ LIỆU TỪ GOOGLE SHEETS)
// =============================================================================

async function init() {
    try {
        console.log("[SHEET SERVICE] Đang khởi tạo dữ liệu ban đầu...");
        await syncQuickNotes();
        await syncMenuData();
        await syncBlacklist();
        await syncData();
        console.log("[SHEET SERVICE] Khởi tạo hoàn tất!");
    } catch (error) {
        console.error("[SHEET SERVICE] Lỗi trong quá trình khởi tạo:", error);
    }
}

async function syncQuickNotes() {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${STAFF_LIST_SHEET_NAME}!V2:V` });
        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            STATE.QUICK_NOTES = [];
            return;
        }
        STATE.QUICK_NOTES = rows.map(row => row[0]).filter(val => val && val.trim() !== '');
    } catch (e) {
        console.error('[QUICK NOTES SYNC ERROR]', e);
    }
}

async function syncMenuData() {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${MENU_SHEET_NAME}!A2:Z` });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return;

        let newServices = {};
        rows.forEach(row => {
            const code = row[0] ? row[0].toString().trim() : null;
            const name = row[1] ? row[1].toString().trim() : '';
            const priceStr = row[3] ? row[3].toString().trim() : '0';

            if (!code || !name) return;

            let duration = 60;
            const timeMatch = name.match(/(\d+)分/);
            if (timeMatch) duration = parseInt(timeMatch[1]);

            const price = parseInt(priceStr.replace(/\D/g, '')) || 0;

            let elasticStep = 0; let elasticLimit = 0;
            if (row[4]) { const ps = parseInt(row[4].toString().replace(/\D/g, '')); if (!isNaN(ps)) elasticStep = ps; }
            if (row[5]) { const pl = parseInt(row[5].toString().replace(/\D/g, '')); if (!isNaN(pl)) elasticLimit = pl; }

            let blocks = 1;
            if (row[6]) { const blk = parseInt(row[6].toString().replace(/\D/g, '')); if (!isNaN(blk)) blocks = blk; }

            let commission = 0;
            if (row[7]) { const comm = parseInt(row[7].toString().replace(/\D/g, '')); if (!isNaN(comm)) commission = comm; }

            let type = 'BED'; let category = 'BODY';
            const prefix = code.charAt(0).toUpperCase();
            if (prefix === 'A') { type = 'BED'; category = 'COMBO'; }
            else if (prefix === 'F') { type = 'CHAIR'; category = 'FOOT'; }
            else if (prefix === 'B') { type = 'BED'; category = 'BODY'; }
            else if (prefix === 'C') {
                if (code.toUpperCase() === 'C1') {
                    type = 'BED';
                    category = 'BODY';
                } else if (code.toUpperCase() === 'C2') {
                    type = 'CHAIR';
                    category = 'FOOT';
                } else {
                    category = 'ADDON';
                }
            }

            newServices[code] = {
                name: name,
                duration: duration,
                type: type,
                category: category,
                price: price,
                elasticStep: elasticStep,
                elasticLimit: elasticLimit,
                blocks: blocks,
                commission: commission
            };
        });

        if (ResourceCore.setDynamicServices) {
            ResourceCore.setDynamicServices(newServices);
        }
        STATE.SERVICES = newServices;
    } catch (e) { console.error('[MENU ERROR]', e); }
}

async function syncBlacklist() {
    try {
        if (!BLACKLIST_SHEET_NAME) return;
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BLACKLIST_SHEET_NAME}!A2:B` });
        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            STATE.BLACKLIST = [];
            return;
        }
        const bl = [];
        rows.forEach(row => {
            const name = row[0] ? row[0].toString().trim() : '';
            const phone = row[1] ? row[1].toString().trim().replace(/\D/g, '') : '';
            if (phone) {
                bl.push({ name, phone });
            }
        });
        STATE.BLACKLIST = bl;
    } catch (e) { console.error('[BLACKLIST ERROR]', e); }
}

async function syncData() {
    if (STATE.isSyncing) { return; }

    try {
        STATE.isSyncing = true;
        await syncBlacklist();

        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET_NAME}!A:AE` });
        const rowsBooking = resBooking.data.values;
        let tempBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue;

                const status = row[7] || '已預約';
                if (STATUS_KEYWORDS.CANCELLED.some(k => status.includes(k)) || (STATUS_KEYWORDS.NOSHOW && STATUS_KEYWORDS.NOSHOW.some(k => status.includes(k)))) continue;
                const isRunning = checkIsRunning(status);
                const cleanDate = normalizeDateStrict(row[0]);
                if (!cleanDate) continue;

                const serviceStr = row[3] || '';
                let duration = 60; let type = 'BED'; let category = 'BODY'; let price = 0;
                let foundService = false;

                let serviceCode = row[20];
                if (!serviceCode || serviceCode === '') {
                    serviceCode = smartFindServiceCode(serviceStr) || '';
                }

                if (serviceCode && STATE.SERVICES[serviceCode]) {
                    const svcDef = STATE.SERVICES[serviceCode];
                    duration = svcDef.duration;
                    type = svcDef.type;
                    category = svcDef.category;
                    price = svcDef.price;
                    foundService = true;
                }

                if (!foundService) {
                    if (serviceStr.includes('套餐')) { category = 'COMBO'; duration = 100; }
                    else if (serviceStr.includes('足')) { type = 'CHAIR'; category = 'FOOT'; }
                }

                const isOilService = (row[4] === "Yes");
                if (isOilService) {
                    price += getConfig().FINANCE.OIL_BONUS;
                }

                let pax = 1; if (row[5]) pax = safeParseInt(row[5], 1);

                const requestedStaff = row[8] || '隨機';

                // serviceCode logic is now handled above.


                const rawTime = row[1] || "12:00";
                const hr = parseInt(rawTime.split(':')[0], 10);
                let computedOpDate = cleanDate; // Base is calendar date
                // [V134.1 NÂNG CẤP] Derive internal Operation Date
                if (!isNaN(hr) && hr < (getConfig().OPERATION_TIME.OPEN_HOUR || 6)) {
                    const tempD = new Date(cleanDate);
                    tempD.setDate(tempD.getDate() - 1);
                    computedOpDate = normalizeDateStrict(tempD);
                }

                tempBookings.push({
                    rowId: i + 1,
                    startTimeString: `${cleanDate} ${row[1]}`,
                    startTime: row[1],
                    duration: duration,
                    type: type, category: category,
                    price: price,
                    staffId: requestedStaff,
                    requestedStaff: requestedStaff,
                    staffName: requestedStaff,
                    serviceStaff: row[11],
                    staffId2: row[12],
                    staffId3: row[13],
                    staff1_blocks: safeParseInt(row[14], null),
                    staff2_blocks: safeParseInt(row[15], null),
                    isGuaSha: row[16] === "Yes",
                    adminNote: row[17] || "",
                    pax: pax,
                    customerName: `${row[2]} (${row[6]})`,
                    originalName: row[2],
                    serviceName: serviceStr, serviceCode: serviceCode,
                    phone: row[6], date: cleanDate, opDate: computedOpDate, status: status,
                    isRunning: isRunning, lineId: row[9],
                    isOil: isOilService,
                    phase1_duration: safeParseInt(row[24], null),
                    phase2_duration: safeParseInt(row[25], null),
                    isManualLocked: isTrueString(row[30]),
                    flow: row[26],
                    phase1_res_idx: row[27] || null,
                    phase2_res_idx: row[28] || null,
                    phase1_resource: row[27],
                    phase2_resource: row[28],
                    resource_type: row[29],
                    allocated_resource: null
                });
            }
        }

        const resSchedule = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${STAFF_SHEET_NAME}!A1:150`
        });

        const rows = resSchedule.data.values;
        let tempStaffList = [];
        let tempScheduleMap = {};
        let tempDateColumnMap = {};

        const today = getTaipeiNow();
        const pastThreshold = new Date(today);
        pastThreshold.setDate(today.getDate() - 30);

        if (rows && rows.length > 1) {
            const headerRow = rows[0];
            let dateColumns = [];

            // [V131 NÂNG CẤP]: Thuật toán quét Header linh hoạt bắt đầu từ cột index 6 (Cột G)
            for (let j = 6; j < headerRow.length; j++) {
                if (!headerRow[j]) continue;
                const normalizedDate = normalizeDateStrict(headerRow[j]);
                if (normalizedDate) {
                    tempDateColumnMap[normalizedDate] = j;
                    dateColumns.push({ index: j, date: normalizedDate });
                }
            }
            STATE.dateColumnMap = tempDateColumnMap;

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const staffName = row[0]; if (!staffName) continue;
                const cleanName = staffName.trim();
                const gender = (row[1] && (row[1] === '女' || row[1] === 'F')) ? 'F' : 'M';

                let startTime = row[2] ? row[2].trim().replace(/：/g, ':') : '12:00';
                let endTime = row[3] ? row[3].trim().replace(/：/g, ':') : '03:00';
                const onTimeVal = row[4] ? row[4].toString().trim().toUpperCase() : '';
                const isStrictTime = (onTimeVal === 'TRUE' || onTimeVal === 'YES' || onTimeVal === 'X');
                const lineId = row[5] ? row[5].trim() : null;

                const staffObj = {
                    id: cleanName, name: cleanName, gender: gender,
                    lineId: lineId,
                    start: startTime, end: endTime, shiftStart: startTime, shiftEnd: endTime,
                    isStrictTime: isStrictTime, sheetRowIndex: i + 1, off: false, offDays: []
                };

                const todayStr = normalizeDateStrict(today);

                // Dùng dateColumns đã quét được ở trên để đối chiếu dữ liệu nhân sự
                for (const col of dateColumns) {
                    const normalizedDate = col.date;
                    const j = col.index;

                    if (new Date(normalizedDate) < pastThreshold) continue;

                    const cellValue = row[j] ? row[j].trim().toUpperCase() : "";

                    if (cellValue === 'OFF' || cellValue === 'X') {
                        if (!tempScheduleMap[normalizedDate]) tempScheduleMap[normalizedDate] = [];
                        tempScheduleMap[normalizedDate].push(cleanName);
                        staffObj.offDays.push(normalizedDate);

                        if (normalizedDate === todayStr) { staffObj.off = true; }
                    }
                }
                tempStaffList.push(staffObj);
            }
        }

        // [V131 NÂNG CẤP]: Cơ chế bảo vệ Fallback Tuyệt Đối
        if (tempStaffList.length === 0) {
            console.warn("⚠️ [GRACEFUL DEGRADATION] Không đọc được nhân sự từ Sheet. Kích hoạt Danh sách ảo!");
            tempStaffList = generateVirtualStaffList();
        }

        STATE.STAFF_LIST = tempStaffList;
        STATE.scheduleMap = tempScheduleMap;
        STATE.isSystemHealthy = true; // Luôn luôn khỏe mạnh vì đã có dữ liệu Fallback

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
        STATE.consecutiveSyncErrors = 0;

    } catch (e) {
        console.error('[SYNC FATAL ERROR]', e);
        STATE.consecutiveSyncErrors++;

        // [V131 NÂNG CẤP]: Nếu API sập hẳn (mất kết nối hoàn toàn)
        if (STATE.STAFF_LIST.length === 0) {
            console.warn(`[HARD FALLBACK] Mất kết nối Google Sheets ở lần khởi tạo đầu tiên. Đang dùng dữ liệu ảo.`);
            STATE.STAFF_LIST = generateVirtualStaffList();
            STATE.isSystemHealthy = true; // Ép trạng thái an toàn
        } else {
            console.warn(`[GRACEFUL DEGRADATION] Google Sheets API lỗi lần ${STATE.consecutiveSyncErrors}. Tiếp tục dùng RAM Cache.`);
            // Không set isSystemHealthy = false nữa, giữ nguyên trạng thái cũ
        }
    } finally {
        STATE.isSyncing = false;
    }
}

// =============================================================================
// PHẦN 3: WRITE & UPDATE LOGIC
// =============================================================================

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

            if (isOil) svcName += getOilSuffixText();

            row[3] = svcName; row[4] = isOil ? "Yes" : ""; row[5] = 1;
            row[6] = colG_Phone; row[7] = colH_Status;

            let defaultRequestedStaff = isOil ? '女' : '隨機';
            if (guestDetail && guestDetail.staff) {
                row[8] = guestDetail.staff;
            } else {
                row[8] = data.nhanVien || defaultRequestedStaff;
            }

            row[9] = colJ_LineID; row[10] = colK_Created;

            if (guestDetail) {
                if (guestDetail.staffId2) row[12] = guestDetail.staffId2;
                if (guestDetail.staffId3) row[13] = guestDetail.staffId3;
            }

            let isGuaSha = data.isGuaSha;
            if (guestDetail && guestDetail.isGuaSha !== undefined) isGuaSha = guestDetail.isGuaSha;
            row[16] = isGuaSha ? "Yes" : "";

            let adminNoteVal = data.adminNote;
            if (guestDetail && guestDetail.adminNote !== undefined) adminNoteVal = guestDetail.adminNote;
            row[17] = adminNoteVal || "";

            row[18] = normalizeDateStrict(colA_Date);

            let sCode = data.serviceCode;
            if (guestDetail && guestDetail.serviceCode) sCode = guestDetail.serviceCode;
            if (!sCode && svcName) {
                const cleanSvcName = svcName.replace(/\s*\(油推.*?\)/, "");
                sCode = smartFindServiceCode(cleanSvcName);
            }
            row[20] = sCode || "";

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

            let r1 = null; let r2 = null; let rType = null;
            if (guestDetail) {
                r1 = guestDetail.phase1_res_idx || guestDetail.phase1Resource || guestDetail.phase1_resource;
                r2 = guestDetail.phase2_res_idx || guestDetail.phase2Resource || guestDetail.phase2_resource;
                rType = guestDetail.resource_type || guestDetail.resourceType;
            }
            if (!r1) r1 = data.phase1_res_idx || data.phase1Resource || data.phase1_resource;
            if (!r2) r2 = data.phase2_res_idx || data.phase2Resource || data.phase2_resource;
            if (!rType) rType = data.resource_type || data.resourceType;

            row[27] = r1 || "";
            row[28] = r2 || "";
            row[29] = rType ? String(rType).toUpperCase() : "";

            const hasManualPhase = (p1 !== null && p1 !== undefined && p1 !== "");
            const finalLockVal = resolveStrictLockState(data.isManualLocked, hasManualPhase, "FALSE");
            row[30] = finalLockVal;

            valuesToWrite.push(row);
        }

        if (valuesToWrite.length > 0) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET_NAME}!A:A`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite }
            });
        }

        triggerSyncDebounced();

        // [V1.5 NÂNG CẤP] Trả về true nếu toàn bộ quá trình ghi trên API thành công
        return true;

    } catch (e) {
        console.error('[WRITE ERROR]', e);
        // [V1.5 NÂNG CẤP] Trả về false nếu quá trình ghi thất bại
        return false;
    }
}

async function updateBookingStatus(rowId, newStatus) {
    try {
        if (!rowId) throw new Error("RowID required");
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET_NAME}!H${rowId}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [[newStatus]] }
        });
        triggerSyncDebounced();
        return true;
    } catch (e) { console.error('Update Status Error:', e); return false; }
}

function _checkOverlapConflict(rowId, dateStr, timeStr, duration, phase1Res, phase2Res, p1Dur, p2Dur, flow) {
    if (!phase1Res && !phase2Res) return null;
    
    const startMins = ResourceCore.getMinsFromTimeStr(timeStr);
    if (startMins === -1) return null;
    
    const durMins = safeParseInt(duration, 60);
    const p1 = safeParseInt(p1Dur, Math.floor(durMins / 2));
    const p2 = safeParseInt(p2Dur, durMins - p1);
    
    let blocks = [];
    if (flow === 'BF' || flow === 'FB') {
        if (phase1Res) blocks.push({ start: startMins, end: startMins + p1, res: phase1Res });
        if (phase2Res) blocks.push({ start: startMins + p1 + ResourceCore.CONFIG.TRANSITION_BUFFER, end: startMins + durMins, res: phase2Res });
    } else {
        const res = phase1Res || phase2Res;
        if (res) blocks.push({ start: startMins, end: startMins + durMins, res: res });
    }
    
    const bookingsOnDate = STATE.cachedBookings.filter(b => 
        normalizeDateStrict(b.opDate || b.startTimeString) === normalizeDateStrict(dateStr) 
        && b.rowId != rowId
    );
    
    for (const b of bookingsOnDate) {
        if (!b.status) continue;
        const statusLower = b.status.toLowerCase();
        const inactiveKeywords = ['cancel', 'hủy', 'huỷ', 'finish', 'done', 'xong', 'check-out', 'checkout', '取消', '完成', '空'];
        let isActive = true;
        for (const kw of inactiveKeywords) { if (statusLower.includes(kw)) { isActive = false; break; } }
        if (!isActive) continue;
        
        const bStartMins = ResourceCore.getMinsFromTimeStr(b.startTimeString || b.startTime);
        if (bStartMins === -1) continue;
        
        const bDurMins = safeParseInt(b.duration, 60);
        let bP1 = safeParseInt(b.phase1_duration, Math.floor(bDurMins / 2));
        let bP2 = safeParseInt(b.phase2_duration, bDurMins - bP1);
        let bFlow = b.flow || (b.originalData ? b.originalData.flow : null);
        
        let bBlocks = [];
        const isCombo = bFlow === 'BF' || bFlow === 'FB' || (b.allocated_resource && String(b.allocated_resource).includes('+'));
        
        if (isCombo) {
            let res1 = b.phase1_res_idx;
            let res2 = b.phase2_res_idx;
            
            if (!res1 || !res2) {
                const bResStr = b.allocated_resource || "";
                const matches = [...bResStr.toString().matchAll(/((?:BED|CHAIR)[-_ ]?\d+)/gi)].map(m => m[1].toUpperCase());
                if (bFlow === 'BF') {
                    if (!res1) res1 = matches.find(r => r.includes('BED')) || matches[0];
                    if (!res2) res2 = matches.find(r => r.includes('CHAIR')) || matches[1];
                } else if (bFlow === 'FB') {
                    if (!res1) res1 = matches.find(r => r.includes('CHAIR')) || matches[0];
                    if (!res2) res2 = matches.find(r => r.includes('BED')) || matches[1];
                } else {
                    if (!res1) res1 = matches[0];
                    if (!res2) res2 = matches[1];
                }
            }
            if (res1) bBlocks.push({ start: bStartMins, end: bStartMins + bP1, res: res1 });
            if (res2) bBlocks.push({ start: bStartMins + bP1 + ResourceCore.CONFIG.TRANSITION_BUFFER, end: bStartMins + bDurMins, res: res2 });
        } else {
            const bRes = b.phase1_res_idx || b.phase2_res_idx || b.allocated_resource;
            if (bRes) bBlocks.push({ start: bStartMins, end: bStartMins + bDurMins, res: bRes });
        }
        
        for (const blk of blocks) {
            if (!blk.res) continue;
            for (const bBlk of bBlocks) {
                if (bBlk.res) {
                    const bBlkResArray = [...bBlk.res.toString().toUpperCase().matchAll(/((?:BED|CHAIR)[-_ ]?\d+)/gi)].map(m => m[1]);
                    const blkResClean = blk.res.toString().toUpperCase().trim();
                    if (bBlkResArray.includes(blkResClean) || bBlk.res.toString().toUpperCase() === blkResClean) {
                        const safeEndA = blk.end - ResourceCore.CONFIG.TOLERANCE;
                        const safeEndB = bBlk.end - ResourceCore.CONFIG.TOLERANCE;
                        if ((blk.start < safeEndB) && (bBlk.start < safeEndA)) {
                            return { conflictId: b.rowId, conflictName: b.hoTen || b.customerName, resource: blk.res };
                        }
                    }
                }
            }
        }
    }
    return null;
}

async function updateBookingDetails(body) {
    const rowId = body.rowId;
    if (!rowId) throw new Error('Missing rowId');

    let bookingData = STATE.cachedBookings.find(b => b.rowId == rowId);
    let totalDuration = bookingData ? bookingData.duration : (safeParseInt(body.duration, 60));

    let phase1Res = body.phase1_res_idx !== undefined ? body.phase1_res_idx : (body.phase1_resource !== undefined ? body.phase1_resource : body.phase1Resource);
    if (phase1Res === undefined && (body.location !== undefined || body.current_resource_id !== undefined)) {
        phase1Res = body.location !== undefined ? body.location : body.current_resource_id;
    }
    const phase2Res = body.phase2_res_idx !== undefined ? body.phase2_res_idx : (body.phase2_resource !== undefined ? body.phase2_resource : body.phase2Resource);
    
    // [V135] GUARDRAIL: Check Resource Overlap before allowing manual override
    let checkDate = body.date || (bookingData ? (bookingData.opDate || bookingData.startTimeString) : null);
    let checkTime = body.startTime || (bookingData ? (bookingData.startTimeString || bookingData.startTime) : null);
    if (checkDate && checkTime && (phase1Res || phase2Res)) {
        let p1Dur = body.phase1_duration !== undefined ? body.phase1_duration : (bookingData ? bookingData.phase1_duration : null);
        let p2Dur = body.phase2_duration !== undefined ? body.phase2_duration : (bookingData ? bookingData.phase2_duration : null);
        let flow = body.flow || body.flow_code || (bookingData ? bookingData.flow : null);
        
        // If checking a combo but durations are missing, estimate them
        if (flow === 'BF' || flow === 'FB') {
            if (!p1Dur) p1Dur = Math.floor(totalDuration / 2);
            if (!p2Dur) p2Dur = totalDuration - p1Dur;
        }

        const conflict = _checkOverlapConflict(rowId, checkDate, checkTime, totalDuration, phase1Res, phase2Res, p1Dur, p2Dur, flow);
        if (conflict) {
            throw new Error(`RESOURCE_CONFLICT|${conflict.resource}|${conflict.conflictName}`);
        }
    }

    const updateCell = async (col, val) => {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET_NAME}!${col}${rowId}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [[val]] }
        });
    };

    let finalDate = body.date;
    if (!finalDate && body.startTimeString) {
        finalDate = body.startTimeString.split(' ')[0];
    }
    
    if (finalDate) {
        const formattedDate = normalizeDateStrict(finalDate);
        await updateCell('A', formattedDate); await updateCell('S', formattedDate);
    }
    
    let finalStartTime = body.startTime || body.gioDen;
    if (finalStartTime) {
        let timeVal = finalStartTime; if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);
        await updateCell('B', timeVal);
    }
    if (body.customerName) await updateCell('C', body.customerName);
    if (body.serviceName) await updateCell('D', body.serviceName);
    if (body.isOil !== undefined) await updateCell('E', body.isOil ? "Yes" : "");
    if (body.pax) await updateCell('F', body.pax);
    if (body.phone) await updateCell('G', body.phone);
    if (body.mainStatus) await updateCell('H', body.mainStatus);

    if (body.requestedStaff !== undefined) {
        await updateCell('I', body.requestedStaff);
    }

    const staff1 = body['服務師傅1'] || body.ServiceStaff1 || body.staff1 || body.serviceStaff || body.staffId;
    if (staff1 !== undefined && staff1 !== '隨機') {
        await updateCell('L', staff1);
    }

    const staff2 = body['服務師傅2'] || body.ServiceStaff2 || body.staff2 || body.staffId2;
    if (staff2 !== undefined) {
        await updateCell('M', staff2);
    }

    const staff3 = body['服務師傅3'] || body.ServiceStaff3 || body.staff3 || body.staffId3;
    if (staff3 !== undefined) {
        await updateCell('N', staff3);
    }

    if (body.staff1_blocks !== undefined) await updateCell('O', body.staff1_blocks);
    if (body.staff2_blocks !== undefined) await updateCell('P', body.staff2_blocks);

    if (body.isGuaSha !== undefined) {
        await updateCell('Q', body.isGuaSha ? "Yes" : "");
    }

    if (body.adminNote !== undefined) {
        await updateCell('R', body.adminNote);
    }

    const flowVal = body.flow || body.flow_code;
    if (flowVal !== undefined) await updateCell('AA', flowVal);

    if (phase1Res !== undefined) await updateCell('AB', phase1Res);
    if (phase2Res !== undefined) await updateCell('AC', phase2Res);

    const resourceType = body.resource_type !== undefined ? body.resource_type : body.resourceType;
    if (resourceType !== undefined) await updateCell('AD', resourceType ? String(resourceType).toUpperCase() : "");

    if (body.final_price !== undefined) await updateCell('V', body.final_price);

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

    // === [V136 OPTIMISTIC CACHE UPDATE] 防衝突機制 ===
    if (bookingData) {
        if (phase1Res !== undefined) bookingData.phase1_res_idx = phase1Res;
        if (phase2Res !== undefined) bookingData.phase2_res_idx = phase2Res;
        if (phase1Res || phase2Res) {
            bookingData.allocated_resource = phase1Res && phase2Res ? `${phase1Res}+${phase2Res}` : (phase1Res || "");
        }
        if (body.duration !== undefined) bookingData.duration = parseInt(body.duration);
        if (body.phase1_duration !== undefined) bookingData.phase1_duration = body.phase1_duration;
        if (body.phase2_duration !== undefined) bookingData.phase2_duration = body.phase2_duration;
        if (flowVal !== undefined) bookingData.flow = flowVal;
        if (resourceType !== undefined) bookingData.resource_type = resourceType;
        if (body.serviceName !== undefined) bookingData.serviceName = body.serviceName;
        
        if (body.phase1_duration !== undefined || body.phase2_duration !== undefined) {
            bookingData.duration = parseInt(bookingData.phase1_duration || 0) + parseInt(bookingData.phase2_duration || 0);
        }
    }
    // ===============================================

    if (body.forceSync) triggerSyncDebounced(100); else triggerSyncDebounced();
    return true;
}

async function updateInlineBooking(rowId, updatedData) {
    try {
        if (!rowId) throw new Error("RowID is required");

        const getRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${BOOKING_SHEET_NAME}!A${rowId}:AE${rowId}`
        });
        
        let row = (getRes.data.values && getRes.data.values[0]) ? [...getRes.data.values[0]] : [];
        while (row.length < 31) row.push("");

        const formattedDate = normalizeDateStrict(updatedData.ngayDen);
        let timeVal = updatedData.gioDen || "";
        if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);

        let sCode = smartFindServiceCode(updatedData.dichVu) || "";
        
        // [V135] GUARDRAIL: Check Resource Overlap for Inline Update
        let bookingData = STATE.cachedBookings.find(b => b.rowId == rowId);
        if (bookingData) {
            let checkDate = updatedData.ngayDen !== undefined ? formattedDate : (bookingData.opDate || bookingData.startTimeString);
            let checkTime = updatedData.gioDen !== undefined ? timeVal : (bookingData.startTimeString || bookingData.startTime);
            let totalDuration = updatedData.duration !== undefined ? updatedData.duration : bookingData.duration;
            let phase1Res = bookingData.phase1_res_idx || bookingData.allocated_resource;
            let phase2Res = bookingData.phase2_res_idx;
            
            // Nếu thay đổi dịch vụ, chỉ gỡ resource nếu Category thực sự thay đổi
            if (updatedData.dichVu !== undefined) {
                let newCategory = null;
                if (sCode && STATE.SERVICES[sCode]) {
                    newCategory = STATE.SERVICES[sCode].category;
                }
                
                let oldCategory = null;
                if (bookingData.serviceCode && STATE.SERVICES[bookingData.serviceCode]) {
                    oldCategory = STATE.SERVICES[bookingData.serviceCode].category;
                } else if (bookingData.category) {
                    oldCategory = bookingData.category;
                } else if (bookingData.flow) {
                    if (bookingData.flow === 'FOOTSINGLE') oldCategory = 'FOOT';
                    else if (bookingData.flow === 'BODYSINGLE') oldCategory = 'BODY';
                    else if (bookingData.flow === 'FB' || bookingData.flow === 'BF') oldCategory = 'COMBO';
                }

                // [NÂNG CẤP COMBO]: Nếu chuyển sang COMBO và đã có vị trí Phase 1 thì giữ nguyên
                if (newCategory === 'COMBO' && phase1Res) {
                    if (oldCategory !== newCategory) {
                        phase2Res = null; // Cần tìm thêm vị trí cho Phase 2
                    }
                } else if (oldCategory !== newCategory) {
                    phase1Res = null; phase2Res = null;
                }
            }

            if (checkDate && checkTime && (phase1Res || phase2Res)) {
                let p1Dur = updatedData.phase1_duration !== undefined ? updatedData.phase1_duration : bookingData.phase1_duration;
                let p2Dur = updatedData.phase2_duration !== undefined ? updatedData.phase2_duration : bookingData.phase2_duration;
                let flow = bookingData.flow;
                
                const conflict = _checkOverlapConflict(rowId, checkDate, checkTime, totalDuration, phase1Res, phase2Res, p1Dur, p2Dur, flow);
                if (conflict) {
                    throw new Error(`RESOURCE_CONFLICT|${conflict.resource}|${conflict.conflictName}`);
                }
            }
        }

        if (formattedDate) {
            row[0] = formattedDate;
            row[18] = formattedDate;
        }
        if (timeVal) {
            row[1] = timeVal;
        }
        if (updatedData.hoTen !== undefined) {
            row[2] = updatedData.hoTen;
        }
        if (updatedData.isOil !== undefined) {
            row[4] = updatedData.isOil ? "Yes" : "";
        }
        if (updatedData.pax !== undefined) {
            row[5] = updatedData.pax;
        }
        if (updatedData.sdt !== undefined) {
            row[6] = updatedData.sdt;
        }
        if (updatedData.trangThai !== undefined) {
            row[7] = updatedData.trangThai;
        }
        if (updatedData.nhanVien !== undefined) {
            row[8] = updatedData.nhanVien;
        }
        if (updatedData.isGuaSha !== undefined) {
            row[16] = updatedData.isGuaSha ? "Yes" : "";
        }
        if (updatedData.adminNote !== undefined) {
            row[17] = updatedData.adminNote;
        }

        if (updatedData.dichVu !== undefined) {
            let svcName = updatedData.dichVu;
            let isOil = updatedData.isOil !== undefined ? updatedData.isOil : (row[4] === "Yes");
            if (isOil && !svcName.includes("油推")) {
                svcName += getOilSuffixText();
            }
            row[3] = svcName;
            row[20] = sCode;
            
            if (sCode && STATE.SERVICES[sCode]) {
                const svcDef = STATE.SERVICES[sCode];
                let newFlow = 'BODYSINGLE';
                let newResType = 'BED';
                let duration = updatedData.duration || svcDef.duration || 60;
                let phase1_dur = duration;
                let phase2_dur = "";
                
                if (svcDef.category === 'COMBO') {
                    newFlow = 'FB';
                    newResType = 'COMBO';
                    if (updatedData.phase1_duration !== undefined) {
                        phase1_dur = updatedData.phase1_duration;
                        phase2_dur = updatedData.phase2_duration !== undefined ? updatedData.phase2_duration : duration - phase1_dur;
                    } else {
                        phase1_dur = Math.floor(duration / 2);
                        phase2_dur = duration - phase1_dur;
                    }
                } else if (svcDef.category === 'FOOT') {
                    newFlow = 'FOOTSINGLE';
                    newResType = 'CHAIR';
                }
                
                row[24] = phase1_dur;
                row[25] = phase2_dur;
                row[26] = newFlow;
                
                let oldCategory = null;
                if (bookingData && bookingData.serviceCode && STATE.SERVICES[bookingData.serviceCode]) {
                    oldCategory = STATE.SERVICES[bookingData.serviceCode].category;
                } else if (bookingData && bookingData.category) {
                    oldCategory = bookingData.category;
                } else if (bookingData && bookingData.flow) {
                    if (bookingData.flow === 'FOOTSINGLE') oldCategory = 'FOOT';
                    else if (bookingData.flow === 'BODYSINGLE') oldCategory = 'BODY';
                    else if (bookingData.flow === 'FB' || bookingData.flow === 'BF') oldCategory = 'COMBO';
                }

                if (oldCategory !== svcDef.category || bookingData.serviceCode !== sCode) {
                    let bestPhase1 = bookingData ? (bookingData.phase1_res_idx || bookingData.allocated_resource || "") : "";
                    let bestPhase2 = "";
                    let isComboUpgrade = (svcDef.category === 'COMBO');

                    if (isComboUpgrade && bestPhase1) {
                        // [NÂNG CẤP COMBO]: Đã có vị trí, chỉ tìm vị trí đối nghịch cho Phase 2
                        let isP1Chair = bestPhase1.toUpperCase().includes('CHAIR') || bestPhase1.includes('足');
                        let isP1Bed = bestPhase1.toUpperCase().includes('BED') || bestPhase1.includes('床');
                        
                        if (isP1Chair) {
                            newFlow = 'FB';
                            row[26] = newFlow;
                        } else if (isP1Bed) {
                            newFlow = 'BF';
                            row[26] = newFlow;
                            // Hoán đổi thời lượng vì Flow đổi
                            const temp = row[24]; row[24] = row[25]; row[25] = temp;
                            phase1_dur = row[24]; phase2_dur = row[25];
                        }

                        const opDate = updatedData.ngayDen !== undefined ? formattedDate : (bookingData.opDate || bookingData.startTimeString);
                        const opTime = updatedData.gioDen !== undefined ? timeVal : (bookingData.startTimeString || bookingData.startTime);
                        
                        // Tìm vị trí Phase 2
                        let targetResType = newFlow === 'FB' ? 'BED' : 'CHAIR';
                        const config = getConfig();
                        let maxCount = targetResType === 'BED' ? (config.SCALE.MAX_BEDS || 12) : (config.SCALE.MAX_CHAIRS || 12);
                        
                        let foundP2 = false;
                        for (let i = 1; i <= maxCount; i++) {
                            let testRes = `${targetResType}-${i}`;
                            const conflict = _checkOverlapConflict(rowId, opDate, opTime, duration, bestPhase1, testRes, phase1_dur, phase2_dur, newFlow);
                            if (!conflict) {
                                bestPhase2 = testRes;
                                foundP2 = true;
                                break;
                            }
                        }

                        if (!foundP2) {
                            throw new Error("⚠️ 更改失敗：該時段已無空床位/座位可供套餐使用。");
                        }
                    } else if (bookingData && typeof ResourceCore !== 'undefined' && ResourceCore.checkRequestAvailability) {
                        const opDate = updatedData.ngayDen !== undefined ? formattedDate : (bookingData.opDate || bookingData.startTimeString);
                        const opTime = updatedData.gioDen !== undefined ? timeVal : (bookingData.startTimeString || bookingData.startTime);
                        
                        const staffListMap = {}; 
                        STATE.STAFF_LIST.forEach(s => { staffListMap[s.id] = s; });
                        
                        const relevantBookings = STATE.cachedBookings.filter(b => 
                            normalizeDateStrict(b.opDate || b.startTimeString) === normalizeDateStrict(opDate) && b.rowId != rowId
                        );

                        // Lấy thời lượng thực tế của giao dịch thay vì để mặc định
                        let phase1_dur = updatedData.phase1_duration !== undefined ? updatedData.phase1_duration : bookingData.phase1_duration;
                        let phase2_dur = updatedData.phase2_duration !== undefined ? updatedData.phase2_duration : bookingData.phase2_duration;

                        const guestList = [{
                            serviceCode: sCode,
                            serviceName: updatedData.dichVu || (bookingData ? bookingData.serviceName : ''),
                            staff: updatedData.nhanVien || (bookingData ? bookingData.requestedStaff : '') || '隨機',
                            staffName: updatedData.nhanVien || (bookingData ? bookingData.requestedStaff : '') || '隨機',
                            flow: newFlow,
                            flowCode: newFlow, // Bắt buộc cho ResourceCore hiểu được
                            duration: duration,
                            phase1_duration: phase1_dur,
                            phase2_duration: phase2_dur
                        }];

                        try {
                            const checkResult = ResourceCore.checkRequestAvailability(normalizeDateStrict(opDate), opTime, guestList, relevantBookings, staffListMap);
                            if (checkResult.feasible && checkResult.details && checkResult.details.length > 0 && checkResult.details[0].phase1_res_idx) {
                                bestPhase1 = checkResult.details[0].phase1_res_idx || "";
                                bestPhase2 = checkResult.details[0].phase2_res_idx || "";
                                
                                // [V138 FIX] Cập nhật lại Flow và Đảo ngược thời lượng nếu ResourceCore quyết định thay đổi Flow
                                if (checkResult.details[0].flow) {
                                    const finalFlow = checkResult.details[0].flow;
                                    if (finalFlow !== newFlow && (finalFlow === 'BF' || finalFlow === 'FB')) {
                                        // Flow bị đảo ngược -> Hoán đổi thời gian của Phase 1 và Phase 2
                                        const temp = row[24];
                                        row[24] = row[25];
                                        row[25] = temp;
                                    }
                                    row[26] = finalFlow;
                                }
                                
                                console.log(`[STRICT AUTO-ALLOCATE] Inline Update found new resources for Row ${rowId}: ${bestPhase1}, ${bestPhase2}, Flow: ${row[26]}`);
                            } else {
                                // STRICT VALIDATION: Chặn lưu dữ liệu và ném ra lỗi nếu thuật toán thất bại (hết giường)
                                console.warn(`[STRICT AUTO-ALLOCATE FAILED] ${checkResult.reason}`);
                                throw new Error(checkResult.reason || "⚠️ 更改失敗：該時段已無連續空床位/座位。");
                            }
                        } catch (err) {
                            console.error("[AUTO-ALLOCATE ERROR]", err);
                            throw err; // Tiếp tục ném ra để API bắt được và báo về Frontend
                        }
                    }

                    row[27] = bestPhase1;
                    row[28] = bestPhase2;
                }
                row[29] = newResType;
            }
        } else {
            if (updatedData.duration !== undefined) {
                let currentFlow = row[26] || "";
                if (currentFlow === 'FB' || currentFlow === 'BF') {
                    let phase1_dur = updatedData.phase1_duration !== undefined ? updatedData.phase1_duration : Math.floor(updatedData.duration / 2);
                    let phase2_dur = updatedData.phase2_duration !== undefined ? updatedData.phase2_duration : updatedData.duration - phase1_dur;
                    row[24] = phase1_dur;
                    row[25] = phase2_dur;
                } else {
                    row[24] = updatedData.duration;
                    row[25] = "";
                }
            } else {
                if (updatedData.phase1_duration !== undefined) row[24] = updatedData.phase1_duration;
                if (updatedData.phase2_duration !== undefined) row[25] = updatedData.phase2_duration;
            }
        }

        // === [V136 OPTIMISTIC CACHE UPDATE] 防衝突機制 ===
        // Cập nhật bộ nhớ đệm ngay trước khi gọi API Google Sheet để request đồng thời không bị dính dữ liệu cũ
        if (bookingData) {
            if (row[27] !== undefined) bookingData.phase1_res_idx = row[27];
            if (row[28] !== undefined) bookingData.phase2_res_idx = row[28];
            if (row[27] || row[28]) {
                bookingData.allocated_resource = row[27] && row[28] ? `${row[27]}+${row[28]}` : (row[27] || "");
            }
            if (row[26]) bookingData.flow = row[26];
            if (row[24] !== undefined) bookingData.phase1_duration = row[24];
            if (row[25] !== undefined) bookingData.phase2_duration = row[25];
            bookingData.duration = parseInt(row[24] || 0) + parseInt(row[25] || 0);
            if (row[29]) bookingData.resource_type = row[29];
            if (sCode) bookingData.serviceCode = sCode;
            if (row[3]) bookingData.serviceName = row[3];
            
            let oldCategory = bookingData.category;
            if (!oldCategory && bookingData.serviceCode && STATE.SERVICES[bookingData.serviceCode]) {
                oldCategory = STATE.SERVICES[bookingData.serviceCode].category;
            }
            if (sCode && STATE.SERVICES[sCode]) {
                bookingData.category = STATE.SERVICES[sCode].category;
            } else if (bookingData.flow) {
                if (bookingData.flow === 'FOOTSINGLE') bookingData.category = 'FOOT';
                else if (bookingData.flow === 'BODYSINGLE') bookingData.category = 'BODY';
                else if (bookingData.flow === 'FB' || bookingData.flow === 'BF') bookingData.category = 'COMBO';
            }
        }
        // ===============================================

        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${BOOKING_SHEET_NAME}!A${rowId}:AE${rowId}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[...row]] }
        });
        
        console.log(`[INLINE UPDATE FULL ROW] Success for Row: ${rowId}`);

        triggerSyncDebounced();
        return true;
    } catch (e) {
        console.error('[INLINE UPDATE ERROR]', e);
        throw e;
    }
}

// =============================================================================
// PHẦN 3.5: BATCH UPDATE LOGIC (CHỐNG LỖI QUOTA)
// =============================================================================

let syncDataTimeoutStore = null;
function triggerSyncDebounced(delay = 700) {
    if (syncDataTimeoutStore) clearTimeout(syncDataTimeoutStore);
    syncDataTimeoutStore = setTimeout(() => {
        syncDataTimeoutStore = null;
        if (!STATE.isSyncing) syncData();
    }, delay);
}

async function batchUpdateMultipleBookings(updatesArray) {
    if (!updatesArray || updatesArray.length === 0) return true;
    try {
        const dataToUpdate = [];
        let hasForceSync = false;

        updatesArray.forEach(body => {
            const rowId = body.rowId;
            if (!rowId) return;
            if (body.forceSync) hasForceSync = true;

            if (body.date) {
                const formattedDate = normalizeDateStrict(body.date);
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!A${rowId}`, values: [[formattedDate]] });
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!S${rowId}`, values: [[formattedDate]] });
            }
            if (body.startTime) {
                let timeVal = String(body.startTime); if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!B${rowId}`, values: [[timeVal]] });
            }
            if (body.customerName !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!C${rowId}`, values: [[body.customerName]] });
            if (body.serviceName !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!D${rowId}`, values: [[body.serviceName]] });
            if (body.isOil !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!E${rowId}`, values: [[body.isOil ? "Yes" : ""]] });
            if (body.pax !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!F${rowId}`, values: [[body.pax]] });
            if (body.phone !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!G${rowId}`, values: [[body.phone]] });
            if (body.mainStatus !== undefined || body.status !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!H${rowId}`, values: [[body.mainStatus || body.status]] });
            
            if (body.requestedStaff !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!I${rowId}`, values: [[body.requestedStaff]] });
            
            const staff1 = body['服務師傅1'] || body.ServiceStaff1 || body.staff1 || body.serviceStaff || body.staffId;
            if (staff1 !== undefined && staff1 !== '隨機') dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!L${rowId}`, values: [[staff1]] });
            
            const staff2 = body['服務師傅2'] || body.ServiceStaff2 || body.staff2 || body.staffId2;
            if (staff2 !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!M${rowId}`, values: [[staff2]] });
            
            const staff3 = body['服務師傅3'] || body.ServiceStaff3 || body.staff3 || body.staffId3;
            if (staff3 !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!N${rowId}`, values: [[staff3]] });

            if (body.staff1_blocks !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!O${rowId}`, values: [[body.staff1_blocks]] });
            if (body.staff2_blocks !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!P${rowId}`, values: [[body.staff2_blocks]] });

            if (body.isGuaSha !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!Q${rowId}`, values: [[body.isGuaSha ? "Yes" : ""]] });
            if (body.adminNote !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!R${rowId}`, values: [[body.adminNote]] });

            const flowVal = body.flow || body.flow_code;
            if (flowVal !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AA${rowId}`, values: [[flowVal]] });

            let phase1Res = body.phase1_res_idx !== undefined ? body.phase1_res_idx : (body.phase1_resource !== undefined ? body.phase1_resource : body.phase1Resource);
            if (phase1Res === undefined && (body.location !== undefined || body.current_resource_id !== undefined)) {
                phase1Res = body.location !== undefined ? body.location : body.current_resource_id;
            }
            if (phase1Res !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AB${rowId}`, values: [[phase1Res]] });

            const phase2Res = body.phase2_res_idx !== undefined ? body.phase2_res_idx : (body.phase2_resource !== undefined ? body.phase2_resource : body.phase2Resource);
            if (phase2Res !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AC${rowId}`, values: [[phase2Res]] });

            const resourceType = body.resource_type !== undefined ? body.resource_type : body.resourceType;
            if (resourceType !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AD${rowId}`, values: [[resourceType ? String(resourceType).toUpperCase() : ""]] });

            if (body.final_price !== undefined) {
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!V${rowId}`, values: [[body.final_price]] });
                console.log(`[SHEET_UPDATE] Ghi giá tiền $${body.final_price} vào V${rowId}`);
            }

            let bookingData = STATE.cachedBookings.find(b => b.rowId == rowId);
            let totalDuration = bookingData ? bookingData.duration : (safeParseInt(body.duration, 60));
            let currentLockState = bookingData ? bookingData.isManualLocked : false;
            let hasManualPhaseChange = false;

            if (body.phase1_duration !== undefined && body.phase1_duration !== null) {
                const p1 = parseInt(body.phase1_duration); const p2 = totalDuration - p1;
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!Y${rowId}`, values: [[p1]] });
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!Z${rowId}`, values: [[p2]] });
                hasManualPhaseChange = true;
            } else if (body.phase2_duration !== undefined && body.phase2_duration !== null) {
                const p2 = parseInt(body.phase2_duration); const p1 = totalDuration - p2;
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!Y${rowId}`, values: [[p1]] });
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!Z${rowId}`, values: [[p2]] });
                hasManualPhaseChange = true;
            }

            const currentLockString = currentLockState ? "TRUE" : "FALSE";
            const finalLockString = resolveStrictLockState(body.isManualLocked, hasManualPhaseChange, currentLockString);

            if (finalLockString !== currentLockString || body.isManualLocked !== undefined || hasManualPhaseChange) {
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AE${rowId}`, values: [[finalLockString]] });
            }

            // === [V136 OPTIMISTIC CACHE UPDATE] 防衝突機制 ===
            if (bookingData) {
                if (phase1Res !== undefined) bookingData.phase1_res_idx = phase1Res;
                if (phase2Res !== undefined) bookingData.phase2_res_idx = phase2Res;
                if (phase1Res || phase2Res) {
                    bookingData.allocated_resource = phase1Res && phase2Res ? `${phase1Res}+${phase2Res}` : (phase1Res || "");
                }
                if (body.duration !== undefined) bookingData.duration = parseInt(body.duration);
                if (body.phase1_duration !== undefined) bookingData.phase1_duration = body.phase1_duration;
                if (body.phase2_duration !== undefined) bookingData.phase2_duration = body.phase2_duration;
                if (flowVal !== undefined) bookingData.flow = flowVal;
                if (resourceType !== undefined) bookingData.resource_type = resourceType;
                if (body.serviceName !== undefined) bookingData.serviceName = body.serviceName;
                
                if (body.phase1_duration !== undefined || body.phase2_duration !== undefined) {
                    bookingData.duration = parseInt(bookingData.phase1_duration || 0) + parseInt(bookingData.phase2_duration || 0);
                }
            }
            // ===============================================
        });

        if (dataToUpdate.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SHEET_ID,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: dataToUpdate
                }
            });
            console.log(`[BATCH UPDATE MULTIPLE] Success: ${dataToUpdate.length} updates for ${updatesArray.length} bookings.`);
        }

        if (hasForceSync) triggerSyncDebounced(100); else triggerSyncDebounced();
        return true;

    } catch (e) {
        console.error('[BATCH UPDATE MULTIPLE ERROR]', e);
        return false;
    }
}

// =============================================================================
// PHẦN 4: STAFF SCHEDULE & ACTIVITY METHODS
// =============================================================================

function findStaffByLineId(lineId) {
    if (!lineId || !STATE.STAFF_LIST) return null;
    return STATE.STAFF_LIST.find(s => s.lineId === lineId);
}

async function updateScheduleCell(lineId, dateStr, value) {
    try {
        const staff = findStaffByLineId(lineId);
        if (!staff) { return false; }

        const normalizedDate = normalizeDateStrict(dateStr);
        if (!normalizedDate) return false;

        const colIndex = STATE.dateColumnMap[normalizedDate];
        if (!colIndex) { return false; }

        const colLetter = getColumnLetter(colIndex);
        const range = `${STAFF_SHEET_NAME}!${colLetter}${staff.sheetRowIndex}`;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[value]] }
        });

        triggerSyncDebounced();
        return true;
    } catch (e) { console.error('[SCHED ERROR]', e); return false; }
}

async function updateDailyActivity(lineId, type, startVal, endVal) {
    try {
        const staff = findStaffByLineId(lineId);
        if (!staff) return false;

        let startCol = 'H'; let endCol = 'I';
        if (type === 'OUT') { startCol = 'J'; endCol = 'K'; }

        const row = staff.sheetRowIndex;

        if (startVal) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID, range: `${STAFF_SHEET_NAME}!${startCol}${row}`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: [[startVal]] }
            });
        }

        if (endVal) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID, range: `${STAFF_SHEET_NAME}!${endCol}${row}`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: [[endVal]] }
            });
        }

        triggerSyncDebounced();
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
            await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${STAFF_SHEET_NAME}!E${sheetRowIndex}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[valueToWrite]] } });
        }
        triggerSyncDebounced();
        return true;
    } catch (e) { console.error(e); throw e; }
}

async function layLichDatGanNhat(userId) {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET_NAME}!A:K` });
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
        const range = `${SALARY_LOG_SHEET_NAME}!A1:AZ100`;
        await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: range });
    } catch (e) { console.error('[SALARY ERROR]', e); }
}

async function getTodaySalary() {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `今天薪資!A3:D` });
        const rows = res.data.values;
        let salaryMap = {};
        if (rows && rows.length > 0) {
            rows.forEach(row => {
                const staffId = row[0];
                const salaryStr = row[3];
                if (staffId && salaryStr !== undefined) {
                    const cleanSalary = salaryStr.toString().replace(/[^0-9.-]+/g,"");
                    salaryMap[staffId.toString().trim()] = parseInt(cleanSalary) || 0;
                }
            });
        }
        return salaryMap;
    } catch (e) {
        console.error('[GET TODAY SALARY ERROR]', e);
        return {};
    }
}

// =============================================================================
// PHẦN 5: EXPORTS
// =============================================================================

module.exports = {
    init,
    getServices: () => STATE.SERVICES,
    getStaffList: () => STATE.STAFF_LIST,
    getBookings: () => STATE.cachedBookings,
    getScheduleMap: () => STATE.scheduleMap,
    getLastSyncTime: () => STATE.lastSyncTime,
    getIsSystemHealthy: () => STATE.isSystemHealthy,
    getMatrixDebug: () => STATE.LAST_CALCULATED_MATRIX,
    getQuickNotes: () => STATE.QUICK_NOTES,
    getBlacklist: () => STATE.BLACKLIST,
    getConsecutiveErrors: () => STATE.consecutiveSyncErrors,

    syncMenuData,
    syncData,
    syncQuickNotes,
    syncDailySalary,
    getTodaySalary,
    ghiVaoSheet,
    updateBookingStatus,
    updateBookingDetails,
    updateInlineBooking,
    batchUpdateMultipleBookings,
    updateStaffConfig,
    layLichDatGanNhat,

    findStaffByLineId,
    updateScheduleCell,
    updateDailyActivity,

    normalizeDateStrict,
    smartFindServiceCode,
    getTaipeiNow,
    formatDateTimeString
};
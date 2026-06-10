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

class AsyncLock {
    constructor() { this.promise = Promise.resolve(); }
    async acquire() {
        let release;
        const nextPromise = new Promise(resolve => { release = resolve; });
        const prevPromise = this.promise;
        this.promise = prevPromise.then(() => nextPromise);
        await prevPromise;
        return release;
    }
}
const bookingLock = new AsyncLock();

let BOOKING_SHEET_NAME, STAFF_SHEET_NAME, MENU_SHEET_NAME, STAFF_LIST_SHEET_NAME, SALARY_LOG_SHEET_NAME, BLACKLIST_SHEET_NAME;

let cachedConfig = null;
let lastConfigLoadTime = 0;
const CONFIG_CACHE_TTL = 10000; // 10 giây cache

function getConfig() {
    const now = Date.now();
    if (!cachedConfig || (now - lastConfigLoadTime > CONFIG_CACHE_TTL)) {
        try {
            delete require.cache[require.resolve('./cyx_data.js')];
            cachedConfig = require('./cyx_data.js').SYSTEM_CONFIG;
            lastConfigLoadTime = now;
            if (cachedConfig && cachedConfig.SHEET_NAMES) {
                BOOKING_SHEET_NAME = cachedConfig.SHEET_NAMES.BOOKING_SHEET_NAME;
                STAFF_SHEET_NAME = cachedConfig.SHEET_NAMES.STAFF_SHEET_NAME;
                MENU_SHEET_NAME = cachedConfig.SHEET_NAMES.MENU_SHEET_NAME;
                STAFF_LIST_SHEET_NAME = cachedConfig.SHEET_NAMES.STAFF_LIST_SHEET_NAME;
                SALARY_LOG_SHEET_NAME = cachedConfig.SHEET_NAMES.SALARY_LOG_SHEET_NAME;
                BLACKLIST_SHEET_NAME = cachedConfig.SHEET_NAMES.BLACKLIST_SHEET_NAME;
            }
        } catch (e) {
            console.error('[getConfig] Error loading cyx_data.js in sheet service, using cached config:', e);
            if (!cachedConfig) {
                cachedConfig = require('./cyx_data.js').SYSTEM_CONFIG;
            }
        }
    }
    return cachedConfig;
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

            let minFoot = null, maxFoot = null, minBody = null, maxBody = null;
            if (row[8]) { const val = parseInt(row[8].toString().replace(/\D/g, '')); if (!isNaN(val)) minFoot = val; }
            if (row[9]) { const val = parseInt(row[9].toString().replace(/\D/g, '')); if (!isNaN(val)) maxFoot = val; }
            if (row[10]) { const val = parseInt(row[10].toString().replace(/\D/g, '')); if (!isNaN(val)) minBody = val; }
            if (row[11]) { const val = parseInt(row[11].toString().replace(/\D/g, '')); if (!isNaN(val)) maxBody = val; }

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
                minFoot: minFoot,
                maxFoot: maxFoot,
                minBody: minBody,
                maxBody: maxBody,
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

        const resBooking = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET_NAME}!A:AX` });
        const rowsBooking = resBooking.data.values;
        let tempBookings = [];

        if (rowsBooking && rowsBooking.length > 0) {
            for (let i = 1; i < rowsBooking.length; i++) {
                const row = rowsBooking[i];
                if (!row[0] || !row[1]) continue;

                const status = row[9] || '已預約';
                if (STATUS_KEYWORDS.CANCELLED.some(k => status.includes(k)) || (STATUS_KEYWORDS.NOSHOW && STATUS_KEYWORDS.NOSHOW.some(k => status.includes(k)))) continue;
                const isRunning = checkIsRunning(status);
                const cleanDate = normalizeDateStrict(row[0]);
                if (!cleanDate) continue;

                const serviceStr = row[4] || '';
                let duration = 60; let type = 'BED'; let category = 'BODY'; let price = 0;
                let foundService = false;

                let serviceCode = row[24];
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

                const isYouTui = (row[5] === "Yes");
                const isGuaSha = (row[6] === "Yes");
                const isHuaGuan = (row[7] === "Yes");
                const isBaGuan = (row[8] === "Yes");
                if (isYouTui) {
                    if (serviceCode === 'B1') price += 100;
                    else price += 200;
                }

                let pax = 1;

                const requestedStaff = row[10] || '隨機';

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
                    serviceStaff: row[12],
                    staffId2: row[13],
                    staffId3: row[14],
                    staff1_blocks: safeParseInt(row[15], null),
                    staff2_blocks: safeParseInt(row[16], null),
                    isYouTui: isYouTui,
                    isGuaSha: isGuaSha,
                    isHuaGuan: isHuaGuan,
                    isBaGuan: isBaGuan,
                    adminNote: row[11] || "",
                    pax: pax,
                    customerName: `${row[2]} (${row[3]})`,
                    originalName: row[2],
                    serviceName: serviceStr, serviceCode: serviceCode,
                    phone: row[3], date: cleanDate, opDate: computedOpDate, status: status,
                    isRunning: isRunning, lineId: row[23],
                    checkinTime: row[26],
                    phase1_duration: safeParseInt(row[28], null),
                    transition_time: row[29],
                    phase2_duration: safeParseInt(row[30], null),
                    finish_time: row[31],
                    isManualLocked: isTrueString(row[35]),
                    flow_code_locked: isTrueString(row[36]),
                    phase1_locked: isTrueString(row[37]),
                    phase2_locked: isTrueString(row[38]),
                    flow: row[25],
                    phase1_res_idx: row[32],
                    phase2_res_idx: row[33],
                    phase1_resource: row[32],
                    phase2_resource: row[33],
                    resource_type: row[34],
                    location: row[39] || '本館',
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
            let nationalityColIndex = -1;

            // Quét tìm cột 國籍
            for (let j = 0; j < headerRow.length; j++) {
                if (headerRow[j] && headerRow[j].toString().trim() === '國籍') {
                    nationalityColIndex = j;
                    break;
                }
            }

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
                const isYouTui = row[5] ? row[5].toString().trim().toUpperCase() !== '' : false;
                const isGuaSha = row[6] ? row[6].toString().trim().toUpperCase() !== '' : false;
                const isHuaGuan = row[7] ? row[7].toString().trim().toUpperCase() !== '' : false;
                const isBaGuan = row[8] ? row[8].toString().trim().toUpperCase() !== '' : false;
                const lineId = row[9] ? row[9].trim() : null;
                const nationality = nationalityColIndex !== -1 && row[nationalityColIndex] ? row[nationalityColIndex].toString().trim() : '台灣';

                const staffObj = {
                    id: cleanName, name: cleanName, gender: gender,
                    lineId: lineId, nationality: nationality,
                    isYouTui: isYouTui, isGuaSha: isGuaSha, isHuaGuan: isHuaGuan, isBaGuan: isBaGuan,
                    start: startTime, end: endTime, shiftStart: startTime, shiftEnd: endTime,
                    isStrictTime: isStrictTime, sheetRowIndex: i + 1, off: false, offDays: [],
                    customShifts: {}
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
                    } else if (cellValue !== '') {
                        // [V136] Xử lý giờ tùy chỉnh (Custom shifts: đến trễ, đổi ca 09:00-16:00)
                        const times = cellValue.match(/\d{1,2}[:：]\d{2}/g);
                        if (times && times.length > 0) {
                            const cStart = times[0].replace('：', ':');
                            const cEnd = times.length > 1 ? times[1].replace('：', ':') : staffObj.end;
                            staffObj.customShifts[normalizedDate] = { start: cStart, end: cEnd };
                            
                            if (normalizedDate === todayStr) {
                                staffObj.start = cStart;
                                staffObj.end = cEnd;
                            }
                        }
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
            const row = new Array(40).fill("");
            let guestDetail = (data.guestDetails && data.guestDetails[i]) ? data.guestDetails[i] : null;

            const guestNum = i + 1; const total = loopCount;
            row[0] = colA_Date; row[1] = colB_Time;
            row[2] = `${data.hoTen || '現場客'} (${guestNum}/${total})`;

            let svcName = data.dichVu;
            if (guestDetail) svcName = guestDetail.service;
            let isYouTui = data.isYouTui;
            let isGuaSha = data.isGuaSha;
            let isHuaGuan = data.isHuaGuan;
            let isBaGuan = data.isBaGuan;
            if (guestDetail) {
                if (guestDetail.isYouTui !== undefined) isYouTui = guestDetail.isYouTui;
                if (guestDetail.isGuaSha !== undefined) isGuaSha = guestDetail.isGuaSha;
                if (guestDetail.isHuaGuan !== undefined) isHuaGuan = guestDetail.isHuaGuan;
                if (guestDetail.isBaGuan !== undefined) isBaGuan = guestDetail.isBaGuan;
            }

            row[3] = colG_Phone; row[4] = svcName;
            row[5] = isYouTui ? "Yes" : "";
            row[6] = isGuaSha ? "Yes" : "";
            row[7] = isHuaGuan ? "Yes" : "";
            row[8] = isBaGuan ? "Yes" : "";
            row[9] = colH_Status;

            let defaultRequestedStaff = isYouTui ? '女' : '隨機';
            if (guestDetail && guestDetail.staff) {
                row[10] = guestDetail.staff;
            } else {
                row[10] = data.nhanVien || defaultRequestedStaff;
            }

            row[23] = colJ_LineID; row[22] = colK_Created;

            if (guestDetail) {
                if (guestDetail.staffId) row[12] = guestDetail.staffId;
                if (guestDetail.staffId2) row[13] = guestDetail.staffId2;
                if (guestDetail.staffId3) row[14] = guestDetail.staffId3;
                if (guestDetail.staff1_blocks !== undefined) row[15] = guestDetail.staff1_blocks;
                if (guestDetail.staff2_blocks !== undefined) row[16] = guestDetail.staff2_blocks;
            }
            if (data.final_price !== undefined) {
                row[18] = data.final_price;
            } else if (guestDetail && guestDetail.final_price !== undefined) {
                row[18] = guestDetail.final_price;
            }

            let adminNoteVal = data.adminNote;
            if (guestDetail && guestDetail.adminNote) {
                adminNoteVal = guestDetail.adminNote;
            } row[11] = adminNoteVal || "";

            let sCode = data.serviceCode;
            if (guestDetail && guestDetail.serviceCode) sCode = guestDetail.serviceCode;
            if (!sCode && svcName) {
                const cleanSvcName = svcName.replace(/\s*\(油推.*?\)/, "");
                sCode = smartFindServiceCode(cleanSvcName);
            }
            row[24] = sCode || "";

            let flowVal = null;
            if (guestDetail) flowVal = guestDetail.flow || guestDetail.flowCode;
            if (!flowVal) flowVal = data.flow || data.flowCode;
            if (!flowVal && sCode && STATE.SERVICES[sCode]) {
                const svcDef = STATE.SERVICES[sCode];
                if (svcDef.category === 'FOOT') flowVal = "FOOTSINGLE";
                else if (svcDef.category === 'BODY') flowVal = "BODYSINGLE";
                else if (svcDef.category === 'COMBO') flowVal = "FB";
            }
            row[25] = flowVal || "FB";

            let p1 = null; let p2 = null;
            if (guestDetail) {
                p1 = (guestDetail.phase1_duration !== undefined) ? guestDetail.phase1_duration : guestDetail.phase1;
                p2 = (guestDetail.phase2_duration !== undefined) ? guestDetail.phase2_duration : guestDetail.phase2;
            }
            if (p1 === null || p1 === undefined) p1 = data.phase1_duration;
            if (p2 === null || p2 === undefined) p2 = data.phase2_duration;
            
            let currentDuration = data.duration;
            if (!currentDuration && sCode && STATE.SERVICES[sCode]) {
                currentDuration = STATE.SERVICES[sCode].duration;
            }

            if ((p1 === null || p1 === undefined || p1 === "") && ["BODYSINGLE", "FOOTSINGLE", "SINGLE"].includes(row[25])) {
                p1 = currentDuration;
            }

            row[28] = (p1 !== null && p1 !== "") ? p1 : "";
            row[30] = (p2 !== null && p2 !== "") ? p2 : "";
            
            row[27] = colB_Time;
            const startMins = typeof ResourceCore !== 'undefined' ? ResourceCore.getMinsFromTimeStr(colB_Time) : -1;
            if (startMins !== -1) {
                const p1Dur = parseInt(row[28]) || 0;
                const p2Dur = parseInt(row[30]) || 0;
                const isCombo = (row[25] === 'FB' || row[25] === 'BF');
                const transitionBuffer = isCombo ? (typeof ResourceCore !== 'undefined' && ResourceCore.CONFIG ? ResourceCore.CONFIG.TRANSITION_BUFFER : 3) : 0;
                
                if (isCombo) {
                    row[29] = typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + transitionBuffer) : "";
                } else {
                    row[29] = "";
                }
                row[31] = typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + p2Dur + transitionBuffer) : "";
            }

            let r1 = null; let r2 = null; let rType = null;
            if (guestDetail) {
                r1 = guestDetail.phase1_res_idx || guestDetail.phase1Resource || guestDetail.phase1_resource;
                r2 = guestDetail.phase2_res_idx || guestDetail.phase2Resource || guestDetail.phase2_resource;
                rType = guestDetail.resource_type || guestDetail.resourceType;
            }
            if (!r1) r1 = data.phase1_res_idx || data.phase1Resource || data.phase1_resource;
            if (!r2) r2 = data.phase2_res_idx || data.phase2Resource || data.phase2_resource;
            if (!rType) rType = data.resource_type || data.resourceType;

            row[32] = r1 ? String(r1).toUpperCase() : "";
            row[33] = r2 ? String(r2).toUpperCase() : "";
            row[34] = rType ? String(rType).toUpperCase() : "";

            const hasManualPhase = (data.phase1_duration !== undefined && data.phase1_duration !== null) || (data.phase2_duration !== undefined && data.phase2_duration !== null);
            const finalLockVal = resolveStrictLockState(data.isManualLocked, hasManualPhase, "FALSE");
            row[35] = finalLockVal;
            row[36] = data.flow_code_locked ? "TRUE" : "FALSE";
            row[37] = data.phase1_locked ? "TRUE" : "FALSE";
            row[38] = data.phase2_locked ? "TRUE" : "FALSE";

            let locVal = data.location;
            if (guestDetail && guestDetail.location) locVal = guestDetail.location;
            row[39] = locVal || "本館";

            valuesToWrite.push(row);
        }

        if (valuesToWrite.length > 0) {
            // [OPTIMISTIC CACHE UPDATE]
            valuesToWrite.forEach(r => {
                STATE.cachedBookings.push({
                    rowId: 'OPT_' + Date.now() + '_' + Math.floor(Math.random()*1000),
                    opDate: r[0],
                    startTimeString: r[1],
                    customerName: r[2],
                    status: r[9],
                    flow: r[25],
                    phase1_duration: r[28],
                    phase2_duration: r[30],
                    duration: (parseInt(r[28]) || 0) + (parseInt(r[30]) || 0),
                    phase1_res_idx: r[32],
                    phase2_res_idx: r[33]
                });
            });

            await sheets.spreadsheets.values.append({
                spreadsheetId: SHEET_ID, range: `${BOOKING_SHEET_NAME}!A:A`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: valuesToWrite }
            });
        }

        if (proposedUpdates && proposedUpdates.length > 0) {
            await batchUpdateMultipleBookings(proposedUpdates);
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
        const p1Cleanup = Math.min(ResourceCore.CONFIG.CLEANUP_BUFFER, ResourceCore.CONFIG.TRANSITION_BUFFER);
        if (phase1Res) blocks.push({ start: startMins, end: startMins + p1 + p1Cleanup, res: phase1Res });
        if (phase2Res) blocks.push({ start: startMins + p1 + ResourceCore.CONFIG.TRANSITION_BUFFER, end: startMins + durMins + ResourceCore.CONFIG.CLEANUP_BUFFER, res: phase2Res });
    } else {
        const res = phase1Res || phase2Res;
        if (res) blocks.push({ start: startMins, end: startMins + durMins + ResourceCore.CONFIG.CLEANUP_BUFFER, res: res });
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
            const p1Cleanup = Math.min(ResourceCore.CONFIG.CLEANUP_BUFFER, ResourceCore.CONFIG.TRANSITION_BUFFER);
            if (res1) bBlocks.push({ start: bStartMins, end: bStartMins + bP1 + p1Cleanup, res: res1 });
            if (res2) bBlocks.push({ start: bStartMins + bP1 + ResourceCore.CONFIG.TRANSITION_BUFFER, end: bStartMins + bDurMins + ResourceCore.CONFIG.CLEANUP_BUFFER, res: res2 });
        } else {
            const bRes = b.phase1_res_idx || b.phase2_res_idx || b.allocated_resource;
            if (bRes) bBlocks.push({ start: bStartMins, end: bStartMins + bDurMins + ResourceCore.CONFIG.CLEANUP_BUFFER, res: bRes });
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
    if (phase1Res !== undefined && phase1Res !== null) phase1Res = String(phase1Res).toUpperCase();
    
    // Chỉ fallback cho các dịch vụ ĐƠN LẺ (Single), KHÔNG được fallback cho dịch vụ COMBO
    const isCombo = bookingData ? (bookingData.category === 'COMBO' || (bookingData.serviceName && bookingData.serviceName.includes('套餐'))) : false;
    if (!isCombo && phase1Res === undefined && (body.location !== undefined || body.current_resource_id !== undefined)) {
        phase1Res = body.location !== undefined ? body.location : body.current_resource_id;
        if (phase1Res !== undefined && phase1Res !== null) phase1Res = String(phase1Res).toUpperCase();
    }
    let phase2Res = body.phase2_res_idx !== undefined ? body.phase2_res_idx : (body.phase2_resource !== undefined ? body.phase2_resource : body.phase2Resource);
    if (phase2Res !== undefined && phase2Res !== null) phase2Res = String(phase2Res).toUpperCase();
    
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

    const dataToUpdate = [];
    const updateCell = (col, val) => {
        dataToUpdate.push({
            range: `${BOOKING_SHEET_NAME}!${col}${rowId}`,
            values: [[val]]
        });
    };

    let finalDate = body.date;
    if (!finalDate && body.startTimeString) {
        finalDate = body.startTimeString.split(' ')[0];
    }
    
    if (finalDate) {
        const formattedDate = normalizeDateStrict(finalDate);
        updateCell('A', formattedDate);
        // Bỏ gán ngày vào cột S để bảo vệ dữ liệu "轉帳"
    }
    
    let finalStartTime = body.startTime || body.gioDen;
    if (finalStartTime) {
        let timeVal = finalStartTime; if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);
        updateCell('B', timeVal);
    }
    if (body.customerName) updateCell('C', body.customerName);
    if (body.serviceName) updateCell('D', body.serviceName);
    if (body.isOil !== undefined) updateCell('E', body.isOil ? "Yes" : "");
    if (body.pax) updateCell('F', body.pax);
    if (body.phone) updateCell('G', body.phone);
    if (body.mainStatus) updateCell('H', body.mainStatus);

    if (body.requestedStaff !== undefined) {
        updateCell('I', body.requestedStaff);
    }

    const staff1 = body['服務師傅1'] || body.ServiceStaff1 || body.staff1 || body.serviceStaff || body.staffId;
    if (staff1 !== undefined && staff1 !== '隨機') {
        updateCell('K', staff1);
    }

    const staff2 = body['服務師傅2'] || body.ServiceStaff2 || body.staff2 || body.staffId2;
    if (staff2 !== undefined) {
        updateCell('L', staff2);
    }

    const staff3 = body['服務師傅3'] || body.ServiceStaff3 || body.staff3 || body.staffId3;
    if (staff3 !== undefined) {
        updateCell('M', staff3);
    }

    if (body.staff1_blocks !== undefined) updateCell('N', body.staff1_blocks);
    if (body.staff2_blocks !== undefined) updateCell('O', body.staff2_blocks);

    if (body.isGuaSha !== undefined) {
        // Chuyển isGuaSha ra khỏi Q để không đè Giá Tiền
        updateCell('AW', body.isGuaSha ? "Yes" : "");
    }

    if (body.adminNote !== undefined) {
        // Chuyển adminNote ra khỏi R để không đè Tiền Mặt
        updateCell('AX', body.adminNote);
    }

    const flowVal = body.flow || body.flow_code;
    if (flowVal !== undefined) updateCell('Z', flowVal);

    if (phase1Res !== undefined) updateCell('AG', phase1Res);
    if (phase2Res !== undefined) updateCell('AH', phase2Res);

    const resourceType = body.resource_type !== undefined ? body.resource_type : body.resourceType;
    if (resourceType !== undefined) updateCell('AI', resourceType ? String(resourceType).toUpperCase() : "");

    if (body.final_price !== undefined) updateCell('Q', body.final_price);

    let currentLockState = bookingData ? bookingData.isManualLocked : false;
    let hasManualPhaseChange = false;

    if (body.phase1_duration !== undefined && body.phase1_duration !== null) {
        const p1 = parseInt(body.phase1_duration); const p2 = totalDuration - p1;
        updateCell('AC', p1); updateCell('AE', p2); hasManualPhaseChange = true;
    } else if (body.phase2_duration !== undefined && body.phase2_duration !== null) {
        const p2 = parseInt(body.phase2_duration); const p1 = totalDuration - p2;
        updateCell('AC', p1); updateCell('AE', p2); hasManualPhaseChange = true;
    }

    const currentLockString = currentLockState ? "TRUE" : "FALSE";
    const finalLockString = resolveStrictLockState(body.isManualLocked, hasManualPhaseChange, currentLockString);

    if (finalLockString !== currentLockString || body.isManualLocked !== undefined || hasManualPhaseChange) {
        updateCell('AJ', finalLockString);
    }
    
    if (body.flow_code_locked !== undefined) updateCell('AK', body.flow_code_locked ? "TRUE" : "FALSE");
    if (body.phase1_locked !== undefined) updateCell('AL', body.phase1_locked ? "TRUE" : "FALSE");
    if (body.phase2_locked !== undefined) updateCell('AM', body.phase2_locked ? "TRUE" : "FALSE");
    
    if (body.location !== undefined) updateCell('AN', body.location);
    
    // --- V1.6 NÂNG CẤP: Tự động tính toán lại Z, AB (transition), AD (finish) ---
    let newStartVal = finalStartTime || (bookingData ? (bookingData.startTimeString || bookingData.startTime) : null);
    if (newStartVal) {
        let timeVal = newStartVal; if (timeVal.includes(' ')) timeVal = timeVal.split(' ')[1];
        if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);
        updateCell('AB', timeVal); // start_time_str
        
        const startMins = typeof ResourceCore !== 'undefined' ? ResourceCore.getMinsFromTimeStr(timeVal) : -1;
        if (startMins !== -1) {
            let p1Dur = body.phase1_duration !== undefined ? parseInt(body.phase1_duration) : (bookingData ? parseInt(bookingData.phase1_duration) : 0);
            let p2Dur = body.phase2_duration !== undefined ? parseInt(body.phase2_duration) : (bookingData ? parseInt(bookingData.phase2_duration) : 0);
            if (isNaN(p1Dur)) p1Dur = 0; if (isNaN(p2Dur)) p2Dur = 0;
            
            let finalFlow = flowVal !== undefined ? flowVal : (bookingData ? bookingData.flow : "FB");
            const isComboCalc = (finalFlow === 'FB' || finalFlow === 'BF');
            const transitionBuffer = isComboCalc ? (typeof ResourceCore !== 'undefined' && ResourceCore.CONFIG ? ResourceCore.CONFIG.TRANSITION_BUFFER : 3) : 0;
            
            if (isComboCalc) {
                updateCell('AD', typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + transitionBuffer) : "");
            } else {
                updateCell('AD', "");
            }
            updateCell('AF', typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + p2Dur + transitionBuffer) : "");
        }
    }

    if (dataToUpdate.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: dataToUpdate
            }
        });
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
        
        if (body.flow_code_locked !== undefined) bookingData.flow_code_locked = body.flow_code_locked;
        if (body.phase1_locked !== undefined) bookingData.phase1_locked = body.phase1_locked;
        if (body.phase2_locked !== undefined) bookingData.phase2_locked = body.phase2_locked;
        if (body.location !== undefined) bookingData.location = body.location;
        
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
            range: `${BOOKING_SHEET_NAME}!A${rowId}:AX${rowId}`
        });
        
        let row = (getRes.data.values && getRes.data.values[0]) ? [...getRes.data.values[0]] : [];
        while (row.length < 50) row.push("");

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
        }
        if (timeVal) {
            row[1] = timeVal;
        }
        if (updatedData.hoTen !== undefined) {
            row[2] = updatedData.hoTen;
        }
        if (updatedData.sdt !== undefined) {
            row[3] = updatedData.sdt;
        }
        
        let isYouTui = updatedData.isYouTui !== undefined ? updatedData.isYouTui : (row[5] === "Yes");
        row[5] = isYouTui ? "Yes" : "";
        
        if (updatedData.isGuaSha !== undefined) row[6] = updatedData.isGuaSha ? "Yes" : "";
        if (updatedData.isHuaGuan !== undefined) row[7] = updatedData.isHuaGuan ? "Yes" : "";
        if (updatedData.isBaGuan !== undefined) row[8] = updatedData.isBaGuan ? "Yes" : "";
        
        if (updatedData.trangThai !== undefined) {
            row[9] = updatedData.trangThai;
        }
        if (updatedData.nhanVien !== undefined) {
            row[10] = updatedData.nhanVien;
        }
        if (updatedData.adminNote !== undefined) {
            row[11] = updatedData.adminNote;
        }

        if (updatedData.dichVu !== undefined) {
            let svcName = updatedData.dichVu;
            let isYouTui = updatedData.isYouTui !== undefined ? updatedData.isYouTui : (row[5] === "Yes");
            if (isYouTui && !svcName.includes("油推")) {
                svcName += getOilSuffixText();
            }
            row[4] = svcName;
            row[24] = sCode;
            
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
                
                row[28] = phase1_dur;
                row[30] = phase2_dur;
                row[25] = newFlow;
                
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
                            row[25] = newFlow;
                        } else if (isP1Bed) {
                            newFlow = 'BF';
                            row[25] = newFlow;
                            // Hoán đổi thời lượng vì Flow đổi
                            const temp = row[28]; row[28] = row[30]; row[30] = temp;
                            phase1_dur = row[28]; phase2_dur = row[30];
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
                            const targetLocation = updatedData.location !== undefined ? updatedData.location : (bookingData ? (bookingData.location || '本館') : '本館');
                            const checkResult = ResourceCore.checkRequestAvailability(normalizeDateStrict(opDate), opTime, guestList, relevantBookings, staffListMap, { location: targetLocation });
                            if (checkResult.feasible && checkResult.details && checkResult.details.length > 0 && checkResult.details[0].phase1_res_idx) {
                                bestPhase1 = checkResult.details[0].phase1_res_idx || "";
                                bestPhase2 = checkResult.details[0].phase2_res_idx || "";
                                
                                // [V138 FIX] Cập nhật lại Flow và Đảo ngược thời lượng nếu ResourceCore quyết định thay đổi Flow
                                if (checkResult.details[0].flow) {
                                    const finalFlow = checkResult.details[0].flow;
                                    if (finalFlow !== newFlow && (finalFlow === 'BF' || finalFlow === 'FB')) {
                                        // Flow bị đảo ngược -> Hoán đổi thời gian của Phase 1 và Phase 2
                                        const temp = row[28];
                                        row[28] = row[30];
                                        row[30] = temp;
                                    }
                                    row[25] = finalFlow;
                                }
                                
                                console.log(`[STRICT AUTO-ALLOCATE] Inline Update found new resources for Row ${rowId}: ${bestPhase1}, ${bestPhase2}, Flow: ${row[25]}`);
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

                    row[32] = bestPhase1 ? String(bestPhase1).toUpperCase() : "";
                    row[33] = bestPhase2 ? String(bestPhase2).toUpperCase() : "";
                }
                row[35] = newResType;
            }
        } else {
            if (updatedData.duration !== undefined) {
                let currentFlow = row[25] || "";
                if (currentFlow === 'FB' || currentFlow === 'BF') {
                    let phase1_dur = updatedData.phase1_duration !== undefined ? updatedData.phase1_duration : Math.floor(updatedData.duration / 2);
                    let phase2_dur = updatedData.phase2_duration !== undefined ? updatedData.phase2_duration : updatedData.duration - phase1_dur;
                    row[28] = phase1_dur;
                    row[30] = phase2_dur;
                } else {
                    row[28] = updatedData.duration;
                    row[30] = "";
                }
            } else {
                if (updatedData.phase1_duration !== undefined) row[28] = updatedData.phase1_duration;
                if (updatedData.phase2_duration !== undefined) row[30] = updatedData.phase2_duration;
            }
        }
        
        if (updatedData.location !== undefined) {
            row[39] = updatedData.location;
        }
        
        // --- V1.6 NÂNG CẤP: Tính toán các cột Z, AB (transition), AD (finish) ---
        let colB_Time = row[1];
        if (colB_Time) {
            let timeVal = colB_Time; if (timeVal.includes(' ')) timeVal = timeVal.split(' ')[1];
            if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);
            row[27] = timeVal; // Z: start_time_str
            
            const startMins = typeof ResourceCore !== 'undefined' ? ResourceCore.getMinsFromTimeStr(timeVal) : -1;
            if (startMins !== -1) {
                let p1Dur = parseInt(row[28]) || 0;
                let p2Dur = parseInt(row[30]) || 0;
                
                let finalFlow = row[25] || "FB";
                const isCombo = (finalFlow === 'FB' || finalFlow === 'BF');
                const transitionBuffer = isCombo ? (typeof ResourceCore !== 'undefined' && ResourceCore.CONFIG ? ResourceCore.CONFIG.TRANSITION_BUFFER : 3) : 0;
                
                if (isCombo) {
                    row[29] = typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + transitionBuffer) : ""; // AB
                } else {
                    row[29] = "";
                }
                row[31] = typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + p2Dur + transitionBuffer) : ""; // AD
            }
        }

        // === [V136 OPTIMISTIC CACHE UPDATE] 防衝突機制 ===
        // Cập nhật bộ nhớ đệm ngay trước khi gọi API Google Sheet để request đồng thời không bị dính dữ liệu cũ
        if (bookingData) {
            if (row[32] !== undefined) bookingData.phase1_res_idx = row[32];
            if (row[33] !== undefined) bookingData.phase2_res_idx = row[33];
            if (row[32] || row[33]) {
                bookingData.allocated_resource = row[32] && row[33] ? `${row[32]}+${row[33]}` : (row[32] || "");
            }
            if (row[25]) bookingData.flow = row[25];
            if (row[28] !== undefined) bookingData.phase1_duration = row[28];
            if (row[30] !== undefined) bookingData.phase2_duration = row[30];
            bookingData.duration = parseInt(row[28] || 0) + parseInt(row[30] || 0);
            if (row[34]) bookingData.resource_type = row[34];
            if (sCode) bookingData.serviceCode = sCode;
            if (row[3]) bookingData.serviceName = row[3];
            if (row[39]) bookingData.location = row[39];
            
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
            range: `${BOOKING_SHEET_NAME}!A${rowId}:AX${rowId}`,
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
            if (staff1 !== undefined && staff1 !== '隨機') dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!K${rowId}`, values: [[staff1]] });
            
            const staff2 = body['服務師傅2'] || body.ServiceStaff2 || body.staff2 || body.staffId2;
            if (staff2 !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!L${rowId}`, values: [[staff2]] });
            
            const staff3 = body['服務師傅3'] || body.ServiceStaff3 || body.staff3 || body.staffId3;
            if (staff3 !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!M${rowId}`, values: [[staff3]] });

            if (body.staff1_blocks !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!N${rowId}`, values: [[body.staff1_blocks]] });
            if (body.staff2_blocks !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!O${rowId}`, values: [[body.staff2_blocks]] });

            if (body.isGuaSha !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AW${rowId}`, values: [[body.isGuaSha ? "Yes" : ""]] });
            if (body.adminNote !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AX${rowId}`, values: [[body.adminNote]] });

            const flowVal = body.flow || body.flow_code;
            if (flowVal !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!Z${rowId}`, values: [[flowVal]] });

            let phase1Res = body.phase1_res_idx !== undefined ? body.phase1_res_idx : (body.phase1_resource !== undefined ? body.phase1_resource : body.phase1Resource);
            if (body.newPhase1Res !== undefined) phase1Res = body.newPhase1Res;
            
            // Chỉ fallback cho các dịch vụ ĐƠN LẺ (Single), KHÔNG được fallback cho dịch vụ COMBO
            let bookingData = STATE.cachedBookings.find(b => b.rowId == rowId);
            const isCombo = bookingData ? (bookingData.category === 'COMBO' || (bookingData.serviceName && bookingData.serviceName.includes('套餐'))) : false;
            if (!isCombo && phase1Res === undefined && (body.location !== undefined || body.current_resource_id !== undefined)) {
                phase1Res = body.location !== undefined ? body.location : body.current_resource_id;
            }
            if (phase1Res !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AG${rowId}`, values: [[phase1Res]] });

            let phase2Res = body.phase2_res_idx !== undefined ? body.phase2_res_idx : (body.phase2_resource !== undefined ? body.phase2_resource : body.phase2Resource);
            if (body.newPhase2Res !== undefined) phase2Res = body.newPhase2Res;
            if (phase2Res !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AH${rowId}`, values: [[phase2Res]] });

            const resourceType = body.resource_type !== undefined ? body.resource_type : body.resourceType;
            if (resourceType !== undefined) dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AI${rowId}`, values: [[resourceType ? String(resourceType).toUpperCase() : ""]] });

            if (body.final_price !== undefined) {
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!Q${rowId}`, values: [[body.final_price]] });
            }

            let totalDuration = bookingData ? bookingData.duration : (safeParseInt(body.duration, 60));
            let currentLockState = bookingData ? bookingData.isManualLocked : false;
            let hasManualPhaseChange = false;

            if (body.phase1_duration !== undefined && body.phase1_duration !== null) {
                const p1 = parseInt(body.phase1_duration); const p2 = totalDuration - p1;
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AC${rowId}`, values: [[p1]] });
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AE${rowId}`, values: [[p2]] });
                hasManualPhaseChange = true;
            } else if (body.phase2_duration !== undefined && body.phase2_duration !== null) {
                const p2 = parseInt(body.phase2_duration); const p1 = totalDuration - p2;
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AC${rowId}`, values: [[p1]] });
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AE${rowId}`, values: [[p2]] });
                hasManualPhaseChange = true;
            }

            const currentLockString = currentLockState ? "TRUE" : "FALSE";
            const finalLockString = resolveStrictLockState(body.isManualLocked, hasManualPhaseChange, currentLockString);

            if (finalLockString !== currentLockString || body.isManualLocked !== undefined || hasManualPhaseChange) {
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AJ${rowId}`, values: [[finalLockString]] });
            }

            // --- V1.6 NÂNG CẤP: Tính toán Z, AC, AE ---
            let newStartVal = body.startTime || body.gioDen || (bookingData ? (bookingData.startTimeString || bookingData.startTime) : null);
            if (newStartVal) {
                let timeVal = newStartVal; if (timeVal.includes(' ')) timeVal = timeVal.split(' ')[1];
                if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);
                dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AB${rowId}`, values: [[timeVal]] });
                
                const startMins = typeof ResourceCore !== 'undefined' ? ResourceCore.getMinsFromTimeStr(timeVal) : -1;
                if (startMins !== -1) {
                    let p1Dur = body.phase1_duration !== undefined ? parseInt(body.phase1_duration) : (bookingData ? parseInt(bookingData.phase1_duration) : 0);
                    let p2Dur = body.phase2_duration !== undefined ? parseInt(body.phase2_duration) : (bookingData ? parseInt(bookingData.phase2_duration) : 0);
                    if (isNaN(p1Dur)) p1Dur = 0; if (isNaN(p2Dur)) p2Dur = 0;
                    
                    let finalFlow = flowVal !== undefined ? flowVal : (bookingData ? bookingData.flow : "FB");
                    const isComboCalc = (finalFlow === 'FB' || finalFlow === 'BF');
                    const transitionBuffer = isComboCalc ? (typeof ResourceCore !== 'undefined' && ResourceCore.CONFIG ? ResourceCore.CONFIG.TRANSITION_BUFFER : 3) : 0;
                    
                    if (isComboCalc) {
                        dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AD${rowId}`, values: [[typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + transitionBuffer) : ""]] });
                    } else {
                        dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AD${rowId}`, values: [[""]] });
                    }
                    dataToUpdate.push({ range: `${BOOKING_SHEET_NAME}!AF${rowId}`, values: [[typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + p2Dur + transitionBuffer) : ""]] });
                }
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
            if (row[11] === userId) {
                const status = row[9] || '';
                if (!status.includes('取消') && !status.includes('Cancelled')) {
                    return { rowId: i + 1, thoiGian: `${row[0]} ${row[1]}`, dichVu: row[3], nhanVien: row[10], thongTinKhach: `${row[2]} (${row[6]})`, chiTiet: row };
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
// =============================================================================
// PHẦN 5: EXPORTS
// =============================================================================

async function updateCheckinTimeBatch(rowIds, timeStr) {
    try {
        if (!rowIds || rowIds.length === 0) return false;
        const updatePromises = rowIds.map(rowId => 
            sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID, 
                range: `${BOOKING_SHEET_NAME}!Y${rowId}`,
                valueInputOption: 'USER_ENTERED', 
                requestBody: { values: [[timeStr]] }
            })
        );
        await Promise.all(updatePromises);
        triggerSyncDebounced();
        return true;
    } catch (e) { console.error('Update Checkin Time Error:', e); return false; }
}

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
    updateCheckinTimeBatch,
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
    getTaipeiNow,
    formatDateTimeString,
    bookingLock,
    _checkOverlapConflict
};
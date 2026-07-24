const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock dependencies
global.SHEET_ID = 'mock_sheet_id';
global.BOOKING_SHEET_NAME = 'Booking';

let batchUpdateCalled = false;
let batchUpdateArgs = null;
let triggerSyncDebouncedCalled = false;

global.sheets = {
    spreadsheets: {
        values: {
            batchUpdate: async (args) => {
                batchUpdateCalled = true;
                batchUpdateArgs = args;
                return { data: {} };
            }
        }
    }
};

global.triggerSyncDebounced = () => {
    triggerSyncDebouncedCalled = true;
};

// Define STATUS_KEYWORDS to make checkIsRunning work
global.STATUS_KEYWORDS = {
    RUNNING: ['Running', '服務中', 'Serving', '🟡'],
    CANCELLED: ['取消', 'Cancelled', 'Cancel', '❌'],
    NOSHOW: ['爽約', 'Noshow', 'No Show'],
    WAITING: ['Waiting', 'chờ', 'waiting'],
    DONE: ['Done', 'hoàn thành', 'Completed', '✅'],
    PAID: ['結帳', '已結帳'],
    STANDBY: ['候補', 'Standby', 'standby']
};

global.checkIsRunning = function(statusString) {
    if (!statusString) return false;
    const normalized = statusString.toString();
    return global.STATUS_KEYWORDS.RUNNING.some(keyword => normalized.includes(keyword));
};

global.normalizeResourceId = (id) => id;
global._checkOverlapConflict = () => null;
global.safeParseInt = (val, fb) => { const p = parseInt(val, 10); return isNaN(p) ? fb : p; };
global.guessIsBed = () => true;
global.resolveStrictLockState = () => "TRUE";
global.normalizeDateStrict = (d) => d;

global.ResourceCore = {
    getMinsFromTimeStr: (timeStr) => {
        if (!timeStr) return -1;
        const parts = timeStr.split(':');
        if (parts.length < 2) return -1;
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    },
    getTimeStrFromMins: (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
    CONFIG: { TRANSITION_BUFFER: 0 }
};

// Mock STATE
global.STATE = {
    cachedBookings: [
        {
            rowId: '10',
            originalName: 'Nguyễn Văn A',
            phone: '0912345678',
            status: '🟡服務中', // Đang làm
            isRunning: true,
            flow: 'FB',
            duration: 100,
            startTimeString: '2023/10/25 10:20',
            startTime_sheet: '10:20',
            checkinTime: '10:20',
            phase1_duration: 50,
            phase2_duration: 50
        },
        {
            rowId: '11',
            originalName: 'Nguyễn Văn B',
            phone: '0912345678',
            status: '已預約', // Chưa đến
            isRunning: false,
            flow: 'FB',
            duration: 100,
            startTimeString: '2023/10/25 10:20',
            startTime_sheet: '10:20',
            checkinTime: '',
            phase1_duration: 50,
            phase2_duration: 50
        }
    ]
};

const code = fs.readFileSync(path.join(__dirname, 'cyx_sheet_service.js'), 'utf8');
const start = code.indexOf('async function updateBookingDetails(body) {');
let end = code.indexOf('async function updateInlineBooking(rowId, updatedData) {');
let funcCode = code.substring(start, end).trim();

// Execute the function in the global scope
eval(funcCode);

async function runTest() {
    console.log("Running E2E Test: updateBookingDetails with 'isRunning' logic...");
    
    // Test 1: Khách đang làm, điều chỉnh phase1/phase2 và thời gian
    batchUpdateCalled = false;
    await updateBookingDetails({
        rowId: '10',
        startTime: '10:30', // Cố tình đổi giờ sang 10:30, nhưng khách đang làm (10:20)
        phaseStartTime: '10:30',
        phase1_duration: 70,
        phase2_duration: 30,
        flow: 'FB'
    });
    
    assert(batchUpdateCalled === true, "batchUpdate should be called");
    
    const data1 = batchUpdateArgs.requestBody.data;
    console.log("Updates sent to sheets for Test 1 (Running):");
    const updatedCells1 = data1.map(d => `${d.range} -> ${d.values[0][0]}`);
    console.log(updatedCells1);

    // B và AB không được phép bị ghi đè
    const hasBUpdate = data1.some(d => d.range === 'Booking!B10');
    const hasABUpdate = data1.some(d => d.range === 'Booking!AB10');
    assert(hasBUpdate === false, "Test Failed: Cột B không được update khi đang làm!");
    assert(hasABUpdate === false, "Test Failed: Cột AB không được update khi đang làm!");
    
    // AD (transition) phải được tính theo startTime_sheet (10:20) + 70p = 11:30
    const adUpdate = data1.find(d => d.range === 'Booking!AD10');
    assert(adUpdate && adUpdate.values[0][0] === '11:30', `Test Failed: Transition time sai, expected 11:30 got ${adUpdate ? adUpdate.values[0][0] : 'null'}`);
    
    // AF (finish) phải được tính theo startTime_sheet (10:20) + 100p = 12:00
    const afUpdate = data1.find(d => d.range === 'Booking!AF10');
    assert(afUpdate && afUpdate.values[0][0] === '12:00', `Test Failed: Finish time sai, expected 12:00 got ${afUpdate ? afUpdate.values[0][0] : 'null'}`);

    console.log("✅ Test 1 Passed: Khách đang làm KHÔNG BỊ GHI ĐÈ cột B và AB, các cột AD, AF tính toán đúng.");

    // Test 2: Khách CHƯA LÀM, điều chỉnh thời gian
    batchUpdateCalled = false;
    await updateBookingDetails({
        rowId: '11',
        startTime: '10:45', // Đổi giờ sang 10:45, khách chưa đến
        phaseStartTime: '10:45',
        phase1_duration: 70,
        phase2_duration: 30,
        flow: 'FB'
    });
    
    const data2 = batchUpdateArgs.requestBody.data;
    console.log("\nUpdates sent to sheets for Test 2 (Not Running):");
    console.log(data2.map(d => `${d.range} -> ${d.values[0][0]}`));

    const hasBUpdate2 = data2.some(d => d.range === 'Booking!B11');
    const hasABUpdate2 = data2.some(d => d.range === 'Booking!AB11');
    assert(hasBUpdate2 === true, "Test Failed: Cột B PHẢI được update khi CHƯA LÀM!");
    assert(hasABUpdate2 === true, "Test Failed: Cột AB PHẢI được update khi CHƯA LÀM!");
    
    // AD (transition) phải được tính theo startTime mới (10:45) + 70p = 11:55
    const adUpdate2 = data2.find(d => d.range === 'Booking!AD11');
    assert(adUpdate2 && adUpdate2.values[0][0] === '11:55', `Test Failed: Transition time sai, expected 11:55 got ${adUpdate2 ? adUpdate2.values[0][0] : 'null'}`);

    console.log("✅ Test 2 Passed: Khách chưa làm BỊ GHI ĐÈ cột B và AB bình thường, các cột AD, AF tính toán theo giờ mới.");
    console.log("🎉 All Tests Passed Successfully!");
}

runTest().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});

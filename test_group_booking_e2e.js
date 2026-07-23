const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock dependencies
global.SHEET_ID = 'mock_sheet_id';
global.BOOKING_SHEET_NAME = 'Booking';
global.APP_STATUS = {
    SERVING: '🟡服務中'
};

let batchUpdateCalled = false;
let batchUpdateArgs = null;

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

global.STATE = {
    cachedBookings: [
        { rowId: '50', pax: 2, phase1_res_idx: '' }
    ]
};

global.guessIsBed = (resIdx) => {
    if (!resIdx) return false;
    const str = String(resIdx).toUpperCase();
    return str.includes('BED') || str.includes('B');
};

global.normalizeResourceId = (resIdx) => {
    if (!resIdx || resIdx === '隨機' || resIdx === 'null' || resIdx === 'undefined') return '';
    return String(resIdx).trim().toUpperCase();
};

global.resolveStrictLockState = () => '';
global.getTaipeiTimeStr = () => '10:00';
global.triggerSyncDebounced = () => {};

// Load the function
const cyxSheetService = fs.readFileSync(path.join(__dirname, 'cyx_sheet_service.js'), 'utf8');
const funcMatch = cyxSheetService.match(/async function batchUpdateMultipleBookings[\s\S]*?catch\s*\([^\)]+\)\s*\{[^\}]+\}\s*\}/);

if (!funcMatch) {
    console.error("Could not find batchUpdateMultipleBookings function in cyx_sheet_service.js");
    process.exit(1);
}

// Evaluate it into the current scope
eval(funcMatch[0]);

async function runTest() {
    console.log("=========================================");
    console.log("Running E2E Test: batchUpdateMultipleBookings");
    console.log("Testing Group Booking Location Merging...");
    console.log("=========================================\n");
    
    // Simulate frontend payloads for pax = 2
    const payloads = [
        {
            rowId: '50',
            phase1_res_idx: 'CHAIR-1',
            status: '🟡服務中',
            staff1: 'EmpA'
        },
        {
            rowId: '50',
            phase1_res_idx: 'CHAIR-2',
            status: '🟡服務中',
            staff2: 'EmpB'
        }
    ];
    
    batchUpdateCalled = false;
    await batchUpdateMultipleBookings(payloads);
    
    assert(batchUpdateCalled === true, "batchUpdate should be called");
    
    const data = batchUpdateArgs.requestBody.data;
    console.log("Updates sent to sheets:");
    console.log(JSON.stringify(data, null, 2));

    // Verify Staff 1 is updated (M50)
    const m50 = data.find(d => d.range === 'Booking!M50');
    assert(m50 && m50.values[0][0] === 'EmpA', "Staff 1 should be EmpA");

    // Verify Staff 2 is updated (N50)
    const n50 = data.find(d => d.range === 'Booking!N50');
    assert(n50 && n50.values[0][0] === 'EmpB', "Staff 2 should be EmpB");

    // Verify Status is updated (J50)
    const j50 = data.find(d => d.range === 'Booking!J50');
    assert(j50 && j50.values[0][0] === '🟡服務中', "Status should be updated");

    // Verify Phase 1 Resource is CONCATENATED, NOT overwritten (AG50)
    const ag50 = data.find(d => d.range === 'Booking!AG50');
    assert(ag50, "Phase 1 Resource (AG) should be present");
    assert(ag50.values[0][0] === 'CHAIR-1, CHAIR-2', "Phase 1 Resource must be merged as 'CHAIR-1, CHAIR-2', got: " + ag50.values[0][0]);
    
    console.log("\n✅ Test Passed: Group members were correctly merged into a single cell (CHAIR-1, CHAIR-2) without overwriting each other!");
}

runTest().catch(err => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});

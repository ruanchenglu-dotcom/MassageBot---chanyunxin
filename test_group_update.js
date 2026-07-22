const assert = require('assert');

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

// Mock STATE
global.STATE = {
    cachedBookings: [
        {
            rowId: '10',
            originalName: '方小姐 (1/2)',
            phone: '0912345678',
            opDate: '2023-10-25',
            booking_time: '10:20'
        },
        {
            rowId: '11',
            originalName: '方小姐 (2/2)',
            phone: '0912345678',
            opDate: '2023-10-25',
            booking_time: '10:20'
        },
        {
            rowId: '12',
            originalName: 'Other (1/2)',
            phone: '0987654321',
            opDate: '2023-10-25',
            booking_time: '10:20'
        }
    ]
};

// Load the function (we'll extract just the function for testing)
const fs = require('fs');
const path = require('path');
const cyxSheetService = fs.readFileSync(path.join(__dirname, 'cyx_sheet_service.js'), 'utf8');

// Extract the updateBookingStatus function string
const funcMatch = cyxSheetService.match(/async function updateBookingStatus[\s\S]*?catch\s*\([^\)]+\)\s*\{[^\}]+\}\s*\}/);
if (!funcMatch) {
    console.error("Could not find updateBookingStatus function in cyx_sheet_service.js");
    process.exit(1);
}

// Evaluate it into the current scope
eval(funcMatch[0]);

async function runTest() {
    console.log("Running E2E Test: updateBookingStatus with group logic...");
    
    // Test 1: Start Phase 1 for rowId '10', should update '10' and '11'
    batchUpdateCalled = false;
    const result = await updateBookingStatus('10', '🟡服務中', '10:25', false);
    
    assert(result === true, "Function should return true");
    assert(batchUpdateCalled === true, "batchUpdate should be called");
    
    const data = batchUpdateArgs.requestBody.data;
    console.log("Updates sent to sheets:");
    console.log(JSON.stringify(data, null, 2));

    assert(data.length === 4, "Should update J and AB for 2 rows (4 updates total)");
    
    // Check if both J10 and J11 were updated to 🟡服務中
    const j10 = data.find(d => d.range === 'Booking!J10');
    const j11 = data.find(d => d.range === 'Booking!J11');
    assert(j10 && j10.values[0][0] === '🟡服務中', "J10 should be updated");
    assert(j11 && j11.values[0][0] === '🟡服務中', "J11 should be updated");

    // Check if AB10 and AB11 were updated to 10:25
    const ab10 = data.find(d => d.range === 'Booking!AB10');
    const ab11 = data.find(d => d.range === 'Booking!AB11');
    assert(ab10 && ab10.values[0][0] === '10:25', "AB10 should be updated");
    assert(ab11 && ab11.values[0][0] === '10:25', "AB11 should be updated");

    console.log("✅ Test 1 Passed: Phase 1 Start correctly synced group members");

    // Test 2: Start Phase 2 for rowId '11', should update '10' and '11' transition time (AD)
    batchUpdateCalled = false;
    const result2 = await updateBookingStatus('11', '🟡服務中', '11:55', true);
    
    const data2 = batchUpdateArgs.requestBody.data;
    assert(data2.length === 4, "Should update J and AD for 2 rows (4 updates total)");
    
    const ad10 = data2.find(d => d.range === 'Booking!AD10');
    assert(ad10 && ad10.values[0][0] === '11:55', "AD10 should be updated to 11:55");

    console.log("✅ Test 2 Passed: Phase 2 Start correctly synced transition time for group members");
    
    console.log("🎉 All Tests Passed Successfully!");
}

runTest().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});

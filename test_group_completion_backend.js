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
        }
    ]
};

// Load the function (we'll extract just the function for testing)
const fs = require('fs');
const path = require('path');
const cyxSheetService = fs.readFileSync(path.join(__dirname, 'cyx_sheet_service.js'), 'utf8');

const startIndex = cyxSheetService.indexOf('async function updateBookingStatus');
const endIndex = cyxSheetService.indexOf('\nfunction _checkOverlapConflict');
if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find updateBookingStatus function boundaries in cyx_sheet_service.js");
    process.exit(1);
}
const funcString = cyxSheetService.substring(startIndex, endIndex);

// Evaluate it into the current scope
eval(funcString);

async function runTest() {
    console.log("Running Backend Test: updateBookingStatus with applyGroup logic...");
    
    // Test 1: Complete Phase for rowId '10' WITH applyGroup: false
    // Should update ONLY '10'
    batchUpdateCalled = false;
    const result = await updateBookingStatus('10', '✅已完成', null, false, false); // rowId, newStatus, newStartTime, isTransition, applyGroup
    
    assert(result === true, "Function should return true");
    assert(batchUpdateCalled === true, "batchUpdate should be called");
    
    const data = batchUpdateArgs.requestBody.data;
    console.log("Updates sent to sheets (applyGroup = false):");
    console.log(JSON.stringify(data, null, 2));

    assert(data.length === 1, "Should update J for ONLY 1 row (1 update total)");
    
    // Check if ONLY J10 was updated to ✅已完成
    const j10 = data.find(d => d.range === 'Booking!J10');
    const j11 = data.find(d => d.range === 'Booking!J11');
    assert(j10 && j10.values[0][0] === '✅已完成', "J10 should be updated");
    assert(!j11, "J11 should NOT be updated");

    console.log("✅ Test 1 Passed: applyGroup=false correctly isolates the update to only this customer.");

    // Test 2: Complete Phase for rowId '11' WITH applyGroup: true
    // Should update BOTH '10' and '11'
    batchUpdateCalled = false;
    const result2 = await updateBookingStatus('11', '✅已完成', null, false, true); 
    
    const data2 = batchUpdateArgs.requestBody.data;
    console.log("Updates sent to sheets (applyGroup = true):");
    console.log(JSON.stringify(data2, null, 2));

    assert(data2.length === 2, "Should update J for 2 rows (2 updates total)");
    
    const j10_2 = data2.find(d => d.range === 'Booking!J10');
    const j11_2 = data2.find(d => d.range === 'Booking!J11');
    assert(j10_2 && j10_2.values[0][0] === '✅已完成', "J10 should be updated to ✅已完成");
    assert(j11_2 && j11_2.values[0][0] === '✅已完成', "J11 should be updated to ✅已完成");

    console.log("✅ Test 2 Passed: applyGroup=true correctly syncs group members.");
    
    console.log("🎉 All Tests Passed Successfully!");
}

runTest().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});

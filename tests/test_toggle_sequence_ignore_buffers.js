const SheetService = require('../cyx_sheet_service.js');
const ResourceCore = require('../cyx_resource_core.js');

// Mock ResourceCore CONFIG
ResourceCore.CONFIG = {
    TRANSITION_BUFFER: 5,
    TOLERANCE: 1
};

// Mock data: A booking that exists at 12:00 on CHAIR-1-1 (葉小姐)
SheetService.STATE.cachedBookings = [
    {
        rowId: "1", // The booking we are updating: 杜 1/1
        flow: "FB", 
        phase1_res_idx: "CHAIR-1-3",
        phase2_res_idx: "BED-1-2",
        phase1_duration: 30,
        phase2_duration: 30,
        startTimeString: "11:00",
        opDate: "2026/07/22",
        location: "本館"
    },
    {
        rowId: "2", // The other booking: 葉小姐 
        flow: "BODY",
        phase1_res_idx: "CHAIR-1-1",
        phase1_duration: 60,
        startTimeString: "12:00",
        opDate: "2026/07/22",
        location: "本館",
        status: "Confirmed"
    }
];

// Test Case 1: without ignoreBuffers (should conflict)
// Toggling sequence from FB to BF, with split 30/30 swapped.
// Phase 1 (Bed) = 30 mins (11:00 -> 11:30)
// Phase 2 (Chair) = 30 mins. 
// If buffer=5, Phase 2 starts at 11:35 -> ends at 12:05.
// 12:05 > 12:00 -> Conflict with 葉小姐!
let passed = true;

try {
    console.log("Running Test 1: without ignoreBuffers...");
    const conflict = SheetService._checkOverlapConflict(
        "1", 
        "2026/07/22", 
        "11:00", // Check time
        60, // Total duration
        "BED-1-2", // Phase 1 res (Bed)
        "CHAIR-1-1", // Phase 2 res (Chair)
        30, // Phase 1 duration
        30, // Phase 2 duration
        "BF", // Target Flow
        "本館", // Location
        [], // Ignore array
        null, // new transition time
        false // ignoreBuffers
    );

    if (conflict) {
        console.log("✅ TEST 1 PASSED: Conflict detected as expected because of buffers! Conflict:", conflict);
    } else {
        console.error("❌ TEST 1 FAILED: Conflict SHOULD HAVE BEEN detected!");
        passed = false;
    }
} catch (e) {
    console.error("TEST ERROR:", e);
    passed = false;
}

// Test Case 2: WITH ignoreBuffers (should NOT conflict)
// Phase 1 = 30 mins (11:00 -> 11:30)
// Phase 2 = 30 mins (11:30 -> 12:00)
// Phase 2 ends at 12:00. 葉小姐 starts at 12:00. No overlap!
try {
    console.log("\nRunning Test 2: WITH ignoreBuffers=true...");
    const conflict = SheetService._checkOverlapConflict(
        "1", 
        "2026/07/22", 
        "11:00", // Check time
        60, // Total duration
        "BED-1-2", // Phase 1 res (Bed)
        "CHAIR-1-1", // Phase 2 res (Chair)
        30, // Phase 1 duration
        30, // Phase 2 duration
        "BF", // Target Flow
        "本館", // Location
        [], // Ignore array
        null, // new transition time
        true // ignoreBuffers
    );

    if (conflict) {
        console.error("❌ TEST 2 FAILED: Conflict detected! It should have ignored buffers and succeeded.", conflict);
        passed = false;
    } else {
        console.log("✅ TEST 2 PASSED: No conflict detected! Buffers were ignored successfully.");
    }
} catch (e) {
    console.error("TEST ERROR:", e);
    passed = false;
}

if (!passed) {
    process.exit(1);
} else {
    process.exit(0);
}

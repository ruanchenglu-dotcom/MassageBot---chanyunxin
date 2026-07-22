const SheetService = require('../cyx_sheet_service.js');
const ResourceCore = require('../cyx_resource_core.js');

// Mock data: A booking that exists at 11:41 on BED-1-2 (方 2/2)
SheetService.STATE.cachedBookings = [
    {
        rowId: "1", // The booking we are updating: 杜 1/1
        flow: "BF", // Original flow: Body -> Foot
        phase1_res_idx: "BED-1-2",
        phase2_res_idx: "CHAIR-1-1",
        phase1_duration: 60,
        phase2_duration: 40,
        transition_time: "11:00",
        startTimeString: "10:00",
        opDate: "2026/07/22",
        location: "本館"
    },
    {
        rowId: "2", // The other booking: 方 2/2
        flow: "FB",
        phase1_res_idx: "CHAIR-1-6",
        phase2_res_idx: "BED-1-2",
        phase1_duration: 50, // Let's say...
        phase2_duration: 50,
        startTimeString: "11:41",
        opDate: "2026/07/22",
        location: "本館",
        status: "Confirmed" // must have status to bypass filter
    }
];

// We test checking overlap for rowId "1"
// Toggling sequence from BF to FB, with split 60/40 swapped to 40/60.
// So phase 1 duration = 40. Start time is 10:00.
// New transition time SHOULD be 10:43 (if buffer is 3) or 10:40 (if 0).
// Wait, ResourceCore.getTimeStrFromMins(600 + 40 + 3) = "10:43".
// If we DO NOT pass the new transition time, _checkOverlapConflict will use the old "11:00".
// With the fix, we pass the new transition time.

try {
    const conflict = SheetService._checkOverlapConflict(
        "1", 
        "2026/07/22", 
        "10:00", // Check time
        100, // Total duration
        "CHAIR-1-1", // Phase 1 res (Foot)
        "BED-1-2", // Phase 2 res (Body)
        40, // Phase 1 duration
        60, // Phase 2 duration
        "FB", // Target Flow
        "本館", // Location
        [], // Ignore array
        "10:43" // NEW transition time (10:00 + 40m + 3m buffer)
    );

    if (conflict) {
        console.error("TEST FAILED: Conflict detected! " + JSON.stringify(conflict));
        process.exit(1);
    } else {
        console.log("TEST PASSED: No conflict detected when toggling sequence with 60/40!");
        process.exit(0);
    }
} catch (e) {
    console.error("TEST ERROR:", e);
    process.exit(1);
}

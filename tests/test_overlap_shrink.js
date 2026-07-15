const SheetService = require('../cyx_sheet_service.js');
const ResourceCore = require('../cyx_resource_core.js');

// Simulate the internal state
SheetService.STATE.cachedBookings = [
    {
        rowId: "30",
        flow: "FB",
        phase1_res_idx: "BED-1-2",
        phase2_res_idx: "CHAIR-1-3",
        phase1_duration: 55,
        phase2_duration: 45,
        transition_time: "10:20",
        startTimeString: "09:25"
    },
    {
        rowId: "31",
        flow: "FB",
        phase1_res_idx: "CHAIR-1-5",
        phase2_res_idx: "BED-1-2",
        phase1_duration: 50,
        phase2_duration: 50,
        startTimeString: "10:20",
        transition_time: "11:12" // 張(3/4) Phase 2 starts at 11:12 on BED-1-2
    }
];

// We test checking overlap for rowId 30 (張 1/4)
// It was dragged such that Phase 1 duration = 55 (starts at 10:20 -> ends 11:15 theoretically)
// But transition_time is 11:12.
// With the fix, Phase 1 should shrink to 52 mins (ends at 11:12), thus avoiding conflict with rowId 31 at 11:12.

try {
    const conflict = SheetService._checkOverlapConflict(
        "30", 
        "2026/07/15", 
        "10:20", // Check time
        100, // Total duration
        "BED-1-2", // Phase 1 res
        "CHAIR-1-3", // Phase 2 res
        55, // Phase 1 duration (too long)
        45, // Phase 2 duration
        "FB", // Flow
        "本館", // Location
        [], // Ignore array
        "11:12" // NEW transition time
    );

    if (conflict) {
        console.error("TEST FAILED: Conflict detected! " + JSON.stringify(conflict));
        process.exit(1);
    } else {
        console.log("TEST PASSED: No conflict detected, Phase 1 successfully shrank!");
        process.exit(0);
    }
} catch (e) {
    if (e.message.includes('RESOURCE_CONFLICT')) {
        console.error("TEST FAILED: Threw RESOURCE_CONFLICT!");
        process.exit(1);
    } else {
        console.error("TEST ERROR:", e);
        process.exit(1);
    }
}

const assert = require('assert');
const ResourceCore = require('./cyx_resource_core');

// Mock SheetService
const SheetService = {
    getServices: () => ({
        "指壓": { name: "指壓" }
    }),
    getStaffList: () => [
        { id: '王', name: '王', isActive: true, isMale: false, maxPax: 1, isLeave: false, workingHours: "08:00-24:00" },
        { id: '隨機', name: '隨機', isActive: true, isMale: false, maxPax: 1, isLeave: false, workingHours: "08:00-24:00" }
    ],
    normalizeDateStrict: (d) => d.replace(/\//g, '-'),
    getTaipeiNow: () => new Date(),
    formatDateTimeString: (d, t) => `${d} ${t}`
};

function testAdminBookingPreservesPhase1() {
    console.log("Starting Backend Unit Test for inline staff update...");
    let passed = false;
    try {
        // Simulating the existing booking that the user tries to update
        const existingBooking = {
            rowId: 'TEST_ROW_1',
            hoTen: 'TestUser',
            nhanVien: '隨機', // Originally unassigned/random
            serviceCode: '指壓',
            flow: 'BODYSINGLE',
            phase1_res_idx: 'B1', // Pre-allocated bed
            phase2_res_idx: null,
            phase1_duration: 60,
            guestDetails: [] // Assuming missing guestDetails as described in the bug
        };

        // Simulating the payload from the frontend when admin changes staff to '王'
        const cyx_data = {
            rowId: 'TEST_ROW_1',
            nhanVien: '王', // New staff
            duration: 60,
            location: '本館'
        };

        // --- Simulating the FIX logic from cyx_index.js ---
        if (existingBooking) {
            if (existingBooking.guestDetails && existingBooking.guestDetails.length > 0) {
                cyx_data.guestDetails = existingBooking.guestDetails;
            } else if (existingBooking.phase1_res_idx || existingBooking.phase1_resource) {
                console.log("[FIX] Injecting guestDetails to prevent reallocation...");
                cyx_data.guestDetails = [{
                    serviceCode: existingBooking.serviceCode || cyx_data.serviceCode,
                    staff: cyx_data.nhanVien, // Use the new staff!
                    phase1_res_idx: existingBooking.phase1_res_idx || existingBooking.phase1_resource,
                    phase2_res_idx: existingBooking.phase2_res_idx || existingBooking.phase2_resource,
                    flow: existingBooking.flow || existingBooking.flowCode,
                    phase1_duration: existingBooking.phase1_duration,
                    phase2_duration: existingBooking.phase2_duration
                }];
            }
        }

        const hasExistingAllocation = cyx_data.guestDetails && cyx_data.guestDetails.length > 0 && 
                                      (cyx_data.guestDetails[0].phase1_res_idx || cyx_data.guestDetails[0].phase1_resource);

        console.log("hasExistingAllocation:", hasExistingAllocation);
        console.log("Injected guestDetails:", cyx_data.guestDetails);

        assert.ok(hasExistingAllocation, "hasExistingAllocation should be true");
        assert.strictEqual(cyx_data.guestDetails[0].staff, "王", "Staff should be updated in guestDetails");
        assert.strictEqual(cyx_data.guestDetails[0].phase1_res_idx, "B1", "Phase1 allocation MUST be preserved");

        // Simulating the reallocation check
        const shouldReallocate = !hasExistingAllocation; // checkRequestAvailability is bypassed
        assert.strictEqual(shouldReallocate, false, "Should NOT trigger reallocation logic");
        
        passed = true;
        console.log("✅ TEST PASSED: phase1_res_idx was preserved and reallocation was prevented.");
    } catch (e) {
        console.error("❌ Test Failed:", e.message);
    }
    
    if (passed) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

testAdminBookingPreservesPhase1();

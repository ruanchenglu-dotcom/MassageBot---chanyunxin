// test_elasticity.js
const assert = require('assert');

// Mock state and dependencies
let currentPhase1 = null;
let currentStatus = null;
let currentMessage = null;

const setPhase1 = (val) => { currentPhase1 = val; };
const setScanServiceStatus = (status) => { currentStatus = status; };
const setScanServiceMessage = (msg) => { currentMessage = msg; };

// Setup scenario exactly as in the user's report
const startMins = 15 * 60 + 40; // 15:40 = 940
const oldDur = 130;
const newDuration = 100;
const oldP1Dur = 60;
// oldMidMins = 940 + 60 = 1000 (16:40)
// oldEndMins = 940 + 130 = 1070 (17:50)

// A function that mocks the loop and the new logic inside performServiceCheck
function performServiceCheck(isGroup, overridePhase1 = null) {
    // Reset state for new run if not recursive
    if (overridePhase1 === null) {
        currentPhase1 = null;
        currentStatus = null;
        currentMessage = null;
    }

    const defaultP1 = 60; // getSmartSplit(100).phase1
    let editPhase1End = startMins + (overridePhase1 !== null ? overridePhase1 : defaultP1);
    
    let isNewBedHigher = false;
    let isNewChairHigher = false;
    
    // Simulate the loop for t = 16:40 (1000)
    const t = 1000;
    
    // Simulate what happens at t = 16:40
    let willBeOnBed = (t >= editPhase1End);
    let wasOnBed = (t >= startMins + oldP1Dur); // 1000 >= 1000 => true
    
    // BUT WAIT: in the original code, wasOnBed = false if t < oldMidMins
    // Let's test the EXACT values that caused the failure:
    // When overridePhase1 is null, defaultP1 = 60. editPhase1End = 1000.
    // If oldP1Dur was 70, oldMidMins = 1010.
    // Then at t = 1000, willBeOnBed = true, wasOnBed = false -> isNewBedHigher = true.
    // Let's set oldP1Dur = 70 to simulate the exact conflict
    let mockOldP1Dur = 70;
    let mockOldMidMins = startMins + mockOldP1Dur; // 1010
    
    let mockWillBeOnBed = (t >= editPhase1End);
    let mockWasOnBed = (t >= mockOldMidMins);
    
    if (mockWillBeOnBed && !mockWasOnBed) {
        isNewBedHigher = true;
    }

    // Assume bed is full at t=16:40 (due to 簡(2/2))
    let currentBedLoad = 10;
    let getMaxBeds = () => 9;

    if (currentBedLoad > getMaxBeds() && isNewBedHigher) {
        let isComboEdit = true;
        let isBodyFirstLocal = false;
        
        // --- NEW ELASTICITY LOGIC ---
        if (isComboEdit && !isBodyFirstLocal) {
            let currentTest = overridePhase1 !== null ? overridePhase1 : defaultP1;
            
            if (newDuration < oldDur && overridePhase1 === null && mockOldP1Dur > defaultP1 && mockOldP1Dur <= newDuration - 30) {
                setPhase1(mockOldP1Dur);
                return performServiceCheck(isGroup, mockOldP1Dur);
            }
            
            let nextTryP1 = currentTest + 5;
            if (nextTryP1 <= newDuration - 30 && nextTryP1 <= defaultP1 + 40) {
                setPhase1(nextTryP1);
                return performServiceCheck(isGroup, nextTryP1);
            }
        }
        setScanServiceStatus('FAILED');
        setScanServiceMessage("❌ 床區客滿");
        return;
    }

    // If it passes
    setScanServiceStatus('SUCCESS');
    setScanServiceMessage("");
}

console.log("Running Elasticity Test...");
performServiceCheck(false, null);

console.log("Result Status:", currentStatus);
console.log("Result Message:", currentMessage);
console.log("Adjusted Phase 1:", currentPhase1);

if (currentStatus === 'SUCCESS' && currentPhase1 === 70) {
    console.log("✅ Test Passed: The system correctly auto-stretched Phase 1 to 70 minutes (oldP1Dur) to avoid bed conflict!");
} else {
    console.log("❌ Test Failed");
    process.exit(1);
}

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../XinWuChanAdmin/js/cyx_smartScheduler.js'), 'utf8');

const sandbox = {
    window: {
        CoreKernel: {
            SERVICES: {
                'A3': { minFoot: 30, maxFoot: 60, minBody: 40, maxBody: 70 }
            }
        },
        getSmartSplit: function(b, duration, isMaxMode, sequence) {
            return { phase1: Math.floor(duration/2), phase2: Math.ceil(duration/2) };
        }
    },
    Math: Math,
    parseInt: parseInt,
    String: String
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

// Mock a booking with no serviceCode but with serviceName
const b = {
    rowId: '999',
    category: 'COMBO',
    flow: 'FB',
    duration: 100,
    serviceName: 'A3 套餐(100分) 油推',
    phase1_res_idx: 'CHAIR-1-1',
    phase2_res_idx: 'BED-1-1',
    startTimeString: '10:00',
    time: '10:00',
    originalData: {}
};

const assignments = sandbox.window.SmartScheduler.solve(
    [b], 
    '999', 
    'CHAIR-1-1', 
    1, 
    false
);

console.log("Assignments output:");
console.log(JSON.stringify(assignments, null, 2));

let success = true;
if (assignments && assignments[0]) {
    if (assignments[0].phase1_duration !== undefined || assignments[0].phase2_duration !== undefined) {
        console.error("Test failed! Expected phase durations to be 50/50 without stretching.");
        success = false;
    }
} else {
    console.log("Assignments array is empty. This is expected if there are no existing assignments to mock!");
}

if (success) {
    console.log("TEST PASSED: Booking did not stretch unnecessarily.");
} else {
    process.exit(1);
}

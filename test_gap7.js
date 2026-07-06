const core = require('./cyx_resource_core.js');

let guestList = [
    { serviceCode: 'Combo', serviceName: 'Combo 100p', overrideDuration: 100, staff: 'Any', flowCode: 'FB' }
];

let currentBookingsRaw = [
    {
        id: "b1",
        startTimeString: "2026/06/07 16:20",
        duration: 60,
        serviceCode: "Foot",
        serviceName: "Foot",
        status: "Confirmed",
        location: "本館"
    },
    {
        id: "b2",
        startTimeString: "2026/06/07 18:00",
        duration: 60,
        serviceCode: "Body",
        serviceName: "Body", 
        status: "Confirmed",
        location: "本館"
    }
];

let staffList = {
    "S1": { name: "S1", id: "S1", gender: "F", start: "10:00", end: "22:00" },
    "S2": { name: "S2", id: "S2", gender: "F", start: "10:00", end: "22:00" }
};

global.getSystemConfig = () => ({
    SCALE: { MAX_CHAIRS: 1, MAX_BEDS: 1 }, 
    OPERATION_TIME: { OPEN_HOUR: 10 },
    BUFFERS: { CLEANUP_MINUTES: 1, TRANSITION_MINUTES: 1 },
    LOGIC_RULES: { TOLERANCE: 1, CAPACITY_CHECK_STEP: 10 }
});
core.getSystemConfig = global.getSystemConfig;

if (typeof core.initializeCore === 'function') core.initializeCore();

core.setDynamicServices({
    'Combo': { name: 'Combo 100p', type: 'MIXED', category: 'COMBO', duration: 100, minFoot: 30, maxFoot: 70, minBody: 30, maxBody: 70, elasticStep: 1, elasticLimit: 20 },
    'Foot': { name: 'Foot', type: 'CHAIR', category: 'FOOT' },
    'Body': { name: 'Body', type: 'BED', category: 'BODY' }
});

let times = ['17:20', '17:21', '17:22', '17:23', '17:24', '17:25'];
for (let tStr of times) {
    let res = core.checkRequestAvailability("2026/06/07", tStr, guestList, currentBookingsRaw, staffList, { location: '本館' });
    if (res.feasible) {
        console.log(`[SUCCESS] ${tStr} fits! -> ${res.details[0].phase1_duration}/${res.details[0].phase2_duration} flow: ${res.details[0].flow}`);
    } else {
        console.log(`[FAIL] ${tStr}: ${res.reason}`);
    }
}

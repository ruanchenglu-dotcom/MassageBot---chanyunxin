const core = require('./cyx_resource_core.js');

let guestList = [
    { serviceCode: 'Combo', serviceName: 'Combo 100p', duration: 100, staff: '', flowCode: 'FB' }
];

let currentBookingsRaw = [
    {
        id: "b1",
        startTime: "16:20",
        duration: 60,
        serviceCode: "Foot",
        serviceName: "Foot",
        status: "Confirmed",
        location: "本館"
    },
    {
        id: "b2",
        startTime: "18:00",
        duration: 60,
        serviceCode: "Body",
        serviceName: "Body", // Phuong
        status: "Confirmed",
        location: "本館"
    }
];

let staffList = {
    "S1": { name: "S1", id: "S1", gender: "F", start: "10:00", end: "22:00" },
    "S2": { name: "S2", id: "S2", gender: "F", start: "10:00", end: "22:00" },
    "S3": { name: "S3", id: "S3", gender: "F", start: "10:00", end: "22:00" }
};

global.getSystemConfig = () => ({
    SCALE: { MAX_CHAIRS: 1, MAX_BEDS: 2 }, // 2 Beds, so one is free!
    OPERATION_TIME: { OPEN_HOUR: 10 },
    BUFFERS: { CLEANUP_MINUTES: 5, TRANSITION_MINUTES: 5 },
    LOGIC_RULES: { TOLERANCE: 5, CAPACITY_CHECK_STEP: 10 }
});
core.getSystemConfig = global.getSystemConfig;
core.setDynamicServices({
    'Combo': { name: 'Combo 100p', type: 'MIXED', category: 'COMBO', minFoot: 30, maxFoot: 70, minBody: 30, maxBody: 70, elasticStep: 1, elasticLimit: 20 },
    'Foot': { name: 'Foot', type: 'CHAIR', category: 'FOOT' },
    'Body': { name: 'Body', type: 'BED', category: 'BODY' }
});

// Override trySequence to ONLY test FB
const originalFn = core.checkRequestAvailability;
// We can't override local variables, but we can hack the guestList to NOT be a "combo" for the matrix, but act like a combo.
// Actually, let's just make a copy of cyx_resource_core.js and test it.

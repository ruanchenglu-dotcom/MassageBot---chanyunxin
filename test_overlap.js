global.getSystemConfig = () => ({
    SCALE: { MAX_CHAIRS: 1, MAX_BEDS: 1 }, 
    OPERATION_TIME: { OPEN_HOUR: 10 },
    BUFFERS: { CLEANUP_MINUTES: 5, TRANSITION_MINUTES: 5 },
    LOGIC_RULES: { TOLERANCE: 5, CAPACITY_CHECK_STEP: 10 }
});

const core = require('./cyx_resource_core.js');

let guestList = [
    { serviceCode: 'Combo', serviceName: 'Combo 100p', overrideDuration: 100, staff: '', flowCode: 'FB' }
];

let currentBookingsRaw = [
    {
        id: "b1",
        startTimeString: "2026/06/07 16:20",
        duration: 60,
        serviceCode: "Foot",
        serviceName: "Foot",
        status: "Confirmed",
        location: "本館" // Ends at 17:20
    },
    {
        id: "b2",
        startTimeString: "2026/06/07 18:00",
        duration: 60,
        serviceCode: "Body",
        serviceName: "Body", 
        status: "Confirmed",
        location: "本館" // Bed occupied 18:00-19:00
    },
    {
        id: "b3",
        startTimeString: "2026/06/07 18:00",
        duration: 60,
        serviceCode: "Foot",
        serviceName: "Foot", 
        status: "Confirmed",
        location: "本館" // Chair occupied 18:00-19:00
    }
];

let staffList = {
    "S1": { name: "S1", id: "S1", gender: "F", start: "10:00", end: "22:00" },
    "S2": { name: "S2", id: "S2", gender: "F", start: "10:00", end: "22:00" },
    "S3": { name: "S3", id: "S3", gender: "F", start: "10:00", end: "22:00" }
};

core.getSystemConfig = global.getSystemConfig;

if (typeof core.initializeCore === 'function') core.initializeCore();

core.setDynamicServices({
    'Combo': { name: 'Combo 100p', type: 'MIXED', category: 'COMBO', duration: 100, minFoot: 30, maxFoot: 70, minBody: 30, maxBody: 70, elasticStep: 1, elasticLimit: 20 },
    'Foot': { name: 'Foot', type: 'CHAIR', category: 'FOOT' },
    'Body': { name: 'Body', type: 'BED', category: 'BODY' }
});

let res = core.checkRequestAvailability("2026/06/07", "17:20", guestList, currentBookingsRaw, staffList, '本館');
console.log("At 17:20:\n", JSON.stringify(res, null, 2));


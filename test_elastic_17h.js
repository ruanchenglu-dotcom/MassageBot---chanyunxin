const core = require('./cyx_resource_core.js');

let guestList = [
    { serviceCode: 'Combo', serviceName: 'Combo 100p', overrideDuration: 100, staff: '' }
];

let currentBookingsRaw = [
    {
        id: "b1",
        startTime: "16:30",
        duration: 60,
        serviceCode: "Foot",
        serviceName: "Foot",
        status: "Confirmed",
        location: "本館"
    },
    {
        id: "b2",
        startTime: "18:21",
        duration: 60,
        serviceCode: "Body",
        serviceName: "Body",
        status: "Confirmed",
        location: "本館"
    }
];

let staffList = {
    "S1": { name: "S1", id: "S1", gender: "F" },
    "S2": { name: "S2", id: "S2", gender: "M" },
    "S3": { name: "S3", id: "S3", gender: "F" }
};
let queryDateStr = "06/07/2026";

// Mock config
global.getSystemConfig = () => ({
    SCALE: { MAX_CHAIRS: 6, MAX_BEDS: 6 },
    OPERATION_TIME: { OPEN_HOUR: 10 },
    BUFFERS: { CLEANUP_MINUTES: 5, TRANSITION_MINUTES: 5 },
    LOGIC_RULES: { TOLERANCE: 5, CAPACITY_CHECK_STEP: 10 }
});
core.getSystemConfig = global.getSystemConfig;

// Mock parseStaffStatus
core.parseStaffStatus = () => ({ isAvailable: true, startMins: 0, endMins: 1440 });

let res = core.checkRequestAvailability(queryDateStr, "17:00", guestList, currentBookingsRaw, staffList, '本館');
console.log("At 17:00:\n", JSON.stringify(res, null, 2));

let res2 = core.checkRequestAvailability(queryDateStr, "17:32", guestList, currentBookingsRaw, staffList, '本館');
console.log("At 17:32:\n", JSON.stringify(res2, null, 2));

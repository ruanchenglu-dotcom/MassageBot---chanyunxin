const core = require('./cyx_resource_core.js');

let guestList = [
    { serviceCode: 'Combo', serviceName: 'Combo 100p', overrideDuration: 100, staff: 'Any', flowCode: 'FB' }
];

let currentBookingsRaw = [
    {
        id: "b1", rowId: 1,
        startTimeString: "2026/06/07 16:20",
        duration: 60,
        serviceCode: "Foot",
        serviceName: "Foot",
        status: "Confirmed",
        location: "本館"
    },
    {
        id: "b2", rowId: 2,
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

const originalTryAllocate = core.VirtualMatrix.prototype.tryAllocate;
core.VirtualMatrix.prototype.tryAllocate = function(type, startMins, endMins, guestId, preferredIndex, isForced) {
    let res = originalTryAllocate.call(this, type, startMins, endMins, guestId, preferredIndex, isForced);
    console.log(`[ALLOCATE] ${type} ${startMins}->${endMins} for ${guestId} = ${res}`);
    return res;
};

let res = core.checkRequestAvailability("2026/06/07", "17:21", guestList, currentBookingsRaw, staffList, { location: '本館' });

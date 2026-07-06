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
    "S2": { name: "S2", id: "S2", gender: "F", start: "10:00", end: "22:00" },
    "S3": { name: "S3", id: "S3", gender: "F", start: "10:00", end: "22:00" },
    "S4": { name: "S4", id: "S4", gender: "F", start: "10:00", end: "22:00" },
    "S5": { name: "S5", id: "S5", gender: "F", start: "10:00", end: "22:00" },
    "S6": { name: "S6", id: "S6", gender: "F", start: "10:00", end: "22:00" }
};

if (typeof core.initializeCore === 'function') core.initializeCore();

let res = core.checkRequestAvailability("2026/06/07", "17:20", guestList, currentBookingsRaw, staffList, { location: '本館' });
console.log(JSON.stringify(res, null, 2));

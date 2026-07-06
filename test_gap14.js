const core = require('./cyx_resource_core.js');

let guestList = [
    { serviceCode: 'Combo', serviceName: 'Combo 100p', overrideDuration: 100, staff: 'Any', flowCode: 'FB' }
];

let currentBookingsRaw = [
    {
        id: "b1", rowId: 1,
        startTimeString: "2026/06/07 16:20",
        duration: 60,
        staffName: "Dummy0",
        serviceCode: "Foot",
        serviceName: "Foot",
        status: "Confirmed",
        location: "本館",
        allocated_resource: "CHAIR-1-1"
    },
    {
        id: "b3", rowId: 3,
        startTimeString: "2026/06/07 18:00",
        duration: 60,
        staffName: "Dummy0",
        serviceCode: "Foot",
        serviceName: "Foot", 
        status: "Confirmed",
        location: "本館",
        allocated_resource: "CHAIR-1-1"
    }
];

// Fill other 5 chairs from 16:00 to 20:00 so ONLY CHAIR-1-1 has the gap!
for (let i = 2; i <= 6; i++) {
    currentBookingsRaw.push({
        id: "b_fill_" + i, rowId: 10 + i,
        startTimeString: "2026/06/07 16:00",
        duration: 240,
        staffName: "Dummy" + i,
        serviceCode: "Foot",
        serviceName: "Foot",
        status: "Confirmed",
        location: "本館",
        allocated_resource: "CHAIR-1-" + i
    });
}

let staffList = {
    "S1": { name: "S1", id: "S1", gender: "F", start: "10:00", end: "22:00" },
    "S2": { name: "S2", id: "S2", gender: "F", start: "10:00", end: "22:00" }
};
for (let i = 0; i <= 6; i++) {
    staffList["Dummy" + i] = { name: "Dummy" + i, id: "Dummy" + i, gender: "F", start: "10:00", end: "22:00" };
}

if (typeof core.initializeCore === 'function') core.initializeCore();
core.setDynamicServices({
    'Combo': { name: 'Combo 100p', type: 'MIXED', category: 'COMBO', duration: 100, minFoot: 30, maxFoot: 70, minBody: 30, maxBody: 70, elasticStep: 10, elasticLimit: 20 },
    'Foot': { name: 'Foot', type: 'CHAIR', category: 'FOOT', duration: 60 },
    'Body': { name: 'Body', type: 'BED', category: 'BODY', duration: 60 }
});

let res = core.checkRequestAvailability("2026/06/07", "17:25", guestList, currentBookingsRaw, staffList, { location: '本館' });
console.log(JSON.stringify(res, null, 2));

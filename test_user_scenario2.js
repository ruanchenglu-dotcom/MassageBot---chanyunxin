const core = require('./cyx_resource_core.js');

let guestList = [
    { serviceCode: 'Combo', serviceName: 'Combo 100p', overrideDuration: 100, staff: 'Any', flowCode: 'FB' }
];

let currentBookingsRaw = [];
// 6 Chairs occupied from 16:31 to 17:31
for (let i = 1; i <= 6; i++) {
    currentBookingsRaw.push({
        id: "b1_" + i, rowId: i,
        startTimeString: "2026/06/07 16:31",
        duration: 60,
        serviceCode: "Foot", serviceName: "Foot", status: "Confirmed",
        location: "本館", allocated_resource: "CHAIR-1-" + i,
        staffName: "Staff" + i, flowCode: "FOOTSINGLE"
    });
}
// 6 Chairs occupied from 18:21 to 19:21
for (let i = 1; i <= 6; i++) {
    currentBookingsRaw.push({
        id: "b2_" + i, rowId: 10 + i,
        startTimeString: "2026/06/07 18:21",
        duration: 60,
        serviceCode: "Combo", serviceName: "Combo", status: "Confirmed",
        location: "本館", allocated_resource: "CHAIR-1-" + i,
        staffName: "Staff" + i, flowCode: "FB", phase1_duration: 60, phase2_duration: 60 
    });
}

let staffList = {};
for (let i = 1; i <= 6; i++) {
    staffList["Staff" + i] = { name: "Staff" + i, id: "Staff" + i, gender: "M", start: "10:00", end: "22:00" };
}
for (let i = 7; i <= 10; i++) {
    staffList["Staff" + i] = { name: "Staff" + i, id: "Staff" + i, gender: "M", start: "10:00", end: "22:00" };
}

if (typeof core.initializeCore === 'function') core.initializeCore();
core.setDynamicServices({
    'Combo': { name: 'Combo 100p', type: 'MIXED', category: 'COMBO', duration: 100, minFoot: 30, maxFoot: 70, minBody: 30, maxBody: 70, elasticStep: 10, elasticLimit: 20 },
    'Foot': { name: 'Foot', type: 'CHAIR', category: 'FOOT', duration: 60 },
    'Body': { name: 'Body', type: 'BED', category: 'BODY', duration: 60 }
});

console.log("\n\n--- Testing 17:40 ---");
let res2 = core.checkRequestAvailability("2026/06/07", "17:40", guestList, currentBookingsRaw, staffList, { location: '本館' });
console.log(JSON.stringify(res2, null, 2));

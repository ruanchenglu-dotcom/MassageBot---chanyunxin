const core = require('./cyx_resource_core.js');

const currentBookings = [];
currentBookings.push({
    "rowId": "B_1", "customerName": "Khách B?n Tr?", "serviceName": "????", "serviceCode": "F1",
    "startTimeString": "2026/07/16 11:30", "duration": 60, "flow": "FOOTSINGLE", "status": "CONFIRMED", "location": "??", "phase1_res_idx": "CHAIR-1-1"
});
currentBookings.push({
    "rowId": "B_2", "customerName": "Khách Gi?a", "serviceName": "????", "serviceCode": "F1",
    "startTimeString": "2026/07/16 10:00", "duration": 80, "flow": "FOOTSINGLE", "status": "CONFIRMED", "location": "??", "phase1_res_idx": "CHAIR-1-2"
});

core.CONFIG.MAX_CHAIRS = 2;
core.CONFIG.MAX_BEDS = 2;

const guestList = [{ serviceCode: 'F1', serviceName: '???? (70?)', overrideDuration: 70 }];
const staffList = [
    { name: "StaffA", status: "Available", startMins: 0, endMins: 1440 },
    { name: "StaffB", status: "Available", startMins: 0, endMins: 1440 }
];

console.log("=== RUNNING SMART REPACKING TEST ===");
const res = core.checkRequestAvailability("2026/07/16", "11:00", guestList, currentBookings, staffList);
console.log("Result:", JSON.stringify(res, null, 2));

if (res.feasible && res.proposedUpdates && res.proposedUpdates.length > 0) {
    console.log("? SUCCESS: System automatically repacked bookings!");
} else if (res.feasible) {
    console.log("? SUCCESS: Feasible, but no repacking needed?");
} else {
    console.log("? FAILED: System returned not feasible!");
}


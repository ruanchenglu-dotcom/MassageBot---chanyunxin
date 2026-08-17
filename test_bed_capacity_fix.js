const core = require('./cyx_resource_core.js');

// Mock data based on the scenario
const dateStr = '2026-08-17';
const timeStr = '15:05'; // 康 group wants to start at 15:05

const guestDetails = [
    { serviceCode: 'BODY', serviceName: '身體按摩(90分)', overrideDuration: 90, staff: '隨機', location: '本館' },
    { serviceCode: 'BODY', serviceName: '身體按摩(90分)', overrideDuration: 90, staff: '隨機', location: '本館' },
    { serviceCode: 'BODY', serviceName: '身體按摩(90分)', overrideDuration: 90, staff: '隨機', location: '本館' },
    { serviceCode: 'BODY', serviceName: '身體按摩(90分)', overrideDuration: 90, staff: '隨機', location: '本館' }
];

// Mock current bookings
// 高 group (starts at 16:05) uses BED-1-1 and BED-1-2
const todaysBookings = [
    {
        rowId: "463",
        serviceName: "Combo(130m)",
        startTime: "16:05",
        duration: 130,
        flow: "BF",
        location: "本館",
        phase1_res_idx: "床1-1",
        status: "RUNNING" // Fluid or running doesn't matter, it shouldn't block 15:05-16:05 anyway
    },
    {
        rowId: "464",
        serviceName: "Combo(130m)",
        startTime: "16:05",
        duration: 130,
        flow: "BF",
        location: "本館",
        phase1_res_idx: "床1-2",
        status: "RUNNING"
    }
];

// Mock staff list (give plenty of staff)
const staffList = {};
for(let i=1; i<=15; i++) {
    staffList[`staff${i}`] = { id: `staff${i}`, name: `Staff ${i}`, start: "12:00", end: "22:00", gender: "F" };
}

// Mock system config inside cyx_resource_core (which reads from cyx_data or defaults)
// Assuming MAX_BEDS = 6

console.log('Testing Core Availability Check with 4 Body Massages (90m) at 15:05');
console.log('Max Beds: 6. Existing beds used by others at 16:05: 2');
console.log('Total beds needed: 4 + 2 = 6 (at peak 16:05 - 16:35). Should succeed.');

const result = core.checkRequestAvailability(dateStr, timeStr, guestDetails, todaysBookings, staffList, { location: '本館' });
console.log('\n--- RESULT ---');
console.log('Feasible:', result.feasible);
if (!result.feasible) {
    console.log('Reason:', result.reason);
    console.error('❌ TEST FAILED: Bug is still present or capacity check failed.');
    process.exit(1);
} else {
    console.log('✅ TEST PASSED: Capacity check succeeded, the beds were correctly allocated.');
    console.log(JSON.stringify(result.details, null, 2));
    process.exit(0);
}

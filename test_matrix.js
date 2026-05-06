const fs = require('fs');
const Core = require('./cyx_resource_core.js');

const CONF = Core.CONFIG;
const { checkRequestAvailability, setDynamicServices } = Core;

// Set up mock services
setDynamicServices({
    'F3': { name: '腳底按摩(110分)', duration: 110, type: 'CHAIR', category: 'FOOT', price: 1000 },
    'A3': { name: '套餐(120分)', duration: 120, type: 'BED', category: 'COMBO', price: 1200 }
});

const staffList = {};
for (let i = 1; i <= 10; i++) {
    staffList[`S${i}`] = { name: `S${i}`, gender: 'F', start: '08:00', end: '23:59', isAvailable: true };
}

// Scenario 1: Zhu is existing, Jian is new
const bookingsZhu = [
    {
        rowId: 2, startTimeString: '2026/05/06 18:00', startTime: '18:00',
        duration: 110, serviceCode: 'F3', serviceName: '腳底按摩(110分)',
        status: '已預約', allocated_resource: 'CHAIR-1', opDate: '2026/05/06',
        isManualLocked: false
    }
];

const guestListJian = [
    { serviceCode: 'A3', serviceName: '套餐(120分)', flowCode: 'BF', staffName: 'RANDOM' }, // 1/4
    { serviceCode: 'A3', serviceName: '套餐(120分)', flowCode: 'FB', staffName: 'RANDOM' }, // 2/4
    { serviceCode: 'A3', serviceName: '套餐(120分)', flowCode: 'BF', staffName: 'RANDOM' }, // 3/4
    { serviceCode: 'A3', serviceName: '套餐(120分)', flowCode: 'FB', staffName: 'RANDOM' }  // 4/4
];

const result1 = checkRequestAvailability('2026/05/06', '18:00', guestListJian, bookingsZhu, staffList);
console.log("Scenario 1 (Zhu existing, Jian new) Feasible:", result1.feasible);
if (result1.details) {
    console.log("Jian 1/4 allocation:", result1.details[0].phase1_res_idx, result1.details[0].phase2_res_idx);
    console.log("Jian 3/4 allocation:", result1.details[2].phase1_res_idx, result1.details[2].phase2_res_idx);
} else {
    console.log("Reason:", result1.reason);
}

// Scenario 2: Jian is existing, Zhu is new
const bookingsJian = [
    {
        rowId: 8, startTimeString: '2026/05/06 18:00', startTime: '18:00',
        duration: 120, serviceCode: 'A3', serviceName: '套餐(120分)', flow: 'BF',
        status: '已預約', phase1_res_idx: 'BED-1', phase2_res_idx: 'CHAIR-1', opDate: '2026/05/06',
        isManualLocked: true, phase1_duration: 60, phase2_duration: 60, originalData: { isManualLocked: true }
    },
    {
        rowId: 10, startTimeString: '2026/05/06 18:00', startTime: '18:00',
        duration: 120, serviceCode: 'A3', serviceName: '套餐(120分)', flow: 'FB',
        status: '已預約', phase1_res_idx: 'CHAIR-1', phase2_res_idx: 'BED-1', opDate: '2026/05/06',
        isManualLocked: true, phase1_duration: 60, phase2_duration: 60, originalData: { isManualLocked: true }
    }
];

const guestListZhu = [
    { serviceCode: 'F3', serviceName: '腳底按摩(110分)', staffName: 'RANDOM' }
];

const result2 = checkRequestAvailability('2026/05/06', '18:00', guestListZhu, bookingsJian, staffList);
console.log("\nScenario 2 (Jian existing, Zhu new) Feasible:", result2.feasible);
if (result2.details) {
    console.log("Zhu allocation:", result2.details[0].phase1_res_idx);
} else {
    console.log("Reason:", result2.reason);
}

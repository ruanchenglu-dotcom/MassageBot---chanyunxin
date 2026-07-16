const core = require('../cyx_resource_core.js');

const currentBookings = [];
// Chair 1: Bận 09:00 - 11:10 (130 mins)
currentBookings.push({
    rowId: 'B_1', customerName: 'Khách C', serviceName: '腳', serviceCode: 'F1',
    startTimeString: '2026/07/16 09:00', duration: 130, flow: 'FOOTSINGLE', status: 'CONFIRMED', location: '本館', phase1_res_idx: 'CHAIR-1-1'
});
// Chair 2: Bận 11:20 - 12:30 (70 mins)
currentBookings.push({
    rowId: 'B_2', customerName: 'Khách D', serviceName: '腳', serviceCode: 'F1',
    startTimeString: '2026/07/16 11:20', duration: 70, flow: 'FOOTSINGLE', status: 'CONFIRMED', location: '本館', phase1_res_idx: 'CHAIR-1-2'
});
// Chairs 3-6: Kín 08:00 - 13:00
for (let i = 3; i <= 6; i++) {
    currentBookings.push({
        rowId: 'B_FULL_' + i, customerName: 'Khách Full ' + i, serviceName: '腳', serviceCode: 'F1',
        startTimeString: '2026/07/16 08:00', duration: 300, flow: 'FOOTSINGLE', status: 'CONFIRMED', location: '本館', phase1_res_idx: 'CHAIR-1-' + i
    });
}

const guestList = [{ serviceCode: 'F1', serviceName: '腳', overrideDuration: 70 }];
const staffList = {};
for(let i=0; i<12; i++) staffList['Staff'+i] = { name: 'Staff'+i, start: '00:00', end: '23:59', status: 'Available' };

console.log('=== RUNNING SMART REPACKING 3-PASS TEST ===');
// Temporarily mute console.log to avoid spam
const origLog = console.log;
console.log = function() {};

const res = core.checkRequestAvailability('2026/07/16', '11:00', guestList, currentBookings, staffList);

console.log = origLog;

if (res.feasible && res.proposedUpdates.length > 0) {
    console.log('✅ TEST PASSED: Hệ thống đã tự động dồn chỗ (Smart Repacking) thành công!');
    console.log('ProposedUpdates:', JSON.stringify(res.proposedUpdates, null, 2));
    process.exit(0);
} else {
    console.error('❌ TEST FAILED: Không thể dồn chỗ!');
    console.log('Feasible:', res.feasible);
    console.log('Reason:', res.reason);
    process.exit(1);
}

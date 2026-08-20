const CoreAPI = require('./cyx_resource_core.js');

const mockStaff = {
  'T1': { id: 'T1', name: '王', gender: 'M', isYouTui: false, startMins: 0, endMins: 1440, off: false, location: '本館' }
};

const guestList = [{
  serviceCode: 'B2',
  serviceName: 'Body Massage',
  staff: 'T1', // Actually in checkRequestAvailability we need staffName
  staffName: 'T1',
  isYouTui: true,
  flowCode: 'FB',
  duration: 60
}];

console.log('Running test...');
const res = CoreAPI.checkRequestAvailability('2026/10/10', '12:00', guestList, [], mockStaff, { location: '本館' });
console.log(res);

if (!res.feasible && res.reason.includes('不會油推')) {
    console.log('✅ Test Passed: Specific staff skill validation correctly rejected the booking.');
    process.exit(0);
} else {
    console.error('❌ Test Failed: Booking was incorrectly approved or wrong reason given.');
    process.exit(1);
}

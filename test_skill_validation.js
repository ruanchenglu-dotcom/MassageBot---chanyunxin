const fs = require('fs');
const coreCode = fs.readFileSync('cyx_resource_core.js', 'utf8');
const getSystemConfig = () => ({ CLEANUP_BUFFER: 0 });
const SERVICES = { 'O1': { duration: 60, name: 'Oil Massage' }, 'F1': { duration: 60, name: 'Foot Massage' } };
const isComboService = () => false;
const getMinsFromTimeStr = (str) => { const parts = str.split(':'); return parseInt(parts[0]) * 60 + parseInt(parts[1]); };
const parseStaffStatus = (s, d) => ({ isAvailable: true, startMins: 9*60, endMins: 21*60 });
eval(coreCode.replace('module.exports = {', 'var exported = {'));

const staffList = {
    'Male1': { name: 'Male1', gender: 'M', isYouTui: false, '2026-10-10': '09:00-21:00' },
    'Female1': { name: 'Female1', gender: 'F', isYouTui: true, '2026-10-10': '09:00-21:00' },
    'Female2': { name: 'Female2', gender: 'F', isYouTui: true, '2026-10-10': '09:00-21:00' }
};

const currentBookingsRaw = [
    { startTime: '10:00', duration: 60, staffName: 'FEMALE', assignedStaffs: ['FEMALE'], serviceName: 'Foot Massage' }
];

const guestList = [
    { staff: 'Any', serviceName: 'Oil Massage', isYouTui: true, overrideDuration: 60 },
    { staff: 'Any', serviceName: 'Oil Massage', isYouTui: true, overrideDuration: 60 }
];

const result = exported.validateGlobalCapacity(10*60, 60, guestList, currentBookingsRaw, staffList, '2026-10-10', true);
console.log(JSON.stringify(result, null, 2));

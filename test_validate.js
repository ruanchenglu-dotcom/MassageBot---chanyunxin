const fs = require('fs');
eval(fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8'));

window = { SYSTEM_CONFIG: {} };
SERVICES = { 'B100': { duration: 100 } };
window.SERVICES_DATA = SERVICES;

let staffList = {
    '王': { id: 'T2', name: '王', gender: 'M', start: '08:00', end: '20:00', off: false, offDays: [] }
};
let guests = [{
    staff: '王', staffName: '王', serviceCode: 'B100', service: 'B100', overrideDuration: 100, isYouTui: true
}];

let checkRes = typeof callCoreAvailabilityCheck !== 'undefined' ? callCoreAvailabilityCheck('2026-08-20', '08:00', guests, [], staffList, '本館') : null;
console.log(JSON.stringify(checkRes, null, 2));

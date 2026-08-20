const fs = require('fs');

let fileContent = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');

// Extract CoreKernel IIFE
let coreKernelCode = fileContent.substring(
    fileContent.indexOf('const CoreKernel = (function() {'),
    fileContent.indexOf('    // Expose cyxCallCoreAvailabilityCheck globally')
);

// We don't need callCoreAvailabilityCheck, we just want to run CoreKernel.checkRequestAvailability directly!
let executableCode = 
const normalizeStaffId = (id) => String(id || '').replace(/^0+/, '').trim().toUpperCase();
const safeTimeToMins = (timeStr) => {
    if (!timeStr) return 0;
    let parts = String(timeStr).split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
};
const getSystemConfig = () => ({ TOLERANCE: 15, CLEANUP_BUFFER: 5, TRANSITION_BUFFER: 5, SCALE: { MAX_CHAIRS: 6, MAX_BEDS: 6 } });
const getConfig = getSystemConfig;
const getBookingStatus = () => ({ WAITING: 'WAITING', SERVING: 'SERVING', PAID: 'PAID', CANCELLED: 'CANCELLED', COMPLETED: 'COMPLETED', NOSHOW: 'NOSHOW' });



let staffMap = {
    '王': { id: 'T2', name: '王', gender: 'M', start: '08:00', end: '20:00', off: false, offDays: [] }
};
let coreGuests = [{
    staff: '王', staffName: '王', serviceCode: 'A+B', service: '90分 腳底+全身', overrideDuration: 90, isYouTui: true
}];

let checkRes = CoreKernel.checkRequestAvailability('2026-08-20', '08:00', coreGuests, [], staffMap, { location: '本館' });
console.log(JSON.stringify(checkRes, null, 2));
;

fs.writeFileSync('test_booking2.js', executableCode);

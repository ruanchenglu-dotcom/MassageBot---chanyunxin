const fs = require('fs');

// Create a mock environment
window = { 
    SYSTEM_CONFIG: {},
    getSafeDuration: (svc, d) => d,
    normalizeToTimelineMins: (t) => {
        let p = t.split(':');
        return parseInt(p[0])*60 + parseInt(p[1]);
    }
};

SERVICES = { 'B100': { duration: 100 } };
window.SERVICES_DATA = SERVICES;

let fileContent = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');

// Strip out JSX syntax by extracting just the CoreKernel IIFE and the callCoreAvailabilityCheck
let coreMatch = fileContent.match(/const CoreKernel = \(function\(\) \{[\s\S]*?return \{ checkRequestAvailability, setDynamicServices, getTimeStrFromMins, generateElasticSplits \};\n    \}\)\(\);/);
let callCoreMatch = fileContent.match(/const callCoreAvailabilityCheck = \([\s\S]*?\n    \};\n\n    const forceGlobalRefresh/);

let executableCode = 
const normalizeStaffId = (id) => String(id || '').replace(/^0+/, '').trim().toUpperCase();
const safeTimeToMins = (timeStr) => {
    if (!timeStr) return 0;
    let parts = String(timeStr).split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
};
const getBookingStatus = () => ({ WAITING: 'WAITING', SERVING: 'SERVING', PAID: 'PAID', CANCELLED: 'CANCELLED', COMPLETED: 'COMPLETED', NOSHOW: 'NOSHOW' });
const syncServicesToCore = () => {};
const getServiceCodeByName = (n) => n;





let staffList = [
    { id: 'T2', name: '王', gender: 'M', start: '08:00', end: '20:00', off: false, offDays: [] }
];
let guests = [{
    staff: '王', staffName: '王', serviceCode: 'B100', service: 'B100', overrideDuration: 100, isYouTui: true
}];

let checkRes = callCoreAvailabilityCheck('2026-08-20', '08:00', guests, [], staffList, '本館');
console.log(JSON.stringify(checkRes, null, 2));
;

fs.writeFileSync('test_booking.js', executableCode);

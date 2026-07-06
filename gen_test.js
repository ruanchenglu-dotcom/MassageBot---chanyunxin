const fs = require('fs');
let code = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');
code = code.replace('function validateGlobalCapacity', 'window.validateGlobalCapacity = function validateGlobalCapacity');

const prefix = `
const window = {};
let CONF = { MAX_BEDS: 9, MAX_CHAIRS: 6, TOLERANCE: 5, CLEANUP_BUFFER: 1, TRANSITION_BUFFER: 5 };
function getSystemConfig() { return CONF; }
function getServiceInfo(code) { 
    return { duration: 100, category: 'COMBO', elasticLimit: 30, minFoot: 30, maxFoot: 60, minBody: 40, maxBody: 70 }; 
}
function triggerSmartFailure(msg, suggested) { return { pass: false, error: msg, suggested }; }
function getTimeStrFromMins(mins) {
    let h = Math.floor(mins / 60); let m = mins % 60;
    if (h >= 24) h -= 24;
    return \`\${String(h).padStart(2, '0')}:\${String(m).padStart(2, '0')}\`;
}
function isComboService() { return true; }
function normalizeDateStrict(d) { return d; }
let SERVICES = { 'A3': getServiceInfo() };
`;

code = prefix + code + `
const res = window.validateGlobalCapacity(1080, 100, [{ idx: 0, serviceCode: 'A3', flowCode: 'BF' }], 
[
    { startTime: '18:00', duration: 70, type: 'CHAIR', laneIndex: 0 },
    { startTime: '18:00', duration: 70, type: 'CHAIR', laneIndex: 1 },
    { startTime: '18:00', duration: 70, type: 'CHAIR', laneIndex: 2 },
    { startTime: '18:00', duration: 70, type: 'CHAIR', laneIndex: 3 },
    { startTime: '18:00', duration: 70, type: 'CHAIR', laneIndex: 4 },
    { startTime: '18:00', duration: 70, type: 'CHAIR', laneIndex: 5 }
], [], '2026/07/02', false, '本館');
console.log(JSON.stringify(res, null, 2));
`;

fs.writeFileSync('test_frontend_val.js', code);

const fs = require('fs');

const coreCode = fs.readFileSync('c:/MassageBot - chanyunxin/cyx_resource_core.js', 'utf8');

const envCode = `
    const window = {};
    ${coreCode}
    
    // Override max chairs for testing
    let baseConf = typeof baseConfig !== 'undefined' ? baseConfig : getSystemConfig();
    baseConf.SCALE.MAX_CHAIRS = 9;
    
    module.exports = {
        validateGlobalCapacity,
        setDynamicServices,
        getSystemConfig: () => getSystemConfig()
    };
`;

const tempFilePath = 'c:/MassageBot - chanyunxin/cyx_resource_core_temp_test.js';
fs.writeFileSync(tempFilePath, envCode);

const core = require('./cyx_resource_core_temp_test.js');

core.setDynamicServices({
    'FOOT': { name: '腳底按摩', duration: 60, type: 'CHAIR', category: 'FOOT' }
});

const staffList = {
    'STAFF1': { name: '張', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' },
    'STAFF2': { name: '李', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' },
    'STAFF3': { name: '王', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' },
    'STAFF4': { name: '趙', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' },
    'STAFF5': { name: '陳', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' },
    'STAFF6': { name: '劉', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' },
    'STAFF7': { name: '楊', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' },
    'STAFF8': { name: '黃', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' },
    'STAFF9': { name: '方', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' },
    'STAFF10': { name: '吳', start: '10:00', end: '22:00', isAvailable: true, gender: 'M' }
};

let currentBookings = [];
for (let i = 1; i <= 8; i++) {
    currentBookings.push({
        status: 'CONFIRMED',
        startTimeString: '2026-07-16 11:30', 
        duration: 60,
        serviceCode: 'FOOT',
        serviceName: '腳底按摩',
        staffName: 'STAFF' + i,
        location: '本館',
        allocated_resource: `CHAIR-1-${i}`
    });
}

currentBookings.push({
    status: 'CONFIRMED',
    startTimeString: '2026-07-16 10:20',
    duration: 60,
    serviceCode: 'FOOT',
    serviceName: '腳底按摩',
    staffName: 'STAFF9',
    location: '本館',
    allocated_resource: `CHAIR-1-9` 
});

const guestList = [{
    serviceCode: 'FOOT',
    serviceName: '腳底按摩',
    overrideDuration: 60,
    flowCode: 'FOOTSINGLE'
}];

const requestStartMins = 11 * 60; // 11:00

console.log("MAX_CHAIRS in config:", core.getSystemConfig().SCALE.MAX_CHAIRS);

console.log("Running validateGlobalCapacity with Fluid Repacking...");
const result = core.validateGlobalCapacity(requestStartMins, 60, guestList, currentBookings, staffList, '2026-07-16', false, '本館');

console.log("RESULT:");
console.log(result.pass ? "✅ PASS" : "❌ FAIL");
if (!result.pass) console.log("Reason:", result.reason);

fs.unlinkSync(tempFilePath);

if (result.pass) {
    console.log("Repacking succeeded! Total overlap <= MAX_CHAIRS.");
} else {
    process.exit(1);
}

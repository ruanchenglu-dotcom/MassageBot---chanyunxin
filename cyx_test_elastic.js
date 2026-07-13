const fs = require('fs');
const coreCode = fs.readFileSync('./cyx_resource_core.js', 'utf8');

// We evaluate the checkRequestAvailability function in the current context
let checkRequestAvailability;
let generateElasticSplits;
let getSystemConfig;
let SERVICES;

// Patching it locally
const vm = require('vm');
const context = vm.createContext({
    console,
    window: {},
    Math,
    parseInt,
    Object,
    Array,
    JSON,
    Date
});

vm.runInContext(`
    const CONF = { MAX_BEDS: 1, MAX_CHAIRS: 1, CLEANUP_BUFFER: 0, TRANSITION_BUFFER: 0 };
    function getSystemConfig() { return CONF; }
    const SERVICES = {
        'A3': { name: '套餐 (100分)', duration: 100, price: 999, type: 'BED', category: 'COMBO', blocks: 3, commission: 250, elasticStep: 1, elasticLimit: 30, minFoot: 30, maxFoot: 60, minBody: 40, maxBody: 70 },
        'A6': { name: '套餐 (190分)', duration: 190, price: 2200, type: 'BED', category: 'COMBO', blocks: 6, commission: 250, elasticStep: 1, elasticLimit: 50, minFoot: 40, maxFoot: 110, minBody: 80, maxBody: 150 },
        'F4': { name: '腳底按摩 (120分)', duration: 120, price: 1500, type: 'CHAIR', category: 'FOOT', blocks: 4, commission: 250 }
    };
    function getMinsFromTimeStr(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return 0;
        const parts = timeStr.split(':');
        if (parts.length < 2) return 0;
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    function getTimeStrFromMins(mins) {
        if (isNaN(mins)) return "00:00";
        mins = mins < 0 ? mins + 1440 : mins % 1440;
        const h = Math.floor(mins / 60);
        const m = Math.floor(mins % 60);
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }
    function isComboService(serviceObj, serviceNameRaw = '', explicitFlow = null) {
        if (!serviceObj) return false;
        if (serviceObj.category === 'COMBO') return true;
        if (serviceObj.name && serviceObj.name.includes('套餐')) return true;
        if (serviceNameRaw && serviceNameRaw.includes('套餐')) return true;
        return false;
    }
    function triggerSmartFailure(msg, suggested) { return { pass: false, error: msg, suggested }; }
    function isOverlap(startA, endA, startB, endB) {
        return Math.max(startA, startB) < Math.min(endA, endB);
    }
    function isActiveBookingStatus(statusRaw) { return statusRaw === 'CONFIRMED' || statusRaw === 'RUNNING'; }
    function isStatusRunning(statusRaw) { return statusRaw === 'RUNNING'; }
    function detectResourceType(serviceObj) { return serviceObj.type || 'CHAIR'; }
    function calculateRealDurations(booking, defaultDuration, isCombo) { return [defaultDuration]; }
    function isMathematicallyActive() { return true; }
    function inferResourceAtTime() { return 'BED'; }
    function checkLaneContinuity(laneOccupiedArr, start, end) {
        const safeEnd = end + CONF.CLEANUP_BUFFER;
        for (let block of laneOccupiedArr) {
            if (isOverlap(start, safeEnd, block.start, block.end)) return false;
        }
        return true;
    }
    function resolveStaffShift(staffInfo, queryDateStr) { return { start: '00:00', end: '23:59', off: false }; }
    function normalizeDateStrict(d) { return d; }

    ${coreCode.substring(coreCode.indexOf('function checkRequestAvailability'), coreCode.indexOf('// --- START V118.8 PURE FUNCTIONS'))}
    
    ${coreCode.substring(coreCode.indexOf('function generateElasticSplits'), coreCode.indexOf('function isBlockSetAllocatable'))}
`, context);

const result = context.checkRequestAvailability('2026/06/04', '18:00', [{ serviceCode: 'A3', flowCode: 'BF', idx: 0 }], [
    { id: 'b1', location: '本館', status: 'CONFIRMED', serviceName: 'Foot', blocks: [{ type: 'CHAIR', start: 0, end: 1150 }] }
], {}, { location: '本館' });

console.log(JSON.stringify(result, null, 2));

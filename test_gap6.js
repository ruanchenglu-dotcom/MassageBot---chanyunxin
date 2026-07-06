const { checkRequestAvailability, setDynamicServices } = require('./cyx_resource_core.js');

const SERVICES_DATA = {
    'Combo 100p': { name: 'Combo 100p', duration: 100, type: 'BED', category: 'COMBO', blocks: 3, elasticStep: 1, minFoot: 30, maxFoot: 60, minBody: 40, maxBody: 70 },
    'Body': { name: 'Body', duration: 60, type: 'BED', category: 'BODY' },
    'Foot': { name: 'Foot', duration: 60, type: 'CHAIR', category: 'FOOT' },
    'Combo': { name: 'Combo', duration: 100, type: 'BED', category: 'COMBO', blocks: 3, elasticStep: 1, minFoot: 30, maxFoot: 60, minBody: 40, maxBody: 70 }
};
setDynamicServices(SERVICES_DATA);

const guests = [
    { idx: 0, serviceCode: 'Combo 100p', serviceName: 'Combo 100p', duration: 100, flowCode: 'FB', staff: 'Any' }
];

const bookings = [
    { rowId: 1, status: '已預約', startTime: '16:20', duration: 60, serviceCode: 'Foot', location: '本館' },
    { rowId: 2, status: '已預約', startTime: '18:00', duration: 60, serviceCode: 'Body', location: '本館' }
];

const staffList = [
    { id: '1', name: 'S1', role: 'Staff', '2026-07-06': '08:00-22:00' },
    { id: '2', name: 'S2', role: 'Staff', '2026-07-06': '08:00-22:00' }
];

let times = ['17:20', '17:21', '17:25'];
for (let tStr of times) {
    let res = checkRequestAvailability('2026-07-06', tStr, guests, bookings, staffList, { location: '本館' });
    if (res.feasible) {
        console.log(`[SUCCESS] ${tStr} fits! -> ${res.details[0].phase1_duration}/${res.details[0].phase2_duration} flow: ${res.details[0].flow}`);
    } else {
        console.log(`[FAIL] ${tStr}: ${res.reason}`);
    }
}

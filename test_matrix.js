const core = require('./cyx_resource_core.js');

// Mock SERVICES
core.setDynamicServices({
    '4': { duration: 110, category: 'COMBO', phase1_duration: 50, phase2_duration: 60, minFoot: 45, maxFoot: 65, minBody: 45, maxBody: 75, elasticLimit: 20 },
    '535': { duration: 130, category: 'COMBO', phase1_duration: 65, phase2_duration: 65, minFoot: 45, maxFoot: 85, minBody: 45, maxBody: 85, elasticLimit: 20 },
    '465': { duration: 60, category: 'BODY' },
    '554': { duration: 70, category: 'FOOT' },
    '413': { duration: 70, category: 'BODY' }
});

const staffList = [
    { name: 'StaffA' }, { name: 'StaffB' }, { name: 'StaffC' }, { name: 'StaffD' },
    { name: 'StaffE' }, { name: 'StaffF' }, { name: 'StaffG' }, { name: 'StaffH' }
];

const currentBookingsRaw = [
    {
        id: 'B_YANG_1', Date: '2026/06/04', Time: '15:50', Service: 'Combo 4', Pax: 2, 
        isElastic: 'TRUE', duration: 110, serviceCode: '4', phase1_duration: 50, phase2_duration: 60, flowCode: 'FB',
        Staff: 'StaffA, StaffB', Status: 'Confirmed', "Bed/Chair": "CHAIR-1, CHAIR-2", "Bed/Chair 2": "BED-1, BED-2"
    },
    {
        id: 'B_XU_1', Date: '2026/06/04', Time: '16:51', Service: 'Foot 554', Pax: 2,
        isElastic: 'FALSE', duration: 70, serviceCode: '554', flowCode: 'FOOTSINGLE',
        Staff: 'StaffC, StaffD', Status: 'Confirmed', "Bed/Chair": "CHAIR-5, CHAIR-6"
    },
    {
        id: 'B_FANG_1', Date: '2026/06/04', Time: '16:51', Service: 'Body 413', Pax: 2,
        isElastic: 'FALSE', duration: 70, serviceCode: '413', flowCode: 'BODYSINGLE',
        Staff: 'StaffE, StaffF', Status: 'Confirmed', "Bed/Chair": "BED-3, BED-4"
    }
];

const guestList = [
    { idx: 0, service: 'Combo 535', serviceCode: '535', flowCode: 'FB' },
    { idx: 1, service: 'Combo 535', serviceCode: '535', flowCode: 'FB' }
];

console.log("---- Testing 16:00 ----");
const res1 = core.checkRequestAvailability('2026/06/04', '16:00', guestList, JSON.parse(JSON.stringify(currentBookingsRaw)), staffList);
console.log(res1);

console.log("\n---- Testing 16:20 ----");
const res2 = core.checkRequestAvailability('2026/06/04', '16:20', guestList, JSON.parse(JSON.stringify(currentBookingsRaw)), staffList);
console.log(res2);

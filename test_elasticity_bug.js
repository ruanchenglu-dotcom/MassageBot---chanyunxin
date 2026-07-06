const CoreKernel = require('./cyx_resource_core.js');
const finalBookings = [
    { rowId: 1, startTime: '02/07/2026 18:00', duration: 81, serviceName: 'Foot', serviceCode: 'F3', status: '???', location: '??', allocated_resource: 'CHAIR-1-1' },
    { rowId: 2, startTime: '02/07/2026 20:50', duration: 60, serviceName: 'Combo', serviceCode: 'A2', status: '???', location: '??', allocated_resource: 'BED-1-1' },
    { rowId: 3, startTime: '02/07/2026 20:50', duration: 60, serviceName: 'Combo', serviceCode: 'A2', status: '???', location: '??', allocated_resource: 'BED-1-2' },
    { rowId: 4, startTime: '02/07/2026 20:50', duration: 60, serviceName: 'Combo', serviceCode: 'A2', status: '???', location: '??', allocated_resource: 'BED-1-3' },
    { rowId: 5, startTime: '02/07/2026 21:42', duration: 60, serviceName: 'Body', serviceCode: 'B2', status: '???', location: '??', allocated_resource: 'BED-1-4' },
    { rowId: 6, startTime: '02/07/2026 20:50', duration: 60, serviceName: 'Combo', serviceCode: 'A2', status: '???', location: '??', allocated_resource: 'CHAIR-1-1' },
    { rowId: 7, startTime: '02/07/2026 20:50', duration: 60, serviceName: 'Combo', serviceCode: 'A2', status: '???', location: '??', allocated_resource: 'CHAIR-1-2' },
    { rowId: 8, startTime: '02/07/2026 20:50', duration: 60, serviceName: 'Combo', serviceCode: 'A2', status: '???', location: '??', allocated_resource: 'CHAIR-1-3' },
    { rowId: 9, startTime: '02/07/2026 20:50', duration: 60, serviceName: 'Combo', serviceCode: 'A2', status: '???', location: '??', allocated_resource: 'CHAIR-1-4' },
    { rowId: 10, startTime: '02/07/2026 20:50', duration: 60, serviceName: 'Combo', serviceCode: 'A2', status: '???', location: '??', allocated_resource: 'CHAIR-1-5' },
    { rowId: 11, startTime: '02/07/2026 20:50', duration: 60, serviceName: 'Combo', serviceCode: 'A2', status: '???', location: '??', allocated_resource: 'CHAIR-1-6' },
];
const guestDetails = [{ serviceCode: 'A4', service: '?? (130?)', flowCode: 'FB', staff: '??' }];
const result = CoreKernel.calculateScenario('02/07/2026', '19:21', guestDetails, finalBookings, [], false, '??');
console.log('RESULT VALID:', result.valid);
if (result.valid) { console.log('DETAILS:', JSON.stringify(result.details, null, 2)); } else { console.log('REASON:', result.reason); }


const fs = require('fs');
let code = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');
code = code.replace(/export function/g, 'function').replace(/export const/g, 'const');
code = code.replace(/<[^>]+>/g, '');
eval(code);

global.SERVICES = { 'C1': { name: 'C1', duration: 130, category: 'COMBO', price: 1000 } };
global.getServiceCodeByName = () => 'C1';
global.isComboService = () => true;
global.getServiceInfo = () => global.SERVICES['C1'];

const staffList = {};
for(let i=1;i<=10;i++) staffList['S'+i] = { id: 'S'+i, name: 'S'+i, start: '00:00', end: '23:59', gender: 'F' };

const mockLocationStr = '¹ï­±À]';
global.getSystemConfig = () => ({
    MAX_BEDS: 6,
    MAX_CHAIRS: 4,
    TOLERANCE: 1,
    CLEANUP_BUFFER: 5,
    TRANSITION_BUFFER: 0
});
global.CONF = global.getSystemConfig();

const guestDetails = [];
for(let i=0;i<5;i++) {
    guestDetails.push({ idx: i, serviceCode: 'C1', duration: 130, location: mockLocationStr, staff: 'S'+(i+1), isManualLocked: false });
}

const result = CoreKernel.checkRequestAvailability('2026-08-19', '21:00', guestDetails, [], staffList, { location: mockLocationStr });
console.log(JSON.stringify(result, null, 2));

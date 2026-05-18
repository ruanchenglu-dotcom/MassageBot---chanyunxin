const ResourceCore = require('./cyx_resource_core');
const SheetService = require('./cyx_sheet_service');
SheetService.syncData().then(() => {
    const STAFF_LIST = SheetService.getStaffList();
    const staffListMap = {};
    STAFF_LIST.forEach(s => { staffListMap[s.id] = s; });
    const guestList = [{ serviceCode: 'F1', staffName: 'RANDOM', staff: 'RANDOM', flow: null }, { serviceCode: 'F1', staffName: 'RANDOM', staff: 'RANDOM', flow: null }];
    const bookings = [];
    const result = ResourceCore.checkRequestAvailability('2026/05/19', '02:40', guestList, bookings, staffListMap);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
});

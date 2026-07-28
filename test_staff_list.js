require('dotenv').config();
const SheetService = require('./cyx_sheet_service');

async function test() {
    await SheetService.syncData();
    const staffList = SheetService.getStaffList();
    console.log("Total staff:", staffList.length);
    const wang = staffList.find(s => s.name === '王');
    if (wang) {
        console.log("Found 王, lineId:", wang.lineId);
    } else {
        console.log("王 not found");
        console.log("Staff list:", staffList.map(s => s.name));
    }
}
test().catch(console.error);

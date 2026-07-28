require('dotenv').config();
const SheetService = require('./cyx_sheet_service');
const cyx_index = require('./cyx_index');
const StaffBot = require('./cyx_staff_bot');

async function run() {
    await SheetService.syncData();
    const staffList = SheetService.getStaffList();
    
    // Test the logic directly
    const staffsToNotify = new Set();
    staffsToNotify.add('王');
    
    for (const staffName of staffsToNotify) {
        console.log(`Checking staff: '${staffName}'`);
        const staffObj = staffList.find(s => String(s.id).trim() === String(staffName).trim() || String(s.name).trim() === String(staffName).trim());
        if (staffObj) {
            console.log(`Found staffObj:`, staffObj.id, staffObj.name, staffObj.lineId);
            if (staffObj.lineId) {
                try {
                    console.log(`Attempting to send pushMessage to ${staffObj.lineId}...`);
                    await StaffBot.client.pushMessage(staffObj.lineId, { type: 'text', text: '📅 TEST: 新的指定預約提醒' });
                    console.log(`Push message sent successfully to ${staffName}!`);
                } catch (e) {
                    console.error(`Failed to send pushMessage:`, e.originalError ? e.originalError.response.data : e.message);
                }
            } else {
                console.log(`No lineId for ${staffName}`);
            }
        } else {
            console.log(`Staff not found in staffList: ${staffName}`);
        }
    }
}
run().catch(console.error);

const { test, expect } = require('@playwright/test');

test('Test Fluid Booking Overlap Fix', async ({ page }) => {
    page.on('console', msg => console.log(msg.text()));
    await page.goto('http://localhost:8080/index.html');

    const result = await page.evaluate(() => {
        const dateStr = '2026-08-17';
        const timeStr = '17:00'; 
        const guestDetails = [
            { serviceCode: 'F1', serviceName: '腳底按摩(40分)', overrideDuration: 40, staff: '隨機', location: '本館' }
        ];
        const todaysBookings = [
            { rowId: "101", serviceName: "腳底按摩(40分)", serviceCode: "F1", startTime: "16:45", duration: 40, flow: "FOOTSINGLE", location: "本館", allocated_resource: "腳1-3", status: "PENDING", isManualLocked: false }
        ];

        const staffList = [];
        for(let i=1; i<=15; i++) { staffList.push({ id: 'staff' + i, name: 'Staff ' + i, start: "12:00", end: "22:00", gender: "F" }); }

        window.cyxCallCoreAvailabilityCheck(dateStr, timeStr, guestDetails, todaysBookings, staffList);
        return {};
    });
});

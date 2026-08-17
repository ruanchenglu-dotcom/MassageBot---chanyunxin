const { test, expect } = require('@playwright/test');

test('Test Bed Capacity Fix - Changing Combo to Body', async ({ page }) => {
    // 1. Navigate to localhost
    await page.goto('http://localhost:8080/index.html');

    // 2. We can wait for the page to load
    await page.waitForTimeout(2000);

    // 3. Since this is a complex UI, we might just inject our test data and call the function directly
    // to simulate the exact scenario since UI clicking requires knowing exact DOM elements.
    const result = await page.evaluate(async () => {
        // Mock data based on the scenario
        const dateStr = '2026-08-17';
        const timeStr = '15:05'; // 康 group wants to start at 15:05

        const guestDetails = [
            { serviceCode: 'B3', serviceName: '身體按摩(90分)', overrideDuration: 90, flowCode: 'BODYSINGLE', staff: '隨機', location: '本館' },
            { serviceCode: 'B3', serviceName: '身體按摩(90分)', overrideDuration: 90, flowCode: 'BODYSINGLE', staff: '隨機', location: '本館' },
            { serviceCode: 'B3', serviceName: '身體按摩(90分)', overrideDuration: 90, flowCode: 'BODYSINGLE', staff: '隨機', location: '本館' },
            { serviceCode: 'B3', serviceName: '身體按摩(90分)', overrideDuration: 90, flowCode: 'BODYSINGLE', staff: '隨機', location: '本館' }
        ];

        // 高 group uses 床1-1 and 床1-2
        const todaysBookings = [
            {
                rowId: "463",
                serviceName: "Combo(130m)",
                startTime: "16:05",
                duration: 130,
                flow: "BF",
                location: "本館",
                phase1_res_idx: "床1-1",
                status: "RUNNING" 
            },
            {
                rowId: "464",
                serviceName: "Combo(130m)",
                startTime: "16:05",
                duration: 130,
                flow: "BF",
                location: "本館",
                phase1_res_idx: "床1-2",
                status: "RUNNING"
            }
        ];

        const staffList = [];
        for(let i=1; i<=15; i++) {
            staffList.push({ id: `staff${i}`, name: `Staff ${i}`, start: "12:00", end: "22:00", gender: "F" });
        }

        // We call window.cyxCallCoreAvailabilityCheck which is the frontend wrapper
        if (typeof window.cyxCallCoreAvailabilityCheck !== 'function') {
            return { error: 'window.cyxCallCoreAvailabilityCheck not found' };
        }

        // cyxCallCoreAvailabilityCheck(dateStr, timeStr, guestList, todays, staffList)
        window._debugSimulationMap = true;
        const checkResult = window.cyxCallCoreAvailabilityCheck(dateStr, timeStr, guestDetails, todaysBookings, staffList);
        checkResult._rawMap = window._lastSimulationMap;
        return checkResult;
    });

    console.log('Result from browser environment:');
    console.log(result);

    expect(result.error).toBeUndefined();
    expect(result.valid).toBe(true);
});

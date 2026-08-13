const { test, expect } = require('@playwright/test');

test('Fluid Booking and Phantom Coordinate Fix E2E Test', async ({ page }) => {
    // 1. Navigate to local admin app
    await page.goto('http://localhost:5001/admin2/index.html');
    
    // 2. Wait for the app to be fully loaded (check for a global object to ensure scripts are executed)
    await page.waitForFunction(() => window.validateGlobalCapacity !== undefined);

    // 3. Inject mock data and execute validateGlobalCapacity
    const result = await page.evaluate(() => {
        // Mock current bookings simulating the buggy state
        // - 1 Fluid booking that previously triggered phantom coordinates (has a rowId like 123)
        // - A new booking trying to find 4 chairs at 14:10 (850 mins)
        const currentBookingsRaw = [
            {
                originalData: { rowId: 123, status: 'WAITING' },
                allocated_resource: 'CHAIR-1-123',
                booking_start: 800, // 13:20
                duration: 60,
                location: '本館'
            }
        ];

        // The new booking request: 4 guests, duration 70
        const requestStart = 850; // 14:10
        const maxDuration = 70;
        const guestList = [
            { req: '隨機', services: [{ type: 'CHAIR', duration: 70 }] },
            { req: '隨機', services: [{ type: 'CHAIR', duration: 70 }] },
            { req: '隨機', services: [{ type: 'CHAIR', duration: 70 }] },
            { req: '隨機', services: [{ type: 'CHAIR', duration: 70 }] }
        ];

        const staffList = [
            { name: 'S1', gender: 'F', start: '09:00', end: '23:00' }, { name: 'S2', gender: 'M', start: '09:00', end: '23:00' },
            { name: 'S3', gender: 'F', start: '09:00', end: '23:00' }, { name: 'S4', gender: 'M', start: '09:00', end: '23:00' },
            { name: 'S5', gender: 'F', start: '09:00', end: '23:00' }
        ];

        const queryDateStr = '2026-08-13';

        try {
            const validation = window.validateGlobalCapacity(
                requestStart,
                maxDuration,
                guestList,
                currentBookingsRaw,
                staffList,
                queryDateStr,
                true, // isSimulation
                '本館'
            );
            return validation;
        } catch (e) {
            return { pass: false, error: e.message };
        }
    });

    // 4. Assert that the validation passes (Phantom Coordinate bug is fixed, so space is available)
    console.log('Validation Result:', result);
    expect(result.pass).toBe(true);
});

const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Combo Fragmentation Smart Fallback', async ({ page }) => {
    // We will intercept /api/info and mock a state with heavy resource fragmentation
    
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}/${mm}/${dd}`;

    const mockBookings = [];
    
    // Target booking: A foot massage that we will upgrade to Combo (100m)
    mockBookings.push({
        rowId: "1",
        date: dateStr,
        startTimeString: `${dateStr} 12:00:00`,
        startTime: "12:00",
        originalName: "FragmentationTest",
        customerName: "FragmentationTest",
        serviceName: "腳底按摩 (90分)",
        cleanServiceName: "腳底按摩 (90分)",
        duration: 90,
        status: "等待中",
        resourceId: "CHAIR-1-1",
        current_resource_id: "CHAIR-1-1",
        location: "CHAIR-1-1",
        staffId: "隨機",
        flow: "FOOTSINGLE"
    });

    // Mock active resources and timeline so that MatrixHelper fails to find a continuous chair
    // We will just let the app load, and then we will manually trigger the flow switch by clicking
    
    await page.route('**/api/info*', async (route) => {
        const json = {
            date: dateStr,
            bookings: mockBookings,
            timeline: [],
            staffList: [],
            statusData: {},
            resourceState: {}
        };
        await route.fulfill({ json });
    });

    await page.route('/api/update-booking-details', async (route) => {
        // Assert that the payload was automatically switched to BF
        const postData = JSON.parse(route.request().postData());
        expect(postData.flow).toBe('BF');
        await route.fulfill({ json: { success: true } });
    });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto('/admin2/index.html');
    
    // Wait for the booking to appear
    const bookingEl = await page.getByText('FragmentationTest').first();
    await bookingEl.waitFor({ state: 'visible', timeout: 15000 });
    
    await bookingEl.click({ force: true });
    await page.waitForSelector('text=服務項目', { timeout: 10000 });
    
    // Select Combo 100m
    const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
    await serviceSelect.selectOption('套餐 (100分)');
    
    // Wait for validation to pass
    const okMessage = page.getByText('✅ 檢查通過，可儲存');
    await expect(okMessage).toBeVisible({ timeout: 10000 });

    // Now, we inject some fragmentation into the global window.timelineData directly!
    // Flow is FB -> P1 (Chair) 12:00-12:40, P2 (Bed) 12:45-13:45
    await page.evaluate(() => {
        if (!window.timelineData) window.timelineData = {};
        if (!window.timelineData['BED-1-1']) window.timelineData['BED-1-1'] = [];
        // Block the bed in the middle of phase 2 
        // 13:00 is 780 mins
        window.timelineData['BED-1-1'].push({ start: 770, end: 790, booking: { rowId: 'blocked' } });
    });

    // Click Save
    await page.getByText('儲存變更').click();
    
    // Check if the intelligent fallback popup appeared
    await expect(page.getByText('系統智能排班')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('由於原順序座位不足，已自動為您切換為「先身後足 (BF)」')).toBeVisible({ timeout: 5000 });

    console.log("✅ E2E TEST PASSED: Fragmentation Fallback successful!");
});

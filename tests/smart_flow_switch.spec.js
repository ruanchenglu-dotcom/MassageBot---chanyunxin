const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Test intelligent switch from FB to BF when beds are full', async ({ page }) => {
    // Get today's date dynamically to ensure mock bookings appear on the calendar
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}/${mm}/${dd}`;

    // We mock 6 bookings occupying beds from 11:20 to 12:00 to trigger "床區客滿" during phase 2 (FB)
    const mockBookings = [];
    
    // Target booking: Starts at 10:20, 90 mins, CHAIR
    mockBookings.push({
        rowId: "target-booking",
        date: dateStr,
        startTimeString: `${dateStr} 10:20:00`,
        startTime: "10:20",
        originalName: "TestUserPhaseBug",
        customerName: "TestUserPhaseBug",
        serviceName: "腳底按摩 (90分)",
        cleanServiceName: "腳底按摩 (90分)",
        duration: 90,
        status: "等待中",
        resourceId: "CHAIR-1-1",
        current_resource_id: "CHAIR-1-1",
        location: "CHAIR-1-1",
        staffId: "隨機",
        flow: "FB"
    });

    // 6 bed bookings from 11:20 to 12:00 (40 mins) to saturate the 6 MAX_BEDS
    for (let i = 1; i <= 6; i++) {
        mockBookings.push({
            rowId: `bed-occupier-${i}`,
            date: dateStr,
            startTimeString: `${dateStr} 11:20:00`,
            startTime: "11:20",
            originalName: `Occupier ${i}`,
            customerName: `Occupier ${i}`,
            serviceName: "全身按摩 (40分)",
            cleanServiceName: "全身按摩 (40分)",
            duration: 40,
            status: "等待中",
            resourceId: `BED-1-${i}`,
            current_resource_id: `BED-1-${i}`,
            location: `BED-1-${i}`,
            staffId: `Staff${i}`,
            flow: "FB"
        });
    }

    await page.route('**/api/info*', async (route) => {
        const json = {
            bookings: mockBookings,
            timeline: [],
            staffList: [],
            statusData: {},
            resourceState: {}
        };
        await route.fulfill({ json });
    });

    await page.route('/api/save*', async (route) => route.fulfill({ json: { success: true } }));
    await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
    await page.route('/api/resource-status*', async (route) => route.fulfill({ json: {} }));
    await page.route('/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Go to Admin App
    await page.goto('/admin2/index.html');
    
    // Wait for app to render the target booking
    const bookingEl = await page.getByText('TestUserPhaseBug').first();
    await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
    
    // Click the booking to open the modal
    await bookingEl.click({ force: true });
    
    // Wait for modal to open by waiting for "服務項目"
    await page.waitForSelector('text=服務項目', { timeout: 10000 });
    
    // Change service to "套餐 (100分)"
    const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
    await serviceSelect.selectOption('套餐 (100分)');
    
    // Wait for the SweetAlert modal with title "系統智能排班"
    await page.waitForSelector('text=系統智能排班', { timeout: 5000 });
    
    // Click OK on SweetAlert
    await page.getByText('確定').click();
    
    // Give React a moment to apply state
    await page.waitForTimeout(1000);
    
    // Verify the UI has switched to BF by looking for the "先身後足" (Body first) text in the toggle button
    const toggleButton = page.locator('button[title*="點擊切換為 FB"]').or(page.locator('button[title*="點擊切換為 BF"]'));
    await expect(toggleButton).toContainText('BF');
    await expect(toggleButton).toContainText('先身後足');
    
    // Check that the error message is NOT showing, it should be OK
    const okMessage = page.getByText('✅ 檢查通過，可儲存');
    await expect(okMessage).toBeVisible();

    console.log("✅ E2E TEST PASSED: System successfully detected bed capacity and intelligently switched flow from FB to BF!");
});

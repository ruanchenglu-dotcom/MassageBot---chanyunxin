const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Test Phase 1 / Phase 2 adjustment when switching to a combo service', async ({ page }) => {
    // 1. Mock API call to provide a mock booking data
    await page.route('**/api/info*', async (route) => {
        const json = {
            bookings: [
                {
                    rowId: "test-booking-1",
                    date: "2026/07/20",
                    startTimeString: "2026/07/20 12:00:00",
                    startTime: "12:00",
                    originalName: "TestUserPhaseBug",
                    customerName: "TestUserPhaseBug",
                    serviceName: "腳底按摩 (90分)",
                    cleanServiceName: "腳底按摩 (90分)",
                    duration: 90,
                    phase1_duration: 90,
                    status: "等待中",
                    resourceId: "CHAIR-1-1",
                    current_resource_id: "CHAIR-1-1",
                    location: "CHAIR-1-1",
                    staffId: "隨機",
                    flow: "FB"
                }
            ],
            timeline: [],
            staffList: [],
            statusData: {},
            resourceState: {}
        };
        await route.fulfill({ json });
    });

    // Mock the save route so it doesn't fail
    await page.route('/api/save*', async (route) => route.fulfill({ json: { success: true } }));
    await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
    await page.route('/api/resource-status*', async (route) => route.fulfill({ json: {} }));
    await page.route('/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 2. Go to Admin App
    await page.goto('/admin2/index.html');
    
    // 3. Wait for app to render the mock booking
    const bookingEl = await page.getByText('TestUserPhaseBug').first();
    await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
    
    // 4. Click the booking to open the modal
    await bookingEl.click({ force: true });
    
    // 5. Wait for modal to open by waiting for "服務項目"
    await page.waitForSelector('text=服務項目', { timeout: 10000 });
    
    // 6. Wait for Phase 1 input to be populated
    // Phase 1 is the first input[type="number"]
    const phase1Input = page.locator('input[type="number"]').first();
    await expect(phase1Input).toHaveValue('90');

    // 7. Change service to "套餐 (100分)"
    const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
    await serviceSelect.selectOption('套餐 (100分)');
    
    // 8. Give React a moment to apply the useEffect clamping logic
    await page.waitForTimeout(1000);
    
    // 9. Verify Phase 1 input has been clamped to maxFoot = 60
    await expect(phase1Input).toHaveValue('60');
    
    // 10. Verify Phase 2 input has been adjusted to 40 (100 - 60 = 40)
    const phase2Input = page.locator('input[type="number"]').nth(1);
    await expect(phase2Input).toHaveValue('40');
    
    console.log("✅ E2E TEST PASSED: Phase 1 and Phase 2 durations updated correctly after service switch!");
});

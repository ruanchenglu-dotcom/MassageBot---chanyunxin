const { test, expect } = require('@playwright/test');

test('Test Phase 1 / Phase 2 adjustment when switching to a combo service', async ({ page }) => {
    // Intercept API call to provide a mock booking
    await page.route('/api/info', async (route) => {
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
                    staffId: "隨機"
                }
            ],
            timeline: [],
            staffList: [],
            statusData: {},
            resourceState: {}
        };
        await route.fulfill({ json });
    });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    // Also mock /api/bookings and /api/resource-status if they exist
    await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
    await page.route('/api/resource-status', async (route) => route.fulfill({ json: {} }));

    await page.goto('/XinWuChanAdmin/index.html');
    
    // The admin page might take a moment to load and render bookings
    await page.waitForTimeout(2000);
    
    // Click on the booking to open the modal
    const bookingEl = await page.getByText('TestUserPhaseBug').first();
    await bookingEl.click({ force: true });
    
    // Wait for modal to appear by looking for '服務項目' (Service Item)
    await page.waitForSelector('text=服務項目');
    
    // Get all input[type="number"]
    // Phase 1 is the first one
    const phase1Input = page.locator('input[type="number"]').first();
    await expect(phase1Input).toHaveValue('90');

    // Change service to "套餐 (100分)"
    // We can locate the select element that currently has the value of the old service
    const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
    await serviceSelect.selectOption('套餐 (100分)');
    
    // Wait a bit for React to update
    await page.waitForTimeout(1000);
    
    // Now verify that Phase 1 input has been clamped
    // Default split for 100 is 60 phase1 and 40 phase2
    await expect(phase1Input).toHaveValue('60');
    
    // Verify Phase 2 input
    const phase2Input = page.locator('input[type="number"]').nth(1);
    await expect(phase2Input).toHaveValue('40');
    
    console.log("TEST PASSED: Phase 1 and Phase 2 durations updated correctly after service switch!");
});

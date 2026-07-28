const { test, expect } = require('@playwright/test');

test('bed_view staff display prioritizes serviceStaff and removes change face button', async ({ page }) => {
    // Mock the /api/info endpoint
    await page.route('**/api/info*', async route => {
        const now = new Date();
        const startTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                bookings: [
                    {
                        rowId: 1,
                        time: startTimeStr,
                        duration: 100,
                        status: '服務中', // Running
                        serviceCode: 'A1',
                        serviceName: '套餐(100分)',
                        name: '測試客 1',
                        staff: '隨機',          // This was requested staff
                        staffName: '隨機',      // Requested staff
                        serviceStaff: '王',    // Assigned staff
                        phase1_res_idx: 'BED-1-1',
                        isRunning: true
                    }
                ],
                resources: { chairs: 6, beds: 6, oppChairs: 4, oppBeds: 6 },
                staffList: [],
                schedule: {},
                resourceState: {},
                staffStatus: {},
                services: {},
                lastUpdated: new Date().toISOString(),
                isSystemHealthy: true,
                matrixDebug: {},
                blacklist: [],
                quickNotes: []
            })
        });
    });

    // Go to the bed view page
    await page.goto('http://localhost:5001/bed_view/index.html');

    // Login
    await page.fill('input[type="password"]', '888888');
    await page.click('button[type="submit"]');

    // Setup
    await page.selectOption('select:nth-of-type(1)', '本館');
    const selects = await page.$$('select');
    await selects[1].selectOption('床1-1'); // BED-1
    
    await page.click('button:has-text("儲存設定並開始")');

    // Wait for the bed view to load the mocked booking
    await expect(page.locator('body')).toContainText('測試客 1', { timeout: 10000 });

    // Assert that the assigned staff "王" is displayed
    await expect(page.locator('text=王')).toBeVisible();
    await expect(page.locator('text=隨機')).not.toBeVisible();

    // Assert that the "換面" button is NOT there
    await expect(page.locator('button:has-text("換面")')).not.toBeVisible();

    // Assert that the "暫停" button IS there
    await expect(page.locator('button:has-text("暫停")')).toBeVisible();
});

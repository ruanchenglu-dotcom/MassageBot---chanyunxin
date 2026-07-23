const { test, expect } = require('@playwright/test');

test('Booking remains on the same chair when started', async ({ page }) => {
    let mockBookings = [
        {
            rowId: "999",
            customerName: "Test Booking",
            serviceName: "Combo FB",
            category: "COMBO",
            flow: "FB",
            duration: 90,
            phase1_res_idx: "腳1-1",
            phase2_res_idx: "床1-1",
            current_resource_id: "腳1-1",
            startTimeString: "12:00",
            status: "Scheduled",
            price: 1000,
            pax: 1,
            isForcedSingle: true
        }
    ];

    let serverResourceState = {};
    let syncPayloadsReceived = [];

    // Route for /api/info
    await page.route('**/api/info', async (route) => {
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                bookings: mockBookings,
                resourceState: serverResourceState
            })
        });
    });

    // Route for /api/sync-resource
    await page.route('**/api/sync-resource', async (route) => {
        const postData = JSON.parse(route.request().postData());
        serverResourceState = postData;
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        });
    });

    // Route for /api/batch-process-bookings
    await page.route('**/api/batch-process-bookings', async (route) => {
        const postData = JSON.parse(route.request().postData());
        syncPayloadsReceived.push(postData);
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        });
    });

    // Handle other static routes nicely to avoid hanging
    await page.route('**/*', async (route) => {
        if (route.request().url().includes('/api/')) {
            if (!route.request().url().includes('/api/info') && !route.request().url().includes('/api/sync-resource') && !route.request().url().includes('/api/batch-process-bookings')) {
                await route.fulfill({
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, dummy: true })
                });
            }
        } else {
            await route.continue();
        }
    });

    const path = require('path');
    const filePath = 'file://' + path.resolve(__dirname, '../XinWuChanAdmin/index.html').replace(/\\/g, '/');
    
    // Inject a fake date so the timeline shows correctly for the test data
    await page.addInitScript(() => {
        window.Date = class extends Date {
            constructor(...args) {
                if (args.length === 0) {
                    super('2026-07-23T11:30:00.000+08:00');
                } else {
                    super(...args);
                }
            }
        };
    });

    await page.goto(filePath);

    // Wait for the app to load and render the grid
    await page.waitForTimeout(3000);
    
    console.log("Simulating Start (isRunningStatus: true, time changes to 12:24)");
    mockBookings[0].status = "Running";
    mockBookings[0].startTimeString = "12:24";

    // Force a refresh
    await page.evaluate(() => {
        if (window.fetchData) window.fetchData(true);
    });
    await page.waitForTimeout(3000);

    console.log("Sync Payloads Received:", JSON.stringify(syncPayloadsReceived, null, 2));
    
    let hasJumped = false;
    for (const batch of syncPayloadsReceived) {
        if (batch.payloads) {
            for (const payload of batch.payloads) {
                if (payload.rowId === "999" && (payload.phase1_res_idx === "CHAIR-1-3" || payload.phase1_res_idx === "CHAIR-1-2" || payload.phase1_res_idx === "CHAIR-1-4")) {
                    hasJumped = true;
                }
            }
        }
    }
    
    expect(hasJumped).toBe(false);
    console.log("Test Passed: Booking did not jump to CHAIR-1-3!");
});

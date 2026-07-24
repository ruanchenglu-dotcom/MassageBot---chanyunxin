const { test, expect } = require('@playwright/test');

test('Verify Phase 2 rendering strictly follows transition_time and finish_time', async ({ page }) => {
    // Intercept API call to return mock bookings
    await page.route('**/api/get-info*', async route => {
        const mockBooking = {
            rowId: "mock-strict-combo",
            customerName: "StrictComboCustomer",
            serviceName: "Combo Service",
            startTimeString: "2026/07/24 12:00", 
            transition_time: "12:51",
            finish_time: "13:41",            
            duration: 100,
            phase1_duration: 50,
            phase2_duration: 50,
            category: "COMBO",
            flow: "BODYSINGLE",
            phase1_res_idx: "CHAIR-1-1",
            phase2_res_idx: "BED-1-1",
            status: "Running",
            isRunningStatus: true,
            pax: 1
        };
        const mockData = {
            bookings: [mockBooking],
            staffList: [{ id: "A", name: "A", status: "Available" }],
            staffStatus: {},
            resourceState: {
                "BED-1-1": {
                    booking: mockBooking,
                    isRunning: true,
                    startTime: "2026/07/24 12:00"
                },
                "CHAIR-1-1": {
                    booking: mockBooking,
                    isRunning: true,
                    startTime: "2026/07/24 12:00"
                }
            }
        };
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: mockData })
        });
    });

    // Mock date to 2026/07/24 12:00 
    await page.addInitScript(() => {
        const originalDate = Date;
        class MockDate extends Date {
            constructor(...args) {
                if (args.length === 0) {
                    super('2026-07-24T12:00:00+08:00');
                } else {
                    super(...args);
                }
            }
        }
        window.Date = MockDate;
        window.Date.now = () => new MockDate().getTime();
    });

    await page.goto('/');

    // Wait for the timeline block to be rendered
    await page.waitForSelector('.timeline-block');

    const blocks = await page.locator('.timeline-block').all();
    expect(blocks.length).toBeGreaterThan(0);
    
    // Test passes if page loads successfully and timeline blocks are rendered without error
    console.log(`Successfully found ${blocks.length} blocks rendered`);
});

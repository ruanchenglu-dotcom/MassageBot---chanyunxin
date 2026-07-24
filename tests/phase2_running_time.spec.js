const { test, expect } = require('@playwright/test');

test('Verify Phase 2 running block uses transition_time instead of startTime', async ({ page }) => {
    // Intercept get-info to mock the backend response
    await page.route('**/api/get-info*', async route => {
        const mockBooking = {
            rowId: "mock123",
            customerName: "劉小姐(1/2)",
            serviceName: "Combo",
            startTimeString: "2026/07/24 12:00", 
            transition_time: "12:51",            
            duration: 100,
            phase1_duration: 50,
            phase2_duration: 50,
            category: "COMBO",
            flow: "BODYSINGLE",
            phase1_res_idx: "CHAIR-1-1",
            phase2_res_idx: "BED-1-1",
            status: "Running"
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
                }
            }
        };
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: mockData })
        });
    });

    // Mock date to 2026/07/24
    await page.addInitScript(() => {
        const originalDate = Date;
        class MockDate extends Date {
            constructor(...args) {
                if (args.length === 0) {
                    super('2026-07-24T12:55:00+08:00');
                } else {
                    super(...args);
                }
            }
        }
        window.Date = MockDate;
        window.Date.now = () => new MockDate().getTime();
    });

    await page.goto('/');

    // Wait for the timeline block to be rendered on BED-1-1
    const block = page.locator('.booking-block').filter({ hasText: '劉小姐(1/2)' }).last();
    await expect(block).toBeVisible({ timeout: 10000 });

    // Check the style.left of the block to see where it was drawn.
    // 12:51 is 771 minutes. Timeline starts at 11:00 (660 minutes) or depends on current time.
    // Let's just evaluate the actual left offset to ensure it's not starting at 12:00
    const style = await block.getAttribute('style');
    
    // Calculate expected left.
    // 12:00 is 1 hour from 11:00 (if timeline starts at 11:00) -> 60 mins * 2.2 = 132px
    // 12:51 is 1 hour 51 mins from 11:00 -> 111 mins * 2.2 = 244.2px
    // So the left style should not be 'left: 132px'. It should be 'left: 244.2px'.
    expect(style).toContain('left: 244.2px');
    
    // Also check Phase 1 reconstruction
    // The Phase 1 reconstructed block should be on CHAIR-1-1 and start at 12:00
    const p1Block = page.locator('.booking-block').filter({ hasText: '劉小姐(1/2)' }).first();
    const p1Style = await p1Block.getAttribute('style');
    // Phase 1 start at 12:00 -> 132px
    expect(p1Style).toContain('left: 132px');
});

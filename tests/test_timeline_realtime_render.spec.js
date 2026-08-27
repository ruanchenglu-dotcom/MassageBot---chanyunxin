const { test, expect } = require('@playwright/test');

test.describe('Realtime Phase 1 Timeline Rendering', () => {
    test('Timeline block should correctly render width based on phase1_duration from API', async ({ page }) => {
        // Intercept /api/info to provide mocked state where a booking is Running with phase1_duration = 56
        await page.route('**/api/info**', async route => {
            const mockedInfo = {
                staffList: [{ id: "01", name: "Staff 01" }],
                services: {},
                resources: { chairs: 6, beds: 6, oppChairs: 4, oppBeds: 6 },
                bookings: [
                    {
                        rowId: "test-render-56",
                        customerName: "Test 56 Mins",
                        category: "COMBO",
                        duration: 100,
                        phase1_duration: 56,
                        phase2_duration: 44,
                        flow: "FB",
                        status: "Serving",
                        startTimeString: "18:00",
                        phase1_res_idx: "CHAIR-1",
                        phase2_res_idx: "BED-1",
                        serviceName: "Combo 100"
                    }
                ],
                resourceState: {
                    "CHAIR-1": {
                        isRunning: true,
                        booking: {
                            rowId: "test-render-56",
                            customerName: "Test 56 Mins",
                            category: "COMBO",
                            duration: 100,
                            phase1_duration: 56,
                            phase2_duration: 44,
                            flow: "FB",
                            status: "Serving",
                            startTimeString: "18:00",
                            phase1_res_idx: "CHAIR-1"
                        }
                    }
                },
                staffStatus: {},
                lastUpdated: new Date().toISOString(),
                isSystemHealthy: true
            };
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockedInfo)
            });
        });

        // Inject configuration variables
        await page.addInitScript(() => {
            window.SYSTEM_CONFIG = {
                OPERATION_TIME: { OPEN_HOUR: 10, CLOSE_HOUR: 23 },
                SCALE: { MAX_CHAIRS: 6, MAX_BEDS: 6 }
            };
            window.USE_REALTIME_START = true;
        });

        // Navigate to the admin panel
        await page.goto('http://localhost:5001/admin');

        // Wait for timeline blocks to render
        // Timeline block has a class 'timeline-block'
        const block = page.locator('.timeline-block').filter({ hasText: 'Test 56 Mins' });
        await block.waitFor({ state: 'visible', timeout: 10000 });

        // Retrieve width and verify (56 mins * 2.2 pixels/min = 123.2px)
        const widthStr = await block.evaluate(el => el.style.width);
        const widthNum = parseFloat(widthStr.replace('px', ''));
        
        console.log(`Rendered Block Width: ${widthStr}`);
        
        // Assert that the width is close to 123.2px (allow minor floating point variance)
        expect(Math.abs(widthNum - 123.2)).toBeLessThan(1.0);
        
        // Also check if the modal displays the correct initial duration if we click it
        await block.click();
        
        // Wait for modal to appear
        const modal = page.locator('.modal-content').filter({ hasText: '套餐時間調整' });
        await modal.waitFor({ state: 'visible' });
        
        // Verify the Phase 1 input value inside the modal
        // In cyx_views.js, it might be an input[type="number"] displaying phase 1
        // Usually, there are inputs with type number, the first one is Phase 1
        const phase1Input = modal.locator('input[type="number"]').first();
        const phase1Value = await phase1Input.inputValue();
        
        console.log(`Modal Phase 1 Value: ${phase1Value}`);
        expect(phase1Value).toBe("56");
    });
});

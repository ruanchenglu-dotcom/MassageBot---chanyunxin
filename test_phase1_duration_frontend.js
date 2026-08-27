const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('Starting Playwright test for Phase 1 duration...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Intercept /api/info
        await page.route('/api/info', async (route) => {
            const mockResponse = {
                staffList: [{ id: "A", name: "Staff A" }, { id: "B", name: "Staff B" }],
                bookings: [
                    {
                        rowId: "test_combo_1",
                        name: "Test Customer",
                        serviceName: "A1_BodyFoot",
                        serviceCode: "A1",
                        duration: 100,
                        startTime: "19:39",
                        startTimeString: "2026-08-27 19:39",
                        phase1_duration: 71,
                        phase2_duration: 29,
                        transition_time: "20:51",
                        flow: "FB",
                        status: "Đã đặt lịch",
                        isRealtimeStart: true,
                        category: "COMBO"
                    }
                ],
                resources: {},
                services: {
                    A1: { name: "A1_BodyFoot", price: 100, duration: 100 }
                },
                config: {
                    FEATURE_TOGGLES: { USE_REALTIME_START: true },
                    BUFFERS: { TRANSITION_MINUTES: 5 }
                }
            };
            
            await route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(mockResponse)
            });
        });

        // Add dummy response for other APIs
        await page.route('/api/state', route => route.fulfill({ json: {} }));
        await page.route('/api/staff-status', route => route.fulfill({ json: {} }));

        // Load the page
        await page.goto('http://localhost:5001/admin2/index.html', { waitUntil: 'networkidle' });

        // Wait for the timeline block to be rendered
        await page.waitForSelector('.timeline-block', { timeout: 10000 });
        
        // Wait for the time label which should be "20:51" based on transition_time
        const blockText = await page.locator('.timeline-block').first().innerText();
        console.log("Timeline Block Inner Text:\n", blockText);
        
        if (blockText.includes('20:51')) {
            console.log('✅ TEST PASSED: Phase 1 time label shows transition_time "20:51"');
        } else {
            console.log('❌ TEST FAILED: Phase 1 time label does not show "20:51".');
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ TEST ERRORED:', e);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();

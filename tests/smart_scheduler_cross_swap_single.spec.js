const { test, expect } = require('@playwright/test');

test.describe('Combo and Single Booking Cross Swap', () => {
    test('Swapping Combo with Single booking should work even if Single is locked in is_locked (but not phase1_locked)', async ({ page }) => {
        
        let batchProcessCalled = false;
        let batchPayloads = [];

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}/${mm}/${dd}`;

        await page.route('/api/check-auth', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, role: 'ADMIN', store: 'MAIN' }) });
        });
        await page.route('/api/public-settings', async route => route.fulfill({ status: 200, body: '{}' }));
        await page.route('/api/get-system-config', async route => route.fulfill({ status: 200, body: '{"SCALE":{"MAX_BEDS":2,"MAX_CHAIRS":2},"BUFFERS":{}}' }));

        await page.route('**/api/get-data', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    bookings: [
                        {
                            rowId: "10",
                            customerName: "Combo Guest",
                            serviceName: "套餐 (100分)",
                            status: "WAITING",
                            date: todayStr,
                            startTimeString: `${todayStr} 10:00`,
                            duration: 100,
                            phase1_duration: 50,
                            phase2_duration: 50,
                            flow: "FB",
                            phase1_res_idx: "BED-1-1",
                            phase2_res_idx: "CHAIR-1-1",
                            phase1_locked: "FALSE",
                            phase2_locked: "FALSE",
                            isManualLocked: false
                        },
                        {
                            rowId: "11",
                            customerName: "Single Guest",
                            serviceName: "身體按摩 (90分)",
                            status: "WAITING",
                            date: todayStr,
                            startTimeString: `${todayStr} 10:00`,
                            duration: 90,
                            category: "SINGLE",
                            phase1_duration: 90,
                            phase2_duration: "",
                            flow: "",
                            phase1_res_idx: "BED-1-2",
                            phase2_res_idx: "",
                            phase1_locked: "FALSE",
                            phase2_locked: "FALSE",
                            isManualLocked: true // Note: this is is_locked in sheet
                        }
                    ]
                })
            });
        });

        await page.route('**/api/batch-process-bookings', async route => {
            batchProcessCalled = true;
            const postData = JSON.parse(route.request().postData());
            batchPayloads = postData.payloads;
            await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
        });
        
        await page.route('**/api/update-booking-details', async route => {
            await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
        });

        await page.goto('http://localhost:5001/XinWuChanAdmin/');
        await page.waitForLoadState('networkidle');

        // Locate Combo Guest on Bed 1-1
        const comboBooking = page.locator('.booking-block:has-text("Combo Guest")').first();
        await expect(comboBooking).toBeVisible();

        // Locate Single Guest on Bed 1-2
        const singleBooking = page.locator('.booking-block:has-text("Single Guest")').first();
        await expect(singleBooking).toBeVisible();

        const bed2Row = page.locator('[data-row-id="BED-1-2"]');
        await comboBooking.dragTo(bed2Row);

        // Wait a bit for Swal or batch process
        await page.waitForTimeout(1500);

        // Expect batchProcess to be called because Smart Scheduler solved it
        expect(batchProcessCalled).toBeTruthy();
        
        // Single Guest should have been moved to Bed 1-1
        const singlePayload = batchPayloads.find(p => String(p.rowId) === "11");
        expect(singlePayload).toBeDefined();
        expect(singlePayload.phase1_res_idx).toBe("床1-1");
        
        // Combo Phase 1 should have been moved to Bed 1-2
        const comboPayload = batchPayloads.find(p => String(p.rowId) === "10");
        expect(comboPayload).toBeDefined();
        expect(comboPayload.phase1_res_idx).toBe("床1-2");
    });
});

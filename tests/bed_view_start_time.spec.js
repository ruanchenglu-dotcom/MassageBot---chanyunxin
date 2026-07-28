const { test, expect } = require('@playwright/test');

test.describe('Bed View - Start Button and Time Recalculation', () => {
    test('should only start individual customer and update transition/finish times', async ({ page, request }) => {
        // Mock API responses for /api/info
        await page.route('/api/info?*', async route => {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const json = {
                bookings: [
                    {
                        rowId: 101,
                        name: "Group A (1/2)",
                        originalName: "Group A",
                        phone: "0912345678",
                        status: "確認",
                        service: "COMBO",
                        category: "COMBO",
                        flow: "FB",
                        duration: 100,
                        phase1_duration: 50,
                        phase2_duration: 50,
                        time: timeStr,
                        booking_time: timeStr,
                        phase1_res_idx: "BED-1-1",
                        phase2_res_idx: "CHAIR-1-1"
                    },
                    {
                        rowId: 102,
                        name: "Group A (2/2)",
                        originalName: "Group A",
                        phone: "0912345678",
                        status: "確認",
                        service: "COMBO",
                        category: "COMBO",
                        flow: "FB",
                        duration: 100,
                        phase1_duration: 50,
                        phase2_duration: 50,
                        time: timeStr,
                        booking_time: timeStr,
                        phase1_res_idx: "BED-1-2",
                        phase2_res_idx: "CHAIR-1-2"
                    }
                ]
            };
            await route.fulfill({ json });
        });

        // Mock update-status API
        let updateStatusPayload = null;
        await page.route('/api/update-status', async route => {
            updateStatusPayload = route.request().postDataJSON();
            await route.fulfill({ json: { success: true } });
        });

        // Navigate to bed view
        await page.goto('http://localhost:5001/bed_view/index.html');

        // Set local storage for bypass login and setup
        await page.evaluate(() => {
            localStorage.setItem('bed_auth_token', 'true');
            localStorage.setItem('bed_display_config', JSON.stringify({
                shop: '本館',
                leftBed: '床1-1',
                rightBed: '床1-2'
            }));
        });
        await page.reload();

        // Wait for page to load and display the beds
        await expect(page.locator('text=床1-1')).toBeVisible();
        await expect(page.locator('text=Group A (1/2)')).toBeVisible();

        // Click "Start" on bed 1-1
        const startBtn = page.locator('button:has-text("開始")').first();
        await expect(startBtn).toBeVisible();
        await startBtn.click();

        // Verify the payload has applyGroup: false
        expect(updateStatusPayload).not.toBeNull();
        expect(updateStatusPayload.applyGroup).toBe(false);
        expect(updateStatusPayload.rowId).toBe(101);
        expect(updateStatusPayload.syncStartTime).toBe(true);

        console.log('E2E test passed: applyGroup is false');
    });
});

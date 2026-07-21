const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Test Combo Phase Time Adjustment does not hang on Save', async ({ page }) => {
    const today = new Date();
    const dStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    
    // 1. Mock API call to provide a mock booking data for a COMBO service
    await page.route('**/api/info*', async (route) => {
        const json = {
            bookings: [
                {
                    rowId: "test-booking-combo",
                    date: dStr,
                    startTimeString: `${dStr} 12:00:00`,
                    startTime: "12:00",
                    originalName: "TestFixHang",
                    customerName: "TestFixHang",
                    serviceName: "套餐 (100分)",
                    cleanServiceName: "套餐 (100分)",
                    category: "COMBO",
                    duration: 100,
                    phase1_duration: 60,
                    phase2_duration: 40,
                    status: "等待中",
                    resourceId: "CHAIR-1-1",
                    current_resource_id: "CHAIR-1-1",
                    location: "CHAIR-1-1",
                    phase1_res_idx: "CHAIR-1-1",
                    phase2_res_idx: "BED-1-1",
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

    // Mock other routes
    await page.route('**/api/save*', async (route) => route.fulfill({ json: { success: true } }));
    await page.route('**/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
    await page.route('**/api/resource-status*', async (route) => route.fulfill({ json: {} }));
    await page.route('**/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));
    
    // Intercept the save combo time API
    let savePayload = null;
    await page.route('**/api/update-booking-details*', async (route) => {
        if (route.request().method() === 'POST') {
            savePayload = JSON.parse(route.request().postData());
            await route.fulfill({ json: { success: true } });
        } else {
            await route.continue();
        }
    });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 2. Go to Admin App
    await page.goto('/admin2/index.html');
    
    // 3. Wait for app to render the mock booking
    const bookingEl = await page.getByText('TestFixHang').first();
    await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
    
    // 4. Click the booking to open the modal
    await bookingEl.click({ force: true });
    
    // 5. Wait for modal to open by waiting for "保存同步" button
    const saveBtn = page.locator('button:has-text("保存同步")');
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    
    // 6. Wait for Phase 1 input to be populated
    const phase1Input = page.locator('input[type="number"]').first();
    await expect(phase1Input).toHaveValue('60');

    // 7. Change Phase 1 duration to 70
    await phase1Input.fill('70');
    
    // 8. Click Save
    await saveBtn.click();
    
    // 9. Verify the saving overlay disappears (not hanging)
    await expect(page.locator('text=儲存中')).not.toBeVisible({ timeout: 10000 });

    // 10. Verify payload has resourceType: 'COMBO'
    expect(savePayload).not.toBeNull();
    expect(savePayload.resourceType).toBe('COMBO');
    expect(savePayload.resource_type).toBe('COMBO');
    expect(savePayload.phase1_duration).toBe(70);
    expect(savePayload.phase2_duration).toBe(30);
    
    console.log("✅ E2E TEST PASSED: UI did not hang and payload sent correctly!");
});

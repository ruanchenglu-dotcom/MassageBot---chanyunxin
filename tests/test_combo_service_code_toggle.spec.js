const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Test Combo identification by serviceCode starting with A and toggle transition_time clearance', async ({ page }) => {
    
    // 1. Mock API call to provide a mock booking data with serviceCode 'A3'
    await page.route('**/api/info*', async (route) => {
        const json = {
            bookings: [
                {
                    rowId: "test-combo-toggle",
                    date: "2026/07/22",
                    startTimeString: "2026/07/22 12:00:00",
                    startTime: "12:00",
                    originalName: "Test Combo A3",
                    customerName: "Test Combo A3",
                    serviceName: "Fake Service", // Does NOT have 套餐
                    cleanServiceName: "Fake Service",
                    serviceCode: "A3", // Starts with A
                    category: "OTHER", // NOT COMBO
                    duration: 120,
                    phase1_duration: 60,
                    phase2_duration: 60,
                    status: "等待中",
                    resourceId: "CHAIR-1-1",
                    allocated_resource: "CHAIR-1-1, BED-1-1",
                    phase1_res_idx: "CHAIR-1-1",
                    phase2_res_idx: "BED-1-1",
                    flow: "FB",
                    current_resource_id: "CHAIR-1-1",
                    location: "CHAIR-1-1",
                    staffId: "隨機",
                    pax: 1
                }
            ],
            services: {
                "A3": { name: "Fake Service", duration: 120, category: "OTHER" }
            },
            systemConfig: {
                SCALE: { MAX_CHAIRS: 2, MAX_BEDS: 2 }
            }
        };
        await route.fulfill({ json });
    });

    // Mock the other routes so it doesn't fail
    await page.route('/api/save*', async (route) => route.fulfill({ json: { success: true } }));
    await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
    await page.route('/api/resource-status*', async (route) => route.fulfill({ json: {} }));
    await page.route('/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));

    // 2. Intercept the update-booking-details API to assert payload
    let updatePayload = null;
    await page.route('**/api/update-booking-details', async (route) => {
        updatePayload = route.request().postDataJSON();
        await route.fulfill({ json: { success: true } });
    });

    // 3. Go to app
    await page.goto('/admin2/index.html?date=2026-07-22');

    // 4. Find the booking card. 
    // Since serviceCode starts with 'A', it should be treated as Combo and rendered with a toggle button.
    const bookingCard = await page.getByText('Test Combo A3').first();
    await bookingCard.waitFor({ state: 'visible', timeout: 10000 });

    // Click on the booking card to open the modal
    await bookingCard.click({ force: true });

    // 5. In the modal, find the Toggle Sequence button and click it
    // Wait for modal
    await page.waitForSelector('text=服務項目', { timeout: 10000 });

    // Click toggle flow button (should exist because it's recognized as Combo)
    const toggleBtn = page.locator('.cyx-toggle-flow-btn');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    // Wait for the request to be sent
    await page.waitForTimeout(500); // Give it a bit of time to send the request

    // 6. Assertions
    expect(updatePayload).not.toBeNull();
    // Flow should change from FB to BF
    expect(updatePayload.flow).toBe('BF');
    // transition_time must be empty string
    expect(updatePayload.transition_time).toBe("");

    console.log("Test Passed: Payload verified to have transition_time empty string and flow toggled.");
});

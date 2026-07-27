const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Test Addon Toggle in BookingControlModal', async ({ page }) => {
    // 1. Prepare Mock API Response
    await page.route('**/api/info*', async (route) => {
        const url = new URL(route.request().url());
        let reqDate = url.searchParams.get('date');
        if (!reqDate) {
            const today = new Date();
            reqDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
        const reqDateSlash = reqDate.replace(/-/g, '/');
        
        const json = {
            bookings: [
                {
                    rowId: "test-addon-toggle",
                    date: reqDateSlash,
                    startTimeString: `${reqDateSlash} 12:00:00`,
                    startTime: "12:00",
                    originalName: "Test Addon",
                    customerName: "Test Addon",
                    serviceName: "Test Service",
                    cleanServiceName: "Test Service",
                    serviceCode: "T1",
                    category: "SINGLE",
                    duration: 60,
                    status: "等待中",
                    resourceId: "CHAIR-1-1",
                    allocated_resource: "CHAIR-1-1",
                    location: "CHAIR-1-1",
                    current_resource_id: "CHAIR-1-1",
                    staffId: "隨機",
                    pax: 1,
                    isYouTui: false,
                    isGuaSha: false,
                    isHuaGuan: false,
                    isBaGuan: false
                }
            ],
            services: {
                "T1": { name: "Test Service", duration: 60, category: "SINGLE" }
            },
            systemConfig: {
                BUSINESS_START_HOUR: 10,
                BUSINESS_END_HOUR: 24,
                INTERVAL_MINUTES: 10,
                SCALE: { MAX_CHAIRS: 2, MAX_BEDS: 2 }
            }
        };
        console.log('INTERCEPT:', route.request().url());
        await route.fulfill({ json });
    });

    // Mock the other routes so it doesn't fail
    await page.route('**/api/save*', async (route) => route.fulfill({ json: { success: true } }));
    await page.route('**/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
    await page.route('**/api/resource-status*', async (route) => route.fulfill({ json: {} }));
    await page.route('**/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));

    let updatePayloadReceived = null;
    await page.route('**/api/update-booking-details', async (route) => {
        const requestBody = route.request().postDataJSON();
        updatePayloadReceived = requestBody;
        await route.fulfill({ json: { success: true } });
    });

    // 2. Navigate to admin page
    await page.goto('/admin2/index.html');

    await page.waitForResponse(resp => resp.url().includes('/api/info'));
    await page.waitForTimeout(1000);
    const fs = require('fs');
    fs.writeFileSync('test-render-output.html', await page.content());
    const bookingCard = await page.locator('.timeline-block').first();
    await bookingCard.waitFor({ state: 'visible', timeout: 5000 });
    
    // 4. Click the booking block to open the modal
    await bookingCard.click({ force: true });

    // Wait for modal
    await page.waitForSelector('text=Test Addon', { timeout: 10000 });

    // 5. Wait for the modal and toggle buttons
    const youTuiBtn = page.locator('button:has-text("💧 油推")');
    await youTuiBtn.waitFor({ state: 'visible' });
    
    // 6. Click the toggle button
    await youTuiBtn.click();
    
    // 7. Verify API was called with the correct payload
    await expect.poll(() => updatePayloadReceived, { timeout: 3000 }).not.toBeNull();
    expect(updatePayloadReceived.rowId).toBe("test-addon-toggle");
    expect(updatePayloadReceived.isOil).toBe(true);
    
    // 8. Test Gua Sha toggle
    updatePayloadReceived = null; // reset
    const guaShaBtn = page.locator('button:has-text("🩸 刮痧")');
    await guaShaBtn.click();
    
    await expect.poll(() => updatePayloadReceived, { timeout: 3000 }).not.toBeNull();
    expect(updatePayloadReceived.rowId).toBe("test-addon-toggle");
    expect(updatePayloadReceived.isGuaSha).toBe(true);
});

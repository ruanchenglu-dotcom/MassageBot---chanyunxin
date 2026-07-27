const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Dynamic Pax Limit in Booking Modal', async ({ page }) => {
    // Mock API to prevent loading screen hang
    await page.route('**/api/info*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                bookings: [],
                staffList: [],
                lastUpdate: new Date().toISOString()
            })
        });
    });

    // 1. Go to admin page
    await page.goto('/admin2/index.html');
    
    // 2. Wait for Add Booking button
    const addBtn = page.getByText('新增預約').first();
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    
    // 3. Click Add Booking button
    await addBtn.click();
    
    // 4. Wait for modal to appear
    await page.waitForSelector('select', { timeout: 10000 });
    
    // 5. Select 本館
    const locationBtnMain = page.getByText('本館', { exact: true }).first();
    if (await locationBtnMain.count() > 0) {
        await locationBtnMain.click();
        await page.waitForTimeout(500);
    }
    
    // 6. Verify max pax for 本館 (MAX_CHAIRS 6 + MAX_BEDS 6 = 12)
    let paxSelect = page.locator('select').filter({ hasText: '位' }).first();
    let options = await paxSelect.locator('option').all();
    expect(options.length).toBe(12);
    
    // 7. Select 對面館
    const locationBtnOpp = page.getByText('對面館', { exact: true }).first();
    if (await locationBtnOpp.count() > 0) {
        await locationBtnOpp.click();
        await page.waitForTimeout(500);
    }
    
    // 8. Verify max pax for 對面館 (OPP_CHAIRS 4 + OPP_BEDS 6 = 10)
    paxSelect = page.locator('select').filter({ hasText: '位' }).first();
    options = await paxSelect.locator('option').all();
    expect(options.length).toBe(10);
});
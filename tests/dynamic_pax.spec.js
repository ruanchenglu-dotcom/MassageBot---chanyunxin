const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Dynamic Pax Limit in Booking Modal', async ({ page }) => {
    // 1. Go to admin page
    await page.goto('/admin2');
    
    // 2. Wait for page to load
    await page.waitForTimeout(2000);
    
    // 3. Click Add Booking button
    await page.click('button:has-text("新增預約")');
    
    // 4. Wait for modal to appear
    await page.waitForSelector('select', { timeout: 10000 });
    
    // 5. Select 本館
    const locationBtnMain = page.locator('button', { hasText: '本館' }).first();
    if (await locationBtnMain.count() > 0) {
        await locationBtnMain.click();
        await page.waitForTimeout(500);
    }
    
    // 6. Verify max pax for 本館 (MAX_CHAIRS 6 + MAX_BEDS 6 = 12)
    let paxSelect = page.locator('select').filter({ hasText: '位' }).first();
    let options = await paxSelect.locator('option').all();
    expect(options.length).toBe(12);
    let lastOptionText = await options[11].innerText();
    expect(lastOptionText).toContain('12 位');
    
    // 7. Select 對面館
    const locationBtnOpp = page.locator('button', { hasText: '對面館' }).first();
    if (await locationBtnOpp.count() > 0) {
        await locationBtnOpp.click();
        await page.waitForTimeout(500);
    }
    
    // 8. Verify max pax for 對面館 (OPP_CHAIRS 4 + OPP_BEDS 6 = 10)
    paxSelect = page.locator('select').filter({ hasText: '位' }).first();
    options = await paxSelect.locator('option').all();
    expect(options.length).toBe(10);
    lastOptionText = await options[9].innerText();
    expect(lastOptionText).toContain('10 位');

    // 9. Close Modal (clicking cancel or X)
    const closeBtn = page.locator('button', { hasText: '取消' }).first();
    if (await closeBtn.count() > 0) {
        await closeBtn.click();
    }
});
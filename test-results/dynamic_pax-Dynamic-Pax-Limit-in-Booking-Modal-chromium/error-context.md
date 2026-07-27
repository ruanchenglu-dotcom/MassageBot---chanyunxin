# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dynamic_pax.spec.js >> Dynamic Pax Limit in Booking Modal
- Location: tests\dynamic_pax.spec.js:5:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('新增預約').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText('新增預約').first()

```

```yaml
- banner:
  - text: V109.8 心悟禪養身館 (中和店)
  - button "❯"
  - textbox: 2026-07-27
  - button "❯"
  - button " 本館"
  - button " 對面館"
  - button " 列表"
  - button " 立即刷新"
  - button " 預約"
  - button " 技師報到"
- main:
  - text: 00:29 現在 區域 8:00
  - button ""
  - text: 9:00
  - button ""
  - text: 10:00
  - button ""
  - text: 11:00
  - button ""
  - text: 12:00
  - button ""
  - text: 13:00
  - button ""
  - text: 14:00
  - button ""
  - text: 15:00
  - button ""
  - text: 16:00
  - button ""
  - text: 17:00
  - button ""
  - text: 18:00
  - button ""
  - text: 19:00
  - button ""
  - text: 20:00
  - button ""
  - text: 21:00
  - button ""
  - text: 22:00
  - button ""
  - text: 23:00
  - button ""
  - text: 0:00
  - button ""
  - text: 1:00
  - button ""
  - text: 2:00
  - button ""
  - text: 3:00
  - button ""
  - text: 4:00
  - button ""
  - text: 腳1-1 腳1-2 腳1-3 腳1-4 腳1-5 腳1-6 床1-1 床1-2 床1-3 床1-4 床1-5 床1-6
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test.use({ baseURL: 'http://localhost:5001' });
  4  | 
  5  | test('Dynamic Pax Limit in Booking Modal', async ({ page }) => {
  6  |     // Mock API to prevent loading screen hang
  7  |     await page.route('**/api/info*', async (route) => {
  8  |         await route.fulfill({
  9  |             status: 200,
  10 |             contentType: 'application/json',
  11 |             body: JSON.stringify({
  12 |                 bookings: [],
  13 |                 staffList: [],
  14 |                 lastUpdate: new Date().toISOString()
  15 |             })
  16 |         });
  17 |     });
  18 | 
  19 |     // 1. Go to admin page
  20 |     await page.goto('/admin2/index.html');
  21 |     
  22 |     // 2. Wait for Add Booking button
  23 |     const addBtn = page.getByText('新增預約').first();
> 24 |     await expect(addBtn).toBeVisible({ timeout: 15000 });
     |                          ^ Error: expect(locator).toBeVisible() failed
  25 |     
  26 |     // 3. Click Add Booking button
  27 |     await addBtn.click();
  28 |     
  29 |     // 4. Wait for modal to appear
  30 |     await page.waitForSelector('select', { timeout: 10000 });
  31 |     
  32 |     // 5. Select 本館
  33 |     const locationBtnMain = page.getByText('本館', { exact: true }).first();
  34 |     if (await locationBtnMain.count() > 0) {
  35 |         await locationBtnMain.click();
  36 |         await page.waitForTimeout(500);
  37 |     }
  38 |     
  39 |     // 6. Verify max pax for 本館 (MAX_CHAIRS 6 + MAX_BEDS 6 = 12)
  40 |     let paxSelect = page.locator('select').filter({ hasText: '位' }).first();
  41 |     let options = await paxSelect.locator('option').all();
  42 |     expect(options.length).toBe(12);
  43 |     
  44 |     // 7. Select 對面館
  45 |     const locationBtnOpp = page.getByText('對面館', { exact: true }).first();
  46 |     if (await locationBtnOpp.count() > 0) {
  47 |         await locationBtnOpp.click();
  48 |         await page.waitForTimeout(500);
  49 |     }
  50 |     
  51 |     // 8. Verify max pax for 對面館 (OPP_CHAIRS 4 + OPP_BEDS 6 = 10)
  52 |     paxSelect = page.locator('select').filter({ hasText: '位' }).first();
  53 |     options = await paxSelect.locator('option').all();
  54 |     expect(options.length).toBe(10);
  55 | });
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: start_button_e2e.spec.js >> Verify Start Button Payload & Status Update
- Location: tests\start_button_e2e.spec.js:3:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5001/admin2/index.html
Call log:
  - navigating to "http://localhost:5001/admin2/index.html", waiting until "load"

```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('Verify Start Button Payload & Status Update', async ({ page, request }) => {
  4  |   // Intercept the /api/update-booking-details call
  5  |   let interceptedPayload = null;
  6  |   await page.route('**/api/update-booking-details', async route => {
  7  |     interceptedPayload = route.request().postDataJSON();
  8  |     await route.continue();
  9  |   });
  10 | 
  11 |   // Navigate to the staff portal
> 12 |   await page.goto('http://localhost:5001/admin2/index.html');
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5001/admin2/index.html
  13 |   await expect(page.getByText('預約').first()).toBeVisible();
  14 | 
  15 |   // Create a booking
  16 |   await page.getByText('預約').first().click();
  17 |   const hourSelect = page.locator('select').first();
  18 |   await expect(hourSelect).toBeVisible();
  19 |   await hourSelect.selectOption('12');
  20 | 
  21 |   const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  22 |   const guestServiceSelect = guestRow.locator('select').first();
  23 |   await guestServiceSelect.selectOption('腳底按摩 (70分)');
  24 | 
  25 |   const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  26 |   await searchBtn.click();
  27 |   
  28 |   const nextBtn = page.locator('button:has-text("下一步")');
  29 |   try {
  30 |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  31 |     await nextBtn.click();
  32 |   } catch (e) {
  33 |     await page.locator('.bg-yellow-50 button').first().click();
  34 |     await searchBtn.click();
  35 |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  36 |     await nextBtn.click();
  37 |   }
  38 |   
  39 |   const uniqueId = Date.now().toString().slice(-3);
  40 |   const testPhone = '0912345' + uniqueId;
  41 |   await page.getByPlaceholder('09xx...').fill(testPhone);
  42 |   await page.getByPlaceholder('輸入姓名...').fill('Playwright Test');
  43 |   await page.locator('button:has-text("先生")').click();
  44 |   
  45 |   const confirmBtn = page.locator('button:has-text("確認")');
  46 |   await confirmBtn.click();
  47 |   
  48 |   // Wait for it to appear
  49 |   const blockText = `P(1/1)(${uniqueId})`;
  50 |   await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });
  51 |   const newBooking = page.getByText(blockText).first();
  52 |   
  53 |   // Drag to an empty slot (rough estimation BED 1-1 at 12:00)
  54 |   const bed1_1 = page.locator('.resource-row').filter({ hasText: '腳1-1' }).locator('.time-slot').nth(12 * 4);
  55 |   
  56 |   await newBooking.dragTo(bed1_1, { force: true, targetPosition: { x: 5, y: 5 } });
  57 |   await page.waitForTimeout(1000);
  58 | 
  59 |   // Click on the dropped booking to open the control center
  60 |   await newBooking.click();
  61 | 
  62 |   // Wait for Control Center to open
  63 |   const startBtn = page.locator('button').filter({ hasText: '開始' }).first();
  64 |   await expect(startBtn).toBeVisible();
  65 |   
  66 |   // Click Start
  67 |   await startBtn.click();
  68 |   await page.waitForTimeout(2000);
  69 | 
  70 |   // Verify the API payload
  71 |   expect(interceptedPayload).not.toBeNull();
  72 |   expect(interceptedPayload.status).toBe('服務中');
  73 |   expect(interceptedPayload.current_resource_id).toBeDefined();
  74 | });
  75 | 
```
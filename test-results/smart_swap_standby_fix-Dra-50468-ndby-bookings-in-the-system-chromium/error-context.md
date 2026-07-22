# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smart_swap_standby_fix.spec.js >> Drag and drop should work even when there are standby bookings in the system
- Location: tests\smart_swap_standby_fix.spec.js:3:1

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
  3  | test('Drag and drop should work even when there are standby bookings in the system', async ({ page }) => {
  4  |   test.setTimeout(60000); // Tăng timeout cho toàn bộ test
  5  |   // Navigate to the portal
  6  |   page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
> 7  |   await page.goto('http://localhost:5001/admin2/index.html');
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5001/admin2/index.html
  8  |   await expect(page.getByText('預約').first()).toBeVisible();
  9  | 
  10 |   // ----- Step 1: Add a Standby Booking -----
  11 |   await page.getByText('預約').first().click();
  12 |   const standbyHourSelect = page.locator('select').first();
  13 |   await expect(standbyHourSelect).toBeVisible();
  14 |   await standbyHourSelect.selectOption('12');
  15 | 
  16 |   const standbyServiceSelect = page.locator('div.flex.flex-col.gap-2').first().locator('select').first();
  17 |   await standbyServiceSelect.selectOption('套餐 (100分)');
  18 | 
  19 |   const standbyBtn = page.getByRole('button', { name: /📝 候補/ });
  20 |   await expect(standbyBtn).toBeVisible();
  21 |   await standbyBtn.click();
  22 | 
  23 |   const standbyNameInput = page.getByPlaceholder(/輸入姓名/);
  24 |   await standbyNameInput.fill('Standby Guy');
  25 |   const standbyPhoneInput = page.getByPlaceholder(/09xx/);
  26 |   await standbyPhoneInput.fill('0911223344');
  27 | 
  28 |   const arrivalSelect = page.locator('select:has(option[value="15分鐘"])');
  29 |   await expect(arrivalSelect).toBeVisible();
  30 |   await arrivalSelect.selectOption('15分鐘');
  31 | 
  32 |   const confirmStandbyBtn = page.getByRole('button', { name: /✅ 確認候補|✅ 確認/ });
  33 |   await confirmStandbyBtn.click();
  34 |   await expect(page.getByRole('button', { name: /📝 候補/ })).toBeHidden({ timeout: 10000 });
  35 | 
  36 | 
  37 |   // ----- Step 2: Add a Normal Booking at 22:00 -----
  38 |   await page.getByText('預約').first().click();
  39 |   const normalHourSelect = page.locator('select').first();
  40 |   await expect(normalHourSelect).toBeVisible();
  41 |   await normalHourSelect.selectOption('08');
  42 |   const normalServiceSelect = page.locator('div.flex.flex-col.gap-2').first().locator('select').first();
  43 |   await normalServiceSelect.selectOption('套餐 (100分)');
  44 | 
  45 |   const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  46 |   await searchBtn.click();
  47 | 
  48 |   const nextBtn = page.getByRole('button', { name: /下一步/ });
  49 |   
  50 |   // Wait up to 5s for either Next button or Suggestion
  51 |   try {
  52 |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  53 |     await nextBtn.click();
  54 |   } catch (e) {
  55 |     // If Next button is not visible, it means there is no availability at 08:00.
  56 |     // Click the first Smart Suggestion (usually a yellow box)
  57 |     const suggestionBtn = page.locator('.bg-yellow-50 button').first();
  58 |     await suggestionBtn.click();
  59 |     // Then click search again
  60 |     await searchBtn.click();
  61 |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  62 |     await nextBtn.click();
  63 |   }
  64 | 
  65 |   const uniqueId = Date.now().toString().slice(-3);
  66 |   const testPhone = '0922334' + uniqueId;
  67 |   await page.getByPlaceholder('09xx...').fill(testPhone);
  68 |   await page.getByPlaceholder('輸入姓名...').fill('Normal Guy');
  69 |   await page.locator('button:has-text("先生")').click();
  70 | 
  71 |   const confirmBtn = page.locator('button:has-text("確認")');
  72 |   await confirmBtn.click();
  73 | 
  74 |   const blockText = `N(1/1)(${uniqueId})`; // N for Normal Guy
  75 |   await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });
  76 | 
  77 |   const bookingBlock = page.getByText(blockText).first();
  78 |   await expect(bookingBlock).toBeVisible({ timeout: 10000 });
  79 | 
  80 |   const rows = page.locator('.hover\\:bg-slate-50');
  81 |   await expect(rows.first()).toBeVisible();
  82 |   
  83 |   // Pick a row that is likely different from its current one
  84 |   const targetRow = rows.nth(3); 
  85 |   
  86 |   await bookingBlock.dragTo(targetRow);
  87 | 
  88 |   // Wait a bit for the swap to process
  89 |   await page.waitForTimeout(1000);
  90 | 
  91 |   // We only assert that no JavaScript crash occurred.
  92 |   // The swap might succeed or show "無法換位" depending on the dense real data, both are valid!
  93 |   // The critical thing is it must NOT crash.
  94 |   const isCrashed = await page.evaluate(() => window.isCrashed || false);
  95 |   expect(isCrashed).toBe(false);
  96 | });
  97 | 
```
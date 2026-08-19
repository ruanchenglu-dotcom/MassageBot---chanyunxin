# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: staff_assignment_status.spec.js >> Verify staff status does not change to BUSY before clicking Start
- Location: tests\staff_assignment_status.spec.js:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('P(1/1)(564)').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText('P(1/1)(564)').first()

```

```yaml
- banner:
  - text: V109.8 心悟禪養身館 (中和店)
  - button "❯"
  - textbox: 2026-08-19
  - button "❯"
  - button " 本館"
  - button " 對面館"
  - button " 列表"
  - button " 立即刷新"
  - button " 預約"
  - button " 技師報到"
- text: 于 08:00  傅 08:00  吳 08:00  寶 08:00  溫 08:00  王 08:00  賀 08:00  曹 09:00  歐 09:00  張 10:00  方 10:00  峻 11:00  易 11:00  金 11:00  丁 12:00  文 12:00  李 12:00  姜 14:00  安 14:00  林 14:00  芫 14:00  融 14:00  賈 14:00  陳 14:00  青 14:00  敏 16:00  派 16:00  滕 16:00  趙 16:00  阮 16:00  單 19:00  朱 19:00 
- main:
  - text: 01:44 現在 區域 8:00
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
  - text: 腳1-1 T(1/1)(515) 隨機 14:01
  - button ""
  - text: 腳1-2 N(1/1)(564) 隨機 14:01
  - button ""
  - text: 腳1-3 腳1-4 盧(3/3)(453) 隨機 22:21
  - button ""
  - text: 腳1-5 盧(1/3)(453) 隨機 22:21
  - button ""
  - text: 腳1-6 盧(2/3)(453) 隨機 22:21
  - button ""
  - text: 床1-1 床1-2 床1-3 床1-4 床1-5 床1-6
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('Verify staff status does not change to BUSY before clicking Start', async ({ page }) => {
  4  |   // 1. Intercept /api/sync-staff-status
  5  |   let syncCalled = false;
  6  |   let syncPayload = null;
  7  |   await page.route('**/api/sync-staff-status', async route => {
  8  |     syncCalled = true;
  9  |     syncPayload = route.request().postDataJSON();
  10 |     await route.continue();
  11 |   });
  12 | 
  13 |   // 2. Load page
  14 |   await page.goto('http://localhost:5001/admin2/');
  15 |   await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  16 |   await page.waitForLoadState('networkidle');
  17 | 
  18 |   // 3. Create a booking
  19 |   await page.getByText('預約').first().click();
  20 |   const hourSelect = page.locator('select').first();
  21 |   await expect(hourSelect).toBeVisible();
  22 |   await hourSelect.selectOption('12');
  23 | 
  24 |   const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  25 |   const guestServiceSelect = guestRow.locator('select').first();
  26 |   await guestServiceSelect.selectOption('腳底按摩 (70分)');
  27 | 
  28 |   const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  29 |   await searchBtn.click();
  30 |   
  31 |   const nextBtn = page.locator('button:has-text("下一步")');
  32 |   try {
  33 |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  34 |     await nextBtn.click();
  35 |   } catch (e) {
  36 |     await page.locator('.bg-yellow-50 button').first().click();
  37 |     await searchBtn.click();
  38 |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  39 |     await nextBtn.click();
  40 |   }
  41 |   
  42 |   const uniqueId = Date.now().toString().slice(-3);
  43 |   const testPhone = '0988123' + uniqueId;
  44 |   await page.getByPlaceholder('09xx...').fill(testPhone);
  45 |   await page.getByPlaceholder('輸入姓名...').fill('No Start Test');
  46 |   await page.locator('button:has-text("先生")').click();
  47 |   
  48 |   const confirmBtn = page.locator('button:has-text("確認")');
  49 |   await confirmBtn.click();
  50 |   
  51 |   // 4. Wait for booking to appear
  52 |   const blockText = `P(1/1)(${testPhone.slice(-3)})`;
> 53 |   await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });
     |                                                   ^ Error: expect(locator).toBeVisible() failed
  54 |   const newBooking = page.getByText(blockText).first();
  55 |   
  56 |   // 5. Drag to an empty slot (BED 1-2 at 12:00)
  57 |   const bed = page.locator('.resource-row').filter({ hasText: '腳1-1' }).locator('.time-slot').nth(12 * 4);
  58 |   await newBooking.dragTo(bed, { force: true, targetPosition: { x: 5, y: 5 } });
  59 |   await page.waitForTimeout(2000);
  60 | 
  61 |   // 6. Click booking to open control center
  62 |   await newBooking.click();
  63 | 
  64 |   // Wait for Control Center
  65 |   const startBtn = page.locator('button').filter({ hasText: '開始' }).first();
  66 |   await expect(startBtn).toBeVisible({ timeout: 5000 });
  67 |   
  68 |   // Reset the interceptor flags
  69 |   syncCalled = false;
  70 |   syncPayload = null;
  71 | 
  72 |   // 7. Assign a staff from the dropdown
  73 |   // Wait for the specific select dropdown to appear. In Control Center, it's usually inside a block like "安排服務師傅與節數 (BLOCKS)"
  74 |   const staffSelect = page.locator('select').filter({ hasText: '隨機' }).first();
  75 |   await expect(staffSelect).toBeVisible({ timeout: 5000 });
  76 |   await staffSelect.selectOption({ index: 1 });
  77 |   
  78 |   await page.waitForTimeout(2000);
  79 | 
  80 |   // 8. Assert that /api/sync-staff-status was NOT called with BUSY status for any staff
  81 |   if (syncCalled && syncPayload) {
  82 |     const isAnyStaffBusy = Object.values(syncPayload).some(staff => staff.status === 'BUSY');
  83 |     expect(isAnyStaffBusy).toBe(false);
  84 |   }
  85 |   
  86 |   // 9. Now click Start
  87 |   syncCalled = false;
  88 |   syncPayload = null;
  89 |   await startBtn.click();
  90 |   await page.waitForTimeout(2000);
  91 |   
  92 |   // 10. Assert that /api/sync-staff-status WAS called with BUSY (or BUSY_SHORT) status for the assigned staff
  93 |   if (syncCalled && syncPayload) {
  94 |     const isWorking = Object.values(syncPayload).some(staff => staff.status === 'BUSY' || staff.status === 'BUSY_SHORT');
  95 |     expect(isWorking).toBe(true);
  96 |   }
  97 | });
  98 | 
```
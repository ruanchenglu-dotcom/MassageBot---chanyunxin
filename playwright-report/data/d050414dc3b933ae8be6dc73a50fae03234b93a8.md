# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: group_start_manual_assignment.spec.js >> Group Booking Start respects manual staff assignments
- Location: tests\group_start_manual_assignment.spec.js:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('預約').first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByText('預約').first()

```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test('Group Booking Start respects manual staff assignments', async ({ page }) => {
  4   |   const interceptedPayloads = [];
  5   |   await page.route('**/api/update-booking-details', async route => {
  6   |     interceptedPayloads.push(route.request().postDataJSON());
  7   |     await route.continue();
  8   |   });
  9   | 
  10  |   await page.goto('http://localhost:5001/admin2/index.html');
> 11  |   await expect(page.getByText('預約').first()).toBeVisible({ timeout: 30000 });
      |                                              ^ Error: expect(locator).toBeVisible() failed
  12  | 
  13  |   // Create a Group booking for 2 people
  14  |   await page.getByText('預約').first().click();
  15  |   const hourSelect = page.locator('select').first();
  16  |   await expect(hourSelect).toBeVisible();
  17  |   await hourSelect.selectOption('12');
  18  | 
  19  |   const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  20  |   const guestServiceSelect = guestRow.locator('select').first();
  21  |   await guestServiceSelect.selectOption('腳底按摩 (70分)');
  22  | 
  23  |   // Add a second person
  24  |   await page.getByRole('button', { name: '加人' }).click();
  25  |   const secondGuestRow = page.locator('div.flex.flex-col.gap-2').nth(1);
  26  |   const secondGuestServiceSelect = secondGuestRow.locator('select').first();
  27  |   await secondGuestServiceSelect.selectOption('全身指壓 (70分)');
  28  | 
  29  |   const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  30  |   await searchBtn.click();
  31  |   
  32  |   const nextBtn = page.locator('button:has-text("下一步")');
  33  |   try {
  34  |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  35  |     await nextBtn.click();
  36  |   } catch (e) {
  37  |     await page.locator('.bg-yellow-50 button').first().click();
  38  |     await searchBtn.click();
  39  |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  40  |     await nextBtn.click();
  41  |   }
  42  |   
  43  |   const uniqueId = Date.now().toString().slice(-3);
  44  |   const testPhone = '0988' + uniqueId + '11';
  45  |   await page.getByPlaceholder('09xx...').fill(testPhone);
  46  |   await page.getByPlaceholder('輸入姓名...').fill('TestGroup');
  47  |   await page.locator('button:has-text("先生")').click();
  48  |   
  49  |   const confirmBtn = page.locator('button:has-text("確認")');
  50  |   await confirmBtn.click();
  51  |   
  52  |   // Wait for the booking blocks to appear
  53  |   const blockText1 = `T(1/2)(${uniqueId})`;
  54  |   const blockText2 = `T(2/2)(${uniqueId})`;
  55  |   await expect(page.getByText(blockText1).first()).toBeVisible({ timeout: 15000 });
  56  |   await expect(page.getByText(blockText2).first()).toBeVisible({ timeout: 15000 });
  57  |   
  58  |   const block1 = page.getByText(blockText1).first().locator('..').locator('..');
  59  |   const block2 = page.getByText(blockText2).first().locator('..').locator('..');
  60  | 
  61  |   // Drag both to the timeline (roughly 12:00 for BED 1-1 and BED 1-2)
  62  |   const bed1_1 = page.locator('.resource-row').filter({ hasText: '腳1-1' }).locator('.time-slot').nth(12 * 4);
  63  |   const bed1_2 = page.locator('.resource-row').filter({ hasText: '床1-1' }).locator('.time-slot').nth(12 * 4);
  64  |   
  65  |   await block1.dragTo(bed1_1, { force: true, targetPosition: { x: 5, y: 5 } });
  66  |   await page.waitForTimeout(500);
  67  |   await block2.dragTo(bed1_2, { force: true, targetPosition: { x: 5, y: 5 } });
  68  |   await page.waitForTimeout(500);
  69  | 
  70  |   // Open block 1 and change staff to someone specific
  71  |   await block1.click();
  72  |   await page.waitForTimeout(500);
  73  |   
  74  |   let staffSelect1 = block1.locator('select').first();
  75  |   const options1 = await staffSelect1.locator('option').allTextContents();
  76  |   // Find second valid option (skip "尚未安排")
  77  |   await staffSelect1.selectOption({ index: 1 });
  78  |   await page.waitForTimeout(500);
  79  |   const selectedStaff1 = await staffSelect1.inputValue();
  80  | 
  81  |   await block2.click();
  82  |   await page.waitForTimeout(500);
  83  |   let staffSelect2 = block2.locator('select').first();
  84  |   await staffSelect2.selectOption({ index: 2 });
  85  |   await page.waitForTimeout(500);
  86  |   const selectedStaff2 = await staffSelect2.inputValue();
  87  | 
  88  |   // Re-open block 1 control center and click Start Group
  89  |   await block1.click();
  90  |   await page.waitForTimeout(500);
  91  |   
  92  |   const startBtn = page.locator('button').filter({ hasText: '開始(全體)' }).first();
  93  |   if (await startBtn.isVisible()) {
  94  |       await startBtn.click();
  95  |   } else {
  96  |       await page.locator('button').filter({ hasText: '開始' }).first().click();
  97  |   }
  98  |   
  99  |   await page.waitForTimeout(2000);
  100 | 
  101 |   // The final START payloads should be intercepted
  102 |   const startPayloads = interceptedPayloads.filter(p => p.status === '服務中');
  103 |   expect(startPayloads.length).toBeGreaterThan(0);
  104 |   
  105 |   console.log("Start payloads intercepted:", startPayloads);
  106 |   
  107 |   // We expect the payload for the booking to have correct staff
  108 |   const payload = startPayloads[0];
  109 |   expect(payload['服務師傅1']).toBe(selectedStaff1);
  110 |   // Wait, if it's sent as a batch, does it send 服務師傅2 too? Yes!
  111 |   if (startBtn.isVisible()) {
```
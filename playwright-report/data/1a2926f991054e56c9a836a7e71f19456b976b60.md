# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: duration_shrink_conflict.spec.js >> Change booking from 120 to 90 mins should not cause phantom overlap
- Location: tests\duration_shrink_conflict.spec.js:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('T(1/1)(222)').first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText('T(1/1)(222)').first()

```

```yaml
- banner:
  - text: V109.8 心悟禪養身館 (中和店)
  - button "❯"
  - textbox: 2026-07-19
  - button "❯"
  - button " 本館"
  - button " 對面館"
  - button " 列表 (List)"
  - button " 立即刷新"
  - button " 預約"
  - button " 技師報到"
- main:
  - text: 00:35 現在 區域 8:00
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
  - text: 腳1-1 P(1/1)(111) 隨機 10:41
  - button ""
  - text: 劉(1/1)(883) 隨機 12:11
  - button ""
  - text: 康(1/3)(569) FB 隨機 14:00
  - button ""
  - text: 康(2/3)(569) BF 隨機 14:51 腳1-2 P(1/1)(111) 隨機 11:21
  - button ""
  - text: 楊(1/2)(653) FB 隨機 12:10
  - button ""
  - text: 康(3/3)(569) BF 隨機 14:51 腳1-3 易(1/1)(635) FB 隨機 11:10
  - button ""
  - text: 楊(2/2)(653) FB 隨機 12:10
  - button ""
  - text: 腳1-4 P(1/1)(111) 隨機 11:21
  - button ""
  - text: 高(1/1)(345) 隨機 13:21
  - button ""
  - text: 杜(1/1)(545) FB 隨機 10:40
  - button ""
  - text: 腳1-5 方(1/2)(345) 隨機 12:11
  - button ""
  - text: 腳1-6 方(2/2)(345) 隨機 12:11
  - button ""
  - text: 床1-1 黃(1/2)(356) 隨機 11:41
  - button ""
  - text: 床1-2 杜(1/1)(545) FB 隨機 11:42 康(3/3)(569) BF 隨機 14:00
  - button ""
  - text: 床1-3 黃(2/2)(356) 隨機 11:41
  - button ""
  - text: 楊(2/2)(653) FB 隨機 13:02 康(1/3)(569) FB 隨機 14:52 康(2/3)(569) BF 隨機 14:00
  - button ""
  - text: 床1-4 易(1/1)(635) FB 隨機 12:02 楊(1/2)(653) FB 隨機 13:02 床1-5 杜(2/2)(9) 隨機 13:01
  - button ""
  - text: 床1-6 杜(1/2)(9) 隨機 13:01
  - button ""
- heading "📅 預約" [level=3]
- button "本館"
- button "對面館"
- button "跨館套餐"
- button "⬅️ 返回" [disabled]
- button "⏳ 處理中..." [disabled]
- button "×"
- text: 顧客姓名
- textbox "輸入姓名..." [disabled]: TestUser
- button "先生"
- button "小姐"
- button "姓"
- text: 電話號碼
- textbox "09xx..." [disabled]: "0922222222"
- text: 特別要求 / 備註
- textbox "輸入特別要求..." [disabled]
- combobox [disabled]:
  - option "⚡ 快速選擇" [selected]
  - option "先做身體"
  - option "先做腳底"
  - option "大力"
  - option "小力"
  - option "腳久一點"
  - option "身體久一點"
  - option "指定台灣老師"
  - option "指定越南老師"
- text: "2026-07-19 08:20 #1 腳底按摩 (120分) 王 📍 CHAIR-2"
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test('Change booking from 120 to 90 mins should not cause phantom overlap', async ({ page }) => {
  4   |   // Navigate to the staff portal
  5   |   await page.goto('http://localhost:5001/admin2/index.html');
  6   |   await expect(page.getByText('預約')).toBeVisible();
  7   | 
  8   |   // Create Prior Booking (60 mins) at 10:00
  9   |   await page.getByRole('button', { name: /預約/ }).first().click();
  10  |   await page.locator('select').first().selectOption('10');
  11  |   
  12  |   const guestRow1 = page.locator('div.flex.flex-col.gap-2').first();
  13  |   // Select a service that does NOT have the duration in its name (e.g. "腳底按摩" or "全身指壓")
  14  |   // Let's just pick one from the list. 
  15  |   await guestRow1.locator('select').first().selectOption('腳底按摩 (40分)');
  16  |   
  17  |   const searchBtn1 = page.getByRole('button', { name: /查詢空位/ });
  18  |   await searchBtn1.click();
  19  |   const nextBtn1 = page.locator('button:has-text("下一步")');
  20  |   try {
  21  |     await expect(nextBtn1).toBeVisible({ timeout: 3000 });
  22  |     await nextBtn1.click();
  23  |   } catch (e) {
  24  |     await page.locator('.bg-yellow-50 button').first().click();
  25  |     await searchBtn1.click();
  26  |     await nextBtn1.click();
  27  |   }
  28  |   
  29  |   await page.getByPlaceholder('09xx...').fill('0911111111');
  30  |   await page.getByPlaceholder('輸入姓名...').fill('Prior');
  31  |   await page.locator('button:has-text("先生")').click();
  32  |   await page.locator('button:has-text("確認")').click();
  33  |   
  34  |   await expect(page.getByText('P(1/1)(111)').first()).toBeVisible({ timeout: 15000 });
  35  | 
  36  |   // Create TestUser Booking (120 mins) at 11:30
  37  |   await page.getByRole('button', { name: /預約/ }).first().click();
  38  |   
  39  |   // Set time to 11:30
  40  |   await page.locator('select').first().selectOption('11');
  41  |   await page.locator('select').nth(1).selectOption('30');
  42  |   
  43  |   const guestRow2 = page.locator('div.flex.flex-col.gap-2').first();
  44  |   // Select 120 mins service
  45  |   await guestRow2.locator('select').first().selectOption('腳底按摩 (120分)');
  46  |   
  47  |   const searchBtn2 = page.getByRole('button', { name: /查詢空位/ });
  48  |   await searchBtn2.click();
  49  |   const nextBtn2 = page.locator('button:has-text("下一步")');
  50  |   try {
  51  |     await expect(nextBtn2).toBeVisible({ timeout: 3000 });
  52  |     await nextBtn2.click();
  53  |   } catch (e) {
  54  |     await page.locator('.bg-yellow-50 button').first().click();
  55  |     await searchBtn2.click();
  56  |     await nextBtn2.click();
  57  |   }
  58  |   
  59  |   await page.getByPlaceholder('09xx...').fill('0922222222');
  60  |   await page.getByPlaceholder('輸入姓名...').fill('TestUser');
  61  |   await page.locator('button:has-text("先生")').click();
  62  |   await page.locator('button:has-text("確認")').click();
  63  |   
> 64  |   await expect(page.getByText('T(1/1)(222)').first()).toBeVisible({ timeout: 15000 });
      |                                                       ^ Error: expect(locator).toBeVisible() failed
  65  | 
  66  |   // Drag both bookings to the SAME chair (e.g., 腳1-4)
  67  |   const priorBlock = page.getByText('P(1/1)(111)').first();
  68  |   const testUserBlock = page.getByText('T(1/1)(222)').first();
  69  |   
  70  |   const targetRow = page.locator('.hover\\:bg-slate-50').nth(3); // Let's use 4th row (腳1-4)
  71  |   
  72  |   await priorBlock.dragTo(targetRow);
  73  |   await expect(priorBlock).toBeVisible();
  74  |   
  75  |   // Give the UI a moment to update positions
  76  |   await page.waitForTimeout(500);
  77  |   
  78  |   await testUserBlock.dragTo(targetRow);
  79  |   await expect(testUserBlock).toBeVisible();
  80  | 
  81  |   // Open the edit modal for TestUser
  82  |   await testUserBlock.click();
  83  |   
  84  |   // Wait for the modal to open
  85  |   await expect(page.getByText('單項服務調整')).toBeVisible();
  86  | 
  87  |   // Change the service to 90 mins
  88  |   const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (120分)' }).first();
  89  |   await serviceSelect.selectOption('腳底按摩 (90分)');
  90  | 
  91  |   // Click 查詢 (Check) if it appears
  92  |   const checkBtn = page.getByRole('button', { name: /查詢/ });
  93  |   if (await checkBtn.isVisible()) {
  94  |     await checkBtn.click();
  95  |   }
  96  | 
  97  |   // Ensure "✅ 檢查通過，可儲存" appears, NOT "❌ 原座位時段衝突"
  98  |   await expect(page.getByText('✅')).toBeVisible({ timeout: 5000 });
  99  |   await expect(page.getByText('❌ 原座位時段衝突')).not.toBeVisible();
  100 | 
  101 |   // Click 保存 (Save)
  102 |   await page.locator('button:has-text("保存")').click();
  103 | 
  104 |   // Wait for modal to close
  105 |   await expect(page.getByText('單項服務調整')).not.toBeVisible();
  106 | });
  107 | 
```
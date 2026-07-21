# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase_edit.spec.js >> Test Phase Duration Adjustment and Conflict Prevention
- Location: tests\phase_edit.spec.js:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('套餐時間調整')
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('套餐時間調整')

```

```yaml
- banner:
  - text: V109.8 心悟禪養身館 (中和店)
  - button "❯"
  - textbox: 2026-07-21
  - button "❯"
  - button " 本館"
  - button " 對面館"
  - button " 列表 (List)"
  - button " 立即刷新"
  - button " 預約"
  - button " 技師報到"
- main:
  - text: 00:51 現在 區域 8:00
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
  - text: 腳1-1 葉(2/2)(457) 隨機 12:51
  - button ""
  - text: T(1/1)(222) BF 隨機 10:32 T(1/1)(922) BF 隨機 14:12 曾(1/1)(234) BF 隨機 22:42 我(1/1)(737) FB 隨機 00:20
  - button ""
  - text: 腳1-2 葉(1/2)(457) 隨機 12:51
  - button ""
  - text: 康(2/3)(569) 隨機 14:21
  - button ""
  - text: 腳1-3 康(3/3)(569) 隨機 14:21
  - button ""
  - text: 杜(1/1)(545) BF 隨機 11:42 腳1-4 易(1/1)(635) BF 隨機 12:02 腳1-5 方(1/2)(345) FB 隨機 11:55
  - button ""
  - text: 杜(1/2)(9) BF 隨機 13:41 腳1-6 方(2/2)(345) FB 隨機 11:55
  - button ""
  - text: 杜(2/2)(9) BF 隨機 13:41 床1-1 黃(1/2)(356) 隨機 11:41
  - button ""
  - text: T(1/1)(222) BF 隨機 09:25
  - button ""
  - text: 方(1/2)(345) FB 隨機 13:31 曾(1/1)(234) BF 隨機 21:50
  - button ""
  - text: 我(1/1)(737) FB 隨機 01:12 床1-2 杜(1/1)(545) BF 隨機 11:00
  - button ""
  - text: 方(2/2)(345) FB 隨機 13:31 床1-3 黃(2/2)(356) 隨機 11:41
  - button ""
  - text: T(1/1)(922) BF 隨機 13:05
  - button ""
  - text: 床1-4 P(1/1)(111) 隨機 12:41
  - button ""
  - text: 床1-5 P(1/1)(112) 隨機 11:31
  - button ""
  - text: 杜(2/2)(9) BF 隨機 12:50
  - button ""
  - text: 床1-6 易(1/1)(635) BF 隨機 11:10
  - button ""
  - text: 杜(1/2)(9) BF 隨機 12:50
  - button ""
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('Test Phase Duration Adjustment and Conflict Prevention', async ({ page }) => {
  4  |   // Navigate to the admin portal
  5  |   await page.goto('http://localhost:5001/admin2/index.html');
  6  | 
  7  |   // Wait for the UI to be fully loaded
  8  |   await expect(page.getByText('預約')).toBeVisible({ timeout: 15000 });
  9  | 
  10 |   // Step 1: Create a new booking
  11 |   await page.getByText('預約').click();
  12 | 
  13 |   // Set hour to 12
  14 |   const hourSelect = page.locator('select').first();
  15 |   await expect(hourSelect).toBeVisible();
  16 |   await hourSelect.selectOption('12');
  17 | 
  18 |   // Select "套餐 (130分)" (Combo)
  19 |   const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  20 |   const guestServiceSelect = guestRow.locator('select').first();
  21 |   await guestServiceSelect.selectOption('套餐 (130分)');
  22 | 
  23 |   const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  24 |   await searchBtn.click();
  25 |   
  26 |   const nextBtn = page.locator('button:has-text("下一步")');
  27 |   try {
  28 |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  29 |     await nextBtn.click();
  30 |   } catch (e) {
  31 |     await page.locator('.bg-yellow-50 button').first().click();
  32 |     await searchBtn.click();
  33 |     await expect(nextBtn).toBeVisible({ timeout: 5000 });
  34 |     await nextBtn.click();
  35 |   }
  36 | 
  37 |   const uniqueId = Date.now().toString().slice(-3);
  38 |   const testPhone = '0912345' + uniqueId;
  39 |   await page.getByPlaceholder('09xx...').fill(testPhone);
  40 |   await page.getByPlaceholder('輸入姓名...').fill('TestPhase');
  41 |   await page.locator('button:has-text("先生")').click();
  42 | 
  43 |   const confirmBtn = page.locator('button:has-text("確認")');
  44 |   await confirmBtn.click();
  45 | 
  46 |   const blockText = `T(1/1)(${uniqueId})`;
  47 |   await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });
  48 | 
  49 |   // Wait a moment for rendering
  50 |   await page.waitForTimeout(2000);
  51 | 
  52 |   // Step 2: Open the edit modal
  53 |   await page.getByText(blockText).first().click();
  54 |   
  55 |   // Wait for the modal content
> 56 |   await expect(page.getByText('套餐時間調整')).toBeVisible({ timeout: 5000 });
     |                                          ^ Error: expect(locator).toBeVisible() failed
  57 | 
  58 |   // Step 3: Change Phase 1 duration to 50
  59 |   const phase1Input = page.locator('input[type="number"]').first();
  60 |   await phase1Input.fill('50');
  61 |   
  62 |   // Click Save (保存同步)
  63 |   const saveBtn = page.locator('button:has-text("保存同步")');
  64 |   await saveBtn.click();
  65 | 
  66 |   // Verify the system saves without conflict error
  67 |   // Wait for the saving overlay to disappear
  68 |   await expect(page.locator('text=儲存中')).not.toBeVisible({ timeout: 10000 });
  69 | 
  70 |   // Assert that there is NO '資源衝突' warning
  71 |   const conflictWarning = page.getByText('資源衝突');
  72 |   await expect(conflictWarning).not.toBeVisible();
  73 | });
  74 | 
```
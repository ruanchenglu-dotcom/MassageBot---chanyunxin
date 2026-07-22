# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: start_button_e2e.spec.js >> Verify Start Button Payload & Status Update
- Location: tests\start_button_e2e.spec.js:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('P(1/1)(673)').first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText('P(1/1)(673)').first()

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: V109.8
      - generic [ref=e7]: 心悟禪養身館 (中和店)
      - generic [ref=e8]:
        - button "❯" [ref=e9] [cursor=pointer]
        - textbox [ref=e10] [cursor=pointer]: 2026-07-22
        - button "❯" [ref=e11] [cursor=pointer]
    - generic [ref=e12]:
      - button " 本館" [ref=e13] [cursor=pointer]:
        - generic [ref=e14]: 
        - generic [ref=e15]: 本館
      - button " 對面館" [ref=e16] [cursor=pointer]:
        - generic [ref=e17]: 
        - generic [ref=e18]: 對面館
      - button " 列表 (List)" [ref=e19] [cursor=pointer]:
        - generic [ref=e20]: 
        - generic [ref=e21]: 列表 (List)
    - generic [ref=e22]:
      - button " 立即刷新" [ref=e23] [cursor=pointer]:
        - generic [ref=e24]: 
        - generic [ref=e25]: 立即刷新
      - button " 預約" [ref=e26] [cursor=pointer]:
        - generic [ref=e27]: 
        - generic [ref=e28]: 預約
      - button " 技師報到" [ref=e29] [cursor=pointer]:
        - generic [ref=e30]: 
        - generic [ref=e31]: 技師報到
  - main [ref=e33]:
    - generic [ref=e37]:
      - generic:
        - generic:
          - generic: 00:12 現在
      - generic "雙擊回到現在" [ref=e38] [cursor=pointer]:
        - generic [ref=e39]: 區域
        - generic [ref=e40]:
          - generic [ref=e41]:
            - generic [ref=e42]: 8:00
            - button "" [ref=e43]:
              - generic [ref=e44]: 
          - generic [ref=e45]:
            - generic [ref=e46]: 9:00
            - button "" [ref=e47]:
              - generic [ref=e48]: 
          - generic [ref=e49]:
            - generic [ref=e50]: 10:00
            - button "" [ref=e51]:
              - generic [ref=e52]: 
          - generic [ref=e53]:
            - generic [ref=e54]: 11:00
            - button "" [ref=e55]:
              - generic [ref=e56]: 
          - generic [ref=e57]:
            - generic [ref=e58]: 12:00
            - button "" [ref=e59]:
              - generic [ref=e60]: 
          - generic [ref=e61]:
            - generic [ref=e62]: 13:00
            - button "" [ref=e63]:
              - generic [ref=e64]: 
          - generic [ref=e65]:
            - generic [ref=e66]: 14:00
            - button "" [ref=e67]:
              - generic [ref=e68]: 
          - generic [ref=e69]:
            - generic [ref=e70]: 15:00
            - button "" [ref=e71]:
              - generic [ref=e72]: 
          - generic [ref=e73]:
            - generic [ref=e74]: 16:00
            - button "" [ref=e75]:
              - generic [ref=e76]: 
          - generic [ref=e77]:
            - generic [ref=e78]: 17:00
            - button "" [ref=e79]:
              - generic [ref=e80]: 
          - generic [ref=e81]:
            - generic [ref=e82]: 18:00
            - button "" [ref=e83]:
              - generic [ref=e84]: 
          - generic [ref=e85]:
            - generic [ref=e86]: 19:00
            - button "" [ref=e87]:
              - generic [ref=e88]: 
          - generic [ref=e89]:
            - generic [ref=e90]: 20:00
            - button "" [ref=e91]:
              - generic [ref=e92]: 
          - generic [ref=e93]:
            - generic [ref=e94]: 21:00
            - button "" [ref=e95]:
              - generic [ref=e96]: 
          - generic [ref=e97]:
            - generic [ref=e98]: 22:00
            - button "" [ref=e99]:
              - generic [ref=e100]: 
          - generic [ref=e101]:
            - generic [ref=e102]: 23:00
            - button "" [ref=e103]:
              - generic [ref=e104]: 
          - generic [ref=e105]:
            - generic [ref=e106]: 0:00
            - button "" [ref=e107]:
              - generic [ref=e108]: 
          - generic [ref=e109]:
            - generic [ref=e110]: 1:00
            - button "" [ref=e111]:
              - generic [ref=e112]: 
          - generic [ref=e113]:
            - generic [ref=e114]: 2:00
            - button "" [ref=e115]:
              - generic [ref=e116]: 
          - generic [ref=e117]:
            - generic [ref=e118]: 3:00
            - button "" [ref=e119]:
              - generic [ref=e120]: 
          - generic [ref=e121]:
            - generic [ref=e122]: 4:00
            - button "" [ref=e123]:
              - generic [ref=e124]: 
      - generic [ref=e125]:
        - generic "拖曳此處以互換整排客人" [ref=e127]: 腳1-1
        - generic "拖曳此處以互換整排客人" [ref=e130]: 腳1-2
        - generic "拖曳此處以互換整排客人" [ref=e133]: 腳1-3
        - generic "拖曳此處以互換整排客人" [ref=e136]: 腳1-4
        - generic "拖曳此處以互換整排客人" [ref=e139]: 腳1-5
        - generic "拖曳此處以互換整排客人" [ref=e142]: 腳1-6
        - generic "拖曳此處以互換整排客人" [ref=e145]: 床1-1
        - generic "拖曳此處以互換整排客人" [ref=e148]: 床1-2
        - generic "拖曳此處以互換整排客人" [ref=e151]: 床1-3
        - generic "拖曳此處以互換整排客人" [ref=e154]: 床1-4
        - generic "拖曳此處以互換整排客人" [ref=e157]: 床1-5
        - generic "拖曳此處以互換整排客人" [ref=e160]: 床1-6
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
  12 |   await page.goto('http://localhost:5001/admin2/index.html');
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
> 50 |   await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });
     |                                                   ^ Error: expect(locator).toBeVisible() failed
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
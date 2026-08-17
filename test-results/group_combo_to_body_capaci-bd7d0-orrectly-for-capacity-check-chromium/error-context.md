# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: group_combo_to_body_capacity.spec.js >> Group COMBO to BODY Capacity Check >> Should calculate flowCode correctly for capacity check
- Location: tests\group_combo_to_body_capacity.spec.js:5:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('div:has-text("Test (1/4)")').last()

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
        - textbox [ref=e10] [cursor=pointer]: 2026-08-17
        - button "❯" [ref=e11] [cursor=pointer]
    - generic [ref=e12]:
      - button " 本館" [ref=e13] [cursor=pointer]:
        - generic [ref=e14]: 
        - generic [ref=e15]: 本館
      - button " 對面館" [ref=e16] [cursor=pointer]:
        - generic [ref=e17]: 
        - generic [ref=e18]: 對面館
      - button " 列表" [ref=e19] [cursor=pointer]:
        - generic [ref=e20]: 
        - generic [ref=e21]: 列表
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
      - generic: 21:50 現在
      - generic "雙擊回到現在" [ref=e38] [cursor=pointer]:
        - generic [ref=e39]: 區域
        - generic [ref=e40]:
          - generic [ref=e41]:
            - generic [ref=e42]: 8:00
            - button "" [ref=e43]
          - generic [ref=e45]:
            - generic [ref=e46]: 9:00
            - button "" [ref=e47]
          - generic [ref=e49]:
            - generic [ref=e50]: 10:00
            - button "" [ref=e51]
          - generic [ref=e53]:
            - generic [ref=e54]: 11:00
            - button "" [ref=e55]
          - generic [ref=e57]:
            - generic [ref=e58]: 12:00
            - button "" [ref=e59]
          - generic [ref=e61]:
            - generic [ref=e62]: 13:00
            - button "" [ref=e63]
          - generic [ref=e65]:
            - generic [ref=e66]: 14:00
            - button "" [ref=e67]
          - generic [ref=e69]:
            - generic [ref=e70]: 15:00
            - button "" [ref=e71]
          - generic [ref=e73]:
            - generic [ref=e74]: 16:00
            - button "" [ref=e75]
          - generic [ref=e77]:
            - generic [ref=e78]: 17:00
            - button "" [ref=e79]
          - generic [ref=e81]:
            - generic [ref=e82]: 18:00
            - button "" [ref=e83]
          - generic [ref=e85]:
            - generic [ref=e86]: 19:00
            - button "" [ref=e87]
          - generic [ref=e89]:
            - generic [ref=e90]: 20:00
            - button "" [ref=e91]
          - generic [ref=e93]:
            - generic [ref=e94]: 21:00
            - button "" [ref=e95]
          - generic [ref=e97]:
            - generic [ref=e98]: 22:00
            - button "" [ref=e99]
          - generic [ref=e101]:
            - generic [ref=e102]: 23:00
            - button "" [ref=e103]
          - generic [ref=e105]:
            - generic [ref=e106]: 0:00
            - button "" [ref=e107]
          - generic [ref=e109]:
            - generic [ref=e110]: 1:00
            - button "" [ref=e111]
          - generic [ref=e113]:
            - generic [ref=e114]: 2:00
            - button "" [ref=e115]
          - generic [ref=e117]:
            - generic [ref=e118]: 3:00
            - button "" [ref=e119]
          - generic [ref=e121]:
            - generic [ref=e122]: 4:00
            - button "" [ref=e123]
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
  2  | const fs = require('fs');
  3  | 
  4  | test.describe('Group COMBO to BODY Capacity Check', () => {
  5  |     test('Should calculate flowCode correctly for capacity check', async ({ page }) => {
  6  |         test.setTimeout(60000);
  7  |         
  8  |         // Read mock data
  9  |         const mockData = JSON.parse(fs.readFileSync('tests/mock_info.json', 'utf8'));
  10 | 
  11 |         // Mock API info
  12 |         await page.route('**/api/info*', route => {
  13 |             route.fulfill({
  14 |                 status: 200,
  15 |                 contentType: 'application/json',
  16 |                 body: JSON.stringify(mockData)
  17 |             });
  18 |         });
  19 | 
  20 |         // Mock updates
  21 |         await page.route('**/api/update-status', route => route.fulfill({ json: { status: 'success' } }));
  22 |         await page.route('**/api/inline-update-group', route => route.fulfill({ json: { status: 'success' } }));
  23 | 
  24 |         // 1. Open page
  25 |         await page.goto('http://localhost:5001/admin2/index.html');
  26 |         
  27 |         // Wait for UI to load
  28 |         await expect(page.getByText('預約')).toBeVisible();
  29 | 
  30 |         // Wait for data to fetch and render
  31 |         await page.waitForTimeout(3000);
  32 |         
  33 |         // 10. Click on the first guest's booking block to edit
  34 |         const c14Card = page.locator('div:has-text("Test (1/4)")').last();
> 35 |         await c14Card.click({ force: true });
     |                       ^ Error: locator.click: Test timeout of 60000ms exceeded.
  36 |         
  37 |         await page.waitForTimeout(1000); // Wait for modal to open
  38 |         
  39 |         // 11. Change to BODY 120 mins
  40 |         await page.waitForTimeout(1000);
  41 |         const selects = await page.$$('.fixed.inset-0 select');
  42 |         for (const select of selects) {
  43 |             const text = await select.innerText();
  44 |             if (text.includes('身體按摩') || text.includes('B4')) {
  45 |                 const options = await select.$$('option');
  46 |                 for (const option of options) {
  47 |                     const optText = await option.innerText();
  48 |                     const optValue = await option.getAttribute('value');
  49 |                     if (optText.includes('身體按摩 (120分)') || optValue === 'B4' || optValue.includes('120分')) {
  50 |                         await select.selectOption(optValue);
  51 |                         await page.waitForTimeout(1000); // Wait for React to render the 查詢 button
  52 |                         break;
  53 |                     }
  54 |                 }
  55 |                 break;
  56 |             }
  57 |         }
  58 |         
  59 |         // 12. Click check
  60 |         const clicked = await page.evaluate(() => {
  61 |             const btns = Array.from(document.querySelectorAll('button'));
  62 |             console.log('All buttons:', btns.map(b => b.textContent));
  63 |             const checkBtn = btns.find(b => b.textContent.includes('查詢') && b.textContent.includes('🔍'));
  64 |             if (checkBtn) {
  65 |                 checkBtn.click();
  66 |                 return true;
  67 |             }
  68 |             return false;
  69 |         });
  70 |         if (!clicked) {
  71 |             await page.screenshot({ path: 'modal_error.png' });
  72 |             throw new Error('Check button not found or clicked!');
  73 |         }
  74 |         
  75 |         // 13. Wait for group modal and click "Modify whole group"
  76 |         const updateGroupBtn = page.locator('button', { hasText: '修改全組' });
  77 |         await updateGroupBtn.waitFor({ state: 'visible', timeout: 5000 });
  78 |         await updateGroupBtn.click();
  79 |         
  80 |         // 14. Ensure no capacity error appears
  81 |         const errorMsgLocator = page.locator('text=該時段已客滿');
  82 |         await expect(errorMsgLocator).not.toBeVisible({ timeout: 2000 });
  83 |         
  84 |         // 15. Ensure "Combo time adjustment" disappears
  85 |         const comboAdjLocator = page.locator('text=套餐時間調整');
  86 |         await expect(comboAdjLocator).not.toBeVisible({ timeout: 2000 });
  87 |         
  88 |         // Clean up
  89 |         const cancelBtn = page.locator('button', { hasText: '取消 (Cancel)' }).first();
  90 |         if (await cancelBtn.isVisible()) {
  91 |             await cancelBtn.click();
  92 |         } else {
  93 |              await page.locator('button', { hasText: '取消' }).first().click();
  94 |         }
  95 |     });
  96 | });
  97 | 
```
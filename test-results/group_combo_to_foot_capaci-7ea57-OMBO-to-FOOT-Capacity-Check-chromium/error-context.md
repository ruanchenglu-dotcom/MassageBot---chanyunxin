# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: group_combo_to_foot_capacity.spec.js >> Group COMBO to FOOT Capacity Check
- Location: tests\group_combo_to_foot_capacity.spec.js:5:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for getByText('Kang(1/4)').first() to be visible

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
      - generic: 09:58 現在
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
  2  | 
  3  | test.use({ baseURL: 'http://localhost:5001' });
  4  | 
  5  | test('Group COMBO to FOOT Capacity Check', async ({ page }) => {
  6  |     const today = new Date();
  7  |     const yyyy = today.getFullYear();
  8  |     const mm = String(today.getMonth() + 1).padStart(2, '0');
  9  |     const dd = String(today.getDate()).padStart(2, '0');
  10 |     const dateStr = yyyy + '/' + mm + '/' + dd;
  11 | 
  12 |     const mockBookings = [];
  13 |     for(let i=1; i<=4; i++) {
  14 |         mockBookings.push({
  15 |             rowId: 'target-booking-' + i,
  16 |             date: dateStr,
  17 |             startTimeString: dateStr + ' 10:00:00',
  18 |             startTime: '10:00',
  19 |             originalName: 'Kang(' + i + '/4)',
  20 |             customerName: 'Kang(' + i + '/4)',
  21 |             serviceName: '套餐 (190分)',
  22 |             cleanServiceName: '套餐 (190分)',
  23 |             duration: 190,
  24 |             status: '等待中',
  25 |             resourceId: 'BED-1-' + i,
  26 |             current_resource_id: 'BED-1-' + i,
  27 |             location: 'BED-1-' + i,
  28 |             staffId: '隨機',
  29 |             flow: 'FB',
  30 |             flowCode: 'FB',
  31 |             groupId: 'g1'
  32 |         });
  33 |     }
  34 | 
  35 |     await page.route('**/api/info*', async (route) => {
  36 |         await route.fulfill({ json: { bookings: mockBookings, timeline: [], staffList: [] } });
  37 |     });
  38 | 
  39 |     await page.goto('/admin2/index.html');
  40 |     
  41 |     const bookingEl = await page.getByText('Kang(1/4)').first();
> 42 |     await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
     |                     ^ TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  43 |     await bookingEl.click({ force: true });
  44 |     
  45 |     await page.waitForSelector('select', { timeout: 10000 });
  46 |     
  47 |     const serviceSelect = page.locator('select').first();
  48 |     await serviceSelect.selectOption({ label: '腳底按摩 (90分)' });
  49 | 
  50 |     const updateGroupBtn = page.locator('button', { hasText: '修改全組' });
  51 |     if (await updateGroupBtn.isVisible({timeout: 2000})) {
  52 |          await updateGroupBtn.click();
  53 |     }
  54 |     
  55 |     const errorMsgLocator = page.locator('text=❌ 床區客滿');
  56 |     await expect(errorMsgLocator).not.toBeVisible({ timeout: 2000 });
  57 | });
  58 | 
```
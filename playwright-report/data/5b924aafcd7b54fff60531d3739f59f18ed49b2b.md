# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: combo_fragmentation_fallback.spec.js >> Combo Fragmentation Smart Fallback
- Location: tests\combo_fragmentation_fallback.spec.js:5:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for getByText('FragmentationTest').first() to be visible

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
        - textbox [ref=e10] [cursor=pointer]: 2026-07-20
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
          - generic: 16:40 現在
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
        - generic [ref=e126]:
          - generic "拖曳此處以互換整排客人" [ref=e127]: 腳1-1
          - generic "腳底按摩 (90分)" [ref=e129] [cursor=pointer]:
            - generic [ref=e131]: F
            - generic [ref=e132]:
              - generic [ref=e133]: 隨機
              - generic [ref=e134]: 13:31
            - button "" [ref=e135]:
              - generic [ref=e136]: 
        - generic "拖曳此處以互換整排客人" [ref=e138]: 腳1-2
        - generic "拖曳此處以互換整排客人" [ref=e141]: 腳1-3
        - generic "拖曳此處以互換整排客人" [ref=e144]: 腳1-4
        - generic "拖曳此處以互換整排客人" [ref=e147]: 腳1-5
        - generic "拖曳此處以互換整排客人" [ref=e150]: 腳1-6
        - generic "拖曳此處以互換整排客人" [ref=e153]: 床1-1
        - generic "拖曳此處以互換整排客人" [ref=e156]: 床1-2
        - generic "拖曳此處以互換整排客人" [ref=e159]: 床1-3
        - generic "拖曳此處以互換整排客人" [ref=e162]: 床1-4
        - generic "拖曳此處以互換整排客人" [ref=e165]: 床1-5
        - generic "拖曳此處以互換整排客人" [ref=e168]: 床1-6
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test.use({ baseURL: 'http://localhost:5001' });
  4  | 
  5  | test('Combo Fragmentation Smart Fallback', async ({ page }) => {
  6  |     // We will intercept /api/info and mock a state with heavy resource fragmentation
  7  |     
  8  |     const today = new Date();
  9  |     const yyyy = today.getFullYear();
  10 |     const mm = String(today.getMonth() + 1).padStart(2, '0');
  11 |     const dd = String(today.getDate()).padStart(2, '0');
  12 |     const dateStr = `${yyyy}/${mm}/${dd}`;
  13 | 
  14 |     const mockBookings = [];
  15 |     
  16 |     // Target booking: A foot massage that we will upgrade to Combo (100m)
  17 |     mockBookings.push({
  18 |         rowId: "1",
  19 |         date: dateStr,
  20 |         startTimeString: `${dateStr} 12:00:00`,
  21 |         startTime: "12:00",
  22 |         originalName: "FragmentationTest",
  23 |         customerName: "FragmentationTest",
  24 |         serviceName: "腳底按摩 (90分)",
  25 |         cleanServiceName: "腳底按摩 (90分)",
  26 |         duration: 90,
  27 |         status: "等待中",
  28 |         resourceId: "CHAIR-1-1",
  29 |         current_resource_id: "CHAIR-1-1",
  30 |         location: "CHAIR-1-1",
  31 |         staffId: "隨機",
  32 |         flow: "FOOTSINGLE"
  33 |     });
  34 | 
  35 |     // Mock active resources and timeline so that MatrixHelper fails to find a continuous chair
  36 |     // We will just let the app load, and then we will manually trigger the flow switch by clicking
  37 |     
  38 |     await page.route('**/api/info*', async (route) => {
  39 |         const json = {
  40 |             date: dateStr,
  41 |             bookings: mockBookings,
  42 |             timeline: [],
  43 |             staffList: [],
  44 |             statusData: {},
  45 |             resourceState: {}
  46 |         };
  47 |         await route.fulfill({ json });
  48 |     });
  49 | 
  50 |     await page.route('/api/update-booking-details', async (route) => {
  51 |         // Assert that the payload was automatically switched to BF
  52 |         const postData = JSON.parse(route.request().postData());
  53 |         expect(postData.flow).toBe('BF');
  54 |         await route.fulfill({ json: { success: true } });
  55 |     });
  56 | 
  57 |     page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  58 | 
  59 |     await page.goto('/admin2/index.html');
  60 |     
  61 |     // Wait for the booking to appear
  62 |     const bookingEl = await page.getByText('FragmentationTest').first();
> 63 |     await bookingEl.waitFor({ state: 'visible', timeout: 15000 });
     |                     ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
  64 |     
  65 |     await bookingEl.click({ force: true });
  66 |     await page.waitForSelector('text=服務項目', { timeout: 10000 });
  67 |     
  68 |     // Select Combo 100m
  69 |     const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
  70 |     await serviceSelect.selectOption('套餐 (100分)');
  71 |     
  72 |     // Wait for validation to pass
  73 |     const okMessage = page.getByText('✅ 檢查通過，可儲存');
  74 |     await expect(okMessage).toBeVisible({ timeout: 10000 });
  75 | 
  76 |     // Now, we inject some fragmentation into the global window.timelineData directly!
  77 |     // Flow is FB -> P1 (Chair) 12:00-12:40, P2 (Bed) 12:45-13:45
  78 |     await page.evaluate(() => {
  79 |         if (!window.timelineData) window.timelineData = {};
  80 |         if (!window.timelineData['BED-1-1']) window.timelineData['BED-1-1'] = [];
  81 |         // Block the bed in the middle of phase 2 
  82 |         // 13:00 is 780 mins
  83 |         window.timelineData['BED-1-1'].push({ start: 770, end: 790, booking: { rowId: 'blocked' } });
  84 |     });
  85 | 
  86 |     // Click Save
  87 |     await page.getByText('儲存變更').click();
  88 |     
  89 |     // Check if the intelligent fallback popup appeared
  90 |     await expect(page.getByText('系統智能排班')).toBeVisible({ timeout: 5000 });
  91 |     await expect(page.getByText('由於原順序座位不足，已自動為您切換為「先身後足 (BF)」')).toBeVisible({ timeout: 5000 });
  92 | 
  93 |     console.log("✅ E2E TEST PASSED: Fragmentation Fallback successful!");
  94 | });
  95 | 
```
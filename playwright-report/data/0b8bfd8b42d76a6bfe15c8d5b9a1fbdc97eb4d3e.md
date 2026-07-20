# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_combo_switch.spec.js >> Test Phase 1 / Phase 2 adjustment when switching to a combo service
- Location: tests\test_combo_switch.spec.js:5:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for getByText('TestUserPhaseBug').first() to be visible

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
          - generic: 12:55 現在
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
            - generic [ref=e131]: T
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
  5  | test('Test Phase 1 / Phase 2 adjustment when switching to a combo service', async ({ page }) => {
  6  |     // 1. Mock API call to provide a mock booking data
  7  |     await page.route('**/api/info*', async (route) => {
  8  |         const json = {
  9  |             bookings: [
  10 |                 {
  11 |                     rowId: "test-booking-1",
  12 |                     date: "2026/07/20",
  13 |                     startTimeString: "2026/07/20 12:00:00",
  14 |                     startTime: "12:00",
  15 |                     originalName: "TestUserPhaseBug",
  16 |                     customerName: "TestUserPhaseBug",
  17 |                     serviceName: "腳底按摩 (90分)",
  18 |                     cleanServiceName: "腳底按摩 (90分)",
  19 |                     duration: 90,
  20 |                     phase1_duration: 90,
  21 |                     status: "等待中",
  22 |                     resourceId: "CHAIR-1-1",
  23 |                     current_resource_id: "CHAIR-1-1",
  24 |                     location: "CHAIR-1-1",
  25 |                     staffId: "隨機",
  26 |                     flow: "FB"
  27 |                 }
  28 |             ],
  29 |             timeline: [],
  30 |             staffList: [],
  31 |             statusData: {},
  32 |             resourceState: {}
  33 |         };
  34 |         await route.fulfill({ json });
  35 |     });
  36 | 
  37 |     // Mock the save route so it doesn't fail
  38 |     await page.route('/api/save*', async (route) => route.fulfill({ json: { success: true } }));
  39 |     await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
  40 |     await page.route('/api/resource-status*', async (route) => route.fulfill({ json: {} }));
  41 |     await page.route('/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));
  42 | 
  43 |     page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  44 | 
  45 |     // 2. Go to Admin App
  46 |     await page.goto('/admin2/index.html');
  47 |     
  48 |     // 3. Wait for app to render the mock booking
  49 |     const bookingEl = await page.getByText('TestUserPhaseBug').first();
> 50 |     await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
     |                     ^ TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  51 |     
  52 |     // 4. Click the booking to open the modal
  53 |     await bookingEl.click({ force: true });
  54 |     
  55 |     // 5. Wait for modal to open by waiting for "服務項目"
  56 |     await page.waitForSelector('text=服務項目', { timeout: 10000 });
  57 |     
  58 |     // 6. Wait for Phase 1 input to be populated
  59 |     // Phase 1 is the first input[type="number"]
  60 |     const phase1Input = page.locator('input[type="number"]').first();
  61 |     await expect(phase1Input).toHaveValue('90');
  62 | 
  63 |     // 7. Change service to "套餐 (100分)"
  64 |     const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
  65 |     await serviceSelect.selectOption('套餐 (100分)');
  66 |     
  67 |     // 8. Give React a moment to apply the useEffect clamping logic
  68 |     await page.waitForTimeout(1000);
  69 |     
  70 |     // 9. Verify Phase 1 input has been clamped to maxFoot = 60
  71 |     await expect(phase1Input).toHaveValue('60');
  72 |     
  73 |     // 10. Verify Phase 2 input has been adjusted to 40 (100 - 60 = 40)
  74 |     const phase2Input = page.locator('input[type="number"]').nth(1);
  75 |     await expect(phase2Input).toHaveValue('40');
  76 |     
  77 |     console.log("✅ E2E TEST PASSED: Phase 1 and Phase 2 durations updated correctly after service switch!");
  78 | });
  79 | 
```
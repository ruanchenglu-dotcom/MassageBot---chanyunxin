# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smart_flow_switch.spec.js >> Test intelligent switch from FB to BF when beds are full
- Location: tests\smart_flow_switch.spec.js:5:1

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
          - generic: 15:56 現在
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
              - generic [ref=e134]: 11:51
            - button "" [ref=e135]:
              - generic [ref=e136]: 
        - generic "拖曳此處以互換整排客人" [ref=e138]: 腳1-2
        - generic "拖曳此處以互換整排客人" [ref=e141]: 腳1-3
        - generic "拖曳此處以互換整排客人" [ref=e144]: 腳1-4
        - generic "拖曳此處以互換整排客人" [ref=e147]: 腳1-5
        - generic "拖曳此處以互換整排客人" [ref=e150]: 腳1-6
        - generic [ref=e152]:
          - generic "拖曳此處以互換整排客人" [ref=e153]: 床1-1
          - generic "全身按摩 (40分)" [ref=e155] [cursor=pointer]:
            - generic [ref=e157]: O
            - generic [ref=e158]:
              - generic [ref=e159]: Staff1
              - generic [ref=e160]: 12:01
            - button "" [ref=e161]:
              - generic [ref=e162]: 
        - generic [ref=e163]:
          - generic "拖曳此處以互換整排客人" [ref=e164]: 床1-2
          - generic "全身按摩 (40分)" [ref=e166] [cursor=pointer]:
            - generic [ref=e168]: O
            - generic [ref=e169]:
              - generic [ref=e170]: Staff2
              - generic [ref=e171]: 12:01
            - button "" [ref=e172]:
              - generic [ref=e173]: 
        - generic [ref=e174]:
          - generic "拖曳此處以互換整排客人" [ref=e175]: 床1-3
          - generic "全身按摩 (40分)" [ref=e177] [cursor=pointer]:
            - generic [ref=e179]: O
            - generic [ref=e180]:
              - generic [ref=e181]: Staff3
              - generic [ref=e182]: 12:01
            - button "" [ref=e183]:
              - generic [ref=e184]: 
        - generic [ref=e185]:
          - generic "拖曳此處以互換整排客人" [ref=e186]: 床1-4
          - generic "全身按摩 (40分)" [ref=e188] [cursor=pointer]:
            - generic [ref=e190]: O
            - generic [ref=e191]:
              - generic [ref=e192]: Staff4
              - generic [ref=e193]: 12:01
            - button "" [ref=e194]:
              - generic [ref=e195]: 
        - generic [ref=e196]:
          - generic "拖曳此處以互換整排客人" [ref=e197]: 床1-5
          - generic "全身按摩 (40分)" [ref=e199] [cursor=pointer]:
            - generic [ref=e201]: O
            - generic [ref=e202]:
              - generic [ref=e203]: Staff5
              - generic [ref=e204]: 12:01
            - button "" [ref=e205]:
              - generic [ref=e206]: 
        - generic [ref=e207]:
          - generic "拖曳此處以互換整排客人" [ref=e208]: 床1-6
          - generic "全身按摩 (40分)" [ref=e210] [cursor=pointer]:
            - generic [ref=e212]: O
            - generic [ref=e213]:
              - generic [ref=e214]: Staff6
              - generic [ref=e215]: 12:01
            - button "" [ref=e216]:
              - generic [ref=e217]: 
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test.use({ baseURL: 'http://localhost:5001' });
  4   | 
  5   | test('Test intelligent switch from FB to BF when beds are full', async ({ page }) => {
  6   |     // Get today's date dynamically to ensure mock bookings appear on the calendar
  7   |     const today = new Date();
  8   |     const yyyy = today.getFullYear();
  9   |     const mm = String(today.getMonth() + 1).padStart(2, '0');
  10  |     const dd = String(today.getDate()).padStart(2, '0');
  11  |     const dateStr = `${yyyy}/${mm}/${dd}`;
  12  | 
  13  |     // We mock 6 bookings occupying beds from 11:20 to 12:00 to trigger "床區客滿" during phase 2 (FB)
  14  |     const mockBookings = [];
  15  |     
  16  |     // Target booking: Starts at 10:20, 90 mins, CHAIR
  17  |     mockBookings.push({
  18  |         rowId: "target-booking",
  19  |         date: dateStr,
  20  |         startTimeString: `${dateStr} 10:20:00`,
  21  |         startTime: "10:20",
  22  |         originalName: "TestUserPhaseBug",
  23  |         customerName: "TestUserPhaseBug",
  24  |         serviceName: "腳底按摩 (90分)",
  25  |         cleanServiceName: "腳底按摩 (90分)",
  26  |         duration: 90,
  27  |         status: "等待中",
  28  |         resourceId: "CHAIR-1-1",
  29  |         current_resource_id: "CHAIR-1-1",
  30  |         location: "CHAIR-1-1",
  31  |         staffId: "隨機",
  32  |         flow: "FB"
  33  |     });
  34  | 
  35  |     // 6 bed bookings from 11:20 to 12:00 (40 mins) to saturate the 6 MAX_BEDS
  36  |     for (let i = 1; i <= 6; i++) {
  37  |         mockBookings.push({
  38  |             rowId: `bed-occupier-${i}`,
  39  |             date: dateStr,
  40  |             startTimeString: `${dateStr} 11:20:00`,
  41  |             startTime: "11:20",
  42  |             originalName: `Occupier ${i}`,
  43  |             customerName: `Occupier ${i}`,
  44  |             serviceName: "全身按摩 (40分)",
  45  |             cleanServiceName: "全身按摩 (40分)",
  46  |             duration: 40,
  47  |             status: "等待中",
  48  |             resourceId: `BED-1-${i}`,
  49  |             current_resource_id: `BED-1-${i}`,
  50  |             location: `BED-1-${i}`,
  51  |             staffId: `Staff${i}`,
  52  |             flow: "FB"
  53  |         });
  54  |     }
  55  | 
  56  |     await page.route('**/api/info*', async (route) => {
  57  |         const json = {
  58  |             bookings: mockBookings,
  59  |             timeline: [],
  60  |             staffList: [],
  61  |             statusData: {},
  62  |             resourceState: {}
  63  |         };
  64  |         await route.fulfill({ json });
  65  |     });
  66  | 
  67  |     await page.route('/api/save*', async (route) => route.fulfill({ json: { success: true } }));
  68  |     await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
  69  |     await page.route('/api/resource-status*', async (route) => route.fulfill({ json: {} }));
  70  |     await page.route('/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));
  71  | 
  72  |     page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  73  | 
  74  |     // Go to Admin App
  75  |     await page.goto('/admin2/index.html');
  76  |     
  77  |     // Wait for app to render the target booking
  78  |     const bookingEl = await page.getByText('TestUserPhaseBug').first();
> 79  |     await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
      |                     ^ TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  80  |     
  81  |     // Click the booking to open the modal
  82  |     await bookingEl.click({ force: true });
  83  |     
  84  |     // Wait for modal to open by waiting for "服務項目"
  85  |     await page.waitForSelector('text=服務項目', { timeout: 10000 });
  86  |     
  87  |     // Change service to "套餐 (100分)"
  88  |     const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
  89  |     await serviceSelect.selectOption('套餐 (100分)');
  90  |     
  91  |     // Wait for the SweetAlert modal with title "系統智能排班"
  92  |     await page.waitForSelector('text=系統智能排班', { timeout: 5000 });
  93  |     
  94  |     // Click OK on SweetAlert
  95  |     await page.getByText('確定').click();
  96  |     
  97  |     // Give React a moment to apply state
  98  |     await page.waitForTimeout(1000);
  99  |     
  100 |     // Verify the UI has switched to BF by looking for the "先身後足" (Body first) text in the toggle button
  101 |     const toggleButton = page.locator('button[title*="點擊切換為 FB"]').or(page.locator('button[title*="點擊切換為 BF"]'));
  102 |     await expect(toggleButton).toContainText('BF');
  103 |     await expect(toggleButton).toContainText('先身後足');
  104 |     
  105 |     // Check that the error message is NOT showing, it should be OK
  106 |     const okMessage = page.getByText('✅ 檢查通過，可儲存');
  107 |     await expect(okMessage).toBeVisible();
  108 | 
  109 |     console.log("✅ E2E TEST PASSED: System successfully detected bed capacity and intelligently switched flow from FB to BF!");
  110 | });
  111 | 
```
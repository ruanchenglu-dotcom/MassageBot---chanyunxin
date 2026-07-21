# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_combo_service_code_toggle.spec.js >> Test Combo identification by serviceCode starting with A and toggle transition_time clearance
- Location: tests\test_combo_service_code_toggle.spec.js:5:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for getByText('Test Combo A3').first() to be visible

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
        - textbox [ref=e10] [cursor=pointer]: 2026-07-21
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
          - generic: 02:44 現在
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
  3  | test.use({ baseURL: 'http://localhost:5001' });
  4  | 
  5  | test('Test Combo identification by serviceCode starting with A and toggle transition_time clearance', async ({ page }) => {
  6  |     
  7  |     // 1. Mock API call to provide a mock booking data with serviceCode 'A3'
  8  |     await page.route('**/api/info*', async (route) => {
  9  |         const json = {
  10 |             bookings: [
  11 |                 {
  12 |                     rowId: "test-combo-toggle",
  13 |                     date: "2026/07/22",
  14 |                     startTimeString: "2026/07/22 12:00:00",
  15 |                     startTime: "12:00",
  16 |                     originalName: "Test Combo A3",
  17 |                     customerName: "Test Combo A3",
  18 |                     serviceName: "Fake Service", // Does NOT have 套餐
  19 |                     cleanServiceName: "Fake Service",
  20 |                     serviceCode: "A3", // Starts with A
  21 |                     category: "OTHER", // NOT COMBO
  22 |                     duration: 120,
  23 |                     phase1_duration: 60,
  24 |                     phase2_duration: 60,
  25 |                     status: "等待中",
  26 |                     resourceId: "CHAIR-1-1",
  27 |                     allocated_resource: "CHAIR-1-1, BED-1-1",
  28 |                     phase1_res_idx: "CHAIR-1-1",
  29 |                     phase2_res_idx: "BED-1-1",
  30 |                     flow: "FB",
  31 |                     current_resource_id: "CHAIR-1-1",
  32 |                     location: "CHAIR-1-1",
  33 |                     staffId: "隨機",
  34 |                     pax: 1
  35 |                 }
  36 |             ],
  37 |             services: {
  38 |                 "A3": { name: "Fake Service", duration: 120, category: "OTHER" }
  39 |             },
  40 |             systemConfig: {
  41 |                 SCALE: { MAX_CHAIRS: 2, MAX_BEDS: 2 }
  42 |             }
  43 |         };
  44 |         await route.fulfill({ json });
  45 |     });
  46 | 
  47 |     // Mock the other routes so it doesn't fail
  48 |     await page.route('/api/save*', async (route) => route.fulfill({ json: { success: true } }));
  49 |     await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
  50 |     await page.route('/api/resource-status*', async (route) => route.fulfill({ json: {} }));
  51 |     await page.route('/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));
  52 | 
  53 |     // 2. Intercept the update-booking-details API to assert payload
  54 |     let updatePayload = null;
  55 |     await page.route('**/api/update-booking-details', async (route) => {
  56 |         updatePayload = route.request().postDataJSON();
  57 |         await route.fulfill({ json: { success: true } });
  58 |     });
  59 | 
  60 |     // 3. Go to app
  61 |     await page.goto('/admin2/index.html?date=2026-07-22');
  62 | 
  63 |     // 4. Find the booking card. 
  64 |     // Since serviceCode starts with 'A', it should be treated as Combo and rendered with a toggle button.
  65 |     const bookingCard = await page.getByText('Test Combo A3').first();
> 66 |     await bookingCard.waitFor({ state: 'visible', timeout: 10000 });
     |                       ^ TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  67 | 
  68 |     // Click on the booking card to open the modal
  69 |     await bookingCard.click({ force: true });
  70 | 
  71 |     // 5. In the modal, find the Toggle Sequence button and click it
  72 |     // Wait for modal
  73 |     await page.waitForSelector('text=服務項目', { timeout: 10000 });
  74 | 
  75 |     // Click toggle flow button (should exist because it's recognized as Combo)
  76 |     const toggleBtn = page.locator('.cyx-toggle-flow-btn');
  77 |     await expect(toggleBtn).toBeVisible();
  78 |     await toggleBtn.click();
  79 | 
  80 |     // Wait for the request to be sent
  81 |     await page.waitForTimeout(500); // Give it a bit of time to send the request
  82 | 
  83 |     // 6. Assertions
  84 |     expect(updatePayload).not.toBeNull();
  85 |     // Flow should change from FB to BF
  86 |     expect(updatePayload.flow).toBe('BF');
  87 |     // transition_time must be empty string
  88 |     expect(updatePayload.transition_time).toBe("");
  89 | 
  90 |     console.log("Test Passed: Payload verified to have transition_time empty string and flow toggled.");
  91 | });
  92 | 
```
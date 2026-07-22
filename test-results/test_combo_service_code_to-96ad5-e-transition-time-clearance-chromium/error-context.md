# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_combo_service_code_toggle.spec.js >> Test Combo identification by serviceCode starting with A and toggle transition_time clearance
- Location: tests\test_combo_service_code_toggle.spec.js:5:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5001/admin2/index.html?date=2026-07-22
Call log:
  - navigating to "http://localhost:5001/admin2/index.html?date=2026-07-22", waiting until "load"

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
> 61 |     await page.goto('/admin2/index.html?date=2026-07-22');
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5001/admin2/index.html?date=2026-07-22
  62 | 
  63 |     // 4. Find the booking card. 
  64 |     // Since serviceCode starts with 'A', it should be treated as Combo and rendered with a toggle button.
  65 |     const bookingCard = await page.getByText('Test Combo A3').first();
  66 |     await bookingCard.waitFor({ state: 'visible', timeout: 10000 });
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
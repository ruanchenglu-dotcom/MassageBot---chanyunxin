# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_combo_switch.spec.js >> Test Phase 1 / Phase 2 adjustment when switching to a combo service
- Location: tests\test_combo_switch.spec.js:5:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5001/admin2/index.html
Call log:
  - navigating to "http://localhost:5001/admin2/index.html", waiting until "load"

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
> 46 |     await page.goto('/admin2/index.html');
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5001/admin2/index.html
  47 |     
  48 |     // 3. Wait for app to render the mock booking
  49 |     const bookingEl = await page.getByText('TestUserPhaseBug').first();
  50 |     await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
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
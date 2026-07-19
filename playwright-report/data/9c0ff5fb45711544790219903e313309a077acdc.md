# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_combo_switch.spec.js >> Test Phase 1 / Phase 2 adjustment when switching to a combo service
- Location: tests\test_combo_switch.spec.js:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByText('TestUserPhaseBug').first()

```

# Page snapshot

```yaml
- generic [ref=e2]: Cannot GET /XinWuChanAdmin/index.html
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('Test Phase 1 / Phase 2 adjustment when switching to a combo service', async ({ page }) => {
  4  |     // Intercept API call to provide a mock booking
  5  |     await page.route('/api/info', async (route) => {
  6  |         const json = {
  7  |             bookings: [
  8  |                 {
  9  |                     rowId: "test-booking-1",
  10 |                     date: "2026/07/20",
  11 |                     startTimeString: "2026/07/20 12:00:00",
  12 |                     startTime: "12:00",
  13 |                     originalName: "TestUserPhaseBug",
  14 |                     customerName: "TestUserPhaseBug",
  15 |                     serviceName: "腳底按摩 (90分)",
  16 |                     cleanServiceName: "腳底按摩 (90分)",
  17 |                     duration: 90,
  18 |                     phase1_duration: 90,
  19 |                     status: "等待中",
  20 |                     resourceId: "CHAIR-1-1",
  21 |                     current_resource_id: "CHAIR-1-1",
  22 |                     location: "CHAIR-1-1",
  23 |                     staffId: "隨機"
  24 |                 }
  25 |             ],
  26 |             timeline: [],
  27 |             staffList: [],
  28 |             statusData: {},
  29 |             resourceState: {}
  30 |         };
  31 |         await route.fulfill({ json });
  32 |     });
  33 | 
  34 |     page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  35 |     page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  36 | 
  37 |     // Also mock /api/bookings and /api/resource-status if they exist
  38 |     await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
  39 |     await page.route('/api/resource-status', async (route) => route.fulfill({ json: {} }));
  40 | 
  41 |     await page.goto('/XinWuChanAdmin/index.html');
  42 |     
  43 |     // The admin page might take a moment to load and render bookings
  44 |     await page.waitForTimeout(2000);
  45 |     
  46 |     // Click on the booking to open the modal
  47 |     const bookingEl = await page.getByText('TestUserPhaseBug').first();
> 48 |     await bookingEl.click({ force: true });
     |                     ^ Error: locator.click: Test timeout of 30000ms exceeded.
  49 |     
  50 |     // Wait for modal to appear by looking for '服務項目' (Service Item)
  51 |     await page.waitForSelector('text=服務項目');
  52 |     
  53 |     // Get all input[type="number"]
  54 |     // Phase 1 is the first one
  55 |     const phase1Input = page.locator('input[type="number"]').first();
  56 |     await expect(phase1Input).toHaveValue('90');
  57 | 
  58 |     // Change service to "套餐 (100分)"
  59 |     // We can locate the select element that currently has the value of the old service
  60 |     const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
  61 |     await serviceSelect.selectOption('套餐 (100分)');
  62 |     
  63 |     // Wait a bit for React to update
  64 |     await page.waitForTimeout(1000);
  65 |     
  66 |     // Now verify that Phase 1 input has been clamped
  67 |     // Default split for 100 is 60 phase1 and 40 phase2
  68 |     await expect(phase1Input).toHaveValue('60');
  69 |     
  70 |     // Verify Phase 2 input
  71 |     const phase2Input = page.locator('input[type="number"]').nth(1);
  72 |     await expect(phase2Input).toHaveValue('40');
  73 |     
  74 |     console.log("TEST PASSED: Phase 1 and Phase 2 durations updated correctly after service switch!");
  75 | });
  76 | 
```
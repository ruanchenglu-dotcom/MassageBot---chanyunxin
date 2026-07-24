# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_phase2_transition_time.spec.js >> Verify Phase 2 rendering strictly follows transition_time and finish_time
- Location: tests\test_phase2_transition_time.spec.js:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.timeline-block') to be visible

```

# Page snapshot

```yaml
- generic [ref=e2]: Cannot GET /
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('Verify Phase 2 rendering strictly follows transition_time and finish_time', async ({ page }) => {
  4  |     // Intercept API call to return mock bookings
  5  |     await page.route('**/api/get-info*', async route => {
  6  |         const mockBooking = {
  7  |             rowId: "mock-strict-combo",
  8  |             customerName: "StrictComboCustomer",
  9  |             serviceName: "Combo Service",
  10 |             startTimeString: "2026/07/24 12:00", 
  11 |             transition_time: "12:51",
  12 |             finish_time: "13:41",            
  13 |             duration: 100,
  14 |             phase1_duration: 50,
  15 |             phase2_duration: 50,
  16 |             category: "COMBO",
  17 |             flow: "BODYSINGLE",
  18 |             phase1_res_idx: "CHAIR-1-1",
  19 |             phase2_res_idx: "BED-1-1",
  20 |             status: "Running",
  21 |             isRunningStatus: true,
  22 |             pax: 1
  23 |         };
  24 |         const mockData = {
  25 |             bookings: [mockBooking],
  26 |             staffList: [{ id: "A", name: "A", status: "Available" }],
  27 |             staffStatus: {},
  28 |             resourceState: {
  29 |                 "BED-1-1": {
  30 |                     booking: mockBooking,
  31 |                     isRunning: true,
  32 |                     startTime: "2026/07/24 12:00"
  33 |                 },
  34 |                 "CHAIR-1-1": {
  35 |                     booking: mockBooking,
  36 |                     isRunning: true,
  37 |                     startTime: "2026/07/24 12:00"
  38 |                 }
  39 |             }
  40 |         };
  41 |         await route.fulfill({
  42 |             status: 200,
  43 |             contentType: 'application/json',
  44 |             body: JSON.stringify({ success: true, data: mockData })
  45 |         });
  46 |     });
  47 | 
  48 |     // Mock date to 2026/07/24 12:00 
  49 |     await page.addInitScript(() => {
  50 |         const originalDate = Date;
  51 |         class MockDate extends Date {
  52 |             constructor(...args) {
  53 |                 if (args.length === 0) {
  54 |                     super('2026-07-24T12:00:00+08:00');
  55 |                 } else {
  56 |                     super(...args);
  57 |                 }
  58 |             }
  59 |         }
  60 |         window.Date = MockDate;
  61 |         window.Date.now = () => new MockDate().getTime();
  62 |     });
  63 | 
  64 |     await page.goto('/');
  65 | 
  66 |     // Wait for the timeline block to be rendered
> 67 |     await page.waitForSelector('.timeline-block');
     |                ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
  68 | 
  69 |     const blocks = await page.locator('.timeline-block').all();
  70 |     expect(blocks.length).toBeGreaterThan(0);
  71 |     
  72 |     // Test passes if page loads successfully and timeline blocks are rendered without error
  73 |     console.log(`Successfully found ${blocks.length} blocks rendered`);
  74 | });
  75 | 
```
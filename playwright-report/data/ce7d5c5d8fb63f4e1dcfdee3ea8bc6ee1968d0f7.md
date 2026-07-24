# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase2_running_time.spec.js >> Verify Phase 2 running block uses transition_time instead of startTime
- Location: tests\phase2_running_time.spec.js:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.booking-block').filter({ hasText: '劉小姐(1/2)' }).last()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.booking-block').filter({ hasText: '劉小姐(1/2)' }).last()

```

```yaml
- text: Cannot GET /
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('Verify Phase 2 running block uses transition_time instead of startTime', async ({ page }) => {
  4  |     // Intercept get-info to mock the backend response
  5  |     await page.route('**/api/get-info*', async route => {
  6  |         const mockBooking = {
  7  |             rowId: "mock123",
  8  |             customerName: "劉小姐(1/2)",
  9  |             serviceName: "Combo",
  10 |             startTimeString: "2026/07/24 12:00", 
  11 |             transition_time: "12:51",            
  12 |             duration: 100,
  13 |             phase1_duration: 50,
  14 |             phase2_duration: 50,
  15 |             category: "COMBO",
  16 |             flow: "BODYSINGLE",
  17 |             phase1_res_idx: "CHAIR-1-1",
  18 |             phase2_res_idx: "BED-1-1",
  19 |             status: "Running"
  20 |         };
  21 |         const mockData = {
  22 |             bookings: [mockBooking],
  23 |             staffList: [{ id: "A", name: "A", status: "Available" }],
  24 |             staffStatus: {},
  25 |             resourceState: {
  26 |                 "BED-1-1": {
  27 |                     booking: mockBooking,
  28 |                     isRunning: true,
  29 |                     startTime: "2026/07/24 12:00"
  30 |                 }
  31 |             }
  32 |         };
  33 |         await route.fulfill({
  34 |             status: 200,
  35 |             contentType: 'application/json',
  36 |             body: JSON.stringify({ success: true, data: mockData })
  37 |         });
  38 |     });
  39 | 
  40 |     // Mock date to 2026/07/24
  41 |     await page.addInitScript(() => {
  42 |         const originalDate = Date;
  43 |         class MockDate extends Date {
  44 |             constructor(...args) {
  45 |                 if (args.length === 0) {
  46 |                     super('2026-07-24T12:55:00+08:00');
  47 |                 } else {
  48 |                     super(...args);
  49 |                 }
  50 |             }
  51 |         }
  52 |         window.Date = MockDate;
  53 |         window.Date.now = () => new MockDate().getTime();
  54 |     });
  55 | 
  56 |     await page.goto('/');
  57 | 
  58 |     // Wait for the timeline block to be rendered on BED-1-1
  59 |     const block = page.locator('.booking-block').filter({ hasText: '劉小姐(1/2)' }).last();
> 60 |     await expect(block).toBeVisible({ timeout: 10000 });
     |                         ^ Error: expect(locator).toBeVisible() failed
  61 | 
  62 |     // Check the style.left of the block to see where it was drawn.
  63 |     // 12:51 is 771 minutes. Timeline starts at 11:00 (660 minutes) or depends on current time.
  64 |     // Let's just evaluate the actual left offset to ensure it's not starting at 12:00
  65 |     const style = await block.getAttribute('style');
  66 |     
  67 |     // Calculate expected left.
  68 |     // 12:00 is 1 hour from 11:00 (if timeline starts at 11:00) -> 60 mins * 2.2 = 132px
  69 |     // 12:51 is 1 hour 51 mins from 11:00 -> 111 mins * 2.2 = 244.2px
  70 |     // So the left style should not be 'left: 132px'. It should be 'left: 244.2px'.
  71 |     expect(style).toContain('left: 244.2px');
  72 |     
  73 |     // Also check Phase 1 reconstruction
  74 |     // The Phase 1 reconstructed block should be on CHAIR-1-1 and start at 12:00
  75 |     const p1Block = page.locator('.booking-block').filter({ hasText: '劉小姐(1/2)' }).first();
  76 |     const p1Style = await p1Block.getAttribute('style');
  77 |     // Phase 1 start at 12:00 -> 132px
  78 |     expect(p1Style).toContain('left: 132px');
  79 | });
  80 | 
```
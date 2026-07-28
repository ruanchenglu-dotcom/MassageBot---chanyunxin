# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_bed_view_phase_sync.spec.js >> Bed View - Phase 1/Phase 2 Sync Test >> Khách hàng Combo không bị hiển thị cùng lúc trên cả 2 thiết bị (BED-1-3 và CHAIR-1-4) ở Phase 1
- Location: tests\test_bed_view_phase_sync.spec.js:24:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('.fa-bed, .fa-chair') to be visible

```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | const express = require('express');
  3  | const path = require('path');
  4  | 
  5  | test.describe('Bed View - Phase 1/Phase 2 Sync Test', () => {
  6  |   let server;
  7  |   let port = 5005;
  8  | 
  9  |   test.beforeAll(async () => {
  10 |     const app = express();
  11 |     app.use(express.static(path.join(__dirname, '../public')));
  12 |     
  13 |     await new Promise((resolve) => {
  14 |       server = app.listen(port, () => resolve());
  15 |     });
  16 |   });
  17 | 
  18 |   test.afterAll(async () => {
  19 |     if (server) {
  20 |       server.close();
  21 |     }
  22 |   });
  23 | 
  24 |   test('Khách hàng Combo không bị hiển thị cùng lúc trên cả 2 thiết bị (BED-1-3 và CHAIR-1-4) ở Phase 1', async ({ page }) => {
  25 |     await page.route('**/api/info', async (route) => {
  26 |       await route.fulfill({
  27 |         status: 200,
  28 |         contentType: 'application/json',
  29 |         headers: { "Access-Control-Allow-Origin": "*" },
  30 |         body: JSON.stringify({
  31 |           bookings: [
  32 |             {
  33 |               rowId: 'row_123',
  34 |               phase1_res_idx: 'BED-1-3',
  35 |               phase2_res_idx: 'CHAIR-1-4',
  36 |               allocated_resource: 'BED-1-3+CHAIR-1-4',
  37 |               customerName: '管小姐 1/4 (Test)',
  38 |               serviceName: 'Combo Massage',
  39 |               staffName: 'Thợ 01',
  40 |               status: '🟡服務中',
  41 |               booking_time: '16:00',
  42 |               transition_time: '18:51',
  43 |               duration: 100
  44 |             }
  45 |           ]
  46 |         })
  47 |       });
  48 |     });
  49 | 
  50 |     await page.route('**/api/update-status', async (route) => {
  51 |       await route.fulfill({
  52 |         status: 200,
  53 |         contentType: 'application/json',
  54 |         headers: { "Access-Control-Allow-Origin": "*" },
  55 |         body: JSON.stringify({ success: true })
  56 |       });
  57 |     });
  58 | 
  59 |     // Login
  60 |     await page.goto(`http://localhost:${port}/bed_view/index.html`);
  61 |     await page.fill('input[type="password"]', '888888');
  62 |     await page.click('button[type="submit"]');
  63 |     
  64 |     await page.waitForSelector('select', { timeout: 5000 });
  65 |     
  66 |     // Evaluate to select both BED-1-3 and CHAIR-1-4
  67 |     await page.evaluate(() => {
  68 |       const select = document.querySelector('select');
  69 |       const options = Array.from(select.options);
  70 |       options.forEach(opt => {
  71 |         if (opt.text.includes('床1-3') || opt.text.includes('腳1-4')) {
  72 |           opt.selected = true;
  73 |         }
  74 |       });
  75 |       // trigger change event
  76 |       select.dispatchEvent(new Event('change'));
  77 |     });
  78 |     
  79 |     await page.click('button'); // Click OK to go to main screen
  80 | 
> 81 |     await page.waitForSelector('.fa-bed, .fa-chair', { timeout: 5000 });
     |                ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  82 |     
  83 |     // Now check BED-1-3 (Phase 1)
  84 |     const bedBox = page.locator('div:has-text("床1-3")').first().locator('..');
  85 |     const bedText = await bedBox.innerText();
  86 |     expect(bedText).toContain('管小姐 1/4 (Test)');
  87 | 
  88 |     // Check CHAIR-1-4 (Phase 2 - Should NOT show customer running yet!)
  89 |     const chairBox = page.locator('div:has-text("腳1-4")').first().locator('..');
  90 |     const chairText = await chairBox.innerText();
  91 |     expect(chairText).not.toContain('管小姐 1/4 (Test)');
  92 |   });
  93 | });
  94 | 
```
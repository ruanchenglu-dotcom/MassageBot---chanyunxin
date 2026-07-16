# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smart_scheduler_cross_swap_single.spec.js >> Combo and Single Booking Cross Swap >> Swapping Combo with Single booking should work even if Single is locked in is_locked (but not phase1_locked)
- Location: tests\smart_scheduler_cross_swap_single.spec.js:4:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.booking-block:has-text("Combo Guest")').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.booking-block:has-text("Combo Guest")').first()

```

```yaml
- text: Cannot GET /XinWuChanAdmin/
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test.describe('Combo and Single Booking Cross Swap', () => {
  4   |     test('Swapping Combo with Single booking should work even if Single is locked in is_locked (but not phase1_locked)', async ({ page }) => {
  5   |         
  6   |         let batchProcessCalled = false;
  7   |         let batchPayloads = [];
  8   | 
  9   |         const today = new Date();
  10  |         const yyyy = today.getFullYear();
  11  |         const mm = String(today.getMonth() + 1).padStart(2, '0');
  12  |         const dd = String(today.getDate()).padStart(2, '0');
  13  |         const todayStr = `${yyyy}/${mm}/${dd}`;
  14  | 
  15  |         await page.route('/api/check-auth', async (route) => {
  16  |             await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, role: 'ADMIN', store: 'MAIN' }) });
  17  |         });
  18  |         await page.route('/api/public-settings', async route => route.fulfill({ status: 200, body: '{}' }));
  19  |         await page.route('/api/get-system-config', async route => route.fulfill({ status: 200, body: '{"SCALE":{"MAX_BEDS":2,"MAX_CHAIRS":2},"BUFFERS":{}}' }));
  20  | 
  21  |         await page.route('**/api/get-data', async route => {
  22  |             await route.fulfill({
  23  |                 status: 200,
  24  |                 contentType: 'application/json',
  25  |                 body: JSON.stringify({
  26  |                     bookings: [
  27  |                         {
  28  |                             rowId: "10",
  29  |                             customerName: "Combo Guest",
  30  |                             serviceName: "套餐 (100分)",
  31  |                             status: "WAITING",
  32  |                             date: todayStr,
  33  |                             startTimeString: `${todayStr} 10:00`,
  34  |                             duration: 100,
  35  |                             phase1_duration: 50,
  36  |                             phase2_duration: 50,
  37  |                             flow: "FB",
  38  |                             phase1_res_idx: "BED-1-1",
  39  |                             phase2_res_idx: "CHAIR-1-1",
  40  |                             phase1_locked: "FALSE",
  41  |                             phase2_locked: "FALSE",
  42  |                             isManualLocked: false
  43  |                         },
  44  |                         {
  45  |                             rowId: "11",
  46  |                             customerName: "Single Guest",
  47  |                             serviceName: "身體按摩 (90分)",
  48  |                             status: "WAITING",
  49  |                             date: todayStr,
  50  |                             startTimeString: `${todayStr} 10:00`,
  51  |                             duration: 90,
  52  |                             category: "SINGLE",
  53  |                             phase1_duration: 90,
  54  |                             phase2_duration: "",
  55  |                             flow: "",
  56  |                             phase1_res_idx: "BED-1-2",
  57  |                             phase2_res_idx: "",
  58  |                             phase1_locked: "FALSE",
  59  |                             phase2_locked: "FALSE",
  60  |                             isManualLocked: true // Note: this is is_locked in sheet
  61  |                         }
  62  |                     ]
  63  |                 })
  64  |             });
  65  |         });
  66  | 
  67  |         await page.route('**/api/batch-process-bookings', async route => {
  68  |             batchProcessCalled = true;
  69  |             const postData = JSON.parse(route.request().postData());
  70  |             batchPayloads = postData.payloads;
  71  |             await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
  72  |         });
  73  |         
  74  |         await page.route('**/api/update-booking-details', async route => {
  75  |             await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
  76  |         });
  77  | 
  78  |         await page.goto('http://localhost:5001/XinWuChanAdmin/');
  79  |         await page.waitForLoadState('networkidle');
  80  | 
  81  |         // Locate Combo Guest on Bed 1-1
  82  |         const comboBooking = page.locator('.booking-block:has-text("Combo Guest")').first();
> 83  |         await expect(comboBooking).toBeVisible();
      |                                    ^ Error: expect(locator).toBeVisible() failed
  84  | 
  85  |         // Locate Single Guest on Bed 1-2
  86  |         const singleBooking = page.locator('.booking-block:has-text("Single Guest")').first();
  87  |         await expect(singleBooking).toBeVisible();
  88  | 
  89  |         const bed2Row = page.locator('[data-row-id="BED-1-2"]');
  90  |         await comboBooking.dragTo(bed2Row);
  91  | 
  92  |         // Wait a bit for Swal or batch process
  93  |         await page.waitForTimeout(1500);
  94  | 
  95  |         // Expect batchProcess to be called because Smart Scheduler solved it
  96  |         expect(batchProcessCalled).toBeTruthy();
  97  |         
  98  |         // Single Guest should have been moved to Bed 1-1
  99  |         const singlePayload = batchPayloads.find(p => String(p.rowId) === "11");
  100 |         expect(singlePayload).toBeDefined();
  101 |         expect(singlePayload.phase1_res_idx).toBe("床1-1");
  102 |         
  103 |         // Combo Phase 1 should have been moved to Bed 1-2
  104 |         const comboPayload = batchPayloads.find(p => String(p.rowId) === "10");
  105 |         expect(comboPayload).toBeDefined();
  106 |         expect(comboPayload.phase1_res_idx).toBe("床1-2");
  107 |     });
  108 | });
  109 | 
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: drag_drop_single_booking.spec.js >> Booking Drag and Drop End-to-End Test >> should allow dragging single booking between beds and correctly update phase1_res_idx as Single Source of Truth
- Location: tests\drag_drop_single_booking.spec.js:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.booking-block').filter({ hasText: 'Test Single Booking' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.booking-block').filter({ hasText: 'Test Single Booking' })

```

```yaml
- text: Cannot GET /XinWuChanAdmin/
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test.describe('Booking Drag and Drop End-to-End Test', () => {
  4   |   test('should allow dragging single booking between beds and correctly update phase1_res_idx as Single Source of Truth', async ({ page }) => {
  5   |     // 1. Intercept network requests to mock backend responses
  6   |     await page.route('/api/check-auth', async (route) => {
  7   |       await route.fulfill({
  8   |         status: 200,
  9   |         contentType: 'application/json',
  10  |         body: JSON.stringify({
  11  |           authenticated: true,
  12  |           role: 'ADMIN',
  13  |           username: 'cyx_admin',
  14  |           store: 'MAIN'
  15  |         }),
  16  |       });
  17  |     });
  18  | 
  19  |     await page.route('/api/public-settings', async (route) => {
  20  |         await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  21  |     });
  22  | 
  23  |     await page.route('/api/get-system-config', async (route) => {
  24  |         await route.fulfill({
  25  |             status: 200,
  26  |             contentType: 'application/json',
  27  |             body: JSON.stringify({
  28  |                 SCALE: { MAX_BEDS: 2, MAX_CHAIRS: 0 },
  29  |                 BUFFERS: { TRANSITION_MINUTES: 5 }
  30  |             })
  31  |         });
  32  |     });
  33  | 
  34  |     let mockBookings = [
  35  |       {
  36  |         rowId: "1",
  37  |         customerName: "Test Single Booking",
  38  |         serviceName: "90",
  39  |         duration: "90",
  40  |         category: "SINGLE",
  41  |         status: "WAITING",
  42  |         date: "2026/07/16",
  43  |         startTimeString: "2026/07/16 10:00",
  44  |         // Initially on BED-1-1 (using phase1_res_idx as Single Source of Truth for Single bookings)
  45  |         phase1_res_idx: "BED-1-1",
  46  |         current_resource_id: "",
  47  |         location: ""
  48  |       }
  49  |     ];
  50  | 
  51  |     await page.route('/api/get-data', async (route) => {
  52  |       await route.fulfill({
  53  |         status: 200,
  54  |         contentType: 'application/json',
  55  |         body: JSON.stringify({ bookings: mockBookings })
  56  |       });
  57  |     });
  58  | 
  59  |     let updateRequestReceived = null;
  60  |     await page.route('/api/update-booking-details', async (route) => {
  61  |       updateRequestReceived = route.request().postDataJSON();
  62  |       // Update our mock state
  63  |       mockBookings[0].phase1_res_idx = updateRequestReceived.phase1_res_idx;
  64  |       mockBookings[0].current_resource_id = updateRequestReceived.current_resource_id;
  65  |       
  66  |       await route.fulfill({
  67  |         status: 200,
  68  |         contentType: 'application/json',
  69  |         body: JSON.stringify({ success: true, message: "OK" })
  70  |       });
  71  |     });
  72  | 
  73  |     // 2. Navigate to the app (using a mocked index.html)
  74  |     await page.goto('http://localhost:5001/XinWuChanAdmin/');
  75  |     // Wait for the booking block to appear
  76  |     const bookingBlock = page.locator('.booking-block', { hasText: 'Test Single Booking' });
> 77  |     await expect(bookingBlock).toBeVisible({ timeout: 10000 });
      |                                ^ Error: expect(locator).toBeVisible() failed
  78  | 
  79  |     // Ensure it's in BED-1-1
  80  |     const bed1Row = page.locator('[data-row-id="BED-1-1"]');
  81  |     const bed2Row = page.locator('[data-row-id="BED-1-2"]'); // We will drag to here
  82  |     
  83  |     // We need to simulate drag and drop
  84  |     // In React dnd, this can be tricky, so we use playwright's dragTo
  85  |     await bookingBlock.dragTo(bed2Row);
  86  | 
  87  |     // Wait for the API to be called
  88  |     await page.waitForTimeout(1000); // Wait for async Swal and state updates
  89  | 
  90  |     // 3. Verify the API request payload contains the correct "Single Source of Truth" updates
  91  |     expect(updateRequestReceived).not.toBeNull();
  92  |     expect(updateRequestReceived.rowId).toBe("1");
  93  |     // Assert that the new single source of truth architectural logic works:
  94  |     expect(updateRequestReceived.phase1_res_idx).toBe("BED-1-2");
  95  |     expect(updateRequestReceived.current_resource_id).toBe("BED-1-2"); // Still kept for backward compat
  96  |     // Assert that combo garbage is cleared
  97  |     expect(updateRequestReceived.phase2_res_idx).toBe("");
  98  |     expect(updateRequestReceived.flow).toBe("");
  99  |   });
  100 | });
  101 | 
```
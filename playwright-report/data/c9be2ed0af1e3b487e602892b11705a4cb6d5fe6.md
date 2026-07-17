# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase_start_time_update.spec.js >> Phase Start Time Update E2E Test >> should update phaseStartTime and preserve original startTime when saving sync from Combo modal
- Location: tests\phase_start_time_update.spec.js:4:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5001/XinWuChanAdmin/
Call log:
  - navigating to "http://localhost:5001/XinWuChanAdmin/", waiting until "load"

```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test.describe('Phase Start Time Update E2E Test', () => {
  4   |   test('should update phaseStartTime and preserve original startTime when saving sync from Combo modal', async ({ page }) => {
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
  28  |                 SCALE: { MAX_BEDS: 2, MAX_CHAIRS: 2 },
  29  |                 BUFFERS: { TRANSITION_MINUTES: 5 }
  30  |             })
  31  |         });
  32  |     });
  33  | 
  34  |     const today = new Date();
  35  |     const yyyy = today.getFullYear();
  36  |     const mm = String(today.getMonth() + 1).padStart(2, '0');
  37  |     const dd = String(today.getDate()).padStart(2, '0');
  38  |     const todayStr = `${yyyy}/${mm}/${dd}`;
  39  | 
  40  |     let mockBookings = [
  41  |       {
  42  |         rowId: "123",
  43  |         customerName: "Test Combo Time",
  44  |         serviceName: "套餐 (100分)",
  45  |         duration: "100",
  46  |         category: "COMBO",
  47  |         flow: "FB",
  48  |         phase1_duration: "40",
  49  |         phase2_duration: "60",
  50  |         status: "WAITING",
  51  |         date: todayStr,
  52  |         startTimeString: `${todayStr} 10:00`,
  53  |         start_time_str: "10:00",
  54  |         phase1_res_idx: "CHAIR-1-1",
  55  |         phase2_res_idx: "BED-1-1",
  56  |         current_resource_id: "",
  57  |         location: ""
  58  |       }
  59  |     ];
  60  | 
  61  |     await page.route('/api/get-data', async (route) => {
  62  |       await route.fulfill({
  63  |         status: 200,
  64  |         contentType: 'application/json',
  65  |         body: JSON.stringify({ 
  66  |           bookings: mockBookings,
  67  |           staffList: [{ id: '1', name: '隨機', active: true }],
  68  |           statusData: {},
  69  |           services: { "套餐 (100分)": { duration: 100, type: "COMBO" } },
  70  |           lastUpdate: new Date().toISOString()
  71  |         })
  72  |       });
  73  |     });
  74  | 
  75  |     let updateRequestReceived = null;
  76  |     await page.route('/api/update-booking-details', async (route) => {
  77  |       updateRequestReceived = route.request().postDataJSON();
  78  |       await route.fulfill({
  79  |         status: 200,
  80  |         contentType: 'application/json',
  81  |         body: JSON.stringify({ success: true, message: "OK" })
  82  |       });
  83  |     });
  84  | 
  85  |     // 2. Navigate to the app (using a mocked index.html or local dev server)
> 86  |     await page.goto('http://localhost:5001/XinWuChanAdmin/');
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5001/XinWuChanAdmin/
  87  |     
  88  |     // Wait for the booking block to appear
  89  |     const bookingBlock = page.locator('.booking-block', { hasText: 'Test Combo Time' });
  90  |     await expect(bookingBlock).toBeVisible({ timeout: 10000 });
  91  | 
  92  |     // 3. Click to open Control Center Modal
  93  |     await bookingBlock.click();
  94  |     
  95  |     // Wait for Modal to open
  96  |     const modalHeader = page.locator('h3', { hasText: '套餐時間調整' });
  97  |     await expect(modalHeader).toBeVisible({ timeout: 5000 });
  98  | 
  99  |     // 4. In a real scenario, user changes the time. For test, just clicking '保存同步' 
  100 |     // will send the current modal state, which includes the logic we modified.
  101 |     const saveBtn = page.locator('button:has-text("保存同步")').first();
  102 |     await saveBtn.click();
  103 | 
  104 |     // 5. Wait for the API to be called
  105 |     await page.waitForTimeout(2000); // Wait for Swal and request
  106 | 
  107 |     // 6. Verify the API request payload contains phaseStartTime and NOT startTime
  108 |     expect(updateRequestReceived).not.toBeNull();
  109 |     expect(updateRequestReceived.rowId).toBe("123");
  110 |     
  111 |     // New logic: Should send phaseStartTimeString / phaseStartTime
  112 |     expect(updateRequestReceived.phaseStartTime).toBeDefined();
  113 |     expect(updateRequestReceived.phaseStartTimeString).toBeDefined();
  114 |     expect(updateRequestReceived.phaseStartTime).toBe("10:00");
  115 |     
  116 |     // Should NOT send startTime, gioDen, startTimeString to prevent overwriting Column B
  117 |     expect(updateRequestReceived.startTime).toBeUndefined();
  118 |     expect(updateRequestReceived.gioDen).toBeUndefined();
  119 |     expect(updateRequestReceived.startTimeString).toBeUndefined();
  120 |   });
  121 | });
  122 | 
```
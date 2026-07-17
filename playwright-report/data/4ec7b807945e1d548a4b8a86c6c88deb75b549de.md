# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: group_time_update.spec.js >> Group Booking Time Update E2E Test >> should prompt for group update and call batch-process API when entire group is selected
- Location: tests\group_time_update.spec.js:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.booking-block').filter({ hasText: '張小姐' }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.booking-block').filter({ hasText: '張小姐' }).first()

```

```yaml
- text: Cannot GET /XinWuChanAdmin/
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test.describe('Group Booking Time Update E2E Test', () => {
  4   |   test('should prompt for group update and call batch-process API when entire group is selected', async ({ page }) => {
  5   |     // 1. Mock APIs
  6   |     await page.route('/api/check-auth', async (route) => {
  7   |       await route.fulfill({
  8   |         status: 200,
  9   |         contentType: 'application/json',
  10  |         body: JSON.stringify({ authenticated: true, role: 'ADMIN', username: 'admin', store: 'MAIN' }),
  11  |       });
  12  |     });
  13  | 
  14  |     await page.route('/api/public-settings', async (route) => {
  15  |         await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  16  |     });
  17  | 
  18  |     await page.route('/api/get-system-config', async (route) => {
  19  |         await route.fulfill({
  20  |             status: 200,
  21  |             contentType: 'application/json',
  22  |             body: JSON.stringify({
  23  |                 SCALE: { MAX_BEDS: 10, MAX_CHAIRS: 10 },
  24  |                 BUFFERS: { TRANSITION_MINUTES: 5 }
  25  |             })
  26  |         });
  27  |     });
  28  | 
  29  |     const today = new Date();
  30  |     const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  31  | 
  32  |     let mockBookings = [
  33  |       {
  34  |         rowId: "2",
  35  |         customerName: "張小姐 (1/2)",
  36  |         phone: "9563563",
  37  |         serviceName: "套餐 (100分)",
  38  |         duration: "100",
  39  |         category: "COMBO",
  40  |         flow: "FB",
  41  |         phase1_duration: "50",
  42  |         phase2_duration: "50",
  43  |         status: "WAITING",
  44  |         date: todayStr,
  45  |         startTimeString: `${todayStr} 09:30`,
  46  |         start_time_str: "09:30",
  47  |         phase1_res_idx: "CHAIR-1-1",
  48  |         phase2_res_idx: "BED-1-1",
  49  |         current_resource_id: "",
  50  |         location: ""
  51  |       },
  52  |       {
  53  |         rowId: "3",
  54  |         customerName: "張小姐 (2/2)",
  55  |         phone: "9563563",
  56  |         serviceName: "套餐 (100分)",
  57  |         duration: "100",
  58  |         category: "COMBO",
  59  |         flow: "FB",
  60  |         phase1_duration: "50",
  61  |         phase2_duration: "50",
  62  |         status: "WAITING",
  63  |         date: todayStr,
  64  |         startTimeString: `${todayStr} 09:30`,
  65  |         start_time_str: "09:30",
  66  |         phase1_res_idx: "CHAIR-1-2",
  67  |         phase2_res_idx: "BED-1-2",
  68  |         current_resource_id: "",
  69  |         location: ""
  70  |       }
  71  |     ];
  72  | 
  73  |     await page.route('/api/get-data', async (route) => {
  74  |       await route.fulfill({
  75  |         status: 200,
  76  |         contentType: 'application/json',
  77  |         body: JSON.stringify({ 
  78  |           bookings: mockBookings,
  79  |           staffList: [{ id: '1', name: '隨機', active: true }],
  80  |           statusData: {},
  81  |           services: { "套餐 (100分)": { duration: 100, type: "COMBO" } },
  82  |           lastUpdate: new Date().toISOString()
  83  |         })
  84  |       });
  85  |     });
  86  | 
  87  |     let batchRequestReceived = null;
  88  |     await page.route('/api/batch-process-bookings', async (route) => {
  89  |       batchRequestReceived = route.request().postDataJSON();
  90  |       await route.fulfill({
  91  |         status: 200,
  92  |         contentType: 'application/json',
  93  |         body: JSON.stringify({ success: true, message: "OK" })
  94  |       });
  95  |     });
  96  | 
  97  |     await page.goto('http://localhost:5001/XinWuChanAdmin/');
  98  |     
  99  |     // Wait for the booking block
  100 |     const bookingBlock = page.locator('.booking-block', { hasText: '張小姐' }).first();
> 101 |     await expect(bookingBlock).toBeVisible({ timeout: 10000 });
      |                                ^ Error: expect(locator).toBeVisible() failed
  102 | 
  103 |     await bookingBlock.click();
  104 |     
  105 |     const modalHeader = page.locator('h3', { hasText: '套餐時間調整' });
  106 |     await expect(modalHeader).toBeVisible({ timeout: 5000 });
  107 | 
  108 |     const timeInput = page.locator('input[type="time"]').first();
  109 |     await timeInput.fill('10:00');
  110 | 
  111 |     const saveBtn = page.locator('button', { hasText: '保存同步' });
  112 |     await saveBtn.click();
  113 | 
  114 |     const swalTitle = page.locator('.swal2-title', { hasText: '確認' });
  115 |     await expect(swalTitle).toBeVisible({ timeout: 5000 });
  116 |     
  117 |     // Test the specific UI text
  118 |     const swalText = page.locator('.swal2-html-container', { hasText: '此為團體客' });
  119 |     await expect(swalText).toBeVisible();
  120 | 
  121 |     const applyGroupBtn = page.locator('.swal2-confirm', { hasText: '套用至整個群組' });
  122 |     await applyGroupBtn.click();
  123 | 
  124 |     await page.waitForTimeout(2000); 
  125 | 
  126 |     expect(batchRequestReceived).not.toBeNull();
  127 |     expect(batchRequestReceived.payloads).toBeDefined();
  128 |     expect(batchRequestReceived.payloads.length).toBe(2); 
  129 | 
  130 |     expect(batchRequestReceived.payloads[0].rowId).toBe("2");
  131 |     expect(batchRequestReceived.payloads[0].phaseStartTime).toBe("10:00");
  132 |     
  133 |     expect(batchRequestReceived.payloads[1].rowId).toBe("3");
  134 |     expect(batchRequestReceived.payloads[1].phaseStartTime).toBe("10:00");
  135 |   });
  136 | });
  137 | 
```
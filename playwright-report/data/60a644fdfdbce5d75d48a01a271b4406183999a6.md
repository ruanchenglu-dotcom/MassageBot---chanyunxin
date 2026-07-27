# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: group_cancel_noshow.spec.js >> Group Booking Cancel and NoShow E2E Test >> should prompt for group cancel and call update-status API with applyGroup: false when ONLY THIS CUSTOMER is selected
- Location: tests\group_cancel_noshow.spec.js:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.booking-block').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.booking-block').first()

```

```yaml
- text: Cannot GET /XinWuChanAdmin/
```

# Test source

```ts
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
  34  |         rowId: "101",
  35  |         customerName: "李先生 (1/2)",
  36  |         originalName: "李先生 (1/2)",
  37  |         phone: "0912345678",
  38  |         serviceName: "套餐 (100分)",
  39  |         duration: "100",
  40  |         category: "COMBO",
  41  |         flow: "FB",
  42  |         phase1_duration: "50",
  43  |         phase2_duration: "50",
  44  |         status: "WAITING",
  45  |         date: todayStr,
  46  |         startTimeString: `${todayStr} 09:30`,
  47  |         booking_time: `${todayStr} 09:30`,
  48  |         opDate: todayStr,
  49  |         phase1_res_idx: "CHAIR-1-1",
  50  |         phase2_res_idx: "BED-1-1",
  51  |         current_resource_id: "",
  52  |         location: "",
  53  |         start_time_str: "09:30"
  54  |       },
  55  |       {
  56  |         rowId: "102",
  57  |         customerName: "李先生 (2/2)",
  58  |         originalName: "李先生 (2/2)",
  59  |         phone: "0912345678",
  60  |         serviceName: "套餐 (100分)",
  61  |         duration: "100",
  62  |         category: "COMBO",
  63  |         flow: "FB",
  64  |         phase1_duration: "50",
  65  |         phase2_duration: "50",
  66  |         status: "WAITING",
  67  |         date: todayStr,
  68  |         startTimeString: `${todayStr} 09:30`,
  69  |         booking_time: `${todayStr} 09:30`,
  70  |         opDate: todayStr,
  71  |         phase1_res_idx: "CHAIR-1-2",
  72  |         phase2_res_idx: "BED-1-2",
  73  |         current_resource_id: "",
  74  |         location: "",
  75  |         start_time_str: "09:30"
  76  |       }
  77  |     ];
  78  | 
  79  |     await page.route('/api/get-data', async (route) => {
  80  |       await route.fulfill({
  81  |         status: 200,
  82  |         contentType: 'application/json',
  83  |         body: JSON.stringify({ 
  84  |           bookings: mockBookings,
  85  |           staffList: [{ id: '1', name: '隨機', active: true }],
  86  |           statusData: {},
  87  |           services: { "指壓 (60分)": { duration: 60, type: "SINGLE" } },
  88  |           lastUpdate: new Date().toISOString()
  89  |         })
  90  |       });
  91  |     });
  92  | 
  93  |     let updateStatusRequests = [];
  94  |     await page.route('/api/update-status', async (route) => {
  95  |       updateStatusRequests.push(route.request().postDataJSON());
  96  |       await route.fulfill({
  97  |         status: 200,
  98  |         contentType: 'application/json',
  99  |         body: JSON.stringify({ success: true, message: "OK" })
  100 |       });
  101 |     });
  102 | 
  103 |     await page.goto('http://localhost:5001/XinWuChanAdmin/');
  104 |     
  105 |     // Wait for the booking block
  106 |     const bookingBlock = page.locator('.booking-block').first();
> 107 |     await expect(bookingBlock).toBeVisible({ timeout: 10000 });
      |                                ^ Error: expect(locator).toBeVisible() failed
  108 | 
  109 |     await bookingBlock.click();
  110 |     
  111 |     // Control Center Cancel Button
  112 |     const cancelBtn = page.locator('button', { hasText: '取消' }).first();
  113 |     await expect(cancelBtn).toBeVisible({ timeout: 5000 });
  114 |     await cancelBtn.click();
  115 | 
  116 |     // SweetAlert pops up
  117 |     const swalTitle = page.locator('.swal2-title', { hasText: '確認' });
  118 |     await expect(swalTitle).toBeVisible({ timeout: 5000 });
  119 |     
  120 |     const swalText = page.locator('.swal2-html-container', { hasText: '請問要取消整組預約還是僅此客人' });
  121 |     await expect(swalText).toBeVisible();
  122 | 
  123 |     // Click "僅此客人" (Deny Button)
  124 |     const denyBtn = page.locator('.swal2-deny', { hasText: '僅此客人' });
  125 |     await expect(denyBtn).toBeVisible();
  126 |     await denyBtn.click();
  127 | 
  128 |     await page.waitForTimeout(1000); 
  129 | 
  130 |     // Verify the intercepted request
  131 |     expect(updateStatusRequests.length).toBe(1);
  132 |     expect(updateStatusRequests[0].rowId).toBe("101");
  133 |     expect(updateStatusRequests[0].status).toBe("CANCELLED");
  134 |     expect(updateStatusRequests[0].applyGroup).toBe(false);
  135 |   });
  136 |   
  137 |   test('should prompt for group noshow and call update-status API for ALL group members when WHOLE GROUP is selected', async ({ page }) => {
  138 |     // 1. Mock APIs
  139 |     await page.route('/api/check-auth', async (route) => {
  140 |       await route.fulfill({
  141 |         status: 200,
  142 |         contentType: 'application/json',
  143 |         body: JSON.stringify({ authenticated: true, role: 'ADMIN', username: 'admin', store: 'MAIN' }),
  144 |       });
  145 |     });
  146 | 
  147 |     await page.route('/api/public-settings', async (route) => {
  148 |         await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  149 |     });
  150 | 
  151 |     await page.route('/api/get-system-config', async (route) => {
  152 |         await route.fulfill({
  153 |             status: 200,
  154 |             contentType: 'application/json',
  155 |             body: JSON.stringify({
  156 |                 SCALE: { MAX_BEDS: 10, MAX_CHAIRS: 10 },
  157 |                 BUFFERS: { TRANSITION_MINUTES: 5 }
  158 |             })
  159 |         });
  160 |     });
  161 | 
  162 |     const today = new Date();
  163 |     const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  164 | 
  165 |     let mockBookings = [
  166 |       {
  167 |         rowId: "101",
  168 |         customerName: "李先生 (1/2)",
  169 |         originalName: "李先生 (1/2)",
  170 |         phone: "0912345678",
  171 |         serviceName: "套餐 (100分)",
  172 |         duration: "100",
  173 |         category: "COMBO",
  174 |         flow: "FB",
  175 |         phase1_duration: "50",
  176 |         phase2_duration: "50",
  177 |         status: "WAITING",
  178 |         date: todayStr,
  179 |         startTimeString: `${todayStr} 09:30`,
  180 |         booking_time: `${todayStr} 09:30`,
  181 |         opDate: todayStr,
  182 |         phase1_res_idx: "CHAIR-1-1",
  183 |         phase2_res_idx: "BED-1-1",
  184 |         current_resource_id: "",
  185 |         location: "",
  186 |         start_time_str: "09:30"
  187 |       },
  188 |       {
  189 |         rowId: "102",
  190 |         customerName: "李先生 (2/2)",
  191 |         originalName: "李先生 (2/2)",
  192 |         phone: "0912345678",
  193 |         serviceName: "套餐 (100分)",
  194 |         duration: "100",
  195 |         category: "COMBO",
  196 |         flow: "FB",
  197 |         phase1_duration: "50",
  198 |         phase2_duration: "50",
  199 |         status: "WAITING",
  200 |         date: todayStr,
  201 |         startTimeString: `${todayStr} 09:30`,
  202 |         booking_time: `${todayStr} 09:30`,
  203 |         opDate: todayStr,
  204 |         phase1_res_idx: "CHAIR-1-2",
  205 |         phase2_res_idx: "BED-1-2",
  206 |         current_resource_id: "",
  207 |         location: "",
```
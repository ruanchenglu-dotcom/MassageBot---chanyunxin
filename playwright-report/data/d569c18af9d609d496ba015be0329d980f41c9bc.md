# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: group_cancel_noshow.spec.js >> Group Booking Cancel and NoShow E2E Test >> should prompt for group noshow and call update-status API for ALL group members when WHOLE GROUP is selected
- Location: tests\group_cancel_noshow.spec.js:137:3

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
  208 |         start_time_str: "09:30"
  209 |       }
  210 |     ];
  211 | 
  212 |     await page.route('/api/get-data', async (route) => {
  213 |       await route.fulfill({
  214 |         status: 200,
  215 |         contentType: 'application/json',
  216 |         body: JSON.stringify({ 
  217 |           bookings: mockBookings,
  218 |           staffList: [{ id: '1', name: '隨機', active: true }],
  219 |           statusData: {},
  220 |           services: { "指壓 (60分)": { duration: 60, type: "SINGLE" } },
  221 |           lastUpdate: new Date().toISOString()
  222 |         })
  223 |       });
  224 |     });
  225 | 
  226 |     let updateStatusRequests = [];
  227 |     await page.route('/api/update-status', async (route) => {
  228 |       updateStatusRequests.push(route.request().postDataJSON());
  229 |       await route.fulfill({
  230 |         status: 200,
  231 |         contentType: 'application/json',
  232 |         body: JSON.stringify({ success: true, message: "OK" })
  233 |       });
  234 |     });
  235 | 
  236 |     await page.goto('http://localhost:5001/XinWuChanAdmin/');
  237 |     
  238 |     // Wait for the booking block
  239 |     const bookingBlock = page.locator('.booking-block').first();
> 240 |     await expect(bookingBlock).toBeVisible({ timeout: 10000 });
      |                                ^ Error: expect(locator).toBeVisible() failed
  241 | 
  242 |     await bookingBlock.click();
  243 |     
  244 |     // Control Center NoShow Button
  245 |     const noshowBtn = page.locator('button', { hasText: '爽約' }).first();
  246 |     await expect(noshowBtn).toBeVisible({ timeout: 5000 });
  247 |     await noshowBtn.click();
  248 | 
  249 |     // SweetAlert pops up
  250 |     const swalTitle = page.locator('.swal2-title', { hasText: '確認' });
  251 |     await expect(swalTitle).toBeVisible({ timeout: 5000 });
  252 |     
  253 |     const swalText = page.locator('.swal2-html-container', { hasText: '請問要將整組預約設為爽約還是僅此客人' });
  254 |     await expect(swalText).toBeVisible();
  255 | 
  256 |     // Click "爽約全體" (Confirm Button)
  257 |     const confirmBtn = page.locator('.swal2-confirm', { hasText: '爽約全體' });
  258 |     await expect(confirmBtn).toBeVisible();
  259 |     await confirmBtn.click();
  260 | 
  261 |     await page.waitForTimeout(1000); 
  262 | 
  263 |     // Verify the intercepted requests (should be 2 requests, one for each group member)
  264 |     expect(updateStatusRequests.length).toBe(2);
  265 |     
  266 |     // Sort by rowId to easily check
  267 |     updateStatusRequests.sort((a, b) => parseInt(a.rowId) - parseInt(b.rowId));
  268 |     
  269 |     expect(updateStatusRequests[0].rowId).toBe("101");
  270 |     expect(updateStatusRequests[0].status).toBe("NOSHOW");
  271 |     expect(updateStatusRequests[0].applyGroup).toBe(false);
  272 |     
  273 |     expect(updateStatusRequests[1].rowId).toBe("102");
  274 |     expect(updateStatusRequests[1].status).toBe("NOSHOW");
  275 |     expect(updateStatusRequests[1].applyGroup).toBe(false);
  276 |   });
  277 | });
  278 | 
```
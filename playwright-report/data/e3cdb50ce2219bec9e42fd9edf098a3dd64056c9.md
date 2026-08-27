# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_realtime_start_batch.spec.js >> Verify Realtime Start Logic For Batch Start (Bắt đầu nhóm)
- Location: tests\test_realtime_start_batch.spec.js:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=AutoBatch803 (1/2)').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('text=AutoBatch803 (1/2)').first()

```

```yaml
- banner:
  - text: V109.8 心悟禪養身館 (中和店)
  - button "❯"
  - textbox: 2026-08-27
  - button "❯"
  - button " 本館"
  - button " 對面館"
  - button " 列表"
  - button " 立即刷新"
  - button " 預約"
  - button " 技師報到"
- main:
  - text: 18:39 現在 區域 8:00
  - button ""
  - text: 9:00
  - button ""
  - text: 10:00
  - button ""
  - text: 11:00
  - button ""
  - text: 12:00
  - button ""
  - text: 13:00
  - button ""
  - text: 14:00
  - button ""
  - text: 15:00
  - button ""
  - text: 16:00
  - button ""
  - text: 17:00
  - button ""
  - text: 18:00
  - button ""
  - text: 19:00
  - button ""
  - text: 20:00
  - button ""
  - text: 21:00
  - button ""
  - text: 22:00
  - button ""
  - text: 23:00
  - button ""
  - text: 0:00
  - button ""
  - text: 1:00
  - button ""
  - text: 2:00
  - button ""
  - text: 3:00
  - button ""
  - text: 4:00
  - button ""
  - text: 腳1-1 腳1-2 腳1-3 腳1-4 腳1-5 腳1-6 床1-1 床1-2 床1-3 床1-4 床1-5 床1-6
```

# Test source

```ts
  30  |     requestedStaff: "隨機",
  31  |     staffName: "隨機",
  32  |     pax: 2,
  33  |     customerName: testName1,
  34  |     originalName: testName1,
  35  |     serviceName: "套餐 (100分)",
  36  |     serviceCode: "A3",
  37  |     phone: testPhone,
  38  |     date: dateStr,
  39  |     opDate: dateStr,
  40  |     status: "已預約",
  41  |     isRunning: false,
  42  |     phase1_duration: 60,
  43  |     transition_time: "13:00",
  44  |     phase2_duration: 40,
  45  |     finish_time: "13:40",
  46  |     isManualLocked: true,
  47  |     flow: "FB",
  48  |     phase1_res_idx: "CHAIR-1-2",
  49  |     phase2_res_idx: "BED-1-2",
  50  |     phase1_resource: "CHAIR-1-2",
  51  |     phase2_resource: "BED-1-2",
  52  |     resource_type: "COMBO",
  53  |     location: "本館"
  54  |   };
  55  | 
  56  |   const mockBooking2 = {
  57  |     rowId: 8889,
  58  |     startTimeString: `${dateStr} 12:00`,
  59  |     startTime: "12:00",
  60  |     booking_time: "12:00",
  61  |     start_time_str: "12:00",
  62  |     duration: 100,
  63  |     type: "BED",
  64  |     category: "COMBO",
  65  |     price: 999,
  66  |     staffId: "隨機",
  67  |     requestedStaff: "隨機",
  68  |     staffName: "隨機",
  69  |     pax: 2,
  70  |     customerName: testName2,
  71  |     originalName: testName2,
  72  |     serviceName: "套餐 (100分)",
  73  |     serviceCode: "A3",
  74  |     phone: testPhone,
  75  |     date: dateStr,
  76  |     opDate: dateStr,
  77  |     status: "已預約",
  78  |     isRunning: false,
  79  |     phase1_duration: 60,
  80  |     transition_time: "13:00",
  81  |     phase2_duration: 40,
  82  |     finish_time: "13:40",
  83  |     isManualLocked: true,
  84  |     flow: "FB",
  85  |     phase1_res_idx: "CHAIR-1-3",
  86  |     phase2_res_idx: "BED-1-3",
  87  |     phase1_resource: "CHAIR-1-3",
  88  |     phase2_resource: "BED-1-3",
  89  |     resource_type: "COMBO",
  90  |     location: "本館"
  91  |   };
  92  | 
  93  |   let interceptedPayloads = null;
  94  |   await page.route('**/api/batch-process-bookings', async route => {
  95  |     if (route.request().method() === 'POST') {
  96  |       const data = route.request().postDataJSON();
  97  |       if (data && data.payloads && data.payloads.length > 0) {
  98  |         const hasOurTest = data.payloads.some(p => p.rowId === 8888 || p.rowId === 8889);
  99  |         if (hasOurTest) {
  100 |           interceptedPayloads = data.payloads;
  101 |           await route.fulfill({ json: { success: true } });
  102 |           return;
  103 |         }
  104 |       }
  105 |     }
  106 |     await route.continue();
  107 |   });
  108 | 
  109 |   // Mock /api/info
  110 |   await page.route('**/api/info*', async route => {
  111 |     const response = await route.fetch();
  112 |     let json = {};
  113 |     try {
  114 |       json = await response.json();
  115 |     } catch (e) {}
  116 |     
  117 |     // bookings is an object in /api/info
  118 |     if (!json.bookings) json.bookings = {};
  119 |     json.bookings['8888'] = mockBooking1;
  120 |     json.bookings['8889'] = mockBooking2;
  121 |     
  122 |     await route.fulfill({ response, json });
  123 |   });
  124 | 
  125 |   // Open the page
  126 |   await page.goto('http://localhost:5001/admin2/index.html');
  127 |   
  128 |   // Đợi render
  129 |   const booking1 = page.locator(`text=${testName1}`).first();
> 130 |   await expect(booking1).toBeVisible({ timeout: 15000 });
      |                          ^ Error: expect(locator).toBeVisible() failed
  131 | 
  132 |   // Nhấn vào khách (1/2) để hiện modal nhóm
  133 |   await booking1.click();
  134 | 
  135 |   // Nhấn nút "Bắt đầu nhóm"
  136 |   const batchStartBtn = page.locator('button').filter({ hasText: '同組開始' }).first();
  137 |   await expect(batchStartBtn).toBeVisible();
  138 |   await batchStartBtn.click();
  139 |   
  140 |   // Nhấn xác nhận trong Swal
  141 |   const confirmBtn = page.locator('.swal2-confirm');
  142 |   await expect(confirmBtn).toBeVisible();
  143 |   await confirmBtn.click();
  144 | 
  145 |   // Chờ network
  146 |   await page.waitForTimeout(3000);
  147 | 
  148 |   expect(interceptedPayloads).not.toBeNull();
  149 |   expect(interceptedPayloads.length).toBeGreaterThan(0);
  150 |   
  151 |   const ourPayload = interceptedPayloads.find(p => p.rowId === 8888);
  152 |   expect(ourPayload).toBeDefined();
  153 |   expect(ourPayload.isRealtimeStart).toBe(true);
  154 |   expect(ourPayload.phaseStartTime).toBeDefined();
  155 |   
  156 |   console.log('Realtime BATCH Start Test Passed! phaseStartTime:', ourPayload.phaseStartTime);
  157 | });
  158 | 
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_realtime_start_combo.spec.js >> Verify Realtime Start Logic For Combo
- Location: tests\test_realtime_start_combo.spec.js:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('AutoTest747').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText('AutoTest747').first()

```

```yaml
- banner:
  - text: V109.8 心悟禪養身館 (中和店)
  - button "❯"
  - textbox: 2026-08-22
  - button "❯"
  - button " 本館"
  - button " 對面館"
  - button " 列表"
  - button " 立即刷新"
  - button " 預約"
  - button " 技師報到"
- text: 于 08:00  傅 08:00  吳 08:00  寶 08:00  溫 08:00  王 08:00  賀 08:00  曹 09:00  歐 09:00  張 10:00  方 10:00  峻 11:00  易 11:00  金 11:00  丁 12:00  文 12:00  李 12:00  姜 14:00  安 14:00  林 14:00  芫 14:00  融 14:00  賈 14:00  陳 14:00  青 14:00  敏 16:00  派 16:00  滕 16:00  趙 16:00  阮 16:00  單 19:00  朱 19:00 
- main:
  - text: 00:08 現在 區域 8:00
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
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test('Verify Realtime Start Logic For Combo', async ({ page }) => {
  4   |   const uniqueId = Date.now().toString().slice(-3);
  5   |   const testPhone = '0922345' + uniqueId;
  6   |   const testName = 'AutoTest' + uniqueId;
  7   |   
  8   |   const today = new Date();
  9   |   if (today.getHours() < 8) {
  10  |     today.setDate(today.getDate() - 1);
  11  |   }
  12  |   const year = today.getFullYear();
  13  |   const month = String(today.getMonth() + 1).padStart(2, '0');
  14  |   const day = String(today.getDate()).padStart(2, '0');
  15  |   const dateStr = `${year}/${month}/${day}`;
  16  | 
  17  |   const mockBooking = {
  18  |     rowId: 9999,
  19  |     startTimeString: `${dateStr} 12:00`,
  20  |     startTime: "12:00",
  21  |     booking_time: "12:00",
  22  |     start_time_str: "12:00",
  23  |     duration: 100,
  24  |     type: "BED",
  25  |     category: "COMBO",
  26  |     price: 999,
  27  |     staffId: "隨機",
  28  |     requestedStaff: "隨機",
  29  |     staffName: "隨機",
  30  |     pax: 1,
  31  |     customerName: testName,
  32  |     originalName: testName,
  33  |     serviceName: "套餐 (100分)",
  34  |     serviceCode: "A3",
  35  |     phone: testPhone,
  36  |     date: dateStr,
  37  |     opDate: dateStr,
  38  |     status: "已預約",
  39  |     isRunning: false,
  40  |     phase1_duration: 60,
  41  |     transition_time: "13:00",
  42  |     phase2_duration: 40,
  43  |     finish_time: "13:40",
  44  |     isManualLocked: true,
  45  |     flow: "FB",
  46  |     phase1_res_idx: "CHAIR-1-1",
  47  |     phase2_res_idx: "BED-1-1",
  48  |     phase1_resource: "CHAIR-1-1",
  49  |     phase2_resource: "BED-1-1",
  50  |     resource_type: "COMBO",
  51  |     location: "本館"
  52  |   };
  53  | 
  54  |   let interceptedPayload = null;
  55  |   await page.route('**/api/update-booking-details', async route => {
  56  |     if (route.request().method() === 'POST') {
  57  |       const data = route.request().postDataJSON();
  58  |       if (data && data.customerName === testName) {
  59  |         interceptedPayload = data;
  60  |         await route.fulfill({ json: { success: true } });
  61  |         return;
  62  |       }
  63  |     }
  64  |     await route.continue();
  65  |   });
  66  | 
  67  |   await page.route('**/api/get-system-state*', async route => {
  68  |     const response = await route.fetch();
  69  |     let json = {};
  70  |     try {
  71  |       json = await response.json();
  72  |     } catch (e) {}
  73  |     
  74  |     if (!json.bookings) json.bookings = [];
  75  |     json.bookings.push(mockBooking);
  76  |     
  77  |     // Convert back to string because the original might have been Big5, 
  78  |     // but playwright mock replaces the whole response payload with UTF-8 JSON.
  79  |     // The frontend should be able to parse standard JSON response.
  80  |     await route.fulfill({ response, json });
  81  |   });
  82  | 
  83  |   await page.goto('http://localhost:5001/admin2/index.html');
  84  |   
  85  |   const newBooking = page.getByText(testName).first();
> 86  |   await expect(newBooking).toBeVisible({ timeout: 15000 });
      |                            ^ Error: expect(locator).toBeVisible() failed
  87  | 
  88  |   await newBooking.click();
  89  | 
  90  |   const startBtn = page.locator('button').filter({ hasText: '開始' }).first();
  91  |   await expect(startBtn).toBeVisible();
  92  |   
  93  |   await startBtn.click();
  94  |   await page.waitForTimeout(2000);
  95  | 
  96  |   expect(interceptedPayload).not.toBeNull();
  97  |   expect(interceptedPayload.status).toBe('服務中');
  98  |   expect(interceptedPayload.isRealtimeStart).toBe(true);
  99  |   expect(interceptedPayload.phaseStartTime).toBeDefined();
  100 |   console.log('Realtime Start Test Passed! phaseStartTime:', interceptedPayload.phaseStartTime);
  101 | });
  102 | 
```
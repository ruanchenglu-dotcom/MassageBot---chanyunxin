# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: combo_group_upgrade_flow_flip.spec.js >> Combo Group Upgrade Flow Flip Backend Test >> Nâng cấp nhóm 6 khách từ FOOT lên COMBO, 3 người tự động đảo luồng BF
- Location: tests\combo_group_upgrade_flow_flip.spec.js:4:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 6
Received: 0
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test.describe('Combo Group Upgrade Flow Flip Backend Test', () => {
  4   |     test('Nâng cấp nhóm 6 khách từ FOOT lên COMBO, 3 người tự động đảo luồng BF', async ({ request, page }) => {
  5   |         const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
  6   |         const createdRows = [];
  7   | 
  8   |         // 1. Tạo 6 người FOOT
  9   |         for (let i = 0; i < 6; i++) {
  10  |             const createRes = await request.post('http://localhost:5001/api/admin-booking', {
  11  |                 data: {
  12  |                     is_group_booking: false,
  13  |                     name: `Group Test ${i}`,
  14  |                     phone: "0999999999",
  15  |                     guestCount: 1,
  16  |                     service_code: "A1",
  17  |                     serviceName: '腳底按摩 (40m)',
  18  |                     duration: 40,
  19  |                     location: "本館",
  20  |                     date: dateStr,
  21  |                     startTime: "12:00",
  22  |                     type: "SINGLE",
  23  |                     guests: [{ category: "FOOT", flow: "FOOTSINGLE", duration: 40 }],
  24  |                     flow: "FOOTSINGLE",
  25  |                     status: "預約中",
  26  |                     group_id: "test-group-999"
  27  |                 }
  28  |             });
  29  |             const resData = await createRes.json();
  30  |             console.log("Create booking response:", resData);
  31  |             if (resData.success === false) console.log("Failed to create booking:", resData);
  32  |             if (resData.rowId) createdRows.push(resData.rowId);
  33  |             else if (resData.data && resData.data.rowId) createdRows.push(resData.data.rowId);
  34  |         }
  35  | 
  36  |         console.log("Created rows: ", createdRows);
> 37  |         expect(createdRows.length).toBe(6);
      |                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  38  | 
  39  |         // 2. Tạo 9 booking chiếm BED cùng khung giờ 12:40 (khi Phase 2 của FB bắt đầu)
  40  |         for (let i = 0; i < 9; i++) {
  41  |             await request.post('http://localhost:5001/api/admin-booking', {
  42  |                 data: {
  43  |                     is_group_booking: false,
  44  |                     name: `Blocker ${i}`,
  45  |                     phone: "0999999999",
  46  |                     guestCount: 1,
  47  |                     service_code: "B1",
  48  |                     serviceName: '全身按摩 (60m)',
  49  |                     duration: 60,
  50  |                     location: "本館",
  51  |                     date: dateStr,
  52  |                     startTime: "12:40",
  53  |                     type: "SINGLE",
  54  |                     guests: [{ category: "BODY", flow: "BODYSINGLE", duration: 60 }],
  55  |                     flow: "BODYSINGLE",
  56  |                     status: "預約中"
  57  |                 }
  58  |             });
  59  |         }
  60  | 
  61  |         // 3. Tiến hành nâng cấp nhóm 6 người lên Combo thông qua inline-update-group
  62  |         const updatedData = {
  63  |             dichVu: '套餐(腳+身) 100分',
  64  |             duration: 100,
  65  |             phase1_duration: 50,
  66  |             phase2_duration: 50,
  67  |             flow: 'FB',
  68  |             ignoreOverlap: true
  69  |         };
  70  | 
  71  |         const updateRes = await request.post('http://localhost:5001/api/inline-update-group', {
  72  |             data: {
  73  |                 rowIds: createdRows,
  74  |                 updatedData: updatedData
  75  |             }
  76  |         });
  77  | 
  78  |         const updateResData = await updateRes.json();
  79  |         expect(updateResData.success).toBe(true);
  80  | 
  81  |         // 4. Lấy lại dữ liệu từ API /api/info (thay vì /api/bookings)
  82  |         const infoRes = await request.get(`http://localhost:5001/api/info?date=${dateStr}`);
  83  |         const infoData = await infoRes.json();
  84  |         
  85  |         const groupBookings = infoData.data.filter(b => createdRows.includes(String(b.rowId)) || createdRows.includes(Number(b.rowId)));
  86  |         expect(groupBookings.length).toBe(6);
  87  | 
  88  |         let fbCount = 0;
  89  |         let bfCount = 0;
  90  |         let missingPhase2Count = 0;
  91  | 
  92  |         groupBookings.forEach(b => {
  93  |             if (b.flow === 'FB') fbCount++;
  94  |             if (b.flow === 'BF') bfCount++;
  95  |             if (!b.phase2_res_idx || b.phase2_res_idx.trim() === '') {
  96  |                 missingPhase2Count++;
  97  |             }
  98  |         });
  99  | 
  100 |         console.log(`FB Count: ${fbCount}, BF Count: ${bfCount}, Missing Phase 2: ${missingPhase2Count}`);
  101 |         
  102 |         // Tất cả 6 khách đều phải có phase 2
  103 |         expect(missingPhase2Count).toBe(0);
  104 | 
  105 |         // Do đã cố tình block 9 cái BED ở 12:40, 6 khách này KHÔNG THỂ cùng đi theo flow FB
  106 |         // Chắc chắn phải có người đi luồng BF
  107 |         expect(bfCount).toBeGreaterThan(0);
  108 |         expect(fbCount).toBeGreaterThan(0);
  109 | 
  110 |         // Đi đến trang chủ UI để confirm
  111 |         await page.goto('http://localhost:5001/XinWuChanAdmin/');
  112 |         await page.waitForLoadState('networkidle');
  113 |         await page.waitForSelector('.booking-card');
  114 |     });
  115 | });
  116 | 
```
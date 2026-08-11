# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_single_group_member_upgrade.spec.js >> Single Group Member Upgrade Fix Test >> should not show capacity conflict when modifying one member of a group
- Location: tests\test_single_group_member_upgrade.spec.js:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.timeline-block').filter({ hasText: '紀(2/4)' }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.timeline-block').filter({ hasText: '紀(2/4)' }).first()

```

```yaml
- banner:
  - text: V109.8 心悟禪養身館 (中和店)
  - button "❯"
  - textbox: 2026-08-10
  - button "❯"
  - button " 本館"
  - button " 對面館"
  - button " 列表"
  - button " 立即刷新"
  - button " 預約"
  - button " 技師報到"
- text: 隨機 
- main:
  - text: 區域 8:00
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
  3   | test.describe('Single Group Member Upgrade Fix Test', () => {
  4   |   test('should not show capacity conflict when modifying one member of a group', async ({ page }) => {
  5   |     // 1. Mock APIs
  6   |     await page.route('**/api/check-auth*', async (route) => {
  7   |       await route.fulfill({
  8   |         status: 200,
  9   |         contentType: 'application/json',
  10  |         body: JSON.stringify({ authenticated: true, role: 'ADMIN', username: 'admin', store: 'MAIN' }),
  11  |       });
  12  |     });
  13  | 
  14  |     await page.route('**/api/public-settings*', async (route) => {
  15  |         await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  16  |     });
  17  | 
  18  |     page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  19  |     page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  20  | 
  21  |     await page.route('**/api/get-system-config*', async (route) => {
  22  |         await route.fulfill({
  23  |             status: 200,
  24  |             contentType: 'application/json',
  25  |             body: JSON.stringify({
  26  |                 SCALE: { MAX_BEDS: 10, MAX_CHAIRS: 10 },
  27  |                 BUFFERS: { TRANSITION_MINUTES: 5 }
  28  |             })
  29  |         });
  30  |     });
  31  | 
  32  |     const today = new Date();
  33  |     const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  34  | 
  35  |     let mockBookings = Array.from({length: 4}).map((_, i) => ({
  36  |         rowId: (100 + i).toString(),
  37  |         customerName: `紀小姐 (${i+1}/4)`,
  38  |         phone: "9563563",
  39  |         serviceName: "腳底按摩 (90分)",
  40  |         duration: "90",
  41  |         category: "FOOT",
  42  |         flow: "F",
  43  |         phase1_duration: "90",
  44  |         phase2_duration: "0",
  45  |         status: "IN_SERVICE",
  46  |         date: todayStr,
  47  |         startTimeString: `${todayStr} 14:10`,
  48  |         start_time_str: "14:10",
  49  |         phase1_res_idx: `CHAIR-1-${i+1}`,
  50  |         current_resource_id: `CHAIR-1-${i+1}`,
  51  |         location: "本館"
  52  |     }));
  53  | 
  54  |     await page.route('**/api/info*', async (route) => {
  55  |       await route.fulfill({
  56  |         status: 200,
  57  |         contentType: 'application/json',
  58  |         body: JSON.stringify({ 
  59  |           bookings: mockBookings,
  60  |           staffList: [{ id: '356', name: '隨機', active: true }],
  61  |           schedule: {},
  62  |           resourceState: {},
  63  |           staffStatus: {},
  64  |           services: { 
  65  |             "腳底按摩 (90分)": { duration: 90, type: "FOOT", flow: "F", name: "腳底按摩 (90分)" },
  66  |             "身體按摩 (90分)": { duration: 90, type: "BODY", flow: "B", name: "身體按摩 (90分)" } 
  67  |           },
  68  |           lastUpdated: new Date().toISOString(),
  69  |           isSystemHealthy: true,
  70  |           matrixDebug: [],
  71  |           blacklist: [],
  72  |           masterBlacklist: [],
  73  |           quickNotes: [],
  74  |           resources: { chairs: 6, beds: 6, oppChairs: 4, oppBeds: 6 }
  75  |         })
  76  |       });
  77  |     });
  78  | 
  79  |     await page.goto('/admin2/');    
  80  |     // Wait a bit to ensure rendering
  81  |     await page.waitForTimeout(1000);
  82  |     
  83  |     // Wait for the booking block for the 2nd person (rendered as 紀(2/4))
  84  |     const bookingBlock = page.locator('.timeline-block', { hasText: '紀(2/4)' }).first();
> 85  |     await expect(bookingBlock).toBeVisible();
      |                                ^ Error: expect(locator).toBeVisible() failed
  86  |     await bookingBlock.click();
  87  | 
  88  |     // The modal is open. Select the new service.
  89  |     // The select box for service is typically the one with the current service name
  90  |     const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
  91  |     await serviceSelect.selectOption({ label: '身體按摩 (90分)' });
  92  |     
  93  |     // Now click 查詢
  94  |     const searchBtn = page.locator('button', { hasText: '查詢' });
  95  |     await expect(searchBtn).toBeVisible();
  96  |     await searchBtn.click();
  97  | 
  98  |     // Wait for the group prompt to appear (同行群組修改)
  99  |     const singleEditBtn = page.locator('button', { hasText: '僅修改此人' });
  100 |     await expect(singleEditBtn).toBeVisible({ timeout: 5000 });
  101 |     await singleEditBtn.click();
  102 |     
  103 |     // Ensure "該時段已客滿，無法儲存" does NOT appear.
  104 |     const errorMessage = page.locator('text=該時段已客滿，無法儲存');
  105 |     await expect(errorMessage).not.toBeVisible({ timeout: 2000 });
  106 |     
  107 |     // We expect a success state or at least no failure message.
  108 |     console.log("Test Passed: Capacity check passed successfully for a single group member without self-conflict.");
  109 |   });
  110 | });
  111 | 
```
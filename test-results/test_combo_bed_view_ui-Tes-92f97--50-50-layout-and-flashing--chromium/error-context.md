# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_combo_bed_view_ui.spec.js >> Test Combo Bed View UI (50/50 layout and flashing)
- Location: tests\test_combo_bed_view_ui.spec.js:3:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('body')
Timeout: 10000ms
- Expected substring  -  1
+ Received string     + 16

- 測試客 1
+
+     
+     
+     
+         
+         請將手機橫向放置
+         此介面僅在橫向模式下運作。
+     
+
+     
+     02:57床1-1目前無客00:00下一位無預約床1-2目前無客00:00下一位無預約
+
+     
+
+
+

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for locator('body')
    23 × locator resolved to <body class="bg-darkbg text-white overflow-hidden select-none">…</body>
       - unexpected value "
    
    
    
        
        請將手機橫向放置
        此介面僅在橫向模式下運作。
    

    
    02:57床1-1目前無客00:00下一位無預約床1-2目前無客00:00下一位無預約

    


"

```

```yaml
- text: 02:57
- button ""
- button ""
- text: 
- heading "床1-1" [level=2]
- text: 目前無客 00:00 下一位  無預約 
- heading "床1-2" [level=2]
- text: 目前無客 00:00 下一位  無預約
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('Test Combo Bed View UI (50/50 layout and flashing)', async ({ page }) => {
  4  |   // Mock the /api/info endpoint
  5  |   await page.route('**/api/info*', async route => {
  6  |     const now = new Date();
  7  |     
  8  |     // Create a time 1 minute from now for flashing test
  9  |     const transitionTimeFlash = new Date(now.getTime() + 1 * 60000);
  10 |     const transitionTimeFlashStr = `${transitionTimeFlash.getHours().toString().padStart(2, '0')}:${transitionTimeFlash.getMinutes().toString().padStart(2, '0')}`;
  11 |     
  12 |     // Create a time 5 minutes from now for non-flashing test
  13 |     const transitionTimeNormal = new Date(now.getTime() + 5 * 60000);
  14 |     const transitionTimeNormalStr = `${transitionTimeNormal.getHours().toString().padStart(2, '0')}:${transitionTimeNormal.getMinutes().toString().padStart(2, '0')}`;
  15 |     
  16 |     const startTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  17 | 
  18 |     await route.fulfill({
  19 |       status: 200,
  20 |       contentType: 'application/json',
  21 |       body: JSON.stringify({
  22 |         bookings: [
  23 |           {
  24 |             rowId: 1,
  25 |             time: startTimeStr,
  26 |             duration: 100,
  27 |             status: "服務中", // Running
  28 |             serviceCode: "A4", // Combo!
  29 |             serviceName: "套餐 (100分)",
  30 |             name: "測試客 1",
  31 |             staff: "師傅 A",
  32 |             phase1_res_idx: "BED-1",
  33 |             transition_time: transitionTimeFlashStr // Flashing!
  34 |           },
  35 |           {
  36 |             rowId: 2,
  37 |             time: startTimeStr,
  38 |             duration: 100,
  39 |             status: "服務中", // Running
  40 |             serviceCode: "A3", // Combo!
  41 |             serviceName: "套餐 (100分)",
  42 |             name: "測試客 2",
  43 |             staff: "師傅 B",
  44 |             phase1_res_idx: "BED-2",
  45 |             transition_time: transitionTimeNormalStr // Not flashing
  46 |           }
  47 |         ]
  48 |       })
  49 |     });
  50 |   });
  51 | 
  52 |   // Load the app
  53 |   await page.goto('http://localhost:5001/bed_view/index.html');
  54 |   
  55 |   // Login
  56 |   await page.fill('input[type="password"]', '888888');
  57 |   await page.click('button[type="submit"]');
  58 | 
  59 |   // Setup Screen
  60 |   await page.selectOption('select:nth-of-type(1)', '本館');
  61 |   const selects = await page.$$('select');
  62 |   await selects[1].selectOption('床1-1'); // BED-1
  63 |   await selects[2].selectOption('床1-2'); // BED-2
  64 |   await page.click('button');
  65 | 
  66 |   // Wait for panels to render
> 67 |   await expect(page.locator('body')).toContainText('測試客 1', { timeout: 10000 });
     |                                      ^ Error: expect(locator).toContainText(expected) failed
  68 |   await expect(page.locator('body')).toContainText('測試客 2', { timeout: 10000 });
  69 | 
  70 |   // Check 50/50 layout exists and big text
  71 |   const transitionTimeLabels = await page.locator('text=轉場時間').all();
  72 |   expect(transitionTimeLabels.length).toBe(2);
  73 |   
  74 |   const remainingTimeLabels = await page.locator('text=剩下時間').all();
  75 |   expect(remainingTimeLabels.length).toBe(2);
  76 | 
  77 |   // Check Flashing effect (within 2 minutes) on BED-1
  78 |   const bed1TransitionDiv = page.locator('text=轉場時間').nth(0).locator('..');
  79 |   const bed1Class = await bed1TransitionDiv.getAttribute('class');
  80 |   expect(bed1Class).toContain('animate-pulse');
  81 |   expect(bed1Class).toContain('bg-red-900');
  82 | 
  83 |   // Check Non-Flashing effect (5 minutes away) on BED-2
  84 |   const bed2TransitionDiv = page.locator('text=轉場時間').nth(1).locator('..');
  85 |   const bed2Class = await bed2TransitionDiv.getAttribute('class');
  86 |   expect(bed2Class).not.toContain('animate-pulse');
  87 |   
  88 |   console.log("Combo Bed View UI Test Passed!");
  89 | });
  90 | 
```
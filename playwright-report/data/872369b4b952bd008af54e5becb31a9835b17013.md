# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smart_scheduler_elasticity_fix.spec.js >> Smart Scheduler - Elasticity Fix >> Should not stretch booking unnecessarily and enforce limits without serviceCode
- Location: tests\smart_scheduler_elasticity_fix.spec.js:4:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]: Cannot GET /
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test.describe('Smart Scheduler - Elasticity Fix', () => {
  4  |     test('Should not stretch booking unnecessarily and enforce limits without serviceCode', async ({ page }) => {
  5  |         
  6  |         await page.goto('http://localhost:5001/');
> 7  |         await page.waitForFunction(() => window.SmartScheduler !== undefined, { timeout: 10000 });
     |                    ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  8  | 
  9  |         const result = await page.evaluate(() => {
  10 |             // Mock a booking with no serviceCode but with serviceName
  11 |             const b = {
  12 |                 rowId: '999',
  13 |                 category: 'COMBO',
  14 |                 flow: 'FB',
  15 |                 duration: 100,
  16 |                 serviceName: 'A3 套餐(100分) 油推',
  17 |                 phase1_res_idx: 'CHAIR-1-1',
  18 |                 phase2_res_idx: 'BED-1-1',
  19 |                 startTimeString: '10:00',
  20 |                 time: '10:00'
  21 |             };
  22 | 
  23 |             const originalState = {
  24 |                 '999': {
  25 |                     res: 'CHAIR-1-1',
  26 |                     phase1_res: 'CHAIR-1-1',
  27 |                     phase2_res: 'BED-1-1',
  28 |                     flow: 'FB'
  29 |                 }
  30 |             };
  31 |             
  32 |             // Call SmartScheduler.solve
  33 |             // activeBookings = [b]
  34 |             // currentAssignments = originalState
  35 |             // targetIdUpper = 'CHAIR-1-1'
  36 |             // To simulate "no conflict", we make sure no other bookings exist.
  37 |             
  38 |             const assignments = window.SmartScheduler.solve(
  39 |                 b, 
  40 |                 originalState['999'], 
  41 |                 '999', 
  42 |                 'CHAIR-1-1', 
  43 |                 [b], 
  44 |                 { ...originalState }, 
  45 |                 originalState, 
  46 |                 true
  47 |             );
  48 |             
  49 |             return {
  50 |                 assignments,
  51 |                 booking: b
  52 |             };
  53 |         });
  54 | 
  55 |         // The expected behavior when there is no conflict:
  56 |         // transitionShift and timeShift should be 0 (no stretching to chase gap bonuses).
  57 |         expect(result.assignments).toBeTruthy();
  58 |         expect(result.assignments['999']).toBeTruthy();
  59 |         
  60 |         const assignment = result.assignments['999'];
  61 |         expect(assignment.timeShift).toBe(0);
  62 |         expect(assignment.transitionShift).toBe(0);
  63 | 
  64 |         console.log('Elasticity fix test passed: booking was not stretched unnecessarily!');
  65 |     });
  66 | });
  67 | 
```
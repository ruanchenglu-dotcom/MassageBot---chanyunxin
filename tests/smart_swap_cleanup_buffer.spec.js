const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('SmartScheduler should allow manual drag overlapping within cleanup buffer when target is locked', async ({ page }) => {
  await page.goto('about:blank');
  
  const scriptContent = fs.readFileSync(path.join(__dirname, '../XinWuChanAdmin/js/cyx_smartScheduler.js'), 'utf-8');
  await page.addScriptTag({ content: scriptContent });

  const result = await page.evaluate(() => {
    window.SYSTEM_CONFIG = {
        SCALE: { MAX_BEDS: 6, MAX_CHAIRS: 6 },
        BUFFERS: { TRANSITION_MINUTES: 5, CLEANUP_MINUTES: 5 }, // 5 mins cleanup
        TOLERANCE: 1
    };
    window.getSmartSplit = (b, duration, isAuto, flow) => {
        return { phase1: duration, phase2: 0 };
    };
    window.safeTimeToMins = (tStr) => {
        if (!tStr) return 0;
        const p = tStr.split(' ')[1];
        if (!p) return 0;
        const [h, m] = p.split(':').map(Number);
        return h * 60 + (m || 0);
    };
    
    // Mimic two single bookings: CUSTOMER_A and CUSTOMER_B
    const activeBookings = [
        {
            rowId: 'CUSTOMER_A', item_name: '腳底按摩 (40分)', category: 'SINGLE',
            location: 'CHAIR-1-3', current_resource_id: 'CHAIR-1-3',
            startTimeString: '2026-07-13 16:21', duration: 40,
            status: 'DOING' // DOING makes it strictly locked (so it goes to fixedTimes at CHAIR-1-3)
        },
        {
            rowId: 'CUSTOMER_B', item_name: '腳底按摩 (40分)', category: 'SINGLE',
            location: 'CHAIR-1-4', current_resource_id: 'CHAIR-1-4',
            startTimeString: '2026-07-13 17:01', duration: 40 // Starts EXACTLY at 16:21 + 40 mins
        }
    ];
    
    // Drag CUSTOMER_B to CHAIR-1-3
    // It should NOT throw conflict with CUSTOMER_A because the overlap (5 mins) <= CLEANUP_MINUTES
    return window.SmartScheduler.solve(activeBookings, 'CUSTOMER_B', 'CHAIR-1-3', 0, false);
  });
  
  // If it fails due to "Không gian không đủ" (Conflict with cleanup buffer), it returns null.
  // With our fix, it should return an array (valid payloads).
  if (result === null) {
      console.log('FAILED: Result is null (Cleanup buffer blocked the drag)');
  } else {
      console.log('SUCCESS: Overlap allowed within cleanup buffer limits.');
  }
  expect(result).not.toBeNull();
  expect(Array.isArray(result)).toBe(true);
});

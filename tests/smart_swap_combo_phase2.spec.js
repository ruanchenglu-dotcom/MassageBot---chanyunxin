const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('SmartScheduler should allow swapping phase2 of two combos', async ({ page }) => {
  await page.goto('about:blank');
  
  const scriptContent = fs.readFileSync(path.join(__dirname, '../XinWuChanAdmin/js/cyx_smartScheduler.js'), 'utf-8');
  await page.addScriptTag({ content: scriptContent });

  const result = await page.evaluate(() => {
    window.SYSTEM_CONFIG = {
        SCALE: { MAX_BEDS: 6, MAX_CHAIRS: 6 },
        BUFFERS: { TRANSITION_MINUTES: 5, CLEANUP_MINUTES: 5 },
        TOLERANCE: 1
    };
    window.getSmartSplit = (b, duration, isAuto, flow) => {
        return { phase1: 40, phase2: duration - 40 };
    };
    window.safeTimeToMins = (tStr) => {
        if (!tStr) return 0;
        const p = tStr.split(' ')[1];
        if (!p) return 0;
        const [h, m] = p.split(':').map(Number);
        return h * 60 + (m || 0);
    };
    
    // Mimic the two combos: 洪(1/2) -> 洪(2/2) and 彭(1/2) -> 彭(2/2)
    const activeBookings = [
        {
            rowId: 'CUSTOMER_HONG', item_name: '套餐 100', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-5', phase2_res_idx: 'BED-1-5',
            startTimeString: '2026-07-13 14:40', duration: 100,
            transition_time: '2026-07-13 16:21', // roughly
            is_locked: "TRUE", phase1_locked: false, phase2_locked: false
        },
        {
            rowId: 'CUSTOMER_PENG', item_name: '套餐 100', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-6', phase2_res_idx: 'BED-1-4', // PENG is on BED-1-4 currently
            startTimeString: '2026-07-13 14:40', duration: 100, 
            transition_time: '2026-07-13 17:01', // roughly
            is_locked: "TRUE", phase1_locked: false, phase2_locked: false
        }
    ];
    
    // Simulate dragging CUSTOMER_PENG (phase 2) to BED-1-5 (where CUSTOMER_HONG phase 2 is)
    // movedBookingId: 'CUSTOMER_PENG'
    // targetResource: 'BED-1-5'
    // targetPhase: 2
    // isMovedCombo: true
    return window.SmartScheduler.solve(activeBookings, 'CUSTOMER_PENG', 'BED-1-5', 2, true);
  });
  
  if (result === null) {
     console.log("FAILED: result is null");
  } else {
     console.log("SUCCESS: returned payloads");
  }
  expect(result).not.toBeNull();
});

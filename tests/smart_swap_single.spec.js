const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('SmartScheduler should allow swapping non-combo bookings if phase1_locked is false, even if is_locked is TRUE', async ({ page }) => {
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
        return { phase1: duration, phase2: 0 };
    };
    window.safeTimeToMins = (tStr) => {
        if (!tStr) return 0;
        const p = tStr.split(' ')[1];
        if (!p) return 0;
        const [h, m] = p.split(':').map(Number);
        return h * 60 + (m || 0);
    };
    
    const activeBookings = [
        {
            rowId: 'CUSTOMER_SINGLE_A', item_name: '腳底按摩 (40分)', category: 'SINGLE',
            location: 'CHAIR-1-1', current_resource_id: 'CHAIR-1-1',
            startTimeString: '2026-07-13 13:30', duration: 40,
            is_locked: "TRUE", phase1_locked: false // Legacy is_locked but NOT truly locked
        },
        {
            rowId: 'CUSTOMER_SINGLE_B', item_name: '腳底按摩 (40分)', category: 'SINGLE',
            location: 'CHAIR-1-2', current_resource_id: 'CHAIR-1-2',
            startTimeString: '2026-07-13 13:30', duration: 40 
        }
    ];
    
    // Simulate dragging CUSTOMER_SINGLE_B to CHAIR-1-1
    return window.SmartScheduler.solve(activeBookings, 'CUSTOMER_SINGLE_B', 'CHAIR-1-1', 0, false);
  });
  
  expect(result).not.toBeNull();
  expect(Array.isArray(result)).toBe(true);
});

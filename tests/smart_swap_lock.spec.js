const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('SmartScheduler should not allow swapping if target phase is locked', async ({ page }) => {
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
        return { phase1: 30, phase2: duration - 30 };
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
            rowId: 'CUSTOMER_A', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-1', phase2_res_idx: 'BED-1-1',
            startTimeString: '2026-07-13 13:30', duration: 80,
            phase1_locked: "TRUE", phase2_locked: "TRUE" // Locked
        },
        {
            rowId: 'CUSTOMER_B', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-2', phase2_res_idx: 'BED-1-2',
            startTimeString: '2026-07-13 13:30', duration: 80 
        }
    ];
    
    // Simulate dragging CUSTOMER_B to BED-1-1
    return window.SmartScheduler.solve(activeBookings, 'CUSTOMER_B', 'BED-1-1', 2, true);
  });
  
  expect(result).toBeNull();
});

test('SmartScheduler should allow swapping if target phase is NOT locked', async ({ page }) => {
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
        return { phase1: 30, phase2: duration - 30 };
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
            rowId: 'CUSTOMER_A', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-1', phase2_res_idx: 'BED-1-1',
            startTimeString: '2026-07-13 13:30', duration: 80,
            phase1_locked: false, phase2_locked: false // Not locked
        },
        {
            rowId: 'CUSTOMER_B', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-2', phase2_res_idx: 'BED-1-2',
            startTimeString: '2026-07-13 13:30', duration: 80 
        }
    ];
    
    // Simulate dragging CUSTOMER_B to BED-1-1
    return window.SmartScheduler.solve(activeBookings, 'CUSTOMER_B', 'BED-1-1', 2, true);
  });
  
  expect(result).not.toBeNull();
  expect(Array.isArray(result)).toBe(true);
});

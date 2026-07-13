const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('SmartScheduler swap 2 blocks with 1 block', async ({ page }) => {
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
            rowId: 'YANG', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-1', phase2_res_idx: 'BED-1-6',
            startTimeString: '2026-07-13 13:30', duration: 80 
            // Phase 2 starts around 13:30 + 30 + 5 = 14:05. Ends at 14:55
        },
        {
            rowId: 'JIAN', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-2', phase2_res_idx: 'BED-1-6',
            startTimeString: '2026-07-13 14:22', duration: 80 
            // Phase 2 starts around 14:22 + 30 + 5 = 14:57. Ends at 15:47
        },
        {
            rowId: 'XU', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-3', phase2_res_idx: 'BED-1-5',
            startTimeString: '2026-07-13 14:20', duration: 80 
            // Phase 2 starts around 14:20 + 30 + 5 = 14:55. Ends at 15:45
        },
        {
            rowId: 'BLOCKER1', category: 'SINGLE',
            current_resource_id: 'BED-1-1', startTimeString: '2026-07-13 14:00', duration: 200
        },
        {
            rowId: 'BLOCKER2', category: 'SINGLE',
            current_resource_id: 'BED-1-2', startTimeString: '2026-07-13 14:00', duration: 200
        },
        {
            rowId: 'BLOCKER3', category: 'SINGLE',
            current_resource_id: 'BED-1-3', startTimeString: '2026-07-13 14:00', duration: 200
        },
        {
            rowId: 'BLOCKER4', category: 'SINGLE',
            current_resource_id: 'BED-1-4', startTimeString: '2026-07-13 14:00', duration: 200
        }
    ];
    
    // Simulate dragging JIAN (from BED-1-6) to BED-1-5
    const movedBookingId = 'JIAN';
    const targetResource = 'BED-1-5';
    const targetPhase = 2;
    const isMovedCombo = true;
    
    return window.SmartScheduler.solve(activeBookings, movedBookingId, targetResource, targetPhase, isMovedCombo);
  });
  
  console.log('Returned Payloads:', result);
  expect(result).not.toBeNull();
  expect(Array.isArray(result)).toBe(true);
});

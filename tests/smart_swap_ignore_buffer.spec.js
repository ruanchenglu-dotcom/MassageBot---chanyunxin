const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('SmartScheduler ignores buffers and includes phase durations', async ({ page }) => {
  await page.goto('about:blank');
  
  const scriptContent = fs.readFileSync(path.join(__dirname, '../XinWuChanAdmin/js/cyx_smartScheduler.js'), 'utf-8');
  await page.addScriptTag({ content: scriptContent });

  const result = await page.evaluate(() => {
    window.SYSTEM_CONFIG = {
        SCALE: { MAX_BEDS: 6, MAX_CHAIRS: 6 },
        BUFFERS: { TRANSITION_MINUTES: 5, CLEANUP_MINUTES: 5 }, // These should be ignored by the updated logic
        TOLERANCE: 1
    };
    window.getSmartSplit = (b, duration, isAuto, flow) => {
        return { phase1: 60, phase2: duration - 60 };
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
            rowId: 'HUANG', category: 'SINGLE', flow: '',
            current_resource_id: 'BED-1-4',
            startTimeString: '2026-07-15 10:11', duration: 60, phase1_duration: 60
        },
        {
            rowId: 'DU', category: 'COMBO', flow: 'BF',
            phase1_res_idx: 'BED-1-5', phase2_res_idx: 'CHAIR-1-3',
            startTimeString: '2026-07-15 10:00', duration: 102, phase1_duration: 60, phase2_duration: 42
        },
        {
            rowId: 'YI', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-3', phase2_res_idx: 'BED-1-5',
            startTimeString: '2026-07-15 10:00', duration: 122, phase1_duration: 60, phase2_duration: 62
        }
    ];
    
    const movedBookingId = 'HUANG';
    const targetResource = 'BED-1-5';
    const targetPhase = 0; 
    const isMovedCombo = false;
    
    return window.SmartScheduler.solve(activeBookings, movedBookingId, targetResource, targetPhase, isMovedCombo);
  });
  
  console.log('Returned Payloads:', result);
  expect(result).not.toBeNull();
  expect(Array.isArray(result)).toBe(true);
  
  const duPayload = result.find(p => p.rowId === 'DU');
  expect(duPayload).toBeDefined();
  expect(duPayload.phase1_res_idx).toBe('BED-1-4');
  expect(duPayload.phase1_duration).toBe(60);
  expect(duPayload.phase2_duration).toBe(42);

  const yiPayload = result.find(p => p.rowId === 'YI');
  expect(yiPayload).toBeDefined();
  expect(yiPayload.phase2_res_idx).toBe('BED-1-5'); // Stays on BED-1-5 but gets shifted!
  expect(yiPayload.transition_time).toBeDefined();
  expect(yiPayload.phase1_duration).toBeGreaterThan(60); // It was shifted!
});

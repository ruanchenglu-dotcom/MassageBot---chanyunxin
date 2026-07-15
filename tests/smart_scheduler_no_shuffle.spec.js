const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('SmartScheduler does not shuffle unrelated guests with pre-existing overlaps', async ({ page }) => {
  await page.goto('about:blank');
  
  const scriptContent = fs.readFileSync(path.join(__dirname, '../XinWuChanAdmin/js/cyx_smartScheduler.js'), 'utf-8');
  await page.addScriptTag({ content: scriptContent });

  const result = await page.evaluate(() => {
    window.SYSTEM_CONFIG = {
        SCALE: { MAX_BEDS: 6, MAX_CHAIRS: 6 },
        BUFFERS: { TRANSITION_MINUTES: 0, CLEANUP_MINUTES: 0 },
        TOLERANCE: 1
    };
    window.getSmartSplit = (b, duration, isAuto, flow) => {
        return { phase1: Math.floor(duration / 2), phase2: Math.ceil(duration / 2) };
    };
    window.safeTimeToMins = (tStr) => {
        if (!tStr) return 0;
        const p = tStr.split(' ')[1];
        if (!p) return 0;
        const [h, m] = p.split(':').map(Number);
        return h * 60 + (m || 0);
    };
    
    // Group of 4 with a pre-existing overlap with YI
    const activeBookings = [
        {
            rowId: 'YI', category: 'SINGLE', flow: '',
            current_resource_id: 'CHAIR-1-5', // Will drag to CHAIR-1-6
            startTimeString: '2026-07-15 11:10', duration: 60
        },
        {
            rowId: 'ZHANG_1', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-1', phase2_res_idx: 'BED-1-1',
            startTimeString: '2026-07-15 10:20', duration: 100, phase1_duration: 52
        },
        {
            rowId: 'ZHANG_2', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-5', phase2_res_idx: 'BED-1-2', // Originally on CHAIR-1-5, overlapping with YI from 11:10 to 11:12
            startTimeString: '2026-07-15 10:20', duration: 100, phase1_duration: 52
        },
        {
            rowId: 'ZHANG_3', category: 'COMBO', flow: 'FB',
            phase1_res_idx: 'CHAIR-1-4', phase2_res_idx: 'BED-1-3',
            startTimeString: '2026-07-15 10:20', duration: 100, phase1_duration: 52
        },
        {
            rowId: 'ZHANG_4', category: 'COMBO', flow: 'BF',
            phase1_res_idx: 'BED-1-4', phase2_res_idx: 'CHAIR-1-4', // Starts at 11:12 on CHAIR-1-4, touching ZHANG_3
            startTimeString: '2026-07-15 10:20', duration: 100, phase1_duration: 52, transition_time: '2026-07-15 11:12'
        }
    ];
    
    const movedBookingId = 'YI';
    const targetResource = 'CHAIR-1-6';
    const targetPhase = 0; 
    const isMovedCombo = false;
    
    return window.SmartScheduler.solve(activeBookings, movedBookingId, targetResource, targetPhase, isMovedCombo);
  });
  
  console.log('Returned Payloads:', result);
  expect(result).not.toBeNull();
  expect(Array.isArray(result)).toBe(true);
  
  // The only payload should be YI moving to CHAIR-1-6
  const yiPayload = result.find(p => p.rowId === 'YI');
  expect(yiPayload).toBeDefined();
  expect(yiPayload.current_resource_id).toBe('CHAIR-1-6');
  
  // The ZHANG group should NOT be shuffled
  const zhang2Payload = result.find(p => p.rowId === 'ZHANG_2');
  expect(zhang2Payload).toBeUndefined(); // Should not have a payload, meaning it stays at original
  
  const zhang3Payload = result.find(p => p.rowId === 'ZHANG_3');
  expect(zhang3Payload).toBeUndefined();
});

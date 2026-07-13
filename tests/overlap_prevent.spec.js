const { test, expect } = require('@playwright/test');

test('simulateSwapOverlap detects overlap and rejects', async ({ page }) => {
  await page.goto('about:blank');

  const result = await page.evaluate(() => {
    // 1. Mock MatrixHelper
    window.MatrixHelper = {
        isOverlap: (s1, e1, s2, e2) => {
            const tol = window.SYSTEM_CONFIG?.TOLERANCE || 0;
            return (s1 < e2 - tol) && (s2 < e1 - tol);
        }
    };
    
    // 2. Mock SYSTEM_CONFIG
    window.SYSTEM_CONFIG = {
        P1_CLEANUP_MINS: 0,
        CLEANUP_MINS: 0,
        BUFFERS: { TRANSITION_MINUTES: 5 },
        TOLERANCE: 1
    };
    
    // 3. Mock helper
    window.safeTimeToMins = (tStr) => {
        if (!tStr) return 0;
        const p = tStr.split(' ')[1];
        if (!p) return 0;
        const [h, m] = p.split(':').map(Number);
        return h * 60 + (m || 0);
    };

    // 4. Define simulateSwapOverlap
    const simulateSwapOverlap = function(activeBookings, payloads) {
        if (!payloads || payloads.length === 0) return false;
        let simBookings = JSON.parse(JSON.stringify(activeBookings));
        
        payloads.forEach(p => {
            let sb = simBookings.find(x => String(x.rowId) === String(p.rowId));
            if (sb) {
                if (p.phase1_res_idx !== undefined) sb.phase1_res_idx = p.phase1_res_idx;
                if (p.phase2_res_idx !== undefined) sb.phase2_res_idx = p.phase2_res_idx;
                if (p.location !== undefined) sb.location = p.location;
                if (p.current_resource_id !== undefined) sb.current_resource_id = p.current_resource_id;
                if (p.flow !== undefined) sb.flow = p.flow;
            }
        });

        const safeTimeToMinsSim = (tStr) => {
            if (!tStr) return 0;
            const p = tStr.split(' ')[1];
            if (!p) return 0;
            const [h, m] = p.split(':').map(Number);
            return h * 60 + (m || 0);
        };

        const simTimelineGrid = {};
        let hasConflict = false;

        for (let bookingItem of simBookings) {
            if (bookingItem.isDoneStatus) continue;
            const statusLower = (bookingItem.status || '').toLowerCase();
            const inactiveKeywords = ['cancel', 'hủy', 'huỷ', 'finish', 'done', 'xong', 'check-out', 'checkout', 'đã về', 'khách về', 'hết', '?- ^', 'rO^?', 'c'];
            let isActive = true;
            for (const kw of inactiveKeywords) { if (statusLower.includes(kw)) { isActive = false; break; } }
            if (!isActive) continue;

            let actualBStart = window.safeTimeToMins ? window.safeTimeToMins(bookingItem.startTimeString) : safeTimeToMinsSim(bookingItem.startTimeString);
            let totalDuration = parseInt(bookingItem.duration || 60, 10);
            let currentFlow = bookingItem.flow || bookingItem.flow_code;
            let isComboBooking = currentFlow === 'FB' || currentFlow === 'BF' || (bookingItem.category === 'COMBO') || (bookingItem.serviceName && bookingItem.serviceName.includes('腳+身'));

            if (isComboBooking) {
                let split = window.getSmartSplit ? window.getSmartSplit(bookingItem, totalDuration, true, currentFlow || 'FB') : { phase1: Math.floor(totalDuration / 2), phase2: Math.ceil(totalDuration / 2) };
                let newPhase1Duration = split.phase1;
                let newPhase2Duration = split.phase2;
                
                if (bookingItem.phase1_duration !== undefined && bookingItem.phase1_duration !== null && bookingItem.phase1_duration !== "") newPhase1Duration = parseInt(bookingItem.phase1_duration, 10);
                if (bookingItem.phase2_duration !== undefined && bookingItem.phase2_duration !== null && bookingItem.phase2_duration !== "") newPhase2Duration = parseInt(bookingItem.phase2_duration, 10);
                
                const p1Cleanup = parseInt(window.SYSTEM_CONFIG?.P1_CLEANUP_MINS) || 0;
                let p1End = actualBStart + newPhase1Duration + p1Cleanup;
                
                let p2Start = actualBStart + newPhase1Duration + (parseInt(window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES) || 5);
                if (bookingItem.transition_time) {
                    const transMins = safeTimeToMinsSim(bookingItem.transition_time);
                    if (transMins !== -1 && transMins > 0) p2Start = transMins;
                }
                let p2End = p2Start + newPhase2Duration + (parseInt(window.SYSTEM_CONFIG?.CLEANUP_MINS) || 0);

                let pref1 = bookingItem.phase1_res_idx;
                let pref2 = bookingItem.phase2_res_idx;

                if (pref1 && String(pref1).toUpperCase() !== 'NULL' && String(pref1).trim() !== '') {
                    pref1 = String(pref1).toUpperCase();
                    if (!simTimelineGrid[pref1]) simTimelineGrid[pref1] = [];
                    for (const slot of simTimelineGrid[pref1]) {
                        if (String(slot.booking.rowId) !== String(bookingItem.rowId) && window.MatrixHelper?.isOverlap(actualBStart, p1End, slot.start, slot.end)) {
                            hasConflict = true; break;
                        }
                    }
                    simTimelineGrid[pref1].push({ start: actualBStart, end: p1End, booking: bookingItem });
                }
                if (pref2 && String(pref2).toUpperCase() !== 'NULL' && String(pref2).trim() !== '') {
                    pref2 = String(pref2).toUpperCase();
                    if (!simTimelineGrid[pref2]) simTimelineGrid[pref2] = [];
                    for (const slot of simTimelineGrid[pref2]) {
                        if (String(slot.booking.rowId) !== String(bookingItem.rowId) && window.MatrixHelper?.isOverlap(p2Start, p2End, slot.start, slot.end)) {
                            hasConflict = true; break;
                        }
                    }
                    simTimelineGrid[pref2].push({ start: p2Start, end: p2End, booking: bookingItem });
                }
            } else {
                let bEnd = actualBStart + totalDuration + (parseInt(window.SYSTEM_CONFIG?.CLEANUP_MINS) || 0);
                let pref = bookingItem.current_resource_id || bookingItem.location || bookingItem.phase1_res_idx;
                if (pref && String(pref).toUpperCase() !== 'NULL' && String(pref).trim() !== '') {
                    pref = String(pref).toUpperCase();
                    if (!simTimelineGrid[pref]) simTimelineGrid[pref] = [];
                    for (const slot of simTimelineGrid[pref]) {
                        if (String(slot.booking.rowId) !== String(bookingItem.rowId) && window.MatrixHelper?.isOverlap(actualBStart, bEnd, slot.start, slot.end)) {
                            hasConflict = true; break;
                        }
                    }
                    simTimelineGrid[pref].push({ start: actualBStart, end: bEnd, booking: bookingItem });
                }
            }
        }
        return hasConflict;
    };

    // 5. Test Data
    const activeBookings = [
        {
            rowId: 'PENG', category: 'SINGLE',
            current_resource_id: 'CHAIR-1-4',
            startTimeString: '2026-07-13 15:45', duration: 60 
            // 15:45 = 945. Ends at 1005
        },
        {
            rowId: 'JIAN', category: 'SINGLE',
            current_resource_id: 'CHAIR-1-5',
            startTimeString: '2026-07-13 15:30', duration: 50 
            // 15:30 = 930. Ends at 980
        }
    ];
    
    // Simulate SmartScheduler returning a payload that moves JIAN to CHAIR-1-4
    const payloads = [
        {
            rowId: 'JIAN',
            current_resource_id: 'CHAIR-1-4',
            location: 'CHAIR-1-4'
        }
    ];
    
    return simulateSwapOverlap(activeBookings, payloads);
  });
  
  console.log('Simulation Result: hasConflict =', result);
  expect(result).toBe(true);
});

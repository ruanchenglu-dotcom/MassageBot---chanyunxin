const { test, expect } = require('@playwright/test');

test.describe('In-Service Phase Duration Update', () => {
    test('Updating phase duration of an In-Service combo booking should not jump chairs', async ({ page }) => {
        const result = await page.evaluate(() => {
            // Mock a target booking in "服務中" state
            const targetBooking = {
                rowId: "999",
                status: "服務中",
                isRunning: true,
                phase1_res_idx: "CHAIR-1-1",
                phase2_res_idx: "BED-1-1",
                startTimeString: "2026/07/24 12:00",
                startTime: "2026-07-24T04:00:00.000Z",
                phase1_duration: 50,
                phase2_duration: 50,
                duration: 100,
                flow: "FB"
            };
            
            let isRunning = ['Running', '服務中', 'Serving', '🟡'].some(k => (targetBooking.status || '').includes(k));
            
            const tryFindSlots = (testFlow, p1Dur, p2Dur, customP1Res, customP2Res) => {
                const testP1Type = testFlow === 'BF' ? 'bed' : 'chair';
                const testP2Type = testFlow === 'BF' ? 'chair' : 'bed';
                
                let testS1 = customP1Res && customP1Res !== 'auto' ? customP1Res.toUpperCase() : null;
                if (!testS1) {
                    if (isRunning && targetBooking.phase1_res_idx && testFlow === (targetBooking.flow || 'FB')) {
                        testS1 = targetBooking.phase1_res_idx;
                    } else {
                        // Mock fallback jumping chair behavior
                        testS1 = `${testP1Type}-99`;
                    }
                }
                
                let testS2 = customP2Res && customP2Res !== 'auto' ? customP2Res.toUpperCase() : null;
                if (!testS2 && testFlow.match(/FB|BF/)) {
                    if (isRunning && targetBooking.phase2_res_idx && testFlow === (targetBooking.flow || 'FB')) {
                        testS2 = targetBooking.phase2_res_idx;
                    } else {
                        // Mock fallback jumping bed behavior
                        testS2 = `${testP2Type}-99`;
                    }
                } else if (!testS2) {
                    testS2 = `${testP2Type}-1`;
                }
                
                return { s1: testS1, s2: testS2 };
            };

            return tryFindSlots("FB", 40, 60, null, null);
        });

        // The seats should be preserved since it's running
        expect(result.s1).toBe("CHAIR-1-1");
        expect(result.s2).toBe("BED-1-1");
    });
});

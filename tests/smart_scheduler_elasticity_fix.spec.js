const { test, expect } = require('@playwright/test');

test.describe('Smart Scheduler - Elasticity Fix', () => {
    test('Should not stretch booking unnecessarily and enforce limits without serviceCode', async ({ page }) => {
        
        await page.goto('http://localhost:5001/');
        await page.waitForFunction(() => window.SmartScheduler !== undefined, { timeout: 10000 });

        const result = await page.evaluate(() => {
            // Mock a booking with no serviceCode but with serviceName
            const b = {
                rowId: '999',
                category: 'COMBO',
                flow: 'FB',
                duration: 100,
                serviceName: 'A3 套餐(100分) 油推',
                phase1_res_idx: 'CHAIR-1-1',
                phase2_res_idx: 'BED-1-1',
                startTimeString: '10:00',
                time: '10:00'
            };

            const originalState = {
                '999': {
                    res: 'CHAIR-1-1',
                    phase1_res: 'CHAIR-1-1',
                    phase2_res: 'BED-1-1',
                    flow: 'FB'
                }
            };
            
            // Call SmartScheduler.solve
            // activeBookings = [b]
            // currentAssignments = originalState
            // targetIdUpper = 'CHAIR-1-1'
            // To simulate "no conflict", we make sure no other bookings exist.
            
            const assignments = window.SmartScheduler.solve(
                b, 
                originalState['999'], 
                '999', 
                'CHAIR-1-1', 
                [b], 
                { ...originalState }, 
                originalState, 
                true
            );
            
            return {
                assignments,
                booking: b
            };
        });

        // The expected behavior when there is no conflict:
        // transitionShift and timeShift should be 0 (no stretching to chase gap bonuses).
        expect(result.assignments).toBeTruthy();
        expect(result.assignments['999']).toBeTruthy();
        
        const assignment = result.assignments['999'];
        expect(assignment.timeShift).toBe(0);
        expect(assignment.transitionShift).toBe(0);

        console.log('Elasticity fix test passed: booking was not stretched unnecessarily!');
    });
});

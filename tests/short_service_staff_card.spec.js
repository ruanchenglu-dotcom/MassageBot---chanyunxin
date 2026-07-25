const { test, expect } = require('@playwright/test');

test.describe('Short Service Staff Card Logic (1 Block)', () => {
  test('processStartWork should return BUSY_SHORT for duration <= 40', async ({ page }) => {
    console.log("Navigating to admin panel...");
    await page.goto('http://localhost:5001/admin2/');

    console.log("Waiting for app to load...");
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Run the logic directly inside the page context
    const result = await page.evaluate(async () => {
        if (!window.StaffSorter || !window.StaffSorter.processStartWork) {
            return { error: 'StaffSorter not found' };
        }

        const baseNow = Date.now();
        const currentStatusData = {
            'T1': { status: 'READY', stafftime: baseNow - 100000 },
            'T2': { status: 'READY', stafftime: baseNow - 50000 }
        };

        // T1 does a short service (30 mins), T2 does a long service (60 mins)
        const newStatusData = await window.StaffSorter.processStartWork(
            ['T1', 'T2'], 
            currentStatusData, 
            baseNow, 
            [30, 60]
        );

        return newStatusData;
    });

    expect(result.error).toBeUndefined();
    
    // T1 should be BUSY_SHORT and keep its old stafftime
    expect(result['T1'].status).toBe('BUSY_SHORT');
    expect(result['T1'].previousStafftime).toBeDefined();

    // T2 should be BUSY and get a new stafftime
    expect(result['T2'].status).toBe('BUSY');
    expect(result['T2'].stafftime).toBeGreaterThan(result['T2'].previousStafftime);

    console.log("Test Passed: processStartWork successfully applied BUSY_SHORT to 1-block service!");
  });
});

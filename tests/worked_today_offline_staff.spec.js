const { test, expect } = require('@playwright/test');

test.describe('Worked Today Offline Staff Render', () => {
    test('should render offline staff who are not marked as OFF with grayscale cards on the left', async ({ page }) => {
        // Intercept API call to return custom data
        await page.route('**/api/info*', async route => {
            const json = {
                status: 'success',
                bookings: [],
                staffList: [
                    { id: '1', name: 'Worker A', off: false, gender: '女', start: '10:00' },
                    { id: '2', name: 'Worker B', off: true, gender: '女' }, // Marked off, shouldn't appear
                    { id: '3', name: 'Worker C', off: false, gender: '男' }, // READY, shouldn't be in grayscale
                    { id: '4', name: 'Worker D', off: false, gender: '男', start: '14:30' } // Male, AWAY
                ],
                staffStatus: {
                    '1': { status: 'AWAY', stafftime: 0, checkInTime: 0 },
                    '2': { status: 'AWAY', stafftime: 0, checkInTime: 0 },
                    '3': { status: 'READY', stafftime: Date.now(), checkInTime: Date.now() },
                    '4': { status: 'AWAY', stafftime: 0, checkInTime: 0 }
                },
                scheduleMap: {}
            };
            await route.fulfill({ json });
        });

        await page.goto('http://localhost:5001/admin2');
        await page.waitForTimeout(2000);

        // Find the container with grayscale filter
        const grayContainer = page.locator('div.opacity-60.grayscale');
        
        await expect(grayContainer).toBeVisible();
        
        // Wait for cards to render
        await page.waitForTimeout(500);

        // Get inner text of the gray container
        const grayCardTexts = await grayContainer.innerText();
        console.log('Grayscale Container Content:', grayCardTexts);
        
        // Worker A should be here because off is false and status is AWAY
        expect(grayCardTexts).toContain('Worker A');
        
        // Worker B should NOT be here because off is true
        expect(grayCardTexts).not.toContain('Worker B');
        
        // Worker C should NOT be here because status is READY
        expect(grayCardTexts).not.toContain('Worker C');

        // Worker D should be here because off is false and status is AWAY
        expect(grayCardTexts).toContain('Worker D');

        // Check female border for Worker A
        const workerACard = grayContainer.locator('.card-3d', { hasText: 'Worker A' }).first();
        await expect(workerACard).toHaveClass(/border-pink-400/);

        // Check male border for Worker D
        const workerDCard = grayContainer.locator('.card-3d', { hasText: 'Worker D' }).first();
        await expect(workerDCard).toHaveClass(/border-blue-400/);

        // Check shift start time display
        const workerATime = grayContainer.locator('div', { hasText: '10:00' }).first();
        await expect(workerATime).toBeVisible();

        const workerDTime = grayContainer.locator('div', { hasText: '14:30' }).first();
        await expect(workerDTime).toBeVisible();
    });
});

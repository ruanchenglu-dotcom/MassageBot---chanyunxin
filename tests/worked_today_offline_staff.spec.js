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

        // Find the container for workedTodayStaff (the first flex-row-reverse div)
        const awayContainer = page.locator('div.flex-row-reverse').first();
        
        await expect(awayContainer).toBeVisible();
        
        // Wait for cards to render
        await page.waitForTimeout(500);

        // Get inner text of the container
        const awayCardTexts = await awayContainer.innerText();
        console.log('Away Container Content:', awayCardTexts);
        
        // Worker A and D should be here
        expect(awayCardTexts).toContain('Worker A');
        expect(awayCardTexts).toContain('Worker D');
        
        // Worker B (off=true) and Worker C (status=READY) should NOT be here
        expect(awayCardTexts).not.toContain('Worker B');
        expect(awayCardTexts).not.toContain('Worker C');

        // Check female border for Worker A (inline style computed as rgb)
        const workerACard = awayContainer.locator('.card-3d', { hasText: 'Worker A' }).first();
        await expect(workerACard).toHaveAttribute('style', /244, 114, 182/);

        // Check male border for Worker D (inline style computed as rgb)
        const workerDCard = awayContainer.locator('.card-3d', { hasText: 'Worker D' }).first();
        await expect(workerDCard).toHaveAttribute('style', /96, 165, 250/);

        // Check shift start time display
        const workerATime = awayContainer.locator('div', { hasText: '10:00' }).first();
        await expect(workerATime).toBeVisible();

        const workerDTime = awayContainer.locator('div', { hasText: '14:30' }).first();
        await expect(workerDTime).toBeVisible();

        // Check order (Worker A is 10:00, Worker D is 14:30)
        // Array is sorted ascending: [Worker A, Worker D]
        // DOM order should be Worker A then Worker D
        const cards = awayContainer.locator('.card-3d');
        await expect(cards).toHaveCount(2);
        await expect(cards.nth(0)).toContainText('Worker A');
        await expect(cards.nth(1)).toContainText('Worker D');
    });
});

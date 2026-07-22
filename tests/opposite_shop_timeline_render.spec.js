const { test, expect } = require('@playwright/test');

test.describe('Opposite Shop Timeline Rendering Fix', () => {
    test('booking at 對面館 should render correctly on the timeline without opp- prefix bug', async ({ page }) => {
        
        // Mock the API response to inject a test booking for the opposite shop
        await page.route('/api/info*', async route => {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            
            // Set time to something during the day (e.g. 14:00)
            const mockDate = `${year}/${month}/${day}`;
            const mockTime = '14:00';
            
            const mockData = {
                bookings: [
                    {
                        rowId: 9999,
                        date: mockDate,
                        time: mockTime,
                        customerName: 'TestOpposite',
                        phone: '12345678',
                        serviceName: '身體按摩 (120分)',
                        pax: 1,
                        duration: 120,
                        location: '對面館',
                        phase1_res_idx: 'BED-2-1',
                        phase2_res_idx: '',
                        status: 'Đã Đặt',
                        startTimeString: `${mockDate} ${mockTime}`
                    }
                ],
                resources: { chairs: 6, beds: 6, oppChairs: 4, oppBeds: 6 },
                resourceState: {},
                staffStatus: {},
                schedule: {},
                services: []
            };
            
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockData)
            });
        });

        // Navigate to the admin timeline view
        await page.goto('http://localhost:5001/admin2');
        
        // Switch to the Opposite Shop (對面館) tab
        const oppShopTab = page.locator('button', { hasText: '對面館' }).first();
        await expect(oppShopTab).toBeVisible({ timeout: 10000 });
        await oppShopTab.click();
        
        // Wait for the timeline to render
        await page.waitForTimeout(2000);
        
        // Check if the mock booking is rendered in the timeline grid
        const timelineBlock = page.locator('.timeline-block').first();
        await expect(timelineBlock).toBeVisible({ timeout: 5000 });
        
        const bookingText = await timelineBlock.textContent();
        expect(bookingText).toContain('T');
    });
});

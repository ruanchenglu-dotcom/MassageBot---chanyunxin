const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Group COMBO to FOOT Capacity Check', async ({ page }) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = yyyy + '/' + mm + '/' + dd;

    const mockBookings = [];
    for(let i=1; i<=4; i++) {
        mockBookings.push({
            rowId: 'target-booking-' + i,
            date: dateStr,
            startTimeString: dateStr + ' 10:00:00',
            startTime: '10:00',
            originalName: 'Kang(' + i + '/4)',
            customerName: 'Kang(' + i + '/4)',
            serviceName: '套餐 (190分)',
            cleanServiceName: '套餐 (190分)',
            duration: 190,
            status: '等待中',
            resourceId: 'BED-1-' + i,
            current_resource_id: 'BED-1-' + i,
            location: 'BED-1-' + i,
            staffId: '隨機',
            flow: 'FB',
            flowCode: 'FB',
            groupId: 'g1'
        });
    }

    await page.route('**/api/info*', async (route) => {
        await route.fulfill({ json: { bookings: mockBookings, timeline: [], staffList: [] } });
    });

    await page.goto('/admin2/index.html');
    
    const bookingEl = await page.getByText('Kang(1/4)').first();
    await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
    await bookingEl.click({ force: true });
    
    await page.waitForSelector('select', { timeout: 10000 });
    
    const serviceSelect = page.locator('select').first();
    await serviceSelect.selectOption({ label: '腳底按摩 (90分)' });

    const updateGroupBtn = page.locator('button', { hasText: '修改全組' });
    if (await updateGroupBtn.isVisible({timeout: 2000})) {
         await updateGroupBtn.click();
    }
    
    const errorMsgLocator = page.locator('text=❌ 床區客滿');
    await expect(errorMsgLocator).not.toBeVisible({ timeout: 2000 });
});

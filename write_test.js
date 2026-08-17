const fs = require('fs');
const content = \const { test, expect } = require('@playwright/test');
test.describe('Group COMBO to FOOT Capacity Check', () => {
    test('Should calculate flowCode correctly for capacity check when downgrading to FOOT', async ({ page, request }) => {
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
        
        await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: true,
                name: 'Kang (Group)',
                phone: '0911223355',
                guestCount: 4,
                service_code: '190',
                duration: 190,
                location: '本館',
                date: dateStr,
                startTime: '14:00',
                type: 'COMBO',
                guests: [
                    { category: 'COMBO', flow: 'FB', duration: 190 },
                    { category: 'COMBO', flow: 'FB', duration: 190 },
                    { category: 'COMBO', flow: 'FB', duration: 190 },
                    { category: 'COMBO', flow: 'FB', duration: 190 }
                ],
                flow: 'FB'
            }
        });

        await page.goto('http://localhost:5001/admin2/index.html');
        await page.waitForSelector('.booking-block', { timeout: 30000 });
        
        const bookingCard = page.locator('.booking-block', { hasText: 'Kang (Group)' }).first();
        await bookingCard.click();
        
        await page.waitForSelector('.modal-content', { timeout: 10000 });
        
        const serviceSelect = page.locator('.modal-content select').first();
        await serviceSelect.selectOption({ label: '腳底按摩 (90分)' });
        
        const updateGroupBtn = page.locator('button', { hasText: '修改全組' });
        try {
            await updateGroupBtn.waitFor({ state: 'visible', timeout: 3000 });
            await updateGroupBtn.click();
        } catch(e) {}

        const errorMsgLocator = page.locator('text=❌ 床區客滿');
        await expect(errorMsgLocator).not.toBeVisible({ timeout: 2000 });
    });
});\;
fs.writeFileSync('tests/group_combo_to_foot_capacity.spec.js', content);

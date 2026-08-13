const { test, expect } = require('@playwright/test');

test.describe('Group COMBO to BODY Capacity Check', () => {
    test('Should calculate flowCode correctly for capacity check', async ({ page, request }) => {
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
        
        // 1. Create a COMBO BF booking (starts with BED)
        await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: false,
                name: "Test Combo BF",
                phone: "0911223344",
                guestCount: 1,
                service_code: "100", // Combo
                duration: 120,
                location: "本館",
                date: dateStr,
                startTime: "12:00",
                type: "COMBO",
                guests: [{ category: "COMBO", flow: "BF", duration: 120 }],
                flow: "BF",
                phase1_res_idx: "BED-1-1",
                phase2_res_idx: "CHAIR-1-1",
            }
        });

        // 2. Open page
        await page.goto('http://localhost:5001/admin2/index.html');
        await page.waitForSelector('.booking-block', { timeout: 30000 });
        
        // Click the booking
        const bookingCard = page.locator('.booking-block', { hasText: 'Test Combo BF' }).first();
        await bookingCard.click();
        
        // Wait for edit modal
        await page.waitForSelector('text=儲存修改', { timeout: 10000 });
        
        // Change to BODY
        const serviceSelect = page.locator('select').first();
        await serviceSelect.selectOption({ label: '身體按摩 (120分)' });
        
        // Ensure no "床區客滿" error
        const errorMsgLocator = page.locator('text=❌ 床區客滿');
        await expect(errorMsgLocator).not.toBeVisible({ timeout: 2000 });
        
        // Clean up: delete the booking
        const deleteBtn = page.locator('button[title="刪除預約"]');
        if (await deleteBtn.isVisible()) {
            await deleteBtn.click();
            await page.locator('button:has-text("確定刪除")').click();
        }
    });
});

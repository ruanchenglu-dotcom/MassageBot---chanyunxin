const { test, expect } = require('@playwright/test');

test.describe('Booking List View Enhancements', () => {
    test('should display new columns and allow editing', async ({ page }) => {
        // Navigate to the list view
        await page.goto('http://localhost:5001/admin2');
        
        // Wait for the app to load
        await page.waitForTimeout(2000);
        
        // Switch to List View if there's a tab
        const listViewBtn = page.locator('button', { hasText: '列表' }).first();
        if (await listViewBtn.count() > 0 && await listViewBtn.isVisible()) {
            await listViewBtn.click();
        }

        // Wait for table to render
        await page.waitForSelector('thead tr th');

        // Verify headers are present
        const headers = await page.locator('thead tr th').allInnerTexts();
        
        console.log('Headers:', headers);
        const nameIdx = headers.findIndex(h => h.includes('姓名'));
        const phoneIdx = headers.findIndex(h => h.includes('電話'));
        const itemIdx = headers.findIndex(h => h.includes('項目'));
        
        expect(nameIdx).toBeGreaterThan(-1);
        expect(phoneIdx).toBe(nameIdx + 1);
        expect(itemIdx).toBe(phoneIdx + 1);
        
        // Ensure 滑罐 and 拔罐 are present
        expect(headers).toContain('滑罐');
        expect(headers).toContain('拔罐');
        expect(headers).toContain('地點');
        
        // Find a booking row and double click to edit
        const firstRow = page.locator('tbody tr').filter({ hasNotText: '暫無預約資料' }).first();
        if (await firstRow.isVisible()) {
            await firstRow.dblclick();
            
            // Wait for edit mode
            await page.waitForTimeout(500);
            
            // Check if checkboxes for isHuaGuan and isBaGuan exist
            // They should be checkboxes in the row
            const editRow = page.locator('tbody tr').first();
            const checkboxes = editRow.locator('input[type="checkbox"]');
            
            // We should have 4 checkboxes now: isYouTui, isGuaSha, isHuaGuan, isBaGuan
            expect(await checkboxes.count()).toBe(4);
            
            // Check Location dropdown
            const locationDropdown = editRow.locator('select').filter({ hasText: '對面館' });
            expect(await locationDropdown.count()).toBeGreaterThan(0);
        }
    });
});

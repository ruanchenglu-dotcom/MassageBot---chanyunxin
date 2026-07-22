const { test, expect } = require('@playwright/test');

test.describe('Booking Location Switch', () => {
    test('should pass availability check when switching location', async ({ page }) => {
        // Navigate to the admin view
        await page.goto('http://localhost:5001/admin2');
        
        // Wait for the app to load
        await page.waitForTimeout(2000);
        
        // Switch to List View if there's a tab
        const listViewBtn = page.locator('button', { hasText: '列表' }).first();
        if (await listViewBtn.count() > 0 && await listViewBtn.isVisible()) {
            await listViewBtn.click();
        }

        // Wait for table to render
        await page.waitForSelector('tbody tr');
        await page.waitForTimeout(1000); // let bindings settle

        // Click the first edit button (pencil icon might be text or something)
        // Let's use the button that is inside the row.
        const editBtns = page.locator('button').filter({ hasText: '✏️' });
        const count = await editBtns.count();
        
        if (count > 0) {
            await editBtns.first().click();
            
            // Wait for edit mode inputs to appear
            await page.waitForTimeout(1000);
            
            // Select "對面館" in the location dropdown
            // To be precise, we can find the select that has "本館" and "對面館"
            // Since we know the form is a table row in yellow (bg-yellow-50),
            // let's just select the last dropdown in the edit row (which is location).
            const locationSelect = page.locator('tr.bg-yellow-50 select').last();
            await locationSelect.selectOption('對面館');
            
            // Click "查詢空位"
            const scanBtn = page.locator('tr.bg-yellow-50 button', { hasText: '查詢空位' });
            await scanBtn.click();
            
            // It should say "✅ 檢查通過，可儲存" or change button to "💾 儲存"
            const saveBtn = page.locator('tr.bg-yellow-50 button', { hasText: '儲存' });
            await expect(saveBtn).toBeVisible({ timeout: 5000 });
        } else {
            console.log('No bookings to test edit');
        }
    });
});

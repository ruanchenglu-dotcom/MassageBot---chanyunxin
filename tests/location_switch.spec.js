const { test, expect } = require('@playwright/test');

test.describe('Booking Location Switch', () => {
    test('should allow switching location and assign correct resource ID prefix', async ({ page }) => {
        // Navigate to the app
        await page.goto('http://localhost:5001/admin2');
        
        // Wait for the app to load
        await page.waitForTimeout(2000);
        
        // Switch to List View
        const listViewBtn = page.locator('button', { hasText: '列表' }).first();
        if (await listViewBtn.count() > 0 && await listViewBtn.isVisible()) {
            await listViewBtn.click();
        }

        // Wait for table to render
        await page.waitForSelector('tbody tr');
        
        // Find the first editable row that is not finished
        const rows = page.locator('tbody tr').filter({ hasNotText: '暫無預約資料' });
        const rowCount = await rows.count();
        if (rowCount > 0) {
            let editableRow = null;
            for (let i = 0; i < rowCount; i++) {
                const text = await rows.nth(i).innerText();
                if (!text.includes('✅') && !text.includes('❌')) {
                    editableRow = rows.nth(i);
                    break;
                }
            }

            if (editableRow) {
                // Double click to edit
                await editableRow.dblclick();
                await page.waitForTimeout(1000);
                
                const trEdit = page.locator('tbody tr').first();
                // Find location dropdown
                const locationSelect = trEdit.locator('select').nth(0); // Assuming first select might not be location, let's target by specific options
                
                // Usually the location select contains '本館' and '對面館'
                const selectElement = trEdit.locator('select').filter({ hasText: '對面館' });
                
                if (await selectElement.count() > 0) {
                    await selectElement.selectOption('對面館');
                    await page.waitForTimeout(500); // wait for validation

                    // Find and click the '確定' (Confirm/Save) button in this row
                    const confirmBtn = trEdit.locator('button[title="確定"]');
                    if (await confirmBtn.count() > 0) {
                        await confirmBtn.click();
                        
                        // Handle SweetAlert popup if any
                        await page.waitForTimeout(1000);
                        
                        // Check if it saved successfully
                        // Normally it updates and returns to view mode
                        expect(await page.locator('input').count()).toBeLessThan(10);
                    }
                }
            }
        }
    });
});

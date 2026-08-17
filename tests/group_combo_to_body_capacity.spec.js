const { test, expect } = require('@playwright/test');
const fs = require('fs');

test.describe('Group COMBO to BODY Capacity Check', () => {
    test('Should calculate flowCode correctly for capacity check', async ({ page }) => {
        test.setTimeout(60000);
        
        // Read mock data
        const mockData = JSON.parse(fs.readFileSync('tests/mock_info.json', 'utf8'));

        // Mock API info
        await page.route('**/api/info*', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockData)
            });
        });

        // Mock updates
        await page.route('**/api/update-status', route => route.fulfill({ json: { status: 'success' } }));
        await page.route('**/api/inline-update-group', route => route.fulfill({ json: { status: 'success' } }));

        // 1. Open page
        await page.goto('http://localhost:5001/admin2/index.html');
        
        // Wait for UI to load
        await expect(page.getByText('預約')).toBeVisible();

        // Wait for data to fetch and render
        await page.waitForTimeout(3000);
        
        // 10. Click on the first guest's booking block to edit
        const c14Card = page.locator('div:has-text("Test (1/4)")').last();
        await c14Card.click({ force: true });
        
        await page.waitForTimeout(1000); // Wait for modal to open
        
        // 11. Change to BODY 120 mins
        await page.waitForTimeout(1000);
        const selects = await page.$$('.fixed.inset-0 select');
        for (const select of selects) {
            const text = await select.innerText();
            if (text.includes('身體按摩') || text.includes('B4')) {
                const options = await select.$$('option');
                for (const option of options) {
                    const optText = await option.innerText();
                    const optValue = await option.getAttribute('value');
                    if (optText.includes('身體按摩 (120分)') || optValue === 'B4' || optValue.includes('120分')) {
                        await select.selectOption(optValue);
                        await page.waitForTimeout(1000); // Wait for React to render the 查詢 button
                        break;
                    }
                }
                break;
            }
        }
        
        // 12. Click check
        const clicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            console.log('All buttons:', btns.map(b => b.textContent));
            const checkBtn = btns.find(b => b.textContent.includes('查詢') && b.textContent.includes('🔍'));
            if (checkBtn) {
                checkBtn.click();
                return true;
            }
            return false;
        });
        if (!clicked) {
            await page.screenshot({ path: 'modal_error.png' });
            throw new Error('Check button not found or clicked!');
        }
        
        // 13. Wait for group modal and click "Modify whole group"
        const updateGroupBtn = page.locator('button', { hasText: '修改全組' });
        await updateGroupBtn.waitFor({ state: 'visible', timeout: 5000 });
        await updateGroupBtn.click();
        
        // 14. Ensure no capacity error appears
        const errorMsgLocator = page.locator('text=該時段已客滿');
        await expect(errorMsgLocator).not.toBeVisible({ timeout: 2000 });
        
        // 15. Ensure "Combo time adjustment" disappears
        const comboAdjLocator = page.locator('text=套餐時間調整');
        await expect(comboAdjLocator).not.toBeVisible({ timeout: 2000 });
        
        // Clean up
        const cancelBtn = page.locator('button', { hasText: '取消 (Cancel)' }).first();
        if (await cancelBtn.isVisible()) {
            await cancelBtn.click();
        } else {
             await page.locator('button', { hasText: '取消' }).first().click();
        }
    });
});

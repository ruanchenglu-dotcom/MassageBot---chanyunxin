const { test, expect } = require('@playwright/test');

test.describe('Staff Auto-Transition OUT_SHORT Feature', () => {
    test('Should display 已外出 and handle 翻牌 properly', async ({ page }) => {
        await page.goto('http://localhost:5001/admin2/index.html');
        await page.waitForSelector('.card-3d', { timeout: 10000 }).catch(() => {});
        const firstStaff = page.locator('.card-3d').first();
        if (await firstStaff.count() > 0) {
            await firstStaff.click();
            const outBtn = page.locator('button:has-text("外出")');
            const alreadyOutBtn = page.locator('button:has-text("已外出")');
            if (await outBtn.count() > 0) {
                await outBtn.click();
                const absSelects = page.locator('.fixed.inset-0 select');
                if (await absSelects.count() >= 4) {
                    await absSelects.nth(0).selectOption('08');
                    await absSelects.nth(1).selectOption('00');
                    await absSelects.nth(2).selectOption('23');
                    await absSelects.nth(3).selectOption('00');
                }
                const checkAvailableBtn = page.locator('button:has-text("檢查空檔")');
                await checkAvailableBtn.click();
                const confirmBtn = page.locator('button:has-text("確認並更新時間")');
                await expect(confirmBtn).toBeVisible({ timeout: 5000 });
                await confirmBtn.click();
                await page.waitForTimeout(1000);
            }
            await expect(alreadyOutBtn).toBeVisible({ timeout: 5000 });
            await alreadyOutBtn.click();
            const swal = page.locator('.swal2-container');
            await expect(swal).toBeVisible();
            await expect(swal.locator('text=確定要翻牌並提早返回嗎')).toBeVisible();
            await swal.locator('button:has-text("確定翻牌")').click();
            await page.waitForTimeout(1000);
            await expect(outBtn).toBeVisible({ timeout: 5000 });
        } else {
            console.log("No staff cards found to test");
        }
    });
});
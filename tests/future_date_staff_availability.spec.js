const { test, expect } = require('@playwright/test');

test('Verify staff availability on 2026-07-29', async ({ page }) => {
  await page.goto('http://localhost:5001/admin2/index.html');
  await expect(page.getByText('預約')).toBeVisible({ timeout: 15000 });

  await page.getByText('預約').click();

  const dateInput = page.locator('input[type="date"]').nth(1);
  await expect(dateInput).toBeVisible({ timeout: 10000 });
  await dateInput.fill('2026-07-29');

  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  await hourSelect.selectOption('08');

  const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  await searchBtn.click();
  
  await page.waitForTimeout(3000);
  
  const bodyText = await page.locator('body').textContent();
  
  expect(bodyText).not.toContain('總: 0 (女0/男0)');
});
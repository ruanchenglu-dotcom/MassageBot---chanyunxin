const { test, expect } = require('@playwright/test');

test('Add a standby booking', async ({ page }) => {
  // Navigate to the portal
  await page.goto('http://localhost:5001/admin2/index.html');

  // Wait for the UI to be fully loaded
  await expect(page.getByText('預約').first()).toBeVisible();

  // Step 1: Open the Reservation Modal
  await page.getByText('預約').first().click();

  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  await hourSelect.selectOption('12');

  // Explicitly choose "套餐 (100分)"
  const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  const guestServiceSelect = guestRow.locator('select').first();
  await guestServiceSelect.selectOption('套餐 (100分)');

  // Click Standby Button
  const standbyBtn = page.getByRole('button', { name: /📝 候補/ });
  await expect(standbyBtn).toBeVisible();
  await standbyBtn.click();

  // Step 2: Form step STANDBY_INFO -> Fill details
  const nameInput = page.getByPlaceholder(/輸入姓名/);
  await nameInput.fill('Standby Test User');

  const phoneInput = page.getByPlaceholder(/09xx/);
  await phoneInput.fill('0987654321');

  // Fill Arrival Time
  const arrivalSelect = page.locator('select:has(option[value="15分鐘"])');
  await expect(arrivalSelect).toBeVisible();
  await arrivalSelect.selectOption('15分鐘');

  // Final Save
  const confirmBtn = page.getByRole('button', { name: /✅ 確認候補|✅ 確認/ });
  await confirmBtn.click();

  // Verify modal closes
  await expect(page.getByRole('button', { name: /📝 候補/ })).toBeHidden({ timeout: 10000 });
});

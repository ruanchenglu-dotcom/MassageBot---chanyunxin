const { test, expect } = require('@playwright/test');

test('Test Phase Duration Adjustment and Conflict Prevention', async ({ page }) => {
  // Navigate to the admin portal
  await page.goto('http://localhost:5001/admin2/index.html');

  // Wait for the UI to be fully loaded
  await expect(page.getByText('預約')).toBeVisible({ timeout: 15000 });

  // Step 1: Create a new booking
  await page.getByText('預約').click();

  // Set hour to 12
  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  await hourSelect.selectOption('12');

  // Select "套餐 (130分)" (Combo)
  const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  const guestServiceSelect = guestRow.locator('select').first();
  await guestServiceSelect.selectOption('套餐 (130分)');

  const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  await searchBtn.click();
  
  const nextBtn = page.locator('button:has-text("下一步")');
  try {
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    await nextBtn.click();
  } catch (e) {
    await page.locator('.bg-yellow-50 button').first().click();
    await searchBtn.click();
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    await nextBtn.click();
  }

  const uniqueId = Date.now().toString().slice(-3);
  const testPhone = '0912345' + uniqueId;
  await page.getByPlaceholder('09xx...').fill(testPhone);
  await page.getByPlaceholder('輸入姓名...').fill('TestPhase');
  await page.locator('button:has-text("先生")').click();

  const confirmBtn = page.locator('button:has-text("確認")');
  await confirmBtn.click();

  const blockText = `T(1/1)(${uniqueId})`;
  await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });

  // Wait a moment for rendering
  await page.waitForTimeout(2000);

  // Step 2: Open the edit modal
  await page.getByText(blockText).first().click();
  
  // Wait for the modal content
  await expect(page.getByText('套餐時間調整')).toBeVisible({ timeout: 5000 });

  // Step 3: Change Phase 1 duration to 50
  const phase1Input = page.locator('input[type="number"]').first();
  await phase1Input.fill('50');
  
  // Click Save (保存同步)
  const saveBtn = page.locator('button:has-text("保存同步")');
  await saveBtn.click();

  // Verify the system saves without conflict error
  // Wait for the saving overlay to disappear
  await expect(page.locator('text=儲存中')).not.toBeVisible({ timeout: 10000 });

  // Assert that there is NO '資源衝突' warning
  const conflictWarning = page.getByText('資源衝突');
  await expect(conflictWarning).not.toBeVisible();
});

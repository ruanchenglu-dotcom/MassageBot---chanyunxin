const { test, expect } = require('@playwright/test');

test('Change booking from 120 to 90 mins should not cause phantom overlap', async ({ page }) => {
  // Navigate to the staff portal
  await page.goto('http://localhost:5001/admin2/index.html');
  await expect(page.getByText('預約')).toBeVisible();

  // Create Prior Booking (60 mins) at 10:00
  await page.getByRole('button', { name: /預約/ }).first().click();
  await page.locator('select').first().selectOption('10');
  
  const guestRow1 = page.locator('div.flex.flex-col.gap-2').first();
  // Select a service that does NOT have the duration in its name (e.g. "腳底按摩" or "全身指壓")
  // Let's just pick one from the list. 
  await guestRow1.locator('select').first().selectOption('腳底按摩 (40分)');
  
  const searchBtn1 = page.getByRole('button', { name: /查詢空位/ });
  await searchBtn1.click();
  const nextBtn1 = page.locator('button:has-text("下一步")');
  try {
    await expect(nextBtn1).toBeVisible({ timeout: 3000 });
    await nextBtn1.click();
  } catch (e) {
    await page.locator('.bg-yellow-50 button').first().click();
    await searchBtn1.click();
    await nextBtn1.click();
  }
  
  await page.getByPlaceholder('09xx...').fill('0911111111');
  await page.getByPlaceholder('輸入姓名...').fill('Prior');
  await page.locator('button:has-text("先生")').click();
  await page.locator('button:has-text("確認")').click();
  
  await expect(page.getByText('P(1/1)(111)').first()).toBeVisible({ timeout: 15000 });

  // Create TestUser Booking (120 mins) at 11:30
  await page.getByRole('button', { name: /預約/ }).first().click();
  
  // Set time to 11:30
  await page.locator('select').first().selectOption('11');
  await page.locator('select').nth(1).selectOption('30');
  
  const guestRow2 = page.locator('div.flex.flex-col.gap-2').first();
  // Select 120 mins service
  await guestRow2.locator('select').first().selectOption('腳底按摩 (120分)');
  
  const searchBtn2 = page.getByRole('button', { name: /查詢空位/ });
  await searchBtn2.click();
  const nextBtn2 = page.locator('button:has-text("下一步")');
  try {
    await expect(nextBtn2).toBeVisible({ timeout: 3000 });
    await nextBtn2.click();
  } catch (e) {
    await page.locator('.bg-yellow-50 button').first().click();
    await searchBtn2.click();
    await nextBtn2.click();
  }
  
  await page.getByPlaceholder('09xx...').fill('0922222222');
  await page.getByPlaceholder('輸入姓名...').fill('TestUser');
  await page.locator('button:has-text("先生")').click();
  await page.locator('button:has-text("確認")').click();
  
  await expect(page.getByText('T(1/1)(222)').first()).toBeVisible({ timeout: 15000 });

  // Drag both bookings to the SAME chair (e.g., 腳1-4)
  const priorBlock = page.getByText('P(1/1)(111)').first();
  const testUserBlock = page.getByText('T(1/1)(222)').first();
  
  const targetRow = page.locator('.hover\\:bg-slate-50').nth(3); // Let's use 4th row (腳1-4)
  
  await priorBlock.dragTo(targetRow);
  await expect(priorBlock).toBeVisible();
  
  // Give the UI a moment to update positions
  await page.waitForTimeout(500);
  
  await testUserBlock.dragTo(targetRow);
  await expect(testUserBlock).toBeVisible();

  // Open the edit modal for TestUser
  await testUserBlock.click();
  
  // Wait for the modal to open
  await expect(page.getByText('單項服務調整')).toBeVisible();

  // Change the service to 90 mins
  const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (120分)' }).first();
  await serviceSelect.selectOption('腳底按摩 (90分)');

  // Click 查詢 (Check) if it appears
  const checkBtn = page.getByRole('button', { name: /查詢/ });
  if (await checkBtn.isVisible()) {
    await checkBtn.click();
  }

  // Ensure "✅ 檢查通過，可儲存" appears, NOT "❌ 原座位時段衝突"
  await expect(page.getByText('✅')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('❌ 原座位時段衝突')).not.toBeVisible();

  // Click 保存 (Save)
  await page.locator('button:has-text("保存")').click();

  // Wait for modal to close
  await expect(page.getByText('單項服務調整')).not.toBeVisible();
});

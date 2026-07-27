const { test, expect } = require('@playwright/test');

test('Booking at Opposite Shop renders correctly on its tab', async ({ page }) => {
  // Navigate to the staff portal
  await page.goto('http://localhost:5001/admin2/index.html');

  // Wait for the UI to be fully loaded
  await expect(page.getByText('預約')).toBeVisible();

  // Step 1: Open the Reservation Modal
  await page.getByText('預約').click();

  // Switch Location to 對面館 (Opposite Shop)
  await page.getByRole('button', { name: '對面館', exact: true }).click();

  // Set hour to 12 to avoid out-of-bounds timeline issues
  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  await hourSelect.selectOption('12');

  // Explicitly choose "套餐 (100分)"
  const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  const guestServiceSelect = guestRow.locator('select').first();
  await guestServiceSelect.selectOption('套餐 (100分)');

  // Click Search Availability
  const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  await searchBtn.click();
  
  const nextBtn = page.locator('button:has-text("下一步")');
  try {
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    await nextBtn.click();
  } catch (e) {
    // Click the first suggestion if direct match fails
    await page.locator('.bg-yellow-50 button').first().click();
    await searchBtn.click();
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    await nextBtn.click();
  }

  // Step 3: Form step INFO -> Fill details
  const uniqueId = Date.now().toString().slice(-3);
  const testPhone = '0912345' + uniqueId;
  await page.getByPlaceholder('09xx...').fill(testPhone);
  
  await page.getByPlaceholder('輸入姓名...').fill('Opposite Test');
  await page.locator('button:has-text("先生")').click();

  // Submit the form
  const confirmBtn = page.locator('button:has-text("確認")');
  await confirmBtn.click();

  const blockText = `O(1/1)(${uniqueId})`;

  // Step 4: Verify it is NOT on the Main Shop timeline
  // Wait a bit for render
  await page.waitForTimeout(2000);
  
  // Make sure we are on the main tab initially
  const mainShopTab = page.locator('button', { hasText: '本館' }).first();
  await mainShopTab.click();
  await page.waitForTimeout(500);

  // Assert it doesn't appear in Main Shop
  await expect(page.getByText(blockText)).toHaveCount(0);

  // Switch to Opposite Shop tab
  const oppShopTab = page.locator('button', { hasText: '對面館' }).first();
  await oppShopTab.click();
  await page.waitForTimeout(500);

  // Verify it appears in Opposite Shop
  await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });
});

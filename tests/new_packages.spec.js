const { test, expect } = require('@playwright/test');

test('Verify A6 and F4 packages configuration in frontend', async ({ page }) => {
  // Navigate to the staff portal
  await page.goto('http://localhost:5001/admin2/index.html');

  // Wait for the UI to be fully loaded
  await expect(page.getByText('預約')).toBeVisible();

  // Wait for SERVICES_DATA to be populated by Babel/React
  await page.waitForFunction(() => window.SERVICES_DATA && Object.keys(window.SERVICES_DATA).length > 0);
  const servicesData = await page.evaluate(() => window.SERVICES_DATA);
  console.log('Available keys:', Object.keys(servicesData));
  
  // Verify A6 exists and has 6 blocks
  expect(servicesData['A6']).toBeDefined();
  expect(servicesData['A6'].name).toContain('190分');
  expect(servicesData['A6'].blocks).toBe(6);
  
  // Verify F4 exists and has 4 blocks
  expect(servicesData['F4']).toBeDefined();
  expect(servicesData['F4'].name).toContain('120分');
  expect(servicesData['F4'].blocks).toBe(4);

  // Now let's try to add a customer with A6 (190 mins) to test UI
  await page.getByText('預約').click();
  
  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  await hourSelect.selectOption('12');

  const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  const guestServiceSelect = guestRow.locator('select').first();
  await guestServiceSelect.selectOption('套餐 (190分)');

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
  await page.getByPlaceholder('輸入姓名...').fill('TestA6');
  await page.locator('button:has-text("先生")').click();

  const confirmBtn = page.locator('button:has-text("確認")');
  await confirmBtn.click();

  const blockText = `T(1/1)(${uniqueId})`; // "TestA6" starts with T
  await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });
  
  // Ensure the booking appears and no overlap warning. We assume it occupies 6 blocks successfully.
  const bookingBlock = page.getByText(blockText).first();
  await expect(bookingBlock).toBeVisible();
});

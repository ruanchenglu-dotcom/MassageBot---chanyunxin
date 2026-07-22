const { test, expect } = require('@playwright/test');

test('Verify Start Button Payload & Status Update', async ({ page, request }) => {
  // Intercept the /api/update-booking-details call
  let interceptedPayload = null;
  await page.route('**/api/update-booking-details', async route => {
    interceptedPayload = route.request().postDataJSON();
    await route.continue();
  });

  // Navigate to the staff portal
  await page.goto('http://localhost:5001/admin2/index.html');
  await expect(page.getByText('預約').first()).toBeVisible();

  // Create a booking
  await page.getByText('預約').first().click();
  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  await hourSelect.selectOption('12');

  const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  const guestServiceSelect = guestRow.locator('select').first();
  await guestServiceSelect.selectOption('腳底按摩 (70分)');

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
  await page.getByPlaceholder('輸入姓名...').fill('Playwright Test');
  await page.locator('button:has-text("先生")').click();
  
  const confirmBtn = page.locator('button:has-text("確認")');
  await confirmBtn.click();
  
  // Wait for it to appear
  const blockText = `P(1/1)(${uniqueId})`;
  await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });
  const newBooking = page.getByText(blockText).first();
  
  // Drag to an empty slot (rough estimation BED 1-1 at 12:00)
  const bed1_1 = page.locator('.resource-row').filter({ hasText: '腳1-1' }).locator('.time-slot').nth(12 * 4);
  
  await newBooking.dragTo(bed1_1, { force: true, targetPosition: { x: 5, y: 5 } });
  await page.waitForTimeout(1000);

  // Click on the dropped booking to open the control center
  await newBooking.click();

  // Wait for Control Center to open
  const startBtn = page.locator('button').filter({ hasText: '開始' }).first();
  await expect(startBtn).toBeVisible();
  
  // Click Start
  await startBtn.click();
  await page.waitForTimeout(2000);

  // Verify the API payload
  expect(interceptedPayload).not.toBeNull();
  expect(interceptedPayload.status).toBe('服務中');
  expect(interceptedPayload.current_resource_id).toBeDefined();
});

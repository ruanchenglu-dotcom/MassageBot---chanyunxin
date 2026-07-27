const { test, expect } = require('@playwright/test');

test('Group Booking Start respects manual staff assignments', async ({ page }) => {
  const interceptedPayloads = [];
  await page.route('**/api/update-booking-details', async route => {
    interceptedPayloads.push(route.request().postDataJSON());
    await route.continue();
  });

  await page.goto('http://localhost:5001/admin2/index.html');
  await expect(page.getByText('預約').first()).toBeVisible({ timeout: 30000 });

  // Create a Group booking for 2 people
  await page.getByText('預約').first().click();
  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  await hourSelect.selectOption('12');

  const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  const guestServiceSelect = guestRow.locator('select').first();
  await guestServiceSelect.selectOption('腳底按摩 (70分)');

  // Add a second person
  await page.getByRole('button', { name: '加人' }).click();
  const secondGuestRow = page.locator('div.flex.flex-col.gap-2').nth(1);
  const secondGuestServiceSelect = secondGuestRow.locator('select').first();
  await secondGuestServiceSelect.selectOption('全身指壓 (70分)');

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
  const testPhone = '0988' + uniqueId + '11';
  await page.getByPlaceholder('09xx...').fill(testPhone);
  await page.getByPlaceholder('輸入姓名...').fill('TestGroup');
  await page.locator('button:has-text("先生")').click();
  
  const confirmBtn = page.locator('button:has-text("確認")');
  await confirmBtn.click();
  
  // Wait for the booking blocks to appear
  const blockText1 = `T(1/2)(${uniqueId})`;
  const blockText2 = `T(2/2)(${uniqueId})`;
  await expect(page.getByText(blockText1).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(blockText2).first()).toBeVisible({ timeout: 15000 });
  
  const block1 = page.getByText(blockText1).first().locator('..').locator('..');
  const block2 = page.getByText(blockText2).first().locator('..').locator('..');

  // Drag both to the timeline (roughly 12:00 for BED 1-1 and BED 1-2)
  const bed1_1 = page.locator('.resource-row').filter({ hasText: '腳1-1' }).locator('.time-slot').nth(12 * 4);
  const bed1_2 = page.locator('.resource-row').filter({ hasText: '床1-1' }).locator('.time-slot').nth(12 * 4);
  
  await block1.dragTo(bed1_1, { force: true, targetPosition: { x: 5, y: 5 } });
  await page.waitForTimeout(500);
  await block2.dragTo(bed1_2, { force: true, targetPosition: { x: 5, y: 5 } });
  await page.waitForTimeout(500);

  // Open block 1 and change staff to someone specific
  await block1.click();
  await page.waitForTimeout(500);
  
  let staffSelect1 = block1.locator('select').first();
  const options1 = await staffSelect1.locator('option').allTextContents();
  // Find second valid option (skip "尚未安排")
  await staffSelect1.selectOption({ index: 1 });
  await page.waitForTimeout(500);
  const selectedStaff1 = await staffSelect1.inputValue();

  await block2.click();
  await page.waitForTimeout(500);
  let staffSelect2 = block2.locator('select').first();
  await staffSelect2.selectOption({ index: 2 });
  await page.waitForTimeout(500);
  const selectedStaff2 = await staffSelect2.inputValue();

  // Re-open block 1 control center and click Start Group
  await block1.click();
  await page.waitForTimeout(500);
  
  const startBtn = page.locator('button').filter({ hasText: '開始(全體)' }).first();
  if (await startBtn.isVisible()) {
      await startBtn.click();
  } else {
      await page.locator('button').filter({ hasText: '開始' }).first().click();
  }
  
  await page.waitForTimeout(2000);

  // The final START payloads should be intercepted
  const startPayloads = interceptedPayloads.filter(p => p.status === '服務中');
  expect(startPayloads.length).toBeGreaterThan(0);
  
  console.log("Start payloads intercepted:", startPayloads);
  
  // We expect the payload for the booking to have correct staff
  const payload = startPayloads[0];
  expect(payload['服務師傅1']).toBe(selectedStaff1);
  // Wait, if it's sent as a batch, does it send 服務師傅2 too? Yes!
  if (startBtn.isVisible()) {
      expect(payload['服務師傅2']).toBe(selectedStaff2);
  }
});

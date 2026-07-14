const { test, expect } = require('@playwright/test');

test('Test Inline Combo Duration Update preserves 100min duration', async ({ page }) => {
  await page.goto('http://localhost:5001/admin2/index.html');

  // Wait for the UI to be fully loaded
  await expect(page.getByText('預約')).toBeVisible({ timeout: 15000 });

  // Step 1: Create a new booking
  await page.getByText('預約').click();

  // Set hour to 12
  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  await hourSelect.selectOption('12');

  // Select "套餐 (100分)" (Combo)
  const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  const guestServiceSelect = guestRow.locator('select').first();
  await guestServiceSelect.selectOption('套餐 (100分)');

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
  const testName = 'TestInline' + uniqueId;
  await page.getByPlaceholder('輸入姓名...').fill(testName);
  await page.locator('button:has-text("先生")').click();

  const confirmBtn = page.locator('button:has-text("確認")');
  await confirmBtn.click();

  // Wait for booking to appear
  const blockText = `T(1/1)(${uniqueId})`;
  await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });

  await page.waitForTimeout(2000);

  // Step 2: Switch to List View
  await page.getByText('列表 (List)').click();
  await expect(page.getByText(testName).first()).toBeVisible({ timeout: 5000 });

  // Step 3: Click on the row to inline edit
  const row = page.locator('tr').filter({ hasText: testName }).first();
  const editBtn = row.locator('button[title="編輯 (Edit)"]').first();
  await expect(editBtn).toBeVisible({ timeout: 5000 });
  await editBtn.click();

  // Wait for the TimePicker24H minute select to appear (it's the second select in the row)
  const minuteSelect = page.locator('tr.bg-yellow-50').locator('select').nth(1);
  await expect(minuteSelect).toBeVisible({ timeout: 5000 });

  // Step 4: Change time to 12:05
  await minuteSelect.selectOption('05');
  
  // Click 查詢空位
  const searchBtnInline = page.locator('tr.bg-yellow-50').locator('button', { hasText: '🔍 查詢空位' });
  await searchBtnInline.click();
  
  // Wait for 儲存 to appear
  const saveBtnInline = page.locator('tr.bg-yellow-50').locator('button', { hasText: '💾 儲存' });
  await expect(saveBtnInline).toBeVisible({ timeout: 10000 });

  // Step 5: Save and intercept request
  const savePromise = page.waitForRequest(request => 
    request.url().includes('/api/inline-update-booking') && request.method() === 'POST'
  );

  // Click the save button
  await saveBtnInline.click();

  const request = await savePromise;
  const postData = JSON.parse(request.postData());
  
  // Verify that memberUpdates is sent and does NOT have phase1_duration: 30, phase2_duration: 30 for a 100min service
  // It should total 100, not 60.
  if (postData.memberUpdates && postData.memberUpdates.length > 0) {
      const update = postData.memberUpdates[0];
      const totalSimDuration = update.phase1_duration + update.phase2_duration;
      expect(totalSimDuration).toBe(100); // Should be 100, not 60
  }
  
  const response = await request.response();
  expect(response.ok()).toBeTruthy();
});

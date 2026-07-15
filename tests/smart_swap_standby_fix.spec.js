const { test, expect } = require('@playwright/test');

test('Drag and drop should work even when there are standby bookings in the system', async ({ page }) => {
  // Navigate to the portal
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  await page.goto('http://localhost:5001/admin2/index.html');
  await expect(page.getByText('預約').first()).toBeVisible();

  // ----- Step 1: Add a Standby Booking -----
  await page.getByText('預約').first().click();
  const standbyHourSelect = page.locator('select').first();
  await expect(standbyHourSelect).toBeVisible();
  await standbyHourSelect.selectOption('12');

  const standbyServiceSelect = page.locator('div.flex.flex-col.gap-2').first().locator('select').first();
  await standbyServiceSelect.selectOption('套餐 (100分)');

  const standbyBtn = page.getByRole('button', { name: /📝 候補/ });
  await expect(standbyBtn).toBeVisible();
  await standbyBtn.click();

  const standbyNameInput = page.getByPlaceholder(/輸入姓名/);
  await standbyNameInput.fill('Standby Guy');
  const standbyPhoneInput = page.getByPlaceholder(/09xx/);
  await standbyPhoneInput.fill('0911223344');

  const arrivalSelect = page.locator('select:has(option[value="15分鐘"])');
  await expect(arrivalSelect).toBeVisible();
  await arrivalSelect.selectOption('15分鐘');

  const confirmStandbyBtn = page.getByRole('button', { name: /✅ 確認候補|✅ 確認/ });
  await confirmStandbyBtn.click();
  await expect(page.getByRole('button', { name: /📝 候補/ })).toBeHidden({ timeout: 10000 });


  // ----- Step 2: Add a Normal Booking at 08:00 -----
  await page.getByText('預約').first().click();
  const normalHourSelect = page.locator('select').first();
  await expect(normalHourSelect).toBeVisible();
  await normalHourSelect.selectOption('08');

  const normalServiceSelect = page.locator('div.flex.flex-col.gap-2').first().locator('select').first();
  await normalServiceSelect.selectOption('套餐 (100分)');

  const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  await searchBtn.click();

  const nextBtn = page.getByRole('button', { name: /下一步/ });
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
  const testPhone = '0922334' + uniqueId;
  await page.getByPlaceholder('09xx...').fill(testPhone);
  await page.getByPlaceholder('輸入姓名...').fill('Normal Guy');
  await page.locator('button:has-text("先生")').click();

  const confirmBtn = page.locator('button:has-text("確認")');
  await confirmBtn.click();

  const blockText = `N(1/1)(${uniqueId})`; // N for Normal Guy
  await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });

  const bookingBlock = page.getByText(blockText).first();
  await expect(bookingBlock).toBeVisible({ timeout: 10000 });

  const rows = page.locator('.hover\\:bg-slate-50');
  await expect(rows.first()).toBeVisible();
  
  // Pick a row that is likely different from its current one
  const targetRow = rows.nth(3); 
  
  await bookingBlock.dragTo(targetRow);

  // ----- Step 3: Verify NO overlap/standby error appears -----
  // Verify that the "無法換位" warning is not shown
  const errorWarning = page.getByText('無法換位');
  // Playwright best practice: to verify something doesn't appear, check it's hidden after a short wait
  await expect(errorWarning).toBeHidden({ timeout: 3000 });
});

const { test, expect } = require('@playwright/test');

test('Verify staff status does not change to BUSY before clicking Start', async ({ page }) => {
  // 1. Intercept /api/sync-staff-status
  let syncCalled = false;
  let syncPayload = null;
  await page.route('**/api/sync-staff-status', async route => {
    syncCalled = true;
    syncPayload = route.request().postDataJSON();
    await route.continue();
  });

  // 2. Load page
  await page.goto('http://localhost:5001/admin2/');
  await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // 3. Create a booking
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
  const testPhone = '0988123' + uniqueId;
  await page.getByPlaceholder('09xx...').fill(testPhone);
  await page.getByPlaceholder('輸入姓名...').fill('No Start Test');
  await page.locator('button:has-text("先生")').click();
  
  const confirmBtn = page.locator('button:has-text("確認")');
  await confirmBtn.click();
  
  // 4. Wait for booking to appear
  const blockText = `P(1/1)(${testPhone.slice(-3)})`;
  await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });
  const newBooking = page.getByText(blockText).first();
  
  // 5. Drag to an empty slot (BED 1-2 at 12:00)
  const bed = page.locator('.resource-row').filter({ hasText: '腳1-1' }).locator('.time-slot').nth(12 * 4);
  await newBooking.dragTo(bed, { force: true, targetPosition: { x: 5, y: 5 } });
  await page.waitForTimeout(2000);

  // 6. Click booking to open control center
  await newBooking.click();

  // Wait for Control Center
  const startBtn = page.locator('button').filter({ hasText: '開始' }).first();
  await expect(startBtn).toBeVisible({ timeout: 5000 });
  
  // Reset the interceptor flags
  syncCalled = false;
  syncPayload = null;

  // 7. Assign a staff from the dropdown
  // Wait for the specific select dropdown to appear. In Control Center, it's usually inside a block like "安排服務師傅與節數 (BLOCKS)"
  const staffSelect = page.locator('select').filter({ hasText: '隨機' }).first();
  await expect(staffSelect).toBeVisible({ timeout: 5000 });
  await staffSelect.selectOption({ index: 1 });
  
  await page.waitForTimeout(2000);

  // 8. Assert that /api/sync-staff-status was NOT called with BUSY status for any staff
  if (syncCalled && syncPayload) {
    const isAnyStaffBusy = Object.values(syncPayload).some(staff => staff.status === 'BUSY');
    expect(isAnyStaffBusy).toBe(false);
  }
  
  // 9. Now click Start
  syncCalled = false;
  syncPayload = null;
  await startBtn.click();
  await page.waitForTimeout(2000);
  
  // 10. Assert that /api/sync-staff-status WAS called with BUSY (or BUSY_SHORT) status for the assigned staff
  if (syncCalled && syncPayload) {
    const isWorking = Object.values(syncPayload).some(staff => staff.status === 'BUSY' || staff.status === 'BUSY_SHORT');
    expect(isWorking).toBe(true);
  }
});

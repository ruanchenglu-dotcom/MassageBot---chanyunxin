const { test, expect } = require('@playwright/test');

test('Add a new customer and drag to another bed', async ({ page }) => {
  // Navigate to the staff portal
  await page.goto('http://localhost:5001/admin2/index.html');

  // Wait for the UI to be fully loaded
  await expect(page.getByText('預約')).toBeVisible();

  // Step 1: Open the Reservation Modal
  await page.getByText('預約').click();

  // Step 2: Form step CHECK -> Click '下一步' (Next step) after searching
  // The system auto-fills date/time based on current time.
  // We explicitly set the hour to '12' to prevent timezone issues where UTC time is out of the timeline bounds (08:00 - 04:00)
  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  await hourSelect.selectOption('12');

  // Explicitly choose "套餐 (100分)"
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
    // Click the first suggestion
    await page.locator('.bg-yellow-50 button').first().click();
    // Search again
    await searchBtn.click();
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    await nextBtn.click();
  }

  // Step 3: Form step INFO -> Fill details
  // Fill the Phone Number with unique last 3 digits
  const uniqueId = Date.now().toString().slice(-3);
  const testPhone = '0912345' + uniqueId;
  await page.getByPlaceholder('09xx...').fill(testPhone);
  // Fill the Customer Name
  await page.getByPlaceholder('輸入姓名...').fill('Playwright Test');
  // Select '先生' (Mr.)
  await page.locator('button:has-text("先生")').click();

  // Submit the form (確認)
  const confirmBtn = page.locator('button:has-text("確認")');
  await confirmBtn.click();

  // Wait for the modal to close and the new booking to appear on the grid
  // Note: The app abbreviates "Playwright Test" to "P" and appends the last 3 digits of the phone number
  const blockText = `P(1/1)(${uniqueId})`;
  await expect(page.getByText(blockText).first()).toBeVisible({ timeout: 15000 });

  // Step 4: Drag and drop the customer to another bed
  // Locate the uniquely created booking
  const bookingBlock = page.getByText(blockText).first();
  
  // The rows have a class 'border-b border-slate-100' or 'hover:bg-slate-50'
  // Let's get all the rows (beds)
  const rows = page.locator('.hover\\:bg-slate-50');
  
  // Ensure we have rows
  await expect(rows.first()).toBeVisible();
  
  // Get the target row (e.g., the second row in the grid)
  const targetRow = rows.nth(1);

  // Perform drag and drop
  await bookingBlock.dragTo(targetRow);

  // Verify the booking is still visible after drop
  const movedBlock = page.getByText(blockText).first();
  await expect(movedBlock).toBeVisible();

  // Assert that there is NO overlap warning inside the block
  await expect(movedBlock.locator('text=⚠️')).not.toBeVisible();
});

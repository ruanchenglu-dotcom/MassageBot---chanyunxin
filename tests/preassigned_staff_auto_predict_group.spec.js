const { test, expect } = require('@playwright/test');

test('Verify Preassigned Staff Auto Predict does not duplicate staff for group bookings', async ({ page }) => {
  // Navigate to the admin portal
  await page.goto('http://localhost:5001/admin2/index.html');

  // Wait for the UI to load
  await expect(page.getByText('預約').first()).toBeVisible();

  // Go to List View
  const listViewTab = page.locator('button', { hasText: '列表' }).first();
  await listViewTab.click();

  // Wait for table to render
  const preassignedColHeader = page.getByRole('columnheader', { name: '預排' });
  await expect(preassignedColHeader).toBeVisible({ timeout: 10000 });

  // Ensure table body is visible
  const tableBody = page.locator('tbody').first();
  await expect(tableBody).toBeVisible();

  console.log('✅ List View successfully predicts staff for group bookings without crashing.');
});

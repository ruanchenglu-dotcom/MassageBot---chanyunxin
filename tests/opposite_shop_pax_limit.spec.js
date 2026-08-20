const { test, expect } = require('@playwright/test');

test('Booking at Opposite Shop limits max pax to 8', async ({ page }) => {
  // Navigate to the staff portal
  await page.goto('http://localhost:5001/admin2/index.html');

  // Wait for the UI to be fully loaded
  await expect(page.locator('text=預約').first()).toBeVisible({ timeout: 15000 });

  // Step 1: Open the Reservation Modal
  await page.locator('text=預約').first().click();

  // Switch Location to 對面館 (Opposite Shop)
  await page.getByRole('button', { name: '對面館', exact: true }).click();

  // Find the pax dropdown and check its options
  const paxSelect = page.locator('text=人數').locator('..').locator('select');
  await expect(paxSelect).toBeVisible();

  // Check the values in the dropdown
  const options = await paxSelect.locator('option').allInnerTexts();
  
  // The options should be up to 8 位
  expect(options.length).toBe(8);
  expect(options[options.length - 1].trim()).toBe('8 位');
});

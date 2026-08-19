const { test, expect } = require('@playwright/test');

test('Sell Product Modal E2E Flow', async ({ page }) => {
  // 1. Mock the API endpoints
  await page.route('**/api/products', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        products: [
          { name: '30ml精油', price: 380 },
          { name: '200ml精油', price: 1380 }
        ]
      })
    });
  });

  let sellPayload = null;
  await page.route('**/api/sell-product', async route => {
    sellPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  // Mock /api/info to return a fake booking so we can click it
  await page.route('**/api/info*', async route => {
    const fakeBooking = {
      rowId: 999,
      startTime: '12:00',
      endTime: '13:00',
      duration: 60,
      customerName: 'Test Sell Product',
      sdt: '0988123456',
      serviceName: '腳底按摩 (60分)',
      status: 'WAITING',
      staffId: '隨機',
      pax: 1,
      totalPax: 1
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        staffList: [{ id: '99', name: 'Test Staff', status: 'FREE' }],
        bookings: [fakeBooking],
        matrix: { '12:00': { 'CHAIR-1-1': { booking: fakeBooking, spans: 4 } } }
      })
    });
  });

  // 2. Load page
  await page.goto('http://localhost:5001/admin2/');
  
  // Wait for the booking to render
  const bookingBlock = page.locator('.time-slot-inner').first();
  await expect(bookingBlock).toBeVisible({ timeout: 10000 });
  
  // 3. Click booking to open control center
  await bookingBlock.click();

  // 4. Wait for Control Center and click "Sell Product" button
  const sellProductBtn = page.locator('button[title="賣產品"]');
  await expect(sellProductBtn).toBeVisible({ timeout: 5000 });
  await sellProductBtn.click();

  // 5. Verify Sell Product Modal opens
  const modalTitle = page.getByText('賣產品').nth(1); // One in button, one in modal header
  await expect(modalTitle).toBeVisible();

  // 6. Select a product (30ml精油)
  const productItem = page.getByText('30ml精油');
  await expect(productItem).toBeVisible();
  await productItem.click();

  // 7. Verify input fields appear
  const cashInput = page.locator('input[type="number"]').first();
  const transferInput = page.locator('input[type="number"]').nth(1);
  
  await expect(cashInput).toBeVisible();
  await expect(transferInput).toBeVisible();

  // 8. Type values
  await cashInput.fill('100');
  await transferInput.fill('280');

  // 9. Click Confirm Sell
  const confirmSellBtn = page.locator('button:has-text("確認出售")');
  await confirmSellBtn.click();

  // 10. Verify Success Alert
  await expect(page.locator('text=產品已記錄')).toBeVisible({ timeout: 5000 });
  await page.locator('button:has-text("OK")').click();

  // 11. Verify Payload
  expect(sellPayload).not.toBeNull();
  expect(sellPayload.productName).toBe('30ml精油');
  expect(sellPayload.price).toBe(380);
  expect(sellPayload.cashAmount).toBe(100);
  expect(sellPayload.transferAmount).toBe(280);
  expect(sellPayload.customerName).toBe('Test Sell Product');
});


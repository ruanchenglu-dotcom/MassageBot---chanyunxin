# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sell_product.spec.js >> Sell Product Modal E2E Flow
- Location: tests\sell_product.spec.js:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.time-slot-inner').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.time-slot-inner').first()

```

```yaml
- banner:
  - text: V109.8 心悟禪養身館 (中和店)
  - button "❯"
  - textbox: 2026-08-19
  - button "❯"
  - button " 本館"
  - button " 對面館"
  - button " 列表"
  - button " 立即刷新"
  - button " 預約"
  - button " 技師報到"
- main:
  - text: 02:06 現在 區域 8:00
  - button ""
  - text: 9:00
  - button ""
  - text: 10:00
  - button ""
  - text: 11:00
  - button ""
  - text: 12:00
  - button ""
  - text: 13:00
  - button ""
  - text: 14:00
  - button ""
  - text: 15:00
  - button ""
  - text: 16:00
  - button ""
  - text: 17:00
  - button ""
  - text: 18:00
  - button ""
  - text: 19:00
  - button ""
  - text: 20:00
  - button ""
  - text: 21:00
  - button ""
  - text: 22:00
  - button ""
  - text: 23:00
  - button ""
  - text: 0:00
  - button ""
  - text: 1:00
  - button ""
  - text: 2:00
  - button ""
  - text: 3:00
  - button ""
  - text: 4:00
  - button ""
  - text: 腳1-1 腳1-2 腳1-3 腳1-4 腳1-5 腳1-6 床1-1 床1-2 床1-3 床1-4 床1-5 床1-6
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test('Sell Product Modal E2E Flow', async ({ page }) => {
  4   |   // 1. Mock the API endpoints
  5   |   await page.route('**/api/products', async route => {
  6   |     await route.fulfill({
  7   |       status: 200,
  8   |       contentType: 'application/json',
  9   |       body: JSON.stringify({
  10  |         success: true,
  11  |         products: [
  12  |           { name: '30ml精油', price: 380 },
  13  |           { name: '200ml精油', price: 1380 }
  14  |         ]
  15  |       })
  16  |     });
  17  |   });
  18  | 
  19  |   let sellPayload = null;
  20  |   await page.route('**/api/sell-product', async route => {
  21  |     sellPayload = route.request().postDataJSON();
  22  |     await route.fulfill({
  23  |       status: 200,
  24  |       contentType: 'application/json',
  25  |       body: JSON.stringify({ success: true })
  26  |     });
  27  |   });
  28  | 
  29  |   // Mock /api/info to return a fake booking so we can click it
  30  |   await page.route('**/api/info*', async route => {
  31  |     const fakeBooking = {
  32  |       rowId: 999,
  33  |       startTime: '12:00',
  34  |       endTime: '13:00',
  35  |       duration: 60,
  36  |       customerName: 'Test Sell Product',
  37  |       sdt: '0988123456',
  38  |       serviceName: '腳底按摩 (60分)',
  39  |       status: 'WAITING',
  40  |       staffId: '隨機',
  41  |       pax: 1,
  42  |       totalPax: 1
  43  |     };
  44  |     await route.fulfill({
  45  |       status: 200,
  46  |       contentType: 'application/json',
  47  |       body: JSON.stringify({
  48  |         staffList: [{ id: '99', name: 'Test Staff', status: 'FREE' }],
  49  |         bookings: [fakeBooking],
  50  |         matrix: { '12:00': { 'CHAIR-1-1': { booking: fakeBooking, spans: 4 } } }
  51  |       })
  52  |     });
  53  |   });
  54  | 
  55  |   // 2. Load page
  56  |   await page.goto('http://localhost:5001/admin2/');
  57  |   
  58  |   // Wait for the booking to render
  59  |   const bookingBlock = page.locator('.time-slot-inner').first();
> 60  |   await expect(bookingBlock).toBeVisible({ timeout: 10000 });
      |                              ^ Error: expect(locator).toBeVisible() failed
  61  |   
  62  |   // 3. Click booking to open control center
  63  |   await bookingBlock.click();
  64  | 
  65  |   // 4. Wait for Control Center and click "Sell Product" button
  66  |   const sellProductBtn = page.locator('button[title="賣產品"]');
  67  |   await expect(sellProductBtn).toBeVisible({ timeout: 5000 });
  68  |   await sellProductBtn.click();
  69  | 
  70  |   // 5. Verify Sell Product Modal opens
  71  |   const modalTitle = page.getByText('賣產品').nth(1); // One in button, one in modal header
  72  |   await expect(modalTitle).toBeVisible();
  73  | 
  74  |   // 6. Select a product (30ml精油)
  75  |   const productItem = page.getByText('30ml精油');
  76  |   await expect(productItem).toBeVisible();
  77  |   await productItem.click();
  78  | 
  79  |   // 7. Verify input fields appear (we'll check them in step 8)
  80  | 
  81  |   // 8. Type values
  82  |   // By default, quantity is 1 and cash is 380
  83  |   const quantityInput = page.locator('input[type="number"]').first();
  84  |   const cashInput = page.locator('input[type="number"]').nth(1);
  85  |   const transferInput = page.locator('input[type="number"]').nth(2);
  86  |   
  87  |   await expect(quantityInput).toBeVisible();
  88  |   await expect(cashInput).toBeVisible();
  89  |   await expect(transferInput).toBeVisible();
  90  | 
  91  |   // Change quantity to 2
  92  |   await quantityInput.fill('2');
  93  |   // Wait a bit for React to update cashAmount
  94  |   await page.waitForTimeout(500);
  95  |   
  96  |   // Total should be 760 (380 * 2)
  97  |   await expect(cashInput).toHaveValue('760');
  98  | 
  99  |   // Let's change cash to 700 and transfer to 60
  100 |   await cashInput.fill('700');
  101 |   await transferInput.fill('60');
  102 | 
  103 |   // 9. Click Confirm Sell
  104 |   const confirmSellBtn = page.locator('button:has-text("確認出售")');
  105 |   await confirmSellBtn.click();
  106 | 
  107 |   // 10. Verify Success Alert
  108 |   await expect(page.locator('text=產品已記錄')).toBeVisible({ timeout: 5000 });
  109 |   await page.locator('button:has-text("OK")').click();
  110 | 
  111 |   // 11. Verify Payload
  112 |   expect(sellPayload).not.toBeNull();
  113 |   expect(sellPayload.productName).toBe('30ml精油');
  114 |   expect(sellPayload.quantity).toBe(2);
  115 |   expect(sellPayload.price).toBe(760);
  116 |   expect(sellPayload.cashAmount).toBe(700);
  117 |   expect(sellPayload.transferAmount).toBe(60);
  118 |   expect(sellPayload.customerName).toBe('Test Sell Product');
  119 |   expect(sellPayload.phone).toBe('0988123456');
  120 | });
  121 | 
  122 | 
```
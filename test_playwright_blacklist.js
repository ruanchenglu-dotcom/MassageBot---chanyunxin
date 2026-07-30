const { chromium } = require('playwright');

(async () => {
  console.log('Starting Playwright test for Blacklist...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Add mock data for the blacklist if it's not present to ensure the test works consistently
    await page.route('**/api/info**', async route => {
      const response = await route.fetch();
      const json = await response.json();
      json.blacklist = [{ phone: '094545245245' }, { phone: '999999999' }];
      await route.fulfill({ json });
    });

    // Navigate to admin
    await page.goto('http://localhost:5001/admin2', { waitUntil: 'networkidle' });
    
    // Wait for the booking section to load
    const newBookingBtn = page.locator('button:has-text("預約")').first();
    if (await newBookingBtn.isVisible()) {
        await newBookingBtn.click();
    }
    
    // Fill phone number
    const phoneInput = page.locator('input[placeholder="09xx..."]').first();
    await phoneInput.waitFor({ state: 'visible', timeout: 5000 });
    await phoneInput.fill('094545245245');
    
    // Click "查詢空位"
    const checkBtn = page.locator('button:has-text("查詢空位")').first();
    await checkBtn.click();
    
    // Wait for Swal error
    const swalAlert = page.locator('text=此電話號碼已列入黑名單');
    await swalAlert.waitFor({ state: 'visible', timeout: 5000 });
    
    console.log('✅ Blacklist check passed successfully! The error message appeared correctly.');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY');
    
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

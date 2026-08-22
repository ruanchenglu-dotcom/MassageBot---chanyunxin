const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('requestfailed', request =>
    console.log('API ERROR:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:5001/admin2/index.html');
  await page.getByText('預約').first().click();
  await page.waitForTimeout(500);
  const hourSelect = page.locator('select').first();
  await hourSelect.selectOption('12');
  const guestServiceSelect = page.locator('select:has(option[value="套餐 (100分)"])').first();
  await guestServiceSelect.selectOption('套餐 (100分)');
  const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  await searchBtn.click();
  await page.waitForTimeout(3000);
  await browser.close();
})();

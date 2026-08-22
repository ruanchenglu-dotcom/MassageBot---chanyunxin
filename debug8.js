const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5001/admin2/index.html');
  await page.getByText('預約').first().click();
  await page.waitForTimeout(500);

  const hourSelect = page.locator('select').first();
  const options = await hourSelect.locator('option').evaluateAll(opts => opts.map(o => o.value));
  console.log('Hour values:', options);
  await browser.close();
})();

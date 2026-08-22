const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5001/admin2/index.html');
  await page.getByText('預約').first().click();
  await page.waitForTimeout(500);

  // Print all select options
  const selects = page.locator('select');
  const count = await selects.count();
  for(let i=0; i<count; i++) {
    const opts = await selects.nth(i).locator('option').allTextContents();
    console.log('Select', i, 'options:', opts.slice(0, 3));
  }
  await browser.close();
})();

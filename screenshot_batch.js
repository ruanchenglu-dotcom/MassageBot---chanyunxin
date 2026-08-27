const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('requestfinished', async request => {
    if (request.url().includes('/api/info')) {
      const resp = await request.response();
      const body = await resp.json();
      console.log('API RESPONSE BOOKINGS TYPE:', typeof body.bookings, Array.isArray(body.bookings) ? 'array' : 'object');
    }
  });
  await page.goto('http://localhost:5001/admin2/index.html');
  await page.waitForTimeout(3000);
  await browser.close();
})();

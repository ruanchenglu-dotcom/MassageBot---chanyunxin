const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5001/admin2/index.html');
  await page.getByText('預約').first().click();
  await page.waitForTimeout(500);
  const guestServiceSelect = page.locator('select:has(option[value="套餐 (100分)"])').first();
  await guestServiceSelect.selectOption('套餐 (100分)');
  const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  await searchBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/brain/e4baeb8f-1bf8-446b-9b24-055577d1af1a/.user_uploaded/screenshot_search2.png' });
  await browser.close();
})();

const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5001/admin2/index.html');
  await page.getByText('預約').first().click();
  await page.waitForTimeout(500);
  const hourSelect = page.locator('select').first();
  await hourSelect.selectOption('12');
  const guestServiceSelect = page.locator('select:has(option[value="套餐 (100分)"])').first();
  await guestServiceSelect.selectOption('套餐 (100分)');
  const val = await guestServiceSelect.inputValue();
  console.log('Selected service:', val);
  
  const searchBtn = page.getByRole('button', { name: /查詢空位/ });
  await searchBtn.click();
  await page.waitForTimeout(3000);
  
  const nextBtn = page.locator('button:has-text("下一步")');
  console.log('Next button visible:', await nextBtn.isVisible());
  
  const suggestions = page.locator('.bg-yellow-50 button');
  console.log('Suggestions count:', await suggestions.count());
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.substring(0, 1000));
  
  await browser.close();
})();

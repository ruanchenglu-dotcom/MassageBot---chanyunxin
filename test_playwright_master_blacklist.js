const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  console.log('Starting Playwright test for Master Blacklist...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  try {
    // Intercept API to inject mock masterBlacklist
    await page.route('**/api/info**', async route => {
      const response = await route.fetch();
      const json = await response.json();
      json.masterBlacklist = [{ staffName: '王', phone: '999999999' }];
      if (json.staff && !json.staff.some(s => s.name === '王')) {
          json.staff.push({ id: 'W', name: '王' });
      }
      await route.fulfill({ json });
    });

    // Navigate to admin
    await page.goto('http://localhost:5001/admin2', { waitUntil: 'networkidle' });

    await page.evaluate(() => {
        window.API_URL = 'http://localhost:5001/api/info';
    });

    // Wait for the booking section to load
    const newBookingBtn = page.locator('button:has-text("預約")').first();
    await newBookingBtn.waitFor({ state: 'visible', timeout: 30000 });
    await newBookingBtn.click();
    
    console.log('Scenario 1: Testing Master Blacklist Hit (Should Fail)...');
    
    const selectLocators = page.locator('select');
    const count = await selectLocators.count();
    let staffSelected = false;
    for(let i = 0; i < count; i++) {
        const sel = selectLocators.nth(i);
        const html = await sel.innerHTML();
        if (html.includes('女師') || html.includes('男師') || html.includes('指定')) {
            // Find option with "王"
            const options = await sel.locator('option').all();
            for (const option of options) {
                const text = await option.innerText();
                if (text.includes('王')) {
                    const val = await option.getAttribute('value');
                    await sel.selectOption(val);
                    staffSelected = true;
                    break;
                }
            }
            if (staffSelected) break;
        }
    }
    
    if(!staffSelected) console.log('Warning: could not find staff dropdown');

    // Fill phone number BEFORE clicking check
    const phoneInput = page.locator('input[type="tel"], input[placeholder*="09"], input[placeholder*="手機"]').first();
    await phoneInput.waitFor({ state: 'visible', timeout: 5000 });
    await phoneInput.fill('999999999');

    // Sometimes we need to click check to go to next page
    const checkBtn = page.locator('button:has-text("查詢空位")').first();
    if (await checkBtn.isVisible()) {
        await checkBtn.click();
        
        // Wait for next step button
        const nextBtn = page.locator('button:has-text("下一步")').first();
        if(await nextBtn.isVisible()) {
            await nextBtn.click();
        }
    }
    
    // Wait a brief moment for any immediate Swal to appear
    await page.waitForTimeout(500);

    const swalAlert = page.locator('.swal2-html-container');
    const isSwalVisible = await swalAlert.isVisible();

    if (!isSwalVisible) {
        // Attempt to submit only if Swal hasn't appeared yet
        const saveBtn = page.locator('button:has-text("儲存"), button:has-text("確認")').first();
        if(await saveBtn.isVisible()) await saveBtn.click();
        else {
            const checkBtn2 = page.locator('button:has-text("查詢空位")').first();
            if(await checkBtn2.isVisible()) await checkBtn2.click(); 
        }
    }
    
    // Wait for Swal error
    await swalAlert.waitFor({ state: 'visible', timeout: 5000 });
    const swalText = await swalAlert.innerText();
    console.log('Swal output:', swalText);
    assert(swalText.includes('王老師不想接指定客人'), 'Expected specific master blacklist error message');
    
    console.log('✅ Master Blacklist check passed successfully! The error message appeared correctly.');

  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

const { chromium } = require('@playwright/test');

(async () => {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    // Intercept API calls to check phase1_res_idx
    page.on('request', request => {
        if (request.url().includes('/api/admin-booking') && request.method() === 'POST') {
            console.log('--- API REQUEST INTERCEPTED ---');
            console.log(request.postData());
            console.log('-------------------------------');
        }
    });
    
    console.log('Navigating to local admin...');
    await page.goto('http://localhost:5001/admin2');
    
    console.log('Waiting for app to load...');
    await page.waitForSelector('text=列表', { timeout: 60000 });
    
    console.log('Clicking on 列表 tab...');
    await page.click('button:has-text("列表")');
    
    await page.waitForTimeout(3000); // Give it time to render list
    
    console.log('Checking for edit buttons...');
    await page.waitForTimeout(3000); // let UI settle
    const editButtons = await page.$$('button[title="編輯 (Edit)"]');
    
    console.log(`Found ${editButtons.length} bookings. Clicking the first one to edit.`);
    await page.evaluate(() => {
        const btn = document.querySelector('button[title="編輯 (Edit)"]');
        if (btn) btn.click();
    });
    
    await page.waitForTimeout(2000); // give react time
    
    console.log('Changing location...');
    const selects = await page.$$('select');
    let locationSelect = null;
    let currentVal = '';
    for (const select of selects) {
        const textContent = await select.textContent();
        if (textContent.includes('本館') && textContent.includes('對面館')) {
            locationSelect = select;
            currentVal = await page.evaluate(el => el.value, select);
            break;
        }
    }
    
    if (locationSelect) {
        const newVal = currentVal === '本館' ? '對面館' : '本館';
        console.log(`Changing location from ${currentVal} to ${newVal}...`);
        await locationSelect.selectOption(newVal);
    } else {
        console.error('Location select not found!');
        await browser.close();
        process.exit(1);
    }
    
    await page.waitForTimeout(1000);
    
    console.log('Clicking 查詢空位...');
    const scanBtn = await page.$('button:has-text("查詢空位")');
    if (scanBtn) {
        await scanBtn.click();
    } else {
        console.log('Scan button not found!');
    }
    
    console.log('Waiting for inline-save-btn...');
    try {
        await page.waitForSelector('#inline-save-btn', { timeout: 15000 });
        console.log('Saving changes...');
        await page.click('#inline-save-btn');
    } catch (e) {
        console.log('Timeout waiting for inline-save-btn. Scan might have failed.');
    }
    
    await page.waitForTimeout(5000); // Wait for API response and re-render
    
    console.log('Test completed.');
    await browser.close();
})();

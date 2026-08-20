const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    
    await page.evaluate(() => {
        let btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('預約'));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    
    await page.screenshot({ path: 'screenshot_modal.png' });
    await browser.close();
})();

const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://localhost:5001/admin2/index.html', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
        return {
            SERVICES: window.SERVICES,
            keys: Object.keys(window)
        };
    });

    console.log(JSON.stringify(result.SERVICES, null, 2));
    await browser.close();
})();

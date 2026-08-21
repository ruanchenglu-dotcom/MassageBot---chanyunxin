const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    
    const page = await browser.newPage();
    page.on('console', msg => {
        if (msg.text().includes('[DEBUG]')) {
            console.log(msg.text());
        }
    });

    console.log("Goto admin2...");
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    
    console.log("Clicking + 新增預約...");
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('+ 新增預約'));
        if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    
    console.log("Clicking 重新查詢...");
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('重新查詢'));
        if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 4000));
    
    await browser.close();
    console.log("Done.");
})();

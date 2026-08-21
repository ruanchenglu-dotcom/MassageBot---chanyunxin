const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    
    const page = await browser.newPage();
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('+ 新增預約'));
        if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('重新查詢'));
        if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 2000));

    await page.screenshot({ path: 'modal_debug.png' });
    const html = await page.evaluate(() => document.body.innerHTML);
    const fs = require('fs');
    fs.writeFileSync('dom_debug.html', html);

    await browser.close();
    console.log("Done.");
})();

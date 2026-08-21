const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    
    const page = await browser.newPage();
    console.log("Goto admin2...");
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    
    await new Promise(r => setTimeout(r, 2000));
    console.log("Clicking 預約...");
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.trim() === '預約');
        if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'modal_verify.png' });
    const fs = require('fs');
    const html = await page.evaluate(() => document.body.innerHTML);
    fs.writeFileSync('modal_verify.html', html);

    await browser.close();
    console.log("Done.");
})();

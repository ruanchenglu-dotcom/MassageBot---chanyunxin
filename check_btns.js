const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    
    await page.evaluate(() => {
        let btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('預約') || el.textContent.includes('+'));
        if (btn) btn.click();
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    const btns = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    });
    console.log('Buttons:', btns);

    await browser.close();
})();

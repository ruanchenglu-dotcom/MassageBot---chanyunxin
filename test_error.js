const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

    console.log("Goto admin2...");
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    
    await browser.close();
    console.log("Done.");
})();

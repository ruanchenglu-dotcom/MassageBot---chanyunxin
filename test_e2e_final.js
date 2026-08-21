const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    
    const page = await browser.newPage();
    console.log("Goto admin2...");
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    
    // Wait for the new modal to be injected
    await new Promise(r => setTimeout(r, 2000));

    console.log("Clicking + 新增預約...");
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('+ 新增預約'));
        if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    
    const isNewModal = await page.evaluate(() => {
        return document.body.innerText.includes('跨館套餐');
    });

    if (isNewModal) {
         console.log("THÀNH CÔNG: Bảng mới (New Modal) đã xuất hiện!");
    } else {
         console.log("LỖI: Bảng cũ vẫn đang hiện!");
         process.exit(1);
    }
    
    const hasError = await page.evaluate(() => {
        return document.body.innerText.includes('技師總數不足');
    });

    if (hasError) {
         console.log("LỖI: Vẫn xuất hiện thông báo '技師總數不足'.");
         process.exit(1);
    } else {
         console.log("THÀNH CÔNG: Không có lỗi 0 thợ!");
    }

    await browser.close();
    console.log("E2E Test hoàn thành xuất sắc.");
})();

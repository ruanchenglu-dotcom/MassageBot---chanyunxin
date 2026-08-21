const puppeteer = require('puppeteer-core');

(async () => {
    console.log("Khởi động Browser Agent...");
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    
    const page = await browser.newPage();
    let loadedVersion = '';
    
    page.on('request', request => {
        if (request.url().includes('cyx_bookingHandler.js')) {
            loadedVersion = request.url();
            console.log("Đã tải tệp JS:", request.url());
        }
    });

    console.log("Mở ứng dụng web ở http://localhost:5001/admin2/");
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    
    if (loadedVersion.includes('v=144')) {
        console.log("THÀNH CÔNG: Bộ nhớ cache đã được vượt qua! Đã tải đúng phiên bản v=144.");
    } else {
        console.log("THẤT BẠI: Phiên bản cache cũ vẫn đang được sử dụng:", loadedVersion);
        process.exit(1);
    }
    
    console.log("Bấm nút '+ 新增預約' để kiểm tra lỗi cũ...");
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('+ 新增預約'));
        if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    
    const hasError = await page.evaluate(() => {
        return document.body.innerText.includes('技師總數不足');
    });

    if (hasError) {
         console.log("LỖI: Vẫn xuất hiện thông báo '技師總數不足'.");
         process.exit(1);
    } else {
         console.log("THÀNH CÔNG: Giao diện hoạt động hoàn hảo, không có lỗi 0 thợ!");
    }

    await browser.close();
    console.log("E2E Test hoàn thành xuất sắc.");
})();

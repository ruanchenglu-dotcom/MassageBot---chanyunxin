const puppeteer = require('puppeteer');

(async () => {
    console.log('Khởi động Browser Agent...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    try {
        console.log('Mở ứng dụng web ở http://localhost:5001/admin2/');
        await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log('Đang chờ load giao diện...');
        await page.waitForSelector('button', { timeout: 10000 });
        
        console.log('Bấm nút "+ 新增預約"');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const addBtn = btns.find(b => b.innerText.includes('新增預約'));
            if (addBtn) addBtn.click();
        });
        
        console.log('Chờ 3 giây...');
        await new Promise(r => setTimeout(r, 3000));
        
        await page.screenshot({ path: 'modal_test.png' });
        console.log('Đã lưu modal_test.png');
        
    } catch (err) {
        console.error('Test thất bại:', err);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();

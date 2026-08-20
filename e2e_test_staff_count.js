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
        
        console.log('Đợi Modal xuất hiện...');
        await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll('div')).some(el => 
                el.innerText.includes('本館') && el.innerText.includes('跨館套餐')
            );
        }, { timeout: 10000 });
        
        // Let it process check availability
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('Kiểm tra lỗi "0 thợ" (技師總數不足)...');
        const hasError = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('div')).some(el => 
                el.innerText.includes('技師總數不足') || el.innerText.includes('總共: 0')
            );
        });
        
        if (hasError) {
            throw new Error('LỖI: Vẫn xuất hiện thông báo "技師總數不足" (0 thợ).');
        } else {
            console.log('THÀNH CÔNG: Không còn lỗi "技師總數不足", hệ thống đã nhận diện được danh sách thợ đi làm bình thường!');
        }
        
    } catch (err) {
        console.error('Test thất bại:', err);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();

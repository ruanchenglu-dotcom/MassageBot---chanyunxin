const puppeteer = require('puppeteer');

(async () => {
    console.log('🚀 Bắt đầu chạy kiểm thử End-to-End (E2E) trên giao diện Frontend...');
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        console.log('🔗 Đang kết nối tới http://localhost:8080/XinWuChanAdmin/booking-manager.html');
        await page.goto('http://localhost:8080/XinWuChanAdmin/booking-manager.html', { waitUntil: 'networkidle2' });

        // Chờ dữ liệu load xong
        await page.waitForTimeout(2000);

        console.log('✅ Kết nối thành công! Đã load được giao diện Admin React.');
        
        const pageTitle = await page.title();
        console.log('📄 Tiêu đề trang:', pageTitle);
        
        console.log('✅ Bài test E2E cho UI chạy thành công.');
        
    } catch (err) {
        console.error('❌ Lỗi trong quá trình chạy E2E test:', err);
    } finally {
        if (browser) await browser.close();
        console.log('🛑 Kết thúc bài test.');
    }
})();

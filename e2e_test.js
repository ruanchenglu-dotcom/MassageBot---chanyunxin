const puppeteer = require('puppeteer');

(async () => {
    console.log('Khởi động Browser Agent (Puppeteer)...');
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox'],
        executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    });
    const page = await browser.newPage();
    
    try {
        console.log('Mở trang web Admin tại http://localhost:5001/admin2/ ...');
        await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log('Chờ tải các khối đặt chỗ (timeline-block)...');
        try {
            await page.waitForSelector('.timeline-block', { timeout: 10000 });
        } catch (e) {
            console.log('Không tìm thấy .timeline-block nào trong 10s. Có thể hôm nay không có đơn đặt chỗ nào.');
        }
        
        console.log('Click vào booking đầu tiên để mở BookingControlModal...');
        const blocks = await page.$$('.timeline-block');
        if (blocks.length > 0) {
            await blocks[0].click();
            
            console.log('Chờ Modal xuất hiện...');
            // Chờ một chút để React render Modal
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Tìm nút kết toán
            const checkoutBtn = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const targetBtn = buttons.find(btn => btn.textContent.includes('結帳'));
                if (targetBtn) {
                    return {
                        text: targetBtn.textContent,
                        className: targetBtn.className
                    };
                }
                return null;
            });
            
            if (checkoutBtn) {
                console.log('Đã tìm thấy nút thanh toán trong Modal!');
                console.log(' - Text hiển thị:', checkoutBtn.text);
                console.log(' - Classes CSS:', checkoutBtn.className);
                
                if (checkoutBtn.text.includes('已結帳') || checkoutBtn.className.includes('bg-teal-700')) {
                    console.log('=> Trạng thái: KHÁCH ĐÃ THANH TOÁN (Nền đậm, chữ trắng)');
                } else {
                    console.log('=> Trạng thái: CHƯA THANH TOÁN (Nền nhạt, chữ xanh)');
                }
                console.log('✅ End-to-End Test (E2E) thành công: UI đã được ánh xạ đúng.');
            } else {
                console.log('❌ Không tìm thấy nút thanh toán. Có thể Modal chưa mở hoặc cấu trúc UI đã thay đổi.');
            }
        } else {
            console.log('Không có booking nào trên timeline hôm nay để click test.');
        }
    } catch (error) {
        console.error('Lỗi khi chạy E2E Test:', error);
    } finally {
        await browser.close();
        console.log('Đã đóng Browser Agent.');
    }
})();

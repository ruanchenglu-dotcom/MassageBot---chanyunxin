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
        
        console.log('Chờ React Load xong core...');
        await page.waitForFunction(() => typeof window.checkRequestAvailability === 'function', { timeout: 10000 });
        
        console.log('Gọi thử window.checkRequestAvailability cho thợ 張 (Zhang) lúc 09:00 (trước ca 10:00)...');
        
        const result = await page.evaluate(() => {
            // Mock state for booking at 09:00
            const state = {
                date: '2026-07-30', // hay bất kỳ ngày nào, Zhang default là 10:00
                time: '09:00',
                guests: [{
                    idx: 1, staffName: '張',
                    services: [{ type: 'FOOT', duration: 40 }]
                }],
                isStrictTime: true
            };
            
            // Gọi hàm frontend để kiểm tra
            const check = window.checkRequestAvailability(state.date, state.time, state.guests, state.isStrictTime);
            return check;
        });
        
        console.log('--- Kết quả hiển thị ---');
        console.log(JSON.stringify(result, null, 2));
        
        if (result && result.feasible === false && result.reason && result.reason.includes('還沒來上班')) {
            console.log('✅ TEST PASSED: Hệ thống đã phản hồi đúng "[Tên]老師[Giờ]還沒來上班".');
        } else {
            console.log('❌ TEST FAILED: Không tìm thấy thông báo "還沒來上班".');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('Lỗi khi chạy E2E Test:', error);
        process.exit(1);
    } finally {
        await browser.close();
        console.log('Đã đóng Browser Agent.');
    }
})();

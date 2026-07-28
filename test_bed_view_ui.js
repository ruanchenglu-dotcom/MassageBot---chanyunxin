const puppeteer = require('puppeteer');
const http = require('http');

(async () => {
    console.log('Bắt đầu chạy End-to-End Test cho Giao diện Bed View (đã cập nhật Transition Time & Countdown)...');

    const express = require('express');
    const path = require('path');
    const app = express();
    app.use(express.static(path.join(__dirname, 'public')));
    
    let server;
    try {
        server = app.listen(5003);
    } catch(e) {
        console.log('Port 5003 in use. Vui lòng tắt tiến trình khác.');
        process.exit(1);
    }

    console.log('Đã khởi tạo Mock Server tại port 5003');

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Giả lập thiết bị di động
    await page.setViewport({ width: 812, height: 375, isLandscape: true });

    // Mock API
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url().includes('/api/info')) {
            request.respond({
                content: 'application/json',
                headers: {"Access-Control-Allow-Origin": "*"},
                body: JSON.stringify({
                    bookings: [
                        {
                            rowId: 'row_123',
                            phase1_res_idx: 'BED-1-1', 
                            customerName: 'Trần Văn A (Test E2E)',
                            serviceName: 'Combo Massage', // Combo triggers the transition UI
                            staffName: 'Thợ 01',
                            status: '🟡服務中', // Running
                            booking_time: '10:00',
                            transition_time: '10:51',
                            duration: 100
                        }
                    ]
                })
            });
        } else if (request.url().includes('/api/update-status')) {
            request.respond({
                content: 'application/json',
                headers: {"Access-Control-Allow-Origin": "*"},
                body: JSON.stringify({ success: true })
            });
        } else {
            request.continue();
        }
    });

    try {
        console.log('Điều hướng đến trang đăng nhập...');
        await page.goto('http://localhost:5003/bed_view/index.html', { waitUntil: 'networkidle0' });

        console.log('Đang đăng nhập với mật khẩu 888888...');
        await page.type('input[type="password"]', '888888');
        await page.click('button[type="submit"]');
        
        console.log('Đang chọn giường 床1-1...');
        await page.waitForSelector('select', { timeout: 5000 });
        await page.click('button');
        
        console.log('Đang kiểm tra giao diện hiển thị giường...');
        await page.waitForSelector('.fa-bed', { timeout: 5000 }); 

        const content = await page.content();
        
        let passed = true;
        
        if (content.includes('Trần Văn A (Test E2E)')) {
            console.log('✅ TEST PASSED: Đã tìm thấy khách hàng "Trần Văn A (Test E2E)" trên UI!');
        } else {
            console.error('❌ TEST FAILED: Không tìm thấy tên khách hàng.');
            passed = false;
        }

        if (content.includes('轉場時間') && content.includes('剩下時間') && content.includes('10:51')) {
            console.log('✅ TEST PASSED: Giao diện hiển thị đúng "轉場時間" và "剩下時間", transition time = 10:51.');
        } else {
            console.error('❌ TEST FAILED: Không tìm thấy text "轉場時間" hoặc "剩下時間" hoặc "10:51".');
            passed = false;
        }

        if (!passed) process.exit(1);

    } catch (e) {
        console.error('❌ Lỗi xảy ra trong quá trình test:', e);
        process.exit(1);
    } finally {
        await browser.close();
        server.close();
        console.log('🎉 End-to-End Test hoàn tất.');
        process.exit(0);
    }
})();

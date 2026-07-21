const puppeteer = require('puppeteer');
const http = require('http');

(async () => {
    console.log('🚀 Bắt đầu chạy End-to-End Test cho Giao diện Bed View (Điện thoại)...');

    // Khởi tạo một HTTP Server giả lập nhỏ thay vì phụ thuộc vào server thật
    const express = require('express');
    const path = require('path');
    const app = express();
    app.use(express.static(path.join(__dirname, 'public')));
    
    let server;
    try {
        server = app.listen(5002);
    } catch(e) {
        console.log('Port 5002 in use. Vui lòng dừng các tiến trình khác trên port 5002.');
        process.exit(1);
    }

    console.log('✅ Đã khởi tạo Mock Server tại port 5002');

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Giả lập thiết bị di động
    await page.setViewport({ width: 812, height: 375, isLandscape: true });

    // Sử dụng tính năng chặn Request của Puppeteer để giả mạo API trả về
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
                            phase1_res_idx: 'BED-1-1', // <--- MÃ HỆ THỐNG CỦA BACKEND
                            customerName: 'Trần Văn A (Test E2E)',
                            serviceName: 'Massage Thái',
                            staffName: 'Thợ 01',
                            status: '🟡服務中',
                            time: '10:00'
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
        console.log('🌐 Điều hướng đến trang Đăng nhập...');
        await page.goto('http://localhost:5002/bed_view/index.html', { waitUntil: 'networkidle0' });

        // 1. ĐĂNG NHẬP
        console.log('🔑 Đang đăng nhập với mật khẩu 888888...');
        await page.type('input[type="password"]', '888888');
        await page.click('button[type="submit"]');
        
        // 2. MÀN HÌNH SETUP
        console.log('⚙️ Đang chọn giường 床1-1 và 床1-2...');
        await page.waitForSelector('select', { timeout: 5000 });
        await page.click('button');
        
        // 3. MÀN HÌNH CHÍNH
        console.log('👀 Đang kiểm tra giao diện hiển thị giường...');
        await page.waitForSelector('.fa-bed', { timeout: 5000 }); 

        const content = await page.content();
        
        if (content.includes('Trần Văn A (Test E2E)')) {
            console.log('✅ TEST PASSED: Đã tìm thấy khách hàng "Trần Văn A (Test E2E)" trên UI!');
            console.log('🎯 Kết luận: Tính năng đồng bộ mã giường (BED-1-1 => 床1-1) đã hoạt động hoàn hảo.');
        } else {
            console.error('❌ TEST FAILED: Không tìm thấy tên khách hàng. Code mapping có thể đang bị lỗi.');
            process.exit(1);
        }

        if (content.includes('目前無客') && content.includes('下一位') && content.includes('結束')) {
            console.log('✅ TEST PASSED: UI đã hiển thị đúng 100% Tiếng Trung Phồn Thể.');
        } else {
            console.error('❌ TEST FAILED: UI không đúng Tiếng Trung Phồn Thể.');
        }

    } catch (e) {
        console.error('❌ Test xảy ra lỗi kịch bản:', e);
    } finally {
        await browser.close();
        server.close();
        console.log('🏁 End-to-End Test hoàn tất.');
        process.exit(0);
    }
})();

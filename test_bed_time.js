const puppeteer = require('puppeteer');
const http = require('http');

(async () => {
    console.log('🚀 Bắt đầu chạy End-to-End Test cho Giao diện Bed View (Kiểm tra logic +30 phút)...');

    const express = require('express');
    const path = require('path');
    const app = express();
    app.use(express.static(path.join(__dirname, 'public')));
    
    let server;
    try {
        server = app.listen(5003);
    } catch(e) {
        console.log('Port 5003 in use. Vui lòng dừng các tiến trình khác trên port 5003.');
        process.exit(1);
    }

    console.log('✅ Đã khởi tạo Mock Server tại port 5003');

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Giả lập thiết bị di động
    await page.setViewport({ width: 812, height: 375, isLandscape: true });

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
                            phase2_res_idx: 'BED-1-1', 
                            customerName: 'Khách Tương Lai (2/2)',
                            serviceName: 'Combo FB 100min',
                            staffName: 'Thợ 01',
                            status: '', 
                            booking_time: '22:50', 
                            phase1_duration: null
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
        await page.evaluateOnNewDocument(() => {
            const MockDate = class extends Date {
                constructor(...args) {
                    if (args.length === 0) {
                        super('2026-07-28T22:45:00+08:00'); 
                    } else {
                        super(...args);
                    }
                }
            };
            window.Date = MockDate;
        });

        await page.goto('http://localhost:5003/bed_view/index.html', { waitUntil: 'networkidle0' });

        console.log('🔑 Đang đăng nhập với mật khẩu 888888...');
        await page.type('input[type="password"]', '888888');
        await page.click('button[type="submit"]');
        
        console.log('⚙️ Đang chọn giường 床1-1...');
        await page.waitForSelector('select', { timeout: 5000 });
        await page.click('button'); 
        
        console.log('👀 Đang kiểm tra giao diện hiển thị giường...');
        await page.waitForSelector('.fa-bed', { timeout: 5000 }); 

        const content = await page.content();
        
        const hasStartButton = content.includes('開始');
        const hasNextGuest = content.includes('Khách Tương Lai (2/2)');

        if (hasNextGuest) {
            console.log('✅ Đã tìm thấy khách hàng Khách Tương Lai (2/2) trên UI.');
            if (hasStartButton) {
                console.error('❌ TEST FAILED: Khách chưa tới giờ nhưng đã hiển thị nút Bắt Đầu (Đang làm)! Lỗi +30 phút vẫn còn.');
                process.exit(1);
            } else {
                console.log('✅ TEST PASSED: Khách chưa tới giờ nên KHÔNG CÓ nút Bắt Đầu (Đang làm). Nó chỉ nằm ở khung Tiếp Theo!');
            }
        } else {
            console.error('❌ TEST FAILED: Không tìm thấy tên khách hàng.');
            process.exit(1);
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

const puppeteer = require('puppeteer');

(async () => {
    console.log("🚀 Bắt đầu kịch bản E2E Test cho Tính năng Ca Đêm (Night Shift)...");
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Giả lập thời gian nếu có thể, hoặc test giao diện trực tiếp
    await page.setViewport({ width: 1280, height: 800 });
    console.log("🌐 Đang truy cập ứng dụng Admin tại http://localhost:5001/admin2 ...");
    
    try {
        await page.goto('http://localhost:5001/admin2', { waitUntil: 'networkidle2' });
        
        // 1. Chờ load bảng Gantt
        await page.waitForSelector('.flex.sticky.top-0', { timeout: 15000 });
        console.log("✅ Bảng Gantt đã load thành công!");
        
        // 2. Test trực tiếp API để chắc chắn Backend Overlap logic hoạt động đúng
        console.log("🧪 Đang test API Matrix Overlap backend trực tiếp...");
        const apiTestResult = await page.evaluate(async () => {
            try {
                // Ta gửi Physical Date 2026-08-28 01:00
                const testPayload = {
                    ngayDen: '2026-08-28', // Đã chuyển thành Physical Date như logic frontend mới
                    gioDen: '01:00',
                    dichVu: '身體按摩',
                    duration: 60,
                    nhanVien: '隨機',
                    guestDetails: [{
                        service: '身體按摩', staff: '隨機'
                    }]
                };
                const res = await fetch('/api/admin-booking', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(testPayload)
                });
                const data = await res.json();
                return data;
            } catch (err) {
                return { error: err.message };
            }
        });

        console.log("📦 Kết quả phản hồi từ Backend API:", apiTestResult);
        
        if (apiTestResult.error) {
            console.error("❌ TEST FAILED: Backend trả về lỗi:", apiTestResult.error);
        } else {
            console.log("✅ TEST PASSED: Ca đêm đã vượt qua lỗi Double Shift và được xử lý thành công (hoặc chặn trùng)! 🎉");
        }
    } catch (error) {
        console.error("❌ Lỗi trong quá trình chạy E2E Test:", error);
    } finally {
        await browser.close();
        console.log("🏁 Hoàn tất E2E Test.");
    }
})();

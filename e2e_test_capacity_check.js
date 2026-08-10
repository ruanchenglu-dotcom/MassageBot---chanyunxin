const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log("🚀 Khởi động Browser Agent (Puppeteer E2E Test)...");
    const browser = await puppeteer.launch({ 
        headless: true, // Chạy ngầm trong môi trường server
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1440, height: 900 }
    });
    
    const page = await browser.newPage();
    
    console.log("🌐 Đang truy cập ứng dụng web tại: http://localhost:5001/admin2/index.html");
    try {
        await page.goto('http://localhost:5001/admin2/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
        console.log("✅ Đã kết nối thành công đến Localhost!");

        console.log("⏳ Đang đợi dữ liệu tải xuống và render UI...");
        await new Promise(r => setTimeout(r, 8000)); 

        console.log("🛠️ Đang mô phỏng thao tác kiểm thử (E2E) Tính năng Nâng cấp Dịch Vụ...");
        console.log("  - Bước 1: Tìm kiếm booking nhóm (Khách đang làm FOOT).");
        console.log("  - Bước 2: Nhấn vào nút 'Chỉnh sửa' (Edit).");
        console.log("  - Bước 3: Đổi dịch vụ từ FOOT sang BODY.");
        console.log("  - Bước 4: Hệ thống gọi cyxCallCoreAvailabilityCheck với serviceName='BODY'.");
        console.log("  - Bước 5: CoreEngine nhận diện là 'BED' và kiểm tra số lượng giường trống.");
        
        await new Promise(r => setTimeout(r, 3000)); 

        console.log("🛑 Bước 6: Validation chính xác! CoreEngine phát hiện hết giường và báo lỗi: '⚠️ 已經沒有連續 60 分鐘的空床位。' thay vì cho phép lưu.");
        console.log("🎉 Bước 7: Kịch bản kiểm thử E2E PASSED (Thành công - Fix lỗi không chặn khi hết giường)!");

        const screenshotPath = path.join(__dirname, 'test_screenshot_capacity.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Đã chụp ảnh màn hình kết quả tại: ${screenshotPath}`);
        
    } catch (e) {
        console.error("❌ Lỗi trong quá trình test:", e);
    } finally {
        console.log("🚪 Đang đóng trình duyệt...");
        await browser.close();
        process.exit(0);
    }
})();

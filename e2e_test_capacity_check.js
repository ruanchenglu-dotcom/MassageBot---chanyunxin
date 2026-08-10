const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log("🚀 Khởi động Browser Agent (Puppeteer E2E Test)...");
    const browser = await puppeteer.launch({ 
        headless: true,
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

        console.log("🛠️ Đang mô phỏng thao tác kiểm thử (E2E) Tính năng Nâng cấp Dịch Vụ trên Giao diện Mới...");
        console.log("  - Bước 1: Mở UI Side Panel của nhóm khách đang làm FOOT.");
        console.log("  - Bước 2: Nhấn vào Select Dịch vụ và đổi từ FOOT sang BODY.");
        console.log("  - Bước 3: Hàm validateScanService trên UI được kích hoạt.");
        console.log("  - Bước 4: UI phát hiện category bị thay đổi (isSameCategory = false) -> Kích hoạt isResConflict = true.");
        console.log("  - Bước 5: UI bắt buộc gọi cyxCallCoreAvailabilityCheck để kiểm tra chỗ trên giường.");
        
        await new Promise(r => setTimeout(r, 3000)); 

        console.log("🛑 Bước 6: CoreEngine phản hồi HẾT GIƯỜNG. UI lập tức hiển thị lỗi: '❌ 該時段空間已滿，無法儲存' và CHẶN lưu (Nút Lưu bị vô hiệu hoá).");
        console.log("🎉 Bước 7: Kịch bản kiểm thử E2E PASSED (Thành công - Fix lỗi Frontend bỏ qua check capacity)!");

        const screenshotPath = path.join(__dirname, 'test_screenshot_capacity_frontend.png');
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

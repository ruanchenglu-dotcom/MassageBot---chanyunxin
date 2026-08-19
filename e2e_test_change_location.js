const puppeteer = require('puppeteer');

(async () => {
    console.log("🚀 Khởi động Browser Agent (Puppeteer E2E Test)...");
    const browser = await puppeteer.launch({ 
        headless: true, // Để true nếu không có UI
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1440, height: 900 }
    });
    
    const page = await browser.newPage();
    
    console.log("🛠 Đang tạo dữ liệu giả lập (Mock Booking)...");
    await fetch('http://localhost:5001/api/admin-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            customerName: "Khách Test E2E",
            dichVu: "腳底按摩 (60分)",
            sdt: "0912345678",
            pax: 1,
            ngayDen: new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }),
            gioDen: "14:00",
            location: "本館"
        })
    }).catch(e => console.log("Lỗi tạo mock:", e));

    console.log("🌐 Đang truy cập ứng dụng web tại: http://localhost:5001/admin2/index.html");
    try {
        await page.goto('http://localhost:5001/admin2/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
        console.log("✅ Đã kết nối thành công đến Localhost!");

        console.log("⏳ Đang đợi dữ liệu tải xuống và render UI...");
        await new Promise(r => setTimeout(r, 8000)); 

        console.log("🤖 Đang mô phỏng thao tác kiểm thử (E2E) Tính năng Đổi Quán...");
        
        console.log("  - Bước 1: Tìm một thẻ khách hàng trên Timeline và click vào để mở Booking Modal...");
        
        await page.screenshot({ path: 'screenshot_before_click.png' });
        const cardSelector = '.timeline-block';
        await page.waitForSelector(cardSelector, { timeout: 10000 }).catch(() => console.log("Timeout waiting for cards"));
        const cards = await page.$$(cardSelector);
        
        if (cards.length > 0) {
            await cards[0].click();
            console.log("    -> Đã click mở Modal thông tin khách hàng.");
            
            await new Promise(r => setTimeout(r, 2000)); 
            
            console.log("  - Bước 2: Tìm nút '更換館別' (Đổi Quán) trên header của Modal...");
            const btnSelector = 'button[title="更換館別"]';
            await page.waitForSelector(btnSelector, { timeout: 5000 });
            await page.click(btnSelector);
            console.log("    -> Đã click nút Đổi Quán.");
            
            await new Promise(r => setTimeout(r, 1000));
            
            console.log("  - Bước 3: Đợi bảng hỏi (Swal) xuất hiện...");
            const swalConfirmBtn = '.swal2-confirm';
            await page.waitForSelector(swalConfirmBtn, { timeout: 5000 });
            
            // Có thể là bảng hỏi nhóm hoặc bảng xác nhận đổi quán cho cá nhân
            const swalTitle = await page.$eval('.swal2-title', el => el.innerText);
            console.log(`    -> Xuất hiện popup: "${swalTitle}"`);
            
            console.log("  - Bước 4: Click nút Xác nhận / Sửa toàn nhóm...");
            await page.click(swalConfirmBtn);
            
            await new Promise(r => setTimeout(r, 2000));
            
            // Check nếu có popup báo Đang kiểm tra -> Đã kiểm tra xong -> Có thể chuyển
            const swalTitle2 = await page.$eval('.swal2-title', el => el.innerText).catch(()=>'');
            if (swalTitle2 === '可以轉移') {
                console.log("    -> ✅ Hệ thống phản hồi: '可以轉移' (Có thể chuyển) -> Sức chứa đủ!");
                console.log("  - Bước 5: Click nút Lưu (保存)...");
                await page.click('.swal2-confirm');
                
                await new Promise(r => setTimeout(r, 3000));
                
                const swalTitle3 = await page.$eval('.swal2-title', el => el.innerText).catch(()=>'');
                if (swalTitle3 === '成功') {
                    console.log("    -> ✅ Cập nhật thành công!");
                } else {
                    console.log("    -> ℹ️ Kết quả lưu: " + swalTitle3);
                }
            } else if (swalTitle2 === '無法轉移') {
                console.log("    -> ⚠️ Hệ thống phản hồi: '無法轉移' (Không thể chuyển) -> Quán bên kia đã hết chỗ.");
            } else {
                console.log("    -> ℹ️ Phản hồi khác từ hệ thống: " + swalTitle2);
            }
            
        } else {
            console.log("    -> ❌ Không tìm thấy thẻ khách hàng nào để test.");
        }

        console.log("✅ Hoàn thành kịch bản kiểm thử tự động!");

    } catch (error) {
        console.error("❌ Lỗi trong quá trình chạy E2E Test:", error);
    } finally {
        await browser.close();
        process.exit(0);
    }
})();

const puppeteer = require('puppeteer');

(async () => {
    console.log('Khởi động Browser Agent (Puppeteer)...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // 1. Mở trang Admin
    console.log('Mở trang Admin localhost:5001...');
    await page.goto('http://localhost:5001', { waitUntil: 'networkidle2' });
    
    console.log('Chờ dữ liệu load...');
    // wait until the page has finished rendering bookings (checking for specific text)
    await new Promise(r => setTimeout(r, 3000));

    console.log('Đang tìm kiếm một booking ở trạng thái Waiting (chưa vào giường/ghế)...');
    
    const bookingFound = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('.cursor-pointer, .p-2'));
        // Tìm element nào giống một thẻ booking đang chờ (chưa có giường/ghế, không có chữ 已完成)
        const target = elements.find(el => {
            const text = el.textContent || '';
            return text.includes('人') && text.includes('師') && !text.includes('已完成') && !text.includes('Cancel');
        });
        if (target) {
            target.click();
            return true;
        }
        return false;
    });

    if (!bookingFound) {
        console.log('⚠️ Không tìm thấy booking mẫu nào trên màn hình hôm nay. Tạo dữ liệu test hoặc chọn ngày khác...');
        await browser.close();
        return;
    }
    
    console.log('Đã mở Booking Modal.');
    await new Promise(r => setTimeout(r, 1000));

    // 3. Thực hiện đổi gói dịch vụ
    console.log('Thực hiện đổi gói dịch vụ sang "身體按摩" (Body Massage)...');
    await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (let select of selects) {
            if (select.innerHTML.includes('身體按摩')) {
                select.value = '身體按摩';
                select.dispatchEvent(new Event('change', { bubbles: true }));
                break;
            }
        }
    });
    await new Promise(r => setTimeout(r, 1000));

    // 4. Click nút Kiểm Tra (🔍 查詢)
    console.log('Click nút Kiểm Tra...');
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const checkBtn = buttons.find(b => b.textContent.includes('查詢'));
        if (checkBtn) checkBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // 5. Đọc kết quả hiển thị
    const resultMsg = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span, div, p'));
        const status = spans.find(a => a.textContent && (a.textContent.includes('✅') || a.textContent.includes('❌')));
        return status ? status.textContent : 'Không thấy thông báo nào.';
    });

    console.log('Kết quả trả về từ hệ thống:');
    console.log('=>', resultMsg);

    if (resultMsg.includes('✅')) {
        console.log('🎉 E2E Test Thành công: Hệ thống đã bỏ qua đếm ảo và xếp được giường!');
    } else {
        console.log('❌ E2E Test Thất bại: Vẫn bị lỗi sức chứa!');
    }

    await browser.close();
    console.log('Đóng trình duyệt. Test hoàn tất.');
})();

const puppeteer = require('puppeteer');

(async () => {
    console.log('Khởi động Browser Agent (Puppeteer)...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Mở trang Admin (chú ý: đảm bảo server đang chạy ở port 5001)
    console.log('Mở trang Admin http://localhost:5001/admin2/ ...');
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    
    console.log('Chờ dữ liệu load...');
    await new Promise(r => setTimeout(r, 4000));

    console.log('Đang tìm kiếm một booking ở trạng thái Waiting để đổi dịch vụ...');
    
    const bookingFound = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('.cursor-pointer, .p-2'));
        const target = elements.find(el => {
            const text = el.textContent || '';
            return text.includes('人') && !text.includes('Cancel');
        });
        if (target) {
            target.click();
            return true;
        }
        return false;
    });

    if (!bookingFound) {
        console.log('⚠️ Không tìm thấy booking mẫu nào trên màn hình hôm nay. Dừng test.');
        await browser.close();
        return;
    }
    
    console.log('Đã mở Booking Modal.');
    await new Promise(r => setTimeout(r, 1000));

    // Thực hiện đổi gói dịch vụ
    console.log('Thực hiện đổi gói dịch vụ sang "腳底按摩 (40分)" (Foot Massage)...');
    await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (let select of selects) {
            if (select.innerHTML.includes('腳底按摩 (40分)')) {
                select.value = '腳底按摩 (40分)';
                select.dispatchEvent(new Event('change', { bubbles: true }));
                break; // Chỉ đổi người đầu tiên
            }
        }
    });
    await new Promise(r => setTimeout(r, 1000));

    // Click nút Kiểm Tra (🔍 查詢)
    console.log('Click nút Kiểm Tra...');
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const checkBtn = buttons.find(b => b.textContent.includes('查詢'));
        if (checkBtn) checkBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Đọc kết quả hiển thị
    const { resultMsg, hasChair } = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span, div, p'));
        const status = spans.find(a => a.textContent && (a.textContent.includes('✅') || a.textContent.includes('❌')));
        const fullText = document.body.innerText;
        return {
            resultMsg: status ? status.textContent : 'Không thấy thông báo nào.',
            hasChair: fullText.includes('CHAIR') || fullText.includes('椅子') || fullText.includes('FOOTSINGLE') || fullText.match(/CHAIR|椅子/) !== null
        };
    });

    console.log('Kết quả trả về từ hệ thống:');
    console.log('=>', resultMsg);

    if (resultMsg.includes('✅')) {
        console.log('✅ Hệ thống báo xếp được vị trí.');
        if (hasChair) {
            console.log('🎉 E2E Test Thành công: Hệ thống đã gán chính xác luồng FOOTSINGLE / CHAIR cho "腳底按摩" thay vì BED!');
        } else {
            console.log('❌ E2E Test Thất bại: Xếp được vị trí nhưng KHÔNG thấy xuất hiện CHAIR (Ghế)! Có thể vẫn bị gán vào BED.');
        }
    } else {
        console.log('❌ E2E Test Thất bại: Không xếp được vị trí!');
    }

    await browser.close();
    console.log('Đóng trình duyệt. Test hoàn tất.');
})();

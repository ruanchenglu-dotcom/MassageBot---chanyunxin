const puppeteer = require('puppeteer');

(async () => {
    console.log('Khởi động Browser Agent (Puppeteer)...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    console.log('Đang mở ứng dụng web ở http://localhost:5001/admin2/ ...');
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    
    console.log('Chờ giao diện tải xong (tìm nút 預約)...');
    await page.waitForSelector('.fa-phone-volume', { timeout: 10000 });
    
    console.log('Đợi cyx_bookingHandler ghi đè modal (2 giây)...');
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Bấm vào nút 預約...');
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const bookingBtn = btns.find(b => b.innerText.includes('預約') && !b.innerText.includes('檢查'));
        if (bookingBtn) bookingBtn.click();
        else document.querySelector('.fa-phone-volume').closest('button').click();
    });
    
    console.log('Đợi modal xuất hiện...');
    await new Promise(r => setTimeout(r, 1000));
    
    const modalHTML = await page.evaluate(() => {
        const modal = document.querySelector('.modal-animate') || document.querySelector('.fixed.inset-0 .bg-white');
        return modal ? modal.innerHTML : null;
    });
    
    if (!modalHTML) {
        console.error('❌ KHÔNG TÌM THẤY MODAL!');
        process.exit(1);
    }
    
    if (modalHTML.includes('載入中')) {
        console.error('❌ LỖI: Vẫn đang hiển thị bảng nhỏ (Loading) - cyx_bookingHandler chưa ghi đè thành công hoặc bị lỗi!');
        process.exit(1);
    } else {
        console.log('✅ THÀNH CÔNG: Bảng đặt lịch TO đã được hiển thị (không phải bảng nhỏ 載入中)!');
        const hasBigFormFields = modalHTML.includes('詳細需求') || modalHTML.includes('預約檢查') || modalHTML.includes('人數');
        console.log('Bảng lớn hiển thị đầy đủ trường dữ liệu: ' + (hasBigFormFields ? 'CÓ' : 'KHÔNG'));
    }
    
    await browser.close();
    console.log('Hoàn thành E2E Test.');
})();

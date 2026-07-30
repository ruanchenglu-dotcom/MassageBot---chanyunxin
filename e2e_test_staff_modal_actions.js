const puppeteer = require('puppeteer');

(async () => {
    console.log('🚀 Bắt đầu test E2E cho StaffInfoModal...');
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    const page = await browser.newPage();
    
    // Admin URL
    await page.goto('http://localhost:5001/admin2?id=123', { waitUntil: 'networkidle0' });

    console.log('🕒 Đợi load dữ liệu...');
    await new Promise(r => setTimeout(r, 4000));

    console.log('🔍 Click vào avatar của thợ đầu tiên để mở StaffInfoModal...');
    try {
        await page.waitForSelector('.fa-info', { timeout: 5000 });
        const infoButtons = await page.$$('.fa-info');
        if (infoButtons.length > 0) {
            await infoButtons[0].click();
        } else {
            throw new Error("Không tìm thấy nút mở StaffInfoModal!");
        }

        console.log('⏳ Đợi StaffInfoModal hiện lên...');
        await page.waitForSelector('h3:has(.fa-bolt)', { timeout: 5000 });
        console.log('✅ Đã thấy khu vực 快速操作 (Quick Actions) trong StaffInfoModal');

        // Check if buttons exist
        console.log('🔍 Kiểm tra các nút thao tác...');
        const checkButtons = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return {
                punch: buttons.some(b => b.textContent.includes('打卡') || b.textContent.includes('下班')),
                late: buttons.some(b => b.textContent.includes('晚到')),
                early: buttons.some(b => b.textContent.includes('早退')),
                out: buttons.some(b => b.textContent.includes('外出')),
                eat: buttons.some(b => b.textContent.includes('用餐'))
            };
        });

        if (checkButtons.punch && checkButtons.late && checkButtons.early && checkButtons.out && checkButtons.eat) {
            console.log('✅ Tất cả các nút: 打卡/下班, 晚到, 早退, 外出, 用餐 đều tồn tại!');
        } else {
            console.error('❌ Lỗi: Thiếu một hoặc nhiều nút!', checkButtons);
            throw new Error('Buttons missing');
        }

        // Test clicking the Eat button
        console.log('🔍 Thử click vào nút 用餐 (Ăn cơm)...');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('用餐'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 1000)); // wait for state update
        console.log('✅ Đã click nút 用餐!');

        // Test clicking the Late button
        console.log('🔍 Thử click vào nút 晚到 (Đến muộn) để mở AbsenceCheckModal...');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('晚到'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 1000)); // wait for modal
        
        // Check if AbsenceCheckModal appears
        const absenceModalText = await page.evaluate(() => document.body.innerText);
        if (absenceModalText.includes("晚到登記")) {
            console.log('✅ Đã mở được AbsenceCheckModal thành công!');
        } else {
            throw new Error("Không mở được AbsenceCheckModal!");
        }

        console.log('🎉 TEST E2E THÀNH CÔNG! Tính năng tích hợp StaffInfoModal hoạt động tốt!');
    } catch (err) {
        console.error('❌ TEST FAILED:', err);
        await page.screenshot({ path: 'e2e_error.png' });
        console.log('📸 Đã lưu ảnh màn hình lỗi tại e2e_error.png');
    } finally {
        await browser.close();
    }
})();

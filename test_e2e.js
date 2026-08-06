const puppeteer = require('puppeteer');

(async () => {
    console.log("Khởi động Browser (End-to-End Test)...");
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();
    
    try {
        console.log("Mở trang web localhost:5000/admin2/");
        await page.goto('http://localhost:5000/admin2/index.html', { waitUntil: 'networkidle2' });
        
        console.log("Đợi danh sách booking load...");
        await page.waitForSelector('.booking-item', { timeout: 15000 });
        console.log("Đã thấy booking! Kịch bản sẵn sàng.");
        
        await new Promise(r => setTimeout(r, 2000));
        
        const bookings = await page.$$('.booking-item');
        if (bookings.length > 0) {
            console.log("Click chuột phải vào booking đầu tiên...");
            await bookings[0].click({ button: 'right' });
            
            await new Promise(r => setTimeout(r, 1000));
            
            console.log("Chọn 'Sửa dịch vụ' từ menu...");
            // Click menu edit
            const edited = await page.evaluate(() => {
                const menuItems = document.querySelectorAll('.custom-menu-item');
                for (let item of menuItems) {
                    if (item.innerText.includes('Sửa Dịch Vụ') || item.innerText.includes('Edit')) {
                        item.click();
                        return true;
                    }
                }
                return false;
            });
            
            if (edited) {
                console.log("Đã mở popup Sửa Dịch Vụ.");
                await new Promise(r => setTimeout(r, 2000));
                console.log("E2E Test Success! Màn hình mở sẵn để kiểm tra.");
            }
        }
    } catch (error) {
        console.error("Test lỗi:", error);
    }
})();

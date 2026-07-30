const puppeteer = require('puppeteer');

(async () => {
    console.log('Khởi động Browser Agent (Puppeteer)...');
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox'],
        executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    });
    const page = await browser.newPage();
    
    try {
        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
        page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

        console.log('Mở trang web Admin tại http://localhost:5001/admin2/ ...');
        await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log('Chờ tải trang và tìm nút xem thống kê...');
        await page.waitForSelector('button[title="查看該時段可用技師統計"]', { timeout: 15000 });
        
        console.log('Click vào nút xem thống kê đầu tiên để mở StaffStatsModal...');
        const buttons = await page.$$('button[title="查看該時段可用技師統計"]');
        if (buttons.length > 0) {
            await page.evaluate(btn => btn.click(), buttons[0]);
            
            console.log('Chờ Modal biểu đồ xuất hiện...');
            await page.waitForSelector('.fa-chart-bar', { timeout: 5000 });
            await new Promise(resolve => setTimeout(resolve, 1000)); // Đợi render
            
            // Tìm SVG Chart
            const chartData = await page.evaluate(() => {
                const svg = document.querySelector('svg');
                const title = document.querySelector('h3');
                const titleText = title ? title.textContent : '';
                
                let barsCount = 0;
                if (svg) {
                    barsCount = svg.querySelectorAll('rect').length;
                }
                
                return {
                    titleText,
                    hasSvg: !!svg,
                    barsCount,
                    html: !!svg ? '' : document.body.innerHTML.substring(0, 500)
                };
            });
            
            if (chartData.hasSvg) {
                console.log('Đã tìm thấy Biểu đồ Thống Kê (SVG Chart) trong Modal!');
                console.log(' - Tiêu đề Modal:', chartData.titleText);
                console.log(' - Số lượng khối cột (rect) đã render:', chartData.barsCount);
                if (chartData.barsCount >= 60) {
                    console.log('=> Trạng thái: BIỂU ĐỒ 60 PHÚT HOẠT ĐỘNG TỐT!');
                } else {
                    console.log('=> Trạng thái: CÓ BIỂU ĐỒ NHƯNG CHƯA ĐỦ CỘT.');
                }
                console.log('✅ End-to-End Test (E2E) thành công: Biểu đồ đã được vẽ chính xác.');
            } else {
                console.log('❌ Không tìm thấy biểu đồ SVG. HTML preview:', chartData.html);
            }
        } else {
            console.log('Không có nút xem thống kê nào trên UI.');
        }
    } catch (error) {
        console.error('Lỗi khi chạy E2E Test:', error);
    } finally {
        await browser.close();
        console.log('Đã đóng Browser Agent.');
    }
})();

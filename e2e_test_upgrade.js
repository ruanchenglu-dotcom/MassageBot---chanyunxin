const puppeteer = require('puppeteer');
const http = require('http');

async function checkServerReady(url) {
    return new Promise((resolve) => {
        const check = () => {
            http.get(url, (res) => {
                if (res.statusCode === 200) resolve();
                else setTimeout(check, 1000);
            }).on('error', () => {
                setTimeout(check, 1000);
            });
        };
        check();
    });
}

(async () => {
    console.log('✅ Bắt đầu chạy E2E...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto('http://127.0.0.1:5001/admin2/index.html', { waitUntil: 'networkidle2' });
    
    console.log('⏳ Chờ các thư viện và hàm cốt lõi tải xong...');
    await page.waitForFunction(() => typeof window.cyxCallCoreAvailabilityCheck === 'function');
    
    console.log('✅ Bắt đầu chạy kịch bản E2E Test cho lỗi Combo và Location...');
    const testResult = await page.evaluate(() => {
        const todaysBookings = [];
        const staffList = [{ id: 'STAFF1', gender: 'F', start: '10:00', end: '22:00' }];
        const guestDetails = [{
            service: '套餐 (100分)',
            serviceName: '套餐 (100分)',
            staff: '隨機',
            overrideDuration: 100,
            flowCode: 'FB',
            location: '對面館'
        }];
        return window.cyxCallCoreAvailabilityCheck("2024-10-24", "14:10", guestDetails, todaysBookings, staffList);
    });

    console.log('RAW RESULT (Node):', JSON.stringify(testResult, null, 2));

    console.log('\n--- KẾT QUẢ KIỂM THỬ ---');
    if (testResult && testResult.valid) {
        console.log('✅ Kiểm tra khả dụng: THÀNH CÔNG (feasible = true)');
        
        let hasShop2 = false;
        let hasFB = false;

        const guestDetail = testResult.details && testResult.details[0];
        if (guestDetail) {
            const alloc = guestDetail.allocated || [];
            if (alloc.some(r => r.includes('-2-'))) hasShop2 = true;
            if (guestDetail.phase1_duration > 0 && guestDetail.phase2_duration > 0) hasFB = true;
        }

        if (hasShop2) {
            console.log('✅ PASS: Khách được xếp đúng sang quán đối diện (chứa -2-)');
        } else {
            console.error('❌ FAIL: Khách bị xếp nhầm sang quán chính (không có -2-)');
        }

        if (hasFB) {
            console.log('✅ PASS: Hệ thống nhận diện đúng Combo (2 giai đoạn BED và CHAIR)');
        } else {
            console.error('❌ FAIL: Chỉ có 1 giai đoạn, hệ thống vẫn nhận là SINGLE');
        }
    } else {
        console.error('❌ FAIL: Trả về fail - ' + (testResult ? testResult.reason : 'null'));
    }
    
    await browser.close();
    console.log('--- KẾT THÚC ---');
    process.exit(0);
})();

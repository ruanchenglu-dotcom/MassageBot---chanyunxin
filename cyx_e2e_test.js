const puppeteer = require('puppeteer');

(async () => {
    console.log('?? ?ang kh?i ??ng Browser Agent E2E Test...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log('?? ?ang m? http://localhost:5001/admin2/index.html');
    await page.goto('http://localhost:5001/admin2/index.html', { waitUntil: 'networkidle0' });
    
    console.log('? ?ang ch? d? li?u load t? backend...');
    await new Promise(r => setTimeout(r, 4000));

    console.log('?? B?t ??u Test: Chuy?n 5 khach Combo sang 對面館');
    const comboResult = await page.evaluate(() => {
        const staffList = [];
        for(let i=1;i<=10;i++) staffList.push({ id: i.toString(), name: 'S'+i, start: '00:00', end: '23:59', gender: 'F' });

        const guestDetails = [];
        for(let i=0; i<5; i++) {
            guestDetails.push({ 
                idx: i, 
                rowId: 'row_' + i,
                serviceCode: '套餐 (130分)', 
                serviceName: '套餐 (130分)', 
                duration: 130, 
                location: '對面館', 
                staff: undefined,
                staffName: undefined,
                isManualLocked: false 
            });
        }

        try {
            return window.cyxCallCoreAvailabilityCheck('2026-08-19', '21:00', guestDetails, [], staffList);
        } catch(e) {
            return { error: e.message };
        }
    });

    if (comboResult && comboResult.valid) {
        console.log('? Thanh cong: H? th?ng phan b? ???c 5 khach combo vao 對面館!');
        console.log('Phan b? chi ti?t:', JSON.stringify(comboResult.details.map(d => ({
            flow: d.flow,
            phase1_duration: d.phase1_duration,
            phase2_duration: d.phase2_duration
        })), null, 2));
    } else {
        console.log('? Th?t b?i: Khong th? phan b?.', comboResult);
    }

    await browser.close();
    console.log('?? E2E Test hoan t?t!');
})();

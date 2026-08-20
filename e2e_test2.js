const puppeteer = require('puppeteer');

(async () => {
    console.log('🚀 Starting End-to-End Test for Skill Validation...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    // Set a large viewport to ensure all elements are visible
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log('🌐 Navigating to http://localhost:5001/admin2/ ...');
    await page.goto('http://localhost:5001/admin2/', { waitUntil: 'networkidle2' });
    
    // Wait for the app to initialize
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('🖱️ Clicking on "新增預約" (Add Booking) button...');
    const addBookingBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('新增預約') || el.textContent.includes('+'));
    });
    
    if (addBookingBtn) {
        await addBookingBtn.click();
        await new Promise(r => setTimeout(r, 1000));
    } else {
        console.log('❌ Could not find Add Booking button.');
        await browser.close();
        return;
    }

    console.log('📝 Selecting staff "王"...');
    await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        for (let sel of selects) {
            for (let opt of sel.options) {
                if (opt.textContent.includes('王') && !opt.textContent.includes('不指定')) {
                    sel.value = opt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                }
            }
        }
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('🔍 Checking if "油推" (Oil Massage) button is disabled...');
    const isOilDisabled = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const oilBtn = buttons.find(b => b.textContent.includes('油推'));
        if (!oilBtn) return null;
        return oilBtn.disabled || oilBtn.className.includes('cursor-not-allowed') || oilBtn.className.includes('opacity-50');
    });

    if (isOilDisabled === true) {
        console.log('✅ SUCCESS: "油推" button is correctly disabled for staff "王"!');
    } else if (isOilDisabled === false) {
        console.log('❌ FAILED: "油推" button is NOT disabled!');
    } else {
        console.log('⚠️ Could not find "油推" button.');
    }

    console.log('✅ Test finished.');
    await browser.close();
})();

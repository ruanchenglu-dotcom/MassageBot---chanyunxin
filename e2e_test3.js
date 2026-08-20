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
    const clicked = await page.evaluate(() => {
        let btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('預約') || el.textContent.includes('+'));
        if (btn) {
            btn.click();
            return true;
        }
        return false;
    });
    
    if (clicked) {
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
    const btnState = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const oilBtn = buttons.find(b => b.textContent.includes('油推'));
        if (!oilBtn) return null;
        return {
            disabled: oilBtn.disabled,
            className: oilBtn.className
        };
    });

    if (!btnState) {
        console.log('⚠️ Could not find "油推" button.');
    } else if (btnState.disabled || btnState.className.includes('opacity-50')) {
        console.log('✅ SUCCESS: "油推" button is correctly disabled for staff "王"!');
        console.log('   -> Button Classes:', btnState.className);
    } else {
        console.log('❌ FAILED: "油推" button is NOT disabled!');
        console.log('   -> Button Classes:', btnState.className);
    }
    
    console.log('🔍 Clicking Check Availability to verify backend response...');
    await page.evaluate(() => {
        let checkBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('查詢空位'));
        if (checkBtn) checkBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    
    const errors = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('div')).map(el => el.textContent).filter(t => t.includes('老師不會') || t.includes('未排班或已下班'));
    });
    
    if (errors.length > 0) {
        console.log('✅ BACKEND VALIDATION CATCH: ', errors[0]);
    }

    console.log('✅ Test finished.');
    await browser.close();
})();

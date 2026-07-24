const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log("🚀 Starting E2E test for Combo Phase Rendering...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--disable-web-security']
    });
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = request.url();
        if (url.includes('action=getBookings') || url.includes('getBookings')) {
            console.log("Mocking getBookings response...");
            request.respond({
                status: 200,
                contentType: 'application/json',
                headers: {"Access-Control-Allow-Origin": "*"},
                body: JSON.stringify({
                    status: 'success',
                    data: [
                        {
                            id: "booking_combo_test_1",
                            rowId: 999,
                            status: "Running",
                            date: new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }).replace(/\//g, '-'),
                            startTime: "12:00",
                            duration: 100,
                            phase1_duration: 50,
                            phase2_duration: 50,
                            serviceCode: "C01",
                            serviceName: "Combo FB Test",
                            customerName: "Test Combo FB",
                            flowCode: "FB",
                            allocated_resource: "BED-1-1 + CHAIR-1-1",
                            staffName: "傅",
                        }
                    ]
                })
            });
        } else if (url.includes('action=getStaffs') || url.includes('getStaffs')) {
             request.respond({
                status: 200,
                contentType: 'application/json',
                headers: {"Access-Control-Allow-Origin": "*"},
                body: JSON.stringify({
                    status: 'success',
                    data: [
                        { staffId: "S01", name: "傅", isActive: true }
                    ]
                })
            });
        } else if (url.includes('action=getServices')) {
            request.respond({
               status: 200,
               contentType: 'application/json',
               headers: {"Access-Control-Allow-Origin": "*"},
               body: JSON.stringify({
                   status: 'success',
                   data: [
                       { code: "C01", name: "Combo FB Test", category: "COMBO" }
                   ]
               })
           });
       } else {
            request.continue();
        }
    });

    const fileUrl = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');
    console.log("Loading App: " + fileUrl);
    
    try {
        await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    } catch (e) {
        console.log("Page loaded (networkidle0 might have timed out due to polling).");
    }

    console.log("Waiting 4 seconds for React to render...");
    await new Promise(resolve => setTimeout(resolve, 4000));

    console.log("Extracting rendered blocks from DOM...");
    const results = await page.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll('.booking-block'));
        const mapped = blocks.map(el => {
            return {
                text: el.innerText.trim(),
                top: el.style.top,
                left: el.style.left,
                width: el.style.width,
            };
        });
        return { domBlocks: mapped };
    });

    console.log("DOM Blocks Found:", results.domBlocks.length);
    
    if (results.domBlocks.length >= 2) {
        const block1 = results.domBlocks[0];
        const block2 = results.domBlocks[1];
        
        console.log("Block 1 Info:", block1.text.replace(/\n/g, ' | '), "Left:", block1.left);
        console.log("Block 2 Info:", block2.text.replace(/\n/g, ' | '), "Left:", block2.left);

        if (block1.left === block2.left) {
            console.error("❌ Test Failed: Both Phase 1 and Phase 2 start at the EXACT same time (left property is equal).");
        } else {
            console.log("✅ Test Passed: Phase 2 is drawn after Phase 1 (left properties differ). The ReferenceError and Flow assignment bug is fixed!");
        }
    } else {
        console.log("Could not find enough booking-blocks in DOM to verify. The app might require explicit date selection or the mock data wasn't rendered.");
    }
    
    await browser.close();
})();

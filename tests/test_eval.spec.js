const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Debug Frontend Data', async ({ page }) => {
    page.on('console', msg => {
        if (msg.text().includes('DEBUG BOOKINGS:') || msg.text().includes('DEBUG API_BOOKING:') || msg.text().includes('DEBUG isWithin:')) {
            const fs = require('fs');
            fs.appendFileSync('debug-bookings.log', msg.text() + '\n');
            const args = msg.args();
            if (args.length > 1) {
                args[1].jsonValue().then(val => {
                    fs.appendFileSync('debug-bookings.log', JSON.stringify(val, null, 2) + '\n');
                }).catch(e => console.error(e));
            }
        }
    });

    await page.route('**/api/info*', async (route) => {
        const url = new URL(route.request().url());
        let reqDate = url.searchParams.get('date');
        if (!reqDate) {
            const today = new Date();
            reqDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
        const reqDateSlash = reqDate.replace(/-/g, '/');

        const json = {
            bookings: [
                {
                    rowId: "test-addon-toggle",
                    date: reqDateSlash,
                    startTimeString: `${reqDateSlash} 12:00:00`,
                    startTime: "12:00",
                    originalName: "Test Addon",
                    customerName: "Test Addon",
                    serviceName: "Test Service",
                    cleanServiceName: "Test Service",
                    serviceCode: "T1",
                    category: "SINGLE",
                    duration: 60,
                    status: "等待中",
                    resourceId: "CHAIR-1-1",
                    allocated_resource: "CHAIR-1-1",
                    location: "CHAIR-1-1",
                    current_resource_id: "CHAIR-1-1",
                    staffId: "隨機",
                    pax: 1
                }
            ],
            services: {
                "T1": { name: "Test Service", duration: 60, category: "SINGLE" }
            },
            systemConfig: {
                BUSINESS_START_HOUR: 10,
                BUSINESS_END_HOUR: 24,
                INTERVAL_MINUTES: 10,
                SCALE: { MAX_CHAIRS: 2, MAX_BEDS: 2 }
            }
        };
        await route.fulfill({ json });
    });

    await page.route('**/api/save*', async (route) => route.fulfill({ json: { success: true } }));
    await page.route('**/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
    await page.route('**/api/resource-status*', async (route) => route.fulfill({ json: {} }));
    await page.route('**/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));

    await page.goto('/admin2/index.html');
    await page.waitForResponse(resp => resp.url().includes('/api/info'));
    await page.waitForTimeout(2000); // Give React time to render

    const evalResult = await page.evaluate(() => {
        return {
            timelineRows: document.querySelector('.flex.relative.transition-colors') ? true : false,
            hasTestAddon: document.documentElement.innerHTML.includes('Test Addon'),
            debugSafeData: window.debugSafeData,
            html: document.documentElement.innerHTML
        };
    });
    
    const fs = require('fs');
    fs.writeFileSync('test-render-output-full.html', evalResult.html);
    
    console.log("EVAL RESULT:", {
        timelineRows: evalResult.timelineRows,
        hasTestAddon: evalResult.hasTestAddon,
        debugSafeData: evalResult.debugSafeData
    });
    fs.writeFileSync('debug-body.txt', await page.evaluate(() => document.body.innerText));
});

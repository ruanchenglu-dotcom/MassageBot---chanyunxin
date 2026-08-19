const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Kiểm tra lỗi đầy ghế không hiện hộp thoại auto-stretch sai', async ({ page }) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}/${mm}/${dd}`;

    const mockBookings = [];

    for (let i = 1; i <= 4; i++) {
        mockBookings.push({
            rowId: `target-body-group-${i}`,
            date: dateStr,
            startTimeString: `${dateStr} 18:00:00`,
            startTime: "18:00",
            originalName: `高(${i}/4)`,
            customerName: `高(${i}/4)`,
            serviceName: "身體按摩 (120分)",
            cleanServiceName: "身體按摩 (120分)",
            duration: 120,
            status: "等待中",
            resourceId: `BED-1-${i}`,
            current_resource_id: `BED-1-${i}`,
            location: `BED-1-${i}`,
            staffId: "隨機",
            flow: "BODYSINGLE",
            type: "SINGLE"
        });
    }

    for (let i = 1; i <= 4; i++) {
        mockBookings.push({
            rowId: `occupier-chair-${i}`,
            date: dateStr,
            startTimeString: `${dateStr} 18:00:00`,
            startTime: "18:00",
            originalName: `方(${i}/4)`,
            customerName: `方(${i}/4)`,
            serviceName: "腳底按摩 (60分)",
            cleanServiceName: "腳底按摩 (60分)",
            duration: 60,
            status: "等待中",
            resourceId: `CHAIR-1-${i}`,
            current_resource_id: `CHAIR-1-${i}`,
            location: `CHAIR-1-${i}`,
            staffId: `Staff${i}`,
            flow: "FOOTSINGLE",
            type: "SINGLE"
        });
    }

    await page.route('**/api/info*', async (route) => {
        const json = {
            bookings: mockBookings,
            timeline: [],
            staffList: [
                { id: "Staff1" }, { id: "Staff2" }, { id: "Staff3" }, { id: "Staff4" },
                { id: "Staff5" }, { id: "Staff6" }, { id: "Staff7" }, { id: "Staff8" }
            ],
            statusData: {},
            resourceState: {}
        };
        await route.fulfill({ json });
    });

    await page.route('/api/save*', async (route) => route.fulfill({ json: { success: true } }));
    await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
    await page.route('/api/resource-status*', async (route) => route.fulfill({ json: {} }));
    await page.route('/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto('/admin2/index.html');
    
    const bookingEl = await page.getByText('高(1/4)').first();
    await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
    
    await bookingEl.click({ force: true });
    
    await page.waitForSelector('text=服務項目', { timeout: 10000 });
    
    const serviceSelect = page.locator('select').nth(0);
    await serviceSelect.selectOption('A4');
    
    await page.waitForTimeout(1000);

    const errorMsg = page.getByText('❌ 足底區客滿').first();
    await expect(errorMsg).toBeVisible();

    const swalAlert = page.getByText('請問是否保持腳部');
    await expect(swalAlert).not.toBeVisible();

    console.log("✅ E2E TEST PASSED: Hệ thống chặn đúng lỗi thiếu ghế và KHÔNG báo chia thời gian sai!");
});

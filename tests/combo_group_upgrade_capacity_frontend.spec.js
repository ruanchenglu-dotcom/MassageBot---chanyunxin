const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Cho phép đổi nhóm 4 người sang Combo khi không đủ chỗ cục bộ nhưng có thể chẻ luồng', async ({ page }) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}/${mm}/${dd}`;

    const mockBookings = [];

    // 4 khách Body ở giường (18:00 - 20:00, 120 mins)
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
            staffId: `BodyStaff${i}`,
            flow: "BODYSINGLE",
            type: "SINGLE",
            group_id: "test-group-4-body",
            pax: 1
        });
    }

    // 4 khách Foot ở ghế (18:00 - 19:00, 60 mins)
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
            staffId: `FootStaff${i}`,
            flow: "FOOTSINGLE",
            type: "SINGLE"
        });
    }

    await page.route('**/api/info*', async (route) => {
        const json = {
            bookings: mockBookings,
            timeline: [],
            staffList: [
                { id: "BodyStaff1" }, { id: "BodyStaff2" }, { id: "BodyStaff3" }, { id: "BodyStaff4" },
                { id: "FootStaff1" }, { id: "FootStaff2" }, { id: "FootStaff3" }, { id: "FootStaff4" },
                { id: "ExtraStaff1" }, { id: "ExtraStaff2" }, { id: "ExtraStaff3" }, { id: "ExtraStaff4" }
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
    
    // Mở modal
    await bookingEl.click({ force: true });
    await page.waitForSelector('text=服務項目', { timeout: 10000 });
    
    // Giả sử modal có nút Toggle cho isGroupMode, hoặc nó tự bật vì group_id giống nhau.
    // Nếu nó không tự bật, ta sẽ tìm nút "同步中" hoặc "單筆" để toggle.
    // UI thường có 1 nút ghi "單筆" (Single) hoặc "同步中" (Syncing).
    const syncButton = page.locator('button').filter({ hasText: '單筆' }).first();
    if (await syncButton.isVisible()) {
        await syncButton.click(); // Click để chuyển sang Đồng bộ nhóm (Syncing)
        await page.waitForTimeout(500);
    }
    
    // Đổi gói sang 套餐 (130分) -> Value A4
    const serviceSelect = page.locator('select').nth(0);
    await serviceSelect.selectOption('A4');
    
    await page.waitForTimeout(1000);

    // Kì vọng: Không báo "❌ 足底區客滿", mà báo "✅ 系統將自動為群組分配最佳流程組合"
    const successMsg = page.getByText('系統將自動為群組分配最佳流程組合').first();
    await expect(successMsg).toBeVisible();

    console.log("✅ E2E TEST PASSED: Hệ thống đã nhường quyền xếp flow cho nhóm 4 người đổi sang Combo cho Backend!");
});

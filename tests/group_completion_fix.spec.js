const { test, expect } = require('@playwright/test');

test.describe('Group Booking Completion E2E Test', () => {
  test('should prompt for group update and call update-status API with applyGroup: false when ONLY THIS CUSTOMER is selected', async ({ page }) => {
    // 1. Mock APIs
    await page.route('/api/check-auth', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, role: 'ADMIN', username: 'admin', store: 'MAIN' }),
      });
    });

    await page.route('/api/public-settings', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.route('/api/get-system-config', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                SCALE: { MAX_BEDS: 10, MAX_CHAIRS: 10 },
                BUFFERS: { TRANSITION_MINUTES: 5 }
            })
        });
    });

    const today = new Date();
    const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

    let mockBookings = [
      {
        rowId: "101",
        customerName: "李先生 (1/2)",
        originalName: "李先生 (1/2)",
        phone: "0912345678",
        serviceName: "套餐 (100分)",
        duration: "100",
        category: "COMBO",
        flow: "FB",
        phase1_duration: "50",
        phase2_duration: "50",
        status: "WAITING",
        date: todayStr,
        startTimeString: `${todayStr} 09:30`,
        booking_time: `${todayStr} 09:30`,
        opDate: todayStr,
        phase1_res_idx: "CHAIR-1-1",
        phase2_res_idx: "BED-1-1",
        current_resource_id: "",
        location: "",
        start_time_str: "09:30"
      },
      {
        rowId: "102",
        customerName: "李先生 (2/2)",
        originalName: "李先生 (2/2)",
        phone: "0912345678",
        serviceName: "套餐 (100分)",
        duration: "100",
        category: "COMBO",
        flow: "FB",
        phase1_duration: "50",
        phase2_duration: "50",
        status: "WAITING",
        date: todayStr,
        startTimeString: `${todayStr} 09:30`,
        booking_time: `${todayStr} 09:30`,
        opDate: todayStr,
        phase1_res_idx: "CHAIR-1-2",
        phase2_res_idx: "BED-1-2",
        current_resource_id: "",
        location: "",
        start_time_str: "09:30"
      }
    ];

    await page.route('/api/get-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          bookings: mockBookings,
          staffList: [{ id: '1', name: '隨機', active: true }],
          statusData: {},
          services: { "指壓 (60分)": { duration: 60, type: "SINGLE" } },
          lastUpdate: new Date().toISOString()
        })
      });
    });

    let updateStatusRequests = [];
    await page.route('/api/update-status', async (route) => {
      updateStatusRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: "OK" })
      });
    });

    await page.goto('http://localhost:5001/XinWuChanAdmin/');
    
    // Wait for the booking block
    const bookingBlock = page.locator('.booking-block').first();
    await expect(bookingBlock).toBeVisible({ timeout: 10000 });

    await bookingBlock.click();
    
    // Control Center Finish Button
    const finishBtn = page.locator('button', { hasText: '完' }).first();
    await expect(finishBtn).toBeVisible({ timeout: 5000 });
    await finishBtn.click();

    // SweetAlert pops up
    const swalTitle = page.locator('.swal2-title', { hasText: '確認' });
    await expect(swalTitle).toBeVisible({ timeout: 5000 });
    
    const swalText = page.locator('.swal2-html-container', { hasText: '此為團體客' });
    await expect(swalText).toBeVisible();

    // Click "僅此客人" (Deny Button)
    const denyBtn = page.locator('.swal2-deny', { hasText: '僅此客人' });
    await expect(denyBtn).toBeVisible();
    await denyBtn.click();

    await page.waitForTimeout(1000); 

    // Verify the intercepted request
    expect(updateStatusRequests.length).toBe(1);
    expect(updateStatusRequests[0].rowId).toBe("101");
    expect(updateStatusRequests[0].status).toBe("已完成");
    expect(updateStatusRequests[0].applyGroup).toBe(false);
  });
});

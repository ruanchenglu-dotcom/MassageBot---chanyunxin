const { test, expect } = require('@playwright/test');

test.describe('Group Booking Time Update E2E Test', () => {
  test('should prompt for group update and call batch-process API when entire group is selected', async ({ page }) => {
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
        rowId: "2",
        customerName: "張小姐 (1/2)",
        phone: "9563563",
        serviceName: "套餐 (100分)",
        duration: "100",
        category: "COMBO",
        flow: "FB",
        phase1_duration: "50",
        phase2_duration: "50",
        status: "WAITING",
        date: todayStr,
        startTimeString: `${todayStr} 09:30`,
        start_time_str: "09:30",
        phase1_res_idx: "CHAIR-1-1",
        phase2_res_idx: "BED-1-1",
        current_resource_id: "",
        location: ""
      },
      {
        rowId: "3",
        customerName: "張小姐 (2/2)",
        phone: "9563563",
        serviceName: "套餐 (100分)",
        duration: "100",
        category: "COMBO",
        flow: "FB",
        phase1_duration: "50",
        phase2_duration: "50",
        status: "WAITING",
        date: todayStr,
        startTimeString: `${todayStr} 09:30`,
        start_time_str: "09:30",
        phase1_res_idx: "CHAIR-1-2",
        phase2_res_idx: "BED-1-2",
        current_resource_id: "",
        location: ""
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
          services: { "套餐 (100分)": { duration: 100, type: "COMBO" } },
          lastUpdate: new Date().toISOString()
        })
      });
    });

    let batchRequestReceived = null;
    await page.route('/api/batch-process-bookings', async (route) => {
      batchRequestReceived = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: "OK" })
      });
    });

    await page.goto('http://localhost:5001/XinWuChanAdmin/');
    
    // Wait for the booking block
    const bookingBlock = page.locator('.booking-block', { hasText: '張小姐' }).first();
    await expect(bookingBlock).toBeVisible({ timeout: 10000 });

    await bookingBlock.click();
    
    const modalHeader = page.locator('h3', { hasText: '套餐時間調整' });
    await expect(modalHeader).toBeVisible({ timeout: 5000 });

    const timeInput = page.locator('input[type="time"]').first();
    await timeInput.fill('10:00');

    const saveBtn = page.locator('button', { hasText: '保存同步' });
    await saveBtn.click();

    const swalTitle = page.locator('.swal2-title', { hasText: '確認' });
    await expect(swalTitle).toBeVisible({ timeout: 5000 });
    
    // Test the specific UI text
    const swalText = page.locator('.swal2-html-container', { hasText: '此為團體客' });
    await expect(swalText).toBeVisible();

    const applyGroupBtn = page.locator('.swal2-confirm', { hasText: '套用至整個群組' });
    await applyGroupBtn.click();

    await page.waitForTimeout(2000); 

    expect(batchRequestReceived).not.toBeNull();
    expect(batchRequestReceived.payloads).toBeDefined();
    expect(batchRequestReceived.payloads.length).toBe(2); 

    expect(batchRequestReceived.payloads[0].rowId).toBe("2");
    expect(batchRequestReceived.payloads[0].phaseStartTime).toBe("10:00");
    
    expect(batchRequestReceived.payloads[1].rowId).toBe("3");
    expect(batchRequestReceived.payloads[1].phaseStartTime).toBe("10:00");
  });
});

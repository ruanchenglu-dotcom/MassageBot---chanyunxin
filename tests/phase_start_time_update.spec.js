const { test, expect } = require('@playwright/test');

test.describe('Phase Start Time Update E2E Test', () => {
  test('should update phaseStartTime and preserve original startTime when saving sync from Combo modal', async ({ page }) => {
    // 1. Intercept network requests to mock backend responses
    await page.route('/api/check-auth', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          role: 'ADMIN',
          username: 'cyx_admin',
          store: 'MAIN'
        }),
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
                SCALE: { MAX_BEDS: 2, MAX_CHAIRS: 2 },
                BUFFERS: { TRANSITION_MINUTES: 5 }
            })
        });
    });

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}/${mm}/${dd}`;

    let mockBookings = [
      {
        rowId: "123",
        customerName: "Test Combo Time",
        serviceName: "套餐 (100分)",
        duration: "100",
        category: "COMBO",
        flow: "FB",
        phase1_duration: "40",
        phase2_duration: "60",
        status: "WAITING",
        date: todayStr,
        startTimeString: `${todayStr} 10:00`,
        start_time_str: "10:00",
        phase1_res_idx: "CHAIR-1-1",
        phase2_res_idx: "BED-1-1",
        current_resource_id: "",
        location: ""
      }
    ];

    await page.route('/api/get-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ bookings: mockBookings })
      });
    });

    let updateRequestReceived = null;
    await page.route('/api/update-booking-details', async (route) => {
      updateRequestReceived = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: "OK" })
      });
    });

    // 2. Navigate to the app (using a mocked index.html or local dev server)
    await page.goto('http://localhost:5001/XinWuChanAdmin/');
    
    // Wait for the booking block to appear
    const bookingBlock = page.locator('.booking-block', { hasText: 'Test Combo Time' });
    await expect(bookingBlock).toBeVisible({ timeout: 10000 });

    // 3. Click to open Control Center Modal
    await bookingBlock.click();
    
    // Wait for Modal to open
    const modalHeader = page.locator('h3', { hasText: '套餐時間調整' });
    await expect(modalHeader).toBeVisible({ timeout: 5000 });

    // 4. In a real scenario, user changes the time. For test, just clicking '保存同步' 
    // will send the current modal state, which includes the logic we modified.
    const saveBtn = page.locator('button:has-text("保存同步")').first();
    await saveBtn.click();

    // 5. Wait for the API to be called
    await page.waitForTimeout(2000); // Wait for Swal and request

    // 6. Verify the API request payload contains phaseStartTime and NOT startTime
    expect(updateRequestReceived).not.toBeNull();
    expect(updateRequestReceived.rowId).toBe("123");
    
    // New logic: Should send phaseStartTimeString / phaseStartTime
    expect(updateRequestReceived.phaseStartTime).toBeDefined();
    expect(updateRequestReceived.phaseStartTimeString).toBeDefined();
    expect(updateRequestReceived.phaseStartTime).toBe("10:00");
    
    // Should NOT send startTime, gioDen, startTimeString to prevent overwriting Column B
    expect(updateRequestReceived.startTime).toBeUndefined();
    expect(updateRequestReceived.gioDen).toBeUndefined();
    expect(updateRequestReceived.startTimeString).toBeUndefined();
  });
});

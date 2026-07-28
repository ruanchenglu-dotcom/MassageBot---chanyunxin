const { test, expect } = require('@playwright/test');

test('Bed View Mobile Interface - Status Emoji Sync Fix', async ({ page }) => {
  test.setTimeout(30000);

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  let mockBookings = [
    {
      rowId: "101",
      customerName: "測試客",
      originalName: "測試客",
      phone: "0912345678",
      serviceName: "指壓 (60分)",
      service: "指壓 (60分)",
      duration: "60",
      status: "已預約",
      time: timeStr,
      phase1_res_idx: "BED-1-1",
      pax: "1"
    }
  ];

  await page.route('**/api/info*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ bookings: mockBookings })
    });
  });

  let updateRequests = [];
  await page.route('**/api/update-status', async (route) => {
    const postData = JSON.parse(route.request().postData());
    updateRequests.push(postData);
    
    // Simulate backend state change
    if (postData.status === '服務中') {
        mockBookings[0].status = "服務中";
    } else if (postData.status === '已完成') {
        mockBookings[0].status = "已完成";
    }
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  // Handle window.confirm for finishing service
  page.on('dialog', async dialog => {
    expect(dialog.message()).toContain('您確定要結束此服務嗎？');
    await dialog.accept();
  });

  await page.goto('http://localhost:5001/bed_view/index.html');

  // Set local storage for bypass login and setup
  await page.evaluate(() => {
      localStorage.setItem('bed_auth_token', 'true');
      localStorage.setItem('bed_display_config', JSON.stringify({
          shop: '本館',
          leftBed: '床1-1',
          rightBed: '床1-2'
      }));
  });
  await page.reload();

  // Step 3: Bed Panel (Booking is "已預約")
  await expect(page.locator('text=測試客').first()).toBeVisible();

  // Find and click '開始' (Start)
  const startBtn = page.locator('button', { hasText: '開始' }).first();
  await expect(startBtn).toBeVisible();
  await startBtn.click();

  // Verify Start API call
  await page.waitForTimeout(500);
  expect(updateRequests.length).toBe(1);
  expect(updateRequests[0].rowId).toBe("101");
  expect(updateRequests[0].status).toBe("服務中");

  // Since mock data updated status to "服務中", wait for React to refresh and show '結束' button
  await page.waitForTimeout(6000); // Because info fetches every 5 seconds
  
  const finishBtn = page.locator('button', { hasText: '結束' }).first();
  await expect(finishBtn).toBeVisible();
  
  // Find and click '結束' (Finish)
  await finishBtn.click();
  
  // Verify Finish API call
  await page.waitForTimeout(500);
  expect(updateRequests.length).toBe(2);
  expect(updateRequests[1].rowId).toBe("101");
  expect(updateRequests[1].status).toBe("已完成");

  console.log("✅ End-to-End Test Passed: Status updates correctly send plain text without emojis.");
});

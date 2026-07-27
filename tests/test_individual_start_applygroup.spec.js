const { test, expect } = require('@playwright/test');

test('Individual Start For Group Member', async ({ page }) => {
  test.setTimeout(30000);

  // 1. Mock APIs
  await page.route('**/api/check-auth', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, role: 'ADMIN', username: 'admin', store: 'MAIN' }),
    });
  });

  await page.route('**/api/public-settings', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.route('**/api/get-system-config', async (route) => {
      await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
              SCALE: { MAX_BEDS: 10, MAX_CHAIRS: 10 },
              BUFFERS: { TRANSITION_MINUTES: 5 },
              OPERATION_TIME: { OPEN_HOUR: 8, CUT_OFF_HOUR: 2 }
          })
      });
  });

  const today = new Date();
  const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const startMins = now.getHours() * 60 + now.getMinutes() - 30; // 30 minutes ago
  const startHour = Math.floor(startMins / 60);
  const startMin = startMins % 60;
  const startTimeStr = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;

  let mockBookings = [
    {
      rowId: "201",
      customerName: "測試客 (1/2)",
      originalName: "測試客 (1/2)",
      phone: "0911111111",
      serviceName: "腳底按摩 (60分)",
      duration: "60",
      category: "SINGLE",
      flow: "F",
      status: "WAITING",
      date: todayStr,
      startTimeString: `${todayStr} ${startTimeStr}`,
      booking_time: `${todayStr} ${startTimeStr}`,
      opDate: todayStr,
      current_resource_id: "CHAIR-1-1",
      location: "CHAIR-1-1",
      start_time_str: startTimeStr,
      pax: "2",
      groupMemberIndex: 0
    },
    {
      rowId: "202",
      customerName: "測試客 (2/2)",
      originalName: "測試客 (2/2)",
      phone: "0911111111",
      serviceName: "腳底按摩 (60分)",
      duration: "60",
      category: "SINGLE",
      flow: "F",
      status: "WAITING",
      date: todayStr,
      startTimeString: `${todayStr} ${startTimeStr}`,
      booking_time: `${todayStr} ${startTimeStr}`,
      opDate: todayStr,
      current_resource_id: "CHAIR-1-2",
      location: "CHAIR-1-2",
      start_time_str: startTimeStr,
      pax: "2",
      groupMemberIndex: 1
    }
  ];

  await page.route('**/api/info*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 
        bookings: mockBookings,
        staffList: [{ id: '1', name: '王技師', active: true }],
        statusData: {},
        services: { "腳底按摩 (60分)": { duration: 60, type: "SINGLE" } },
        lastUpdate: new Date().toISOString()
      })
    });
  });

  let updateStatusRequests = [];
  await page.route('**/api/update-status', async (route) => {
    updateStatusRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: "OK" })
    });
  });

  await page.goto('http://localhost:5001/admin2/index.html');
  
  // Wait for the timeline block
  const bookingBlock = page.locator('.timeline-block').first();
  await expect(bookingBlock).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000); // Give React time to bind handlers
  await bookingBlock.click({ force: true });
  
  await page.waitForTimeout(2000); // Wait for modal to render
  await page.screenshot({ path: 'modal_debug.png' });

  // Control Center Start Button
  const startBtn = page.locator('button', { hasText: '開始(個人)' }).first();
  await expect(startBtn).toBeVisible({ timeout: 15000 });
  await startBtn.click({ force: true });

  // Wait for StartChoiceModal
  await expect(page.getByText('僅開始此位')).toBeVisible({ timeout: 5000 });
  await page.getByText('僅開始此位').click();

  await page.waitForTimeout(1000); 

  // Verify the intercepted request
  expect(updateStatusRequests.length).toBe(1);
  expect(updateStatusRequests[0].rowId).toBe("201");
  expect(updateStatusRequests[0].applyGroup).toBe(false);
});

const { test, expect } = require('@playwright/test');

test('Bed View Mobile Interface - Pause and Resume', async ({ page }) => {
  test.setTimeout(30000);

  const today = new Date();
  const startTimeStr = "12:00";

  let mockBookings = [
    {
      rowId: "101",
      customerName: "測試客",
      originalName: "測試客",
      phone: "0912345678",
      serviceName: "指壓 (60分)",
      service: "指壓 (60分)",
      duration: "60",
      status: "🟡服務中",
      time: startTimeStr,
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

  let pauseRequests = [];
  await page.route('**/api/pause-booking', async (route) => {
    const postData = JSON.parse(route.request().postData());
    pauseRequests.push(postData);
    
    // Simulate backend state change
    mockBookings[0].status = "暫停中";
    mockBookings[0].pause_start_timestamp = Date.now().toString();
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  let resumeRequests = [];
  await page.route('**/api/resume-booking', async (route) => {
    const postData = JSON.parse(route.request().postData());
    resumeRequests.push(postData);
    
    // Simulate backend state change
    mockBookings[0].status = "🟡服務中";
    mockBookings[0].pause_start_timestamp = null;
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  await page.goto('http://localhost:5001/bed_view/index.html');

  // Step 1: Login
  await page.fill('input[type="password"]', '888888');
  await page.click('button:has-text("登入系統")');

  // Step 2: Setup Screen
  await expect(page.locator('h1', { hasText: '床/椅螢幕設定' })).toBeVisible();
  await page.click('button:has-text("儲存設定並開始")');

  // Step 3: Bed Panel (Booking is running)
  await expect(page.locator('text=測試客').first()).toBeVisible();

  // Find and click 'Pause'
  const pauseBtn = page.locator('button', { hasText: '暫停' }).first();
  await expect(pauseBtn).toBeVisible();
  await pauseBtn.click();

  // Verify Pause API call
  await page.waitForTimeout(500);
  expect(pauseRequests.length).toBe(1);
  expect(pauseRequests[0].rowId).toBe("101");

  // Since mock data updated status to "暫停中", wait for React to refresh and show 'Resume' button
  await page.waitForTimeout(6000); // Because info fetches every 5 seconds
  
  const resumeBtn = page.locator('button', { hasText: '繼續' }).first();
  await expect(resumeBtn).toBeVisible();
  
  // Verify timer text '已暫停時間' appears
  await expect(page.locator('text=已暫停時間')).toBeVisible();

  // Find and click 'Resume'
  await resumeBtn.click();
  
  // Verify Resume API call
  await page.waitForTimeout(500);
  expect(resumeRequests.length).toBe(1);
  expect(resumeRequests[0].rowId).toBe("101");

  console.log("End-to-End Test Passed: Pause and Resume work correctly.");
});

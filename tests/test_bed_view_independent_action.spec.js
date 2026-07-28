const { test, expect } = require('@playwright/test');

test('Bed View Mobile Interface - Independent Start/Pause/End', async ({ page }) => {
  test.setTimeout(30000);

  // Mock the /api/info endpoint to provide group bookings
  const today = new Date();
  const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const startMins = now.getHours() * 60 + now.getMinutes() - 10;
  const startHour = Math.floor(startMins / 60);
  const startMin = startMins % 60;
  const startTimeStr = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;

  const mockBookings = [
    {
      rowId: "101",
      customerName: "劉小姐 (1/2)",
      originalName: "劉小姐 (1/2)",
      phone: "0954254534",
      serviceName: "套餐 (100分)",
      service: "套餐 (100分)",
      duration: "100",
      status: "已預約",
      time: startTimeStr,
      phase1_res_idx: "BED-1-1",
      pax: "2"
    },
    {
      rowId: "102",
      customerName: "劉小姐 (2/2)",
      originalName: "劉小姐 (2/2)",
      phone: "0954254534",
      serviceName: "套餐 (100分)",
      service: "套餐 (100分)",
      duration: "100",
      status: "已預約",
      time: startTimeStr,
      phase1_res_idx: "BED-1-2",
      pax: "2"
    }
  ];

  await page.route('**/api/info*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ bookings: mockBookings })
    });
  });

  // Track /api/update-status calls
  let updateStatusRequests = [];
  await page.route('**/api/update-status', async (route) => {
    const postData = JSON.parse(route.request().postData());
    updateStatusRequests.push(postData);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  // Open Bed View (acting as mobile interface)
  await page.goto('http://localhost:5001/bed_view/index.html');

  // Step 1: Login
  await page.fill('input[type="password"]', '888888');
  await page.click('button:has-text("登入系統")');

  // Step 2: Setup Screen
  await expect(page.locator('h1', { hasText: '床/椅螢幕設定' })).toBeVisible();
  await page.click('button:has-text("儲存設定並開始")');

  // Step 3: Bed Panel
  await expect(page.locator('h2', { hasText: '床1-1' })).toBeVisible();
  
  // Verify that the customer is assigned to the bed
  await expect(page.locator('text=劉小姐 (1/2)').first()).toBeVisible();

  // Step 4: Click 'Start' (開始) on Bed 1-1
  // Find the button with text "開始" inside the panel for Bed 1-1
  // We can just click the first "開始" button which should be for Bed 1-1
  const startBtn = page.locator('button', { hasText: '開始' }).first();
  await expect(startBtn).toBeVisible();
  await startBtn.click();

  // Verify the intercepted request
  await page.waitForTimeout(500); // Give it time to send the request
  expect(updateStatusRequests.length).toBe(1);
  
  const req = updateStatusRequests[0];
  expect(req.rowId).toBe("101"); // Only the first bed's rowId
  expect(req.status).toContain("服務中");
  
  // VERIFY CRITICAL FIX: applyGroup must be explicitly false
  expect(req.applyGroup).toBe(false);

  console.log("End-to-End Test Passed: update-status sent applyGroup: false correctly.");
});

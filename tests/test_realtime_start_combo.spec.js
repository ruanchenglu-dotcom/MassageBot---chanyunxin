const { test, expect } = require('@playwright/test');

test('Verify Realtime Start Logic For Combo', async ({ page }) => {
  const uniqueId = Date.now().toString().slice(-3);
  const testPhone = '0922345' + uniqueId;
  const testName = 'AutoTest' + uniqueId;
  
  const today = new Date();
  if (today.getHours() < 8) {
    today.setDate(today.getDate() - 1);
  }
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}/${month}/${day}`;

  const mockBooking = {
    rowId: 9999,
    startTimeString: `${dateStr} 12:00`,
    startTime: "12:00",
    booking_time: "12:00",
    start_time_str: "12:00",
    duration: 100,
    type: "BED",
    category: "COMBO",
    price: 999,
    staffId: "隨機",
    requestedStaff: "隨機",
    staffName: "隨機",
    pax: 1,
    customerName: testName,
    originalName: testName,
    serviceName: "套餐 (100分)",
    serviceCode: "A3",
    phone: testPhone,
    date: dateStr,
    opDate: dateStr,
    status: "已預約",
    isRunning: false,
    phase1_duration: 60,
    transition_time: "13:00",
    phase2_duration: 40,
    finish_time: "13:40",
    isManualLocked: true,
    flow: "FB",
    phase1_res_idx: "CHAIR-1-1",
    phase2_res_idx: "BED-1-1",
    phase1_resource: "CHAIR-1-1",
    phase2_resource: "BED-1-1",
    resource_type: "COMBO",
    location: "本館"
  };

  let interceptedPayload = null;
  await page.route('**/api/update-booking-details', async route => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON();
      if (data && data.customerName === testName) {
        interceptedPayload = data;
        await route.fulfill({ json: { success: true } });
        return;
      }
    }
    await route.continue();
  });

  await page.route('**/api/get-system-state*', async route => {
    const response = await route.fetch();
    let json = {};
    try {
      json = await response.json();
    } catch (e) {}
    
    if (!json.bookings) json.bookings = [];
    json.bookings.push(mockBooking);
    
    // Convert back to string because the original might have been Big5, 
    // but playwright mock replaces the whole response payload with UTF-8 JSON.
    // The frontend should be able to parse standard JSON response.
    await route.fulfill({ response, json });
  });

  await page.goto('http://localhost:5001/admin2/index.html');
  
  const newBooking = page.getByText(testName).first();
  await expect(newBooking).toBeVisible({ timeout: 15000 });

  await newBooking.click();

  const startBtn = page.locator('button').filter({ hasText: '開始' }).first();
  await expect(startBtn).toBeVisible();
  
  await startBtn.click();
  await page.waitForTimeout(2000);

  expect(interceptedPayload).not.toBeNull();
  expect(interceptedPayload.status).toBe('服務中');
  expect(interceptedPayload.isRealtimeStart).toBe(true);
  expect(interceptedPayload.phaseStartTime).toBeDefined();
  console.log('Realtime Start Test Passed! phaseStartTime:', interceptedPayload.phaseStartTime);
});

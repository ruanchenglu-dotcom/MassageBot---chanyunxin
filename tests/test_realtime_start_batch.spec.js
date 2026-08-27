const { test, expect } = require('@playwright/test');

test('Verify Realtime Start Logic For Batch Start (Bắt đầu nhóm)', async ({ page }) => {
  const uniqueId = Date.now().toString().slice(-3);
  const testPhone = '0922345' + uniqueId;
  const testName1 = 'AutoBatch' + uniqueId + ' (1/2)';
  const testName2 = 'AutoBatch' + uniqueId + ' (2/2)';
  
  // Format today's date in YYYY/MM/DD using Taipei time equivalent logic
  const today = new Date();
  if (today.getHours() < 8) {
    today.setDate(today.getDate() - 1);
  }
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}/${month}/${day}`;

  const mockBooking1 = {
    rowId: 8888,
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
    pax: 2,
    customerName: testName1,
    originalName: testName1,
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
    phase1_res_idx: "CHAIR-1-2",
    phase2_res_idx: "BED-1-2",
    phase1_resource: "CHAIR-1-2",
    phase2_resource: "BED-1-2",
    resource_type: "COMBO",
    location: "本館"
  };

  const mockBooking2 = {
    rowId: 8889,
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
    pax: 2,
    customerName: testName2,
    originalName: testName2,
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
    phase1_res_idx: "CHAIR-1-3",
    phase2_res_idx: "BED-1-3",
    phase1_resource: "CHAIR-1-3",
    phase2_resource: "BED-1-3",
    resource_type: "COMBO",
    location: "本館"
  };

  let interceptedPayloads = null;
  await page.route('**/api/batch-process-bookings', async route => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON();
      if (data && data.payloads && data.payloads.length > 0) {
        const hasOurTest = data.payloads.some(p => p.rowId === 8888 || p.rowId === 8889);
        if (hasOurTest) {
          interceptedPayloads = data.payloads;
          await route.fulfill({ json: { success: true } });
          return;
        }
      }
    }
    await route.continue();
  });

  // Mock /api/info
  await page.route('**/api/info*', async route => {
    const response = await route.fetch();
    let json = {};
    try {
      json = await response.json();
    } catch (e) {}
    
    // bookings is an object in /api/info
    if (!json.bookings) json.bookings = {};
    json.bookings['8888'] = mockBooking1;
    json.bookings['8889'] = mockBooking2;
    
    await route.fulfill({ response, json });
  });

  // Open the page
  await page.goto('http://localhost:5001/admin2/index.html');
  
  // Đợi render
  const booking1 = page.locator(`text=${testName1}`).first();
  await expect(booking1).toBeVisible({ timeout: 15000 });

  // Nhấn vào khách (1/2) để hiện modal nhóm
  await booking1.click();

  // Nhấn nút "Bắt đầu nhóm"
  const batchStartBtn = page.locator('button').filter({ hasText: '同組開始' }).first();
  await expect(batchStartBtn).toBeVisible();
  await batchStartBtn.click();
  
  // Nhấn xác nhận trong Swal
  const confirmBtn = page.locator('.swal2-confirm');
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();

  // Chờ network
  await page.waitForTimeout(3000);

  expect(interceptedPayloads).not.toBeNull();
  expect(interceptedPayloads.length).toBeGreaterThan(0);
  
  const ourPayload = interceptedPayloads.find(p => p.rowId === 8888);
  expect(ourPayload).toBeDefined();
  expect(ourPayload.isRealtimeStart).toBe(true);
  expect(ourPayload.phaseStartTime).toBeDefined();
  
  console.log('Realtime BATCH Start Test Passed! phaseStartTime:', ourPayload.phaseStartTime);
});

const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const uniqueId = '999';
  const testName = 'AutoTest' + uniqueId;
  const today = new Date();
  if (today.getHours() < 8) today.setDate(today.getDate() - 1);
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
    phone: '0911',
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

  await page.route('**/api/get-system-state*', async route => {
    const response = await route.fetch();
    let json = {};
    try { json = await response.json(); } catch (e) {}
    if (!json.bookings) json.bookings = [];
    json.bookings.push(mockBooking);
    await route.fulfill({ response, json });
  });

  await page.goto('http://localhost:5001/admin2/index.html');
  await page.waitForTimeout(3000);
  
  const CWD = 'C:/Users/User/.gemini/antigravity/brain/e4baeb8f-1bf8-446b-9b24-055577d1af1a';
  await page.screenshot({ path: `${CWD}/screenshot_test2.png` });
  await browser.close();
})();

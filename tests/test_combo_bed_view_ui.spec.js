const { test, expect } = require('@playwright/test');

test('Test Combo Bed View UI (50/50 layout and flashing)', async ({ page }) => {
  // Mock the /api/info endpoint
  await page.route('**/api/info*', async route => {
    const now = new Date();
    
    // Create a time 1 minute from now for flashing test
    const transitionTimeFlash = new Date(now.getTime() + 1 * 60000);
    const transitionTimeFlashStr = `${transitionTimeFlash.getHours().toString().padStart(2, '0')}:${transitionTimeFlash.getMinutes().toString().padStart(2, '0')}`;
    
    // Create a time 5 minutes from now for non-flashing test
    const transitionTimeNormal = new Date(now.getTime() + 5 * 60000);
    const transitionTimeNormalStr = `${transitionTimeNormal.getHours().toString().padStart(2, '0')}:${transitionTimeNormal.getMinutes().toString().padStart(2, '0')}`;
    
    const startTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        bookings: [
          {
            rowId: 1,
            time: startTimeStr,
            duration: 100,
            status: "服務中", // Running
            serviceCode: "A4", // Combo!
            serviceName: "套餐 (100分)",
            name: "測試客 1",
            staff: "師傅 A",
            phase1_res_idx: "BED-1",
            transition_time: transitionTimeFlashStr // Flashing!
          },
          {
            rowId: 2,
            time: startTimeStr,
            duration: 100,
            status: "服務中", // Running
            serviceCode: "A3", // Combo!
            serviceName: "套餐 (100分)",
            name: "測試客 2",
            staff: "師傅 B",
            phase1_res_idx: "BED-2",
            transition_time: transitionTimeNormalStr // Not flashing
          }
        ]
      })
    });
  });

  // Load the app
  await page.goto('http://localhost:5001/bed_view/index.html');
  
  // Login
  await page.fill('input[type="password"]', '888888');
  await page.click('button[type="submit"]');

  // Setup Screen
  await page.selectOption('select:nth-of-type(1)', '本館');
  const selects = await page.$$('select');
  await selects[1].selectOption('床1-1'); // BED-1
  await selects[2].selectOption('床1-2'); // BED-2
  await page.click('button');

  // Wait for panels to render
  await expect(page.locator('body')).toContainText('測試客 1', { timeout: 10000 });
  await expect(page.locator('body')).toContainText('測試客 2', { timeout: 10000 });

  // Check 50/50 layout exists and big text
  const transitionTimeLabels = await page.locator('text=轉場時間').all();
  expect(transitionTimeLabels.length).toBe(2);
  
  const remainingTimeLabels = await page.locator('text=剩下時間').all();
  expect(remainingTimeLabels.length).toBe(2);

  // Check Flashing effect (within 2 minutes) on BED-1
  const bed1TransitionDiv = page.locator('text=轉場時間').nth(0).locator('..');
  const bed1Class = await bed1TransitionDiv.getAttribute('class');
  expect(bed1Class).toContain('animate-pulse');
  expect(bed1Class).toContain('bg-red-900');

  // Check Non-Flashing effect (5 minutes away) on BED-2
  const bed2TransitionDiv = page.locator('text=轉場時間').nth(1).locator('..');
  const bed2Class = await bed2TransitionDiv.getAttribute('class');
  expect(bed2Class).not.toContain('animate-pulse');
  
  console.log("Combo Bed View UI Test Passed!");
});

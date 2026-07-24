const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:5001' });

test('Combo booking running phases have border-slate-900', async ({ page }) => {
  // 1. Mock API call to provide a mock running combo booking data
  await page.route('**/api/info*', async (route) => {
    const json = {
      bookings: [
        {
          rowId: "test-combo-running-bug",
          date: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
          startTimeString: `${new Date().toISOString().split('T')[0].replace(/-/g, '/')} 12:00:00`,
          startTime: "12:00",
          originalName: "Test Combo Bug",
          customerName: "Test Combo Bug",
          serviceName: "Fake Service 套餐", // Has 套餐 to make it a combo
          cleanServiceName: "Fake Service",
          serviceCode: "A3",
          duration: "130",
          phase1_duration: "70",
          phase2_duration: "60",
          status: "服務中", // This makes it isStatusRunning true
          pax: 1,
          location: "CHAIR-1-1",
          phase1_res_idx: "CHAIR-1-1",
          phase2_res_idx: "BED-1-1",
          isRunningStatus: true
        }
      ],
      staffList: [
        { name: "Test Staff", id: "Test Staff" }
      ],
      resourceState: {
        "CHAIR-1-1": {
          booking: { rowId: "test-combo-running-bug" },
          isRunning: true,
          comboMeta: { phase: 1, sequence: "FB" }
        }
      },
      staffStatus: {}
    };
    await route.fulfill({ json });
  });

  // Navigate to the staff portal
  await page.goto('/admin2/index.html');
  
  // Wait for timeline blocks to render
  await page.waitForTimeout(2000);
  
  // Verify BOTH phases have border-slate-900
  // Find both blocks for 'Test Combo Bug'
  const blocks = await page.locator('.absolute', { hasText: 'Test Combo Bug' }).all();
  // There should be 2 blocks for a combo booking
  expect(blocks.length).toBeGreaterThanOrEqual(2);
  
  for (const block of blocks) {
    const classAttr = await block.getAttribute('class');
    // After our fix, ALL phases of the combo should have border-slate-900 when running
    expect(classAttr).toContain('border-slate-900');
  }
});

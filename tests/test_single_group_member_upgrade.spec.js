const { test, expect } = require('@playwright/test');

test.describe('Single Group Member Upgrade Fix Test', () => {
  test('should not show capacity conflict when modifying one member of a group', async ({ page }) => {
    // 1. Mock APIs
    await page.route('**/api/check-auth*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, role: 'ADMIN', username: 'admin', store: 'MAIN' }),
      });
    });

    await page.route('**/api/public-settings*', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

    await page.route('**/api/get-system-config*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                SCALE: { MAX_BEDS: 10, MAX_CHAIRS: 10 },
                BUFFERS: { TRANSITION_MINUTES: 5 }
            })
        });
    });

    const today = new Date();
    const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

    let mockBookings = Array.from({length: 4}).map((_, i) => ({
        rowId: (100 + i).toString(),
        customerName: `紀小姐 (${i+1}/4)`,
        phone: "9563563",
        serviceName: "腳底按摩 (90分)",
        duration: "90",
        category: "FOOT",
        flow: "F",
        phase1_duration: "90",
        phase2_duration: "0",
        status: "IN_SERVICE",
        date: todayStr,
        startTimeString: `${todayStr} 14:10`,
        start_time_str: "14:10",
        phase1_res_idx: `CHAIR-1-${i+1}`,
        current_resource_id: `CHAIR-1-${i+1}`,
        location: "本館"
    }));

    await page.route('**/api/info*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          bookings: mockBookings,
          staffList: [{ id: '356', name: '隨機', active: true }],
          schedule: {},
          resourceState: {},
          staffStatus: {},
          services: { 
            "腳底按摩 (90分)": { duration: 90, type: "FOOT", flow: "F", name: "腳底按摩 (90分)" },
            "身體按摩 (90分)": { duration: 90, type: "BODY", flow: "B", name: "身體按摩 (90分)" } 
          },
          lastUpdated: new Date().toISOString(),
          isSystemHealthy: true,
          matrixDebug: [],
          blacklist: [],
          masterBlacklist: [],
          quickNotes: [],
          resources: { chairs: 6, beds: 6, oppChairs: 4, oppBeds: 6 }
        })
      });
    });

    await page.goto('/admin2/');    
    // Wait a bit to ensure rendering
    await page.waitForTimeout(1000);
    
    // Wait for the booking block for the 2nd person (rendered as 紀(2/4))
    const bookingBlock = page.locator('.timeline-block', { hasText: '紀(2/4)' }).first();
    await expect(bookingBlock).toBeVisible();
    await bookingBlock.click();

    // The modal is open. Select the new service.
    // The select box for service is typically the one with the current service name
    const serviceSelect = page.locator('select').filter({ hasText: '腳底按摩 (90分)' }).first();
    await serviceSelect.selectOption({ label: '身體按摩 (90分)' });
    
    // Now click 查詢
    const searchBtn = page.locator('button', { hasText: '查詢' });
    await expect(searchBtn).toBeVisible();
    await searchBtn.click();

    // Wait for the group prompt to appear (同行群組修改)
    const singleEditBtn = page.locator('button', { hasText: '僅修改此人' });
    await expect(singleEditBtn).toBeVisible({ timeout: 5000 });
    await singleEditBtn.click();
    
    // Ensure "該時段已客滿，無法儲存" does NOT appear.
    const errorMessage = page.locator('text=該時段已客滿，無法儲存');
    await expect(errorMessage).not.toBeVisible({ timeout: 2000 });
    
    // We expect a success state or at least no failure message.
    console.log("Test Passed: Capacity check passed successfully for a single group member without self-conflict.");
  });
});

const { test, expect } = require('@playwright/test');
const express = require('express');
const path = require('path');

test.describe('Bed View - Phase 1/Phase 2 Sync Test', () => {
  let server;
  let port = 5005;

  test.beforeAll(async () => {
    const app = express();
    app.use(express.static(path.join(__dirname, '../public')));
    
    await new Promise((resolve) => {
      server = app.listen(port, () => resolve());
    });
  });

  test.afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  test('Khách hàng Combo không bị hiển thị cùng lúc trên cả 2 thiết bị (BED-1-3 và CHAIR-1-4) ở Phase 1', async ({ page }) => {
    await page.route('**/api/info', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          bookings: [
            {
              rowId: 'row_123',
              phase1_res_idx: 'BED-1-3',
              phase2_res_idx: 'CHAIR-1-4',
              allocated_resource: 'BED-1-3+CHAIR-1-4',
              customerName: '管小姐 1/4 (Test)',
              serviceName: 'Combo Massage',
              staffName: 'Thợ 01',
              status: '🟡服務中',
              booking_time: '16:00',
              transition_time: '18:51',
              duration: 100
            }
          ]
        })
      });
    });

    await page.route('**/api/update-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: true })
      });
    });

    // Login
    await page.goto(`http://localhost:${port}/bed_view/index.html`);
    await page.fill('input[type="password"]', '888888');
    await page.click('button[type="submit"]');
    
    await page.waitForSelector('select', { timeout: 5000 });
    
    // Evaluate to select both BED-1-3 and CHAIR-1-4
    await page.evaluate(() => {
      const select = document.querySelector('select');
      const options = Array.from(select.options);
      options.forEach(opt => {
        if (opt.text.includes('床1-3') || opt.text.includes('腳1-4')) {
          opt.selected = true;
        }
      });
      // trigger change event
      select.dispatchEvent(new Event('change'));
    });
    
    await page.click('button'); // Click OK to go to main screen

    await page.waitForSelector('.fa-bed, .fa-chair', { timeout: 5000 });
    
    // Now check BED-1-3 (Phase 1)
    const bedBox = page.locator('div:has-text("床1-3")').first().locator('..');
    const bedText = await bedBox.innerText();
    expect(bedText).toContain('管小姐 1/4 (Test)');

    // Check CHAIR-1-4 (Phase 2 - Should NOT show customer running yet!)
    const chairBox = page.locator('div:has-text("腳1-4")').first().locator('..');
    const chairText = await chairBox.innerText();
    expect(chairText).not.toContain('管小姐 1/4 (Test)');
  });
});

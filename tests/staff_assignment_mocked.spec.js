const { test, expect } = require('@playwright/test');

test.describe('Booking Drag and Drop End-to-End Test', () => {
  test('Assigning staff before starting should not set staff to BUSY', async ({ page }) => {
    // 1. Mock auth
    await page.route('**/api/check-auth', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, role: 'ADMIN', username: 'cyx_admin', store: 'MAIN' }),
      });
    });

    await page.route('**/api/public-settings', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.route('**/api/get-system-config', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ SCALE: { MAX_BEDS: 2, MAX_CHAIRS: 0 }, BUFFERS: { TRANSITION_MINUTES: 5 } })
        });
    });
    
    // Mock get-staff
    await page.route('**/api/get-staff', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'T1', name: '師傅1', categories: ['FOOT', 'BODY'], enabled: true }
        ])
      });
    });

    let mockBookings = [
      {
        rowId: "1",
        customerName: "Test Single Booking",
        serviceName: "腳底按摩 (90分)",
        duration: "90",
        category: "FOOT",
        bookingStatus: "WAITING", // NOT started
        guests: 1,
        source: "LINE"
      }
    ];

    await page.route('**/api/get-unassigned-bookings', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockBookings) });
    });

    await page.route('**/api/get-resource-state', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });
    
    await page.route('**/api/get-staff-status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        'T1': { status: 'READY', stafftime: Date.now() }
      }) });
    });
    
    // Intercept sync-staff-status
    let syncCalled = false;
    let syncPayload = null;
    await page.route('**/api/sync-staff-status', async (route) => {
      syncCalled = true;
      syncPayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.route('**/api/update-booking-details', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    // 2. Go to app
    await page.goto('http://localhost:5001/admin2/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
    
    // Wait for booking to appear
    const bookingLocator = page.locator('.booking-block').first();
    await expect(bookingLocator).toBeVisible({ timeout: 15000 });

    // Drag to bed
    const bed = page.locator('.resource-row').filter({ hasText: '腳1-1' }).locator('.time-slot').nth(48);
    await bookingLocator.dragTo(bed, { force: true, targetPosition: { x: 5, y: 5 } });
    await page.waitForTimeout(1000);

    // Open control center
    const droppedBooking = page.locator('.appointment-block').first();
    await expect(droppedBooking).toBeVisible({ timeout: 5000 });
    await droppedBooking.click();

    // Assign staff
    const staffSelect = page.locator('select').filter({ hasText: '隨機' }).first();
    await expect(staffSelect).toBeVisible({ timeout: 5000 });
    
    // Reset flags
    syncCalled = false;
    syncPayload = null;
    
    await staffSelect.selectOption({ label: '師傅1' });
    await page.waitForTimeout(1000);

    // Assert that sync-staff-status was NOT called with BUSY
    if (syncCalled && syncPayload) {
      const isWorking = Object.values(syncPayload).some(staff => staff.status === 'BUSY' || staff.status === 'BUSY_SHORT');
      expect(isWorking).toBe(false);
    }
  });
});

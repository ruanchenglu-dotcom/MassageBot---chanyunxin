const { test, expect } = require('@playwright/test');

test.describe('Booking Drag and Drop End-to-End Test', () => {
  test('should allow dragging single booking between beds and correctly update phase1_res_idx as Single Source of Truth', async ({ page }) => {
    // 1. Intercept network requests to mock backend responses
    await page.route('/api/check-auth', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          role: 'ADMIN',
          username: 'cyx_admin',
          store: 'MAIN'
        }),
      });
    });

    await page.route('/api/public-settings', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.route('/api/get-system-config', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                SCALE: { MAX_BEDS: 2, MAX_CHAIRS: 0 },
                BUFFERS: { TRANSITION_MINUTES: 5 }
            })
        });
    });

    let mockBookings = [
      {
        rowId: "1",
        customerName: "Test Single Booking",
        serviceName: "90",
        duration: "90",
        category: "SINGLE",
        status: "WAITING",
        date: "2026/07/16",
        startTimeString: "2026/07/16 10:00",
        // Initially on BED-1-1 (using phase1_res_idx as Single Source of Truth for Single bookings)
        phase1_res_idx: "BED-1-1",
        current_resource_id: "",
        location: ""
      }
    ];

    await page.route('/api/get-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ bookings: mockBookings })
      });
    });

    let updateRequestReceived = null;
    await page.route('/api/update-booking-details', async (route) => {
      updateRequestReceived = route.request().postDataJSON();
      // Update our mock state
      mockBookings[0].phase1_res_idx = updateRequestReceived.phase1_res_idx;
      mockBookings[0].current_resource_id = updateRequestReceived.current_resource_id;
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: "OK" })
      });
    });

    // 2. Navigate to the app (using a mocked index.html)
    await page.goto('http://localhost:5001/XinWuChanAdmin/');
    // Wait for the booking block to appear
    const bookingBlock = page.locator('.booking-block', { hasText: 'Test Single Booking' });
    await expect(bookingBlock).toBeVisible({ timeout: 10000 });

    // Ensure it's in BED-1-1
    const bed1Row = page.locator('[data-row-id="BED-1-1"]');
    const bed2Row = page.locator('[data-row-id="BED-1-2"]'); // We will drag to here
    
    // We need to simulate drag and drop
    // In React dnd, this can be tricky, so we use playwright's dragTo
    await bookingBlock.dragTo(bed2Row);

    // Wait for the API to be called
    await page.waitForTimeout(1000); // Wait for async Swal and state updates

    // 3. Verify the API request payload contains the correct "Single Source of Truth" updates
    expect(updateRequestReceived).not.toBeNull();
    expect(updateRequestReceived.rowId).toBe("1");
    // Assert that the new single source of truth architectural logic works:
    expect(updateRequestReceived.phase1_res_idx).toBe("BED-1-2");
    expect(updateRequestReceived.current_resource_id).toBe("BED-1-2"); // Still kept for backward compat
    // Assert that combo garbage is cleared
    expect(updateRequestReceived.phase2_res_idx).toBe("");
    expect(updateRequestReceived.flow).toBe("");
  });
});

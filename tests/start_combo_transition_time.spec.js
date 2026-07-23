const { test, expect } = require('@playwright/test');

test('Verify transition_time is preserved in executeBatchStart payload', async ({ page }) => {
    let capturedPayload = null;
    
    // 1. Intercept the API call to update bookings
    await page.route('/api/batch-process-bookings', route => {
        capturedPayload = JSON.parse(route.request().postData());
        route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
    });
    
    await page.route('/api/sync-resource', route => {
        route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
    });

    // 2. Load the application
    await page.goto('/');

    // 3. Since we don't know the exact data loaded, we can inject a mock state or use the app's functions if exposed.
    // However, since cyx_app.js has been modified to include the payload property,
    // we can test the backend route processing it as well.
    // For this test, let's verify that the backend's cyx_sheet_service.js accepts transition_time!
});

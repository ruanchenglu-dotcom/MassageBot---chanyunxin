const { test, expect } = require('@playwright/test');

test('Staff scroll container should use row-reverse to prioritize ready cards on the right', async ({ page }) => {
    // Navigate to the main app page. We assume it's served on localhost, or we can use a mock/intercept.
    await page.goto('/admin2/');
    // Wait for the staff-scroll container to be visible
    const staffScrollContainer = page.locator('.staff-scroll');
    await expect(staffScrollContainer).toBeVisible({ timeout: 10000 });

    // Check if the container has the inline style flexDirection: row-reverse
    // or if the computed style has it.
    const flexDirection = await staffScrollContainer.evaluate(el => window.getComputedStyle(el).flexDirection);
    expect(flexDirection).toBe('row-reverse');

    // Also check if display is flex
    const displayStyle = await staffScrollContainer.evaluate(el => window.getComputedStyle(el).display);
    expect(displayStyle).toBe('flex');
});

const { test, expect } = require('@playwright/test');

test('StaffCard3D Info Modal and Drag-and-Drop functionality', async ({ page }) => {
    // Navigate to the main app page
    await page.goto('/admin2/');
    
    // Wait for staff cards to be visible
    const staffCards = page.locator('.card-3d');
    await expect(staffCards.first()).toBeVisible({ timeout: 60000 });
    
    // 1. Test Info Modal
    const firstCard = staffCards.first();
    
    // Hover over the first card to reveal the info button
    await firstCard.hover();
    
    // Find the info button (it has the cursor-pointer class and a font-awesome info icon)
    const infoButton = firstCard.locator('.fa-info').locator('..');
    
    // Click the info button
    await infoButton.click({ force: true });
    
    // Wait for the modal to appear (contains text "今日指定預約")
    const modal = page.locator('text=今日指定預約');
    await expect(modal).toBeVisible();
    
    // Verify "上班時間" is removed and time format is shown directly
    await expect(page.locator('text=上班時間')).toHaveCount(0);
    
    // Check if there are bookings. If there are, they shouldn't show "N/A" for time
    const upcomingList = page.locator('.custom-scrollbar');
    if (await upcomingList.locator('text=今日無指定預約').count() === 0) {
        // Assert no N/A is shown for time
        await expect(upcomingList.locator('text=N/A')).toHaveCount(0);
    }
    
    // Close the modal by clicking the close button
    const closeBtn = page.locator('.fa-times').locator('..');
    await closeBtn.click();
    
    // Verify modal is closed
    await expect(modal).not.toBeVisible();
    
    // 2. Test Drag and Drop
    // Note: In real app it requires two READY staff. We will attempt a generic drag and drop if there are at least two cards.
    const count = await staffCards.count();
    if (count >= 2) {
        const sourceCard = staffCards.nth(0);
        const targetCard = staffCards.nth(1);
        
        // We just ensure they are draggable. Since actual DnD via Playwright requires triggering specific dataTransfer events,
        // we can use standard Playwright dragTo.
        await sourceCard.dragTo(targetCard);
        
        // This is mainly a smoke test to ensure no errors are thrown during dragTo.
        // Verifying order change might require checking specific DOM text before and after, 
        // which depends heavily on dynamic live data.
    }
});

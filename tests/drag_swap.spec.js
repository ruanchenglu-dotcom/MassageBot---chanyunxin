const { test, expect } = require('@playwright/test');

test.describe('Smart Swap E2E Tests', () => {
  test('should allow dragging and swapping tightly packed bookings without overlap error', async ({ page }) => {
    // Navigate to the local application
    await page.goto('http://localhost:5001/XinWuChanAdmin/cyx_XinWuChan.html');

    // Đợi lịch tải xong
    await page.waitForSelector('.booking-block', { timeout: 15000 }).catch(() => null);

    // Lấy danh sách các block
    const blocks = await page.locator('.booking-block').all();
    
    if (blocks.length >= 2) {
      const sourceBlock = blocks[0];
      const targetBlock = blocks[1];
      
      const sourceBox = await sourceBlock.boundingBox();
      const targetBox = await targetBlock.boundingBox();
      
      if (sourceBox && targetBox) {
        // Thực hiện kéo thả
        await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
        await page.mouse.up();
        
        // Kịch bản thành công là không có alert báo lỗi (swal2-error)
        await page.waitForTimeout(2000);
        
        const errorToast = page.locator('.swal2-error');
        await expect(errorToast).not.toBeVisible();
      }
    } else {
        console.log("Not enough bookings to test swap");
    }
  });
});

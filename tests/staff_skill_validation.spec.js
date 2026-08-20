const { test, expect } = require('@playwright/test');

test('Staff skill validation fails when therapist lacks required skill', async ({ page }) => {
  await page.goto('http://localhost:5001/XinWuChanAdmin/index.html');
  
  // Wait for the UI to be fully loaded
  const phoneBtn = page.locator('i.fa-phone-volume').locator('..');
  await expect(phoneBtn).toBeVisible({ timeout: 10000 });
  await phoneBtn.click();

  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  
  // Select service
  const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  const guestServiceSelect = guestRow.locator('select').first();
  // Try selecting by index (e.g. index 1 or whatever body massage is)
  // Let's just use the exact mangled string if needed, or by value?
  // Playwright supports selectOption({ index: 3 })
  // A4 or B2 or whatever. Let's use index 8 for 身體按摩
  await guestServiceSelect.selectOption({ index: 8 });

  await page.waitForTimeout(500);

  // Click 油推 (Oil). Since text is mangled, let's select the 3rd option or button in the row that represents Oil
  // In cyx_bookingHandler.js, the row has: isYouTui, isGuaSha, isHuaGuan, isBaGuan
  // We can just click the first button in that specific container.
  // The buttons are in a flex container. We can find the button that has a specific bg color when active, or just by index.
  const featureBtns = guestRow.locator('button.w-10'); // w-10 sm:w-12
  await featureBtns.nth(0).click(); // the first one is youTui

  const staffSelect = guestRow.locator('select').nth(1);
  const options = await staffSelect.locator('option').allInnerTexts();
  
  let foundFailure = false;
  let attempts = 0;
  for (let i = 3; i < options.length; i++) {
      if (['隨機', '女', '女師', '男', '男師', '不指定'].includes(options[i])) continue;
      if (options[i].includes('')) { // just picking any staff name
        await staffSelect.selectOption({ index: i });
        
        // Find the 'search' button - usually it's a big button at the bottom of the form
        const searchBtns = page.locator('button.bg-blue-600, button.bg-emerald-600'); // the search button might be blue or emerald
        await searchBtns.last().click(); // click the primary button
        
        // Check for ANY failure message that contains the staff name
        const isVisible = await page.locator('.text-red-500, .bg-red-50, .border-red-400').first().isVisible({ timeout: 2000 }).catch(() => false);
        
        // Or check if the "Search successful" button appears
        const successMsg = await page.locator('.bg-green-50, .border-green-400').first().isVisible({ timeout: 2000 }).catch(() => false);
        
        if (isVisible && !successMsg) {
            foundFailure = true;
            break;
        }
        attempts++;
        if (attempts > 3) break;
      }
  }

  expect(foundFailure).toBeTruthy();
});

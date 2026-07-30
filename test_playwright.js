const { chromium } = require('playwright');

(async () => {
  console.log('Starting Playwright test...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to admin
    await page.goto('http://localhost:5001/admin2', { waitUntil: 'networkidle' });
    
    // Wait for staff list to load
    await page.waitForSelector('.card-3d', { timeout: 10000 });
    
    // Click on the first staff card's info button or just the staff card to open StaffInfoModal
    const infoBtn = await page.locator('.fa-info').first();
    await infoBtn.click({ force: true });
    
    // Wait for StaffInfoModal
    await page.waitForSelector('text=快速操作', { timeout: 5000 });
    console.log('StaffInfoModal opened successfully.');
    
    // Make sure the staff is checked in, if not, click '打卡' first so they are working
    const checkInBtn = page.locator('button:has-text("打卡")').first();
    if (await checkInBtn.isVisible()) {
        await checkInBtn.click();
        await page.waitForTimeout(1000);
    }

    // Click Early Leave "早退"
    const earlyLeaveBtn = page.locator('button:has-text("早退")').first();
    await earlyLeaveBtn.click();
    
    // Wait for AbsenceCheckModal
    await page.waitForSelector('text=早退登記', { timeout: 5000 });
    console.log('AbsenceCheckModal opened successfully.');
    
    // Click "檢查空檔"
    const checkBtn = page.locator('button:has-text("檢查空檔")').first();
    await checkBtn.click();
    
    // Verify that the modal did NOT close, and we see "確認並更新時間"
    await page.waitForSelector('button:has-text("確認並更新時間")', { timeout: 5000 });
    console.log('✅ AbsenceCheckModal did not close, Check button worked!');
    
    // Click "確認並更新時間"
    const confirmBtn = page.locator('button:has-text("確認並更新時間")').first();
    await confirmBtn.click();
    
    // After confirmation, the modal should close
    await page.waitForSelector('text=早退登記', { state: 'hidden', timeout: 5000 });
    console.log('✅ AbsenceCheckModal closed after confirmation!');
    
    // Check if the '打卡' (Check In) button appears, meaning the staff is now AWAY
    await page.waitForSelector('button:has-text("打卡")', { timeout: 5000 });
    console.log('✅ Staff status successfully updated to AWAY after early leave!');
    
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY');
    
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

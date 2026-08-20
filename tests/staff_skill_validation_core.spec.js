const { test, expect } = require('@playwright/test');

test('E2E Staff skill validation fails when therapist lacks required skill', async ({ page }) => {
  await page.goto('http://localhost:5001/admin2/index.html');
  await page.waitForTimeout(3000);
  
  const phoneBtn = page.locator('i.fa-phone-volume').locator('..');
  await expect(phoneBtn).toBeVisible({ timeout: 10000 });
  await phoneBtn.click();

  const hourSelect = page.locator('select').first();
  await expect(hourSelect).toBeVisible();
  
  // Choose B2 Service
  const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  const guestServiceSelect = guestRow.locator('select').first();
  await guestServiceSelect.selectOption({ index: 8 }); // B2 or similar body massage
  await page.waitForTimeout(500);

  // Click the youTui button (it's the first button in the skills row)
  // There are 4 skill buttons.
  const skillBtns = guestRow.locator('button.w-10');
  await skillBtns.nth(0).click();

  // Select staff
  const staffSelect = guestRow.locator('select').nth(1);
  await staffSelect.selectOption({ index: 3 }); // Usually "Staff 1" or whoever

  // Click check button
  // "onClick={performCheck}" is a button. We can find it by finding the button right before the reset button.
  // Or just by color. It's usually bg-emerald-600 or blue.
  // We can just click the button with onClick={performCheck} -> we don't have the text exactly because of encoding.
  // Let's use page.getByRole('button', { name: /查詢空位/ }) and catch if it fails, fallback to nth
  try {
    const searchBtn = page.getByRole('button', { name: /查詢空位|詢空/ });
    await searchBtn.first().click({ timeout: 2000 });
  } catch (e) {
    const btns = page.locator('button');
    const count = await btns.count();
    // Usually the performCheck button is around index 10-20
    for(let i=0; i<count; i++) {
        const text = await btns.nth(i).innerText();
        if(text.includes('查詢空位') || text.includes('詢空')) {
            await btns.nth(i).click();
            break;
        }
    }
  }
  
  await page.waitForTimeout(1000);

  // We should see a failure message containing "不會油推"
  const bodyText = await page.innerText('body');
  expect(bodyText).toContain('不會油推');
});

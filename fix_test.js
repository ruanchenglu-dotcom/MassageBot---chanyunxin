const fs = require('fs');
let code = fs.readFileSync('tests/test_realtime_start_combo.spec.js', 'utf8');
const searchStr = \  await page.route('**/api/update-booking-details', async route => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON();
      if (data && data.customerName === testName) {
        interceptedPayload = data;
      }
    }
    await route.continue();
  });\;
code = code.replace(searchStr, '');
fs.writeFileSync('tests/test_realtime_start_combo.spec.js', code.trim() + '\n', 'utf8');

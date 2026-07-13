# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: modal-reset-bug.spec.js >> Kiểm tra lỗi Modal nhảy vị trí ghế/giường (Case-sensitive Bug) >> Dropdown trong Modal phải giữ nguyên vị trí cũ (không bị auto reset) khi mở lên
- Location: tests\modal-reset-bug.spec.js:5:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
Call log:
  - navigating to "http://localhost:3000/", waiting until "load"

```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test.describe('Kiểm tra lỗi Modal nhảy vị trí ghế/giường (Case-sensitive Bug)', () => {
  4  | 
  5  |   test('Dropdown trong Modal phải giữ nguyên vị trí cũ (không bị auto reset) khi mở lên', async ({ page }) => {
  6  |     // Truy cập hệ thống (giả sử server đang chạy local)
> 7  |     await page.goto('http://localhost:3000'); // Thay đổi port nếu cần
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
  8  | 
  9  |     // Đợi UI tải xong
  10 |     await page.waitForTimeout(2000);
  11 |     
  12 |     // Tìm một khối (booking) dạng Combo trên Timeline (nếu có)
  13 |     const blocks = await page.locator('.booking-block-combo');
  14 |     
  15 |     if (await blocks.count() > 0) {
  16 |       // Click vào khối đầu tiên để mở Modal
  17 |       await blocks.first().click();
  18 |       
  19 |       // Đợi modal xuất hiện
  20 |       await page.waitForSelector('.fixed.inset-0.bg-black', { state: 'visible' });
  21 |       
  22 |       // Lấy thẻ select của Phase 1 và Phase 2
  23 |       const phase1Select = page.locator('select').nth(0); // Giả sử thẻ select đầu tiên là Phase 1
  24 |       const phase2Select = page.locator('select').nth(1); // Thẻ select thứ 2 là Phase 2
  25 |       
  26 |       // Lấy giá trị đang được chọn (value) của thẻ select
  27 |       const p1Value = await phase1Select.inputValue();
  28 |       const p2Value = await phase2Select.inputValue();
  29 |       
  30 |       console.log(`Phase 1 Value: ${p1Value}, Phase 2 Value: ${p2Value}`);
  31 |       
  32 |       // Kiểm tra: Giá trị không được là 'auto' trừ khi đó là booking chưa xếp chỗ
  33 |       // Quan trọng nhất: Value phải viết HOA (ví dụ: BED-1-1, CHAIR-1-4)
  34 |       if (p1Value !== 'auto') {
  35 |         expect(p1Value).toMatch(/^[A-Z]+-\d+-\d+$/); // Phải là chữ hoa như BED-1-1
  36 |       }
  37 |       
  38 |       if (p2Value !== 'auto') {
  39 |         expect(p2Value).toMatch(/^[A-Z]+-\d+-\d+$/); // Phải là chữ hoa như CHAIR-1-1
  40 |       }
  41 |       
  42 |       // Đóng modal
  43 |       await page.locator('button:has-text("取消")').click();
  44 |     } else {
  45 |       console.log('Không có booking Combo nào hiện tại, test tự động bỏ qua.');
  46 |       test.skip();
  47 |     }
  48 |   });
  49 | 
  50 | });
  51 | 
```
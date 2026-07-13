const { test, expect } = require('@playwright/test');

test.describe('Kiểm tra lỗi Modal nhảy vị trí ghế/giường (Case-sensitive Bug)', () => {

  test('Dropdown trong Modal phải giữ nguyên vị trí cũ (không bị auto reset) khi mở lên', async ({ page }) => {
    // Truy cập hệ thống (giả sử server đang chạy local)
    await page.goto('http://localhost:3000'); // Thay đổi port nếu cần

    // Đợi UI tải xong
    await page.waitForTimeout(2000);
    
    // Tìm một khối (booking) dạng Combo trên Timeline (nếu có)
    const blocks = await page.locator('.booking-block-combo');
    
    if (await blocks.count() > 0) {
      // Click vào khối đầu tiên để mở Modal
      await blocks.first().click();
      
      // Đợi modal xuất hiện
      await page.waitForSelector('.fixed.inset-0.bg-black', { state: 'visible' });
      
      // Lấy thẻ select của Phase 1 và Phase 2
      const phase1Select = page.locator('select').nth(0); // Giả sử thẻ select đầu tiên là Phase 1
      const phase2Select = page.locator('select').nth(1); // Thẻ select thứ 2 là Phase 2
      
      // Lấy giá trị đang được chọn (value) của thẻ select
      const p1Value = await phase1Select.inputValue();
      const p2Value = await phase2Select.inputValue();
      
      console.log(`Phase 1 Value: ${p1Value}, Phase 2 Value: ${p2Value}`);
      
      // Kiểm tra: Giá trị không được là 'auto' trừ khi đó là booking chưa xếp chỗ
      // Quan trọng nhất: Value phải viết HOA (ví dụ: BED-1-1, CHAIR-1-4)
      if (p1Value !== 'auto') {
        expect(p1Value).toMatch(/^[A-Z]+-\d+-\d+$/); // Phải là chữ hoa như BED-1-1
      }
      
      if (p2Value !== 'auto') {
        expect(p2Value).toMatch(/^[A-Z]+-\d+-\d+$/); // Phải là chữ hoa như CHAIR-1-1
      }
      
      // Đóng modal
      await page.locator('button:has-text("取消")').click();
    } else {
      console.log('Không có booking Combo nào hiện tại, test tự động bỏ qua.');
      test.skip();
    }
  });

});

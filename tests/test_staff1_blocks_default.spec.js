const { test, expect } = require('@playwright/test');

test.describe('E2E Test: Tự động ghi số block vào cột P (staff1_blocks)', () => {
    test('Nên tự động lấy blocks từ SERVICES_DATA khi không truyền staff1_blocks', async ({ request }) => {
        const uniquePhone = '999' + Date.now().toString().slice(-6);
        
        // 1. Tạo request đặt lịch không kèm staff1_blocks
        const bookingPayload = {
            ngayDen: '2026/07/29',
            gioDen: '15:00',
            dichVu: '套餐 (100分)',
            serviceCode: 'A3', // Theo cấu hình A3 có 3 blocks
            sdt: uniquePhone,
            hoTen: 'Test Khách Hàng',
            pax: 1,
            location: '本館'
        };

        console.log("Sending booking payload:", bookingPayload);

        const createRes = await request.post('http://127.0.0.1:5001/api/admin-booking', {
            data: bookingPayload
        });
        
        const createResult = await createRes.json();
        if (!createRes.ok() || !createResult.success) {
            console.error("CREATE FAILED:", createResult);
        }
        expect(createRes.ok()).toBeTruthy();
        expect(createResult.success).toBeTruthy();
        
        // Wait 2 seconds for Google Sheets to sync
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 2. Lấy lại dữ liệu booking từ /api/info để kiểm tra
        const infoRes = await request.get('http://127.0.0.1:5001/api/info');
        expect(infoRes.ok()).toBeTruthy();
        
        const infoData = await infoRes.json();
        const bookings = infoData.bookings || [];
        
        // 3. Tìm booking vừa tạo
        const myBooking = bookings.find(b => String(b.phone) === String(uniquePhone));
        if(!myBooking) {
            console.log("NOT FOUND! Last booking in array:", bookings[bookings.length - 1]);
        } else {
            console.log("FOUND booking:", myBooking);
        }
        expect(myBooking).toBeDefined();
        
        // 4. Kiểm tra staff1_blocks (cột P)
        console.log("Tìm thấy Booking, staff1_blocks (Cột P):", myBooking.staff1_blocks);
        expect(String(myBooking.staff1_blocks)).toBe("3"); // A3 -> 3 blocks
    });
});

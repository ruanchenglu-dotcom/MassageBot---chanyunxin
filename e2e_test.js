const axios = require('axios');

async function runTest() {
    console.log('Bắt đầu chạy API End-to-End Test cho tính năng Gợi ý Dịch vụ...');
    console.log('Gửi yêu cầu đặt lịch giả lập đến localhost:5001/api/admin-booking (50 khách để gây lỗi full chỗ)');

    try {
        const response = await axios.post('http://localhost:5001/api/admin-booking', {
            location: "本館",
            date: "2026-10-10",
            gioDen: "14:00",
            serviceCode: "F60",
            dichVu: "60分鐘腳底按摩",
            pax: 12,
            guestDetails: Array(12).fill(0).map((_, i) => ({
                guestIndex: i + 1,
                service: "60分鐘腳底按摩", 
                serviceCode: "F60"
            })),
            checkBookings: []
        });
        
        console.log('Phản hồi:', response.data);
    } catch (error) {
        if (error.response && error.response.status === 400) {
            const data = error.response.data;
            console.log('Nhận được lỗi 400 từ máy chủ (Hệ thống giả lập đầy chỗ).');
            console.log('Chi tiết lỗi:', data.error);
            
            // Validate HTML content
            if (data.error && data.error.includes('💡 推薦同時段可預約的其他服務')) {
                console.log('✅ TEST PASSED: Backend đã trả về HTML gợi ý dịch vụ thành công!');
                process.exit(0);
            } else {
                console.error('❌ TEST FAILED: Không tìm thấy HTML gợi ý trong câu thông báo lỗi!');
                process.exit(1);
            }
        } else {
            console.error('❌ TEST FAILED: Gặp lỗi mạng hoặc máy chủ không phản hồi đúng (', error.message, ')');
            process.exit(1);
        }
    }
}

runTest();

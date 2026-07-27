process.env.STAFF_CHANNEL_ACCESS_TOKEN = 'dummy_token';
process.env.STAFF_CHANNEL_SECRET = 'dummy_secret';
process.env.CHANNEL_ACCESS_TOKEN = 'dummy_main_token';
process.env.CHANNEL_SECRET = 'dummy_main_secret';

const StaffBot = require('./cyx_staff_bot');
const SheetService = require('./cyx_sheet_service');
const fs = require('fs');

// Mock SheetService and Line Client for safety
const originalGhiVaoSheet = SheetService.ghiVaoSheet;
SheetService.ghiVaoSheet = async () => true;

const originalGetStaffList = SheetService.getStaffList;
SheetService.getStaffList = () => [
    { id: 'S01', name: '王', lineId: 'U1234567890abcdef' },
    { id: 'S02', name: '陳', lineId: 'U0987654321fedcba' }
];

let pushMessageArgs = null;
const originalPushMessage = StaffBot.client.pushMessage;
StaffBot.client.pushMessage = async (to, messages) => {
    pushMessageArgs = { to, messages };
    return Promise.resolve({});
};

async function runTest() {
    console.log("=== BẮT ĐẦU TEST E2E: THÔNG BÁO LINE CHO THỢ CHỈ ĐỊNH ===");
    
    try {
        const cyxIndexCode = fs.readFileSync('./cyx_index.js', 'utf-8');
        
        const match = cyxIndexCode.match(/async function notifySpecificStaffs\([^)]*\)\s*\{([\s\S]*?)\n\}\s*\n/);
        if (!match) {
            throw new Error("Không tìm thấy hàm notifySpecificStaffs trong cyx_index.js");
        }
        
        // Eval hàm để test
        const notifySpecificStaffs = eval(`(async function notifySpecificStaffs(bookingData) { ${match[1]} \n})`);

        // Test 1: Khách không chỉ định thợ (隨機)
        console.log("\n[Test 1] Đặt lịch không chỉ định (Random):");
        await notifySpecificStaffs({
            nhanVien: '隨機',
            guestDetails: [{ staff: '隨機' }],
            hoTen: 'Khách Test 1',
            ngayDen: '2026-08-01', gioDen: '10:00'
        });
        if (pushMessageArgs === null) {
            console.log("✅ Thành công: Không gửi tin nhắn vì khách không chỉ định thợ.");
        } else {
            console.error("❌ Thất bại: Đã gửi tin nhắn mặc dù khách chọn Random.");
            process.exit(1);
        }

        // Test 2: Khách chỉ định thợ "王"
        console.log("\n[Test 2] Đặt lịch có chỉ định thợ '王':");
        pushMessageArgs = null;
        await notifySpecificStaffs({
            nhanVien: '王',
            guestDetails: [{ staff: '王' }],
            hoTen: 'Khách Test 2',
            ngayDen: '2026-08-02', gioDen: '14:30',
            dichVu: '足底按摩', pax: 1
        });
        
        if (pushMessageArgs && pushMessageArgs.to === 'U1234567890abcdef') {
            console.log("✅ Thành công: Đã xác định đúng LineID của thợ '王'.");
            console.log("Nội dung tin nhắn gửi đi:\n" + pushMessageArgs.messages.text);
            if (pushMessageArgs.messages.text.includes('新的指定預約提醒') && pushMessageArgs.messages.text.includes('Khách Test 2')) {
                console.log("✅ Thành công: Nội dung tin nhắn chính xác, sử dụng tiếng Trung Phồn Thể.");
            } else {
                console.error("❌ Thất bại: Nội dung tin nhắn không đúng chuẩn.");
                process.exit(1);
            }
        } else {
            console.error("❌ Thất bại: Không gửi được tin nhắn cho thợ '王' hoặc sai LineID.");
            process.exit(1);
        }

        console.log("\n🎉 HOÀN THÀNH TẤT CẢ TEST CASES (100% PASSED) 🎉");

    } catch (e) {
        console.error("Lỗi trong quá trình test:", e);
        process.exit(1);
    } finally {
        SheetService.ghiVaoSheet = originalGhiVaoSheet;
        SheetService.getStaffList = originalGetStaffList;
        StaffBot.client.pushMessage = originalPushMessage;
        process.exit(0);
    }
}

runTest();

const fs = require('fs');

// Mock DOM
global.window = {};
global.document = {};
global.console = console;

// Load Booking Handler
const bookingContent = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');
eval(bookingContent);

console.log('✅ Đã load cyxCallCoreAvailabilityCheck:', typeof window.cyxCallCoreAvailabilityCheck);

const todaysBookings = []; // Quán trống
const staffList = [{ id: 'STAFF1', gender: 'F', start: '10:00', end: '22:00' }];

// Kịch bản khách ở 對面館 (quán đối diện)
const guestDetails = [{
    service: '套餐 (100分)',
    serviceName: '套餐 (100分)',
    staff: '隨機',
    overrideDuration: 100,
    flowCode: 'FB',
    location: '對面館'
}];

const dateStr = "2024-10-24";
const timeStr = "14:10";

const result = window.cyxCallCoreAvailabilityCheck(dateStr, timeStr, guestDetails, todaysBookings, staffList);

console.log('\n--- KẾT QUẢ KIỂM THỬ E2E TỰ ĐỘNG ---');
if (result && result.valid) {
    let hasShop2 = false;
    let hasFB = false;
    if (result.proposedUpdates && result.proposedUpdates.length > 0) {
        const update = result.proposedUpdates[0];
        console.log(`- Giường GĐ 1: ${update.phase1_res_idx}`);
        console.log(`- Giường GĐ 2: ${update.phase2_res_idx}`);
        
        if (update.phase1_res_idx && update.phase1_res_idx.includes('-2-')) hasShop2 = true;
        if (update.phase2_res_idx && update.phase2_res_idx.includes('-2-')) hasShop2 = true;
        if (update.phase1_res_idx && update.phase2_res_idx) hasFB = true;
    }
    
    if (hasShop2) {
        console.log('✅ PASS: Khách đã được xếp vào đúng quán ĐỐI DIỆN (-2-)');
    } else {
        console.error('❌ FAIL: Khách bị xếp nhầm sang quán chính (không có -2-)');
        process.exit(1);
    }
    
    if (hasFB) {
        console.log('✅ PASS: Luồng Combo (2 giai đoạn) đã được kích hoạt thành công (FB)');
    } else {
        console.error('❌ FAIL: Chỉ có 1 giai đoạn, hệ thống vẫn nhận là SINGLE');
        process.exit(1);
    }
    console.log('✅ TẤT CẢ TEST ĐỀU PASS!');
} else {
    console.error('❌ FAIL: CoreKernel báo không khả dụng (feasible = false)', result);
    process.exit(1);
}

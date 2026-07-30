const core = require('./cyx_resource_core');

console.log('================================================');
console.log('🧪 RUNNING NODE TEST: Staff "Before Shift" Assignment Check');
console.log('================================================\n');

// Mock data setup
global._bookingData = [];
global._staffData = {
    '張': { name: '張', start: '10:00', end: '22:00', off: false },
    '曹': { name: '曹', start: '08:00', end: '20:00', off: false }
};
let guests = [{
    idx: 1, staffName: '張', // Zhang default 10:00
    services: [{ type: 'FOOT', duration: 40 }]
}];

// This is 09:00 in mins
const date = '2026-07-30';
const time = '09:00';
const isStrictTime = true;

console.log(`Kiểm tra đặt lịch lúc ${time} cho thợ 張 (Zhang)...`);

try {
    const result = core.checkRequestAvailability(date, time, guests, [], global._staffData, { isStrictTime: true });
    
    console.log('--- Kết quả hiển thị ---');
    console.log(JSON.stringify(result, null, 2));

    if (result && result.feasible === false && result.reason && result.reason.includes('還沒來上班')) {
        console.log('✅ TEST PASSED: Hệ thống đã phản hồi đúng "[Tên]老師[Giờ]還沒來上班".');
    } else {
        console.error('❌ TEST FAILED: Không tìm thấy thông báo "還沒來上班".');
        process.exit(1);
    }
} catch(e) {
    console.log("Lỗi:", e);
}

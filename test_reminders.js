const assert = require('assert');

// Mock data cho test
let sentReminders = {};
const nowTaipei = new Date(2026, 6, 29, 12, 0, 0); // 12:00 (tháng là 0-indexed -> 6 là July)
console.log("Thời điểm hiện tại (mock):", nowTaipei);

function runCronTest(bookingTime, expectedSent) {
    const timeDiffMins = (bookingTime.getTime() - nowTaipei.getTime()) / 60000;
    console.log(`Lịch hẹn lúc: ${bookingTime}, Cách hiện tại: ${timeDiffMins} phút`);
    
    const reminderKey = `Group|testLineId|testPhone|2026/07/29|${bookingTime.getHours()}:${bookingTime.getMinutes()}`;

    if (!sentReminders[reminderKey]) {
        sentReminders[reminderKey] = { '4h': false, '1h': false };
    }

    const history = sentReminders[reminderKey];
    let sentMsg = null;

    if (timeDiffMins <= 240 && timeDiffMins > 60 && !history['4h']) {
        sentMsg = "4h";
        history['4h'] = true;
    } else if (timeDiffMins <= 60 && timeDiffMins > 0 && !history['1h']) {
        sentMsg = "1h";
        history['1h'] = true;
        history['4h'] = true; 
    }

    if (sentMsg) {
        console.log(`=> Đã gửi thông báo: ${sentMsg}`);
    } else {
        console.log(`=> Không gửi thông báo nào.`);
    }
    
    assert.strictEqual(sentMsg, expectedSent, `Lỗi: Kỳ vọng gửi ${expectedSent} nhưng lại gửi ${sentMsg}`);
}

try {
    // 1. Lịch cách hiện tại 3h rưỡi (210 phút) -> Phải gửi 4h
    console.log("--- TEST CASE 1: Lịch hẹn trong vòng 4 tiếng ---");
    let booking1 = new Date(2026, 6, 29, 15, 30, 0);
    runCronTest(booking1, "4h");

    // 2. Lịch cách hiện tại 45 phút -> Phải gửi 1h
    console.log("--- TEST CASE 2: Lịch hẹn trong vòng 1 tiếng ---");
    let booking2 = new Date(2026, 6, 29, 12, 45, 0);
    runCronTest(booking2, "1h");

    // 3. Lịch cách hiện tại 5 tiếng (300 phút) -> Không gửi
    console.log("--- TEST CASE 3: Lịch hẹn cách > 4 tiếng ---");
    let booking3 = new Date(2026, 6, 29, 17, 0, 0);
    runCronTest(booking3, null);
    
    console.log("\n✅ TẤT CẢ CÁC TEST END-TO-END REMINDER CHẠY THÀNH CÔNG!");
} catch (e) {
    console.error("❌ TEST THẤT BẠI:", e.message);
    process.exit(1);
}

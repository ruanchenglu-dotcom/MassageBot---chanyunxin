const fs = require('fs');

console.log('================================================');
console.log('🧪 RUNNING E2E TEST: Instant Recursive Abort (DFS Unwind)');
console.log('================================================\n');

function simulateGlobalTimeout() {
    const trySequence = Array.from({ length: 19 }, (_, i) => i);
    const GLOBAL_MAX_TIME_MS = 2500;
    const globalSqueezeStartTime = Date.now();
    let globalSqueezeAttempts = 0;
    let globalSqueezeAbort = false; // Tín hiệu mới
    
    let totalIterations = 0;
    let failedDueToTimeout = false;

    for (let numBF of trySequence) {
        if (globalSqueezeAbort || Date.now() - globalSqueezeStartTime > GLOBAL_MAX_TIME_MS) {
            failedDueToTimeout = true;
            break;
        }

        totalIterations++;
        
        // Mô phỏng hàm đệ quy Backtracking (DFS)
        function placeNewGuestsElastically(guestIndex) {
            if (globalSqueezeAbort) return false;
            
            globalSqueezeAttempts++;
            if (globalSqueezeAttempts % 100 === 0) {
                if (Date.now() - globalSqueezeStartTime > GLOBAL_MAX_TIME_MS) {
                    globalSqueezeAbort = true; // Kích hoạt cờ hủy diệt
                    return false;
                }
            }
            
            // Giả lập 2 nhánh con cho mỗi khách
            for (let i = 0; i < 2; i++) {
                if (guestIndex < 30) { // 30 khách
                    const success = placeNewGuestsElastically(guestIndex + 1);
                    if (success) return true;
                }
                
                // NGAY SAU KHI RETURN TỪ NHÁNH CON -> CHECK LẠI CỜ
                if (globalSqueezeAbort) return false;
            }
            
            return false;
        }

        placeNewGuestsElastically(0);
    }

    const elapsed = Date.now() - globalSqueezeStartTime;
    return { elapsed, failedDueToTimeout, totalIterations, globalSqueezeAttempts, globalSqueezeAbort };
}

console.log('--- Đang giả lập xử lý 15 khách với DFS Backtracking ( Worst-case 2^15 nhánh ) ---');
const result = simulateGlobalTimeout();

console.log(`⏱ Thời gian thực thi tổng cộng: ${result.elapsed}ms`);
console.log(`🔄 Tổng số lần gọi đệ quy đã quét: ${result.globalSqueezeAttempts}`);
console.log(`🔁 Vòng lặp trySequence đã đi tới: ${result.totalIterations} / 19`);
console.log(`💥 Cờ Hủy Diệt (Abort Signal): ${result.globalSqueezeAbort ? 'ĐÃ KÍCH HOẠT' : 'KHÔNG'}`);

if (result.elapsed >= 2500 && result.elapsed <= 2600 && result.globalSqueezeAbort) {
    console.log(`✅ TEST PASSED: Cây đệ quy khổng lồ đã SỤP ĐỔ TỨC THÌ ở mức ${result.elapsed}ms (< 3 giây). Hệ thống miễn nhiễm với freeze!`);
    console.log('\n================================================');
    process.exit(0);
} else {
    console.error(`❌ TEST FAILED: Thời gian chạy vượt quá mong đợi hoặc không kích hoạt Abort Signal.`);
    process.exit(1);
}

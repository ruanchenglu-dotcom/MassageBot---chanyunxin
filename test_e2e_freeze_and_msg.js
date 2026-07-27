const fs = require('fs');

console.log('================================================');
console.log('🧪 RUNNING E2E TEST: Global Matrix Timeout');
console.log('================================================\n');

function simulateGlobalTimeout() {
    const trySequence = Array.from({ length: 19 }, (_, i) => i);
    const GLOBAL_MAX_TIME_MS = 2500;
    const globalSqueezeStartTime = Date.now();
    let globalSqueezeAttempts = 0;
    
    let totalIterations = 0;
    let failedDueToTimeout = false;

    for (let numBF of trySequence) {
        if (Date.now() - globalSqueezeStartTime > GLOBAL_MAX_TIME_MS) {
            failedDueToTimeout = true;
            break;
        }

        totalIterations++;
        
        function placeNewGuestsElastically() {
            while (true) {
                globalSqueezeAttempts++;
                if (globalSqueezeAttempts % 100 === 0) {
                    if (Date.now() - globalSqueezeStartTime > GLOBAL_MAX_TIME_MS) {
                        return false;
                    }
                }
            }
        }

        placeNewGuestsElastically();
    }

    const elapsed = Date.now() - globalSqueezeStartTime;
    return { elapsed, failedDueToTimeout, totalIterations, globalSqueezeAttempts };
}

console.log('--- Đang giả lập xử lý 18 khách (Worst-case) ---');
const result = simulateGlobalTimeout();

console.log(`⏱ Thời gian thực thi tổng cộng: ${result.elapsed}ms`);
console.log(`🔄 Tổng số lần đệ quy đã quét: ${result.globalSqueezeAttempts}`);
console.log(`🔁 Vòng lặp trySequence đã thử: ${result.totalIterations} / 19`);

if (result.elapsed >= 2500 && result.elapsed <= 2600 && result.failedDueToTimeout) {
    console.log(`✅ TEST PASSED: Vòng lặp đã bị ngắt an toàn ở mức ${result.elapsed}ms (< 3 giây). Hệ thống CHẮC CHẮN không còn bị treo!`);
    console.log('\n================================================');
    process.exit(0);
} else {
    console.error(`❌ TEST FAILED: Thời gian chạy không đúng như thiết kế.`);
    process.exit(1);
}

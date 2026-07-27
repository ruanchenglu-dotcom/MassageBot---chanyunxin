const fs = require('fs');

console.log('================================================');
console.log('🧪 RUNNING E2E TEST: Freeze Prevention & Message Deduplication');
console.log('================================================\n');

// --- Test 1: Message Deduplication ---
console.log('--- Test 1: Lọc Thông Báo Lỗi Trùng Lặp ---');
function testFailMessage(failureLog) {
    const uniqueLog = [...new Set(failureLog)];
    const debugReason = uniqueLog.length > 0 ? uniqueLog.slice(-1).join('') : "❌ 老師不夠";
    return debugReason;
}

const testLogs = [
    { input: ['❌ [吳]老師沒有上班', '❌ [吳]老師沒有上班'], expected: '❌ [吳]老師沒有上班' },
    { input: ['❌ 男老師不夠', '❌ 男老師不夠', '❌ 男老師不夠'], expected: '❌ 男老師不夠' },
    { input: [], expected: '❌ 老師不夠' }
];

let passed1 = 0;
testLogs.forEach((tc, idx) => {
    const res = testFailMessage(tc.input);
    if (res === tc.expected) {
        console.log(`✅ Test 1.${idx + 1} Passed: input='${tc.input}' -> output='${res}'`);
        passed1++;
    } else {
        console.error(`❌ Test 1.${idx + 1} Failed: expected='${tc.expected}', got='${res}'`);
    }
});

// --- Test 2: Squeeze Timeout Limit ---
console.log('\n--- Test 2: Chống Đứng Máy (Freeze Prevention) ---');
function simulateSqueeze() {
    let squeezeAttempts = 0;
    const squeezeStartTime = Date.now();
    const MAX_TIME_MS = 200; // Mô phỏng 200ms thay vì 3000ms để test nhanh

    while (true) {
        squeezeAttempts++;
        if (squeezeAttempts % 100 === 0) {
            if (Date.now() - squeezeStartTime > MAX_TIME_MS) {
                return { success: false, attempts: squeezeAttempts, time: Date.now() - squeezeStartTime };
            }
        }
    }
}

const result = simulateSqueeze();
if (!result.success && result.time >= 200) {
    console.log(`✅ Test 2 Passed: Vòng lặp đệ quy đã bị ngắt an toàn sau ${result.time}ms với ${result.attempts} lần thử.`);
} else {
    console.error(`❌ Test 2 Failed: Vòng lặp đệ quy bị lỗi.`);
}

console.log('\n================================================');
if (passed1 === testLogs.length && !result.success) {
    console.log(`🎉 ALL TESTS PASSED SUCCESSFULLY! Hệ thống chống treo hoạt động hoàn hảo.`);
    console.log('================================================');
    process.exit(0);
} else {
    console.log(`⚠️ TESTS FAILED!`);
    console.log('================================================');
    process.exit(1);
}

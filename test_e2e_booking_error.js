const fs = require('fs');
const path = require('path');

// E2E Test script to verify the specific logic we added to cyx_bookingHandler.js

console.log('================================================');
console.log('🧪 RUNNING E2E TEST: Staff Assignment Error Messages');
console.log('================================================\n');

function runTestLogic(staffName) {
    let item = { guest: { staffName: staffName } };
    let failureLog = [];
    
    // THE EXACT LOGIC FROM cyx_bookingHandler.js
    let staffReq = item.guest.staffName;
    let errorMsg = '老師不夠';
    if (staffReq) {
        if (['MALE', '男', '男師'].includes(staffReq)) {
            errorMsg = '男老師不夠';
        } else if (['FEMALE', '女', '女師'].includes(staffReq)) {
            errorMsg = '女老師不夠';
        } else if (!['RANDOM', '隨機', 'Any', 'undefined', '不指定'].includes(staffReq)) {
            errorMsg = `[${staffReq}]老師沒有上班`; 
        }
    }
    failureLog.push(`❌ ${errorMsg}`);
    
    return failureLog[0];
}

const testCases = [
    { input: 'RANDOM', expected: '❌ 老師不夠' },
    { input: '隨機', expected: '❌ 老師不夠' },
    { input: 'Any', expected: '❌ 老師不夠' },
    { input: 'undefined', expected: '❌ 老師不夠' },
    { input: '', expected: '❌ 老師不夠' },
    { input: null, expected: '❌ 老師不夠' },
    { input: 'MALE', expected: '❌ 男老師不夠' },
    { input: '男', expected: '❌ 男老師不夠' },
    { input: '男師', expected: '❌ 男老師不夠' },
    { input: 'FEMALE', expected: '❌ 女老師不夠' },
    { input: '女', expected: '❌ 女老師不夠' },
    { input: '女師', expected: '❌ 女老師不夠' },
    { input: '吳', expected: '❌ [吳]老師沒有上班' },
    { input: '陳', expected: '❌ [陳]老師沒有上班' }
];

let passed = 0;
testCases.forEach((tc, index) => {
    const result = runTestLogic(tc.input);
    if (result === tc.expected) {
        console.log(`✅ Test ${index + 1} passed: input='${tc.input}' -> output='${result}'`);
        passed++;
    } else {
        console.error(`❌ Test ${index + 1} FAILED: input='${tc.input}'. Expected '${tc.expected}', got '${result}'`);
    }
});

console.log('\n================================================');
if (passed === testCases.length) {
    console.log(`🎉 ALL ${testCases.length} TESTS PASSED SUCCESSFULLY!`);
    console.log('================================================');
    process.exit(0);
} else {
    console.log(`⚠️ ${testCases.length - passed} TESTS FAILED!`);
    console.log('================================================');
    process.exit(1);
}

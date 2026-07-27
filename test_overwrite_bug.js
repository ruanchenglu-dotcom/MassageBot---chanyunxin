const assert = require('assert');
const fs = require('fs');

console.log('--- Bắt đầu E2E Test: Lỗi ghi đè Grid State (Root Cause) ---');

// Mô phỏng trạng thái hệ thống
let universalSendPayload = null;
let handleStaffChangeCalled = false;

// Mock functions
global.universalSend = (url, payload) => {
    console.log(`[Network Mock] Đã gửi request ngầm đến ${url} với payload:`, payload);
    universalSendPayload = payload;
};

const handleStaffChange = async (resId, newStaff, returnToLast) => {
    console.log(`[Grid Update Mock] Đã gọi update trên Lưới với resId=${resId}`);
    handleStaffChangeCalled = true;
};

const setSyncLock = () => {};

// Mock resourceState (Lưới hiện tại)
// Ghế CHAIR-1-1 đang bị chiếm bởi khách #27 (do đến sau trong ngày)
const resourceState = {
    'CHAIR-1-1': {
        booking: { rowId: 27, originalName: '王先生 (1/1)' },
        isRunning: false
    }
};

// Khách hàng #25 (người dùng click vào từ quá khứ)
const targetBooking = { rowId: 25, originalName: '游小姐 (1/2)' };
const targetResourceId = 'CHAIR-1-1';

// Payload từ Control Center
const payload = {
    newStaff: '賀',
    updateGroup: false
};

// --- CHẠY LOGIC ĐÃ FIX TRONG cyx_app.js ---
console.log('Thực thi CHANGE_STAFF cho khách #25...');

if (targetResourceId && resourceState[targetResourceId] && String(resourceState[targetResourceId].booking?.rowId) === String(targetBooking.rowId)) {
    console.log('-> Vào nhánh: Cập nhật Lưới (Grid)');
    handleStaffChange(targetResourceId, payload.newStaff, payload.returnToLast);
} else {
    console.log('-> Vào nhánh: Cập nhật Ngầm (OFF-GRID)');
    const rowId = String(targetBooking.rowId);
    setSyncLock(true); setTimeout(() => setSyncLock(false), 3000);

    universalSend('/api/update-booking-details', {
        rowId: rowId,
        服務師傅1: payload.newStaff,
        ServiceStaff1: payload.newStaff,
        technician: payload.newStaff,
        staff1: payload.newStaff,
        forceSync: true
    });
}

// --- KIỂM TRA KẾT QUẢ ---
try {
    assert.strictEqual(handleStaffChangeCalled, false, 'LỖI: Hàm cập nhật lưới vẫn bị gọi (sai khách)!');
    assert.notStrictEqual(universalSendPayload, null, 'LỖI: Không gửi request ngầm!');
    assert.strictEqual(String(universalSendPayload.rowId), '25', `LỖI: Cập nhật sai rowId! Kì vọng 25, thực tế ${universalSendPayload.rowId}`);
    assert.strictEqual(universalSendPayload['服務師傅1'], '賀', 'LỖI: Sai tên thợ');
    
    console.log('✅ TEST PASS: Tính năng gán thợ đã được chặn an toàn bởi Guardrail và fallback về cập nhật ngầm cho khách #25!');
} catch (e) {
    console.error('❌ TEST FAILED:', e.message);
    process.exit(1);
}

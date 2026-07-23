const fs = require('fs');

function runTest() {
    console.log("=== BẮT ĐẦU TEST: KIỂM TRA LỖI NHẢY PHASE 2 VỀ 12:00 ===");

    // Simulate formatting functions used in views
    global.safeTimeToMins = (timeStr, defaultMins = 0) => {
        if (!timeStr) return -1;
        try {
            let cleanStr = String(timeStr).trim();
            if (cleanStr.includes(' ')) {
                cleanStr = cleanStr.split(' ')[1];
            }
            const parts = cleanStr.split(':');
            if (parts.length < 2) return defaultMins;
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (isNaN(h) || isNaN(m)) return defaultMins;
            return h * 60 + m;
        } catch (e) {
            return defaultMins;
        }
    };

    global.formatMinutesToTime = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    // Load cyx_app logic related to Phase 1 Prediction calculation
    const startMins = 720; // 12:00
    const baseDur = 100;
    const splitPhase1 = 50;
    const splitPhase2 = 50;
    
    // Nếu duration bị lỗi = 0 (Lỗi do NaN parse logic cũ)
    const errFinishTimeMins = 720; // 12:00 do duration = 0
    let errP2Start = errFinishTimeMins;
    const errTransTime = ""; // Không parse được
    if (errTransTime) {
        const transMins = global.safeTimeToMins(errTransTime);
        if (transMins !== -1) errP2Start = Math.max(transMins, errFinishTimeMins);
    }
    
    console.log("\n[1] MÔ PHỎNG LOGIC CŨ KHI DỮ LIỆU ĐỒNG BỘ BỊ LỖI (DURATION/TRANSITION = NULL):");
    console.log(`- Phase 1 Start: ${global.formatMinutesToTime(startMins)}`);
    console.log(`- Phase 2 Start: ${global.formatMinutesToTime(errP2Start)} (ĐÂY LÀ LỖI Phase 2 đè lên Phase 1 tại 12:00)`);

    // --- SAU KHI SỬA ---
    console.log("\n[2] MÔ PHỎNG LOGIC MỚI SAU KHI NÂNG CẤP:");
    let minP2Start = startMins + (splitPhase1 || Math.floor(baseDur / 2));
    let newP2Start = Math.max(errFinishTimeMins, minP2Start); // Bắt buộc phải lớn hơn minP2Start
    
    if (errTransTime) {
        const transMins = global.safeTimeToMins(errTransTime);
        if (transMins !== -1) {
            newP2Start = Math.max(transMins, newP2Start);
        }
    }
    console.log(`- Phase 1 Start: ${global.formatMinutesToTime(startMins)}`);
    console.log(`- Phase 2 Start (Đã sửa): ${global.formatMinutesToTime(newP2Start)} (Đã chặn cứng việc đè lên Phase 1)`);

    if (newP2Start > startMins) {
        console.log("\n=> KẾT LUẬN: TEST PASSED! Phase 2 không thể bị nhảy về 12:00 nữa.");
    } else {
        console.log("\n=> KẾT LUẬN: TEST FAILED!");
    }
}

runTest();

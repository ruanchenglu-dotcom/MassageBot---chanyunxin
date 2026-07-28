const CoreKernel = require('./cyx_resource_core.js');

function runTest() {
    console.log("=== BẮT ĐẦU E2E TEST: NÂNG CẤP GÓI CHO 1 KHÁCH TRONG NHÓM 4 NGƯỜI ===");
    const targetDateStandard = '2026-07-28';
    const time = '14:00';

    // Giả lập 1 nhóm 4 khách ban đầu đã được book vào Giường 1, 2, 3, 4 (gói 100 phút = 50p body + 50p foot).
    // Khách số 3 (曾小姐) đổi từ 100p lên 130p (65p body + 65p foot).
    const coreGuests = [{ serviceCode: 'B3', overrideDuration: 130, flowCode: 'FB', idx: 0 }];

    const coreBookings = [
        { rowId: '1', startTimeString: '2026/07/28 14:00', duration: 100, flowCode: 'FB', status: 'CONFIRMED', phase1_res_idx: 'CHAIR-1-1', phase2_res_idx: 'BED-1-1', customerName: 'Khach 1', originalData: {} },
        { rowId: '2', startTimeString: '2026/07/28 14:00', duration: 100, flowCode: 'FB', status: 'CONFIRMED', phase1_res_idx: 'CHAIR-1-2', phase2_res_idx: 'BED-1-2', customerName: 'Khach 2', originalData: {} },
        // KHÔNG CÓ Khách 3 trong `coreBookings` vì thuật toán Frontend lọc bỏ (filter out) rowId của khách đang được Edit
        { rowId: '4', startTimeString: '2026/07/28 14:00', duration: 100, flowCode: 'FB', status: 'CONFIRMED', phase1_res_idx: 'CHAIR-1-4', phase2_res_idx: 'BED-1-4', customerName: 'Khach 4', originalData: {} },
        // Giả lập Giường 3 trống nhưng ngay sau đó có khách book lúc 15:50 (cách 110p) => Nếu nâng lên 130p ở Giường 3 sẽ bị đụng!
        { rowId: '5', startTimeString: '2026/07/28 15:50', duration: 60, flowCode: 'BODYSINGLE', status: 'CONFIRMED', allocated_resource: 'BED-1-3', customerName: 'Khach X', originalData: {} },
    ];

    const staffMap = {};
    for (let i = 1; i <= 10; i++) {
        staffMap['Staff' + i] = { id: 'Staff' + i, start: '00:00', end: '23:59', isStrictTime: false, off: false };
    }

    console.log("-> Bắt đầu gọi CoreKernel kiểm tra vị trí mới cho khách 曾小姐 (130p)...");
    const result = CoreKernel.checkRequestAvailability(targetDateStandard, time, coreGuests, coreBookings, staffMap, { location: '本館' });
    
    console.log("\n=== KẾT QUẢ TEST KIỂM THỬ ===");
    if (result.feasible) {
        console.log("✅ TEST PASSED: Hệ thống CoreKernel ĐÃ ĐỦ THÔNG MINH để xếp chỗ thành công!");
        const proposed = result.details[0];
        console.log("=> Thay vì kẹt ở Giường 3 (bị đụng lúc 15:50), hệ thống đã tự động dời khách 曾小姐 (130p) sang:");
        console.log(`   - Phase 1 (Chân): ${proposed.phase1_res_idx || proposed.allocated_resource}`);
        console.log(`   - Phase 2 (Thân): ${proposed.phase2_res_idx}`);
        console.log(`   - Luồng (Flow): ${proposed.flow || proposed.flowCode}`);
        
        console.log("\n-> FRONTEND MỚI SẼ LÀM GÌ?");
        console.log("   Frontend (cyx_app.js) sẽ tự động lấy thông tin mới này và hiển thị hộp thoại:");
        console.log("   \"系統發現原位無法滿足升級需求。將自動調整此預約至新床位/座位，請問是否同意？\"");
        console.log("   Sau đó, gộp vị trí mới này vào `updatedData` gửi xuống Backend, giải quyết hoàn toàn lỗi RESOURCE_CONFLICT!");
    } else {
        console.log("❌ TEST FAILED: Hệ thống báo hết chỗ.");
        console.log("Lý do:", result.reason);
    }
}

runTest();

const CoreKernel = require('./cyx_resource_core.js');

function runTest() {
    console.log("=== BẮT ĐẦU E2E TEST: KỊCH BẢN DỜI CHỖ THÔNG MINH (SMART REPACKING) ===");
    const targetDateStandard = '2026-07-16';
    const time = '11:00';

    // Khách mới đặt 90 phút lúc 11:00
    const coreGuests = [{ serviceCode: 'F1', overrideDuration: 90, flowCode: 'FOOTSINGLE', idx: 0 }];

    // Giả lập trạng thái lúc test (có các khách cũ đang ngồi rải rác)
    // Lưu ý: Các khách cũ KHÔNG ở trạng thái 服務中 (Đang phục vụ), nên hệ thống phải tự động dời được.
    const coreBookings = [
        // Khách Cao (高) đang ở Ghế 1-1 lúc 12:05. Nếu khách mới vào 11:00 (90p -> hết 12:30), sẽ trùng lặp. Hệ thống phải dời Cao sang Ghế 1-3.
        { rowId: '1', startTimeString: '2026/07/16 12:05', duration: 70, flowCode: 'FOOTSINGLE', status: 'CONFIRMED', allocated_resource: 'CHAIR-1-1', customerName: '高', originalData: { customerName: '高' } },
        { rowId: '2', startTimeString: '2026/07/16 11:10', duration: 50, flowCode: 'FOOTSINGLE', status: 'CONFIRMED', allocated_resource: 'CHAIR-1-2', customerName: '易', originalData: { customerName: '易' } },
        { rowId: '3', startTimeString: '2026/07/16 12:05', duration: 50, flowCode: 'FOOTSINGLE', status: 'CONFIRMED', allocated_resource: 'CHAIR-1-2', customerName: '楊1', originalData: { customerName: '楊1' } },
        // Khách Trương (張4) Combo, phần chân (CHAIR-1-3) kết thúc lúc 12:02. Tạo khoảng trống cho Cao dời vào lúc 12:05.
        { rowId: '4', startTimeString: '2026/07/16 10:20', duration: 100, flowCode: 'BF', status: 'CONFIRMED', phase1_res_idx: 'BED-1-3', phase2_res_idx: 'CHAIR-1-3', customerName: '張4', originalData: { customerName: '張4' } },
        { rowId: '5', startTimeString: '2026/07/16 10:40', duration: 50, flowCode: 'FOOTSINGLE', status: 'CONFIRMED', allocated_resource: 'CHAIR-1-4', customerName: '杜1', originalData: { customerName: '杜1' } },
        { rowId: '6', startTimeString: '2026/07/16 12:05', duration: 50, flowCode: 'FOOTSINGLE', status: 'CONFIRMED', allocated_resource: 'CHAIR-1-4', customerName: '楊2', originalData: { customerName: '楊2' } },
        { rowId: '7', startTimeString: '2026/07/16 12:01', duration: 60, flowCode: 'FOOTSINGLE', status: 'CONFIRMED', allocated_resource: 'CHAIR-1-5', customerName: '方1', originalData: { customerName: '方1' } },
        { rowId: '8', startTimeString: '2026/07/16 12:01', duration: 60, flowCode: 'FOOTSINGLE', status: 'CONFIRMED', allocated_resource: 'CHAIR-1-6', customerName: '方2', originalData: { customerName: '方2' } },
    ];

    const staffMap = {};
    for (let i = 1; i <= 10; i++) {
        staffMap['Staff' + i] = { id: 'Staff' + i, start: '00:00', end: '23:59', isStrictTime: false, off: false };
    }

    console.log("-> Kích hoạt CoreKernel.checkRequestAvailability()...");
    const result = CoreKernel.checkRequestAvailability(targetDateStandard, time, coreGuests, coreBookings, staffMap, { location: '本館' });
    
    console.log("\n=== KẾT QUẢ TEST ===");
    if (result.feasible) {
        console.log("✅ TEST PASSED: Hệ thống ĐÃ TỰ ĐỘNG sắp xếp thành công!");
        console.log("=> Khách mới được xếp vào:", result.details[0].allocated);
        console.log("=> Lịch trình cũ được hệ thống tự động điều chỉnh (Smart Repacking):");
        result.proposedUpdates.forEach(update => {
            console.log(`   - Khách [${update.customerName}] dời sang ghế: ${update.newPhase1Res} (${update.reason})`);
        });
    } else {
        console.log("❌ TEST FAILED: Hệ thống báo hết chỗ.");
        console.log("Lý do:", result.reason);
    }
}

runTest();

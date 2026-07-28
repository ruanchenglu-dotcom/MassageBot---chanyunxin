// Mô phỏng CoreKernel
const CoreKernel = require('./cyx_resource_core.js');

// Mô phỏng hàm toàn cục trên window của Frontend
global.window = {
    cyxCallCoreAvailabilityCheck: (dateStr, timeStr, guestDetails, bookings, staffList) => {
        console.log(`[FRONTEND MOCK] Kích hoạt window.cyxCallCoreAvailabilityCheck cho ${guestDetails[0].service} (${guestDetails[0].overrideDuration}p)`);
        return CoreKernel.checkRequestAvailability(dateStr, timeStr, guestDetails, bookings, staffList, { location: '本館' });
    }
};

// Mô phỏng React component logic (giống hệt trong cyx_views.js performServiceCheck)
function testFrontendPerformServiceCheck() {
    console.log("=== BẮT ĐẦU UNIT TEST: FRONTEND NÚT CHECK (查詢) ===");
    
    // Giả lập Dữ liệu
    const startMins = 840; // 14:00
    const newDuration = 130; 
    const editPhase1End = startMins + 65; // Giả sử phase 1 là 65p
    const switchMins = editPhase1End;
    const endMins = startMins + newDuration; // 16:10

    const booking = {
        rowId: '3', // Khách 3 (曾小姐)
        phase1_res_idx: 'BED-1-3', // Chỗ CŨ (đang bị kẹt lúc 15:50)
        phase2_res_idx: 'CHAIR-1-3',
        serviceName: '套餐 (100分)',
        date: '2026-07-28',
        startTimeString: '2026/07/28 14:00',
        flowCode: 'BF'
    };
    
    const todays = [
        { rowId: '1', startTimeString: '2026/07/28 14:00', duration: 100, flowCode: 'FB', phase1_res_idx: 'CHAIR-1-1', phase2_res_idx: 'BED-1-1' },
        { rowId: '2', startTimeString: '2026/07/28 14:00', duration: 100, flowCode: 'FB', phase1_res_idx: 'CHAIR-1-2', phase2_res_idx: 'BED-1-2' },
        { rowId: '4', startTimeString: '2026/07/28 14:00', duration: 100, flowCode: 'FB', phase1_res_idx: 'CHAIR-1-4', phase2_res_idx: 'BED-1-4' },
        // Khách này gây kẹt lúc 15:50 tại CHAIR-1-3
        { rowId: '5', startTimeString: '2026/07/28 15:50', duration: 60, flowCode: 'FOOTSINGLE', allocated_resource: 'CHAIR-1-3' }
    ];

    const staffList = {};
    for (let i = 1; i <= 10; i++) staffList['Staff' + i] = { id: 'Staff' + i, off: false };

    // Mô phỏng checkOverlap cũ của frontend
    function checkOverlap(resId, st, en, rowIdToIgnore) {
        return todays.some(b => {
            if (String(b.rowId) === String(rowIdToIgnore)) return false;
            let bSt = parseInt(b.startTimeString.split(' ')[1].split(':')[0]) * 60 + parseInt(b.startTimeString.split(' ')[1].split(':')[1]);
            let bEn = bSt + (b.duration || 60);
            const isTimeConflict = (st < bEn && en > bSt);
            const resArr = [b.phase1_res_idx, b.phase2_res_idx, b.allocated_resource].filter(Boolean);
            return isTimeConflict && resArr.includes(resId);
        });
    }

    // ==== LOGIC TRÍCH XUẤT TỪ CYX_VIEWS.JS SAU KHI NÂNG CẤP ====
    let isResConflict = false;
    
    // Check Phase 1 & 2 overlap trên vị trí cũ
    if (checkOverlap(booking.phase1_res_idx, startMins, editPhase1End, booking.rowId)) isResConflict = true;
    if (checkOverlap(booking.phase2_res_idx, switchMins + 5, endMins, booking.rowId)) isResConflict = true;

    if (isResConflict) {
        console.log(`[UI CHECK] Cảnh báo: Vị trí cũ (${booking.phase1_res_idx} / ${booking.phase2_res_idx}) bị trùng giờ!`);
        console.log(`[UI CHECK] Chuyển qua dùng CoreKernel thông minh thay vì báo FAILED lập tức...`);
        
        if (window.cyxCallCoreAvailabilityCheck) {
            const guestDetails = [{
                service: '套餐 (130分)',
                staff: '隨機',
                overrideDuration: newDuration,
                flowCode: booking.flowCode
            }];
            
            const finalCheck = window.cyxCallCoreAvailabilityCheck(booking.date, booking.startTimeString.split(' ')[1], guestDetails, todays, staffList);
            
            if (finalCheck && finalCheck.valid) {
                const checkDetail = finalCheck.details && finalCheck.details.length > 0 
                    ? (finalCheck.coreDetails ? finalCheck.coreDetails[0] : finalCheck.details[0]) 
                    : null;
                
                if (checkDetail) {
                    const newP1 = checkDetail.phase1_res_idx || checkDetail.allocated_resource || "";
                    const newP2 = checkDetail.phase2_res_idx || "";
                    const newFlow = checkDetail.flowCode || checkDetail.flow || "";
                    
                    console.log(`\n✅ TEST PASSED: UI đã gọi CoreKernel và cập nhật state thành công!`);
                    console.log(`   => Vị trí cũ: ${booking.phase1_res_idx} / ${booking.phase2_res_idx}`);
                    console.log(`   => Vị trí mới (thông minh): Phase 1 = ${newP1}, Phase 2 = ${newP2}, Flow = ${newFlow}`);
                    console.log(`   => Câu thông báo xanh lá (OK): ✅ 已為您智能分配新座位 (${newP1})`);
                    return true;
                }
            }
        }
        
        console.log(`❌ TEST FAILED: Khung giờ đã đầy thật sự, không thể nâng cấp.`);
        return false;
    }

    console.log(`✅ TEST PASSED (OK ngay từ đầu)`);
    return true;
}

testFrontendPerformServiceCheck();

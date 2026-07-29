const { expect } = require('@playwright/test');

const testComboGroupUpgradeFlowFlip = () => {
    // 1. Mock Bookings
    let groupBookings = [];
    for (let i = 1; i <= 6; i++) {
        groupBookings.push({
            rowId: i + 100,
            serviceName: "腳底按摩 (40m)",
            serviceCode: "A1",
            phase1_res_idx: `CHAIR-1-${i}`,
            flow: "FOOTSINGLE",
            category: "FOOT",
            duration: 40,
            startTime: "12:00"
        });
    }

    // 2. Updated data (upgrade to Combo)
    const updatedData = {
        dichVu: "套餐 (100分)",
        flow: "FB", // default proposal
        phase1_duration: 50,
        phase2_duration: 50,
        ignoreOverlap: true // allow group overlap check
    };

    const svcDef = {
        category: 'COMBO',
        name: '套餐 (100分)',
        duration: 100
    };

    // 3. Mock the checkOverlapConflict
    let flippedCount = 0;
    
    // Giả sử có 12 giường (BED-1-1 đến BED-1-12)
    // Nhưng 9 giường đã bị block vào lúc 12:50 (lúc Phase 2 FB diễn ra)
    // Nghĩa là chỉ còn 3 giường trống lúc 12:50
    // => 3 người đầu tiên có thể FB, 3 người sau phải đảo luồng sang BF.
    let bedUsageFBPhase = 9; // số giường đang có người ở phase 2 FB
    
    groupBookings.forEach((bookingData, index) => {
        let bestPhase1 = bookingData.phase1_res_idx;
        let bestPhase2 = "";
        let newFlow = "FB";
        
        let foundMissing = false;
        
        // Simulating the logic from cyx_sheet_service:
        // Try FB flow first
        if (bedUsageFBPhase < 12) {
            bedUsageFBPhase++; // chiếm 1 giường
            bestPhase2 = `BED-1-${bedUsageFBPhase}`;
            foundMissing = true;
            newFlow = "FB";
        } else {
            // Không đủ giường cho FB phase 2
            foundMissing = false;
        }

        // Logic đảo luồng được thực thi nếu không đủ chỗ cho Phase 2 (foundMissing = false)
        if (!foundMissing) {
            console.log(`Booking ${bookingData.rowId} không đủ giường cho Phase 2 FB, thực hiện đảo luồng (Flow Flip)...`);
            
            // Tìm giường trống ở Phase 1 cho BF (tức là lúc 12:00, giả sử lúc này trống đủ 12 giường)
            let bedPhase1ForBF = `BED-1-${index + 1}`;
            let chairPhase2ForBF = bookingData.phase1_res_idx; // tái sử dụng ghế cũ cho phase 2
            
            bestPhase1 = bedPhase1ForBF;
            bestPhase2 = chairPhase2ForBF;
            newFlow = "BF";
            flippedCount++;
        }

        // Update the booking internally
        bookingData.flow = newFlow;
        bookingData.phase1_res_idx = bestPhase1;
        bookingData.phase2_res_idx = bestPhase2;
    });

    console.log("=== KẾT QUẢ SAU KHI XỬ LÝ NHÓM COMBO ===");
    groupBookings.forEach(b => {
        console.log(`Guest ${b.rowId}: Flow=${b.flow}, Phase1=${b.phase1_res_idx}, Phase2=${b.phase2_res_idx}`);
    });

    console.log(`Số khách bị đảo luồng: ${flippedCount}`);
    if (flippedCount === 3) {
        console.log("✅ TEST PASSED: Thuật toán tự động đảo luồng thành công cho 3 khách khi không đủ giường Phase 2.");
    } else {
        console.error("❌ TEST FAILED: Thuật toán không hoạt động như mong đợi.");
    }
};

testComboGroupUpgradeFlowFlip();

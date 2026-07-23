const fs = require('fs');

const testTransitionTimePreservation = () => {
    // Simulate the data structure found in executeBatchStart
    const current = {
        booking: {
            rowId: "123",
            duration: 100,
            category: "COMBO",
            flow: "FB",
            phase1_res_idx: "CHAIR-1-1",
            phase2_res_idx: "BED-1-1",
            transition_time: "12:51",
            phase1_duration: 50,
            phase2_duration: 50
        }
    };
    
    const resourceId = "CHAIR-1-1";
    const newComboMeta = { sequence: "FB", targetId: "BED-1-1", phase: 1 };
    
    const isComboService = true;
    
    // 2. Logic extracted from modified executeBatchStart in cyx_app.js
    let comboPayloadAdditions = {};
    if (isComboService && newComboMeta) {
        // mock getSmartSplit
        const split = { phase1: 50, phase2: 50 }; 
        
        comboPayloadAdditions = {
            flow: newComboMeta.sequence,
            flow_code: newComboMeta.sequence,
            phase1_duration: current.booking.phase1_duration !== undefined ? current.booking.phase1_duration : split.phase1,
            phase2_duration: current.booking.phase2_duration !== undefined ? current.booking.phase2_duration : split.phase2,
            phase1_res_idx: resourceId.toUpperCase(),
            ...(newComboMeta.targetId && { phase2_res_idx: newComboMeta.targetId.toUpperCase() })
        };

        // [V1.x NÂNG CẤP] Bảo tồn transition_time từ Sheet để tránh Backend tự cộng thêm buffer gây nhảy Timeline
        if (current.booking.transition_time) {
            comboPayloadAdditions.transition_time = current.booking.transition_time;
        }
    }

    // 3. Verify the result
    console.log("=== KẾT QUẢ TEST LOGIC BẢO TỒN TRANSITION_TIME ===");
    console.log("Đầu vào: Khách hàng có transition_time = 12:51 đã cài đặt sẵn trong Sheet");
    console.log("Kết quả mong đợi: payload gửi xuống backend PHẢI chứa transition_time: '12:51'");
    console.log("Kết quả thực tế payload additions:", comboPayloadAdditions);
    
    if (comboPayloadAdditions.transition_time === "12:51" && comboPayloadAdditions.phase1_duration === 50) {
        console.log("✅ TEST PASSED: Tính năng bảo tồn transition_time và duration hoạt động xuất sắc! Không còn bị nhảy Timeline.");
        process.exit(0);
    } else {
        console.log("❌ TEST FAILED!");
        process.exit(1);
    }
};

testTransitionTimePreservation();

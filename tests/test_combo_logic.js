const fs = require('fs');

const testUpdateServiceLogic = () => {
    // 1. Setup mock data exactly like the real cyx_data.js
    const window = {
        SERVICES_DATA: {
            "F3": { name: '腳底按摩 (90分)', duration: 90, category: 'FOOT' },
            "A3": { 
                name: '套餐 (100分)',
                duration: 100, 
                category: 'COMBO',
                minFoot: 40, maxFoot: 60,
                minBody: 40, maxBody: 60
            }
        }
    };

    const bookingObj = {
        rowId: "1",
        serviceStaff: "StaffA",
        serviceName: "腳底按摩 (90分)",
        flow: "FB"
    };

    const payload = {
        newService: "套餐 (100分)",
        newPhase1: 120 // Trạng thái cũ là 120, đổi sang combo 100, phase1=120 là bất hợp lệ vì maxFoot=60
    };

    let data = {};

    // 2. Logic mới được trích xuất từ cyx_app.js
    if (payload.newPhase1 !== undefined && payload.newPhase1 !== null) {
        let validP1 = payload.newPhase1;
        let newTotal = 0;
        
        let svcDef = window.SERVICES_DATA ? window.SERVICES_DATA[payload.newService] : null;
        if (window.SERVICES_DATA && !svcDef) {
            const code = Object.keys(window.SERVICES_DATA).find(k => window.SERVICES_DATA[k].name === payload.newService);
            if (code) svcDef = window.SERVICES_DATA[code];
        }

        if (svcDef) {
            newTotal = svcDef.duration;
            if (svcDef.category === 'COMBO') {
                const isBF = bookingObj.flow === 'BF';
                const min1 = isBF ? svcDef.minBody : svcDef.minFoot;
                const max1 = isBF ? svcDef.maxBody : svcDef.maxFoot;
                const min2 = isBF ? svcDef.minFoot : svcDef.minBody;
                const max2 = isBF ? svcDef.maxFoot : svcDef.maxBody;
                
                if (max1 != null && validP1 > max1) validP1 = max1;
                if (min1 != null && validP1 < min1) validP1 = min1;
                
                const p2 = newTotal - validP1;
                if (min2 != null && p2 < min2) validP1 = newTotal - min2;
                if (max2 != null && p2 > max2) validP1 = newTotal - max2;
            } else {
                validP1 = newTotal;
            }
        }

        data.phase1_duration = validP1;
        if (newTotal > 0) {
            data.phase2_duration = newTotal - validP1;
        }
    }

    // 3. Kiểm tra kết quả
    console.log("=== KẾT QUẢ TEST LOGIC UPDATE_SERVICE MỚI ===");
    console.log("Đầu vào: Chuyển sang Combo 100 phút, giữ Phase 1 cũ = 120 phút");
    console.log("Kết quả mong đợi: Phase 1 bị giới hạn xuống 60 phút, Phase 2 = 40 phút");
    console.log("Kết quả thực tế: Phase 1 =", data.phase1_duration, ", Phase 2 =", data.phase2_duration);
    
    if (data.phase1_duration === 60 && data.phase2_duration === 40) {
        console.log("✅ TEST PASSED: Logic tra cứu name => code và giới hạn thời gian (Clamping) hoạt động chính xác!");
        process.exit(0);
    } else {
        console.log("❌ TEST FAILED!");
        process.exit(1);
    }
};

testUpdateServiceLogic();

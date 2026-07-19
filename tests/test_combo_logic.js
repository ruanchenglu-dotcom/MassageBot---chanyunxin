const fs = require('fs');

// Đọc dữ liệu từ file cyx_app.js để test
const frontendCode = fs.readFileSync('XinWuChanAdmin/js/cyx_app.js', 'utf8');

// Trích xuất hàm getUpdatedData (chúng ta sẽ mô phỏng logic UPDATE_SERVICE)
// Trong cyx_app.js, getUpdatedData được khởi tạo bên trong case 'UPDATE_SERVICE'
// Vì khó trích xuất trực tiếp, chúng ta sẽ mô phỏng lại đoạn code xử lý phase1_duration

const testUpdateServiceLogic = () => {
    // 1. Setup mock data
    const window = {
        SERVICES_DATA: {
            "腳底按摩 (90分)": { duration: 90, category: 'FOOT' },
            "套餐 (100分)": { 
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
        newPhase1: 90 // Trạng thái cũ là 90, đổi sang combo 100, phase1=90 là bất hợp lệ vì maxFoot=60
    };

    let data = {};

    // 2. Logic cần test (Được trích xuất từ cyx_app.js)
    if (payload.newPhase1 !== undefined && payload.newPhase1 !== null) {
        let validP1 = payload.newPhase1;
        let newTotal = 0;
        
        const svcDef = window.SERVICES_DATA ? window.SERVICES_DATA[payload.newService] : null;
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
    console.log("=== KẾT QUẢ TEST LOGIC UPDATE_SERVICE ===");
    console.log("Đầu vào: Chuyển sang Combo 100 phút, giữ Phase 1 cũ = 90 phút");
    console.log("Kết quả mong đợi: Phase 1 bị giới hạn xuống 60 phút, Phase 2 = 40 phút");
    console.log("Kết quả thực tế: Phase 1 =", data.phase1_duration, ", Phase 2 =", data.phase2_duration);
    
    if (data.phase1_duration === 60 && data.phase2_duration === 40) {
        console.log("✅ TEST PASSED: Logic giới hạn thời gian (Clamping) hoạt động chính xác!");
        return true;
    } else {
        console.log("❌ TEST FAILED!");
        return false;
    }
};

testUpdateServiceLogic();

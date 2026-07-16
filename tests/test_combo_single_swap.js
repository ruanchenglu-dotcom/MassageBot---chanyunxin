const fs = require('fs');
const path = require('path');

// 1. 模擬瀏覽器環境
global.window = {};
window.SERVICES_DATA = {
    'Combo 100': { category: 'COMBO', blocks: 20 },
    'Body 90': { category: 'SINGLE', blocks: 18 }
};

window.APP_CONFIG = {
    SCALE: { MAX_BEDS: 2, MAX_CHAIRS: 2 },
    BUFFERS: { TRANSITION_MINUTES: 5, SETUP_MINUTES: 5 }
};

const schedulerCode = fs.readFileSync(path.join(__dirname, '../XinWuChanAdmin/js/cyx_smartScheduler.js'), 'utf8');
eval(schedulerCode); // 注入 SmartScheduler

console.log('開始測試：Combo 和 Single 互換位置 (Single 被設定為 is_locked = true, phase1_locked = false)');

// 2. 準備測試資料
let mockBookings = [
    {
        rowId: "10",
        customerName: "Combo Guest",
        serviceName: "Combo 100",
        status: "WAITING",
        date: "2026/07/16",
        startTimeString: "2026/07/16 10:00",
        duration: 100,
        phase1_duration: 50,
        phase2_duration: 50,
        flow: "FB",
        phase1_res_idx: "BED-1-1",
        phase2_res_idx: "CHAIR-1-1",
        phase1_locked: "FALSE",
        phase2_locked: "FALSE",
        is_locked: "FALSE",
        isManualLocked: false
    },
    {
        rowId: "11",
        customerName: "Single Guest",
        serviceName: "Body 90",
        status: "WAITING",
        date: "2026/07/16",
        startTimeString: "2026/07/16 10:00",
        duration: 90,
        phase1_duration: 90,
        phase2_duration: "",
        flow: "",
        phase1_res_idx: "BED-1-2",
        phase2_res_idx: "",
        phase1_locked: "FALSE",
        phase2_locked: "FALSE",
        is_locked: "TRUE", // 這是之前導致報錯的問題點
        isManualLocked: true
    }
];

// 3. 執行交換：將 Combo (10) 移動到 Single (11) 的床位
console.log('嘗試將 Combo 移至 BED-1-2 (原 Single 床位)...');
try {
    const changes = window.SmartScheduler.solve(mockBookings, "10", "BED-1-2", 1, true);
    console.log("Changes output:", changes);

    if (changes && changes.length > 0) {
        console.log('✅ 測試成功：SmartScheduler 成功處理交換！');
        
        const singleChange = changes.find(c => c.rowId === "11");
        const comboChange = changes.find(c => c.rowId === "10");
        
        console.log(`Single (11) 新床位: ${singleChange.phase1_res_idx} (期望: BED-1-1)`);
        console.log(`Combo (10) 新床位: ${comboChange.phase1_res_idx} (期望: BED-1-2)`);
        
        if (singleChange.phase1_res_idx === "BED-1-1" && comboChange.phase1_res_idx === "BED-1-2") {
            console.log('🎉 互換邏輯完全正確！');
        } else {
            console.error('❌ 互換結果不符預期。');
        }
    } else {
        console.error('❌ 測試失敗：沒有返回任何變更。可能是被鎖定邏輯擋下。');
    }
} catch (error) {
    console.error('❌ 測試失敗：拋出錯誤:', error.message);
}

const http = require('http');

async function runE2ETest() {
    console.log("開始執行智慧排程防衝突端到端測試 (End-to-End Test)...");
    
    // Payload simulates the exact scenario where b26 is pushed to 10:26 
    // and b28 is dragged to 10:21 without overlapping duration.
    const payload = {
        action: 'BATCH_UPDATE_MULTIPLE',
        cyx_data: {
            date: '2026-07-15',
            payloads: [
                {
                    "rowId": "28",
                    "forceSync": true,
                    "is_locked": "TRUE",
                    "isManualLocked": true,
                    "phase1_res_idx": "CHAIR-1-3",
                    "phase2_res_idx": "BED-1-2",
                    "flow": "FB",
                    "transition_time": "2026/07/15 10:21",
                    "phase1_duration": 50,
                    "phase2_duration": 50
                },
                {
                    "rowId": "26",
                    "forceSync": true,
                    "flow": "BF",
                    "phase1_res_idx": "BED-1-2",
                    "phase2_res_idx": "CHAIR-1-3",
                    "phase1_duration": 55,
                    "phase2_duration": 45,
                    "is_locked": "TRUE",
                    "isManualLocked": true,
                    "transition_time": "2026/07/15 10:26"
                }
            ]
        }
    };

    try {
        console.log("發送模擬的排程請求至後端 API...");
        const req = http.request('http://localhost:5001/api/admin-booking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(payload))
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.success) {
                        console.log("✅ 測試通過：系統已正確處理並解決時間衝突，沒有出現錯誤的資源重疊 (RESOURCE_CONFLICT) 警告。");
                    } else {
                        console.error("❌ 測試失敗：系統回報錯誤 -", result.message || data);
                    }
                } catch (e) {
                    console.error("❌ 測試失敗：無法解析回應資料 -", data);
                }
            });
        });
        
        req.on('error', (e) => {
            console.error("❌ 測試失敗：無法連線至伺服器。請確認伺服器已啟動。", e.message);
        });

        req.write(JSON.stringify(payload));
        req.end();

    } catch (e) {
        console.error("❌ 發生未知的錯誤:", e);
    }
}

runE2ETest();

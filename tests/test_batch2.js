async function testBatch2() {
    try {
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

        const res = await fetch('http://localhost:5001/api/admin-booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const text = await res.text();
        console.log('Result:', text);
    } catch (e) {
        console.error(e);
    }
}

testBatch2();

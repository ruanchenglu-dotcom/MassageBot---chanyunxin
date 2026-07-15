const app = require('../cyx_index');

const payload = {
    payloads: [
        {
            "rowId": "28",
            "forceSync": true,
            "is_locked": "TRUE",
            "isManualLocked": true,
            "phase1_res_idx": "CHAIR-1-3",
            "phase2_res_idx": "BED-1-2",
            "flow": "FB"
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
};

const server = app.listen(5002, async () => {
    try {
        console.log('Sending request...');
        const res = await fetch('http://localhost:5002/api/batch-process-bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const text = await res.text();
        console.log(res.status, text);
    } catch (e) {
        console.error(e);
    } finally {
        server.close();
        process.exit(0);
    }
});

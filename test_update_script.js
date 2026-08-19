const axios = require('axios');

async function testUpdate() {
    try {
        const payload = {
            groupUpdates: [
                {
                    rowId: 10,
                    updatedData: {
                        dichVu: "腳底按摩 (90分)",
                        flow: "",
                        phase2_duration: "",
                        phase2_res_idx: "",
                        transition_time: ""
                    }
                }
            ],
            location: '本館'
        };

        const res = await axios.post('http://localhost:5001/api/inline-update-group', payload);
        console.log("SUCCESS:", res.data);
    } catch (e) {
        console.error("FAILED:", e.response ? e.response.data : e.message);
    }
}

testUpdate();

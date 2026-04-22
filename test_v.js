const axios = require("axios");

axios.post("http://localhost:4000/api/batch-process-bookings", {
    payloads: [{ rowId: 10, forceSync: true, final_price: 9999 }]
}).then(r => console.log("Result:", r.data)).catch(e => console.error(e.response ? e.response.data : e.message));

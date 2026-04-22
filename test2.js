const axios = require('axios');
axios.post('http://localhost:4000/api/batch-process-bookings', {
    payloads: [{ rowId: 9, forceSync: true, status: 'COMPLETED', final_price: 1200 }]
}).then(r => console.log('API Result:', r.data)).catch(e => console.error(e));

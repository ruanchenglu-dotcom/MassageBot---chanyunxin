const axios = require("axios");

axios.get("http://localhost:4000/api/info").then(res => {
    const b10 = res.data.bookings.find(b => b.rowId == 10);
    const b11 = res.data.bookings.find(b => b.rowId == 11);
    console.log("Row 10:", b10.final_price, b10.serviceCode, b10.serviceName);
    console.log("Row 11:", b11.final_price, b11.serviceCode, b11.serviceName);
}).catch(console.error);

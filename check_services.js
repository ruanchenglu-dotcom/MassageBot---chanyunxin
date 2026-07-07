const fs = require('fs');
const http = require('http');

http.get('http://localhost:5001/api/info', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const services = json.services;
            console.log(JSON.stringify(services, null, 2));
        } catch (err) {
            console.log("Error: " + err.message);
        }
    });
});

const fs = require('fs');
const http = require('http');

http.get('http://localhost:5001/api/info', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const staff = json.staffList;
            console.log(`Total staff: ${staff.length}`);
            let availableCount = 0;
            staff.forEach(s => {
                const isOff = s['2026-06-07'] === 'OFF' || s['2026-06-07'] === 'X' || (s.offDays && s.offDays.includes('2026-06-07'));
                if (!isOff) {
                    availableCount++;
                    console.log(`Staff: ${s.id}, Start: ${s.start || s['上班']}, End: ${s.end || s['下班']}`);
                }
            });
            console.log(`Available on 2026-06-07: ${availableCount}`);
        } catch (err) {
            console.log("JSON Parse Error: " + err.message);
            console.log(data);
        }
    });
}).on('error', (err) => {
    console.log("Error: " + err.message);
});

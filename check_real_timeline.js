const fs = require('fs');
const http = require('http');
const core = require('./cyx_resource_core.js');

http.get('http://localhost:5001/api/info?forceRefresh=true', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const staffList = json.staffList;
            const bookings = json.bookings;
            const testDate = "2026-07-07";
            
            let guestDetails = [{ service: "套餐 (100分)", serviceCode: "A3", overrideDuration: 100, staff: "RANDOM", staffName: "RANDOM", flowCode: "FB", isYouTui: false, isGuaSha: false, isHuaGuan: false, isBaGuan: false }];

            if (typeof core.initializeCore === 'function') core.initializeCore();
            core.setDynamicServices(json.services);

            // Reconstruct callCoreAvailabilityCheck mapping
            const coreGuests = guestDetails.map(g => {
                return {
                    serviceCode: g.serviceCode,
                    staffName: g.staffName,
                    flowCode: g.flowCode,
                    overrideDuration: g.overrideDuration
                };
            });

            const staffMap = {};
            let availableCount = 0;
            staffList.forEach(s => {
                const offDates = Array.isArray(s.offDays) ? s.offDays : [];
                const isOff = offDates.includes(testDate) || s[testDate] === 'OFF' || s[testDate] === 'X' || s[testDate] === '休';
                const sTime = s[testDate] && s[testDate].includes('-') ? s[testDate].split('-')[0] : s.start || s['上班'];
                const eTime = s[testDate] && s[testDate].includes('-') ? s[testDate].split('-')[1] : s.end || s['下班'];
                staffMap[s.id] = { id: s.id, gender: s.gender, start: sTime, end: eTime, off: isOff };
                if (!isOff) availableCount++;
            });
            console.log(`Available Staff on ${testDate}: ${availableCount}`);

            console.log("\n\n--- Testing 17:40 with A3 and Real Staff ---");
            let res1 = core.checkRequestAvailability(testDate, "17:40", coreGuests, bookings, staffMap, { location: "本館" });
            console.log(JSON.stringify(res1, null, 2));

        } catch (err) {
            console.log("Error: " + err.message);
        }
    });
});

const core = require('./cyx_resource_core.js');
const fs = require('fs');
const bookings = JSON.parse(fs.readFileSync('bookings_0604.json'));
const guestList = [{ idx: 0, service: 'Combo 535', serviceCode: '535', flowCode: 'FB' }, { idx: 1, service: 'Combo 535', serviceCode: '535', flowCode: 'FB' }];

// Mock staff count to be high to bypass validateGlobalCapacity (if it uses length of staffList to check limits)
const staffList = {
  'A': { name: 'A', gender: 'F' }, 'B': { name: 'B', gender: 'F' }, 'C': { name: 'C', gender: 'F' }, 'D': { name: 'D', gender: 'F' },
  'E': { name: 'E', gender: 'F' }, 'F': { name: 'F', gender: 'F' }, 'G': { name: 'G', gender: 'F' }, 'H': { name: 'H', gender: 'F' },
  'I': { name: 'I', gender: 'F' }, 'J': { name: 'J', gender: 'F' }, 'K': { name: 'K', gender: 'F' }, 'L': { name: 'L', gender: 'F' }
};

core.setDynamicServices({
    '4': { duration: 110, category: 'COMBO', phase1_duration: 50, phase2_duration: 60 },
    '535': { duration: 130, category: 'COMBO', phase1_duration: 65, phase2_duration: 65 },
    '465': { duration: 60, category: 'BODY' },
    '554': { duration: 70, category: 'FOOT' },
    '413': { duration: 70, category: 'BODY' }
});

console.log("---- Testing 16:00 ----");
console.log(core.checkRequestAvailability("2026/06/04", "16:00", guestList, bookings, staffList));

console.log("\n---- Testing 16:20 ----");
console.log(core.checkRequestAvailability("2026/06/04", "16:20", guestList, bookings, staffList));

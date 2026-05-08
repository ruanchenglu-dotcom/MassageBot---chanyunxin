const fs = require('fs');
const Core = require('./cyx_resource_core.js');

const CONF = { MAX_CHAIRS: 9, MAX_BEDS: 9, CLEANUP_BUFFER: 5, TRANSITION_BUFFER: 5, TOLERANCE: 5 };
const { checkRequestAvailability, setDynamicServices } = Core;

// Set up mock services
setDynamicServices({
    'FOOT': { name: '腳底按摩', duration: 120, type: 'CHAIR', category: 'FOOT', price: 1000 },
    'COMBO': { name: '套餐(120分)', duration: 120, type: 'BED', category: 'COMBO', price: 1200 }
});

const staffList = {};
for (let i = 1; i <= 20; i++) {
    staffList[`S${i}`] = { name: `S${i}`, gender: 'F', start: '00:00', end: '23:59', isAvailable: true };
}

// Giả lập lịch sử đặt lịch (Ghost Coordinates Test)
const existingBookings = [];

// CHAIR-1 đến CHAIR-8 có khách từ 02:15 đến 04:15
for (let i = 1; i <= 8; i++) {
    existingBookings.push({
        rowId: 100 + i, startTimeString: '2026/05/09 02:15', startTime: '02:15',
        duration: 120, serviceCode: 'FOOT', serviceName: '腳底按摩', flow: 'FOOTSINGLE',
        status: 'SERVING', allocated_resource: `CHAIR-${i}`, opDate: '2026/05/09',
        isManualLocked: false
    });
}

// CHAIR-9 có khách từ 01:15 đến 02:15
existingBookings.push({
    rowId: 109, startTimeString: '2026/05/09 01:15', startTime: '01:15',
    duration: 60, serviceCode: 'FOOT', serviceName: '腳底按摩', flow: 'FOOTSINGLE',
    status: 'SERVING', allocated_resource: `CHAIR-9`, opDate: '2026/05/09',
    isManualLocked: false
});

// Khách mới đặt Combo lúc 02:10 (Phase 1: BED 02:10-03:10, Phase 2: CHAIR 03:15-04:15)
const newGuestList = [
    { serviceCode: 'COMBO', serviceName: '套餐(120分)', flowCode: 'BF', staffName: 'RANDOM' }
];

console.log("=== BẮT ĐẦU TEST MATRIX GHOST COORDINATE ===");
const result = checkRequestAvailability('2026/05/09', '02:10', newGuestList, existingBookings, staffList);

console.log("Feasible:", result.feasible);
if (result.feasible && result.details) {
    console.log("Phân bổ Phase 1 (BED):", result.details[0].allocated[0] || "NULL");
    console.log("Phân bổ Phase 2 (CHAIR):", result.details[0].allocated[1] || "NULL");
    
    if (result.details[0].allocated[1] === 'CHAIR-9') {
        console.log("✅ THÀNH CÔNG: VirtualMatrix đã chọn đúng CHAIR-9 (rỗng) thay vì CHAIR-1!");
    } else {
        console.log("❌ THẤT BẠI: VirtualMatrix đã chọn sai ghế:", result.details[0].allocated[1]);
    }
} else {
    console.log("Reason:", result.reason);
}

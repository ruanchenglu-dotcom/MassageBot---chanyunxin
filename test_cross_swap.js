const fs = require('fs');
const core = require('./cyx_resource_core.js');

const currentBookings = [];
const staffList = {
    'S1': { start: '00:00', end: '23:59', gender: 'M' },
    'S2': { start: '00:00', end: '23:59', gender: 'F' },
    'S3': { start: '00:00', end: '23:59', gender: 'M' },
    'S4': { start: '00:00', end: '23:59', gender: 'F' }
};

// Test: 4 Combo Guests
const guests = [
  { idx: 0, serviceCode: 'A3', serviceName: '套餐 (100分)', flowCode: 'FB' },
  { idx: 1, serviceCode: 'A3', serviceName: '套餐 (100分)', flowCode: 'FB' },
  { idx: 2, serviceCode: 'A3', serviceName: '套餐 (100分)', flowCode: 'FB' },
  { idx: 3, serviceCode: 'A3', serviceName: '套餐 (100分)', flowCode: 'FB' }
];

const reqStart = 600; // 10:00
const maxDuration = 100;
const dateStr = '2026-07-15';
const timeStr = '10:00';

console.log("=== Testing 4 Combo Guests Cross Swap ===");
const scenario = core.checkRequestAvailability(dateStr, timeStr, guests, currentBookings, staffList, { location: '本館', ignoreStaffCheck: true });

if (scenario.feasible) {
    console.log("Scenario Passed!");
    console.log("Allocated details:");
    scenario.details.forEach(d => {
        console.log(`Guest ${d.guestIndex}: Flow=${d.flow}, P1_Res=${d.phase1_res_idx}, P2_Res=${d.phase2_res_idx}`);
    });
    
    // Auto Validate Cross-Swap
    let swapPass = true;
    const bf1 = scenario.details.find(d => d.guestIndex === 0);
    const bf2 = scenario.details.find(d => d.guestIndex === 1);
    const fb1 = scenario.details.find(d => d.guestIndex === 2);
    const fb2 = scenario.details.find(d => d.guestIndex === 3);

    if (bf1.phase1_res_idx !== fb1.phase2_res_idx || bf1.phase2_res_idx !== fb1.phase1_res_idx) {
        console.error("❌ Pair 1 did NOT swap correctly!");
        swapPass = false;
    } else {
        console.log("✅ Pair 1 (Guest 0 & 2) swapped correctly!");
    }

    if (bf2.phase1_res_idx !== fb2.phase2_res_idx || bf2.phase2_res_idx !== fb2.phase1_res_idx) {
        console.error("❌ Pair 2 did NOT swap correctly!");
        swapPass = false;
    } else {
        console.log("✅ Pair 2 (Guest 1 & 3) swapped correctly!");
    }

    if(swapPass) {
        console.log("✨ ALL CROSS-SWAP TESTS PASSED ✨");
    } else {
        process.exit(1);
    }
} else {
    console.log("Scenario Failed:", scenario.reason);
    process.exit(1);
}

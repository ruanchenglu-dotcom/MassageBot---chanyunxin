const fs = require('fs');
const core = require('./cyx_resource_core.js');

const currentBookings = [
  {
    "id": "B_1",
    "customerName": "方(1/6)",
    "serviceName": "腳",
    "serviceCode": "F1",
    "startTime": "18:00",
    "duration": 81,
    "flow": "FOOTSINGLE",
    "status": "RUNNING",
    "location": "本館",
    "phase1_res_idx": "CHAIR-1-1"
  },
  {
    "id": "B_2",
    "customerName": "方(2/6)",
    "serviceName": "腳",
    "serviceCode": "F1",
    "startTime": "18:00",
    "duration": 81,
    "flow": "FOOTSINGLE",
    "status": "RUNNING",
    "location": "本館",
    "phase1_res_idx": "CHAIR-1-2"
  },
  {
    "id": "B_3",
    "customerName": "方(3/6)",
    "serviceName": "腳",
    "serviceCode": "F1",
    "startTime": "18:00",
    "duration": 81,
    "flow": "FOOTSINGLE",
    "status": "RUNNING",
    "location": "本館",
    "phase1_res_idx": "CHAIR-1-3"
  },
  {
    "id": "B_4",
    "customerName": "方(4/6)",
    "serviceName": "腳",
    "serviceCode": "F1",
    "startTime": "18:00",
    "duration": 81,
    "flow": "FOOTSINGLE",
    "status": "RUNNING",
    "location": "本館",
    "phase1_res_idx": "CHAIR-1-4"
  },
  {
    "id": "B_5",
    "customerName": "方(5/6)",
    "serviceName": "腳",
    "serviceCode": "F1",
    "startTime": "18:00",
    "duration": 81,
    "flow": "FOOTSINGLE",
    "status": "RUNNING",
    "location": "本館",
    "phase1_res_idx": "CHAIR-1-5"
  },
  {
    "id": "B_6",
    "customerName": "方(6/6)",
    "serviceName": "腳",
    "serviceCode": "F1",
    "startTime": "18:00",
    "duration": 81,
    "flow": "FOOTSINGLE",
    "status": "RUNNING",
    "location": "本館",
    "phase1_res_idx": "CHAIR-1-6"
  }
];
const staffList = {}; // Emulated empty staff

const guests = [
  { idx: 0, serviceCode: 'A3', serviceName: '套餐 (100分)', flowCode: 'FB' },
  { idx: 1, serviceCode: 'A3', serviceName: '套餐 (100分)', flowCode: 'FB' },
  { idx: 2, serviceCode: 'A3', serviceName: '套餐 (100分)', flowCode: 'FB' }
];

const reqStart = 1160; // 19:20
const maxDuration = 100;
const dateStr = '2024-07-30'; // Based on screenshot

const res = core.validateGlobalCapacity(reqStart, maxDuration, guests, currentBookings, staffList, dateStr, false, '本館');
console.log("Validate:", res.reason || res.pass);

const scenario = core.calculateScenario(guests, reqStart, dateStr, '本館', currentBookings, staffList);
console.log("Scenario Result:", scenario.pass, scenario.reason);
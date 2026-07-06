const core = require('./cyx_resource_core.js');

let duration = 100;
let step = 1; 
let limit = 20;
let flow = 'FB';
let isScanMode = true;

console.log(core.generateElasticSplits(duration, step, limit, null, 30, 60, 40, 70, flow, isScanMode));

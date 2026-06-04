const fs = require('fs');
const frontend = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');
const core = fs.readFileSync('cyx_resource_core.js', 'utf8');

const coreCodeStart = core.indexOf('function checkRequestAvailability');
const coreCodeEnd = core.indexOf('if (typeof module !== \'undefined\')');
if (coreCodeStart === -1 || coreCodeEnd === -1) {
    console.error("Could not find core logic markers");
    process.exit(1);
}

const coreCode = core.substring(coreCodeStart, coreCodeEnd);

const frontendStartIdx = frontend.indexOf('function checkRequestAvailability');
const frontendEndIdx = frontend.indexOf('return { checkRequestAvailability, setDynamicServices };');

if (frontendStartIdx === -1 || frontendEndIdx === -1) {
    console.error("Could not find frontend logic markers");
    process.exit(1);
}

// Adjust frontend to replace the whole body
const newFrontend = frontend.substring(0, frontendStartIdx) + coreCode + '        ' + frontend.substring(frontendEndIdx);
fs.writeFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', newFrontend, 'utf8');
console.log("Patched successfully!");

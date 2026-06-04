const fs = require('fs');

const frontendFile = 'XinWuChanAdmin/js/cyx_bookingHandler.js';
const coreFile = 'cyx_resource_core.js';

let frontend = fs.readFileSync(frontendFile, 'utf8');
const core = fs.readFileSync(coreFile, 'utf8');

// Find CoreKernel bounds in frontend
const kernelStartStr = 'const CoreKernel = (function () {';
const kernelStart = frontend.indexOf(kernelStartStr);

// We find the exact string that ends CoreKernel block
const kernelEndStr = '        return { checkRequestAvailability, setDynamicServices };\r\n    })();';
let kernelEnd = frontend.indexOf(kernelEndStr);
if (kernelEnd === -1) {
    kernelEnd = frontend.indexOf('        return { checkRequestAvailability, setDynamicServices };\n    })();');
}

if (kernelStart === -1 || kernelEnd === -1) {
    console.error("Could not find CoreKernel bounds");
    process.exit(1);
}

// Add length of kernelEndStr
kernelEnd += kernelEndStr.length;

// Extract core logic
const exportIdx = core.indexOf("if (typeof module !== 'undefined'");
if (exportIdx === -1) {
    console.error("Could not find module export in core");
    process.exit(1);
}
const coreBody = core.substring(0, exportIdx);

// Build new CoreKernel
const newCoreKernel = `const CoreKernel = (function () {
// --- START CORE LOGIC V118.0 ---
${coreBody}
// --- END CORE LOGIC ---
    return {
        checkRequestAvailability: CoreAPI.checkRequestAvailability,
        setDynamicServices: CoreAPI.setDynamicServices,
        getSystemConfig: () => CoreAPI.CONFIG,
        CONFIG: CoreAPI.CONFIG
    };
})();`;

// Reconstruct frontend
frontend = frontend.substring(0, kernelStart) + newCoreKernel + frontend.substring(kernelEnd);

fs.writeFileSync(frontendFile, frontend, 'utf8');
console.log("Patched successfully!");

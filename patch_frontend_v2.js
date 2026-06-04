const fs = require('fs');

// Read files with proper encoding
const frontend = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');
const core = fs.readFileSync('cyx_resource_core.js', 'utf8');

// Find CoreKernel bounds in frontend
const kernelStart = frontend.indexOf('const CoreKernel = (function () {');
const kernelEndPattern = '    })();\r\n\r\n    // ========================================================================';
let kernelEnd = frontend.indexOf(kernelEndPattern);
if (kernelEnd === -1) {
    kernelEnd = frontend.indexOf('    })();\n\n    // ========================================================================');
}
if (kernelEnd === -1) {
    console.error("Could not find CoreKernel end");
    process.exit(1);
}
kernelEnd += 13;

// We need everything in core up to "if (typeof module !== 'undefined'"
const exportIdx = core.indexOf("if (typeof module !== 'undefined'");
if (exportIdx === -1) {
    console.error("Could not find export logic in core");
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
const newFrontend = frontend.substring(0, kernelStart) + newCoreKernel + frontend.substring(kernelEnd);

fs.writeFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', newFrontend, 'utf8');
console.log("Patched successfully!");

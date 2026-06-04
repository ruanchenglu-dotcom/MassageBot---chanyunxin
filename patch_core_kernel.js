const fs = require('fs');

// Read files
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
// Add length of `    })();`
kernelEnd += 13;

// Find Core code bounds
const moduleExportIdx = core.indexOf("const CoreAPI = {");
if (moduleExportIdx === -1) {
    console.error("Could not find module export in core");
    process.exit(1);
}
const coreCodeBody = core.substring(0, moduleExportIdx);

// Build new CoreKernel
const newCoreKernel = `const CoreKernel = (function () {
// --- START CORE LOGIC ---
${coreCodeBody}
// --- END CORE LOGIC ---
    return {
        checkRequestAvailability: checkRequestAvailability,
        setDynamicServices: CoreAPI.setDynamicServices,
        getSystemConfig: getSystemConfig,
        CONFIG: CONF
    };
})();`;

// Reconstruct frontend
const newFrontend = frontend.substring(0, kernelStart) + newCoreKernel + frontend.substring(kernelEnd);

fs.writeFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', newFrontend, 'utf8');
console.log("Patched successfully!");

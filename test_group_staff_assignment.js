const assert = require('assert');
const fs = require('fs');
const path = require('path');

const cyxAppSrc = fs.readFileSync(path.join(__dirname, 'XinWuChanAdmin', 'js', 'cyx_app.js'), 'utf8');

// Extract getBookingSignature
const sigMatch = cyxAppSrc.match(/const getBookingSignature = \([\s\S]*?\};/);
if (!sigMatch) {
    console.error("Could not find getBookingSignature function in cyx_app.js");
    process.exit(1);
}

// We need getNormalizedPhone as well
const phoneMatch = cyxAppSrc.match(/const getNormalizedPhone = \([\s\S]*?\};/);

const phoneSource = phoneMatch[0].replace('const getNormalizedPhone', 'global.getNormalizedPhone');
const sigSource = sigMatch[0].replace('const getBookingSignature', 'global.getBookingSignature');

eval(phoneSource);
eval(sigSource);

function runTest() {
    console.log("Running E2E Test: Group Staff Assignment Signature Unique Check...");
    
    const guest1 = {
        rowId: 25,
        startTimeString: "2026-07-27 12:00",
        customerName: "游小姐 (1/2)",
        phone: "0912345678",
        serviceName: "指壓"
    };

    const guest2 = {
        rowId: 26,
        startTimeString: "2026-07-27 12:00",
        customerName: "游小姐 (2/2)",
        phone: "0912345678",
        serviceName: "指壓"
    };

    const sig1 = getBookingSignature(guest1);
    const sig2 = getBookingSignature(guest2);

    console.log(`Signature 1: ${sig1}`);
    console.log(`Signature 2: ${sig2}`);

    assert(sig1 !== sig2, "Signatures for Guest 1 and Guest 2 MUST be unique!");
    console.log("✅ Test Passed: Signatures are unique, preventing group members from merging in signatureMap.");
}

runTest();

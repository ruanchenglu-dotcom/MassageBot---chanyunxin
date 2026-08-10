const fs = require('fs');

const kernelCode = fs.readFileSync('./js/cyx_bookingHandler.js', 'utf8');
const endIdx = kernelCode.indexOf('const NewAvailabilityCheckModal =');
const safeKernelCode = kernelCode.slice(0, endIdx);

// Mock DOM/Window
global.window = {
    SYSTEM_CONFIG: {
        MAX_BEDS: 6,
        MAX_CHAIRS: 6,
        OPP_BEDS: 6,
        OPP_CHAIRS: 4,
        CLEANUP_BUFFER: 5,
        TRANSITION_MINUTES: 5,
    },
    SERVICES_DATA: {
        "BODY120": { name: "身體按摩", duration: 120, category: "BODY", price: 1800 },
        "BODY90": { name: "身體按摩", duration: 90, category: "BODY", price: 1350 },
        "BODY60": { name: "身體按摩", duration: 60, category: "BODY", price: 900 },
        "FOOT120": { name: "腳底按摩", duration: 120, category: "FOOT", price: 1800 },
        "FOOT60": { name: "腳底按摩", duration: 60, category: "FOOT", price: 900 }
    },
    normalizeStaffId: (id) => id,
    getServiceCodeByName: (name) => {
        if (name.includes('身體') && name.includes('120')) return 'BODY120';
        if (name.includes('身體') && name.includes('90')) return 'BODY90';
        if (name.includes('身體') && name.includes('60')) return 'BODY60';
        if (name.includes('腳底') && name.includes('120')) return 'FOOT120';
        if (name.includes('腳底') && name.includes('60')) return 'FOOT60';
        return 'BODY60';
    }
};

eval(safeKernelCode);
const CoreKernel = window.CoreKernel;
CoreKernel.SERVICES = window.SERVICES_DATA;

// Define data
const todaysBookings = [
    { rowId: "1", date: "2024-10-24", startTimeString: " 11:30", staffName: "方", serviceName: "腳底按摩 (120分)", pax: "6", status: "WAITING", flowCode: "FOOTSINGLE", originalData: { status: "WAITING" }, duration: 120 },
    { rowId: "2", date: "2024-10-24", startTimeString: " 12:46", staffName: "葉", serviceName: "身體按摩 (60分)", pax: "4", status: "WAITING", flowCode: "BODYSINGLE", originalData: { status: "WAITING" }, duration: 60 },
    { rowId: "3", date: "2024-10-24", startTimeString: " 14:01", staffName: "康", serviceName: "身體按摩 (90分)", pax: "4", status: "WAITING", flowCode: "BODYSINGLE", originalData: { status: "WAITING" }, duration: 90 },
];

const staffList = {};
for (let i = 1; i <= 15; i++) {
    staffList[`Staff${i}`] = { shiftType: 'ALL_DAY' };
}
staffList['方'] = { shiftType: 'ALL_DAY' };
staffList['葉'] = { shiftType: 'ALL_DAY' };
staffList['康'] = { shiftType: 'ALL_DAY' };

const guestDetails = [{
    service: "身體按摩",
    serviceCode: "BODY120",
    serviceName: "身體按摩 (120分)",
    staff: "隨機",
    overrideDuration: 120,
    flowCode: "BODYSINGLE"
}];

console.log("Running CoreKernel Check...");
const result = window.cyxCallCoreAvailabilityCheck("2024-10-24", "14:10", guestDetails, todaysBookings, Object.values(staffList));
console.log("Result:");
console.log(JSON.stringify(result, null, 2));


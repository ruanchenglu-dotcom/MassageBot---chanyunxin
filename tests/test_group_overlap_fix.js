const SheetService = require('../cyx_sheet_service.js');
const ResourceCore = require('../cyx_resource_core.js');

// MOCK SHEET ID to bypass check
global.SHEET_ID = "mock_sheet_id";
global.BOOKING_SHEET_NAME = "Bookings";

// Mock STATE
SheetService.STATE = {
    cachedBookings: [
        {
            rowId: 11,
            date: "2026/07/20",
            startTimeString: "2026/07/20 11:20",
            startTime: "11:20",
            customerName: "Khách A (1/2)",
            serviceName: "套餐 (100分)",
            serviceCode: "C1",
            category: "COMBO",
            duration: 100,
            phase1_duration: 60,
            phase2_duration: 40,
            status: "CONFIRMED",
            resourceId: "CHAIR-1-1",
            phase1_res_idx: "CHAIR-1-1",
            phase2_res_idx: "BED-1-2",
            resource_type: "COMBO",
            price: 1000,
            flow: "FB"
        },
        {
            rowId: 12,
            date: "2026/07/20",
            startTimeString: "2026/07/20 11:20",
            startTime: "11:20",
            customerName: "Khách A (2/2)",
            serviceName: "套餐 (100分)",
            serviceCode: "C1",
            category: "COMBO",
            duration: 100,
            phase1_duration: 60,
            phase2_duration: 40,
            status: "CONFIRMED",
            resourceId: "CHAIR-1-2",
            phase1_res_idx: "CHAIR-1-2",
            phase2_res_idx: "BED-1-3",
            resource_type: "COMBO",
            price: 1000,
            flow: "FB"
        }
    ],
    SERVICES: {
        'C1': { category: 'COMBO', duration: 100, price: 1000, type: 'COMBO' },
        'F1': { category: 'FOOT', duration: 70, price: 700, type: 'CHAIR' },
        'B1': { category: 'BODY', duration: 60, price: 600, type: 'BED' }
    },
    STAFF_LIST: [],
    isSyncing: false
};

// Inject ResourceCore vào SheetService
global.ResourceCore = ResourceCore;

// Mock Google Sheets API
SheetService.sheets = {
    spreadsheets: {
        values: {
            get: async (params) => {
                const rowId = parseInt(params.range.match(/\d+/)[0]);
                let row = new Array(50).fill("");
                if (rowId === 11) {
                    row[0] = "2026/07/20"; row[1] = "11:20"; row[2] = "Khách A (1/2)"; row[4] = "套餐 (100分)";
                    row[18] = 1000; row[24] = "C1"; row[25] = "FB"; row[28] = 60; row[30] = 40;
                    row[32] = "CHAIR-1-1"; row[33] = "BED-1-2"; row[34] = "COMBO";
                } else if (rowId === 12) {
                    row[0] = "2026/07/20"; row[1] = "11:20"; row[2] = "Khách A (2/2)"; row[4] = "套餐 (100分)";
                    row[18] = 1000; row[24] = "C1"; row[25] = "FB"; row[28] = 60; row[30] = 40;
                    row[32] = "CHAIR-1-2"; row[33] = "BED-1-3"; row[34] = "COMBO";
                }
                return { data: { values: [row] } };
            },
            update: async (params) => {
                return { data: { updatedCells: 1 } };
            }
        }
    }
};

async function runTest() {
    console.log("=== START TEST: COMBO TO FOOT GROUP DOWNGRADE ===");
    
    // Simulate updating Khách 1
    const updateData1 = {
        dichVu: "腳底按摩 (70分)",
        serviceCode: "F1",
        duration: 70,
        flow: "FOOTSINGLE",
        ignoreOverlap: true,
        phase1_duration: 70,
        phase2_duration: "",
        phase2_res_idx: ""
    };
    
    console.log("Updating Row 11...");
    await SheetService.updateInlineBooking(11, updateData1);
    
    let mem1 = SheetService.STATE.cachedBookings.find(b => b.rowId === 11);
    console.log(`Row 11 After Update -> Category: ${mem1.category}, ResType: ${mem1.resource_type}, Price: ${mem1.price}, Phase1: ${mem1.phase1_res_idx}`);
    
    // Simulate updating Khách 2
    const updateData2 = {
        dichVu: "腳底按摩 (70分)",
        serviceCode: "F1",
        duration: 70,
        flow: "FOOTSINGLE",
        ignoreOverlap: true,
        phase1_duration: 70,
        phase2_duration: "",
        phase2_res_idx: ""
    };
    
    console.log("Updating Row 12...");
    await SheetService.updateInlineBooking(12, updateData2);
    
    let mem2 = SheetService.STATE.cachedBookings.find(b => b.rowId === 12);
    console.log(`Row 12 After Update -> Category: ${mem2.category}, ResType: ${mem2.resource_type}, Price: ${mem2.price}, Phase1: ${mem2.phase1_res_idx}`);

    if (mem1.phase1_res_idx === mem2.phase1_res_idx) {
        console.error("❌ TEST FAILED: Row 11 và Row 12 bị trùng ghế: " + mem1.phase1_res_idx);
        process.exit(1);
    } else {
        console.log("✅ TEST PASSED: Hệ thống đã phát hiện ghế bị chiếm và phân bổ đúng 2 ghế khác nhau!");
        process.exit(0);
    }
}

runTest().catch(console.error);

const SheetService = require('../cyx_sheet_service.js');
const ResourceCore = require('../cyx_resource_core.js');

// MOCK SHEET ID to bypass check
global.SHEET_ID = "mock_sheet_id";
global.BOOKING_SHEET_NAME = "Bookings";

// Mock STATE
SheetService.STATE = {
    cachedBookings: [
        {
            rowId: 8,
            date: "2026/07/20",
            startTimeString: "2026/07/20 13:10",
            startTime: "13:10",
            customerName: "Khách B (1/3)",
            serviceName: "套餐 (100分)",
            serviceCode: "C1",
            category: "COMBO",
            duration: 100,
            phase1_duration: 60,
            phase2_duration: 40,
            status: "CONFIRMED",
            resourceId: "CHAIR-1-4",
            phase1_res_idx: "CHAIR-1-4",
            phase2_res_idx: "BED-1-1",
            resource_type: "COMBO",
            price: 1000,
            flow: "FB"
        },
        {
            rowId: 9,
            date: "2026/07/20",
            startTimeString: "2026/07/20 13:10",
            startTime: "13:10",
            customerName: "Khách B (2/3)",
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
            rowId: 10,
            date: "2026/07/20",
            startTimeString: "2026/07/20 13:10",
            startTime: "13:10",
            customerName: "Khách B (3/3)",
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
                if (rowId === 8) {
                    row[0] = "2026/07/20"; row[1] = "13:10"; row[2] = "Khách B (1/3)"; row[4] = "套餐 (100分)";
                    row[18] = 1000; row[24] = "C1"; row[25] = "FB"; row[28] = 60; row[30] = 40;
                    row[32] = "CHAIR-1-4"; row[33] = "BED-1-1"; row[34] = "COMBO";
                } else if (rowId === 9) {
                    row[0] = "2026/07/20"; row[1] = "13:10"; row[2] = "Khách B (2/3)"; row[4] = "套餐 (100分)";
                    row[18] = 1000; row[24] = "C1"; row[25] = "FB"; row[28] = 60; row[30] = 40;
                    row[32] = "CHAIR-1-1"; row[33] = "BED-1-2"; row[34] = "COMBO";
                } else if (rowId === 10) {
                    row[0] = "2026/07/20"; row[1] = "13:10"; row[2] = "Khách B (3/3)"; row[4] = "套餐 (100分)";
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
    console.log("=== START TEST: COMBO TO FOOT GROUP DOWNGRADE (3 PAX) ===");
    
    const updatePayload = {
        dichVu: "腳底按摩 (70分)",
        serviceCode: "F1",
        duration: 70,
        flow: "FOOTSINGLE",
        ignoreOverlap: true,
        phase1_duration: 70,
        phase2_duration: "",
        phase2_res_idx: ""
    };
    
    console.log("Updating Row 8...");
    await SheetService.updateInlineBooking(8, updatePayload);
    let mem8 = SheetService.STATE.cachedBookings.find(b => b.rowId === 8);
    console.log(`Row 8 After Update -> Phase1: ${mem8.phase1_res_idx}`);
    
    console.log("Updating Row 9...");
    await SheetService.updateInlineBooking(9, updatePayload);
    let mem9 = SheetService.STATE.cachedBookings.find(b => b.rowId === 9);
    console.log(`Row 9 After Update -> Phase1: ${mem9.phase1_res_idx}`);

    console.log("Updating Row 10...");
    await SheetService.updateInlineBooking(10, updatePayload);
    let mem10 = SheetService.STATE.cachedBookings.find(b => b.rowId === 10);
    console.log(`Row 10 After Update -> Phase1: ${mem10.phase1_res_idx}`);

    const chairs = [mem8.phase1_res_idx, mem9.phase1_res_idx, mem10.phase1_res_idx];
    const uniqueChairs = new Set(chairs);
    if (uniqueChairs.size < 3) {
        console.error(`❌ TEST FAILED: Bị trùng ghế! Các ghế được gán: ${chairs.join(', ')}`);
        process.exit(1);
    } else {
        console.log(`✅ TEST PASSED: Không trùng ghế! Các ghế được gán: ${chairs.join(', ')}`);
        process.exit(0);
    }
}

runTest().catch(console.error);

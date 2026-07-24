const Module = require('module');
const originalRequire = Module.prototype.require;

let updatedRow = null;
let testRow = new Array(50).fill("");
testRow[1] = "12:50"; // B
testRow[9] = "🟡服務中"; // J
testRow[25] = "FB"; // Z
testRow[26] = "12:50"; // AA
testRow[27] = "12:51"; // AB
testRow[28] = "30"; // AC
testRow[29] = "13:21"; // AD
testRow[30] = "60"; // AE
testRow[31] = "14:21"; // AF

Module.prototype.require = function (path) {
    if (path === 'googleapis') {
        return {
            google: {
                auth: {
                    GoogleAuth: class { getClient() { return {}; } }
                },
                sheets: function() {
                    return {
                        spreadsheets: {
                            values: {
                                get: async (params) => {
                                    console.log("[Mock] Nhận yêu cầu GET data từ Google Sheet cho range:", params.range);
                                    return { data: { values: [[...testRow]] } };
                                },
                                update: async (params) => {
                                    console.log("[Mock] Nhận yêu cầu UPDATE data lên Google Sheet cho range:", params.range);
                                    updatedRow = params.requestBody.values[0];
                                    return { data: {} };
                                },
                                batchUpdate: async (params) => {
                                    return { data: {} };
                                }
                            }
                        }
                    };
                }
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

const SheetService = require('./cyx_sheet_service.js');

async function runTest() {
    console.log("== BẮT ĐẦU TEST TỰ ĐỘNG (End-to-End Test Mock) ==");

    SheetService.STATE = {
        cachedBookings: [
            {
                rowId: 999,
                status: "🟡服務中",
                isRunning: true,
                startTime_sheet: "12:51",
                duration: 90,
                phase1_duration: 30,
                phase2_duration: 60,
                flow: "FB"
            }
        ],
        SERVICES: {}
    };

    console.log("Kịch bản: Khách đang làm (B: 12:50, AB: 12:51). Đổi thời lượng Phase 1 từ 30 -> 40.");
    
    try {
        await SheetService.updateInlineBooking(999, {
            phase1_duration: 40,
            phase2_duration: 60
        });
        
        console.log("\n== KẾT QUẢ CẬP NHẬT TRÊN DÒNG ==");
        console.log("Cột B (Booking Time):", updatedRow[1]);
        console.log("Cột AB (Actual Start Time):", updatedRow[27]);
        console.log("Cột AC (Phase 1 Duration):", updatedRow[28]);
        console.log("Cột AD (Transition Time / P2 Start):", updatedRow[29]);
        console.log("Cột AE (Phase 2 Duration):", updatedRow[30]);
        console.log("Cột AF (Finish Time):", updatedRow[31]);
        
        let passed = true;
        if (updatedRow[1] !== "12:50") {
            console.error("❌ FAIL: Cột B bị ghi đè! Đáng lẽ phải là 12:50");
            passed = false;
        }
        if (updatedRow[27] !== "12:51") {
            console.error("❌ FAIL: Cột AB bị ghi đè! Đáng lẽ phải giữ nguyên 12:51");
            passed = false;
        }
        if (updatedRow[28] != 40) {
            console.error("❌ FAIL: Cột AC không được cập nhật thành 40");
            passed = false;
        }
        if (updatedRow[29] !== "13:31") {
            console.error("❌ FAIL: Cột AD tính toán sai! Đáng lẽ phải là 13:31 (12:51 + 40p)");
            passed = false;
        }
        if (updatedRow[31] !== "14:31") {
            console.error("❌ FAIL: Cột AF tính toán sai! Đáng lẽ phải là 14:31 (12:51 + 40p + 60p)");
            passed = false;
        }
        
        if (passed) {
            console.log("\n✅ ALL TESTS PASSED! Tính năng chặn ghi đè hoạt động hoàn hảo.");
        } else {
            console.log("\n❌ CÓ LỖI XẢY RA TRONG QUÁ TRÌNH KIỂM THỬ.");
        }
    } catch (e) {
        console.error("Lỗi khi chạy test:", e);
    }
}

runTest();

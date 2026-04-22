require("dotenv").config();
const SheetService = require("./cyx_sheet_service.js");
SheetService.init().then(async () => {
    console.log("Testing batchUpdateMultipleBookings on row 10...");
    await SheetService.batchUpdateMultipleBookings([{ rowId: 10, forceSync: true, final_price: 8888 }]);
    console.log("Done");
});

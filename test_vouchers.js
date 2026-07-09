const SheetService = require('./cyx_sheet_service'); SheetService.getUnusedVouchers().then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error);

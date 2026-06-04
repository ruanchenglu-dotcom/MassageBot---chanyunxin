const SheetService = require('./cyx_sheet_service.js');
(async () => {
    await SheetService.init();
    const services = SheetService.getServices();
    console.log(services.A3);
})();

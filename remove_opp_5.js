const fs = require('fs');

function cleanViews(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/const isOpp = booking\?\.location === '對面館';/g, "const isOpp = false;");
    content = content.replace(/const targetLocation = currentLocation === '本館' \? '對面館' : '本館';/g, "const targetLocation = '本館';");

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`No changes to ${filePath}`);
    }
}
cleanViews('qinshihuang/js/cyx_views.js');
cleanViews('qinshihuang/js/cyx_app.js');
cleanViews('cyx_resource_core.js');
cleanViews('qinshihuang/js/cyx_bookingHandler.js');

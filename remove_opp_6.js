const fs = require('fs');

function cleanFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // getters in bookingHandler
    content = content.replace(/MAX_CHAIRS: locationStr === '對面館' \? \(scale\.OPP_CHAIRS \|\| 4\) : \(scale\.MAX_CHAIRS \|\| ext\.MAX_CHAIRS\),/g, 'MAX_CHAIRS: scale.MAX_CHAIRS || ext.MAX_CHAIRS,');
    content = content.replace(/MAX_BEDS: locationStr === '對面館' \? \(scale\.OPP_BEDS \|\| 6\) : \(scale\.MAX_BEDS \|\| ext\.MAX_BEDS\),/g, 'MAX_BEDS: scale.MAX_BEDS || ext.MAX_BEDS,');

    content = content.replace(/let oppositeLoc = locationStr === '本館' \? '對面館' : '本館';\n\s*let oppositeSim[\s\S]*?\}\n/g, 'let oppositeSuggestion = "";\n');
    content = content.replace(/\$\{oppositeSuggestion\}/g, '');
    
    // crossLocationMsg blocks
    content = content.replace(/if \(locationStr === '本館' \|\| locationStr === '對面館'\) \{[\s\S]*?let oppSim = this\.validateGlobalCapacity[\s\S]*?\}\n\s*\}/g, '');
    
    content = content.replace(/if \(loc === '本館' \|\| loc === '對面館'\) return loc;/g, "if (loc === '本館') return loc;");
    content = content.replace(/if \(match\) return match\[1\] === '2' \? '對面館' : '本館';/g, "if (match) return '本館';");
    content = content.replace(/return \(b\.originalData\?\.location \|\| b\.location \|\| '本館'\) === '對面館' \? '對面館' : '本館';/g, "return '本館';");

    content = content.replace(/let isOpp = false;/g, '');
    content = content.replace(/let building = isOpp \? '2' : '1';/g, "let building = '1';");
    content = content.replace(/const isOpp = this\._tempLocation === '對面館';/g, "const isOpp = false;");
    content = content.replace(/const buildingStr = isOpp \? '2' : '1';/g, "const buildingStr = '1';");

    content = content.replace(/let oppositeSuggestion = "";/g, "");

    // in cyx_bookingListView.js
    content = content.replace(/const locPrefix = locStr === '對面館' \? '2' : '1';/g, "const locPrefix = '1';");

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`No changes to ${filePath}`);
    }
}

cleanFile('cyx_resource_core.js');
cleanFile('qinshihuang/js/cyx_bookingHandler.js');
cleanFile('qinshihuang/js/cyx_bookingListView.js');

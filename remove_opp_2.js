const fs = require('fs');

function cleanFile(filePath, replacements) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    for (const r of replacements) {
        content = content.replace(r.search, r.replace);
    }
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`No changes made to ${filePath}`);
    }
}

// cyx_sheet_service.js & cyx_sheet_service_updated.js
const sheetReplacements = [
    { search: /if \(rId\.includes\('OPP-CHAIR'\)[^}]+\}\s*else\s*/g, replace: '' },
    { search: /if \(rId\.includes\('OPP-BED'\)[^}]+\}\s*else\s*/g, replace: '' },
    { search: /let locPrefix = targetLocation === '對面館' \? '2' : '1';/g, replace: "let locPrefix = '1';" }
];
cleanFile('cyx_sheet_service.js', sheetReplacements);
cleanFile('cyx_sheet_service_updated.js', sheetReplacements);

// cyx_index.js
const indexReplacements = [
    { search: /, oppChairs: getConfig\(\)\.SCALE\.OPP_CHAIRS \|\| 4, oppBeds: getConfig\(\)\.SCALE\.OPP_BEDS \|\| 6/g, replace: '' }
];
cleanFile('cyx_index.js', indexReplacements);

console.log('Script 2 done');

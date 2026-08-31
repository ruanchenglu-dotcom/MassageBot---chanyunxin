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

// 1. cyx_data.js (Root & Frontend)
const dataReplacements = [
    { search: /\s*OPP_CHAIRS:.*,/g, replace: '' },
    { search: /\s*OPP_BEDS:.*,/g, replace: '' },
    { search: /\s*OPP_BRANCH:.*,/g, replace: '' },
    { search: /\s*CHAIR_PREFIX2:.*,/g, replace: '' },
    { search: /\s*BED_PREFIX2:.*,/g, replace: '' },
    { search: /this\.OPP_CHAIRS \+ this\.OPP_BEDS/g, replace: '0' },
    { search: /OPP:\s*\{[^}]+\},?/g, replace: '' }
];
cleanFile('cyx_data.js', dataReplacements);
cleanFile('qinshihuang/js/cyx_data.js', dataReplacements);

// 2. cyx_utils.js
const utilsReplacements = [
    { search: /const c2 = config\.CHAIR_PREFIX2[^;]+;/g, replace: '' },
    { search: /const b2 = config\.BED_PREFIX2[^;]+;/g, replace: '' },
    { search: /else if \(res\.startsWith\('CHAIR-2-'\)\)[\s\S]*?else if \(res\.startsWith\('BED-2-'\)\)[\s\S]*?\}/g, replace: '' },
    { search: /let isOpp = id\.includes\('OPP'\) \|\| id\.includes\('對'\) \|\| id\.includes\('2-'\);/g, replace: 'let isOpp = false;' },
    { search: /let building = isOpp \? '2' : '1';/g, replace: "let building = '1';" },
    { search: /if \(id\.includes\('本'\) \|\| id\.includes\('對'\)\)/g, replace: "if (id.includes('本'))" }
];
cleanFile('qinshihuang/js/cyx_utils.js', utilsReplacements);

console.log('Script 1 done');

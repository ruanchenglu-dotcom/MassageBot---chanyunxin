const fs = require('fs');

function cleanViews(f) {
    if (!fs.existsSync(f)) return;
    let text = fs.readFileSync(f, 'utf8');
    text = text.replace(/const oppChairs = getOppChairs\(\);\n\s*const oppBeds = getOppBeds\(\);\n\s*rows = \[\n\s*\.\.\.Array\.from\(\{ length: oppChairs \}, \(_, i\) => \(\{ id: `CHAIR-2-\$\{i \+ 1\}`[^}]+\}\)\),\n\s*\.\.\.Array\.from\(\{ length: oppBeds \}, \(_, i\) => \(\{ id: `BED-2-\$\{i \+ 1\}`[^}]+\}\)\)\n\s*\];/g, "rows = [];");
    text = text.replace(/const oppChairs = window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_CHAIRS \|\| 4;/g, "const oppChairs = 0;");
    text = text.replace(/const oppBeds = window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_BEDS \|\| 6;/g, "const oppBeds = 0;");
    text = text.replace(/return \(config\.SCALE && config\.SCALE\.OPP_CHAIRS\) \|\| 4;/g, "return 0;");
    text = text.replace(/return \(config\.SCALE && config\.SCALE\.OPP_BEDS\) \|\| 6;/g, "return 0;");
    fs.writeFileSync(f, text, 'utf8');
}

function cleanScheduler(f) {
    if (!fs.existsSync(f)) return;
    let text = fs.readFileSync(f, 'utf8');
    text = text.replace(/maxCount = window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_CHAIRS \|\| 4;/g, "maxCount = 0;");
    text = text.replace(/maxCount = window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_BEDS \|\| 6;/g, "maxCount = 0;");
    fs.writeFileSync(f, text, 'utf8');
}

cleanViews('qinshihuang/js/cyx_views.js');
cleanScheduler('qinshihuang/js/cyx_smartScheduler.js');

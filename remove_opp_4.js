const fs = require('fs');

function cleanApp(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Remove opp variables and loops
    content = content.replace(/const limitOpp = [^;]+;/g, "const limitOpp = 0;");
    content = content.replace(/id = preferOpposite \? `\$\{typeUp\}-2-\$\{preferredIndexOrId\}` : `\$\{typeUp\}-1-\$\{preferredIndexOrId\}`;/g, "id = `${typeUp}-1-${preferredIndexOrId}`;");
    content = content.replace(/const oppChairs = window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_CHAIRS \|\| 4;/g, "const oppChairs = 0;");
    content = content.replace(/const oppBeds = window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_BEDS \|\| 6;/g, "const oppBeds = 0;");
    content = content.replace(/window\.SYSTEM_CONFIG\.SCALE\.OPP_CHAIRS = res\.data\.resources\.oppChairs \|\| 4;/g, "");
    content = content.replace(/window\.SYSTEM_CONFIG\.SCALE\.OPP_BEDS = res\.data\.resources\.oppBeds \|\| 6;/g, "");
    content = content.replace(/if \(computedStoredLocation === '本館' \|\| computedStoredLocation === '對面館'\) \{/g, "if (computedStoredLocation === '本館') {");
    
    content = content.replace(/const prefix = `\$\{type\}-\$\{isOpp \? '2' : '1'\}`;/g, "const prefix = `${type}-1`;");
    content = content.replace(/const limit = isOpp\s*\?\s*\(type === 'CHAIR' \? \(window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_CHAIRS \|\| 4\) : \(window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_BEDS \|\| 6\)\)\s*:\s*\(type === 'CHAIR' \? \(window\.SYSTEM_CONFIG\?\.SCALE\?\.MAX_CHAIRS \|\| 12\) : \(window\.SYSTEM_CONFIG\?\.SCALE\?\.MAX_BEDS \|\| 12\)\);/g, "const limit = type === 'CHAIR' ? (window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS || 12) : (window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS || 12);");

    content = content.replace(/if \(targetId === '本館' \|\| targetId === '對面館'\) \{/g, "if (targetId === '本館') {");

    content = content.replace(/let match = s\.match\(\/\^\(CHAIR\|BED\|OPP-CHAIR\|OPP-BED\|OPP_CHAIR\|OPP_BED\)-\?\(\\d\+\)-\?\(\\d\+\)\?\$\/\);/g, "let match = s.match(/^(CHAIR|BED)-?(\\d+)-?(\\d+)?$/);");
    content = content.replace(/match = s\.match\(\/\^\(CHAIR\|BED\|OPP-CHAIR\|OPP-BED\|OPP_CHAIR\|OPP_BED\)\\s\*\(\\d\+\)\$\/\);/g, "match = s.match(/^(CHAIR|BED)\\s*(\\d+)$/);");
    content = content.replace(/if \(type === 'OPP-CHAIR'\) \{ type = 'CHAIR'; floor = '2'; \}/g, "");
    content = content.replace(/if \(type === 'OPP-BED'\) \{ type = 'BED'; floor = '2'; \}/g, "");

    content = content.replace(/let currentShop = \(targetBooking\.location === '對面館' \|\|[^\)]*\) \? 2 : 1;/g, "let currentShop = 1;");
    content = content.replace(/let currentShop = \(booking\.location === '對面館' \|\|[^\)]*\) \? 2 : 1;/g, "let currentShop = 1;");
    content = content.replace(/const currentShop = \(targetBooking\.location === '對面館' \|\|[^\)]*\) \? 2 : 1;/g, "const currentShop = 1;");
    content = content.replace(/const currentShop = \(booking\.location === '對面館' \|\|[^\)]*\) \? 2 : 1;/g, "const currentShop = 1;");
    
    // Some lines have been replaced with `const crossShopName = '本館';`, clean them fully
    content = content.replace(/const crossShopName = '本館';\n\s*if \(targetBooking\.location === '本館' \|\| targetBooking\.location === '對面館'\) \{/g, "if (targetBooking.location === '本館') {");
    
    content = content.replace(/if \(\(b\.location === '本館' \|\| b\.location === '對面館'\) && b\.location !== loc\) return false;/g, "if (b.location === '本館' && b.location !== loc) return false;");

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`No changes to ${filePath}`);
    }
}

cleanApp('qinshihuang/js/cyx_app.js');

function cleanViews(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/const oppChairs = getOppChairs\(\);\n\s*const oppBeds = getOppBeds\(\);\n\s*rows = \[\n\s*\.\.\.Array\.from\(\{ length: oppChairs \}, \(_, i\) => \(\{ id: `CHAIR-2-\$\{i \+ 1\}`[^}]+\}\)\),\n\s*\.\.\.Array\.from\(\{ length: oppBeds \}, \(_, i\) => \(\{ id: `BED-2-\$\{i \+ 1\}`[^}]+\}\)\)\n\s*\];/g, "rows = [];");
    content = content.replace(/const getOppChairs = \(\) => window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_CHAIRS \|\| 0;/g, "const getOppChairs = () => 0;");
    content = content.replace(/const getOppBeds = \(\) => window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_BEDS \|\| 0;/g, "const getOppBeds = () => 0;");

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`No changes to ${filePath}`);
    }
}

cleanViews('qinshihuang/js/cyx_views.js');


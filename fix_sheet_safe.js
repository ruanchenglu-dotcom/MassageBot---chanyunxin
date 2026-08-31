const fs = require('fs');
let content = fs.readFileSync('cyx_sheet_service.js', 'utf8');

// Just remove opp loops carefully without truncating the file
content = content.replace(/for \(let i = 1; i <= \(window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_CHAIRS \|\| 4\); i\+\) \{[\s\S]*?\}\s*for \(let i = 1; i <= \(window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_BEDS \|\| 6\); i\+\) \{[\s\S]*?\}/, '');
content = content.replace(/for \(let i = 1; i <= \(global\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_CHAIRS \|\| 4\); i\+\) \{[\s\S]*?\}\s*for \(let i = 1; i <= \(global\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_BEDS \|\| 6\); i\+\) \{[\s\S]*?\}/, '');

content = content.replace(/if \(location === '對面館'\) \{[\s\S]*?\} else if/g, "if");
content = content.replace(/if \(b\.location === '對面館'\) \{[\s\S]*?\} else \{/g, "{");

content = content.replace(/let isOpp = false;/g, '');
content = content.replace(/let isOpp = rId\.includes\('OPP'\) \|\| rId\.includes\('對'\) \|\| rId\.includes\('2-'\);/g, "let isOpp = false;");
content = content.replace(/const location = isOpp \? '對面館' : '本館';/g, "const location = '本館';");

fs.writeFileSync('cyx_sheet_service.js', content, 'utf8');

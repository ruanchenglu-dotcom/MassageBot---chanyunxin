const fs = require('fs');
let content = fs.readFileSync('cyx_sheet_service.js', 'utf8');

let lines = content.split('\n');
let newLines = [];
let skip = false;
for(let i=0; i<lines.length; i++) {
    if (lines[i].includes("if (rId.includes('OPP-CHAIR')") || lines[i].includes("if (rId.includes('OPP-BED')")) {
        skip = true;
        continue;
    }
    if (skip) {
        if (lines[i].includes("} else if (rId.includes('CHAIR')") || lines[i].includes("} else if (rId.includes('BED')")) {
            skip = false;
            newLines.push(lines[i].replace("} else if", "if"));
            continue;
        } else if (lines[i].includes("} else {")) {
            skip = false;
            newLines.push(lines[i].replace("} else {", "else {"));
            continue;
        } else {
            continue;
        }
    }
    if (!skip) newLines.push(lines[i]);
}

fs.writeFileSync('cyx_sheet_service.js', newLines.join('\n'));
fs.writeFileSync('cyx_sheet_service_updated.js', newLines.join('\n'));

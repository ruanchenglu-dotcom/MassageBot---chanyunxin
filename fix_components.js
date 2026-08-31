const fs = require('fs');

function clean(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/<option value="對面館">對面館<\/option>/g, "");

    // cyx_smartScheduler.js
    content = content.replace(/} else if \(rId\.includes\('OPP-BED'\)[^}]+\}/g, '');
    content = content.replace(/} else if \(rId\.includes\('OPP-CHAIR'\)[^}]+\}/g, '');
    content = content.replace(/if \(rId\.includes\('OPP-CHAIR'\)[^}]+\} else if/g, 'if');
    content = content.replace(/if \(rId\.includes\('OPP-BED'\)[^}]+\} else if/g, 'if');

    let lines = content.split('\n');
    let newLines = [];
    let skip = false;
    for(let i=0; i<lines.length; i++) {
        if (lines[i].includes("if (rId.includes('OPP-CHAIR')") || lines[i].includes("if (rId.includes('OPP-BED')") || lines[i].includes("else if (rId.includes('OPP-CHAIR')") || lines[i].includes("else if (rId.includes('OPP-BED')")) {
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
            } else if (lines[i].includes("}")) {
                // assume end of block
                continue;
            }
        }
        if (!skip) newLines.push(lines[i]);
    }
    content = newLines.join('\n');

    content = content.replace(/let oppChairs = window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_CHAIRS \|\| 4;/g, "let oppChairs = 0;");
    content = content.replace(/let oppBeds = window\.SYSTEM_CONFIG\?\.SCALE\?\.OPP_BEDS \|\| 6;/g, "let oppBeds = 0;");

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`No changes to ${filePath}`);
    }
}

clean('qinshihuang/js/cyx_bookingListView.js');
clean('qinshihuang/js/cyx_smartScheduler.js');
clean('qinshihuang/js/cyx_components.js');

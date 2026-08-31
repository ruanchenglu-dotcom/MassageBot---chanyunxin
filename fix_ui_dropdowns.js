const fs = require('fs');
function cleanFile(f) {
    if (!fs.existsSync(f)) return;
    let text = fs.readFileSync(f, 'utf8');
    text = text.replace(/<button[^>]*>對面館<\/button>/g, "");
    text = text.replace(/<button[^>]*>本館\(腳\) -> 對面館\(身\)<\/button>/g, "");
    text = text.replace(/<button[^>]*>對面館\(腳\) -> 本館\(身\)<\/button>/g, "");
    text = text.replace(/const isOpp = locationStr === '對面館' \|\| CONF\._tempLocation === '對面館';/g, "const isOpp = false;");
    text = text.replace(/if \(match\) return match\[1\] === '2' \? '對面館' : '本館';/g, "if (match) return '本館';");
    text = text.replace(/const loc1 = crossLocationDirection === 'MAIN_TO_OPP' \? '本館' : '對面館';/g, "const loc1 = '本館';");
    text = text.replace(/const loc2 = crossLocationDirection === 'MAIN_TO_OPP' \? '對面館' : '本館';/g, "const loc2 = '本館';");
    text = text.replace(/let oppositeLoc = locationStr === '本館' \? '對面館' : '本館';/g, 'let oppositeLoc = "本館";');
    text = text.replace(/if \(id\.includes\('本'\) \|\| id\.includes\('對'\) \|\| bLoc === '對面館'\) isBed = true;/g, "if (id.includes('本')) isBed = true;");
    text = text.replace(/\} else if \(locStr\.includes\('對面館\(身\)'\) && locStr\.indexOf\('對面館\(身\)'\) === 0\) \{/g, "");
    text = text.replace(/if \(selectedLocation === '對面館'\)/g, "if (false)");
    text = text.replace(/\} else if \(selectedLocation === '對面館'\) \{/g, "");
    fs.writeFileSync(f, text, 'utf8');
}
cleanFile('qinshihuang/js/cyx_bookingHandler.js');
cleanFile('qinshihuang/js/cyx_bookingListView.js');
cleanFile('qinshihuang/js/cyx_components.js');

const fs = require('fs');

let content = fs.readFileSync('cyx_resource_core.js', 'utf8');
let lines = content.split('\n');
let newLines = [];
let skip = false;

for(let i=0; i<lines.length; i++) {
    let line = lines[i];

    if (line.includes("if (locationStr !== '本館' && locationStr !== '對面館') {") || line.includes("if (loc !== '本館' && loc !== '對面館') {")) {
        newLines.push("    if (locationStr !== '本館') { locationStr = '本館'; }");
        skip = true;
        continue;
    }
    if (skip && line.includes("}")) {
        skip = false;
        continue;
    }
    if (skip) continue;

    if (line.includes("let oppositeLoc = locationStr === '本館' ? '對面館' : '本館';")) {
        newLines.push('        let oppositeSuggestion = "";');
        skip = true;
        continue;
    }
    if (skip && line.includes("oppositeSuggestion =")) {
        skip = false;
        continue; // skip the closing brace of the opposite block
    }
    if (skip && line.includes("}")) {
        if (lines[i-1].includes("oppositeSuggestion = ")) {
            skip = false;
            continue;
        }
    }

    if (line.includes("if (locationStr === '本館' || locationStr === '對面館') {")) {
        skip = true;
        continue;
    }

    line = line.replace(/\$\{oppositeSuggestion\}/g, '');
    newLines.push(line);
}

fs.writeFileSync('cyx_resource_core.js', newLines.join('\n'), 'utf8');

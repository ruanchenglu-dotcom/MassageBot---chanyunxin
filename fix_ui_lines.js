const fs = require('fs');

let f = 'qinshihuang/js/cyx_bookingHandler.js';
let content = fs.readFileSync(f, 'utf8');
let lines = content.split('\n');
let newLines = [];

for(let i=0; i<lines.length; i++) {
    if (lines[i].includes('對面館')) {
        // Just skip this line, it's just UI buttons or else if clauses
        continue;
    }
    newLines.push(lines[i]);
}

fs.writeFileSync(f, newLines.join('\n'), 'utf8');

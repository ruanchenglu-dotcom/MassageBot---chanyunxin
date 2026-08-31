const fs = require('fs');
let content = fs.readFileSync('qinshihuang/js/cyx_app.js', 'utf8');

let lines = content.split('\n');
let newLines = [];
let skip = false;
for(let i=0; i<lines.length; i++) {
    if (lines[i].includes("setActiveTab('timeline-opp')")) {
        continue;
    }
    if (lines[i].includes("{activeTab === 'timeline-opp' && window.TimelineView")) {
        skip = true;
        continue;
    }
    if (skip) {
        if (lines[i].includes("</window.TimelineView>") || lines[i].includes("</div>")) {
            // we skip 5 lines total for that block
            // let's be safe and check for the closing </div> 
        }
        if (lines[i].trim() === ")}") {
            skip = false;
            continue;
        }
        continue;
    }
    newLines.push(lines[i]);
}

let result = newLines.join('\n');
result = result.replace(/targetBooking\.location === '對面館' \|\| /g, '');
result = result.replace(/booking\.location === '對面館' \|\| /g, '');
result = result.replace(/const crossShopName = currentShop === 1 \? '對面館' : '本館';/g, "const crossShopName = '本館';");
result = result.replace(/const isOpp = targetB\.location === '對面館';/g, 'const isOpp = false;');
result = result.replace(/const isOpp = b\.location === '對面館';/g, 'const isOpp = false;');

fs.writeFileSync('qinshihuang/js/cyx_app.js', result);

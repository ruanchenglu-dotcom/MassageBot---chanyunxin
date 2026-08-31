const fs = require('fs');
let content = fs.readFileSync('qinshihuang/js/cyx_app.js', 'utf8');

let lines = content.split('\n');
for (let i=0; i<lines.length; i++) {
    if (lines[i].includes("setActiveTab('timeline-opp')") && lines[i].includes("<button")) {
        lines[i] = lines[i].replace("<button", "{(window.SYSTEM_CONFIG?.SCALE?.OPP_CHAIRS > 0 || window.SYSTEM_CONFIG?.SCALE?.OPP_BEDS > 0) && <button");
        lines[i] = lines[i].replace("</button>", "</button>}");
    }
}
fs.writeFileSync('qinshihuang/js/cyx_app.js', lines.join('\n'));

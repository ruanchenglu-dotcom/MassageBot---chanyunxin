const fs = require('fs');
const c = fs.readFileSync('XinWuChanAdmin/js/cyx_views.js', 'utf8');
const lines = c.split('\n');
const idx = lines.findIndex(l => l.includes('style={{'));
const renderSlotLines = lines.filter(l => l.includes('style={{') && l.includes('left:') && l.includes('width:'));
console.log("Found lines with left: and width:");
console.log(renderSlotLines.join('\n'));

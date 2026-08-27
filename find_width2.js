const fs = require('fs');
const c = fs.readFileSync('XinWuChanAdmin/js/cyx_views.js', 'utf8');
const lines = c.split('\n');
const idx = lines.findIndex(l => l.includes('style={{ left: `${leftPos}px`, width: `${width}px` }}'));
console.log(lines.slice(idx - 35, idx + 5).join('\n'));

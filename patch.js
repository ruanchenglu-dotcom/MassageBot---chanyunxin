const fs = require('fs');
const file = 'c:/MassageBot - chanyunxin/XinWuChanAdmin/js/cyx_bookingHandler.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  /} else if \(selectedLocation === '對面館'\) \{[\s\S]*?\}/,
  '} else if (selectedLocation === \'對面館\') {\n                dynamicMaxPax = Math.min(oppMax, 8);\n            }'
);
fs.writeFileSync(file, content, 'utf8');
console.log('Replaced successfully');

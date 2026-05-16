const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const files = [
    'cyx_data.js',
    'XinWuChanAdmin/js/cyx_utils.js',
    'XinWuChanAdmin/js/cyx_components.js',
    'XinWuChanAdmin/js/cyx_views.js',
    'XinWuChanAdmin/js/cyx_staffSorter.js',
    'XinWuChanAdmin/js/cyx_bookingListView.js',
    'XinWuChanAdmin/js/cyx_app.js',
    'XinWuChanAdmin/js/cyx_bookingHandler.js'
];

let hasError = false;

for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${file}`);
        continue;
    }
    const code = fs.readFileSync(filePath, 'utf-8');
    try {
        babel.transformSync(code, {
            filename: file,
            presets: ['@babel/preset-react']
        });
        console.log(`[OK] ${file}`);
    } catch (e) {
        console.error(`\n[ERROR] in ${file}:\n`);
        console.error(e.message);
        hasError = true;
    }
}

if (hasError) process.exit(1);

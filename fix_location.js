const fs = require('fs');
let content = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');

const oldLines = content.split('\n');
const startIdx = oldLines.findIndex(l => l.includes(\"if (loc === '本館' || loc === '對面館') return loc;\"));

if (startIdx !== -1) {
    oldLines.splice(startIdx, 9, 
\"            const resolveRealLocation = (b) => {\",
\"                let locStr = b.current_resource_id || b.phase1_res_idx || b.originalData?.location || b.location || '本館';\",
\"                const match = String(locStr).match(/(?:BED|CHAIR|床|足|腳|OPP)[-_ ]?([12])[-_ ]?\\d+/i);\",
\"                if (match) return match[1] === '2' ? '對面館' : '本館';\",
\"                return (b.originalData?.location || b.location || '本館') === '對面館' ? '對面館' : '本館';\",
\"            };\",
\"            const relevantBookings = globalStaffBookings.filter(b => {\",
\"                return resolveRealLocation(b) === locationStr;\",
\"            });\"
    );
    fs.writeFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', oldLines.join('\n'), 'utf8');
    console.log('Fixed resolveRealLocation!');
} else {
    console.log('Target string not found');
}

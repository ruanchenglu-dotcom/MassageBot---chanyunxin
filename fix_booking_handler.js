const fs = require('fs');
let content = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');

const target =             return {
                serviceCode: foundCode || g.service,
                staffName: normalizedStaff,
                flowCode: impliedFlow,
                overrideDuration: g.overrideDuration
            };;

const replacement =             return {
                serviceCode: foundCode || g.service,
                staffName: normalizedStaff,
                staff: g.staff,
                isYouTui: g.isYouTui,
                isGuaSha: g.isGuaSha,
                isHuaGuan: g.isHuaGuan,
                isBaGuan: g.isBaGuan,
                flowCode: impliedFlow,
                overrideDuration: g.overrideDuration
            };;

if(content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', content, 'utf8');
    console.log('REPLACED SUCCESSFULLY');
} else {
    console.log('TARGET NOT FOUND');
}

const fs = require('fs');

const files = [
    'c:\\MassageBot - chanyunxin\\XinWuChanAdmin\\js\\cyx_app.js',
    'c:\\MassageBot - chanyunxin\\XinWuChanAdmin\\js\\cyx_components.js',
    'c:\\MassageBot - chanyunxin\\XinWuChanAdmin\\js\\cyx_views.js',
    'c:\\MassageBot - chanyunxin\\XinWuChanAdmin\\js\\cyx_smartScheduler.js',
    'c:\\MassageBot - chanyunxin\\cyx_index.js',
    'c:\\MassageBot - chanyunxin\\cyx_sheet_service.js'
];

for (let file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;

    // A much safer regex that doesn't mess up characters
    const safeReplace = (content) => {
        return content.replace(/([a-zA-Z0-9_]+(?:\.booking)?)\.category === 'COMBO'/g, function(match, objName) {
            if (objName === 'svc' || objName === 'svcDef' || objName === 'serviceObj' || objName.includes('SERVICES_DATA')) {
                return match;
            }
            modified = true;
            return `(${match} || (${objName}.serviceCode && typeof ${objName}.serviceCode === 'string' && ${objName}.serviceCode.toUpperCase().startsWith('A')))`;
        });
    };
    
    content = safeReplace(content);

    if (file.includes('cyx_sheet_service.js')) {
        const oldCheck = "const isCombo = bFlow === 'BF' || bFlow === 'FB' || (b.allocated_resource && String(b.allocated_resource).includes('+'));";
        const newCheck = "const isCombo = bFlow === 'BF' || bFlow === 'FB' || (b.allocated_resource && String(b.allocated_resource).includes('+')) || b.category === 'COMBO' || (b.serviceName && b.serviceName.includes('套餐')) || (b.serviceCode && typeof b.serviceCode === 'string' && b.serviceCode.toUpperCase().startsWith('A'));";
        if (content.includes(oldCheck)) {
            content = content.replace(oldCheck, newCheck);
            modified = true;
        }
    }

    if (modified) {
        // Write exactly as read, shouldn't touch Chinese characters not matched by regex
        fs.writeFileSync(file, content, 'utf8');
        console.log("Processed:", file);
    }
}

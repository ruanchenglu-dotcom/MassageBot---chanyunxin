const fs = require('fs');

let content = fs.readFileSync('cyx_resource_core.js', 'utf8');

// MAX_CHAIRS/BEDS
content = content.replace(/get MAX_CHAIRS\(\) \{ return this\._tempLocation === '對面館' \? \(getSystemConfig\(\)\.SCALE\.OPP_CHAIRS \|\| 4\) : getSystemConfig\(\)\.SCALE\.MAX_CHAIRS; \},?/g, 'get MAX_CHAIRS() { return getSystemConfig().SCALE.MAX_CHAIRS; },');
content = content.replace(/get MAX_BEDS\(\) \{ return this\._tempLocation === '對面館' \? \(getSystemConfig\(\)\.SCALE\.OPP_BEDS \|\| 6\) : getSystemConfig\(\)\.SCALE\.MAX_BEDS; \},?/g, 'get MAX_BEDS() { return getSystemConfig().SCALE.MAX_BEDS; },');
content = content.replace(/get MAX_CHAIRS\(\) \{ return this\._tempLocation === '對面館' \? \(baseConfig\.SCALE\.OPP_CHAIRS \|\| 4\) : baseConfig\.SCALE\.MAX_CHAIRS; \},?/g, 'get MAX_CHAIRS() { return baseConfig.SCALE.MAX_CHAIRS; },');
content = content.replace(/get MAX_BEDS\(\) \{ return this\._tempLocation === '對面館' \? \(baseConfig\.SCALE\.OPP_BEDS \|\| 6\) : baseConfig\.SCALE\.MAX_BEDS; \},?/g, 'get MAX_BEDS() { return baseConfig.SCALE.MAX_BEDS; },');

content = content.replace(/if \(locationStr !== '本館' && locationStr !== '對面館'\) \{\s*if \(locationStr\.includes\('對面館'\) && !locationStr\.includes\('本館'\)\) locationStr = '對面館';\s*\}/g, "if (locationStr !== '本館') { locationStr = '本館'; }");
content = content.replace(/if \(loc !== '本館' && loc !== '對面館'\) \{\s*if \(loc\.includes\('對面館'\) && !loc\.includes\('本館'\)\) loc = '對面館';\s*\}/g, "if (loc !== '本館') { loc = '本館'; }");

content = content.replace(/let isOpp = id\.includes\('OPP'\) \|\| id\.includes\('對'\) \|\| id\.includes\('2-'\) \|\| \(b\.location === '對面館'\);/g, "let isOpp = false;");
content = content.replace(/if \(id\.includes\('本'\) \|\| id\.includes\('對'\) \|\| b\.location === '對面館'\) isBed = true;/g, "if (id.includes('本')) isBed = true;");
content = content.replace(/if \(loc === '本館' \|\| loc === '對面館'\) return loc;/g, "if (loc === '本館') return loc;");
content = content.replace(/if \(match\) return match\[1\] === '2' \? '對面館' : '本館';/g, "if (match) return '本館';");
content = content.replace(/const isOpp = CONF\._tempLocation === '對面館';/g, "const isOpp = false;");
content = content.replace(/const bPrefix = \(exBLoc === '對面館'\) \? '2' : '1';/g, "const bPrefix = '1';");
content = content.replace(/let building = isOpp \? '2' : '1';/g, "let building = '1';");
content = content.replace(/const buildingStr = isOpp \? '2' : '1';/g, "const buildingStr = '1';");

content = content.replace(/let oppositeLoc = locationStr === '本館' \? '對面館' : '本館';\s*let oppositeSim = validateGlobalCapacity\([^)]+\);\s*let oppositeSuggestion = "";\s*if \(oppositeSim\.pass\) \{\s*oppositeSuggestion = [^;]+;\s*\}/g, 'let oppositeSuggestion = "";');
content = content.replace(/\$\{oppositeSuggestion\}/g, '');

content = content.replace(/if \(locationStr === '本館' \|\| locationStr === '對面館'\) \{[\s\S]*?\}\s*if \(bestOutOfBoundSplit\)/g, "if (bestOutOfBoundSplit)");
content = content.replace(/\$\{crossLocationMsg\}/g, '');

fs.writeFileSync('cyx_resource_core.js', content, 'utf8');

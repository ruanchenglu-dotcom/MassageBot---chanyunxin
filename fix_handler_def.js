const fs = require('fs');

let content = fs.readFileSync('qinshihuang/js/cyx_bookingHandler.js', 'utf8');

// MAX_CHAIRS/BEDS
content = content.replace(/MAX_CHAIRS: locationStr === '對面館' \? \(scale\.OPP_CHAIRS \|\| 4\) : \(scale\.MAX_CHAIRS \|\| ext\.MAX_CHAIRS\),?/g, 'MAX_CHAIRS: scale.MAX_CHAIRS || ext.MAX_CHAIRS,');
content = content.replace(/MAX_BEDS: locationStr === '對面館' \? \(scale\.OPP_BEDS \|\| 6\) : \(scale\.MAX_BEDS \|\| ext\.MAX_BEDS\),?/g, 'MAX_BEDS: scale.MAX_BEDS || ext.MAX_BEDS,');

content = content.replace(/if \(locationStr !== '本館' && locationStr !== '對面館'\) \{\s*if \(locationStr\.includes\('對面館'\) && !locationStr\.includes\('本館'\)\) locationStr = '對面館';\s*\}/g, "if (locationStr !== '本館') { locationStr = '本館'; }");
content = content.replace(/if \(loc !== '本館' && loc !== '對面館'\) \{\s*if \(loc\.includes\('對面館'\) && !loc\.includes\('本館'\)\) loc = '對面館';\s*\}/g, "if (loc !== '本館') { loc = '本館'; }");

content = content.replace(/let isOpp = false;/g, '');
content = content.replace(/let isOpp = id\.includes\('OPP'\) \|\| id\.includes\('對'\) \|\| id\.includes\('2-'\) \|\| \(b\.location === '對面館'\);/g, "let isOpp = false;");
content = content.replace(/if \(id\.includes\('本'\) \|\| id\.includes\('對'\) \|\| b\.location === '對面館'\) isBed = true;/g, "if (id.includes('本')) isBed = true;");
content = content.replace(/if \(loc === '本館' \|\| loc === '對面館'\) return loc;/g, "if (loc === '本館') return loc;");
content = content.replace(/if \(match\) return match\[1\] === '2' \? '對面館' : '本館';/g, "if (match) return '本館';");
content = content.replace(/const isOpp = CONF\._tempLocation === '對面館';/g, "const isOpp = false;");
content = content.replace(/const bPrefix = \(exBLoc === '對面館'\) \? '2' : '1';/g, "const bPrefix = '1';");
content = content.replace(/let building = isOpp \? '2' : '1';/g, "let building = '1';");
content = content.replace(/const buildingStr = isOpp \? '2' : '1';/g, "const buildingStr = '1';");

content = content.replace(/let oppositeLoc = locationStr === '本館' \? '對面館' : '本館';\s*let oppositeSim = this\.validateGlobalCapacity\([^)]+\);\s*let oppositeSuggestion = "";\s*if \(oppositeSim\.pass\) \{\s*oppositeSuggestion = [^;]+;\s*\}/g, 'let oppositeSuggestion = "";');
content = content.replace(/\$\{oppositeSuggestion\}/g, '');

content = content.replace(/if \(locationStr === '本館' \|\| locationStr === '對面館'\) \{[\s\S]*?\}\s*if \(bestOutOfBoundSplit\)/g, "if (bestOutOfBoundSplit)");
content = content.replace(/\$\{crossLocationMsg\}/g, '');
content = content.replace(/return \(b\.originalData\?\.location \|\| b\.location \|\| '本館'\) === '對面館' \? '對面館' : '本館';/g, "return '本館';");
content = content.replace(/const match = String\(locStr\)\.match\(\/\(\?:BED\|CHAIR\|床\|足\|腳\|OPP\)\[-_ \]\?\(\[12\]\)\[-_ \]\?\\\\d\+\/i\);/g, "");

fs.writeFileSync('qinshihuang/js/cyx_bookingHandler.js', content, 'utf8');

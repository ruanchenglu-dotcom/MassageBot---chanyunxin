const fs = require('fs');

let content = fs.readFileSync('qinshihuang/js/cyx_bookingHandler.js', 'utf8');

// MAX_CHAIRS/BEDS
content = content.replace(/MAX_CHAIRS: [^,]+,/g, 'MAX_CHAIRS: scale.MAX_CHAIRS || ext.MAX_CHAIRS,');
content = content.replace(/MAX_BEDS: [^,]+,/g, 'MAX_BEDS: scale.MAX_BEDS || ext.MAX_BEDS,');

// Strip out cross location stuff without depending on specific Chinese chars
content = content.replace(/if \([^)]+\) \{\s*let oppositeLoc =[^;]+;\s*let oppSim = [^;]+;\s*let oppMap = [^;]+;\s*let oppConfMaxBeds = [^;]+;\s*let oppConfMaxChairs = [^;]+;[\s\S]*?\}\s*\}\s*if \(bestOutOfBoundSplit\)/, "if (bestOutOfBoundSplit)");

// The getters in validateGlobalCapacity
content = content.replace(/let oppositeLoc = locationStr ===[^;]+;\s*let oppositeSim = this\.validateGlobalCapacity[\s\S]*?oppositeSuggestion =[^;]+;\s*\}/g, 'let oppositeSuggestion = "";');
content = content.replace(/\$\{oppositeSuggestion\}/g, '');

content = content.replace(/let isOpp = false;/g, '');
content = content.replace(/let isOpp = id\.includes[^;]+;/g, "let isOpp = false;");
content = content.replace(/if \(id\.includes\('本'\) \|\| id\.includes\('對'\) \|\| b\.location === '對面館'\) isBed = true;/g, "if (id.includes('本')) isBed = true;");
content = content.replace(/const isOpp = CONF\._tempLocation === '對面館';/g, "const isOpp = false;");
content = content.replace(/const bPrefix = \(exBLoc === '對面館'\) \? '2' : '1';/g, "const bPrefix = '1';");
content = content.replace(/let building = isOpp \? '2' : '1';/g, "let building = '1';");
content = content.replace(/const buildingStr = isOpp \? '2' : '1';/g, "const buildingStr = '1';");
content = content.replace(/\$\{crossLocationMsg\}/g, '');
content = content.replace(/return \(b\.originalData\?\.location \|\| b\.location \|\| '本館'\) === '對面館' \? '對面館' : '本館';/g, "return '本館';");
content = content.replace(/const match = String\(locStr\)\.match\(\/\(\?:BED\|CHAIR\|床\|足\|腳\|OPP\)\[-_ \]\?\(\[12\]\)\[-_ \]\?\\\\d\+\/i\);/g, "");

fs.writeFileSync('qinshihuang/js/cyx_bookingHandler.js', content, 'utf8');

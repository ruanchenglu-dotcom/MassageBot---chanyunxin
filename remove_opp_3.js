const fs = require('fs');

function cleanFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. MAX_CHAIRS and MAX_BEDS
    content = content.replace(/get MAX_CHAIRS\(\) \{ return this\._tempLocation[^}]+; \},?/g, 'get MAX_CHAIRS() { return getSystemConfig().SCALE.MAX_CHAIRS; },');
    content = content.replace(/get MAX_BEDS\(\) \{ return this\._tempLocation[^}]+; \},?/g, 'get MAX_BEDS() { return getSystemConfig().SCALE.MAX_BEDS; },');
    content = content.replace(/get MAX_CHAIRS\(\) \{ return this\._tempLocation[^}]+; \},?/g, 'get MAX_CHAIRS() { return baseConfig.SCALE.MAX_CHAIRS; },');
    content = content.replace(/get MAX_BEDS\(\) \{ return this\._tempLocation[^}]+; \},?/g, 'get MAX_BEDS() { return baseConfig.SCALE.MAX_BEDS; },');
    
    // There are getters in baseConfig as well
    content = content.replace(/get MAX_CHAIRS\(\) \{ return this\._tempLocation === '對面館' \? \(baseConfig\.SCALE\.OPP_CHAIRS \|\| 4\) : baseConfig\.SCALE\.MAX_CHAIRS; \},?/g, 'get MAX_CHAIRS() { return baseConfig.SCALE.MAX_CHAIRS; },');
    content = content.replace(/get MAX_BEDS\(\) \{ return this\._tempLocation === '對面館' \? \(baseConfig\.SCALE\.OPP_BEDS \|\| 6\) : baseConfig\.SCALE\.MAX_BEDS; \},?/g, 'get MAX_BEDS() { return baseConfig.SCALE.MAX_BEDS; },');

    // 2. ValidateGlobalCapacity oppositeLoc
    content = content.replace(/if \(locationStr !== '本館' && locationStr !== '對面館'\) \{[\s\S]*?if \(locationStr\.includes\('對面館'\) && !locationStr\.includes\('本館'\)\) locationStr = '對面館';/g, "if (locationStr !== '本館') {\n        locationStr = '本館';");
    content = content.replace(/if \(loc !== '本館' && loc !== '對面館'\) \{[\s\S]*?if \(loc\.includes\('對面館'\) && !loc\.includes\('本館'\)\) loc = '對面館';/g, "if (loc !== '本館') {\n        loc = '本館';");

    // 3. Remove oppositeSim and crossLocationMsg
    // It's easier to just match the lines and remove them.
    let lines = content.split('\n');
    let newLines = [];
    let skip = false;
    for (let i=0; i<lines.length; i++) {
        let line = lines[i];
        if (line.includes("let oppositeLoc = locationStr === '本館' ? '對面館' : '本館';") && line.includes('oppositeLoc')) {
            newLines.push('        let oppositeSuggestion = "";');
            skip = true;
            continue;
        }
        if (skip) {
            if (line.includes("oppositeSuggestion =") || line.includes("let oppSim") || line.includes("let oppMap") || line.includes("let oppConfMax") || line.includes("crossLocationMsg =") || line.includes("checkLaneContinuity(oppMap.CHAIR") || line.includes("checkLaneContinuity(oppMap.BED")) {
                continue;
            }
            if (line.includes("}")) {
                if (lines[i-1].includes("oppositeSuggestion =") || lines[i-1].includes("crossLocationMsg =")) {
                    skip = false;
                    continue;
                }
            }
            // just continue if we are aggressively skipping the block. But wait, it's risky to skip blindly. Let's not use skip for simple replacements.
        }
        
        // Remove `isOpp` logic
        if (line.includes("let isOpp = id.includes('OPP')")) {
            line = "            let isOpp = false;";
        }
        if (line.includes("if (id.includes('本') || id.includes('對') || b.location === '對面館')")) {
            line = "                if (id.includes('本')) isBed = true;";
        }
        if (line.includes("if (loc === '本館' || loc === '對面館') return loc;")) {
            line = "        if (loc === '本館') return loc;";
        }
        if (line.includes("if (match) return match[1] === '2' ? '對面館' : '本館';")) {
            line = "        if (match) return '本館';";
        }
        if (line.includes("const isOpp = CONF._tempLocation === '對面館';")) {
            line = "        const isOpp = false;";
        }
        if (line.includes("const bPrefix = (exBLoc === '對面館') ? '2' : '1';")) {
            line = "                    const bPrefix = '1';";
        }

        // Just push if not skipped
        if (!skip) {
            newLines.push(line);
        }
    }
    content = newLines.join('\n');
    
    // We can also do regex replace for the oppositeSim block:
    content = content.replace(/let oppositeLoc = [^\n]+\n\s*let oppositeSim = [^\n]+\n\s*let oppositeSuggestion = "";\n\s*if \(oppositeSim\.pass\) \{[\s\S]*?\}\n/g, 'let oppositeSuggestion = "";\n');
    
    // cross location block
    content = content.replace(/if \(locationStr === '本館' \|\| locationStr === '對面館'\) \{[\s\S]*?let oppSim = validateGlobalCapacity[\s\S]*?\}[\s]*\}/g, '');

    // the returns with oppositeSuggestion:
    content = content.replace(/\$\{oppositeSuggestion\}/g, '');
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`No changes to ${filePath}`);
    }
}

cleanFile('cyx_resource_core.js');
cleanFile('qinshihuang/js/cyx_bookingHandler.js');

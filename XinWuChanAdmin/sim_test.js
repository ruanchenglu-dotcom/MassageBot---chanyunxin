function isOverlap(start1, end1, start2, end2) {
    return (start1 < end2) && (start2 < end1);
}

const resourceMap = {
    'BED': Array.from({ length: 6 }, () => [])
};

const pushToMapFallback = (type, startT, endT) => {
    if (resourceMap[type]) {
        for (let i = 0; i < resourceMap[type].length; i++) {
            const overlaps = resourceMap[type][i].some(blk => isOverlap(startT, endT, blk.start, blk.end));
            if (!overlaps) {
                resourceMap[type][i].push({ start: startT, end: endT });
                return true;
            }
        }
    }
    return false;
};

const pushToMap = (res, startT, endT) => {
    let success = false;
    if (res) {
        const laneMatch = res.match(/(BED|CHAIR|床|足|腳)[-_ ]?(?:\d+[-_ ])?(\d+)/i);
        if (laneMatch) {
            const type = (laneMatch[1].toUpperCase().includes('BED') || laneMatch[1].includes('床')) ? 'BED' : 'CHAIR';
            const idx = parseInt(laneMatch[2]) - 1;
            if (resourceMap[type] && resourceMap[type][idx]) {
                resourceMap[type][idx].push({ start: startT, end: endT });
                success = true;
            }
        }
    }
    if (!success) {
        pushToMapFallback('BED', startT, endT);
    }
};

// Simulate "葉" (12:46 - 14:06) on Beds 1-4
let startYe = 12 * 60 + 46;
let endYe = 14 * 60 + 6;
pushToMap("BED-1-1", startYe, endYe);
pushToMap("BED-1-2", startYe, endYe);
pushToMap("BED-1-3", startYe, endYe);
pushToMap("BED-1-4", startYe, endYe);

// Simulate "康" (14:01 - 15:36) 4 people with isFluid=true, uniqueMatches=[]
// So they use fallback
let startKang = 14 * 60 + 1;
let endKang = 15 * 60 + 36;

console.log("Adding Kang 1:", pushToMapFallback('BED', startKang, endKang));
console.log("Adding Kang 2:", pushToMapFallback('BED', startKang, endKang));
console.log("Adding Kang 3:", pushToMapFallback('BED', startKang, endKang));
console.log("Adding Kang 4:", pushToMapFallback('BED', startKang, endKang));

// Simulate new request "紀" (14:10 - 16:10)
let startJi = 14 * 60 + 10;
let endJi = 16 * 60 + 15; // 16:10 + 5 buffer
console.log("--- BED STATE BEFORE CHECK ---");
console.log(JSON.stringify(resourceMap.BED, null, 2));

function checkLaneContinuity(laneOccupiedArr, start, end) {
    const safeEnd = end;
    for (let block of laneOccupiedArr) {
        if (isOverlap(start, safeEnd, block.start, block.end)) return false;
    }
    return true;
}

let foundIdx = -1;
for (let k = 0; k < 6; k++) {
    if (checkLaneContinuity(resourceMap.BED[k], startJi, endJi)) {
        foundIdx = k;
        break;
    }
}
console.log("Found Index for Ji:", foundIdx);

const ResourceCore = {
    getMinsFromTimeStr: (timeStr) => {
        if (!timeStr) return -1;
        const [h, m] = timeStr.split(':');
        return parseInt(h) * 60 + parseInt(m);
    },
    CONFIG: { TRANSITION_BUFFER: 5, TOLERANCE: 5 }
};
function safeParseInt(val, fallback) {
    const v = parseInt(val, 10);
    return isNaN(v) ? fallback : v;
}
const b = {
    rowId: 100,
    startTime: '11:55',
    duration: 156,
    phase1_duration: 50,
    phase2_duration: 100,
    transition_time: '',
    flow: 'FB',
    category: '',
    serviceName: '',
    serviceCode: '',
    phase1_res_idx: 'CHAIR-1-6',
    phase2_res_idx: 'BED-1-2',
    allocated_resource: 'CHAIR-1-6+BED-1-2'
};

const blocks = [
    { start: 660, end: 700, res: 'CHAIR-1-3' }, // Phase 1 (11:00 - 11:40)
    { start: 705, end: 765, res: 'BED-1-2' }    // Phase 2 (11:45 - 12:45)
];

let bStartMins = ResourceCore.getMinsFromTimeStr(b.startTime);
let bDurMins = safeParseInt(b.duration, 60);
let bP1 = safeParseInt(b.phase1_duration, Math.floor(bDurMins / 2));
let bP2 = safeParseInt(b.phase2_duration, bDurMins - bP1);

if (b.transition_time) {
    const bTtMins = ResourceCore.getMinsFromTimeStr(b.transition_time);
    if (bTtMins !== -1 && bTtMins > bStartMins) {
        bP1 = bTtMins - bStartMins;
    }
}

let bFlow = b.flow;
let bBlocks = [];
const isCombo = true;

if (isCombo) {
    let res1 = b.phase1_res_idx;
    let res2 = b.phase2_res_idx;
    if (res1) bBlocks.push({ start: bStartMins, end: bStartMins + bP1, res: res1 });
    let p2Start = bStartMins + bP1 + ResourceCore.CONFIG.TRANSITION_BUFFER;
    if (b.transition_time) {
        const ttMins = ResourceCore.getMinsFromTimeStr(b.transition_time);
        if (ttMins !== -1 && ttMins > bStartMins) p2Start = ttMins;
    }
    if (res2) bBlocks.push({ start: p2Start, end: p2Start + bP2, res: res2 });
} else {
    const bRes = b.phase1_res_idx || b.phase2_res_idx || b.allocated_resource;
    if (bRes) bBlocks.push({ start: bStartMins, end: bStartMins + bDurMins, res: bRes });
}

console.log('isCombo:', isCombo);
console.log('bBlocks:', bBlocks);

let conflict = false;
for (const blk of blocks) {
    if (!blk.res) continue;
    for (const bBlk of bBlocks) {
        if (bBlk.res) {
            const bBlkResArray = [...bBlk.res.toString().toUpperCase().matchAll(/((?:BED|CHAIR)-[12]-\d+)/gi)].map(m => m[1]);
            const blkResClean = blk.res.toString().toUpperCase().trim();
            if (bBlkResArray.includes(blkResClean) || bBlk.res.toString().toUpperCase() === blkResClean) {
                const safeEndA = blk.end - ResourceCore.CONFIG.TOLERANCE;
                const safeEndB = bBlk.end - ResourceCore.CONFIG.TOLERANCE;
                if (safeEndA <= blk.start || safeEndB <= bBlk.start) continue;
                if (Math.max(blk.start, bBlk.start) < Math.min(safeEndA, safeEndB)) {
                    conflict = true;
                    console.log('CONFLICT on', blkResClean, 'blk.start', blk.start, 'blk.end', blk.end, 'bBlk.start', bBlk.start, 'bBlk.end', bBlk.end);
                }
            }
        }
    }
}
console.log('Conflict:', conflict);

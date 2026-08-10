const fs = require('fs');

class VirtualMatrix {
    constructor() {
        this.lanes = {
            'CHAIR': Array.from({ length: 6 }, (_, i) => ({ id: `CHAIR-1-${i + 1}`, occupied: [] })),
            'BED': Array.from({ length: 6 }, (_, i) => ({ id: `BED-1-${i + 1}`, occupied: [] }))
        };
        this.blockLog = [];
    }
    isOverlap(start1, end1, start2, end2) {
        return (start1 < end2 && start2 < end1);
    }
    checkLaneFree(lane, start, end) {
        for (let block of lane.occupied) {
            if (this.isOverlap(start, end, block.start, block.end)) {
                return { free: false, blocker: block };
            }
        }
        return { free: true };
    }
    allocateToLane(lane, start, end, ownerId) {
        lane.occupied.push({ start, end, ownerId });
        lane.occupied.sort((a, b) => a.start - b.start);
        return lane.id;
    }
    tryAllocate(type, start, end, ownerId, preferredIndex = null, isForced = false) {
        const resourceGroup = this.lanes[type];
        if (!resourceGroup) return null;

        if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
            const targetLane = resourceGroup[preferredIndex - 1];
            if (isForced || this.checkLaneFree(targetLane, start, end).free) {
                return this.allocateToLane(targetLane, start, end, ownerId);
            }
        }
        
        let sortedLanes = [...resourceGroup];
        for (let lane of sortedLanes) {
            const check = this.checkLaneFree(lane, start, end);
            if (check.free) {
                return this.allocateToLane(lane, start, end, ownerId);
            }
        }
        return null;
    }
}

function isBlockSetAllocatable(blocks, matrix) {
    for (let b of blocks) {
        const group = matrix.lanes[b.type];
        if (!group) return false;
        let found = false;
        for (let lane of group) {
            if (matrix.checkLaneFree(lane, b.start, b.end).free) {
                found = true; break;
            }
        }
        if (!found) return false;
    }
    return true;
}

let matrixSqueeze = new VirtualMatrix();

// 1. Place "方" (11:30 - 13:30) on CHAIR 1-6
for (let i = 1; i <= 6; i++) {
    matrixSqueeze.tryAllocate('CHAIR', 690, 810 + 5, '方', i, false);
}

// 2. Place "葉" (12:46 - 13:46) on BED 1-4
for (let i = 1; i <= 4; i++) {
    let res = matrixSqueeze.tryAllocate('BED', 766, 826 + 5, '葉', i, false);
    console.log("葉", i, res);
}

// 3. Place "康" (14:01 - 15:31) on BED 1-4
for (let i = 1; i <= 4; i++) {
    let res = matrixSqueeze.tryAllocate('BED', 841, 931 + 5, '康', i, false);
    console.log("康", i, res);
}

// 4. Check if "紀3/4" (14:10 - 16:10) can be placed on BED
let testBlocks = [{ type: 'BED', start: 850, end: 970 + 5, forcedIndex: null }];
let canAllocate = isBlockSetAllocatable(testBlocks, matrixSqueeze);
console.log("Can allocate 紀3/4?", canAllocate);

if (canAllocate) {
    testBlocks.forEach(tb => {
        let res = matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, '紀', tb.forcedIndex, false);
        console.log("Allocated 紀 at", res);
    });
}

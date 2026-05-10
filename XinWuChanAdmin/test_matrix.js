const CONF = {
    MAX_BEDS: 12,
    MAX_CHAIRS: 12,
    TOLERANCE: 5,
    TRANSITION_BUFFER: 5,
    CLEANUP_BUFFER: 5
};

function isOverlap(startA, endA, startB, endB) {
    const safeEndA = endA - CONF.TOLERANCE;
    const safeEndB = endB - CONF.TOLERANCE;
    return (startA < safeEndB) && (startB < safeEndA);
}

class VirtualMatrix {
    constructor() {
        this.lanes = {
            'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i + 1}`, occupied: [] })),
            'BED': Array.from({ length: CONF.MAX_BEDS }, (_, i) => ({ id: `BED-${i + 1}`, occupied: [] }))
        };
        this.blockLog = [];
    }
    checkLaneFree(lane, start, end) {
        for (let block of lane.occupied) {
            if (isOverlap(start, end, block.start, block.end)) return { free: false, blocker: block };
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

        let sortedLanes = [...resourceGroup].sort((a, b) => a.occupied.length - b.occupied.length);

        for (let lane of sortedLanes) {
            if (lane.occupied.length === 0) {
                if (this.checkLaneFree(lane, start, end).free) {
                    return this.allocateToLane(lane, start, end, ownerId);
                }
            }
        }

        for (let lane of sortedLanes) {
            if (lane.occupied.length > 0) {
                const check = this.checkLaneFree(lane, start, end);
                if (check.free) {
                    return this.allocateToLane(lane, start, end, ownerId);
                } else {
                    this.blockLog.push(`❌ ${lane.id} 被 ${check.blocker.ownerId} 擋住`);
                }
            }
        }

        return null;
    }
}

let matrix = new VirtualMatrix();

// 1. Existing Booking: 謝(1/9) to 謝(9/9)
for (let i = 1; i <= 9; i++) {
    // groupSize = 9, halfSize = 5
    // indices: 1, 2, 3, 4, 5, 1, 2, 3, 4
    let idx = i - 1;
    let vIndex = (idx % 5) + 1;
    matrix.tryAllocate('CHAIR', 1435, 1555 + 5, `XIE-${i}`, vIndex, true);
}

// 2. Existing Booking: 許(1/8) to 許(8/8)
for (let i = 1; i <= 8; i++) {
    // groupSize = 8, halfSize = 4
    // indices: 1, 2, 3, 4, 1, 2, 3, 4
    let idx = i - 1;
    let vIndex = (idx % 4) + 1;
    matrix.tryAllocate('CHAIR', 1555, 1675 + 5, `XU-${i}`, vIndex, true);
}

// 3. New Booking: 劉(1/1) BF
// BED: 01:00 to 01:50
// CHAIR: 02:00 to 04:00 (1560 to 1680)
// With Cleanup Buffer: 1680 + 5
const chairAlloc = matrix.tryAllocate('CHAIR', 1560, 1680 + 5, 'LIU', null, false);
console.log("LIU Phase 2 allocated to:", chairAlloc);
console.log("BlockLog:", matrix.blockLog);

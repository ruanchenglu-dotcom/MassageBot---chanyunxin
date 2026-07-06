const fs = require('fs');
let code = fs.readFileSync('cyx_resource_core.js', 'utf8');

// 1. Update the base case of placeNewGuestsElastically
const baseCaseOld = `if (guestIndex >= newGuestBlocksMap.length) return true;`;
const baseCaseNew = `if (guestIndex >= newGuestBlocksMap.length) {
                            let tempTimeline = [];
                            Object.values(currentMatrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
                                const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
                                if (ex) tempTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
                            })));
                            let staffOk = true;
                            for (let i = 0; i < newGuestBlocksMap.length; i++) {
                                const gOwnerId = \`NEW_GUEST_\${newGuestBlocksMap[i].guest.idx}\`;
                                let gBlocks = [];
                                Object.values(currentMatrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
                                    if (occ.ownerId === gOwnerId) gBlocks.push(occ);
                                })));
                                gBlocks.sort((a, b) => a.start - b.start);
                                if (gBlocks.length > 0) {
                                    let assigned = findAvailableStaff(newGuestBlocksMap[i].guest.staffName, gBlocks[0].start, gBlocks[gBlocks.length - 1].end, staffList, tempTimeline, dateStr);
                                    if (!assigned) { staffOk = false; break; }
                                    gBlocks.forEach(b => tempTimeline.push({ start: b.start, end: b.end, staffName: assigned }));
                                }
                            }
                            return staffOk;
                        }`;
code = code.replace(baseCaseOld, baseCaseNew);

// 2. Make conflictFound trigger if staff assignment fails for default blocks
const conflictOld = `if (!slotId) { conflictFound = true; break; }
                guestAllocations.push(slotId);
            }
            if (conflictFound) break;
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);`;

const conflictNew = `if (!slotId) { conflictFound = true; break; }
                guestAllocations.push(slotId);
            }
            if (conflictFound) break;
            
            let tempTimelineBase = [];
            Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
                const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
                if (ex) tempTimelineBase.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
            })));
            for (let i = 0; i <= newGuestBlocksMap.indexOf(item); i++) {
                let gOwner = \`NEW_GUEST_\${newGuestBlocksMap[i].guest.idx}\`;
                let gBlks = [];
                Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
                    if (occ.ownerId === gOwner) gBlks.push(occ);
                })));
                gBlks.sort((a, b) => a.start - b.start);
                if (gBlks.length > 0) {
                    let assigned = findAvailableStaff(newGuestBlocksMap[i].guest.staffName, gBlks[0].start, gBlks[gBlks.length - 1].end, staffList, tempTimelineBase, dateStr);
                    if (!assigned) { conflictFound = true; break; }
                    gBlks.forEach(b => tempTimelineBase.push({ start: b.start, end: b.end, staffName: assigned }));
                }
            }
            if (conflictFound) break;

            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);`;
code = code.replace(conflictOld, conflictNew);

// 3. Fix Section 6 Staff Assignment to use matrix blocks
const sec6Old = `        // 6. STAFF ASSIGNMENT
        let flatTimeline = [];
        Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
            const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
            if (ex) flatTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
        })));

        let staffAssignmentSuccess = true;
        for (const item of newGuestBlocksMap) {
            const assignedStaff = findAvailableStaff(item.guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length - 1].end, staffList, flatTimeline, dateStr);
            if (!assignedStaff) { staffAssignmentSuccess = false; break; }
            const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
            if (detail) detail.staff = assignedStaff;
            item.blocks.forEach(b => flatTimeline.push({ start: b.start, end: b.end, staffName: assignedStaff }));
        }`;

const sec6New = `        // 6. STAFF ASSIGNMENT
        let flatTimeline = [];
        Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
            const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
            if (ex) flatTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
        })));

        let staffAssignmentSuccess = true;
        for (const item of newGuestBlocksMap) {
            const guestOwnerId = \`NEW_GUEST_\${item.guest.idx}\`;
            let guestBlocks = [];
            Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
                if (occ.ownerId === guestOwnerId) guestBlocks.push(occ);
            })));
            guestBlocks.sort((a, b) => a.start - b.start);
            
            if (guestBlocks.length > 0) {
                const assignedStaff = findAvailableStaff(item.guest.staffName, guestBlocks[0].start, guestBlocks[guestBlocks.length - 1].end, staffList, flatTimeline, dateStr);
                if (!assignedStaff) { staffAssignmentSuccess = false; break; }
                const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
                if (detail) detail.staff = assignedStaff;
                guestBlocks.forEach(b => flatTimeline.push({ start: b.start, end: b.end, staffName: assignedStaff }));
            }
        }`;
code = code.replace(sec6Old, sec6New);

fs.writeFileSync('cyx_resource_core.js', code);
console.log('Fixed cyx_resource_core.js');

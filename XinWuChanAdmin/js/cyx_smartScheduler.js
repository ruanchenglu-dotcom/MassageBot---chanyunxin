/**
 * XinWuChan Smart Scheduler (CSP/Backtracking Algorithm)
 * Tự động sắp xếp lại lịch trình khi có xung đột (Drag & Drop)
 */

window.SmartScheduler = (function() {
    
    const safeTimeToMinsLocal = (tStr) => {
        if (!tStr) return 0;
        const p = tStr.split(' ')[1];
        if (!p) return 0;
        const [h, m] = p.split(':').map(Number);
        return h * 60 + (m || 0);
    };

    const getSafeTime = (timeStr) => {
        return window.safeTimeToMins ? window.safeTimeToMins(timeStr) : safeTimeToMinsLocal(timeStr);
    };

    // Helper: Lấy danh sách tài nguyên khả dụng cùng loại/khu vực
    const getCandidateResources = (currentResId) => {
        if (!currentResId) return [];
        let rId = String(currentResId).toUpperCase().trim();
        let prefixMatch = rId.match(/^(.+?-)/);
        let prefix = prefixMatch ? prefixMatch[1] : rId.substring(0, 1) + '1-';
        
        let maxCount = (rId.includes('床') || rId.includes('BED')) ? (window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS || 6) : (window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS || 6);
        if (rId.includes('OPP-CHAIR')) maxCount = window.SYSTEM_CONFIG?.SCALE?.OPP_CHAIRS || 4;
        if (rId.includes('OPP-BED')) maxCount = window.SYSTEM_CONFIG?.SCALE?.OPP_BEDS || 6;
        
        let resources = [];
        for (let i = 1; i <= maxCount; i++) {
            resources.push(prefix + i);
        }
        return resources;
    };

    const isComboBooking = (b) => {
        return b.category === 'COMBO' || (b.serviceName && b.serviceName.includes('套餐')) || b.flow === 'FB' || b.flow === 'BF';
    };

    const isSameRes = (id1, id2) => {
        if (!id1 || !id2) return false;
        let s1 = String(id1).trim().toUpperCase().replace(/BED/g, '床').replace(/\s+/g, '');
        let s2 = String(id2).trim().toUpperCase().replace(/BED/g, '床').replace(/\s+/g, '');
        return s1 === s2;
    };

    const isTargetPhaseLocked = (b, isCombo) => {
        if (b.isRunningStatus || b.status === 'DOING' || b.isDoneStatus) return true;
        if (isCombo) {
            return (b.phase1_locked === "TRUE" || b.phase1_locked === true) && 
                   (b.phase2_locked === "TRUE" || b.phase2_locked === true);
        } else {
            return b.is_locked === "TRUE" || b.isManualLocked;
        }
    };

    // Tính toán Start/End thực tế cho 1 booking dựa trên assignment
    const getAssignedTimes = (b, assignment) => {
        const bStart = getSafeTime(b.startTimeString);
        const duration = parseInt(b.duration || 60, 10);
        const isCombo = isComboBooking(b);
        
        if (!isCombo) {
            return [{
                res: assignment.res,
                start: bStart,
                end: bStart + duration,
                phase: 0
            }];
        }

        // Combo
        const flow = assignment.flow || b.flow || 'FB';
        const split = window.getSmartSplit ? window.getSmartSplit(b, duration, true, flow) : { phase1: Math.floor(duration / 2), phase2: Math.ceil(duration / 2) };
        const transitionMins = window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5;
        
        let p1End = bStart + split.phase1;
        let p2Start = p1End + transitionMins;
        let p2End = p2Start + split.phase2;
        
        if (b.transition_time) {
            const transMins = getSafeTime(b.transition_time);
            if (transMins !== -1 && transMins > 0) {
                p2Start = transMins;
                p2End = p2Start + split.phase2;
            }
        }

        return [
            { res: assignment.phase1_res, start: bStart, end: p1End, phase: 1 },
            { res: assignment.phase2_res, start: p2Start, end: p2End, phase: 2 }
        ];
    };

    const hasConflict = (times1, times2) => {
        for (let t1 of times1) {
            for (let t2 of times2) {
                if (isSameRes(t1.res, t2.res)) {
                    if (t1.start < t2.end && t2.start < t1.end) {
                        return true;
                    }
                }
            }
        }
        return false;
    };

    /**
     * Thuật toán Backtracking tìm phương án sắp xếp
     */
    const backtrack = (variables, assignments, fixedTimes, index, state) => {
        if (index === variables.length) {
            return { ...assignments };
        }
        
        if (state.iterations > 5000) {
            return null; 
        }
        state.iterations++;

        const currentVar = variables[index];
        const domains = currentVar.domains;

        for (let domainValue of domains) {
            let tempAssignment = { ...domains[domainValue] }; 
            const currentTimes = getAssignedTimes(currentVar.booking, domainValue);
            
            let conflict = false;
            for (let ft of fixedTimes) {
                if (hasConflict(currentTimes, ft)) {
                    conflict = true;
                    break;
                }
            }
            if (conflict) continue;

            for (let i = 0; i < index; i++) {
                const prevVar = variables[i];
                const prevTimes = getAssignedTimes(prevVar.booking, assignments[prevVar.booking.rowId]);
                if (hasConflict(currentTimes, prevTimes)) {
                    conflict = true;
                    break;
                }
            }
            if (conflict) continue;

            assignments[currentVar.booking.rowId] = domainValue;
            
            const result = backtrack(variables, assignments, fixedTimes, index + 1, state);
            if (result) return result;
            
            delete assignments[currentVar.booking.rowId];
        }

        return null;
    };

    const solve = (activeBookings, movedBookingId, targetResource, targetPhase, isMovedCombo) => {
        let variables = [];
        let fixedTimes = [];
        let originalState = {}; 

        const movedIdStr = String(movedBookingId);
        const targetIdUpper = String(targetResource).toUpperCase();

        for (let b of activeBookings) {
            const isCombo = isComboBooking(b);
            const bRowIdStr = String(b.rowId);
            
            // Nếu là booking đang bị kéo thả -> Cố định nó vào target
            if (bRowIdStr === movedIdStr) {
                let assignment = {};
                if (isCombo) {
                    assignment.flow = isTargetPhaseLocked(b, true) && b.flow_code_locked ? b.flow : (targetIdUpper.includes('床') || targetIdUpper.includes('BED') ? 'BF' : 'FB');
                    if (b.flow_code_locked === "TRUE" || b.flow_code_locked === true) assignment.flow = b.flow; 
                    
                    assignment.phase1_res = String(b.phase1_res_idx).toUpperCase();
                    assignment.phase2_res = String(b.phase2_res_idx).toUpperCase();
                    
                    if (targetPhase === 1) assignment.phase1_res = targetIdUpper;
                    else assignment.phase2_res = targetIdUpper;
                    
                    const isBed = (id) => id && (String(id).toUpperCase().includes('床') || String(id).toUpperCase().includes('BED'));
                    if (assignment.phase1_res && assignment.phase2_res && isBed(assignment.phase1_res) === isBed(assignment.phase2_res)) {
                        if (targetPhase === 1) assignment.phase2_res = String(b.phase1_res_idx).toUpperCase();
                        else assignment.phase1_res = String(b.phase2_res_idx).toUpperCase();
                    }
                    assignment.flow = isBed(assignment.phase1_res) ? 'BF' : 'FB';
                } else {
                    assignment.res = targetIdUpper;
                }
                fixedTimes.push(getAssignedTimes(b, assignment));
                continue;
            }

            let locked1 = (b.phase1_locked === "TRUE" || b.phase1_locked === true);
            let locked2 = (b.phase2_locked === "TRUE" || b.phase2_locked === true);
            let locked = (b.is_locked === "TRUE" || b.isManualLocked);
            
            if (b.isRunningStatus || b.status === 'DOING' || b.isDoneStatus) {
                locked = true;
                locked1 = true;
                locked2 = true;
            }

            let assignmentOriginal = {};
            if (isCombo) {
                assignmentOriginal = {
                    flow: b.flow || 'FB',
                    phase1_res: String(b.phase1_res_idx || '').toUpperCase(),
                    phase2_res: String(b.phase2_res_idx || '').toUpperCase()
                };
            } else {
                assignmentOriginal = {
                    res: String(b.current_resource_id || b.location || '').toUpperCase()
                };
            }
            originalState[bRowIdStr] = assignmentOriginal;

            if (isCombo && locked1 && locked2) {
                fixedTimes.push(getAssignedTimes(b, assignmentOriginal));
            } else if (!isCombo && locked) {
                fixedTimes.push(getAssignedTimes(b, assignmentOriginal));
            } else {
                let domains = [];
                if (isCombo) {
                    const bedCandidates = getCandidateResources(b.flow === 'FB' ? b.phase2_res_idx : b.phase1_res_idx); 
                    const chairCandidates = getCandidateResources(b.flow === 'FB' ? b.phase1_res_idx : b.phase2_res_idx); 
                    
                    let p1Cand = b.flow === 'FB' ? chairCandidates : bedCandidates;
                    let p2Cand = b.flow === 'FB' ? bedCandidates : chairCandidates;

                    let allowedFlows = (b.flow_code_locked === "TRUE" || b.flow_code_locked === true) ? [b.flow || 'FB'] : ['FB', 'BF'];
                    
                    for (let f of allowedFlows) {
                        let c1 = f === 'FB' ? chairCandidates : bedCandidates;
                        let c2 = f === 'FB' ? bedCandidates : chairCandidates;
                        
                        if (locked1) c1 = [String(b.phase1_res_idx).toUpperCase()];
                        if (locked2) c2 = [String(b.phase2_res_idx).toUpperCase()];

                        for (let r1 of c1) {
                            for (let r2 of c2) {
                                domains.push({ flow: f, phase1_res: r1, phase2_res: r2 });
                            }
                        }
                    }
                    
                    domains.sort((d1, d2) => {
                        let score1 = 0;
                        if (d1.flow === assignmentOriginal.flow) score1 += 10; // ĐIỂM ƯU TIÊN GIỮ NGUYÊN LUỒNG
                        if (d1.phase1_res === assignmentOriginal.phase1_res) score1 += 5;
                        if (d1.phase2_res === assignmentOriginal.phase2_res) score1 += 5;
                        
                        let score2 = 0;
                        if (d2.flow === assignmentOriginal.flow) score2 += 10;
                        if (d2.phase1_res === assignmentOriginal.phase1_res) score2 += 5;
                        if (d2.phase2_res === assignmentOriginal.phase2_res) score2 += 5;
                        
                        return score2 - score1;
                    });
                    
                } else {
                    const cands = getCandidateResources(assignmentOriginal.res);
                    for (let r of cands) {
                        domains.push({ res: r });
                    }
                    domains.sort((d1, d2) => {
                        return (d1.res === assignmentOriginal.res ? -1 : 1) - (d2.res === assignmentOriginal.res ? -1 : 1);
                    });
                }

                variables.push({
                    booking: b,
                    domains: domains
                });
            }
        }

        let state = { iterations: 0 };
        const result = backtrack(variables, {}, fixedTimes, 0, state);
        
        if (!result) return null; 

        let payloads = [];
        
        let movedPayload = { rowId: movedBookingId, forceSync: true, is_locked: "TRUE", isManualLocked: true };
        const movedB = activeBookings.find(x => String(x.rowId) === movedIdStr);
        if (movedB) {
            if (isComboBooking(movedB)) {
                let assignment = {};
                assignment.phase1_res = String(movedB.phase1_res_idx).toUpperCase();
                assignment.phase2_res = String(movedB.phase2_res_idx).toUpperCase();
                if (targetPhase === 1) assignment.phase1_res = targetIdUpper;
                else assignment.phase2_res = targetIdUpper;
                
                const isBed = (id) => id && (String(id).toUpperCase().includes('床') || String(id).toUpperCase().includes('BED'));
                if (assignment.phase1_res && assignment.phase2_res && isBed(assignment.phase1_res) === isBed(assignment.phase2_res)) {
                    if (targetPhase === 1) assignment.phase2_res = String(movedB.phase1_res_idx).toUpperCase();
                    else assignment.phase1_res = String(movedB.phase2_res_idx).toUpperCase();
                }
                movedPayload.phase1_res_idx = assignment.phase1_res.toLowerCase();
                movedPayload.phase2_res_idx = assignment.phase2_res.toLowerCase();
                movedPayload.flow = isBed(assignment.phase1_res) ? 'BF' : 'FB';
            } else {
                movedPayload.current_resource_id = targetIdUpper.toLowerCase();
                movedPayload.location = targetIdUpper.toLowerCase();
            }
            payloads.push(movedPayload);
        }

        for (let rowId in result) {
            let bRowIdStr = String(rowId);
            let newAssignt = result[rowId];
            let orig = originalState[bRowIdStr];
            let isChanged = false;
            
            let p = { rowId: rowId, forceSync: true };
            
            if (newAssignt.flow !== undefined) {
                if (newAssignt.flow !== orig.flow || newAssignt.phase1_res !== orig.phase1_res || newAssignt.phase2_res !== orig.phase2_res) {
                    isChanged = true;
                    p.flow = newAssignt.flow;
                    p.phase1_res_idx = newAssignt.phase1_res.toLowerCase();
                    p.phase2_res_idx = newAssignt.phase2_res.toLowerCase();
                }
            } else {
                if (newAssignt.res !== orig.res) {
                    isChanged = true;
                    p.current_resource_id = newAssignt.res.toLowerCase();
                    p.location = newAssignt.res.toLowerCase();
                }
            }

            if (isChanged) {
                p.is_locked = "TRUE";
                p.isManualLocked = true;
                payloads.push(p);
            }
        }

        return payloads;
    };

    return {
        solve: solve
    };
})();

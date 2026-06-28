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

    const minsToTimeString = (mins, originDateStr) => {
        let h = Math.floor(mins / 60);
        let m = mins % 60;
        let hh = String(h).padStart(2, '0');
        let mm = String(m).padStart(2, '0');
        let datePart = originDateStr ? originDateStr.split(' ')[0] : '';
        return datePart ? `${datePart} ${hh}:${mm}` : `${hh}:${mm}`;
    };

    // Helper: Lấy danh sách tài nguyên khả dụng cùng loại/khu vực
    const getCandidateResources = (currentResId) => {
        if (!currentResId) return [];
        let rId = String(currentResId).toUpperCase().trim();
        let prefix = 'CHAIR-1-';
        let maxCount = window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS || 6;

        if (rId.includes('OPP-CHAIR') || rId.includes('OPP_CHAIR')) {
            prefix = 'CHAIR-2-';
            maxCount = window.SYSTEM_CONFIG?.SCALE?.OPP_CHAIRS || 4;
        } else if (rId.includes('OPP-BED') || rId.includes('OPP_BED')) {
            prefix = 'BED-2-';
            maxCount = window.SYSTEM_CONFIG?.SCALE?.OPP_BEDS || 6;
        } else if (rId.includes('BED-2') || rId.includes('床2')) {
            prefix = 'BED-2-';
            maxCount = window.SYSTEM_CONFIG?.SCALE?.OPP_BEDS || 6;
        } else if (rId.includes('CHAIR-2') || rId.includes('腳2')) {
            prefix = 'CHAIR-2-';
            maxCount = window.SYSTEM_CONFIG?.SCALE?.OPP_CHAIRS || 4;
        } else if (rId.includes('BED') || rId.includes('床')) {
            prefix = 'BED-1-';
            maxCount = window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS || 6;
        } else {
            prefix = 'CHAIR-1-';
            maxCount = window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS || 6;
        }
        
        let resources = [];
        for (let i = 1; i <= maxCount; i++) {
            resources.push(prefix + i);
        }
        return resources;
    };

    const normalizeRes = (res) => {
        if (!res) return '';
        let s = String(res).toUpperCase().trim();
        let match = s.match(/^(CHAIR|BED|OPP-CHAIR|OPP-BED|OPP_CHAIR|OPP_BED)-?(\d+)-?(\d+)?$/);
        if (match) {
            let type = match[1].replace('_', '-');
            let num = match[3] || match[2];
            return `${type}-1-${num}`;
        }
        match = s.match(/^(CHAIR|BED|OPP-CHAIR|OPP-BED|OPP_CHAIR|OPP_BED)\s*(\d+)$/);
        if (match) {
            let type = match[1].replace('_', '-');
            return `${type}-1-${match[2]}`;
        }
        match = s.match(/^(床|腳|椅|對面床|對面腳|對面椅)-?(\d+)-?(\d+)?$/);
        if (match) {
            let type = 'CHAIR';
            if (match[1] === '床') type = 'BED';
            else if (match[1] === '對面床') type = 'OPP-BED';
            else if (match[1] === '對面腳' || match[1] === '對面椅') type = 'OPP-CHAIR';
            let num = match[3] || match[2];
            return `${type}-1-${num}`;
        }
        return s;
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
        const timeShift = assignment.timeShift || 0;
        const bStart = getSafeTime(b.startTimeString) + timeShift;
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
        const transitionShift = assignment.transitionShift || 0;
        
        let p1End = bStart + split.phase1;
        let p2Start = p1End + transitionMins + transitionShift;
        let p2End = p2Start + split.phase2;
        
        if (b.transition_time) {
            const transMins = getSafeTime(b.transition_time);
            if (transMins !== -1 && transMins > 0) {
                p2Start = transMins + timeShift + transitionShift;
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
        
        if (state.iterations > 500000) {
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
        let movedTimes = null;
        let originalState = {}; 

        const movedIdStr = String(movedBookingId);
        const targetIdUpper = String(targetResource).toUpperCase();

        let bSourceId = null;
        const movedBForSource = activeBookings.find(x => String(x.rowId) === movedIdStr);
        if (movedBForSource) {
            if (isMovedCombo) {
                bSourceId = targetPhase === 1 ? movedBForSource.phase1_res_idx : movedBForSource.phase2_res_idx;
            } else {
                bSourceId = movedBForSource.current_resource_id || movedBForSource.location;
            }
        }
        if (bSourceId) bSourceId = normalizeRes(bSourceId);

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
                movedTimes = getAssignedTimes(b, assignment);
                fixedTimes.push(movedTimes);
                continue;
            }

            let locked1 = false;
            let locked2 = false;
            let locked = false;
            
            if (b.isRunningStatus || b.status === 'DOING') {
                locked = true;
                locked1 = true;
                locked2 = true;
            }

            let assignmentOriginal = {};
            if (isCombo) {
                assignmentOriginal = {
                    flow: b.flow || 'FB',
                    phase1_res: normalizeRes(b.phase1_res_idx),
                    phase2_res: normalizeRes(b.phase2_res_idx),
                    timeShift: 0,
                    transitionShift: 0
                };
            } else {
                assignmentOriginal = {
                    res: normalizeRes(b.current_resource_id || b.location),
                    timeShift: 0
                };
            }
            originalState[bRowIdStr] = assignmentOriginal;

            if (isCombo && locked1 && locked2) {
                fixedTimes.push(getAssignedTimes(b, assignmentOriginal));
            } else if (!isCombo && locked) {
                fixedTimes.push(getAssignedTimes(b, assignmentOriginal));
            } else {
                let domains = [];
                let allowedTimeShifts = [0];
                let allowedTransShifts = [-10, -5, 0, 5, 10];

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
                                for (let ts of allowedTimeShifts) {
                                    for (let trs of allowedTransShifts) {
                                        domains.push({ flow: f, phase1_res: r1, phase2_res: r2, timeShift: ts, transitionShift: trs });
                                    }
                                }
                            }
                        }
                    }
                    
                    domains.sort((d1, d2) => {
                        let score1 = 0;
                        if (d1.flow === assignmentOriginal.flow) score1 += 10; 
                        if (d1.phase1_res === assignmentOriginal.phase1_res) score1 += 5;
                        else if (bSourceId && d1.phase1_res === bSourceId) score1 += 4;
                        if (d1.phase2_res === assignmentOriginal.phase2_res) score1 += 5;
                        else if (bSourceId && d1.phase2_res === bSourceId) score1 += 4;
                        score1 -= Math.abs(d1.timeShift);
                        score1 -= Math.abs(d1.transitionShift);
                        
                        let score2 = 0;
                        if (d2.flow === assignmentOriginal.flow) score2 += 10;
                        if (d2.phase1_res === assignmentOriginal.phase1_res) score2 += 5;
                        else if (bSourceId && d2.phase1_res === bSourceId) score2 += 4;
                        if (d2.phase2_res === assignmentOriginal.phase2_res) score2 += 5;
                        else if (bSourceId && d2.phase2_res === bSourceId) score2 += 4;
                        score2 -= Math.abs(d2.timeShift);
                        score2 -= Math.abs(d2.transitionShift);
                        
                        return score2 - score1;
                    });
                    
                } else {
                    const cands = getCandidateResources(assignmentOriginal.res);
                    for (let r of cands) {
                        for (let ts of allowedTimeShifts) {
                            domains.push({ res: r, timeShift: ts });
                        }
                    }
                    domains.sort((d1, d2) => {
                        let s1 = 0;
                        if (d1.res === assignmentOriginal.res) s1 += 10;
                        else if (bSourceId && d1.res === bSourceId) s1 += 8;
                        s1 -= Math.abs(d1.timeShift);

                        let s2 = 0;
                        if (d2.res === assignmentOriginal.res) s2 += 10;
                        else if (bSourceId && d2.res === bSourceId) s2 += 8;
                        s2 -= Math.abs(d2.timeShift);

                        return s2 - s1;
                    });
                }

                variables.push({
                    booking: b,
                    domains: domains
                });
            }
        }

        let state = { iterations: 0 };

        // [NÂNG CẤP] Chỉ kiểm tra khối vừa kéo thả xem có đè lên các khối cố định khác không
        if (movedTimes) {
            for (let ft of fixedTimes) {
                if (ft !== movedTimes && hasConflict(movedTimes, ft)) {
                    // Cấn đè trực tiếp lên khách đang phục vụ
                    return null;
                }
            }
        }

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
                movedPayload.phase1_res_idx = assignment.phase1_res.toUpperCase();
                movedPayload.phase2_res_idx = assignment.phase2_res.toUpperCase();
                movedPayload.flow = isBed(assignment.phase1_res) ? 'BF' : 'FB';
            } else {
                movedPayload.current_resource_id = targetIdUpper.toUpperCase();
                movedPayload.location = targetIdUpper.toUpperCase();
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
                if (newAssignt.flow !== orig.flow || newAssignt.phase1_res !== orig.phase1_res || newAssignt.phase2_res !== orig.phase2_res || newAssignt.timeShift !== 0 || newAssignt.transitionShift !== 0) {
                    isChanged = true;
                    p.flow = newAssignt.flow;
                    p.phase1_res_idx = newAssignt.phase1_res.toUpperCase();
                    p.phase2_res_idx = newAssignt.phase2_res.toUpperCase();
                }
            } else {
                if (newAssignt.res !== orig.res || newAssignt.timeShift !== 0) {
                    isChanged = true;
                    p.current_resource_id = newAssignt.res.toUpperCase();
                    p.location = newAssignt.res.toUpperCase();
                }
            }

            if (isChanged) {
                p.is_locked = "TRUE";
                p.isManualLocked = true;
                
                const bOrigin = activeBookings.find(x => String(x.rowId) === bRowIdStr);
                if (bOrigin && (newAssignt.timeShift !== 0 || newAssignt.transitionShift !== 0)) {
                    if (newAssignt.timeShift !== 0) {
                        const originStartMins = getSafeTime(bOrigin.startTimeString);
                        p.startTimeString = minsToTimeString(originStartMins + newAssignt.timeShift, bOrigin.startTimeString);
                    }
                    if (newAssignt.transitionShift !== 0) {
                        const duration = parseInt(bOrigin.duration || 60, 10);
                        const flow = newAssignt.flow || bOrigin.flow || 'FB';
                        const split = window.getSmartSplit ? window.getSmartSplit(bOrigin, duration, true, flow) : { phase1: Math.floor(duration / 2), phase2: Math.ceil(duration / 2) };
                        const bStartMins = getSafeTime(bOrigin.startTimeString) + (newAssignt.timeShift || 0);
                        let p1EndMins = bStartMins + split.phase1;
                        let currentTransMins = p1EndMins;
                        if (bOrigin.transition_time) {
                            const oldTransMins = getSafeTime(bOrigin.transition_time);
                            if (oldTransMins !== -1 && oldTransMins > 0) {
                                currentTransMins = oldTransMins + (newAssignt.timeShift || 0);
                            }
                        } else {
                            currentTransMins = p1EndMins + (window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5);
                        }
                        
                        p.transition_time = minsToTimeString(currentTransMins + newAssignt.transitionShift, bOrigin.startTimeString);
                        p.phase1_duration = split.phase1;
                        p.phase2_duration = split.phase2;
                    }
                }
                
                payloads.push(p);
            }
        }

        return payloads;
    };

    return {
        solve: solve
    };
})();

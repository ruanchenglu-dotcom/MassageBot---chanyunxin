const { useState, useEffect, useMemo, useRef } = React;

// --- TIMELINE VIEW (GIỮ NGUYÊN) ---
const TimelineView = ({ bookings, resourceState }) => {
    const rows = useMemo(() => [
        ...[1,2,3,4,5,6].map(i => ({ id: `chair-${i}`, label: `💺 足 ${i}`, type: 'FOOT' })),
        { type: 'DIVIDER' }, 
        ...[1,2,3,4,5,6].map(i => ({ id: `bed-${i}`, label: `🛏️ 身 ${i}`, type: 'BODY' }))
    ], []);

    const hours = []; for(let i=8; i<=32; i++) hours.push(i);
    const TRANSITION_BUFFER = 5; 

    const calculateStyle = (startMins, duration) => {
        const timelineStartMins = 8 * 60; 
        const totalTimelineMins = 1440; 
        let effectiveStart = startMins;
        if (effectiveStart < timelineStartMins) effectiveStart += 1440;

        const offset = effectiveStart - timelineStartMins;
        const left = (offset / totalTimelineMins) * 100;
        const width = (duration / totalTimelineMins) * 100;
        return { left: `${left}%`, width: `${width}%` };
    };

    const timelineItems = useMemo(() => {
        const items = [];
        const grid = {}; 
        rows.forEach(r => { if(r.id) grid[r.id] = new Set(); });

        const lockGrid = (rowId, start, end) => {
            if (grid[rowId]) { for (let m = Math.floor(start); m < Math.ceil(end); m++) grid[rowId].add(m); }
        };

        const isColliding = (rowId, start, end) => {
            if (!grid[rowId]) return true;
            for (let m = Math.floor(start); m < Math.ceil(end); m++) { if (grid[rowId].has(m)) return true; }
            return false;
        };

        const findSlot = (prefix, start, end) => {
            for(let i=1; i<=6; i++) {
                const id = `${prefix}-${i}`;
                if (!isColliding(id, start, end)) return { id, conflict: false };
            }
            return { id: `${prefix}-6`, conflict: true };
        };

        const allocatedCounts = {};
        const safeResourceState = resourceState || {};

        Object.keys(safeResourceState).forEach(key => {
            const res = safeResourceState[key];
            if (res && res.booking && res.isRunning) { 
                const bRowId = String(res.booking.rowId);
                if (!allocatedCounts[bRowId]) allocatedCounts[bRowId] = 0;
                allocatedCounts[bRowId]++;

                let startMins;
                if(res.startTime) {
                    const d = new Date(res.startTime);
                    startMins = d.getHours()*60 + d.getMinutes();
                } else {
                    startMins = window.normalizeToTimelineMins(res.booking.startTimeString.split(' ')[1]);
                }
                if(startMins < 480) startMins += 1440;
                
                let effectiveDuration = window.getSafeDuration(res.booking.serviceName, res.booking.duration);
                const isCombo = res.booking.category === 'COMBO' || (res.booking.serviceName && res.booking.serviceName.includes('套餐'));
                
                const phoneSuffix = res.booking.sdt && res.booking.sdt.length >= 2 ? res.booking.sdt.slice(-2) : '..';
                const simpleLabel = `${res.booking.customerName} (${phoneSuffix})`;

                if (isCombo) {
                    let seq = (res.comboMeta && res.comboMeta.sequence) || 'FB';
                    const isChair = key.includes('chair');
                    const phase1IsChair = seq === 'FB';
                    const isPhase1 = (isChair && phase1IsChair) || (!isChair && !phase1IsChair);

                    const split = window.getComboSplit(effectiveDuration, res.isMaxMode, seq);
                    const phaseDuration = isPhase1 ? split.phase1 : split.phase2;
                    const flexMinutes = res.comboMeta && res.comboMeta.flex ? res.comboMeta.flex : 0;
                    const displayPhase1Dur = isPhase1 ? phaseDuration + flexMinutes : phaseDuration;
                    
                    items.push({
                        id: `ACT_${isPhase1?'P1':'P2'}_${res.booking.rowId}_${key}`, 
                        rowId: key, 
                        style: calculateStyle(startMins, displayPhase1Dur),
                        color: window.stringToColor(res.booking.customerName), 
                        label: simpleLabel,
                        sub: isPhase1 ? 'Phase 1' : 'Phase 2', 
                        isPlanned: !res.isRunning, 
                        isCombo: true
                    });
                    lockGrid(key, startMins, startMins + displayPhase1Dur);

                    if (isPhase1 && res.comboMeta && res.comboMeta.targetId) {
                        const nextStart = startMins + displayPhase1Dur + TRANSITION_BUFFER;
                        const nextDuration = split.phase2;
                        const targetRow = res.comboMeta.targetId;

                        if (rows.some(r => r.id === targetRow)) {
                            items.push({
                                id: `ACT_P2_LOCKED_${res.booking.rowId}_${targetRow}`,
                                rowId: targetRow,
                                style: calculateStyle(nextStart, nextDuration),
                                color: window.stringToColor(res.booking.customerName),
                                label: simpleLabel,
                                sub: 'Phase 2',
                                isPlanned: true, 
                                isCombo: true,
                                opacity: 1.0
                            });
                            lockGrid(targetRow, nextStart, nextStart + nextDuration);
                        }
                    }

                } else {
                    items.push({
                        id: `ACT_${res.booking.rowId}_${key}`, rowId: key, 
                        style: calculateStyle(startMins, effectiveDuration),
                        color: window.stringToColor(res.booking.customerName), 
                        label: simpleLabel, sub: '', isPlanned: !res.isRunning, isCombo: false
                    });
                    lockGrid(key, startMins, startMins + effectiveDuration);
                }
            }
        });

        const safeBookings = Array.isArray(bookings) ? bookings : [];
        const sortedBookings = [...safeBookings].filter(b => !b.status.includes('取消') && !b.status.includes('完成')).sort((a,b) => window.normalizeToTimelineMins(a.startTimeString.split(' ')[1]) - window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]));

        const listSingles = sortedBookings.filter(b => b.category !== 'COMBO' && !b.serviceName.includes('套餐'));
        const listCombos = sortedBookings.filter(b => b.category === 'COMBO' || b.serviceName.includes('套餐'));
        const finalQueue = [...listSingles, ...listCombos]; 

        finalQueue.forEach(b => {
            const totalPax = b.pax || 1;
            const bRowId = String(b.rowId);
            const activeCount = allocatedCounts[bRowId] || 0;
            const remainingPax = totalPax - activeCount;
            const duration = window.getSafeDuration(b.serviceName, b.duration);
            const phoneSuffix = b.sdt && b.sdt.length >= 2 ? b.sdt.slice(-2) : '..';
            const simpleLabel = `${b.customerName} (${phoneSuffix})`;

            if (remainingPax > 0) {
                for(let k=0; k<remainingPax; k++) {
                    const originalStartMins = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                    const isCombo = b.category === 'COMBO' || b.serviceName.includes('套餐');
                    
                    if (isCombo) {
                        let searchOffsets = [0];
                        for(let i=1; i<=5; i++) { searchOffsets.push(i); searchOffsets.push(-i); }
                        for(let i=6; i<=120; i++) { searchOffsets.push(i); }

                        let found = false;
                        for(let delay of searchOffsets) {
                            if(found) break;
                            const tryStart = originalStartMins + delay;
                            
                            const splitFB = window.getComboSplit(duration, true, 'FB');
                            const s1_FB = findSlot('chair', tryStart, tryStart + splitFB.phase1);
                            if(!s1_FB.conflict) {
                                const t2 = tryStart + splitFB.phase1 + TRANSITION_BUFFER;
                                const s2_FB = findSlot('bed', t2, t2 + splitFB.phase2);
                                if(!s2_FB.conflict) {
                                    items.push({ id: `PLN_${b.rowId}_${k}_1`, rowId: s1_FB.id, style: calculateStyle(tryStart, splitFB.phase1), color: window.stringToColor(b.customerName), label: simpleLabel, sub: '', isPlanned: true, isCombo: true });
                                    lockGrid(s1_FB.id, tryStart, tryStart + splitFB.phase1);
                                    items.push({ id: `PLN_${b.rowId}_${k}_2`, rowId: s2_FB.id, style: calculateStyle(t2, splitFB.phase2), color: window.stringToColor(b.customerName), label: simpleLabel, sub: '', isPlanned: true, isCombo: true });
                                    lockGrid(s2_FB.id, t2, t2 + splitFB.phase2);
                                    found=true; break;
                                }
                            }

                            const splitBF = window.getComboSplit(duration, true, 'BF');
                            const s1_BF = findSlot('bed', tryStart, tryStart + splitBF.phase1);
                            if(!s1_BF.conflict) {
                                const t2 = tryStart + splitBF.phase1 + TRANSITION_BUFFER;
                                const s2_BF = findSlot('chair', t2, t2 + splitBF.phase2);
                                if(!s2_BF.conflict) {
                                    items.push({ id: `PLN_${b.rowId}_${k}_1`, rowId: s1_BF.id, style: calculateStyle(tryStart, splitBF.phase1), color: window.stringToColor(b.customerName), label: simpleLabel, sub: '', isPlanned: true, isCombo: true });
                                    lockGrid(s1_BF.id, tryStart, tryStart + splitBF.phase1);
                                    items.push({ id: `PLN_${b.rowId}_${k}_2`, rowId: s2_BF.id, style: calculateStyle(t2, splitBF.phase2), color: window.stringToColor(b.customerName), label: simpleLabel, sub: '', isPlanned: true, isCombo: true });
                                    lockGrid(s2_BF.id, t2, t2 + splitBF.phase2);
                                    found=true; break;
                                }
                            }
                        }
                    } else {
                        const type = b.type === 'CHAIR' ? 'chair' : 'bed';
                        let slot = null;
                        let actualStart = originalStartMins;
                        let searchOffsets = [0];
                        for(let i=1; i<=120; i++) { searchOffsets.push(i); }
                        
                        for(let delay of searchOffsets) {
                            let tryStart = originalStartMins + delay;
                            let candidate = findSlot(type, tryStart, tryStart + duration);
                            if(!candidate.conflict) { slot = candidate; actualStart = tryStart; break; }
                        }
                        if(!slot) slot = findSlot(type, originalStartMins, originalStartMins + duration);
                        
                        items.push({
                            id: `PLN_${b.rowId}_${k}`, rowId: slot.id, style: calculateStyle(actualStart, duration),
                            color: window.stringToColor(b.customerName), label: simpleLabel,
                            sub: '', 
                            isPlanned: true, isCombo: false, isConflict: slot.conflict
                        });
                        lockGrid(slot.id, actualStart, actualStart + duration);
                    }
                }
            }
        });
        return items;
    }, [bookings, resourceState]);

    return (
        <div className="bg-white rounded shadow overflow-hidden flex flex-col h-full border border-slate-200">
            <div className="flex border-b bg-slate-100 h-10 items-center">
                <div className="w-[100px] shrink-0 border-r border-slate-300 p-2 font-bold text-slate-600 text-center text-xs">區域 (Zone)</div>
                <div className="flex-1 relative h-full">
                    {hours.map((h, i) => (<div key={h} className="absolute top-0 bottom-0 text-sm font-bold text-slate-500 pl-1 border-l border-slate-300 flex items-center" style={{left: `${(i / (hours.length-1)) * 100}%`}}>{h < 24 ? h : h-24}:00</div>))}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto relative bg-slate-50">
                <div className="absolute inset-0 z-0 pointer-events-none">{hours.map((h, i) => (<div key={h} className="grid-line hour-mark" style={{left: `${(i / (hours.length-1)) * 100}%`}}></div>))}</div>
                {rows.map((row, index) => {
                    if (row.type === 'DIVIDER') return <div key="div" className="timeline-divider"></div>;
                    const rowItems = timelineItems.filter(item => item.rowId === row.id);
                    return (
                        <div key={row.id} className={`timeline-row ${index % 2 === 0 ? 'even' : 'odd'}`}>
                            <div className="timeline-label justify-center"><span className={row.type==='FOOT'?'text-emerald-700':'text-purple-700'}>{row.label}</span></div>
                            <div className="timeline-grid">
                                {rowItems.map(item => (
                                    <div key={item.id} className={`timeline-bar ${item.isPlanned ? 'planned' : ''} ${item.isConflict ? 'conflict' : ''} ${item.isWaiting ? 'waiting' : ''}`}
                                            style={{ ...item.style, backgroundColor: item.isConflict ? '#fee2e2' : item.isWaiting ? '#fff7ed' : `${item.color}${item.opacity?'99':'33'}`, borderColor: item.isConflict ? '#ef4444' : item.isWaiting ? '#f97316' : item.color, color: item.isConflict ? '#b91c1c' : item.isWaiting ? '#c2410c' : '#334155' }}>
                                        {item.isCombo && item.sub && item.sub.includes('P1') && (<div className="switch-marker" style={{right:0, left:'auto', borderLeft:'none', borderRight:'1px dashed #ef4444'}}></div>)}
                                        {item.isCombo && item.sub && item.sub.includes('P2') && (<div className="switch-marker" style={{left:0}}></div>)}
                                        {item.isConflict && <div className="absolute top-0 right-0 text-[8px] bg-red-600 text-white px-1">!</div>}
                                        <div className="truncate px-1">{item.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
window.TimelineView = TimelineView;

// --- RESOURCE CARD (GIỮ NGUYÊN) ---
const ResourceCard = ({ id, type, index, data, busyStaffIds, onAction, onSelect, onSwitch, onToggleMax, onToggleSequence, onServiceChange, onStaffChange, onSplit, staffList, getGroupMemberIndex }) => {
    const [timeLeft, setTimeLeft] = useState(0); const [percent, setPercent] = useState(0);
    const [phaseLabel, setPhaseLabel] = useState(null);
    const [phaseTimeLeft, setPhaseTimeLeft] = useState(0);
    const [switchPercent, setSwitchPercent] = useState(null);

    useEffect(() => {
        if (data && data.isRunning && !data.isPaused && data.startTime) {
            const timer = setInterval(() => {
                const start = new Date(data.startTime).getTime(); const now = new Date().getTime();
                const totalMs = data.booking.duration * 60000; const elapsed = now - start;
                const totalLeft = Math.floor((totalMs - elapsed) / 60000);
                setTimeLeft(totalLeft); 
                setPercent(Math.min(100, Math.max(0, (elapsed / totalMs) * 100)));
                const isCombo = data.booking.category === 'COMBO' || (data.booking.serviceName && data.booking.serviceName.includes('套餐'));
                if (isCombo) {
                    const sequence = (data.comboMeta && data.comboMeta.sequence) || 'FB';
                    const split = window.getComboSplit(data.booking.duration, data.isMaxMode, sequence);
                    
                    const flex = data.comboMeta && data.comboMeta.flex ? data.comboMeta.flex : 0;
                    const phase1Ms = (split.phase1 + flex) * 60000; 

                    const currentSwitchPct = ((split.phase1 + flex) / data.booking.duration) * 100;
                    setSwitchPercent(currentSwitchPct);
                    
                    if (elapsed < phase1Ms) {
                        const left = Math.floor((phase1Ms - elapsed) / 60000);
                        setPhaseTimeLeft(left);
                        setPhaseLabel(split.type1 === 'FOOT' ? '👣 足部 (Phase 1)' : '🛏️ 身體 (Phase 1)');
                    } else {
                        setPhaseTimeLeft(totalLeft);
                        setPhaseLabel(split.type2 === 'FOOT' ? '👣 足部 (Phase 2)' : '🛏️ 身體 (Phase 2)');
                    }
                } else {
                    setPhaseLabel(null);
                    setSwitchPercent(null);
                }
            }, 1000); return () => clearInterval(timer);
        } else { setPercent(0); setTimeLeft(0); setPhaseLabel(null); }
    }, [data]);
    
    const isOccupied = !!data;
    const isPreview = data && data.isPreview;

    let statusColor = 'bg-slate-50 border-slate-200 border-dashed';
    if (isOccupied) {
        if (isPreview) {
            if (data.previewType === 'NOW') statusColor = 'preview-now animate-pulse'; 
            else if (data.previewType === 'PHASE2') statusColor = 'preview-phase2'; 
            else statusColor = 'preview-soon'; 
        } else {
            statusColor = data.isRunning ? (data.isPaused ? 'bg-gray-100' : 'bg-white border-green-500 shadow-md') : 'bg-yellow-50 border-yellow-300';
        }
    }
    
    let staffDisplay = '';
    if (isOccupied) {
        const grpIdx = getGroupMemberIndex(id, data.booking.rowId);
        let myStaff = '';
        
        if (grpIdx === 0) myStaff = data.booking.serviceStaff || data.booking.staffId;
        else if (grpIdx === 1) myStaff = data.booking.staffId2;
        else if (grpIdx === 2) myStaff = data.booking.staffId3;
        else if (grpIdx === 3) myStaff = data.booking.staffId4;
        else if (grpIdx === 4) myStaff = data.booking.staffId5;
        else if (grpIdx === 5) myStaff = data.booking.staffId6;

        if (!myStaff || myStaff === 'undefined' || myStaff === 'null') {
             myStaff = '隨機';
        }
        staffDisplay = myStaff; 
    }

    const isOilJob = isOccupied && (data.booking.isOil || (data.booking.serviceName && (data.booking.serviceName.includes('油') || data.booking.serviceName.includes('Oil'))));
    const isCombo = isOccupied && (data.booking.category === 'COMBO' || data.booking.serviceName.includes('套餐'));
    const flexMinutes = isCombo && data.comboMeta && data.comboMeta.flex ? data.comboMeta.flex : 0;

    const formatTimeStr = (iso) => { if(!iso) return '--:--'; const d = new Date(iso); return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; }
    let startObj = null, endObj = null, switchObj = null;
    if(isOccupied && data.isRunning && data.startTime) {
        startObj = new Date(data.startTime);
        endObj = new Date(startObj.getTime() + data.booking.duration * 60000);
        if(isCombo) {
            const seq = (data.comboMeta && data.comboMeta.sequence) || 'FB';
            const split = window.getComboSplit(data.booking.duration, data.isMaxMode, seq);
            switchObj = new Date(startObj.getTime() + (split.phase1 + flexMinutes) * 60000);
        }
    }

    let splitText = '';
    if (isCombo) {
        const sequence = (data.comboMeta && data.comboMeta.sequence) || 'FB';
        const split = window.getComboSplit(data.booking.duration, true, sequence);
        splitText = sequence === 'FB' ? `(足:${split.phase1} ➜ 身:${split.phase2})` : `(身:${split.phase1} ➜ 足:${split.phase2})`;
    }

    return (
        <div className={`res-card h-72 flex flex-col border-2 ${statusColor} relative`}>
            <div className="flex justify-between items-center p-2 border-b border-black/5 bg-black/5">
                <span className="font-black text-xs text-gray-500 uppercase">{type} {index}</span>
                {isOccupied && !isPreview && data.isRunning && (<div className={`text-xs font-mono font-bold ${timeLeft < 0 ? 'text-red-600 animate-pulse' : 'text-green-700'}`}>{timeLeft}m</div>)}
                {isOccupied && isPreview && data.timeToStart !== undefined && (<div className="text-xs font-bold text-blue-600 bg-blue-100 px-1 rounded">
                    {data.previewType === 'NOW' ? 'NOW' : `${data.timeToStart}m`}
                </div>)}
            </div>
            <div className="flex-1 p-2 relative flex flex-col justify-center text-center pb-12">
                {isOccupied ? (
                    <>
                        {data.isRunning && !isPreview && (<><div className="absolute bottom-0 left-0 h-1 bg-green-500 progress-bar z-0" style={{width: `${percent}%`}}></div>{isCombo && switchPercent && (<div className="absolute bottom-0 h-full w-[2px] bg-red-400 z-0 opacity-30 border-r border-white" style={{left: `${switchPercent}%`}}></div>)}</>)}
                        <div className="z-10 relative flex flex-col gap-2">
                            <div className="absolute -top-12 right-0 z-40 bg-white border-2 border-slate-200 rounded-lg shadow-sm px-3 py-1 flex items-center gap-2">
                                <div className="text-xl font-black text-slate-800 text-center">{staffDisplay || <span className="text-gray-300 text-xs">Waiting</span>}</div>
                                <button onClick={(e) => { e.stopPropagation(); onSplit(id); }} className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 text-xs shadow-sm transition-transform hover:scale-110" title="Split / Add Staff">
                                    <i className="fas fa-user-plus"></i>
                                </button>
                            </div>
                            {isCombo && (<div className="absolute -top-12 left-0 flex gap-1"><button onClick={(e) => { e.stopPropagation(); onToggleSequence(id); }} className="text-xs font-bold px-2 py-1 rounded shadow z-50 bg-blue-100 text-blue-700 hover:bg-blue-200"><i className="fas fa-sync-alt"></i></button><button onClick={(e) => { e.stopPropagation(); onToggleMax(id); }} className={`text-xs font-bold px-2 py-1 rounded shadow z-50 transition-colors ${data.isMaxMode ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-500'}`}><i className="fas fa-bolt"></i> Max</button></div>)}
                            
                            <div className="font-bold text-slate-800 text-2xl truncate mt-4">
                                {data.booking.customerName.split('(')[0]}
                                {data.booking.pax > 1 && <span className="text-sm text-gray-400 ml-1">(Grp)</span>}
                            </div>
                            
                            <select 
                                className="text-sm font-bold text-gray-500 text-center bg-transparent border-b border-dashed border-gray-300 focus:outline-none w-full truncate cursor-pointer hover:bg-gray-50"
                                value={data.booking.serviceName}
                                onChange={(e) => onServiceChange(id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {window.SERVICES_LIST.map(svc => <option key={svc} value={svc}>{svc}</option>)}
                            </select>

                            {isCombo && <div className="text-xs text-slate-400 font-mono">{splitText}</div>}
                            {isCombo && data.isRunning && phaseLabel && (<div className={`text-sm font-black p-2 rounded border bg-white/80 ${phaseLabel.includes('足') ? 'text-emerald-700 border-emerald-200' : 'text-purple-700 border-purple-200'}`}>{phaseLabel} {flexMinutes>0 && <span className="text-xs text-orange-500 bg-orange-100 px-1 rounded ml-1">+{flexMinutes}m</span>} <div className="text-xl font-mono mt-1">{phaseTimeLeft}分</div></div>)}
                            {isCombo && data.isRunning && data.comboMeta && data.comboMeta.targetId && (<div className="text-[10px] text-gray-400">➜ 轉: {data.comboMeta.targetId.toUpperCase()}</div>)}
                            {isOilJob && <div className="text-xs text-purple-600 font-bold border border-purple-200 bg-purple-50 rounded px-2 py-1 inline-block">💧 精油 (Oil)</div>}
                            
                            {data.isRunning && !isPreview && startObj && (
                                <div className="bg-slate-50 rounded p-2 text-xs text-left space-y-1 mt-2 border border-slate-200 shadow-inner opacity-90">
                                    <div className="text-slate-600 font-bold flex justify-between"><span>🕒 開始:</span> <span className="font-mono text-blue-600">{formatTimeStr(startObj)}</span></div>
                                    {isCombo && switchObj && <div className="text-slate-500 flex justify-between"><span>⇄ 轉場:</span> <span className="font-mono text-orange-500">{formatTimeStr(switchObj)}</span></div>}
                                    <div className="text-slate-600 font-bold flex justify-between"><span>🏁 結束:</span> <span className="font-mono text-green-600">{formatTimeStr(endObj)}</span></div>
                                </div>
                            )}

                            {isPreview && (
                                <div className="mt-2 text-xs font-bold text-center">
                                    {data.previewType === 'NOW' && <span className="text-red-500 animate-pulse">🔴 該上鐘了 (Start Now)</span>}
                                    {data.previewType === 'SOON' && <span className="text-blue-500">🔵 預約即將到來</span>}
                                    {data.previewType === 'PHASE2' && <span className="text-orange-500">🟠 轉場準備</span>}
                                </div>
                            )}
                        </div>
                    </>
                ) : (<button onClick={onSelect} className="w-full h-full flex flex-col items-center justify-center text-gray-300 hover:text-green-600 transition-colors group"><i className="fas fa-plus text-5xl"></i><span className="text-sm font-bold mt-2">排入 (Assign)</span></button>)}
            </div>
            {isOccupied && (<div className="absolute bottom-0 left-0 w-full p-2 bg-white z-50 border-t">
                {!data.isRunning || isPreview ? (
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={()=>onAction(id, 'start')} className={`py-2 rounded font-bold text-white text-sm shadow-md ${isPreview && data.previewType==='NOW' ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-green-600 hover:bg-green-700'}`}>開始 (Start)</button>
                        <button onClick={()=>onAction(id, 'cancel')} className="py-2 rounded font-bold text-red-600 bg-red-50 border border-red-200 text-sm shadow-sm">取消 (Cancel)</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={()=>onAction(id, 'pause')} className={`py-1.5 rounded font-bold text-white text-xs shadow flex items-center justify-center ${data.isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                            {data.isPaused ? '▶ 繼續' : '⏸ 暫停'}
                        </button>
                        
                        {isCombo ? (
                            <button onClick={()=>onSwitch(id, type==='FOOT'?'bed':'chair')} className="py-1.5 rounded font-bold text-white bg-orange-500 hover:bg-orange-600 flex items-center justify-center text-xs shadow"><i className="fas fa-exchange-alt mr-1"></i> 轉場</button>
                        ) : (
                            <div className="hidden"></div>
                        )}
                        
                        <button onClick={()=>onAction(id, 'finish')} className="py-1.5 rounded font-bold text-white bg-blue-600 hover:bg-blue-700 text-xs shadow flex items-center justify-center"><i className="fas fa-check-square mr-1"></i> 結帳</button>
                        <button onClick={()=>onAction(id, 'cancel_midway')} className="py-1.5 rounded font-bold text-white bg-red-500 hover:bg-red-600 text-xs shadow flex items-center justify-center"><i className="fas fa-times-circle mr-1"></i> 棄單</button>
                    </div>
                )}
            </div>)}
        </div>
    );
};
window.ResourceCard = ResourceCard;

// --- REPORT VIEW (FIXED: LOGIC TÍNH TIỀN KHÁCH LẺ TRONG NHÓM) ---
const ReportView = ({ bookings }) => {
    const safeBookings = Array.isArray(bookings) ? bookings : [];

    // Tính toán doanh thu và số khách dựa trên TỪNG CÁ NHÂN (đã check StatusX)
    // chứ không dựa trên status tổng của đơn hàng
    const processedStats = useMemo(() => {
        let revenue = 0;
        let guests = 0;
        
        safeBookings.forEach(b => {
            const pax = parseInt(b.pax, 10) || 1;
            
            // Duyệt qua từng người trong nhóm
            for(let i=0; i<pax; i++) {
                const statusKey = `Status${i+1}`;
                const statusKeyCN = `狀態${i+1}`;
                const statusKeyLower = `status${i+1}`;
                
                const isItemDone = (b[statusKey] && b[statusKey].includes('完成')) || 
                                   (b[statusKeyCN] && b[statusKeyCN].includes('完成')) || 
                                   (b[statusKeyLower] && b[statusKeyLower].includes('完成'));
                
                const isAllDone = b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅');

                if (isItemDone || isAllDone) {
                    guests++;
                    const unitPrice = window.getPrice(b.serviceName);
                    const oilPrice = window.getOilPrice(b.isOil || (b.serviceName && b.serviceName.includes('油')));
                    revenue += (unitPrice + oilPrice);
                }
            }
        });
        return { revenue, guests };
    }, [safeBookings]);

    return (
        <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
                    <h3 className="text-gray-500 font-bold mb-2">本日營收 (Total Revenue)</h3>
                    <div className="text-4xl font-black text-emerald-600">${processedStats.revenue.toLocaleString()}</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
                    <h3 className="text-gray-500 font-bold mb-2">已服務人數 (Total Guests)</h3>
                    <div className="text-4xl font-black text-blue-600">{processedStats.guests}</div>
                </div>
            </div>
            {/* CONTAINER BẢNG CÓ THANH CUỘN (SCROLLABLE CONTAINER) */}
            <div className="bg-white rounded-xl shadow border overflow-hidden flex flex-col h-[600px]">
                <div className="p-3 bg-slate-50 border-b font-bold text-slate-700 shrink-0">交易明細 (Details)</div>
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-slate-500 sticky top-0 shadow-sm z-10">
                            <tr>
                                <th className="p-3 bg-white">時間</th>
                                <th className="p-3 bg-white">姓名 (Name)</th>
                                <th className="p-3 bg-white">服務 (Service)</th>
                                <th className="p-3 bg-white">師傅 (Technician)</th>
                                <th className="p-3 text-right bg-white">金額 (Amount)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {safeBookings.flatMap((b, index) => {
                                const pax = parseInt(b.pax, 10) || 1;
                                const rows = [];
                                
                                // Danh sách thợ
                                const staff1 = b.serviceStaff || b.staffId || b.ServiceStaff || b.StaffId || b.technician || b.Technician;
                                const staff2 = b.staffId2 || b.StaffId2 || b.staff2 || b.Staff2;
                                const staff3 = b.staffId3 || b.StaffId3 || b.staff3 || b.Staff3;
                                const staff4 = b.staffId4 || b.StaffId4 || b.staff4 || b.Staff4;
                                const staff5 = b.staffId5 || b.StaffId5 || b.staff5 || b.Staff5;
                                const staff6 = b.staffId6 || b.StaffId6 || b.staff6 || b.Staff6;

                                const staffForGroup = [staff1, staff2, staff3, staff4, staff5, staff6];

                                for (let k = 0; k < pax; k++) {
                                    const statusKey = `Status${k+1}`;
                                    const statusKeyCN = `狀態${k+1}`;
                                    const statusKeyLower = `status${k+1}`;
                                    
                                    const isSingleDone = (b[statusKey] && b[statusKey].includes('完成')) || 
                                                         (b[statusKeyCN] && b[statusKeyCN].includes('完成')) || 
                                                         (b[statusKeyLower] && b[statusKeyLower].includes('完成'));
                                    const isAllDone = b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅');

                                    // Chỉ hiện những dòng ĐÃ THANH TOÁN
                                    if (isSingleDone || isAllDone) {
                                        const unitPrice = window.getPrice(b.serviceName);
                                        const oilPrice = window.getOilPrice(b.isOil || (b.serviceName && b.serviceName.includes('油')));
                                        const singlePrice = unitPrice + oilPrice;
                                        
                                        let staffName = staffForGroup[k];
                                        if (!staffName || staffName === 'undefined' || staffName === 'null' || staffName === 'N/A') {
                                            staffName = '隨機'; 
                                        }

                                        rows.push(
                                            <tr key={`${b.rowId}-${k}`}>
                                                <td className="p-3 font-mono">{b.startTimeString.split(' ')[1]}</td>
                                                <td className="p-3 font-bold">
                                                    {b.customerName}
                                                    {pax > 1 && <span className="ml-2 text-xs text-gray-400 font-normal">#{k + 1}</span>}
                                                </td>
                                                <td className="p-3">{b.serviceName}</td>
                                                <td className="p-3 font-mono font-bold text-indigo-700">{staffName}</td>
                                                <td className="p-3 text-right font-bold text-emerald-700">${singlePrice.toLocaleString()}</td>
                                            </tr>
                                        );
                                    }
                                }
                                return rows;
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
window.ReportView = ReportView;
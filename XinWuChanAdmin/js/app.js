const { useState, useEffect, useMemo, useRef } = React;

// --- APP COMPONENT ---
const App = () => {
    // State: Quản lý dữ liệu toàn ứng dụng (Khởi tạo an toàn)
    const [activeTab, setActiveTab] = useState('map');
    const [staffList, setStaffList] = useState([]); // Khởi tạo rỗng
    const [bookings, setBookings] = useState([]); // Khởi tạo rỗng
    const [resourceState, setResourceState] = useState({}); 
    const [statusData, setStatusData] = useState({});
    
    // Modal States
    const [showWalkIn, setShowWalkIn] = useState(false);
    const [showCheckIn, setShowCheckIn] = useState(false);
    const [showAvailability, setShowAvailability] = useState(false); 
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [billingData, setBillingData] = useState(null);
    const [comboStartData, setComboStartData] = useState(null);
    const [splitData, setSplitData] = useState(null);
    
    // System States
    const [viewDate, setViewDate] = useState(window.getOperationalDateInputFormat());
    const [syncLock, setSyncLock] = useState(false);
    const [quotaError, setQuotaError] = useState(false); 

    // -- Helper: Kiểm tra nhân viên có bận không --
    const isActuallyBusy = (staffId) => {
        if (!resourceState) return false;
        return Object.values(resourceState).some(r => {
            if (!r.isRunning || r.isPaused || r.isPreview === true) return false;
            const b = r.booking;
            if (!b) return false;
            return (
                b.serviceStaff === staffId || b.staffId === staffId ||
                b.staffId2 === staffId || b.staffId3 === staffId ||
                b.staffId4 === staffId || b.staffId5 === staffId ||
                b.staffId6 === staffId
            );
        });
    };

    const busyStaffIds = useMemo(() => {
        const ids = new Set();
        Object.values(resourceState).forEach(r => {
            if (r.isRunning && !r.isPaused && r.isPreview !== true) {
                const b = r.booking;
                if(b.serviceStaff) ids.add(b.serviceStaff);
                if(b.staffId) ids.add(b.staffId);
                if(b.staffId2) ids.add(b.staffId2);
                if(b.staffId3) ids.add(b.staffId3);
                if(b.staffId4) ids.add(b.staffId4);
                if(b.staffId5) ids.add(b.staffId5);
                if(b.staffId6) ids.add(b.staffId6);
            }
        });
        return Array.from(ids);
    }, [resourceState]);

    const updateResource = async (newState) => { setResourceState(newState); await axios.post('/api/sync-resource', newState); };
    const updateStaffStatus = async (newStatus) => { setStatusData(newStatus); await axios.post('/api/sync-staff-status', newStatus); }

    // --- CORE: Fetch Data (Smart Polling + Safety Checks) ---
    const fetchData = async () => {
        if (syncLock) return;
        if (quotaError) return; 

        try {
            const res = await axios.get('/api/info');
            setQuotaError(false); 
            
            const { bookings: apiBookings, staffList: apiStaff, resourceState: serverRes, staffStatus: serverStaff } = res.data;
            
            const cleanBookings = (apiBookings || []).map(b => {
                return { ...b, duration: window.getSafeDuration(b.serviceName, b.duration) };
            });

            setBookings(cleanBookings);
            setStaffList(apiStaff || []);
            const currentRes = serverRes || {};
            const currentStaffStat = serverStaff || {};
            setStatusData(currentStaffStat);

            const nowObj = window.getTaipeiDate();
            const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < 8 ? 1440 : 0);
            
            let tempState = {}; 
            Object.keys(currentRes).forEach(key => {
                if(currentRes[key].isRunning) {
                    tempState[key] = currentRes[key]; 
                }
            });
            
            const timelineGrid = {}; 
            const safeBookingsArray = Array.isArray(cleanBookings) ? cleanBookings : [];
            const relevantBookings = safeBookingsArray.filter(b => window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate) && !b.status.includes('取消') && !b.status.includes('完成'));
            
            const listSingles = relevantBookings.filter(b => b.category !== 'COMBO' && !b.serviceName.includes('套餐'));
            const listCombos = relevantBookings.filter(b => b.category === 'COMBO' || b.serviceName.includes('套餐'));
            const sortFn = (a,b) => {
                const timeA = window.normalizeToTimelineMins(a.startTimeString.split(' ')[1]);
                const timeB = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                if (timeA !== timeB) return timeA - timeB;
                return a.rowId - b.rowId;
            };
            listSingles.sort(sortFn); listCombos.sort(sortFn);

            const isReservedAt = (resId, start, end) => {
                if (tempState[resId] && tempState[resId].isRunning) {
                }
                if (!timelineGrid[resId]) return false;
                for (let slot of timelineGrid[resId]) {
                    if (start < slot.end && end > slot.start) return true;
                }
                return false;
            };

            const addToGrid = (resId, start, end, booking, meta) => {
                if (!timelineGrid[resId]) timelineGrid[resId] = [];
                timelineGrid[resId].push({ start, end, booking, meta });
            };

            const findSlot = (prefix, start, end) => {
                    for(let i=1; i<=6; i++) {
                        const id = `${prefix}-${i}`;
                        if (!isReservedAt(id, start, end)) return { id, conflict: false };
                    }
                    return { id: `${prefix}-6`, conflict: true };
            };
            
            listSingles.forEach(b => {
                const originalStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                const needed = b.pax || 1;
                for(let k=0; k<needed; k++) {
                    const type = b.type === 'CHAIR' ? 'chair' : 'bed';
                    let searchOffsets = [0]; for(let i=1; i<=120; i++) searchOffsets.push(i);
                    let slot = null; let actualStart = originalStart;
                    for(let delay of searchOffsets) {
                        let tryStart = originalStart + delay;
                        let candidate = findSlot(type, tryStart, tryStart + b.duration);
                        if (!candidate.conflict) { slot = candidate; actualStart = tryStart; break; }
                    }
                    if(!slot) slot = findSlot(type, originalStart, originalStart + b.duration); 
                    addToGrid(slot.id, actualStart, actualStart + b.duration, b, { isCombo: false });
                }
            });

            listCombos.forEach(b => {
                const originalStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                const needed = b.pax || 1;
                for(let k=0; k<needed; k++) {
                    let searchOffsets = [0];
                    for(let i=1; i<=5; i++) { searchOffsets.push(i); searchOffsets.push(-i); }
                    for(let i=6; i<=120; i++) { searchOffsets.push(i); }
                    let allocated = false;
                    for(let delay of searchOffsets) {
                        if(allocated) break;
                        const tryStart = originalStart + delay;
                        const splitFB = window.getComboSplit(b.duration, true, 'FB');
                        const s1_FB = findSlot('chair', tryStart, tryStart + splitFB.phase1);
                        if(!s1_FB.conflict) {
                            const t2 = tryStart + splitFB.phase1 + 5; 
                            const s2_FB = findSlot('bed', t2, t2 + splitFB.phase2);
                            if(!s2_FB.conflict) {
                                addToGrid(s1_FB.id, tryStart, tryStart + splitFB.phase1, b, { isCombo: true, sequence: 'FB', phase: 1, targetId: s2_FB.id });
                                addToGrid(s2_FB.id, t2, t2 + splitFB.phase2, b, { isCombo: true, sequence: 'FB', phase: 2 });
                                allocated = true;
                            }
                        }
                        if (!allocated) {
                            const splitBF = window.getComboSplit(b.duration, true, 'BF');
                            const s1_BF = findSlot('bed', tryStart, tryStart + splitBF.phase1);
                            if(!s1_BF.conflict) {
                                const t2 = tryStart + splitBF.phase1 + 5;
                                const s2_BF = findSlot('chair', t2, t2 + splitBF.phase2);
                                if(!s2_BF.conflict) {
                                    addToGrid(s1_BF.id, tryStart, tryStart + splitBF.phase1, b, { isCombo: true, sequence: 'BF', phase: 1, targetId: s2_BF.id });
                                    addToGrid(s2_BF.id, t2, t2 + splitBF.phase2, b, { isCombo: true, sequence: 'BF', phase: 2 });
                                    allocated = true;
                                }
                            }
                        }
                    }
                }
            });

            const allSlots = [];
            for(let i=1; i<=6; i++) allSlots.push(`chair-${i}`);
            for(let i=1; i<=6; i++) allSlots.push(`bed-${i}`);

            allSlots.forEach(resId => {
                if (tempState[resId] && tempState[resId].isRunning) return;

                const slots = timelineGrid[resId] || [];

                const currentSlot = slots.find(s => {
                    let gap = s.start - nowMins;
                    if (gap < -1000) gap += 1440; 
                    return (nowMins >= s.start && nowMins < s.end); 
                });

                if (currentSlot) {
                    const nameLabel = currentSlot.booking.pax > 1 ? `${currentSlot.booking.customerName} (Grp)` : currentSlot.booking.customerName;
                    const designatedStaff = currentSlot.booking.staffId === '隨機' ? '隨機' : currentSlot.booking.staffId;
                    
                    let comboMeta = null;
                    if (currentSlot.meta && currentSlot.meta.isCombo) {
                        comboMeta = { sequence: currentSlot.meta.sequence, targetId: currentSlot.meta.targetId || null, flex: 0 };
                    }
                    
                    tempState[resId] = { 
                        booking: { 
                            ...currentSlot.booking, 
                            customerName: nameLabel, 
                            staffId: designatedStaff,
                            serviceStaff: null 
                        }, 
                        startTime: null, isRunning: false, 
                        isPreview: true, previewType: 'NOW', 
                        comboMeta, isMaxMode: true 
                    };
                    return; 
                }

                const upcomingSlot = slots.find(s => {
                    let timeUntil = s.start - nowMins;
                    if (timeUntil < -1000) timeUntil += 1440;
                    return (timeUntil > 0 && timeUntil <= 30);
                });

                if (upcomingSlot) {
                        const nameLabel = upcomingSlot.booking.pax > 1 ? `${upcomingSlot.booking.customerName} (Grp)` : upcomingSlot.booking.customerName;
                        const designatedStaff = upcomingSlot.booking.staffId === '隨機' ? '隨機' : upcomingSlot.booking.staffId;
                        
                        let comboMeta = null;
                        let previewType = 'SOON';

                        if (upcomingSlot.meta && upcomingSlot.meta.isCombo) {
                            comboMeta = { sequence: upcomingSlot.meta.sequence, targetId: upcomingSlot.meta.targetId || null, flex: 0 };
                            if (upcomingSlot.meta.phase === 2) {
                                let timeUntil = upcomingSlot.start - nowMins;
                                if (timeUntil <= 5) previewType = 'PHASE2';
                            }
                        }
                        
                        tempState[resId] = {
                        booking: {
                            ...upcomingSlot.booking,
                            customerName: nameLabel,
                            staffId: designatedStaff,
                            serviceStaff: null
                        },
                        startTime: null, isRunning: false,
                        isPreview: true, previewType: previewType,
                        timeToStart: upcomingSlot.start - nowMins,
                        comboMeta, isMaxMode: true
                        }
                }
            });
            
            setResourceState(tempState);
            
        } catch(e) { 
            console.error("API Error", e);
            if (e.response && e.response.status === 429) {
                setQuotaError(true);
            }
        }
    };

    useEffect(() => { 
        fetchData(); 
        const t = setInterval(fetchData, 2000); 
        return () => clearInterval(t); 
    }, [viewDate, syncLock, quotaError]); 

    const getGroupMemberIndex = (targetResId, targetRowId) => {
        const allSlots = [
            'chair-1', 'chair-2', 'chair-3', 'chair-4', 'chair-5', 'chair-6',
            'bed-1', 'bed-2', 'bed-3', 'bed-4', 'bed-5', 'bed-6'
        ];
        const groupSlots = allSlots.filter(slotId => {
            const res = resourceState[slotId];
            return res && res.booking && res.booking.rowId === targetRowId;
        });
        return groupSlots.indexOf(targetResId);
    };

    const universalSend = async (endpoint, payload) => {
        try {
            await axios.post(endpoint, payload);
            const params = new URLSearchParams();
            Object.keys(payload).forEach(key => params.append(key, payload[key]));
            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });
        } catch(e) {
            console.log("Universal send check (ignore):", e);
        }
    };

    const handleSplitConfirm = async (staffId2) => {
        if (!splitData) return;
        const { resourceId } = splitData;
        const current = resourceState[resourceId];
        if (!current) return;

        setSyncLock(true);
        setTimeout(() => setSyncLock(false), 5000);

        const newStatusData = { ...statusData, [staffId2]: { ...statusData[staffId2], status: 'BUSY' } };
        updateStaffStatus(newStatusData);

        const grpIdx = getGroupMemberIndex(resourceId, current.booking.rowId);
        
        let primaryKey = "服務師傅1"; 
        let targetProp = "serviceStaff"; 
        
        if (grpIdx === 1) { primaryKey = "服務師傅2"; targetProp = "staffId2"; }
        if (grpIdx === 2) { primaryKey = "服務師傅3"; targetProp = "staffId3"; }
        if (grpIdx === 3) { primaryKey = "服務師傅4"; targetProp = "staffId4"; }
        if (grpIdx === 4) { primaryKey = "服務師傅5"; targetProp = "staffId5"; }
        if (grpIdx === 5) { primaryKey = "服務師傅6"; targetProp = "staffId6"; }

        const currentName = current.booking[targetProp] || "";
        const newNameCombined = currentName ? `${currentName}, ${staffId2}` : staffId2;

        const newBooking = { ...current.booking, [targetProp]: newNameCombined };
        const newState = { ...resourceState, [resourceId]: { ...current, booking: newBooking } };
        setResourceState(newState);
        
        const payload = { 
            rowId: current.booking.rowId, 
            [primaryKey]: newNameCombined,
            forceSync: true
        };
        
        await universalSend('/api/update-booking-details', payload);
        await updateResource(newState);
        setSplitData(null);
    };

    const handleStaffChange = async (resId, newStaffId) => {
        const current = resourceState[resId];
        if (!current) return;
        
        setSyncLock(true);
        setTimeout(() => setSyncLock(false), 5000);

        const oldServiceStaff = current.booking.serviceStaff || current.booking.staffId; 
        
        const grpIdx = getGroupMemberIndex(resId, current.booking.rowId);
        const newBooking = { ...current.booking };
        
        if (grpIdx === 0) newBooking.serviceStaff = newStaffId;
        else if (grpIdx === 1) newBooking.staffId2 = newStaffId;
        else if (grpIdx === 2) newBooking.staffId3 = newStaffId;
        else if (grpIdx === 3) newBooking.staffId4 = newStaffId;
        else if (grpIdx === 4) newBooking.staffId5 = newStaffId;
        else if (grpIdx === 5) newBooking.staffId6 = newStaffId;
        
        const newState = { ...resourceState, [resId]: { ...current, booking: newBooking } };
        setResourceState(newState);

        const newStatusData = { ...statusData };
        if (oldServiceStaff !== '隨機' && oldServiceStaff !== newStaffId) { newStatusData[oldServiceStaff] = { status: 'READY', checkInTime: Date.now() }; }
        if (newStaffId !== '隨機') { newStatusData[newStaffId] = { status: 'BUSY' }; }
        updateStaffStatus(newStatusData);
        
        let primaryKey = "服務師傅1"; 
        let fallbackKey = "ServiceStaff1";

        if (grpIdx === 1) { primaryKey = "服務師傅2"; fallbackKey = "ServiceStaff2"; }
        if (grpIdx === 2) { primaryKey = "服務師傅3"; fallbackKey = "ServiceStaff3"; }
        if (grpIdx === 3) { primaryKey = "服務師傅4"; fallbackKey = "ServiceStaff4"; }
        if (grpIdx === 4) { primaryKey = "服務師傅5"; fallbackKey = "ServiceStaff5"; }
        if (grpIdx === 5) { primaryKey = "服務師傅6"; fallbackKey = "ServiceStaff6"; }

        const payload = { 
            rowId: current.booking.rowId, 
            [primaryKey]: newStaffId, 
            [fallbackKey]: newStaffId,
            [`staff${grpIdx + 1}`]: newStaffId, 
            technician: newStaffId,
            forceSync: true
        };

        try {
            await universalSend('/api/update-booking-details', payload);
            await updateResource(newState);
        } catch(e) {
            console.error("Sync Failed", e);
            alert("⚠️ Staff Sync Failed! Please check internet.");
        }
    };

    const handleServiceChange = async (resId, newServiceName) => {
        const current = resourceState[resId];
        if (!current) return;
        const newDef = window.SERVICES_DATA[newServiceName];
        if (!newDef) return;
        const updatedBooking = { ...current.booking, serviceName: newServiceName, duration: newDef.duration, type: newDef.type, category: newDef.category };
        const newState = { ...resourceState, [resId]: { ...current, booking: updatedBooking } };
        setResourceState(newState);
        await axios.post('/api/update-booking-details', { rowId: current.booking.rowId, serviceName: newServiceName });
        await updateResource(newState);
    };

    const handleResourceAction = async (id, action) => {
        const current = resourceState[id]; if (!current) return;
        if (action === 'start') {
            const isCombo = current.booking.category === 'COMBO' || (current.booking.serviceName && current.booking.serviceName.includes('套餐'));
            if (isCombo && !current.isRunning) { setComboStartData({ id, booking: current.booking }); return; }
            executeStart(id, null); 
        }
        else if (action === 'pause') { updateResource({ ...resourceState, [id]: { ...current, isPaused: !current.isPaused } }); }
        else if (action === 'cancel') { if (confirm('確認將顧客從床位移除?')) { const n = { ...resourceState }; delete n[id]; updateResource(n); } }
        else if (action === 'cancel_midway') {
            if (confirm('確定要棄單 (Drop)?\n此操作將標記為「取消」並釋放床位。')) {
                await axios.post('/api/update-status', { rowId: current.booking.rowId, status: '✅ 棄單 (Dropped)' });
                const n = { ...resourceState };
                const staffId = current.booking.serviceStaff || current.booking.staffId;
                if(staffId !== '隨機' && statusData[staffId]) { 
                        const newStatus = { ...statusData, [staffId]: { status: 'READY', checkInTime: Date.now() } };
                        updateStaffStatus(newStatus);
                }
                delete n[id];
                updateResource(n);
                fetchData();
            }
        }
        else if (action === 'finish') {
            const normalize = (p) => p ? p.replace(/\D/g, '') : '';
            const currentPhone = normalize(current.booking.sdt);
            const currentLineId = current.booking.lineId;
            const currentRowId = current.booking.rowId;
            const related = Object.keys(resourceState).filter(k => k !== id && resourceState[k].isRunning).map(k => ({ resourceId: k, booking: resourceState[k].booking })).filter(item => {
                const b = item.booking;
                if (b.rowId === currentRowId) return true;
                const bPhone = normalize(b.sdt);
                if (currentPhone && currentPhone.length > 4 && bPhone === currentPhone) return true;
                if (currentLineId && currentLineId !== 'ADMIN_WEB' && currentLineId === b.lineId) return true;
                return false;
            });
            setBillingData({ activeItem: { resourceId: id, booking: current.booking }, relatedItems: related });
        }
    };

    const executeStart = (id, comboSequence) => {
        const current = resourceState[id];
        let designatedStaff = current.booking.staffId; 
        let finalServiceStaff = designatedStaff; 
        let currentId = id;
        let shouldMove = false;
        let targetMoveId = null;
        
        if (comboSequence) {
            const currentType = id.split('-')[0];
            if (comboSequence === 'BF' && currentType === 'chair') { shouldMove = true; for(let i=1; i<=6; i++) { if(!resourceState[`bed-${i}`]) { targetMoveId = `bed-${i}`; break; } } } 
            else if (comboSequence === 'FB' && currentType === 'bed') { shouldMove = true; for(let i=1; i<=6; i++) { if(!resourceState[`chair-${i}`]) { targetMoveId = `chair-${i}`; break; } } }
        }
        if (shouldMove) { if (!targetMoveId) { alert("⚠️ 無法切換區域: 目標區域已滿!"); return; } currentId = targetMoveId; }
        
        if (['隨機', '男', '女', 'Oil'].some(k => designatedStaff.includes(k))) {
            const liveBusyStaffIds = Object.values(resourceState).filter(r => r.isRunning && !r.isPaused && r.isPreview !== true).map(r => r.booking.serviceStaff || r.booking.staffId);
            
            const readyStaff = (staffList||[]).filter(s => { 
                const stat = statusData[s.id]; 
                if (!stat || stat.status !== 'READY') return false;
                if (liveBusyStaffIds.includes(s.id)) return false;
                return true;
            });

            let candidates = readyStaff;
            if (designatedStaff.includes('男') || designatedStaff.includes('Male')) candidates = candidates.filter(s => s.gender === 'M' || s.gender === '男');
            else if (designatedStaff.includes('女') || designatedStaff.includes('Female') || current.booking.isOil) candidates = candidates.filter(s => s.gender === 'F' || s.gender === '女');
            
            candidates.sort((a,b) => (statusData[a.id]?.checkInTime||0) - (statusData[b.id]?.checkInTime||0));
            
            if (candidates.length === 0) { alert("⚠️ No suitable staff available!"); return; }
            finalServiceStaff = candidates[0].id;
        }

        const newStatusData = { ...statusData, [finalServiceStaff]: { ...statusData[finalServiceStaff], status: 'BUSY' } };
        updateStaffStatus(newStatusData); 
        
        const grpIdx = getGroupMemberIndex(currentId, current.booking.rowId);
        const newBooking = { ...current.booking };
        
        if (grpIdx === 0) newBooking.serviceStaff = finalServiceStaff;
        else if (grpIdx === 1) newBooking.staffId2 = finalServiceStaff;
        else if (grpIdx === 2) newBooking.staffId3 = finalServiceStaff;
        else if (grpIdx === 3) newBooking.staffId4 = finalServiceStaff;
        else if (grpIdx === 4) newBooking.staffId5 = finalServiceStaff;
        else if (grpIdx === 5) newBooking.staffId6 = finalServiceStaff;
        
        let comboMeta = current.comboMeta || null;
        if (comboSequence) {
            const currentType = currentId.split('-')[0];
            const index = currentId.split('-')[1];
            let ghostTargetId = null;
            const targetTypePrefix = currentType === 'chair' ? 'bed' : 'chair';
            if (!resourceState[`${targetTypePrefix}-${index}`] && `${targetTypePrefix}-${index}` !== id) { 
                ghostTargetId = `${targetTypePrefix}-${index}`; 
            } else { 
                for(let i=1; i<=6; i++) { 
                    const tid = `${targetTypePrefix}-${i}`; 
                    if(!resourceState[tid] && tid !== id) { ghostTargetId = tid; break; } 
                } 
            }
            comboMeta = { sequence: comboSequence, targetId: ghostTargetId, flex: (current.comboMeta && current.comboMeta.flex) || 0 };
        }
        
        const newState = { ...resourceState };
        if (shouldMove) delete newState[id];
        newState[currentId] = { ...current, booking: newBooking, startTime: new Date().toISOString(), isRunning: true, isPreview: false, comboMeta }; 
        updateResource(newState);
        
        let primaryKey = "服務師傅1"; 
        let fallbackKey = "ServiceStaff1";

        if (grpIdx === 1) { primaryKey = "服務師傅2"; fallbackKey = "ServiceStaff2"; }
        if (grpIdx === 2) { primaryKey = "服務師傅3"; fallbackKey = "ServiceStaff3"; }
        if (grpIdx === 3) { primaryKey = "服務師傅4"; fallbackKey = "ServiceStaff4"; }
        if (grpIdx === 4) { primaryKey = "服務師傅5"; fallbackKey = "ServiceStaff5"; }
        if (grpIdx === 5) { primaryKey = "服務師傅6"; fallbackKey = "ServiceStaff6"; }

        const payload = { 
            rowId: current.booking.rowId, 
            [primaryKey]: finalServiceStaff, 
            [fallbackKey]: finalServiceStaff,
            [`staff${grpIdx + 1}`]: finalServiceStaff,
            staffId: designatedStaff 
        };
        universalSend('/api/update-booking-details', payload);
    };

    const confirmComboStart = (sequence) => { if (comboStartData) { executeStart(comboStartData.id, sequence); setComboStartData(null); } };
    const handleSwitch = (fromId, toType) => { const currentData = resourceState[fromId]; if(!currentData) return; for(let i=1; i<=6; i++) { const targetId = `${toType}-${i}`; if (!resourceState[targetId]) { const newState = { ...resourceState }; delete newState[fromId]; newState[targetId] = currentData; updateResource(newState); return; } } alert(`該區域 (${toType === 'chair' ? '足底區' : '身體區'}) 已無空位!`); };
    const handleToggleMax = async (resId) => { const res = resourceState[resId]; if (!res) return; updateResource({ ...resourceState, [resId]: { ...res, isMaxMode: !res.isMaxMode } }); };
    const handleToggleSequence = async (resId) => { const res = resourceState[resId]; if (!res || !res.comboMeta) return; const newSeq = res.comboMeta.sequence === 'FB' ? 'BF' : 'FB'; updateResource({ ...resourceState, [resId]: { ...res, comboMeta: { ...res.comboMeta, sequence: newSeq } } }); }
    
    const handleConfirmPayment = async (itemsToPay, totalAmount) => {
        try {
            setSyncLock(true);
            setTimeout(() => setSyncLock(false), 5000); 

            const uniqueRowIds = [...new Set(itemsToPay.map(i => i.booking.rowId))];
            for (const rid of uniqueRowIds) { await axios.post('/api/update-status', { rowId: rid, status: '✅ 完成' }); }
            
            const newState = { ...resourceState };
            const newStatusData = { ...statusData }; 
            
            let returningStaff = [];

            itemsToPay.forEach(item => {
                const resId = item.resourceId;
                const r = newState[resId];
                
                if (r && r.booking) {
                    const startTime = r.startTime ? new Date(r.startTime).getTime() : 0;
                    const b = r.booking;
                    
                    const pushStaff = (sid) => {
                        if (sid && sid !== '隨機' && sid !== 'undefined' && !returningStaff.find(x => x.id === sid)) {
                            returningStaff.push({ id: sid, startTime: startTime });
                        }
                    };

                    pushStaff(b.serviceStaff || b.staffId);
                    pushStaff(b.staffId2);
                    pushStaff(b.staffId3);
                    pushStaff(b.staffId4);
                    pushStaff(b.staffId5);
                    pushStaff(b.staffId6);

                    delete newState[resId];
                }
            });

            returningStaff.sort((a,b) => {
                if (a.startTime !== b.startTime) return a.startTime - b.startTime;
                return window.getWeight(a.id) - window.getWeight(b.id);
            });

            const now = Date.now();
            returningStaff.forEach((s, index) => {
                newStatusData[s.id] = { status: 'READY', checkInTime: now + (index * 500) };
            });

            updateResource(newState);
            updateStaffStatus(newStatusData); 
            setBillingData(null);
            
            setTimeout(() => fetchData(), 500);
            alert(`✅ 結帳成功: $${totalAmount}`);
        } catch(e) { 
            alert('結帳失敗! (Check Internet)'); 
            setSyncLock(false);
        }
    };

    const handleWalkInSave = async (data) => { await axios.post('/api/admin-booking', data); setShowWalkIn(false); setShowAvailability(false); fetchData(); };
    const handleAssignBooking = (booking) => { if (!selectedSlot) return; updateResource({ ...resourceState, [selectedSlot]: { booking, startTime: null, isRunning: false } }); setSelectedSlot(null); };
    const handleManualUpdateStatus = async (rowId, status) => { if(confirm('確認更新狀態?')) { await axios.post('/api/update-status', { rowId, status }); fetchData(); } };
    const handleRetryConnection = () => { setQuotaError(false); fetchData(); };

    const getStatus = (id) => statusData[id] ? statusData[id].status : 'AWAY';
    
    const safeStaffList = staffList || [];
    const awayStaff = safeStaffList.filter(s => { const st = getStatus(s.id); return st === 'AWAY' || st === 'OFF'; }).sort(window.sortIdAsc);
    
    const busyStaff = safeStaffList.filter(s => isActuallyBusy(s.id)).sort((a,b) => { 
        const findRes = (sid) => Object.values(resourceState).find(r => 
            r.isRunning && !r.isPaused && r.booking && (
                r.booking.serviceStaff === sid || 
                r.booking.staffId === sid || 
                r.booking.staffId2 === sid || 
                r.booking.staffId3 === sid || 
                r.booking.staffId4 === sid || 
                r.booking.staffId5 === sid || 
                r.booking.staffId6 === sid
            )
        );

        const resA = findRes(a.id);
        const resB = findRes(b.id);
        
        const timeA = resA?.startTime ? new Date(resA.startTime).getTime() : 0;
        const timeB = resB?.startTime ? new Date(resB.startTime).getTime() : 0;
        
        return timeA !== timeB ? timeA - timeB : window.sortIdAsc(a, b);
    });
    
    const readyStaff = safeStaffList.filter(s => { 
        if (isActuallyBusy(s.id)) return false;
        const st = getStatus(s.id); 
        return st === 'READY' || st === 'EAT' || st === 'OUT_SHORT'; 
    }).sort((a,b) => { 
        const timeA = statusData[a.id]?.checkInTime || 0; 
        const timeB = statusData[b.id]?.checkInTime || 0; 
        return timeA !== timeB ? timeA - timeB : window.sortIdAsc(a, b); 
    });
    
    const readyQueue = readyStaff.filter(s => getStatus(s.id) === 'READY').map(s => s.id);
    const safeBookings = Array.isArray(bookings) ? bookings : [];
    const todaysBookings = useMemo(() => {
        return safeBookings.filter(b => window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate));
    }, [bookings, viewDate]);

    return (
        <div className="min-h-screen flex flex-col bg-slate-50">
            <header className={`text-white p-3 shadow-md flex justify-between items-center sticky top-0 z-50 transition-colors ${quotaError ? 'bg-red-800' : 'bg-[#1e1b4b]'}`}>
                <div className="flex items-center gap-3">
                    <span className="bg-amber-500 text-black px-2 py-1 rounded font-black text-sm">V269 (Standard)</span>
                    <span className="font-bold hidden md:inline">XinWuChan</span>
                    <div className="flex items-center gap-2 bg-white/10 rounded px-2 py-1 border border-white/20">
                        <button onClick={()=>{const d=new Date(viewDate); d.setDate(d.getDate()-1); setViewDate(d.toISOString().split('T')[0])}} className="text-white hover:text-amber-400 font-bold px-2">❮</button>
                        <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} className="bg-transparent text-white font-bold outline-none cursor-pointer text-center" style={{colorScheme: 'dark'}} />
                        <button onClick={()=>{const d=new Date(viewDate); d.setDate(d.getDate()+1); setViewDate(d.toISOString().split('T')[0])}} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    {quotaError && <button onClick={handleRetryConnection} className="bg-white text-red-600 px-4 py-1.5 rounded font-bold text-sm animate-pulse mr-4"><i className="fas fa-exclamation-triangle"></i> 網路塞車 (Reconnect)</button>}
                    
                    <button onClick={()=>setShowAvailability(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-1.5 rounded font-bold text-sm flex gap-1 items-center shadow-md animate-pulse">
                        <i className="fas fa-phone-volume"></i> <span className="hidden md:inline">電話預約 (Call)</span>
                    </button>

                    <button onClick={()=>setShowWalkIn(true)} className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-1.5 rounded font-bold text-sm flex gap-1 items-center"><i className="fas fa-bolt"></i> 快速接單</button>
                    <button onClick={()=>setShowCheckIn(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded font-bold text-sm flex gap-1 items-center"><i className="fas fa-user-clock"></i> 技師打卡</button>
                </div>
            </header>
            
            <div className="bg-white border-b shadow-sm p-2 overflow-x-auto whitespace-nowrap staff-scroll">
                <div className="flex w-full justify-between items-center min-w-max">
                    <div className="flex gap-1 opacity-30 scale-95 border-r-2 pr-2 mr-1 border-dashed border-slate-300">
                        {awayStaff.map(s => <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} />)}
                    </div>
                    <div className="flex items-center flex-1 justify-end pl-2">
                        <div className="flex gap-1 px-2 border-r border-red-100 flex-row-reverse">
                            {busyStaff.map(s => <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} isForcedBusy={true} />)}
                        </div>
                        <div className="flex flex-row-reverse gap-1 pl-2">
                            {readyStaff.map((s, idx) => { 
                                const qIdx = readyQueue.indexOf(s.id); 
                                return <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} queueIndex={qIdx !== -1 ? qIdx : undefined} />; 
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 flex gap-2">
                <button onClick={()=>setActiveTab('map')} className={`px-3 py-1.5 rounded font-bold text-xs flex gap-2 items-center ${activeTab==='map'?'bg-[#1e1b4b] text-white':'bg-white shadow'}`}><i className="fas fa-th"></i> 平面圖 (Map)</button>
                <button onClick={()=>setActiveTab('list')} className={`px-3 py-1.5 rounded font-bold text-xs flex gap-2 items-center ${activeTab==='list'?'bg-[#1e1b4b] text-white':'bg-white shadow'}`}><i className="fas fa-list"></i> 列表 (List)</button>
                <button onClick={()=>setActiveTab('timeline')} className={`px-3 py-1.5 rounded font-bold text-xs flex gap-2 items-center ${activeTab==='timeline'?'bg-[#1e1b4b] text-white':'bg-white shadow'}`}><i className="fas fa-stream"></i> 時間軸 (Timeline)</button>
                <button onClick={()=>setActiveTab('report')} className={`px-3 py-1.5 rounded font-bold text-xs flex gap-2 items-center ${activeTab==='report'?'bg-[#1e1b4b] text-white':'bg-white shadow'}`}><i className="fas fa-chart-line"></i> 營業報告 (Report)</button>
            </div>
            <main className="flex-1 p-4 overflow-y-auto">
                {activeTab === 'map' && (<div className="grid grid-cols-12 gap-6"><div className="col-span-9 space-y-6"><div><h3 className="font-bold text-emerald-600 mb-3 border-b pb-1">足底按摩區 (Foot)</h3><div className="grid grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <window.ResourceCard key={`chair-${i}`} id={`chair-${i}`} type="FOOT" index={i} data={resourceState[`chair-${i}`]} busyStaffIds={busyStaffIds} staffList={staffList} onAction={handleResourceAction} onSelect={()=>setSelectedSlot(`chair-${i}`)} onSwitch={handleSwitch} onToggleMax={handleToggleMax} onToggleSequence={handleToggleSequence} onServiceChange={handleServiceChange} onStaffChange={handleStaffChange} onSplit={(rid)=>setSplitData({resourceId: rid})} getGroupMemberIndex={getGroupMemberIndex} />)}</div></div><div><h3 className="font-bold text-purple-600 mb-3 border-b pb-1">身體指壓區 (Body)</h3><div className="grid grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <window.ResourceCard key={`bed-${i}`} id={`bed-${i}`} type="BODY" index={i} data={resourceState[`bed-${i}`]} busyStaffIds={busyStaffIds} staffList={staffList} onAction={handleResourceAction} onSelect={()=>setSelectedSlot(`bed-${i}`)} onSwitch={handleSwitch} onToggleMax={handleToggleMax} onToggleSequence={handleToggleSequence} onServiceChange={handleServiceChange} onStaffChange={handleStaffChange} onSplit={(rid)=>setSplitData({resourceId: rid})} getGroupMemberIndex={getGroupMemberIndex} />)}</div></div></div><div className="col-span-3 bg-white rounded-lg shadow p-4 h-fit sticky top-2"><h3 className="font-bold text-gray-700 mb-3">候位名單 ({todaysBookings.filter(b=>b.status==='已預約').length})</h3><div className="space-y-2 max-h-[500px] overflow-y-auto">{todaysBookings.filter(b=>b.status==='已預約').map(b => (<div key={b.rowId} className="border p-2 rounded hover:bg-slate-50 relative group bg-white shadow-sm"><div className="flex justify-between font-bold text-sm"><span>{b.customerName}</span><span className="text-indigo-600 font-mono">{b.startTimeString.split(' ')[1]}</span></div><div className="text-xs text-gray-500 font-bold">{b.serviceName}</div>{(b.isOil || (b.serviceName && b.serviceName.includes('油'))) && <div className="text-[10px] bg-purple-100 text-purple-700 inline-block px-1 rounded mt-1 font-bold border border-purple-200">💧 精油 (Oil)</div>}{b.pax > 1 && <div className="text-[10px] bg-orange-100 text-orange-600 inline-block px-1 rounded mt-1 ml-1 font-bold">{b.pax} 人</div>}{selectedSlot && <button onClick={()=>handleAssignBooking(b)} className="absolute inset-0 bg-green-500/90 text-white font-bold flex items-center justify-center rounded animate-pulse">排入 {selectedSlot}</button>}<button onClick={()=>handleManualUpdateStatus(b.rowId, '❌ Cancelled')} className="absolute top-1 right-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><i className="fas fa-trash"></i></button></div>))}</div></div></div>)}
                {activeTab === 'list' && (<div className="bg-white rounded shadow overflow-hidden"><table className="w-full text-sm text-left"><thead className="bg-slate-100 text-slate-600 font-bold"><tr><th className="p-3">預約日期</th><th className="p-3">時間</th><th className="p-3">姓名</th><th className="p-3">項目</th><th className="p-3">油推</th><th className="p-3">人數</th><th className="p-3">電話</th><th className="p-3">狀態</th><th className="p-3">指定師傅</th><th className="p-3 text-right">操作</th></tr></thead><tbody className="divide-y">{todaysBookings.map(b => { const nameParts = b.customerName.split('('); const name = nameParts[0].trim(); const phone = nameParts.length > 1 ? nameParts[1].replace(')', '').trim() : (b.sdt || ''); const isOil = b.serviceName.includes('油') ? 'Yes' : ''; return ( <tr key={b.rowId} className="hover:bg-slate-50"><td className="p-3 font-mono">{b.startTimeString.split(' ')[0]}</td><td className="p-3 font-mono font-bold text-indigo-700">{b.startTimeString.split(' ')[1]}</td><td className="p-3 font-bold">{name}</td><td className="p-3 text-gray-600">{b.serviceName}</td><td className="p-3 text-center">{isOil && <span className="text-purple-600 font-bold">Yes</span>}</td><td className="p-3 text-center">{b.pax}</td><td className="p-3 font-mono text-gray-500">{phone}</td><td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${b.status.includes('取消')?'bg-red-100 text-red-600':'bg-green-100 text-green-600'}`}>{b.status}</span></td><td className="p-3"><span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">{b.staffId}</span></td><td className="p-3 text-right"><button onClick={()=>handleManualUpdateStatus(b.rowId, '❌ Cancelled')} className="text-red-500 hover:bg-red-50 px-2 py-1 rounded"><i className="fas fa-trash"></i></button></td></tr> ); })}</tbody></table></div>)}
                {activeTab === 'timeline' && <window.TimelineView bookings={todaysBookings} resourceState={resourceState} />}
                {activeTab === 'report' && <window.ReportView bookings={todaysBookings} />}
            </main>
            {showWalkIn && <window.WalkInModal onClose={()=>setShowWalkIn(false)} onSave={handleWalkInSave} staffList={staffList} initialDate={viewDate} />}
            {showCheckIn && <window.CheckInBoard staffList={staffList} statusData={statusData} onUpdateStatus={updateStaffStatus} onClose={()=>setShowCheckIn(false)} />}
            {showAvailability && <window.AvailabilityCheckModal onClose={()=>setShowAvailability(false)} onSave={handleWalkInSave} staffList={staffList} bookings={bookings} initialDate={viewDate} />}
            {comboStartData && <window.ComboStartModal onConfirm={confirmComboStart} onCancel={()=>setComboStartData(null)} bookingName={comboStartData.booking.serviceName} />}
            {selectedSlot && !bookings.find(b=>b.status==='已預約') && <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center text-white font-bold" onClick={()=>setSelectedSlot(null)}>目前無候位! (No Waiting)</div>}
            {billingData && <window.BillingModal activeItem={billingData.activeItem} relatedItems={billingData.relatedItems} onConfirm={handleConfirmPayment} onCancel={() => setBillingData(null)} />}
            {splitData && <window.SplitStaffModal staffList={staffList} statusData={statusData} onCancel={()=>setSplitData(null)} onConfirm={handleSplitConfirm} />}
        </div>
    );
};

// --- ROOT RENDER ---
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <window.ErrorBoundary>
        <App />
    </window.ErrorBoundary>
);
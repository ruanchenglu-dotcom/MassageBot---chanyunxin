// TYPE: app.js
// VERSION: V102.6 (OPTIMISTIC TIME SPLIT & STRICT FLOW)
// UPDATE: 2026-01-25
// AUTHOR: AI ASSISTANT & USER
//
// --- CHANGE LOG V102.6 ---
// 1. [OPTIMISTIC UI] handleSaveComboTime: Cập nhật state cục bộ ngay lập tức trước khi gọi API.
// 2. [LOGIC] getSmartSplit: Ưu tiên tuyệt đối dữ liệu phase1/phase2 từ Database nếu tồn tại.
// 3. [VALIDATION] Thêm kiểm tra đầu vào khi chỉnh sửa thời gian Combo.
//
// --- CHANGE LOG V102.5 (RETAINED) ---
// 1. [PARSING] Hỗ trợ mã flow 'FOOTSINGLE' và 'BODYSINGLE'.
// 2. [MATRIX] Logic xếp chỗ ưu tiên 'forceResourceType'.
// 3. [GUARD] Chặn di chuyển nhầm tài nguyên đối với Strict Flows.

const { useState, useEffect, useMemo, useRef } = React;

// --- 1. COMPONENT IMPORTS ---
// Các component con được load từ window (giả lập môi trường script tag)
const CommissionView = window.CommissionView;
const TimelineView = window.TimelineView;
const BookingListView = window.BookingListView;

// --- MATRIX HELPER ---
// Hỗ trợ tính toán va chạm thời gian và tìm slot trống
const MatrixHelper = {
    isOverlap: (startA, endA, startB, endB) => {
        return (startA < endB) && (startB < endA);
    },
    countAvailableResources: (type, start, end, gridState, reservedTimes) => {
        let count = 0;
        for (let i = 1; i <= 6; i++) {
            const id = `${type}-${i}`;
            if (reservedTimes[id] && start < reservedTimes[id]) continue;
            let isClash = false;
            if (gridState[id]) {
                for (const slot of gridState[id]) {
                    if (MatrixHelper.isOverlap(start, end, slot.start, slot.end)) {
                        isClash = true;
                        break;
                    }
                }
            }
            if (!isClash) count++;
        }
        return count;
    },
    findBestSlot: (type, start, end, gridState, reservedTimes, preferredIndex = null) => {
        const limit = 6;
        // Ưu tiên tìm đúng ghế/giường mong muốn (nếu có preferredIndex)
        if (preferredIndex) {
            const id = `${type}-${preferredIndex}`;
            let valid = true;
            if (reservedTimes[id] && start < reservedTimes[id]) valid = false;
            if (valid && gridState[id]) {
                for (const slot of gridState[id]) {
                    if (MatrixHelper.isOverlap(start, end, slot.start, slot.end)) {
                        valid = false;
                        break;
                    }
                }
            }
            if (valid) return id;
        }
        // Nếu không, tìm slot đầu tiên trống
        for (let i = 1; i <= limit; i++) {
            const id = `${type}-${i}`;
            if (reservedTimes[id] && start < reservedTimes[id]) continue;
            let isClash = false;
            if (gridState[id]) {
                for (const slot of gridState[id]) {
                    if (MatrixHelper.isOverlap(start, end, slot.start, slot.end)) {
                        isClash = true;
                        break;
                    }
                }
            }
            if (!isClash) return id;
        }
        return null; 
    }
};

// --- HELPER: FALLBACK PARSER ---
// Phân tích ghi chú để đoán Flow (BF/FB) nếu dữ liệu thiếu
const detectFlowFromNote = (note, guestIndex) => {
    if (!note) return null;
    const rawStr = note.toString().toUpperCase();
    const cleanNote = rawStr.replace(/：/g, ':').replace(/，/g, ',').replace(/;/g, ',').replace(/\(/g, ',').replace(/\)/g, ',').replace(/\s+/g, '');
    const kTag = `K${guestIndex + 1}`; 
    const hasAnyKTag = /K\d/.test(cleanNote);

    if (hasAnyKTag) {
        const parts = cleanNote.split(',');
        for (const part of parts) {
            if (part.includes(kTag)) {
                if (part.match(/BODY|BF|先做身體|先身|先做身体|MÌNH|THÂN|LƯNG|BACK|BODI/)) return 'BF';
                if (part.match(/FOOT|FB|先做腳|先做脚|先足|先做足|腳|脚|足|CHÂN|CHAN|FUT/)) return 'FB';
            }
        }
        return null; 
    }
    if (cleanNote.match(/BODYFIRST|BF|先做身體|先身/)) return 'BF';
    if (cleanNote.match(/FOOTFIRST|FB|先做腳|先足/)) return 'FB';
    return null;
};

// --- HELPER: DATA DRIVEN SPLIT (CORE LOGIC UPDATE V102.6) ---
const getSmartSplit = (booking, totalDuration, isMaxMode, sequence) => {
    // 1. PRIORITY: Data from Sheet/DB (Phase 1 & Phase 2 exist)
    // Nếu dữ liệu đã có sẵn phase1 và phase2 (do chỉnh tay hoặc lưu trước đó), dùng ngay lập tức.
    if (booking.phase1_duration !== undefined && booking.phase1_duration !== null && booking.phase1_duration > 0 &&
        booking.phase2_duration !== undefined && booking.phase2_duration !== null) {
        return { 
            phase1: parseInt(booking.phase1_duration), 
            phase2: parseInt(booking.phase2_duration) 
        };
    }

    // 2. Priority: Legacy Manual Locked Phase 1
    // Hỗ trợ dữ liệu cũ chỉ có phase1
    if (booking.phase1_duration && booking.phase1_duration > 0) {
        const p1 = parseInt(booking.phase1_duration);
        return { phase1: p1, phase2: totalDuration - p1 };
    }

    // 3. Fallback: Algorithm (Default Split)
    // Nếu chưa có dữ liệu tuỳ chỉnh, dùng hàm chia mặc định của hệ thống
    return window.getComboSplit(totalDuration, isMaxMode, sequence, null);
};


// --- APP COMPONENT ---
const App = () => {
    // 1. STATE MANAGEMENT
    const [activeTab, setActiveTab] = useState('map'); 
    const [staffList, setStaffList] = useState([]);
    const [bookings, setBookings] = useState([]); 
    const [resourceState, setResourceState] = useState({}); 
    const [statusData, setStatusData] = useState({});
    const [timelineData, setTimelineData] = useState({}); 
    
    // Modal States
    const [showCheckIn, setShowCheckIn] = useState(false);
    const [showAvailability, setShowAvailability] = useState(false); 
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [billingData, setBillingData] = useState(null);
    const [comboStartData, setComboStartData] = useState(null);
    const [splitData, setSplitData] = useState(null);
    const [editComboTarget, setEditComboTarget] = useState(null);

    // System States
    const [viewDate, setViewDate] = useState(window.getOperationalDateInputFormat());
    const [syncLock, setSyncLock] = useState(false); // Khoá sync khi đang thao tác tay
    const [quotaError, setQuotaError] = useState(false); 
    const [isManualRefreshing, setIsManualRefreshing] = useState(false);

    // 2. HELPER FUNCTIONS WITHIN COMPONENT
    const isActuallyBusy = (staffId) => {
        if (!resourceState) return false;
        return Object.values(resourceState).some(r => {
            if (!r.isRunning || r.isPaused || r.isPreview === true) return false;
            const b = r.booking || {};
            const possibleKeys = [
                b.serviceStaff, b.staffId, b.ServiceStaff, b.technician, b.Technician,
                b.staffId2, b.StaffId2, b.staff2, b.Staff2,
                b.staffId3, b.StaffId3, b.staff3, b.Staff3,
                b.staffId4, b.StaffId4, b.staff4, b.Staff4,
                b.staffId5, b.StaffId5, b.staff5, b.Staff5,
                b.staffId6, b.StaffId6, b.staff6, b.Staff6
            ];
            return possibleKeys.includes(staffId);
        });
    };

    const busyStaffIds = useMemo(() => {
        const ids = new Set();
        Object.values(resourceState).forEach(r => {
            if (r.isRunning && !r.isPaused && r.isPreview !== true) {
                const b = r.booking || {};
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

    const updateResource = async (newState) => { 
        setResourceState(newState); 
        await axios.post('/api/sync-resource', newState); 
    };
    
    const updateStaffStatus = async (newStatus) => { 
        setStatusData(newStatus); 
        await axios.post('/api/sync-staff-status', newStatus); 
    }

    const getGroupMemberIndex = (targetResId, targetRowId) => {
        const allSlots = [];
        for(let i=1; i<=6; i++) allSlots.push(`chair-${i}`);
        for(let i=1; i<=6; i++) allSlots.push(`bed-${i}`);
        const groupSlots = allSlots.filter(slotId => {
            const res = resourceState[slotId];
            return res && res.booking && String(res.booking.rowId) === String(targetRowId);
        });
        groupSlots.sort((a, b) => window.getWeight(a) - window.getWeight(b));
        return groupSlots.indexOf(targetResId); 
    };

    const universalSend = async (endpoint, payload) => {
        try { await axios.post(endpoint, payload); } catch(e) { console.log("Universal send check (ignore):", e); }
    };

    // 3. CORE LOGIC (FETCH & RENDER) - THE VIEWER
    const fetchData = async (isManual = false) => {
        if (syncLock && !isManual) return; 
        if (quotaError && !isManual) return;
        if (isManual) setIsManualRefreshing(true);

        try {
            const endpoint = isManual ? '/api/info?forceRefresh=true' : '/api/info';
            const res = await axios.get(endpoint);
            setQuotaError(false); 
            
            const { bookings: apiBookings, staffList: apiStaff, resourceState: serverRes, staffStatus: serverStaff } = res.data;
            
            // --- DATA CLEANING (STRICT FLOW LOGIC) ---
            const cleanBookings = (apiBookings || []).map(b => {
                let rawFlow = b.flow || null;
                if (rawFlow === 'null' || rawFlow === 'undefined' || rawFlow === '') rawFlow = null;
                if (rawFlow) rawFlow = rawFlow.toUpperCase();

                // Map cột thời gian thực từ Sheet
                const p1 = b.phase1_duration ? parseInt(b.phase1_duration) : null;
                const p2 = b.phase2_duration ? parseInt(b.phase2_duration) : null;
                const isLocked = (b.isManualLocked === true || String(b.isManualLocked) === 'TRUE');

                // STRICT RESOURCE LOGIC
                let forceResourceType = null;
                let isForcedSingle = false;

                if (rawFlow === 'FOOTSINGLE') {
                    forceResourceType = 'CHAIR';
                    isForcedSingle = true;
                } else if (rawFlow === 'BODYSINGLE') {
                    forceResourceType = 'BED';
                    isForcedSingle = true;
                }

                return { 
                    ...b, 
                    duration: window.getSafeDuration(b.serviceName, b.duration),
                    pax: parseInt(b.pax, 10) || 1,
                    rowId: String(b.rowId),
                    // Trust the Sheet Values:
                    phase1_duration: p1,
                    phase2_duration: p2,
                    flow: rawFlow,
                    isManualLocked: isLocked,
                    originalNote: b.ghiChu || b.note || "",
                    forceResourceType: forceResourceType,
                    isForcedSingle: isForcedSingle
                };
            });

            const bookingMap = new Map();
            cleanBookings.forEach(b => bookingMap.set(String(b.rowId), b));

            const relevantBookings = cleanBookings.filter(b => 
                window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate) && 
                !b.status.includes('取消') && 
                !b.status.includes('Cancelled')
            );
            
            // Sync Logic
            if (!syncLock) {
                setBookings(prev => {
                    const combinedMap = new Map();
                    relevantBookings.forEach(b => combinedMap.set(String(b.rowId), b));
                    prev.forEach(localBooking => {
                        const rid = String(localBooking.rowId);
                        if (combinedMap.has(rid)) {
                            const serverBooking = combinedMap.get(rid);
                            const mergedBooking = { ...serverBooking };
                            // Bảo toàn trạng thái hoàn thành cục bộ
                            for(let i=1; i<=6; i++) {
                                const key = `Status${i}`;
                                const localVal = localBooking[key];
                                const serverVal = serverBooking[key];
                                if (localVal && localVal.includes('完成') && (!serverVal || !serverVal.includes('完成'))) {
                                    mergedBooking[key] = localVal; 
                                }
                            }
                            combinedMap.set(rid, mergedBooking);
                        }
                    });
                    return Array.from(combinedMap.values());
                });
            }
            
            setStaffList(apiStaff || []);
            const currentRes = serverRes || {};
            setStatusData(serverStaff || {});

            // --- DATA HYDRATION (QUAN TRỌNG CHO OPTIMISTIC UPDATE) ---
            // Cập nhật lại thông tin thời gian vào resource đang chạy để khớp với booking list
            Object.keys(currentRes).forEach(key => {
                if (currentRes[key] && currentRes[key].booking) {
                    const rowId = String(currentRes[key].booking.rowId);
                    if (bookingMap.has(rowId)) {
                        const freshData = bookingMap.get(rowId);
                        // Hydrate các trường quan trọng
                        currentRes[key].booking.phase1_duration = freshData.phase1_duration;
                        currentRes[key].booking.phase2_duration = freshData.phase2_duration;
                        currentRes[key].booking.flow = freshData.flow;
                        currentRes[key].booking.isManualLocked = freshData.isManualLocked;
                        currentRes[key].booking.forceResourceType = freshData.forceResourceType;
                        currentRes[key].booking.isForcedSingle = freshData.isForcedSingle;
                    }
                }
            });

            // --- MATRIX CALCULATION (GRID RENDERING) ---
            const nowObj = window.getTaipeiDate();
            const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < 8 ? 1440 : 0);
            
            let tempState = {}; 
            const activeEndTimes = {};
            const timelineGrid = {};

            const addToGrid = (resId, start, end, booking, meta) => {
                if (!timelineGrid[resId]) timelineGrid[resId] = [];
                timelineGrid[resId].push({ start, end, booking, meta });
            };

            // LAYER 1: RUNNING STATE
            Object.keys(currentRes).forEach(key => {
                if(currentRes[key].isRunning) {
                    tempState[key] = currentRes[key];
                    const startTime = new Date(currentRes[key].startTime);
                    const startMins = startTime.getHours() * 60 + startTime.getMinutes() + (startTime.getHours() < 8 ? 1440 : 0);
                    
                    const b = currentRes[key].booking;
                    let durationUsed = b.duration;
                    let isPhase1 = false;
                    
                    // Strict Single check
                    const isStrictSingle = b.isForcedSingle === true; 

                    if (currentRes[key].comboMeta && !isStrictSingle) {
                        const seq = currentRes[key].comboMeta.sequence || 'FB';
                        const isMax = currentRes[key].isMaxMode;
                        
                        // Sử dụng getSmartSplit mới đã được cập nhật logic ưu tiên
                        const split = getSmartSplit(b, b.duration, isMax, seq);
                        isPhase1 = (seq === 'FB' && key.includes('chair')) || (seq === 'BF' && key.includes('bed'));
                        
                        if (isPhase1) durationUsed = split.phase1 + (currentRes[key].comboMeta.flex || 0);
                        else durationUsed = split.phase2; 
                    } else {
                         tempState[key].comboMeta = null;
                    }

                    const endMins = startMins + durationUsed;
                    activeEndTimes[key] = endMins;
                    addToGrid(key, startMins, endMins, b, {
                        isCombo: !!tempState[key].comboMeta,
                        phase: isPhase1 ? 1 : 2,
                        sequence: tempState[key].comboMeta?.sequence,
                        isRunning: true 
                    });
                }
            });

            // LAYER 2: GHOST BLOCKS
            Object.keys(tempState).forEach(key => {
                const item = tempState[key];
                if (item.comboMeta && !item.booking.isForcedSingle) {
                    const seq = item.comboMeta.sequence || 'FB';
                    const isChair = key.includes('chair');
                    const isPhase1 = (seq === 'FB' && isChair) || (seq === 'BF' && !isChair);
                    
                    if (isPhase1) {
                        const finishTimeMins = activeEndTimes[key]; 
                        const p2Start = finishTimeMins + 5; 
                        
                        const split = getSmartSplit(item.booking, item.booking.duration, item.isMaxMode, seq);
                        const p2End = p2Start + split.phase2;
                        
                        let finalTargetId = item.comboMeta.targetId;
                        const targetType = key.includes('chair') ? 'bed' : 'chair';
                        
                        if (!finalTargetId || (activeEndTimes[finalTargetId] && p2Start < activeEndTimes[finalTargetId])) {
                             finalTargetId = MatrixHelper.findBestSlot(targetType, p2Start, p2End, timelineGrid, activeEndTimes);
                        }
                        if (finalTargetId) {
                            addToGrid(finalTargetId, p2Start, p2End, item.booking, { 
                                isCombo: true, phase: 2, sequence: seq, originId: key, isPrediction: true 
                            });
                        }
                    }
                }
            });

            // LAYER 3: PENDING BOOKINGS
            const runningPool = [];
            Object.values(tempState).forEach(state => {
                if (state.booking) {
                    const b = state.booking;
                    const phoneSuffix = (b.phone || b.sdt || b.custPhone || "").replace(/\D/g, '').slice(-6);
                    runningPool.push({
                        rowId: String(b.rowId),
                        signature: `${(b.customerName || '').trim()}|${b.startTimeString.split(' ')[1]}|${phoneSuffix}`
                    });
                }
            });

            const pendingBookings = relevantBookings.filter(b => {
                if (b.status.includes('完成') || b.status.includes('✅') || b.status.includes('Done')) return false;
                const currentId = String(b.rowId);
                const phoneSuffix = (b.phone || b.sdt || b.custPhone || "").replace(/\D/g, '').slice(-6);
                const currentSig = `${(b.customerName || '').trim()}|${b.startTimeString.split(' ')[1]}|${phoneSuffix}`;

                const strictIndex = runningPool.findIndex(r => r.rowId === currentId);
                if (strictIndex !== -1) { runningPool.splice(strictIndex, 1); return false; }
                const softIndex = runningPool.findIndex(r => r.signature === currentSig);
                if (softIndex !== -1) { runningPool.splice(softIndex, 1); return false; }
                return true;
            });
            
            const groupedPending = {};
            pendingBookings.forEach(b => {
                const timeKey = (b.startTimeString || "").split(' ')[1] || '00:00';
                const phoneRaw = b.phone || b.sdt || b.custPhone || ""; 
                const phoneKey = phoneRaw.replace(/\D/g, '').slice(-6); 
                const nameKey = (b.customerName || "Guest").trim();
                let groupKey;
                if (phoneKey.length >= 3) groupKey = `${timeKey}_P_${phoneKey}`;
                else if (nameKey.length > 0 && nameKey !== 'Guest') groupKey = `${timeKey}_N_${nameKey}`;
                else groupKey = `ROW_${b.rowId}`;
                if(!groupedPending[groupKey]) groupedPending[groupKey] = [];
                groupedPending[groupKey].push(b);
            });

            const listSingles = [];
            const listCombosGroups = [];

            Object.values(groupedPending).forEach(group => {
                group.sort((a, b) => parseInt(a.rowId) - parseInt(b.rowId));
                const first = group[0];
                const isForceSingle = first.forceResourceType !== null;
                const isCombo = !isForceSingle && (first.category === 'COMBO' || (first.serviceName && first.serviceName.includes('套餐')));
                
                if (isCombo) listCombosGroups.push(group);
                else group.forEach(b => listSingles.push(b));
            });
            
            const sortFn = (a,b) => window.normalizeToTimelineMins(a.startTimeString.split(' ')[1]) - window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
            listSingles.sort(sortFn);
            listCombosGroups.sort((a,b) => sortFn(a[0], b[0]));

            // ALLOCATE SINGLES
            listSingles.forEach(b => {
                const originalStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                let type = 'chair';
                if (b.forceResourceType) {
                    type = b.forceResourceType === 'CHAIR' ? 'chair' : 'bed';
                } else {
                    type = b.type === 'CHAIR' ? 'chair' : 'bed';
                }

                let searchOffsets = [0]; for(let i=1; i<=120; i++) searchOffsets.push(i);
                for(let delay of searchOffsets) {
                    let tryStart = originalStart + delay;
                    let tryEnd = tryStart + b.duration;
                    const slotId = MatrixHelper.findBestSlot(type, tryStart, tryEnd, timelineGrid, activeEndTimes);
                    if (slotId) { addToGrid(slotId, tryStart, tryEnd, b, { isCombo: false, isPending: true }); break; }
                }
            });

            // ALLOCATE COMBOS
            listCombosGroups.forEach(group => {
                const firstBooking = group[0]; 
                const originalStart = window.normalizeToTimelineMins(firstBooking.startTimeString.split(' ')[1]);
                const groupSize = group.length;
                const masterNote = firstBooking.originalNote || ""; 

                let coupleStrategyOverride = null;
                const hasAnyExplicitFlowInData = group.some(g => g.flow === 'BF' || g.flow === 'FB');
                
                if (!hasAnyExplicitFlowInData && groupSize === 2) {
                    const explicitFlow1 = detectFlowFromNote(group[0].originalNote || masterNote, 0);
                    const explicitFlow2 = detectFlowFromNote(group[1].originalNote || masterNote, 1);
                    
                    if (!explicitFlow1 && !explicitFlow2) {
                         const cDur = firstBooking.duration || 100;
                         const cSplit = getSmartSplit(firstBooking, cDur, true, 'FB');
                         
                         const scanOffsets = [0, 10, 20];
                         for (let delay of scanOffsets) {
                             const tStart = originalStart + delay;
                             const tP1End = tStart + cSplit.phase1;
                             const tP2Start = tP1End + 5;
                             const tP2End = tP2Start + cSplit.phase2;

                             const freeChairsP1 = MatrixHelper.countAvailableResources('chair', tStart, tP1End, timelineGrid, activeEndTimes);
                             const freeBedsP2 = MatrixHelper.countAvailableResources('bed', tP2Start, tP2End, timelineGrid, activeEndTimes);
                             if (freeChairsP1 >= 2 && freeBedsP2 >= 2) { coupleStrategyOverride = 'FB'; break; }

                             const freeBedsP1 = MatrixHelper.countAvailableResources('bed', tStart, tP1End, timelineGrid, activeEndTimes);
                             const freeChairsP2 = MatrixHelper.countAvailableResources('chair', tP2Start, tP2End, timelineGrid, activeEndTimes);
                             if (freeBedsP1 >= 2 && freeChairsP2 >= 2) { coupleStrategyOverride = 'BF'; break; }
                         }
                    }
                }

                const idealNumBF = Math.ceil(groupSize / 2); 

                group.forEach((bookingItem, idx) => {
                    if (bookingItem.forceResourceType) return; 

                    const dataFlow = bookingItem.flow; 
                    const noteFlow = detectFlowFromNote(bookingItem.originalNote || masterNote, idx);
                    let preferredSeq = null;

                    if (dataFlow === 'BF' || dataFlow === 'FB') preferredSeq = dataFlow;
                    else if (noteFlow) preferredSeq = noteFlow;
                    else if (coupleStrategyOverride) preferredSeq = coupleStrategyOverride;
                    else {
                        if (groupSize >= 2) {
                            if (idx < idealNumBF) preferredSeq = 'BF';
                            else preferredSeq = 'FB';
                        } else {
                            preferredSeq = null; 
                        }
                    }
                    
                    let searchOffsets = [0]; for(let i=1; i<=120; i++) searchOffsets.push(i);
                    
                    for(let delay of searchOffsets) {
                        let tryStart = originalStart + delay;

                        const trySequence = (seq) => {
                            const split = getSmartSplit(bookingItem, bookingItem.duration, true, seq);
                            
                            const p1End = tryStart + split.phase1;
                            const p2Start = p1End + 5; 
                            const p2End = p2Start + split.phase2;
                            
                            const type1 = seq === 'FB' ? 'chair' : 'bed';
                            const type2 = seq === 'FB' ? 'bed' : 'chair';
                            
                            let preferredSlotIndex;
                            if (groupSize === 2) {
                                if (coupleStrategyOverride) preferredSlotIndex = idx + 1;
                                else preferredSlotIndex = 1; 
                            } else if (groupSize >= 4) {
                                const normalizedIdx = idx % Math.ceil(groupSize / 2);
                                preferredSlotIndex = normalizedIdx + 1;
                            } else {
                                preferredSlotIndex = idx + 1;
                            }

                            const s1 = MatrixHelper.findBestSlot(type1, tryStart, p1End, timelineGrid, activeEndTimes, preferredSlotIndex);
                            const s2 = MatrixHelper.findBestSlot(type2, p2Start, p2End, timelineGrid, activeEndTimes, preferredSlotIndex);
                            
                            if (s1 && s2) {
                                addToGrid(s1, tryStart, p1End, bookingItem, { isCombo: true, phase: 1, sequence: seq, targetId: s2, isPending: true });
                                addToGrid(s2, p2Start, p2End, bookingItem, { isCombo: true, phase: 2, sequence: seq, isPending: true });
                                return true;
                            }
                            return false;
                        };

                        if (preferredSeq) {
                            if (trySequence(preferredSeq)) break;
                        } else {
                            const primary = (idx < idealNumBF) ? 'BF' : 'FB';
                            const secondary = (primary === 'BF') ? 'FB' : 'BF';
                            if (trySequence(primary)) break;
                            if (trySequence(secondary)) break;
                        }
                    }
                });
            });

            setTimelineData(timelineGrid);

            // PREVIEW RESOURCE CARD
            const allSlots = [];
            for(let i=1; i<=6; i++) allSlots.push(`chair-${i}`);
            for(let i=1; i<=6; i++) allSlots.push(`bed-${i}`);

            allSlots.forEach(resId => {
                if (tempState[resId]) return;
                const slots = timelineGrid[resId] || [];
                const currentSlot = slots.find(s => (nowMins >= s.start && nowMins < s.end));
                
                if (currentSlot) {
                    const nameLabel = currentSlot.booking.pax > 1 ? `${currentSlot.booking.customerName} (Grp)` : currentSlot.booking.customerName;
                    const isStrict = currentSlot.booking.isForcedSingle === true;
                    
                    tempState[resId] = { 
                        booking: { ...currentSlot.booking, customerName: nameLabel, serviceStaff: null }, 
                        startTime: null, isRunning: false, 
                        isPreview: true, previewType: 'NOW', 
                        comboMeta: (currentSlot.meta.isCombo && !isStrict) ? { sequence: currentSlot.meta.sequence, phase: currentSlot.meta.phase, targetId: currentSlot.meta.targetId } : null, 
                        isMaxMode: true 
                    };
                } else {
                    const upcomingSlot = slots.find(s => s.start > nowMins && s.start - nowMins <= 30);
                    if (upcomingSlot) {
                         const isStrict = upcomingSlot.booking.isForcedSingle === true;
                         tempState[resId] = {
                            booking: { ...upcomingSlot.booking, serviceStaff: null },
                            startTime: null, isRunning: false,
                            isPreview: true, previewType: 'SOON',
                            timeToStart: upcomingSlot.start - nowMins,
                            comboMeta: (upcomingSlot.meta.isCombo && !isStrict) ? { sequence: upcomingSlot.meta.sequence, phase: upcomingSlot.meta.phase } : null
                        }
                    }
                }
            });
            
            setResourceState(prev => {
                if(syncLock) return prev; 
                return { ...tempState }; 
            });
            
        } catch(e) { 
            console.error("API Error", e);
            if (e.response && e.response.status === 429) setQuotaError(true);
        } finally {
            if (isManual) setIsManualRefreshing(false);
        }
    };

    // Auto Fetch Loop
    useEffect(() => { 
        fetchData(false); 
        const t = setInterval(() => fetchData(false), 2000); 
        return () => clearInterval(t); 
    }, [viewDate, syncLock, quotaError]); 

    // Handle Force Refresh
    const handleForceRefresh = () => {
        if (isManualRefreshing) return; 
        fetchData(true); 
    };

    // 4. ACTION HANDLERS
    const handleSplitConfirm = async (staffId2) => {
        if (!splitData) return;
        const { resourceId } = splitData;
        const current = resourceState[resourceId];
        if (!current) return;
        setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);
        
        const newStatusData = { ...statusData, [staffId2]: { ...statusData[staffId2], status: 'BUSY' } };
        updateStaffStatus(newStatusData);
        
        const grpIdx = getGroupMemberIndex(resourceId, current.booking.rowId);
        let primaryKey = "服務師傅1"; let targetProp = "serviceStaff"; 
        if (grpIdx === 1) { primaryKey = "服務師傅2"; targetProp = "staffId2"; }
        else if (grpIdx === 2) { primaryKey = "服務師傅3"; targetProp = "staffId3"; }
        else if (grpIdx === 3) { primaryKey = "服務師傅4"; targetProp = "staffId4"; }
        else if (grpIdx === 4) { primaryKey = "服務師傅5"; targetProp = "staffId5"; }
        else if (grpIdx === 5) { primaryKey = "服務師傅6"; targetProp = "staffId6"; }
        
        const currentName = current.booking[targetProp] || "";
        const newNameCombined = currentName ? `${currentName}, ${staffId2}` : staffId2;
        const newBooking = { ...current.booking, [targetProp]: newNameCombined };
        const newState = { ...resourceState, [resourceId]: { ...current, booking: newBooking } };
        
        setResourceState(newState);
        const payload = { rowId: current.booking.rowId, [primaryKey]: newNameCombined, forceSync: true };
        await universalSend('/api/update-booking-details', payload);
        await updateResource(newState);
        setSplitData(null);
    };

    const handleStaffChange = async (resId, newStaffId) => {
        const current = resourceState[resId]; if (!current) return;
        setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);
        
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
        
        let primaryKey = "服務師傅1"; let fallbackKey = "ServiceStaff1";
        if (grpIdx === 1) { primaryKey = "服務師傅2"; fallbackKey = "ServiceStaff2"; }
        if (grpIdx === 2) { primaryKey = "服務師傅3"; fallbackKey = "ServiceStaff3"; }
        if (grpIdx === 3) { primaryKey = "服務師傅4"; fallbackKey = "ServiceStaff4"; }
        if (grpIdx === 4) { primaryKey = "服務師傅5"; fallbackKey = "ServiceStaff5"; }
        if (grpIdx === 5) { primaryKey = "服務師傅6"; fallbackKey = "ServiceStaff6"; }
        
        const payload = { rowId: current.booking.rowId, [primaryKey]: newStaffId, [fallbackKey]: newStaffId, [`staff${grpIdx + 1}`]: newStaffId, technician: newStaffId, forceSync: true };
        try { await universalSend('/api/update-booking-details', payload); await updateResource(newState); } catch(e) { console.error("Sync Failed", e); alert("⚠️ Staff Sync Failed! Please check internet."); }
    };

    const handleServiceChange = async (resId, newServiceName) => {
        const current = resourceState[resId]; if (!current) return;
        const newDef = window.SERVICES_DATA[newServiceName]; if (!newDef) return;
        const updatedBooking = { ...current.booking, serviceName: newServiceName, duration: newDef.duration, type: newDef.type, category: newDef.category };
        const newState = { ...resourceState, [resId]: { ...current, booking: updatedBooking } };
        setResourceState(newState);
        await axios.post('/api/update-booking-details', { rowId: current.booking.rowId, serviceName: newServiceName });
        await updateResource(newState);
    };

    const handleOpenEdit = (resId) => {
        const current = resourceState[resId];
        if (!current || !current.booking) return;
        if (current.booking.category !== 'COMBO' && !current.booking.serviceName.includes('套餐')) {
            alert('⚠️ 僅支援調整套餐時間 (Combo Only)');
            return;
        }
        setEditComboTarget({ id: resId, booking: current.booking });
    };

    // --- HANDLE SAVE COMBO TIME (MAJOR UPDATE V102.6: OPTIMISTIC UI) ---
    const handleSaveComboTime = async (newPhase1) => {
        if (!editComboTarget) return;
        const { booking } = editComboTarget;
        const rowId = booking.rowId;
        const totalDuration = parseInt(booking.duration || 100);

        // 1. VALIDATION
        const p1 = parseInt(newPhase1);
        if (isNaN(p1) || p1 <= 0 || p1 >= totalDuration) {
            alert("⚠️ Invalid Phase 1 Duration (Thời gian không hợp lệ)!");
            return;
        }

        const newPhase2 = totalDuration - p1;

        // 2. OPTIMISTIC UI UPDATE
        // Cập nhật State ngay lập tức không cần chờ Server
        // Khoá Sync tạm thời để tránh Server ghi đè dữ liệu cũ trong vài giây
        setSyncLock(true); 
        setTimeout(() => setSyncLock(false), 5000);

        const newState = { ...resourceState };
        Object.keys(newState).forEach(key => {
            const res = newState[key];
            if (res.booking && String(res.booking.rowId) === String(rowId)) {
                newState[key] = {
                    ...res,
                    booking: { 
                        ...res.booking, 
                        phase1_duration: p1, 
                        phase2_duration: newPhase2,
                        isManualLocked: true // Cờ quan trọng để báo cho UI biết đây là manual
                    }
                };
            }
        });

        setResourceState(newState);
        setEditComboTarget(null); // Đóng modal ngay

        // 3. SERVER PAYLOAD
        // Gửi lệnh lên server ở background
        try {
            await axios.post('/api/update-booking-details', { 
                rowId, 
                phase1_duration: p1, 
                phase2_duration: newPhase2, 
                isManualLocked: true // Bắt buộc khoá để server không tự tính lại
            });
            // Gọi sync-resource để server biết trạng thái mới nhất (Optional nhưng an toàn)
            await updateResource(newState);
        } catch(e) { 
            console.error("Save Time Error", e); 
            alert("⚠️ 儲存失敗 (Save Failed)! Please refresh."); 
            // Nếu lỗi, nên refresh lại data để đồng bộ
            fetchData(true);
        }
    };

    const executeStart = (id, comboSequence) => {
        const current = resourceState[id];
        let designatedStaff = current.booking.serviceStaff || current.booking.staffId || current.booking.ServiceStaff || current.booking.technician; 
        if (!designatedStaff || designatedStaff === 'undefined' || designatedStaff === 'null') designatedStaff = '隨機';

        let finalServiceStaff = designatedStaff; 
        let currentId = id; let shouldMove = false; let targetMoveId = null;
        setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);
        
        // ACTION GUARD FOR STRICT SINGLE
        const isStrict = current.booking.isForcedSingle === true;
        
        if (comboSequence && !isStrict) {
            const currentType = id.split('-')[0];
            if (comboSequence === 'BF' && currentType === 'chair') { shouldMove = true; for(let i=1; i<=6; i++) { if(!resourceState[`bed-${i}`]) { targetMoveId = `bed-${i}`; break; } } } 
            else if (comboSequence === 'FB' && currentType === 'bed') { shouldMove = true; for(let i=1; i<=6; i++) { if(!resourceState[`chair-${i}`]) { targetMoveId = `chair-${i}`; break; } } }
        } else if (isStrict) {
            // Safety check: Ensure they are in correct spot
            const type = id.split('-')[0];
            const force = current.booking.forceResourceType === 'CHAIR' ? 'chair' : 'bed';
            if (type !== force) {
                alert(`⚠️ Lỗi vị trí: Khách này bắt buộc phải nằm ở ${force === 'chair' ? 'Ghế' : 'Giường'}!`);
                setSyncLock(false);
                return;
            }
        }
        
        if (shouldMove) { if (!targetMoveId) { alert("⚠️ 無法切換區域: 目標區域已滿!"); return; } currentId = targetMoveId; }
        
        if (['隨機', '男', '女', 'Oil'].some(k => designatedStaff.includes(k))) {
            const liveBusyStaffIds = Object.values(resourceState).filter(r => r.isRunning && !r.isPaused && r.isPreview !== true).map(r => r.booking.serviceStaff || r.booking.staffId || r.booking.ServiceStaff);
            const readyStaff = (staffList||[]).filter(s => { 
                const stat = statusData[s.id]; if (!stat || stat.status !== 'READY') return false;
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
        // Fix Combo Category Logic
        const isComboService = !isStrict && ((current.booking.serviceName && current.booking.serviceName.includes('套餐')) || comboSequence);
        const newBooking = { ...current.booking, category: isComboService ? 'COMBO' : 'SINGLE' };

        if (grpIdx === 0) newBooking.serviceStaff = finalServiceStaff;
        else if (grpIdx === 1) newBooking.staffId2 = finalServiceStaff;
        else if (grpIdx === 2) newBooking.staffId3 = finalServiceStaff;
        else if (grpIdx === 3) newBooking.staffId4 = finalServiceStaff;
        else if (grpIdx === 4) newBooking.staffId5 = finalServiceStaff;
        else if (grpIdx === 5) newBooking.staffId6 = finalServiceStaff;
        
        let comboMeta = current.comboMeta || null;
        if (comboSequence && !isStrict) {
            const currentType = currentId.split('-')[0]; const index = currentId.split('-')[1];
            let ghostTargetId = null; const targetTypePrefix = currentType === 'chair' ? 'bed' : 'chair';
            
            const sameIndex = `${targetTypePrefix}-${index}`;
            if (!resourceState[sameIndex] && sameIndex !== id) { ghostTargetId = sameIndex; } 
            else { 
                for(let i=1; i<=6; i++) { 
                    const tid = `${targetTypePrefix}-${i}`; 
                    if(!resourceState[tid] && tid !== id) { ghostTargetId = tid; break; } 
                } 
            }
            if (!ghostTargetId) ghostTargetId = `${targetTypePrefix}-${index}`;
            comboMeta = { sequence: comboSequence, targetId: ghostTargetId, flex: (current.comboMeta && current.comboMeta.flex) || 0, phase: 1 };
        } else if (isStrict) {
            comboMeta = null;
        }
        
        const newState = { ...resourceState }; if (shouldMove) delete newState[id];
        newState[currentId] = { ...current, booking: newBooking, startTime: new Date().toISOString(), isRunning: true, isPreview: false, comboMeta };
        updateResource(newState);
        
        let primaryKey = "服務師傅1"; let fallbackKey = "ServiceStaff1";
        if (grpIdx === 1) { primaryKey = "服務師傅2"; fallbackKey = "ServiceStaff2"; }
        if (grpIdx === 2) { primaryKey = "服務師傅3"; fallbackKey = "ServiceStaff3"; }
        if (grpIdx === 3) { primaryKey = "服務師傅4"; fallbackKey = "ServiceStaff4"; }
        if (grpIdx === 4) { primaryKey = "服務師傅5"; fallbackKey = "ServiceStaff5"; }
        if (grpIdx === 5) { primaryKey = "服務師傅6"; fallbackKey = "ServiceStaff6"; }
        
        const payload = { rowId: current.booking.rowId, [primaryKey]: finalServiceStaff, [fallbackKey]: finalServiceStaff, [`staff${grpIdx + 1}`]: finalServiceStaff, staffId: designatedStaff };
        universalSend('/api/update-booking-details', payload);
    };

    const handleResourceAction = async (id, action) => {
        const current = resourceState[id]; if (!current) return;
        if (action === 'start') {
            const isStrict = current.booking.isForcedSingle === true;
            const isCombo = !isStrict && (current.booking.category === 'COMBO' || (current.booking.serviceName && current.booking.serviceName.includes('套餐')));
            
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
                if(staffId !== '隨機' && statusData[staffId]) { const newStatus = { ...statusData, [staffId]: { status: 'READY', checkInTime: Date.now() } }; updateStaffStatus(newStatus); }
                delete n[id]; updateResource(n); fetchData();
            }
        }
        else if (action === 'finish') {
            const currentRowId = current.booking.rowId;
            const related = Object.keys(resourceState)
                .filter(k => k !== id && resourceState[k].isRunning)
                .map(k => ({ resourceId: k, booking: resourceState[k].booking }))
                .filter(item => { return item.booking.rowId === currentRowId; });
            setBillingData({ activeItem: { resourceId: id, booking: current.booking }, relatedItems: related });
        }
    };

    const confirmComboStart = (sequence) => { if (comboStartData) { executeStart(comboStartData.id, sequence); setComboStartData(null); } };
    
    // HANDLE SWITCH GUARD
    const handleSwitch = (fromId, toType) => { 
        const currentData = resourceState[fromId]; 
        if(!currentData) return; 

        // Check Strict Type
        const isStrict = currentData.booking.isForcedSingle === true;
        const requiredType = currentData.booking.forceResourceType; // 'CHAIR' or 'BED'
        const targetTypeString = toType === 'chair' ? 'CHAIR' : 'BED';

        if (isStrict && requiredType !== targetTypeString) {
             alert(`⛔️ CHẶN: Dịch vụ này là ${requiredType}, không thể chuyển sang ${targetTypeString}!`);
             return;
        }

        for(let i=1; i<=6; i++) { 
            const targetId = `${toType}-${i}`; 
            if (!resourceState[targetId]) { 
                const newState = { ...resourceState }; 
                delete newState[fromId]; 
                newState[targetId] = currentData; 
                updateResource(newState); 
                return; 
            } 
        } 
        alert(`該區域 (${toType === 'chair' ? '足底區' : '身體區'}) 已無空位!`); 
    };

    const handleToggleMax = async (resId) => { const res = resourceState[resId]; if (!res) return; updateResource({ ...resourceState, [resId]: { ...res, isMaxMode: !res.isMaxMode } }); };
    
    // SEQUENCE TOGGLE GUARD
    const handleToggleSequence = async (resId) => { 
        const res = resourceState[resId]; 
        if (!res || !res.comboMeta) return; 
        if (res.booking.isForcedSingle) return; // Cannot toggle sequence on strict single

        const newSeq = res.comboMeta.sequence === 'FB' ? 'BF' : 'FB'; 
        updateResource({ ...resourceState, [resId]: { ...res, comboMeta: { ...res.comboMeta, sequence: newSeq } } }); 
    }
    
    // Payment Logic
    const handleConfirmPayment = async (itemsToPay, totalAmount) => {
        try {
            setSyncLock(true); setTimeout(() => setSyncLock(false), 5000); 
            const newState = { ...resourceState }; const newStatusData = { ...statusData }; const updatesByRow = {}; 
            const baseTime = Date.now();

            for (let i = 0; i < itemsToPay.length; i++) {
                const item = itemsToPay[i]; const b = item.booking; const rid = String(b.rowId); const resId = item.resourceId;
                let targetIndex = -1; const currentStaff = b.serviceStaff || b.staffId; 
                
                if (currentStaff && currentStaff !== '隨機' && currentStaff !== 'undefined') {
                    const staffCols = [ b.serviceStaff || b.staffId, b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6 ];
                    targetIndex = staffCols.findIndex(s => s && s.trim() === currentStaff.trim());
                }
                if (targetIndex === -1) {
                    const seatNum = parseInt(resId.replace(/\D/g, ''));
                    if (!isNaN(seatNum) && seatNum > 0) targetIndex = Math.min(seatNum - 1, 5); 
                    else targetIndex = 0;
                }

                const statusNum = targetIndex + 1; const statusColEnglish = `Status${statusNum}`; 
                if (!updatesByRow[rid]) { updatesByRow[rid] = { rowId: rid, forceSync: true, originalBooking: b }; }
                updatesByRow[rid][statusColEnglish] = '✅ 完成';
                
                let staffId = null;
                if (targetIndex === 0) staffId = b.serviceStaff || b.staffId;
                else if (targetIndex === 1) staffId = b.staffId2;
                else if (targetIndex === 2) staffId = b.staffId3;
                else if (targetIndex === 3) staffId = b.staffId4;
                else if (targetIndex === 4) staffId = b.staffId5;
                else if (targetIndex === 5) staffId = b.staffId6;

                if (staffId && staffId !== '隨機' && staffId !== 'undefined') { newStatusData[staffId] = { status: 'READY', checkInTime: baseTime + (i * 1000) }; }
                delete newState[resId];
            }

            Object.values(updatesByRow).forEach(updatePayload => {
                const booking = updatePayload.originalBooking;
                const staffCols = [booking.serviceStaff || booking.staffId, booking.staffId2, booking.staffId3, booking.staffId4, booking.staffId5, booking.staffId6];
                let activeSlotsCount = 0; let finishedSlotsCount = 0;
                staffCols.forEach((staffName, idx) => {
                    if (staffName && staffName !== 'undefined' && staffName !== 'null' && staffName.trim() !== '') {
                        activeSlotsCount++;
                        const key = `Status${idx + 1}`;
                        const isNewCompletion = updatePayload[key] && updatePayload[key].includes('完成');
                        const wasAlreadyDone = booking[key] && (booking[key].includes('完成') || booking[key].includes('Done') || booking[key].includes('✅'));
                        if (isNewCompletion || wasAlreadyDone) finishedSlotsCount++;
                    }
                });
                if (activeSlotsCount > 0 && finishedSlotsCount >= activeSlotsCount) { updatePayload.mainStatus = '✅ 完成'; }
                delete updatePayload.originalBooking;
            });
            
            updateResource(newState); updateStaffStatus(newStatusData); setBillingData(null); 
            const apiCalls = Object.values(updatesByRow).map(payload => axios.post('/api/update-booking-details', payload));
            await Promise.all(apiCalls); alert(`✅ 結帳成功: $${totalAmount}`);
        } catch(e) { console.error("Payment Sync Error:", e); alert("⚠️ Lỗi kết nối. Vui lòng kiểm tra mạng!"); }
    };

    const handleWalkInSave = async (data) => { await axios.post('/api/admin-booking', data);  setShowAvailability(false); fetchData(); };
    const handleAssignBooking = (booking) => { if (!selectedSlot) return; updateResource({ ...resourceState, [selectedSlot]: { booking, startTime: null, isRunning: false } }); setSelectedSlot(null); };
    const handleManualUpdateStatus = async (rowId, status) => { if(confirm('確認更新狀態?')) { await axios.post('/api/update-status', { rowId, status }); fetchData(); } };
    const handleRetryConnection = () => { setQuotaError(false); fetchData(true); };

    const getStatus = (id) => statusData[id] ? statusData[id].status : 'AWAY';
    
    // UI Helpers
    const safeStaffList = staffList || [];
    const awayStaff = safeStaffList.filter(s => { const st = getStatus(s.id); return st === 'AWAY' || st === 'OFF'; }).sort(window.sortIdAsc);
    
    const busyStaff = safeStaffList.filter(s => isActuallyBusy(s.id)).sort((a,b) => { 
        const findRes = (sid) => Object.values(resourceState).find(r => r.isRunning && !r.isPaused && r.booking && ( r.booking.serviceStaff === sid || r.booking.staffId === sid || r.booking.staffId2 === sid || r.booking.staffId3 === sid || r.booking.staffId4 === sid || r.booking.staffId5 === sid || r.booking.staffId6 === sid ) );
        const resA = findRes(a.id); const resB = findRes(b.id);
        const timeA = resA?.startTime ? new Date(resA.startTime).getTime() : 0; const timeB = resB?.startTime ? new Date(resB.startTime).getTime() : 0;
        return timeA !== timeB ? timeA - timeB : window.sortIdAsc(a, b);
    });
    
    const readyStaff = safeStaffList.filter(s => { if (isActuallyBusy(s.id)) return false; const st = getStatus(s.id); return st === 'READY' || st === 'EAT' || st === 'OUT_SHORT'; }).sort((a,b) => { const timeA = statusData[a.id]?.checkInTime || 0; const timeB = statusData[b.id]?.checkInTime || 0; return timeA !== timeB ? timeA - timeB : window.sortIdAsc(a, b); });
    
    const readyQueue = readyStaff.filter(s => getStatus(s.id) === 'READY').map(s => s.id);
    const safeBookings = Array.isArray(bookings) ? bookings : [];
    
    const todaysBookings = useMemo(() => {
        return safeBookings.filter(b => window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate));
    }, [bookings, viewDate]);

    const waitingList = todaysBookings.filter(b => !b.status.includes('完成') && !b.status.includes('✅') && b.status === '已預約');

    return (
        <div className="min-h-screen flex flex-col bg-slate-50">
            <header className={`text-white p-3 shadow-md flex justify-between items-center sticky top-0 z-50 transition-colors ${quotaError ? 'bg-red-800' : 'bg-[#1e1b4b]'}`}>
                <div className="flex items-center gap-3">
                    <span className="bg-emerald-500 text-white px-2 py-1 rounded font-black text-sm shadow-sm">V102.6</span>
                    <span className="font-bold hidden md:inline tracking-wider">XinWuChan</span>
                    <div className="flex items-center gap-2 bg-white/10 rounded px-2 py-1 border border-white/20">
                        <button onClick={()=>{const d=new Date(viewDate); d.setDate(d.getDate()-1); setViewDate(d.toISOString().split('T')[0])}} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                        <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} className="bg-transparent text-white font-bold outline-none cursor-pointer text-center" style={{colorScheme: 'dark'}} />
                        <button onClick={()=>{const d=new Date(viewDate); d.setDate(d.getDate()+1); setViewDate(d.toISOString().split('T')[0])}} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={()=>setActiveTab('map')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='map' ? 'bg-blue-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-blue-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-th"></i> <span className="hidden md:inline">平面圖</span></button>
                    <button onClick={()=>setActiveTab('timeline')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='timeline' ? 'bg-purple-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-purple-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-stream"></i> <span className="hidden md:inline">時間軸</span></button>
                    <button onClick={()=>setActiveTab('list')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='list' ? 'bg-cyan-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-cyan-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-list"></i> <span className="hidden md:inline">列表</span></button>
                    <button onClick={()=>setActiveTab('report')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='report' ? 'bg-rose-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-rose-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-chart-line"></i> <span className="hidden md:inline">報告</span></button>
                    <button onClick={()=>setActiveTab('commission')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ml-2 border-l border-white/30 pl-4 ${activeTab==='commission' ? 'bg-indigo-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-indigo-800 text-white/90 opacity-70 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-calculator"></i> <span className="hidden md:inline">節數/薪資</span></button>
                </div>

                <div className="flex gap-2 items-center">
                    <button 
                        onClick={handleForceRefresh} 
                        disabled={isManualRefreshing}
                        className={`px-3 py-1.5 rounded font-bold text-sm flex gap-2 items-center shadow-md transition-all border border-white/20 ${isManualRefreshing ? 'bg-gray-500 cursor-wait opacity-80' : 'bg-teal-600 hover:bg-teal-500 text-white'}`}
                        title="立即從 Google Sheet 重新載入 (Force Refresh)"
                    >
                        <i className={`fas fa-sync-alt ${isManualRefreshing ? 'animate-spin' : ''}`}></i>
                        <span className="hidden lg:inline">{isManualRefreshing ? '載入中...' : '立即刷新'}</span>
                    </button>

                    {quotaError && <button onClick={handleRetryConnection} className="bg-white text-red-600 px-4 py-1.5 rounded font-bold text-sm animate-pulse ml-2"><i className="fas fa-exclamation-triangle"></i> Retry</button>}
                    
                    <button onClick={()=>setShowAvailability(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded font-bold text-sm flex gap-1 items-center shadow-md animate-pulse ml-2"><i className="fas fa-phone-volume"></i> <span className="hidden lg:inline">電話預約</span></button>
                    
                    <button onClick={()=>setShowCheckIn(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-bold text-sm flex gap-1 items-center"><i className="fas fa-user-clock"></i> <span className="hidden lg:inline">技師報到</span></button>
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
                            {readyStaff.map((s, idx) => { const qIdx = readyQueue.indexOf(s.id); return <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} queueIndex={qIdx !== -1 ? qIdx : undefined} />; })}
                        </div>
                    </div>
                </div>
            </div>

            <main className="flex-1 p-4 overflow-y-auto">
                {activeTab === 'map' && (<div className="grid grid-cols-12 gap-6"><div className="col-span-9 space-y-6"><div><h3 className="font-bold text-emerald-600 mb-3 border-b pb-1">足底按摩區 (Foot)</h3><div className="grid grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <window.ResourceCard key={`chair-${i}`} id={`chair-${i}`} type="FOOT" index={i} data={resourceState[`chair-${i}`]} busyStaffIds={busyStaffIds} staffList={staffList} onAction={handleResourceAction} onSelect={()=>setSelectedSlot(`chair-${i}`)} onSwitch={handleSwitch} onToggleMax={handleToggleMax} onToggleSequence={handleToggleSequence} onServiceChange={handleServiceChange} onStaffChange={handleStaffChange} onSplit={(rid)=>setSplitData({resourceId: rid})} getGroupMemberIndex={getGroupMemberIndex} onEdit={handleOpenEdit} />)}</div></div><div><h3 className="font-bold text-purple-600 mb-3 border-b pb-1">身體指壓區 (Body)</h3><div className="grid grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <window.ResourceCard key={`bed-${i}`} id={`bed-${i}`} type="BODY" index={i} data={resourceState[`bed-${i}`]} busyStaffIds={busyStaffIds} staffList={staffList} onAction={handleResourceAction} onSelect={()=>setSelectedSlot(`bed-${i}`)} onSwitch={handleSwitch} onToggleMax={handleToggleMax} onToggleSequence={handleToggleSequence} onServiceChange={handleServiceChange} onStaffChange={handleStaffChange} onSplit={(rid)=>setSplitData({resourceId: rid})} getGroupMemberIndex={getGroupMemberIndex} onEdit={handleOpenEdit} />)}</div></div></div><div className="col-span-3 bg-white rounded-lg shadow p-4 h-fit sticky top-2"><h3 className="font-bold text-gray-700 mb-3">候位名單 ({waitingList.length})</h3><div className="space-y-2 max-h-[500px] overflow-y-auto">{waitingList.map(b => (<div key={b.rowId} className="border p-2 rounded hover:bg-slate-50 relative group bg-white shadow-sm"><div className="flex justify-between font-bold text-sm"><span>{b.customerName}</span><span className="text-indigo-600 font-mono">{(b.startTimeString||' ').split(' ')[1]}</span></div><div className="text-xs text-gray-500 font-bold">{b.serviceName}</div>{(b.isOil || (b.serviceName && b.serviceName.includes('油'))) && <div className="text-[10px] bg-purple-100 text-purple-700 inline-block px-1 rounded mt-1 font-bold border border-purple-200">💧 精油</div>}{b.pax > 1 && <div className="text-[10px] bg-orange-100 text-orange-600 inline-block px-1 rounded mt-1 ml-1 font-bold">{b.pax} 人</div>}{selectedSlot && <button onClick={()=>handleAssignBooking(b)} className="absolute inset-0 bg-green-500/90 text-white font-bold flex items-center justify-center rounded animate-pulse">排入 {selectedSlot}</button>}<button onClick={()=>handleManualUpdateStatus(b.rowId, '❌ Cancelled')} className="absolute top-1 right-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><i className="fas fa-trash"></i></button></div>))}</div></div></div>)}
                {activeTab === 'list' && ( <window.BookingListView bookings={todaysBookings} onCancelBooking={handleManualUpdateStatus} /> )}
                {activeTab === 'timeline' && <TimelineView timelineData={timelineData} />}
                {activeTab === 'report' && <window.ReportView bookings={todaysBookings} />}
                {activeTab === 'commission' && <CommissionView bookings={todaysBookings} staffList={staffList} />}
            </main>
            
            
            {showCheckIn && <window.CheckInBoard staffList={staffList} statusData={statusData} onUpdateStatus={updateStaffStatus} onClose={()=>setShowCheckIn(false)} bookings={todaysBookings} />}
            {showAvailability && <window.AvailabilityCheckModal onClose={()=>setShowAvailability(false)} onSave={handleWalkInSave} staffList={staffList} bookings={bookings} initialDate={viewDate} />}
            {comboStartData && <window.ComboStartModal onConfirm={confirmComboStart} onCancel={()=>setComboStartData(null)} bookingName={comboStartData.booking.serviceName} />}
            {selectedSlot && waitingList.length === 0 && <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center text-white font-bold" onClick={()=>setSelectedSlot(null)}>目前無候位! (No Waiting)</div>}
            {billingData && <window.BillingModal activeItem={billingData.activeItem} relatedItems={billingData.relatedItems} onConfirm={handleConfirmPayment} onCancel={() => setBillingData(null)} />}
            {splitData && <window.SplitStaffModal staffList={staffList} statusData={statusData} onCancel={()=>setSplitData(null)} onConfirm={handleSplitConfirm} />}
            {editComboTarget && <window.ComboTimeEditModal booking={editComboTarget.booking} onConfirm={handleSaveComboTime} onCancel={() => setEditComboTarget(null)} />}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render( <window.ErrorBoundary><App /></window.ErrorBoundary> );
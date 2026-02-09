// TYPE: app.js
// VERSION: V107.0 (SINGLE SOURCE OF TRUTH - SHEET MASTER)
// UPDATE: 2026-02-09
// AUTHOR: AI ASSISTANT & USER
//
// --- CHANGE LOG V107.0 ---
// 1. [CORE] SINGLE SOURCE OF TRUTH (CỘI NGUỒN SỰ THẬT):
//    - Logic cũ: App tin vào ResourceState (RAM) trước, Sheet sau.
//    - Logic mới: App tin tuyệt đối vào trạng thái "Status" trên Google Sheet.
//      + Nếu Sheet ghi "Running" -> App bắt buộc phải vẽ block đỏ (Ngay cả khi server mới khởi động lại).
//      + Nếu Sheet ghi "Done/Cancel" -> App bắt buộc phải xóa block đỏ (Dù RAM đang nhớ là chạy).
//
// 2. [CORE] AUTO-RESURRECTION (CƠ CHẾ HỒI SINH):
//    - Tự động khôi phục các block "Running" bị mất khi tải lại trang dựa trên cột "Location" (Vị trí) đã lưu trong Sheet.
//
// 3. [UPDATE] STATUS SYNC:
//    - Khi bấm Start: Cập nhật ngay Status = "🟡 Running" lên Sheet.
//    - Khi bấm Finish: Cập nhật ngay Status = "✅ Done" lên Sheet.
//

const { useState, useEffect, useMemo, useRef } = React;

// --- 1. COMPONENT IMPORTS ---
const CommissionView = window.CommissionView;
const TimelineView = window.TimelineView;
const BookingListView = window.BookingListView;
const BookingControlModal = window.BookingControlModal || window.ComboTimeEditModal;

// --- MATRIX HELPER ---
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

// --- HELPER: DATA DRIVEN SPLIT ---
const getSmartSplit = (booking, totalDuration, isMaxMode, sequence) => {
    if (booking.phase1_duration !== undefined && booking.phase1_duration !== null && booking.phase1_duration > 0 &&
        booking.phase2_duration !== undefined && booking.phase2_duration !== null) {
        return { 
            phase1: parseInt(booking.phase1_duration), 
            phase2: parseInt(booking.phase2_duration) 
        };
    }
    if (booking.phase1_duration && booking.phase1_duration > 0) {
        const p1 = parseInt(booking.phase1_duration);
        return { phase1: p1, phase2: totalDuration - p1 };
    }
    return window.getComboSplit(totalDuration, isMaxMode, sequence, null);
};

// --- HELPER: NORMALIZE PHONE (For Group Detection) ---
const getNormalizedPhone = (booking) => {
    if (!booking) return "";
    const raw = booking.phone || booking.sdt || booking.custPhone || "";
    return raw.replace(/\D/g, '').slice(-6);
};

// --- V106.2 NEW HELPER: BOOKING SIGNATURE (For Fuzzy Matching) ---
const getBookingSignature = (booking) => {
    if (!booking) return "null";
    const time = (booking.startTimeString || "").split(' ')[1] || "00:00";
    const name = (booking.customerName || "").trim().toLowerCase().replace(/\s+/g, '');
    const phone = getNormalizedPhone(booking).slice(-4); 
    const service = (booking.serviceName || "").substring(0, 3);
    return `${time}_${name}_${phone}`;
};

// --- APP COMPONENT ---
const App = () => {
    // 1. STATE MANAGEMENT
    const [activeTab, setActiveTab] = useState('timeline'); 
    
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
    
    // V102.9: Booking Control Center State
    const [controlCenterData, setControlCenterData] = useState(null);
    
    // V103.0: Payment Branching State
    const [paymentChoiceData, setPaymentChoiceData] = useState(null);

    // V105.2: Start Branching State (Smart Start)
    const [startChoiceData, setStartChoiceData] = useState(null);

    // System States
    const [viewDate, setViewDate] = useState(window.getOperationalDateInputFormat());
    const [syncLock, setSyncLock] = useState(false); 
    const [quotaError, setQuotaError] = useState(false); 
    const [isManualRefreshing, setIsManualRefreshing] = useState(false);

    // 2. HELPER FUNCTIONS
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

    const getLiveResourceByBooking = (rowId) => {
        if (!resourceState) return null;
        const entry = Object.entries(resourceState).find(([key, val]) => {
            return val && val.booking && String(val.booking.rowId) === String(rowId);
        });
        if (entry) {
            return {
                resourceId: entry[0],
                data: entry[1],
                isRunning: entry[1].isRunning,
                isPaused: entry[1].isPaused
            };
        }
        return null;
    };

    const findRelatedActiveBookings = (currentBooking, excludeResourceId) => {
        if (!currentBooking) return [];
        const currentRowId = String(currentBooking.rowId);
        const currentPhone = getNormalizedPhone(currentBooking);

        return Object.keys(resourceState)
            .filter(k => k !== excludeResourceId && resourceState[k].isRunning)
            .map(k => ({ resourceId: k, booking: resourceState[k].booking }))
            .filter(item => {
                const otherBooking = item.booking;
                const otherRowId = String(otherBooking.rowId);
                const otherPhone = getNormalizedPhone(otherBooking);
                
                if (otherRowId === currentRowId) return true;
                if (currentPhone.length >= 4 && currentPhone === otherPhone) return true;
                return false;
            });
    };

    const findRelatedWaitingBookings = (currentBooking, excludeResourceId) => {
        if (!currentBooking) return [];
        const currentRowId = String(currentBooking.rowId);
        const currentPhone = getNormalizedPhone(currentBooking);

        return Object.keys(resourceState)
            .filter(k => k !== excludeResourceId && !resourceState[k].isRunning && resourceState[k].isPreview === true)
            .map(k => ({ resourceId: k, booking: resourceState[k].booking }))
            .filter(item => {
                const otherBooking = item.booking;
                const otherRowId = String(otherBooking.rowId);
                const otherPhone = getNormalizedPhone(otherBooking);
                
                if (otherRowId === currentRowId) return true;
                if (currentPhone.length >= 4 && currentPhone === otherPhone) return true;
                return false;
            });
    };

    const universalSend = async (endpoint, payload) => {
        try { await axios.post(endpoint, payload); } catch(e) { console.log("Universal send check (ignore):", e); }
    };

    // 3. CORE LOGIC (FETCH & RENDER) - REWRITTEN FOR V107.0
    const fetchData = async (isManual = false) => {
        if (syncLock && !isManual) return; 
        if (quotaError && !isManual) return;
        if (isManual) setIsManualRefreshing(true);

        try {
            const endpoint = isManual ? '/api/info?forceRefresh=true' : '/api/info';
            const res = await axios.get(endpoint);
            setQuotaError(false); 
            
            const { bookings: apiBookings, staffList: apiStaff, resourceState: serverRes, staffStatus: serverStaff } = res.data;
            
            // --- A. CLEAN BOOKINGS ---
            const cleanBookings = (apiBookings || []).map(b => {
                let rawFlow = b.flow || null;
                if (rawFlow === 'null' || rawFlow === 'undefined' || rawFlow === '') rawFlow = null;
                if (rawFlow) rawFlow = rawFlow.toUpperCase();

                const p1 = b.phase1_duration ? parseInt(b.phase1_duration) : null;
                const p2 = b.phase2_duration ? parseInt(b.phase2_duration) : null;
                const isLocked = (b.isManualLocked === true || String(b.isManualLocked) === 'TRUE');

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
                    phase1_duration: p1,
                    phase2_duration: p2,
                    flow: rawFlow,
                    isManualLocked: isLocked,
                    originalNote: b.ghiChu || b.note || "",
                    forceResourceType: forceResourceType,
                    isForcedSingle: isForcedSingle,
                    // V107.0: Parse Status for Logic
                    isRunningStatus: (b.status && (b.status.includes('Running') || b.status.includes('服務中') || b.status.includes('running'))),
                    isDoneStatus: (b.status && (b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅') || b.status.includes('Cancel') || b.status.includes('取消'))),
                    storedLocation: b.location || b.current_resource_id // Assume Backend sends this column now
                };
            });

            // Maps for O(1) Lookup
            const bookingMap = new Map();
            cleanBookings.forEach(b => bookingMap.set(String(b.rowId), b));

            const signatureMap = new Map();
            cleanBookings.forEach(b => signatureMap.set(getBookingSignature(b), b));

            const relevantBookings = cleanBookings.filter(b => 
                window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate) && 
                !b.status.includes('Cancel') && !b.status.includes('取消')
            );
            
            setStaffList(apiStaff || []);
            setStatusData(serverStaff || {});

            // --- V107.0: STATE RECONCILIATION ENGINE (TRUTH MACHINE) ---
            let nextResourceState = { ...(serverRes || {}) };
            const activeRowIds = new Set();
            const activeSignatures = new Set(); 

            // STEP 1: PURGE (Xóa những cái đã Done/Cancel trên Sheet nhưng vẫn chạy trên RAM)
            Object.keys(nextResourceState).forEach(key => {
                const res = nextResourceState[key];
                if (res.isRunning && res.booking) {
                    const rowId = String(res.booking.rowId);
                    
                    // Case 1: Booking not found in daily list (Deleted?)
                    // V107.0 Change: If not found, keep it temporarily to avoid flicker, unless explicitly cancelled
                    
                    // Case 2: Booking found, but Status is Done/Cancel
                    if (bookingMap.has(rowId)) {
                        const freshBooking = bookingMap.get(rowId);
                        if (freshBooking.isDoneStatus) {
                            console.log(`[V107.0 PURGE] Removing ${key} because Sheet says DONE`);
                            delete nextResourceState[key];
                            return; // Stop processing this key
                        }
                    }
                }
            });

            // STEP 2: HEAL & UPDATE (Cập nhật thông tin mới nhất cho những cái đang chạy)
            Object.keys(nextResourceState).forEach(key => {
                const res = nextResourceState[key];
                if (res.booking && res.isRunning) {
                    const oldRowId = String(res.booking.rowId);
                    const signature = getBookingSignature(res.booking);
                    let freshData = null;

                    if (bookingMap.has(oldRowId)) {
                        freshData = bookingMap.get(oldRowId);
                        activeRowIds.add(oldRowId);
                    } else if (signatureMap.has(signature)) {
                        freshData = signatureMap.get(signature);
                        console.log(`[V107.0 HEAL] ID Shifted: ${oldRowId} -> ${freshData.rowId}`);
                        res.booking.rowId = String(freshData.rowId); // Update ID
                        activeRowIds.add(String(freshData.rowId));
                    } else {
                        // Orphaned running booking
                        activeRowIds.add(oldRowId);
                        freshData = res.booking;
                    }

                    if (freshData) {
                        res.booking = { ...res.booking, ...freshData }; // Merge fresh data
                        activeSignatures.add(getBookingSignature(freshData));
                    }
                }
            });

            // STEP 3: RESURRECTION (Hồi sinh những cái Sheet "Running" mà RAM quên)
            relevantBookings.forEach(b => {
                if (b.isRunningStatus) {
                    // Check if already running in RAM
                    if (activeRowIds.has(String(b.rowId)) || activeSignatures.has(getBookingSignature(b))) {
                        return; // Already handled
                    }

                    console.log(`[V107.0 RESURRECT] Found orphaned Running booking: ${b.customerName} (ID: ${b.rowId})`);
                    
                    // Attempt to find location
                    let targetResId = null;
                    
                    // Priority 1: Stored Location from Sheet
                    if (b.storedLocation && !nextResourceState[b.storedLocation]) {
                        // Check if valid format (chair-x, bed-x)
                        if (/^(chair|bed)-\d$/.test(b.storedLocation)) {
                            targetResId = b.storedLocation;
                        }
                    }

                    // Priority 2: Auto-allocate if stored location failed
                    if (!targetResId) {
                         const type = (b.forceResourceType === 'BED' || b.flow === 'BODYSINGLE') ? 'bed' : 'chair';
                         // Simple find first free
                         for(let i=1; i<=6; i++) {
                             const tid = `${type}-${i}`;
                             if (!nextResourceState[tid]) { targetResId = tid; break; }
                         }
                    }

                    if (targetResId) {
                        console.log(`[V107.0 RESURRECT] Placing at ${targetResId}`);
                        
                        // Construct the Running State object
                        nextResourceState[targetResId] = {
                            booking: b,
                            isRunning: true,
                            isPaused: false,
                            startTime: new Date().toISOString(), // Approximate start time if missing
                            isPreview: false,
                            isMaxMode: true,
                            comboMeta: null // Can't reconstruct perfectly without more data, assume simple
                        };
                        activeRowIds.add(String(b.rowId));
                        activeSignatures.add(getBookingSignature(b));
                    } else {
                        console.warn(`[V107.0 RESURRECT] Failed to place ${b.customerName} - No slots!`);
                    }
                }
            });

            // --- END V107.0 LOGIC ---

            const nowObj = window.getTaipeiDate();
            const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < 8 ? 1440 : 0);
            
            let tempState = {}; 
            const activeEndTimes = {};
            const timelineGrid = {};

            const addToGrid = (resId, start, end, booking, meta) => {
                if (!timelineGrid[resId]) timelineGrid[resId] = [];
                timelineGrid[resId].push({ start, end, booking, meta });
            };

            // Process Running Blocks
            Object.keys(nextResourceState).forEach(key => {
                if(nextResourceState[key].isRunning) {
                    tempState[key] = nextResourceState[key];
                    const startTime = new Date(nextResourceState[key].startTime);
                    const startMins = startTime.getHours() * 60 + startTime.getMinutes() + (startTime.getHours() < 8 ? 1440 : 0);
                    
                    const b = nextResourceState[key].booking;
                    let durationUsed = b.duration;
                    let isPhase1 = false;
                    const isStrictSingle = b.isForcedSingle === true; 

                    if (nextResourceState[key].comboMeta && !isStrictSingle) {
                        const seq = nextResourceState[key].comboMeta.sequence || 'FB';
                        const isMax = nextResourceState[key].isMaxMode;
                        const split = getSmartSplit(b, b.duration, isMax, seq);
                        isPhase1 = (seq === 'FB' && key.includes('chair')) || (seq === 'BF' && key.includes('bed'));
                        if (isPhase1) durationUsed = split.phase1 + (nextResourceState[key].comboMeta.flex || 0);
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
                        isRunning: true,
                        priority: 1
                    });
                }
            });

            // Process Predictions (Combo Phase 2)
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
                                isCombo: true, phase: 2, sequence: seq, originId: key, isPrediction: true, priority: 2 
                            });
                        }
                    }
                }
            });

            // Process Pending (Waiting)
            const pendingBookings = relevantBookings.filter(b => {
                if (b.isDoneStatus) return false; // Check Done
                if (b.isRunningStatus) return false; // Check Running (Should be in RAM now)
                if (activeRowIds.has(String(b.rowId))) return false; // Safety Check
                if (activeSignatures.has(getBookingSignature(b))) return false;
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

            // Add Pending Singles
            listSingles.forEach(b => {
                if (activeRowIds.has(String(b.rowId))) return;
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
                    if (slotId) { 
                        addToGrid(slotId, tryStart, tryEnd, b, { isCombo: false, isPending: true, priority: 3 }); 
                        break; 
                    }
                }
            });

            // Add Pending Combos
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
                    if (activeRowIds.has(String(bookingItem.rowId))) return;

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
                                addToGrid(s1, tryStart, p1End, bookingItem, { isCombo: true, phase: 1, sequence: seq, targetId: s2, isPending: true, priority: 3 });
                                addToGrid(s2, p2Start, p2End, bookingItem, { isCombo: true, phase: 2, sequence: seq, isPending: true, priority: 3 });
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

            // Populate Preview/Ghosts
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
            
            // --- SYNC RESULT ---
            if (!syncLock) {
                setResourceState(tempState);
                setBookings(cleanBookings); // Keep filtered list for View but we need clean bookings for logic
            }
            
        } catch(e) { 
            console.error("API Error", e);
            if (e.response && e.response.status === 429) setQuotaError(true);
        } finally {
            if (isManual) setIsManualRefreshing(false);
        }
    };

    useEffect(() => { 
        fetchData(false); 
        const t = setInterval(() => fetchData(false), 2000); 
        return () => clearInterval(t); 
    }, [viewDate, syncLock, quotaError]); 

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
        handleOpenControlCenter(current.booking);
    };

    const handleSaveComboTime = async (arg1, arg2 = null) => {
        let newPhase1Duration = 0;
        let targetBooking = null;

        if (typeof arg1 === 'number' || (typeof arg1 === 'string' && !isNaN(arg1))) {
            newPhase1Duration = parseInt(arg1, 10);
            targetBooking = arg2 ? arg2 : (controlCenterData ? controlCenterData.booking : null);
        }
        else if (typeof arg1 === 'object' && arg1 !== null) {
            targetBooking = arg1;
            newPhase1Duration = parseInt(arg2, 10);
        }

        if (!targetBooking) { console.error("Missing booking context"); return; }

        const rowId = String(targetBooking.rowId);
        const totalDuration = parseInt(targetBooking.duration || 100);

        if (isNaN(newPhase1Duration) || newPhase1Duration <= 0 || newPhase1Duration >= totalDuration) {
            alert(`⚠️ Thời gian Phase 1 không hợp lệ!`);
            return;
        }

        const newPhase2Duration = totalDuration - newPhase1Duration;

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
                        phase1_duration: newPhase1Duration, 
                        phase2_duration: newPhase2Duration, 
                        isManualLocked: true 
                    }
                };
            }
        });

        setResourceState(newState);
        if (!arg2 && controlCenterData) setControlCenterData(null);

        try {
            await axios.post('/api/update-booking-details', { 
                rowId, 
                phase1_duration: newPhase1Duration, 
                phase2_duration: newPhase2Duration, 
                isManualLocked: true, 
                forceSync: true 
            });
            await updateResource(newState);
        } catch(e) { 
            console.error("Save Time Error", e); 
            alert("⚠️ 儲存失敗 (Save Failed)!"); 
            fetchData(true);
        }
    };

    // --- V106.1 NEW FEATURE: VERTICAL RESOURCE SHIFT ---
    const handleVerticalResourceShift = async (currentResId, direction) => {
        if (!currentResId) return;

        const parts = currentResId.split('-');
        const type = parts[0];
        const index = parseInt(parts[1], 10);
        if (isNaN(index)) return;

        const newIndex = index + direction;
        if (newIndex < 1 || newIndex > 6) { console.warn("Shift blocked: Out of boundary"); return; }

        const targetId = `${type}-${newIndex}`;
        const targetSlot = resourceState[targetId];
        if (targetSlot && (targetSlot.isRunning || (targetSlot.booking && !targetSlot.isPreview))) {
            alert(`⚠️ Vị trí ${type === 'chair' ? 'Ghế' : 'Giường'} số ${newIndex} đang bận! Không thể chuyển.`);
            return;
        }

        setSyncLock(true);
        setTimeout(() => setSyncLock(false), 4000);

        const currentSlotData = resourceState[currentResId];
        if (!currentSlotData) return;

        const newState = { ...resourceState };
        delete newState[currentResId];
        newState[targetId] = currentSlotData;

        setResourceState(newState);

        try {
            await universalSend('/api/update-booking-details', {
                rowId: currentSlotData.booking.rowId,
                current_resource_id: targetId,
                record_location: true,
                forceSync: true
            });
            await updateResource(newState);
        } catch (e) {
            console.error("Vertical Shift Error:", e);
            alert("⚠️ Lỗi kết nối khi chuyển vị trí!");
            fetchData(true); 
        }
    };

    // --- EXECUTE START (SINGLE MODE) - V107.0 UPDATED ---
    const executeStart = (id, comboSequence, silentMode = false, fallbackBooking = null) => {
        let current = resourceState[id];

        if (!current && fallbackBooking) {
            console.log(`[HOT START] Injecting Mock Object for ${id}`);
            current = {
                booking: fallbackBooking,
                isRunning: false,
                isPaused: false,
                startTime: null,
                isPreview: true, 
                isMaxMode: true,
                comboMeta: null
            };
        }

        if (!current) { 
            if(!silentMode) alert("⚠️ Lỗi hệ thống: Không tìm thấy dữ liệu vị trí."); 
            return; 
        }

        if (current.isRunning) {
             if(!silentMode) alert(`⚠️ Vị trí ${id} đang bận (Running)!`);
             return;
        }

        let designatedStaff = current.booking.serviceStaff || current.booking.staffId || current.booking.ServiceStaff || current.booking.technician; 
        if (!designatedStaff || designatedStaff === 'undefined' || designatedStaff === 'null') designatedStaff = '隨機';

        let finalServiceStaff = designatedStaff; 
        let currentId = id; 
        let shouldMove = false; 
        let targetMoveId = null;
        
        setSyncLock(true); 
        setTimeout(() => setSyncLock(false), 5000);
        
        const isStrict = current.booking.isForcedSingle === true;
        
        // Move Logic
        if (comboSequence && !isStrict) {
            const currentType = id.split('-')[0];
            if (comboSequence === 'BF' && currentType === 'chair') { 
                shouldMove = true; 
                for(let i=1; i<=6; i++) { 
                    if(!resourceState[`bed-${i}`] || !resourceState[`bed-${i}`].isRunning) { targetMoveId = `bed-${i}`; break; } 
                } 
            } 
            else if (comboSequence === 'FB' && currentType === 'bed') { 
                shouldMove = true; 
                for(let i=1; i<=6; i++) { 
                    if(!resourceState[`chair-${i}`] || !resourceState[`chair-${i}`].isRunning) { targetMoveId = `chair-${i}`; break; } 
                } 
            }
        } else if (isStrict) {
            const type = id.split('-')[0];
            const force = current.booking.forceResourceType === 'CHAIR' ? 'chair' : 'bed';
            if (type !== force) {
                if(!silentMode) alert(`⚠️ Lỗi vị trí: Khách này bắt buộc phải nằm ở ${force === 'chair' ? 'Ghế' : 'Giường'}!`);
                setSyncLock(false);
                return;
            }
        }
        
        if (shouldMove) { 
            if (!targetMoveId) { 
                if(!silentMode) alert("⚠️ Không thể bắt đầu: Khu vực đích đã hết chỗ trống!"); 
                setSyncLock(false); return; 
            } 
            currentId = targetMoveId; 
        }
        
        // Staff Selection
        if (['隨機', '男', '女', 'Oil'].some(k => designatedStaff.includes(k))) {
            if (!staffList || staffList.length === 0) {
                 if(!silentMode) alert("⚠️ Dữ liệu nhân viên trống. Vui lòng thử lại sau vài giây!");
                 setSyncLock(false); return;
            }

            const liveBusyStaffIds = Object.values(resourceState)
                .filter(r => r.isRunning && !r.isPaused && r.isPreview !== true)
                .map(r => r.booking.serviceStaff || r.booking.staffId || r.booking.ServiceStaff);
                
            const readyStaff = staffList.filter(s => { 
                const stat = statusData ? statusData[s.id] : null; 
                if (!stat || stat.status !== 'READY') return false;
                if (liveBusyStaffIds.includes(s.id)) return false;
                return true;
            });

            let candidates = readyStaff;
            if (designatedStaff.includes('男') || designatedStaff.includes('Male')) {
                candidates = candidates.filter(s => s.gender === 'M' || s.gender === '男');
            } else if (designatedStaff.includes('女') || designatedStaff.includes('Female') || current.booking.isOil) {
                candidates = candidates.filter(s => s.gender === 'F' || s.gender === '女');
            }
            candidates.sort((a,b) => (statusData[a.id]?.checkInTime||0) - (statusData[b.id]?.checkInTime||0));
            
            if (candidates.length === 0) { 
                const genderMsg = designatedStaff.includes('男') ? " (NAM)" : designatedStaff.includes('女') ? " (NỮ)" : "";
                if(!silentMode) alert(`⚠️ Không có kỹ thuật viên${genderMsg} nào đang rảnh (READY)!`); 
                setSyncLock(false); return; 
            }
            finalServiceStaff = candidates[0].id;
        }

        // Update Status
        const newStatusData = { ...statusData, [finalServiceStaff]: { ...statusData[finalServiceStaff], status: 'BUSY' } };
        updateStaffStatus(newStatusData); 
        
        const grpIdx = getGroupMemberIndex(currentId, current.booking.rowId);
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
            else { for(let i=1; i<=6; i++) { const tid = `${targetTypePrefix}-${i}`; if(!resourceState[tid] && tid !== id) { ghostTargetId = tid; break; } } }
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
        
        // V107.0: Send Status 'Running' explicit via payload
        const payload = { 
            rowId: current.booking.rowId, 
            [primaryKey]: finalServiceStaff, 
            [fallbackKey]: finalServiceStaff, 
            [`staff${grpIdx + 1}`]: finalServiceStaff, 
            staffId: designatedStaff,
            current_resource_id: currentId,
            record_location: true,
            status: '🟡 Running' // V107.0: Force Status Update in Sheet
        };
        universalSend('/api/update-booking-details', payload);
        // Backup call just in case
        axios.post('/api/update-status', { rowId: current.booking.rowId, status: '🟡 Running' });
    };

    // --- V105.3: BATCH EXECUTION LOGIC (UPDATED V107.0) ---
    const executeBatchStart = (mainResId, relatedItems) => {
        const nextResourceState = { ...resourceState };
        const nextStatusData = { ...statusData };
        const apiPayloads = [];
        
        const allItemsToStart = [
            { resourceId: mainResId, booking: resourceState[mainResId] ? resourceState[mainResId].booking : null }, 
            ...relatedItems 
        ];

        setSyncLock(true); 
        setTimeout(() => setSyncLock(false), 5000);

        allItemsToStart.forEach(item => {
            const { resourceId } = item;
            let current = nextResourceState[resourceId];
            if (!current) {
                if (item.booking) {
                    current = {
                        booking: item.booking,
                        isRunning: false,
                        isPaused: false,
                        startTime: null,
                        isPreview: true,
                        isMaxMode: true,
                        comboMeta: null
                    };
                    nextResourceState[resourceId] = current; 
                } else { return; }
            }
            
            if (current.isRunning) return; 

            let designatedStaff = current.booking.serviceStaff || current.booking.staffId || current.booking.ServiceStaff || '隨機';
            if (designatedStaff === 'undefined' || designatedStaff === 'null') designatedStaff = '隨機';

            let finalServiceStaff = designatedStaff;
            
            if (['隨機', '男', '女', 'Oil'].some(k => designatedStaff.includes(k))) {
                 const currentlyBusyIds = Object.values(nextResourceState)
                    .filter(r => r.isRunning && !r.isPaused && r.isPreview !== true)
                    .map(r => r.booking.serviceStaff || r.booking.staffId);
                
                 const readyCandidates = staffList.filter(s => {
                     const stat = nextStatusData[s.id];
                     if (!stat || stat.status !== 'READY') return false;
                     if (currentlyBusyIds.includes(s.id)) return false;
                     
                     if (designatedStaff.includes('男') || designatedStaff.includes('Male')) {
                        if (s.gender !== 'M' && s.gender !== '男') return false;
                     }
                     if (designatedStaff.includes('女') || designatedStaff.includes('Female') || current.booking.isOil) {
                        if (s.gender !== 'F' && s.gender !== '女') return false;
                     }
                     return true;
                 });
                 
                 readyCandidates.sort((a,b) => (nextStatusData[a.id]?.checkInTime||0) - (nextStatusData[b.id]?.checkInTime||0));

                 if (readyCandidates.length > 0) {
                     finalServiceStaff = readyCandidates[0].id;
                     nextStatusData[finalServiceStaff] = { ...nextStatusData[finalServiceStaff], status: 'BUSY' };
                 } else {
                     return; 
                 }
            } else {
                if (nextStatusData[finalServiceStaff]) {
                     nextStatusData[finalServiceStaff] = { ...nextStatusData[finalServiceStaff], status: 'BUSY' };
                }
            }

            const grpIdx = getGroupMemberIndex(resourceId, current.booking.rowId);
            const isComboService = (current.booking.serviceName && current.booking.serviceName.includes('套餐'));
            const newBooking = { ...current.booking, category: isComboService ? 'COMBO' : 'SINGLE' };
            
            if (grpIdx === 0) newBooking.serviceStaff = finalServiceStaff;
            else if (grpIdx === 1) newBooking.staffId2 = finalServiceStaff;
            else if (grpIdx === 2) newBooking.staffId3 = finalServiceStaff;
            else if (grpIdx === 3) newBooking.staffId4 = finalServiceStaff;
            else if (grpIdx === 4) newBooking.staffId5 = finalServiceStaff;
            else if (grpIdx === 5) newBooking.staffId6 = finalServiceStaff;

            nextResourceState[resourceId] = {
                ...current,
                booking: newBooking,
                startTime: new Date().toISOString(),
                isRunning: true,
                isPreview: false,
                comboMeta: current.comboMeta 
            };

            let primaryKey = "服務師傅1"; let fallbackKey = "ServiceStaff1";
            if (grpIdx === 1) { primaryKey = "服務師傅2"; fallbackKey = "ServiceStaff2"; }
            else if (grpIdx === 2) { primaryKey = "服務師傅3"; fallbackKey = "ServiceStaff3"; }
            else if (grpIdx === 3) { primaryKey = "服務師傅4"; fallbackKey = "ServiceStaff4"; }
            else if (grpIdx === 4) { primaryKey = "服務師傅5"; fallbackKey = "ServiceStaff5"; }
            else if (grpIdx === 5) { primaryKey = "服務師傅6"; fallbackKey = "ServiceStaff6"; }

            apiPayloads.push({
                endpoint: '/api/update-booking-details',
                data: { 
                    rowId: current.booking.rowId, 
                    [primaryKey]: finalServiceStaff, 
                    [fallbackKey]: finalServiceStaff, 
                    [`staff${grpIdx + 1}`]: finalServiceStaff, 
                    staffId: designatedStaff,
                    current_resource_id: resourceId, 
                    record_location: true,
                    status: '🟡 Running' // V107.0
                }
            });
            // Backup
            apiPayloads.push({
                 endpoint: '/api/update-status',
                 data: { rowId: current.booking.rowId, status: '🟡 Running' }
            });
        });

        setResourceState(nextResourceState);
        updateStaffStatus(nextStatusData); 
        apiPayloads.forEach(p => universalSend(p.endpoint, p.data));
        universalSend('/api/sync-resource', nextResourceState);
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
                await axios.post('/api/update-status', { rowId: current.booking.rowId, status: '❌ Cancelled' });
                const n = { ...resourceState };
                const staffId = current.booking.serviceStaff || current.booking.staffId;
                if(staffId !== '隨機' && statusData[staffId]) { const newStatus = { ...statusData, [staffId]: { status: 'READY', checkInTime: Date.now() } }; updateStaffStatus(newStatus); }
                delete n[id]; updateResource(n); fetchData();
            }
        }
        else if (action === 'finish') {
            const currentRowId = current.booking.rowId;
            const related = findRelatedActiveBookings(current.booking, id);
            
            if (related.length > 0) {
                console.log("Group detected:", related);
                setPaymentChoiceData({
                    resourceId: id,
                    booking: current.booking,
                    relatedIds: related.map(r => r.resourceId),
                    relatedDetails: related 
                });
            } else {
                setBillingData({ activeItem: { resourceId: id, booking: current.booking }, relatedItems: [] });
            }
        }
    };

    const confirmComboStart = (sequence) => { if (comboStartData) { executeStart(comboStartData.id, sequence); setComboStartData(null); } };
    
    const handleSwitch = (fromId, toType) => { 
        const currentData = resourceState[fromId]; 
        if(!currentData) return; 
        const isStrict = currentData.booking.isForcedSingle === true;
        const requiredType = currentData.booking.forceResourceType;
        const targetTypeString = toType === 'chair' ? 'CHAIR' : 'BED';

        if (isStrict && requiredType !== targetTypeString) { alert(`⛔️ CHẶN: Dịch vụ này là ${requiredType}, không thể chuyển sang ${targetTypeString}!`); return; }

        for(let i=1; i<=6; i++) { 
            const targetId = `${toType}-${i}`; 
            if (!resourceState[targetId]) { 
                const newState = { ...resourceState }; delete newState[fromId]; newState[targetId] = currentData; 
                updateResource(newState); 
                universalSend('/api/update-booking-details', {
                    rowId: currentData.booking.rowId,
                    current_resource_id: targetId, 
                    record_location: true,
                    forceSync: true
                });
                return; 
            } 
        } 
        alert(`該區域 (${toType === 'chair' ? '足底區' : '身體區'}) 已無空位!`); 
    };

    const handleToggleMax = async (resId) => { const res = resourceState[resId]; if (!res) return; updateResource({ ...resourceState, [resId]: { ...res, isMaxMode: !res.isMaxMode } }); };
    
    const handleToggleSequence = async (resId) => { 
        const res = resourceState[resId]; 
        if (!res || !res.comboMeta) return; 
        if (res.booking.isForcedSingle) return; 
        const newSeq = res.comboMeta.sequence === 'FB' ? 'BF' : 'FB'; 
        updateResource({ ...resourceState, [resId]: { ...res, comboMeta: { ...res.comboMeta, sequence: newSeq } } }); 
    }
    
    // --- V107.0: PAYMENT & STATUS UPDATE ---
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
                
                // V107.0: Remove from local state
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
                // V107.0: If all done, update MAIN STATUS to DONE
                if (activeSlotsCount > 0 && finishedSlotsCount >= activeSlotsCount) { 
                    updatePayload.mainStatus = '✅ 完成'; 
                    // Explicitly update status for Sheet Truth
                    updatePayload.status = '✅ Done';
                }
                delete updatePayload.originalBooking;
            });
            
            updateResource(newState); updateStaffStatus(newStatusData); setBillingData(null); 
            const apiCalls = Object.values(updatesByRow).map(payload => axios.post('/api/update-booking-details', payload));
            // Backup
            Object.values(updatesByRow).forEach(p => {
                 if (p.status) axios.post('/api/update-status', { rowId: p.rowId, status: p.status });
            });
            await Promise.all(apiCalls); alert(`✅ 結帳成功: $${totalAmount}`);
        } catch(e) { console.error("Payment Sync Error:", e); alert("⚠️ Lỗi kết nối. Vui lòng kiểm tra mạng!"); }
    };

    // --- V103.0: BOOKING CONTROL CENTER & PAYMENT BRANCHING ---
    const handleOpenControlCenter = (bookingOrId, suggestedResourceId = null) => {
        let bookingObj = bookingOrId;
        if (typeof bookingOrId === 'string' || typeof bookingOrId === 'number') {
            const found = bookings.find(b => String(b.rowId) === String(bookingOrId));
            if (!found) return;
            bookingObj = found;
        }

        const liveContext = getLiveResourceByBooking(bookingObj.rowId);
        
        setControlCenterData({
            booking: bookingObj,
            liveState: liveContext ? liveContext.data : null,
            resourceId: liveContext ? liveContext.resourceId : suggestedResourceId,
            isRunning: liveContext ? liveContext.isRunning : false,
            isPaused: liveContext ? liveContext.isPaused : false
        });
    };

    const handleControlAction = (actionType, payload) => {
        const targetBooking = payload.currentBooking || (controlCenterData ? controlCenterData.booking : null);
        const targetResourceId = payload.resourceId || (controlCenterData ? controlCenterData.resourceId : null);

        console.log("App.handleControlAction V107.0:", actionType, payload);

        switch (actionType) {
            case 'START':
                if (targetResourceId) {
                    if (resourceState[targetResourceId] && resourceState[targetResourceId].isRunning) {
                         alert(`⚠️ Vị trí ${targetResourceId} đang bận! Vui lòng chọn ghế khác.`);
                    } else {
                        const relatedWaiters = findRelatedWaitingBookings(targetBooking, targetResourceId);

                        if (relatedWaiters.length > 0) {
                            console.log("Smart Start Guard: Found related waiters", relatedWaiters);
                            setStartChoiceData({
                                resourceId: targetResourceId,
                                booking: targetBooking,
                                relatedDetails: relatedWaiters
                            });
                        } else {
                            executeStart(targetResourceId, null, false, targetBooking);
                        }
                    }
                } else {
                    alert("⚠️ Vui lòng kéo đơn này vào giường/ghế trước khi bắt đầu!");
                }
                setControlCenterData(null); 
                break;
            
            case 'PAUSE':
                if (targetResourceId) handleResourceAction(targetResourceId, 'pause');
                setControlCenterData(null);
                break;
                
            case 'FINISH':
                if (targetResourceId && targetBooking) {
                    const related = findRelatedActiveBookings(targetBooking, targetResourceId);
                    if (related.length > 0) {
                        setPaymentChoiceData({
                            resourceId: targetResourceId,
                            booking: targetBooking,
                            relatedIds: related.map(r => r.resourceId),
                            relatedDetails: related
                        });
                    } else {
                        handleProcessPaymentChoice('INDIVIDUAL');
                    }
                }
                setControlCenterData(null);
                break;
                
            case 'CANCEL':
                if (targetResourceId) handleResourceAction(targetResourceId, 'cancel_midway');
                else if (targetBooking) handleManualUpdateStatus(targetBooking.rowId, '❌ Cancelled');
                setControlCenterData(null);
                break;
                
            case 'SPLIT':
                if (targetResourceId) setSplitData({ resourceId: targetResourceId });
                setControlCenterData(null);
                break;

            case 'UPDATE_SERVICE':
                if (targetResourceId && payload.newService) {
                    handleServiceChange(targetResourceId, payload.newService);
                }
                setControlCenterData(null);
                break;

            case 'UPDATE_PHASE':
                if (targetBooking && payload.phase1) {
                    handleSaveComboTime(payload.phase1, targetBooking);
                }
                setControlCenterData(null);
                break;
            
            case 'TOGGLE_SEQUENCE':
                if (targetResourceId) {
                    handleToggleSequence(targetResourceId);
                }
                setControlCenterData(null);
                break;

            case 'SHIFT_RESOURCE':
            case 'SHIFT_TIME': 
                const direction = payload.direction || 1; 
                if (targetResourceId) {
                    handleVerticalResourceShift(targetResourceId, direction);
                }
                break;

            default:
                console.warn("Unknown Control Action:", actionType);
        }
    };

    const handleProcessPaymentChoice = (mode) => {
        let activeResId, activeBooking;
        
        if (paymentChoiceData) {
            activeResId = paymentChoiceData.resourceId;
            activeBooking = paymentChoiceData.booking;
        } 
        else if (controlCenterData) {
            activeResId = controlCenterData.resourceId;
            activeBooking = controlCenterData.booking;
        }

        if (!activeResId || !activeBooking) return;

        if (mode === 'SEPARATE' || mode === 'INDIVIDUAL') {
            setBillingData({ 
                activeItem: { resourceId: activeResId, booking: activeBooking }, 
                relatedItems: [] 
            });
        } else {
            const related = findRelatedActiveBookings(activeBooking, activeResId);
            setBillingData({ 
                activeItem: { resourceId: activeResId, booking: activeBooking }, 
                relatedItems: related 
            });
        }
        setPaymentChoiceData(null);
    };

    const handleProcessStartChoice = (mode) => {
        if (!startChoiceData) return;
        const { resourceId, relatedDetails } = startChoiceData;

        if (mode === 'GROUP') {
            executeBatchStart(resourceId, relatedDetails);
        } else {
            executeStart(resourceId, null, false, startChoiceData.booking);
        }

        setStartChoiceData(null);
    };

    const handleWalkInSave = async (data) => { await axios.post('/api/admin-booking', data);  setShowAvailability(false); fetchData(); };
    const handleAssignBooking = (booking) => { if (!selectedSlot) return; updateResource({ ...resourceState, [selectedSlot]: { booking, startTime: null, isRunning: false } }); setSelectedSlot(null); };
    const handleManualUpdateStatus = async (rowId, status) => { if(confirm('確認更新狀態?')) { await axios.post('/api/update-status', { rowId, status }); fetchData(); } };
    const handleRetryConnection = () => { setQuotaError(false); fetchData(true); };

    const getStatus = (id) => statusData[id] ? statusData[id].status : 'AWAY';
    
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
                    <span className="bg-emerald-500 text-white px-2 py-1 rounded font-black text-sm shadow-sm">V107.0</span>
                    <span className="font-bold hidden md:inline tracking-wider">XinWuChan</span>
                    <div className="flex items-center gap-2 bg-white/10 rounded px-2 py-1 border border-white/20">
                        <button onClick={()=>{const d=new Date(viewDate); d.setDate(d.getDate()-1); setViewDate(d.toISOString().split('T')[0])}} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                        <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} className="bg-transparent text-white font-bold outline-none cursor-pointer text-center" style={{colorScheme: 'dark'}} />
                        <button onClick={()=>{const d=new Date(viewDate); d.setDate(d.getDate()+1); setViewDate(d.toISOString().split('T')[0])}} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={()=>setActiveTab('timeline')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='timeline' ? 'bg-purple-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-purple-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-stream"></i> <span className="hidden md:inline">時間軸 (Timeline)</span></button>
                    <button onClick={()=>setActiveTab('list')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='list' ? 'bg-cyan-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-cyan-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-list"></i> <span className="hidden md:inline">列表 (List)</span></button>
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
                {activeTab === 'list' && ( <window.BookingListView bookings={todaysBookings} onCancelBooking={handleManualUpdateStatus} /> )}
                
                {activeTab === 'timeline' && (
                    <TimelineView 
                        timelineData={timelineData} 
                        liveStatusData={resourceState}
                        onEditPhase={handleControlAction}
                    />
                )}
            </main>
            
            {showCheckIn && <window.CheckInBoard staffList={staffList} statusData={statusData} onUpdateStatus={updateStaffStatus} onClose={()=>setShowCheckIn(false)} bookings={todaysBookings} />}
            {showAvailability && <window.AvailabilityCheckModal onClose={()=>setShowAvailability(false)} onSave={handleWalkInSave} staffList={staffList} bookings={bookings} initialDate={viewDate} />}
            {comboStartData && <window.ComboStartModal onConfirm={confirmComboStart} onCancel={()=>setComboStartData(null)} bookingName={comboStartData.booking.serviceName} />}
            
            {selectedSlot && waitingList.length === 0 && <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center text-white font-bold" onClick={()=>setSelectedSlot(null)}>目前無候位! (No Waiting)</div>}
            
            {billingData && <window.BillingModal activeItem={billingData.activeItem} relatedItems={billingData.relatedItems} onConfirm={handleConfirmPayment} onCancel={() => setBillingData(null)} />}
            
            {splitData && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10005, pointerEvents: 'none' }}>
                    <div style={{ pointerEvents: 'auto', width: '100%', height: '100%' }}>
                        <window.SplitStaffModal staffList={staffList} statusData={statusData} onCancel={()=>setSplitData(null)} onConfirm={handleSplitConfirm} />
                    </div>
                </div>
            )}
            
            {paymentChoiceData && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-[450px] overflow-hidden animate-slide-up border border-slate-200">
                        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-4 text-white">
                            <h3 className="text-xl font-bold flex items-center">
                                <i className="fas fa-cash-register mr-2"></i>
                                結帳方式選擇
                            </h3>
                            <p className="text-indigo-100 text-sm mt-1 opacity-90">系統檢測到關聯訂單 (Group Detected)</p>
                        </div>
                        <div className="p-6">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-5">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-bold text-blue-800 text-sm">主客 (Main Guest):</span>
                                    <span className="font-bold text-slate-800">{paymentChoiceData.booking.customerName}</span>
                                </div>
                                <div className="border-t border-blue-200 my-2"></div>
                                <div className="text-xs text-blue-600 font-bold mb-2">關聯床位 (Related Seats) - {paymentChoiceData.relatedIds.length} 位:</div>
                                <div className="flex flex-wrap gap-2">
                                    {paymentChoiceData.relatedIds.map(rid => (
                                        <span key={rid} className="bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded text-xs font-mono font-bold shadow-sm">
                                            {rid.replace('bed-', '床 ').replace('chair-', '足 ')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-3">
                                <button 
                                    onClick={() => handleProcessPaymentChoice('COMBINED')}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-lg font-bold flex items-center justify-center gap-3 transition-colors shadow-lg shadow-indigo-200 group"
                                >
                                    <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform"><i className="fas fa-users"></i></div>
                                    <div className="text-left">
                                        <div className="text-sm leading-tight">合併結帳 (Pay All)</div>
                                        <div className="text-[10px] opacity-80 font-normal">總共 {paymentChoiceData.relatedIds.length + 1} 位</div>
                                    </div>
                                </button>
                                <button 
                                    onClick={() => handleProcessPaymentChoice('SEPARATE')}
                                    className="w-full bg-white border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 py-3.5 rounded-lg font-bold flex items-center justify-center gap-3 transition-all group"
                                >
                                    <div className="bg-slate-100 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 group-hover:text-indigo-600 group-hover:bg-indigo-100 transition-colors"><i className="fas fa-user"></i></div>
                                    <div className="text-left">
                                        <div className="text-sm leading-tight">分開結帳 (Pay Individual)</div>
                                        <div className="text-[10px] opacity-80 font-normal">僅結算此位</div>
                                    </div>
                                </button>
                            </div>
                            <button onClick={() => setPaymentChoiceData(null)} className="w-full mt-6 text-gray-400 hover:text-gray-600 font-bold text-xs uppercase tracking-wider text-center">關閉 / 返回</button>
                        </div>
                    </div>
                </div>
            )}

            {startChoiceData && (
                <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-[450px] overflow-hidden animate-slide-up border border-slate-200">
                        <div className="bg-gradient-to-r from-emerald-600 to-green-600 p-4 text-white">
                            <h3 className="text-xl font-bold flex items-center">
                                <i className="fas fa-play-circle mr-2"></i>
                                啟動確認 (Start)
                            </h3>
                            <p className="text-emerald-100 text-sm mt-1 opacity-90">發現同組客人 (Group Detected)</p>
                        </div>
                        <div className="p-6">
                            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 mb-5">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-bold text-emerald-800 text-sm">主客 (Main):</span>
                                    <span className="font-bold text-slate-800">{startChoiceData.booking.customerName}</span>
                                </div>
                                <div className="border-t border-emerald-200 my-2"></div>
                                <div className="text-xs text-emerald-600 font-bold mb-2">
                                    Tìm thấy {startChoiceData.relatedDetails.length} người đi cùng (Tổng nhóm: {startChoiceData.relatedDetails.length + 1} vị):
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {startChoiceData.relatedDetails.map(item => (
                                        <span key={item.resourceId} className="bg-white border border-emerald-200 text-emerald-700 px-2 py-1 rounded text-xs font-mono font-bold shadow-sm">
                                            {item.resourceId.replace('bed-', '床 ').replace('chair-', '足 ')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-3">
                                <button 
                                    onClick={() => handleProcessStartChoice('GROUP')}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-lg font-bold flex items-center justify-center gap-3 transition-colors shadow-lg shadow-emerald-200 group"
                                >
                                    <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform"><i className="fas fa-rocket"></i></div>
                                    <div className="text-left">
                                        <div className="text-sm leading-tight">全體開始 (Start All)</div>
                                        <div className="text-[10px] opacity-80 font-normal">Chạy ngay {startChoiceData.relatedDetails.length + 1} người (Batch Execute)</div>
                                    </div>
                                </button>
                                <button 
                                    onClick={() => handleProcessStartChoice('INDIVIDUAL')}
                                    className="w-full bg-white border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 py-3.5 rounded-lg font-bold flex items-center justify-center gap-3 transition-all group"
                                >
                                    <div className="bg-slate-100 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 group-hover:text-emerald-600 group-hover:bg-emerald-100 transition-colors"><i className="fas fa-user"></i></div>
                                    <div className="text-left">
                                        <div className="text-sm leading-tight">僅開始此位 (Individual Only)</div>
                                        <div className="text-[10px] opacity-80 font-normal">其他人繼續等待</div>
                                    </div>
                                </button>
                            </div>
                            <button onClick={() => setStartChoiceData(null)} className="w-full mt-6 text-gray-400 hover:text-gray-600 font-bold text-xs uppercase tracking-wider text-center">取消 (Cancel)</button>
                        </div>
                    </div>
                </div>
            )}

            {controlCenterData && BookingControlModal && (
                <BookingControlModal 
                    isOpen={true}
                    onClose={() => setControlCenterData(null)}
                    onAction={handleControlAction} 
                    booking={controlCenterData.booking}
                    liveData={controlCenterData.liveState}
                    contextResourceId={controlCenterData.resourceId}
                />
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render( <window.ErrorBoundary><App /></window.ErrorBoundary> );
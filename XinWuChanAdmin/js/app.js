// TYPE: app.js
// VERSION: V109.0 (24/7 TIMELINE, 9 BEDS/CHAIRS, STANDARD SHORT-QUEUE)
// UPDATE: 2026-04-10
//
// --- CHANGE LOG V109.0 ---
// 1. [SCALE UP]: Mở rộng quy mô từ 6 lên 9 Ghế và 9 Giường.
// 2. [TIME SHIFT]: Dời mốc tính giờ qua đêm thành 5h sáng (Timeline 5AM - 5AM).
// 3. [QUEUE FIX]: Hủy đặc quyền của đơn ngắn (35p, 40p). Thợ làm đơn ngắn sẽ bị
//    cộng dồn thời gian và rớt xuống cuối hàng đợi như các gói tiêu chuẩn.
//
// --- CHANGE LOG V108.71 ---
// 1. [FEATURE]: Tích hợp trường ghi chú đặc biệt adminNote (Cột R).
// 2. [FEATURE]: Gán window.QUICK_NOTES từ API.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// --- 1. COMPONENT IMPORTS ---
const CommissionView = window.CommissionView;
const TimelineView = window.TimelineView;
const BookingListView = window.BookingListView;
const BookingControlModal = window.BookingControlModal || window.ComboTimeEditModal;

// --- HÀM TRỢ GIÚP TÍNH "節數" (BLOCKS) CHO QUY TẮC D ---
const getServiceBlocks = (serviceName) => {
    if (!serviceName) return 0;
    const name = serviceName.toUpperCase();
    if (name.includes('A6') || name.includes('B6')) return 6;
    if (name.includes('A4') || name.includes('B4') || name.includes('F4')) return 4;
    if (name.includes('A3') || name.includes('B3') || name.includes('F3')) return 3;
    if (name.includes('A2') || name.includes('B2') || name.includes('F2')) return 2;
    if (name.includes('B1') || name.includes('F1')) return 1;

    if (name.includes('190') || name.includes('180') || name.includes('帝王')) return 6;
    if (name.includes('130') || name.includes('120') || name.includes('豪華')) return 4;
    if (name.includes('100') || name.includes('90') || name.includes('招牌')) return 3;
    if (name.includes('70') || name.includes('精選')) return 2;
    if (name.includes('40') || name.includes('35')) return 1;

    return 2;
};

// --- HELPER: BÓC TÁCH THỜI GIAN CHUẨN TỪ TÊN DỊCH VỤ ---
const extractStandardDuration = (serviceName) => {
    if (!serviceName) return null;
    const match = serviceName.match(/(190|180|130|120|100|90|70|60|50|45|40|30)/);
    if (match) {
        return parseInt(match[0], 10);
    }
    return null;
};

// --- HÀM LÀM SẠCH TÊN DỊCH VỤ (DATA NORMALIZATION) ---
const getCleanServiceName = (rawName) => {
    if (!rawName) return window.SERVICES_LIST && window.SERVICES_LIST.length > 0 ? window.SERVICES_LIST[0] : '';
    if (window.SERVICES_LIST && window.SERVICES_LIST.includes(rawName)) return rawName;

    if (window.SERVICES_LIST) {
        const sortedList = [...window.SERVICES_LIST].sort((a, b) => b.length - a.length);
        const match = sortedList.find(s => rawName.includes(s));
        if (match) return match;
    }
    return String(rawName).replace(/\s*\([^)]*油推[^)]*\)/g, '').trim();
};

// --- MATRIX HELPER ---
const MatrixHelper = {
    isOverlap: (startA, endA, startB, endB) => {
        return (startA < endB) && (startB < endA);
    },
    countAvailableResources: (type, start, end, gridState, reservedTimes, ignoreRowId = null) => {
        let count = 0;
        for (let i = 1; i <= 9; i++) { // Nâng cấp từ 6 lên 9
            const id = `${type}-${i}`;
            if (reservedTimes[id] && start < reservedTimes[id]) continue;
            let isClash = false;
            if (gridState[id]) {
                for (const slot of gridState[id]) {
                    if (ignoreRowId && slot.booking && String(slot.booking.rowId) === String(ignoreRowId)) continue;
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
    findBestSlot: (type, start, end, gridState, reservedTimes, preferredIndexOrId = null, ignoreRowId = null) => {
        const limit = 9; // Nâng cấp từ 6 lên 9
        if (preferredIndexOrId) {
            let id;
            if (typeof preferredIndexOrId === 'string' && preferredIndexOrId.includes('-')) {
                id = preferredIndexOrId;
            } else {
                id = `${type}-${preferredIndexOrId}`;
            }

            if (id.startsWith(type)) {
                let valid = true;
                if (reservedTimes[id] && start < reservedTimes[id]) valid = false;
                if (valid && gridState[id]) {
                    for (const slot of gridState[id]) {
                        if (ignoreRowId && slot.booking && String(slot.booking.rowId) === String(ignoreRowId)) continue;
                        if (MatrixHelper.isOverlap(start, end, slot.start, slot.end)) {
                            valid = false;
                            break;
                        }
                    }
                }
                if (valid) return id;
            }
        }

        for (let i = 1; i <= limit; i++) {
            const id = `${type}-${i}`;
            if (reservedTimes[id] && start < reservedTimes[id]) continue;
            let isClash = false;
            if (gridState[id]) {
                for (const slot of gridState[id]) {
                    if (ignoreRowId && slot.booking && String(slot.booking.rowId) === String(ignoreRowId)) continue;
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

// --- HELPER: NORMALIZE PHONE ---
const getNormalizedPhone = (booking) => {
    if (!booking) return "";
    const raw = booking.phone || booking.sdt || booking.custPhone || "";
    return raw.replace(/\D/g, '').slice(-6);
};

// --- HELPER: BOOKING SIGNATURE ---
const getBookingSignature = (booking) => {
    if (!booking) return "null";
    const time = (booking.startTimeString || "").split(' ')[1] || "00:00";
    const name = (booking.customerName || "").trim().toLowerCase().replace(/\s+/g, '');
    const phone = getNormalizedPhone(booking).slice(-4);
    const service = (booking.serviceName || "").substring(0, 3);
    return `${time}_${name}_${phone}`;
};

// --- HELPER: TẦNG 1 - KIỂM TRA ĐỘ PHÙ HỢP CỦA NHÂN VIÊN VÀ KHÁCH (SINGLE) ---
const checkStaffCompatibility = (staff, booking, designatedStaffReq) => {
    const reqStr = designatedStaffReq || '隨機';

    const needsMale = reqStr.includes('男') || reqStr.includes('Male');
    const needsFemale = reqStr.includes('女') || reqStr.includes('Female') || (booking && booking.isOil);

    if (!['隨機', '男', '女', 'Oil', 'undefined', 'null', ''].includes(reqStr)) {
        return staff.id === reqStr || staff.name === reqStr || (staff.name && staff.name.includes(reqStr));
    }

    if (needsMale) {
        return staff.gender === 'M' || staff.gender === '男';
    }
    if (needsFemale) {
        return staff.gender === 'F' || staff.gender === '女';
    }

    return true;
};

// --- HELPER: TẦNG 1.5 - CHẤM ĐIỂM ĐỘ PHÙ HỢP (CHO BATCH START STAFF-CENTRIC) ---
const scoreStaffCompatibility = (staff, booking, designatedStaffReq) => {
    const reqStr = designatedStaffReq || '隨機';

    if (!['隨機', '男', '女', 'Oil', 'undefined', 'null', ''].includes(reqStr)) {
        if (staff.id === reqStr || staff.name === reqStr || (staff.name && staff.name.includes(reqStr))) return 3;
        return 0;
    }

    const needsMale = reqStr.includes('男') || reqStr.includes('Male');
    const needsFemale = reqStr.includes('女') || reqStr.includes('Female') || (booking && booking.isOil);

    if (needsMale) {
        if (staff.gender === 'M' || staff.gender === '男') return 2;
        return 0;
    }
    if (needsFemale) {
        if (staff.gender === 'F' || staff.gender === '女') return 2;
        return 0;
    }

    return 1;
};

// --- HELPER: TẦNG 2 (LOOK-AHEAD) - KIỂM TRA LỊCH TRÌNH TƯƠNG LAI CỦA THỢ ---
const checkStaffFutureAvailability = (staffId, proposedDuration, allBookings, currentMins, currentRowId, currentPhone = null) => {
    const proposedEndTime = currentMins + proposedDuration;

    for (let i = 0; i < allBookings.length; i++) {
        const b = allBookings[i];

        if ((currentRowId && String(b.rowId) === String(currentRowId)) || b.isDoneStatus || b.isRunningStatus) continue;

        if (currentPhone && currentPhone.length >= 4) {
            const otherPhone = getNormalizedPhone(b);
            if (otherPhone === currentPhone) continue;
        }

        const reqStaff = b.requestedStaff || b.serviceStaff || b.staffId || b.ServiceStaff || b.technician;

        if (reqStaff === staffId) {
            const timeStr = b.startTimeString ? b.startTimeString.split(' ')[1] : null;
            if (timeStr) {
                let futureStartMins = 0;
                if (window.normalizeToTimelineMins) {
                    futureStartMins = window.normalizeToTimelineMins(timeStr);
                } else {
                    const [h, m] = timeStr.split(':').map(Number);
                    futureStartMins = (h * 60) + (m || 0);
                    if (h < 5) futureStartMins += 1440; // Nâng cấp mốc 5h sáng
                }

                if (futureStartMins > currentMins) {
                    if (proposedEndTime > futureStartMins) {
                        return false;
                    }
                }
            }
        }
    }
    return true;
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
    const [controlCenterData, setControlCenterData] = useState(null);
    const [paymentChoiceData, setPaymentChoiceData] = useState(null);
    const [startChoiceData, setStartChoiceData] = useState(null);

    // System States
    const [viewDate, setViewDate] = useState(window.getOperationalDateInputFormat());
    const [syncLock, setSyncLock] = useState(false);
    const [quotaError, setQuotaError] = useState(false);
    const [isManualRefreshing, setIsManualRefreshing] = useState(false);
    const isManualRefreshingRef = useRef(false);

    const localOverridesRef = useRef({});
    const lastSyncedPositionsRef = useRef({});

    const resourceStateRef = useRef({});
    useEffect(() => {
        resourceStateRef.current = resourceState;
    }, [resourceState]);

    // 2. HELPER FUNCTIONS
    const getScheduledStartTimeISO = (booking) => {
        try {
            if (!booking || !booking.startTimeString) return new Date().toISOString();
            let timeStr = booking.startTimeString;
            let datePart = viewDate;

            if (timeStr.includes(' ')) {
                const parts = timeStr.split(' ');
                datePart = parts[0].replace(/\//g, '-');
                timeStr = parts[1];
            }

            const [hours, minutes] = timeStr.split(':').map(Number);
            const dObj = new Date(datePart);

            if (!isNaN(dObj.getTime())) {
                dObj.setHours(hours || 0, minutes || 0, 0, 0);
                return dObj.toISOString();
            }
            return new Date().toISOString();
        } catch (e) {
            console.error("Error parsing scheduled time:", e);
            return new Date().toISOString();
        }
    };

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
        for (let i = 1; i <= 9; i++) allSlots.push(`chair-${i}`); // Nâng cấp 9
        for (let i = 1; i <= 9; i++) allSlots.push(`bed-${i}`);   // Nâng cấp 9
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

        const mappedFromResource = Object.keys(resourceState)
            .filter(k => k !== excludeResourceId && !resourceState[k].isRunning && resourceState[k].isPreview === true)
            .map(k => ({ resourceId: k, booking: resourceState[k].booking }))
            .filter(item => {
                const otherBooking = item.booking;
                if (String(otherBooking.rowId) === currentRowId) return true;
                if (currentPhone.length >= 4 && currentPhone === getNormalizedPhone(otherBooking)) return true;
                return false;
            });

        const mappedRowIds = new Set(mappedFromResource.map(m => String(m.booking.rowId)));
        mappedRowIds.add(currentRowId);

        const unmappedBookings = bookings.filter(b => {
            if (b.isDoneStatus || b.isRunningStatus) return false;
            if (mappedRowIds.has(String(b.rowId))) return false;

            const otherPhone = getNormalizedPhone(b);
            if (currentPhone.length >= 4 && currentPhone === otherPhone) {
                const t1 = (currentBooking.startTimeString || "00:00").split(' ')[1];
                const t2 = (b.startTimeString || "00:00").split(' ')[1];
                if (t1 === t2) return true;
            }
            return false;
        });

        const unmappedItems = unmappedBookings.map(b => {
            let foundResId = b.phase1_res_idx || b.current_resource_id || b.location || b.storedLocation;
            if (foundResId) {
                foundResId = foundResId.toLowerCase();
            } else if (timelineData) {
                for (const [resId, slots] of Object.entries(timelineData)) {
                    const matchedSlot = slots.find(s => String(s.booking.rowId) === String(b.rowId));
                    if (matchedSlot && (!matchedSlot.meta || matchedSlot.meta.phase === 1)) {
                        foundResId = resId;
                        break;
                    }
                }
            }
            return {
                resourceId: foundResId,
                booking: b
            };
        });

        return [...mappedFromResource, ...unmappedItems];
    };

    const findRelatedForCheckout = (currentBooking, excludeResourceId) => {
        if (!currentBooking) return [];
        const currentRowId = String(currentBooking.rowId);
        const currentPhone = getNormalizedPhone(currentBooking);

        return Object.keys(resourceState)
            .filter(k => k !== excludeResourceId && (resourceState[k].isRunning || resourceState[k].isPreview === true))
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
        try { await axios.post(endpoint, payload); } catch (e) { console.log("Universal send check (ignore):", e); }
    };

    const handleForceFixDuration = async (booking, standardDuration) => {
        if (!booking || !standardDuration) return;
        const rowId = String(booking.rowId);
        const newDuration = parseInt(standardDuration, 10);

        if (confirm(`⚠️ 確定將時長強制同步為標準時間 (${newDuration} 分鐘) 嗎？\n(Sync to standard time)`)) {
            setSyncLock(true);
            setTimeout(() => setSyncLock(false), 3000);

            let newP1 = booking.phase1_duration;
            let newP2 = booking.phase2_duration;
            if (booking.category === 'COMBO' || (booking.serviceName && booking.serviceName.includes('套餐'))) {
                const split = getSmartSplit(booking, newDuration, true, booking.flow || 'FB');
                newP1 = split.phase1;
                newP2 = split.phase2;
            } else {
                newP1 = null;
                newP2 = null;
            }

            if (!localOverridesRef.current[rowId]) localOverridesRef.current[rowId] = {};
            localOverridesRef.current[rowId].duration = newDuration;
            if (newP1 !== null) localOverridesRef.current[rowId].phase1_duration = newP1;
            if (newP2 !== null) localOverridesRef.current[rowId].phase2_duration = newP2;

            const newState = { ...resourceState };
            let updated = false;
            Object.keys(newState).forEach(key => {
                const res = newState[key];
                if (res.booking && String(res.booking.rowId) === rowId) {
                    res.booking.duration = newDuration;
                    res.booking.isTimeAnomaly = false;
                    res.booking.anomalyDiff = 0;
                    if (newP1 !== null) res.booking.phase1_duration = newP1;
                    if (newP2 !== null) res.booking.phase2_duration = newP2;
                    updated = true;
                }
            });
            if (updated) setResourceState(newState);
            fetchData(true);

            try {
                const updatePayload = {
                    rowId: rowId,
                    duration: newDuration,
                    is_locked: "TRUE",
                    forceSync: true
                };
                if (newP1 !== null) {
                    updatePayload.phase1_duration = newP1;
                    updatePayload.phase2_duration = newP2;
                }
                await universalSend('/api/update-booking-details', updatePayload);
            } catch (e) {
                alert("⚠️ 同步失敗！請檢查網路連線。");
            }
        }
    };

    // --- AUTO-TRANSITION WATCHDOG ---
    useEffect(() => {
        const watchdog = setInterval(() => {
            if (syncLock) return;
            const currentState = resourceStateRef.current;
            let hasChanges = false;
            const newState = { ...currentState };
            const apiPayloads = [];
            const now = Date.now();

            Object.keys(newState).forEach(key => {
                const res = newState[key];
                if (res.isRunning && !res.isPaused && res.comboMeta && res.comboMeta.phase === 1 && res.startTime) {
                    const startTs = new Date(res.startTime).getTime();
                    const elapsed = now - startTs;
                    const split = getSmartSplit(res.booking, res.booking.duration || 100, res.isMaxMode, res.comboMeta.sequence);
                    const phase1Ms = (split.phase1 + (res.comboMeta.flex || 0)) * 60000;

                    if (elapsed >= phase1Ms) {
                        const targetId = res.comboMeta.targetId;
                        if (targetId && targetId !== key) {
                            const targetRes = newState[targetId];
                            const isTargetFree = !targetRes || !targetRes.isRunning || String(targetRes.booking?.rowId) === String(res.booking.rowId);

                            if (isTargetFree) {
                                hasChanges = true;
                                const rowId = String(res.booking.rowId);

                                if (!localOverridesRef.current[rowId]) localOverridesRef.current[rowId] = {};
                                localOverridesRef.current[rowId].storedLocation = targetId;

                                newState[targetId] = {
                                    ...res,
                                    comboMeta: { ...res.comboMeta, phase: 2 }
                                };
                                delete newState[key];

                                apiPayloads.push({
                                    rowId: rowId,
                                    current_resource_id: targetId,
                                    location: targetId,
                                    forceSync: true
                                });
                            }
                        }
                    }
                }
            });

            if (hasChanges) {
                setResourceState(newState);
                apiPayloads.forEach(payload => universalSend('/api/update-booking-details', payload));
                universalSend('/api/sync-resource', newState);
            }
        }, 5000);

        return () => clearInterval(watchdog);
    }, [syncLock]);

    // 3. CORE LOGIC (FETCH & RENDER) 
    const fetchData = async (isManual = false) => {
        if (syncLock && !isManual) return;
        if (quotaError && !isManual) return;

        if (!isManual && isManualRefreshingRef.current) return;

        if (isManual) {
            setIsManualRefreshing(true);
            isManualRefreshingRef.current = true;
        }

        try {
            const endpoint = isManual ? '/api/info?forceRefresh=true' : '/api/info';
            const res = await axios.get(endpoint, { timeout: 15000 });
            setQuotaError(false);

            if (res.data.services) {
                window.DYNAMIC_PRICES_MAP = res.data.services;
                window.SERVICES_DATA = res.data.services;
                const uniqueNames = [...new Set(Object.values(res.data.services).map(s => s.name))];
                window.SERVICES_LIST = uniqueNames;
            }

            const { bookings: apiBookings, staffList: apiStaff, resourceState: serverRes, staffStatus: serverStaff, quickNotes: apiQuickNotes } = res.data;

            if (apiQuickNotes) {
                window.QUICK_NOTES = apiQuickNotes;
            }

            let nextResourceState = { ...(serverRes || {}) };

            Object.keys(localOverridesRef.current).forEach(rowId => {
                const override = localOverridesRef.current[rowId];
                if (override && override.storedLocation) {
                    const targetResId = override.storedLocation;
                    let currentResId = null;

                    Object.keys(nextResourceState).forEach(key => {
                        if (nextResourceState[key] && nextResourceState[key].booking && String(nextResourceState[key].booking.rowId) === rowId) {
                            currentResId = key;
                        }
                    });

                    if (currentResId && currentResId !== targetResId) {
                        nextResourceState[targetResId] = nextResourceState[currentResId];
                        delete nextResourceState[currentResId];
                    }
                }
            });

            const cleanBookings = (apiBookings || []).map(b => {
                let targetB = { ...b };
                const rawStatus = String(targetB.status || '');

                const override = localOverridesRef.current[String(targetB.rowId)];
                if (override) {
                    let isSynced = true;
                    if (override.startTimeString && targetB.startTimeString !== override.startTimeString) isSynced = false;
                    if (override.duration !== undefined && parseInt(targetB.duration) !== override.duration) isSynced = false;
                    if (override.phase1_duration !== undefined && parseInt(targetB.phase1_duration) !== override.phase1_duration) isSynced = false;
                    if (override.phase2_duration !== undefined && parseInt(targetB.phase2_duration) !== override.phase2_duration) isSynced = false;
                    if (override.storedLocation && targetB.location !== override.storedLocation && targetB.current_resource_id !== override.storedLocation) isSynced = false;
                    if (override.flow && targetB.flow !== override.flow) isSynced = false;
                    if (override.phase1_res_idx && targetB.phase1_res_idx !== override.phase1_res_idx) isSynced = false;
                    if (override.phase2_res_idx && targetB.phase2_res_idx !== override.phase2_res_idx) isSynced = false;
                    if (override.forceRunning && (!rawStatus || !rawStatus.includes('Running'))) isSynced = false;
                    if (override.adminNote !== undefined && targetB.adminNote !== override.adminNote) isSynced = false;

                    if (isSynced) {
                        delete localOverridesRef.current[String(targetB.rowId)];
                    } else {
                        if (override.startTimeString) targetB.startTimeString = override.startTimeString;
                        if (override.duration !== undefined) targetB.duration = override.duration;
                        if (override.phase1_duration !== undefined) targetB.phase1_duration = override.phase1_duration;
                        if (override.phase2_duration !== undefined) targetB.phase2_duration = override.phase2_duration;
                        if (override.storedLocation) {
                            targetB.location = override.storedLocation;
                            targetB.current_resource_id = override.storedLocation;
                        }
                        if (override.phase1_res_idx) targetB.phase1_res_idx = override.phase1_res_idx;
                        if (override.phase2_res_idx) targetB.phase2_res_idx = override.phase2_res_idx;
                        if (override.flow) targetB.flow = override.flow;
                        if (override.adminNote !== undefined) targetB.adminNote = override.adminNote;

                        if (override.forceRunning) {
                            targetB.status = '🟡 Running';
                        }
                        targetB.isManualLocked = true;
                    }
                }

                let rawFlow = targetB.flow || null;
                if (rawFlow === 'null' || rawFlow === 'undefined' || rawFlow === '') rawFlow = null;
                if (rawFlow) rawFlow = rawFlow.toUpperCase();

                if (rawFlow === 'FB' && targetB.phase1_res_idx && targetB.phase1_res_idx.toUpperCase().includes('BED')) {
                    rawFlow = 'BF';
                    targetB.flow = 'BF';
                } else if (rawFlow === 'BF' && targetB.phase1_res_idx && targetB.phase1_res_idx.toUpperCase().includes('CHAIR')) {
                    rawFlow = 'FB';
                    targetB.flow = 'FB';
                }

                const p1 = targetB.phase1_duration ? parseInt(targetB.phase1_duration) : null;
                const p2 = targetB.phase2_duration ? parseInt(targetB.phase2_duration) : null;
                const isLocked = (targetB.isManualLocked === true || String(targetB.isManualLocked) === 'TRUE');

                let forceResourceType = null;
                let isForcedSingle = false;

                if (rawFlow === 'FOOTSINGLE') {
                    forceResourceType = 'CHAIR';
                    isForcedSingle = true;
                } else if (rawFlow === 'BODYSINGLE') {
                    forceResourceType = 'BED';
                    isForcedSingle = true;
                }

                const cleanName = getCleanServiceName(targetB.serviceName);
                const safeDur = window.getSafeDuration(targetB.serviceName, targetB.duration);

                let standardDur = extractStandardDuration(targetB.serviceName) || safeDur;
                if (window.DYNAMIC_PRICES_MAP) {
                    const found = Object.values(window.DYNAMIC_PRICES_MAP).find(s => s.name === cleanName);
                    if (found && found.duration) standardDur = parseInt(found.duration, 10);
                }

                let finalDur = override && override.duration ? override.duration : safeDur;
                const paxNum = parseInt(targetB.pax, 10) || 1;
                const isComboSvc = targetB.category === 'COMBO' || (targetB.serviceName && targetB.serviceName.includes('套餐'));

                let isAutoFixed = false;
                if (paxNum === 1 && !isComboSvc && standardDur > 0 && finalDur > standardDur) {
                    finalDur = standardDur;
                    isAutoFixed = true;
                    if (override) override.duration = standardDur;
                }

                const isTimeAnomaly = !isAutoFixed && standardDur > 0 && finalDur > standardDur;
                const anomalyDiff = isTimeAnomaly ? (finalDur - standardDur) : 0;

                let serviceCode = targetB.serviceCode;
                if (!serviceCode || serviceCode.trim() === '') {
                    serviceCode = targetB.serviceName ? targetB.serviceName.replace(/\s*\([^)]*油推[^)]*\)/g, '').substring(0, 3).trim() : '---';
                }

                let displayStaff = targetB.serviceStaff || targetB.staffId || targetB.ServiceStaff || targetB.technician || '隨機';
                if (!displayStaff || displayStaff === 'undefined' || displayStaff === 'null' || displayStaff === '') {
                    displayStaff = '隨機';
                }

                const isGuaSha = targetB.isGuaSha === true;

                return {
                    ...targetB,
                    cleanServiceName: cleanName,
                    serviceCode: serviceCode,
                    displayStaff: displayStaff,
                    isOil: targetB.isOil || (targetB.serviceName && targetB.serviceName.includes('油')),
                    isGuaSha: isGuaSha,
                    adminNote: targetB.adminNote || "",
                    duration: finalDur,
                    _needsAutoSyncDur: isAutoFixed,
                    price: targetB.price || 0,
                    pax: paxNum,
                    rowId: String(targetB.rowId),
                    phase1_duration: p1,
                    phase2_duration: p2,
                    flow: rawFlow,
                    phase1_res_idx: targetB.phase1_res_idx,
                    phase2_res_idx: targetB.phase2_res_idx,
                    isManualLocked: isLocked,
                    originalNote: targetB.ghiChu || targetB.note || "",
                    forceResourceType: forceResourceType,
                    isForcedSingle: isForcedSingle,

                    isRunningStatus: (rawStatus.includes('Running') || rawStatus.includes('服務中') || rawStatus.toLowerCase().includes('running')),
                    isDoneStatus: (rawStatus.includes('完成') || rawStatus.includes('Done') || rawStatus.includes('✅') || rawStatus.toLowerCase().includes('cancel') || rawStatus.includes('取消')),
                    storedLocation: targetB.location || targetB.current_resource_id || (targetB.phase1_res_idx ? targetB.phase1_res_idx.toLowerCase() : null),

                    standardDuration: standardDur,
                    isTimeAnomaly: isTimeAnomaly,
                    anomalyDiff: anomalyDiff
                };
            });

            cleanBookings.forEach(b => {
                if (b.isDoneStatus && localOverridesRef.current[String(b.rowId)]) {
                    delete localOverridesRef.current[String(b.rowId)];
                }
            });

            const bookingMap = new Map();
            cleanBookings.forEach(b => bookingMap.set(String(b.rowId), b));

            const signatureMap = new Map();
            cleanBookings.forEach(b => signatureMap.set(getBookingSignature(b), b));

            const relevantBookings = cleanBookings.filter(b => {
                const safeStatus = String(b.status || '');
                return window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate) &&
                    !safeStatus.toLowerCase().includes('cancel') && !safeStatus.includes('取消');
            });

            if (apiStaff && apiStaff.length > 0) {
                setStaffList(apiStaff);
            } else if (!staffList || staffList.length === 0) {
                setStaffList([]);
            }

            if (serverStaff && Object.keys(serverStaff).length > 0) {
                setStatusData(serverStaff);
            } else if (!statusData || Object.keys(statusData).length === 0) {
                setStatusData({});
            }

            const activeRowIds = new Set();
            const activeSignatures = new Set();

            Object.keys(nextResourceState).forEach(key => {
                const res = nextResourceState[key];
                if (res.isRunning && res.booking) {
                    const rowId = String(res.booking.rowId);
                    if (bookingMap.has(rowId)) {
                        const freshBooking = bookingMap.get(rowId);
                        if (freshBooking.isDoneStatus) {
                            delete nextResourceState[key];
                            return;
                        }
                    }
                }
            });

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
                        res.booking.rowId = String(freshData.rowId);
                        activeRowIds.add(String(freshData.rowId));
                    } else {
                        activeRowIds.add(oldRowId);
                        freshData = res.booking;
                    }

                    if (freshData) {
                        res.booking = { ...res.booking, ...freshData };
                        activeSignatures.add(getBookingSignature(freshData));
                    }
                }
            });

            relevantBookings.forEach(b => {
                if (b.isRunningStatus) {
                    if (activeRowIds.has(String(b.rowId)) || activeSignatures.has(getBookingSignature(b))) {
                        return;
                    }

                    let targetResId = null;
                    if (b.storedLocation && !nextResourceState[b.storedLocation]) {
                        if (/^(chair|bed)-\d$/.test(b.storedLocation)) {
                            targetResId = b.storedLocation;
                        }
                    }

                    if (!targetResId) {
                        const type = (b.forceResourceType === 'BED' || b.flow === 'BODYSINGLE') ? 'bed' : 'chair';
                        for (let i = 1; i <= 9; i++) { // Nâng cấp 9
                            const tid = `${type}-${i}`;
                            if (!nextResourceState[tid]) { targetResId = tid; break; }
                        }
                    }

                    if (targetResId) {
                        nextResourceState[targetResId] = {
                            booking: b,
                            isRunning: true,
                            isPaused: false,
                            startTime: getScheduledStartTimeISO(b),
                            isPreview: false,
                            isMaxMode: true,
                            comboMeta: null
                        };
                        activeRowIds.add(String(b.rowId));
                        activeSignatures.add(getBookingSignature(b));
                    }
                }
            });

            const nowObj = window.getTaipeiDate ? window.getTaipeiDate() : new Date();
            // Nâng cấp logic giờ: < 5h sáng thì cộng 1440
            const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < 5 ? 1440 : 0);

            let tempState = {};
            const activeEndTimes = {};
            const timelineGrid = {};

            const addToGrid = (resId, start, end, booking, meta) => {
                if (booking.isDoneStatus) return;
                if (!timelineGrid[resId]) timelineGrid[resId] = [];
                timelineGrid[resId].push({ start, end, booking, meta });
            };

            Object.keys(nextResourceState).forEach(key => {
                if (nextResourceState[key].isRunning) {
                    tempState[key] = nextResourceState[key];
                    const startTime = new Date(nextResourceState[key].startTime);
                    // Nâng cấp: < 5 thì +1440
                    const startMins = startTime.getHours() * 60 + startTime.getMinutes() + (startTime.getHours() < 5 ? 1440 : 0);

                    const b = nextResourceState[key].booking;
                    let durationUsed = b.duration;
                    let isPhase1 = false;
                    const isStrictSingle = b.isForcedSingle === true;
                    const isComboSvc = b.category === 'COMBO' || (b.serviceName && b.serviceName.includes('套餐'));

                    if (isComboSvc && !isStrictSingle && !tempState[key].comboMeta) {
                        const seq = b.flow || 'FB';
                        let determinedPhase = 1;
                        const isChair = key.includes('chair');
                        if ((seq === 'FB' && isChair) || (seq === 'BF' && !isChair)) {
                            determinedPhase = 1;
                        } else {
                            determinedPhase = 2;
                        }
                        tempState[key].comboMeta = {
                            sequence: seq,
                            phase: determinedPhase,
                            flex: 0,
                            targetId: b.phase2_res_idx ? b.phase2_res_idx.toLowerCase() : null
                        };
                    }

                    if (tempState[key].comboMeta && !isStrictSingle) {
                        const seq = tempState[key].comboMeta.sequence || 'FB';
                        const isMax = tempState[key].isMaxMode !== undefined ? tempState[key].isMaxMode : true;
                        const split = getSmartSplit(b, b.duration, isMax, seq);

                        if (tempState[key].comboMeta.phase !== undefined) {
                            isPhase1 = (tempState[key].comboMeta.phase === 1);
                        } else {
                            isPhase1 = (seq === 'FB' && key.includes('chair')) || (seq === 'BF' && key.includes('bed'));
                            tempState[key].comboMeta.phase = isPhase1 ? 1 : 2;
                        }

                        if (isPhase1) durationUsed = split.phase1 + (tempState[key].comboMeta.flex || 0);
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

            Object.keys(tempState).forEach(key => {
                const item = tempState[key];
                if (item.comboMeta && !item.booking.isForcedSingle) {
                    const seq = item.comboMeta.sequence || 'FB';
                    const isChair = key.includes('chair');

                    let isPhase1 = false;
                    if (item.comboMeta.phase !== undefined) {
                        isPhase1 = (item.comboMeta.phase === 1);
                    } else {
                        isPhase1 = (seq === 'FB' && isChair) || (seq === 'BF' && !isChair);
                    }

                    const split = getSmartSplit(item.booking, item.booking.duration, item.isMaxMode, seq);

                    if (isPhase1) {
                        const finishTimeMins = activeEndTimes[key];
                        const p2Start = finishTimeMins + 5;
                        const p2End = p2Start + split.phase2;

                        let finalTargetId = item.booking.phase2_res_idx ? item.booking.phase2_res_idx.toLowerCase() : null;

                        if (finalTargetId) {
                            addToGrid(finalTargetId, p2Start, p2End, item.booking, {
                                isCombo: true, phase: 2, sequence: seq, originId: key, isPrediction: false, priority: 2,
                                isRunning: false
                            });
                        }
                    } else {
                        const startTime = new Date(item.startTime);
                        // Nâng cấp < 5
                        const p2StartMins = startTime.getHours() * 60 + startTime.getMinutes() + (startTime.getHours() < 5 ? 1440 : 0);
                        const p1End = p2StartMins - 5;
                        const p1Start = p1End - split.phase1;

                        let reconstructedId = item.booking.phase1_res_idx ? item.booking.phase1_res_idx.toLowerCase() : null;

                        if (reconstructedId) {
                            addToGrid(reconstructedId, p1Start, p1End, item.booking, {
                                isCombo: true, phase: 1, sequence: seq, targetId: key, isPrediction: false, priority: 2, isPastReconstruct: true,
                                isRunning: false
                            });
                        }
                    }
                }
            });

            const pendingBookings = relevantBookings.filter(b => {
                if (b.isDoneStatus) return false;
                if (activeRowIds.has(String(b.rowId))) return false;
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
                if (!groupedPending[groupKey]) groupedPending[groupKey] = [];
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

            const sortFn = (a, b) => window.normalizeToTimelineMins(a.startTimeString.split(' ')[1]) - window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
            listSingles.sort(sortFn);
            listCombosGroups.sort((a, b) => sortFn(a[0], b[0]));

            listSingles.forEach(b => {
                if (b.isDoneStatus) return;
                if (activeRowIds.has(String(b.rowId))) return;
                const originalStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                let targetId = b.current_resource_id ? b.current_resource_id.toLowerCase() : (b.storedLocation ? b.storedLocation.toLowerCase() : null);

                if (targetId) {
                    addToGrid(targetId, originalStart, originalStart + b.duration, b, { isCombo: false, isPending: true, priority: 3, isRunning: b.isRunningStatus });
                }
            });

            listCombosGroups.forEach(group => {
                const firstBooking = group[0];
                const originalStart = window.normalizeToTimelineMins(firstBooking.startTimeString.split(' ')[1]);

                group.forEach((bookingItem) => {
                    if (bookingItem.isDoneStatus) return;
                    if (bookingItem.forceResourceType) return;
                    if (activeRowIds.has(String(bookingItem.rowId))) return;

                    let pref1 = bookingItem.phase1_res_idx ? bookingItem.phase1_res_idx.toLowerCase() : null;
                    let pref2 = bookingItem.phase2_res_idx ? bookingItem.phase2_res_idx.toLowerCase() : null;
                    const seq = bookingItem.flow || 'FB';

                    if (pref1 || pref2) {
                        const split = getSmartSplit(bookingItem, bookingItem.duration, true, seq);
                        const p1End = originalStart + split.phase1;
                        const p2Start = p1End + 5;
                        const p2End = p2Start + split.phase2;

                        if (pref1) {
                            addToGrid(pref1, originalStart, p1End, bookingItem, { isCombo: true, phase: 1, sequence: seq, targetId: pref2, isPending: true, priority: 3, isRunning: bookingItem.isRunningStatus });
                        }
                        if (pref2) {
                            addToGrid(pref2, p2Start, p2End, bookingItem, { isCombo: true, phase: 2, sequence: seq, isPending: true, priority: 3, isRunning: bookingItem.isRunningStatus });
                        }
                    }
                });
            });

            setTimelineData(timelineGrid);

            const allSlots = [];
            for (let i = 1; i <= 9; i++) allSlots.push(`chair-${i}`); // 9
            for (let i = 1; i <= 9; i++) allSlots.push(`bed-${i}`);   // 9

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

            if (!syncLock) {
                setResourceState(tempState);
                setBookings(cleanBookings);
            }

            try {
                const activeGridPositions = {};
                Object.keys(timelineGrid).forEach(resId => {
                    timelineGrid[resId].forEach(slot => {
                        const rId = String(slot.booking.rowId);
                        if (!activeGridPositions[rId]) activeGridPositions[rId] = {};
                        if (slot.meta && slot.meta.isCombo) {
                            if (slot.meta.phase === 1) activeGridPositions[rId].p1 = resId.toUpperCase();
                            if (slot.meta.phase === 2) activeGridPositions[rId].p2 = resId.toUpperCase();
                        } else if (!slot.meta || !slot.meta.isCombo) {
                            activeGridPositions[rId].single = resId.toUpperCase();
                        }
                    });
                });

                const syncPayloads = [];
                cleanBookings.forEach(b => {
                    if (b.isDoneStatus) return;

                    if (b._needsAutoSyncDur) {
                        syncPayloads.push({
                            rowId: String(b.rowId),
                            duration: b.duration,
                            is_locked: "TRUE",
                            forceSync: true
                        });
                    }

                    const rId = String(b.rowId);
                    const pos = activeGridPositions[rId];
                    if (!pos) return;

                    const isCombo = b.category === 'COMBO' || (b.serviceName && b.serviceName.includes('套餐'));

                    if (isCombo && pos.p1 && pos.p2) {
                        const sheetP1 = (b.phase1_res_idx || '').toUpperCase();
                        const sheetP2 = (b.phase2_res_idx || '').toUpperCase();
                        const flow = (b.flow || 'FB').toUpperCase();

                        if (sheetP1 !== pos.p1 || sheetP2 !== pos.p2) {
                            const posStr = `${pos.p1}_${pos.p2}`;
                            if (lastSyncedPositionsRef.current[rId] !== posStr) {
                                lastSyncedPositionsRef.current[rId] = posStr;
                                const expectedType = 'COMBO';
                                syncPayloads.push({
                                    rowId: rId,
                                    phase1_res_idx: pos.p1,
                                    phase2_res_idx: pos.p2,
                                    phase1Resource: pos.p1,
                                    phase2Resource: pos.p2,
                                    resource_type: expectedType,
                                    resourceType: expectedType,
                                    is_locked: "TRUE",
                                    forceSync: true
                                });
                            }
                        } else {
                            lastSyncedPositionsRef.current[rId] = `${pos.p1}_${pos.p2}`;
                        }
                    } else if (!isCombo && pos.single) {
                        const sheetLoc = (b.location || b.current_resource_id || '').toUpperCase();
                        if (sheetLoc !== pos.single && sheetLoc !== '') {
                            if (lastSyncedPositionsRef.current[rId] !== pos.single) {
                                lastSyncedPositionsRef.current[rId] = pos.single;
                                syncPayloads.push({
                                    rowId: rId,
                                    current_resource_id: pos.single,
                                    location: pos.single,
                                    forceSync: true
                                });
                            }
                        } else {
                            lastSyncedPositionsRef.current[rId] = pos.single;
                        }
                    }
                });

                if (syncPayloads.length > 0) {
                    syncPayloads.forEach(p => universalSend('/api/update-booking-details', p));
                }
            } catch (err) {
                console.error("Auto sync error:", err);
            }

        } catch (e) {
            console.error("API Error", e);
            if (e.response && e.response.status === 429) setQuotaError(true);
        } finally {
            if (isManual) {
                setIsManualRefreshing(false);
                isManualRefreshingRef.current = false;
            }
        }
    };

    useEffect(() => {
        fetchData(false);
        const t = setInterval(() => fetchData(false), 2000);
        return () => clearInterval(t);
    }, [viewDate, syncLock, quotaError]);

    const handleForceRefresh = () => {
        if (isManualRefreshingRef.current) return;
        fetchData(true);
    };

    const handleInlineUpdate = async (rowId, updatedData) => {
        try {
            const currentBooking = bookings.find(b => String(b.rowId) === String(rowId));
            if (currentBooking) {
                const isOilToggledOn = updatedData.isOil === true && !currentBooking.isOil;
                const isServiceOilAdded = updatedData.dichVu && updatedData.dichVu.includes('油推') && !(currentBooking.serviceName || '').includes('油推');

                if (isOilToggledOn || isServiceOilAdded) {
                    const currentReqStaff = updatedData.nhanVien !== undefined ? updatedData.nhanVien : (currentBooking.requestedStaff || currentBooking.staffId || '隨機');
                    if (currentReqStaff === '隨機') {
                        updatedData.nhanVien = '女';
                        updatedData.requestedStaff = '女';
                    }
                }

                if (updatedData.dichVu && updatedData.dichVu !== currentBooking.serviceName) {
                    const newStandardDur = extractStandardDuration(updatedData.dichVu) || window.getSafeDuration(updatedData.dichVu, currentBooking.duration);
                    if (newStandardDur > 0) {
                        updatedData.duration = newStandardDur;
                    }
                }
            }

            setSyncLock(true);
            setTimeout(() => setSyncLock(false), 3000);

            if (updatedData.adminNote !== undefined) {
                if (!localOverridesRef.current[String(rowId)]) localOverridesRef.current[String(rowId)] = {};
                localOverridesRef.current[String(rowId)].adminNote = updatedData.adminNote;
            }

            await axios.post('/api/inline-update-booking', {
                rowId: rowId,
                updatedData: updatedData
            });

            fetchData(true);

        } catch (e) {
            console.error("Inline update failed:", e);
            alert("⚠️ 儲存失敗，請檢查網路連線。 (Update Failed)");
        }
    };

    const handleSplitConfirm = async (newStaffId) => {
        if (!splitData) return;
        const { resourceId } = splitData;
        const current = resourceState[resourceId];
        if (!current) return;
        setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);

        const newStatusData = { ...statusData, [newStaffId]: { ...statusData[newStaffId], status: 'BUSY', stafftime: Date.now() } };
        updateStaffStatus(newStatusData);

        const staffProps = [
            { key: 'serviceStaff', dbKey: '服務師傅1', fbKey: 'ServiceStaff1' },
            { key: 'staffId2', dbKey: '服務師傅2', fbKey: 'ServiceStaff2' },
            { key: 'staffId3', dbKey: '服務師傅3', fbKey: 'ServiceStaff3' },
            { key: 'staffId4', dbKey: '服務師傅4', fbKey: 'ServiceStaff4' },
            { key: 'staffId5', dbKey: '服務師傅5', fbKey: 'ServiceStaff5' },
            { key: 'staffId6', dbKey: '服務師傅6', fbKey: 'ServiceStaff6' }
        ];

        let targetProp = null;
        let targetDbKey = null;
        let targetFbKey = null;

        for (let i = 0; i < staffProps.length; i++) {
            const currentVal = current.booking[staffProps[i].key];
            if (!currentVal || currentVal === '隨機' || currentVal === 'undefined' || currentVal === 'null' || currentVal === '') {
                targetProp = staffProps[i].key;
                targetDbKey = staffProps[i].dbKey;
                targetFbKey = staffProps[i].fbKey;
                break;
            }
        }

        if (!targetProp) {
            alert("⚠️ 該預約已達最大技師數量限制 (6人)。");
            setSyncLock(false);
            return;
        }

        const newBooking = { ...current.booking, [targetProp]: newStaffId };
        const newState = { ...resourceState, [resourceId]: { ...current, booking: newBooking } };

        setResourceState(newState);

        const payload = {
            rowId: current.booking.rowId,
            [targetDbKey]: newStaffId,
            [targetFbKey]: newStaffId,
            forceSync: true
        };
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

        if (oldServiceStaff !== '隨機' && oldServiceStaff !== newStaffId) {
            const oldStaffState = statusData[oldServiceStaff];
            let restoredTime = Date.now();

            if (oldStaffState?.previousStafftime) {
                restoredTime = oldStaffState.previousStafftime;
            } else if (current.startTime) {
                restoredTime = new Date(current.startTime).getTime();
            }

            newStatusData[oldServiceStaff] = {
                ...oldStaffState,
                status: 'READY',
                stafftime: restoredTime
            };
        }

        if (newStaffId !== '隨機') {
            const currentStaffTime = statusData[newStaffId]?.stafftime || Date.now();
            newStatusData[newStaffId] = {
                ...statusData[newStaffId],
                status: 'BUSY',
                stafftime: Date.now(),
                previousStafftime: currentStaffTime
            };
        }
        updateStaffStatus(newStatusData);

        let primaryKey = "服務師傅1"; let fallbackKey = "ServiceStaff1";
        if (grpIdx === 1) { primaryKey = "服務師傅2"; fallbackKey = "ServiceStaff2"; }
        if (grpIdx === 2) { primaryKey = "服務師傅3"; fallbackKey = "ServiceStaff3"; }
        if (grpIdx === 3) { primaryKey = "服務師傅4"; fallbackKey = "ServiceStaff4"; }
        if (grpIdx === 4) { primaryKey = "服務師傅5"; fallbackKey = "ServiceStaff5"; }
        if (grpIdx === 5) { primaryKey = "服務師傅6"; fallbackKey = "ServiceStaff6"; }

        const payload = { rowId: current.booking.rowId, [primaryKey]: newStaffId, [fallbackKey]: newStaffId, [`staff${grpIdx + 1}`]: newStaffId, technician: newStaffId, forceSync: true };
        try { await universalSend('/api/update-booking-details', payload); await updateResource(newState); } catch (e) { alert("⚠️ 同步失敗！請檢查網路連線。"); }
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

    const handleSaveComboTime = async (arg1, arg2 = null, startTimeStr = null, switchTimeStr = null, customP1Res = null, customP2Res = null) => {
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

        if (!targetBooking) return;

        const rowId = String(targetBooking.rowId);
        const totalDuration = parseInt(targetBooking.duration || 100);

        if (isNaN(newPhase1Duration) || newPhase1Duration < 0 || newPhase1Duration > totalDuration) {
            alert(`⚠️ 第一階段時間無效！(Phase 1 Time Invalid)`);
            return;
        }

        const newPhase2Duration = totalDuration - newPhase1Duration;

        setSyncLock(true);
        setTimeout(() => setSyncLock(false), 5000);

        let newStartTimeIso = null;
        let newStartTimeStringForSheet = null;
        let effectiveStartTimeStr = startTimeStr;

        if (startTimeStr) {
            const originalStartStr = targetBooking.startTimeString || "";
            let datePart = originalStartStr.split(' ')[0];

            if (!datePart) {
                const now = new Date();
                datePart = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
            }
            datePart = datePart.replace(/-/g, '/');

            newStartTimeStringForSheet = `${datePart} ${startTimeStr}`;

            const parts = startTimeStr.split(':');
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const dObj = new Date(datePart);
            if (!isNaN(dObj.getTime())) {
                dObj.setHours(h, m, 0, 0);
                newStartTimeIso = dObj.toISOString();
            }
        } else {
            effectiveStartTimeStr = targetBooking.startTimeString ? targetBooking.startTimeString.split(' ')[1] : "12:00";
        }

        const currentFlow = targetBooking.flow || 'FB';
        const p1Type = currentFlow === 'BF' ? 'bed' : 'chair';
        const p2Type = currentFlow === 'BF' ? 'chair' : 'bed';
        const resourceTypeForSheet = 'COMBO';

        let tryStart = 720;
        if (effectiveStartTimeStr) {
            try {
                if (window.normalizeToTimelineMins) {
                    tryStart = window.normalizeToTimelineMins(effectiveStartTimeStr);
                } else {
                    const [h, m] = effectiveStartTimeStr.split(':').map(Number);
                    tryStart = (h * 60) + (m || 0);
                    if (h < 5) tryStart += 1440; // Nâng cấp 5h sáng
                }
            } catch (e) { }
        }

        const mockActiveEndTimes = {};
        Object.keys(resourceState).forEach(k => {
            if (resourceState[k].isRunning && resourceState[k].booking) {
                const b = resourceState[k];
                try {
                    const startObj = new Date(b.startTime);
                    // Nâng cấp 5h sáng
                    const startMins = startObj.getHours() * 60 + startObj.getMinutes() + (startObj.getHours() < 5 ? 1440 : 0);
                    mockActiveEndTimes[k] = startMins + (b.booking.duration || 60);
                } catch (e) { }
            }
        });

        let s1 = customP1Res && customP1Res !== 'auto' ? customP1Res.toLowerCase() : null;
        if (!s1) s1 = MatrixHelper.findBestSlot(p1Type, tryStart, tryStart + newPhase1Duration, timelineData, mockActiveEndTimes, null, rowId) || `${p1Type}-1`;

        const p2Start = tryStart + newPhase1Duration + 5;
        let s2 = customP2Res && customP2Res !== 'auto' ? customP2Res.toLowerCase() : null;
        if (!s2) s2 = MatrixHelper.findBestSlot(p2Type, p2Start, p2Start + newPhase2Duration, timelineData, mockActiveEndTimes, null, rowId) || `${p2Type}-1`;

        if (!localOverridesRef.current[rowId]) localOverridesRef.current[rowId] = {};

        localOverridesRef.current[rowId].startTimeString = newStartTimeStringForSheet;
        localOverridesRef.current[rowId].phase1_duration = newPhase1Duration;
        localOverridesRef.current[rowId].phase2_duration = newPhase2Duration;
        localOverridesRef.current[rowId].storedLocation = s1;
        localOverridesRef.current[rowId].phase1_res_idx = s1.toUpperCase();
        localOverridesRef.current[rowId].phase2_res_idx = s2.toUpperCase();

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
                        phase1_res_idx: s1.toUpperCase(),
                        phase2_res_idx: s2.toUpperCase(),
                        isManualLocked: true,
                        ...(newStartTimeStringForSheet && { startTimeString: newStartTimeStringForSheet })
                    },
                    comboMeta: res.comboMeta ? { ...res.comboMeta, targetId: s2.toLowerCase() } : null,
                    ...(newStartTimeIso && { startTime: newStartTimeIso })
                };
            }
        });

        setResourceState(newState);
        if (!arg2 && controlCenterData) setControlCenterData(null);

        fetchData(true);

        const payload = {
            rowId,
            phase1_duration: newPhase1Duration,
            phase2_duration: newPhase2Duration,
            phase1_res_idx: s1.toUpperCase(),
            phase2_res_idx: s2.toUpperCase(),
            phase1Resource: s1.toUpperCase(),
            phase2Resource: s2.toUpperCase(),
            resource_type: resourceTypeForSheet,
            resourceType: resourceTypeForSheet,
            is_locked: "TRUE",
            isManualLocked: true,
            forceSync: true
        };

        if (newStartTimeStringForSheet) {
            payload.startTimeString = newStartTimeStringForSheet;
            payload.gioDen = startTimeStr;
        }

        try {
            await universalSend('/api/update-booking-details', payload);
            await updateResource(newState);
        } catch (e) {
            alert("⚠️ 儲存失敗！請檢查網路連線。");
        }
    };

    const handleSaveSingleTimeLoc = async (targetBooking, startTimeStr, newResId) => {
        if (!targetBooking) return;
        const rowId = String(targetBooking.rowId);

        setSyncLock(true);
        setTimeout(() => setSyncLock(false), 5000);

        let newStartTimeIso = null;
        let newStartTimeStringForSheet = null;

        if (startTimeStr) {
            const originalStartStr = targetBooking.startTimeString || "";
            let datePart = originalStartStr.split(' ')[0];

            if (!datePart) {
                const now = window.getTaipeiDate ? window.getTaipeiDate() : new Date();
                datePart = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
            }
            datePart = datePart.replace(/-/g, '/');

            newStartTimeStringForSheet = `${datePart} ${startTimeStr}`;

            const parts = startTimeStr.split(':');
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const dObj = new Date(datePart);
            if (!isNaN(dObj.getTime())) {
                dObj.setHours(h, m, 0, 0);
                newStartTimeIso = dObj.toISOString();
            }
        }

        let s1 = newResId && newResId !== 'auto' ? newResId.toLowerCase() : null;
        if (!s1) {
            s1 = targetBooking.current_resource_id || targetBooking.location || null;
        }
        if (s1) s1 = s1.toLowerCase();

        if (!localOverridesRef.current[rowId]) localOverridesRef.current[rowId] = {};
        if (newStartTimeStringForSheet) localOverridesRef.current[rowId].startTimeString = newStartTimeStringForSheet;
        if (s1) localOverridesRef.current[rowId].storedLocation = s1;
        localOverridesRef.current[rowId].isManualLocked = true;

        const newState = { ...resourceState };
        let hasChanges = false;
        let oldResId = null;

        Object.keys(newState).forEach(key => {
            const res = newState[key];
            if (res.booking && String(res.booking.rowId) === String(rowId)) {
                oldResId = key;
            }
        });

        if (oldResId) {
            const updatedResData = {
                ...newState[oldResId],
                booking: {
                    ...newState[oldResId].booking,
                    isManualLocked: true,
                    ...(newStartTimeStringForSheet && { startTimeString: newStartTimeStringForSheet }),
                    ...(s1 && { current_resource_id: s1.toUpperCase(), location: s1.toUpperCase() })
                },
                ...(newStartTimeIso && { startTime: newStartTimeIso })
            };

            if (s1 && oldResId !== s1) {
                newState[s1] = updatedResData;
                delete newState[oldResId];
            } else {
                newState[oldResId] = updatedResData;
            }
            hasChanges = true;
        }

        if (hasChanges) {
            setResourceState(newState);
        }

        fetchData(true);

        const payload = {
            rowId,
            is_locked: "TRUE",
            isManualLocked: true,
            forceSync: true
        };

        if (s1) {
            payload.current_resource_id = s1.toUpperCase();
            payload.location = s1.toUpperCase();
        }

        if (newStartTimeStringForSheet) {
            payload.startTimeString = newStartTimeStringForSheet;
            payload.gioDen = startTimeStr;
        }

        try {
            await universalSend('/api/update-booking-details', payload);
            if (hasChanges) await updateResource(newState);
        } catch (e) {
            alert("⚠️ 儲存失敗！請檢查網路連線。");
        }
    };

    const handleToggleSequence = async (resIdOrBooking, newFlow = null) => {
        let booking = null;
        let targetFlow = newFlow;

        if (typeof resIdOrBooking === 'string' && resourceState[resIdOrBooking]) {
            booking = resourceState[resIdOrBooking].booking;
            if (!targetFlow) {
                const currentSeq = resourceState[resIdOrBooking].comboMeta?.sequence || 'FB';
                targetFlow = currentSeq === 'FB' ? 'BF' : 'FB';
            }
        } else if (typeof resIdOrBooking === 'object') {
            booking = resIdOrBooking;
        }

        if (!booking || !targetFlow) return;

        const rowId = String(booking.rowId);

        setSyncLock(true);
        setTimeout(() => setSyncLock(false), 5000);

        const totalDuration = parseInt(booking.duration || 100);
        const split = getSmartSplit(booking, totalDuration, true, targetFlow);

        const p1Type = targetFlow === 'BF' ? 'bed' : 'chair';
        const p2Type = targetFlow === 'BF' ? 'chair' : 'bed';
        const resourceTypeForSheet = 'COMBO';

        let tryStart = 720;
        if (booking.startTimeString) {
            const timePart = booking.startTimeString.split(' ')[1];
            if (timePart) {
                try {
                    if (window.normalizeToTimelineMins) {
                        tryStart = window.normalizeToTimelineMins(timePart);
                    } else {
                        const [h, m] = timePart.split(':').map(Number);
                        tryStart = (h * 60) + (m || 0);
                        if (h < 5) tryStart += 1440; // Nâng cấp 5h
                    }
                } catch (e) { }
            }
        }

        const mockActiveEndTimes = {};
        Object.keys(resourceState).forEach(k => {
            if (resourceState[k].isRunning && resourceState[k].booking) {
                const b = resourceState[k];
                try {
                    const startObj = new Date(b.startTime);
                    const startMins = startObj.getHours() * 60 + startObj.getMinutes() + (startObj.getHours() < 5 ? 1440 : 0); // Nâng cấp 5h
                    mockActiveEndTimes[k] = startMins + (b.booking.duration || 60);
                } catch (e) { }
            }
        });

        const s1 = MatrixHelper.findBestSlot(p1Type, tryStart, tryStart + split.phase1, timelineData, mockActiveEndTimes, null, rowId) || `${p1Type}-1`;
        const p2Start = tryStart + split.phase1 + 5;
        const s2 = MatrixHelper.findBestSlot(p2Type, p2Start, p2Start + split.phase2, timelineData, mockActiveEndTimes, null, rowId) || `${p2Type}-1`;

        const phase1_res_idx = s1.toUpperCase();
        const phase2_res_idx = s2.toUpperCase();

        if (!localOverridesRef.current[rowId]) localOverridesRef.current[rowId] = {};
        localOverridesRef.current[rowId].flow = targetFlow;
        localOverridesRef.current[rowId].phase1_duration = split.phase1;
        localOverridesRef.current[rowId].phase2_duration = split.phase2;
        localOverridesRef.current[rowId].storedLocation = s1;
        localOverridesRef.current[rowId].phase1_res_idx = phase1_res_idx;
        localOverridesRef.current[rowId].phase2_res_idx = phase2_res_idx;

        const newState = { ...resourceState };
        let hasRunningChanges = false;
        Object.keys(newState).forEach(key => {
            const res = newState[key];
            if (res.booking && String(res.booking.rowId) === rowId) {
                res.booking.flow = targetFlow;
                res.booking.phase1_duration = split.phase1;
                res.booking.phase2_duration = split.phase2;
                res.booking.isManualLocked = true;

                if (res.comboMeta) {
                    res.comboMeta.sequence = targetFlow;
                    if (res.comboMeta.phase === 1) {
                        res.comboMeta.targetId = s2;
                    }
                }
                hasRunningChanges = true;
            }
        });

        if (hasRunningChanges) {
            setResourceState(newState);
        }

        if (controlCenterData && controlCenterData.booking && String(controlCenterData.booking.rowId) === rowId) {
            setControlCenterData(prev => {
                const newPrev = { ...prev, booking: { ...prev.booking, flow: targetFlow, phase1_duration: split.phase1, phase2_duration: split.phase2, isManualLocked: true } };
                if (newPrev.liveState && newPrev.liveState.comboMeta) {
                    newPrev.liveState.comboMeta.sequence = targetFlow;
                    if (newPrev.liveState.comboMeta.phase === 1) {
                        newPrev.liveState.comboMeta.targetId = s2;
                    }
                }
                return newPrev;
            });
        }

        fetchData(true);

        try {
            await universalSend('/api/update-booking-details', {
                rowId: rowId,
                flow: targetFlow,
                flow_code: targetFlow,
                phase1_duration: split.phase1,
                phase2_duration: split.phase2,
                phase1_res_idx: phase1_res_idx,
                phase2_res_idx: phase2_res_idx,
                phase1Resource: phase1_res_idx,
                phase2Resource: phase2_res_idx,
                resource_type: resourceTypeForSheet,
                resourceType: resourceTypeForSheet,
                is_locked: "TRUE",
                isManualLocked: true,
                forceSync: true
            });
            if (hasRunningChanges) {
                await updateResource(newState);
            }
        } catch (e) {
            console.error("Sync flow error", e);
        }
    };

    const handleVerticalResourceShift = async (currentResId, direction, targetBooking) => {
        if (!currentResId || !targetBooking) return;

        const parts = currentResId.split('-');
        const type = parts[0];
        const index = parseInt(parts[1], 10);
        if (isNaN(index)) return;

        const newIndex = index + direction;
        if (newIndex < 1 || newIndex > 9) return; // Nâng cấp 9

        const targetId = `${type}-${newIndex}`;
        const rowId = String(targetBooking.rowId);

        const gridSlots = timelineData[currentResId] || [];
        const slotToMove = gridSlots.find(s => String(s.booking.rowId) === rowId);

        if (!slotToMove) return;

        const { start, end, meta } = slotToMove;

        const targetSlots = timelineData[targetId] || [];
        let isClash = false;
        for (let slot of targetSlots) {
            if (String(slot.booking.rowId) !== rowId) {
                if (MatrixHelper.isOverlap(start, end, slot.start, slot.end)) {
                    isClash = true;
                    break;
                }
            }
        }

        if (isClash) {
            alert(`⚠️ 目標位置在該時段已有其他預約！無法移動。`);
            return;
        }

        setSyncLock(true);
        setTimeout(() => setSyncLock(false), 4000);

        const isRunning = meta && meta.isRunning;
        const isPrediction = meta && meta.isPrediction;
        const isPhase1 = meta && meta.phase === 1;
        const isPhase2 = meta && meta.phase === 2;

        if (isRunning) {
            const currentSlotData = resourceState[currentResId];
            if (currentSlotData) {
                if (!localOverridesRef.current[rowId]) localOverridesRef.current[rowId] = {};
                localOverridesRef.current[rowId].storedLocation = targetId;

                const newState = { ...resourceState };
                delete newState[currentResId];
                newState[targetId] = currentSlotData;

                setResourceState(newState);
                fetchData(true);

                try {
                    await universalSend('/api/update-booking-details', {
                        rowId: rowId,
                        current_resource_id: targetId,
                        record_location: true,
                        ...(isPhase1 && { phase1_res_idx: targetId.toUpperCase(), phase1Resource: targetId.toUpperCase() }),
                        ...(isPhase2 && { phase2_res_idx: targetId.toUpperCase(), phase2Resource: targetId.toUpperCase() }),
                        forceSync: true
                    });
                    await updateResource(newState);
                } catch (e) {
                    alert("⚠️ 轉換位置時發生連線錯誤！");
                }
            }
        } else if (isPrediction) {
            const newState = { ...resourceState };
            let found = false;

            Object.keys(newState).forEach(key => {
                const res = newState[key];
                if (res.isRunning && res.booking && String(res.booking.rowId) === rowId) {
                    res.comboMeta = { ...(res.comboMeta || {}), targetId: targetId };
                    found = true;
                }
            });

            if (found) {
                setResourceState(newState);
                fetchData(true);
                updateResource(newState).catch(() => console.error('Sync failed'));
            }
        } else {
            if (!localOverridesRef.current[rowId]) localOverridesRef.current[rowId] = {};
            localOverridesRef.current[rowId].storedLocation = targetId;
            if (isPhase1) localOverridesRef.current[rowId].phase1_res_idx = targetId.toUpperCase();
            if (isPhase2) localOverridesRef.current[rowId].phase2_res_idx = targetId.toUpperCase();

            fetchData(true);

            try {
                await universalSend('/api/update-booking-details', {
                    rowId: rowId,
                    current_resource_id: targetId,
                    location: targetId,
                    ...(isPhase1 && { phase1_res_idx: targetId.toUpperCase(), phase1Resource: targetId.toUpperCase() }),
                    ...(isPhase2 && { phase2_res_idx: targetId.toUpperCase(), phase2Resource: targetId.toUpperCase() }),
                    forceSync: true
                });
            } catch (e) {
                alert("⚠️ 轉換位置時發生連線錯誤！");
            }
        }
    };

    const handleOpenControlCenter = (bookingOrId, suggestedResourceId = null, meta = null) => {
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
            isPaused: liveContext ? liveContext.isPaused : false,
            meta: meta
        });
    };

    const executeStart = (id, comboSequence, silentMode = false, fallbackBooking = null) => {
        let current = resourceStateRef.current[id] || resourceState[id];

        if (!current && fallbackBooking) {
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

        if (current && current.isRunning) {
            if (current.comboMeta && current.comboMeta.phase === 1 && current.startTime) {
                const startTs = new Date(current.startTime).getTime();
                const elapsed = Date.now() - startTs;
                const split = getSmartSplit(current.booking, current.booking.duration || 100, current.isMaxMode, current.comboMeta.sequence);
                const phase1Ms = (split.phase1 + (current.comboMeta.flex || 0)) * 60000;

                if (elapsed >= phase1Ms) {
                    const targetId = current.comboMeta.targetId;
                    if (targetId && targetId !== id) {
                        const targetRes = resourceStateRef.current[targetId];
                        const isTargetFree = !targetRes || !targetRes.isRunning || String(targetRes.booking?.rowId) === String(current.booking.rowId);

                        if (isTargetFree) {
                            const rowId = String(current.booking.rowId);
                            if (!localOverridesRef.current[rowId]) localOverridesRef.current[rowId] = {};
                            localOverridesRef.current[rowId].storedLocation = targetId;

                            const newState = { ...resourceStateRef.current };
                            newState[targetId] = {
                                ...current,
                                comboMeta: { ...current.comboMeta, phase: 2 }
                            };
                            delete newState[id];

                            setResourceState(newState);
                            universalSend('/api/update-booking-details', { rowId, current_resource_id: targetId, location: targetId, forceSync: true });
                            universalSend('/api/sync-resource', newState);

                            current = fallbackBooking ? {
                                booking: fallbackBooking,
                                isRunning: false,
                                isPaused: false,
                                startTime: null,
                                isPreview: true,
                                isMaxMode: true,
                                comboMeta: null
                            } : null;
                        }
                    }
                }
            }

            if (current && current.isRunning) {
                if (!silentMode) alert(`⚠️ 位置 ${id} 忙碌中 (Running)!`);
                return;
            }
        }

        if (!current) {
            if (!silentMode) alert("⚠️ 系統錯誤：找不到位置資料。");
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

        const isComboService = !isStrict && ((current.booking.serviceName && current.booking.serviceName.includes('套餐')) || current.booking.category === 'COMBO' || comboSequence);
        let comboMeta = current.comboMeta || null;
        let actualSeq = comboSequence || current.booking.flow || 'FB';

        if (isComboService) {
            if (!comboSequence) {
                if (!current.booking.flow || current.booking.flow === 'null') {
                    const physicalType = currentId.split('-')[0];
                    if (physicalType === 'bed') actualSeq = 'BF';
                    else if (physicalType === 'chair') actualSeq = 'FB';
                } else {
                    actualSeq = current.booking.flow;
                }
            }

            if (!comboMeta) {
                let ghostTargetId = current.booking.phase2_res_idx ? current.booking.phase2_res_idx.toLowerCase() : null;
                comboMeta = { sequence: actualSeq, targetId: ghostTargetId, flex: (current.comboMeta && current.comboMeta.flex) || 0, phase: 1 };
            } else {
                comboMeta.phase = 1;
                comboMeta.sequence = actualSeq;
            }
        } else {
            comboMeta = null;
        }

        if (comboSequence && !isStrict) {
            const currentType = id.split('-')[0];
            const targetType = comboSequence === 'BF' ? 'bed' : 'chair';

            if ((comboSequence === 'BF' && currentType === 'chair') ||
                (comboSequence === 'FB' && currentType === 'bed')) {
                shouldMove = true;

                targetMoveId = current.booking.phase2_res_idx ? current.booking.phase2_res_idx.toLowerCase() : null;
                if (!targetMoveId) {
                    targetMoveId = current.booking.phase1_res_idx ? current.booking.phase1_res_idx.toLowerCase() : null;
                }
            }
        } else if (isStrict) {
            const type = id.split('-')[0];
            const force = current.booking.forceResourceType === 'CHAIR' ? 'chair' : 'bed';
            if (type !== force) {
                if (!silentMode) alert(`⚠️ 位置錯誤：此顧客必須安排在 ${force === 'chair' ? '足部區' : '身體區'}!`);
                setSyncLock(false);
                return;
            }
        }

        if (['隨機', '男', '女', 'Oil'].some(k => designatedStaff.includes(k))) {
            if (!staffList || staffList.length === 0) {
                if (!silentMode) alert("⚠️ 員工資料為空，請稍後再試！");
                setSyncLock(false); return;
            }

            const liveBusyStaffIds = Object.values(resourceStateRef.current)
                .filter(r => r.isRunning && !r.isPaused && r.isPreview !== true)
                .map(r => r.booking.serviceStaff || r.booking.staffId || r.booking.ServiceStaff);

            let readyCandidates = staffList.filter(s => {
                const stat = statusData ? statusData[s.id] : null;
                if (!stat || stat.status !== 'READY') return false;
                if (liveBusyStaffIds.includes(s.id)) return false;
                return true;
            });

            readyCandidates.sort((a, b) => {
                const timeA = statusData[a.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                const timeB = statusData[b.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                return timeA - timeB;
            });

            let foundStaff = null;

            const nowObj = window.getTaipeiDate ? window.getTaipeiDate() : new Date();
            const currentMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < 5 ? 1440 : 0); // Nâng cấp 5h
            const currentPhone = getNormalizedPhone(current.booking);

            for (let i = 0; i < readyCandidates.length; i++) {
                if (checkStaffCompatibility(readyCandidates[i], current.booking, designatedStaff)) {
                    const dur = current.booking.duration || window.getSafeDuration(current.booking.serviceName) || 60;
                    if (checkStaffFutureAvailability(readyCandidates[i].id, dur, bookings, currentMins, current.booking.rowId, currentPhone)) {
                        foundStaff = readyCandidates[i];
                        break;
                    }
                }
            }

            if (!foundStaff) {
                const genderMsg = designatedStaff.includes('男') ? " (男)" : designatedStaff.includes('女') ? " (女)" : "";
                if (!silentMode) alert(`⚠️ 找不到符合條件的技師${genderMsg}（可能因未來已有預約或條件不符）！`);
                setSyncLock(false); return;
            }
            finalServiceStaff = foundStaff.id;
        }

        if (shouldMove) {
            if (!targetMoveId) {
                if (!silentMode) alert("⚠️ 無法開始：未指定目標位置，請先在表格填寫位置！");
                setSyncLock(false); return;
            }
            currentId = targetMoveId;
        }

        const currentStaffTime = statusData[finalServiceStaff]?.stafftime || Date.now();
        const newStatusData = {
            ...statusData,
            [finalServiceStaff]: {
                ...statusData[finalServiceStaff],
                status: 'BUSY',
                stafftime: Date.now(),
                previousStafftime: currentStaffTime
            }
        };
        updateStaffStatus(newStatusData);

        const grpIdx = getGroupMemberIndex(currentId, current.booking.rowId);
        const newBooking = { ...current.booking, category: isComboService ? 'COMBO' : 'SINGLE', flow: actualSeq };

        if (grpIdx === 0) newBooking.serviceStaff = finalServiceStaff;
        else if (grpIdx === 1) newBooking.staffId2 = finalServiceStaff;
        else if (grpIdx === 2) newBooking.staffId3 = finalServiceStaff;
        else if (grpIdx === 3) newBooking.staffId4 = finalServiceStaff;
        else if (grpIdx === 4) newBooking.staffId5 = finalServiceStaff;
        else if (grpIdx === 5) newBooking.staffId6 = finalServiceStaff;

        const rowIdStr = String(current.booking.rowId);
        if (!localOverridesRef.current[rowIdStr]) localOverridesRef.current[rowIdStr] = {};
        localOverridesRef.current[rowIdStr].forceRunning = true;
        localOverridesRef.current[rowIdStr].storedLocation = currentId;

        if (isComboService && comboMeta) {
            const totalDur = current.booking.duration || 100;
            const split = getSmartSplit(current.booking, totalDur, true, comboMeta.sequence);
            localOverridesRef.current[rowIdStr].flow = comboMeta.sequence;
            localOverridesRef.current[rowIdStr].phase1_duration = split.phase1;
            localOverridesRef.current[rowIdStr].phase2_duration = split.phase2;
            localOverridesRef.current[rowIdStr].phase1_res_idx = currentId.toUpperCase();
            if (comboMeta.targetId) localOverridesRef.current[rowIdStr].phase2_res_idx = comboMeta.targetId.toUpperCase();
        }

        const newState = { ...resourceStateRef.current }; if (shouldMove) delete newState[id];

        newState[currentId] = {
            ...current,
            booking: newBooking,
            startTime: getScheduledStartTimeISO(current.booking),
            isRunning: true,
            isPreview: false,
            comboMeta
        };
        updateResource(newState);

        let primaryKey = "服務師傅1"; let fallbackKey = "ServiceStaff1";
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
            current_resource_id: currentId,
            record_location: true,
            status: '🟡 Running'
        };

        if (isComboService && comboMeta) {
            const totalDur = current.booking.duration || 100;
            const split = getSmartSplit(current.booking, totalDur, true, comboMeta.sequence);
            payload.flow = comboMeta.sequence;
            payload.flow_code = comboMeta.sequence;
            payload.phase1_duration = split.phase1;
            payload.phase2_duration = split.phase2;
            payload.phase1_res_idx = currentId.toUpperCase();
            if (comboMeta.targetId) payload.phase2_res_idx = comboMeta.targetId.toUpperCase();
        }

        universalSend('/api/update-booking-details', payload);
        axios.post('/api/update-status', { rowId: current.booking.rowId, status: '🟡 Running' });
    };

    const executeBatchStart = (mainResId, relatedItems) => {
        const nextResourceState = { ...resourceStateRef.current };
        const nextStatusData = { ...statusData };
        const apiPayloads = [];

        const allItemsToStart = [
            { resourceId: mainResId, booking: mainResId && nextResourceState[mainResId] ? nextResourceState[mainResId].booking : null },
            ...relatedItems
        ];

        setSyncLock(true);
        setTimeout(() => setSyncLock(false), 5000);

        allItemsToStart.forEach(item => {
            if (!item.booking) return;

            if (!item.resourceId) {
                let targetId = item.booking.phase1_res_idx || item.booking.current_resource_id || item.booking.storedLocation;
                if (targetId) {
                    item.resourceId = targetId.toLowerCase();
                }
            }

            if (!item.resourceId && timelineData) {
                for (const [resId, slots] of Object.entries(timelineData)) {
                    const validSlot = slots.find(s => {
                        if (String(s.booking.rowId) !== String(item.booking.rowId)) return false;
                        if (s.meta && s.meta.isCombo && s.meta.phase === 2) return false;
                        return true;
                    });

                    if (validSlot) {
                        if (!nextResourceState[resId] || !nextResourceState[resId].isRunning) {
                            item.resourceId = resId;
                            break;
                        }
                    }
                }
            }
        });

        const validItems = allItemsToStart.filter(item => item.resourceId && item.booking);

        const assignments = {};
        let unassignedItems = [...validItems];

        const currentlyBusyIds = Object.values(nextResourceState)
            .filter(r => r.isRunning && !r.isPaused && r.isPreview !== true)
            .map(r => r.booking.serviceStaff || r.booking.staffId);

        let readyCandidates = staffList.filter(s => {
            const stat = nextStatusData[s.id];
            return stat && stat.status === 'READY' && !currentlyBusyIds.includes(s.id);
        });

        readyCandidates.sort((a, b) => {
            const timeA = nextStatusData[a.id]?.stafftime || Number.MAX_SAFE_INTEGER;
            const timeB = nextStatusData[b.id]?.stafftime || Number.MAX_SAFE_INTEGER;
            return timeA - timeB;
        });

        const staffRankMap = {};
        readyCandidates.forEach((staff, index) => {
            staffRankMap[staff.id] = index;
        });

        const nowObj = window.getTaipeiDate ? window.getTaipeiDate() : new Date();
        const currentMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < 5 ? 1440 : 0); // Nâng cấp 5h

        let madeProgress = true;

        while (unassignedItems.length > 0 && readyCandidates.length > 0 && madeProgress) {
            madeProgress = false;

            let currentStaff = readyCandidates[0];
            let bestGuestIndex = -1;
            let bestScore = 0;

            for (let j = 0; j < unassignedItems.length; j++) {
                const item = unassignedItems[j];
                let req = item.booking.requestedStaff || item.booking.serviceStaff || item.booking.staffId || '隨機';
                if (req === 'undefined' || req === 'null') req = '隨機';

                const score = scoreStaffCompatibility(currentStaff, item.booking, req);

                if (score > 0 && score > bestScore) {
                    const dur = item.booking.duration || window.getSafeDuration(item.booking.serviceName) || 60;
                    const currentPhone = getNormalizedPhone(item.booking);
                    const isFutureClear = checkStaffFutureAvailability(currentStaff.id, dur, bookings, currentMins, item.booking.rowId, currentPhone);

                    if (isFutureClear) {
                        bestScore = score;
                        bestGuestIndex = j;
                    }
                }
            }

            if (bestGuestIndex !== -1) {
                const matchedItem = unassignedItems[bestGuestIndex];
                assignments[matchedItem.resourceId] = currentStaff.id;

                unassignedItems.splice(bestGuestIndex, 1);
                readyCandidates.shift();

                madeProgress = true;
            } else {
                readyCandidates.shift();
                madeProgress = true;
            }
        }

        let failedToStartCount = unassignedItems.length;

        validItems.forEach(item => {
            const { resourceId } = item;
            let finalServiceStaff = assignments[resourceId];

            if (!finalServiceStaff) {
                return;
            }

            let current = nextResourceState[resourceId];
            if (!current) {
                current = {
                    booking: item.booking,
                    isRunning: false,
                    isPaused: false,
                    startTime: null,
                    isPreview: true,
                    isMaxMode: true,
                    comboMeta: null
                };
            }

            if (current.isRunning) return;

            const currentStaffTime = nextStatusData[finalServiceStaff]?.stafftime || Date.now();

            const rank = staffRankMap[finalServiceStaff] !== undefined ? staffRankMap[finalServiceStaff] : 99;
            const newStaffTime = Date.now() + (rank * 10);

            nextStatusData[finalServiceStaff] = {
                ...nextStatusData[finalServiceStaff],
                status: 'BUSY',
                stafftime: newStaffTime,
                previousStafftime: currentStaffTime
            };

            const rowIdStr = String(item.booking.rowId);
            if (!localOverridesRef.current[rowIdStr]) localOverridesRef.current[rowIdStr] = {};
            localOverridesRef.current[rowIdStr].forceRunning = true;
            localOverridesRef.current[rowIdStr].storedLocation = resourceId;

            const grpIdx = getGroupMemberIndex(resourceId, current.booking.rowId);
            const isComboService = (current.booking.serviceName && current.booking.serviceName.includes('套餐')) || current.booking.category === 'COMBO';

            let newComboMeta = current.comboMeta;
            let actualSeq = current.booking.flow || 'FB';

            if (isComboService) {
                if (!current.booking.flow || current.booking.flow === 'null') {
                    const physicalType = resourceId.split('-')[0];
                    if (physicalType === 'bed') actualSeq = 'BF';
                    else if (physicalType === 'chair') actualSeq = 'FB';
                } else {
                    actualSeq = current.booking.flow;
                }

                if (!newComboMeta) {
                    let projectedTargetId = current.booking.phase2_res_idx ? current.booking.phase2_res_idx.toLowerCase() : null;
                    newComboMeta = { sequence: actualSeq, phase: 1, flex: 0, targetId: projectedTargetId };
                } else {
                    newComboMeta = { ...newComboMeta, phase: 1, sequence: actualSeq };
                }
            } else {
                newComboMeta = null;
            }

            const newBooking = { ...current.booking, category: isComboService ? 'COMBO' : 'SINGLE', flow: actualSeq };

            if (grpIdx === 0) newBooking.serviceStaff = finalServiceStaff;
            else if (grpIdx === 1) newBooking.staffId2 = finalServiceStaff;
            else if (grpIdx === 2) newBooking.staffId3 = finalServiceStaff;
            else if (grpIdx === 3) newBooking.staffId4 = finalServiceStaff;
            else if (grpIdx === 4) newBooking.staffId5 = finalServiceStaff;
            else if (grpIdx === 5) newBooking.staffId6 = finalServiceStaff;

            if (isComboService && newComboMeta) {
                const split = getSmartSplit(current.booking, current.booking.duration || 100, true, newComboMeta.sequence);
                localOverridesRef.current[rowIdStr].flow = newComboMeta.sequence;
                localOverridesRef.current[rowIdStr].phase1_duration = split.phase1;
                localOverridesRef.current[rowIdStr].phase2_duration = split.phase2;
                localOverridesRef.current[rowIdStr].phase1_res_idx = resourceId.toUpperCase();
                if (newComboMeta.targetId) localOverridesRef.current[rowIdStr].phase2_res_idx = newComboMeta.targetId.toUpperCase();
            }

            nextResourceState[resourceId] = {
                ...current,
                booking: newBooking,
                startTime: getScheduledStartTimeISO(item.booking),
                isRunning: true,
                isPreview: false,
                comboMeta: newComboMeta
            };

            let primaryKey = "服務師傅1"; let fallbackKey = "ServiceStaff1";
            if (grpIdx === 1) { primaryKey = "服務師傅2"; fallbackKey = "ServiceStaff2"; }
            else if (grpIdx === 2) { primaryKey = "服務師傅3"; fallbackKey = "ServiceStaff3"; }
            else if (grpIdx === 3) { primaryKey = "服務師傅4"; fallbackKey = "ServiceStaff4"; }
            else if (grpIdx === 4) { primaryKey = "服務師傅5"; fallbackKey = "ServiceStaff5"; }
            else if (grpIdx === 5) { primaryKey = "服務師傅6"; fallbackKey = "ServiceStaff6"; }

            let comboPayloadAdditions = {};
            if (isComboService && newComboMeta) {
                const split = getSmartSplit(current.booking, current.booking.duration || 100, true, newComboMeta.sequence);
                comboPayloadAdditions = {
                    flow: newComboMeta.sequence,
                    flow_code: newComboMeta.sequence,
                    phase1_duration: split.phase1,
                    phase2_duration: split.phase2,
                    phase1_res_idx: resourceId.toUpperCase(),
                    ...(newComboMeta.targetId && { phase2_res_idx: newComboMeta.targetId.toUpperCase() })
                };
            }

            apiPayloads.push({
                endpoint: '/api/update-booking-details',
                data: {
                    rowId: current.booking.rowId,
                    [primaryKey]: finalServiceStaff,
                    [fallbackKey]: finalServiceStaff,
                    [`staff${grpIdx + 1}`]: finalServiceStaff,
                    current_resource_id: resourceId,
                    record_location: true,
                    status: '🟡 Running',
                    ...comboPayloadAdditions
                }
            });

            apiPayloads.push({
                endpoint: '/api/update-status',
                data: { rowId: current.booking.rowId, status: '🟡 Running' }
            });
        });

        if (failedToStartCount > 0) {
            const failedNames = unassignedItems.map(item => item.booking.customerName.split('(')[0].trim()).join(', ');
            alert(`⚠️ 警告: 有 ${failedToStartCount} 位客人無法自動開始。\n\n原因: 無符合條件的技師 或 未指定座位。\n未啟動客人: ${failedNames}\n\n他們已保留在等待區。`);
        }

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
        else if (action === 'cancel') { if (confirm('確定將顧客從位置移除？')) { const n = { ...resourceState }; delete n[id]; updateResource(n); } }
        else if (action === 'cancel_midway') {
            if (confirm('確定要棄單 (Drop)？\n此操作會標記為「取消」並釋放此位置。')) {
                const ridStr = String(current.booking.rowId);
                if (localOverridesRef.current[ridStr]) {
                    delete localOverridesRef.current[ridStr];
                }

                await axios.post('/api/update-status', { rowId: current.booking.rowId, status: '❌ 取消' });
                const n = { ...resourceState };
                const staffId = current.booking.serviceStaff || current.booking.staffId;
                if (staffId !== '隨機' && statusData[staffId]) {
                    const newStatus = { ...statusData, [staffId]: { status: 'READY', checkInTime: Date.now(), stafftime: Date.now() } };
                    updateStaffStatus(newStatus);
                }
                delete n[id]; updateResource(n); fetchData();
            }
        }
        else if (action === 'finish') {
            const related = findRelatedForCheckout(current.booking, id);
            if (related.length > 0) {
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
        if (!currentData) return;
        const isStrict = currentData.booking.isForcedSingle === true;
        const requiredType = currentData.booking.forceResourceType;
        const targetTypeString = toType === 'chair' ? 'CHAIR' : 'BED';

        if (isStrict && requiredType !== targetTypeString) {
            alert(`⛔️ 阻擋：此服務限定為 ${requiredType === 'CHAIR' ? '足部' : '身體'}，無法轉場至 ${targetTypeString === 'CHAIR' ? '足部' : '身體'}！`);
            return;
        }

        for (let i = 1; i <= 9; i++) { // Nâng cấp 9
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
        alert(`該區域 (${toType === 'chair' ? '足部區' : '身體區'}) 已無空位！`);
    };

    const handleToggleMax = async (resId) => { const res = resourceState[resId]; if (!res) return; updateResource({ ...resourceState, [resId]: { ...res, isMaxMode: !res.isMaxMode } }); };

    const handleConfirmPayment = async (itemsToPay, totalAmount) => {
        try {
            setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);
            const newState = { ...resourceState };
            const newStatusData = { ...statusData };
            const updatesByRow = {};
            const baseTime = Date.now();

            const checkoutStaffInfo = [];

            for (let i = 0; i < itemsToPay.length; i++) {
                const item = itemsToPay[i];
                const b = item.booking;
                const rid = String(b.rowId);
                const resId = item.resourceId;

                if (localOverridesRef.current[rid]) {
                    delete localOverridesRef.current[rid];
                }

                let targetIndex = -1;
                const currentStaff = b.serviceStaff || b.staffId;

                if (currentStaff && currentStaff !== '隨機' && currentStaff !== 'undefined') {
                    const staffCols = [b.serviceStaff || b.staffId, b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6];
                    targetIndex = staffCols.findIndex(s => s && s.trim() === currentStaff.trim());
                }
                if (targetIndex === -1) {
                    if (resId) {
                        const seatNum = parseInt(resId.replace(/\D/g, ''));
                        if (!isNaN(seatNum) && seatNum > 0) targetIndex = Math.min(seatNum - 1, 5);
                        else targetIndex = 0;
                    } else {
                        targetIndex = 0;
                    }
                }

                const statusNum = targetIndex + 1;
                const statusColEnglish = `Status${statusNum}`;
                if (!updatesByRow[rid]) { updatesByRow[rid] = { rowId: rid, forceSync: true, originalBooking: b }; }
                updatesByRow[rid][statusColEnglish] = '✅ 完成';

                let staffId = null;
                if (targetIndex === 0) staffId = b.serviceStaff || b.staffId;
                else if (targetIndex === 1) staffId = b.staffId2;
                else if (targetIndex === 2) staffId = b.staffId3;
                else if (targetIndex === 3) staffId = b.staffId4;
                else if (targetIndex === 4) staffId = b.staffId5;
                else if (targetIndex === 5) staffId = b.staffId6;

                if (staffId && staffId !== '隨機' && staffId !== 'undefined') {
                    const duration = window.getSafeDuration(b.serviceName, b.duration);
                    const blocks = getServiceBlocks(b.serviceName);
                    checkoutStaffInfo.push({ staffId, duration, blocks });
                }

                if (resId && newState[resId]) {
                    delete newState[resId];
                }
            }

            const isGroup = checkoutStaffInfo.length >= 2 || (itemsToPay.length > 0 && parseInt(itemsToPay[0].booking.pax) >= 2);
            const uniqueBlocks = [...new Set(checkoutStaffInfo.map(i => i.blocks))];
            const minGroupDuration = checkoutStaffInfo.length > 0 ? Math.min(...checkoutStaffInfo.map(i => i.duration)) : 0;

            checkoutStaffInfo.forEach(info => {
                const currentStaffTime = statusData[info.staffId]?.stafftime || baseTime;
                let newStaffTime = currentStaffTime;

                // --- NÂNG CẤP BỎ ĐẶC QUYỀN ĐƠN NGẮN (BLOCKS === 1) ---
                if (!isGroup) {
                    newStaffTime = currentStaffTime + (info.duration * 60000);
                }
                else if (isGroup && uniqueBlocks.length === 1) {
                    newStaffTime = currentStaffTime + (minGroupDuration * 60000);
                }
                else if (isGroup && uniqueBlocks.length > 1) {
                    newStaffTime = currentStaffTime + (info.duration * 60000);
                }

                newStatusData[info.staffId] = {
                    status: 'READY',
                    checkInTime: baseTime,
                    stafftime: newStaffTime
                };
            });

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
                if (activeSlotsCount > 0 && finishedSlotsCount >= activeSlotsCount) {
                    updatePayload.mainStatus = '✅ 完成';
                }
                delete updatePayload.originalBooking;
            });

            updateResource(newState); updateStaffStatus(newStatusData); setBillingData(null);
            const apiCalls = Object.values(updatesByRow).map(payload => axios.post('/api/update-booking-details', payload));

            await Promise.all(apiCalls); alert(`✅ 結帳成功: $${totalAmount}`);
        } catch (e) { alert("⚠️ 連線錯誤，請檢查網路！"); }
    };

    const handleControlAction = (actionType, payload) => {
        const targetBooking = payload.currentBooking || (controlCenterData ? controlCenterData.booking : null);
        const targetResourceId = payload.resourceId || (controlCenterData ? controlCenterData.resourceId : null);

        switch (actionType) {
            case 'OPEN_CONTROL_CENTER':
                handleOpenControlCenter(targetBooking, targetResourceId, payload.currentMeta);
                break;

            case 'FORCE_FIX_DURATION':
                if (targetBooking && payload.standardDuration) {
                    handleForceFixDuration(targetBooking, payload.standardDuration);
                }
                setControlCenterData(null);
                break;

            case 'START':
                if (targetResourceId) {
                    if (resourceState[targetResourceId] && resourceState[targetResourceId].isRunning) {
                        alert(`⚠️ 位置 ${targetResourceId} 忙碌中！請選擇其他座位。`);
                    } else {
                        const relatedWaiters = findRelatedWaitingBookings(targetBooking, targetResourceId);

                        if (relatedWaiters.length > 0) {
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
                    alert("⚠️ 請先將此訂單拖入座位/床位再開始！");
                }
                setControlCenterData(null);
                break;

            case 'PAUSE':
                if (targetResourceId) handleResourceAction(targetResourceId, 'pause');
                setControlCenterData(null);
                break;

            case 'FINISH':
                if (targetResourceId && targetBooking) {
                    const related = findRelatedForCheckout(targetBooking, targetResourceId);
                    if (related.length > 0) {
                        setPaymentChoiceData({
                            resourceId: targetResourceId,
                            booking: targetBooking,
                            relatedIds: related.map(r => r.resourceId),
                            relatedDetails: related
                        });
                    } else {
                        setBillingData({
                            activeItem: { resourceId: targetResourceId, booking: targetBooking },
                            relatedItems: []
                        });
                    }
                } else if (targetBooking) {
                    setBillingData({
                        activeItem: { resourceId: null, booking: targetBooking },
                        relatedItems: []
                    });
                }
                setControlCenterData(null);
                break;

            case 'CANCEL':
                if (targetResourceId && resourceState[targetResourceId] && !resourceState[targetResourceId].isPreview) {
                    handleResourceAction(targetResourceId, 'cancel_midway');
                } else if (targetBooking) {
                    if (confirm('確定要取消此預約嗎？\n(若為團體客，將取消整組預約)')) {
                        const ridStr = String(targetBooking.rowId);
                        if (localOverridesRef.current[ridStr]) delete localOverridesRef.current[ridStr];
                        axios.post('/api/update-status', { rowId: targetBooking.rowId, status: '❌ 取消' })
                            .then(() => fetchData(true))
                            .catch(() => alert('取消失敗，請檢查網路。'));
                    }
                }
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

            case 'CHANGE_STAFF':
                if (targetBooking && payload.newStaff) {
                    if (targetResourceId && resourceState[targetResourceId]) {
                        handleStaffChange(targetResourceId, payload.newStaff);
                    } else {
                        const rowId = String(targetBooking.rowId);
                        setSyncLock(true); setTimeout(() => setSyncLock(false), 3000);

                        if (controlCenterData && String(controlCenterData.booking.rowId) === rowId) {
                            setControlCenterData(prev => ({
                                ...prev,
                                booking: { ...prev.booking, serviceStaff: payload.newStaff }
                            }));
                        }

                        universalSend('/api/update-booking-details', {
                            rowId: rowId,
                            服務師傅1: payload.newStaff,
                            ServiceStaff1: payload.newStaff,
                            technician: payload.newStaff,
                            staff1: payload.newStaff,
                            forceSync: true
                        });
                        fetchData(true);
                    }
                }
                break;

            case 'UPDATE_PHASE':
                if (targetBooking && payload.phase1 !== undefined) {
                    handleSaveComboTime(
                        payload.phase1,
                        targetBooking,
                        payload.startTimeStr,
                        payload.switchTimeStr,
                        payload.phase1_res_idx,
                        payload.phase2_res_idx
                    );
                }
                setControlCenterData(null);
                break;

            case 'UPDATE_SINGLE_TIME_LOC':
                if (targetBooking && payload.startTimeStr) {
                    handleSaveSingleTimeLoc(
                        targetBooking,
                        payload.startTimeStr,
                        payload.newResId
                    );
                }
                setControlCenterData(null);
                break;

            case 'TOGGLE_SEQUENCE':
                if (targetBooking && payload.newFlow) {
                    handleToggleSequence(targetBooking, payload.newFlow);
                } else if (targetResourceId) {
                    handleToggleSequence(targetResourceId);
                }
                break;

            case 'SHIFT_RESOURCE':
            case 'SHIFT_TIME':
                const direction = payload.direction || 1;
                if (targetResourceId) {
                    handleVerticalResourceShift(targetResourceId, direction, targetBooking);
                }
                break;
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

        if (!activeBooking) return;

        if (mode === 'SEPARATE' || mode === 'INDIVIDUAL') {
            setBillingData({
                activeItem: { resourceId: activeResId, booking: activeBooking },
                relatedItems: []
            });
        } else {
            const related = activeResId ? findRelatedForCheckout(activeBooking, activeResId) : [];
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

    const handleWalkInSave = async (data) => { await axios.post('/api/admin-booking', data); setShowAvailability(false); fetchData(); };
    const handleManualUpdateStatus = async (rowId, status) => { if (confirm('確認更新狀態?')) { await axios.post('/api/update-status', { rowId, status }); fetchData(); } };
    const handleRetryConnection = () => { setQuotaError(false); fetchData(true); };

    const safeStaffList = useMemo(() => staffList || [], [staffList]);

    const safeBookings = Array.isArray(bookings) ? bookings : [];

    const todaysBookings = useMemo(() => {
        return safeBookings.filter(b => {
            if (!b.startTimeString) return false;
            return window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate);
        });
    }, [safeBookings, viewDate]);

    const enrichedStaffList = useMemo(() => {
        const nowObj = window.getTaipeiDate ? window.getTaipeiDate() : new Date();
        const currentMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < 5 ? 1440 : 0); // Nâng cấp 5h

        return safeStaffList.map(s => {
            const staffId = String(s.id).trim();
            const staffName = String(s.name).trim();

            const hasDesignated = todaysBookings.some(b => {
                if (!b.status || !b.status.includes('已預約')) return false;
                if (b.isDoneStatus || b.isRunningStatus) return false;

                if (!b.startTimeString) return false;
                const timeStr = b.startTimeString.split(' ')[1];
                if (!timeStr) return false;

                let bookMins = 0;
                if (window.normalizeToTimelineMins) {
                    bookMins = window.normalizeToTimelineMins(timeStr);
                } else {
                    const [h, m] = timeStr.split(':').map(Number);
                    bookMins = (h * 60) + (m || 0);
                    if (h < 5) bookMins += 1440; // Nâng cấp 5h
                }

                const diff = bookMins - currentMins;

                if (diff < -20 || diff > 120) return false;

                const reqStaff = String(b.requestedStaff || b.serviceStaff || b.staffId || b.ServiceStaff || b.technician || '').trim();
                if (!reqStaff) return false;

                const reqStaffLower = reqStaff.toLowerCase();
                const exactBlacklist = ['隨機', '男', '女', 'oil', 'undefined', 'null', '不指定', '現場', 'random', 'male', 'female', 'any'];

                if (exactBlacklist.includes(reqStaffLower)) return false;
                if (reqStaffLower.includes('隨機') || reqStaffLower.includes('不指定')) return false;

                return reqStaff === staffId || reqStaff === staffName || reqStaffLower === staffId.toLowerCase() || reqStaffLower === staffName.toLowerCase();
            });

            return {
                ...s,
                hasUpcomingDesignated: hasDesignated
            };
        });
    }, [safeStaffList, todaysBookings]);

    const staffGroups = useMemo(() => {
        if (window.StaffSorter && typeof window.StaffSorter.organizeStaff === 'function') {
            return window.StaffSorter.organizeStaff(enrichedStaffList, statusData, resourceState);
        }
        return { busy: [], ready: [], away: [], readyQueueIds: [] };
    }, [enrichedStaffList, statusData, resourceState]);

    const awayStaff = staffGroups.away || [];
    const busyStaff = staffGroups.busy || [];
    const readyStaff = staffGroups.ready || [];
    const readyQueue = staffGroups.readyQueueIds || [];

    const waitingList = todaysBookings.filter(b => !b.status.includes('完成') && !b.status.includes('✅') && b.status === '已預約');

    const visualReadyStaff = readyStaff;

    return (
        <div className="min-h-screen flex flex-col bg-slate-50">
            <header className={`text-white p-3 shadow-md flex justify-between items-center sticky top-0 z-50 transition-colors ${quotaError ? 'bg-red-800' : 'bg-[#1e1b4b]'}`}>
                <div className="flex items-center gap-3">
                    <span className="bg-emerald-500 text-white px-2 py-1 rounded font-black text-sm shadow-sm">V109.0</span>
                    <span className="font-bold hidden md:inline tracking-wider">XinWuChan</span>
                    <div className="flex items-center gap-2 bg-white/10 rounded px-2 py-1 border border-white/20">
                        <button onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate() - 1); setViewDate(d.toISOString().split('T')[0]) }} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                        <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} className="bg-transparent text-white font-bold outline-none cursor-pointer text-center" style={{ colorScheme: 'dark' }} />
                        <button onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate() + 1); setViewDate(d.toISOString().split('T')[0]) }} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={() => setActiveTab('timeline')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab === 'timeline' ? 'bg-purple-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-purple-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-stream"></i> <span className="hidden md:inline">時間軸 (Timeline)</span></button>
                    <button onClick={() => setActiveTab('list')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab === 'list' ? 'bg-cyan-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-cyan-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-list"></i> <span className="hidden md:inline">列表 (List)</span></button>
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

                    <button onClick={() => setShowAvailability(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded font-bold text-sm flex gap-1 items-center shadow-md animate-pulse ml-2"><i className="fas fa-phone-volume"></i> <span className="hidden lg:inline">電話預約</span></button>

                    <button onClick={() => setShowCheckIn(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-bold text-sm flex gap-1 items-center"><i className="fas fa-user-clock"></i> <span className="hidden lg:inline">技師報到</span></button>
                </div>
            </header>

            <div className="bg-white border-b shadow-sm p-2 overflow-x-auto whitespace-nowrap staff-scroll">
                <div className="flex w-full justify-end items-center min-w-max">
                    <div className="flex items-center flex-1 justify-end pl-2">
                        <div className="flex gap-1 px-2 border-r border-red-100 flex-row-reverse">
                            {busyStaff.map(s => window.StaffCard3D && <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} isForcedBusy={true} />)}
                        </div>
                        <div className="flex flex-row-reverse gap-1 pl-2">
                            {visualReadyStaff.map((s, idx) => { const qIdx = readyQueue.indexOf(s.id); return window.StaffCard3D && <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} queueIndex={qIdx !== -1 ? qIdx : undefined} />; })}
                        </div>
                    </div>
                </div>
            </div>

            <main className="flex-1 p-4 overflow-y-auto">
                {activeTab === 'list' && window.BookingListView && (
                    <window.BookingListView
                        bookings={todaysBookings}
                        onCancelBooking={handleManualUpdateStatus}
                        onInlineUpdate={handleInlineUpdate}
                    />
                )}

                {activeTab === 'timeline' && window.TimelineView && (
                    <window.TimelineView
                        timelineData={timelineData}
                        liveStatusData={resourceState}
                        onEditPhase={handleControlAction}
                        onOpenControlCenter={handleOpenControlCenter}
                        staffList={staffList}
                        statusData={statusData}
                    />
                )}
            </main>

            {showCheckIn && window.CheckInBoard && <window.CheckInBoard staffList={staffList} statusData={statusData} onUpdateStatus={updateStaffStatus} onClose={() => setShowCheckIn(false)} bookings={todaysBookings} />}
            {showAvailability && window.AvailabilityCheckModal && <window.AvailabilityCheckModal onClose={() => setShowAvailability(false)} onSave={handleWalkInSave} staffList={staffList} bookings={bookings} initialDate={viewDate} />}
            {comboStartData && window.ComboStartModal && <window.ComboStartModal onConfirm={confirmComboStart} onCancel={() => setComboStartData(null)} bookingName={comboStartData.booking.serviceName} />}

            {selectedSlot && waitingList.length === 0 && <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center text-white font-bold" onClick={() => setSelectedSlot(null)}>目前無候位! (No Waiting)</div>}

            {billingData && window.BillingModal && <window.BillingModal activeItem={billingData.activeItem} relatedItems={billingData.relatedItems} onConfirm={handleConfirmPayment} onCancel={() => setBillingData(null)} />}

            {splitData && window.SplitStaffModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10005, pointerEvents: 'none' }}>
                    <div style={{ pointerEvents: 'auto', width: '100%', height: '100%' }}>
                        <window.SplitStaffModal staffList={staffList} statusData={statusData} onCancel={() => setSplitData(null)} onConfirm={handleSplitConfirm} />
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
                            <button onClick={() => setPaymentChoiceData(null)} className="w-full mt-6 text-gray-400 hover:text-gray-600 font-bold text-xs uppercase tracking-wider text-center">關閉 / 返回 (Cancel)</button>
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
                                    找到 {startChoiceData.relatedDetails.length} 位同行者 (總人數: {startChoiceData.relatedDetails.length + 1} 位):
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {startChoiceData.relatedDetails.map(item => (
                                        <span key={item.resourceId || Math.random()} className="bg-white border border-emerald-200 text-emerald-700 px-2 py-1 rounded text-xs font-mono font-bold shadow-sm">
                                            {item.resourceId ? item.resourceId.replace('bed-', '床 ').replace('chair-', '足 ') : '已鎖定預測位置'}
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
                                        <div className="text-[10px] opacity-80 font-normal">立即啟動 {startChoiceData.relatedDetails.length + 1} 人 (Batch Execute)</div>
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
                    meta={controlCenterData.meta}
                    liveData={controlCenterData.liveState}
                    contextResourceId={controlCenterData.resourceId}
                    staffList={staffList}
                    statusData={statusData}
                    timelineData={timelineData}
                    resourceState={resourceState}
                />
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<window.ErrorBoundary><App /></window.ErrorBoundary>);
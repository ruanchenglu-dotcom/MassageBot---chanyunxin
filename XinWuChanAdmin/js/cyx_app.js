// TYPE: app.js
// VERSION: V109.8 (EARLY RETURN FOR STAFF CONFLICT IN PHONE BOOKING)
// UPDATE: 2026-04-15
//
// --- CHANGE LOG V109.8 ---
// 1. [EARLY-RETURN]: Thêm vòng lặp kiểm tra trùng lặp thợ chỉ định trực tiếp tại handleWalkInSave.
// 2. [UX]: Chặn lưu và hiển thị cảnh báo Phồn Thể "❌ 技師 [ID] 於此時段已被預約" nếu phát hiện kẹt lịch.
// 3. [DATA]: Hỗ trợ bóc tách linh hoạt data đầu vào (Object hoặc Array cho Group Booking).
// --- CHANGE LOG V109.7 ---
// 1. [REFACTOR]: Thêm Timestamp cache-busting vào /api/info khi force refresh.
// 2. [UX]: Thêm delay 800ms cho nút "立即刷新" và dọn dẹp Quota Error.
// 3. [DATA]: Quét sạch localOverridesRef khi Refresh thủ công để ép đồng bộ Server State.
// 4. [RACE-CONDITION]: Khóa chặt luồng auto-polling khi đang diễn ra manual refresh.
// 5. [DATA-NORMALIZE]: Thêm hàm normalizeStaffId xử lý triệt để mâu thuẫn ID ("01" -> "1").

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// --- 1. COMPONENT IMPORTS ---
const CommissionView = window.CommissionView;
const TimelineView = window.TimelineView;
const BookingListView = window.BookingListView;
const BookingControlModal = window.BookingControlModal || window.ComboTimeEditModal;

// --- STATUS FALLBACK (SINGLE SOURCE OF TRUTH) ---
const APP_STATUS = window.BOOKING_STATUS || {
    WAITING: '等待中',
    SERVING: '服務中',
    COMPLETED: '已完成',
    CANCELLED: '已取消'
};

// --- PURE FUNCTION: SỬ DỤNG HÀM CHUNG TỪ STAFF SORTER ---
const normalizeStaffId = window.normalizeStaffId || window.StaffSorter?.normalizeStaffId;

// --- PURE FUNCTION: QUY ĐỔI TỌA ĐỘ THỜI GIAN (TIME TO MINUTES) ---
// Khắc phục lỗi timezone: Tách trực tiếp chuỗi cơ học, KHÔNG dùng đối tượng Date()
const safeTimeToMins = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    try {
        // Lấy giờ mở cửa từ config hoặc mặc định là 5 (5 AM)
        const openHour = window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 5;
        // Xử lý cả trường hợp chuỗi có chứa ngày "YYYY/MM/DD 17:20" hoặc chỉ là "17:20"
        const timePart = timeStr.includes(' ') ? timeStr.split(' ')[1] : timeStr;
        const [hStr, mStr] = timePart.split(':');
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);

        if (isNaN(h) || isNaN(m)) return 0;

        let totalMins = (h * 60) + m;
        // Xử lý ca đêm (ví dụ: 01:00 AM sẽ là thời gian của ngày hôm trước kéo dài sang)
        if (h < openHour) {
            totalMins += 1440; // Cộng thêm 24 tiếng (1440 phút)
        }
        return totalMins;
    } catch (e) {
        console.error("Time Parse Error:", e);
        return 0;
    }
};

// --- HÀM TRỢ GIÚP: CHUYỂN ĐỔI ISO DATE SANG GIỜ CHUẨN ĐÀI LOAN (UTC+8) ---
// Khắc phục triệt để lỗi lệch múi giờ khi trình duyệt của Admin ở múi giờ khác Đài Loan
const getTaipeiTimeStr = (isoStr) => {
    if (!isoStr) return "00:00";
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return "00:00";
        return d.toLocaleTimeString('en-US', {
            timeZone: 'Asia/Taipei',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        console.error("getTaipeiTimeStr Error:", e);
        return "00:00";
    }
};

// --- HÀM TRỢ GIÚP TÍNH "節數" (BLOCKS) CHO QUY TẮC D ---
const getServiceBlocks = (serviceName) => {
    if (!serviceName) return 0;

    if (window.SERVICES_DATA) {
        if (window.SERVICES_DATA[serviceName] && window.SERVICES_DATA[serviceName].blocks) {
            return window.SERVICES_DATA[serviceName].blocks;
        }

        const foundKey = Object.keys(window.SERVICES_DATA).find(key => {
            const data = window.SERVICES_DATA[key];
            return data.name === serviceName || serviceName.includes(data.name) || serviceName.includes(key);
        });
        
        if (foundKey && window.SERVICES_DATA[foundKey].blocks) {
            return window.SERVICES_DATA[foundKey].blocks;
        }
    }

    const name = String(serviceName).toUpperCase();

    if (name.includes('A4') || name.includes('B4') || name.includes('130') || name.includes('120')) return 4;
    if (name.includes('A3') || name.includes('B3') || name.includes('F3') || name.includes('110') || name.includes('招牌')) return 3;
    if (name.includes('A2') || name.includes('B2') || name.includes('F2') || name.includes('70') || name.includes('精選')) return 2;
    if (name.includes('B1') || name.includes('F1') || name.includes('C1') || name.includes('C2') || name.includes('40') || name.includes('35') || name.includes('刮痧') || name.includes('拔罐') || name.includes('修指甲') || name.includes('修腳皮')) return 1;

    return 2;
};

// --- HELPER: BÓC TÁCH THỜI GIAN CHUẨN TỪ TÊN DỊCH VỤ ---
const extractStandardDuration = (serviceName) => {
    if (!serviceName) return null;
    const match = serviceName.match(/(190|180|170|160|150|140|130|120|110|100|90|80|75|70|65|60|55|50|45|40|35|30)/);
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
        const limit = type.includes('chair') ? window.SYSTEM_CONFIG.SCALE.MAX_CHAIRS : window.SYSTEM_CONFIG.SCALE.MAX_BEDS;
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
            if (!isClash) count++;
        }
        return count;
    },
    findBestSlot: (type, start, end, gridState, reservedTimes, preferredIndexOrId = null, ignoreRowId = null, preferOpposite = false) => {
        const limitMain = type.includes('chair') ? (window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS || 6) : (window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS || 6);
        const limitOpp = type.includes('chair') ? (window.SYSTEM_CONFIG?.SCALE?.OPP_CHAIRS || 4) : (window.SYSTEM_CONFIG?.SCALE?.OPP_BEDS || 6);

        if (preferredIndexOrId) {
            let id;
            if (typeof preferredIndexOrId === 'string' && preferredIndexOrId.includes('-')) {
                id = preferredIndexOrId;
            } else {
                id = preferOpposite ? `opp-${type}-${preferredIndexOrId}` : `${type}-${preferredIndexOrId}`;
            }

            if (id.includes(type)) {
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

        const checkSlot = (id) => {
            if (reservedTimes[id] && start < reservedTimes[id]) return false;
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
            return !isClash;
        };

        if (preferOpposite) {
            for (let i = 1; i <= limitOpp; i++) {
                const id = `opp-${type}-${i}`;
                if (checkSlot(id)) return id;
            }
            for (let i = 1; i <= limitMain; i++) {
                const id = `${type}-${i}`;
                if (checkSlot(id)) return id;
            }
        } else {
            for (let i = 1; i <= limitMain; i++) {
                const id = `${type}-${i}`;
                if (checkSlot(id)) return id;
            }
            for (let i = 1; i <= limitOpp; i++) {
                const id = `opp-${type}-${i}`;
                if (checkSlot(id)) return id;
            }
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
    const oldTotalDuration = booking.duration ? parseInt(booking.duration) : null;
    
    // Only reuse existing phase splits if the total duration hasn't changed
    if (oldTotalDuration === totalDuration) {
        if (booking.phase1_duration !== undefined && booking.phase1_duration !== null && booking.phase1_duration > 0 &&
            booking.phase2_duration !== undefined && booking.phase2_duration !== null) {
            
            if (parseInt(booking.phase1_duration) + parseInt(booking.phase2_duration) === totalDuration) {
                const p1 = parseInt(booking.phase1_duration);
                const p2 = parseInt(booking.phase2_duration);
                if (p1 > 0 && p2 > 0) {
                    return { phase1: p1, phase2: p2 };
                }
            }
        }
        if (booking.phase1_duration && booking.phase1_duration > 0) {
            const p1 = parseInt(booking.phase1_duration);
            if (p1 < totalDuration) {
                return { phase1: p1, phase2: totalDuration - p1 };
            }
        }
    }
    
    // If duration changed or no valid split found, recalculate from scratch
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

// --- APP COMPONENT ---
const App = () => {
    // 1. STATE MANAGEMENT
    const [activeTab, setActiveTab] = useState('timeline-main');

    const [staffList, setStaffList] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [resourceState, setResourceState] = useState({});
    const [statusData, setStatusData] = useState({});
    const [timelineData, setTimelineData] = useState({});

    // Modal States
    const [showCheckIn, setShowCheckIn] = useState(false);
    const [salaryData, setSalaryData] = useState({});
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

    useEffect(() => {
        if (showCheckIn) {
            axios.get('/api/today-salary').then(res => {
                if (res.data && res.data.success) {
                    setSalaryData(res.data.data || {});
                }
            }).catch(e => console.error("Fetch salary error", e));
        }
    }, [showCheckIn]);

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
            const formattedDate = datePart.includes('T') ? datePart.split('T')[0] : datePart;
            const hh = String(hours || 0).padStart(2, '0');
            const mm = String(minutes || 0).padStart(2, '0');
            
            return `${formattedDate}T${hh}:${mm}:00.000+08:00`;
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
        const maxChairs = window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS || 6;
        const maxBeds = window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS || 6;
        const oppChairs = window.SYSTEM_CONFIG?.SCALE?.OPP_CHAIRS || 4;
        const oppBeds = window.SYSTEM_CONFIG?.SCALE?.OPP_BEDS || 6;
        for (let i = 1; i <= maxChairs; i++) allSlots.push(`chair-${i}`);
        for (let i = 1; i <= maxBeds; i++) allSlots.push(`bed-${i}`);
        for (let i = 1; i <= oppChairs; i++) allSlots.push(`opp-chair-${i}`);
        for (let i = 1; i <= oppBeds; i++) allSlots.push(`opp-bed-${i}`);
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
        
        const hasGroupSuffix = (name) => /\(\d+\/\d+\)/.test(name || "");
        const getBaseName = (name) => {
            if (!name) return "";
            return name.replace(/\(\d+\/\d+\)/, '').trim().toLowerCase();
        };
        const currentHasSuffix = hasGroupSuffix(currentBooking.customerName);
        const currentNameBase = getBaseName(currentBooking.customerName);

        const mappedFromResource = [];
        const seenMappedRowIds = new Set([currentRowId]); // LOẠI BỎ CHÍNH NÓ (Ngăn bóng ma Phase 2 của Combo tự nhận diện)
        
        Object.keys(resourceState).forEach(k => {
            if (k !== excludeResourceId && !resourceState[k].isRunning && resourceState[k].isPreview === true) {
                // [NÂNG CẤP V1.5] Bỏ qua Phase 2 của Combo (Chỉ lấy tài nguyên Phase 1 để bắt đầu xuất phát đúng Ghế/Giường)
                if (resourceState[k].comboMeta && resourceState[k].comboMeta.phase === 2) return;

                const otherBooking = resourceState[k].booking;
                const otherRowId = String(otherBooking.rowId);
                const otherPhone = getNormalizedPhone(otherBooking);
                
                if (!seenMappedRowIds.has(otherRowId)) {
                    const isSamePhone = currentPhone && currentPhone.length >= 4 && currentPhone === otherPhone;
                    
                    const otherHasSuffix = hasGroupSuffix(otherBooking.customerName);
                    const otherNameBase = getBaseName(otherBooking.customerName);
                    const isSameNameGroup = currentHasSuffix && otherHasSuffix && currentNameBase && currentNameBase === otherNameBase;

                    if (isSamePhone || isSameNameGroup) {
                        seenMappedRowIds.add(otherRowId);
                        mappedFromResource.push({ resourceId: k, booking: otherBooking });
                    }
                }
            }
        });

        const mappedRowIds = new Set(mappedFromResource.map(m => String(m.booking.rowId)));
        mappedRowIds.add(currentRowId);

        const unmappedBookings = bookings.filter(b => {
            if (b.isDoneStatus || b.isRunningStatus) return false;
            if (mappedRowIds.has(String(b.rowId))) return false;

            // Thêm kiểm tra loại trừ bóng ma chính nó
            if (String(b.rowId) === currentRowId) return false;

            const otherPhone = getNormalizedPhone(b);
            if (currentPhone && currentPhone.length >= 4 && currentPhone === otherPhone) {
                // Đã loại bỏ ràng buộc thời gian (t1 === t2). Chỉ duy nhất nhóm theo Số Điện Thoại.
                return true;
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

        const relatedItems = [];
        const seenRowIds = new Set([currentRowId]); // LOẠI BỎ CHÍNH NÓ LÚC CHECKOUT: Không đếm nó là 1 khách hàng đi cùng
        
        Object.keys(resourceState).forEach(k => {
            if (k !== excludeResourceId && (resourceState[k].isRunning || resourceState[k].isPreview === true)) {
                const otherBooking = resourceState[k].booking;
                const otherRowId = String(otherBooking.rowId);
                const otherPhone = getNormalizedPhone(otherBooking);
                
                if (!seenRowIds.has(otherRowId)) {
                    if (currentPhone && currentPhone.length >= 4 && currentPhone === otherPhone) {
                        seenRowIds.add(otherRowId);
                        relatedItems.push({ resourceId: k, booking: otherBooking });
                    }
                }
            }
        });
        
        return relatedItems;
    };

    const universalSend = async (endpoint, payload) => {
        try { 
            const res = await axios.post(endpoint, payload);
            if (res.data && res.data.error) throw new Error(res.data.error);
            return { success: true, data: res.data };
        } catch (e) { 
            console.log("Universal send check (ignore):", e); 
            const errorMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
            return { success: false, error: errorMsg };
        }
    };

    const handleForceFixDuration = async (booking, standardDuration) => {
        if (!booking || !standardDuration) return;
        const rowId = String(booking.rowId);
        const newDuration = parseInt(standardDuration, 10);

        Swal.fire({ title: '確認', text: `💡 溫馨提示：請問確定要將時長強制同步為標準時間 (${newDuration} 分鐘) 嗎？`, icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }).then(async (res) => { if (res.isConfirmed) { 
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
                Swal.fire('系統提示', "💡 溫馨提示：資料同步發生異常，請幫忙確認一下網路連線喔！", 'warning');
            }
        } });
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
                                    phase2_res_idx: targetId,
                                    forceSync: true
                                });
                            }
                        }
                    }
                }
            });

            if (hasChanges) {
                setResourceState(newState);
                if (apiPayloads.length > 0) {
                    universalSend('/api/batch-process-bookings', { payloads: apiPayloads });
                }
                universalSend('/api/sync-resource', newState);
            }
        }, 5000);

        return () => clearInterval(watchdog);
    }, [syncLock]);

    // 3. CORE LOGIC (FETCH & RENDER) 
    const fetchData = async (actionType = false) => {
        const isManual = actionType === true;
        const isInternalSave = actionType === 'KEEP_OVERRIDES';
        const isForceFetch = isManual || isInternalSave;

        if (syncLock && !isForceFetch) return;
        if (quotaError && !isForceFetch) return;

        // Block auto-polling if manual refresh is spinning
        if (!isForceFetch && isManualRefreshingRef.current) return;

        if (isManual) {
            setIsManualRefreshing(true);
            isManualRefreshingRef.current = true;
            // Dọn dẹp localOverridesRef để ép client hiển thị dữ liệu gốc từ Server
            localOverridesRef.current = {};
        }

        try {
            // Nâng cấp: Nối Timestamp để phá triệt để Cache của Trình duyệt khi Force Refresh
            const endpoint = isForceFetch ? `/api/info?forceRefresh=true&_t=${Date.now()}` : '/api/info';
            const res = await axios.get(endpoint, { timeout: 15000 });
            setQuotaError(false);

            if (res.data.services) {
                // Chỉ nhận danh sách dịch vụ, GIỮ NGUYÊN cấu hình hệ thống
                window.DYNAMIC_PRICES_MAP = res.data.services;
                window.SERVICES_DATA = res.data.services;
                const uniqueNames = [...new Set(Object.values(res.data.services).map(s => s.name))];
                window.SERVICES_LIST = uniqueNames;
            }

            // Đồng bộ config tự động từ Resource của API
            if (res.data.resources) {
                if (!window.SYSTEM_CONFIG) window.SYSTEM_CONFIG = { SCALE: {}, OPERATION_TIME: {}, LOGIC_RULES: {}, BUFFERS: {}, FINANCE: {} };
                window.SYSTEM_CONFIG.SCALE.MAX_CHAIRS = res.data.resources.chairs || 6;
                window.SYSTEM_CONFIG.SCALE.MAX_BEDS = res.data.resources.beds || 6;
                window.SYSTEM_CONFIG.SCALE.OPP_CHAIRS = res.data.resources.oppChairs || 4;
                window.SYSTEM_CONFIG.SCALE.OPP_BEDS = res.data.resources.oppBeds || 6;
            }

            const { bookings: apiBookings, staffList: apiStaff, resourceState: serverRes, staffStatus: serverStaff, quickNotes: apiQuickNotes, blacklist: apiBlacklist } = res.data;

            if (apiQuickNotes) {
                window.QUICK_NOTES = apiQuickNotes;
            }

            if (!window.SYSTEM_DATA) window.SYSTEM_DATA = {};
            if (apiBlacklist) window.SYSTEM_DATA.blacklist = apiBlacklist;

            let nextResourceState = { ...(serverRes || {}) };

            Object.keys(localOverridesRef.current).forEach(rowId => {
                const override = localOverridesRef.current[rowId];
                if (override) {
                    let currentResId = null;

                    Object.keys(nextResourceState).forEach(key => {
                        if (nextResourceState[key] && nextResourceState[key].booking && String(nextResourceState[key].booking.rowId) === rowId) {
                            currentResId = key;
                        }
                    });

                    if (currentResId) {
                        if (override.phase1_duration !== undefined) nextResourceState[currentResId].booking.phase1_duration = override.phase1_duration;
                        if (override.phase2_duration !== undefined) nextResourceState[currentResId].booking.phase2_duration = override.phase2_duration;
                        if (override.startTimeString !== undefined) nextResourceState[currentResId].booking.startTimeString = override.startTimeString;
                        if (override.duration !== undefined) nextResourceState[currentResId].booking.duration = override.duration;

                        if (override.storedLocation && currentResId !== override.storedLocation) {
                            const targetResId = override.storedLocation;
                            nextResourceState[targetResId] = nextResourceState[currentResId];
                            delete nextResourceState[currentResId];
                        }
                    }
                }
            });

            const cleanBookings = (apiBookings || []).map(b => {
                let targetB = { ...b };

                // === NORMALIZE KHỐI STAFF ID ĐỂ TRÁNH LỖI SO SÁNH ===
                targetB.serviceStaff = normalizeStaffId(targetB.serviceStaff);
                targetB.staffId = normalizeStaffId(targetB.staffId);
                targetB.staffId2 = normalizeStaffId(targetB.staffId2);
                targetB.staffId3 = normalizeStaffId(targetB.staffId3);
                targetB.staffId4 = normalizeStaffId(targetB.staffId4);
                targetB.staffId5 = normalizeStaffId(targetB.staffId5);
                targetB.staffId6 = normalizeStaffId(targetB.staffId6);
                targetB.ServiceStaff = normalizeStaffId(targetB.ServiceStaff);
                targetB.technician = normalizeStaffId(targetB.technician);
                targetB.requestedStaff = normalizeStaffId(targetB.requestedStaff);

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
                    if (override.forceRunning && (!rawStatus || !rawStatus.includes('Running') && !rawStatus.includes(APP_STATUS.SERVING))) isSynced = false;
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
                            targetB.status = APP_STATUS.SERVING;
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
                // [V116.5 Logic] Auto-Fix thời lượng sai lệch cho mọi loại hình (Single, Combo, Group)
                const originalDur = finalDur;
                const hasAnomaly = standardDur > 0 && finalDur > standardDur;
                
                if (hasAnomaly) {
                    finalDur = standardDur;
                    isAutoFixed = true;
                    if (override) override.duration = standardDur; // Update override
                }

                const isTimeAnomaly = hasAnomaly;
                const anomalyDiff = isTimeAnomaly ? (originalDur - standardDur) : 0;

                let serviceCode = targetB.serviceCode;
                if (!serviceCode || serviceCode.trim() === '') {
                    serviceCode = targetB.serviceName ? targetB.serviceName.replace(/\s*\([^)]*油推[^)]*\)/g, '').substring(0, 3).trim() : '---';
                }

                let displayStaff = targetB.serviceStaff || targetB.staffId || targetB.ServiceStaff || targetB.technician || '隨機';
                if (!displayStaff || displayStaff === 'undefined' || displayStaff === 'null' || displayStaff === '') {
                    displayStaff = '隨機';
                }

                const isGuaSha = targetB.isGuaSha === true;

                // Đồng bộ startTimeMins cho thuật toán của StaffSorter V13 (Sử dụng hàm Pure Function an toàn)
                const startTimeMins = safeTimeToMins(targetB.startTimeString);

                // [V116.4 Nội Suy Thông Minh] Giải cứu vị trí Ghế/Giường bị kẹt từ allocated_resource
                let safePhase1ResIdx = targetB.phase1_res_idx;
                if (!safePhase1ResIdx) {
                    if (targetB.phase1_resource) {
                        safePhase1ResIdx = targetB.phase1_resource;
                    } else if (targetB.allocated_resource && targetB.allocated_resource.includes('+')) {
                        safePhase1ResIdx = targetB.allocated_resource.split('+')[0].trim();
                    } else if (targetB.allocated_resource) {
                        safePhase1ResIdx = targetB.allocated_resource;
                    }
                }

                let safePhase2ResIdx = targetB.phase2_res_idx;
                if (!safePhase2ResIdx) {
                    if (targetB.phase2_resource) {
                        safePhase2ResIdx = targetB.phase2_resource;
                    } else if (targetB.allocated_resource && targetB.allocated_resource.includes('+')) {
                        safePhase2ResIdx = targetB.allocated_resource.split('+')[1].trim();
                    }
                }

                let computedStoredLocation = targetB.current_resource_id;
                if (computedStoredLocation === '本館' || computedStoredLocation === '對面館') {
                    computedStoredLocation = null;
                }
                if (!computedStoredLocation && safePhase1ResIdx) {
                    computedStoredLocation = safePhase1ResIdx.toLowerCase();
                } else if (!computedStoredLocation && targetB.allocated_resource) {
                    computedStoredLocation = targetB.allocated_resource.split('+')[0].trim().toLowerCase();
                }

                return {
                    ...targetB,
                    id: String(targetB.rowId), // ADDED FOR STAFF SORTER
                    startTimeMins: startTimeMins, // ADDED FOR STAFF SORTER & TIMELINE
                    cleanServiceName: cleanName,
                    serviceCode: serviceCode,
                    displayStaff: displayStaff,
                    isYouTui: targetB.isYouTui || (targetB.serviceName && targetB.serviceName.includes('油')),
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
                    phase1_res_idx: safePhase1ResIdx,
                    phase2_res_idx: safePhase2ResIdx,
                    isManualLocked: isLocked,
                    originalNote: targetB.ghiChu || targetB.note || "",
                    forceResourceType: forceResourceType,
                    isForcedSingle: isForcedSingle,

                    isRunningStatus: (rawStatus.includes('Running') || rawStatus.includes('服務中') || rawStatus.toLowerCase().includes('running') || rawStatus.includes(APP_STATUS.SERVING)),
                    isDoneStatus: (rawStatus.includes('完成') || rawStatus.includes('Done') || rawStatus.includes('✅') || rawStatus.toLowerCase().includes('cancel') || rawStatus.includes('取消') || rawStatus.includes('爽約') || rawStatus.toUpperCase().includes('NOSHOW') || rawStatus.includes(APP_STATUS.COMPLETED) || rawStatus.includes(APP_STATUS.CANCELLED) || rawStatus.includes(APP_STATUS.NOSHOW)),
                    storedLocation: computedStoredLocation,

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
                    !safeStatus.toLowerCase().includes('cancel') && !safeStatus.includes('取消') && !safeStatus.includes('爽約') && !safeStatus.toUpperCase().includes('NOSHOW') && !safeStatus.includes(APP_STATUS.CANCELLED) && !safeStatus.includes(APP_STATUS.NOSHOW);
            });

            if (apiStaff && apiStaff.length > 0) {
                // Làm sạch ID cho staff list
                const cleanStaffList = apiStaff.map(s => ({
                    ...s,
                    id: normalizeStaffId(s.id)
                }));
                setStaffList(cleanStaffList);
            } else if (!staffList || staffList.length === 0) {
                setStaffList([]);
            }

            if (serverStaff && Object.keys(serverStaff).length > 0) {
                // Làm sạch key cho status data
                const cleanStatusData = {};
                Object.keys(serverStaff).forEach(k => {
                    cleanStatusData[normalizeStaffId(k)] = serverStaff[k];
                });
                setStatusData(cleanStatusData);
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
                        // [V136.1 FIX] Đồng bộ thực tế startTime của ca đang chạy khi có thay đổi trên Google Sheets
                        if (res.isRunning && freshData.startTimeString) {
                            res.startTime = getScheduledStartTimeISO(freshData);
                        }
                        activeSignatures.add(getBookingSignature(freshData));
                        
                        // [V136 NÂNG CẤP] Dò tìm sự thay đổi vị trí vật lý để sửa key
                        let expectedKey = key;
                        if (res.comboMeta && res.comboMeta.phase === 2) {
                            if (freshData.phase2_res_idx) expectedKey = freshData.phase2_res_idx.toLowerCase();
                        } else {
                            if (freshData.phase1_res_idx) expectedKey = freshData.phase1_res_idx.toLowerCase();
                            else if (freshData.storedLocation) expectedKey = freshData.storedLocation.toLowerCase();
                            else if (freshData.current_resource_id) expectedKey = freshData.current_resource_id.toLowerCase();
                            else if (freshData.location) expectedKey = freshData.location.toLowerCase();
                        }

                        if (expectedKey && expectedKey !== key) {
                            if (!window._keysToMove) window._keysToMove = [];
                            window._keysToMove.push({ oldKey: key, newKey: expectedKey });
                        }
                    }
                }
            });

            // Thực hiện di dời key an toàn
            if (window._keysToMove && window._keysToMove.length > 0) {
                window._keysToMove.forEach(({ oldKey, newKey }) => {
                    if (!nextResourceState[newKey] || !nextResourceState[newKey].isRunning || String(nextResourceState[newKey].booking?.rowId) === String(nextResourceState[oldKey].booking?.rowId)) {
                        nextResourceState[newKey] = nextResourceState[oldKey];
                        delete nextResourceState[oldKey];
                    }
                });
                window._keysToMove = [];
            }

            relevantBookings.forEach(b => {
                if (b.isRunningStatus) {
                    if (activeRowIds.has(String(b.rowId)) || activeSignatures.has(getBookingSignature(b))) {
                        return;
                    }

                    let targetResId = null;
                    if (b.storedLocation && !nextResourceState[b.storedLocation]) {
                        if (/^(opp-)?(chair|bed)-\d$/.test(b.storedLocation)) {
                            targetResId = b.storedLocation;
                        }
                    }

                    if (!targetResId) {
                        const type = (b.forceResourceType === 'BED' || b.flow === 'BODYSINGLE') ? 'bed' : 'chair';
                        const isOpp = b.location === '對面館';
                        const prefix = isOpp ? `opp-${type}` : type;
                        const limit = isOpp 
                            ? (type === 'chair' ? (window.SYSTEM_CONFIG?.SCALE?.OPP_CHAIRS || 4) : (window.SYSTEM_CONFIG?.SCALE?.OPP_BEDS || 6))
                            : (type === 'chair' ? (window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS || 6) : (window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS || 6));
                            
                        for (let i = 1; i <= limit; i++) {
                            const tid = `${prefix}-${i}`;
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
            const openHour = window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 5;
            const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < openHour ? 1440 : 0);

            let tempState = {};
            const activeEndTimes = {};
            const timelineGrid = {};

            const addToGrid = (resId, start, end, booking, meta) => {
                if (booking.isDoneStatus) return;
                if (!resId) return;
                const rIdStr = String(resId).toLowerCase();
                if (!timelineGrid[rIdStr]) timelineGrid[rIdStr] = [];
                timelineGrid[rIdStr].push({ start, end, booking, meta });
            };

            Object.keys(nextResourceState).forEach(key => {
                if (nextResourceState[key].isRunning) {
                    tempState[key] = nextResourceState[key];
                    const startMins = safeTimeToMins(getTaipeiTimeStr(nextResourceState[key].startTime));

                    const b = nextResourceState[key].booking;
                    let durationUsed = b.duration;
                    let isPhase1 = false;
                    const isStrict = b.isForcedSingle === true;
                    const isComboSvc = b.category === 'COMBO' || (b.serviceName && b.serviceName.includes('套餐'));

                    if (isComboSvc && !isStrict && !tempState[key].comboMeta) {
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

                    if (tempState[key].comboMeta && !isStrict) {
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
                        let p2Start = finishTimeMins + (window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5);
                        let p2End = p2Start + split.phase2;

                        if (item.booking.transition_time) {
                            const transMins = safeTimeToMins(item.booking.transition_time);
                            if (transMins !== -1) p2Start = Math.max(transMins, finishTimeMins);
                        }
                        if (item.booking.finish_time) {
                            const finishMins = safeTimeToMins(item.booking.finish_time);
                            if (finishMins !== -1) p2End = Math.max(finishMins, p2Start);
                        } else {
                            p2End = p2Start + split.phase2;
                        }

                        let finalTargetId = item.booking.phase2_res_idx ? item.booking.phase2_res_idx.toLowerCase() : null;

                        if (finalTargetId) {
                            addToGrid(finalTargetId, p2Start, p2End, item.booking, {
                                isCombo: true, phase: 2, sequence: seq, originId: key, isPrediction: false, priority: 2,
                                isRunning: false
                            });
                        }
                    } else {
                        const p2StartMins = safeTimeToMins(getTaipeiTimeStr(item.startTime));
                        let p1End = p2StartMins - (window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5);
                        let p1Start = p1End - split.phase1;

                        if (item.booking.transition_time) {
                            const transMins = safeTimeToMins(item.booking.transition_time);
                            if (transMins !== -1) p1End = Math.min(p1End, transMins);
                        }
                        if (item.booking.startTimeString) {
                            const origStart = safeTimeToMins(item.booking.startTimeString);
                            if (origStart !== -1) p1Start = Math.min(origStart, p1End);
                        } else {
                            p1Start = p1End - split.phase1;
                        }

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
                
                const comboSubGroup = [];
                group.forEach(b => {
                    const isForceSingle = b.forceResourceType !== null;
                    const isCombo = !isForceSingle && (b.category === 'COMBO' || (b.serviceName && b.serviceName.includes('套餐')));
                    
                    if (isCombo) {
                        comboSubGroup.push(b);
                    } else {
                        listSingles.push(b);
                    }
                });
                
                if (comboSubGroup.length > 0) {
                    listCombosGroups.push(comboSubGroup);
                }
            });

            const sortFn = (a, b) => safeTimeToMins(a.startTimeString) - safeTimeToMins(b.startTimeString);
            listSingles.sort(sortFn);
            listCombosGroups.sort((a, b) => sortFn(a[0], b[0]));

            listSingles.forEach(b => {
                if (b.isDoneStatus) return;
                if (activeRowIds.has(String(b.rowId))) return;
                const originalStart = safeTimeToMins(b.startTimeString);
                let targetId = b.current_resource_id ? b.current_resource_id.toLowerCase() : (b.phase1_res_idx ? b.phase1_res_idx.toLowerCase() : (b.storedLocation ? b.storedLocation.toLowerCase() : null));
                if (targetId === '本館' || targetId === '對面館') {
                    targetId = b.phase1_res_idx ? b.phase1_res_idx.toLowerCase() : null;
                }
                if (targetId && b.location === '對面館' && !targetId.startsWith('opp-')) {
                    targetId = 'opp-' + targetId;
                }

                if (!targetId) {
                    // Do not auto-assign. Let it remain unassigned.
                }

                if (targetId) {
                    const isCrossShop = (b.originalName && b.originalName.includes('[跨館]')) || (b.serviceName && b.serviceName.includes('跨館'));
                    const drawDur = isCrossShop && b.phase1_duration ? parseInt(b.phase1_duration) : parseInt(b.duration || 60);
                    addToGrid(targetId, originalStart, originalStart + drawDur, b, { isCombo: false, isPending: true, priority: 3, isRunning: b.isRunningStatus });
                }
            });

            listCombosGroups.forEach(group => {
                const firstBooking = group[0];
                const originalStart = safeTimeToMins(firstBooking.startTimeString);

                group.forEach((bookingItem) => {
                    if (bookingItem.isDoneStatus) return;
                    if (bookingItem.forceResourceType) return;
                    if (activeRowIds.has(String(bookingItem.rowId))) return;

                    let pref1 = bookingItem.phase1_res_idx ? bookingItem.phase1_res_idx.toLowerCase() : null;
                    let pref2 = bookingItem.phase2_res_idx ? bookingItem.phase2_res_idx.toLowerCase() : null;
                    
                    if (bookingItem.location === '對面館') {
                        if (pref1 && !pref1.startsWith('opp-')) pref1 = 'opp-' + pref1;
                        if (pref2 && !pref2.startsWith('opp-')) pref2 = 'opp-' + pref2;
                    }

                    const seq = bookingItem.flow || 'FB';

                    if (pref1 || pref2) {
                        const split = getSmartSplit(bookingItem, bookingItem.duration, true, seq);
                        let p1End = originalStart + split.phase1;
                        let p2Start = p1End + (window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5);
                        let p2End = p2Start + split.phase2;

                        if (bookingItem.transition_time) {
                            const transMins = safeTimeToMins(bookingItem.transition_time);
                            if (transMins !== -1) {
                                p1End = Math.min(p1End, transMins);
                                p2Start = transMins;
                            }
                        }
                        if (bookingItem.finish_time) {
                            const finishMins = safeTimeToMins(bookingItem.finish_time);
                            if (finishMins !== -1) {
                                p2End = Math.max(p2Start, finishMins);
                            }
                        }

                        if (pref1) {
                            let isClash1 = false;
                            if (timelineGrid[pref1]) {
                                for (const slot of timelineGrid[pref1]) {
                                    if (String(slot.booking.rowId) !== String(bookingItem.rowId) && window.MatrixHelper?.isOverlap(originalStart, p1End, slot.start, slot.end)) {
                                        isClash1 = true; break;
                                    }
                                }
                            }
                            addToGrid(pref1, originalStart, p1End, bookingItem, { isCombo: true, phase: 1, sequence: seq, targetId: pref2, isPending: true, priority: 3, isRunning: bookingItem.isRunningStatus, isOverlapped: isClash1 });
                        }
                        if (pref2) {
                            let isClash2 = false;
                            if (timelineGrid[pref2]) {
                                for (const slot of timelineGrid[pref2]) {
                                    if (String(slot.booking.rowId) !== String(bookingItem.rowId) && window.MatrixHelper?.isOverlap(p2Start, p2End, slot.start, slot.end)) {
                                        isClash2 = true; break;
                                    }
                                }
                            }
                            addToGrid(pref2, p2Start, p2End, bookingItem, { isCombo: true, phase: 2, sequence: seq, isPending: true, priority: 3, isRunning: bookingItem.isRunningStatus, isOverlapped: isClash2 });
                        }
                    }
                });
            });

            setTimelineData(timelineGrid);

            const allSlots = [];
            const maxChairs = window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS || 6;
            const maxBeds = window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS || 6;
            const oppChairs = window.SYSTEM_CONFIG?.SCALE?.OPP_CHAIRS || 4;
            const oppBeds = window.SYSTEM_CONFIG?.SCALE?.OPP_BEDS || 6;
            for (let i = 1; i <= maxChairs; i++) allSlots.push(`chair-${i}`);
            for (let i = 1; i <= maxBeds; i++) allSlots.push(`bed-${i}`);
            for (let i = 1; i <= oppChairs; i++) allSlots.push(`opp-chair-${i}`);
            for (let i = 1; i <= oppBeds; i++) allSlots.push(`opp-bed-${i}`);

            allSlots.forEach(resId => {
                if (tempState[resId]) return;
                const slots = timelineGrid[resId] || [];
                const currentSlot = slots.find(s => (nowMins >= s.start && nowMins < s.end));

                if (currentSlot) {
                    const nameLabel = currentSlot.booking.pax > 1 ? `${currentSlot.booking.customerName} (團體)` : currentSlot.booking.customerName;
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
                    universalSend('/api/batch-process-bookings', { payloads: syncPayloads });
                }
            } catch (err) {
                console.error("Auto sync error:", err);
            }

        } catch (e) {
            console.error("API Error", e);
            if (e.response && e.response.status === 429) setQuotaError(true);
        } finally {
            if (isManual) {
                // Thêm độ trễ để người dùng kịp thấy phản hồi loading của nút nhấn
                setTimeout(() => {
                    setIsManualRefreshing(false);
                    isManualRefreshingRef.current = false;
                }, 800);
            }
        }
    };

    useEffect(() => {
        fetchData(false);
        const t = setInterval(() => {
            // Không chạy auto-polling nếu đang trong quá trình refresh thủ công (chống race-condition)
            if (!isManualRefreshingRef.current) {
                fetchData(false);
            }
        }, 2000);
        return () => clearInterval(t);
    }, [viewDate, syncLock, quotaError]);

    const handleForceRefresh = () => {
        if (isManualRefreshingRef.current) return;
        setQuotaError(false); // Xóa lỗi hiển thị (nếu có) trước khi tải lại
        fetchData(true);
    };

    const handleInlineUpdate = async (rowId, updatedData) => {
        try {
            const currentBooking = bookings.find(b => String(b.rowId) === String(rowId));
            if (currentBooking) {
                const isYouTuiToggledOn = updatedData.isYouTui === true && !currentBooking.isYouTui;
                const isServiceOilAdded = updatedData.dichVu && updatedData.dichVu.includes('油推') && !(currentBooking.serviceName || '').includes('油推');

                if (isYouTuiToggledOn || isServiceOilAdded) {
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
                        const isCombo = updatedData.dichVu.includes('套餐') || (window.SERVICES_DATA && window.SERVICES_DATA[updatedData.dichVu] && window.SERVICES_DATA[updatedData.dichVu].category === 'COMBO');
                        if (isCombo) {
                            const split = getSmartSplit(currentBooking, newStandardDur, true, 'FB');
                            updatedData.phase1_duration = split.phase1;
                            updatedData.phase2_duration = split.phase2;
                        } else {
                            updatedData.phase1_duration = newStandardDur;
                            updatedData.phase2_duration = "";
                        }
                    }
                }
            }

            // Normalize ID trước khi update để tránh gửi ID lỗi
            if (updatedData.nhanVien !== undefined) updatedData.nhanVien = normalizeStaffId(updatedData.nhanVien);
            if (updatedData.requestedStaff !== undefined) updatedData.requestedStaff = normalizeStaffId(updatedData.requestedStaff);

            if (window.cyxCallCoreAvailabilityCheck) {
                const guestDetails = [{
                    service: updatedData.dichVu || currentBooking.serviceName,
                    staff: updatedData.nhanVien || '隨機'
                }];
                const checkBookings = bookings.filter(b => String(b.rowId) !== String(rowId));
                const finalCheck = window.cyxCallCoreAvailabilityCheck(updatedData.ngayDen || currentBooking.date, updatedData.gioDen || currentBooking.startTime, guestDetails, checkBookings, staffList);
                
                if (finalCheck && finalCheck.valid && finalCheck.hasElasticWarning && finalCheck.warningMsgs && finalCheck.warningMsgs.length > 0) {
                    const confirmResult = await Swal.fire({
                        title: '⚠️ 彈性安排提示',
                        html: finalCheck.warningMsgs.join('<br>') + '<br><br>請問是否確認接受此彈性安排？',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: '✅ 確認',
                        cancelButtonText: '❌ 取消'
                    });
                    
                    if (!confirmResult.isConfirmed) {
                        return;
                    }
                }
            }

            Swal.fire({
                title: '儲存中，請稍候...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const res = await axios.post('/api/inline-update-booking', {
                rowId: rowId,
                updatedData: updatedData
            });

            if (res.data && res.data.error) {
                throw new Error(res.data.error);
            }

            // Xóa bộ nhớ đệm giả nếu có trước đó
            if (localOverridesRef.current[String(rowId)]) {
                delete localOverridesRef.current[String(rowId)];
            }

            Swal.close();
            fetchData(true); // STRICT ONE-WAY FLOW: Ép tải lại từ Sheet

        } catch (e) {
            console.error("Inline update failed:", e);
            const errorMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
            if (errorMsg && errorMsg.includes('RESOURCE_CONFLICT')) {
                const parts = errorMsg.split('|');
                Swal.fire('系統提示', `⚠️ 警告：資源衝突！\n\n該床位/座位在該時段已經被「${parts[2] || '其他顧客'}」佔用 (包含清潔時間)。\n請重新選擇其他空閒位置！`, 'warning');
            } else if (errorMsg && (errorMsg.includes('⚠️') || errorMsg.includes('失敗') || errorMsg.includes('錯誤'))) {
                Swal.fire('系統提示', errorMsg, 'warning');
            } else {
                Swal.fire('系統提示', errorMsg || "⚠️ 儲存失敗，請檢查網路連線。", 'warning');
            }
            fetchData(true); // Đảm bảo lấy lại dữ liệu thật nếu lỗi
        }
    };

    const handleSplitConfirm = async (rawNewStaffId) => {
        const newStaffId = normalizeStaffId(rawNewStaffId);
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
            Swal.fire('系統提示', "⚠️ 該預約已達最大技師數量限制 (6人)。", 'warning');
            setSyncLock(false);
            return;
        }

        Swal.fire({
            title: '儲存中，請稍候...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const payload = {
            rowId: current.booking.rowId,
            [targetDbKey]: newStaffId,
            [targetFbKey]: newStaffId,
            forceSync: true
        };

        try {
            await universalSend('/api/update-booking-details', payload);
            setSplitData(null);
            Swal.close();
            fetchData(true); // STRICT ONE-WAY FLOW
        } catch (e) {
            Swal.fire('系統提示', "⚠️ 同步失敗！請檢查網路連線。", 'warning');
            fetchData(true);
        }
    };

    const handleManualMoveStaff = async (staffId, direction) => {
        const readyStaffIds = [...staffList]
            .filter(s => {
                const stat = statusData[s.id] || { status: 'AWAY' };
                return stat.status === 'READY' || stat.status === 'EAT' || stat.status === 'OUT_SHORT';
            })
            .sort((a, b) => {
                const timeA = statusData[a.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                const timeB = statusData[b.id]?.stafftime || Number.MAX_SAFE_INTEGER;
                return timeA - timeB;
            })
            .map(s => s.id);

        const currentIndex = readyStaffIds.indexOf(staffId);
        if (currentIndex === -1) return;

        let targetIndex = -1;
        if (direction === 'LEFT') {
            targetIndex = currentIndex + 1;
        } else if (direction === 'RIGHT') {
            targetIndex = currentIndex - 1;
        }

        if (targetIndex >= 0 && targetIndex < readyStaffIds.length) {
            const targetStaffId = readyStaffIds[targetIndex];
            
            const currentStaffTime = statusData[staffId].stafftime;
            const targetStaffTime = statusData[targetStaffId].stafftime;

            const newStatusData = {
                ...statusData,
                [staffId]: { ...statusData[staffId], stafftime: targetStaffTime },
                [targetStaffId]: { ...statusData[targetStaffId], stafftime: currentStaffTime }
            };

            setStatusData(newStatusData);
            setSyncLock(true); setTimeout(() => setSyncLock(false), 2000);
            await axios.post('/api/sync-staff-status', newStatusData);
        }
    };

    const handleStaffChange = async (resId, rawNewStaffId, returnToLast = false) => {
        const newStaffId = normalizeStaffId(rawNewStaffId);
        const current = resourceState[resId]; if (!current) return;
        setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);

        const isSinglePaxCombo = (parseInt(current.booking.pax || 1, 10) === 1);
        const rawGrpIdx = getGroupMemberIndex(resId, current.booking.rowId);
        const grpIdx = isSinglePaxCombo ? 0 : rawGrpIdx;

        let oldServiceStaff = current.booking.serviceStaff || current.booking.staffId || '隨機';
        if (grpIdx === 1) oldServiceStaff = current.booking.staffId2 || '隨機';
        else if (grpIdx === 2) oldServiceStaff = current.booking.staffId3 || '隨機';
        else if (grpIdx === 3) oldServiceStaff = current.booking.staffId4 || '隨機';
        else if (grpIdx === 4) oldServiceStaff = current.booking.staffId5 || '隨機';
        else if (grpIdx === 5) oldServiceStaff = current.booking.staffId6 || '隨機';

        const newState = { ...resourceState };
        Object.keys(newState).forEach(key => {
            const res = newState[key];
            if (res && res.booking && String(res.booking.rowId) === String(current.booking.rowId)) {
                const updatedBooking = { ...res.booking };
                if (grpIdx === 0) { updatedBooking.serviceStaff = newStaffId; updatedBooking.staffId = newStaffId; }
                else if (grpIdx === 1) updatedBooking.staffId2 = newStaffId;
                else if (grpIdx === 2) updatedBooking.staffId3 = newStaffId;
                else if (grpIdx === 3) updatedBooking.staffId4 = newStaffId;
                else if (grpIdx === 4) updatedBooking.staffId5 = newStaffId;
                else if (grpIdx === 5) updatedBooking.staffId6 = newStaffId;
                newState[key] = { ...res, booking: updatedBooking };
            }
        });

        setResourceState(newState);

        const newStatusData = { ...statusData };

        if (oldServiceStaff !== '隨機' && oldServiceStaff !== newStaffId) {
            const oldStaffState = statusData[oldServiceStaff];
            let restoredTime = Date.now();

            if (returnToLast) {
                let maxReadyTime = 0;
                if (staffList) {
                    staffList.forEach(s => {
                        const stat = statusData[s.id] || { status: 'AWAY' };
                        if (stat.status === 'READY' || stat.status === 'EAT' || stat.status === 'OUT_SHORT') {
                            const st = stat.stafftime || 0;
                            if (st > maxReadyTime) maxReadyTime = st;
                        }
                    });
                }
                restoredTime = maxReadyTime > 0 ? maxReadyTime + 100 : Date.now();
            } else {
                if (oldStaffState?.previousStafftime) {
                    restoredTime = oldStaffState.previousStafftime;
                } else if (current.startTime) {
                    restoredTime = new Date(current.startTime).getTime();
                }
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
        try { 
            await universalSend('/api/update-booking-details', payload); 
            fetchData(true); // STRICT ONE-WAY FLOW
        } catch (e) { 
            Swal.fire('系統提示', "⚠️ 同步失敗！請檢查網路連線。", 'warning'); 
            fetchData(true);
        }
    };



    const handleSaveComboTime = async (arg1, arg2 = null, startTimeStr = null, switchTimeStr = null, customP1Res = null, customP2Res = null, overrideFlow = null, lockStates = {}) => {
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
            Swal.fire('系統提示', `⚠️ 第一階段時間無效！`, 'warning');
            return;
        }

        const newPhase2Duration = totalDuration - newPhase1Duration;

        setSyncLock(true);
        setTimeout(() => setSyncLock(false), 5000);

        let newStartTimeIso = null;
        let newStartTimeStringForSheet = null;
        let effectiveStartTimeStr = startTimeStr;

        if (startTimeStr) {
            let datePart = viewDate.replace(/-/g, '/');
            const parts = startTimeStr.split(':');
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            let dObj = new Date(datePart);
            if (!isNaN(dObj.getTime())) {
                if (h < (window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 6)) {
                    dObj.setDate(dObj.getDate() + 1);
                }
                const y = dObj.getFullYear();
                const mo = String(dObj.getMonth() + 1).padStart(2, '0');
                const d = String(dObj.getDate()).padStart(2, '0');
                datePart = `${y}/${mo}/${d}`;
            }

            newStartTimeStringForSheet = `${datePart} ${startTimeStr}`;

            let dObjFinal = new Date(datePart);
            if (!isNaN(dObjFinal.getTime())) {
                dObjFinal.setHours(h, m, 0, 0);
                newStartTimeIso = dObjFinal.toISOString();
            }
        } else {
            effectiveStartTimeStr = targetBooking.startTimeString ? targetBooking.startTimeString.split(' ')[1] : "12:00";
        }

        const currentFlow = overrideFlow || targetBooking.flow || 'FB';
        const p1Type = currentFlow === 'BF' ? 'bed' : 'chair';
        const p2Type = currentFlow === 'BF' ? 'chair' : 'bed';
        const resourceTypeForSheet = 'COMBO';

        let tryStart = 720;
        if (effectiveStartTimeStr) {
            tryStart = safeTimeToMins(effectiveStartTimeStr);
            if (!tryStart) tryStart = 720;
        }

        const mockActiveEndTimes = {};
        Object.keys(resourceState).forEach(k => {
            if (resourceState[k].isRunning && resourceState[k].booking) {
                const b = resourceState[k];
                try {
                    const startMins = safeTimeToMins(getTaipeiTimeStr(b.startTime));
                    mockActiveEndTimes[k] = startMins + (b.booking.duration || 60);
                } catch (e) { }
            }
        });

        const isForcedSingle = targetBooking.isForcedSingle === true || currentFlow === 'FOOTSINGLE' || currentFlow === 'BODYSINGLE';
        const isLongSingle = isForcedSingle && parseInt(targetBooking.duration || 100) > 70;

        let s1 = customP1Res && customP1Res !== 'auto' ? customP1Res.toLowerCase() : null;
        if (!s1) s1 = MatrixHelper.findBestSlot(p1Type, tryStart, tryStart + newPhase1Duration, timelineData, mockActiveEndTimes, null, rowId, isLongSingle) || (isLongSingle ? `opp-${p1Type}-1` : `${p1Type}-1`);

        const p2Start = tryStart + newPhase1Duration + 5;
        let s2 = customP2Res && customP2Res !== 'auto' ? customP2Res.toLowerCase() : null;
        if (!s2) s2 = MatrixHelper.findBestSlot(p2Type, p2Start, p2Start + newPhase2Duration, timelineData, mockActiveEndTimes, null, rowId) || `${p2Type}-1`;

        Swal.fire({
            title: '儲存中，請稍候...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const payload = {
            rowId,
            flow: currentFlow,
            flow_code: currentFlow,
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
            flow_code_locked: lockStates.flow_code_locked,
            phase1_locked: lockStates.phase1_locked,
            phase2_locked: lockStates.phase2_locked,
            forceSync: true
        };

        if (newStartTimeStringForSheet) {
            payload.startTimeString = newStartTimeStringForSheet;
            payload.gioDen = startTimeStr;
            payload.startTime = startTimeStr;
            payload.date = newStartTimeStringForSheet.split(' ')[0];
        }

        try {
            const res = await universalSend('/api/update-booking-details', payload);
            if (!res.success) throw new Error(res.error);

            // [V136.1 FIX] Đồng bộ tức thời startTime trong resourceState cục bộ của ca Combo đang chạy
            const newState = { ...resourceState };
            let updated = false;
            Object.keys(newState).forEach(key => {
                const r = newState[key];
                if (r.booking && String(r.booking.rowId) === rowId) {
                    if (newStartTimeIso) {
                        r.startTime = newStartTimeIso;
                    }
                    r.booking.flow = currentFlow;
                    r.booking.phase1_duration = newPhase1Duration;
                    r.booking.phase2_duration = newPhase2Duration;
                    r.booking.phase1_res_idx = s1.toUpperCase();
                    r.booking.phase2_res_idx = s2.toUpperCase();
                    if (newStartTimeStringForSheet) {
                        r.booking.startTimeString = newStartTimeStringForSheet;
                        r.booking.startTime = startTimeStr;
                    }
                    updated = true;
                }
            });
            if (updated) {
                updateResource(newState);
            }
            
            // Xóa bộ nhớ đệm giả nếu có trước đó
            if (localOverridesRef.current[rowId]) {
                delete localOverridesRef.current[rowId];
            }
            if (!arg2 && controlCenterData) setControlCenterData(null);
            
            Swal.close();
            fetchData(true); // STRICT ONE-WAY FLOW: Ép tải lại từ Sheet
        } catch (e) {
            const errorMsg = e.message || "";
            if (errorMsg.includes('RESOURCE_CONFLICT')) {
                const parts = errorMsg.split('|');
                Swal.fire('系統提示', `⚠️ 警告：資源衝突！\n\n您選擇的 ${parts[1] || '該床位/座位'} 在該時段已經被「${parts[2] || '其他顧客'}」佔用 (包含清潔時間)。\n\n請重新選擇其他空閒位置！`, 'warning');
            } else {
                Swal.fire('系統提示', "⚠️ 儲存失敗！請檢查網路連線。", 'warning');
            }
            fetchData(true); // Đảm bảo lấy lại dữ liệu thật nếu lỗi
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
            let datePart = viewDate.replace(/-/g, '/');
            const parts = startTimeStr.split(':');
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            let dObj = new Date(datePart);
            if (!isNaN(dObj.getTime())) {
                if (h < (window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 6)) {
                    dObj.setDate(dObj.getDate() + 1);
                }
                const y = dObj.getFullYear();
                const mo = String(dObj.getMonth() + 1).padStart(2, '0');
                const d = String(dObj.getDate()).padStart(2, '0');
                datePart = `${y}/${mo}/${d}`;
            }

            newStartTimeStringForSheet = `${datePart} ${startTimeStr}`;

            let dObjFinal = new Date(datePart);
            if (!isNaN(dObjFinal.getTime())) {
                dObjFinal.setHours(h, m, 0, 0);
                newStartTimeIso = dObjFinal.toISOString();
            }
        }

        let s1 = newResId && newResId !== 'auto' ? newResId.toLowerCase() : null;
        if (!s1) {
            s1 = targetBooking.current_resource_id || targetBooking.location || null;
        }
        if (s1) s1 = s1.toLowerCase();

        Swal.fire({
            title: '儲存中，請稍候...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

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
            payload.startTime = startTimeStr;
            payload.date = newStartTimeStringForSheet.split(' ')[0];
        }

        try {
            const res = await universalSend('/api/update-booking-details', payload);
            if (!res.success) throw new Error(res.error);

            // [V136.1 FIX] Đồng bộ tức thời startTime trong resourceState cục bộ của ca Đơn lẻ đang chạy
            const newState = { ...resourceState };
            let updated = false;
            Object.keys(newState).forEach(key => {
                const r = newState[key];
                if (r.booking && String(r.booking.rowId) === rowId) {
                    if (newStartTimeIso) {
                        r.startTime = newStartTimeIso;
                    }
                    if (s1) {
                        r.booking.current_resource_id = s1.toUpperCase();
                        r.booking.location = s1.toUpperCase();
                    }
                    if (newStartTimeStringForSheet) {
                        r.booking.startTimeString = newStartTimeStringForSheet;
                        r.booking.startTime = startTimeStr;
                    }
                    updated = true;
                }
            });
            if (updated) {
                updateResource(newState);
            }
            
            // Xóa bộ nhớ đệm giả nếu có trước đó
            if (localOverridesRef.current[rowId]) {
                delete localOverridesRef.current[rowId];
            }

            Swal.close();
            fetchData(true); // STRICT ONE-WAY FLOW: Ép tải lại từ Sheet
        } catch (e) {
            const errorMsg = e.message || "";
            if (errorMsg.includes('RESOURCE_CONFLICT')) {
                const parts = errorMsg.split('|');
                Swal.fire('系統提示', `⚠️ 警告：資源衝突！\n\n您選擇的 ${parts[1] || '該床位/座位'} 在該時段已經被「${parts[2] || '其他顧客'}」佔用 (包含清潔時間)。\n\n請重新選擇其他空閒位置！`, 'warning');
            } else {
                Swal.fire('系統提示', "⚠️ 儲存失敗！請檢查網路連線。", 'warning');
            }
            fetchData(true); // Đảm bảo lấy lại dữ liệu thật nếu lỗi
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
            const calculatedStart = safeTimeToMins(booking.startTimeString);
            if (calculatedStart > 0) tryStart = calculatedStart;
        }

        const mockActiveEndTimes = {};
        Object.keys(resourceState).forEach(k => {
            if (resourceState[k].isRunning && resourceState[k].booking) {
                const b = resourceState[k];
                try {
                    const startObj = new Date(b.startTime);
                    const openHour = window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 5;
                    const startMins = startObj.getHours() * 60 + startObj.getMinutes() + (startObj.getHours() < openHour ? 1440 : 0);
                    mockActiveEndTimes[k] = startMins + (b.booking.duration || 60);
                } catch (e) { }
            }
        });

        const isForcedSingle = booking.isForcedSingle === true || targetFlow === 'FOOTSINGLE' || targetFlow === 'BODYSINGLE';
        const isLongSingle = isForcedSingle && totalDuration > 70;
        const s1 = MatrixHelper.findBestSlot(p1Type, tryStart, tryStart + split.phase1, timelineData, mockActiveEndTimes, null, rowId, isLongSingle) || (isLongSingle ? `opp-${p1Type}-1` : `${p1Type}-1`);
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

        try {
            const res = await universalSend('/api/update-booking-details', {
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
            if (!res.success) throw new Error(res.error);
            if (hasRunningChanges) {
                await updateResource(newState);
            }
            fetchData('KEEP_OVERRIDES');
        } catch (e) {
            console.error("Sync flow error", e);
            const errorMsg = e.message || "";
            if (errorMsg.includes('RESOURCE_CONFLICT')) {
                const parts = errorMsg.split('|');
                Swal.fire('系統提示', `⚠️ 警告：資源衝突！\n\n您選擇的 ${parts[1] || '該床位/座位'} 在該時段已經被「${parts[2] || '其他顧客'}」佔用 (包含清潔時間)。\n\n請重新選擇其他空閒位置！`, 'warning');
            } else {
                Swal.fire('系統提示', "⚠️ 儲存失敗！請檢查網路連線。", 'warning');
            }
            fetchData(false);
        }
    };

    const handleVerticalResourceShift = async (currentResId, direction, targetBooking) => {
        if (!currentResId || !targetBooking) return;

        const parts = currentResId.split('-');
        const type = parts[0];
        const index = parseInt(parts[1], 10);
        if (isNaN(index)) return;

        const newIndex = index + direction;
        const maxLimit = type === 'chair' ? window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS : window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS;
        if (newIndex < 1 || newIndex > maxLimit) return;

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
            Swal.fire('系統提示', `⚠️ 目標位置在該時段已有其他預約！無法移動。`, 'warning');
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
                fetchData(false);

                try {
                    const res = await universalSend('/api/update-booking-details', {
                        rowId: rowId,
                        current_resource_id: targetId,
                        record_location: true,
                        ...(isPhase1 && { phase1_res_idx: targetId.toUpperCase(), phase1Resource: targetId.toUpperCase() }),
                        ...(isPhase2 && { phase2_res_idx: targetId.toUpperCase(), phase2Resource: targetId.toUpperCase() }),
                        forceSync: true
                    });
                    if (!res.success) throw new Error(res.error);
                    await updateResource(newState);
                } catch (e) {
                    const errorMsg = e.message || "";
                    if (errorMsg.includes('RESOURCE_CONFLICT')) {
                        const parts = errorMsg.split('|');
                        Swal.fire('系統提示', `⚠️ 警告：資源衝突！\n\n目標位置 ${parts[1] || '該床位/座位'} 在該時段已經被「${parts[2] || '其他顧客'}」佔用 (包含清潔時間)。\n\n請重新選擇！`, 'warning');
                    } else {
                        Swal.fire('系統提示', "⚠️ 轉換位置時發生連線錯誤！", 'warning');
                    }
                    fetchData(false);
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
                fetchData(false);
                updateResource(newState).catch(() => console.error('Sync failed'));
            }
        } else {
            if (!localOverridesRef.current[rowId]) localOverridesRef.current[rowId] = {};
            localOverridesRef.current[rowId].storedLocation = targetId;
            if (isPhase1) localOverridesRef.current[rowId].phase1_res_idx = targetId.toUpperCase();
            if (isPhase2) localOverridesRef.current[rowId].phase2_res_idx = targetId.toUpperCase();

            fetchData(false);

            try {
                const res = await universalSend('/api/update-booking-details', {
                    rowId: rowId,
                    current_resource_id: targetId,
                    location: targetId,
                    ...(isPhase1 && { phase1_res_idx: targetId.toUpperCase(), phase1Resource: targetId.toUpperCase() }),
                    ...(isPhase2 && { phase2_res_idx: targetId.toUpperCase(), phase2Resource: targetId.toUpperCase() }),
                    forceSync: true
                });
                if (!res.success) throw new Error(res.error);
            } catch (e) {
                const errorMsg = e.message || "";
                if (errorMsg.includes('RESOURCE_CONFLICT')) {
                    const parts = errorMsg.split('|');
                    Swal.fire('系統提示', `⚠️ 警告：資源衝突！\n\n目標位置 ${parts[1] || '該床位/座位'} 在該時段已經被「${parts[2] || '其他顧客'}」佔用 (包含清潔時間)。\n\n請重新選擇！`, 'warning');
                } else {
                    Swal.fire('系統提示', "⚠️ 轉換位置時發生連線錯誤！", 'warning');
                }
                fetchData(false);
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

    const executeStart = async (id, comboSequence, silentMode = false, fallbackBooking = null) => {
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
                if (!silentMode) Swal.fire('系統提示', `⚠️ 位置 ${id} 忙碌中 (Running)!`, 'warning');
                return;
            }
        }

        if (!current) {
            if (!silentMode) Swal.fire('系統提示', "⚠️ 系統錯誤：找不到位置資料。", 'warning');
            return;
        }

        let designatedStaff = current.booking.serviceStaff || current.booking.staffId || current.booking.ServiceStaff || current.booking.technician || current.booking.requestedStaff;
        if (!designatedStaff || designatedStaff === 'undefined' || designatedStaff === 'null') designatedStaff = '隨機';

        // Cẩn thận normalize lại (dù đã normalize từ đầu)
        designatedStaff = normalizeStaffId(designatedStaff);

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
                if (!ghostTargetId) {
                    ghostTargetId = current.booking.phase1_res_idx && current.booking.phase1_res_idx.toLowerCase() !== currentId ? current.booking.phase1_res_idx.toLowerCase() : null;
                }

                if (ghostTargetId) {
                    const currentPhysicalType = currentId.split('-')[0];
                    const targetPhysicalType = ghostTargetId.split('-')[0];
                    if (currentPhysicalType === targetPhysicalType) {
                        if (!silentMode) {
                            const c_prefix = window.SYSTEM_CONFIG?.UI_LABELS?.CHAIR_PREFIX || '腳';
                            Swal.fire('系統提示', `⚠️ 預約錯誤: Phase 1 (${currentPhysicalType === 'chair' ? c_prefix + '部' : '身體'}) 和 Phase 2 (${targetPhysicalType === 'chair' ? c_prefix + '部' : '身體'}) 不能在同一個區域！\n(套餐必須包含一個床位和一個${c_prefix}部區)\n請重新調整座位！`, 'warning');
                        }
                        setSyncLock(false);
                        return;
                    }
                }

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
                
                if (!silentMode) {
                    const reqTxt = comboSequence === 'BF' ? '身體優先 (Body First)' : '腳底優先 (Foot First)';
                    const c_prefix = window.SYSTEM_CONFIG?.UI_LABELS?.CHAIR_PREFIX || '腳';
                    const mustBe = comboSequence === 'BF' ? '【床 / Bed】' : `【${c_prefix} / Chair】`;
                    Swal.fire('系統提示', `⚠️ 服務流程錯誤: \n您選擇的是 ${reqTxt}，第一階段必須在 ${mustBe}!\n請重新確定顧客位置！`, 'warning');
                }
                setSyncLock(false);
                return;
            }
        } else if (isStrict) {
            const type = id.split('-')[0];
            const force = current.booking.forceResourceType === 'CHAIR' ? 'chair' : 'bed';
            if (type !== force) {
                const c_prefix = window.SYSTEM_CONFIG?.UI_LABELS?.CHAIR_PREFIX || '腳';
                if (!silentMode) Swal.fire('系統提示', `⚠️ 位置錯誤：此顧客必須安排在 ${force === 'chair' ? c_prefix + '部區' : '身體區'}!`, 'warning');
                setSyncLock(false);
                return;
            }
        }

        if (['隨機', '男', '女', 'Oil'].some(k => designatedStaff.includes(k))) {
            if (!staffList || staffList.length === 0) {
                if (!silentMode) Swal.fire('系統提示', "⚠️ 員工資料為空，請稍後再試！", 'warning');
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

            const nowObj = window.getTaipeiDate ? window.getTaipeiDate() : new Date();
            const openHour = window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 5;
            const currentMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < openHour ? 1440 : 0);

            // GỌI THUẬT TOÁN TỪ SSOT
            let foundStaff = null;
            if (window.StaffSorter && window.StaffSorter.findBestStaffForSingle) {
                foundStaff = window.StaffSorter.findBestStaffForSingle(current.booking, readyCandidates, statusData, bookings, currentMins);
            } else {
                if (!silentMode) Swal.fire('系統提示', "⚠️ 系統錯誤：找不到 StaffSorter 模組。", 'warning');
                setSyncLock(false); return;
            }

            if (!foundStaff) {
                const genderMsg = designatedStaff.includes('男') ? " (男)" : designatedStaff.includes('女') ? " (女)" : "";
                if (!silentMode) Swal.fire('系統提示', `⚠️ 系統提示: 找不到符合條件的技師${genderMsg}（可能因未來已有預約或條件不符）！\n\n系統無法自動分派，請手動指派技師。`, 'warning');
                setSyncLock(false); return;
            }
            finalServiceStaff = normalizeStaffId(foundStaff.id);
        }

        // [V118 SSOT] Gọi cổng API quản lý vòng đời (Stage 2: Start Work)
        let newStatusData = statusData;
        if (window.StaffSorter?.processStartWork) {
            newStatusData = await window.StaffSorter.processStartWork([finalServiceStaff], statusData, Date.now());
        } else {
            // Fallback nếu thiếu Module
            const currentStaffTime = statusData[finalServiceStaff]?.stafftime || Date.now();
            newStatusData = {
                ...statusData,
                [finalServiceStaff]: {
                    ...statusData[finalServiceStaff],
                    status: 'BUSY',
                    stafftime: Date.now(),
                    previousStafftime: currentStaffTime
                }
            };
        }
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
            status: APP_STATUS.SERVING
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
        axios.post('/api/update-status', { rowId: current.booking.rowId, status: APP_STATUS.SERVING });
    };

    const executeBatchStart = async (mainResId, relatedItems) => {
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

            // [NÂNG CẤP V1.5] BẢO TOÀN TUYỆT ĐỐI TÀI NGUYÊN ĐÃ XẾP SẴN TRÊN GOOGLE SHEETS
            const sheetP1 = item.booking.phase1_res_idx;
            if (sheetP1 && sheetP1 !== '隨機' && sheetP1 !== 'undefined' && sheetP1 !== '') {
                item.resourceId = sheetP1.toLowerCase();
            }

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

        const currentlyBusyIds = Object.values(nextResourceState)
            .filter(r => r.isRunning && !r.isPaused && r.isPreview !== true)
            .map(r => r.booking.serviceStaff || r.booking.staffId);

        let readyCandidates = staffList.filter(s => {
            const stat = nextStatusData[s.id];
            return stat && stat.status === 'READY' && !currentlyBusyIds.includes(s.id);
        });

        const nowObj = window.getTaipeiDate ? window.getTaipeiDate() : new Date();
        const openHour = window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 5;
        const currentMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < openHour ? 1440 : 0);

        // GỌI THUẬT TOÁN TỪ SSOT
        let assignments = {};
        if (window.StaffSorter && window.StaffSorter.assignStaffForBatch) {
            assignments = window.StaffSorter.assignStaffForBatch(validItems, readyCandidates, nextStatusData, bookings, currentMins);
        } else {
            Swal.fire('系統提示', "⚠️ 系統錯誤：找不到 StaffSorter 模組。", 'warning');
            setSyncLock(false); return;
        }

        let failedToStartCount = 0;
        const unassignedItems = [];

        // [V116.8 LỖI SẮP XẾP] Sắp xếp lại validItems theo thời gian dòng chờ (stafftime cũ)
        // Ai chờ lâu nhất (stafftime nhỏ nhất) sẽ đứng trước để được cấp mốc thời gian MỚI nhỏ nhất.
        validItems.sort((a, b) => {
            const staffA = normalizeStaffId(assignments[a.resourceId]);
            const staffB = normalizeStaffId(assignments[b.resourceId]);
            const timeA = nextStatusData[staffA]?.stafftime || Number.MAX_SAFE_INTEGER;
            const timeB = nextStatusData[staffB]?.stafftime || Number.MAX_SAFE_INTEGER;
            if (timeA !== timeB) return timeA - timeB; // Tăng dần (nhỏ nhất / chờ lâu nhất đứng đầu)
            // [V116.9 LỖI ĐẢO CHIỀU] Phân định (Tie-breaker) bắt buộc khi 2 thẻ bấm Ready cùng lúc
            return window.sortIdAsc ? window.sortIdAsc({ id: staffA }, { id: staffB }) : 0;
        });

        const baseNow = Date.now();

        // [V118 SSOT] Xử lý cập nhật State theo Batch qua API processStartWork
        const staffListToStart = [];
        validItems.forEach(item => {
            const fStaff = normalizeStaffId(assignments[item.resourceId]);
            if (fStaff) {
                let current = nextResourceState[item.resourceId];
                if (!current || !current.isRunning) {
                    staffListToStart.push(fStaff);
                }
            }
        });

        if (window.StaffSorter?.processStartWork && staffListToStart.length > 0) {
            const updatedStatusData = await window.StaffSorter.processStartWork(staffListToStart, nextStatusData, baseNow);
            Object.assign(nextStatusData, updatedStatusData); // Apply vào nextStatusData
        } else {
            // Fallback nếu thiếu Module
            staffListToStart.forEach((sId, index) => {
                const currentStaffTime = nextStatusData[sId]?.stafftime || baseNow;
                nextStatusData[sId] = {
                    ...nextStatusData[sId],
                    status: 'BUSY',
                    stafftime: baseNow + (index * 10),
                    previousStafftime: currentStaffTime
                };
            });
        }

        // Gom payload cập nhật Google Sheets
        const batchPayloads = [];

        validItems.forEach((item, index) => {
            const { resourceId } = item;
            let finalServiceStaff = normalizeStaffId(assignments[resourceId]);

            if (!finalServiceStaff) {
                failedToStartCount++;
                unassignedItems.push(item);
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
                    let projectedTargetId = current.booking.phase2_res_idx ? current.booking.phase2_res_idx.toLowerCase() : newComboMeta.targetId;
                    newComboMeta = { ...newComboMeta, phase: 1, sequence: actualSeq, targetId: projectedTargetId };
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

            // [V118 PATCH] Đẩy vào danh sách GOM NHÓM (Batch)
            batchPayloads.push({
                rowId: current.booking.rowId,
                [primaryKey]: finalServiceStaff,
                [fallbackKey]: finalServiceStaff,
                [`staff${grpIdx + 1}`]: finalServiceStaff,
                current_resource_id: resourceId,
                record_location: true,
                status: APP_STATUS.SERVING,
                mainStatus: APP_STATUS.SERVING,
                ...comboPayloadAdditions
            });
        });

        if (failedToStartCount > 0) {
            const failedNames = unassignedItems.map(item => item.booking.customerName.split('(')[0].trim()).join(', ');
            Swal.fire('系統提示', `⚠️ 系統提示: 檢測到 ${failedToStartCount} 位客人無法自動分配。\n\n▶ 原因分析: 目前無符合條件的待命技師，或資源(床/椅)已被佔用。\n▶ 影響名單: ${failedNames}\n\n請以手動方式為這幾位客人安排任務。`, 'warning');
        }

        setResourceState(nextResourceState);
        updateStaffStatus(nextStatusData);
        
        if (batchPayloads.length > 0) {
            universalSend('/api/batch-process-bookings', { payloads: batchPayloads });
        }
        
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
        else if (action === 'cancel') { Swal.fire({ title: '確認', text: '確定將顧客從位置移除？', icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }).then((res) => { if (res.isConfirmed) { const n = { ...resourceState }; delete n[id]; updateResource(n); } }); }
        else if (action === 'cancel_midway') {
            Swal.fire({ title: '確認', text: '確定要棄單嗎？\n此操作會標記為「取消」並釋放此位置。', icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }).then(async (res) => { if (res.isConfirmed) { 
                const ridStr = String(current.booking.rowId);
                if (localOverridesRef.current[ridStr]) {
                    delete localOverridesRef.current[ridStr];
                 }

                await axios.post('/api/update-status', { rowId: current.booking.rowId, status: APP_STATUS.CANCELLED });
                const n = { ...resourceState };
                const staffId = current.booking.serviceStaff || current.booking.staffId;
                if (staffId !== '隨機' && statusData[staffId]) {
                    const newStatus = { ...statusData, [staffId]: { status: 'READY', checkInTime: Date.now(), stafftime: Date.now() } };
                    updateStaffStatus(newStatus);
                }
                delete n[id]; updateResource(n); fetchData();
            } });
        }
        else if (action === 'noshow_midway') {
            Swal.fire({ title: '確認', text: '確定要設為爽約嗎？\n此操作會標記為「爽約」並釋放此位置。', icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }).then(async (res) => { if (res.isConfirmed) { 
                const ridStr = String(current.booking.rowId);
                if (localOverridesRef.current[ridStr]) {
                    delete localOverridesRef.current[ridStr];
                 }

                await axios.post('/api/update-status', { rowId: current.booking.rowId, status: APP_STATUS.NOSHOW });
                const n = { ...resourceState };
                const staffId = current.booking.serviceStaff || current.booking.staffId;
                if (staffId !== '隨機' && statusData[staffId]) {
                    const newStatus = { ...statusData, [staffId]: { status: 'READY', checkInTime: Date.now(), stafftime: Date.now() } };
                    updateStaffStatus(newStatus);
                }
                delete n[id]; updateResource(n); fetchData();
            } });
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
            const c_prefix = window.SYSTEM_CONFIG?.UI_LABELS?.CHAIR_PREFIX || '腳';
            Swal.fire('系統提示', `⛔️ 阻擋：此服務限定為 ${requiredType === 'CHAIR' ? c_prefix + '部' : '身體'}，無法轉場至 ${targetTypeString === 'CHAIR' ? c_prefix + '部' : '身體'}！`, 'warning');
            return;
        }

        const limit = toType === 'chair' ? window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS : window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS;
        for (let i = 1; i <= limit; i++) {
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
        const c_prefix = window.SYSTEM_CONFIG?.UI_LABELS?.CHAIR_PREFIX || '腳';
        Swal.fire('系統提示', `該區域 (${toType === 'chair' ? c_prefix + '部區' : '身體區'}) 已無空位！`, 'warning');
    };

    const handleToggleMax = async (resId) => { const res = resourceState[resId]; if (!res) return; updateResource({ ...resourceState, [resId]: { ...res, isMaxMode: !res.isMaxMode } }); };

    const handleConfirmPayment = async (itemsToPay, totalAmount, finalPricesMap = {}) => {
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

                // [FIX] Khắc phục lỗi tính lặp thợ 1 và bỏ sót thợ 2 (Group Checkout Bug)
                let targetIndex = -1;
                if (resId) {
                    targetIndex = getGroupMemberIndex(resId, b.rowId);
                }
                
                // Fallback nếu không xác định được index
                if (targetIndex === -1) {
                    // [V116.5 FIX] Ép cứng Cột 1 cho Dòng đơn khách (không xài staffId2)
                    const isSingleRow = (!b.staffId2 || String(b.staffId2).trim() === 'undefined' || String(b.staffId2).trim() === '');
                    if (isSingleRow) {
                        targetIndex = 0;
                    } else if (resId) {
                        const seatNum = parseInt(resId.replace(/\D/g, ''));
                        if (!isNaN(seatNum) && seatNum > 0) targetIndex = Math.min(seatNum - 1, 5);
                        else targetIndex = 0;
                    } else {
                        targetIndex = 0;
                    }
                }

                const statusNum = targetIndex + 1;
                const statusColEnglish = `Status${statusNum}`;
                if (!updatesByRow[rid]) { 
                    updatesByRow[rid] = { rowId: rid, forceSync: true, originalBooking: b }; 
                    
                    let finalP = finalPricesMap[rid];
                    if (finalP === undefined) {
                        finalP = finalPricesMap[Number(rid)];
                    }
                    if (finalP !== undefined) {
                        updatesByRow[rid].final_price = finalP;
                        console.log(`[CHECKOUT] Gán giá tiền cho Row ${rid}: $${finalP}`);
                    } else {
                        console.warn(`[CHECKOUT WARNING] Không tìm thấy giá tiền cho Row ${rid} trong:`, finalPricesMap);
                    }
                }
                updatesByRow[rid][statusColEnglish] = APP_STATUS.COMPLETED;

                let staffId = null;
                
                // [Nâng Cấp V134.1] Hỗ trợ INLINE_SPLIT (Chia Đơn)
                // Nếu đây là 1 ca chia đơn (có staffId2 và thời lượng blocks của staff 2), thì người thực hiện bước cuối cùng trước tính tiền là staff 2.
                // Tránh tình trạng check out nhầm staff 1 (người đã được trả về READY lúc tiến hành chia đơn).
                const isInlineSplit = b.staffId2 && String(b.staffId2).trim() !== 'undefined' && String(b.staffId2).trim() !== '' && b.staff2_blocks !== undefined && b.staff2_blocks !== null;
                
                if (isInlineSplit) {
                    staffId = b.staffId2;
                } else {
                    if (targetIndex === 0) staffId = b.serviceStaff || b.staffId;
                    else if (targetIndex === 1) staffId = b.staffId2;
                    else if (targetIndex === 2) staffId = b.staffId3;
                    else if (targetIndex === 3) staffId = b.staffId4;
                    else if (targetIndex === 4) staffId = b.staffId5;
                    else if (targetIndex === 5) staffId = b.staffId6;
                    
                    // Fallback bảo vệ trong trường hợp rớt index (Lấy serviceStaff hiện tại)
                    if (!staffId || String(staffId).trim() === 'undefined' || String(staffId).trim() === '') {
                        staffId = b.serviceStaff || b.staffId;
                    }
                }

                if (staffId && staffId !== '隨機' && staffId !== 'undefined') {
                    // [V120 Tính Năng] Vá lỗi khoảng trắng (Whitespace Bug). Làm sạch dữ liệu của Thợ trước khi lưu vào danh sách chờ Thanh toán.
                    const cleanStaffId = window.normalizeStaffId ? window.normalizeStaffId(staffId) : String(staffId).trim();
                    const duration = window.getSafeDuration(b.serviceName, b.duration);
                    const blocks = getServiceBlocks(b.serviceName);
                    checkoutStaffInfo.push({ staffId: cleanStaffId, duration, blocks });

                    // [Nâng cấp] Ghi nhận số tiết cho ca bình thường
                    if (!isInlineSplit) {
                        if (targetIndex === 0) {
                            updatesByRow[rid].staff1_blocks = blocks;
                        } else if (targetIndex === 1) {
                            updatesByRow[rid].staff2_blocks = blocks;
                        }
                    }
                }

                if (resId && newState[resId]) {
                    delete newState[resId];
                }
            }

            const isGroup = checkoutStaffInfo.length >= 2 || (itemsToPay.length > 0 && parseInt(itemsToPay[0].booking.pax) >= 2);
            
            // [V118 SSOT] Gọi cổng API quản lý vòng đời (Stage 3: Checkout)
            let finalStatusData = newStatusData;
            if (window.StaffSorter?.processCheckout && checkoutStaffInfo.length > 0) {
                finalStatusData = await window.StaffSorter.processCheckout(checkoutStaffInfo, newStatusData, staffList, baseTime, isGroup);
            } else {
                // Fallback nếu thiếu thẻ (giữ lại logic sơ cua)
                checkoutStaffInfo.forEach(info => {
                    finalStatusData[info.staffId] = {
                        ...finalStatusData[info.staffId],
                        status: 'READY',
                        checkInTime: baseTime,
                        stafftime: baseTime
                    };
                });
            }
            
            // Ghi đè kết quả lên newStatusData
            Object.assign(newStatusData, finalStatusData);

            Object.values(updatesByRow).forEach(updatePayload => {
                // [Nâng cấp & Sửa Lỗi] Bất cứ khi nào thu ngân bấm Xác nhận Thanh toán, luôn đánh dấu Hàng là Hoàn Thành Toàn Bộ
                // (Bỏ qua đếm số lượng Phase/Thợ vì thợ Phase 1 đã được trả về READY lúc Chia Đơn)
                updatePayload.mainStatus = APP_STATUS.COMPLETED;
                
                if (updatePayload.originalBooking !== undefined) {
                    delete updatePayload.originalBooking;
                }
            });

            updateResource(newState); updateStaffStatus(newStatusData); setBillingData(null);
            
            const payloads = Object.values(updatesByRow);
            try {
                await axios.post('/api/batch-process-bookings', { payloads, forceSync: true });
                Swal.fire('系統提示', `✅ 結帳成功: $${totalAmount}`, 'success');
                fetchData(false);
            } catch (e) {
                Swal.fire('系統提示', "⚠️ 連線錯誤，請檢查網路！", 'warning');
            }
        } catch (e) { Swal.fire('系統提示', "⚠️ 結帳發生錯誤，請截圖給開發者：" + e.message, 'error'); }
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
                        Swal.fire('系統提示', `⚠️ 位置 ${targetResourceId} 忙碌中！請選擇其他座位。`, 'warning');
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
                    Swal.fire('系統提示', "⚠️ 請先將此訂單拖入座位/床位再開始！", 'warning');
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
                    Swal.fire({ title: '確認', text: '確定要取消此預約嗎？\n(若為團體客，將取消整組預約)', icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }).then((res) => { if (res.isConfirmed) { 
                        const ridStr = String(targetBooking.rowId);
                        if (localOverridesRef.current[ridStr]) delete localOverridesRef.current[ridStr];
                        axios.post('/api/update-status', { rowId: targetBooking.rowId, status: APP_STATUS.CANCELLED })
                            .then(() => fetchData(false))
                            .catch(() => Swal.fire('系統提示', '取消失敗，請檢查網路。', 'warning'));
                    } });
                }
                setControlCenterData(null);
                break;

            case 'NOSHOW':
                if (targetResourceId && resourceState[targetResourceId] && !resourceState[targetResourceId].isPreview) {
                    handleResourceAction(targetResourceId, 'noshow_midway');
                } else if (targetBooking) {
                    Swal.fire({ title: '確認', text: '確定要設為爽約嗎？\n(若為團體客，將設整組預約為爽約)', icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }).then((res) => { if (res.isConfirmed) { 
                        const ridStr = String(targetBooking.rowId);
                        if (localOverridesRef.current[ridStr]) delete localOverridesRef.current[ridStr];
                        axios.post('/api/update-status', { rowId: targetBooking.rowId, status: APP_STATUS.NOSHOW })
                            .then(() => fetchData(false))
                            .catch(() => Swal.fire('系統提示', '爽約設定失敗，請檢查網路。', 'warning'));
                    } });
                }
                setControlCenterData(null);
                break;
            case 'SPLIT':
                if (targetResourceId) setSplitData({ resourceId: targetResourceId });
                setControlCenterData(null);
                break;

            case 'UPDATE_SERVICE':
                if (payload.newService && targetBooking) {
                    const updatedData = {
                        ngayDen: targetBooking.date || targetBooking.opDate,
                        gioDen: targetBooking.startTimeString ? targetBooking.startTimeString.split(' ')[1] : targetBooking.startTime,
                        hoTen: targetBooking.originalName || targetBooking.customerName,
                        dichVu: payload.newService,
                        isYouTui: targetBooking.isYouTui,
                        isGuaSha: targetBooking.isGuaSha,
                        sdt: targetBooking.sdt || targetBooking.phone,
                        trangThai: targetBooking.status,
                        nhanVien: targetBooking.requestedStaff || targetBooking.staffId || targetBooking.serviceStaff
                    };
                    handleInlineUpdate(targetBooking.rowId, updatedData);
                }
                setControlCenterData(null);
                break;

            case 'CHANGE_STAFF':
                if (targetBooking && payload.newStaff) {
                    // Cẩn thận NORMALIZE ở đây
                    payload.newStaff = normalizeStaffId(payload.newStaff);

                    if (targetResourceId && resourceState[targetResourceId]) {
                        handleStaffChange(targetResourceId, payload.newStaff, payload.returnToLast);
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
                        fetchData(false);
                    }
                }
                break;

            case 'UPDATE_BLOCKS':
                if (targetBooking) {
                    const rowId = String(targetBooking.rowId);
                    universalSend('/api/update-booking-details', {
                        rowId: rowId,
                        staff1_blocks: payload.blocks1,
                        staff2_blocks: payload.blocks2,
                        forceSync: true
                    });
                    
                    if (controlCenterData && String(controlCenterData.booking.rowId) === rowId) {
                        setControlCenterData(prev => ({
                            ...prev,
                            booking: { ...prev.booking, staff1_blocks: payload.blocks1, staff2_blocks: payload.blocks2 }
                        }));
                    }
                }
                break;
                
            case 'INLINE_SPLIT':
                if (targetBooking && payload.staff2) {
                    const staff1 = normalizeStaffId(payload.staff1);
                    const staff2 = normalizeStaffId(payload.staff2);
                    const rowId = String(targetBooking.rowId);

                    setSyncLock(true); setTimeout(() => setSyncLock(false), 3000);

                    // --- Sử dụng StaffSorter.processCheckout để tính toán Queue cho Thợ 1 ---
                    (async () => {
                        let newStatusData = { ...statusData };
                        const baseTime = Date.now();

                        if (staff1 !== '隨機') {
                            const duration1 = window.getSafeDuration ? window.getSafeDuration(targetBooking.serviceName, targetBooking.duration) : 60;
                            const blocks1 = payload.blocks1 || 1;
                            const totalB = (payload.blocks1 || 1) + (payload.blocks2 || 1);
                            const calcDuration = (duration1 * blocks1) / totalB || (duration1 / 2);

                            const checkoutInfo = [{ staffId: staff1, duration: calcDuration, blocks: blocks1 }];
                            
                            if (window.StaffSorter && window.StaffSorter.processCheckout) {
                                newStatusData = await window.StaffSorter.processCheckout(checkoutInfo, newStatusData, staffList, baseTime, false);
                            } else {
                                newStatusData[staff1] = { ...newStatusData[staff1], status: 'READY', stafftime: baseTime };
                            }
                        }

                        if (staff2 !== '隨機') {
                            if (window.StaffSorter && window.StaffSorter.processStartWork) {
                                newStatusData = await window.StaffSorter.processStartWork([staff2], newStatusData, baseTime);
                            } else {
                                newStatusData[staff2] = { ...newStatusData[staff2], status: 'BUSY', stafftime: baseTime };
                            }
                        }

                        setStatusData(newStatusData);
                        universalSend('/api/sync-staff-status', newStatusData);
                    })();

                    // --- Đổi người phục vụ hiện tại (active) của Resource thành Thợ 2 ---
                    if (targetResourceId && resourceState[targetResourceId]) {
                        const res = resourceState[targetResourceId];
                        const updatedBooking = { ...res.booking, serviceStaff: staff2, staffId2: staff2, staff1_blocks: payload.blocks1, staff2_blocks: payload.blocks2 };
                        const newState = { ...resourceState, [targetResourceId]: { ...res, booking: updatedBooking } };
                        setResourceState(newState);
                        universalSend('/api/sync-resource', newState);
                    }

                    if (controlCenterData && String(controlCenterData.booking.rowId) === rowId) {
                        setControlCenterData(prev => ({
                            ...prev,
                            booking: { ...prev.booking, serviceStaff: staff2, staffId2: staff2, staff1_blocks: payload.blocks1, staff2_blocks: payload.blocks2 }
                        }));
                    }

                    // --- Lưu Database ---
                    universalSend('/api/update-booking-details', {
                        rowId: rowId,
                        staffId2: staff2, // Column M
                        staff1_blocks: payload.blocks1, // Column O
                        staff2_blocks: payload.blocks2, // Column P
                        forceSync: true
                    });
                    
                    fetchData(false);
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
                        payload.phase2_res_idx,
                        payload.flow,
                        {
                            flow_code_locked: payload.flow_code_locked,
                            phase1_locked: payload.phase1_locked,
                            phase2_locked: payload.phase2_locked
                        }
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

            case 'MOVE_BOOKING_ROW':
                if (payload.currentBookingId && payload.targetRowId) {
                    const b = Array.isArray(bookings) ? bookings.find(x => String(x.rowId) === String(payload.currentBookingId)) : null;
                    if (b) {
                        const targetId = payload.targetRowId.toUpperCase();
                        let updateData = { rowId: b.rowId, is_locked: "TRUE", isManualLocked: true, forceSync: true };

                        if (payload.meta && payload.meta.isCombo) {
                            const isTargetBed = targetId.includes('床') || targetId.includes('BED');
                            const bFlow = b.flow || 'FB';
                            const bPhase1IsChair = bFlow === 'FB';
                            
                            if (payload.meta.phase === 1) {
                                if ((bPhase1IsChair && isTargetBed) || (!bPhase1IsChair && !isTargetBed)) {
                                    if (b.flow_code_locked === "TRUE" || b.flow_code_locked === true) {
                                        Swal.fire('系統提示', '⚠️ 此客人已鎖定流程，無法更換至不同類型的座位！', 'warning');
                                        return;
                                    }
                                    updateData.flow = bFlow === 'BF' ? 'FB' : 'BF';
                                    updateData.phase1_res_idx = targetId;
                                    updateData.phase2_res_idx = b.phase1_res_idx;
                                } else {
                                    updateData.phase1_res_idx = targetId;
                                }
                            } else {
                                if ((!bPhase1IsChair && isTargetBed) || (bPhase1IsChair && !isTargetBed)) {
                                    if (b.flow_code_locked === "TRUE" || b.flow_code_locked === true) {
                                        Swal.fire('系統提示', '⚠️ 此客人已鎖定流程，無法更換至不同類型的座位！', 'warning');
                                        return;
                                    }
                                    updateData.flow = bFlow === 'BF' ? 'FB' : 'BF';
                                    updateData.phase1_res_idx = b.phase2_res_idx;
                                    updateData.phase2_res_idx = targetId;
                                } else {
                                    updateData.phase2_res_idx = targetId;
                                }
                            }
                        } else {
                            updateData.current_resource_id = targetId;
                            updateData.location = targetId;
                        }

                        const activeBookings = bookings.filter(x => {
                            if (x.isDoneStatus) return false;
                            const bDateStr = x.startTimeString ? x.startTimeString.split(' ')[0].replace(/\//g, '-') : '';
                            return bDateStr === viewDate.replace(/\//g, '-');
                        });
                        
                        const safeTimeToMinsLocal = (tStr) => {
                            if (!tStr) return 0;
                            const p = tStr.split(' ')[1];
                            if (!p) return 0;
                            const [h, m] = p.split(':').map(Number);
                            return h * 60 + (m || 0);
                        };

                        const bStart = window.safeTimeToMins ? window.safeTimeToMins(b.startTimeString) : safeTimeToMinsLocal(b.startTimeString);
                        const bEnd = bStart + parseInt(b.duration || 60, 10);
                        
                        let actualBStart = bStart;
                        let actualBEnd = bEnd;

                        if (payload.meta && payload.meta.isCombo) {
                            const split = window.getSmartSplit ? window.getSmartSplit(b, parseInt(b.duration || 60, 10), true, b.flow || 'FB') : { phase1: Math.floor(parseInt(b.duration || 60, 10) / 2), phase2: Math.ceil(parseInt(b.duration || 60, 10) / 2) };
                            const transitionMins = window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5;
                            
                            if (payload.meta.phase === 1) {
                                actualBStart = bStart;
                                actualBEnd = bStart + split.phase1;
                            } else {
                                actualBStart = bStart + split.phase1 + transitionMins;
                                actualBEnd = actualBStart + split.phase2;
                                if (b.transition_time) {
                                    const transMins = safeTimeToMinsLocal(b.transition_time);
                                    if (transMins !== -1 && transMins > 0) {
                                        actualBStart = transMins;
                                        actualBEnd = transMins + split.phase2;
                                    }
                                }
                            }
                        }

                        let swapTargets = [];
                        for (let x of activeBookings) {
                            if (String(x.rowId) === String(b.rowId)) continue;
                            const xStart = window.safeTimeToMins ? window.safeTimeToMins(x.startTimeString) : safeTimeToMinsLocal(x.startTimeString);
                            const xEnd = xStart + parseInt(x.duration || 60, 10);
                            
                            let xActualStart = xStart;
                            let xActualEnd = xEnd;
                            let isXInTarget = false;

                            const isXCombo = x.category === 'COMBO' || (x.serviceName && x.serviceName.includes('套餐'));
                            if (isXCombo) {
                                const xSplit = window.getSmartSplit ? window.getSmartSplit(x, parseInt(x.duration || 60, 10), true, x.flow || 'FB') : { phase1: Math.floor(parseInt(x.duration || 60, 10) / 2), phase2: Math.ceil(parseInt(x.duration || 60, 10) / 2) };
                                const transitionMins = window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5;
                                
                                const p1Id = String(x.phase1_res_idx).toUpperCase();
                                const p2Id = String(x.phase2_res_idx).toUpperCase();
                                
                                if (p1Id === targetId && p2Id === targetId) {
                                    xActualStart = xStart;
                                    xActualEnd = xEnd;
                                    isXInTarget = true;
                                } else if (p1Id === targetId) {
                                    xActualStart = xStart;
                                    xActualEnd = xStart + xSplit.phase1;
                                    isXInTarget = true;
                                } else if (p2Id === targetId) {
                                    xActualStart = xStart + xSplit.phase1 + transitionMins;
                                    xActualEnd = xActualStart + xSplit.phase2;
                                    if (x.transition_time) {
                                        const transMins = safeTimeToMinsLocal(x.transition_time);
                                        if (transMins !== -1 && transMins > 0) {
                                            xActualStart = transMins;
                                            xActualEnd = transMins + xSplit.phase2;
                                        }
                                    }
                                    isXInTarget = true;
                                }
                            } else {
                                const singleId = String(x.current_resource_id || x.location).toUpperCase();
                                if (singleId === targetId) {
                                    isXInTarget = true;
                                }
                            }
                            
                            if (isXInTarget && actualBStart < xActualEnd && xActualStart < actualBEnd) {
                                swapTargets.push(x);
                            }
                        }

                        let bSourceIdLocal = null;
                        if (payload.sourceRowId) {
                            bSourceIdLocal = String(payload.sourceRowId).toUpperCase();
                        } else if (payload.meta && payload.meta.isCombo) {
                            bSourceIdLocal = payload.meta.phase === 1 ? String(b.phase1_res_idx).toUpperCase() : String(b.phase2_res_idx).toUpperCase();
                        } else {
                            bSourceIdLocal = String(b.current_resource_id || b.location).toUpperCase();
                        }

                        if (bSourceIdLocal === String(targetId).toUpperCase()) {
                            setControlCenterData(null);
                            break;
                        }

                        const executeSingleMove = () => {
                            // --- Bắt đầu Original Single Move/Swap Logic ---
                            if (swapTargets.length > 0) {
                            let hasRunning = false;
                            let hasLocked = false;
                            
                            for (let swapTarget of swapTargets) {
                                if (swapTarget.isRunningStatus || swapTarget.status === 'DOING') {
                                    hasRunning = true;
                                }
                                
                                let isTargetPhaseLocked = false;
                                const isSwapCombo = swapTarget.category === 'COMBO' || (swapTarget.serviceName && swapTarget.serviceName.includes('套餐'));
                                let targetIdUpper = String(targetId).toUpperCase();
                                
                                if (isSwapCombo) {
                                    const p1Id = String(swapTarget.phase1_res_idx).toUpperCase();
                                    const p2Id = String(swapTarget.phase2_res_idx).toUpperCase();
                                    if (p1Id === targetIdUpper && (swapTarget.phase1_locked === "TRUE" || swapTarget.phase1_locked === true)) {
                                        isTargetPhaseLocked = true;
                                    }
                                    if (p2Id === targetIdUpper && (swapTarget.phase2_locked === "TRUE" || swapTarget.phase2_locked === true)) {
                                        isTargetPhaseLocked = true;
                                    }
                                } else {
                                    if (swapTarget.phase1_locked === "TRUE" || swapTarget.phase1_locked === true) {
                                        isTargetPhaseLocked = true;
                                    }
                                }
    
                                if (isTargetPhaseLocked) {
                                    hasLocked = true;
                                }
                            }

                            if (hasRunning) {
                                Swal.fire('系統提示', '⚠️ 目標位置的客人正在服務中，無法自動換位！請手動調整。', 'warning');
                                return;
                            }
                            
                            if (hasLocked) {
                                Swal.fire('系統提示', '⚠️ 目標位置的客人已鎖定座位，無法自動換位！', 'warning');
                                return;
                            }

                            const executeSwap = () => {
                                let targetIdUpper = String(targetId).toUpperCase();
                                let bSourceId = null;
                                if (payload.sourceRowId) {
                                    bSourceId = String(payload.sourceRowId).toUpperCase();
                                } else if (payload.meta && payload.meta.isCombo) {
                                    bSourceId = payload.meta.phase === 1 ? String(b.phase1_res_idx).toUpperCase() : String(b.phase2_res_idx).toUpperCase();
                                } else {
                                    bSourceId = String(b.current_resource_id || b.location).toUpperCase();
                                }

                                let prefixMatch = targetIdUpper.match(/^(.+?-)/);
                                let prefix = prefixMatch ? prefixMatch[1] : targetIdUpper.substring(0, 1) + '1-';
                                let maxCount = (targetIdUpper.includes('床') || targetIdUpper.includes('BED')) ? (window.SYSTEM_CONFIG?.SCALE?.MAX_BEDS || 6) : (window.SYSTEM_CONFIG?.SCALE?.MAX_CHAIRS || 6);
                                if (targetIdUpper.includes('OPP-CHAIR')) maxCount = window.SYSTEM_CONFIG?.SCALE?.OPP_CHAIRS || 4;
                                if (targetIdUpper.includes('OPP-BED')) maxCount = window.SYSTEM_CONFIG?.SCALE?.OPP_BEDS || 6;
                                
                                let allResources = [];
                                for (let i = 1; i <= maxCount; i++) {
                                    allResources.push(prefix + i);
                                }

                                let candidateResources = [];
                                // [NÂNG CẤP HOÁN ĐỔI AN TOÀN] - Push bSourceId lên đầu tiên (nếu cùng loại với resource đang thao tác)
                                if (bSourceId && bSourceId !== targetIdUpper && allResources.includes(bSourceId)) {
                                    candidateResources.push(bSourceId);
                                }
                                
                                for (let rId of allResources) {
                                    if (rId !== targetIdUpper && !candidateResources.includes(rId)) {
                                        candidateResources.push(rId);
                                    }
                                }

                                let batchPayloads = [];
                                let allFoundEmptyRes = true;
                                let newlyAllocatedRes = []; // Keep track of dynamically allocated resources

                                for (let swapTarget of swapTargets) {
                                    let foundEmptyRes = null;
                                    let sActualStart = 0;
                                    let sActualEnd = 0;
                                    let isSCombo = swapTarget.category === 'COMBO' || (swapTarget.serviceName && swapTarget.serviceName.includes('套餐'));
                                    const sStart = window.safeTimeToMins ? window.safeTimeToMins(swapTarget.startTimeString) : safeTimeToMinsLocal(swapTarget.startTimeString);
                                    
                                    if (isSCombo) {
                                        const sSplit = window.getSmartSplit ? window.getSmartSplit(swapTarget, parseInt(swapTarget.duration || 60, 10), true, swapTarget.flow || 'FB') : { phase1: Math.floor(parseInt(swapTarget.duration || 60, 10) / 2), phase2: Math.ceil(parseInt(swapTarget.duration || 60, 10) / 2) };
                                        const transitionMins = window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5;
                                        const p1Id = String(swapTarget.phase1_res_idx).toUpperCase();
                                        const p2Id = String(swapTarget.phase2_res_idx).toUpperCase();
                                        
                                        if (p1Id === targetIdUpper) {
                                            sActualStart = sStart;
                                            sActualEnd = sStart + sSplit.phase1;
                                        } else if (p2Id === targetIdUpper) {
                                            sActualStart = sStart + sSplit.phase1 + transitionMins;
                                            sActualEnd = sActualStart + sSplit.phase2;
                                            if (swapTarget.transition_time) {
                                                const transMins = safeTimeToMinsLocal(swapTarget.transition_time);
                                                if (transMins !== -1 && transMins > 0) {
                                                    sActualStart = transMins;
                                                    sActualEnd = transMins + sSplit.phase2;
                                                }
                                            }
                                        } else {
                                            sActualStart = sStart;
                                            sActualEnd = sStart + parseInt(swapTarget.duration || 60, 10);
                                        }
                                    } else {
                                        sActualStart = sStart;
                                        sActualEnd = sStart + parseInt(swapTarget.duration || 60, 10);
                                    }

                                    for (let rId of candidateResources) {
                                        let isOccupied = false;

                                        // 1. Check against newly allocated resources from previous swapTargets in this loop
                                        let newlyAllocatedConflict = false;
                                        for (let alloc of newlyAllocatedRes) {
                                            if (alloc.resId === rId) {
                                                if (sActualStart < alloc.end && alloc.start < sActualEnd) {
                                                    newlyAllocatedConflict = true;
                                                    break;
                                                }
                                            }
                                        }
                                        if (newlyAllocatedConflict) continue;

                                        // 2. Check against timelineData
                                        const tIdLower = String(rId).toLowerCase();
                                        if (timelineData && timelineData[tIdLower]) {
                                            for (let slot of timelineData[tIdLower]) {
                                                if (!slot || !slot.booking) continue;
                                                if (String(slot.booking.rowId) === String(swapTarget.rowId)) continue;
                                                if (String(slot.booking.rowId) === String(b.rowId)) continue;
                                                
                                                if (sActualStart < slot.end && slot.start < sActualEnd) {
                                                    isOccupied = true;
                                                    break;
                                                }
                                            }
                                        }
                                        
                                        if (!isOccupied) {
                                            foundEmptyRes = rId;
                                            break;
                                        }
                                    }

                                    if (!foundEmptyRes) {
                                        allFoundEmptyRes = false;
                                        break;
                                    }

                                    newlyAllocatedRes.push({ resId: foundEmptyRes, start: sActualStart, end: sActualEnd });

                                    let swapUpdateData = { rowId: swapTarget.rowId, forceSync: true };
                                    
                                    if (swapTarget.is_locked === "TRUE" || swapTarget.isManualLocked) {
                                        swapUpdateData.is_locked = "TRUE";
                                        swapUpdateData.isManualLocked = true;
                                    }

                                    if (isSCombo) {
                                        const p1Id = String(swapTarget.phase1_res_idx).toUpperCase();
                                        const p2Id = String(swapTarget.phase2_res_idx).toUpperCase();
                                        if (p1Id === targetIdUpper) swapUpdateData.phase1_res_idx = foundEmptyRes.toLowerCase();
                                        if (p2Id === targetIdUpper) swapUpdateData.phase2_res_idx = foundEmptyRes.toLowerCase();
                                    } else {
                                        swapUpdateData.current_resource_id = foundEmptyRes.toLowerCase();
                                        swapUpdateData.location = foundEmptyRes.toLowerCase();
                                    }
                                    batchPayloads.push(swapUpdateData);
                                }

                                if (!allFoundEmptyRes) {
                                    let multiSwapSuccess = false;
                                    let multiBatchPayloads = [];

                                    if (bSourceId && bSourceId !== targetIdUpper) {
                                        const getBookingTimesOnRes = (bx, targetResId) => {
                                            const bxStart = window.safeTimeToMins ? window.safeTimeToMins(bx.startTimeString) : safeTimeToMinsLocal(bx.startTimeString);
                                            const isBxCombo = bx.category === 'COMBO' || (bx.serviceName && bx.serviceName.includes('套餐'));
                                            if (isBxCombo) {
                                                const bxSplit = window.getSmartSplit ? window.getSmartSplit(bx, parseInt(bx.duration || 60, 10), true, bx.flow || 'FB') : { phase1: Math.floor(parseInt(bx.duration || 60, 10) / 2), phase2: Math.ceil(parseInt(bx.duration || 60, 10) / 2) };
                                                const transitionMins = window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5;
                                                const p1Id = String(bx.phase1_res_idx).toUpperCase();
                                                const p2Id = String(bx.phase2_res_idx).toUpperCase();
                                                
                                                if (p1Id === targetResId) {
                                                    return { start: bxStart, end: bxStart + bxSplit.phase1, phase: 1 };
                                                } else if (p2Id === targetResId) {
                                                    let p2Start = bxStart + bxSplit.phase1 + transitionMins;
                                                    let p2End = p2Start + bxSplit.phase2;
                                                    if (bx.transition_time) {
                                                        const transMins = safeTimeToMinsLocal(bx.transition_time);
                                                        if (transMins !== -1 && transMins > 0) {
                                                            p2Start = transMins;
                                                            p2End = transMins + bxSplit.phase2;
                                                        }
                                                    }
                                                    return { start: p2Start, end: p2End, phase: 2 };
                                                }
                                            } else {
                                                const singleId = String(bx.current_resource_id || bx.location).toUpperCase();
                                                if (singleId === targetResId) {
                                                    return { start: bxStart, end: bxStart + parseInt(bx.duration || 60, 10), phase: 0 };
                                                }
                                            }
                                            return null;
                                        };

                                        let swapGroupT = new Map();
                                        let swapGroupS = new Map();
                                        let queueT = [...swapTargets];
                                        let queueS = [];
                                        
                                        swapTargets.forEach(t => swapGroupT.set(t.rowId, t));
                                        
                                        let isConnectedComponentValid = true;
                                        let visitedT = new Set(swapTargets.map(t => t.rowId));
                                        let visitedS = new Set();

                                        while (queueT.length > 0 || queueS.length > 0) {
                                            if (queueT.length > 0) {
                                                let t = queueT.pop();
                                                let tTimes = getBookingTimesOnRes(t, targetIdUpper);
                                                if (!tTimes) continue;
                                                
                                                for (let s of activeBookings) {
                                                    if (String(s.rowId) === String(b.rowId)) continue;
                                                    let sTimes = getBookingTimesOnRes(s, bSourceId);
                                                    if (sTimes) {
                                                        if (tTimes.start < sTimes.end && sTimes.start < tTimes.end) {
                                                            if (!visitedS.has(s.rowId)) {
                                                                visitedS.add(s.rowId);
                                                                swapGroupS.set(s.rowId, s);
                                                                queueS.push(s);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            if (queueS.length > 0) {
                                                let s = queueS.pop();
                                                let sTimes = getBookingTimesOnRes(s, bSourceId);
                                                if (!sTimes) continue;
                                                
                                                for (let t of activeBookings) {
                                                    if (String(t.rowId) === String(b.rowId)) continue;
                                                    let tTimes = getBookingTimesOnRes(t, targetIdUpper);
                                                    if (tTimes) {
                                                        if (sTimes.start < tTimes.end && tTimes.start < sTimes.end) {
                                                            if (!visitedT.has(t.rowId)) {
                                                                visitedT.add(t.rowId);
                                                                swapGroupT.set(t.rowId, t);
                                                                queueT.push(t);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        const checkLocked = (groupMap, targetRes) => {
                                            for (let customer of groupMap.values()) {
                                                if (customer.isRunningStatus || customer.status === 'DOING') return true;
                                                let isSwapCombo = customer.category === 'COMBO' || (customer.serviceName && customer.serviceName.includes('套餐'));
                                                if (isSwapCombo) {
                                                    let times = getBookingTimesOnRes(customer, targetRes);
                                                    if (times && times.phase === 1 && (customer.phase1_locked === "TRUE" || customer.phase1_locked === true)) return true;
                                                    if (times && times.phase === 2 && (customer.phase2_locked === "TRUE" || customer.phase2_locked === true)) return true;
                                                } else {
                                                    if (customer.is_locked === "TRUE" || customer.isManualLocked) return true;
                                                    if (customer.phase1_locked === "TRUE" || customer.phase1_locked === true) return true;
                                                }
                                            }
                                            return false;
                                        };

                                        if (checkLocked(swapGroupT, targetIdUpper) || checkLocked(swapGroupS, bSourceId)) {
                                            isConnectedComponentValid = false;
                                        }

                                        if (isConnectedComponentValid) {
                                            for (let t of swapGroupT.values()) {
                                                let p = { rowId: t.rowId, forceSync: true };
                                                if (t.is_locked === "TRUE" || t.isManualLocked) {
                                                    p.is_locked = "TRUE";
                                                    p.isManualLocked = true;
                                                }
                                                let isSCombo = t.category === 'COMBO' || (t.serviceName && t.serviceName.includes('套餐'));
                                                if (isSCombo) {
                                                    const p1Id = String(t.phase1_res_idx).toUpperCase();
                                                    const p2Id = String(t.phase2_res_idx).toUpperCase();
                                                    if (p1Id === targetIdUpper) p.phase1_res_idx = bSourceId.toLowerCase();
                                                    if (p2Id === targetIdUpper) p.phase2_res_idx = bSourceId.toLowerCase();
                                                } else {
                                                    p.current_resource_id = bSourceId.toLowerCase();
                                                    p.location = bSourceId.toLowerCase();
                                                }
                                                multiBatchPayloads.push(p);
                                            }

                                            for (let s of swapGroupS.values()) {
                                                let p = { rowId: s.rowId, forceSync: true };
                                                if (s.is_locked === "TRUE" || s.isManualLocked) {
                                                    p.is_locked = "TRUE";
                                                    p.isManualLocked = true;
                                                }
                                                let isSCombo = s.category === 'COMBO' || (s.serviceName && s.serviceName.includes('套餐'));
                                                if (isSCombo) {
                                                    const p1Id = String(s.phase1_res_idx).toUpperCase();
                                                    const p2Id = String(s.phase2_res_idx).toUpperCase();
                                                    if (p1Id === bSourceId) p.phase1_res_idx = targetIdUpper.toLowerCase();
                                                    if (p2Id === bSourceId) p.phase2_res_idx = targetIdUpper.toLowerCase();
                                                } else {
                                                    p.current_resource_id = targetIdUpper.toLowerCase();
                                                    p.location = targetIdUpper.toLowerCase();
                                                }
                                                multiBatchPayloads.push(p);
                                            }
                                            
                                            multiSwapSuccess = true;
                                        }
                                    }

                                    if (!multiSwapSuccess) {
                                        Swal.fire('系統提示', '⚠️ 系統無法移動此客人！目標位置已被佔用，且無法進行換位排程。', 'warning');
                                        return;
                                    } else {
                                        batchPayloads = multiBatchPayloads;
                                    }
                                }

                                batchPayloads.push(updateData);

                                Swal.fire({ title: '系統正在嘗試自動重新安排座位...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                                universalSend('/api/batch-process-bookings', { payloads: batchPayloads }).then((res) => {
                                    Swal.close();
                                    fetchData(true);
                                }).catch(err => {
                                    Swal.fire('系統提示', "⚠️ 儲存失敗！請檢查網路連線。", 'warning');
                                    fetchData(true);
                                });
                            };

                            executeSwap();
                        } else {
                            Swal.fire({ title: '儲存中，請稍候...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                            universalSend('/api/update-booking-details', updateData).then((res) => {
                                Swal.close();
                                fetchData(true);
                            }).catch(err => {
                                Swal.fire('系統提示', "⚠️ 儲存失敗！請檢查網路連線。", 'warning');
                                fetchData(true);
                            });
                        }
                    }; // Kết thúc executeSingleMove

                    try {
                        console.log('Executing Single Move...');
                        executeSingleMove();
                    } catch (e) {
                        console.error(e);
                        Swal.fire('Lỗi Logic JS', e.message, 'error');
                    }
                } // Kết thúc if(b)
            } // Kết thúc if(payload...)
            
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

    // --- CẬP NHẬT V109.8: BẮT LỖI TRÙNG THỢ (EARLY RETURN) ---
    const handleWalkInSave = async (data) => {
        // Hỗ trợ cả mảng (Group Booking) và Object (Single Booking)
        const checkList = Array.isArray(data) ? data : [data];

        for (let item of checkList) {
            // Lọc ra thợ yêu cầu
            const reqStaff = normalizeStaffId(item.nhanVien || item.staffId || item.serviceStaff || item.technician || item.requestedStaff);
            const isSpecificStaff = reqStaff && !['隨機', '男', '女', '男師', '女師', 'RANDOM', 'MALE', 'FEMALE', '', 'undefined', 'null'].includes(reqStaff);

            if (isSpecificStaff) {
                // Parse thời gian bắt đầu & kết thúc dự kiến
                let timeStr = item.thoiGian || item.gioDen || item.startTimeString || "";
                const newStart = safeTimeToMins(timeStr);
                const newDur = parseInt(item.duration || item.thoiGianLam || extractStandardDuration(item.dichVu || item.serviceName) || 60, 10);
                const newEnd = newStart + newDur;

                // Lấy ra các ca hiện tại của ngày hôm nay (không tính ca đã Cancel/Done)
                const activeBookings = bookings.filter(b => {
                    if (b.isDoneStatus) return false;
                    const bDateStr = b.startTimeString ? b.startTimeString.split(' ')[0].replace(/\//g, '-') : '';
                    return bDateStr === viewDate.replace(/\//g, '-');
                });

                // Vòng lặp so sánh Matrix Overlap
                for (let b of activeBookings) {
                    // Skip check nếu đang edit chính cái booking đó
                    if (item.rowId && String(b.rowId) === String(item.rowId)) continue;

                    const bStart = safeTimeToMins(b.startTimeString);
                    const bEnd = bStart + parseInt(b.duration || 60, 10);

                    // Phép tính Overlap logic (Chạm lề <= không tính là trùng)
                    if (newStart < bEnd && bStart < newEnd) {
                        const staffCols = [
                            normalizeStaffId(b.serviceStaff), normalizeStaffId(b.staffId), normalizeStaffId(b.staffId2),
                            normalizeStaffId(b.staffId3), normalizeStaffId(b.staffId4), normalizeStaffId(b.staffId5),
                            normalizeStaffId(b.staffId6), normalizeStaffId(b.ServiceStaff), normalizeStaffId(b.technician),
                            normalizeStaffId(b.requestedStaff)
                        ];

                        // NẾU THỢ ĐÃ BỊ KẸT Ở 1 TRONG CÁC CỘT CỦA CA "b" -> CHẶN ĐỨNG
                        if (staffCols.includes(reqStaff)) {
                            Swal.fire('系統提示', `❌ 技師 ${reqStaff} 於此時段已被預約`, 'warning');
                            return; // Chặn đứng flow lưu data
                        }
                    }
                }
            }
        }

        try {
            for (let item of checkList) {
                const res = await axios.post('/api/admin-booking', item);
                if (res.data && res.data.error) throw new Error(res.data.error);
                
                // [RACE CONDITION FIX]: Add a small delay between consecutive booking requests
                // to give the backend enough time to finish syncData() completely.
                if (checkList.length > 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }
            setShowAvailability(false);
            fetchData(true); // STRICT ONE-WAY FLOW
        } catch (error) {
            console.error("Booking Save Error:", error);
            const errorMsg = (error.response && error.response.data && error.response.data.error) ? error.response.data.error : error.message;
            // Throw so that cyx_bookingHandler.js catches the custom string, NOT the Axios object
            throw new Error(errorMsg);
        }
    };

    const handleManualUpdateStatus = async (rowId, status) => { Swal.fire({ title: '確認', text: '確認更新狀態?', icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }).then(async (res) => { if (res.isConfirmed) { await axios.post('/api/update-status', { rowId, status }); fetchData(); } }); };
    const handleRetryConnection = () => { setQuotaError(false); fetchData(true); };

    const safeStaffList = useMemo(() => staffList || [], [staffList]);

    const safeBookings = Array.isArray(bookings) ? bookings : [];

    const todaysBookings = useMemo(() => {
        return safeBookings.filter(b => {
            if (!b.startTimeString) return false;
            return window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate);
        });
    }, [safeBookings, viewDate]);

    // Sử dụng SSOT để đồng bộ UI hiển thị trạng thái chờ khách
    const enrichedStaffList = useMemo(() => {
        const nowObj = window.getTaipeiDate ? window.getTaipeiDate() : new Date();
        const openHour = window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 5;
        const currentMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < openHour ? 1440 : 0);

        if (window.StaffSorter && window.StaffSorter.enrichStaffListWithDesignated) {
            return window.StaffSorter.enrichStaffListWithDesignated(safeStaffList, todaysBookings, currentMins);
        }

        return safeStaffList; // Fallback an toàn
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

    const waitingList = todaysBookings.filter(b => !b.status.includes('完成') && !b.status.includes('✅') && !b.status.includes(APP_STATUS.COMPLETED) && (b.status === '已預約' || b.status === APP_STATUS.WAITING));

    const visualReadyStaff = readyStaff;

    return (
        <div className="min-h-screen flex flex-col bg-slate-50">
            <header className={`text-white p-3 shadow-md flex justify-between items-center sticky top-0 z-50 transition-colors ${quotaError ? 'bg-red-800' : 'bg-[#1e1b4b]'}`}>
                <div className="flex items-center gap-3">
                    <span className="bg-emerald-500 text-white px-2 py-1 rounded font-black text-sm shadow-sm">V109.8</span>
                    <span className="font-bold hidden md:inline tracking-wider">
                        {window.SYSTEM_CONFIG?.SHOP_INFO?.NAME || '心悟禪養身館'}
                        {window.SYSTEM_CONFIG?.SHOP_INFO?.BRANCH ? ` (${window.SYSTEM_CONFIG.SHOP_INFO.BRANCH}店)` : ''}
                    </span>
                    <div className="flex items-center gap-2 bg-white/10 rounded px-2 py-1 border border-white/20">
                        <button onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate() - 1); setViewDate(d.toISOString().split('T')[0]) }} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                        <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} className="bg-transparent text-white font-bold outline-none cursor-pointer text-center" style={{ colorScheme: 'dark' }} />
                        <button onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate() + 1); setViewDate(d.toISOString().split('T')[0]) }} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={() => setActiveTab('timeline-main')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab === 'timeline-main' ? 'bg-indigo-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-indigo-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-building"></i> <span className="hidden md:inline">{window.SYSTEM_CONFIG?.UI_LABELS?.MAIN_BRANCH || '本館'}</span></button>
                    <button onClick={() => setActiveTab('timeline-opp')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab === 'timeline-opp' ? 'bg-teal-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-teal-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-store"></i> <span className="hidden md:inline">{window.SYSTEM_CONFIG?.UI_LABELS?.OPP_BRANCH || '對面館'}</span></button>
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

                    <button onClick={() => setShowAvailability(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded font-bold text-sm flex gap-1 items-center shadow-md animate-pulse ml-2"><i className="fas fa-phone-volume"></i> <span className="hidden lg:inline">預約</span></button>

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
                            {visualReadyStaff.map((s, idx) => { const qIdx = readyQueue.indexOf(s.id); return window.StaffCard3D && <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} queueIndex={qIdx !== -1 ? qIdx : undefined} onMoveStaff={handleManualMoveStaff} />; })}
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
                        staffList={staffList}
                    />
                )}

                {activeTab === 'timeline-main' && window.TimelineView && (
                    <div className="w-full h-full flex flex-col relative border-2 border-indigo-200 rounded-lg bg-white overflow-hidden shadow-sm">
                        <window.TimelineView
                            branch="main"
                            timelineData={timelineData}
                            liveStatusData={resourceState}
                            onEditPhase={handleControlAction}
                            onOpenControlCenter={handleOpenControlCenter}
                            staffList={staffList}
                            statusData={statusData}
                        />
                    </div>
                )}

                {activeTab === 'timeline-opp' && window.TimelineView && (
                    <div className="w-full h-full flex flex-col relative border-2 border-teal-200 rounded-lg bg-white overflow-hidden shadow-sm">
                        <window.TimelineView
                            branch="opp"
                            timelineData={timelineData}
                            liveStatusData={resourceState}
                            onEditPhase={handleControlAction}
                            onOpenControlCenter={handleOpenControlCenter}
                            staffList={staffList}
                            statusData={statusData}
                        />
                    </div>
                )}
            </main>

            {showCheckIn && window.CheckInBoard && <window.CheckInBoard staffList={staffList} statusData={statusData} onUpdateStatus={updateStaffStatus} onClose={() => setShowCheckIn(false)} bookings={todaysBookings} salaryData={salaryData} viewDate={viewDate} />}
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
                                            {window.formatResourceLabel(rid, true)}
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
                                            {item.resourceId ? window.formatResourceLabel(item.resourceId, true) : '已鎖定預測位置'}
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
                    bookings={todaysBookings}
                />
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<window.ErrorBoundary><App /></window.ErrorBoundary>);
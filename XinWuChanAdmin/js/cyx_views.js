/**
 * ============================================================================
 * FILE: js/views.js
 * PHIÊN BẢN: V111.1 (SMOOTH SCROLL TO NOW & FAB BUTTON ADDED)
 * ============================================================================
 * CHANGE LOG V111.1:
 * - [TIMELINE]: Tích hợp useRef và useEffect để tự động smooth scroll tới thời điểm 
 * hiện tại (lùi 150px để dễ nhìn) sau khi load xong.
 * - [TIMELINE]: Bổ sung nút Floating "回到現在" (Trở về hiện tại) ở góc trên bên phải.
 * - [STATUS SYNC]: Tích hợp window.BOOKING_STATUS từ data.js để đồng nhất
 * các trạng thái (等待中, 服務中, 已完成, 已取消) trên toàn bộ UI.
 */

const { useState, useEffect, useMemo, useRef } = React;

// --- GLOBAL SYSTEM CONFIG GETTERS (FALLBACK TO DEFAULTS IF DATA.JS NOT READY) ---
const getConfig = () => window.SYSTEM_CONFIG || { SCALE: {}, OPERATION_TIME: {} };
const getMaxChairs = () => {
    const config = getConfig();
    return (config.SCALE && config.SCALE.MAX_CHAIRS) || config.MAX_CHAIRS;
};
const getMaxBeds = () => {
    const config = getConfig();
    return (config.SCALE && config.SCALE.MAX_BEDS) || config.MAX_BEDS;
};
const getOpenHour = () => {
    const config = getConfig();
    return (config.OPERATION_TIME && config.OPERATION_TIME.OPEN_HOUR !== undefined) ? config.OPERATION_TIME.OPEN_HOUR : 5;
};
const getCutOffHour = () => {
    const config = getConfig();
    return (config.OPERATION_TIME && config.OPERATION_TIME.CUT_OFF_HOUR !== undefined) ? config.OPERATION_TIME.CUT_OFF_HOUR : 2;
};
const getOpenMins = () => getOpenHour() * 60;
const getRatesConfig = () => getConfig().RATES || { JIE_PRICE: 250, OIL_BONUS: 0 };
const getBookingStatus = () => window.BOOKING_STATUS || {
    WAITING: '等待中',
    SERVING: '服務中',
    COMPLETED: '已完成',
    CANCELLED: '已取消'
};

// --- COMPONENT CHỌN GIỜ 24H TÙY CHỈNH ---
const CustomTimePicker24h = ({ value, onChange, disabled }) => {
    const [hour, min] = (value || "12:00").split(':');

    const handleHourChange = (e) => {
        if (onChange) onChange({ target: { value: `${e.target.value}:${min}` } });
    };

    const handleMinChange = (e) => {
        if (onChange) onChange({ target: { value: `${hour}:${e.target.value}` } });
    };

    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const mins = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    return (
        <div className={`flex items-center justify-center ${disabled ? 'opacity-70 pointer-events-none' : ''}`}>
            <select
                value={hour}
                onChange={handleHourChange}
                disabled={disabled}
                className={`bg-transparent font-mono text-sm font-bold outline-none cursor-pointer appearance-none text-right hover:text-indigo-600 transition-colors ${disabled ? 'text-slate-500' : 'text-slate-800'}`}
            >
                {hours.map(h => <option key={`h-${h}`} value={h}>{h}時</option>)}
            </select>
            <span className="text-slate-400 font-bold mx-0.5">:</span>
            <select
                value={min}
                onChange={handleMinChange}
                disabled={disabled}
                className={`bg-transparent font-mono text-sm font-bold outline-none cursor-pointer appearance-none text-left hover:text-indigo-600 transition-colors ${disabled ? 'text-slate-500' : 'text-slate-800'}`}
            >
                {mins.map(m => <option key={`m-${m}`} value={m}>{m}分</option>)}
            </select>
        </div>
    );
};

// --- HÀM TIỆN ÍCH LỌC VÀ SẮP XẾP NHÂN VIÊN ---
const getProcessedStaffList = (rawList, statusData, currentSelected) => {
    if (!rawList || !Array.isArray(rawList)) return [];
    const safeStatus = statusData || {};

    let available = rawList.filter(s => {
        if (typeof s !== 'object') return true;
        const st = safeStatus[s.id]?.status;
        if (!st) return true;
        return ['READY', 'EAT', 'OUT_SHORT'].includes(st);
    }).sort((a, b) => {
        if (typeof a !== 'object' || typeof b !== 'object') return 0;
        const timeA = safeStatus[a.id]?.stafftime !== undefined ? Number(safeStatus[a.id].stafftime) : Number.MAX_SAFE_INTEGER;
        const timeB = safeStatus[b.id]?.stafftime !== undefined ? Number(safeStatus[b.id].stafftime) : Number.MAX_SAFE_INTEGER;
        return timeA - timeB;
    });

    if (currentSelected && currentSelected !== '隨機') {
        const isPresent = available.find(s => (typeof s === 'object' ? s.id : s) === currentSelected);
        if (!isPresent) {
            const selectedObj = rawList.find(s => (typeof s === 'object' ? s.id : s) === currentSelected);
            if (selectedObj) {
                available = [selectedObj, ...available];
            } else {
                available = [{ id: currentSelected, name: currentSelected }, ...available];
            }
        }
    }
    return available;
};

// --- HÀM LÀM SẠCH TÊN DỊCH VỤ ---
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
window.getCleanServiceName = getCleanServiceName;

// Hàm window.getPrice đã được chuyển sang cyx_utils.js làm Single Source Of Truth

window.getOilPrice = (isOilFlagOrString) => {
    let isOil = false;
    if (typeof isOilFlagOrString === 'boolean') isOil = isOilFlagOrString;
    else if (typeof isOilFlagOrString === 'string' && (isOilFlagOrString.includes('油') || isOilFlagOrString.includes('Oil'))) isOil = true;
    
    if (!isOil) return 0;
    
    const config = window.SYSTEM_CONFIG || {};
    const finance = config.FINANCE || {};
    return finance.OIL_BONUS !== undefined ? finance.OIL_BONUS : 0;
};

// --- HÀM KIỂM TRA DỊCH VỤ CẠO GIÓ/GIÁC HƠI ---
const checkGuaShaService = (booking) => {
    if (!booking) return false;
    const note = (booking.ghiChu || booking.note || booking.originalNote || "").toString().toUpperCase();
    return note.includes('刮痧') || note.includes('拔罐');
};

// ============================================================================
// 0. BOOKING CONTROL MODAL (SUPER MODAL)
// ============================================================================
const BookingControlModal = ({ isOpen, onClose, onAction, booking, meta, liveData, contextResourceId, staffList, statusData, timelineData, resourceState }) => {
    if (!isOpen || !booking) return null;
    const STATUS = getBookingStatus();

    // Các cờ tính năng mở rộng
    const isOil = booking.isOil || (booking.serviceName && booking.serviceName.includes('油'));
    const isGuaSha = checkGuaShaService(booking) || booking.isGuaSha === true;

    const effectiveDuration = (booking.isTimeAnomaly && booking.standardDuration) ? booking.standardDuration : (booking.duration || 60);
    const totalDuration = effectiveDuration;

    const initialP1 = meta && meta.phase1_duration !== undefined
        ? meta.phase1_duration
        : (booking.phase1_duration !== undefined ? booking.phase1_duration : totalDuration / 2);

    const [phase1, setPhase1] = useState(initialP1);

    const currentSequence = (meta && meta.sequence) ? meta.sequence : (booking.flow || 'FB');
    const [localFlow, setLocalFlow] = useState(currentSequence);
    const isBodyFirstLocal = localFlow === 'BF';

    const [selectedPhase1Res, setSelectedPhase1Res] = useState('auto');
    const [selectedPhase2Res, setSelectedPhase2Res] = useState('auto');
    const [selectedSingleRes, setSelectedSingleRes] = useState('auto');

    const [timeLeft, setTimeLeft] = useState(0);
    const [percent, setPercent] = useState(0);
    const [timerString, setTimerString] = useState("--:--");

    const initCleanService = booking.cleanServiceName || getCleanServiceName(booking.serviceName);
    const [selectedService, setSelectedService] = useState(initCleanService);

    const [selectedStaff, setSelectedStaff] = useState('隨機');

    const requestedStaff = booking.requestedStaff || booking.staffId || '隨機';

    // State cho Chia Đơn 4 Ô
    const [isSplitMode, setIsSplitMode] = useState(false);
    const [selectedStaff2, setSelectedStaff2] = useState('隨機');
    
    // Khởi tạo blocks
    const totalBlocks = window.getServiceBlocks ? window.getServiceBlocks(initCleanService) : 2;
    const [blocks1, setBlocks1] = useState(booking.staff1_blocks || totalBlocks);

    const processedStaffList = useMemo(() => {
        const activeStaffList = staffList || window.STAFF_LIST || [];
        return getProcessedStaffList(activeStaffList, statusData, selectedStaff);
    }, [staffList, statusData, selectedStaff]);

    const processedStaffList2 = useMemo(() => {
        const activeStaffList = staffList || window.STAFF_LIST || [];
        return getProcessedStaffList(activeStaffList, statusData, selectedStaff2);
    }, [staffList, statusData, selectedStaff2]);

    const [showPaymentOptions, setShowPaymentOptions] = useState(false);
    const [startTimeStr, setStartTimeStr] = useState("12:00");

    const timeStrToMins = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return (h * 60) + (m || 0);
    };

    const minsToTimeStr = (mins) => {
        let m = Math.round(mins);
        while (m < 0) m += 1440;
        const h = Math.floor(m / 60) % 24;
        const mm = m % 60;
        return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };

    useEffect(() => {
        if (isOpen && booking) {
            const currentP1 = meta && meta.phase1_duration !== undefined
                ? meta.phase1_duration
                : (booking.phase1_duration !== undefined ? booking.phase1_duration : totalDuration / 2);
            setPhase1(currentP1);

            setSelectedService(booking.cleanServiceName || getCleanServiceName(booking.serviceName));

            let activeStaff = booking.serviceStaff || booking.staffId || '隨機';
            if (liveData && liveData.booking) {
                const liveStaff = liveData.booking.serviceStaff || liveData.booking.staffId;
                if (liveStaff && liveStaff !== 'undefined' && liveStaff !== 'null') {
                    activeStaff = liveStaff;
                }
            }
            setSelectedStaff(activeStaff);

            if (booking.staffId2 && booking.staffId2 !== 'undefined') {
                setIsSplitMode(true);
                setSelectedStaff2(booking.staffId2);
                setBlocks1(booking.staff1_blocks || 1);
            } else {
                setIsSplitMode(false);
                setSelectedStaff2('隨機');
                setBlocks1(booking.staff1_blocks || totalBlocks);
            }

            setShowPaymentOptions(false);
            setLocalFlow((meta && meta.sequence) ? meta.sequence : (booking.flow || 'FB'));

            // [V116.4 Tối ưu hiển thị vị trí ghế/giường đã cấp]
            let initP1Res = 'auto';
            let initP2Res = 'auto';

            if (booking.phase1_res_idx) {
                initP1Res = booking.phase1_res_idx.toLowerCase();
            } else if (booking.phase1_resource) {
                initP1Res = booking.phase1_resource.toLowerCase();
            } else if (booking.allocated_resource && booking.allocated_resource.includes('+')) {
                initP1Res = booking.allocated_resource.split('+')[0].trim().toLowerCase();
            } else if (booking.allocated_resource) {
                 initP1Res = booking.allocated_resource.toLowerCase();
            }

            if (booking.phase2_res_idx) {
                initP2Res = booking.phase2_res_idx.toLowerCase();
            } else if (booking.phase2_resource) {
                initP2Res = booking.phase2_resource.toLowerCase();
            } else if (booking.allocated_resource && booking.allocated_resource.includes('+')) {
                initP2Res = booking.allocated_resource.split('+')[1].trim().toLowerCase();
            }

            setSelectedPhase1Res(initP1Res);
            setSelectedPhase2Res(initP2Res);

            let initSingleRes = 'auto';
            if (booking.current_resource_id) {
                initSingleRes = booking.current_resource_id.toLowerCase();
            } else if (booking.phase1_resource) {
                initSingleRes = booking.phase1_resource.toLowerCase();
            } else if (booking.allocated_resource && booking.allocated_resource.includes('+')) {
                initSingleRes = booking.allocated_resource.split('+')[0].trim().toLowerCase();
            } else if (booking.allocated_resource) {
                initSingleRes = booking.allocated_resource.toLowerCase();
            } else if (booking.location) {
                initSingleRes = booking.location.toLowerCase();
            } else if (contextResourceId) {
                initSingleRes = contextResourceId.toLowerCase();
            }
            setSelectedSingleRes(initSingleRes);
        }
    }, [isOpen, booking, meta, liveData, totalDuration, contextResourceId]);

    useEffect(() => {
        if (isOpen && booking) {
            let initTime = "12:00";
            if (liveData && liveData.startTime) {
                const d = new Date(liveData.startTime);
                initTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            } else if (booking && booking.startTimeString) {
                const parts = booking.startTimeString.split(' ');
                if (parts.length > 1) initTime = parts[1].substring(0, 5);
            }
            setStartTimeStr(initTime);
        }
    }, [isOpen, booking?.rowId]);

    useEffect(() => {
        if (liveData && liveData.isRunning && !liveData.isPaused && liveData.startTime) {
            const timer = setInterval(() => {
                const start = new Date(liveData.startTime).getTime();
                const now = new Date().getTime();
                const totalMs = totalDuration * 60000;
                const actualElapsed = Math.max(0, now - start);
                const totalSecondsLeft = Math.ceil((totalMs - actualElapsed) / 1000);

                const isOvertime = totalSecondsLeft < 0;
                const absSeconds = Math.abs(totalSecondsLeft);
                const displayMins = Math.floor(absSeconds / 60).toString().padStart(2, '0');
                const displaySecs = Math.floor(absSeconds % 60).toString().padStart(2, '0');
                const sign = isOvertime ? "-" : "";
                const leftMins = isOvertime ? -Math.floor(absSeconds / 60) : Math.floor(absSeconds / 60);
                const pct = Math.min(100, Math.max(0, (actualElapsed / totalMs) * 100));

                setTimeLeft(leftMins);
                setPercent(pct);
                setTimerString(`${sign}${displayMins}:${displaySecs}`);
            }, 1000);
            return () => clearInterval(timer);
        } else {
            setTimerString("--:--");
            setPercent(0);
        }
    }, [liveData, totalDuration]);

    const phase2 = totalDuration - phase1;
    let startMins = timeStrToMins(startTimeStr);

    const openMins = getOpenMins();
    if (startMins < openMins) startMins += 1440;

    const switchMins = startMins + phase1;
    const endMins = startMins + totalDuration;

    const switchTimeStr = minsToTimeStr(switchMins);
    const endTimeStr = minsToTimeStr(endMins);

    const checkOverlap = (resId, checkStart, checkEnd, excludeRowId) => {
        if (timelineData && timelineData[resId]) {
            for (let slot of timelineData[resId]) {
                if (String(slot.booking.rowId) !== String(excludeRowId)) {
                    if (checkStart < slot.end && slot.start < checkEnd) return true;
                }
            }
        }
        return false;
    };

    const availableP1Resources = useMemo(() => {
        const type = isBodyFirstLocal ? 'bed' : 'chair';
        const maxCount = type === 'bed' ? getMaxBeds() : getMaxChairs();
        const list = [];
        for (let i = 1; i <= maxCount; i++) {
            const resId = `${type}-${i}`;
            const isOverlap = checkOverlap(resId, startMins, switchMins, booking?.rowId);
            if (!isOverlap) list.push(resId);
        }
        return list;
    }, [isBodyFirstLocal, startMins, switchMins, timelineData, booking?.rowId]);

    const availableP2Resources = useMemo(() => {
        const type = isBodyFirstLocal ? 'chair' : 'bed';
        const p2Start = switchMins + 5;
        const maxCount = type === 'bed' ? getMaxBeds() : getMaxChairs();
        const list = [];
        for (let i = 1; i <= maxCount; i++) {
            const resId = `${type}-${i}`;
            const isOverlap = checkOverlap(resId, p2Start, endMins, booking?.rowId);
            if (!isOverlap) list.push(resId);
        }
        return list;
    }, [isBodyFirstLocal, switchMins, endMins, timelineData, booking?.rowId]);

    const availableSingleResources = useMemo(() => {
        let type = 'bed';
        if (booking.forceResourceType === 'CHAIR' || booking.flow === 'FOOTSINGLE') type = 'chair';
        else if (booking.forceResourceType === 'BED' || booking.flow === 'BODYSINGLE') type = 'bed';
        else if (contextResourceId) type = contextResourceId.split('-')[0];

        const maxCount = type === 'bed' ? getMaxBeds() : getMaxChairs();
        const list = [];
        for (let i = 1; i <= maxCount; i++) {
            const resId = `${type}-${i}`;
            const isOverlap = checkOverlap(resId, startMins, endMins, booking?.rowId);
            if (!isOverlap) list.push(resId);
        }
        return list;
    }, [booking, contextResourceId, startMins, endMins, timelineData]);

    useEffect(() => {
        if (selectedPhase1Res !== 'auto' && selectedPhase1Res !== 'full' && !availableP1Resources.includes(selectedPhase1Res)) {
            if (availableP1Resources.length > 0) {
                setSelectedPhase1Res(availableP1Resources[0]);
            } else {
                setSelectedPhase1Res('auto');
            }
        }
    }, [availableP1Resources, selectedPhase1Res]);

    useEffect(() => {
        if (selectedPhase2Res !== 'auto' && selectedPhase2Res !== 'full' && !availableP2Resources.includes(selectedPhase2Res)) {
            if (availableP2Resources.length > 0) {
                setSelectedPhase2Res(availableP2Resources[0]);
            } else {
                setSelectedPhase2Res('auto');
            }
        }
    }, [availableP2Resources, selectedPhase2Res]);

    useEffect(() => {
        if (selectedSingleRes !== 'auto' && selectedSingleRes !== 'full' && !availableSingleResources.includes(selectedSingleRes)) {
            if (availableSingleResources.length > 0) {
                setSelectedSingleRes(availableSingleResources[0]);
            } else {
                setSelectedSingleRes('auto');
            }
        }
    }, [availableSingleResources, selectedSingleRes]);

    const handleStartTimeChange = (e) => setStartTimeStr(e.target.value);

    const handleSwitchTimeChange = (e) => {
        const newSwitchStr = e.target.value;
        if (!newSwitchStr) return;
        let newSwitchMins = timeStrToMins(newSwitchStr);
        if (newSwitchMins < getOpenMins()) newSwitchMins += 1440;

        let diff = newSwitchMins - startMins;
        if (diff < 0 && (newSwitchMins + 1440) - startMins <= totalDuration) {
            diff = (newSwitchMins + 1440) - startMins;
        }

        let newPhase1 = diff;
        if (newPhase1 < 0) newPhase1 = 0;
        if (newPhase1 > totalDuration) newPhase1 = totalDuration;
        setPhase1(newPhase1);
    };

    const handleChangeP1 = (val) => { let newP1 = parseInt(val) || 0; if (newP1 < 0) newP1 = 0; if (newP1 > totalDuration) newP1 = totalDuration; setPhase1(newP1); };
    const handleChangeP2 = (val) => { let newP2 = parseInt(val) || 0; if (newP2 < 0) newP2 = 0; if (newP2 > totalDuration) newP2 = totalDuration; setPhase1(totalDuration - newP2); };

    const triggerAction = (actionType, payload = {}) => {
        const fullPayload = { ...payload, bookingId: booking.rowId, currentBooking: booking, resourceId: contextResourceId, currentMeta: meta };
        onAction(actionType, fullPayload);
        if (showPaymentOptions) setShowPaymentOptions(false);
    };

    const handleFinishRequest = (e) => {
        if (e) e.stopPropagation();
        const pax = parseInt(booking.pax) || 1;
        if (pax > 1) setShowPaymentOptions(true);
        else triggerAction('FINISH', { scope: 'INDIVIDUAL' });
    };

    const isRunning = liveData && liveData.isRunning;
    const isPaused = liveData && liveData.isPaused;
    const isCombo = booking.category === 'COMBO' || (booking.serviceName && booking.serviceName.includes('Combo')) || (booking.serviceName && booking.serviceName.includes('套餐'));
    const isGroupBooking = (parseInt(booking.pax) || 1) > 1;
    const isSyncPending = booking && booking.isManualLocked;

    const isP1Full = availableP1Resources.length === 0;
    const isP2Full = availableP2Resources.length === 0;
    const isSaveDisabled = isP1Full || isP2Full;
    const isSingleFull = availableSingleResources.length === 0;
    const isSingleSaveDisabled = isSingleFull;

    const checkStaffConflict = (newStaffId, requiredBlocks) => {
        if (!newStaffId || newStaffId === '隨機') return null;

        const nowTimestamp = new Date();
        let currentMins = 0;
        if (isRunning) {
            currentMins = (nowTimestamp.getHours() * 60) + nowTimestamp.getMinutes();
        } else {
            currentMins = timeStrToMins(booking.startTime || '12:00');
        }
        
        const requiredMins = totalBlocks ? (requiredBlocks / totalBlocks) * totalDuration : totalDuration;
        
        const conflictingBooking = (liveData?.bookings || []).find(b => {
            if (String(b.rowId) === String(booking.rowId)) return false; 
            if (b.status === 'COMPLETED' || b.status === 'CANCELLED') return false;
            // Chỉ kiểm tra đơn cùng ngày
            if (b.date !== booking.date) return false;
            
            // Có phải thợ này không?
            const isBound = b.staffId === newStaffId || b.serviceStaff === newStaffId || 
                            b.staffId2 === newStaffId || b.staffId3 === newStaffId ||
                            b.requestedStaff === newStaffId;
            if (!isBound) return false;

            const bStart = timeStrToMins(b.startTime);
            const bStartAdjusted = bStart < 360 ? bStart + 1440 : bStart;
            const currentMinsAdjusted = currentMins < 360 ? currentMins + 1440 : currentMins;

            // Kiểm tra xem khoảng thời gian (currentMins -> currentMins + requiredMins) 
            // có lấn vào giờ bắt đầu của đơn kia không (bStart)
            if (bStartAdjusted >= currentMinsAdjusted && bStartAdjusted < (currentMinsAdjusted + requiredMins)) {
                return b;
            }
            
            // Hoặc đơn kia đang diễn ra và chồng lấp:
            const bDuration = parseInt(b.duration) || 60;
            if (currentMinsAdjusted >= bStartAdjusted && currentMinsAdjusted < (bStartAdjusted + bDuration)) {
                return b;
            }

            return false;
        });

        return conflictingBooking;
    };

    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-300 flex flex-col max-h-[90vh] relative">
                {/* Modal Header... */}
                {/* ... (Giữ nguyên nội dung header cũ để tiết kiệm không gian hiển thị mã) ... */}
                <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-4 text-white shrink-0">
                    <div className="flex justify-between items-start">
                        {/* LEFT SIDE: Info */}
                        <div className="flex-1 pr-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="bg-white/20 text-xs px-2 py-0.5 rounded uppercase font-mono tracking-wider">#{booking.rowId}</span>
                                {contextResourceId && <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded uppercase font-bold shadow-sm"><i className="fas fa-map-marker-alt mr-1"></i>{contextResourceId.replace('bed-', '床 ').replace('chair-', '足 ')}</span>}
                                {isSyncPending && <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded animate-pulse shadow-sm"><i className="fas fa-sync-alt animate-spin mr-1"></i>同步中</span>}
                                {isRunning && !isPaused && !isSyncPending && <span className="bg-green-500 text-xs font-bold px-2 py-0.5 rounded animate-pulse">{STATUS.SERVING}</span>}
                                {isPaused && <span className="bg-yellow-500 text-xs font-bold px-2 py-0.5 rounded">暫停中</span>}
                                {!isRunning && !isSyncPending && <span className="bg-gray-500 text-xs font-bold px-2 py-0.5 rounded">{STATUS.WAITING}</span>}
                            </div>
                            <h2 className="text-2xl font-black mt-1 truncate" title={booking.customerName}>
                                {booking.customerName}
                            </h2>
                            <div className="text-white/70 text-sm flex items-center gap-3 mt-1">
                                <span><i className="fas fa-phone-alt mr-1"></i> {booking.sdt || '---'}</span>
                                <span><i className="fas fa-users mr-1"></i> {booking.pax} 人</span>
                            </div>

                            {booking.adminNote && (
                                <div className="mt-2 bg-amber-500/20 border border-amber-400/50 text-amber-100 text-sm px-2.5 py-1.5 rounded-lg shadow-sm flex items-start gap-2 w-fit max-w-full">
                                    <i className="fas fa-sticky-note mt-0.5 text-amber-400"></i>
                                    <div>
                                        <span className="text-[10px] uppercase text-amber-400/80 font-bold block leading-none mb-0.5">特別要求</span>
                                        <span className="whitespace-pre-wrap font-bold break-words leading-tight tracking-wide">
                                            {booking.adminNote}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT SIDE: Tags & Close */}
                        <div className="flex items-start gap-3 shrink-0">
                            <div className="flex flex-col items-end gap-1.5 mt-1">
                                {requestedStaff !== '隨機' && (
                                    <span className="text-xs bg-pink-100 text-pink-800 px-2 py-1 rounded shadow-sm flex items-center font-bold border border-pink-300 whitespace-nowrap">
                                        <i className="fas fa-thumbtack mr-1"></i>指定: {requestedStaff}
                                    </span>
                                )}
                                {isOil && (
                                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded shadow-sm flex items-center font-bold border border-purple-300 whitespace-nowrap">
                                        💧 精油
                                    </span>
                                )}
                                {isGuaSha && (
                                    <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded shadow-sm flex items-center font-bold border border-orange-300 whitespace-nowrap">
                                        🔥 刮痧 / 拔罐
                                    </span>
                                )}
                            </div>
                            <button onClick={onClose} className="bg-white/10 hover:bg-white/30 rounded-full w-10 h-10 flex items-center justify-center transition-all shrink-0"><i className="fas fa-times text-xl"></i></button>
                        </div>
                    </div>
                </div>

                {booking.isTimeAnomaly && (
                    <div className="bg-orange-50/80 border border-orange-200 px-4 py-2 mx-6 mt-4 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <i className="fas fa-exclamation-triangle text-orange-500"></i>
                            <span className="text-orange-800 text-sm font-bold">時長異常:</span>
                            <span className="text-slate-600 text-sm">
                                紀錄 <span className="line-through opacity-70">{booking.duration + (booking.anomalyDiff || 0)}分</span>
                                <i className="fas fa-arrow-right mx-1 text-xs text-slate-400"></i>
                                標準 <span className="font-bold text-red-500">{booking.standardDuration}分</span>
                            </span>
                        </div>
                        <button
                            onClick={() => triggerAction('FORCE_FIX_DURATION', { standardDuration: booking.standardDuration })}
                            className="bg-orange-100 hover:bg-orange-500 hover:text-white text-orange-700 text-xs font-bold px-3 py-1.5 rounded shadow-sm transition-colors whitespace-nowrap border border-orange-200"
                        >
                            <i className="fas fa-wrench mr-1"></i>一鍵修復
                        </button>
                    </div>
                )}

                {/* BODY CONTENT */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 bg-slate-50 flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative">
                            {/* KHU VỰC 4 Ô (CHIA ĐƠN & SỐ TIẾT) */}
                            <div className="mb-4">
                                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">安排服務師傅與節數 (Blocks)</label>
                                <div className="grid grid-cols-12 gap-3 mb-2">
                                    {/* Ô TRÁI 1: CHỌN THỢ 1 */}
                                    <div className="col-span-8 relative bg-slate-50 border border-slate-200 rounded-lg">
                                        <select
                                            value={selectedStaff}
                                            onChange={(e) => {
                                                const newStaff = e.target.value;
                                                const staffObj = staffList && staffList.find(s => s.id === newStaff);
                                                const isMale = staffObj && (staffObj.gender === 'M' || staffObj.gender === '男');
                                                const reqStaff = booking.requestedStaff || booking.staffId || '';
                                                const needsFemale = reqStaff.includes('女') || reqStaff.includes('Female') || booking.isOil;

                                                if (needsFemale && isMale) {
                                                    if (!window.confirm(`⚠️ 警告：此客人有「限女」需求 (或為精油項目)，您確定要指派男師傅 [${newStaff}] 嗎？`)) {
                                                        return;
                                                    }
                                                }

                                                // --- Cảnh báo Overlap / Trùng lịch ---
                                                const reqBlocks = isSplitMode ? blocks1 : totalBlocks;
                                                const conflictWarning = checkStaffConflict(newStaff, reqBlocks);
                                                if (conflictWarning) {
                                                    const msg = `⚠️ 警告：師傅 [${newStaff}] 稍後 (${conflictWarning.startTime || '即將'}) 有指定客或預約客，剩餘時間不足以完成此服務。\n\n請問您確定要強制指派此師傅嗎？`;
                                                    if (!window.confirm(msg)) {
                                                        return;
                                                    }
                                                }

                                                setSelectedStaff(newStaff);
                                                // NẾU LÀ THAY THỢ (CHƯA CHIA ĐƠN HOẶC ĐÃ CHIA ĐƠN), KHI EDIT THỢ SẼ TRIGGER ĐỔI THỢ
                                                if (isRunning) {
                                                    if (window.confirm('確定要更換主服務師傅嗎？原師傅將恢復排班順序。')) {
                                                        triggerAction('CHANGE_STAFF', { newStaff: newStaff });
                                                    } else {
                                                        setSelectedStaff(selectedStaff); // Revert
                                                    }
                                                } else {
                                                    triggerAction('CHANGE_STAFF', { newStaff: newStaff });
                                                }
                                            }}
                                            className="w-full text-lg font-black text-indigo-800 bg-transparent focus:outline-none cursor-pointer appearance-none py-2 pl-3 pr-8"
                                        >
                                            <option value="隨機">尚未安排 ({STATUS.WAITING})</option>
                                            {processedStaffList.map(s => {
                                                const val = typeof s === 'object' ? s.id : s;
                                                const label = typeof s === 'object' ? (s.name || s.id) : s;
                                                const st = statusData && statusData[val] ? statusData[val].status : '';
                                                let suffix = st === 'BUSY' ? ' (忙碌)' : st === 'AWAY' ? ' (未到)' : '';
                                                return <option key={val} value={val}>{label}{suffix}</option>;
                                            })}
                                        </select>
                                        <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                                    </div>
                                    {/* Ô PHẢI 1: SỐ TIẾT THỢ 1 */}
                                    <div className="col-span-4 relative bg-slate-50 border border-slate-200 rounded-lg flex items-center">
                                        <select
                                            value={blocks1}
                                            onChange={(e) => {
                                                const b1 = parseInt(e.target.value);
                                                setBlocks1(b1);
                                                triggerAction('UPDATE_BLOCKS', { blocks1: b1, blocks2: totalBlocks - b1 });
                                            }}
                                            className="w-full text-center text-lg font-bold text-slate-700 bg-transparent focus:outline-none appearance-none"
                                            disabled={!isSplitMode}
                                        >
                                            {Array.from({ length: totalBlocks }, (_, i) => i + 1).map(val => (
                                                <option key={val} value={val}>{val} 節</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-12 gap-3">
                                    {/* Ô TRÁI 2: CHIA ĐƠN HOẶC THỢ 2 */}
                                    <div className="col-span-8 relative">
                                        {!isSplitMode ? (
                                            <button 
                                                onClick={() => {
                                                    setIsSplitMode(true);
                                                    setBlocks1(Math.max(1, totalBlocks - 1));
                                                }} 
                                                className="w-full text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 py-2.5 rounded-lg font-bold transition-colors border border-blue-200 flex justify-center items-center"
                                            >
                                                <i className="fas fa-cut mr-2"></i> 拆單
                                            </button>
                                        ) : (
                                            <div className="bg-orange-50 border border-orange-200 rounded-lg relative">
                                                <select
                                                    value={selectedStaff2}
                                                    onChange={(e) => {
                                                        const newStaff2 = e.target.value;
                                                        
                                                        if (newStaff2 !== '隨機') {
                                                            const conflictWarning = checkStaffConflict(newStaff2, totalBlocks - blocks1);
                                                            if (conflictWarning) {
                                                                const msg = `⚠️ 警告：師傅 [${newStaff2}] 稍後 (${conflictWarning.startTime || '即將'}) 有指定客或預約客，剩餘時間不足以完成此服務。\n\n請問您確定要強制接手此單嗎？`;
                                                                if (!window.confirm(msg)) {
                                                                    return;
                                                                }
                                                            }
                                                        }

                                                        setSelectedStaff2(newStaff2);
                                                        
                                                        // TÍNH TOÁN NGAY KHI GÁN THỢ 2 VÀ ĐANG CHẠY
                                                        if (isRunning && newStaff2 !== '隨機') {
                                                            if (confirm(`確定要由 [${newStaff2}] 接手剩餘的 ${totalBlocks - blocks1} 節嗎？\n(主師傅將立即設為待命/READY)`)) {
                                                                triggerAction('INLINE_SPLIT', { 
                                                                    staff1: selectedStaff,
                                                                    staff2: newStaff2, 
                                                                    blocks1: blocks1, 
                                                                    blocks2: totalBlocks - blocks1 
                                                                });
                                                            } else {
                                                                setSelectedStaff2('隨機');
                                                            }
                                                        }
                                                    }}
                                                    className="w-full text-lg font-black text-orange-800 bg-transparent focus:outline-none cursor-pointer appearance-none py-2 pl-3 pr-8"
                                                >
                                                    <option value="隨機">選擇接手師傅...</option>
                                                    {processedStaffList2.map(s => {
                                                        const val = typeof s === 'object' ? s.id : s;
                                                        const label = typeof s === 'object' ? (s.name || s.id) : s;
                                                        const st = statusData && statusData[val] ? statusData[val].status : '';
                                                        let suffix = st === 'BUSY' ? ' (忙碌)' : st === 'AWAY' ? ' (未到)' : '';
                                                        return <option key={val} value={val}>{label}{suffix}</option>;
                                                    })}
                                                </select>
                                                <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-orange-400 pointer-events-none"></i>
                                            </div>
                                        )}
                                    </div>
                                    {/* Ô PHẢI 2: SỐ TIẾT THỢ 2 */}
                                    <div className="col-span-4 relative bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center opacity-80">
                                        {isSplitMode ? (
                                            <span className="text-lg font-bold text-slate-500">{totalBlocks - blocks1} 節</span>
                                        ) : (
                                            <span className="text-sm font-medium text-slate-400">接手</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">服務項目</label>
                            <div className="relative">
                                <select
                                    value={selectedService}
                                    onChange={(e) => {
                                        const newSvc = e.target.value;
                                        setSelectedService(newSvc);
                                        if (newSvc.includes('油推') && selectedStaff === '隨機') {
                                            setSelectedStaff('女');
                                        }
                                    }}
                                    className="w-full text-lg font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:border-indigo-500 appearance-none"
                                >
                                    {window.SERVICES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <div className="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                                    <i className="fas fa-chevron-down"></i>
                                </div>
                                {selectedService !== (booking.cleanServiceName || getCleanServiceName(booking.serviceName)) && (
                                    <button onClick={() => triggerAction('CHANGE_SERVICE', { newService: selectedService })} className="absolute right-8 top-1.5 bottom-1.5 bg-indigo-600 text-white text-xs font-bold px-3 rounded hover:bg-indigo-700 animate-pulse">
                                        確認
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-800 rounded-xl p-4 text-white relative overflow-hidden flex flex-col justify-center items-center shadow-inner">
                            <div className="absolute bottom-0 left-0 h-1 bg-green-500 transition-all duration-1000 z-0" style={{ width: `${percent}%` }}></div>
                            <div className="z-10 text-center">
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">剩餘時間</div>
                                <div className={`text-5xl font-mono font-bold tracking-tighter ${timeLeft < 5 && isRunning ? 'text-red-400 animate-pulse' : 'text-white'}`}>{timerString}</div>

                                <div className="text-xs text-slate-400 mt-2 font-bold font-mono flex items-center justify-center gap-1">
                                    總共:
                                    {booking.isTimeAnomaly ? (
                                        <>
                                            <span className="line-through opacity-50">{booking.duration + (booking.anomalyDiff || 0)}</span>
                                            <span className="text-red-400 font-bold">{totalDuration}</span>
                                        </>
                                    ) : (
                                        <span>{totalDuration}</span>
                                    )}
                                    分鐘
                                </div>
                            </div>
                        </div>
                    </div>

                    {isCombo && (
                        <div className="bg-white p-5 rounded-xl border shadow-sm transition-all border-indigo-100 mt-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2"><i className="fas fa-sliders-h text-indigo-500"></i> 套餐時間調整</h3>

                                <button
                                    onClick={() => triggerAction('UPDATE_PHASE', {
                                        phase1,
                                        startTimeStr,
                                        switchTimeStr,
                                        phase1_res_idx: selectedPhase1Res === 'auto' ? null : selectedPhase1Res.toUpperCase(),
                                        phase2_res_idx: selectedPhase2Res === 'auto' ? null : selectedPhase2Res.toUpperCase(),
                                        flow: localFlow
                                    })}
                                    disabled={isSaveDisabled}
                                    className={`text-xs px-3 py-1.5 rounded font-bold border shadow-sm transition-all flex items-center ${isSaveDisabled ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-300'}`}
                                >
                                    <i className="fas fa-save mr-1"></i> 保存同步
                                </button>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 relative flex flex-col items-center">
                                    <label className={`block w-full text-xs font-bold mb-1 text-center transition-colors ${isBodyFirstLocal ? 'text-orange-600' : 'text-indigo-600'}`}>PHASE 1 ({isBodyFirstLocal ? '身' : '足'})</label>
                                    <div className="text-[11px] font-bold text-slate-500 mb-1 text-center bg-slate-100/50 py-0.5 px-2 rounded-full border border-slate-200">
                                        負責師傅: <span className="text-indigo-600 ml-1">{selectedStaff}</span>
                                    </div>
                                    <input type="number" value={phase1} onChange={(e) => handleChangeP1(e.target.value)} className={`w-full text-center text-3xl font-black border-b-2 focus:outline-none bg-transparent transition-colors ${isBodyFirstLocal ? 'text-orange-900 border-orange-200 focus:border-orange-600' : 'text-indigo-900 border-indigo-200 focus:border-indigo-600'}`} />
                                    <span className="block text-center text-xs text-gray-400 mt-1">分鐘</span>

                                    <div className="mt-3 flex flex-col items-center animate-in fade-in w-full max-w-[140px]">
                                        <div className={`flex w-full justify-center items-center gap-1.5 px-2 py-1 rounded-md border shadow-inner transition-colors ${isBodyFirstLocal ? 'bg-orange-50 border-orange-200' : 'bg-indigo-50 border-indigo-200'}`}>
                                            <i className={`fas fa-play-circle text-xs ${isBodyFirstLocal ? 'text-orange-500' : 'text-indigo-500'}`}></i>
                                            <CustomTimePicker24h value={startTimeStr} onChange={handleStartTimeChange} />
                                        </div>
                                    </div>

                                    <div className="mt-2 w-full max-w-[140px] relative">
                                        <select
                                            value={isP1Full ? 'full' : selectedPhase1Res}
                                            onChange={(e) => setSelectedPhase1Res(e.target.value)}
                                            disabled={isP1Full}
                                            className={`w-full text-xs font-bold appearance-none bg-slate-50 border rounded-md py-1.5 pl-2 pr-6 focus:outline-none focus:border-indigo-400 cursor-pointer shadow-sm transition-colors ${isP1Full ? 'bg-red-50 border-red-300 text-red-600 cursor-not-allowed' : (selectedPhase1Res !== 'auto' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-700')}`}
                                        >
                                            {isP1Full ? (
                                                <option value="full">⛔️ 該時段已滿</option>
                                            ) : (
                                                <>
                                                    <option value="auto">🤖 自動安排 (Auto)</option>
                                                    {availableP1Resources.map(resId => (
                                                        <option key={resId} value={resId}>
                                                            {resId.replace('bed-', '🛏️ 床 ').replace('chair-', '👣 足 ')}
                                                        </option>
                                                    ))}
                                                </>
                                            )}
                                        </select>
                                        <div className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-[10px]">
                                            <i className="fas fa-chevron-down"></i>
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0 flex flex-col items-center justify-start pt-2">
                                    <button
                                        onClick={() => {
                                            const newFlow = isBodyFirstLocal ? 'FB' : 'BF';
                                            setLocalFlow(newFlow);
                                            triggerAction('TOGGLE_SEQUENCE', { newFlow: newFlow });
                                        }}
                                        className={`w-20 h-20 rounded-2xl border-4 flex flex-col items-center justify-center text-xl shadow-lg hover:scale-105 active:scale-95 transition-all group relative overflow-hidden ${isBodyFirstLocal ? 'bg-orange-50 border-orange-400 text-orange-700 hover:bg-orange-100' : 'bg-indigo-50 border-indigo-400 text-indigo-700 hover:bg-indigo-100'}`}
                                        title={isBodyFirstLocal ? "點擊切換為 FB (先做足底)" : "點擊切換為 BF (先做身體)"}
                                    >
                                        <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIj48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiPjwvcGF0aD4KPC9zdmc+')] mix-blend-multiply"></div>
                                        <span className="font-black text-3xl z-10">{isBodyFirstLocal ? 'BF' : 'FB'}</span>
                                        <span className="text-[11px] font-bold mt-1 uppercase tracking-wider opacity-90 z-10 bg-white/50 px-1.5 rounded">
                                            {isBodyFirstLocal ? '先身後足' : '先足後身'}
                                        </span>
                                        <i className="fas fa-exchange-alt mt-1.5 text-xs opacity-50 transition-transform duration-300 group-hover:rotate-180 z-10"></i>
                                    </button>
                                    <div className="mt-4 flex flex-col items-center animate-in fade-in">
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border shadow-inner bg-slate-100 border-slate-300">
                                            <i className="fas fa-sync-alt text-xs text-slate-500"></i>
                                            <CustomTimePicker24h value={switchTimeStr} onChange={handleSwitchTimeChange} />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 relative flex flex-col items-center">
                                    <label className={`block w-full text-xs font-bold mb-1 text-center transition-colors ${isBodyFirstLocal ? 'text-indigo-600' : 'text-orange-600'}`}>PHASE 2 ({isBodyFirstLocal ? '足' : '身'})</label>
                                    <div className="text-[11px] font-bold text-slate-500 mb-1 text-center bg-slate-100/50 py-0.5 px-2 rounded-full border border-slate-200">
                                        {isSplitMode ? (
                                            <>接手師傅: <span className="text-orange-600 ml-1">{selectedStaff2}</span></>
                                        ) : (
                                            <>負責師傅: <span className="text-indigo-600 ml-1">{selectedStaff}</span></>
                                        )}
                                    </div>
                                    <input type="number" value={phase2} onChange={(e) => handleChangeP2(e.target.value)} className={`w-full text-center text-3xl font-black border-b-2 focus:outline-none bg-transparent transition-colors ${isBodyFirstLocal ? 'text-indigo-900 border-indigo-200 focus:border-indigo-600' : 'text-orange-900 border-orange-200 focus:border-orange-600'}`} />
                                    <span className="block text-center text-xs text-gray-400 mt-1">分鐘</span>

                                    <div className="mt-3 flex flex-col items-center animate-in fade-in w-full max-w-[140px]">
                                        <div className={`flex w-full justify-center items-center gap-1.5 px-2 py-1 rounded-md border shadow-inner opacity-80 cursor-not-allowed transition-colors ${isBodyFirstLocal ? 'bg-indigo-50 border-indigo-200' : 'bg-orange-50 border-orange-200'}`}>
                                            <i className={`fas fa-flag-checkered text-xs ${isBodyFirstLocal ? 'text-indigo-500' : 'text-orange-500'}`}></i>
                                            <CustomTimePicker24h value={endTimeStr} disabled={true} />
                                        </div>
                                    </div>

                                    <div className="mt-2 w-full max-w-[140px] relative">
                                        <select
                                            value={isP2Full ? 'full' : selectedPhase2Res}
                                            onChange={(e) => setSelectedPhase2Res(e.target.value)}
                                            disabled={isP2Full}
                                            className={`w-full text-xs font-bold appearance-none bg-slate-50 border rounded-md py-1.5 pl-2 pr-6 focus:outline-none focus:border-indigo-400 cursor-pointer shadow-sm transition-colors ${isP2Full ? 'bg-red-50 border-red-300 text-red-600 cursor-not-allowed' : (selectedPhase2Res !== 'auto' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-700')}`}
                                        >
                                            {isP2Full ? (
                                                <option value="full">⛔️ 該時段已滿</option>
                                            ) : (
                                                <>
                                                    <option value="auto">🤖 自動安排 (Auto)</option>
                                                    {availableP2Resources.map(resId => (
                                                        <option key={resId} value={resId}>
                                                            {resId.replace('bed-', '🛏️ 床 ').replace('chair-', '👣 足 ')}
                                                        </option>
                                                    ))}
                                                </>
                                            )}
                                        </select>
                                        <div className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-[10px]">
                                            <i className="fas fa-chevron-down"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="h-3 w-full bg-gray-200 rounded-full mt-6 flex overflow-hidden border border-gray-300">
                                <div className={`h-full transition-all flex items-center justify-center text-[8px] text-white/50 font-bold ${isBodyFirstLocal ? 'bg-orange-500' : 'bg-indigo-500'}`} style={{ width: `${(phase1 / totalDuration) * 100}%` }}>1</div>
                                <div className={`h-full transition-all flex items-center justify-center text-[8px] text-white/50 font-bold ${isBodyFirstLocal ? 'bg-indigo-500' : 'bg-orange-400'}`} style={{ width: `${(phase2 / totalDuration) * 100}%` }}>2</div>
                            </div>
                        </div>
                    )}

                    {!isCombo && (
                        <div className="bg-white p-5 rounded-xl border shadow-sm transition-all border-emerald-100 mt-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <i className="fas fa-clock text-emerald-500"></i> 單項服務調整
                                </h3>
                                <button
                                    onClick={() => triggerAction('UPDATE_SINGLE_TIME_LOC', {
                                        startTimeStr,
                                        newResId: selectedSingleRes === 'auto' ? null : selectedSingleRes.toUpperCase()
                                    })}
                                    disabled={isSingleSaveDisabled}
                                    className={`text-xs px-3 py-1.5 rounded font-bold border shadow-sm transition-all flex items-center ${isSingleSaveDisabled ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300'}`}
                                >
                                    <i className="fas fa-save mr-1"></i> 保存同步
                                </button>
                            </div>

                            <div className="flex items-center justify-center gap-4 md:gap-8">
                                <div className="flex flex-col items-center">
                                    <label className="block w-full text-xs font-bold mb-2 text-center text-emerald-600">開始時間</label>
                                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-md border shadow-inner bg-emerald-50 border-emerald-200">
                                        <i className="fas fa-play-circle text-emerald-500"></i>
                                        <CustomTimePicker24h value={startTimeStr} onChange={handleStartTimeChange} />
                                    </div>
                                </div>

                                <div className="flex flex-col items-center justify-center mt-5 text-gray-400">
                                    <i className="fas fa-arrow-right"></i>
                                    <span className="text-[10px] font-bold mt-1">{totalDuration}分</span>
                                </div>

                                <div className="flex flex-col items-center">
                                    <label className="block w-full text-xs font-bold mb-2 text-center text-emerald-600">結束時間</label>
                                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-md border shadow-inner opacity-80 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-500 font-mono font-bold">
                                        <i className="fas fa-flag-checkered"></i>
                                        {endTimeStr}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 border-t border-slate-100 pt-4 flex flex-col items-center">
                                <label className="block text-xs font-bold mb-2 text-center text-slate-500">安排座位/床位</label>
                                <div className="w-full max-w-[200px] relative">
                                    <select
                                        value={isSingleFull ? 'full' : selectedSingleRes}
                                        onChange={(e) => setSelectedSingleRes(e.target.value)}
                                        disabled={isSingleFull}
                                        className={`w-full text-sm font-bold appearance-none bg-slate-50 border rounded-md py-2 pl-3 pr-8 focus:outline-none focus:border-emerald-400 cursor-pointer shadow-sm transition-colors ${isSingleFull ? 'bg-red-50 border-red-300 text-red-600 cursor-not-allowed' : (selectedSingleRes !== 'auto' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700')}`}
                                    >
                                        {isSingleFull ? (
                                            <option value="full">⛔️ 該時段已滿</option>
                                        ) : (
                                            <>
                                                <option value="auto">🤖 自動安排 (Auto)</option>
                                                {availableSingleResources.map(resId => (
                                                    <option key={resId} value={resId}>
                                                        {resId.replace('bed-', '🛏️ 床 ').replace('chair-', '👣 足 ')}
                                                    </option>
                                                ))}
                                            </>
                                        )}
                                    </select>
                                    <div className="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-[10px]">
                                        <i className="fas fa-chevron-down"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ACTION FOOTER */}
                <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                    <div className="grid grid-cols-4 gap-3">
                        {!isRunning ? (
                            isGroupBooking ? (
                                <>
                                    <button onClick={() => triggerAction('START', { scope: 'INDIVIDUAL' })} className="col-span-1 bg-white border-2 border-green-600 text-green-700 hover:bg-green-50 rounded-xl font-bold text-sm shadow-sm flex flex-col items-center justify-center transform active:scale-95 transition-all"><i className="fas fa-play mb-1"></i> 開始(個人)</button>
                                    <button onClick={() => triggerAction('START', { scope: 'GROUP' })} className="col-span-1 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-200 flex flex-col items-center justify-center transform active:scale-95 transition-all"><i className="fas fa-users mb-1"></i> 開始(全體)</button>
                                </>
                            ) : (
                                <button onClick={() => triggerAction('START', { scope: 'INDIVIDUAL' })} className="col-span-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-green-200 flex items-center justify-center gap-2 transform active:scale-95 transition-all"><i className="fas fa-play"></i> 開始</button>
                            )
                        ) : (
                            <button onClick={() => triggerAction('PAUSE')} className={`col-span-2 text-white py-3 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transform active:scale-95 transition-all ${isPaused ? 'bg-green-500' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                                {isPaused ? <><i className="fas fa-play"></i> 繼續</> : <><i className="fas fa-pause"></i> 暫停</>}
                            </button>
                        )}
                        <button onClick={handleFinishRequest} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 flex flex-col items-center justify-center transform active:scale-95 transition-all"><i className="fas fa-check-circle text-xl mb-0.5"></i><span className="text-xs">結帳 ({STATUS.COMPLETED})</span></button>
                        <button onClick={() => { if (confirm('確定要取消嗎？')) triggerAction('CANCEL'); }} className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold flex flex-col items-center justify-center transform active:scale-95 transition-all"><i className="fas fa-trash-alt text-xl mb-0.5"></i><span className="text-xs">取消 ({STATUS.CANCELLED})</span></button>
                    </div>
                </div>

                {showPaymentOptions && (
                    <div className="absolute inset-0 z-[3010] bg-slate-900/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
                            <div className="bg-indigo-600 p-4 text-center">
                                <h3 className="text-white font-bold text-xl">結帳方式選擇</h3>
                                <p className="text-indigo-200 text-sm mt-1">{booking.customerName} ({booking.pax} 人)</p>
                            </div>
                            <div className="p-6 space-y-4">
                                <button onClick={() => triggerAction('FINISH', { scope: 'INDIVIDUAL' })} className="w-full py-4 bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:bg-indigo-50 rounded-xl flex items-center p-4 transition-all group transform active:scale-95">
                                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform"><i className="fas fa-user"></i></div>
                                    <div className="text-left"><div className="font-bold text-slate-800 text-lg">分開結帳</div><div className="text-xs text-slate-500">只結算此位客人的費用</div></div>
                                </button>
                                <button onClick={() => triggerAction('FINISH', { scope: 'GROUP' })} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl flex items-center p-4 shadow-lg hover:shadow-xl hover:from-blue-500 hover:to-indigo-500 transition-all group transform active:scale-95">
                                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform"><i className="fas fa-users"></i></div>
                                    <div className="text-left"><div className="font-bold text-white text-lg">團體結帳</div><div className="text-xs text-blue-100">結算全體 {booking.pax} 位客人的總費用</div></div>
                                </button>
                            </div>
                            <div className="bg-slate-50 p-3 text-center border-t border-slate-200">
                                <button onClick={() => setShowPaymentOptions(false)} className="text-slate-500 hover:text-slate-700 text-sm font-bold underline">取消</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// 1. TIMELINE VIEW
// ============================================================================
const TimelineView = ({ timelineData, onEditPhase, liveStatusData, staffList, statusData, onOpenControlCenter }) => {
    const [now, setNow] = useState(new Date());
    const STATUS = getBookingStatus();
    const scrollContainerRef = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const startHour = getOpenHour();
    const cutOffHour = getCutOffHour();
    let calculatedEndHour = cutOffHour;
    if (cutOffHour <= startHour) {
        calculatedEndHour += 24;
    }
    const endHour = calculatedEndHour + 2; // + 120 mins
    const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);

    const PIXELS_PER_MIN = 2.2;
    const HOUR_WIDTH = 60 * PIXELS_PER_MIN;
    const HEADER_HEIGHT = 45;
    const ROW_HEIGHT = 60;
    const LEFT_COL_WIDTH = 80;
    const TOTAL_WIDTH = LEFT_COL_WIDTH + (hours.length * HOUR_WIDTH);

    const currentH = now.getHours();
    const currentM = now.getMinutes();
    let adjustedH = currentH;

    if (adjustedH < startHour) {
        adjustedH += 24;
    }
    const currentTotalMins = adjustedH * 60 + currentM;
    const timelineStartMins = startHour * 60;
    const timelineEndMins = endHour * 60;

    const isNowVisible = currentTotalMins >= timelineStartMins && currentTotalMins <= timelineEndMins;
    const nowLeftPos = LEFT_COL_WIDTH + (currentTotalMins - timelineStartMins) * PIXELS_PER_MIN;

    // --- NEW: SMOOTH SCROLL TO NOW ---
    const scrollToNow = (smooth = true) => {
        if (scrollContainerRef.current) {
            const scrollPos = nowLeftPos - 150;
            scrollContainerRef.current.scrollTo({
                left: scrollPos > 0 ? scrollPos : 0,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
    };

    useEffect(() => {
        // Tự động cuộn đến thời điểm hiện tại sau khi render lần đầu (delay 500ms để DOM ổn định)
        const timer = setTimeout(() => {
            scrollToNow(true);
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    const colorPalette = [
        "bg-red-100 text-red-900 border-red-200 hover:bg-red-200",
        "bg-orange-100 text-orange-900 border-orange-200 hover:bg-orange-200",
        "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200",
        "bg-yellow-100 text-yellow-900 border-yellow-200 hover:bg-yellow-200",
        "bg-lime-100 text-lime-900 border-lime-200 hover:bg-lime-200",
        "bg-green-100 text-green-900 border-green-200 hover:bg-green-200",
        "bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-200",
        "bg-teal-100 text-teal-900 border-teal-200 hover:bg-teal-200",
        "bg-cyan-100 text-cyan-900 border-cyan-200 hover:bg-cyan-200",
        "bg-sky-100 text-sky-900 border-sky-200 hover:bg-sky-200",
        "bg-blue-100 text-blue-900 border-blue-200 hover:bg-blue-200",
        "bg-indigo-100 text-indigo-900 border-indigo-200 hover:bg-indigo-200",
        "bg-violet-100 text-violet-900 border-violet-200 hover:bg-violet-200",
        "bg-purple-100 text-purple-900 border-purple-200 hover:bg-purple-200",
        "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200 hover:bg-fuchsia-200",
        "bg-pink-100 text-pink-900 border-pink-200 hover:bg-pink-200",
        "bg-rose-100 text-rose-900 border-rose-200 hover:bg-rose-200",
        "bg-slate-200 text-slate-900 border-slate-300 hover:bg-slate-300"
    ];

    const getRowIdColor = (rowId) => {
        if (!rowId) return colorPalette[0];
        let hash = 0;
        const str = String(rowId);
        for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
        const index = Math.abs(hash) % colorPalette.length;
        return colorPalette[index];
    };

    const formatHour = (h) => {
        const displayH = h >= 24 ? h - 24 : h;
        return `${displayH}:00`;
    };

    const numChairs = getMaxChairs();
    const numBeds = getMaxBeds();
    const rows = [
        ...Array.from({ length: numChairs }, (_, i) => ({ id: `chair-${i + 1}`, label: `足 ${i + 1}`, type: 'chair' })),
        ...Array.from({ length: numBeds }, (_, i) => ({ id: `bed-${i + 1}`, label: `床 ${i + 1}`, type: 'bed' }))
    ];

    const getDisplayLabel = (booking) => {
        let rawName = booking.customerName || '';
        let sdt = booking.sdt || '';

        let name = rawName;
        let groupTag = '';
        let phoneExtract = '';

        const matches = rawName.match(/\(([^)]+)\)/g);
        if (matches) {
            matches.forEach(match => {
                const innerText = match.replace(/[()]/g, '').trim();
                if (innerText.includes('/')) {
                    groupTag = `(${innerText})`;
                }
                else if (/\d/.test(innerText)) {
                    phoneExtract = innerText;
                }
            });
            name = rawName.replace(/\([^)]*\)/g, '').trim();
        }

        name = name.replace(/\s*(先生|小姐|女士|太太)\s*/g, '').trim();

        if (name.length > 0) {
            name = name.charAt(0);
        }

        let finalPhone = sdt || phoneExtract;
        let phoneDisplay = '';

        if (finalPhone) {
            const digitOnly = finalPhone.replace(/\D/g, '');
            if (digitOnly.length >= 3) {
                phoneDisplay = `(${digitOnly.slice(-3)})`;
            } else if (digitOnly.length > 0) {
                phoneDisplay = `(${digitOnly})`;
            }
        }

        return `${name}${groupTag}${phoneDisplay}`;
    };

    const handleOpenControl = (booking, meta, resourceId) => {
        if (onOpenControlCenter) {
            onOpenControlCenter(booking, resourceId, meta);
        } else if (onEditPhase) {
            onEditPhase('OPEN_CONTROL_CENTER', { currentBooking: booking, resourceId: resourceId, currentMeta: meta });
        }
    };

    const liveRunningRowIds = useMemo(() => {
        const ids = new Set();
        if (liveStatusData) {
            Object.values(liveStatusData).forEach(res => {
                if (res.isRunning && !res.isPaused && res.booking && res.booking.rowId) {
                    ids.add(String(res.booking.rowId));
                }
            });
        }
        return ids;
    }, [liveStatusData]);

    const safeData = timelineData || {};

    return (
        <div className="relative w-full h-[calc(100vh-170px)]">

            {/* --- Kéo vùng Timeline vào trong Scroll Container --- */}
            <div ref={scrollContainerRef} className="bg-white rounded shadow border border-slate-200 h-full overflow-x-scroll overflow-y-auto relative custom-scrollbar pb-2">
                <style>{`
                    .custom-scrollbar::-webkit-scrollbar:horizontal { height: 35px !important; }
                    .custom-scrollbar::-webkit-scrollbar:vertical { width: 14px !important; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #94a3b8; border-radius: 20px; border: 3px solid #f1f5f9; background-clip: content-box; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #64748b; }
                    .custom-scrollbar::-webkit-scrollbar-corner { background: #f1f5f9; }
                    .edit-btn { opacity: 0; transition: opacity 0.2s, transform 0.1s; }
                    .timeline-block:hover .edit-btn { opacity: 1; }
                    .edit-btn:hover { transform: translate(-50%, -50%) scale(1.1); background-color: rgba(255,255,255,1) !important; color: #4f46e5 !important; border-color: #6366f1; }
                    .bf-indicator { animation: pulse-border 2s infinite; }
                    @keyframes pulse-border { 0% { border-color: #4f46e5; box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); } 70% { border-color: #818cf8; box-shadow: 0 0 0 4px rgba(79, 70, 229, 0); } 100% { border-color: #4f46e5; box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); } }
                `}</style>

                <div style={{ width: `${TOTAL_WIDTH}px`, minWidth: '100%' }} className="relative min-h-full">
                    {isNowVisible && (
                        <div
                            className="absolute top-0 bottom-0 z-[45] pointer-events-none flex flex-col transition-all duration-1000"
                            style={{ left: `${nowLeftPos}px`, width: '1px' }}
                        >
                            <div className="sticky top-0 z-50 flex justify-center w-full">
                                <div className="bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap" style={{ transform: 'translate(-50%, -5px)' }}>
                                    {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')} 現在
                                </div>
                            </div>
                            <div className="w-[1px] h-full bg-red-600 shadow-[0_0_2px_rgba(220,38,38,0.5)] absolute top-0 left-0 -z-10"></div>
                        </div>
                    )}

                    <div 
                        className="flex sticky top-0 z-30 bg-slate-100 border-b border-slate-300 shadow-md h-[45px] cursor-pointer hover:bg-slate-200 transition-colors"
                        onDoubleClick={() => scrollToNow(true)}
                        title="雙擊回到現在 (Nhấp đúp để trở về hiện tại)"
                    >
                        <div className="sticky left-0 top-0 z-40 bg-[#e2e8f0] border-r border-slate-300 flex items-center justify-center font-extrabold text-slate-700 text-sm shadow-[2px_0_5px_rgba(0,0,0,0.1)]"
                            style={{ width: `${LEFT_COL_WIDTH}px`, height: `${HEADER_HEIGHT}px` }}>
                            區域
                        </div>
                        <div className="flex bg-slate-50">
                            {hours.map(h => (
                                <div key={h} className="shrink-0 border-r border-slate-300 flex items-center justify-center text-slate-500 font-bold text-xs" style={{ width: `${HOUR_WIDTH}px`, height: `${HEADER_HEIGHT}px` }}>{formatHour(h)}</div>
                            ))}
                        </div>
                    </div>

                    <div className="relative bg-white pb-4">
                        {rows.map((row, index) => {
                            const isLastChairRow = index === (numChairs - 1);
                            const rowStyleClass = isLastChairRow ? "border-b-4 border-red-500" : "border-b border-slate-100";

                            return (
                                <div key={row.id} className={`flex relative transition-colors hover:bg-slate-50 ${rowStyleClass}`} style={{ height: `${ROW_HEIGHT}px` }}>
                                    <div className={`sticky left-0 z-20 shrink-0 border-r border-slate-300 flex items-center justify-center font-bold text-sm shadow-[2px_0_5px_rgba(0,0,0,0.05)] ${row.type === 'chair' ? 'bg-teal-50 text-teal-800' : 'bg-purple-50 text-purple-800'}`} style={{ width: `${LEFT_COL_WIDTH}px` }}>{row.label}</div>
                                    <div className="relative flex-1 h-full">
                                        <div className="absolute inset-0 flex pointer-events-none z-0">{hours.map(h => (<div key={h} className="shrink-0 border-r border-slate-200 h-full border-dashed" style={{ width: `${HOUR_WIDTH}px` }}></div>))}</div>
                                        {safeData[row.id] && safeData[row.id].map((slot, idx) => {

                                            const booking = slot.booking;
                                            if (!booking) return null;

                                            const rawStatusStr = String(booking.status || '');
                                            const isCancelled = rawStatusStr.includes('取消') || rawStatusStr.toUpperCase().includes('CANCEL') || booking.isDoneStatus === true || rawStatusStr === STATUS.CANCELLED;
                                            if (isCancelled) return null;

                                            let startMins = slot.start;
                                            let duration = slot.end - slot.start;
                                            const startOffset = startMins - (startHour * 60);
                                            const leftPos = startOffset * PIXELS_PER_MIN;
                                            const width = duration * PIXELS_PER_MIN;
                                            let bgClass = getRowIdColor(slot.booking.rowId);

                                            const label = getDisplayLabel(booking);
                                            const isOil = booking.isOil || (booking.serviceName && booking.serviceName.includes('油'));
                                            const hasNote = booking.adminNote ? true : false;

                                            const isGuaSha = checkGuaShaService(booking) || booking.isGuaSha === true;

                                            let staffName = booking.serviceStaff || booking.staffId || booking.ServiceStaff || '隨機';
                                            if (staffName === 'undefined' || staffName === 'null') staffName = '隨機';
                                            
                                            // [SPLIT BOOKING UPGRADE & V116.5 GROUP FIX]: 
                                            // Handle Group Bookings where `staffId2` is ACTUALLY Guest 2's staff, NOT Phase 2's staff!
                                            const isGroup = parseInt(booking.pax || 1, 10) > 1;
                                            if (isGroup) {
                                                // Group Booking: Use the resource index to pull the EXACT correct staff.
                                                // This matches cyx_app.js logic mapping grpIdx -> newBooking.staffIdN
                                                const match = String(row.id).match(/-(\d+)$/);
                                                if (match) {
                                                    const resIndex = parseInt(match[1], 10);
                                                    if (resIndex === 1) staffName = booking.serviceStaff || booking.staffId || '隨機';
                                                    else if (resIndex === 2) staffName = booking.staffId2 || '隨機';
                                                    else if (resIndex === 3) staffName = booking.staffId3 || '隨機';
                                                    else if (resIndex === 4) staffName = booking.staffId4 || '隨機';
                                                    else if (resIndex === 5) staffName = booking.staffId5 || '隨機';
                                                    else if (resIndex === 6) staffName = booking.staffId6 || '隨機';
                                                }
                                            } else {
                                                // Single Booking Split Phase Override (拆單)
                                                if (slot.meta && slot.meta.isCombo && slot.meta.phase === 2 && booking.staffId2 && booking.staffId2 !== '隨機' && booking.staffId2 !== 'undefined' && booking.staffId2 !== 'null') {
                                                    staffName = booking.staffId2;
                                                }
                                            }


                                            const displayStaff = staffName;

                                            const rawStatus = booking?.status || '';
                                            const isStatusRunning = rawStatus.includes('Running') || rawStatus.includes('服務中') || rawStatus.includes('running') || rawStatus === STATUS.SERVING;
                                            const isMetaRunning = slot.meta?.isRunning === true;
                                            const isPropRunning = booking?.isRunningStatus === true;
                                            const isLiveRunning = booking && liveRunningRowIds.has(String(booking.rowId));

                                            const isRunning = isStatusRunning || isMetaRunning || isPropRunning || isLiveRunning;
                                            const isSyncPending = booking && booking.isManualLocked;

                                            const comboSequence = (slot.meta && slot.meta.isCombo && slot.meta.sequence) ? slot.meta.sequence : null;

                                            const isTimeAnomaly = booking?.isTimeAnomaly === true;

                                            let timeLabel = "";
                                            if (slot.meta && slot.meta.isCombo && slot.meta.phase === 1) {
                                                const p1Dur = booking.phase1_duration || Math.round(duration / 2);
                                                const switchStr = window.formatMinutesToTime(slot.start + p1Dur);
                                                timeLabel = switchStr;
                                            } else {
                                                timeLabel = duration;
                                            }

                                            let specialBorderClass = "border border-black/5";

                                            if (isRunning) specialBorderClass = "border-2 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] z-20";
                                            else if (comboSequence === 'BF') specialBorderClass = "border-l-[6px] border-l-indigo-700 bf-indicator shadow-indigo-200";

                                            if (isTimeAnomaly) {
                                                if (!isRunning) {
                                                    specialBorderClass = "ring-2 ring-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.6)] animate-pulse z-20";
                                                } else {
                                                    specialBorderClass += " ring-2 ring-orange-400";
                                                }
                                            }

                                            const isComboPhase2 = slot.meta && slot.meta.isCombo && slot.meta.phase === 2;
                                            const showControlBtn = !isComboPhase2;

                                            return (
                                                <div key={idx}
                                                    className={`absolute top-1 bottom-1 rounded px-2 py-1 flex flex-col justify-between text-xs overflow-hidden shadow-sm z-10 cursor-pointer transition-all timeline-block group ${bgClass} ${specialBorderClass}`}
                                                    style={{ left: `${leftPos}px`, width: `${width}px` }}
                                                    title={`${booking.serviceName}\n${isRunning ? `🔥 ${STATUS.SERVING}` : ''}${isSyncPending && !isRunning ? '\n⏳ 同步中...' : ''}${isTimeAnomaly ? '\n⚠️ 時長異常' : ''}${hasNote ? `\n📝 備註: ${booking.adminNote}` : ''}`}
                                                    onClick={(e) => { if (showControlBtn) { e.stopPropagation(); handleOpenControl(booking, slot.meta, row.id); } }}
                                                >
                                                    <div className="flex justify-between items-start w-full leading-tight mb-0.5 gap-1">
                                                        <div className="font-bold truncate text-[11px] flex-1 flex items-center gap-1">
                                                            {label}
                                                        </div>
                                                        {comboSequence && (
                                                            <div
                                                                className={`shrink-0 text-[10px] font-black px-1 rounded shadow-sm leading-tight ${comboSequence === 'BF' ? 'bg-indigo-500 text-white' : 'bg-orange-500 text-white'}`}
                                                                title={comboSequence === 'BF' ? '先身後足' : '先足後身'}
                                                            >
                                                                {comboSequence}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex justify-between items-center w-full mt-auto">
                                                        <div className="truncate text-[10px] font-bold text-slate-700 flex items-center gap-1">
                                                            {displayStaff}
                                                            {isOil && <span className="text-[10px]" title="精油">💧</span>}
                                                            {isGuaSha && <span className="text-[10px]" title="刮痧/拔罐">🔥</span>}
                                                            {hasNote && <span className="text-[10px] text-amber-600" title={`備註: ${booking.adminNote}`}>📝</span>}
                                                        </div>
                                                        <div className={`text-[10px] font-bold font-mono px-1 rounded border border-black/5 shadow-sm ${isTimeAnomaly ? 'bg-orange-100 text-orange-800 animate-pulse' : 'bg-white/50 text-slate-800'}`}>
                                                            {timeLabel}
                                                        </div>
                                                    </div>

                                                    {showControlBtn && (
                                                        <button className="edit-btn absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white/95 backdrop-blur-sm text-slate-500 rounded-full flex items-center justify-center shadow-lg border border-slate-200 z-50 hover:text-indigo-600 hover:border-indigo-400 hover:bg-white transition-all"
                                                            onClick={(e) => { e.stopPropagation(); handleOpenControl(booking, slot.meta, row.id); }} title="設置">
                                                            <i className="fas fa-cog text-sm animate-spin-hover"></i>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
window.TimelineView = TimelineView;

// ============================================================================
// 2. COMMISSION VIEW 
// ============================================================================
const CommissionView = ({ bookings, staffList }) => {
    const RATES = getRatesConfig();
    const STATUS = getBookingStatus();
    const normalize = (str) => String(str || '').trim().replace(/\s+/g, '');

    const getJieCount = (serviceName, duration) => {
        const name = (serviceName || "").toUpperCase();
        if (name.includes('190') || name.includes('帝王')) return 6;
        if (name.includes('180')) return 6;
        if (name.includes('130') || name.includes('豪華')) return 4;
        if (name.includes('120')) return 4;
        if (name.includes('100') || name.includes('招牌')) return 3;
        if (name.includes('90')) return 3;
        if (name.includes('70') || name.includes('精選')) return 2;
        if (name.includes('60')) return 2;
        if (name.includes('50') || name.includes('45')) return 1;
        if (name.includes('40') || name.includes('35')) return 1;
        if (name.includes('30')) return 1;

        const mins = parseInt(duration || 0);
        if (mins >= 175) return 6;
        if (mins >= 115) return 4;
        if (mins >= 85) return 3;
        if (mins >= 55) return 2;
        if (mins >= 15) return 1;
        return 0;
    };

    const isOilService = (b) => {
        if (b.isOil === true || b.isOil === 'true') return true;
        const name = (b.serviceName || "").toLowerCase();
        if (name.includes('油') || name.includes('oil') || name.includes('精油')) return true;
        if (name.includes('帝王') || name.includes('a6')) return true;
        return false;
    };

    const commissionData = useMemo(() => {
        const stats = {};
        const lookupMap = {};

        (staffList || []).forEach(staff => {
            const entry = { id: staff.id, name: staff.name || staff.id, jie: 0, oil: 0, income: 0, orderCount: 0 };
            stats[staff.id] = entry;
            lookupMap[normalize(staff.id)] = entry;
            if (staff.name) lookupMap[normalize(staff.name)] = entry;
        });

        const safeBookings = Array.isArray(bookings) ? bookings : [];

        safeBookings.forEach(b => {
            if (b.status && (b.status.includes('取消') || b.status.includes('Cancel') || b.status.includes('❌') || b.status === STATUS.CANCELLED)) return;

            const slots = [
                { id: b.serviceStaff, status: b.Status1 },
                { id: b.staffId2, status: b.Status2 },
                { id: b.staffId3, status: b.Status3 },
                { id: b.staffId4, status: b.Status4 },
                { id: b.staffId5, status: b.Status5 },
                { id: b.staffId6, status: b.Status6 },
            ];

            const mainStatusDone = b.status && (b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅') || b.status === STATUS.COMPLETED);

            slots.forEach((slot) => {
                if (!slot.id || slot.id === '隨機' || slot.id === 'undefined' || slot.id === 'null' || slot.id === '') return;

                const isSlotDone = (slot.status && (slot.status.includes('完成') || slot.status.includes('Done') || slot.status === STATUS.COMPLETED)) || mainStatusDone;

                if (isSlotDone) {
                    const splitIds = String(slot.id).split(/[,，]/).map(s => s.trim()).filter(Boolean);

                    splitIds.forEach(singleId => {
                        if (singleId === '隨機' || !singleId) return;

                        const normKey = normalize(singleId);
                        let staffStat = lookupMap[normKey];
                        if (!staffStat) {
                            staffStat = { id: singleId, name: singleId, jie: 0, oil: 0, income: 0, orderCount: 0, isGhost: true };
                            stats[singleId] = staffStat;
                            lookupMap[normKey] = staffStat;
                        }
                        if (staffStat) {
                            const q = getJieCount(b.serviceName, b.duration);
                            const hasOil = isOilService(b);
                            staffStat.jie += q;
                            staffStat.orderCount += 1;
                            if (hasOil) staffStat.oil += 1;
                        }
                    });
                }
            });
        });

        Object.values(stats).forEach(s => { s.income = (s.jie * RATES.JIE_PRICE) + (s.oil * RATES.OIL_BONUS); });

        return Object.values(stats).sort((a, b) => {
            if (b.income !== a.income) return b.income - a.income;
            return String(a.id).localeCompare(String(b.id));
        });
    }, [bookings, staffList, RATES]);

    const totalJie = commissionData.reduce((sum, item) => sum + item.jie, 0);
    const totalOil = commissionData.reduce((sum, item) => sum + item.oil, 0);
    const totalIncome = commissionData.reduce((sum, item) => sum + item.income, 0);
    const validOrders = bookings.filter(b => !(b.status && (b.status.includes('取消') || b.status === STATUS.CANCELLED))).length;

    return (
        <div className="bg-white rounded shadow-lg flex flex-col h-[calc(100vh-280px)] animate-in fade-in zoom-in duration-300 font-sans border border-slate-200">
            <div className="bg-[#2e1065] text-white p-2 flex justify-between items-center shrink-0 rounded-t-lg shadow-md z-10">
                <div className="flex items-center gap-4">
                    <h2 className="text-sm font-bold flex items-center gap-2"><i className="fas fa-calculator"></i> 薪資與節數統計</h2>
                    <span className="text-xs text-gray-300 bg-white/10 px-2 py-0.5 rounded">有效單數: {validOrders}</span>
                </div>
                <div className="text-right">
                    <div className="text-[10px] text-gray-300 bg-white/10 px-2 py-0.5 rounded inline-block font-mono">(節數×{RATES.JIE_PRICE}) + (精油×{RATES.OIL_BONUS})</div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50">
                <table className="w-full text-left border-collapse relative">
                    <thead className="sticky top-0 z-10 shadow-sm">
                        <tr className="bg-slate-200 text-slate-700 font-bold text-sm border-b border-slate-300">
                            <th className="py-2 px-4 text-left w-1/4">技師</th>
                            <th className="py-2 px-4 text-center">總節數</th>
                            <th className="py-2 px-4 text-center">精油</th>
                            <th className="py-2 px-4 text-center">客數</th>
                            <th className="py-2 px-4 text-right w-1/4">總薪資</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-800 divide-y divide-gray-200 bg-white">
                        {commissionData.map((row) => (
                            <tr key={row.id} className="hover:bg-indigo-50/50 transition-colors duration-150">
                                <td className="py-3 px-4 text-left"><span className={`font-bold text-2xl ${row.isGhost ? 'text-orange-700' : 'text-indigo-900'}`}>{row.name}</span></td>
                                <td className="py-3 px-4 text-center">{row.jie > 0 ? <span className="inline-block min-w-[40px] bg-blue-100 text-blue-800 py-1 px-3 rounded font-bold text-xl shadow-sm">{row.jie}</span> : <span className="text-gray-300">-</span>}</td>
                                <td className="py-3 px-4 text-center">{row.oil > 0 ? <span className="inline-block min-w-[40px] bg-purple-100 text-purple-800 py-1 px-3 rounded font-bold text-xl shadow-sm">{row.oil}</span> : <span className="text-gray-300">-</span>}</td>
                                <td className="py-3 px-4 text-center font-bold text-lg text-gray-500">{row.orderCount > 0 ? row.orderCount : ''}</td>
                                <td className="py-3 px-4 text-right"><span className={`text-3xl font-black ${row.income > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{row.income.toLocaleString()}</span> <span className="text-sm text-gray-400 ml-1 font-bold">元</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-slate-100 border-t border-slate-300 p-3 shrink-0 rounded-b-lg">
                <div className="flex justify-between items-center text-base font-bold text-gray-600">
                    <div className="w-1/4 pl-4 text-gray-800 text-lg">總計:</div>
                    <div className="text-blue-700 text-2xl">{totalJie}</div>
                    <div className="text-purple-700 text-2xl">{totalOil}</div>
                    <div className="text-center w-[100px]"></div>
                    <div className="w-1/4 text-right pr-4 text-emerald-700 text-3xl font-black">{totalIncome.toLocaleString()} <span className="text-sm font-bold text-gray-500">元</span></div>
                </div>
            </div>
        </div>
    );
};
window.CommissionView = CommissionView;

// ============================================================================
// 3. REPORT VIEW
// ============================================================================
const ReportView = ({ bookings }) => {
    const STATUS = getBookingStatus();
    const safeBookings = Array.isArray(bookings) ? bookings : [];

    const processedStats = useMemo(() => {
        let revenue = 0; let guests = 0;
        safeBookings.forEach(b => {
            if (b.status && (b.status.includes('取消') || b.status === STATUS.CANCELLED)) return;
            const pax = parseInt(b.pax, 10) || 1;
            for (let i = 0; i < 6; i++) {
                const statusKey = `Status${i + 1}`;
                const isItemDone = (b[statusKey] && (b[statusKey].includes('完成') || b[statusKey].includes('Done') || b[statusKey] === STATUS.COMPLETED));
                const isAllDone = (b.status && (b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅') || b.status === STATUS.COMPLETED));

                if (isItemDone || (isAllDone && i < pax)) {
                    guests++;
                    if (b.price !== undefined && b.price > 0 && pax === 1) {
                        revenue += b.price;
                    } else {
                        const unitPrice = window.getPrice(b.serviceName);
                        const oilPrice = window.getOilPrice(b.isOil || (b.serviceName && b.serviceName.includes('油')));
                        revenue += (unitPrice + oilPrice);
                    }
                }
            }
        });
        return { revenue, guests };
    }, [safeBookings]);

    return (
        <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
                    <h3 className="text-gray-500 font-bold mb-2">本日營收</h3>
                    <div className="text-4xl font-black text-emerald-600">${processedStats.revenue.toLocaleString()}</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
                    <h3 className="text-gray-500 font-bold mb-2">已服務人數</h3>
                    <div className="text-4xl font-black text-blue-600">{processedStats.guests}</div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow border overflow-hidden flex flex-col h-[600px]">
                <div className="p-3 bg-slate-50 border-b font-bold text-slate-700 shrink-0">交易明細</div>
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-slate-500 sticky top-0 shadow-sm z-10">
                            <tr>
                                <th className="p-3 bg-white">時間</th>
                                <th className="p-3 bg-white">姓名</th>
                                <th className="p-3 bg-white">服務</th>
                                <th className="p-3 bg-white">師傅</th>
                                <th className="p-3 text-right bg-white">金額</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {safeBookings.flatMap((b, index) => {
                                if (b.status && (b.status.includes('取消') || b.status === STATUS.CANCELLED)) return [];
                                const pax = parseInt(b.pax, 10) || 1;
                                const rows = [];
                                const staffList = [b.serviceStaff, b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6];

                                for (let k = 0; k < 6; k++) {
                                    const statusKey = `Status${k + 1}`;
                                    const isSingleDone = (b[statusKey] && (b[statusKey].includes('完成') || b[statusKey].includes('Done') || b[statusKey] === STATUS.COMPLETED));
                                    const isAllDone = (b.status && (b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅') || b.status === STATUS.COMPLETED));

                                    if (isSingleDone || (isAllDone && k < pax)) {
                                        let singlePrice = 0;
                                        if (b.price !== undefined && b.price > 0 && pax === 1) {
                                            singlePrice = b.price;
                                        } else {
                                            const unitPrice = window.getPrice(b.serviceName);
                                            const oilPrice = window.getOilPrice(b.isOil || (b.serviceName && b.serviceName.includes('油')));
                                            singlePrice = unitPrice + oilPrice;
                                        }

                                        let staffName = staffList[k] || (k === 0 ? b.serviceStaff : null) || '隨機';

                                        rows.push(
                                            <tr key={`${b.rowId}-${k}`}>
                                                <td className="p-3 font-mono">{(b.startTimeString || ' ').split(' ')[1]}</td>
                                                <td className="p-3 font-bold">{b.customerName}{(pax > 1 || k > 0) && <span className="ml-2 text-xs text-gray-400 font-normal">#{k + 1}</span>}</td>
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

// ============================================================================
// 4. RESOURCE CARD 
// ============================================================================
const ResourceCard = ({ id, type, index, data, busyStaffIds, onAction, onSelect, onSwitch, onToggleMax, onToggleSequence, onServiceChange, onStaffChange, onSplit, staffList, statusData, getGroupMemberIndex }) => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [percent, setPercent] = useState(0);
    const [phaseLabel, setPhaseLabel] = useState(null);
    const [phaseTimeLeft, setPhaseTimeLeft] = useState(0);
    const [switchPercent, setSwitchPercent] = useState(null);
    const STATUS = getBookingStatus();

    const isOccupied = data && data.booking;
    const isPreview = data && data.isPreview;

    useEffect(() => {
        if (isOccupied && data.isRunning && !data.isPaused && data.startTime) {
            const timer = setInterval(() => {
                const start = new Date(data.startTime).getTime();
                const now = new Date().getTime();
                const totalMs = (data.booking.duration || 60) * 60000;
                const actualElapsed = Math.max(0, now - start);
                const totalSecondsLeft = Math.ceil((totalMs - actualElapsed) / 1000);

                const isOvertime = totalSecondsLeft < 0;
                const absMins = Math.floor(Math.abs(totalSecondsLeft) / 60);
                const totalLeft = isOvertime ? -absMins : absMins;

                setTimeLeft(totalLeft);
                setPercent(Math.min(100, Math.max(0, (actualElapsed / totalMs) * 100)));

                const isComboName = data.booking.serviceName && (data.booking.serviceName.includes('套餐') || data.booking.serviceName.includes('Combo'));
                const isCombo = data.booking.category === 'COMBO' || isComboName;

                if (isCombo) {
                    const sequence = (data.comboMeta && data.comboMeta.sequence) || 'FB';
                    const customPhase1 = data.booking.phase1_duration;

                    const split = window.getComboSplit(data.booking.duration, data.isMaxMode, sequence, customPhase1);
                    const flex = data.comboMeta && data.comboMeta.flex ? data.comboMeta.flex : 0;
                    const phase1Ms = (split.phase1 + flex) * 60000;
                    const currentSwitchPct = ((split.phase1 + flex) / (data.booking.duration || 1)) * 100;
                    setSwitchPercent(currentSwitchPct);

                    if (actualElapsed < phase1Ms) {
                        const leftSecs = Math.ceil((phase1Ms - actualElapsed) / 1000);
                        const isPhase1Overtime = leftSecs < 0;
                        const absP1Mins = Math.floor(Math.abs(leftSecs) / 60);

                        setPhaseTimeLeft(isPhase1Overtime ? -absP1Mins : absP1Mins);

                        if (sequence === 'FB') setPhaseLabel('👣 足部 (Phase 1)');
                        else setPhaseLabel('🛏️ 身體 (Phase 1)');
                    } else {
                        setPhaseTimeLeft(totalLeft);
                        if (sequence === 'FB') setPhaseLabel('🛏️ 身體 (Phase 2)');
                        else setPhaseLabel('👣 足部 (Phase 2)');
                    }
                } else {
                    setPhaseLabel(null);
                    setSwitchPercent(null);
                }
            }, 1000);
            return () => clearInterval(timer);
        } else {
            setPercent(0); setTimeLeft(0); setPhaseLabel(null);
        }
    }, [data, isOccupied]);

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

    let staffDisplay = '隨機';
    if (isOccupied) {
        const grpIdx = typeof getGroupMemberIndex === 'function' ? getGroupMemberIndex(id, data.booking.rowId) : 0;
        let myStaff = '';
        const b = data.booking || {};
        if (grpIdx === 0) myStaff = b.serviceStaff || b.ServiceStaff;
        else if (grpIdx === 1) myStaff = b.staffId2 || b.StaffId2;
        else if (grpIdx === 2) myStaff = b.staffId3 || b.StaffId3;
        else if (grpIdx === 3) myStaff = b.staffId4 || b.StaffId4;
        else if (grpIdx === 4) myStaff = b.staffId5 || b.StaffId5;
        else if (grpIdx === 5) myStaff = b.staffId6 || b.StaffId6;
        if (!myStaff || myStaff === 'undefined' || myStaff === 'null') myStaff = '隨機';
        staffDisplay = String(myStaff);
    }

    const processedStaffList = useMemo(() => {
        return getProcessedStaffList(staffList, statusData, staffDisplay);
    }, [staffList, statusData, staffDisplay]);

    const isOilJob = isOccupied && (data.booking.isOil || (data.booking.serviceName && (data.booking.serviceName.includes('油') || data.booking.serviceName.includes('Oil'))));
    const isGuaShaJob = isOccupied && (checkGuaShaService(data.booking) || data.booking.isGuaSha === true);

    const hasAdminNote = isOccupied && data.booking.adminNote && data.booking.adminNote.trim() !== '';

    const isCombo = isOccupied && (data.booking.category === 'COMBO' || (data.booking.serviceName && data.booking.serviceName.includes('套餐')));
    const flexMinutes = isCombo && data.comboMeta && data.comboMeta.flex ? data.comboMeta.flex : 0;
    const formatTimeStr = (iso) => { if (!iso) return '--:--'; const d = new Date(iso); return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; }

    let startObj = null, endObj = null, switchObj = null;
    let splitText = '';
    let isBodyFirst = false;

    if (isOccupied && data.isRunning && data.startTime) {
        startObj = new Date(data.startTime);
        endObj = new Date(startObj.getTime() + (data.booking.duration || 60) * 60000);

        if (isCombo) {
            const seq = (data.comboMeta && data.comboMeta.sequence) || 'FB';
            isBodyFirst = seq === 'BF';
            const customPhase1 = data.booking.phase1_duration;
            const split = window.getComboSplit(data.booking.duration, data.isMaxMode, seq, customPhase1);

            switchObj = new Date(startObj.getTime() + (split.phase1 + flexMinutes) * 60000);

            if (isBodyFirst) splitText = `(🔀 🛏️先做身體:${split.phase1}分 ➜ 👣足:${split.phase2}分)`;
            else splitText = `(👣先做足部:${split.phase1}分 ➜ 🛏️身:${split.phase2}分)`;
            if (split.isElastic) splitText += ' ⚡';
        }
    }

    let isCurrentlyWorkingDesignated = false;
    if (isOccupied && staffDisplay !== '隨機') {
        const b = data.booking || {};
        const requestFields = [b.staffId, b.staffId2, b.staffId3, b.staffId4, b.technician];
        isCurrentlyWorkingDesignated = requestFields.some(req => {
            const reqStr = String(req || '').trim();
            const randomKeywords = ['隨機', 'RANDOM', 'MALE', 'FEMALE', '男', '女', 'ANY', 'NULL', 'UNDEFINED', '', '不指定', '安排', '現場'];
            if (randomKeywords.some(kw => reqStr.toUpperCase() === kw || reqStr.includes('隨機'))) return false;
            return reqStr === staffDisplay;
        });
    }

    if (!isOccupied) {
        return (
            <div className={`res-card h-72 flex flex-col border-2 ${statusColor} relative`}>
                <div className="flex justify-between items-center p-2 border-b border-black/5 bg-black/5"><span className="font-black text-xs text-gray-500 uppercase">{type === 'chair' ? '足' : '床'}</span></div>
                <div className="flex-1 p-2 relative flex flex-col justify-center text-center"><button onClick={onSelect} className="w-full h-full flex flex-col items-center justify-center text-gray-300 hover:text-green-600 transition-colors group"><i className="fas fa-plus text-5xl"></i><span className="text-sm font-bold mt-2">排入</span></button></div>
            </div>
        );
    }

    const bfBadgeStyle = isBodyFirst ? "bg-indigo-600 text-white animate-pulse shadow-lg ring-2 ring-indigo-300" : "hidden";

    const requestedStaffLabel = data.booking.requestedStaff || data.booking.staffId || '隨機';

    return (
        <div className={`res-card h-72 flex flex-col border-2 ${statusColor} relative`}>
            <div className="flex justify-between items-center p-2 border-b border-black/5 bg-black/5">
                <span className="font-black text-xs text-gray-500 uppercase">{type === 'chair' ? '足' : '床'} {index}</span>
                {data.isRunning && !isPreview && (<div className={`text-xs font-mono font-bold ${timeLeft < 0 ? 'text-red-600 animate-pulse' : 'text-green-700'}`}>{timeLeft}分</div>)}
                {isPreview && data.timeToStart !== undefined && (<div className="text-xs font-bold text-blue-600 bg-blue-100 px-1 rounded">{data.previewType === 'NOW' ? 'NOW' : `${data.timeToStart}分`}</div>)}
            </div>

            <div className="flex-1 p-2 relative flex flex-col justify-center text-center pb-12">
                {data.isRunning && !isPreview && (
                    <>
                        <div className="absolute bottom-0 left-0 h-1 bg-green-500 progress-bar z-0 transition-all duration-1000" style={{ width: `${percent}%` }}></div>
                        {isCombo && switchPercent && (
                            <div className="absolute bottom-0 h-2 w-1 bg-orange-500 z-10 border-l border-white" style={{ left: `${switchPercent}%` }} title="Transition Point"></div>
                        )}
                    </>
                )}

                <div className="z-10 relative flex flex-col gap-2 mt-4">
                    {requestedStaffLabel !== '隨機' && (
                        <div className="absolute -top-3 left-0 z-50 pointer-events-none">
                            <div className="text-[10px] text-pink-600 font-bold border border-pink-200 bg-pink-50 rounded shadow-sm px-1.5 py-0.5 inline-block whitespace-nowrap">
                                <i className="fas fa-thumbtack mr-1"></i>指定: {requestedStaffLabel}
                            </div>
                        </div>
                    )}

                    <div className={`absolute -top-10 right-0 z-40 rounded-lg shadow-sm px-2 py-1 flex items-center gap-1 border-2 transition-all ${isCurrentlyWorkingDesignated ? 'bg-red-50 border-amber-600 ring-2 ring-amber-600' : 'bg-white border-slate-200'}`}>
                        <div className="relative flex items-center">
                            <select
                                className={`text-xl font-black text-center bg-transparent focus:outline-none cursor-pointer appearance-none pl-2 pr-5 transition-colors ${staffDisplay === '隨機' ? 'text-gray-400 hover:bg-slate-50' : 'text-slate-800 hover:bg-slate-50'}`}
                                value={staffDisplay}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    const newStaff = e.target.value;

                                    const staffObj = staffList && staffList.find(s => s.id === newStaff);
                                    const isMale = staffObj && (staffObj.gender === 'M' || staffObj.gender === '男');
                                    const reqStaff = data.booking.requestedStaff || data.booking.staffId || '';
                                    const needsFemale = reqStaff.includes('女') || reqStaff.includes('Female') || data.booking.isOil;

                                    if (needsFemale && isMale) {
                                        if (!window.confirm(`⚠️ 警告：此客人有「限女」需求 (或為精油項目)，您確定要指派男師傅 [${newStaff}] 嗎？`)) {
                                            return;
                                        }
                                    }

                                    if (data.isRunning && !isPreview) {
                                        if (window.confirm('確定要更換服務師傅嗎？原師傅將恢復排班順序。')) {
                                            onStaffChange(id, newStaff);
                                            setTimeout(() => alert('更換成功！計時器繼續運行。'), 300);
                                        }
                                    } else {
                                        onStaffChange(id, newStaff);
                                    }
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value="隨機" className="text-slate-800">尚未安排</option>
                                {processedStaffList.length === 0 && <option disabled>目前無空閒師傅</option>}

                                {(() => {
                                    let readyCount = 0;
                                    return processedStaffList.map(s => {
                                        const val = typeof s === 'object' ? s.id : s;
                                        const label = typeof s === 'object' ? (s.name || s.id) : s;
                                        const st = statusData && statusData[val] ? statusData[val].status : '';
                                        let prefix = '';
                                        let suffix = '';

                                        if (st === 'READY' || st === 'EAT' || st === 'OUT_SHORT') {
                                            readyCount++;
                                            prefix = `[#${readyCount}] `;
                                            if (st === 'READY') suffix = ' (待命)';
                                            else if (st === 'EAT') suffix = ' (用餐)';
                                            else if (st === 'OUT_SHORT') suffix = ' (外出)';
                                        } else if (st === 'BUSY') {
                                            suffix = ' (忙碌)';
                                        } else if (st === 'AWAY') {
                                            suffix = ' (未到)';
                                        }

                                        return <option key={val} value={val} className="text-slate-800">{prefix}{label}{suffix}</option>;
                                    });
                                })()}
                            </select>
                            <div className="pointer-events-none absolute right-1 text-xs transition-colors text-gray-500">
                                <i className="fas fa-chevron-down"></i>
                            </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onSplit(id); }} className={`w-6 h-6 flex items-center justify-center rounded-full text-xs shadow-sm transition-transform hover:scale-110 ml-1 ${isCurrentlyWorkingDesignated ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`} title="加人"><i className="fas fa-user-plus"></i></button>
                    </div>

                    {isCombo && (
                        <div className="absolute -top-12 left-0 flex gap-1 items-center">
                            <button onClick={(e) => { e.stopPropagation(); onToggleSequence(id); }}
                                className={`text-xs font-bold px-2 py-1 rounded shadow z-50 transition-colors flex items-center gap-1 ${isBodyFirst ? 'bg-indigo-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                title={isBodyFirst ? "目前順序：先做身體" : "目前順序：先做足部"}>
                                <i className="fas fa-sync-alt"></i>
                                {isBodyFirst && <span>BF</span>}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onToggleMax(id); }} className={`text-xs font-bold px-2 py-1 rounded shadow z-50 transition-colors ${data.isMaxMode ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-500'}`}><i className="fas fa-bolt"></i> Max</button>
                        </div>
                    )}

                    {isBodyFirst && (
                        <div className={`absolute top-0 left-0 w-full text-center z-30 pointer-events-none`}>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded shadow-sm border border-indigo-400 ${bfBadgeStyle}`}>
                                ⚠️ BODY FIRST
                            </span>
                        </div>
                    )}

                    <div className="font-bold text-slate-800 text-2xl truncate mt-4">{(data.booking.customerName || 'Unknown').split('(')[0]}{(data.booking.pax > 1) && <span className="text-sm text-gray-400 ml-1">(Grp)</span>}</div>

                    <select
                        className="text-sm font-bold text-gray-500 text-center bg-transparent border-b border-dashed border-gray-300 focus:outline-none w-full truncate cursor-pointer hover:bg-gray-50 appearance-none"
                        value={data.booking.cleanServiceName || getCleanServiceName(data.booking.serviceName || '')}
                        onChange={(e) => {
                            e.stopPropagation();
                            const newSvc = e.target.value;
                            onServiceChange(id, newSvc);
                            if (newSvc.includes('油推') && staffDisplay === '隨機') {
                                onStaffChange(id, '女');
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {window.SERVICES_LIST.map(svc => <option key={svc} value={svc}>{svc}</option>)}
                    </select>

                    {isCombo && (
                        <div className={`text-xs font-mono font-bold mt-1 truncate ${isBodyFirst ? 'text-indigo-700 bg-indigo-50 border border-indigo-200 p-1 rounded' : 'text-slate-400'}`}>
                            {splitText}
                        </div>
                    )}

                    {isCombo && data.isRunning && phaseLabel && (<div className={`text-sm font-black p-2 rounded border bg-white/80 ${phaseLabel.includes('足') ? 'text-emerald-700 border-emerald-200' : 'text-purple-700 border-purple-200'}`}>{phaseLabel} {flexMinutes > 0 && <span className="text-xs text-orange-500 bg-orange-100 px-1 rounded ml-1">+{flexMinutes}分</span>} <div className="text-xl font-mono mt-1">{phaseTimeLeft}分</div></div>)}
                    {isCombo && data.isRunning && data.comboMeta && data.comboMeta.targetId && (<div className="text-[10px] text-gray-400">➜ 轉: {data.comboMeta.targetId.toUpperCase()}</div>)}

                    <div className="flex flex-wrap justify-center gap-1 mt-1">
                        {isOilJob && <div className="text-xs text-purple-600 font-bold border border-purple-200 bg-purple-50 rounded px-2 py-1 inline-block">💧 精油</div>}
                        {isGuaShaJob && <div className="text-xs text-orange-600 font-bold border border-orange-200 bg-orange-50 rounded px-2 py-1 inline-block">🔥 刮/罐</div>}
                        {hasAdminNote && <div className="text-xs text-amber-700 font-bold border border-amber-200 bg-amber-50 rounded px-2 py-1 inline-block truncate max-w-[100px]" title={data.booking.adminNote}><i className="fas fa-sticky-note"></i> 備註</div>}
                    </div>

                    {data.isRunning && !isPreview && startObj && (<div className="bg-slate-50 rounded p-2 text-xs text-left space-y-1 mt-2 border border-slate-200 shadow-inner opacity-90"><div className="text-slate-600 font-bold flex justify-between"><span>🕒 開始:</span> <span className="font-mono text-blue-600">{formatTimeStr(startObj)}</span></div>{isCombo && switchObj && <div className="text-slate-500 flex justify-between"><span>⇄ 轉場:</span> <span className="font-mono text-orange-500">{formatTimeStr(switchObj)}</span></div>}<div className="text-slate-600 font-bold flex justify-between"><span>🏁 結束:</span> <span className="font-mono text-green-600">{formatTimeStr(endObj)}</span></div></div>)}
                    {isPreview && (<div className="mt-2 text-xs font-bold text-center">{data.previewType === 'NOW' && <span className="text-red-500 animate-pulse">🔴 該上鐘了</span>}{data.previewType === 'SOON' && <span className="text-blue-500">🔵 預約即滿到來</span>}{data.previewType === 'PHASE2' && <span className="text-orange-500">🟠 轉場準備</span>}</div>)}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 w-full p-2 bg-white z-50 border-t">
                {!data.isRunning || isPreview ? (
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onAction(id, 'start'); }} className={`py-2 rounded font-bold text-white text-xs shadow-md transform active:scale-95 transition-all flex flex-col items-center justify-center ${isPreview && data.previewType === 'NOW' ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-green-600 hover:bg-green-700'}`}>
                            <i className="fas fa-play mb-0.5"></i>開始
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onAction(id, 'finish'); }} className="py-2 rounded font-bold text-white bg-blue-600 hover:bg-blue-700 text-xs shadow-md transform active:scale-95 transition-all flex flex-col items-center justify-center">
                            <i className="fas fa-check-square mb-0.5"></i>結帳
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onAction(id, 'cancel'); }} className="py-2 rounded font-bold text-red-600 bg-red-50 border border-red-200 text-xs shadow-sm transform active:scale-95 transition-all flex flex-col items-center justify-center">
                            <i className="fas fa-trash-alt mb-0.5"></i>取消
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onAction(id, 'pause'); }} className={`py-1.5 rounded font-bold text-white text-xs shadow flex items-center justify-center transform active:scale-95 ${data.isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                            {data.isPaused ? '▶ 繼續' : '⏸ 暫停'}
                        </button>

                        {isCombo ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    alert("⛔️ 系統提示：\n\n套餐會自動安排轉場，不支援手動跨區轉場，以免破壞時程邏輯與造成錯誤！\n\n(若需更換同區座位，請在時間軸使用上下箭頭移動)");
                                }}
                                className="py-1.5 rounded font-bold text-slate-500 bg-slate-200 cursor-not-allowed flex items-center justify-center text-xs shadow"
                            >
                                <i className="fas fa-ban mr-1"></i> 禁止轉場
                            </button>
                        ) : (<div className="hidden"></div>)}

                        <button onClick={(e) => { e.stopPropagation(); onAction(id, 'finish'); }} className="py-1.5 rounded font-bold text-white bg-blue-600 hover:bg-blue-700 text-xs shadow flex items-center justify-center transform active:scale-95"><i className="fas fa-check-square mr-1"></i> 結帳</button>
                        <button onClick={(e) => { e.stopPropagation(); onAction(id, 'cancel_midway'); }} className="py-1.5 rounded font-bold text-white bg-red-500 hover:bg-red-600 text-xs shadow flex items-center justify-center transform active:scale-95"><i className="fas fa-times-circle mr-1"></i> 棄单</button>
                    </div>
                )}
            </div>
        </div>
    );
};
window.ResourceCard = ResourceCard;
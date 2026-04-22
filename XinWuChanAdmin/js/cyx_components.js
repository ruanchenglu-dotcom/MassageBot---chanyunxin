// FILE: js/components.js
// PHIÊN BẢN: V118.3 (UPGRADE: STAFF CARD UI FIX & STRICT COL I CHECK)
// CẬP Nhật: 2026-04-15

const { useState, useEffect, useMemo, useRef } = React;

// --- GLOBAL SYSTEM CONFIG GETTERS ---
const getBookingStatus = () => window.BOOKING_STATUS || {
    WAITING: '等待中',
    SERVING: '服務中',
    COMPLETED: '已完成',
    CANCELLED: '已取消'
};

/**
 * ============================================================================
 * 1. ERROR BOUNDARY (系統錯誤攔截)
 * ============================================================================
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, errorInfo) { console.error("System Error Log:", error, errorInfo); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-red-50 p-6 animate-fadeIn">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full border-l-8 border-red-600">
                        <div className="flex items-center gap-3 mb-4">
                            <i className="fas fa-exclamation-triangle text-4xl text-red-600"></i>
                            <h1 className="text-3xl font-black text-slate-800">系統發生錯誤</h1>
                        </div>
                        <p className="text-gray-600 mb-4 font-bold border-b pb-4">發生預期外的錯誤，請重新整理頁面。</p>
                        <div className="bg-slate-100 p-4 rounded text-xs font-mono mb-6 overflow-auto max-h-40 border border-slate-300 shadow-inner">
                            {this.state.error && this.state.error.toString()}
                        </div>
                        <button onClick={() => window.location.reload()} className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-lg shadow-lg transition-transform active:scale-95 flex justify-center items-center gap-2">
                            <i className="fas fa-redo-alt"></i> 重新整理
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
window.ErrorBoundary = ErrorBoundary;

/**
 * ============================================================================
 * 2. STAFF CARD 3D (技師卡片) - CẬP NHẬT GIAO DIỆN & LOGIC CỘT I
 * ============================================================================
 */
const StaffCard3D = ({ s, statusData, resourceState, queueIndex, isForcedBusy }) => {
    if (!s) return null;

    const genderStr = String(s.gender || '').toUpperCase();
    const isFemale = ['F', '女', 'FEMALE', 'NU'].includes(genderStr);
    const safeStatusData = statusData || {};
    const local = safeStatusData[s.id] || { status: 'AWAY' };
    let displayStatus = local.status;

    if (isForcedBusy) { displayStatus = 'BUSY'; }

    const hasUpcoming = s.hasUpcomingDesignated === true;

    let cardStyle = isFemale ? 'style-female' : 'style-male';
    let customClass = "";

    // 1. Gán style cơ bản theo trạng thái
    if (displayStatus === 'BUSY') { cardStyle = 'st-busy'; }
    else if (displayStatus === 'AWAY' || displayStatus === 'OFF') { cardStyle = 'st-away'; }
    else if (displayStatus === 'EAT') { cardStyle = 'st-eat'; }
    else if (displayStatus === 'OUT_SHORT') { cardStyle = 'bg-green-500 text-white !border-green-600'; }

    // 2. Logic ưu tiên: Cảnh báo sắp tới có lịch chỉ định (Chỉ đổi màu thẻ khi đang ở trạng thái READY)
    if (displayStatus === 'READY' && hasUpcoming) {
        customClass = "!bg-yellow-400 !text-black !border-yellow-500 z-10 shadow-md";
    }

    // 3. Trạng thái BUSY: Giữ tuyệt đối cardStyle 'st-busy' gốc, không thay đổi customClass (Đã xóa logic override bóng cam)

    return (
        <div className={`card-3d ${cardStyle} ${customClass} flex flex-col items-center justify-center relative p-0 overflow-hidden transition-all duration-300`}>


            {queueIndex !== undefined && (displayStatus === 'READY' || displayStatus === 'BUSY') && (
                <div className={`queue-badge ${displayStatus === 'BUSY' ? '!bg-slate-700 !text-white' : 'animate-bounce-slow'}`}>
                    {queueIndex + 1}
                </div>
            )}

            {(displayStatus === 'EAT' || displayStatus === 'OUT_SHORT') && (
                <div className="absolute top-0 left-0 w-full bg-black/30 text-white text-[10px] font-bold text-center z-10">
                    {displayStatus === 'EAT' ? '用餐' : '外出'}
                </div>
            )}

            <div className={`font-black text-2xl text-center leading-none w-full select-none flex-1 flex items-center justify-center break-words px-0.5 relative z-0 ${displayStatus === 'READY' && hasUpcoming ? 'text-black' : 'text-slate-800'}`}>
                {s.name}
            </div>
        </div>
    )
};
window.StaffCard3D = StaffCard3D;

/**
 * ============================================================================
 * 3. CHECKIN BOARD (技師管理看板) 
 * ============================================================================
 */
const CheckInBoard = ({ staffList, statusData, onClose, onUpdateStatus, bookings }) => {
    const STATUS = getBookingStatus();
    const safeStaffList = Array.isArray(staffList) ? staffList : [];

    // Tối ưu sắp xếp danh sách thợ theo số (id: "2" sẽ đứng trước "10")
    const sortedStaffList = useMemo(() => {
        return [...safeStaffList].sort((a, b) => {
            const numA = parseInt(a.id, 10);
            const numB = parseInt(b.id, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return String(a.id).localeCompare(String(b.id));
        });
    }, [safeStaffList]);

    const RATES = { JIE_PRICE: 250, OIL_BONUS: 80 };

    // Nâng cấp hàm normalize để gom chung "01" và "1"
    const normalize = (str) => {
        if (typeof window !== 'undefined' && window.normalizeStaffId) {
            return window.normalizeStaffId(str);
        }
        // Xóa khoảng trắng, cắt số 0 ở đầu (nếu có số theo sau) để gom chung ID, ép lên in hoa
        return String(str || '').trim().replace(/\s+/g, '').replace(/^0+(?=\d)/, '').toUpperCase();
    };

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
        if (name.includes('50')) return 1.5;
        if (name.includes('45')) return 1;
        if (name.includes('40')) return 1;
        if (name.includes('35')) return 1;
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
        return false;
    };

    const staffIncomeMap = useMemo(() => {
        const stats = {};
        const lookupMap = {};
        (staffList || []).forEach(staff => {
            const entry = { id: staff.id, jie: 0, oil: 0, income: 0 };
            stats[staff.id] = entry;
            // Ánh xạ bằng normalized ID
            lookupMap[normalize(staff.id)] = entry;
            if (staff.name) lookupMap[normalize(staff.name)] = entry;
        });
        const safeBookings = Array.isArray(bookings) ? bookings : [];
        safeBookings.forEach(b => {
            if (b.status && (b.status.includes('取消') || b.status.includes('❌') || b.status === STATUS.CANCELLED)) return;
            let potentialRawStrings = [b.staffId, b.serviceStaff, b.technician, b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6];
            const distinctNames = potentialRawStrings.join(',').split(/[,，\s/]+/).map(s => s.trim()).filter(s => s && s !== 'null' && s !== 'undefined');
            const validNames = [...new Set(distinctNames)].filter(name => {
                const n = name.toLowerCase();
                return !['隨機', '男', '女', '不指定', 'random'].some(bad => n.includes(bad));
            });
            validNames.forEach(key => {
                const normKey = normalize(key);
                let staffStat = lookupMap[normKey];
                if (staffStat) {
                    staffStat.jie += getJieCount(b.serviceName, b.duration);
                    if (isOilService(b)) staffStat.oil += 1;
                }
            });
        });
        Object.values(stats).forEach(s => { s.income = (s.jie * RATES.JIE_PRICE) + (s.oil * RATES.OIL_BONUS); });
        return stats;
    }, [bookings, staffList, STATUS]);

    const toggleCheckIn = (id) => {
        const current = (statusData && statusData[id]) ? statusData[id] : {};
        const newStatus = current.status === 'READY' || current.status === 'EAT' ? 'AWAY' : 'READY';

        let newCheckInTime = 0;
        let newStaffTime = 0;

        if (newStatus !== 'AWAY') {
            if (typeof window._lastCheckInTime === 'undefined') window._lastCheckInTime = 0;
            let now = Date.now();
            if (now <= window._lastCheckInTime) now = window._lastCheckInTime + 1;
            window._lastCheckInTime = now;
            newCheckInTime = now;

            // [V118 SSOT] Gọi cổng API quản lý vòng đời (Stage 1: Check-in)
            if (window.StaffSorter?.processCheckIn) {
                newStaffTime = window.StaffSorter.processCheckIn(id, statusData, staffList, newCheckInTime);
            } else {
                newStaffTime = newCheckInTime; // Fallback
            }
        }

        const newState = {
            ...statusData,
            [id]: {
                ...current,
                status: newStatus,
                checkInTime: newCheckInTime,
                stafftime: newStaffTime
            }
        };
        onUpdateStatus(newState);
    };

    const toggleOntimeLeave = async (id, currentValue) => {
        const newValue = !currentValue;
        const current = (statusData && statusData[id]) ? statusData[id] : {};
        const newState = { ...statusData, [id]: { ...current, isOntimeLeave: newValue } };
        onUpdateStatus(newState);
        try {
            await fetch('/api/update-staff-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staffId: id, isStrictTime: newValue })
            });
        } catch (e) { console.error("API Error:", e); }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-7xl rounded-t-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                <div className="p-4 bg-[#7e22ce] text-white flex justify-between items-center shrink-0 shadow-md">
                    <h2 className="text-2xl font-bold flex gap-2 items-center"><i className="fas fa-user-clock"></i> 技師管理看板</h2>
                    <button onClick={onClose} className="hover:text-red-300 bg-white/10 rounded-full w-10 h-10 flex items-center justify-center"><i className="fas fa-times text-2xl"></i></button>
                </div>
                <div className="grid grid-cols-12 gap-2 bg-slate-100 p-4 font-bold text-slate-700 text-base border-b sticky top-0 z-10 shadow-sm">
                    <div className="col-span-2 text-center border-r border-slate-300">姓名</div>
                    <div className="col-span-2 text-center text-emerald-700 border-r border-slate-300">💰 薪資</div>
                    <div className="col-span-2 text-center border-r border-slate-300">上班時間</div>
                    <div className="col-span-2 text-center border-r border-slate-300">下班時間</div>
                    <div className="col-span-2 text-center border-r border-slate-300">操作</div>
                    <div className="col-span-1 text-center border-r border-slate-300">狀態</div>
                    <div className="col-span-1 text-center text-blue-700">準時下班</div>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-2 bg-white custom-scrollbar">
                    {sortedStaffList.map(s => {
                        const current = (statusData && statusData[s.id]) ? statusData[s.id] : { status: 'AWAY', checkInTime: 0 };
                        const isWorking = current.status !== 'AWAY' && current.status !== 'OFF';
                        const income = staffIncomeMap[s.id] ? staffIncomeMap[s.id].income : 0;
                        const isOnTime = (current.isOntimeLeave !== undefined) ? current.isOntimeLeave : (s.isStrictTime === true);
                        return (
                            <div key={s.id} className="grid grid-cols-12 gap-2 items-center py-3 px-2 border-b border-gray-100 hover:bg-slate-50 transition-all group">
                                <div className="col-span-2 text-center font-black text-2xl text-slate-800 flex items-center justify-center gap-2">
                                    {s.name}
                                    <span className="text-xs text-gray-400 font-normal opacity-50 group-hover:opacity-100 hidden lg:inline">#{s.id}</span>
                                </div>
                                <div className="col-span-2 text-center">
                                    <span className={`px-3 py-1.5 rounded text-lg font-black border shadow-sm ${income > 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>
                                        ${income.toLocaleString()}
                                    </span>
                                </div>
                                <div className="col-span-2 text-center font-mono text-xl text-slate-600 font-bold">{s.shiftStart}</div>
                                <div className="col-span-2 text-center font-mono text-xl text-slate-600 font-bold">{s.shiftEnd}</div>
                                <div className="col-span-2 flex justify-center">
                                    {isWorking ? (
                                        <div className="flex items-center gap-2 w-full justify-center">
                                            <span className="font-mono font-bold text-lg text-slate-500 bg-gray-100 px-2 py-1 rounded border">
                                                {new Date(current.checkInTime).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <button onClick={() => toggleCheckIn(s.id)} className="text-red-500 hover:bg-red-500 hover:text-white border border-red-200 rounded-lg w-12 h-10 flex items-center justify-center transition-all shadow-sm active:scale-95" title="下班"><i className="fas fa-sign-out-alt text-2xl"></i></button>
                                        </div>
                                    ) : (
                                        <button onClick={() => toggleCheckIn(s.id)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-black text-lg w-full max-w-[140px] shadow-md transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2">
                                            <i className="fas fa-sign-in-alt"></i> 打卡
                                        </button>
                                    )}
                                </div>
                                <div className="col-span-1 text-center">
                                    <div className="relative">
                                        <select disabled={!isWorking} value={current.status} onChange={(e) => { const n = { ...statusData, [s.id]: { ...current, status: e.target.value } }; onUpdateStatus(n); }}
                                            className={`w-full appearance-none border-2 p-2 pl-8 rounded-lg font-bold cursor-pointer outline-none text-base shadow-sm ${isWorking ? 'border-purple-300 text-purple-800 bg-white' : 'bg-gray-100 text-gray-400 border-transparent'}`}>
                                            <option value="AWAY">⚪ 未到</option>
                                            <option value="READY">🟣 待命</option>
                                            <option value="EAT">🟠 用餐</option>
                                            <option value="OUT_SHORT" className="text-green-700 font-bold">🟢 外出</option>
                                        </select>
                                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <div className={`w-3 h-3 rounded-full ring-2 ring-white ${current.status === 'READY' ? 'bg-purple-600' : current.status === 'EAT' ? 'bg-orange-500' : current.status === 'OUT_SHORT' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-span-1 flex justify-center items-center">
                                    <label className="flex items-center justify-center w-full h-full cursor-pointer p-2 hover:bg-blue-50 rounded-lg">
                                        <input type="checkbox" className="w-6 h-6 text-blue-600 border-2 border-gray-300 rounded accent-blue-600" checked={isOnTime} onChange={() => toggleOntimeLeave(s.id, isOnTime)} />
                                    </label>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};
window.CheckInBoard = CheckInBoard;

/**
 * ============================================================================
 * 4. AVAILABILITY CHECK MODAL (預約檢查)
 * ============================================================================
 */
const AvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
    const getRoundedCurrentTime = () => {
        const now = new Date();
        let h = now.getHours();
        let m = now.getMinutes();
        let remainder = m % 10;
        if (remainder !== 0) {
            m += (10 - remainder);
            if (m >= 60) {
                m = 0;
                h = (h + 1) % 24;
            }
        }
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const STATUS = getBookingStatus();
    const [step, setStep] = useState('CHECK');
    const [checkResult, setCheckResult] = useState(null);

    const config = window.SYSTEM_CONFIG || { SCALE: {} };
    const maxChairs = (config.SCALE && config.SCALE.MAX_CHAIRS) || config.MAX_CHAIRS || 6;
    const maxBeds = (config.SCALE && config.SCALE.MAX_BEDS) || config.MAX_BEDS || 6;
    const paxOptionsArr = Array.from({ length: maxChairs + maxBeds }, (_, i) => i + 1);
    const [form, setForm] = useState({
        time: getRoundedCurrentTime(),
        service: (window.SERVICES_LIST && window.SERVICES_LIST.length > 2) ? window.SERVICES_LIST[2] : "Foot Massage",
        pax: 1,
        genderPref: '隨機',
        isOil: false,
        custName: '',
        custPhone: ''
    });

    useEffect(() => {
        if (form.isOil && form.genderPref !== '女' && !form.genderPref.includes('Female')) {
            setForm(prev => ({ ...prev, genderPref: '女' }));
        }
    }, [form.isOil]);

    const performCheck = () => {
        const safeStaffList = staffList || [];
        const safeBookings = bookings || [];
        const duration = window.getSafeDuration ? window.getSafeDuration(form.service, 60) : 60;
        const startMins = window.normalizeToTimelineMins ? window.normalizeToTimelineMins(form.time) : 720;
        const endMins = startMins + duration;

        const todays = safeBookings.filter(b => {
            if (window.isWithinOperationalDay && b.startTimeString) {
                return window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], initialDate) &&
                    !b.status.includes('取消') && !b.status.includes('完成') && b.status !== STATUS.CANCELLED && b.status !== STATUS.COMPLETED;
            }
            return false;
        });

        const totalStaffCapacity = safeStaffList.length;
        let maxConcurrency = 0;

        for (let t = startMins; t < endMins; t += 5) {
            let currentLoad = 0;
            todays.forEach(b => {
                const bStart = window.normalizeToTimelineMins ? window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]) : 0;
                const bEnd = bStart + (window.getSafeDuration ? window.getSafeDuration(b.serviceName, 60) : 60);
                if (t >= bStart && t < bEnd) {
                    currentLoad += (b.pax || 1);
                }
            });
            const totalLoadAtT = currentLoad + form.pax;
            if (totalLoadAtT > maxConcurrency) maxConcurrency = totalLoadAtT;
        }

        if (maxConcurrency > totalStaffCapacity) {
            setCheckResult({
                status: 'FULL',
                message: `❌ 技師不足: 需要 ${maxConcurrency}/${totalStaffCapacity} 位。`
            });
            return;
        }

        let chairOccupied = 0;
        let bedOccupied = 0;

        todays.forEach(b => {
            const bStart = window.normalizeToTimelineMins ? window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]) : 0;
            const bEnd = bStart + (window.getSafeDuration ? window.getSafeDuration(b.serviceName, 60) : 60);

            if (startMins < bEnd && endMins > bStart) {
                if (b.serviceName.includes('足') || b.type === 'CHAIR') chairOccupied += (b.pax || 1);
                else bedOccupied += (b.pax || 1);
                if (b.category === 'COMBO') { bedOccupied += (b.pax || 1); chairOccupied += (b.pax || 1); }
            }
        });

        const needed = form.pax;
        const resourceType = (window.SERVICES_DATA && window.SERVICES_DATA[form.service]) ? window.SERVICES_DATA[form.service].type : 'BED';
        let available = true;
        let msg = "✅ 可預約";

        if (resourceType === 'CHAIR') {
            if (chairOccupied + needed > 9) { available = false; msg = "❌ 足底區客滿"; }
        } else if (resourceType === 'BED') {
            if (bedOccupied + needed > 9) { available = false; msg = "❌ 指壓區客滿"; }
        } else {
            if (chairOccupied + needed > 9 || bedOccupied + needed > 9) { available = false; msg = "❌ 區域客滿"; }
        }

        if (available && form.genderPref !== '隨機' && form.genderPref !== '男' && form.genderPref !== '女') {
            const staffId = form.genderPref;
            const isStaffBooked = todays.some(b => {
                const bStart = window.normalizeToTimelineMins ? window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]) : 0;
                const bEnd = bStart + (window.getSafeDuration ? window.getSafeDuration(b.serviceName, 60) : 60);
                const isTimeConflict = (startMins < bEnd && endMins > bStart);
                return isTimeConflict && (b.serviceStaff === staffId || b.staffId === staffId || b.staffId2 === staffId);
            });
            if (isStaffBooked) { available = false; msg = `❌ 技師 ${staffId} 該時段忙碌`; }
        }

        setCheckResult({ status: available ? 'OK' : 'FULL', message: msg });
    };

    const handleFinalSave = () => {
        if (!form.custName || !form.custPhone) { alert("請輸入姓名和電話"); return; }
        const bookingData = {
            hoTen: form.custName,
            sdt: form.custPhone,
            dichVu: form.service,
            pax: form.pax,
            nhanVien: form.genderPref,
            isOil: form.isOil,
            ngayDen: initialDate.replace(/-/g, '/'),
            gioDen: form.time
        };
        onSave(bookingData);
    };

    // Tối ưu sắp xếp danh sách thợ cho Dropdown chọn thợ
    const sortedStaffList = useMemo(() => {
        const safeList = Array.isArray(staffList) ? staffList : [];
        return [...safeList].sort((a, b) => {
            const numA = parseInt(a.id, 10);
            const numB = parseInt(b.id, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return String(a.id).localeCompare(String(b.id));
        });
    }, [staffList]);

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[70] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl modal-animate flex flex-col overflow-hidden">
                <div className="bg-emerald-600 p-4 text-white flex justify-between items-center">
                    <h3 className="font-bold text-lg"><i className="fas fa-phone-volume"></i> 預約檢查</h3>
                    <button onClick={onClose}><i className="fas fa-times"></i></button>
                </div>
                <div className="p-5 space-y-4">
                    {step === 'CHECK' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs font-bold text-gray-500">預約時間</label><input type="time" className="w-full border p-2 rounded font-bold text-lg" value={form.time} onChange={e => { setForm({ ...form, time: e.target.value }); setCheckResult(null); }} /></div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">人數</label>
                                    <select className="w-full border p-2 rounded font-bold" value={form.pax} onChange={e => { setForm({ ...form, pax: parseInt(e.target.value) }); setCheckResult(null); }}>
                                        {paxOptionsArr.map(n => <option key={n} value={n}>{n} 位</option>)}
                                    </select>
                                </div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-500">服務項目</label><select className="w-full border p-2 rounded font-bold" value={form.service} onChange={e => { setForm({ ...form, service: e.target.value }); setCheckResult(null); }}>{(window.SERVICES_LIST || []).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-gray-500">指定技師</label>
                                    <select className="w-full border p-2 rounded font-bold" value={form.genderPref} onChange={e => { setForm({ ...form, genderPref: e.target.value }); setCheckResult(null); }}>
                                        <option value="隨機">🎲 隨機</option>
                                        <option value="女">🚺 女師傅</option>
                                        <option value="男">🚹 男師傅</option>
                                        <optgroup label="指定 ID">
                                            {sortedStaffList.map(s => <option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}
                                        </optgroup>
                                    </select>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">精油</label><button onClick={() => { const newVal = !form.isOil; setForm({ ...form, isOil: newVal, genderPref: newVal ? '女' : form.genderPref }); setCheckResult(null); }} className={`w-full border p-2 rounded font-bold flex items-center justify-center gap-2 ${form.isOil ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>{form.isOil ? '✅ 有' : '⬜ 無'}</button></div>
                            </div>

                            {checkResult && (
                                <div className={`p-3 rounded text-center font-bold border-2 ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                                    {checkResult.message}
                                </div>
                            )}

                            <div className="pt-2">
                                {!checkResult ? (
                                    <button onClick={performCheck} className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700 shadow-md transition-transform active:scale-95">
                                        🔍 查詢空位
                                    </button>
                                ) : (checkResult.status === 'OK' ? (
                                    <button onClick={() => setStep('INFO')} className="w-full bg-green-600 text-white p-3 rounded font-bold hover:bg-green-700 animate-pulse shadow-md transition-transform active:scale-95">
                                        ➡️ 下一步: 輸入資料
                                    </button>
                                ) : (
                                    <button onClick={performCheck} className="w-full bg-gray-400 text-white p-3 rounded font-bold hover:bg-gray-500 transition-colors">
                                        🔄 重新查詢
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    {step === 'INFO' && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="bg-green-50 p-3 rounded border border-green-200 text-sm text-green-800"><div>🕒 <strong>{form.time}</strong> | 👤 <strong>{form.pax}位</strong></div><div>💆 <strong>{form.service}</strong></div><div>🔧 <strong>{form.genderPref}</strong> {form.isOil ? '(精油)' : ''}</div></div>
                            <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full border p-2 rounded font-bold text-slate-800" placeholder="輸入姓名..." value={form.custName} onChange={e => setForm({ ...form, custName: e.target.value })} autoFocus /></div>
                            <div><label className="text-xs font-bold text-gray-500">電話號碼</label><input className="w-full border p-2 rounded font-bold text-slate-800" placeholder="輸入電話..." value={form.custPhone} onChange={e => setForm({ ...form, custPhone: e.target.value })} /></div>
                            <div className="grid grid-cols-2 gap-3 pt-2"><button onClick={() => setStep('CHECK')} className="bg-gray-200 text-gray-600 p-3 rounded font-bold">⬅️ 返回</button><button onClick={handleFinalSave} className="bg-indigo-600 text-white p-3 rounded font-bold hover:bg-indigo-700 shadow-lg">✅ 確認預約</button></div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
window.AvailabilityCheckModal = AvailabilityCheckModal;

/**
 * ============================================================================
 * 5. BILLING MODAL (結帳確認)
 * ============================================================================
 */
const BillingModal = ({ activeItem, relatedItems, onConfirm, onCancel }) => {
    const hasGroup = relatedItems && relatedItems.length > 0;
    const [step, setStep] = useState('CONFIRM'); // Bỏ qua step CHOICE thừa thãi
    const [targetItems, setTargetItems] = useState(hasGroup ? [activeItem, ...relatedItems] : [activeItem]);

    const [finalPrices, setFinalPrices] = useState({});
    const [editingPriceId, setEditingPriceId] = useState(null);
    const [cashGiven, setCashGiven] = useState('');

    useEffect(() => {
        const initialPrices = {};
        targetItems.forEach(item => {
            const b = item.booking || {};
            const getP = window.getPrice ? window.getPrice(b.serviceName) : 0;
            const getO = window.getOilPrice ? window.getOilPrice(b.isOil || (b.serviceName && (b.serviceName.includes('油') || b.serviceName.includes('Oil')))) : 0;
            initialPrices[b.rowId] = getP + getO;
        });
        setFinalPrices(initialPrices);
    }, [targetItems]);

    const calculateTotal = () => {
        return targetItems.reduce((sum, item) => {
            return sum + (finalPrices[item.booking.rowId] || 0);
        }, 0);
    };

    if (step === 'CHOICE') {
        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl modal-animate p-6 flex flex-col items-center text-center border-t-8 border-blue-500">
                    <h3 className="text-2xl font-black text-slate-800 mb-2">發現同組客人</h3>
                    <p className="text-gray-500 mb-6">共有 <span className="font-bold text-blue-600">{relatedItems.length + 1}</span> 位客人在現場</p>
                    <div className="grid grid-cols-2 gap-4 w-full mb-4">
                        <button onClick={() => { setTargetItems([activeItem]); setStep('CONFIRM'); }} className="flex flex-col items-center p-5 rounded-xl border-2 border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group">
                            <span className="text-3xl mb-2 group-hover:scale-110 transition-transform">👤</span>
                            <span className="font-bold text-slate-700">個別結帳</span>
                        </button>
                        <button onClick={() => { setTargetItems([activeItem, ...relatedItems]); setStep('CONFIRM'); }} className="flex flex-col items-center p-5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-all shadow-md group">
                            <span className="text-3xl mb-2 group-hover:scale-110 transition-transform">👥</span>
                            <span className="font-bold text-blue-700">合併結帳</span>
                        </button>
                    </div>
                    <button onClick={onCancel} className="text-gray-400 font-bold hover:text-gray-600">取消</button>
                </div>
            </div>
        )
    }

    const totalAmount = calculateTotal();
    const cashVal = parseInt(cashGiven) || 0;
    const changeAmount = cashVal >= totalAmount ? cashVal - totalAmount : (cashGiven ? (cashVal - totalAmount) : 0);

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[90] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl modal-animate overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-emerald-600 p-4 text-white text-center shrink-0"><h3 className="text-xl font-bold flex justify-center items-center gap-2"><i className="fas fa-file-invoice-dollar"></i> 結帳清單</h3></div>
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="space-y-3">{targetItems.map(item => {
                        const b = item.booking || {};
                        const staffDisplay = b.serviceStaff || b.staffId || b.ServiceStaff || b.StaffId || b.technician || '隨機';
                        const isEditing = editingPriceId === b.rowId;
                        const currentPrice = finalPrices[b.rowId] !== undefined ? finalPrices[b.rowId] : 0;

                        return (
                            <div key={item.resourceId} className="flex flex-col p-3 rounded-lg border border-slate-200 bg-slate-50">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 flex items-center gap-2">{b.customerName} <span className="text-xs text-white bg-indigo-500 px-1.5 py-0.5 rounded shadow-sm">{staffDisplay}</span></div>
                                        <div className="text-xs text-gray-500 mt-1">{b.serviceName}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                className="w-20 font-mono font-bold text-xl text-emerald-700 bg-white border-2 border-emerald-400 rounded px-1 outline-none text-right"
                                                value={currentPrice}
                                                onChange={(e) => setFinalPrices({...finalPrices, [b.rowId]: parseInt(e.target.value) || 0})}
                                                onBlur={() => setEditingPriceId(null)}
                                                autoFocus
                                            />
                                        ) : (
                                            <div className="font-mono font-bold text-xl text-slate-700">${currentPrice}</div>
                                        )}
                                        <button onClick={() => setEditingPriceId(isEditing ? null : b.rowId)} className="text-gray-400 hover:text-emerald-600 transition-colors p-1" title="手動輸入">
                                            <i className={`fas ${isEditing ? 'fa-check' : 'fa-pen'}`}></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}</div>
                </div>
                <div className="p-5 border-t bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-between mb-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <span className="text-slate-600 font-bold text-sm">客付金額</span>
                        <div className="flex items-center">
                            <span className="text-slate-500 font-bold mr-1">$</span>
                            <input 
                                type="number" 
                                placeholder="0" 
                                value={cashGiven} 
                                onChange={(e) => setCashGiven(e.target.value)}
                                className="w-24 text-right bg-white border border-slate-300 rounded p-1 font-mono font-bold text-lg text-slate-800 focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>
                    {cashGiven && (
                        <div className={`flex justify-between items-center mb-3 px-3 ${changeAmount < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                            <span className="font-bold text-sm">找零:</span>
                            <span className="font-mono font-bold text-xl">${changeAmount}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-end mb-4"><span className="text-gray-500 font-bold text-lg">總金額:</span><span className="text-5xl font-black text-emerald-600 tracking-tight">${totalAmount}</span></div>
                    <button onClick={() => onConfirm(targetItems, totalAmount, finalPrices)} className="w-full p-4 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg text-lg flex justify-center items-center gap-2 transition-transform hover:scale-[1.02]">✅ 確認收款</button>
                    <button onClick={onCancel} className="w-full py-3 text-gray-400 font-bold hover:text-gray-600 mt-2">返回</button>
                </div>
            </div>
        </div>
    );
};
window.BillingModal = BillingModal;

/**
 * ============================================================================
 * 6. SPLIT STAFF MODAL (拆單 / 增加技師)
 * ============================================================================
 */
const SplitStaffModal = ({ staffList, statusData, onConfirm, onCancel }) => {
    const safeStaffList = staffList || [];
    const readyStaff = safeStaffList.filter(s => {
        const stat = (statusData && statusData[s.id]) ? statusData[s.id] : {};
        return stat && (stat.status === 'READY' || stat.status === 'EAT' || stat.status === 'OUT_SHORT');
    }).sort((a, b) => {
        const timeA = statusData[a.id]?.stafftime || statusData[a.id]?.checkInTime || 0;
        const timeB = statusData[b.id]?.stafftime || statusData[b.id]?.checkInTime || 0;
        return timeA - timeB;
    });

    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl modal-animate p-6 flex flex-col h-[500px]">
                <h3 className="text-xl font-bold text-slate-800 mb-2 text-center border-b pb-2">拆單 / 增加技師</h3>
                <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                    {readyStaff.length > 0 ? readyStaff.map(s => (
                        <button key={s.id} onClick={() => onConfirm(s.id)} className="w-full p-3 border rounded-lg hover:bg-orange-50 flex justify-between items-center group transition-colors">
                            <div className="flex items-center gap-3">
                                <span className="font-black text-lg bg-gray-100 text-slate-800 px-2 py-1 rounded group-hover:bg-orange-200 transition-colors">{s.id}</span>
                                <span className="font-bold text-slate-800">{s.name}</span>
                            </div>
                            <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded">
                                {statusData[s.id]?.checkInTime ? new Date(statusData[s.id].checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </span>
                        </button>
                    )) : <div className="text-center text-gray-400 mt-10">目前無空閒技師</div>}
                </div>
                <button onClick={onCancel} className="mt-4 w-full py-3 text-gray-400 font-bold border-t hover:text-gray-600">取消</button>
            </div>
        </div>
    );
};
window.SplitStaffModal = SplitStaffModal;

/**
 * ============================================================================
 * 7. COMBO START MODAL (套餐順序)
 * ============================================================================
 */
const ComboStartModal = ({ onConfirm, onCancel, bookingName }) => {
    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl modal-animate p-6 flex flex-col items-center">
                <h3 className="text-xl font-bold text-slate-800 mb-2">開始套餐</h3>
                <p className="text-slate-500 mb-6 text-center">請選擇優先順序<br /><span className="font-bold text-indigo-600">{bookingName}</span></p>
                <div className="grid grid-cols-2 gap-4 w-full mb-4">
                    <button onClick={() => onConfirm('FB')} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all hover:scale-105 shadow-sm"><span className="text-4xl mb-2">👣</span><span className="font-bold text-emerald-700">先做足底</span></button>
                    <button onClick={() => onConfirm('BF')} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 transition-all hover:scale-105 shadow-sm"><span className="text-4xl mb-2">🛏️</span><span className="font-bold text-purple-700">先做身體</span></button>
                </div>
                <button onClick={onCancel} className="text-slate-400 font-bold hover:text-slate-600">取消</button>
            </div>
        </div>
    );
};
window.ComboStartModal = ComboStartModal;

/**
 * ============================================================================
 * 8. COMBO TIME EDIT MODAL
 * ============================================================================
 */
const ComboTimeEditModal = ({ booking, onConfirm, onCancel }) => {
    const totalDuration = parseInt(booking.duration || 100);
    const defaultSplit = window.getComboSplit ? window.getComboSplit(totalDuration, true, 'FB') : { phase1: totalDuration / 2 };
    const initialPhase1 = booking.phase1_duration ? parseInt(booking.phase1_duration) : defaultSplit.phase1;

    const [phase1, setPhase1] = useState(initialPhase1);
    const [phase2, setPhase2] = useState(totalDuration - initialPhase1);

    useEffect(() => {
        setPhase2(totalDuration - phase1);
    }, [phase1, totalDuration]);

    const handleSliderChange = (e) => {
        const val = parseInt(e.target.value);
        setPhase1(val);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl modal-animate overflow-hidden border border-slate-200">
                <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                    <h3 className="font-bold text-lg"><i className="fas fa-stopwatch"></i> 調整時間</h3>
                    <button onClick={onCancel} className="opacity-80 hover:opacity-100 transition-opacity"><i className="fas fa-times"></i></button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="text-center">
                        <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">顧客</div>
                        <div className="text-2xl font-black text-slate-800">{booking.customerName}</div>
                        <div className="text-indigo-600 font-bold text-sm bg-indigo-50 inline-block px-2 py-1 rounded mt-2">{booking.serviceName} ({totalDuration}分)</div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <div className="flex justify-between items-end mb-4">
                            <div className="text-center w-1/2 border-r border-gray-300 pr-2">
                                <div className="text-xs font-bold text-gray-400">第一階段</div>
                                <div className="text-3xl font-black text-emerald-600">{phase1}<span className="text-sm text-gray-500">分</span></div>
                            </div>
                            <div className="text-center w-1/2 pl-2">
                                <div className="text-xs font-bold text-gray-400">第二階段</div>
                                <div className="text-3xl font-black text-purple-600">{phase2}<span className="text-sm text-gray-500">分</span></div>
                            </div>
                        </div>

                        <input
                            type="range"
                            min="10"
                            max={totalDuration - 10}
                            step="5"
                            value={phase1}
                            onChange={handleSliderChange}
                            className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-all"
                        />
                        <div className="flex justify-between text-xs text-gray-400 font-bold mt-2">
                            <span>10分</span>
                            <span>滑動以調整</span>
                            <span>{totalDuration - 10}分</span>
                        </div>
                    </div>

                    <div className="text-xs text-center text-amber-600 font-bold bg-amber-50 p-2 rounded border border-amber-100">
                        <i className="fas fa-lock"></i> 調整後將手動鎖定時間
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={onCancel} className="w-full py-3 bg-gray-100 text-gray-500 font-bold rounded-lg hover:bg-gray-200 transition-colors">
                            取消
                        </button>
                        <button onClick={() => onConfirm(phase1)} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg transform active:scale-95 transition-all">
                            確認
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
window.ComboTimeEditModal = ComboTimeEditModal;

// Đã định nghĩa và export toàn bộ
window.AvailabilityCheckModal = AvailabilityCheckModal;
window.BillingModal = BillingModal;
window.SplitStaffModal = SplitStaffModal;
window.ComboStartModal = ComboStartModal;
window.ComboTimeEditModal = ComboTimeEditModal;
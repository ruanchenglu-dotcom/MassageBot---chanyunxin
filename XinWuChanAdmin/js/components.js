const { useState, useEffect, useMemo, useRef } = React;

/**
 * ============================================================================
 * 1. ERROR BOUNDARY (系統錯誤攔截)
 * ----------------------------------------------------------------------------
 * 用於攔截組件渲染錯誤，防止整個頁面崩潰。
 * ============================================================================
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("System Error Log:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-red-50 p-6 animate-fadeIn">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full border-l-8 border-red-600">
                        <div className="flex items-center gap-3 mb-4">
                            <i className="fas fa-exclamation-triangle text-4xl text-red-600"></i>
                            <h1 className="text-3xl font-black text-slate-800">系統發生錯誤</h1>
                        </div>
                        <p className="text-gray-600 mb-4 font-bold border-b pb-4">
                            發生預期外的錯誤，請重新整理頁面。
                        </p>
                        <div className="bg-slate-100 p-4 rounded text-xs font-mono mb-6 overflow-auto max-h-40 border border-slate-300 shadow-inner">
                            {this.state.error && this.state.error.toString()}
                        </div>
                        <button 
                            onClick={() => window.location.reload()} 
                            className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-lg shadow-lg transition-transform active:scale-95 flex justify-center items-center gap-2"
                        >
                            <i className="fas fa-redo-alt"></i> 重新整理 (Reload)
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
 * 2. STAFF CARD 3D (技師卡片)
 * ----------------------------------------------------------------------------
 * 顯示技師狀態 (忙碌, 待命, 休假)。
 * [修正]: 強化「指定客」判定邏輯，支援 ID 與 Name 的混合比對。
 * ============================================================================
 */
const StaffCard3D = ({ s, statusData, resourceState, queueIndex, isForcedBusy }) => {
    // 如果沒有技師資料，則不渲染
    if (!s) return null;

    // 1. 判斷性別以選擇基礎樣式
    const genderStr = String(s.gender || '').toUpperCase();
    const isFemale = ['F', '女', 'FEMALE', 'NU'].includes(genderStr);
    
    // 2. 獲取即時狀態
    const safeStatusData = statusData || {};
    const local = safeStatusData[s.id] || { status: 'AWAY' }; 
    let displayStatus = local.status; 
    
    // 如果被強制設為忙碌 (由 StaffSorter 計算)
    if (isForcedBusy) { 
        displayStatus = 'BUSY'; 
    }
    
    // 3. 判斷是否為「指定客」(Designated / Requested)
    let isDesignated = false;

    if (displayStatus === 'BUSY') {
        // 準備技師的識別資料 (轉為字串並去空白)
        const staffId = String(s.id).trim();
        const staffName = String(s.name).trim();

        // 遍歷所有正在運行的訂單，找出該技師正在服務的訂單
        const activeRes = Object.values(resourceState || {}).find(r => {
            // 忽略未運行、暫停或預覽的項目
            if (!r.isRunning || r.isPaused || r.isPreview === true) return false;
            
            const b = r.booking || {};
            
            // --- A. 確認技師是否正在執行此訂單 (實際執行者) ---
            // 檢查 serviceStaff, staffId 以及所有副手欄位
            const workerList = [
                b.serviceStaff, b.staffId, b.technician, 
                b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6
            ].map(val => String(val || '').trim());

            // 只要 ID 或 Name 出現在執行者名單中，就代表該技師正在做這單
            const isWorkerHere = workerList.includes(staffId) || workerList.includes(staffName);
            
            if (!isWorkerHere) return false;

            // --- B. 檢查是否為「指定」 (Request Check) ---
            // 邏輯：檢查 booking.staffId (通常儲存顧客要求的技師)
            // 對於多人訂單 (Group)，我們需要更仔細地檢查對應的欄位
            
            // 收集所有可能的「要求欄位」
            const requestFields = [
                b.staffId,       // 主客要求
                b.staffId2,      // 客2要求 (若有)
                b.staffId3,
                b.staffId4,
                b.staffId5,
                b.staffId6,
                b.technician     // 備用欄位
            ];

            // 檢查這些欄位中，是否有「指名」該技師
            const isRequested = requestFields.some(req => {
                const reqStr = String(req || '').trim();
                
                // 1. 排除無效值與隨機關鍵字
                const randomKeywords = ['隨機', 'RANDOM', 'MALE', 'FEMALE', '男', '女', 'ANY', 'NULL', 'UNDEFINED', '', '不指定', '安排'];
                const isRandom = randomKeywords.some(kw => reqStr.toUpperCase() === kw || reqStr.includes('隨機'));
                
                if (isRandom) return false;

                // 2. 比對 ID 或 Name
                return reqStr === staffId || reqStr === staffName;
            });

            return isRequested;
        });
        
        if (activeRes) {
            isDesignated = true;
        }
    }

    // 4. 設定 CSS 樣式類別
    let cardStyle = isFemale ? 'style-female' : 'style-male';
    let customClass = ""; // 用於覆蓋顏色的 Tailwind class

    if (displayStatus === 'BUSY') {
        cardStyle = 'st-busy'; // 預設紅色
        
        if (isDesignated) {
            // 🔥 指定客顯示深黃色 (Amber) 🔥
            // 使用 !important 確保顏色覆蓋
            customClass = "!bg-amber-500 !border-amber-600 !text-white shadow-[0_0_15px_rgba(245,158,11,0.8)] border-2 ring-2 ring-amber-300";
        }
    }
    else if (displayStatus === 'AWAY' || displayStatus === 'OFF') {
        cardStyle = 'st-away';
    }
    else if (displayStatus === 'EAT') {
        cardStyle = 'st-eat';
    }
    else if (displayStatus === 'OUT_SHORT') {
        cardStyle = 'st-out';
    }

    // 5. 渲染卡片
    return (
        <div className={`card-3d ${cardStyle} ${customClass} flex flex-col items-center justify-center relative p-0 overflow-hidden transition-all duration-300`}>
            {/* 排隊序號 (僅在待命時顯示) */}
            {queueIndex !== undefined && displayStatus === 'READY' && (
                <div className="queue-badge animate-bounce-slow">{queueIndex + 1}</div>
            )}
            
            {/* 指定客皇冠圖示 */}
            {isDesignated && (
                <div className="absolute top-0 right-0.5 text-xs text-yellow-100 animate-pulse drop-shadow-md z-10" title="指定 (Designated)">
                    <i className="fas fa-crown text-lg"></i>
                </div>
            )}

            {/* 技師名稱 */}
            <div className={`font-black text-2xl text-center leading-none w-full select-none flex-1 flex items-center justify-center break-words px-0.5 ${isDesignated ? '!text-white drop-shadow-md' : 'text-slate-800'}`}>
                {s.name}
            </div>
            
            {/* [DEBUG] 用於開發階段確認狀態 (可選) */}
            {/* {isDesignated && <div className="absolute bottom-0 text-[8px] text-white bg-black/20 px-1">指定</div>} */}
        </div>
    )
};
window.StaffCard3D = StaffCard3D;

/**
 * ============================================================================
 * 3. CHECKIN BOARD (技師管理看板)
 * ----------------------------------------------------------------------------
 * 顯示技師列表、薪資計算、上下班打卡功能。
 * ============================================================================
 */
const CheckInBoard = ({ staffList, statusData, onClose, onUpdateStatus, bookings }) => {
    const safeStaffList = Array.isArray(staffList) ? staffList : [];
    
    // --- 薪資計算參數 ---
    const RATES = { JIE_PRICE: 250, OIL_BONUS: 80 }; 
    const normalize = (str) => String(str || '').trim().replace(/\s+/g, '');

    // 計算節數 (Jie)
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

    // 判斷是否有精油
    const isOilService = (b) => {
        if (b.isOil === true || b.isOil === 'true') return true;
        const name = (b.serviceName || "").toLowerCase();
        if (name.includes('油') || name.includes('oil') || name.includes('精油')) return true;
        if (name.includes('帝王') || name.includes('a6')) return true;
        return false;
    };

    // 計算薪資 (使用 useMemo 優化效能)
    const staffIncomeMap = useMemo(() => {
        const stats = {};
        const lookupMap = {}; 
        
        (staffList || []).forEach(staff => {
            const entry = { id: staff.id, jie: 0, oil: 0, income: 0 };
            stats[staff.id] = entry;
            lookupMap[normalize(staff.id)] = entry;
            if (staff.name) lookupMap[normalize(staff.name)] = entry;
        });

        const safeBookings = Array.isArray(bookings) ? bookings : [];

        safeBookings.forEach(b => {
            if (b.status && (b.status.includes('取消') || b.status.includes('Cancel') || b.status.includes('❌'))) return;
            
            let potentialRawStrings = [
                b.staffId, b.serviceStaff, b.technician, b.StaffId, 
                b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6,
                b.ServiceStaff, b.Technician
            ];
            const distinctNames = potentialRawStrings.join(',').split(/[,，\s/]+/).map(s => s.trim()).filter(s => s && s !== 'null' && s !== 'undefined' && s.length > 0);
            const validNames = [...new Set(distinctNames)].filter(name => {
                const n = name.toLowerCase();
                return !['隨機', '男', '女', '男師傅', '女師傅', '不指定', '指定', 'male', 'female', 'random'].some(bad => n.includes(bad));
            });

            validNames.forEach(key => {
                const normKey = normalize(key);
                let staffStat = lookupMap[normKey];
                if (staffStat) {
                    const q = getJieCount(b.serviceName, b.duration);
                    const hasOil = isOilService(b);
                    staffStat.jie += q;
                    if (hasOil) staffStat.oil += 1;
                }
            });
        });

        Object.values(stats).forEach(s => { 
            s.income = (s.jie * RATES.JIE_PRICE) + (s.oil * RATES.OIL_BONUS); 
        });

        return stats;
    }, [bookings, staffList]);

    // 切換打卡狀態
    const toggleCheckIn = (id) => { 
        const current = (statusData && statusData[id]) ? statusData[id] : {}; 
        const newState = { 
            ...statusData, 
            [id]: { 
                status: current.status === 'READY' || current.status === 'EAT' ? 'AWAY' : 'READY', 
                checkInTime: current.status === 'READY' ? 0 : Date.now() 
            } 
        }; 
        onUpdateStatus(newState); 
    };
    
    return ( 
        <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-6xl rounded-t-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                {/* 標題欄 */}
                <div className="p-4 bg-[#7e22ce] text-white flex justify-between items-center shrink-0 shadow-md z-10">
                    <h2 className="text-xl font-bold flex gap-2 items-center"><i className="fas fa-user-clock"></i> 技師管理 (Sheet Order)</h2>
                    <button onClick={onClose} className="hover:text-red-300 transition-colors"><i className="fas fa-times text-2xl"></i></button>
                </div>
                
                {/* 表頭 */}
                <div className="grid grid-cols-12 gap-2 bg-slate-100 p-3 font-bold text-slate-600 text-sm border-b sticky top-0 z-10 shadow-sm">
                    <div className="col-span-3 text-center border-r border-slate-300">姓名 (Name)</div>
                    <div className="col-span-2 text-center text-emerald-700 border-r border-slate-300">💰 今日薪資 (Salary)</div>
                    <div className="col-span-2 text-center border-r border-slate-300">上班 (Start)</div>
                    <div className="col-span-2 text-center border-r border-slate-300">下班 (End)</div>
                    <div className="col-span-2 text-center border-r border-slate-300">操作 (Action)</div>
                    <div className="col-span-1 text-center">狀態 (Status)</div>
                </div>

                {/* 技師列表 */}
                <div className="overflow-y-auto flex-1 p-2 space-y-2 bg-white custom-scrollbar">
                    {safeStaffList.map(s => { 
                        const current = (statusData && statusData[s.id]) ? statusData[s.id] : { status: 'AWAY', checkInTime: 0 }; 
                        const isWorking = current.status !== 'AWAY' && current.status !== 'OFF';
                        const income = staffIncomeMap[s.id] ? staffIncomeMap[s.id].income : 0;

                        return ( 
                            <div key={s.id} className="grid grid-cols-12 gap-2 items-center py-2 px-2 border-b border-gray-100 hover:bg-slate-50 text-sm transition-all group">
                                {/* 姓名 */}
                                <div className="col-span-3 text-center font-black text-lg text-slate-800 flex items-center justify-center gap-2">
                                    {s.name}
                                    <span className="text-[10px] text-gray-400 font-normal opacity-50 group-hover:opacity-100">#{s.id}</span>
                                </div>
                                
                                {/* 薪資 */}
                                <div className="col-span-2 text-center">
                                    <span className={`px-2 py-1 rounded text-base font-black border shadow-sm ${income > 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>
                                        ${income.toLocaleString()}
                                    </span>
                                </div>
                                
                                {/* 班表時間 */}
                                <div className="col-span-2 text-center font-mono text-slate-600">{s.shiftStart}</div>
                                <div className="col-span-2 text-center font-mono text-slate-600">{s.shiftEnd}</div>
                                
                                {/* 操作按鈕 */}
                                <div className="col-span-2 flex justify-center">
                                    {isWorking ? (
                                        <div className="flex items-center justify-between w-full max-w-[110px] border border-gray-300 rounded px-2 py-1 bg-white shadow-sm">
                                            <span className="font-mono font-bold text-xs text-slate-500">
                                                {new Date(current.checkInTime).toLocaleTimeString('en-US',{hour12:false, hour:'2-digit', minute:'2-digit'})}
                                            </span>
                                            <button onClick={() => toggleCheckIn(s.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1 transition-colors" title="下班打卡">
                                                <i className="fas fa-sign-out-alt"></i>
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => toggleCheckIn(s.id)} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded font-bold text-xs w-full max-w-[90px] shadow-sm transition-all transform hover:scale-105">
                                            <i className="fas fa-sign-in-alt mr-1"></i> 打卡
                                        </button>
                                    )}
                                </div>
                                
                                {/* 狀態選單 */}
                                <div className="col-span-1 text-center">
                                    <div className="relative">
                                        <select 
                                            className={`w-full appearance-none border p-1 pl-6 rounded font-bold cursor-pointer outline-none text-xs shadow-sm transition-colors ${isWorking ? 'border-purple-300 text-purple-700 bg-white hover:border-purple-500' : 'bg-gray-100 text-gray-400'}`} 
                                            disabled={!isWorking} 
                                            value={current.status} 
                                            onChange={(e)=>{ const n={...statusData, [s.id]:{...current, status:e.target.value}}; onUpdateStatus(n); }}
                                        >
                                            <option value="AWAY">⚪ 未到</option>
                                            <option value="READY">🟣 待命</option>
                                            <option value="EAT">🟠 用餐</option>
                                            <option value="OUT_SHORT">🔵 外出</option>
                                        </select>
                                        <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <div className={`w-2.5 h-2.5 rounded-full ring-1 ring-white shadow-sm ${current.status==='READY'?'bg-purple-500':current.status==='EAT'?'bg-orange-500':current.status==='OUT_SHORT'?'bg-blue-500':'bg-gray-400'}`}></div>
                                        </div>
                                    </div>
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
 * 4. AVAILABILITY CHECK MODAL (電話預約檢查)
 * ----------------------------------------------------------------------------
 * 快速檢查特定時段是否有空位。
 * ============================================================================
 */
const AvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
    const [step, setStep] = useState('CHECK');
    const [checkResult, setCheckResult] = useState(null);
    const [form, setForm] = useState({
        time: "12:00",
        service: window.SERVICES_LIST ? window.SERVICES_LIST[2] : "Foot Massage",
        pax: 1,
        genderPref: '隨機', 
        isOil: false,
        custName: '',
        custPhone: ''
    });

    // 如果選擇精油，自動切換偏好為女技師
    useEffect(() => {
        if (form.isOil && form.genderPref !== '女' && !form.genderPref.includes('Female')) {
            setForm(prev => ({ ...prev, genderPref: '女' }));
        }
    }, [form.isOil]);

    const performCheck = () => {
        const duration = window.getSafeDuration(form.service, 60);
        const startMins = window.normalizeToTimelineMins(form.time);
        const endMins = startMins + duration;
        
        const safeBookings = bookings || [];
        const todays = safeBookings.filter(b => window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], initialDate) && !b.status.includes('取消') && !b.status.includes('完成'));
        
        let chairOccupied = 0;
        let bedOccupied = 0;
        
        todays.forEach(b => {
            const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
            const bEnd = bStart + window.getSafeDuration(b.serviceName, 60);
            
            if (startMins < bEnd && endMins > bStart) {
                if (b.serviceName.includes('足') || b.type === 'CHAIR') chairOccupied += (b.pax || 1);
                else bedOccupied += (b.pax || 1);
                if (b.category === 'COMBO') { bedOccupied += (b.pax || 1); chairOccupied += (b.pax || 1); } 
            }
        });

        const needed = form.pax;
        const resourceType = window.SERVICES_DATA[form.service]?.type || 'BED';
        let available = true;
        let msg = "✅ 可預約 (Available)";

        if (resourceType === 'CHAIR') {
            if (chairOccupied + needed > 6) { available = false; msg = "❌ 足底區客滿 (Foot Area Full)"; }
        } else if (resourceType === 'BED') {
            if (bedOccupied + needed > 6) { available = false; msg = "❌ 指壓區客滿 (Body Area Full)"; }
        } else {
            if (chairOccupied + needed > 6 || bedOccupied + needed > 6) { available = false; msg = "❌ 區域客滿 (Area Full)"; }
        }

        if (available && form.genderPref !== '隨機' && form.genderPref !== '男' && form.genderPref !== '女') {
            const staffId = form.genderPref;
            const isStaffBooked = todays.some(b => {
                const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                const bEnd = bStart + window.getSafeDuration(b.serviceName, 60);
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
    const safeStaffList = staffList || [];

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[70] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl modal-animate flex flex-col overflow-hidden">
                <div className="bg-emerald-600 p-4 text-white flex justify-between items-center">
                    <h3 className="font-bold text-lg"><i className="fas fa-phone-volume"></i> 電話預約檢查 (Check Booking)</h3>
                    <button onClick={onClose}><i className="fas fa-times"></i></button>
                </div>
                <div className="p-5 space-y-4">
                    {step === 'CHECK' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs font-bold text-gray-500">預約時間</label><input type="time" className="w-full border p-2 rounded font-bold text-lg" value={form.time} onChange={e => { setForm({...form, time: e.target.value}); setCheckResult(null); }} /></div>
                                <div><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full border p-2 rounded font-bold" value={form.pax} onChange={e => { setForm({...form, pax: parseInt(e.target.value)}); setCheckResult(null); }}>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} 位</option>)}</select></div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-500">服務項目</label><select className="w-full border p-2 rounded font-bold" value={form.service} onChange={e => { setForm({...form, service: e.target.value}); setCheckResult(null); }}>{(window.SERVICES_LIST || []).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs font-bold text-gray-500">指定技師</label><select className="w-full border p-2 rounded font-bold" value={form.genderPref} onChange={e => { setForm({...form, genderPref: e.target.value}); setCheckResult(null); }}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師傅</option><option value="男">🚹 男師傅</option><optgroup label="指定 ID">{safeStaffList.map(s => <option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}</optgroup></select></div>
                                <div><label className="text-xs font-bold text-gray-500">精油</label><button onClick={() => { const newVal = !form.isOil; setForm({ ...form, isOil: newVal, genderPref: newVal ? '女' : form.genderPref }); setCheckResult(null); }} className={`w-full border p-2 rounded font-bold flex items-center justify-center gap-2 ${form.isOil ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>{form.isOil ? '✅ 有' : '⬜ 無'}</button></div>
                            </div>
                            {checkResult && (<div className={`p-3 rounded text-center font-bold ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{checkResult.message}</div>)}
                            <div className="pt-2">{!checkResult ? (<button onClick={performCheck} className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700 shadow-md">🔍 查詢空位</button>) : (checkResult.status === 'OK' ? (<button onClick={() => setStep('INFO')} className="w-full bg-green-600 text-white p-3 rounded font-bold hover:bg-green-700 animate-pulse shadow-md">➡️ 下一步: 輸入資料</button>) : (<button onClick={performCheck} className="w-full bg-gray-400 text-white p-3 rounded font-bold">🔄 重新查詢</button>))}</div>
                        </>
                    )}
                    {step === 'INFO' && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="bg-green-50 p-3 rounded border border-green-200 text-sm text-green-800"><div>🕒 <strong>{form.time}</strong> | 👤 <strong>{form.pax}位</strong></div><div>💆 <strong>{form.service}</strong></div><div>🔧 <strong>{form.genderPref}</strong> {form.isOil ? '(Oil)' : ''}</div></div>
                            <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full border p-2 rounded font-bold" placeholder="輸入姓名..." value={form.custName} onChange={e => setForm({...form, custName: e.target.value})} autoFocus /></div>
                            <div><label className="text-xs font-bold text-gray-500">電話號碼</label><input className="w-full border p-2 rounded font-bold" placeholder="輸入電話..." value={form.custPhone} onChange={e => setForm({...form, custPhone: e.target.value})} /></div>
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
 * ----------------------------------------------------------------------------
 * 支援合併結帳或分開結帳。
 * ============================================================================
 */
const BillingModal = ({ activeItem, relatedItems, onConfirm, onCancel }) => {
    const hasGroup = relatedItems && relatedItems.length > 0;
    const [step, setStep] = useState(hasGroup ? 'CHOICE' : 'CONFIRM');
    const [targetItems, setTargetItems] = useState(hasGroup ? [] : [activeItem]);
    
    useEffect(() => {
        if (hasGroup) setStep('CHOICE');
        else setStep('CONFIRM');
        setTargetItems([activeItem]);
    }, [hasGroup, activeItem]);

    const calculateTotal = (list) => list.reduce((sum, item) => sum + window.getPrice(item.booking.serviceName) + window.getOilPrice(item.booking.isOil || (item.booking.serviceName && (item.booking.serviceName.includes('油') || item.booking.serviceName.includes('Oil')))), 0);

    if (step === 'CHOICE') {
        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl modal-animate p-6 flex flex-col items-center text-center border-t-8 border-blue-500">
                    <h3 className="text-2xl font-black text-slate-800 mb-2">發現同組客人</h3>
                    <p className="text-gray-500 mb-6">共有 <span className="font-bold text-blue-600">{relatedItems.length + 1}</span> 位客人在現場</p>
                    <div className="grid grid-cols-2 gap-4 w-full mb-4">
                        <button onClick={() => { setTargetItems([activeItem]); setStep('CONFIRM'); }} className="flex flex-col items-center p-5 rounded-xl border-2 border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"><span className="text-3xl mb-2 group-hover:scale-110 transition-transform">👤</span><span className="font-bold text-slate-700">個別結帳 (Pay 1)</span></button>
                        <button onClick={() => { setTargetItems([activeItem, ...relatedItems]); setStep('CONFIRM'); }} className="flex flex-col items-center p-5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-all shadow-md group"><span className="text-3xl mb-2 group-hover:scale-110 transition-transform">👥</span><span className="font-bold text-blue-700">合併結帳 (Pay All)</span></button>
                    </div>
                    <button onClick={onCancel} className="text-gray-400 font-bold hover:text-gray-600">取消</button>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[90] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl modal-animate overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-emerald-600 p-4 text-white text-center shrink-0"><h3 className="text-xl font-bold flex justify-center items-center gap-2"><i className="fas fa-file-invoice-dollar"></i> 結帳清單 (Bill)</h3></div>
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="space-y-3">{targetItems.map(item => { 
                        const b = item.booking || {}; 
                        const price = window.getPrice(b.serviceName) + window.getOilPrice(b.isOil || (b.serviceName && b.serviceName.includes('油'))); 
                        const staffDisplay = b.serviceStaff || b.staffId || b.ServiceStaff || b.StaffId || b.technician || '隨機';
                        
                        return (
                            <div key={item.resourceId} className="flex items-center p-3 rounded-lg border border-slate-200 bg-slate-50">
                                <div className="flex-1">
                                    <div className="font-bold text-slate-800 flex items-center gap-2">{b.customerName} <span className="text-xs text-white bg-indigo-500 px-1.5 py-0.5 rounded shadow-sm">{staffDisplay}</span></div>
                                    <div className="text-xs text-gray-500 mt-1">{b.serviceName}</div>
                                </div>
                                <div className="font-mono font-bold text-xl text-slate-700">${price}</div>
                            </div>
                        ); 
                    })}</div>
                </div>
                <div className="p-5 border-t bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                    <div className="flex justify-between items-end mb-4"><span className="text-gray-500 font-bold text-lg">總金額:</span><span className="text-5xl font-black text-emerald-600 tracking-tight">${calculateTotal(targetItems)}</span></div>
                    <button onClick={() => onConfirm(targetItems, calculateTotal(targetItems))} className="w-full p-4 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg text-lg flex justify-center items-center gap-2 transition-transform hover:scale-[1.02]">✅ 確認收款</button>
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
 * ----------------------------------------------------------------------------
 * 用於四手操作或中途更換技師。
 * ============================================================================
 */
const SplitStaffModal = ({ staffList, statusData, onConfirm, onCancel }) => {
    const safeStaffList = staffList || [];
    const readyStaff = safeStaffList.filter(s => { 
        const stat = (statusData && statusData[s.id]) ? statusData[s.id] : {}; 
        return stat && (stat.status === 'READY' || stat.status === 'EAT' || stat.status === 'OUT_SHORT'); 
    }).sort((a,b) => {
        const timeA = statusData[a.id]?.checkInTime || 0;
        const timeB = statusData[b.id]?.checkInTime || 0;
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
                                <span className="font-black text-lg bg-gray-100 px-2 py-1 rounded group-hover:bg-orange-200 transition-colors">{s.id}</span>
                                <span className="font-bold text-gray-700">{s.name}</span>
                            </div>
                            <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded">
                                {new Date(statusData[s.id]?.checkInTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
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
 * 7. WALK-IN MODAL (現場客)
 * ----------------------------------------------------------------------------
 * 快速建立現場客訂單。
 * ============================================================================
 */
const WalkInModal = ({ onClose, onSave, staffList, initialDate }) => {
    const [form, setForm] = useState({ hoTen: '現場客', dichVu: '👣 足底按摩 (40分)', pax: 1, nhanVien: '隨機', isOil: false });
    return (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl modal-animate p-5">
                <h3 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2"><i className="fas fa-bolt text-amber-500"></i> 現場客 (Walk-in)</h3>
                <div className="space-y-3">
                    <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full p-2 border rounded font-bold" value={form.hoTen} onChange={e=>setForm({...form, hoTen: e.target.value})} /></div>
                    <div><label className="text-xs font-bold text-gray-500">服務項目</label><select className="w-full p-2 border rounded font-bold" value={form.dichVu} onChange={e=>setForm({...form, dichVu: e.target.value})}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                    <div className="flex gap-3"><div className="flex-1"><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full p-2 border rounded font-bold" value={form.pax} onChange={e=>setForm({...form, pax: parseInt(e.target.value)})}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select></div><div className="flex-1"><label className="text-xs font-bold text-gray-500">精油</label><button onClick={()=>setForm({...form, isOil: !form.isOil})} className={`w-full p-2 border rounded font-bold flex items-center justify-center gap-2 ${form.isOil ? 'bg-purple-100 border-purple-500 text-purple-700' : 'bg-gray-50'}`}>{form.isOil ? '是' : '否'}</button></div></div>
                    <div><label className="text-xs font-bold text-gray-500">指定技師</label><select className="w-full p-2 border rounded font-bold" value={form.nhanVien} onChange={e=>setForm({...form, nhanVien: e.target.value})}><option value="隨機">-- 隨機 --</option>{(staffList||[]).map(s=><option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}</select></div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3"><button onClick={onClose} className="p-3 bg-gray-100 text-gray-500 font-bold rounded-lg hover:bg-gray-200">取消</button><button onClick={()=>onSave({ ...form, ngayDen: initialDate.replace(/-/g, '/'), gioDen: new Date().toLocaleTimeString('en-US',{hour12:false, hour:'2-digit', minute:'2-digit'}) })} className="p-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg">確認</button></div>
            </div>
        </div>
    );
};
window.WalkInModal = WalkInModal;

/**
 * ============================================================================
 * 8. COMBO START MODAL (套餐順序)
 * ----------------------------------------------------------------------------
 * 選擇套餐執行順序 (先做腳/先做身體)。
 * ============================================================================
 */
const ComboStartModal = ({ onConfirm, onCancel, bookingName }) => {
    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl modal-animate p-6 flex flex-col items-center">
                <h3 className="text-xl font-bold text-slate-800 mb-2">開始套餐 (Start Combo)</h3>
                <p className="text-slate-500 mb-6 text-center">請選擇優先順序<br/><span className="font-bold text-indigo-600">{bookingName}</span></p>
                <div className="grid grid-cols-2 gap-4 w-full mb-4">
                    <button onClick={() => onConfirm('FB')} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all hover:scale-105 shadow-sm"><span className="text-4xl mb-2">👣</span><span className="font-bold text-emerald-700">先做腳 (Foot First)</span></button>
                    <button onClick={() => onConfirm('BF')} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 transition-all hover:scale-105 shadow-sm"><span className="text-4xl mb-2">🛏️</span><span className="font-bold text-purple-700">先做身 (Body First)</span></button>
                </div>
                <button onClick={onCancel} className="text-slate-400 font-bold hover:text-slate-600">取消</button>
            </div>
        </div>
    );
};
window.ComboStartModal = ComboStartModal;
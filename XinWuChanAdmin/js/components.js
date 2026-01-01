const { useState, useEffect, useMemo, useRef } = React;

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Critical System Error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
                    <div className="bg-white p-8 rounded-xl shadow-xl max-w-lg w-full border-l-8 border-red-600">
                        <h1 className="text-3xl font-black text-red-600 mb-4">⚠️ LỖI HỆ THỐNG</h1>
                        <p className="text-gray-600 mb-4 font-bold">Đã xảy ra lỗi không mong muốn (White Screen prevented).</p>
                        <div className="bg-slate-100 p-3 rounded text-xs font-mono mb-6 overflow-auto max-h-32 border">
                            {this.state.error && this.state.error.toString()}
                        </div>
                        <button onClick={() => window.location.reload()} className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-lg shadow-lg">
                            🔄 TẢI LẠI TRANG (RELOAD)
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
window.ErrorBoundary = ErrorBoundary;

// --- STAFF CARD 3D (UPDATED: Big Name Font) ---
const StaffCard3D = ({ s, statusData, resourceState, queueIndex, isForcedBusy }) => {
    if (!s) return null;
    const isFemale = s.gender === 'F' || s.gender === '女'; 
    const safeStatusData = statusData || {};
    const local = safeStatusData[s.id] || { status: 'AWAY' }; 
    let displayStatus = local.status; 
    
    if (isForcedBusy) { displayStatus = 'BUSY'; }
    
    let cardStyle = isFemale ? 'style-female' : 'style-male';
    if (displayStatus === 'BUSY') cardStyle = 'st-busy';
    else if (displayStatus === 'AWAY' || displayStatus === 'OFF') cardStyle = 'st-away';
    else if (displayStatus === 'EAT') cardStyle = 'st-eat';
    else if (displayStatus === 'OUT_SHORT') cardStyle = 'st-out';

    return (
        <div className={`card-3d ${cardStyle} flex flex-col items-center justify-center relative p-0 overflow-hidden`}>
            {/* Queue Badge */}
            {queueIndex !== undefined && displayStatus === 'READY' && (
                <div className="queue-badge">{queueIndex + 1}</div>
            )}
            
            {/* Tên Nhân Viên: Cực lớn (text-2xl), Đậm (font-black) */}
            <div className="font-black text-2xl text-slate-800 text-center leading-none w-full select-none flex-1 flex items-center justify-center break-words px-0.5">
                {s.name}
            </div>
        </div>
    )
};
window.StaffCard3D = StaffCard3D;

// --- CHECKIN BOARD ---
const CheckInBoard = ({ staffList, statusData, onClose, onUpdateStatus }) => {
    const safeStaffList = Array.isArray(staffList) ? staffList : [];
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
    const displayList = safeStaffList;
    
    return ( 
        <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-6xl rounded-t-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                <div className="p-4 bg-[#7e22ce] text-white flex justify-between items-center shrink-0"><h2 className="text-xl font-bold flex gap-2 items-center"><i className="fas fa-user-clock"></i> 技師管理 (Sheet Order)</h2><button onClick={onClose}><i className="fas fa-times text-xl"></i></button></div>
                <div className="grid grid-cols-12 gap-2 bg-slate-100 p-2 font-bold text-slate-600 text-sm border-b">
                    <div className="col-span-1 text-center">編號</div>
                    <div className="col-span-2 text-center">姓名</div>
                    <div className="col-span-1 text-center">性別</div>
                    <div className="col-span-2 text-center">上班</div>
                    <div className="col-span-2 text-center">下班</div>
                    <div className="col-span-2 text-center">操作</div>
                    <div className="col-span-2 text-center">狀態</div>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-2 bg-white">
                    {displayList.map(s => { 
                        const current = (statusData && statusData[s.id]) ? statusData[s.id] : { status: 'AWAY', checkInTime: 0 }; 
                        const isWorking = current.status !== 'AWAY' && current.status !== 'OFF';
                        return ( 
                            <div key={s.id} className="grid grid-cols-12 gap-2 items-center py-2 px-2 border-b border-gray-100 hover:bg-slate-50 text-sm transition-all">
                                <div className="col-span-1 text-center font-bold text-slate-400">{s.id.replace('號','')}</div>
                                <div className="col-span-2 text-center font-black text-lg text-slate-800">{s.name}</div>
                                <div className="col-span-1 text-center">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.gender === 'M' || s.gender === '男' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                                        {s.gender === 'M' || s.gender === '男' ? '男' : '女'}
                                    </span>
                                </div>
                                <div className="col-span-2 text-center font-mono text-slate-600">{s.shiftStart}</div>
                                <div className="col-span-2 text-center font-mono text-slate-600">{s.shiftEnd}</div>
                                <div className="col-span-2 flex justify-center">{isWorking ? <div className="flex items-center justify-between w-full max-w-[100px] border border-gray-300 rounded px-2 py-1 bg-white"><span className="font-mono font-bold text-xs text-slate-500">{new Date(current.checkInTime).toLocaleTimeString('en-US',{hour12:false, hour:'2-digit', minute:'2-digit'})}</span><button onClick={() => toggleCheckIn(s.id)} className="text-red-500 hover:text-red-700 font-bold ml-1 text-xs">✕</button></div> : <button onClick={() => toggleCheckIn(s.id)} className="bg-[#3b82f6] hover:bg-[#2563eb] text-white px-3 py-1 rounded font-bold text-xs w-full max-w-[80px]">打卡</button>}</div>
                                <div className="col-span-2 text-center"><div className="relative"><select className={`w-full appearance-none border p-1 pl-6 rounded font-bold cursor-pointer outline-none text-xs ${isWorking ? 'border-purple-300 text-purple-700 bg-white' : 'bg-gray-100 text-gray-400'}`} disabled={!isWorking} value={current.status} onChange={(e)=>{ const n={...statusData, [s.id]:{...current, status:e.target.value}}; onUpdateStatus(n); }}><option value="AWAY">⚪ 未到</option><option value="READY">🟣 待命</option><option value="EAT">🟠 用餐</option><option value="OUT_SHORT">🔵 外出</option></select><div className="absolute left-2 top-1/2 -translate-y-1/2"><div className={`w-2 h-2 rounded-full ${current.status==='READY'?'bg-purple-500':current.status==='EAT'?'bg-orange-500':current.status==='OUT_SHORT'?'bg-blue-500':'bg-gray-400'}`}></div></div></div></div>
                            </div> 
                        )
                    })}
                </div>
            </div>
        </div> 
    ); 
};
window.CheckInBoard = CheckInBoard;

// --- AVAILABILITY CHECK MODAL ---
const AvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
    const [step, setStep] = useState('CHECK');
    const [checkResult, setCheckResult] = useState(null);
    const [form, setForm] = useState({
        time: "12:00",
        service: window.SERVICES_LIST[2],
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
        let msg = "✅ 可以預約 (Available)";

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
                return isTimeConflict && (b.serviceStaff === staffId || b.staffId === staffId);
            });
            if (isStaffBooked) { available = false; msg = `❌ 技師 ${staffId} 該時段忙碌 (Staff Busy)`; }
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
                    <h3 className="font-bold text-lg"><i className="fas fa-phone-volume"></i> 電話預約檢查 (Call Booking)</h3>
                    <button onClick={onClose}><i className="fas fa-times"></i></button>
                </div>
                <div className="p-5 space-y-4">
                    {step === 'CHECK' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs font-bold text-gray-500">預約時間</label><input type="time" className="w-full border p-2 rounded font-bold text-lg" value={form.time} onChange={e => { setForm({...form, time: e.target.value}); setCheckResult(null); }} /></div>
                                <div><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full border p-2 rounded font-bold" value={form.pax} onChange={e => { setForm({...form, pax: parseInt(e.target.value)}); setCheckResult(null); }}>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} 位</option>)}</select></div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-500">服務項目</label><select className="w-full border p-2 rounded font-bold" value={form.service} onChange={e => { setForm({...form, service: e.target.value}); setCheckResult(null); }}>{window.SERVICES_LIST.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs font-bold text-gray-500">指定技師</label><select className="w-full border p-2 rounded font-bold" value={form.genderPref} onChange={e => { setForm({...form, genderPref: e.target.value}); setCheckResult(null); }}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師傅</option><option value="男">🚹 男師傅</option><optgroup label="指定 ID">{safeStaffList.map(s => <option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}</optgroup></select></div>
                                <div><label className="text-xs font-bold text-gray-500">精油</label><button onClick={() => { const newVal = !form.isOil; setForm({ ...form, isOil: newVal, genderPref: newVal ? '女' : form.genderPref }); setCheckResult(null); }} className={`w-full border p-2 rounded font-bold flex items-center justify-center gap-2 ${form.isOil ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>{form.isOil ? '✅ 有' : '⬜ 無'}</button></div>
                            </div>
                            {checkResult && (<div className={`p-3 rounded text-center font-bold ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{checkResult.message}</div>)}
                            <div className="pt-2">{!checkResult ? (<button onClick={performCheck} className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">🔍 查詢空位</button>) : (checkResult.status === 'OK' ? (<button onClick={() => setStep('INFO')} className="w-full bg-green-600 text-white p-3 rounded font-bold hover:bg-green-700 animate-pulse">➡️ 下一步: 輸入資料</button>) : (<button onClick={performCheck} className="w-full bg-gray-400 text-white p-3 rounded font-bold">🔄 再查一次</button>))}</div>
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

// --- BILLING MODAL ---
const BillingModal = ({ activeItem, relatedItems, onConfirm, onCancel }) => {
    const hasGroup = relatedItems.length > 0;
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
                        <button onClick={() => { setTargetItems([activeItem]); setStep('CONFIRM'); }} className="flex flex-col items-center p-5 rounded-xl border-2 border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all"><span className="text-3xl mb-2">👤</span><span className="font-bold text-slate-700">個別結帳</span></button>
                        <button onClick={() => { setTargetItems([activeItem, ...relatedItems]); setStep('CONFIRM'); }} className="flex flex-col items-center p-5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-all shadow-md"><span className="text-3xl mb-2">👥</span><span className="font-bold text-blue-700">合併結帳</span></button>
                    </div>
                    <button onClick={onCancel} className="text-gray-400 font-bold hover:text-gray-600">取消</button>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[90] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl modal-animate overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-emerald-600 p-4 text-white text-center shrink-0"><h3 className="text-xl font-bold flex justify-center items-center gap-2"><i className="fas fa-file-invoice-dollar"></i> 結帳清單</h3></div>
                <div className="p-6 flex-1 overflow-y-auto">
                    <div className="space-y-3">{targetItems.map(item => { const b = item.booking; const price = window.getPrice(b.serviceName) + window.getOilPrice(b.isOil || (b.serviceName && b.serviceName.includes('油'))); return (<div key={item.resourceId} className="flex items-center p-3 rounded-lg border border-slate-200 bg-slate-50"><div className="flex-1"><div className="font-bold text-slate-800 flex items-center gap-2">{b.customerName} <span className="text-xs text-white bg-indigo-500 px-1.5 py-0.5 rounded shadow-sm">{b.serviceStaff || b.staffId}</span></div><div className="text-xs text-gray-500 mt-1">{b.serviceName}</div></div><div className="font-mono font-bold text-xl text-slate-700">${price}</div></div>); })}</div>
                </div>
                <div className="p-5 border-t bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                    <div className="flex justify-between items-end mb-4"><span className="text-gray-500 font-bold text-lg">總金額:</span><span className="text-5xl font-black text-emerald-600 tracking-tight">${calculateTotal(targetItems)}</span></div>
                    <button onClick={() => onConfirm(targetItems, calculateTotal(targetItems))} className="w-full p-4 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg text-lg flex justify-center items-center gap-2">✅ 確認收款</button>
                    <button onClick={onCancel} className="w-full py-3 text-gray-400 font-bold hover:text-gray-600 mt-2">返回</button>
                </div>
            </div>
        </div>
    );
};
window.BillingModal = BillingModal;

// --- SPLIT STAFF MODAL ---
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
                <h3 className="text-xl font-bold text-slate-800 mb-2 text-center">拆單 / 加人</h3>
                <div className="flex-1 overflow-y-auto space-y-2">{readyStaff.map(s => (<button key={s.id} onClick={() => onConfirm(s.id)} className="w-full p-3 border rounded-lg hover:bg-orange-50 flex justify-between items-center group"><div className="flex items-center gap-2"><span className="font-black text-lg bg-gray-100 px-2 rounded group-hover:bg-orange-200">{s.id}</span><span>{s.name}</span></div><span className="text-xs font-mono text-gray-400">{new Date(statusData[s.id]?.checkInTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></button>))}</div>
                <button onClick={onCancel} className="mt-4 w-full py-3 text-gray-400 font-bold border-t">取消</button>
            </div>
        </div>
    );
};
window.SplitStaffModal = SplitStaffModal;

// --- WALKIN MODAL ---
const WalkInModal = ({ onClose, onSave, staffList, initialDate }) => {
    const [form, setForm] = useState({ hoTen: '現場客', dichVu: '👣 足底按摩 (40分)', pax: 1, nhanVien: '隨機', isOil: false });
    return (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl modal-animate p-5">
                <h3 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2"><i className="fas fa-bolt text-amber-500"></i> 現場客</h3>
                <div className="space-y-3">
                    <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full p-2 border rounded font-bold" value={form.hoTen} onChange={e=>setForm({...form, hoTen: e.target.value})} /></div>
                    <div><label className="text-xs font-bold text-gray-500">服務項目</label><select className="w-full p-2 border rounded font-bold" value={form.dichVu} onChange={e=>setForm({...form, dichVu: e.target.value})}>{window.SERVICES_LIST.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                    <div className="flex gap-3"><div className="flex-1"><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full p-2 border rounded font-bold" value={form.pax} onChange={e=>setForm({...form, pax: parseInt(e.target.value)})}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select></div><div className="flex-1"><label className="text-xs font-bold text-gray-500">精油</label><button onClick={()=>setForm({...form, isOil: !form.isOil})} className={`w-full p-2 border rounded font-bold flex items-center justify-center gap-2 ${form.isOil ? 'bg-purple-100 border-purple-500 text-purple-700' : 'bg-gray-50'}`}>{form.isOil ? '是' : '否'}</button></div></div>
                    <div><label className="text-xs font-bold text-gray-500">指定師傅</label><select className="w-full p-2 border rounded font-bold" value={form.nhanVien} onChange={e=>setForm({...form, nhanVien: e.target.value})}><option value="隨機">-- 隨機 --</option>{(staffList||[]).map(s=><option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}</select></div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3"><button onClick={onClose} className="p-3 bg-gray-100 text-gray-500 font-bold rounded-lg hover:bg-gray-200">取消</button><button onClick={()=>onSave({ ...form, ngayDen: initialDate.replace(/-/g, '/'), gioDen: new Date().toLocaleTimeString('en-US',{hour12:false, hour:'2-digit', minute:'2-digit'}) })} className="p-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg">確認</button></div>
            </div>
        </div>
    );
};
window.WalkInModal = WalkInModal;

// --- COMBO START MODAL ---
const ComboStartModal = ({ onConfirm, onCancel, bookingName }) => {
    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl modal-animate p-6 flex flex-col items-center">
                <h3 className="text-xl font-bold text-slate-800 mb-2">開始套餐 (Combo)</h3>
                <p className="text-slate-500 mb-6 text-center">請選擇優先順序<br/><span className="font-bold text-indigo-600">{bookingName}</span></p>
                <div className="grid grid-cols-2 gap-4 w-full mb-4">
                    <button onClick={() => onConfirm('FB')} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all"><span className="text-4xl mb-2">👣</span><span className="font-bold text-emerald-700">先做腳 (Foot First)</span></button>
                    <button onClick={() => onConfirm('BF')} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 transition-all"><span className="text-4xl mb-2">🛏️</span><span className="font-bold text-purple-700">先做身 (Body First)</span></button>
                </div>
                <button onClick={onCancel} className="text-slate-400 font-bold hover:text-slate-600">取消</button>
            </div>
        </div>
    );
};
window.ComboStartModal = ComboStartModal;
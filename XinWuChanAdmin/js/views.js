/**
 * ============================================================================
 * FILE: js/views.js
 * PHIÊN BẢN: V108.01 (NÂNG CẤP LÕI SẮP XẾP NHÂN VIÊN THEO STAFFTIME & GIAO DIỆN DROPDOWN)
 * MÔ TẢ: CÁC COMPONENT HIỂN THỊ CHÍNH (VIEW LAYER)
 * ============================================================================
 */

const { useState, useEffect, useMemo, useRef } = React;

// --- HÀM TIỆN ÍCH LỌC VÀ SẮP XẾP NHÂN VIÊN (ĐÃ NÂNG CẤP BƯỚC 2: CHÍNH XÁC MILLISECOND) ---
const getProcessedStaffList = (rawList, statusData, currentSelected) => {
    if (!rawList || !Array.isArray(rawList)) return [];
    const safeStatus = statusData || {};

    // 1. Lọc và sắp xếp
    let available = rawList.filter(s => {
        if (typeof s !== 'object') return true;
        const st = safeStatus[s.id]?.status;
        // Nếu không có statusData thì fallback lại hiển thị tất cả
        if (!st) return true;
        // Chỉ lấy những thợ thuộc nhóm sẵn sàng nhận khách
        return ['READY', 'EAT', 'OUT_SHORT'].includes(st);
    }).sort((a, b) => {
        if (typeof a !== 'object' || typeof b !== 'object') return 0;

        // THUẬT TOÁN MỚI: Sắp xếp dựa trên stafftime (Thời gian xếp hàng chính xác đến millisecond)
        const timeA = safeStatus[a.id]?.stafftime !== undefined ? Number(safeStatus[a.id].stafftime) : Number.MAX_SAFE_INTEGER;
        const timeB = safeStatus[b.id]?.stafftime !== undefined ? Number(safeStatus[b.id].stafftime) : Number.MAX_SAFE_INTEGER;

        return timeA - timeB;
    });

    // 2. Đảm bảo nhân viên hiện tại đang được chọn (nếu có) luôn hiển thị trong danh sách, dù họ đang BUSY
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


// ============================================================================
// 0. BOOKING CONTROL MODAL (SUPER MODAL)
// ============================================================================
const BookingControlModal = ({ isOpen, onClose, onAction, booking, meta, liveData, contextResourceId, staffList, statusData }) => {
    if (!isOpen || !booking) return null;

    const totalDuration = booking.duration || 60;
    const initialP1 = meta && meta.phase1_duration !== undefined
        ? meta.phase1_duration
        : (booking.phase1_duration !== undefined ? booking.phase1_duration : totalDuration / 2);

    const [phase1, setPhase1] = useState(initialP1);

    const currentSequence = (meta && meta.sequence) ? meta.sequence : (booking.flow || 'FB');
    const [localFlow, setLocalFlow] = useState(currentSequence);
    const isBodyFirstLocal = localFlow === 'BF';

    const [timeLeft, setTimeLeft] = useState(0);
    const [percent, setPercent] = useState(0);
    const [timerString, setTimerString] = useState("--:--");
    const [selectedService, setSelectedService] = useState(booking.serviceName);

    const [selectedStaff, setSelectedStaff] = useState(booking.serviceStaff || booking.staffId || '隨機');

    // Nạp danh sách thợ với thuật toán stafftime
    const processedStaffList = useMemo(() => {
        const activeStaffList = staffList || window.STAFF_LIST || [];
        return getProcessedStaffList(activeStaffList, statusData, selectedStaff);
    }, [staffList, statusData, selectedStaff]);

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
                : (booking.phase1_duration !== undefined ? booking.phase1_duration : booking.duration / 2);
            setPhase1(currentP1);
            setSelectedService(booking.serviceName);
            setSelectedStaff(booking.serviceStaff || booking.staffId || '隨機');
            setShowPaymentOptions(false);
            setLocalFlow((meta && meta.sequence) ? meta.sequence : (booking.flow || 'FB'));
        }
    }, [isOpen, booking, meta]);

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
    const startMins = timeStrToMins(startTimeStr);
    const switchMins = startMins + phase1;
    const endMins = startMins + totalDuration;
    const switchTimeStr = minsToTimeStr(switchMins);
    const endTimeStr = minsToTimeStr(endMins);

    const handleStartTimeChange = (e) => setStartTimeStr(e.target.value);
    const handleSwitchTimeChange = (e) => {
        const newSwitchStr = e.target.value;
        if (!newSwitchStr) return;
        let newSwitchMins = timeStrToMins(newSwitchStr);
        let diff = newSwitchMins - startMins;
        while (diff < -720) diff += 1440;
        while (diff > 720) diff -= 1440;
        let newPhase1 = diff;
        if (newPhase1 < 0) newPhase1 = 0;
        if (newPhase1 > totalDuration) newPhase1 = totalDuration;
        setPhase1(newPhase1);
    };

    const handleChangeP1 = (val) => { let newP1 = parseInt(val) || 0; if (newP1 < 0) newP1 = 0; if (newP1 > totalDuration) newP1 = totalDuration; setPhase1(newP1); };
    const handleChangeP2 = (val) => { let newP2 = parseInt(val) || 0; if (newP2 < 0) newP2 = 0; if (newP2 > totalDuration) newP2 = totalDuration; setPhase1(totalDuration - newP2); };

    const triggerAction = (actionType, payload = {}) => {
        const fullPayload = { ...payload, bookingId: booking.rowId, currentBooking: booking, resourceId: contextResourceId, currentMeta: meta };
        console.log(`[BookingControlModal] Triggering: ${actionType}`, fullPayload);
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

    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-300 flex flex-col max-h-[90vh] relative">

                {/* 1. HEADER */}
                <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-4 text-white shrink-0">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="bg-white/20 text-xs px-2 py-0.5 rounded uppercase font-mono tracking-wider">#{booking.rowId}</span>
                                {contextResourceId && <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded uppercase font-bold shadow-sm"><i className="fas fa-map-marker-alt mr-1"></i>{contextResourceId.replace('bed-', '床 ').replace('chair-', '足 ')}</span>}
                                {isRunning && !isPaused && <span className="bg-green-500 text-xs font-bold px-2 py-0.5 rounded animate-pulse">進行中 (RUNNING)</span>}
                                {isPaused && <span className="bg-yellow-500 text-xs font-bold px-2 py-0.5 rounded">暫停 (PAUSED)</span>}
                                {!isRunning && <span className="bg-gray-500 text-xs font-bold px-2 py-0.5 rounded">等待中 (WAITING)</span>}
                            </div>
                            <h2 className="text-2xl font-black mt-1">{booking.customerName}</h2>
                            <div className="text-white/70 text-sm flex items-center gap-3 mt-1">
                                <span><i className="fas fa-phone-alt mr-1"></i> {booking.sdt || '---'}</span>
                                <span><i className="fas fa-users mr-1"></i> {booking.pax} 人 (Pax)</span>
                            </div>
                        </div>
                        <button onClick={onClose} className="bg-white/10 hover:bg-white/30 rounded-full w-10 h-10 flex items-center justify-center transition-all"><i className="fas fa-times text-xl"></i></button>
                    </div>
                </div>

                {/* 2. BODY CONTENT */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 bg-slate-50 flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">

                            {/* KHU VỰC CHỌN NHÂN VIÊN */}
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">選擇師傅 (Staff)</label>
                            <div className="flex items-center justify-between mb-4 relative">
                                <div className="relative flex-1 mr-2 bg-slate-50 border border-slate-200 rounded-lg">
                                    <select
                                        value={selectedStaff}
                                        onChange={(e) => setSelectedStaff(e.target.value)}
                                        className="w-full text-xl font-black text-indigo-800 bg-transparent focus:outline-none focus:border-indigo-500 cursor-pointer appearance-none py-2 pl-3 pr-8 rounded-lg"
                                    >
                                        <option value="隨機">尚未安排 (Waiting)</option>
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

                                                return <option key={val} value={val}>{prefix}{label}{suffix}</option>;
                                            });
                                        })()}
                                    </select>
                                    <div className="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                                        <i className="fas fa-chevron-down"></i>
                                    </div>
                                </div>

                                {selectedStaff !== (booking.serviceStaff || booking.staffId || '隨機') && (
                                    <button onClick={() => triggerAction('CHANGE_STAFF', { newStaff: selectedStaff })} className="absolute right-[85px] bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded shadow hover:bg-indigo-700 animate-pulse transition-colors z-10">
                                        確認
                                    </button>
                                )}

                                <button onClick={() => triggerAction('SPLIT')} className="shrink-0 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2 rounded-lg font-bold transition-colors border border-blue-200">
                                    <i className="fas fa-user-plus mr-1"></i> 加人
                                </button>
                            </div>

                            {/* KHU VỰC DỊCH VỤ */}
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">服務項目 (Service)</label>
                            <div className="relative">
                                <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)} className="w-full text-lg font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:border-indigo-500 appearance-none">
                                    {window.SERVICES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <div className="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                                    <i className="fas fa-chevron-down"></i>
                                </div>
                                {selectedService !== booking.serviceName && (
                                    <button onClick={() => triggerAction('CHANGE_SERVICE', { newService: selectedService })} className="absolute right-8 top-1.5 bottom-1.5 bg-indigo-600 text-white text-xs font-bold px-3 rounded hover:bg-indigo-700 animate-pulse">
                                        確認
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-800 rounded-xl p-4 text-white relative overflow-hidden flex flex-col justify-center items-center shadow-inner">
                            <div className="absolute bottom-0 left-0 h-1 bg-green-500 transition-all duration-1000 z-0" style={{ width: `${percent}%` }}></div>
                            <div className="z-10 text-center">
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">剩餘時間 (REMAINING TIME)</div>
                                <div className={`text-5xl font-mono font-bold tracking-tighter ${timeLeft < 5 && isRunning ? 'text-red-400 animate-pulse' : 'text-white'}`}>{timerString}</div>
                                <div className="text-xs text-slate-400 mt-2 font-mono">總共 (TOTAL): {totalDuration} 分鐘</div>
                            </div>
                        </div>
                    </div>

                    {isCombo && (
                        <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm transition-all">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2"><i className="fas fa-sliders-h text-indigo-500"></i> 套餐時間調整 (Combo Phase)</h3>
                                <button
                                    onClick={() => triggerAction('UPDATE_PHASE', { phase1, startTimeStr, switchTimeStr })}
                                    className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded font-bold hover:bg-indigo-100 border border-indigo-300 shadow-sm transition-all"
                                >
                                    <i className="fas fa-save mr-1"></i> 保存同步 (Save Sync)
                                </button>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 relative">
                                    <label className={`block text-xs font-bold mb-1 text-center transition-colors ${isBodyFirstLocal ? 'text-orange-600' : 'text-indigo-600'}`}>PHASE 1 ({isBodyFirstLocal ? '身' : '足'})</label>
                                    <input type="number" value={phase1} onChange={(e) => handleChangeP1(e.target.value)} className={`w-full text-center text-3xl font-black border-b-2 focus:outline-none bg-transparent transition-colors ${isBodyFirstLocal ? 'text-orange-900 border-orange-200 focus:border-orange-600' : 'text-indigo-900 border-indigo-200 focus:border-indigo-600'}`} />
                                    <span className="block text-center text-xs text-gray-400 mt-1">分鐘 (Minutes)</span>
                                    <div className="mt-3 flex flex-col items-center animate-in fade-in">
                                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border shadow-inner transition-colors ${isBodyFirstLocal ? 'bg-orange-50 border-orange-200' : 'bg-indigo-50 border-indigo-200'}`}>
                                            <i className={`fas fa-play-circle text-xs ${isBodyFirstLocal ? 'text-orange-500' : 'text-indigo-500'}`}></i>
                                            <input type="time" value={startTimeStr} onChange={handleStartTimeChange} className="bg-transparent font-mono text-sm font-bold text-slate-700 outline-none cursor-pointer w-[70px] text-center" required />
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
                                            <input type="time" value={switchTimeStr} onChange={handleSwitchTimeChange} className="bg-transparent font-mono text-sm font-bold text-slate-700 outline-none cursor-pointer w-[70px] text-center" required />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 relative">
                                    <label className={`block text-xs font-bold mb-1 text-center transition-colors ${isBodyFirstLocal ? 'text-indigo-600' : 'text-orange-600'}`}>PHASE 2 ({isBodyFirstLocal ? '足' : '身'})</label>
                                    <input type="number" value={phase2} onChange={(e) => handleChangeP2(e.target.value)} className={`w-full text-center text-3xl font-black border-b-2 focus:outline-none bg-transparent transition-colors ${isBodyFirstLocal ? 'text-indigo-900 border-indigo-200 focus:border-indigo-600' : 'text-orange-900 border-orange-200 focus:border-orange-600'}`} />
                                    <span className="block text-center text-xs text-gray-400 mt-1">分鐘 (Minutes)</span>
                                    <div className="mt-3 flex flex-col items-center animate-in fade-in">
                                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border shadow-inner opacity-80 cursor-not-allowed transition-colors ${isBodyFirstLocal ? 'bg-indigo-50 border-indigo-200' : 'bg-orange-50 border-orange-200'}`}>
                                            <i className={`fas fa-flag-checkered text-xs ${isBodyFirstLocal ? 'text-indigo-500' : 'text-orange-500'}`}></i>
                                            <input type="time" value={endTimeStr} readOnly className="bg-transparent font-mono text-sm font-bold text-slate-500 outline-none pointer-events-none w-[70px] text-center" />
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
                </div>

                {/* 3. ACTION FOOTER */}
                <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                    <div className="grid grid-cols-4 gap-3">
                        {!isRunning ? (
                            isGroupBooking ? (
                                <>
                                    <button onClick={() => triggerAction('START', { scope: 'INDIVIDUAL' })} className="col-span-1 bg-white border-2 border-green-600 text-green-700 hover:bg-green-50 rounded-xl font-bold text-sm shadow-sm flex flex-col items-center justify-center transform active:scale-95 transition-all"><i className="fas fa-play mb-1"></i> 開始(個人)</button>
                                    <button onClick={() => triggerAction('START', { scope: 'GROUP' })} className="col-span-1 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-200 flex flex-col items-center justify-center transform active:scale-95 transition-all"><i className="fas fa-users mb-1"></i> 開始(全體)</button>
                                </>
                            ) : (
                                <button onClick={() => triggerAction('START', { scope: 'INDIVIDUAL' })} className="col-span-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-green-200 flex items-center justify-center gap-2 transform active:scale-95 transition-all"><i className="fas fa-play"></i> 開始 (Start)</button>
                            )
                        ) : (
                            <button onClick={() => triggerAction('PAUSE')} className={`col-span-2 text-white py-3 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transform active:scale-95 transition-all ${isPaused ? 'bg-green-500' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                                {isPaused ? <><i className="fas fa-play"></i> 繼續 (Resume)</> : <><i className="fas fa-pause"></i> 暫停 (Pause)</>}
                            </button>
                        )}
                        <button onClick={handleFinishRequest} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 flex flex-col items-center justify-center transform active:scale-95 transition-all"><i className="fas fa-check-circle text-xl mb-0.5"></i><span className="text-xs">結帳 (Done)</span></button>
                        <button onClick={() => { if (confirm('確定要取消嗎？ / Are you sure?')) triggerAction('CANCEL'); }} className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold flex flex-col items-center justify-center transform active:scale-95 transition-all"><i className="fas fa-trash-alt text-xl mb-0.5"></i><span className="text-xs">取消 (Cancel)</span></button>
                    </div>
                </div>

                {showPaymentOptions && (
                    <div className="absolute inset-0 z-[3010] bg-slate-900/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
                            <div className="bg-indigo-600 p-4 text-center">
                                <h3 className="text-white font-bold text-xl">結帳方式選擇 (Payment Option)</h3>
                                <p className="text-indigo-200 text-sm mt-1">{booking.customerName} ({booking.pax} Pax)</p>
                            </div>
                            <div className="p-6 space-y-4">
                                <button onClick={() => triggerAction('FINISH', { scope: 'INDIVIDUAL' })} className="w-full py-4 bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:bg-indigo-50 rounded-xl flex items-center p-4 transition-all group transform active:scale-95">
                                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform"><i className="fas fa-user"></i></div>
                                    <div className="text-left"><div className="font-bold text-slate-800 text-lg">分開結帳 (Individual)</div><div className="text-xs text-slate-500">只結算此位客人的費用</div></div>
                                </button>
                                <button onClick={() => triggerAction('FINISH', { scope: 'GROUP' })} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl flex items-center p-4 shadow-lg hover:shadow-xl hover:from-blue-500 hover:to-indigo-500 transition-all group transform active:scale-95">
                                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform"><i className="fas fa-users"></i></div>
                                    <div className="text-left"><div className="font-bold text-white text-lg">團體結帳 (Group Pay)</div><div className="text-xs text-blue-100">結算全體 {booking.pax} 位客人的總費用</div></div>
                                </button>
                            </div>
                            <div className="bg-slate-50 p-3 text-center border-t border-slate-200">
                                <button onClick={() => setShowPaymentOptions(false)} className="text-slate-500 hover:text-slate-700 text-sm font-bold underline">取消 (Cancel)</button>
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
const TimelineView = ({ timelineData, onEditPhase, liveStatusData, staffList, statusData }) => {
    const [controlModalOpen, setControlModalOpen] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [selectedMeta, setSelectedMeta] = useState(null);
    const [selectedLiveData, setSelectedLiveData] = useState(null);
    const [selectedResourceId, setSelectedResourceId] = useState(null);

    useEffect(() => {
        if (controlModalOpen && selectedResourceId && liveStatusData) {
            const currentSlotData = liveStatusData[selectedResourceId];
            if (currentSlotData && selectedBooking && currentSlotData.booking && String(currentSlotData.booking.rowId) === String(selectedBooking.rowId)) {
                setSelectedLiveData({ ...currentSlotData, resourceId: selectedResourceId });
            }
        }
    }, [liveStatusData, controlModalOpen, selectedResourceId, selectedBooking]);

    const startHour = 8;
    const endHour = 27;
    const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);
    const PIXELS_PER_MIN = 2.2;
    const HOUR_WIDTH = 60 * PIXELS_PER_MIN;
    const HEADER_HEIGHT = 45;
    const ROW_HEIGHT = 60;
    const LEFT_COL_WIDTH = 80;
    const TOTAL_WIDTH = LEFT_COL_WIDTH + (hours.length * HOUR_WIDTH);

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

    const rows = [
        ...Array.from({ length: 6 }, (_, i) => ({ id: `chair-${i + 1}`, label: `足 ${i + 1}`, type: 'chair' })),
        ...Array.from({ length: 6 }, (_, i) => ({ id: `bed-${i + 1}`, label: `床 ${i + 1}`, type: 'bed' }))
    ];

    const getDisplayLabel = (booking) => {
        let name = booking.customerName || '';
        let phone = booking.sdt || '';
        if (name.includes('(')) {
            const parts = name.split('(');
            name = parts[0].trim();
            const phonePart = parts[1].replace(')', '').trim();
            if (!phone) phone = phonePart;
        }
        const last3 = phone && phone.length >= 3 ? phone.slice(-3) : '';
        return last3 ? `${name} (${last3})` : name;
    };

    const handleOpenControl = (booking, meta, resourceId) => {
        let liveInfo = null;
        if (liveStatusData && resourceId && liveStatusData[resourceId]) {
            const slotData = liveStatusData[resourceId];
            if (slotData.booking && String(slotData.booking.rowId) === String(booking.rowId)) {
                liveInfo = { ...slotData, resourceId: resourceId };
            }
        }
        setSelectedBooking(booking);
        setSelectedMeta(meta);
        setSelectedLiveData(liveInfo);
        setSelectedResourceId(resourceId);
        setControlModalOpen(true);
    };

    const handleControlAction = (actionType, payload) => {
        if (onEditPhase) onEditPhase(actionType, payload);
        if (['CANCEL', 'FINISH', 'UPDATE_PHASE'].includes(actionType)) setControlModalOpen(false);
    };

    const handleShiftResource = (e, booking, resourceId, direction) => {
        e.stopPropagation();
        if (onEditPhase) {
            onEditPhase('SHIFT_RESOURCE', { bookingId: booking.rowId, currentBooking: booking, resourceId: resourceId, direction: direction });
        }
    };

    const safeData = timelineData || {};

    return (
        <div className="bg-white rounded shadow border border-slate-200 h-[calc(100vh-170px)] overflow-x-scroll overflow-y-auto relative custom-scrollbar pb-2">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar:horizontal { height: 25px !important; }
                .custom-scrollbar::-webkit-scrollbar:vertical { width: 14px !important; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #94a3b8; border-radius: 20px; border: 4px solid #f1f5f9; background-clip: content-box; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #64748b; }
                .custom-scrollbar::-webkit-scrollbar-corner { background: #f1f5f9; }
                .edit-btn { opacity: 0; transition: opacity 0.2s, transform 0.1s; }
                .timeline-block:hover .edit-btn { opacity: 1; }
                .edit-btn:hover { transform: translate(-50%, -50%) scale(1.1); background-color: rgba(255,255,255,1) !important; color: #4f46e5 !important; border-color: #6366f1; }
                .shift-controls { opacity: 0; transition: opacity 0.2s; }
                .timeline-block:hover .shift-controls { opacity: 1; }
                .shift-btn:hover { background-color: rgba(255,255,255,1); color: #4f46e5; transform: scale(1.1); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .shift-btn:active { transform: scale(0.9); background-color: #e0e7ff; }
                .bf-indicator { animation: pulse-border 2s infinite; }
                @keyframes pulse-border { 0% { border-color: #4f46e5; box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); } 70% { border-color: #818cf8; box-shadow: 0 0 0 4px rgba(79, 70, 229, 0); } 100% { border-color: #4f46e5; box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); } }
            `}</style>

            <BookingControlModal
                isOpen={controlModalOpen}
                onClose={() => setControlModalOpen(false)}
                onAction={handleControlAction}
                booking={selectedBooking}
                meta={selectedMeta}
                liveData={selectedLiveData}
                contextResourceId={selectedResourceId}
                staffList={staffList}
                statusData={statusData}
            />

            <div style={{ width: `${TOTAL_WIDTH}px`, minWidth: '100%' }}>
                {/* HEADER */}
                <div className="flex sticky top-0 z-30 bg-slate-100 border-b border-slate-300 shadow-md h-[45px]">
                    <div className="sticky left-0 top-0 z-40 bg-[#e2e8f0] border-r border-slate-300 flex items-center justify-center font-extrabold text-slate-700 text-sm shadow-[2px_0_5px_rgba(0,0,0,0.1)]"
                        style={{ width: `${LEFT_COL_WIDTH}px`, height: `${HEADER_HEIGHT}px` }}>
                        區域 (Zone)
                    </div>
                    <div className="flex bg-slate-50">
                        {hours.map(h => (
                            <div key={h} className="shrink-0 border-r border-slate-300 flex items-center justify-center text-slate-500 font-bold text-xs" style={{ width: `${HOUR_WIDTH}px`, height: `${HEADER_HEIGHT}px` }}>{formatHour(h)}</div>
                        ))}
                    </div>
                </div>

                {/* BODY */}
                <div className="relative bg-white pb-4">
                    {rows.map((row, index) => {
                        const isLastChairRow = index === 5;
                        const rowStyleClass = isLastChairRow ? "border-b-4 border-red-500" : "border-b border-slate-100";
                        const canMoveUp = index > 0 && rows[index - 1].type === row.type;
                        const canMoveDown = index < rows.length - 1 && rows[index + 1].type === row.type;

                        return (
                            <div key={row.id} className={`flex relative transition-colors hover:bg-slate-50 ${rowStyleClass}`} style={{ height: `${ROW_HEIGHT}px` }}>
                                <div className={`sticky left-0 z-20 shrink-0 border-r border-slate-300 flex items-center justify-center font-bold text-sm shadow-[2px_0_5px_rgba(0,0,0,0.05)] ${row.type === 'chair' ? 'bg-teal-50 text-teal-800' : 'bg-purple-50 text-purple-800'}`} style={{ width: `${LEFT_COL_WIDTH}px` }}>{row.label}</div>
                                <div className="relative flex-1 h-full">
                                    <div className="absolute inset-0 flex pointer-events-none z-0">{hours.map(h => (<div key={h} className="shrink-0 border-r border-slate-200 h-full border-dashed" style={{ width: `${HOUR_WIDTH}px` }}></div>))}</div>
                                    {safeData[row.id] && safeData[row.id].map((slot, idx) => {
                                        let startMins = slot.start;
                                        let duration = slot.end - slot.start;
                                        const startOffset = startMins - (startHour * 60);
                                        const leftPos = startOffset * PIXELS_PER_MIN;
                                        const width = duration * PIXELS_PER_MIN;
                                        let bgClass = getRowIdColor(slot.booking.rowId);
                                        const label = getDisplayLabel(slot.booking);
                                        const endTimeStr = window.formatMinutesToTime(slot.end);
                                        const startTimeStr = window.formatMinutesToTime(slot.start);
                                        const deadlineText = `⏳ ${duration}分 ➔ ${endTimeStr}`;
                                        const isRunning = slot.meta && slot.meta.isRunning;
                                        const isBodyFirst = slot.meta && slot.meta.sequence === 'BF';
                                        let specialBorderClass = "border border-black/5";
                                        if (isRunning) specialBorderClass = "border-2 border-red-600 shadow-md shadow-red-200 z-20";
                                        else if (isBodyFirst) specialBorderClass = "border-l-[6px] border-l-indigo-700 bf-indicator shadow-indigo-200";

                                        let comboIcon = "";
                                        if (slot.meta && slot.meta.isCombo) {
                                            if (slot.meta.phase === 1) comboIcon = "❶";
                                            else if (slot.meta.phase === 2) comboIcon = "❷";
                                        }

                                        const isComboPhase2 = slot.meta && slot.meta.isCombo && slot.meta.phase === 2;
                                        const showControlBtn = !isComboPhase2;

                                        return (
                                            <div key={idx}
                                                className={`absolute top-1 bottom-1 rounded px-2 flex flex-col justify-center text-xs overflow-hidden shadow-sm z-10 cursor-pointer transition-all timeline-block group ${bgClass} ${specialBorderClass}`}
                                                style={{ left: `${leftPos}px`, width: `${width}px` }}
                                                title={`${slot.booking.serviceName}\n${isRunning ? '🔥 進行中 (Running)' : ''}`}
                                            >
                                                <div className="font-bold truncate text-[11px] leading-tight flex justify-between items-center">
                                                    <span className="flex items-center gap-1">
                                                        {label} {comboIcon}
                                                        {isBodyFirst && <span className="text-[10px] bg-indigo-600 text-white px-1 rounded-sm animate-pulse" title="Body First">🔀BF</span>}
                                                    </span>
                                                </div>
                                                <div className={`text-[10px] font-mono font-bold text-slate-700 bg-white/40 rounded px-1 mt-0.5 truncate border border-black/5 ${isRunning ? 'bg-red-50 text-red-700 border-red-100' : ''}`}>
                                                    {slot.meta && slot.meta.isCombo ? (slot.meta.phase === 1 ? deadlineText : `🏁 ${startTimeStr} ➔ (${duration}分)`) : deadlineText}
                                                </div>
                                                <div className="truncate opacity-75 text-[9px] flex items-center gap-1 mt-0.5">
                                                    {(slot.booking.isOil || (slot.booking.serviceName && slot.booking.serviceName.includes('油'))) && <span title="Oil">💧</span>}
                                                    {(slot.booking.category === 'COMBO') && <span title="Combo">🔥</span>}
                                                    <span>{slot.booking.serviceName}</span>
                                                </div>
                                                {showControlBtn && (
                                                    <button className="edit-btn absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white/95 backdrop-blur-sm text-slate-500 rounded-full flex items-center justify-center shadow-lg border border-slate-200 z-50 hover:text-indigo-600 hover:border-indigo-400 hover:bg-white transition-all"
                                                        onClick={(e) => { e.stopPropagation(); handleOpenControl(slot.booking, slot.meta, row.id); }} title="設置 (Click to Edit)">
                                                        <i className="fas fa-cog text-sm animate-spin-hover"></i>
                                                    </button>
                                                )}
                                                <div className="shift-controls absolute bottom-0.5 right-0.5 flex flex-col gap-0.5 z-[60]">
                                                    {canMoveUp && (<button onClick={(e) => handleShiftResource(e, slot.booking, row.id, -1)} className="shift-btn w-5 h-4 rounded-sm bg-black/20 text-white flex items-center justify-center text-[10px] backdrop-blur-sm hover:bg-white hover:text-indigo-600 transition-transform" title="向上移 (Move Up)"><i className="fas fa-chevron-up"></i></button>)}
                                                    {canMoveDown && (<button onClick={(e) => handleShiftResource(e, slot.booking, row.id, 1)} className="shift-btn w-5 h-4 rounded-sm bg-black/20 text-white flex items-center justify-center text-[10px] backdrop-blur-sm hover:bg-white hover:text-indigo-600 transition-transform" title="向下移 (Move Down)"><i className="fas fa-chevron-down"></i></button>)}
                                                </div>
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
    );
};
window.TimelineView = TimelineView;

// ============================================================================
// 2. COMMISSION VIEW 
// ============================================================================
const CommissionView = ({ bookings, staffList }) => {
    const RATES = { JIE_PRICE: 250, OIL_BONUS: 80 };
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
            if (b.status && (b.status.includes('取消') || b.status.includes('Cancel') || b.status.includes('❌'))) return;

            const slots = [
                { id: b.serviceStaff || b.staffId, status: b.Status1 },
                { id: b.staffId2, status: b.Status2 },
                { id: b.staffId3, status: b.Status3 },
                { id: b.staffId4, status: b.Status4 },
                { id: b.staffId5, status: b.Status5 },
                { id: b.staffId6, status: b.Status6 },
            ];

            const mainStatusDone = b.status && (b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅'));

            slots.forEach((slot) => {
                if (!slot.id || slot.id === '隨機' || slot.id === 'undefined' || slot.id === 'null' || slot.id === '') return;

                const isSlotDone = (slot.status && (slot.status.includes('完成') || slot.status.includes('Done'))) || mainStatusDone;

                if (isSlotDone) {
                    const normKey = normalize(slot.id);
                    let staffStat = lookupMap[normKey];
                    if (!staffStat) {
                        staffStat = { id: slot.id, name: slot.id, jie: 0, oil: 0, income: 0, orderCount: 0, isGhost: true };
                        stats[slot.id] = staffStat;
                        lookupMap[normKey] = staffStat;
                    }
                    if (staffStat) {
                        const q = getJieCount(b.serviceName, b.duration);
                        const hasOil = isOilService(b);
                        staffStat.jie += q;
                        staffStat.orderCount += 1;
                        if (hasOil) staffStat.oil += 1;
                    }
                }
            });
        });

        Object.values(stats).forEach(s => { s.income = (s.jie * RATES.JIE_PRICE) + (s.oil * RATES.OIL_BONUS); });

        return Object.values(stats).sort((a, b) => {
            if (b.income !== a.income) return b.income - a.income;
            return String(a.id).localeCompare(String(b.id));
        });
    }, [bookings, staffList]);

    const totalJie = commissionData.reduce((sum, item) => sum + item.jie, 0);
    const totalOil = commissionData.reduce((sum, item) => sum + item.oil, 0);
    const totalIncome = commissionData.reduce((sum, item) => sum + item.income, 0);
    const validOrders = bookings.filter(b => !b.status?.includes('取消')).length;

    return (
        <div className="bg-white rounded shadow-lg flex flex-col h-[calc(100vh-280px)] animate-in fade-in zoom-in duration-300 font-sans border border-slate-200">
            <div className="bg-[#2e1065] text-white p-2 flex justify-between items-center shrink-0 rounded-t-lg shadow-md z-10">
                <div className="flex items-center gap-4">
                    <h2 className="text-sm font-bold flex items-center gap-2"><i className="fas fa-calculator"></i> 薪資與節數統計 (Commissions)</h2>
                    <span className="text-xs text-gray-300 bg-white/10 px-2 py-0.5 rounded">有效單數 (Valid Orders): {validOrders}</span>
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
                    <div className="w-1/4 pl-4 text-gray-800 text-lg">總計 (Total):</div>
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
    const safeBookings = Array.isArray(bookings) ? bookings : [];

    const processedStats = useMemo(() => {
        let revenue = 0; let guests = 0;
        safeBookings.forEach(b => {
            if (b.status && b.status.includes('取消')) return;
            const pax = parseInt(b.pax, 10) || 1;
            for (let i = 0; i < 6; i++) {
                const statusKey = `Status${i + 1}`;
                const isItemDone = (b[statusKey] && (b[statusKey].includes('完成') || b[statusKey].includes('Done')));
                const isAllDone = (b.status && (b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅')));

                if (isItemDone || (isAllDone && i < pax)) {
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
                    <h3 className="text-gray-500 font-bold mb-2">本日營收 (Revenue)</h3>
                    <div className="text-4xl font-black text-emerald-600">${processedStats.revenue.toLocaleString()}</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
                    <h3 className="text-gray-500 font-bold mb-2">已服務人數 (Guests)</h3>
                    <div className="text-4xl font-black text-blue-600">{processedStats.guests}</div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow border overflow-hidden flex flex-col h-[600px]">
                <div className="p-3 bg-slate-50 border-b font-bold text-slate-700 shrink-0">交易明細 (Details)</div>
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
                                if (b.status && b.status.includes('取消')) return [];
                                const pax = parseInt(b.pax, 10) || 1;
                                const rows = [];
                                const staffList = [b.serviceStaff, b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6];

                                for (let k = 0; k < 6; k++) {
                                    const statusKey = `Status${k + 1}`;
                                    const isSingleDone = (b[statusKey] && (b[statusKey].includes('完成') || b[statusKey].includes('Done')));
                                    const isAllDone = (b.status && (b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅')));

                                    if (isSingleDone || (isAllDone && k < pax)) {
                                        const unitPrice = window.getPrice(b.serviceName);
                                        const oilPrice = window.getOilPrice(b.isOil || (b.serviceName && b.serviceName.includes('油')));
                                        const singlePrice = unitPrice + oilPrice;
                                        let staffName = staffList[k] || b.serviceStaff || b.staffId || '隨機';

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
        if (grpIdx === 0) myStaff = b.serviceStaff || b.staffId || b.ServiceStaff;
        else if (grpIdx === 1) myStaff = b.staffId2 || b.StaffId2;
        else if (grpIdx === 2) myStaff = b.staffId3 || b.StaffId3;
        else if (grpIdx === 3) myStaff = b.staffId4 || b.StaffId4;
        else if (grpIdx === 4) myStaff = b.staffId5 || b.StaffId5;
        else if (grpIdx === 5) myStaff = b.staffId6 || b.StaffId6;
        if (!myStaff || myStaff === 'undefined' || myStaff === 'null') myStaff = '隨機';
        staffDisplay = String(myStaff);
    }

    // Nạp danh sách thợ với thuật toán stafftime
    const processedStaffList = useMemo(() => {
        return getProcessedStaffList(staffList, statusData, staffDisplay);
    }, [staffList, statusData, staffDisplay]);

    const isOilJob = isOccupied && (data.booking.isOil || (data.booking.serviceName && (data.booking.serviceName.includes('油') || data.booking.serviceName.includes('Oil'))));
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

    if (!isOccupied) {
        return (
            <div className={`res-card h-72 flex flex-col border-2 ${statusColor} relative`}>
                <div className="flex justify-between items-center p-2 border-b border-black/5 bg-black/5"><span className="font-black text-xs text-gray-500 uppercase">{type === 'chair' ? '足' : '床'} {index}</span></div>
                <div className="flex-1 p-2 relative flex flex-col justify-center text-center"><button onClick={onSelect} className="w-full h-full flex flex-col items-center justify-center text-gray-300 hover:text-green-600 transition-colors group"><i className="fas fa-plus text-5xl"></i><span className="text-sm font-bold mt-2">排入 (Assign)</span></button></div>
            </div>
        );
    }

    const bfBadgeStyle = isBodyFirst ? "bg-indigo-600 text-white animate-pulse shadow-lg ring-2 ring-indigo-300" : "hidden";

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

                <div className="z-10 relative flex flex-col gap-2">

                    {/* BẢNG CHỌN SƯ PHỤ NGOÀI MÀN HÌNH CHÍNH */}
                    <div className="absolute -top-12 right-0 z-40 bg-white border-2 border-slate-200 rounded-lg shadow-sm px-2 py-1 flex items-center gap-1">
                        <div className="relative flex items-center">
                            <select
                                className={`text-xl font-black text-center bg-transparent focus:outline-none cursor-pointer hover:bg-slate-50 appearance-none pl-2 pr-5 ${staffDisplay === '隨機' ? 'text-gray-400' : 'text-slate-800'}`}
                                value={staffDisplay}
                                onChange={(e) => { e.stopPropagation(); onStaffChange(id, e.target.value); }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value="隨機">尚未安排</option>
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

                                        return <option key={val} value={val}>{prefix}{label}{suffix}</option>;
                                    });
                                })()}
                            </select>
                            <div className="pointer-events-none absolute right-1 text-gray-400 text-xs">
                                <i className="fas fa-chevron-down"></i>
                            </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onSplit(id); }} className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 text-xs shadow-sm transition-transform hover:scale-110 ml-1" title="加人 (Add Staff)"><i className="fas fa-user-plus"></i></button>
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
                        value={data.booking.serviceName || ''}
                        onChange={(e) => { e.stopPropagation(); onServiceChange(id, e.target.value); }}
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

                    {isOilJob && <div className="text-xs text-purple-600 font-bold border border-purple-200 bg-purple-50 rounded px-2 py-1 inline-block">💧 精油 (Oil)</div>}

                    {data.isRunning && !isPreview && startObj && (<div className="bg-slate-50 rounded p-2 text-xs text-left space-y-1 mt-2 border border-slate-200 shadow-inner opacity-90"><div className="text-slate-600 font-bold flex justify-between"><span>🕒 開始:</span> <span className="font-mono text-blue-600">{formatTimeStr(startObj)}</span></div>{isCombo && switchObj && <div className="text-slate-500 flex justify-between"><span>⇄ 轉場:</span> <span className="font-mono text-orange-500">{formatTimeStr(switchObj)}</span></div>}<div className="text-slate-600 font-bold flex justify-between"><span>🏁 結束:</span> <span className="font-mono text-green-600">{formatTimeStr(endObj)}</span></div></div>)}
                    {isPreview && (<div className="mt-2 text-xs font-bold text-center">{data.previewType === 'NOW' && <span className="text-red-500 animate-pulse">🔴 該上鐘了 (Start Now)</span>}{data.previewType === 'SOON' && <span className="text-blue-500">🔵 預約即將到來</span>}{data.previewType === 'PHASE2' && <span className="text-orange-500">🟠 轉場準備</span>}</div>)}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 w-full p-2 bg-white z-50 border-t">
                {!data.isRunning || isPreview ? (
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onAction(id, 'start'); }} className={`py-2 rounded font-bold text-white text-sm shadow-md transform active:scale-95 transition-all ${isPreview && data.previewType === 'NOW' ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-green-600 hover:bg-green-700'}`}>開始 (Start)</button>
                        <button onClick={(e) => { e.stopPropagation(); onAction(id, 'cancel'); }} className="py-2 rounded font-bold text-red-600 bg-red-50 border border-red-200 text-sm shadow-sm transform active:scale-95 transition-all">取消 (Cancel)</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onAction(id, 'pause'); }} className={`py-1.5 rounded font-bold text-white text-xs shadow flex items-center justify-center transform active:scale-95 ${data.isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                            {data.isPaused ? '▶ 繼續 (Resume)' : '⏸ 暫停 (Pause)'}
                        </button>
                        {isCombo ? (
                            <button onClick={(e) => { e.stopPropagation(); onSwitch(id, type === 'chair' ? 'bed' : 'chair'); }} className="py-1.5 rounded font-bold text-white bg-orange-500 hover:bg-orange-600 flex items-center justify-center text-xs shadow transform active:scale-95"><i className="fas fa-exchange-alt mr-1"></i> 轉場</button>
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
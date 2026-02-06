/**
 * ============================================================================
 * FILE: js/views.js
 * PHIÊN BẢN: V107.0 (GROUP START & TIMELINE SHIFTER)
 * MÔ TẢ: CÁC COMPONENT HIỂN THỊ CHÍNH (VIEW LAYER)
 * * * LỊCH SỬ CẬP NHẬT V107.0:
 * 1. [BookingControlModal] - GROUP START LOGIC:
 * - Tự động phát hiện khách nhóm (Pax > 1).
 * - Hiển thị 2 nút Start: "Cá nhân" (Individual) và "Toàn nhóm" (Group).
 * 2. [TimelineView] - MANUAL TIME SHIFT:
 * - Thêm nút mũi tên Trái/Phải trên block timeline.
 * - Cho phép dịch chuyển thời gian nhanh (+/- 5 phút) mà không cần kéo thả.
 * 3. [UI/UX] - Z-INDEX ADJUSTMENT:
 * - Hạ Z-index Modal chính xuống 3000 để nhường chỗ cho các Alert/Modal phụ (4000+).
 * * * TÁC GIẢ: AI ASSISTANT & USER
 * ============================================================================
 */

const { useState, useEffect, useMemo, useRef } = React;

// ============================================================================
// 0. BOOKING CONTROL MODAL (SUPER MODAL V107.0)
// Chức năng: Quản lý vòng đời đơn hàng, Context vị trí, Thanh toán & Group Start
// ============================================================================
const BookingControlModal = ({ isOpen, onClose, onAction, booking, meta, liveData, contextResourceId }) => {
    // Validation: Không render nếu thiếu data
    if (!isOpen || !booking) return null;

    // --- STATE MANAGEMENT ---
    const totalDuration = booking.duration || 60;
    
    // State cho Phase (Dành cho Combo - Chia thời gian)
    const initialP1 = meta && meta.phase1_duration !== undefined 
        ? meta.phase1_duration 
        : (totalDuration / 2);
    const [phase1, setPhase1] = useState(initialP1);
    
    // State cho Timer (Đếm ngược real-time)
    const [timeLeft, setTimeLeft] = useState(0);
    const [percent, setPercent] = useState(0);
    const [timerString, setTimerString] = useState("--:--");

    // State chọn dịch vụ mới
    const [selectedService, setSelectedService] = useState(booking.serviceName);

    // State cho Payment Popup (Popup Rẽ nhánh: Chung vs Riêng)
    const [showPaymentOptions, setShowPaymentOptions] = useState(false);

    // --- EFFECTS ---

    // 1. Đồng bộ dữ liệu khi Modal mở ra
    useEffect(() => {
        if (isOpen && booking) {
            const currentP1 = meta && meta.phase1_duration !== undefined 
                ? meta.phase1_duration 
                : (booking.duration / 2);
            setPhase1(currentP1);
            setSelectedService(booking.serviceName);
            setShowPaymentOptions(false); // Luôn reset popup thanh toán
        }
    }, [isOpen, booking, meta]);

    // 2. Real-time Timer Logic
    useEffect(() => {
        if (liveData && liveData.isRunning && !liveData.isPaused && liveData.startTime) {
            const timer = setInterval(() => {
                const start = new Date(liveData.startTime).getTime();
                const now = new Date().getTime();
                const totalMs = totalDuration * 60000;
                const elapsed = now - start;
                
                const leftMins = Math.floor((totalMs - elapsed) / 60000);
                const pct = Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
                
                const leftSeconds = Math.floor(((totalMs - elapsed) % 60000) / 1000);
                const sign = leftMins < 0 ? "-" : "";
                const displayMins = Math.abs(leftMins).toString().padStart(2, '0');
                const displaySecs = Math.abs(leftSeconds).toString().padStart(2, '0');

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

    // --- HANDLERS (XỬ LÝ SỰ KIỆN) ---

    const phase2 = totalDuration - phase1;

    const handleChangeP1 = (val) => {
        let newP1 = parseInt(val) || 0;
        if (newP1 < 0) newP1 = 0;
        if (newP1 > totalDuration) newP1 = totalDuration;
        setPhase1(newP1);
    };

    const handleChangeP2 = (val) => {
        let newP2 = parseInt(val) || 0;
        if (newP2 < 0) newP2 = 0;
        if (newP2 > totalDuration) newP2 = totalDuration;
        setPhase1(totalDuration - newP2);
    };

    // Hàm gửi Action ra App.js
    const triggerAction = (actionType, payload = {}) => {
        const fullPayload = {
            ...payload,
            bookingId: booking.rowId,
            currentBooking: booking,
            resourceId: contextResourceId
        };
        
        console.log(`[BookingControlModal] Triggering: ${actionType}`, fullPayload);
        onAction(actionType, fullPayload);
        
        if (showPaymentOptions) setShowPaymentOptions(false);
    };

    // Xử lý nút "Kết thúc" (Check logic Nhóm)
    const handleFinishRequest = (e) => {
        if(e) e.stopPropagation();
        const pax = parseInt(booking.pax) || 1;
        if (pax > 1) {
            setShowPaymentOptions(true);
        } else {
            triggerAction('FINISH', { scope: 'INDIVIDUAL' });
        }
    };

    const isRunning = liveData && liveData.isRunning;
    const isPaused = liveData && liveData.isPaused;
    const isCombo = booking.category === 'COMBO' || (booking.serviceName && booking.serviceName.includes('Combo')) || (booking.serviceName && booking.serviceName.includes('套餐'));
    
    // Kiểm tra xem đây có phải là khách nhóm không
    const isGroupBooking = (parseInt(booking.pax) || 1) > 1;

    // --- RENDER ---
    // UPDATE V107.0: Hạ z-index xuống 3000 để các modal phụ (SplitStaff) có thể đè lên nếu đặt z-4000
    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            {/* Main Modal Container */}
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-300 flex flex-col max-h-[90vh] relative">
                
                {/* 1. HEADER */}
                <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-4 text-white shrink-0">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="bg-white/20 text-xs px-2 py-0.5 rounded uppercase font-mono tracking-wider">
                                    #{booking.rowId}
                                </span>
                                {contextResourceId && (
                                    <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded uppercase font-bold shadow-sm">
                                        <i className="fas fa-map-marker-alt mr-1"></i>
                                        {contextResourceId.replace('bed-', '身 ').replace('chair-', '足 ')}
                                    </span>
                                )}
                                {isRunning && !isPaused && <span className="bg-green-500 text-xs font-bold px-2 py-0.5 rounded animate-pulse">RUNNING</span>}
                                {isPaused && <span className="bg-yellow-500 text-xs font-bold px-2 py-0.5 rounded">PAUSED</span>}
                                {!isRunning && <span className="bg-gray-500 text-xs font-bold px-2 py-0.5 rounded">WAITING</span>}
                            </div>
                            <h2 className="text-2xl font-black mt-1">{booking.customerName}</h2>
                            <div className="text-white/70 text-sm flex items-center gap-3 mt-1">
                                <span><i className="fas fa-phone-alt mr-1"></i> {booking.sdt || '---'}</span>
                                <span><i className="fas fa-users mr-1"></i> {booking.pax} Pax (Nhóm)</span>
                            </div>
                        </div>
                        <button onClick={onClose} className="bg-white/10 hover:bg-white/30 rounded-full w-10 h-10 flex items-center justify-center transition-all">
                            <i className="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>

                {/* 2. BODY CONTENT */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 bg-slate-50 flex-1">
                    
                    {/* SECTION: TIMER & STAFF INFO */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Cột Trái: Thông tin Staff & Dịch vụ */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">技師 (Staff)</label>
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-2xl font-black text-indigo-800">{booking.serviceStaff || booking.staffId}</div>
                                <button 
                                    onClick={() => triggerAction('SPLIT')}
                                    className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-full font-bold transition-colors border border-blue-200"
                                >
                                    <i className="fas fa-user-plus mr-1"></i> 加人 (Add)
                                </button>
                            </div>

                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">服務項目 (Service)</label>
                            <div className="relative">
                                <select 
                                    value={selectedService}
                                    onChange={(e) => {
                                        setSelectedService(e.target.value);
                                    }}
                                    className="w-full text-lg font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:border-indigo-500"
                                >
                                    {window.SERVICES_LIST.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                                {/* Nút Save Change Service */}
                                {selectedService !== booking.serviceName && (
                                    <button 
                                        onClick={() => triggerAction('CHANGE_SERVICE', { newService: selectedService })}
                                        className="absolute right-1 top-1 bottom-1 bg-indigo-600 text-white text-xs font-bold px-3 rounded hover:bg-indigo-700 animate-pulse"
                                    >
                                        變更
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Cột Phải: Timer */}
                        <div className="bg-slate-800 rounded-xl p-4 text-white relative overflow-hidden flex flex-col justify-center items-center shadow-inner">
                            <div className="absolute bottom-0 left-0 h-1 bg-green-500 transition-all duration-1000 z-0" style={{ width: `${percent}%` }}></div>
                            <div className="z-10 text-center">
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">REMAINING TIME</div>
                                <div className={`text-5xl font-mono font-bold tracking-tighter ${timeLeft < 5 && isRunning ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                                    {timerString}
                                </div>
                                <div className="text-xs text-slate-400 mt-2 font-mono">
                                    TOTAL: {totalDuration} MIN
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECTION: COMBO ADJUSTMENT */}
                    {isCombo && (
                        <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <i className="fas fa-sliders-h text-indigo-500"></i> 套餐時間調整 (Combo Phase)
                                </h3>
                                <button 
                                    onClick={() => triggerAction('UPDATE_PHASE', { phase1 })}
                                    className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded font-bold hover:bg-indigo-100 border border-indigo-200"
                                >
                                    保存時間 (Save Time)
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-8 items-center">
                                <div className="relative">
                                    <label className="block text-xs font-bold text-indigo-600 mb-1 text-center">PHASE 1 (足/身)</label>
                                    <input 
                                        type="number" 
                                        value={phase1}
                                        onChange={(e) => handleChangeP1(e.target.value)}
                                        className="w-full text-center text-3xl font-black text-indigo-900 border-b-2 border-indigo-200 focus:border-indigo-600 focus:outline-none bg-transparent"
                                    />
                                    <span className="block text-center text-xs text-gray-400 mt-1">Minutes</span>
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-bold text-orange-600 mb-1 text-center">PHASE 2 (身/足)</label>
                                    <input 
                                        type="number" 
                                        value={phase2}
                                        onChange={(e) => handleChangeP2(e.target.value)}
                                        className="w-full text-center text-3xl font-black text-orange-900 border-b-2 border-orange-200 focus:border-orange-600 focus:outline-none bg-transparent"
                                    />
                                    <span className="block text-center text-xs text-gray-400 mt-1">Minutes</span>
                                </div>
                            </div>
                            
                            <div className="h-3 w-full bg-gray-200 rounded-full mt-4 flex overflow-hidden">
                                <div className="bg-indigo-500 h-full transition-all" style={{ width: `${(phase1/totalDuration)*100}%` }}></div>
                                <div className="bg-orange-400 h-full transition-all" style={{ width: `${(phase2/totalDuration)*100}%` }}></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. ACTION FOOTER - MODIFIED FOR GROUP START LOGIC (V107.0) */}
                <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                    <div className="grid grid-cols-4 gap-3">
                        
                        {/* LOGIC NÚT START: CHIA 2 TRƯỜNG HỢP */}
                        {!isRunning ? (
                            isGroupBooking ? (
                                // CASE: GROUP BOOKING (Hiện 2 nút)
                                <>
                                    <button 
                                        onClick={() => triggerAction('START', { scope: 'INDIVIDUAL' })}
                                        className="col-span-1 bg-white border-2 border-green-600 text-green-700 hover:bg-green-50 rounded-xl font-bold text-sm shadow-sm flex flex-col items-center justify-center transform active:scale-95 transition-all"
                                    >
                                        <i className="fas fa-play mb-1"></i> 開始(個人)
                                    </button>
                                    <button 
                                        onClick={() => triggerAction('START', { scope: 'GROUP' })}
                                        className="col-span-1 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-200 flex flex-col items-center justify-center transform active:scale-95 transition-all"
                                    >
                                        <i className="fas fa-users mb-1"></i> 開始(全體)
                                    </button>
                                </>
                            ) : (
                                // CASE: INDIVIDUAL (Hiện 1 nút to)
                                <button 
                                    onClick={() => triggerAction('START', { scope: 'INDIVIDUAL' })}
                                    className="col-span-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-green-200 flex items-center justify-center gap-2 transform active:scale-95 transition-all"
                                >
                                    <i className="fas fa-play"></i> 開始 (Start)
                                </button>
                            )
                        ) : (
                            // CASE: PAUSE/RESUME
                            <button 
                                onClick={() => triggerAction('PAUSE')}
                                className={`col-span-2 text-white py-3 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transform active:scale-95 transition-all ${isPaused ? 'bg-green-500' : 'bg-yellow-500 hover:bg-yellow-600'}`}
                            >
                                {isPaused ? <><i className="fas fa-play"></i> 繼續 (Resume)</> : <><i className="fas fa-pause"></i> 暫停 (Pause)</>}
                            </button>
                        )}

                        {/* Nút Finish */}
                        <button 
                            onClick={handleFinishRequest}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 flex flex-col items-center justify-center transform active:scale-95 transition-all"
                        >
                            <i className="fas fa-check-circle text-xl mb-0.5"></i>
                            <span className="text-xs">結帳 (Done)</span>
                        </button>

                         {/* Nút Cancel */}
                         <button 
                            onClick={() => {
                                if(confirm('Bạn có chắc chắn muốn hủy đơn này không? / Are you sure?')) {
                                    triggerAction('CANCEL');
                                }
                            }}
                            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold flex flex-col items-center justify-center transform active:scale-95 transition-all"
                        >
                            <i className="fas fa-trash-alt text-xl mb-0.5"></i>
                            <span className="text-xs">取消 (Cancel)</span>
                        </button>
                    </div>
                </div>

                {/* PAYMENT OPTION OVERLAY (z-index 3010 to overlay the 3000 modal) */}
                {showPaymentOptions && (
                    <div className="absolute inset-0 z-[3010] bg-slate-900/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
                            <div className="bg-indigo-600 p-4 text-center">
                                <h3 className="text-white font-bold text-xl">結帳方式選擇 (Payment Option)</h3>
                                <p className="text-indigo-200 text-sm mt-1">{booking.customerName} ({booking.pax} Pax)</p>
                            </div>
                            <div className="p-6 space-y-4">
                                <button 
                                    onClick={() => triggerAction('FINISH', { scope: 'INDIVIDUAL' })}
                                    className="w-full py-4 bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:bg-indigo-50 rounded-xl flex items-center p-4 transition-all group transform active:scale-95"
                                >
                                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform">
                                        <i className="fas fa-user"></i>
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-slate-800 text-lg">分開結帳 (Individual)</div>
                                        <div className="text-xs text-slate-500">只結算此位客人的費用</div>
                                    </div>
                                </button>

                                <button 
                                    onClick={() => triggerAction('FINISH', { scope: 'GROUP' })}
                                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl flex items-center p-4 shadow-lg hover:shadow-xl hover:from-blue-500 hover:to-indigo-500 transition-all group transform active:scale-95"
                                >
                                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform">
                                        <i className="fas fa-users"></i>
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-white text-lg">團體結帳 (Group Pay)</div>
                                        <div className="text-xs text-blue-100">結算全體 {booking.pax} 位客人的總費用</div>
                                    </div>
                                </button>
                            </div>
                            <div className="bg-slate-50 p-3 text-center border-t border-slate-200">
                                <button onClick={() => setShowPaymentOptions(false)} className="text-slate-500 hover:text-slate-700 text-sm font-bold underline">
                                    取消 (Cancel / Back)
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// ============================================================================
// 1. TIMELINE VIEW (Biểu đồ Gantt) - UPDATE V107.0 (SHIFT BUTTONS)
// Chức năng: Hiển thị và điều chỉnh lịch
// ============================================================================
const TimelineView = ({ timelineData, onEditPhase, liveStatusData }) => { 
    const [controlModalOpen, setControlModalOpen] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [selectedMeta, setSelectedMeta] = useState(null);
    const [selectedLiveData, setSelectedLiveData] = useState(null);
    const [selectedResourceId, setSelectedResourceId] = useState(null);

    // Sync Logic
    useEffect(() => {
        if (controlModalOpen && selectedResourceId && liveStatusData) {
            const currentSlotData = liveStatusData[selectedResourceId];
            if (currentSlotData && selectedBooking && currentSlotData.booking && String(currentSlotData.booking.rowId) === String(selectedBooking.rowId)) {
                setSelectedLiveData({
                    ...currentSlotData,
                    resourceId: selectedResourceId
                });
            }
        }
    }, [liveStatusData, controlModalOpen, selectedResourceId, selectedBooking]);


    // Config
    const startHour = 8;
    const endHour = 27; 
    const hours = Array.from({length: endHour - startHour + 1}, (_, i) => i + startHour);
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
        ...Array.from({length:6}, (_,i) => ({id: `chair-${i+1}`, label: `足 ${i+1}`, type: 'chair'})),
        ...Array.from({length:6}, (_,i) => ({id: `bed-${i+1}`, label: `身 ${i+1}`, type: 'bed'}))
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

    // HANDLER: OPEN CONTROL
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

    // HANDLER: DISPATCH
    const handleControlAction = (actionType, payload) => {
        if (onEditPhase) {
            onEditPhase(actionType, payload);
        }
        if (['CANCEL', 'FINISH', 'UPDATE_PHASE'].includes(actionType)) {
            setControlModalOpen(false);
        }
    };

    // HANDLER: MANUAL TIME SHIFT (NEW V107.0)
    // Dịch thời gian +/- 5 phút
    const handleShiftTime = (e, booking, resourceId, direction) => {
        e.stopPropagation(); // QUAN TRỌNG: Chặn mở modal
        if (onEditPhase) {
            // Gửi action SHIFT_TIME với direction (-1 là sớm hơn, 1 là trễ hơn)
            // Trong App.js bạn cần xử lý case 'SHIFT_TIME':
            // newStart = currentStart + (direction * 5 phút)
            onEditPhase('SHIFT_TIME', { 
                bookingId: booking.rowId, 
                currentBooking: booking,
                resourceId: resourceId,
                direction: direction * 5 
            });
        }
    };

    const safeData = timelineData || {};

    return (
        <div className="bg-white rounded shadow border border-slate-200 h-[calc(100vh-170px)] overflow-x-scroll overflow-y-auto relative custom-scrollbar pb-2">
            <style>{`
                /* CSS Scrollbar & Animation */
                .custom-scrollbar::-webkit-scrollbar:horizontal { height: 25px !important; }
                .custom-scrollbar::-webkit-scrollbar:vertical { width: 14px !important; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #94a3b8; border-radius: 20px; border: 4px solid #f1f5f9; background-clip: content-box; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #64748b; }
                .custom-scrollbar::-webkit-scrollbar-corner { background: #f1f5f9; }
                
                .edit-btn { opacity: 0; transition: opacity 0.2s, transform 0.1s; }
                .timeline-block:hover .edit-btn { opacity: 1; }
                .edit-btn:hover { transform: scale(1.1); background-color: rgba(255,255,255,0.9) !important; color: #4f46e5 !important; border-color: #6366f1; }
                
                /* New Shift Buttons Style */
                .shift-controls { opacity: 0; transition: opacity 0.2s; }
                .timeline-block:hover .shift-controls { opacity: 1; }
                .shift-btn:hover { background-color: rgba(255,255,255,0.9); color: #000; transform: scale(1.2); }

                .bf-indicator { animation: pulse-border 2s infinite; }
                @keyframes pulse-border {
                    0% { border-color: #4f46e5; box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
                    70% { border-color: #818cf8; box-shadow: 0 0 0 4px rgba(79, 70, 229, 0); }
                    100% { border-color: #4f46e5; box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
                }
            `}</style>

            <BookingControlModal 
                isOpen={controlModalOpen}
                onClose={() => setControlModalOpen(false)}
                onAction={handleControlAction}
                booking={selectedBooking}
                meta={selectedMeta}
                liveData={selectedLiveData}
                contextResourceId={selectedResourceId} 
            />

            <div style={{ width: `${TOTAL_WIDTH}px`, minWidth: '100%' }}>
                {/* HEADER */}
                <div className="flex sticky top-0 z-30 bg-slate-100 border-b border-slate-300 shadow-md h-[45px]">
                    <div className="sticky left-0 top-0 z-40 bg-[#e2e8f0] border-r border-slate-300 flex items-center justify-center font-extrabold text-slate-700 text-sm shadow-[2px_0_5px_rgba(0,0,0,0.1)]" 
                         style={{ width: `${LEFT_COL_WIDTH}px`, height: `${HEADER_HEIGHT}px` }}>
                        區域
                    </div>
                    <div className="flex bg-slate-50">
                        {hours.map(h => (
                            <div key={h} className="shrink-0 border-r border-slate-300 flex items-center justify-center text-slate-500 font-bold text-xs" 
                                 style={{width: `${HOUR_WIDTH}px`, height: `${HEADER_HEIGHT}px`}}>
                                {formatHour(h)}
                            </div>
                        ))}
                    </div>
                </div>

                {/* BODY */}
                <div className="relative bg-white pb-4">
                    {rows.map((row, index) => {
                        const isLastChairRow = index === 5;
                        const rowStyleClass = isLastChairRow ? "border-b-4 border-red-500" : "border-b border-slate-100"; 

                        return (
                            <div key={row.id} className={`flex relative transition-colors hover:bg-slate-50 ${rowStyleClass}`} style={{ height: `${ROW_HEIGHT}px` }}>
                                <div className={`sticky left-0 z-20 shrink-0 border-r border-slate-300 flex items-center justify-center font-bold text-sm shadow-[2px_0_5px_rgba(0,0,0,0.05)] ${row.type === 'chair' ? 'bg-teal-50 text-teal-800' : 'bg-purple-50 text-purple-800'}`}
                                     style={{ width: `${LEFT_COL_WIDTH}px` }}>
                                    {row.label}
                                </div>
                                
                                <div className="relative flex-1 h-full">
                                    <div className="absolute inset-0 flex pointer-events-none z-0">
                                        {hours.map(h => (
                                            <div key={h} className="shrink-0 border-r border-slate-200 h-full border-dashed" style={{width: `${HOUR_WIDTH}px`}}></div>
                                        ))}
                                    </div>

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
                                        const deadlineText = `⏳ ${duration}p ➔ ${endTimeStr}`;

                                        const isRunning = slot.meta && slot.meta.isRunning;
                                        const isBodyFirst = slot.meta && slot.meta.sequence === 'BF';
                                        
                                        let specialBorderClass = "border border-black/5";
                                        if (isRunning) {
                                            specialBorderClass = "border-2 border-red-600 shadow-md shadow-red-200 z-20";
                                        } else if (isBodyFirst) {
                                            specialBorderClass = "border-l-[6px] border-l-indigo-700 bf-indicator shadow-indigo-200";
                                        }

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
                                                 style={{left: `${leftPos}px`, width: `${width}px`}}
                                                 title={`${slot.booking.serviceName}\n${isRunning ? '🔥 Running' : ''}`}
                                            >
                                                <div className="font-bold truncate text-[11px] leading-tight flex justify-between items-center">
                                                    <span className="flex items-center gap-1">
                                                        {label} {comboIcon}
                                                        {isBodyFirst && <span className="text-[10px] bg-indigo-600 text-white px-1 rounded-sm animate-pulse" title="Body First">🔀BF</span>}
                                                    </span>
                                                </div>

                                                <div className={`text-[10px] font-mono font-bold text-slate-700 bg-white/40 rounded px-1 mt-0.5 truncate border border-black/5 ${isRunning ? 'bg-red-50 text-red-700 border-red-100' : ''}`}>
                                                    {slot.meta && slot.meta.isCombo 
                                                        ? (slot.meta.phase === 1 ? deadlineText : `🏁 ${startTimeStr} ➔ (${duration}p)`) 
                                                        : deadlineText}
                                                </div>

                                                <div className="truncate opacity-75 text-[9px] flex items-center gap-1 mt-0.5">
                                                    {(slot.booking.isOil || (slot.booking.serviceName && slot.booking.serviceName.includes('油'))) && <span title="Oil">💧</span>}
                                                    {(slot.booking.category === 'COMBO') && <span title="Combo">🔥</span>}
                                                    <span>{slot.booking.serviceName}</span>
                                                </div>

                                                {/* Button Open Modal */}
                                                {showControlBtn && (
                                                    <button 
                                                        className="edit-btn absolute top-0.5 right-0.5 w-6 h-6 bg-white text-gray-400 rounded-full flex items-center justify-center shadow-md border border-gray-200 z-50 hover:text-indigo-600 hover:border-indigo-300 transform active:scale-95"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenControl(slot.booking, slot.meta, row.id); 
                                                        }}
                                                        title="Control Center"
                                                    >
                                                        <i className="fas fa-cog text-[12px] animate-spin-hover"></i>
                                                    </button>
                                                )}

                                                {/* NEW V107.0: TIMELINE SHIFT ARROWS (Left/Right) */}
                                                {/* Chỉ hiện khi Hover */}
                                                <div className="shift-controls absolute bottom-0.5 right-0.5 flex gap-1 z-[60]">
                                                    <button 
                                                        onClick={(e) => handleShiftTime(e, slot.booking, row.id, -1)}
                                                        className="shift-btn w-5 h-5 rounded bg-black/20 text-white flex items-center justify-center text-[10px] backdrop-blur-sm"
                                                        title="Sớm 5 phút (-5m)"
                                                    >
                                                        <i className="fas fa-chevron-left"></i>
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleShiftTime(e, slot.booking, row.id, 1)}
                                                        className="shift-btn w-5 h-5 rounded bg-black/20 text-white flex items-center justify-center text-[10px] backdrop-blur-sm"
                                                        title="Trễ 5 phút (+5m)"
                                                    >
                                                        <i className="fas fa-chevron-right"></i>
                                                    </button>
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
// 2. COMMISSION VIEW - (STABLE - NO CHANGE)
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
// 3. REPORT VIEW - (STABLE - NO CHANGE)
// ============================================================================
const ReportView = ({ bookings }) => {
    const safeBookings = Array.isArray(bookings) ? bookings : [];
    
    const processedStats = useMemo(() => {
        let revenue = 0; let guests = 0;
        safeBookings.forEach(b => {
            if (b.status && b.status.includes('取消')) return;
            const pax = parseInt(b.pax, 10) || 1;
            for(let i=0; i<6; i++) {
                const statusKey = `Status${i+1}`;
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
                                const staffList = [ b.serviceStaff, b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6 ];
                                
                                for (let k = 0; k < 6; k++) {
                                    const statusKey = `Status${k+1}`;
                                    const isSingleDone = (b[statusKey] && (b[statusKey].includes('完成') || b[statusKey].includes('Done')));
                                    const isAllDone = (b.status && (b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅')));
                                    
                                    if (isSingleDone || (isAllDone && k < pax)) {
                                        const unitPrice = window.getPrice(b.serviceName); 
                                        const oilPrice = window.getOilPrice(b.isOil || (b.serviceName && b.serviceName.includes('油'))); 
                                        const singlePrice = unitPrice + oilPrice;
                                        let staffName = staffList[k] || b.serviceStaff || b.staffId || '隨機';
                                        
                                        rows.push(
                                            <tr key={`${b.rowId}-${k}`}>
                                                <td className="p-3 font-mono">{(b.startTimeString||' ').split(' ')[1]}</td>
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
// 4. RESOURCE CARD - (STABLE - NO CHANGE)
// ============================================================================
const ResourceCard = ({ id, type, index, data, busyStaffIds, onAction, onSelect, onSwitch, onToggleMax, onToggleSequence, onServiceChange, onStaffChange, onSplit, staffList, getGroupMemberIndex }) => {
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
                const elapsed = now - start;
                const totalLeft = Math.floor((totalMs - elapsed) / 60000);
                
                setTimeLeft(totalLeft); 
                setPercent(Math.min(100, Math.max(0, (elapsed / totalMs) * 100)));
                
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
                    
                    if (elapsed < phase1Ms) {
                        const left = Math.floor((phase1Ms - elapsed) / 60000);
                        setPhaseTimeLeft(left);
                        if (sequence === 'FB') {
                            setPhaseLabel('👣 足部 (Phase 1)');
                        } else {
                            setPhaseLabel('🛏️ 身體 (Phase 1)'); 
                        }
                    } else {
                        setPhaseTimeLeft(totalLeft);
                        if (sequence === 'FB') {
                            setPhaseLabel('🛏️ 身體 (Phase 2)');
                        } else {
                            setPhaseLabel('👣 足部 (Phase 2)'); 
                        }
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
    
    let staffDisplay = '';
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

    const isOilJob = isOccupied && (data.booking.isOil || (data.booking.serviceName && (data.booking.serviceName.includes('油') || data.booking.serviceName.includes('Oil'))));
    const isCombo = isOccupied && (data.booking.category === 'COMBO' || (data.booking.serviceName && data.booking.serviceName.includes('套餐')));
    const flexMinutes = isCombo && data.comboMeta && data.comboMeta.flex ? data.comboMeta.flex : 0;
    const formatTimeStr = (iso) => { if(!iso) return '--:--'; const d = new Date(iso); return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; }
    
    let startObj = null, endObj = null, switchObj = null;
    let splitText = '';
    let isBodyFirst = false;

    if(isOccupied && data.isRunning && data.startTime) {
        startObj = new Date(data.startTime);
        endObj = new Date(startObj.getTime() + (data.booking.duration || 60) * 60000);
        
        if(isCombo) {
            const seq = (data.comboMeta && data.comboMeta.sequence) || 'FB';
            isBodyFirst = seq === 'BF';
            const customPhase1 = data.booking.phase1_duration;
            const split = window.getComboSplit(data.booking.duration, data.isMaxMode, seq, customPhase1);
            
            switchObj = new Date(startObj.getTime() + (split.phase1 + flexMinutes) * 60000);
            
            if (isBodyFirst) {
                splitText = `(🔀 🛏️先做身體:${split.phase1}p ➜ 👣足:${split.phase2}p)`;
            } else {
                splitText = `(👣先做足部:${split.phase1}p ➜ 🛏️身:${split.phase2}p)`;
            }
            if (split.isElastic) {
                splitText += ' ⚡';
            }
        }
    }

    if (!isOccupied) {
        return (
            <div className={`res-card h-72 flex flex-col border-2 ${statusColor} relative`}>
                <div className="flex justify-between items-center p-2 border-b border-black/5 bg-black/5"><span className="font-black text-xs text-gray-500 uppercase">{type} {index}</span></div>
                <div className="flex-1 p-2 relative flex flex-col justify-center text-center"><button onClick={onSelect} className="w-full h-full flex flex-col items-center justify-center text-gray-300 hover:text-green-600 transition-colors group"><i className="fas fa-plus text-5xl"></i><span className="text-sm font-bold mt-2">排入 (Assign)</span></button></div>
            </div>
        );
    }
    
    const bfBadgeStyle = isBodyFirst 
        ? "bg-indigo-600 text-white animate-pulse shadow-lg ring-2 ring-indigo-300"
        : "hidden";

    return (
        <div 
            className={`res-card h-72 flex flex-col border-2 ${statusColor} relative`}
        >
            <div className="flex justify-between items-center p-2 border-b border-black/5 bg-black/5">
                <span className="font-black text-xs text-gray-500 uppercase">{type} {index}</span>
                {data.isRunning && !isPreview && (<div className={`text-xs font-mono font-bold ${timeLeft < 0 ? 'text-red-600 animate-pulse' : 'text-green-700'}`}>{timeLeft}m</div>)}
                {isPreview && data.timeToStart !== undefined && (<div className="text-xs font-bold text-blue-600 bg-blue-100 px-1 rounded">{data.previewType === 'NOW' ? 'NOW' : `${data.timeToStart}m`}</div>)}
            </div>

            <div className="flex-1 p-2 relative flex flex-col justify-center text-center pb-12">
                {data.isRunning && !isPreview && (
                    <>
                        <div className="absolute bottom-0 left-0 h-1 bg-green-500 progress-bar z-0 transition-all duration-1000" style={{width: `${percent}%`}}></div>
                        {isCombo && switchPercent && (
                            <div className="absolute bottom-0 h-2 w-1 bg-orange-500 z-10 border-l border-white" style={{left: `${switchPercent}%`}} title="Transition Point"></div>
                        )}
                    </>
                )}

                <div className="z-10 relative flex flex-col gap-2">
                    <div className="absolute -top-12 right-0 z-40 bg-white border-2 border-slate-200 rounded-lg shadow-sm px-3 py-1 flex items-center gap-2">
                        <div className="text-xl font-black text-slate-800 text-center">{staffDisplay || <span className="text-gray-300 text-xs">Waiting</span>}</div>
                        <button onClick={(e) => { e.stopPropagation(); onSplit(id); }} className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 text-xs shadow-sm transition-transform hover:scale-110" title="Split / Add Staff"><i className="fas fa-user-plus"></i></button>
                    </div>

                    {isCombo && (
                        <div className="absolute -top-12 left-0 flex gap-1 items-center">
                            <button onClick={(e) => { e.stopPropagation(); onToggleSequence(id); }} 
                                    className={`text-xs font-bold px-2 py-1 rounded shadow z-50 transition-colors flex items-center gap-1 ${isBodyFirst ? 'bg-indigo-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`} 
                                    title={isBodyFirst ? "Đang xếp: BODY trước" : "Đang xếp: FOOT trước"}>
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
                        className="text-sm font-bold text-gray-500 text-center bg-transparent border-b border-dashed border-gray-300 focus:outline-none w-full truncate cursor-pointer hover:bg-gray-50" 
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

                    {isCombo && data.isRunning && phaseLabel && (<div className={`text-sm font-black p-2 rounded border bg-white/80 ${phaseLabel.includes('足') ? 'text-emerald-700 border-emerald-200' : 'text-purple-700 border-purple-200'}`}>{phaseLabel} {flexMinutes>0 && <span className="text-xs text-orange-500 bg-orange-100 px-1 rounded ml-1">+{flexMinutes}m</span>} <div className="text-xl font-mono mt-1">{phaseTimeLeft}分</div></div>)}
                    {isCombo && data.isRunning && data.comboMeta && data.comboMeta.targetId && (<div className="text-[10px] text-gray-400">➜ 轉: {data.comboMeta.targetId.toUpperCase()}</div>)}
                    
                    {isOilJob && <div className="text-xs text-purple-600 font-bold border border-purple-200 bg-purple-50 rounded px-2 py-1 inline-block">💧 精油 (Oil)</div>}
                    
                    {data.isRunning && !isPreview && startObj && (<div className="bg-slate-50 rounded p-2 text-xs text-left space-y-1 mt-2 border border-slate-200 shadow-inner opacity-90"><div className="text-slate-600 font-bold flex justify-between"><span>🕒 開始:</span> <span className="font-mono text-blue-600">{formatTimeStr(startObj)}</span></div>{isCombo && switchObj && <div className="text-slate-500 flex justify-between"><span>⇄ 轉場:</span> <span className="font-mono text-orange-500">{formatTimeStr(switchObj)}</span></div>}<div className="text-slate-600 font-bold flex justify-between"><span>🏁 結束:</span> <span className="font-mono text-green-600">{formatTimeStr(endObj)}</span></div></div>)}
                    {isPreview && (<div className="mt-2 text-xs font-bold text-center">{data.previewType === 'NOW' && <span className="text-red-500 animate-pulse">🔴 該上鐘了 (Start Now)</span>}{data.previewType === 'SOON' && <span className="text-blue-500">🔵 預約即將到來</span>}{data.previewType === 'PHASE2' && <span className="text-orange-500">🟠 轉場準備</span>}</div>)}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 w-full p-2 bg-white z-50 border-t">
                {!data.isRunning || isPreview ? (
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={(e)=>{ e.stopPropagation(); onAction(id, 'start'); }} 
                            className={`py-2 rounded font-bold text-white text-sm shadow-md transform active:scale-95 transition-all ${isPreview && data.previewType==='NOW' ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-green-600 hover:bg-green-700'}`}
                        >
                            開始 (Start)
                        </button>
                        <button 
                            onClick={(e)=>{ e.stopPropagation(); onAction(id, 'cancel'); }} 
                            className="py-2 rounded font-bold text-red-600 bg-red-50 border border-red-200 text-sm shadow-sm transform active:scale-95 transition-all"
                        >
                            取消 (Cancel)
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={(e)=>{ e.stopPropagation(); onAction(id, 'pause'); }} 
                            className={`py-1.5 rounded font-bold text-white text-xs shadow flex items-center justify-center transform active:scale-95 ${data.isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
                        >
                            {data.isPaused ? '▶ 繼續' : '⏸ 暫停'}
                        </button>
                        
                        {isCombo ? (
                            <button 
                                onClick={(e)=>{ e.stopPropagation(); onSwitch(id, type==='FOOT'?'bed':'chair'); }} 
                                className="py-1.5 rounded font-bold text-white bg-orange-500 hover:bg-orange-600 flex items-center justify-center text-xs shadow transform active:scale-95"
                            >
                                <i className="fas fa-exchange-alt mr-1"></i> 轉場
                            </button>
                        ) : (<div className="hidden"></div>)}
                        
                        <button 
                            onClick={(e)=>{ e.stopPropagation(); onAction(id, 'finish'); }} 
                            className="py-1.5 rounded font-bold text-white bg-blue-600 hover:bg-blue-700 text-xs shadow flex items-center justify-center transform active:scale-95"
                        >
                            <i className="fas fa-check-square mr-1"></i> 結帳
                        </button>
                        
                        <button 
                            onClick={(e)=>{ e.stopPropagation(); onAction(id, 'cancel_midway'); }} 
                            className="py-1.5 rounded font-bold text-white bg-red-500 hover:bg-red-600 text-xs shadow flex items-center justify-center transform active:scale-95"
                        >
                            <i className="fas fa-times-circle mr-1"></i> 棄單
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
window.ResourceCard = ResourceCard;
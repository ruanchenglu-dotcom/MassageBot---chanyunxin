/**
 * ============================================================================
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V59 (Robust Connection Fix)
 * NGÀY CẬP NHẬT: 2026-01-09
 * * * * * TÍNH NĂNG CỐT LÕI:
 * 1. [FIX] Cơ chế kết nối Core an toàn hơn (Retry Logic).
 * 2. [BRIDGE] Cầu nối dữ liệu UI <-> Core Logic.
 * 3. [SCANNER] Quét thời gian trống bằng Core.
 * ============================================================================
 */

(function() {
    console.log("🚀 BookingHandler V59: Đang khởi động...");

    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL: React chưa tải.");
        return;
    }

    // --- KẾT NỐI CORE LOGIC AN TOÀN ---
    const getCore = () => {
        // Tìm kiếm Core ở mọi ngóc ngách có thể trong window
        return window.ResourceCore || 
               (window.checkRequestAvailability ? { 
                   checkRequestAvailability: window.checkRequestAvailability, 
                   setDynamicServices: window.setDynamicServices 
               } : null);
    };

    const { useState, useEffect, useMemo, useCallback } = React;

    const SHOP_UI_CONFIG = {
        HOURS_LIST: ['08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','00','01','02'],
        MINUTES_STEP: ['00', '10', '20', '30', '40', '50'],
        OPEN_HOUR: 8
    };

    // --- DATA ADAPTERS ---

    const syncServicesToCore = (coreApi) => {
        if (!coreApi || !coreApi.setDynamicServices) return;
        const rawServices = window.SERVICES_DATA || {};
        const formattedServices = {};
        Object.keys(rawServices).forEach(key => {
            const svc = rawServices[key];
            formattedServices[key] = {
                name: svc.name || key,
                duration: parseInt(svc.duration) || 60,
                type: svc.type ? svc.type.toUpperCase() : 'BODY',
                category: svc.category || 'SINGLE',
                price: svc.price || 0
            };
        });
        coreApi.setDynamicServices(formattedServices);
    };

    const adaptBookingsForCore = (rawBookings, targetDateStr) => {
        if (!Array.isArray(rawBookings)) return [];
        const targetDateStandard = targetDateStr.replace(/-/g, '/');
        return rawBookings.filter(b => {
            if (!b || !b.startTimeString) return false;
            if (b.status && (b.status.includes('hủy') || b.status.includes('Cancel'))) return false;
            const bDatePart = b.startTimeString.split(' ')[0].replace(/-/g, '/');
            return bDatePart === targetDateStandard;
        }).map(b => ({
            serviceCode: b.serviceName,
            serviceName: b.serviceName,
            startTime: b.startTimeString.split(' ')[1] || "00:00",
            duration: b.duration || 60,
            staffName: b.technician || b.staffId || "Unassigned"
        }));
    };

    const adaptGuestsForCore = (uiGuestDetails) => {
        return uiGuestDetails.map(g => ({
            serviceCode: g.service,
            staffName: g.staff === '隨機' ? 'RANDOM' : 
                       (g.staff === '女' || g.staff === 'FEMALE_OIL') ? 'FEMALE' : 
                       (g.staff === '男') ? 'MALE' : g.staff
        }));
    };

    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList) => {
        // Cố gắng lấy Core ngay tại thời điểm gọi (Lazy Load)
        const coreApi = getCore();

        if (!coreApi || !coreApi.checkRequestAvailability) {
            console.error("❌ Vẫn không tìm thấy Resource Core!");
            return { valid: false, reason: "⚠️ Lỗi hệ thống: File 'resource_core.js' chưa được tải. Vui lòng tải lại trang." };
        }

        syncServicesToCore(coreApi);

        const coreGuests = adaptGuestsForCore(guests);
        const coreBookings = adaptBookingsForCore(bookings, date);
        const staffMap = {};
        
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = String(s.id).trim();
                staffMap[sId] = {
                    start: s.shiftStart || "00:00",
                    end: s.shiftEnd || "00:00",
                    off: (String(s.offDays).includes(date) || String(s[date]||"").toUpperCase().includes('OFF'))
                };
                if (s.name) staffMap[s.name] = staffMap[sId];
            });
        }

        try {
            const result = coreApi.checkRequestAvailability(date, time, coreGuests, coreBookings, staffMap);
            return result.feasible ? { valid: true, details: result.details } : { valid: false, reason: result.reason };
        } catch (err) {
            console.error("🔥 Core Crash:", err);
            return { valid: false, reason: "Lỗi logic: " + err.message };
        }
    };

    const forceGlobalRefresh = () => {
        if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender();
        else window.location.reload(); 
    };

    // ==================================================================================
    // 3. COMPONENT: PHONE BOOKING MODAL
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);

        const defaultService = (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) ? window.SERVICES_LIST[2] : "Body Massage";

        const [form, setForm] = useState({
            date: initialDate || new Date().toISOString().slice(0, 10), 
            time: "12:00", pax: 2, custName: '', custPhone: ''
        });

        const [guestDetails, setGuestDetails] = useState([
            { service: defaultService, staff: '隨機', isOil: false },
            { service: defaultService, staff: '隨機', isOil: false }
        ]);

        const handleTimeChange = useCallback((type, value) => {
            setForm(prev => {
                const parts = (prev.time || "12:00").split(':');
                const h = type === 'HOUR' ? value : parts[0];
                const m = type === 'MINUTE' ? value : parts[1];
                return { ...prev, time: `${h}:${m}` };
            });
            setCheckResult(null); setSuggestions([]);
        }, []);

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
            setForm(prev => ({ ...prev, pax: num }));
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const newDetails = [...prev];
                if (num > prev.length) { 
                    for (let i = prev.length; i < num; i++) newDetails.push({ service: prev[0]?.service || defaultService, staff: '隨機', isOil: false }); 
                } else { newDetails.length = num; }
                return newDetails;
            });
        };

        const handleGuestUpdate = (index, field, value) => {
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const copy = [...prev];
                const current = { ...copy[index] };
                if (field === 'service') {
                    current.service = value;
                    if (value && (value.includes('足') || value.includes('Foot'))) current.isOil = false;
                } else if (field === 'staff') {
                    if (value === 'FEMALE_OIL') { current.staff = '女'; current.isOil = true; }
                    else if (value === '女') { current.staff = '女'; current.isOil = false; }
                    else { current.staff = value; current.isOil = false; }
                }
                copy[index] = current;
                return copy;
            });
        };

        const performCheck = (e) => {
            if (e) e.preventDefault(); 
            const result = callCoreAvailabilityCheck(form.date, form.time, guestDetails, safeBookings, safeStaffList);
            
            if (result.valid) { 
                setCheckResult({ status: 'OK', message: "✅ Core: Có thể đặt (Available)" }); 
                setSuggestions([]); 
            } else {
                setCheckResult({ status: 'FAIL', message: result.reason });
                
                // --- SCANNER LOGIC ---
                // Chỉ chạy scanner nếu lỗi không phải do hệ thống (file missing)
                if (!result.reason.includes("hệ thống")) {
                    const foundSuggestions = [];
                    const parts = form.time.split(':').map(Number);
                    let currentTotalMins = (parts[0]||0) * 60 + (parts[1]||0);
                    
                    for (let i = 1; i <= 24; i++) { 
                        const nextMins = currentTotalMins + (i * 10);
                        let h = Math.floor(nextMins / 60); 
                        let m = nextMins % 60;
                        if (h >= 24) h -= 24; 
                        
                        const nextTimeStr = `${h.toString().padStart(2,'0')}:${(Math.floor(m / 10) * 10).toString().padStart(2,'0')}`;
                        const scanRes = callCoreAvailabilityCheck(form.date, nextTimeStr, guestDetails, safeBookings, safeStaffList);
                        if (scanRes.valid) { 
                            foundSuggestions.push(nextTimeStr); 
                            if (foundSuggestions.length >= 4) break; 
                        }
                    }
                    setSuggestions(foundSuggestions);
                }
            }
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault();
            if (isSubmitting) return; 
            if (!form.custName.trim()) { alert("⚠️ Nhập tên khách!"); return; }

            setIsSubmitting(true);
            try {
                const serviceSummary = guestDetails.map(g => g.service).filter((v, i, a) => a.indexOf(v) === i).join(', ');
                const oilNotes = guestDetails.map((g, i) => g.isOil ? `K${i+1}:油推` : null).filter(Boolean).join(',');
                
                const payload = {
                    hoTen: form.custName, sdt: form.custPhone || "", dichVu: serviceSummary, pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: guestDetails[0].staff, isOil: guestDetails[0].isOil,
                    staffId2: guestDetails[1]?.staff || null, staffId3: guestDetails[2]?.staff || null, 
                    staffId4: guestDetails[3]?.staff || null, staffId5: guestDetails[4]?.staff || null, 
                    staffId6: guestDetails[5]?.staff || null,
                    ghiChu: oilNotes ? `(${oilNotes})` : "", guestDetails: guestDetails
                };

                console.log("💾 Saving Phone Booking:", payload);
                if (onSave) {
                    await Promise.resolve(onSave(payload));
                    forceGlobalRefresh();
                    setTimeout(() => { onClose(); setIsSubmitting(false); }, 500);
                }
            } catch (err) {
                alert("Lỗi lưu: " + err.message);
                setIsSubmitting(false);
            }
        };

        const [currentHour, currentMinute] = (form.time || "12:00").split(':');

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
                    <div className="bg-[#0891b2] p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">📅 電話預約 (Core V59)</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>

                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500">Date</label>
                                        <input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form, date:e.target.value}); setCheckResult(null);}}/>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500">Time</label>
                                        <div className="flex items-center gap-1">
                                            <div className="relative flex-1">
                                                <select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={currentHour} onChange={(e) => handleTimeChange('HOUR', e.target.value)}>
                                                    {SHOP_UI_CONFIG.HOURS_LIST.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                            <span className="font-bold">:</span>
                                            <div className="relative flex-1">
                                                <select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={currentMinute} onChange={(e) => handleTimeChange('MINUTE', e.target.value)}>
                                                    {SHOP_UI_CONFIG.MINUTES_STEP.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="text-xs font-bold text-gray-500">Pax</label>
                                    <select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>
                                        {[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} 位</option>)}
                                    </select>
                                </div>

                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">Details</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                                <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(idx, 'service', e.target.value)}>
                                                    {(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={selectValue} onChange={e=>handleGuestUpdate(idx, 'staff', e.target.value)}>
                                                    <option value="隨機">🎲 Random</option>
                                                    <option value="女">🚺 Female</option>
                                                    <option value="FEMALE_OIL">🚺 F+Oil</option>
                                                    <option value="男">🚹 Male</option>
                                                    <optgroup label="Staff">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup>
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div>
                                    {!checkResult ? (
                                        <button onClick={performCheck} className="w-full bg-cyan-600 text-white p-3 rounded font-bold shadow-lg hover:bg-cyan-700 transition">🔍 Check Availability</button>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {checkResult.message}
                                            </div>
                                            {checkResult.status === 'FAIL' && suggestions.length > 0 && (
                                                <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                                                    <div className="text-xs font-bold text-yellow-700 mb-2">💡 Suggestions:</div>
                                                    <div className="flex gap-2 flex-wrap">
                                                        {suggestions.map(t=><button key={t} onClick={()=>{setForm(f=>({...f, time:t})); setCheckResult(null); setSuggestions([]);}} className="px-3 py-1 bg-white border border-yellow-300 text-yellow-800 rounded font-bold hover:bg-yellow-100">{t}</button>)}
                                                    </div>
                                                </div>
                                            )}
                                            {checkResult.status === 'OK' ? (
                                                <button onClick={()=>setStep('INFO')} className="w-full bg-emerald-600 text-white p-3 rounded font-bold shadow-lg animate-pulse hover:bg-emerald-700">➡️ Next Step</button>
                                            ) : (
                                                <button onClick={()=>{setCheckResult(null); setSuggestions([])}} className="w-full bg-gray-400 text-white p-3 rounded font-bold hover:bg-gray-500">🔄 Retry</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-green-50 p-3 rounded border border-green-200 text-green-800 font-bold">
                                    <div className="flex justify-between"><span>{form.date}</span><span>{form.time}</span></div>
                                    <div className="text-sm font-normal mt-1">{form.pax} Pax - {guestDetails[0].service}...</div>
                                </div>
                                <input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custName} onChange={e => setForm({...form, custName: e.target.value})} placeholder="Customer Name..." disabled={isSubmitting} />
                                <input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custPhone} onChange={e => setForm({...form, custPhone: e.target.value})} placeholder="Phone (Optional)..." disabled={isSubmitting} />
                                <div className="flex gap-2 pt-2">
                                    <button onClick={(e)=>{ e.preventDefault(); if(!isSubmitting) setStep('CHECK'); }} className="flex-1 bg-gray-200 p-3 rounded font-bold text-gray-700 hover:bg-gray-300" disabled={isSubmitting}>⬅️ Back</button>
                                    <button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "✅ Confirm"}</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 4. COMPONENT: WALK-IN MODAL (SAME FIX APPLIED)
    // ==================================================================================
    const NewWalkInModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [waitSuggestion, setWaitSuggestion] = useState(null); 
        const [isSubmitting, setIsSubmitting] = useState(false); 

        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2,'0');
        let currentMin = Math.ceil(now.getMinutes() / 10) * 10;
        let startHour = parseInt(currentHour);
        if (currentMin >= 60) { currentMin = 0; startHour += 1; }
        const currentTimeStr = `${startHour.toString().padStart(2,'0')}:${currentMin === 0 ? '00' : currentMin}`;
        const todayStr = initialDate || now.toISOString().slice(0, 10);
        
        const defaultService = (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) ? window.SERVICES_LIST[2] : "Body Massage";

        const [form, setForm] = useState({ pax: 1, custName: '現場客', custPhone: '', time: currentTimeStr, date: todayStr });
        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
            setForm(prev => ({ ...prev, pax: num }));
            setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const newDetails = [...prev];
                if (num > prev.length) for (let i = prev.length; i < num; i++) newDetails.push({ service: prev[0]?.service, staff: '隨機', isOil: false }); 
                else newDetails.length = num;
                return newDetails;
            });
        };

        const handleGuestUpdate = (index, field, value) => {
            setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const copy = [...prev];
                const current = { ...copy[index] };
                if (field === 'service') { current.service = value; if (value && (value.includes('足') || value.includes('Foot'))) current.isOil = false; }
                else if (field === 'staff') {
                    if (value === 'FEMALE_OIL') { current.staff = '女'; current.isOil = true; }
                    else if (value === '女') { current.staff = '女'; current.isOil = false; }
                    else { current.staff = value; current.isOil = false; }
                }
                copy[index] = current;
                return copy;
            });
        };

        const performCheck = (e) => {
            if (e) e.preventDefault();
            const result = callCoreAvailabilityCheck(form.date, form.time, guestDetails, safeBookings, safeStaffList);
            
            if (result.valid) {
                setCheckResult({ status: 'OK', message: "✅ Core: Currently Available" });
                setWaitSuggestion(null);
            } else {
                if (result.reason.includes("hệ thống")) {
                    setCheckResult({ status: 'FAIL', message: result.reason });
                    return;
                }
                // Scanner
                const parts = form.time.split(':').map(Number);
                let currentTotalMins = (parts[0]||0) * 60 + (parts[1]||0);
                let foundTime = null; let foundDate = form.date; let waitMins = 0; let isNextDay = false;

                for (let i = 1; i <= 18; i++) { 
                    const nextMins = currentTotalMins + (i * 10);
                    let nh = Math.floor(nextMins / 60); let nm = nextMins % 60;
                    if (nh >= 24) nh -= 24; 
                    const nextTimeStr = `${nh.toString().padStart(2,'0')}:${(Math.floor(nm / 10) * 10).toString().padStart(2,'0')}`;
                    const nextCheck = callCoreAvailabilityCheck(form.date, nextTimeStr, guestDetails, safeBookings, safeStaffList);
                    if (nextCheck.valid) { foundTime = nextTimeStr; waitMins = i * 10; break; }
                }

                if (!foundTime) {
                    const tmr = new Date(form.date); tmr.setDate(tmr.getDate() + 1);
                    const tomorrowStr = tmr.toISOString().slice(0, 10);
                    const openH = SHOP_UI_CONFIG.OPEN_HOUR;
                    for (let t = openH*60; t < openH*60 + 240; t += 10) {
                        const h = Math.floor(t / 60); const m = t % 60;
                        const scanTimeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                        if (callCoreAvailabilityCheck(tomorrowStr, scanTimeStr, guestDetails, safeBookings, safeStaffList).valid) {
                            foundTime = scanTimeStr; foundDate = tomorrowStr; isNextDay = true; break; 
                        }
                    }
                }

                if (foundTime) {
                    setCheckResult({ status: 'FAIL', message: isNextDay ? "⛔ Today Full" : `⚠️ Wait ${waitMins}m` }); 
                    setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay }); 
                } else {
                    setCheckResult({ status: 'FAIL', message: "❌ Fully Booked" });
                    setWaitSuggestion(null);
                }
            }
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault();
            if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ Name Required!"); return; }
            setIsSubmitting(true);

            try {
                const serviceSummary = guestDetails.map(g => g.service).filter((v, i, a) => a.indexOf(v) === i).join(', ');
                const oilNotes = guestDetails.map((g, i) => g.isOil ? `K${i+1}:油推` : null).filter(Boolean).join(',');
                
                const payload = {
                    hoTen: form.custName, sdt: form.custPhone || "", dichVu: serviceSummary, pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: guestDetails[0].staff, isOil: guestDetails[0].isOil,
                    staffId2: guestDetails[1]?.staff||null, staffId3: guestDetails[2]?.staff||null, 
                    staffId4: guestDetails[3]?.staff||null, staffId5: guestDetails[4]?.staff||null, 
                    staffId6: guestDetails[5]?.staff||null, ghiChu: oilNotes ? `(${oilNotes})` : "", guestDetails: guestDetails 
                };

                console.log("💾 Saving Walk-in:", payload);
                if (onSave) {
                    await Promise.resolve(onSave(payload));
                    forceGlobalRefresh();
                    setTimeout(() => { onClose(); setIsSubmitting(false); }, 500);
                }
            } catch(err) {
                alert("Error: " + err.message);
                setIsSubmitting(false);
            }
        };

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-600 p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">⚡ Walk-in (Core V59)</h3>
                        <button onClick={onClose}><i className="fas fa-times text-xl"></i></button>
                    </div>
                    
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div><label className="text-xs font-bold text-gray-500">Pax</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} Pax</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    {guestDetails.map((g, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                            <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(idx, 'service', e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                            <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={g.staff==='女'&&g.isOil?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(idx, 'staff', e.target.value)}><option value="隨機">🎲</option><option value="女">🚺</option><option value="FEMALE_OIL">🚺+Oil</option><option value="男">🚹</option><optgroup label="Staff">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select>
                                        </div>
                                    ))}
                                </div>
                                {checkResult && (
                                    <div className="space-y-2">
                                        <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>
                                        {waitSuggestion && (
                                            <div className="bg-blue-50 border border-blue-200 p-3 rounded animate-fadeIn text-center">
                                                <div className={`mb-2 font-bold text-lg ${waitSuggestion.isNextDay?'text-orange-600':'text-blue-700'}`}>{waitSuggestion.isNextDay ? `🌅 Tomorrow: ${waitSuggestion.time}` : `⏳ Wait ${waitSuggestion.mins}m (${waitSuggestion.time})`}</div>
                                                <button onClick={(e) => { e.preventDefault(); setForm({...form, time: waitSuggestion.time, date: waitSuggestion.date}); setStep('INFO'); }} className="w-full bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">➡️ Accept</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="pt-2 grid grid-cols-2 gap-3">
                                    <button onClick={onClose} className="bg-gray-100 text-gray-500 font-bold p-3 rounded hover:bg-gray-200">Cancel</button>
                                    {!checkResult || checkResult.status === 'FAIL' ? <button onClick={performCheck} className="bg-amber-500 text-white font-bold p-3 rounded hover:bg-amber-600 shadow-lg">🔍 Check</button> : <button onClick={() => setStep('INFO')} className="bg-emerald-600 text-white font-bold p-3 rounded hover:bg-emerald-700 shadow-lg animate-pulse">➡️ Next</button>}
                                </div>
                            </>
                        )}
                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-amber-50 p-3 rounded border border-amber-200 text-amber-900 font-bold"><div className="flex justify-between"><span>{form.date}</span><span>{form.time}</span></div></div>
                                <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custName} onChange={e=>setForm({...form, custName:e.target.value})} placeholder="Customer Name..." disabled={isSubmitting} />
                                <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custPhone} onChange={e=>setForm({...form, custPhone:e.target.value})} placeholder="Phone..." disabled={isSubmitting} />
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button onClick={(e) => {e.preventDefault(); if(!isSubmitting) setStep('CHECK');}} className="bg-gray-200 text-gray-600 p-3 rounded font-bold" disabled={isSubmitting}>⬅️ Back</button>
                                    <button onClick={handleFinalSave} className="bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting ? "Processing..." : "✅ Confirm"}</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // SYSTEM INJECTION
    const overrideInterval = setInterval(() => {
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) {
            window.AvailabilityCheckModal = NewAvailabilityCheckModal;
            console.log("♻️ AvailabilityModal Injected (V59)");
        }
        if (window.WalkInModal !== NewWalkInModal) {
            window.WalkInModal = NewWalkInModal;
            console.log("♻️ WalkInModal Injected (V59)");
        }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);
})();
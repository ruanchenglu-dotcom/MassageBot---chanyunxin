/**
 * ============================================================================
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V80 (FIX LOGIC OVERLAP & PAX LIMIT)
 * NGÀY CẬP NHẬT: 2026-01-09
 * * * * * TÍNH NĂNG ĐÃ SỬA:
 * 1. [UI] Giới hạn Menu chọn số khách tối đa 6 người (theo yêu cầu).
 * 2. [CORE] Thêm logic đếm tổng số lượng khách (Total Headcount Check).
 * - Nếu (Khách cũ + Khách mới) > Tổng sức chứa (12) => Báo Đầy.
 * 3. [LOGIC] Sửa lỗi báo "Available" ảo khi giờ đó đã kín lịch.
 * ============================================================================
 */

(function() {
    console.log("🚀 BookingHandler V80 (ZH-TW): Initializing with STRICT LOGIC...");

    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL: React not found.");
        return;
    }

    // ========================================================================
    // 1. INTEGRATED CORE LOGIC (BỘ XỬ LÝ TÍCH HỢP SẴN - NÂNG CẤP V80)
    // ========================================================================
    
    const InternalCore = {
        // CẤU HÌNH SỨC CHỨA: 6 Ghế + 6 Giường = 12 Slot tối đa
        // Nếu tiệm bạn ít hơn hoặc nhiều hơn, sửa số này. Nhưng logic an toàn là chặn khi quá tải.
        MAX_TOTAL_SLOTS: 12,

        timeToMinutes: (timeStr) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        },

        isOverlap: (startA, durationA, startB, durationB) => {
            const endA = startA + durationA;
            const endB = startB + durationB;
            // Công thức va chạm chuẩn: (StartA < EndB) và (StartB < EndA)
            return startA < endB && startB < endA;
        },

        checkRequestAvailability: function(targetDate, targetTime, guests, currentBookings, staffMap) {
            try {
                // 1. Chuẩn bị dữ liệu đầu vào
                const requestStart = this.timeToMinutes(targetTime);
                const requestDuration = 60; // Mặc định check theo block 60 phút cho an toàn
                const busyStaff = new Set();
                let activeBookingsCount = 0; // Đếm số khách đang có mặt tại giờ đó

                // 2. Quét toàn bộ lịch cũ để đếm số lượng khách đang phục vụ
                if (Array.isArray(currentBookings)) {
                    currentBookings.forEach(booking => {
                        // Bỏ qua đơn hủy
                        if (booking.status && (booking.status.includes('Cancel') || booking.status.includes('hủy'))) return;

                        const bTime = this.timeToMinutes(booking.startTime);
                        const bDuration = parseInt(booking.duration) || 60;
                        
                        // Kiem tra va cham thoi gian
                        if (this.isOverlap(requestStart, requestDuration, bTime, bDuration)) {
                            // Nếu trùng giờ => Tăng biến đếm tổng khách
                            activeBookingsCount++;

                            // Ghi nhận nhân viên này đang bận
                            if (booking.staffName && booking.staffName !== 'Unassigned') {
                                busyStaff.add(booking.staffName);
                            }
                        }
                    });
                }

                // 3. CHECK 1: Kiểm tra tổng công suất (Quan trọng)
                // Nếu (Khách đang làm + Khách định đặt) > Tổng ghế giường
                const totalNeeded = activeBookingsCount + guests.length;
                if (totalNeeded > this.MAX_TOTAL_SLOTS) {
                    return { 
                        feasible: false, 
                        reason: `⛔ Khung giờ này quá tải (${activeBookingsCount} khách đang làm). Không thể nhận thêm ${guests.length} khách.` 
                    };
                }

                // 4. CHECK 2: Kiểm tra từng nhân viên cụ thể
                let assignedStaffs = []; // Danh sách nhân viên được chỉ định trong đơn mới
                
                for (let i = 0; i < guests.length; i++) {
                    const guest = guests[i];
                    const requestedStaff = guest.staffName || guest.staff; 
                    
                    // Nếu khách chọn đích danh nhân viên (Không phải Random/Nam/Nữ)
                    if (requestedStaff && !['RANDOM', '隨機', 'FEMALE', 'MALE', 'FEMALE_OIL'].includes(requestedStaff)) {
                        
                        // A. Nhân viên này đang bận làm khách khác
                        if (busyStaff.has(requestedStaff)) {
                            return { feasible: false, reason: `⛔ 技師 ${requestedStaff} 在此時段已忙碌 (Staff ${requestedStaff} Busy)` };
                        }
                        
                        // B. Nhân viên này bị trùng trong cùng 1 đơn đặt (Ví dụ khách 1 chọn #10, khách 2 cũng chọn #10)
                        if (assignedStaffs.includes(requestedStaff)) {
                            return { feasible: false, reason: `⛔ 不能重複選擇技師 ${requestedStaff} (Duplicate Staff)` };
                        }
                        
                        // C. Kiểm tra lịch nghỉ (Off days)
                        if (staffMap && staffMap[requestedStaff]) {
                            const sInfo = staffMap[requestedStaff];
                            if (sInfo.off) return { feasible: false, reason: `⛔ 技師 ${requestedStaff} 今日休假 (Staff Off)` };
                        }

                        assignedStaffs.push(requestedStaff);
                    }
                }

                // Nếu vượt qua tất cả bài test
                return { feasible: true, details: "OK" };

            } catch (error) {
                console.error("Internal Core Error:", error);
                return { feasible: false, reason: "System Error: " + error.message };
            }
        },

        setDynamicServices: (services) => { /* Placeholder */ }
    };

    window.ResourceCore = InternalCore;
    window.checkRequestAvailability = InternalCore.checkRequestAvailability.bind(InternalCore);


    // ========================================================================
    // 2. REACT UI LOGIC (GIAO DIỆN)
    // ========================================================================
    
    const { useState, useEffect, useMemo, useCallback } = React;

    const SHOP_UI_CONFIG = {
        HOURS_LIST: ['08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','00','01','02'],
        MINUTES_STEP: ['00', '10', '20', '30', '40', '50'],
        OPEN_HOUR: 8,
        // CẤU HÌNH SỐ KHÁCH TỐI ĐA TRONG MENU DROPDOWN
        MAX_PAX_SELECT: 6 
    };

    // --- DATA ADAPTERS ---
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
            duration: parseInt(b.duration) || 60,
            staffName: b.technician || b.staffId || "Unassigned",
            status: b.status || "Active"
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
        const coreApi = window.ResourceCore;
        const coreGuests = adaptGuestsForCore(guests);
        const coreBookings = adaptBookingsForCore(bookings, date);
        
        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = String(s.id).trim();
                staffMap[sId] = {
                    off: (String(s.offDays).includes(date) || String(s[date]||"").toUpperCase().includes('OFF'))
                };
            });
        }

        const result = coreApi.checkRequestAvailability(date, time, coreGuests, coreBookings, staffMap);
        return result.feasible ? { valid: true, details: result.details } : { valid: false, reason: result.reason };
    };

    const forceGlobalRefresh = () => {
        if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender();
        else window.location.reload(); 
    };

    // ==================================================================================
    // 3. COMPONENT: PHONE BOOKING MODAL (ZH-TW) - UPDATED V80
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const coreReady = true; 

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

        // --- UPDATED: HANDLE PAX CHANGE WITH LIMIT ---
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
                setCheckResult({ status: 'OK', message: "✅ 此時段可以預約 (Available)" }); 
                setSuggestions([]); 
            } else {
                setCheckResult({ status: 'FAIL', message: result.reason });
                
                // Scanner Logic
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
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault();
            if (isSubmitting) return; 
            if (!form.custName.trim()) { alert("⚠️ 請輸入顧客姓名!"); return; }

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

                if (onSave) {
                    await Promise.resolve(onSave(payload));
                    forceGlobalRefresh();
                    setTimeout(() => { onClose(); setIsSubmitting(false); }, 500);
                }
            } catch (err) {
                alert("儲存失敗: " + err.message);
                setIsSubmitting(false);
            }
        };

        const [currentHour, currentMinute] = (form.time || "12:00").split(':');

        // --- GENERATE PAX OPTIONS [1..6] ---
        const paxOptions = Array.from({length: SHOP_UI_CONFIG.MAX_PAX_SELECT}, (_, i) => i + 1);

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
                    <div className="bg-[#0891b2] p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">📅 電話預約 (V80)</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>

                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500">日期 (Date)</label>
                                        <input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form, date:e.target.value}); setCheckResult(null);}}/>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500">時間 (Time)</label>
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
                                    <label className="text-xs font-bold text-gray-500">人數 (Pax)</label>
                                    <select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>
                                        {paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}
                                    </select>
                                </div>

                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">詳細需求 (Details)</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                                <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(idx, 'service', e.target.value)}>
                                                    {(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={selectValue} onChange={e=>handleGuestUpdate(idx, 'staff', e.target.value)}>
                                                    <option value="隨機">🎲 隨機</option>
                                                    <option value="女">🚺 女師傅</option>
                                                    <option value="FEMALE_OIL">🚺 女+油</option>
                                                    <option value="男">🚹 男師傅</option>
                                                    <optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup>
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div>
                                    {!checkResult ? (
                                        <button 
                                            onClick={performCheck} 
                                            className="w-full text-white p-3 rounded font-bold shadow-lg transition bg-cyan-600 hover:bg-cyan-700"
                                        >
                                            🔍 查詢空位 (Check Availability)
                                        </button>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {checkResult.message}
                                            </div>
                                            {checkResult.status === 'FAIL' && suggestions.length > 0 && (
                                                <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                                                    <div className="text-xs font-bold text-yellow-700 mb-2">💡 建議時段 (Suggestions):</div>
                                                    <div className="flex gap-2 flex-wrap">
                                                        {suggestions.map(t=><button key={t} onClick={()=>{setForm(f=>({...f, time:t})); setCheckResult(null); setSuggestions([]);}} className="px-3 py-1 bg-white border border-yellow-300 text-yellow-800 rounded font-bold hover:bg-yellow-100">{t}</button>)}
                                                    </div>
                                                </div>
                                            )}
                                            {checkResult.status === 'OK' ? (
                                                <button onClick={()=>setStep('INFO')} className="w-full bg-emerald-600 text-white p-3 rounded font-bold shadow-lg animate-pulse hover:bg-emerald-700">➡️ 下一步 (Next)</button>
                                            ) : (
                                                <button onClick={()=>{setCheckResult(null); setSuggestions([])}} className="w-full bg-gray-400 text-white p-3 rounded font-bold hover:bg-gray-500">🔄 重新選擇 (Retry)</button>
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
                                    <div className="text-sm font-normal mt-1">{form.pax} 位 - {guestDetails[0].service}...</div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">顧客姓名</label>
                                    <input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custName} onChange={e => setForm({...form, custName: e.target.value})} placeholder="輸入顧客姓名..." disabled={isSubmitting} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">電話號碼</label>
                                    <input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custPhone} onChange={e => setForm({...form, custPhone: e.target.value})} placeholder="09xx... (選填)" disabled={isSubmitting} />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={(e)=>{ e.preventDefault(); if(!isSubmitting) setStep('CHECK'); }} className="flex-1 bg-gray-200 p-3 rounded font-bold text-gray-700 hover:bg-gray-300" disabled={isSubmitting}>⬅️ 返回</button>
                                    <button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting ? "處理中..." : "✅ 確認預約"}</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 4. COMPONENT: WALK-IN MODAL (ZH-TW) - UPDATED V80
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

        // --- UPDATED PAX LIMIT FOR WALK-IN TOO ---
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
                setCheckResult({ status: 'OK', message: "✅ 目前有空位 (Available Now)" });
                setWaitSuggestion(null);
            } else {
                // Scanner logic
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
                    setCheckResult({ status: 'FAIL', message: isNextDay ? "⛔ 今日已滿 (Today Full)" : `⚠️ 需等待 ${waitMins} 分鐘` }); 
                    setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay }); 
                } else {
                    setCheckResult({ status: 'FAIL', message: "❌ 預約已滿 (Fully Booked)" });
                    setWaitSuggestion(null);
                }
            }
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault();
            if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入姓名!"); return; }
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

                if (onSave) {
                    await Promise.resolve(onSave(payload));
                    forceGlobalRefresh();
                    setTimeout(() => { onClose(); setIsSubmitting(false); }, 500);
                }
            } catch(err) {
                alert("錯誤: " + err.message);
                setIsSubmitting(false);
            }
        };

        const paxOptions = Array.from({length: SHOP_UI_CONFIG.MAX_PAX_SELECT}, (_, i) => i + 1);

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-600 p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">⚡ 現場客 (V80)</h3>
                        <button onClick={onClose}><i className="fas fa-times text-xl"></i></button>
                    </div>
                    
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">人數 (Pax)</label>
                                    <select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>
                                        {paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}
                                    </select>
                                </div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    {guestDetails.map((g, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                            <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(idx, 'service', e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                            <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={g.staff==='女'&&g.isOil?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(idx, 'staff', e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師</option><option value="FEMALE_OIL">🚺+油</option><option value="男">🚹 男師</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select>
                                        </div>
                                    ))}
                                </div>
                                {checkResult && (
                                    <div className="space-y-2">
                                        <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>
                                        {waitSuggestion && (
                                            <div className="bg-blue-50 border border-blue-200 p-3 rounded animate-fadeIn text-center">
                                                <div className={`mb-2 font-bold text-lg ${waitSuggestion.isNextDay?'text-orange-600':'text-blue-700'}`}>{waitSuggestion.isNextDay ? `🌅 最快明天: ${waitSuggestion.time}` : `⏳ 需等待 ${waitSuggestion.mins} 分鐘 (${waitSuggestion.time})`}</div>
                                                <button onClick={(e) => { e.preventDefault(); setForm({...form, time: waitSuggestion.time, date: waitSuggestion.date}); setStep('INFO'); }} className="w-full bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">➡️ 接受安排</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="pt-2 grid grid-cols-2 gap-3">
                                    <button onClick={onClose} className="bg-gray-100 text-gray-500 font-bold p-3 rounded hover:bg-gray-200">取消</button>
                                    {!checkResult || checkResult.status === 'FAIL' ? 
                                        <button onClick={performCheck} className="text-white font-bold p-3 rounded shadow-lg bg-amber-500 hover:bg-amber-600">
                                            🔍 檢查
                                        </button> 
                                        : 
                                        <button onClick={() => setStep('INFO')} className="bg-emerald-600 text-white font-bold p-3 rounded hover:bg-emerald-700 shadow-lg animate-pulse">➡️ 下一步</button>
                                    }
                                </div>
                            </>
                        )}
                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-amber-50 p-3 rounded border border-amber-200 text-amber-900 font-bold"><div className="flex justify-between"><span>{form.date}</span><span>{form.time}</span></div></div>
                                <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custName} onChange={e=>setForm({...form, custName:e.target.value})} placeholder="顧客姓名..." disabled={isSubmitting} />
                                <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custPhone} onChange={e=>setForm({...form, custPhone:e.target.value})} placeholder="電話號碼..." disabled={isSubmitting} />
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button onClick={(e) => {e.preventDefault(); if(!isSubmitting) setStep('CHECK');}} className="bg-gray-200 text-gray-600 p-3 rounded font-bold" disabled={isSubmitting}>⬅️ 返回</button>
                                    <button onClick={handleFinalSave} className="bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting ? "處理中..." : "✅ 確認開單"}</button>
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
            console.log("♻️ AvailabilityModal Injected (V80)");
        }
        if (window.WalkInModal !== NewWalkInModal) {
            window.WalkInModal = NewWalkInModal;
            console.log("♻️ WalkInModal Injected (V80)");
        }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);
})();
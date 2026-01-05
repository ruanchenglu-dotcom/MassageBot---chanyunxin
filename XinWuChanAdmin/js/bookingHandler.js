// File: js/bookingHandler.js
// Phiên bản: V24 (Final - Robust Resource Detection & Combo Phase Logic)

(function() {
    console.log("🚀 BookingHandler V24 (Robust Count): 啟動中...");

    if (typeof React === 'undefined') return;
    const { useState, useEffect, useMemo } = React;

    // --- HELPER: Tạo danh sách giờ/phút ---
    const HOURS_24 = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
    const MINUTES_10 = ['00', '10', '20', '30', '40', '50'];

    // --- SHARED HELPER FUNCTIONS ---
    const getStaffDisplayName = (s) => {
        if (String(s.id).trim() === String(s.name).trim()) return s.name;
        return `${s.id} - ${s.name}`;
    };

    const isStaffWorkingAt = (staff, checkMins, dateString) => {
        const sheetDateKey = dateString.replace(/-/g, '/');
        const dayStatus = staff[sheetDateKey];
        if (dayStatus && String(dayStatus).trim().toUpperCase() === 'OFF') return false;

        if (!staff.shiftStart || !staff.shiftEnd) return false;
        if (String(staff.shiftStart).toUpperCase().includes('OFF')) return false;

        const startMins = window.normalizeToTimelineMins(staff.shiftStart);
        const endMins = window.normalizeToTimelineMins(staff.shiftEnd);
        return checkMins >= startMins && checkMins < endMins;
    };

    // [NEW V24] Hàm xác định loại tài nguyên dựa trên RowID và Tên dịch vụ
    const detectStartResourceType = (rowId, serviceName, typeFromData) => {
        const rId = String(rowId || '').toLowerCase();
        
        // 1. Check RowID trước
        if (rId.includes('chair') || rId.includes('足')) return 'CHAIR';
        if (rId.includes('bed') || rId.includes('身')) return 'BED';
        
        // 2. Nếu RowID là số (1-6 thường là ghế nếu là quán massage chân)
        // Nhưng an toàn hơn là check Service Name
        if (serviceName.includes('足') || serviceName.includes('Foot')) return 'CHAIR';
        if (serviceName.includes('身') || serviceName.includes('Body') || serviceName.includes('指壓')) return 'BED';
        
        // 3. Check Type gốc từ Data
        if (typeFromData === 'CHAIR') return 'CHAIR';
        
        // Mặc định còn lại là BED (Body/Combo thường dùng giường)
        return 'BED'; 
    };

    // [UPDATED V24] HÀM ĐẾM TÀI NGUYÊN
    const countOccupiedResources = (targetType, intervalStart, intervalEnd, todayBookings) => {
        let occupiedCount = 0;
        const CLEANUP_BUFFER = 10; 

        todayBookings.forEach(b => {
            const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
            const duration = b.duration || 60;
            const bEnd = bStart + duration;
            const pax = parseInt(b.pax) || 1;
            
            // Bỏ qua nếu không giao nhau (tính cả buffer)
            if (bStart > intervalEnd) return; 

            let isUsingTarget = false;
            
            // Xác định Booking này bắt đầu ở đâu (Ghế hay Giường)
            const startResType = detectStartResourceType(b.rowId, b.serviceName, b.type);

            if (b.category === 'COMBO') {
                const half = duration / 2;
                const switchPoint = bStart + half;

                // Phase 1: Start -> Switch + Buffer
                const p1Start = bStart;
                const p1End = switchPoint + CLEANUP_BUFFER;
                
                // Phase 2: Switch -> End + Buffer
                const p2Start = switchPoint; 
                const p2End = bEnd + CLEANUP_BUFFER;

                // Logic: 
                // Nếu bắt đầu ở Ghế -> Phase 1 là Ghế, Phase 2 là Giường
                // Nếu bắt đầu ở Giường -> Phase 1 là Giường, Phase 2 là Ghế
                
                const p1Type = startResType; 
                const p2Type = startResType === 'CHAIR' ? 'BED' : 'CHAIR';

                // Check Overlap Phase 1
                if (targetType === p1Type) {
                    if (Math.max(intervalStart, p1Start) < Math.min(intervalEnd, p1End)) isUsingTarget = true;
                }

                // Check Overlap Phase 2
                if (targetType === p2Type) {
                    if (Math.max(intervalStart, p2Start) < Math.min(intervalEnd, p2End)) isUsingTarget = true;
                }

            } else {
                // Single Service
                const effectiveEnd = bEnd + CLEANUP_BUFFER;
                if (targetType === startResType) {
                    if (Math.max(intervalStart, bStart) < Math.min(intervalEnd, effectiveEnd)) {
                        isUsingTarget = true;
                    }
                }
            }

            if (isUsingTarget) {
                occupiedCount += pax;
            }
        });

        return occupiedCount;
    };

    // ==================================================================================
    // 1. MODAL ĐẶT LỊCH
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);

        const [form, setForm] = useState({
            date: initialDate || new Date().toISOString().slice(0, 10), 
            time: "12:00",
            service: window.SERVICES_LIST ? window.SERVICES_LIST[2] : "", 
            pax: 1, custName: '', custPhone: ''
        });

        const [guestDetails, setGuestDetails] = useState([{ staff: '隨機', isOil: false }]);

        const isFootService = useMemo(() => {
            if (!form.service) return false;
            return form.service.includes('足') || (window.SERVICES_DATA && window.SERVICES_DATA[form.service]?.category === 'FOOT');
        }, [form.service]);

        const handleServiceChange = (e) => {
            const newService = e.target.value;
            setForm(prev => ({ ...prev, service: newService }));
            setCheckResult(null); setSuggestions([]);
            if (newService.includes('足')) { setGuestDetails(prev => prev.map(g => ({ ...g, isOil: false }))); }
        };

        const handleTimeChange = (type, value) => {
            const [h, m] = form.time.split(':');
            let newTime = form.time;
            if (type === 'HOUR') newTime = `${value}:${m}`;
            if (type === 'MINUTE') newTime = `${h}:${value}`;
            setForm(prev => ({ ...prev, time: newTime }));
            setCheckResult(null); setSuggestions([]);
        };

        const handlePaxChange = (val) => {
            const num = parseInt(val);
            setForm(prev => ({ ...prev, pax: num }));
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const newDetails = [...prev];
                if (num > prev.length) { for (let i = prev.length; i < num; i++) newDetails.push({ staff: '隨機', isOil: false }); } 
                else { newDetails.length = num; }
                return newDetails;
            });
        };

        const handleGuestStaffChange = (index, value) => {
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const copy = [...prev];
                const current = copy[index];
                if (value === 'FEMALE_OIL') { copy[index] = { ...current, staff: '女', isOil: true }; } 
                else if (value === '女') { copy[index] = { ...current, staff: '女', isOil: false }; } 
                else { copy[index] = { ...current, staff: value, isOil: false }; }
                return copy;
            });
        };

        const toggleOil = (index) => {
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => { const copy = [...prev]; copy[index] = { ...copy[index], isOil: !copy[index].isOil }; return copy; });
        };

        const checkSlotAvailability = (targetTimeStr) => {
            const duration = window.getSafeDuration ? window.getSafeDuration(form.service, 60) : 60;
            const startMins = window.normalizeToTimelineMins ? window.normalizeToTimelineMins(targetTimeStr) : 0;
            const endMins = startMins + duration;
            const safeBookings = bookings || [];
            const todays = safeBookings.filter(b => {
                const bDate = b.startTimeString.split(' ')[0].replace(/\//g, '-');
                const targetDate = form.date.replace(/\//g, '-');
                return bDate === targetDate && !b.status.includes('取消');
            });

            // 1. Staff Check
            const activeStaffCount = staffList.filter(s => isStaffWorkingAt(s, startMins, form.date)).length;
            let busyStaffCount = 0;
            todays.forEach(b => {
                const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                const bDuration = b.duration || 60;
                const bEnd = bStart + bDuration + 10;
                if (Math.max(startMins, bStart) < Math.min(endMins, bEnd)) {
                    busyStaffCount += 1;
                }
            });
            
            if ((activeStaffCount - busyStaffCount) < form.pax) {
                return { valid: false, reason: `❌ 人手不足 (Not enough staff). 現場:${activeStaffCount}, 忙碌:${busyStaffCount}` };
            }

            // 2. KTV Check
            for (let i = 0; i < guestDetails.length; i++) {
                const st = guestDetails[i].staff;
                if (['隨機', '男', '女'].some(k => st.includes(k))) continue;
                const staffObj = staffList.find(s => s.id === st || s.name === st);
                if (staffObj && !isStaffWorkingAt(staffObj, startMins, form.date)) return { valid: false, reason: `❌ 技師 ${st} 休假/未上班` };
                
                const isBusy = todays.some(b => {
                    const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                    const bEnd = bStart + (b.duration || 60) + 10;
                    const overlap = (startMins < bEnd && endMins > bStart);
                    const staffInOrder = [b.serviceStaff, b.staffId, b.technician, b.staffId2, b.staffId3, b.staffId4].map(s=>String(s));
                    return overlap && staffInOrder.includes(String(st));
                });
                if (isBusy) return { valid: false, reason: `❌ 技師 ${st} 忙碌` };
            }

            // 3. Resource Check (V24 - Robust)
            const MAX_RES = 6;
            const svcInfo = window.SERVICES_DATA ? window.SERVICES_DATA[form.service] : {};
            const isCombo = form.service.includes('套餐') || svcInfo.category === 'COMBO';

            if (isCombo) {
                const phaseDuration = duration / 2;
                const p1S = startMins; const p1E = startMins + phaseDuration;
                const p2S = p1E; const p2E = startMins + duration;

                const chairsUsedP1 = countOccupiedResources('CHAIR', p1S, p1E, todays);
                const bedsUsedP1   = countOccupiedResources('BED',   p1S, p1E, todays);
                
                const chairsUsedP2 = countOccupiedResources('CHAIR', p2S, p2E, todays);
                const bedsUsedP2   = countOccupiedResources('BED',   p2S, p2E, todays);

                let canFit = false;
                for (let k = form.pax; k >= 0; k--) { 
                    const j = form.pax - k;
                    // Phase 1 Check
                    const p1Ok = (chairsUsedP1 + k <= MAX_RES) && (bedsUsedP1 + j <= MAX_RES);
                    // Phase 2 Check
                    const p2Ok = (bedsUsedP2 + k <= MAX_RES) && (chairsUsedP2 + j <= MAX_RES);
                    
                    if (p1Ok && p2Ok) { canFit = true; break; }
                }
                if (!canFit) return { valid: false, reason: "❌ 區域客滿 (Area Full)" };

            } else {
                const type = (form.service.includes('足') || svcInfo.type === 'CHAIR') ? 'CHAIR' : 'BED';
                const used = countOccupiedResources(type, startMins, endMins, todays);
                if (used + form.pax > MAX_RES) {
                    return { valid: false, reason: type === 'CHAIR' ? `❌ 足底區客滿 (${used}/6)` : `❌ 指壓區客滿 (${used}/6)` };
                }
            }
            return { valid: true, reason: "OK" };
        };

        const performCheck = () => {
            const result = checkSlotAvailability(form.time);
            if (result.valid) { setCheckResult({ status: 'OK', message: "✅ 此時段可以預約 (Available)" }); setSuggestions([]); }
            else {
                setCheckResult({ status: 'FAIL', message: result.reason });
                const foundSuggestions = [];
                const [startH, startM] = form.time.split(':').map(Number);
                let currentTotalMins = startH * 60 + startM;
                for (let i = 1; i <= 24; i++) {
                    const nextMins = currentTotalMins + (i * 10);
                    let h = Math.floor(nextMins / 60); let m = nextMins % 60;
                    if (h >= 24) h -= 24;
                    if (h === 0 && m > 40) break; if (h > 0 && h < 8) break;
                    const mStr = m.toString().padStart(2, '0');
                    if (!['00','10','20','30','40','50'].includes(mStr)) continue;
                    const timeStr = `${h.toString().padStart(2,'0')}:${mStr}`;
                    if (checkSlotAvailability(timeStr).valid) { foundSuggestions.push(timeStr); if (foundSuggestions.length >= 4) break; }
                }
                setSuggestions(foundSuggestions);
            }
        };

        const handleFinalSave = () => {
            if (!form.custName) { alert("請輸入顧客姓名!"); return; }
            const oilNotes = guestDetails.map((g, i) => g.isOil ? `K${i+1}:油推` : null).filter(Boolean).join(',');
            onSave({
                hoTen: form.custName, sdt: form.custPhone || "", dichVu: form.service, pax: form.pax,
                ngayDen: form.date.replace(/-/g, '/'), gioDen: form.time,
                nhanVien: guestDetails[0].staff, isOil: guestDetails[0].isOil,
                staffId2: guestDetails[1]?.staff||null, staffId3: guestDetails[2]?.staff||null, staffId4: guestDetails[3]?.staff||null, staffId5: guestDetails[4]?.staff||null, staffId6: guestDetails[5]?.staff||null,
                ghiChu: oilNotes ? `(${oilNotes})` : ""
            });
        };

        const safeStaffList = staffList || [];
        const [currentHour, currentMinute] = form.time.split(':');

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
                    <div className="bg-[#10b981] p-4 text-white flex justify-between items-center">
                        <h3 className="font-bold text-lg">📅 新增預約 (Booking Check)</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold text-gray-500">日期 (Date)</label><input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form, date:e.target.value}); setCheckResult(null);}}/></div>
                                    <div><label className="text-xs font-bold text-gray-500">時間 (Time)</label><div className="flex items-center gap-1"><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] appearance-none text-center bg-white" value={currentHour} onChange={(e) => handleTimeChange('HOUR', e.target.value)}>{HOURS_24.map(h => <option key={h} value={h}>{h}</option>)}</select></div><span className="font-bold">:</span><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] appearance-none text-center bg-white" value={currentMinute} onChange={(e) => handleTimeChange('MINUTE', e.target.value)}>{MINUTES_10.map(m => <option key={m} value={m}>{m}</option>)}</select></div></div></div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500">服務項目</label><select className="w-full border p-2 rounded font-bold text-sm" value={form.service} onChange={handleServiceChange}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                                    <div><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full border p-2 rounded font-bold text-center" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                </div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">指定技師 & 精油</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center font-bold text-xs">{idx+1}</div>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm" value={selectValue} onChange={e=>handleGuestStaffChange(idx, e.target.value)}>
                                                    <option value="隨機">🎲 隨機 (Random)</option>
                                                    <option value="女">🚺 女師傅 (Female)</option>
                                                    <option value="FEMALE_OIL">🚺 女師傅 + 精油 (Female Oil)</option>
                                                    <option value="男">🚹 男師傅 (Male)</option>
                                                    <optgroup label="技師列表">{safeStaffList.map(s=><option key={s.id} value={s.id}>{getStaffDisplayName(s)}</option>)}</optgroup>
                                                </select>
                                                <button onClick={()=> !isFootService && toggleOil(idx)} disabled={isFootService} className={`px-2 py-1 border rounded text-xs font-bold min-w-[70px] ${isFootService ? 'bg-slate-100 text-slate-300' : (g.isOil ? 'bg-purple-600 text-white' : 'bg-white text-gray-500')}`}>{isFootService ? '無精油' : (g.isOil ? '有精油' : '無精油')}</button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div>
                                    {!checkResult ? <button onClick={performCheck} className="w-full bg-blue-600 text-white p-3 rounded font-bold shadow-lg">🔍 查詢空位</button> : 
                                    <div className="space-y-3"><div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>
                                    {checkResult.status === 'FAIL' && suggestions.length > 0 && <div className="bg-yellow-50 p-3 rounded border border-yellow-200"><div className="text-xs font-bold text-yellow-700 mb-2">💡 建議時段:</div><div className="flex gap-2 flex-wrap">{suggestions.map(t=><button key={t} onClick={()=>{setForm({...form, time:t}); setCheckResult(null); setSuggestions([])}} className="px-3 py-1 bg-white border border-yellow-300 text-yellow-800 rounded font-bold">{t}</button>)}</div></div>}
                                    {checkResult.status === 'OK' ? <button onClick={()=>setStep('INFO')} className="w-full bg-emerald-600 text-white p-3 rounded font-bold shadow-lg animate-pulse">➡️ 下一步</button> : <button onClick={()=>{setCheckResult(null); setSuggestions([])}} className="w-full bg-gray-400 text-white p-3 rounded font-bold">🔄 重新選擇</button>}</div>}
                                </div>
                            </>
                        )}
                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-green-50 p-3 rounded border border-green-200"><div className="font-bold text-green-800 text-lg flex justify-between"><span>{form.date}</span><span>{form.time}</span></div><div className="text-green-700">{form.service} ({form.pax} 位)</div><div className="mt-1 text-xs text-green-600">{guestDetails.map((g,i)=>`#${i+1}:${g.staff}${g.isOil ? '(油)' : ''}`).join(', ')}</div></div>
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full border p-3 rounded font-bold" value={form.custName} onChange={e=>setForm({...form, custName:e.target.value})} autoFocus/></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼</label><input className="w-full border p-3 rounded font-bold" value={form.custPhone} onChange={e=>setForm({...form, custPhone:e.target.value})}/></div>
                                <div className="flex gap-2"><button onClick={()=>setStep('CHECK')} className="flex-1 bg-gray-200 p-3 rounded font-bold">返回</button><button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl">✅ 確認預約</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 2. MODAL KHÁCH VÃNG LAI (NEW WALKIN MODAL)
    // ==================================================================================
    const NewWalkInModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [waitSuggestion, setWaitSuggestion] = useState(null); 

        const now = new Date();
        const currentTimeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        const todayStr = initialDate || now.toISOString().slice(0, 10);

        const [form, setForm] = useState({
            service: window.SERVICES_LIST ? window.SERVICES_LIST[2] : "", 
            pax: 1, custName: '現場客', custPhone: '', time: currentTimeStr, date: todayStr
        });

        const [guestDetails, setGuestDetails] = useState([{ staff: '隨機', isOil: false }]);

        const isFootService = useMemo(() => {
            if (!form.service) return false;
            return form.service.includes('足') || (window.SERVICES_DATA && window.SERVICES_DATA[form.service]?.category === 'FOOT');
        }, [form.service]);

        const handleServiceChange = (e) => {
            const newService = e.target.value;
            setForm(prev => ({ ...prev, service: newService }));
            setCheckResult(null); setWaitSuggestion(null);
            if (newService.includes('足')) { setGuestDetails(prev => prev.map(g => ({ ...g, isOil: false }))); }
        };

        const handlePaxChange = (val) => {
            const num = parseInt(val);
            setForm(prev => ({ ...prev, pax: num }));
            setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const newDetails = [...prev];
                if (num > prev.length) { for (let i = prev.length; i < num; i++) newDetails.push({ staff: '隨機', isOil: false }); } 
                else { newDetails.length = num; }
                return newDetails;
            });
        };

        const handleGuestStaffChange = (index, value) => {
            setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const copy = [...prev];
                const current = copy[index];
                if (value === 'FEMALE_OIL') {
                    copy[index] = { ...current, staff: '女', isOil: true };
                } else if (value === '女') {
                    copy[index] = { ...current, staff: '女', isOil: false };
                } else if (value === '男' || value === '隨機') {
                    copy[index] = { ...current, staff: value, isOil: false };
                } else {
                    copy[index] = { ...current, staff: value, isOil: false };
                }
                return copy;
            });
        };

        const toggleOil = (index) => {
            setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const copy = [...prev];
                copy[index] = { ...copy[index], isOil: !copy[index].isOil };
                return copy;
            });
        };

        const runCheckForTime = (timeToCheck, dateToCheck) => {
            const duration = window.getSafeDuration ? window.getSafeDuration(form.service, 60) : 60;
            const startMins = window.normalizeToTimelineMins ? window.normalizeToTimelineMins(timeToCheck) : 0;
            const endMins = startMins + duration;
            const safeBookings = bookings || [];
            
            const todays = safeBookings.filter(b => {
                const bDate = b.startTimeString.split(' ')[0].replace(/\//g, '-');
                const targetDate = dateToCheck.replace(/\//g, '-');
                return bDate === targetDate && !b.status.includes('取消');
            });

            // 1. Staff Check
            const activeStaffCount = staffList.filter(s => isStaffWorkingAt(s, startMins, dateToCheck)).length;
            let busyStaffCount = 0;
            todays.forEach(b => {
                const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                const bDuration = b.duration || 60;
                const bEnd = bStart + bDuration + 10;
                if (Math.max(startMins, bStart) < Math.min(endMins, bEnd)) busyStaffCount += 1;
            });
            if ((activeStaffCount - busyStaffCount) < form.pax) return { valid: false, reason: `❌ 人手不足 (Not enough staff)` };

            // 2. KTV Check
            for (let i = 0; i < guestDetails.length; i++) {
                const st = guestDetails[i].staff;
                if (['隨機', '男', '女'].some(k => st.includes(k))) continue;
                const staffObj = staffList.find(s => s.id === st || s.name === st);
                if (staffObj && !isStaffWorkingAt(staffObj, startMins, dateToCheck)) return { valid: false, reason: `❌ 技師 ${st} 未上班` };
                
                const isBusy = todays.some(b => {
                    const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                    const bEnd = bStart + (b.duration || 60) + 10;
                    const overlap = (startMins < bEnd && endMins > bStart);
                    const staffInOrder = [b.serviceStaff, b.staffId, b.technician, b.staffId2, b.staffId3, b.staffId4].map(s=>String(s));
                    return overlap && staffInOrder.includes(String(st));
                });
                if (isBusy) return { valid: false, reason: `❌ 技師 ${st} 忙碌` };
            }

            // 3. Resource Check (V24 - Robust)
            const MAX_RES = 6;
            const svcInfo = window.SERVICES_DATA ? window.SERVICES_DATA[form.service] : {};
            const isCombo = form.service.includes('套餐') || svcInfo.category === 'COMBO';

            if (isCombo) {
                const phaseDuration = duration / 2;
                const p1S = startMins; const p1E = startMins + phaseDuration;
                const p2S = p1E; const p2E = startMins + duration;

                const chairsUsedP1 = countOccupiedResources('CHAIR', p1S, p1E, todays);
                const bedsUsedP1   = countOccupiedResources('BED',   p1S, p1E, todays);
                const chairsUsedP2 = countOccupiedResources('CHAIR', p2S, p2E, todays);
                const bedsUsedP2   = countOccupiedResources('BED',   p2S, p2E, todays);

                let canFit = false;
                for (let k = form.pax; k >= 0; k--) {
                    const j = form.pax - k;
                    if ((cP1 + k <= MAX_RES) && (bedsUsedP1 + j <= MAX_RES) && (bedsUsedP2 + k <= MAX_RES) && (chairsUsedP2 + j <= MAX_RES)) { canFit = true; break; }
                }
                if (!canFit) return { valid: false, reason: "❌ 區域客滿 (Area Full)" };
            } else {
                const type = (form.service.includes('足') || svcInfo.type === 'CHAIR') ? 'CHAIR' : 'BED';
                const freeCount = countOccupiedResources(type, startMins, endMins, todays);
                if (freeCount + form.pax > MAX_RES) return { valid: false, reason: type === 'CHAIR' ? "❌ 足底區客滿" : "❌ 指壓區客滿" };
            }
            return { valid: true, reason: "OK" };
        };

        const performCheck = () => {
            const result = runCheckForTime(form.time, form.date);
            if (result.valid) {
                setCheckResult({ status: 'OK', message: "✅ 目前有空位 (Available Now)" });
                setWaitSuggestion(null);
            } else {
                const [h, m] = form.time.split(':').map(Number);
                let currentTotalMins = h * 60 + m;
                let foundTime = null;
                let foundDate = form.date;
                let waitMins = 0;
                let isNextDay = false;

                for (let i = 1; i <= 18; i++) {
                    const nextMins = currentTotalMins + (i * 10);
                    let nh = Math.floor(nextMins / 60);
                    let nm = nextMins % 60;
                    if (nh >= 24) nh -= 24; 
                    if (nh >= 3 && nh < 8) break; 
                    const mStr = Math.floor(nm / 10) * 10;
                    const nextTimeStr = `${nh.toString().padStart(2,'0')}:${mStr.toString().padStart(2,'0')}`;
                    const nextCheck = runCheckForTime(nextTimeStr, form.date);
                    if (nextCheck.valid) { foundTime = nextTimeStr; waitMins = i * 10; break; }
                }

                if (!foundTime) {
                    const tmr = new Date(form.date); tmr.setDate(tmr.getDate() + 1);
                    const tomorrowStr = tmr.toISOString().slice(0, 10);
                    const morningSlots = ["08:00", "08:10", "08:20"];
                    for (let slot of morningSlots) {
                        if (runCheckForTime(slot, tomorrowStr).valid) { foundTime = slot; foundDate = tomorrowStr; isNextDay = true; break; }
                    }
                }

                if (foundTime) {
                    if (isNextDay) { setCheckResult({ status: 'FAIL', message: "⛔ 今日已滿或打烊 (Full/Closed)" }); setWaitSuggestion({ time: foundTime, date: foundDate, isNextDay: true }); }
                    else { setCheckResult({ status: 'FAIL', message: "⚠️ 目前客滿 (Current Full)" }); setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay: false }); }
                } else {
                    setCheckResult({ status: 'FAIL', message: "❌ 無法安排 (No slots found)" }); setWaitSuggestion(null);
                }
            }
        };

        const handleFinalSave = () => {
            if (!form.custName) { alert("請輸入顧客姓名!"); return; }
            const oilNotes = guestDetails.map((g, i) => g.isOil ? `K${i+1}:油推` : null).filter(Boolean).join(',');
            onSave({
                hoTen: form.custName, sdt: form.custPhone, dichVu: form.service, pax: form.pax,
                ngayDen: form.date.replace(/-/g, '/'), gioDen: form.time,
                nhanVien: guestDetails[0].staff, isOil: guestDetails[0].isOil,
                staffId2: guestDetails[1]?.staff||null, staffId3: guestDetails[2]?.staff||null, staffId4: guestDetails[3]?.staff||null, staffId5: guestDetails[4]?.staff||null, staffId6: guestDetails[5]?.staff||null,
                ghiChu: oilNotes ? `(${oilNotes})` : ""
            });
        };

        const safeStaffList = staffList || [];

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-500 p-4 text-black flex justify-between items-center">
                        <h3 className="font-bold text-lg flex items-center gap-2"><i className="fas fa-bolt"></i> 現場客 (Walk-in)</h3>
                        <button onClick={onClose}><i className="fas fa-times text-xl"></i></button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div><label className="text-xs font-bold text-gray-500">服務項目</label><select className="w-full border p-2 rounded font-bold text-lg" value={form.service} onChange={handleServiceChange}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                                <div><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full border p-2 rounded font-bold text-center" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">指定技師 & 精油</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center font-bold text-xs">{idx+1}</div>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm" value={selectValue} onChange={e=>handleGuestStaffChange(idx, e.target.value)}>
                                                    <option value="隨機">🎲 隨機 (Random)</option>
                                                    <option value="女">🚺 女師傅 (Female)</option>
                                                    <option value="FEMALE_OIL">🚺 女師傅 + 精油 (Female Oil)</option>
                                                    <option value="男">🚹 男師傅 (Male)</option>
                                                    <optgroup label="技師列表">{safeStaffList.map(s=><option key={s.id} value={s.id}>{getStaffDisplayName(s)}</option>)}</optgroup>
                                                </select>
                                                <button onClick={()=> !isFootService && toggleOil(idx)} disabled={isFootService} className={`px-2 py-1 border rounded text-xs font-bold min-w-[70px] ${isFootService ? 'bg-slate-100 text-slate-300' : (g.isOil ? 'bg-purple-600 text-white' : 'bg-white text-gray-500')}`}>{isFootService ? '無精油' : (g.isOil ? '有精油' : '無精油')}</button>
                                            </div>
                                        );
                                    })}
                                </div>
                                {checkResult && (
                                    <div className="space-y-2">
                                        <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>
                                        {waitSuggestion && (
                                            <div className="bg-blue-50 border border-blue-200 p-3 rounded animate-fadeIn text-center">
                                                {waitSuggestion.isNextDay ? (
                                                    <div className="mb-2 font-bold text-orange-600 text-lg">🌅 最早可預約: 明天 {waitSuggestion.time}</div>
                                                ) : (
                                                    <div className="mb-2 font-bold text-blue-700 text-lg">⏳ 需等待 {waitSuggestion.mins} 分鐘 ({waitSuggestion.time})</div>
                                                )}
                                                <button onClick={() => { setForm({...form, time: waitSuggestion.time, date: waitSuggestion.date}); setStep('INFO'); }} className="w-full bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">➡️ 接受安排</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="pt-2 grid grid-cols-2 gap-3">
                                    <button onClick={onClose} className="bg-gray-100 text-gray-500 font-bold p-3 rounded hover:bg-gray-200">取消</button>
                                    {!checkResult || checkResult.status === 'FAIL' ? (<button onClick={performCheck} className="bg-amber-500 text-white font-bold p-3 rounded hover:bg-amber-600 shadow-lg">🔍 檢查空位</button>) : (<button onClick={() => setStep('INFO')} className="bg-emerald-600 text-white font-bold p-3 rounded hover:bg-emerald-700 shadow-lg animate-pulse">➡️ 下一步</button>)}
                                </div>
                            </>
                        )}
                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-amber-50 p-3 rounded border border-amber-200 text-amber-900">
                                    <div className="font-bold text-lg flex justify-between border-b border-amber-200 pb-1 mb-1">
                                        <span>📅 {form.date === todayStr ? '今天 (Today)' : form.date}</span>
                                        <span>⏰ {form.time}</span>
                                    </div>
                                    <div>🔨 {form.service} ({form.pax} 位)</div>
                                    <div className="mt-1 text-xs opacity-70">{guestDetails.map((g,i)=>`#${i+1}:${g.staff}${g.isOil ? '(油)' : ''}`).join(', ')}</div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full border p-3 rounded font-bold text-lg" value={form.custName} onChange={e=>setForm({...form, custName:e.target.value})} autoFocus /></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼</label><input className="w-full border p-3 rounded font-bold text-lg" value={form.custPhone} onChange={e=>setForm({...form, custPhone:e.target.value})} placeholder="09xx..." /></div>
                                <div className="grid grid-cols-2 gap-3 pt-2"><button onClick={() => setStep('CHECK')} className="bg-gray-200 text-gray-600 p-3 rounded font-bold">⬅️ 返回</button><button onClick={handleFinalSave} className="bg-indigo-600 text-white p-3 rounded font-bold hover:bg-indigo-700 shadow-xl">✅ 確認開單</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const overrideInterval = setInterval(() => {
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) {
            window.AvailabilityCheckModal = NewAvailabilityCheckModal;
            console.log("♻️ AvailabilityModal Updated (V24)");
        }
        if (window.WalkInModal !== NewWalkInModal) {
            window.WalkInModal = NewWalkInModal;
            console.log("♻️ WalkInModal Updated (V24 - Robust Resource Check)");
        }
    }, 200);
    setTimeout(() => clearInterval(overrideInterval), 5000);

})();
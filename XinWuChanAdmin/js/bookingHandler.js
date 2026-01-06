// File: js/bookingHandler.js
// Phiên bản: V48 (FULL CODE - NO TRUNCATION - PRICE SYNC & CLEAN UI)

(function() {
    console.log("🚀 BookingHandler V48 (Full Logic): 啟動中...");

    if (typeof React === 'undefined') return;
    const { useState, useEffect, useMemo } = React;

    const HOURS_24 = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
    const MINUTES_10 = ['00', '10', '20', '30', '40', '50'];

    // --- SHARED HELPER FUNCTIONS ---
    const getStaffDisplayName = (s) => {
        if (String(s.id).trim() === String(s.name).trim()) return s.name;
        return `${s.id} - ${s.name}`;
    };

    const getStaffDayStatus = (staff, dateString) => {
        const [y, m, d] = dateString.split('-');
        const keysToTry = [
            `${y}/${m}/${d}`,
            `${y}/${parseInt(m)}/${parseInt(d)}`,
            `${y}/${m}/${parseInt(d)}`,
            `${y}/${parseInt(m)}/${d}`
        ];
        for (const key of keysToTry) {
            if (staff[key] !== undefined) return String(staff[key]).trim().toUpperCase();
        }
        return '';
    };

    const isStaffWorkingAt = (staff, checkMins, dateString) => {
        const dayStatus = getStaffDayStatus(staff, dateString);
        if (dayStatus === 'OFF') return false;

        if (!staff.shiftStart || !staff.shiftEnd) return false;
        if (String(staff.shiftStart).toUpperCase().includes('OFF')) return false;

        const startMins = window.normalizeToTimelineMins(staff.shiftStart);
        const endMins = window.normalizeToTimelineMins(staff.shiftEnd);
        return checkMins >= startMins && checkMins < endMins;
    };

    const getStaffGender = (staff) => {
        if (!staff) return 'UNKNOWN';
        const g = String(staff.gender || '').toUpperCase().trim();
        if (['F', '女', 'FEMALE', 'NU'].includes(g)) return 'F';
        if (['M', '男', 'MALE', 'NAM'].includes(g)) return 'M';
        return 'UNKNOWN';
    };

    const isConsumingFemaleStaff = (booking, staffList) => {
        // A. Cờ hệ thống
        if (booking.isOil === true || booking.isOil === 'true' || booking.oil === true) return true;

        // B. Quét Text
        const textToCheck = (String(booking.serviceName || '') + " " + String(booking.ghiChu || '')).toUpperCase();
        const oilKeywords = ['OIL', 'DẦU', 'DAU', '精油', 'AROMA', '油', '油推'];
        const femaleKeywords = ['NỮ', 'NU', 'FEMALE', '女', 'LADY'];

        if (oilKeywords.some(k => textToCheck.includes(k))) return true;
        if (femaleKeywords.some(k => textToCheck.includes(k))) return true;

        // C. Check nhân viên đã gán
        const sId = booking.staffId || booking.technician || booking.serviceStaff;
        if (sId && sId !== '隨機' && sId !== 'undefined' && !String(sId).includes('Random')) {
            const staffObj = staffList.find(s => s.id == sId || s.name == sId);
            if (staffObj && getStaffGender(staffObj) === 'F') return true;
        }

        return false;
    };

    const isConsumingMaleStaff = (booking, staffList) => {
        const sId = booking.staffId || booking.technician || booking.serviceStaff;
        if (sId && sId !== '隨機' && sId !== 'undefined' && !String(sId).includes('Random')) {
            const staffObj = staffList.find(s => s.id == sId || s.name == sId);
            if (staffObj && getStaffGender(staffObj) === 'M') return true;
        }
        return false;
    };

    const buildDetailedSlotMap = (todayBookings) => {
        const MAX_MINUTES = 3000;
        const CLEANUP_BUFFER = 10;
        const slots = {
            CHAIR: Array.from({length: 7}, () => new Uint8Array(MAX_MINUTES)),
            BED: Array.from({length: 7}, () => new Uint8Array(MAX_MINUTES))
        };

        todayBookings.forEach(b => {
            const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
            const duration = b.duration || 60;
            const rId = String(b.rowId || '').toLowerCase();
            let slotIdx = parseInt(rId.replace(/\D/g, ''));
            if (isNaN(slotIdx) || slotIdx < 1 || slotIdx > 6) return;

            let startType = 'BED';
            if (rId.includes('chair') || rId.includes('足') || (b.serviceName && b.serviceName.includes('足')) || b.type === 'CHAIR') startType = 'CHAIR';

            if (b.category === 'COMBO') {
                const half = duration / 2;
                const switchPoint = bStart + half;
                // Phase 1
                for(let t=bStart; t<switchPoint+CLEANUP_BUFFER; t++) if(t<MAX_MINUTES) slots[startType][slotIdx][t] = 1;
                // Phase 2
                const p2Type = startType === 'CHAIR' ? 'BED' : 'CHAIR';
                for(let t=switchPoint; t<bStart+duration+CLEANUP_BUFFER; t++) if(t<MAX_MINUTES) slots[p2Type][slotIdx][t] = 1;
            } else {
                for(let t=bStart; t<bStart+duration+CLEANUP_BUFFER; t++) if(t<MAX_MINUTES) slots[startType][slotIdx][t] = 1;
            }
        });
        return slots;
    };

    const tryFitMixedServicesTetris = (guestDetails, startMins, slotMapOriginal) => {
        const CLEANUP_BUFFER = 10;
        const slotMap = {
            CHAIR: slotMapOriginal.CHAIR.map(arr => new Uint8Array(arr)),
            BED: slotMapOriginal.BED.map(arr => new Uint8Array(arr))
        };

        const isSlotAvailable = (type, idx, s, e) => {
            const arr = slotMap[type][idx];
            for (let t = s; t < e; t++) if (arr[t] === 1) return false;
            return true;
        };
        const markSlotBusy = (type, idx, s, e) => {
            const arr = slotMap[type][idx];
            for (let t = s; t < e; t++) arr[t] = 1;
        };

        for (let i = 0; i < guestDetails.length; i++) {
            const guest = guestDetails[i];
            const serviceName = guest.service;
            const svcInfo = window.SERVICES_DATA ? window.SERVICES_DATA[serviceName] : {};
            const duration = window.getSafeDuration ? window.getSafeDuration(serviceName, 60) : 60;
            const isCombo = serviceName.includes('套餐') || svcInfo.category === 'COMBO';

            let placed = false;
            if (isCombo) {
                const half = duration / 2;
                const p1End = startMins + half + CLEANUP_BUFFER;
                const p2Start = startMins + half;
                const p2End = startMins + duration + CLEANUP_BUFFER;

                for (let c = 1; c <= 6; c++) {
                    if (isSlotAvailable('CHAIR', c, startMins, p1End)) {
                        for (let b = 1; b <= 6; b++) {
                            if (isSlotAvailable('BED', b, p2Start, p2End)) {
                                markSlotBusy('CHAIR', c, startMins, p1End);
                                markSlotBusy('BED', b, p2Start, p2End);
                                placed = true; break;
                            }
                        }
                    }
                    if (placed) break;
                }
                if (!placed) {
                    for (let b = 1; b <= 6; b++) {
                        if (isSlotAvailable('BED', b, startMins, p1End)) {
                            for (let c = 1; c <= 6; c++) {
                                if (isSlotAvailable('CHAIR', c, p2Start, p2End)) {
                                    markSlotBusy('BED', b, startMins, p1End);
                                    markSlotBusy('CHAIR', c, p2Start, p2End);
                                    placed = true; break;
                                }
                            }
                        }
                        if (placed) break;
                    }
                }
            } else {
                const type = (serviceName.includes('足') || svcInfo.type === 'CHAIR') ? 'CHAIR' : 'BED';
                for (let r = 1; r <= 6; r++) {
                    if (isSlotAvailable(type, r, startMins, startMins + duration + CLEANUP_BUFFER)) {
                        markSlotBusy(type, r, startMins, startMins + duration + CLEANUP_BUFFER);
                        placed = true; break;
                    }
                }
            }
            if (!placed) return false;
        }
        return true;
    };

    // ==================================================================================
    // 1. MODAL ĐẶT LỊCH (NEW AVAILABILITY CHECK MODAL)
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [billMode, setBillMode] = useState('COMBINED');
        const [servicesData, setServicesData] = useState({});

        // Tự động tải dữ liệu giá khi mở modal
        useEffect(() => {
            fetch('/api/info')
                .then(res => res.json())
                .then(data => {
                    if (data.services) {
                        setServicesData(data.services);
                        window.SERVICES_DATA = data.services;
                    }
                })
                .catch(err => console.error("Failed to load services", err));
        }, []);

        const defaultService = window.SERVICES_LIST ? window.SERVICES_LIST[2] : "";

        const [form, setForm] = useState({
            date: initialDate || new Date().toISOString().slice(0, 10),
            time: "12:00",
            pax: 1, custName: '', custPhone: ''
        });

        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

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
                if (num > prev.length) {
                    for (let i = prev.length; i < num; i++) {
                        const templateSvc = prev.length > 0 ? prev[0].service : defaultService;
                        newDetails.push({ service: templateSvc, staff: '隨機', isOil: false });
                    }
                } else { newDetails.length = num; }
                return newDetails;
            });
        };

        const handleGuestServiceChange = (index, newService) => {
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const copy = [...prev];
                copy[index] = { ...copy[index], service: newService };
                if (newService.includes('足')) copy[index].isOil = false;
                return copy;
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

        const checkSlotAvailability = (targetTimeStr) => {
            const startMins = window.normalizeToTimelineMins ? window.normalizeToTimelineMins(targetTimeStr) : 0;
            const safeBookings = bookings || [];
            
            const todays = safeBookings.filter(b => {
                const bDate = b.startTimeString.split(' ')[0].replace(/\//g, '-');
                const targetDate = form.date.replace(/\//g, '-');
                return bDate === targetDate && !b.status.includes('取消') && !b.status.includes('完成') && !b.status.includes('Done');
            });

            const activeStaff = staffList.filter(s => isStaffWorkingAt(s, startMins, form.date));
            const totalActive = activeStaff.length;
            const totalFemales = activeStaff.filter(s => getStaffGender(s) === 'F').length;
            const totalMales = activeStaff.filter(s => getStaffGender(s) === 'M').length;

            let busyTotal = 0;
            let busyFemales = 0;
            let busyMales = 0;

            let maxDuration = 0;
            guestDetails.forEach(g => {
                const d = window.getSafeDuration ? window.getSafeDuration(g.service, 60) : 60;
                if (d > maxDuration) maxDuration = d;
            });
            const checkEndMins = startMins + maxDuration;

            todays.forEach(b => {
                const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                const bEnd = bStart + (b.duration || 60);
                const bPax = parseInt(b.pax) || 1;

                if (Math.max(startMins, bStart) < Math.min(checkEndMins, bEnd)) {
                    busyTotal += bPax;
                    if (isConsumingFemaleStaff(b, staffList)) busyFemales += bPax;
                    else if (isConsumingMaleStaff(b, staffList)) busyMales += bPax;
                }
            });

            let neededFemales = 0;
            let neededMales = 0;

            guestDetails.forEach(g => {
                let isF = false; let isM = false;
                const svcNameUpper = g.service.toUpperCase();
                // Check Oil
                if (['OIL', 'DẦU', '精油', '油', 'AROMA'].some(k => svcNameUpper.includes(k))) isF = true;

                if (g.staff === '女' || g.isOil) isF = true;
                else if (g.staff === '男') isM = true;
                else if (g.staff !== '隨機') {
                    const sObj = staffList.find(s => s.id === g.staff || s.name === g.staff);
                    if (sObj) {
                        if (getStaffGender(sObj) === 'F') isF = true;
                        else if (getStaffGender(sObj) === 'M') isM = true;
                    }
                }
                if (isF) neededFemales++;
                else if (isM) neededMales++;
            });

            // Validation
            const remainingTotal = totalActive - busyTotal;
            if (remainingTotal < form.pax) return { valid: false, reason: `❌ 人手不足 (Total: ${remainingTotal}/${form.pax})` };

            const remainingFemales = Math.max(0, totalFemales - busyFemales);
            if (neededFemales > remainingFemales) return { valid: false, reason: `❌ 女師傅不足 (Female: ${remainingFemales}/${neededFemales})` };

            const remainingMales = Math.max(0, totalMales - busyMales);
            if (neededMales > remainingMales) return { valid: false, reason: `❌ 男師傅不足 (Male: ${remainingMales}/${neededMales})` };

            // KTV Check
            for (let i = 0; i < guestDetails.length; i++) {
                const st = guestDetails[i].staff;
                if (['隨機', '男', '女'].some(k => st.includes(k))) continue;
                const staffObj = staffList.find(s => s.id === st || s.name === st);
                if (staffObj && !isStaffWorkingAt(staffObj, startMins, form.date)) return { valid: false, reason: `❌ 技師 ${st} 休假/未上班` };

                const isBusy = todays.some(b => {
                    const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                    const bEnd = bStart + (b.duration || 60);
                    const overlap = (startMins < bEnd && checkEndMins > bStart);
                    const staffInOrder = [b.serviceStaff, b.staffId, b.technician, b.staffId2, b.staffId3, b.staffId4].map(s=>String(s));
                    return overlap && staffInOrder.some(name => name && (name.includes(st) || st.includes(name)));
                });
                if (isBusy) return { valid: false, reason: `❌ 技師 ${st} 忙碌` };
            }

            const slotMap = buildDetailedSlotMap(todays);
            const canFit = tryFitMixedServicesTetris(guestDetails, startMins, slotMap);
            if (!canFit) return { valid: false, reason: "❌ 區域客滿 (Area Full)" };

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
                    const mStr = Math.floor(nm / 10) * 10;
                    const nextTimeStr = `${nh.toString().padStart(2,'0')}:${mStr.toString().padStart(2,'0')}`;
                    if (checkSlotAvailability(nextTimeStr).valid) { foundSuggestions.push(nextTimeStr); if (foundSuggestions.length >= 4) break; }
                }
                setSuggestions(foundSuggestions);
            }
        };

        // [V47 FIX] Calculate Total Price using SERVICES_DATA from API
        const getServicePrice = (serviceName) => {
            if (!servicesData) return 0;
            // servicesData is object { 'CB_100': {name: '...', price: 999} }
            for (const key in servicesData) {
                // So sánh tên (lấy phần tên chính, bỏ phần giá tiền nếu có)
                if (servicesData[key].name === serviceName || serviceName.includes(servicesData[key].name.split('(')[0])) {
                    return parseInt(servicesData[key].price || 0);
                }
            }
            return 0;
        };

        const calculateTotal = () => {
            let total = 0;
            guestDetails.forEach(g => {
                total += getServicePrice(g.service);
                if (g.isOil) total += 200;
            });
            return total;
        };

        const handleFinalSave = () => {
            if (!form.custName) { alert("請輸入顧客姓名!"); return; }
            const serviceSummary = guestDetails.map(g => g.service).filter((v, i, a) => a.indexOf(v) === i).join(', ');
            const oilNotes = guestDetails.map((g, i) => g.isOil ? `K${i+1}:油推` : null).filter(Boolean).join(',');
            
            onSave({
                hoTen: form.custName, 
                sdt: form.custPhone || "", 
                dichVu: serviceSummary, 
                pax: form.pax,
                ngayDen: form.date.replace(/-/g, '/'), 
                gioDen: form.time,
                nhanVien: guestDetails[0].staff, 
                isOil: guestDetails[0].isOil,
                staffId2: guestDetails[1]?.staff||null, 
                staffId3: guestDetails[2]?.staff||null, 
                staffId4: guestDetails[3]?.staff||null, 
                staffId5: guestDetails[4]?.staff||null, 
                staffId6: guestDetails[5]?.staff||null,
                ghiChu: oilNotes ? `(${oilNotes})` : "", 
                guestDetails: guestDetails
            });
        };

        const safeStaffList = staffList || [];
        const [currentHour, currentMinute] = form.time.split(':');

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
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
                                <div><label className="text-xs font-bold text-gray-500">人數 (Pax)</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">詳細資訊 (Details per Guest)</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestServiceChange(idx, e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={selectValue} onChange={e=>handleGuestStaffChange(idx, e.target.value)}>
                                                    <option value="隨機">🎲 隨機</option>
                                                    <option value="女">🚺 女師傅</option>
                                                    <option value="FEMALE_OIL">🚺 女師傅+油</option>
                                                    <option value="男">🚹 男師傅</option>
                                                    <optgroup label="技師列表">{safeStaffList.map(s=><option key={s.id} value={s.id}>{getStaffDisplayName(s)}</option>)}</optgroup>
                                                </select>
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
                                <div className="bg-green-50 p-3 rounded border border-green-200">
                                    <div className="font-bold text-green-800 text-lg flex justify-between"><span>{form.date}</span><span>{form.time}</span></div>
                                    <div className="text-green-700 font-bold mb-2">{form.pax} 位顧客 - 確認清單</div>
                                    
                                    <div className="flex bg-gray-100 p-1 rounded mb-3 border border-gray-200">
                                        <button onClick={()=>setBillMode('COMBINED')} className={`flex-1 py-1 rounded text-sm font-bold transition ${billMode==='COMBINED'?'bg-white shadow text-green-700':'text-gray-500 hover:bg-gray-200'}`}>🧾 Xem Tổng Gộp</button>
                                        <button onClick={()=>setBillMode('SPLIT')} className={`flex-1 py-1 rounded text-sm font-bold transition ${billMode==='SPLIT'?'bg-white shadow text-blue-700':'text-gray-500 hover:bg-gray-200'}`}>👤 Xem Chi Tiết</button>
                                    </div>

                                    {guestDetails.map((g,i)=> {
                                        const price = getServicePrice(g.service) + (g.isOil?200:0);
                                        return (
                                            <div key={i} className="text-xs text-gray-700 mt-1 border-t border-gray-200 pt-1 flex justify-between items-center">
                                                <span>#{i+1}: {g.service} - {g.staff}{g.isOil ? '(油)' : ''}</span>
                                                {billMode === 'SPLIT' && <span className="font-bold text-blue-600">${price}</span>}
                                            </div>
                                        );
                                    })}
                                    
                                    {billMode === 'COMBINED' && (
                                        <div className="text-xl font-bold text-red-600 text-right mt-2 border-t border-red-200 pt-2">總金額: ${calculateTotal()}</div>
                                    )}
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full border p-3 rounded font-bold" value={form.custName} onChange={e=>setForm({...form, custName:e.target.value})} autoFocus /></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼</label><input className="w-full border p-3 rounded font-bold" value={form.custPhone} onChange={e=>setForm({...form, custPhone:e.target.value})} placeholder="09xx..." /></div>
                                <div className="flex gap-2"><button onClick={()=>setStep('CHECK')} className="flex-1 bg-gray-200 p-3 rounded font-bold">返回</button><button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl">✅ 確認開單</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const NewWalkInModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [waitSuggestion, setWaitSuggestion] = useState(null); 
        const [billMode, setBillMode] = useState('COMBINED'); 
        const [servicesData, setServicesData] = useState({});

        useEffect(() => {
            fetch('/api/info')
                .then(res => res.json())
                .then(data => { if (data.services) setServicesData(data.services); })
                .catch(err => console.error(err));
        }, []);

        const now = new Date();
        const currentTimeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        const todayStr = initialDate || now.toISOString().slice(0, 10);
        const defaultService = window.SERVICES_LIST ? window.SERVICES_LIST[2] : "";

        const [form, setForm] = useState({ pax: 1, custName: '現場客', custPhone: '', time: currentTimeStr, date: todayStr });
        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

        const handlePaxChange = (val) => {
            const num = parseInt(val);
            setForm(prev => ({ ...prev, pax: num })); setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const newDetails = [...prev];
                if (num > prev.length) { for (let i = prev.length; i < num; i++) { const templateSvc = prev.length > 0 ? prev[0].service : defaultService; newDetails.push({ service: templateSvc, staff: '隨機', isOil: false }); } } 
                else { newDetails.length = num; }
                return newDetails;
            });
        };

        const handleGuestServiceChange = (index, newService) => { setCheckResult(null); setWaitSuggestion(null); setGuestDetails(prev => { const copy = [...prev]; copy[index] = { ...copy[index], service: newService }; if (newService.includes('足')) copy[index].isOil = false; return copy; }); };
        const handleGuestStaffChange = (index, value) => { setCheckResult(null); setWaitSuggestion(null); setGuestDetails(prev => { const copy = [...prev]; const current = copy[index]; if (value === 'FEMALE_OIL') { copy[index] = { ...current, staff: '女', isOil: true }; } else if (value === '女') { copy[index] = { ...current, staff: '女', isOil: false }; } else { copy[index] = { ...current, staff: value, isOil: false }; } return copy; }); };

        const runCheckForTime = (timeToCheck, dateToCheck) => {
            const startMins = window.normalizeToTimelineMins ? window.normalizeToTimelineMins(timeToCheck) : 0;
            const safeBookings = bookings || [];
            const todays = safeBookings.filter(b => { const bDate = b.startTimeString.split(' ')[0].replace(/\//g, '-'); const targetDate = dateToCheck.replace(/\//g, '-'); return bDate === targetDate && !b.status.includes('取消'); });
            const activeStaff = staffList.filter(s => isStaffWorkingAt(s, startMins, dateToCheck));
            const totalActive = activeStaff.length; const totalFemales = activeStaff.filter(s => getStaffGender(s) === 'F').length; const totalMales = activeStaff.filter(s => getStaffGender(s) === 'M').length;
            let busyTotal = 0; let busyFemales = 0; let busyMales = 0;
            let maxDuration = 0; guestDetails.forEach(g => { const d = window.getSafeDuration ? window.getSafeDuration(g.service, 60) : 60; if (d > maxDuration) maxDuration = d; });
            const checkEndMins = startMins + maxDuration;
            todays.forEach(b => {
                const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]); const bEnd = bStart + (b.duration || 60); const bPax = parseInt(b.pax) || 1;
                if (Math.max(startMins, bStart) < Math.min(checkEndMins, bEnd)) { busyTotal += bPax; if (isConsumingFemaleStaff(b, staffList)) busyFemales += bPax; else if (isConsumingMaleStaff(b, staffList)) busyMales += bPax; }
            });
            const availTotal = totalActive - busyTotal; const availFemales = Math.max(0, totalFemales - busyFemales); const availMales = Math.max(0, totalMales - busyMales);
            let neededFemales = 0; let neededMales = 0;
            guestDetails.forEach(g => {
                let isF = false; let isM = false; const svcNameUpper = g.service.toUpperCase();
                if (['OIL', 'DẦU', '精油', '油', 'AROMA'].some(k => svcNameUpper.includes(k))) isF = true;
                if (g.staff === '女' || g.isOil) isF = true; else if (g.staff === '男') isM = true;
                else if (g.staff !== '隨機') { const sObj = staffList.find(s => s.id === g.staff || s.name === g.staff); if (sObj) { if (getStaffGender(sObj) === 'F') isF = true; else if (getStaffGender(sObj) === 'M') isM = true; } }
                if (isF) neededFemales++; else if (isM) neededMales++;
            });
            if (availTotal < form.pax) return { valid: false, reason: `❌ 人手不足 (Total: ${availTotal}/${form.pax})` };
            if (neededFemales > availFemales) return { valid: false, reason: `❌ 女師傅不足 (Female: ${availFemales}/${neededFemales})` };
            if (neededMales > availMales) return { valid: false, reason: `❌ 男師傅不足 (Male: ${availMales}/${neededMales})` };
            for (let i = 0; i < guestDetails.length; i++) {
                const st = guestDetails[i].staff; if (['隨機', '男', '女'].some(k => st.includes(k))) continue;
                const staffObj = staffList.find(s => s.id === st || s.name === st);
                if (staffObj && !isStaffWorkingAt(staffObj, startMins, dateToCheck)) return { valid: false, reason: `❌ 技師 ${st} 未上班` };
                const isBusy = todays.some(b => { const bStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]); const bEnd = bStart + (b.duration || 60); const overlap = (startMins < bEnd && checkEndMins > bStart); const staffInOrder = [b.serviceStaff, b.staffId, b.technician, b.staffId2, b.staffId3, b.staffId4].map(s=>String(s)); return overlap && staffInOrder.some(name => name && (name.includes(st) || st.includes(name))); });
                if (isBusy) return { valid: false, reason: `❌ 技師 ${st} 忙碌` };
            }
            const slotMap = buildDetailedSlotMap(todays); const canFit = tryFitMixedServicesTetris(guestDetails, startMins, slotMap);
            if (!canFit) return { valid: false, reason: "❌ 區域客滿 (Area Full)" }; return { valid: true, reason: "OK" };
        };

        const performCheck = () => {
            const result = runCheckForTime(form.time, form.date);
            if (result.valid) { setCheckResult({ status: 'OK', message: "✅ 目前有空位 (Available Now)" }); setWaitSuggestion(null); }
            else {
                const [h, m] = form.time.split(':').map(Number); let currentTotalMins = h * 60 + m; let foundTime = null; let foundDate = form.date; let waitMins = 0; let isNextDay = false;
                for (let i = 1; i <= 18; i++) { const nextMins = currentTotalMins + (i * 10); let nh = Math.floor(nextMins / 60); let nm = nextMins % 60; if (nh >= 24) nh -= 24; const mStr = Math.floor(nm / 10) * 10; const nextTimeStr = `${nh.toString().padStart(2,'0')}:${mStr.toString().padStart(2,'0')}`; const nextCheck = runCheckForTime(nextTimeStr, form.date); if (nextCheck.valid) { foundTime = nextTimeStr; waitMins = i * 10; break; } }
                if (!foundTime) { const tmr = new Date(form.date); tmr.setDate(tmr.getDate() + 1); const tomorrowStr = tmr.toISOString().slice(0, 10); const morningSlots = ["08:00", "08:10", "08:20"]; for (let slot of morningSlots) { if (runCheckForTime(slot, tomorrowStr).valid) { foundTime = slot; foundDate = tomorrowStr; isNextDay = true; break; } } }
                if (foundTime) { if (isNextDay) { setCheckResult({ status: 'FAIL', message: "⛔ 今日已滿或打烊 (Full/Closed)" }); setWaitSuggestion({ time: foundTime, date: foundDate, isNextDay: true }); } else { setCheckResult({ status: 'FAIL', message: "⚠️ 目前客滿 (Current Full)" }); setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay: false }); } } else { setCheckResult({ status: 'FAIL', message: "❌ 無法安排 (No slots found)" }); setWaitSuggestion(null); }
            }
        };

        const getServicePrice = (serviceName) => {
            if (!servicesData) return 0;
            for (const key in servicesData) { if (servicesData[key].name === serviceName || serviceName.includes(servicesData[key].name.split('(')[0])) return parseInt(servicesData[key].price || 0); }
            return 0;
        };
        const calculateTotal = () => { let total = 0; guestDetails.forEach(g => { total += getServicePrice(g.service); if (g.isOil) total += 200; }); return total; };

        const handleFinalSave = () => {
            if (!form.custName) { alert("請輸入顧客姓名!"); return; }
            const serviceSummary = guestDetails.map(g => g.service).filter((v, i, a) => a.indexOf(v) === i).join(', ');
            const oilNotes = guestDetails.map((g, i) => g.isOil ? `K${i+1}:油推` : null).filter(Boolean).join(',');
            onSave({
                hoTen: form.custName, sdt: form.custPhone, dichVu: serviceSummary, pax: form.pax,
                ngayDen: form.date.replace(/-/g, '/'), gioDen: form.time,
                nhanVien: guestDetails[0].staff, isOil: guestDetails[0].isOil,
                staffId2: guestDetails[1]?.staff||null, staffId3: guestDetails[2]?.staff||null, staffId4: guestDetails[3]?.staff||null, staffId5: guestDetails[4]?.staff||null, staffId6: guestDetails[5]?.staff||null,
                ghiChu: oilNotes ? `(${oilNotes})` : "", guestDetails: guestDetails
            });
        };

        const safeStaffList = staffList || [];

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-500 p-4 text-black flex justify-between items-center">
                        <h3 className="font-bold text-lg flex items-center gap-2"><i className="fas fa-bolt"></i> 現場客 (Walk-in)</h3>
                        <button onClick={onClose}><i className="fas fa-times text-xl"></i></button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div><label className="text-xs font-bold text-gray-500">人數 (Pax)</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">詳細資訊 (Details per Guest)</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestServiceChange(idx, e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={selectValue} onChange={e=>handleGuestStaffChange(idx, e.target.value)}>
                                                    <option value="隨機">🎲 隨機</option>
                                                    <option value="女">🚺 女師傅</option>
                                                    <option value="FEMALE_OIL">🚺 女師傅+油</option>
                                                    <option value="男">🚹 男師傅</option>
                                                    <optgroup label="技師列表">{safeStaffList.map(s=><option key={s.id} value={s.id}>{getStaffDisplayName(s)}</option>)}</optgroup>
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>
                                {checkResult && (
                                    <div className="space-y-2">
                                        <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>
                                        {waitSuggestion && (
                                            <div className="bg-blue-50 border border-blue-200 p-3 rounded animate-fadeIn text-center">
                                                {waitSuggestion.isNextDay ? ( <div className="mb-2 font-bold text-orange-600 text-lg">🌅 最早可預約: 明天 {waitSuggestion.time}</div> ) : ( <div className="mb-2 font-bold text-blue-700 text-lg">⏳ 需等待 {waitSuggestion.mins} 分鐘 ({waitSuggestion.time})</div> )}
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
                                <div className="bg-green-50 p-3 rounded border border-green-200">
                                    <div className="font-bold text-green-800 text-lg flex justify-between"><span>{form.date}</span><span>{form.time}</span></div>
                                    <div className="text-green-700 font-bold mb-2">{form.pax} 位顧客 - 確認清單</div>
                                    
                                    <div className="flex bg-gray-100 p-1 rounded mb-3 border border-gray-200">
                                        <button onClick={()=>setBillMode('COMBINED')} className={`flex-1 py-1 rounded text-sm font-bold transition ${billMode==='COMBINED'?'bg-white shadow text-green-700':'text-gray-500 hover:bg-gray-200'}`}>🧾 Xem Tổng Gộp</button>
                                        <button onClick={()=>setBillMode('SPLIT')} className={`flex-1 py-1 rounded text-sm font-bold transition ${billMode==='SPLIT'?'bg-white shadow text-blue-700':'text-gray-500 hover:bg-gray-200'}`}>👤 Xem Chi Tiết</button>
                                    </div>

                                    {guestDetails.map((g,i)=> {
                                        const price = getServicePrice(g.service) + (g.isOil?200:0);
                                        return (
                                            <div key={i} className="text-xs text-gray-700 mt-1 border-t border-gray-200 pt-1 flex justify-between items-center">
                                                <span>#{i+1}: {g.service} - {g.staff}{g.isOil ? '(油)' : ''}</span>
                                                {billMode === 'SPLIT' && <span className="font-bold text-blue-600">${price}</span>}
                                            </div>
                                        );
                                    })}
                                    
                                    {billMode === 'COMBINED' && (
                                        <div className="text-xl font-bold text-red-600 text-right mt-2 border-t border-red-200 pt-2">總金額: ${calculateTotal()}</div>
                                    )}
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full border p-3 rounded font-bold" value={form.custName} onChange={e=>setForm({...form, custName:e.target.value})} autoFocus /></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼</label><input className="w-full border p-3 rounded font-bold" value={form.custPhone} onChange={e=>setForm({...form, custPhone:e.target.value})} placeholder="09xx..." /></div>
                                <div className="flex gap-2"><button onClick={()=>setStep('CHECK')} className="flex-1 bg-gray-200 p-3 rounded font-bold">返回</button><button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl">✅ 確認開單</button></div>
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
            console.log("♻️ AvailabilityModal Updated (V47)");
        }
        if (window.WalkInModal !== NewWalkInModal) {
            window.WalkInModal = NewWalkInModal;
            console.log("♻️ WalkInModal Updated (V47 - Full Logic)");
        }
    }, 200);
    setTimeout(() => clearInterval(overrideInterval), 5000);

})();
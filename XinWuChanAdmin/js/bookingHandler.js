// File: js/bookingHandler.js
// Version: V47 (Resource Guard Edition - Frontend Simulation)
// Author: AI Assistant
// Date: 2026/01/07
// Note: Complete rewrite to match Backend V160 logic. Strict timeline simulation to prevent overlapping.

(function() {
    console.log("🚀 BookingHandler V47 (Resource Guard): 系統啟動中...");

    if (typeof React === 'undefined') return;
    const { useState, useEffect, useMemo } = React;

    // --- 常量定義 ---
    const MAX_CHAIRS = 6;
    const MAX_BEDS = 6;
    const MAX_TIMELINE_MINUTES = 3000; // 覆蓋約 50 小時 (足夠處理跨日訂單)
    const CLEANUP_BUFFER = 10;         // 清潔緩衝時間 (分鐘)
    const FUTURE_BUFFER_MINS = 5;      // 未來緩衝 (防止預約過去時間)

    const HOURS_24 = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
    const MINUTES_10 = ['00', '10', '20', '30', '40', '50'];

    // --- 輔助函數 (Helper Functions) ---

    // 格式化顯示技師名稱
    const getStaffDisplayName = (s) => {
        if (String(s.id).trim() === String(s.name).trim()) return s.name;
        return `${s.id} - ${s.name}`;
    };

    // 時間字串轉分鐘 (08:00 -> 480)
    const getMinsFromTimeStr = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        // 如果小於 08:00，視為跨日 (例如 01:00 -> 25:00)
        const effectiveH = (h < 8) ? h + 24 : h;
        return effectiveH * 60 + (m || 0);
    };

    // 檢查技師是否休假 (OFF)
    const getStaffDayStatus = (staff, dateString) => {
        if (!staff) return '';
        const standardizedDate = dateString.replace(/-/g, '/'); // 統一格式 YYYY/MM/DD

        // 1. 優先檢查後端的 offDays 陣列
        if (staff.offDays && Array.isArray(staff.offDays)) {
            if (staff.offDays.includes(standardizedDate)) return 'OFF';
        }

        // 2. 備用檢查 (檢查舊格式)
        const [y, m, d] = dateString.split('-');
        const keysToTry = [
            `${y}-${m}-${d}`,
            `${y}/${m}/${d}`,
            `${y}/${parseInt(m)}/${parseInt(d)}`,
            `${y}-${parseInt(m)}-${parseInt(d)}`
        ];
        for (const key of keysToTry) {
            if (staff[key] !== undefined) {
                const val = String(staff[key]).trim().toUpperCase();
                if (val === 'OFF' || val === '休') return 'OFF';
            }
        }
        return ''; 
    };

    // 檢查技師在特定時間是否上班
    const isStaffWorkingAt = (staff, checkMins, dateString) => {
        const dayStatus = getStaffDayStatus(staff, dateString);
        if (dayStatus === 'OFF' || dayStatus === '休') return false;

        if (!staff.shiftStart || !staff.shiftEnd) return true; // 默認上班
        if (String(staff.shiftStart).toUpperCase().includes('OFF')) return false;

        const startMins = getMinsFromTimeStr(staff.shiftStart);
        const endMins = getMinsFromTimeStr(staff.shiftEnd);
        
        // 處理跨日班表 (例如 14:00 - 02:00)
        if (endMins < startMins) {
            const adjustedEnd = endMins + (24 * 60);
            return checkMins >= startMins && checkMins < adjustedEnd;
        } else {
            return checkMins >= startMins && checkMins < endMins;
        }
    };

    // 獲取性別
    const getStaffGender = (staff) => {
        if (!staff) return 'UNKNOWN';
        const g = String(staff.gender || '').toUpperCase().trim();
        if (['F', '女', 'FEMALE', 'NU'].includes(g)) return 'F';
        if (['M', '男', 'MALE', 'NAM'].includes(g)) return 'M';
        return 'UNKNOWN';
    };

    // 檢查是否佔用女技師資源 (油推/指定女)
    const isConsumingFemaleStaff = (booking, staffList) => {
        if (booking.isOil === true || booking.isOil === 'true' || booking.oil === true) return true;
        const textToCheck = (String(booking.serviceName || '') + " " + String(booking.ghiChu || '')).toUpperCase();
        const oilKeywords = ['OIL', 'DẦU', 'DAU', '精油', 'AROMA', '油', '油推']; 
        const femaleKeywords = ['NỮ', 'NU', 'FEMALE', '女', 'LADY'];
        if (oilKeywords.some(k => textToCheck.includes(k))) return true;
        if (femaleKeywords.some(k => textToCheck.includes(k))) return true;
        const sId = booking.staffId || booking.technician || booking.serviceStaff;
        if (sId && sId !== '隨機' && !String(sId).includes('Random')) {
            const staffObj = staffList.find(s => s.id == sId || s.name == sId);
            if (staffObj && getStaffGender(staffObj) === 'F') return true;
        }
        return false;
    };

    const isConsumingMaleStaff = (booking, staffList) => {
        const sId = booking.staffId || booking.serviceStaff;
        if (sId && sId !== '隨機' && !String(sId).includes('Random')) {
            const staffObj = staffList.find(s => s.id == sId || s.name == sId);
            if (staffObj && getStaffGender(staffObj) === 'M') return true;
        }
        return false;
    };

    // ==================================================================================
    // 核心邏輯: TETRIS SIMULATION ENGINE (前端模擬引擎)
    // ==================================================================================

    // 1. 初始化空地圖
    const createEmptySlotMap = () => ({
        CHAIR: Array.from({length: MAX_CHAIRS + 1}, () => new Uint8Array(MAX_TIMELINE_MINUTES)), 
        BED: Array.from({length: MAX_BEDS + 1}, () => new Uint8Array(MAX_TIMELINE_MINUTES)) 
    });

    // 2. 檢查區間是否空閒
    const isRangeFree = (slotArray, rowIdx, start, end) => {
        if (rowIdx < 1 || rowIdx >= slotArray.length) return false;
        for (let t = start; t < end; t++) {
            if (t >= MAX_TIMELINE_MINUTES) break;
            if (slotArray[rowIdx][t] === 1) return false; // 已被佔用
        }
        return true;
    };

    // 3. 標記區間為忙碌
    const markRangeBusy = (slotArray, rowIdx, start, end) => {
        if (rowIdx < 1 || rowIdx >= slotArray.length) return;
        for (let t = start; t < end; t++) {
            if (t >= MAX_TIMELINE_MINUTES) break;
            slotArray[rowIdx][t] = 1;
        }
    };

    // 4. 嘗試將一個訂單放入地圖 (Tetris Fit)
    // 返回 true 如果成功放入, false 如果無處可放
    const placeBookingOnMap = (booking, slotMap) => {
        const bStart = getMinsFromTimeStr(booking.startTimeString.split(' ')[1]);
        const duration = booking.duration || 60;
        
        // 判斷是否為套餐 (COMBO)
        const isCombo = (booking.category === 'COMBO') || (booking.serviceName && booking.serviceName.includes('套餐'));
        
        if (isCombo) {
            const half = duration / 2;
            // 第一階段: 腳底 (Chair)
            const p1Start = bStart;
            const p1End = p1Start + half + CLEANUP_BUFFER;
            // 第二階段: 身體 (Bed)
            const p2Start = p1Start + half;
            const p2End = p2Start + half + CLEANUP_BUFFER;

            // 尋找空閒椅子
            let foundChair = -1;
            for (let c = 1; c <= MAX_CHAIRS; c++) {
                if (isRangeFree(slotMap.CHAIR, c, p1Start, p1End)) { foundChair = c; break; }
            }
            if (foundChair === -1) return false; // 沒椅子

            // 尋找空閒床位
            let foundBed = -1;
            for (let b = 1; b <= MAX_BEDS; b++) {
                if (isRangeFree(slotMap.BED, b, p2Start, p2End)) { foundBed = b; break; }
            }
            if (foundBed === -1) return false; // 沒床位

            // 標記佔用
            markRangeBusy(slotMap.CHAIR, foundChair, p1Start, p1End);
            markRangeBusy(slotMap.BED, foundBed, p2Start, p2End);
            return true;
        } else {
            // 單一項目
            let type = 'BED';
            if (booking.type === 'CHAIR' || (booking.serviceName && booking.serviceName.includes('足'))) type = 'CHAIR';
            
            const effectiveEnd = bStart + duration + CLEANUP_BUFFER;
            const targetArray = slotMap[type];
            const maxSlots = type === 'CHAIR' ? MAX_CHAIRS : MAX_BEDS;

            for (let r = 1; r <= maxSlots; r++) {
                if (isRangeFree(targetArray, r, bStart, effectiveEnd)) {
                    markRangeBusy(targetArray, r, bStart, effectiveEnd);
                    return true;
                }
            }
            return false; // 沒位置
        }
    };

    // 5. 模擬當天現況 (Simulate Current Reality)
    const simulateDayState = (existingBookings, targetDateStr) => {
        const slotMap = createEmptySlotMap();
        
        // 過濾當天訂單
        const todays = existingBookings.filter(b => {
            const bDate = b.startTimeString.split(' ')[0].replace(/\//g, '-');
            const tDate = targetDateStr.replace(/\//g, '-');
            return bDate === tDate && !b.status.includes('取消') && !b.status.includes('Cancelled') && !b.status.includes('完成');
        });

        // 排序訂單 (從早到晚)，確保模擬順序正確
        todays.sort((a, b) => {
            return getMinsFromTimeStr(a.startTimeString.split(' ')[1]) - getMinsFromTimeStr(b.startTimeString.split(' ')[1]);
        });

        // 將現有訂單填入地圖
        todays.forEach(b => {
            placeBookingOnMap(b, slotMap); 
            // 注意: 即使現有訂單在現實中重疊 (數據錯誤)，這裡也會盡量填入。
            // 我們的目標是檢查 "新訂單" 是否還塞得進去。
        });

        return slotMap;
    };

    // ==================================================================================
    // 1. MODAL 新增預約 (NEW AVAILABILITY CHECK MODAL)
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const defaultService = window.SERVICES_LIST ? window.SERVICES_LIST[2] : "🔥 招牌套餐 (100分)";

        const [form, setForm] = useState({
            date: initialDate || new Date().toISOString().slice(0, 10), 
            time: "12:00",
            pax: 1, custName: '', custPhone: ''
        });

        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

        // 處理時間變更
        const handleTimeChange = (type, value) => {
            const [h, m] = form.time.split(':');
            let newTime = form.time;
            if (type === 'HOUR') newTime = `${value}:${m}`;
            if (type === 'MINUTE') newTime = `${h}:${value}`;
            setForm(prev => ({ ...prev, time: newTime }));
            setCheckResult(null); setSuggestions([]);
        };

        // 處理人數變更
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

        // --- 核心檢查函數 (Core Check Function) ---
        const checkSlotAvailability = (targetTimeStr) => {
            const startMins = getMinsFromTimeStr(targetTimeStr);
            const todays = bookings.filter(b => {
                const bDate = b.startTimeString.split(' ')[0].replace(/\//g, '-');
                const targetDate = form.date.replace(/\//g, '-');
                return bDate === targetDate && !b.status.includes('取消') && !b.status.includes('完成');
            });

            // 1. 人力檢查 (Staff Capacity)
            const activeStaff = staffList.filter(s => isStaffWorkingAt(s, startMins, form.date));
            const totalActive = activeStaff.length;
            const totalFemales = activeStaff.filter(s => getStaffGender(s) === 'F').length;
            const totalMales = activeStaff.filter(s => getStaffGender(s) === 'M').length;

            // 計算當前忙碌人數 (粗略估計)
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
                const bStart = getMinsFromTimeStr(b.startTimeString.split(' ')[1]);
                const bDuration = b.duration || 60;
                const bEnd = bStart + bDuration;
                if (Math.max(startMins, bStart) < Math.min(checkEndMins, bEnd)) {
                    const bPax = parseInt(b.pax) || 1;
                    busyTotal += bPax;
                    if (isConsumingFemaleStaff(b, staffList)) busyFemales += bPax;
                    else if (isConsumingMaleStaff(b, staffList)) busyMales += bPax;
                }
            });

            // 需求計算
            let neededFemales = 0;
            let neededMales = 0;
            guestDetails.forEach(g => {
                let isF = false; let isM = false;
                if (g.staff === '女' || g.isOil) isF = true;
                else if (g.staff === '男') isM = true;
                else if (g.staff !== '隨機') {
                    const sObj = staffList.find(s => s.id === g.staff || s.name === g.staff);
                    if (sObj) {
                        if (getStaffGender(sObj) === 'F') isF = true;
                        else if (getStaffGender(sObj) === 'M') isM = true;
                    }
                }
                if (isF) neededFemales++; else if (isM) neededMales++;
            });

            const remainingTotal = Math.max(0, totalActive - busyTotal);
            if (remainingTotal < form.pax) return { valid: false, reason: `❌ 人手不足 (剩餘: ${remainingTotal}/${form.pax})` };
            
            const remainingFemales = Math.max(0, totalFemales - busyFemales);
            if (neededFemales > remainingFemales) return { valid: false, reason: `❌ 女師傅不足 (剩餘: ${remainingFemales}/${neededFemales})` };

            const remainingMales = Math.max(0, totalMales - busyMales);
            if (neededMales > remainingMales) return { valid: false, reason: `❌ 男師傅不足 (剩餘: ${remainingMales}/${neededMales})` };

            // 2. 指定技師檢查 (Specific Staff Check)
            for (let i = 0; i < guestDetails.length; i++) {
                const st = guestDetails[i].staff;
                if (['隨機', '男', '女'].some(k => st.includes(k))) continue;
                
                const staffObj = staffList.find(s => s.id === st || s.name === st);
                if (staffObj && !isStaffWorkingAt(staffObj, startMins, form.date)) return { valid: false, reason: `❌ 技師 ${st} 休假/未上班` };
                
                const isBusy = todays.some(b => {
                    const bStart = getMinsFromTimeStr(b.startTimeString.split(' ')[1]);
                    const bEnd = bStart + (b.duration || 60);
                    const overlap = (startMins < bEnd && checkEndMins > bStart);
                    const staffInOrder = [b.serviceStaff, b.staffId, b.technician, b.staffId2, b.staffId3, b.staffId4].map(s=>String(s));
                    return overlap && staffInOrder.some(name => name && (name.includes(st) || st.includes(name)));
                });
                if (isBusy) return { valid: false, reason: `❌ 技師 ${st} 忙碌中` };
            }

            // 3. 資源模擬檢查 (Simulation / Tetris Check) - 最重要的一步
            // 重建當天時間軸地圖
            const slotMap = simulateDayState(bookings, form.date);
            
            // 嘗試將新客人放入地圖
            for (const guest of guestDetails) {
                // 構建臨時訂單對象
                const svcInfo = window.SERVICES_DATA ? window.SERVICES_DATA[guest.service] : {};
                const tempBooking = {
                    startTimeString: `2000/01/01 ${targetTimeStr}`, // 日期不重要，只取時間
                    duration: window.getSafeDuration ? window.getSafeDuration(guest.service, 60) : 60,
                    category: (guest.service.includes('套餐') || svcInfo?.category === 'COMBO') ? 'COMBO' : 'NORMAL',
                    type: (guest.service.includes('足') || svcInfo?.type === 'CHAIR') ? 'CHAIR' : 'BED',
                    serviceName: guest.service
                };

                const success = placeBookingOnMap(tempBooking, slotMap);
                if (!success) return { valid: false, reason: "❌ 區域客滿 (沒椅子/沒床位)" };
            }

            return { valid: true, reason: "OK" };
        };

        const performCheck = () => {
            const result = checkSlotAvailability(form.time);
            if (result.valid) { setCheckResult({ status: 'OK', message: "✅ 此時段可以預約 (Available)" }); setSuggestions([]); }
            else {
                setCheckResult({ status: 'FAIL', message: result.reason });
                // 尋找鄰近建議時段
                const foundSuggestions = [];
                const [startH, startM] = form.time.split(':').map(Number);
                let currentTotalMins = startH * 60 + startM;
                for (let i = 1; i <= 24; i++) { // 往後查 4 小時
                    const nextMins = currentTotalMins + (i * 10);
                    let h = Math.floor(nextMins / 60); let m = nextMins % 60;
                    if (h >= 24) h -= 24; 
                    const mStr = Math.floor(m / 10) * 10;
                    const nextTimeStr = `${h.toString().padStart(2,'0')}:${mStr.toString().padStart(2,'0')}`;
                    if (checkSlotAvailability(nextTimeStr).valid) { foundSuggestions.push(nextTimeStr); if (foundSuggestions.length >= 4) break; }
                }
                setSuggestions(foundSuggestions);
            }
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
                                <div>
                                    <label className="text-xs font-bold text-gray-500">人數 (Pax)</label>
                                    <select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select>
                                </div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">詳細資訊 (Details per Guest)</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestServiceChange(idx, e.target.value)}>
                                                    {(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={selectValue} onChange={e=>handleGuestStaffChange(idx, e.target.value)}>
                                                    <option value="隨機">🎲 隨機 (Random)</option>
                                                    <option value="女">🚺 女師傅 (Female)</option>
                                                    <option value="FEMALE_OIL">🚺 女師傅 + 精油 (Female Oil)</option>
                                                    <option value="男">🚹 男師傅 (Male)</option>
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
                                    <div className="text-green-700">{form.pax} 位顧客</div>
                                    {guestDetails.map((g,i)=> (
                                        <div key={i} className="text-xs text-green-600 mt-1 border-t border-green-100 pt-1">
                                            #{i+1}: {g.service} - {g.staff}{g.isOil ? '(油)' : ''}
                                        </div>
                                    ))}
                                </div>
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
    // 2. MODAL 現場客 (NEW WALKIN MODAL)
    // ==================================================================================
    const NewWalkInModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [waitSuggestion, setWaitSuggestion] = useState(null); 

        const now = new Date();
        const currentTimeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        const todayStr = initialDate || now.toISOString().slice(0, 10);
        const defaultService = window.SERVICES_LIST ? window.SERVICES_LIST[2] : "🔥 招牌套餐 (100分)";

        const [form, setForm] = useState({
            pax: 1, custName: '現場客', custPhone: '', time: currentTimeStr, date: todayStr
        });

        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

        const handlePaxChange = (val) => {
            const num = parseInt(val);
            setForm(prev => ({ ...prev, pax: num }));
            setCheckResult(null); setWaitSuggestion(null);
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
            setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const copy = [...prev];
                copy[index] = { ...copy[index], service: newService };
                if (newService.includes('足')) copy[index].isOil = false;
                return copy;
            });
        };

        const handleGuestStaffChange = (index, value) => {
            setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const copy = [...prev];
                const current = copy[index];
                if (value === 'FEMALE_OIL') { copy[index] = { ...current, staff: '女', isOil: true }; } 
                else if (value === '女') { copy[index] = { ...current, staff: '女', isOil: false }; } 
                else { copy[index] = { ...current, staff: value, isOil: false }; }
                return copy;
            });
        };

        const runCheckForTime = (timeToCheck, dateToCheck) => {
            const startMins = getMinsFromTimeStr(timeToCheck);
            const todays = bookings.filter(b => {
                const bDate = b.startTimeString.split(' ')[0].replace(/\//g, '-');
                const targetDate = dateToCheck.replace(/\//g, '-');
                return bDate === targetDate && !b.status.includes('取消') && !b.status.includes('完成');
            });

            // 1. Staff Check
            const activeStaff = staffList.filter(s => isStaffWorkingAt(s, startMins, dateToCheck));
            const totalActive = activeStaff.length;
            
            // 快速估算忙碌人數 (Basic Count)
            let busyTotal = 0;
            let maxDuration = 0;
            guestDetails.forEach(g => {
                const d = window.getSafeDuration ? window.getSafeDuration(g.service, 60) : 60;
                if (d > maxDuration) maxDuration = d;
            });
            const checkEndMins = startMins + maxDuration;

            todays.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTimeString.split(' ')[1]);
                const bEnd = bStart + (b.duration || 60);
                if (Math.max(startMins, bStart) < Math.min(checkEndMins, bEnd)) {
                    busyTotal += (parseInt(b.pax) || 1);
                }
            });

            if ((totalActive - busyTotal) < form.pax) return { valid: false, reason: `❌ 人手不足 (剩餘: ${totalActive - busyTotal})` };

            // 2. Resource Simulation (嚴格模擬檢查)
            const slotMap = simulateDayState(bookings, dateToCheck);
            for (const guest of guestDetails) {
                const svcInfo = window.SERVICES_DATA ? window.SERVICES_DATA[guest.service] : {};
                const tempBooking = {
                    startTimeString: `2000/01/01 ${timeToCheck}`,
                    duration: window.getSafeDuration ? window.getSafeDuration(guest.service, 60) : 60,
                    category: (guest.service.includes('套餐') || svcInfo?.category === 'COMBO') ? 'COMBO' : 'NORMAL',
                    type: (guest.service.includes('足') || svcInfo?.type === 'CHAIR') ? 'CHAIR' : 'BED',
                    serviceName: guest.service
                };
                if (!placeBookingOnMap(tempBooking, slotMap)) {
                    return { valid: false, reason: "❌ 區域客滿 (椅子/床位不足)" };
                }
            }

            return { valid: true, reason: "OK" };
        };

        const performCheck = () => {
            const result = runCheckForTime(form.time, form.date);
            if (result.valid) {
                setCheckResult({ status: 'OK', message: "✅ 目前有空位 (Available Now)" });
                setWaitSuggestion(null);
            } else {
                // 自動尋找下一時段
                const [h, m] = form.time.split(':').map(Number);
                let currentTotalMins = h * 60 + m;
                let foundTime = null;
                let foundDate = form.date;
                let waitMins = 0;
                let isNextDay = false;

                // 往後找 3 小時 (每10分鐘)
                for (let i = 1; i <= 18; i++) {
                    const nextMins = currentTotalMins + (i * 10);
                    let nh = Math.floor(nextMins / 60);
                    let nm = nextMins % 60;
                    if (nh >= 24) nh -= 24; 
                    const mStr = Math.floor(nm / 10) * 10;
                    const nextTimeStr = `${nh.toString().padStart(2,'0')}:${mStr.toString().padStart(2,'0')}`;
                    const nextCheck = runCheckForTime(nextTimeStr, form.date);
                    if (nextCheck.valid) { foundTime = nextTimeStr; waitMins = i * 10; break; }
                }

                // 如果今天沒空位，找明天早上
                if (!foundTime) {
                    const tmr = new Date(form.date);
                    tmr.setDate(tmr.getDate() + 1);
                    const tomorrowStr = tmr.toISOString().slice(0, 10);
                    const morningSlots = ["08:00", "08:10", "08:20"];
                    for (let slot of morningSlots) {
                        if (runCheckForTime(slot, tomorrowStr).valid) { foundTime = slot; foundDate = tomorrowStr; isNextDay = true; break; }
                    }
                }

                if (foundTime) {
                    if (isNextDay) { setCheckResult({ status: 'FAIL', message: "⛔ 今日已滿 (Today Full)" }); setWaitSuggestion({ time: foundTime, date: foundDate, isNextDay: true }); }
                    else { setCheckResult({ status: 'FAIL', message: "⚠️ 目前客滿 (Current Full)" }); setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay: false }); }
                } else {
                    setCheckResult({ status: 'FAIL', message: "❌ 無法安排 (No slots found)" });
                    setWaitSuggestion(null);
                }
            }
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
                                <div>
                                    <label className="text-xs font-bold text-gray-500">人數 (Pax)</label>
                                    <select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select>
                                </div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">詳細資訊 (Details per Guest)</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestServiceChange(idx, e.target.value)}>
                                                    {(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={selectValue} onChange={e=>handleGuestStaffChange(idx, e.target.value)}>
                                                    <option value="隨機">🎲 隨機 (Random)</option>
                                                    <option value="女">🚺 女師傅 (Female)</option>
                                                    <option value="FEMALE_OIL">🚺 女師傅 + 精油 (Female Oil)</option>
                                                    <option value="男">🚹 男師傅 (Male)</option>
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
                                    <div className="text-amber-800">{form.pax} 位顧客</div>
                                    {guestDetails.map((g,i)=> (
                                        <div key={i} className="text-xs text-amber-700 mt-1 border-t border-amber-200 pt-1">
                                            #{i+1}: {g.service} - {g.staff}{g.isOil ? '(油)' : ''}
                                        </div>
                                    ))}
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

    // 掛載 Modal 到全局 (Mount to Global)
    const overrideInterval = setInterval(() => {
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) {
            window.AvailabilityCheckModal = NewAvailabilityCheckModal;
            console.log("♻️ AvailabilityModal Updated (V47)");
        }
        if (window.WalkInModal !== NewWalkInModal) {
            window.WalkInModal = NewWalkInModal;
            console.log("♻️ WalkInModal Updated (V47 - Resource Guard)");
        }
    }, 200);
    setTimeout(() => clearInterval(overrideInterval), 5000);

})();
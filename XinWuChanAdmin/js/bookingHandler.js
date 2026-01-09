/**
 * ============================================================================
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V82 (UPDATE: CORE KERNEL V3.4 STABLE)
 * NGÀY CẬP NHẬT: 2026-01-10
 * TÁC GIẢ: AI ASSISTANT & USER
 * * * * * TÍNH NĂNG MỚI (V82):
 * 1. [CORE V3.4] Nhúng bộ não mới nhất để đồng bộ với Backend.
 * 2. [STRICT TIME] Frontend giờ đây đã hiểu luật "Về đúng giờ". Nếu khách chọn
 * khung giờ lố giờ về của nhân viên (có tick), Frontend sẽ báo đỏ ngay lập tức.
 * 3. [SMART COMBO] Tự động tách Combo thành 2 giai đoạn (Ghế -> Giường) để tính toán chuẩn xác.
 * ============================================================================
 */

(function() {
    console.log("🚀 BookingHandler V82: Initializing with CORE V3.4 (Strict Time & Smart Combo)...");

    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React not found. Cannot start BookingHandler.");
        return;
    }

    // ========================================================================
    // PHẦN 1: CORE KERNEL V3.4 (EMBEDDED)
    // Copy nguyên bản logic từ resource_core.js sang đây để chạy Client-side
    // ========================================================================
    const CoreKernel = (function() {
        // --- 1. CẤU HÌNH HỆ THỐNG ---
        const CONFIG = {
            MAX_CHAIRS: 6,        
            MAX_BEDS: 6,          
            MAX_TOTAL_GUESTS: 12, 
            
            OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
            CLEANUP_BUFFER: 5,    // Dọn dẹp 5p
            TRANSITION_BUFFER: 5, // Di chuyển 5p
            
            TOLERANCE: 1,         // Dung sai 1p
            MAX_TIMELINE_MINS: 1440 
        };

        let SERVICES = {}; 

        // --- 2. QUẢN LÝ DỊCH VỤ ---
        function setDynamicServices(newServicesObj) {
            const systemServices = {
                'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
                'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
                'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
                'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
            };
            SERVICES = { ...newServicesObj, ...systemServices };
            // console.log(`[KERNEL V3.4] Services Updated: ${Object.keys(SERVICES).length} entries.`);
        }

        // --- 3. BỘ CÔNG CỤ THỜI GIAN ---
        function getMinsFromTimeStr(timeStr) {
            if (!timeStr) return -1; 
            try {
                let cleanStr = timeStr.toString().trim().replace(/：/g, ':');
                const parts = cleanStr.split(':');
                if (parts.length < 2) return -1;
                let h = parseInt(parts[0], 10);
                let m = parseInt(parts[1], 10);
                if (isNaN(h) || isNaN(m)) return -1;
                // Xử lý qua đêm
                if (h < CONFIG.OPEN_HOUR) h += 24; 
                return (h * 60) + m;
            } catch (e) { return -1; }
        }

        function getTimeStrFromMins(mins) {
            let h = Math.floor(mins / 60);
            let m = mins % 60;
            if (h >= 24) h -= 24; 
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

        function isOverlap(startA, endA, startB, endB) {
            const safeEndA = endA - CONFIG.TOLERANCE; 
            const safeEndB = endB - CONFIG.TOLERANCE;
            return (startA < safeEndB) && (startB < safeEndA);
        }

        // --- 4. KIỂM TRA TÀI NGUYÊN (RESOURCE CHECK) ---
        function checkResourceCapacity(resourceType, start, end, bookings) {
            let limit = 0;
            if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
            else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
            else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
            else return true; 

            let points = [];
            for (const bk of bookings) {
                let isRelevant = (resourceType === 'TOTAL') ? true : (bk.resourceType === resourceType);
                if (isRelevant && isOverlap(start, end, bk.start, bk.end)) {
                    let pStart = Math.max(start, bk.start);
                    let pEnd = Math.min(end, bk.end);
                    if (pEnd - pStart > CONFIG.TOLERANCE) {
                        points.push({ time: pStart, type: 'start' });
                        points.push({ time: pEnd, type: 'end' });
                    }
                }
            }

            if (points.length === 0) return true; 
            points.sort((a, b) => (a.time === b.time) ? (a.type === 'start' ? -1 : 1) : (a.time - b.time));

            let currentLoad = 0;
            for (const p of points) {
                if (p.type === 'start') currentLoad++; else currentLoad--;
                if (currentLoad >= limit) return false; 
            }
            return true; 
        }

        // --- 5. KIỂM TRA NHÂN VIÊN (STAFF CHECK - UPDATE V3.4 STRICT TIME) ---
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
            
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
                
                // 1. Check tồn tại và OFF
                if (!staffInfo || staffInfo.off) return false; 
                
                const shiftStart = getMinsFromTimeStr(staffInfo.start); 
                const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
                if (shiftStart === -1 || shiftEnd === -1) return false; 

                // 2. Check Giờ Bắt Đầu (Luôn phải sau giờ đi làm)
                if ((start + CONFIG.TOLERANCE) < shiftStart) return false;

                // 3. CHECK STRICT TIME vs OT (QUAN TRỌNG)
                const isStrict = staffInfo.isStrictTime === true; 

                if (isStrict) {
                    // Strict Mode: Phải làm XONG trước giờ về
                    if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
                } else {
                    // Flexible Mode: Chỉ cần BẮT ĐẦU trước giờ về
                    if ((start + CONFIG.TOLERANCE) >= shiftEnd) return false;
                }

                // 4. Check trùng lịch
                for (const b of busyList) {
                    if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
                }

                // 5. Check giới tính (Nếu có yêu cầu trong Random)
                if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
                if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;

                return true; 
            };

            // Logic điều phối
            if (staffReq && staffReq !== 'RANDOM' && staffReq !== 'MALE' && staffReq !== 'FEMALE' && staffReq !== '隨機' && staffReq !== 'Any') {
                return checkOneStaff(staffReq) ? staffReq : null;
            } else {
                const allStaffNames = Object.keys(staffListRef);
                for (const name of allStaffNames) { if (checkOneStaff(name)) return name; }
                return null;
            }
        }

        // --- 6. LOGIC XỬ LÝ CHÍNH (MAIN LOGIC - UPDATE V3.4 SMART COMBO) ---
        function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
            // 1. Kiểm tra định dạng giờ
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "時間格式錯誤 (Invalid Time Format)" };
            
            // 2. CHUẨN HÓA BOOKINGS (SMART SPLIT)
            // Biến đổi booking cũ thành các khối tài nguyên
            let committedBookings = [];

            currentBookingsRaw.forEach(b => {
                const startMins = getMinsFromTimeStr(b.startTime);
                if (startMins === -1) return;

                let rType = 'CHAIR'; 
                let isCombo = false;
                let duration = b.duration || 60; 
                
                // Logic nhận diện loại dịch vụ
                if (SERVICES[b.serviceCode]) {
                    if (SERVICES[b.serviceCode].type) rType = SERVICES[b.serviceCode].type;
                    if (SERVICES[b.serviceCode].category === 'COMBO') isCombo = true;
                } else {
                    // Fallback
                    if (b.serviceName.includes('Combo') || b.serviceName.includes('套餐')) isCombo = true;
                    else if (b.serviceName.includes('Body') || b.serviceName.includes('指壓') || b.serviceName.includes('油')) rType = 'BED';
                    else rType = 'CHAIR'; 
                }

                // Tách Combo cũ
                if (isCombo) {
                    const halfDuration = Math.floor(duration / 2);
                    committedBookings.push({ start: startMins, end: startMins + halfDuration, resourceType: 'CHAIR', staffName: b.staffName });
                    committedBookings.push({ start: startMins + halfDuration + CONFIG.TRANSITION_BUFFER, end: startMins + duration, resourceType: 'BED', staffName: b.staffName });
                } else {
                    committedBookings.push({ start: startMins, end: startMins + duration, resourceType: rType, staffName: b.staffName });
                }
            });

            // 3. Safety Gate (Full House Check)
            if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 1, committedBookings)) {
                return { feasible: false, reason: "目前預約已滿 (Full House - Max 12 Guests)" };
            }

            // 4. Phân loại khách mới
            let singleGuests = [];
            let comboGuests = [];

            for (let i = 0; i < guestList.length; i++) {
                const g = guestList[i];
                const svc = SERVICES[g.serviceCode];
                if (!svc) return { feasible: false, reason: `未知服務項目: ${g.serviceCode}` };

                const guestData = {
                    id: i, serviceCode: g.serviceCode, serviceName: svc.name,
                    staffReq: g.staffName, price: svc.price, duration: svc.duration, type: svc.type, category: svc.category
                };
                if (svc.category === 'COMBO') comboGuests.push(guestData);
                else singleGuests.push(guestData);
            }

            let tentativeBookings = []; 
            let finalDetails = new Array(guestList.length);

            // --- BƯỚC 4A: XẾP KHÁCH LẺ ---
            for (const guest of singleGuests) {
                const start = requestStartMins;
                const end = start + guest.duration + CONFIG.CLEANUP_BUFFER; 
                const allCurrent = [...committedBookings, ...tentativeBookings];
                
                if (!checkResourceCapacity(guest.type, start, end, allCurrent)) {
                    const resName = guest.type === 'BED' ? '指壓床 (Bed)' : '按摩椅 (Chair)';
                    return { feasible: false, reason: `${resName} 已滿` };
                }

                // Gọi findAvailableStaff mới (Có check Strict Time)
                const assignedStaff = findAvailableStaff(guest.staffReq, start, end, staffList, allCurrent);
                if (!assignedStaff) return { feasible: false, reason: `該時段無可用技師 (hoặc hết giờ làm)` };

                tentativeBookings.push({ start: start, end: end, resourceType: guest.type, staffName: assignedStaff });
                finalDetails[guest.id] = {
                    guestIndex: guest.id, staff: assignedStaff, service: guest.serviceName, price: guest.price,
                    timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
                };
            }

            if (comboGuests.length === 0) return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((s, x) => s + x.price, 0) };

            // --- BƯỚC 4B: XẾP KHÁCH COMBO (SMART SCENARIOS) ---
            const tryScenario = (scenarioConfig) => {
                let scenarioBookings = JSON.parse(JSON.stringify(tentativeBookings)); 
                let scenarioDetails = []; 

                for (const item of scenarioConfig) {
                    const guest = comboGuests.find(g => g.id === item.guestId);
                    const halfDuration = Math.floor(guest.duration / 2); 
                    
                    const p1Start = requestStartMins;
                    const p1End = p1Start + halfDuration; 
                    const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                    const p2End = p2Start + halfDuration;
                    const p1BlockEnd = p1End + CONFIG.CLEANUP_BUFFER;
                    const p2BlockEnd = p2End + CONFIG.CLEANUP_BUFFER;
                    const staffEnd = p2BlockEnd; 

                    let phase1Res = (item.mode === 'FB') ? 'CHAIR' : 'BED';
                    let phase2Res = (item.mode === 'FB') ? 'BED' : 'CHAIR';

                    let allBusy = [...committedBookings, ...scenarioBookings];

                    if (!checkResourceCapacity(phase1Res, p1Start, p1BlockEnd, allBusy)) return null; 
                    allBusy.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: 'TEMP' });
                    if (!checkResourceCapacity(phase2Res, p2Start, p2BlockEnd, allBusy)) return null; 

                    // Gọi findAvailableStaff mới (Có check Strict Time)
                    const staff = findAvailableStaff(guest.staffReq, p1Start, staffEnd, staffList, [...committedBookings, ...scenarioBookings]);
                    if (!staff) return null; 

                    scenarioBookings.push({ start: p1Start, end: p1BlockEnd, resourceType: phase1Res, staffName: staff });
                    scenarioBookings.push({ start: p2Start, end: p2BlockEnd, resourceType: phase2Res, staffName: staff });

                    scenarioDetails.push({
                        guestIndex: guest.id, staff: staff, service: guest.serviceName, price: guest.price, mode: item.mode, 
                        timeStr: `${timeStr} - ${getTimeStrFromMins(p2End)}`
                    });
                }
                return scenarioDetails; 
            };

            // Thử các kịch bản
            let successScenario = null;
            successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'FB' }))); 
            if (!successScenario) successScenario = tryScenario(comboGuests.map(g => ({ guestId: g.id, mode: 'BF' }))); 
            if (!successScenario && comboGuests.length >= 2) {
                const splitConfig = [];
                for (let i = 0; i < comboGuests.length; i++) {
                    splitConfig.push({ guestId: comboGuests[i].id, mode: (i < Math.ceil(comboGuests.length/2)) ? 'FB' : 'BF' });
                }
                successScenario = tryScenario(splitConfig);
            }
            if (!successScenario && comboGuests.length >= 2) {
                const splitConfig = [];
                for (let i = 0; i < comboGuests.length; i++) {
                    splitConfig.push({ guestId: comboGuests[i].id, mode: (i < Math.ceil(comboGuests.length/2)) ? 'BF' : 'FB' });
                }
                successScenario = tryScenario(splitConfig);
            }
            
            if (successScenario) {
                successScenario.forEach(item => { finalDetails[item.guestIndex] = item; });
                return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0) };
            } else {
                return { feasible: false, reason: "Combo: 資源不足或技師忙碌 (Full/Busy)" };
            }
        }

        return { checkRequestAvailability, setDynamicServices };
    })();

    // ========================================================================
    // PHẦN 2: REACT UI LOGIC (GIAO DIỆN V80)
    // ========================================================================
    
    const { useState, useEffect, useMemo, useCallback } = React;

    const SHOP_UI_CONFIG = {
        HOURS_LIST: ['08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','00','01','02'],
        MINUTES_STEP: ['00', '10', '20', '30', '40', '50'],
        OPEN_HOUR: 8,
        MAX_PAX_SELECT: 6 
    };

    // --- DATA ADAPTERS (CẦU NỐI UI -> KERNEL) ---
    const syncServicesToCore = () => {
        const rawServices = window.SERVICES_DATA || {};
        const formattedServices = {};
        Object.keys(rawServices).forEach(key => {
            const svc = rawServices[key];
            formattedServices[key] = {
                name: svc.name || key, duration: parseInt(svc.duration) || 60,
                type: svc.type ? svc.type.toUpperCase() : 'BODY', category: svc.category || 'SINGLE', price: svc.price || 0
            };
        });
        CoreKernel.setDynamicServices(formattedServices);
    };

    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList) => {
        syncServicesToCore();
        
        // Chuẩn hóa danh sách khách
        const coreGuests = guests.map(g => ({
            serviceCode: g.service,
            staffName: g.staff === '隨機' ? 'RANDOM' : (g.staff === '女' || g.staff === 'FEMALE_OIL') ? 'FEMALE' : (g.staff === '男') ? 'MALE' : g.staff
        }));

        const targetDateStandard = date.replace(/-/g, '/');
        const coreBookings = (Array.isArray(bookings) ? bookings : []).filter(b => {
            if (!b || !b.startTimeString || (b.status && (b.status.includes('hủy') || b.status.includes('Cancel')))) return false;
            return b.startTimeString.split(' ')[0].replace(/-/g, '/') === targetDateStandard;
        }).map(b => ({
            serviceCode: b.serviceName, serviceName: b.serviceName, startTime: b.startTimeString.split(' ')[1] || "00:00",
            duration: parseInt(b.duration) || 60, staffName: b.technician || b.staffId || "Unassigned"
        }));

        // Chuẩn hóa danh sách nhân viên & MAP isStrictTime
        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = String(s.id).trim();
                staffMap[sId] = {
                    id: sId,
                    gender: s.gender,
                    start: s.shiftStart || "00:00", end: s.shiftEnd || "00:00",
                    // *** CRITICAL MAP: Đọc isStrictTime từ dữ liệu nhân viên ***
                    isStrictTime: (s.isStrictTime === true || s.isStrictTime === 'TRUE'), 
                    off: (String(s.offDays).includes(date) || String(s[date]||"").toUpperCase().includes('OFF'))
                };
                if (s.name) staffMap[s.name] = staffMap[sId];
            });
        }

        try {
            // Gọi Kernel V3.4
            const result = CoreKernel.checkRequestAvailability(date, time, coreGuests, coreBookings, staffMap);
            return result.feasible ? { valid: true, details: result.details } : { valid: false, reason: result.reason };
        } catch (err) {
            console.error("Core Error:", err);
            return { valid: false, reason: "System Error: " + err.message };
        }
    };

    const forceGlobalRefresh = () => { if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender(); else window.location.reload(); };

    // ==================================================================================
    // 3. COMPONENT: PHONE BOOKING MODAL (ZH-TW) - V82
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);
        
        const defaultService = (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) ? window.SERVICES_LIST[2] : "Body Massage";
        const [form, setForm] = useState({ date: initialDate || new Date().toISOString().slice(0, 10), time: "12:00", pax: 2, custName: '', custPhone: '' });
        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }, { service: defaultService, staff: '隨機', isOil: false }]);

        const handleTimeChange = useCallback((type, value) => {
            setForm(prev => {
                const parts = (prev.time || "12:00").split(':');
                return { ...prev, time: type === 'HOUR' ? `${value}:${parts[1]}` : `${parts[0]}:${value}` };
            });
            setCheckResult(null); setSuggestions([]);
        }, []);

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
            setForm(prev => ({ ...prev, pax: num })); setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const newD = [...prev];
                if (num > prev.length) for(let i=prev.length; i<num; i++) newD.push({ service: prev[0]?.service||defaultService, staff: '隨機', isOil: false });
                else newD.length = num;
                return newD;
            });
        };

        const handleGuestUpdate = (idx, field, val) => {
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const c = [...prev]; c[idx] = { ...c[idx] };
                if (field === 'service') { c[idx].service = val; if(val && (val.includes('足')||val.includes('Foot'))) c[idx].isOil = false; }
                else if (field === 'staff') {
                    if (val === 'FEMALE_OIL') { c[idx].staff='女'; c[idx].isOil=true; }
                    else if (val === '女') { c[idx].staff='女'; c[idx].isOil=false; }
                    else { c[idx].staff=val; c[idx].isOil=false; }
                }
                return c;
            });
        };

        const performCheck = (e) => {
            if (e) e.preventDefault();
            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, safeBookings, safeStaffList);
            if (res.valid) { setCheckResult({ status: 'OK', message: "✅ 此時段可以預約 (Available)" }); setSuggestions([]); }
            else {
                setCheckResult({ status: 'FAIL', message: res.reason });
                // Scanner
                const found = [];
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0]||0)*60 + (parts[1]||0);
                for (let i=1; i<=24; i++) {
                    let nM = currMins + (i*10); let h = Math.floor(nM/60); let m = nM%60; if(h>=24) h-=24;
                    let tStr = `${String(h).padStart(2,'0')}:${String(Math.floor(m/10)*10).padStart(2,'0')}`;
                    if (callCoreAvailabilityCheck(form.date, tStr, guestDetails, safeBookings, safeStaffList).valid) {
                        found.push(tStr); if(found.length>=4) break;
                    }
                }
                setSuggestions(found);
            }
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入顧客姓名!"); return; }
            setIsSubmitting(true);
            try {
                const svcSum = guestDetails.map(g => g.service).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
                const oils = guestDetails.map((g,i)=>g.isOil?`K${i+1}:油推`:null).filter(Boolean).join(',');
                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: svcSum, pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: guestDetails[0].staff, isOil: guestDetails[0].isOil,
                    staffId2: guestDetails[1]?.staff||null, staffId3: guestDetails[2]?.staff||null,
                    staffId4: guestDetails[3]?.staff||null, staffId5: guestDetails[4]?.staff||null, staffId6: guestDetails[5]?.staff||null,
                    ghiChu: oils ? `(${oils})` : "", guestDetails: guestDetails
                };
                if (onSave) { await Promise.resolve(onSave(payload)); forceGlobalRefresh(); setTimeout(()=>{onClose();setIsSubmitting(false);}, 500); }
            } catch(err) { alert("儲存失敗: "+err.message); setIsSubmitting(false); }
        };

        const [cH, cM] = (form.time || "12:00").split(':');
        const paxOptions = Array.from({length: SHOP_UI_CONFIG.MAX_PAX_SELECT}, (_, i) => i + 1);

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
                    <div className="bg-[#0891b2] p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">📅 電話預約 (V82)</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step==='CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold text-gray-500">日期</label><input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form,date:e.target.value});setCheckResult(null);}}/></div>
                                    <div><label className="text-xs font-bold text-gray-500">時間</label>
                                    <div className="flex items-center gap-1"><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cH} onChange={e=>handleTimeChange('HOUR',e.target.value)}>{SHOP_UI_CONFIG.HOURS_LIST.map(h=><option key={h} value={h}>{h}</option>)}</select></div><span className="font-bold">:</span><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cM} onChange={e=>handleTimeChange('MINUTE',e.target.value)}>{SHOP_UI_CONFIG.MINUTES_STEP.map(m=><option key={m} value={m}>{m}</option>)}</select></div></div></div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">人數 (Pax)</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2"><div className="text-xs font-bold text-gray-400">詳細需求</div>
                                    {guestDetails.map((g,i)=>(
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師傅</option><option value="FEMALE_OIL">🚺 女+油</option><option value="男">🚹 男師傅</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
                                    ))}
                                </div>
                                <div>{!checkResult ? <button onClick={performCheck} className="w-full bg-cyan-600 text-white p-3 rounded font-bold shadow-lg hover:bg-cyan-700">🔍 查詢空位</button> : 
                                    <div className="space-y-3"><div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>
                                    {checkResult.status==='FAIL'&&suggestions.length>0&&(<div className="bg-yellow-50 p-3 rounded border border-yellow-200"><div className="text-xs font-bold text-yellow-700 mb-2">💡 建議時段:</div><div className="flex gap-2 flex-wrap">{suggestions.map(t=><button key={t} onClick={()=>{setForm(f=>({...f,time:t}));setCheckResult(null);setSuggestions([]);}} className="px-3 py-1 bg-white border border-yellow-300 text-yellow-800 rounded font-bold hover:bg-yellow-100">{t}</button>)}</div></div>)}
                                    {checkResult.status==='OK'?<button onClick={()=>setStep('INFO')} className="w-full bg-emerald-600 text-white p-3 rounded font-bold shadow-lg animate-pulse hover:bg-emerald-700">➡️ 下一步</button>:<button onClick={()=>{setCheckResult(null);setSuggestions([])}} className="w-full bg-gray-400 text-white p-3 rounded font-bold hover:bg-gray-500">🔄 重新選擇</button>}</div>}
                                </div>
                            </>
                        )}
                        {step==='INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-green-50 p-3 rounded border border-green-200 text-green-800 font-bold"><div className="flex justify-between"><span>{form.date}</span><span>{form.time}</span></div><div className="text-sm font-normal mt-1">{form.pax} 位 - {guestDetails[0].service}...</div></div>
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custName} onChange={e=>setForm({...form,custName:e.target.value})} placeholder="輸入顧客姓名..." disabled={isSubmitting}/></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼</label><input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custPhone} onChange={e=>setForm({...form,custPhone:e.target.value})} placeholder="09xx..." disabled={isSubmitting}/></div>
                                <div className="flex gap-2 pt-2"><button onClick={(e)=>{e.preventDefault();if(!isSubmitting)setStep('CHECK');}} className="flex-1 bg-gray-200 p-3 rounded font-bold text-gray-700 hover:bg-gray-300" disabled={isSubmitting}>⬅️ 返回</button><button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting?"處理中...":"✅ 確認預約"}</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 4. COMPONENT: WALK-IN MODAL (ZH-TW) - V82
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
            setForm(prev => ({ ...prev, pax: num })); setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const newD = [...prev];
                if (num > prev.length) for(let i=prev.length; i<num; i++) newD.push({ service: prev[0]?.service||defaultService, staff: '隨機', isOil: false });
                else newD.length = num;
                return newD;
            });
        };

        const handleGuestUpdate = (idx, field, val) => {
            setCheckResult(null); setWaitSuggestion(null);
            setGuestDetails(prev => {
                const c = [...prev]; c[idx] = { ...c[idx] };
                if (field === 'service') { c[idx].service = val; if(val && (val.includes('足')||val.includes('Foot'))) c[idx].isOil = false; }
                else if (field === 'staff') {
                    if (val === 'FEMALE_OIL') { c[idx].staff='女'; c[idx].isOil=true; }
                    else if (val === '女') { c[idx].staff='女'; c[idx].isOil=false; }
                    else { c[idx].staff=val; c[idx].isOil=false; }
                }
                return c;
            });
        };

        const performCheck = (e) => {
            if (e) e.preventDefault();
            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, safeBookings, safeStaffList);
            if (res.valid) { setCheckResult({ status: 'OK', message: "✅ 目前有空位 (Available Now)" }); setWaitSuggestion(null); }
            else {
                if (res.reason.includes("System")) { setCheckResult({ status: 'FAIL', message: res.reason }); return; }
                // Scanner
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0]||0)*60 + (parts[1]||0);
                let foundTime = null, foundDate = form.date, waitMins = 0, isNextDay = false;

                for (let i=1; i<=18; i++) {
                    let nM = currMins + (i*10); let h = Math.floor(nM/60); let m = nM%60; if(h>=24) h-=24;
                    let tStr = `${String(h).padStart(2,'0')}:${String(Math.floor(m/10)*10).padStart(2,'0')}`;
                    if (callCoreAvailabilityCheck(form.date, tStr, guestDetails, safeBookings, safeStaffList).valid) { foundTime=tStr; waitMins=i*10; break; }
                }

                if (!foundTime) {
                    const tmr = new Date(form.date); tmr.setDate(tmr.getDate() + 1);
                    const tomorrowStr = tmr.toISOString().slice(0, 10);
                    const openH = SHOP_UI_CONFIG.OPEN_HOUR;
                    for (let t = openH*60; t < openH*60 + 240; t += 10) {
                        const h = Math.floor(t / 60); const m = t % 60;
                        const tStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                        if (callCoreAvailabilityCheck(tomorrowStr, tStr, guestDetails, safeBookings, safeStaffList).valid) { foundTime=tStr; foundDate=tomorrowStr; isNextDay=true; break; }
                    }
                }

                if (foundTime) { setCheckResult({ status: 'FAIL', message: isNextDay?"⛔ 今日已滿":"⚠️ 需等待" }); setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay }); }
                else { setCheckResult({ status: 'FAIL', message: "❌ 預約已滿 (Fully Booked)" }); setWaitSuggestion(null); }
            }
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入姓名!"); return; }
            setIsSubmitting(true);
            try {
                const svcSum = guestDetails.map(g => g.service).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
                const oils = guestDetails.map((g,i)=>g.isOil?`K${i+1}:油推`:null).filter(Boolean).join(',');
                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: svcSum, pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: guestDetails[0].staff, isOil: guestDetails[0].isOil,
                    staffId2: guestDetails[1]?.staff||null, staffId3: guestDetails[2]?.staff||null,
                    staffId4: guestDetails[3]?.staff||null, staffId5: guestDetails[4]?.staff||null, staffId6: guestDetails[5]?.staff||null,
                    ghiChu: oils ? `(${oils})` : "", guestDetails: guestDetails 
                };
                if (onSave) { await Promise.resolve(onSave(payload)); forceGlobalRefresh(); setTimeout(()=>{onClose();setIsSubmitting(false);}, 500); }
            } catch(err) { alert("錯誤: "+err.message); setIsSubmitting(false); }
        };

        const paxOptions = Array.from({length: SHOP_UI_CONFIG.MAX_PAX_SELECT}, (_, i) => i + 1);

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-600 p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">⚡ 現場客 (V82)</h3>
                        <button onClick={onClose}><i className="fas fa-times text-xl"></i></button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div><label className="text-xs font-bold text-gray-500">人數 (Pax)</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    {guestDetails.map((g, i) => (
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師</option><option value="FEMALE_OIL">🚺+油</option><option value="男">🚹 男師</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
                                    ))}
                                </div>
                                {checkResult && (<div className="space-y-2"><div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>{waitSuggestion&&(<div className="bg-blue-50 border border-blue-200 p-3 rounded animate-fadeIn text-center"><div className={`mb-2 font-bold text-lg ${waitSuggestion.isNextDay?'text-orange-600':'text-blue-700'}`}>{waitSuggestion.isNextDay ? `🌅 最快明天: ${waitSuggestion.time}` : `⏳ 需等待 ${waitSuggestion.mins} 分鐘 (${waitSuggestion.time})`}</div><button onClick={(e) => { e.preventDefault(); setForm({...form, time: waitSuggestion.time, date: waitSuggestion.date}); setStep('INFO'); }} className="w-full bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">➡️ 接受安排</button></div>)}</div>)}
                                <div className="pt-2 grid grid-cols-2 gap-3"><button onClick={onClose} className="bg-gray-100 text-gray-500 font-bold p-3 rounded hover:bg-gray-200">取消</button>{!checkResult || checkResult.status === 'FAIL' ? <button onClick={performCheck} className="bg-amber-500 text-white font-bold p-3 rounded hover:bg-amber-600 shadow-lg">🔍 檢查</button> : <button onClick={() => setStep('INFO')} className="bg-emerald-600 text-white font-bold p-3 rounded hover:bg-emerald-700 shadow-lg animate-pulse">➡️ 下一步</button>}</div>
                            </>
                        )}
                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-amber-50 p-3 rounded border border-amber-200 text-amber-900 font-bold"><div className="flex justify-between"><span>{form.date}</span><span>{form.time}</span></div></div>
                                <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custName} onChange={e=>setForm({...form,custName:e.target.value})} placeholder="顧客姓名..." disabled={isSubmitting}/>
                                <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custPhone} onChange={e=>setForm({...form,custPhone:e.target.value})} placeholder="電話號碼..." disabled={isSubmitting}/>
                                <div className="grid grid-cols-2 gap-3 pt-2"><button onClick={(e) => {e.preventDefault(); if(!isSubmitting) setStep('CHECK');}} className="bg-gray-200 text-gray-600 p-3 rounded font-bold" disabled={isSubmitting}>⬅️ 返回</button><button onClick={handleFinalSave} className="bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting ? "處理中..." : "✅ 確認開單"}</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // SYSTEM INJECTION
    const overrideInterval = setInterval(() => {
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) { window.AvailabilityCheckModal = NewAvailabilityCheckModal; console.log("♻️ AvailabilityModal Injected (V82)"); }
        if (window.WalkInModal !== NewWalkInModal) { window.WalkInModal = NewWalkInModal; console.log("♻️ WalkInModal Injected (V82)"); }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);
})();
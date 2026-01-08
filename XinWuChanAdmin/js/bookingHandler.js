// File: js/bookingHandler.js
// 版本: V52 (Strict Staff OFF Check - Multi-Format Date Fix)
// 語言: 繁體中文 (Traditional Chinese)
// 修正說明: 
// 1. 修復指定技師休假 (OFF) 卻仍可預約的 Bug。
// 2. 採用「多重日期格式」匹配，確保無論後端傳來的是 2026/01/08 還是 2026/1/8 都能正確識別休假。
// 3. 完整保留 V51 所有功能 (08:00 開店、打烊管制、硬體防護)。

(function() {
    console.log("🚀 BookingHandler V52 (休假嚴格檢查版): 系統啟動中...");

    // --- 安全檢查: 確保 React 存在 ---
    if (typeof React === 'undefined') {
        console.error("❌ 嚴重錯誤: React 未定義，BookingHandler 無法啟動。");
        return;
    }
    const { useState, useEffect, useMemo } = React;

    // =========================================================================
    // ⚙️ [V52 設定] 店舖營業設定
    // =========================================================================
    const SHOP_CONFIG = {
        LIMIT_CHAIRS: 6,      // 椅子總數
        LIMIT_BEDS: 6,        // 床位總數
        OPEN_HOUR: 8,         // 開店時間 08:00
        CLOSE_HOUR: 3,        // 打烊時間 (凌晨 03:00)
        ALLOW_LAST_ORDER: 60  // 打烊前多久停止接單
    };

    // --- 輔助常數 ---
    const HOURS_24 = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
    const MINUTES_10 = ['00', '10', '20', '30', '40', '50'];

    // --- [防呆] 本地輔助函數 ---
    const safeNormalizeMins = (timeStr) => {
        if (window.normalizeToTimelineMins) return window.normalizeToTimelineMins(timeStr);
        if (!timeStr || typeof timeStr !== 'string') return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    const safeGetDuration = (serviceName, defaultDur = 60) => {
        if (window.getSafeDuration) return window.getSafeDuration(serviceName, defaultDur);
        return defaultDur;
    };

    // --- [V52 核心修正] 強化版休假狀態檢查 ---
    // 無論日期格式如何 (有0無0，斜線或橫線)，都能抓到 OFF
    const getStaffDayStatus = (staff, dateString) => {
        if (!staff) return '';
        
        // 解析日期，生成所有可能的格式變體
        const [y, m, d] = (dateString || '').split('-');
        if (!y || !m || !d) return '';

        const mInt = parseInt(m, 10);
        const dInt = parseInt(d, 10);

        // 產生 4 種常見格式
        const formatsToCheck = [
            dateString,                                      // 2026-01-08 (標準)
            dateString.replace(/-/g, '/'),                   // 2026/01/08 (後端常見)
            `${y}-${mInt}-${dInt}`,                          // 2026-1-8   (無補零橫線)
            `${y}/${mInt}/${dInt}`                           // 2026/1/8   (無補零斜線)
        ];

        // 1. 檢查 offDays 陣列 (Backend V157+ 新格式)
        if (staff.offDays && Array.isArray(staff.offDays)) {
            // 只要 offDays 裡包含上述任一格式，即視為休假
            const isOff = formatsToCheck.some(fmt => staff.offDays.includes(fmt));
            if (isOff) return 'OFF';
        }

        // 2. 檢查舊版 Key (直接屬性)
        for (const fmt of formatsToCheck) {
            if (staff[fmt] !== undefined) {
                const val = String(staff[fmt]).trim().toUpperCase();
                // 擴充休假關鍵字
                if (['OFF', '休', 'NGHI', 'X', 'FALSE'].includes(val)) return 'OFF';
            }
        }

        return ''; 
    };

    // 判斷技師是否上班 (依賴 getStaffDayStatus)
    const isStaffWorkingAt = (staff, checkMins, dateString) => {
        if (!staff) return false;
        
        // A. 先檢查是否休假
        const dayStatus = getStaffDayStatus(staff, dateString);
        if (dayStatus === 'OFF') return false;
        
        // B. 檢查班表時間
        if (!staff.shiftStart || !staff.shiftEnd) return false;
        if (String(staff.shiftStart).toUpperCase().includes('OFF')) return false;

        const startMins = safeNormalizeMins(staff.shiftStart);
        const endMins = safeNormalizeMins(staff.shiftEnd);
        
        // 跨日班表處理
        if (endMins < startMins) {
            return checkMins >= startMins || checkMins < endMins;
        } else {
            return checkMins >= startMins && checkMins < endMins;
        }
    };

    // --- 其他通用邏輯函數 ---
    
    // 營業時間檢查
    const checkBusinessHoursViolation = (startTimeStr, maxDuration) => {
        const [h, m] = startTimeStr.split(':').map(Number);
        let startMins = h * 60 + m;
        
        let openMins = SHOP_CONFIG.OPEN_HOUR * 60;
        let closeMins = SHOP_CONFIG.CLOSE_HOUR * 60;
        let isCrossDay = closeMins < openMins;

        if (isCrossDay) {
            closeMins += 24 * 60; 
            if (h < SHOP_CONFIG.OPEN_HOUR) { 
                startMins += 24 * 60; 
            }
        }

        if (startMins >= closeMins && startMins < (openMins + 24*60)) { 
             if (h < SHOP_CONFIG.OPEN_HOUR && !isCrossDay) return { valid: false, reason: "⛔ 目前是非營業時間 (尚未開店)" };
        }

        const endMins = startMins + maxDuration;
        if (endMins > closeMins) {
            return { 
                valid: false, 
                reason: `⛔ 超過打烊時間 (預計結束 ${Math.floor((endMins%1440)/60).toString().padStart(2,'0')}:${(endMins%60).toString().padStart(2,'0')})` 
            };
        }

        if (startMins < openMins) {
             return { valid: false, reason: "⛔ 尚未開店" };
        }

        return { valid: true };
    };

    const getStaffDisplayName = (s) => {
        if (!s) return 'Unknown';
        if (String(s.id).trim() === String(s.name).trim()) return s.name;
        return `${s.id} - ${s.name}`;
    };

    const getStaffGender = (staff) => {
        if (!staff) return 'UNKNOWN';
        const g = String(staff.gender || '').toUpperCase().trim();
        if (['F', '女', 'FEMALE', 'NU'].includes(g)) return 'F';
        if (['M', '男', 'MALE', 'NAM'].includes(g)) return 'M';
        return 'UNKNOWN';
    };

    const getServiceType = (serviceName, details = {}) => {
        const name = String(serviceName || '').toUpperCase();
        if (details && details.type) return details.type.toUpperCase();
        if (details && details.category === 'COMBO') return 'COMBO';
        if (name.includes('套餐') || name.includes('COMBO')) return 'COMBO';
        if (name.includes('足') || name.includes('腳') || name.includes('FOOT')) return 'CHAIR';
        return 'BED'; 
    };

    const calculateResourceUsage = (todaysBookings) => {
        const MAX_MINUTES = 3000;
        const chairUsage = new Uint8Array(MAX_MINUTES);
        const bedUsage = new Uint8Array(MAX_MINUTES);
        const CLEANUP_BUFFER = 10;

        if (!Array.isArray(todaysBookings)) return { chairUsage, bedUsage };

        todaysBookings.forEach(b => {
            if (!b || !b.startTimeString) return;
            const timeParts = b.startTimeString.split(' ');
            if (timeParts.length < 2) return;

            const bStart = safeNormalizeMins(timeParts[1]);
            const duration = b.duration || 60;
            const bPax = parseInt(b.pax) || 1;
            
            const svcInfo = (window.SERVICES_DATA || {})[b.serviceName] || {};
            const type = getServiceType(b.serviceName, svcInfo);

            if (type === 'COMBO') {
                const half = duration / 2;
                const p1End = bStart + half + CLEANUP_BUFFER;
                for (let t = bStart; t < p1End; t++) if (t < MAX_MINUTES) chairUsage[t] += bPax;
                const p2Start = bStart + half;
                const p2End = bStart + duration + CLEANUP_BUFFER;
                for (let t = p2Start; t < p2End; t++) if (t < MAX_MINUTES) bedUsage[t] += bPax;
            } else if (type === 'CHAIR') {
                const effectiveEnd = bStart + duration + CLEANUP_BUFFER;
                for (let t = bStart; t < effectiveEnd; t++) if (t < MAX_MINUTES) chairUsage[t] += bPax;
            } else {
                const effectiveEnd = bStart + duration + CLEANUP_BUFFER;
                for (let t = bStart; t < effectiveEnd; t++) if (t < MAX_MINUTES) bedUsage[t] += bPax;
            }
        });

        return { chairUsage, bedUsage };
    };

    const isConsumingFemaleStaff = (booking, staffList) => {
        if (booking.isOil === true || booking.isOil === 'true' || booking.oil === true) return true;
        const textToCheck = (String(booking.serviceName || '') + " " + String(booking.ghiChu || '')).toUpperCase();
        const oilKeywords = ['OIL', 'DẦU', 'DAU', '精油', 'AROMA', '油', '油推']; 
        const femaleKeywords = ['NỮ', 'NU', 'FEMALE', '女', 'LADY'];
        if (oilKeywords.some(k => textToCheck.includes(k))) return true;
        if (femaleKeywords.some(k => textToCheck.includes(k))) return true;
        
        const sId = booking.staffId || booking.technician || booking.serviceStaff;
        if (sId && sId !== '隨機' && !String(sId).includes('Random')) {
            const safeList = staffList || [];
            const staffObj = safeList.find(s => s.id == sId || s.name == sId);
            if (staffObj && getStaffGender(staffObj) === 'F') return true;
        }
        return false;
    };

    const isConsumingMaleStaff = (booking, staffList) => {
        const sId = booking.staffId || booking.technician || booking.serviceStaff;
        if (sId && sId !== '隨機' && !String(sId).includes('Random')) {
            const safeList = staffList || [];
            const staffObj = safeList.find(s => s.id == sId || s.name == sId);
            if (staffObj && getStaffGender(staffObj) === 'M') return true;
        }
        return false;
    };

    const buildDetailedSlotMap = (todayBookings) => {
        const MAX_MINUTES = 3000;
        const CLEANUP_BUFFER = 10;
        const slots = { CHAIR: Array.from({length: 7}, () => new Uint8Array(MAX_MINUTES)), BED: Array.from({length: 7}, () => new Uint8Array(MAX_MINUTES)) };

        if (!Array.isArray(todayBookings)) return slots;

        todayBookings.forEach(b => {
            if (!b || !b.startTimeString) return;
            const bStart = safeNormalizeMins(b.startTimeString.split(' ')[1]);
            const duration = b.duration || 60;
            const rId = String(b.rowId || '').toLowerCase();
            let slotIdx = parseInt(rId.replace(/\D/g, ''));
            
            if (isNaN(slotIdx) || slotIdx < 1 || slotIdx > 6) return;

            let startType = 'BED';
            if (rId.includes('chair') || rId.includes('足') || (b.serviceName && b.serviceName.includes('足')) || b.type === 'CHAIR') startType = 'CHAIR';

            if (b.category === 'COMBO') {
                const half = duration / 2;
                const switchPoint = bStart + half;
                const p1End = switchPoint + CLEANUP_BUFFER;
                const p1Arr = slots[startType][slotIdx];
                for(let t=bStart; t<p1End; t++) if(t<MAX_MINUTES) p1Arr[t] = 1;
                const p2Type = startType === 'CHAIR' ? 'BED' : 'CHAIR';
                const p2Start = switchPoint;
                const p2End = bStart + duration + CLEANUP_BUFFER;
                const p2Arr = slots[p2Type][slotIdx];
                for(let t=p2Start; t<p2End; t++) if(t<MAX_MINUTES) p2Arr[t] = 1;
            } else {
                const effectiveEnd = bStart + duration + CLEANUP_BUFFER;
                const arr = slots[startType][slotIdx];
                for(let t=bStart; t<effectiveEnd; t++) if(t<MAX_MINUTES) arr[t] = 1;
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
            const svcInfo = (window.SERVICES_DATA || {})[serviceName] || {};
            const duration = safeGetDuration(serviceName, 60);
            const type = getServiceType(serviceName, svcInfo);

            let placed = false;

            if (type === 'COMBO') {
                const half = duration / 2;
                const p1Start = startMins; const p1End = startMins + half + CLEANUP_BUFFER;
                const p2Start = startMins + half; const p2End = startMins + duration + CLEANUP_BUFFER;
                for (let c = 1; c <= 6; c++) {
                    if (isSlotAvailable('CHAIR', c, p1Start, p1End)) {
                        for (let b = 1; b <= 6; b++) {
                            if (isSlotAvailable('BED', b, p2Start, p2End)) {
                                markSlotBusy('CHAIR', c, p1Start, p1End); markSlotBusy('BED', b, p2Start, p2End);
                                placed = true; break;
                            }
                        }
                    }
                    if (placed) break;
                }
                if (!placed) {
                    for (let b = 1; b <= 6; b++) {
                        if (isSlotAvailable('BED', b, p1Start, p1End)) {
                            for (let c = 1; c <= 6; c++) {
                                if (isSlotAvailable('CHAIR', c, p2Start, p2End)) {
                                    markSlotBusy('BED', b, p1Start, p1End); markSlotBusy('CHAIR', c, p2Start, p2End);
                                    placed = true; break;
                                }
                            }
                        }
                        if (placed) break;
                    }
                }
            } else {
                const tType = type === 'CHAIR' ? 'CHAIR' : 'BED';
                const effectiveEnd = startMins + duration + CLEANUP_BUFFER;
                for (let r = 1; r <= 6; r++) {
                    if (isSlotAvailable(tType, r, startMins, effectiveEnd)) {
                        markSlotBusy(tType, r, startMins, effectiveEnd);
                        placed = true; break;
                    }
                }
            }
            if (!placed) return false;
        }
        return true;
    };

    // ==================================================================================
    // 1. 電話預約模組
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const defaultService = window.SERVICES_LIST ? window.SERVICES_LIST[2] : "Body Massage";

        const [form, setForm] = useState({
            date: initialDate || new Date().toISOString().slice(0, 10), 
            time: "12:00",
            pax: 2, custName: '', custPhone: ''
        });

        const [guestDetails, setGuestDetails] = useState([
            { service: defaultService, staff: '隨機', isOil: false },
            { service: defaultService, staff: '隨機', isOil: false }
        ]);

        const handleTimeChange = (type, value) => {
            const parts = (form.time || "12:00").split(':');
            const h = parts[0] || "12";
            const m = parts[1] || "00";
            let newTime = form.time;
            if (type === 'HOUR') newTime = `${value}:${m}`;
            if (type === 'MINUTE') newTime = `${h}:${value}`;
            setForm(prev => ({ ...prev, time: newTime }));
            setCheckResult(null); setSuggestions([]);
        };

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
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
                if (newService && newService.includes('足')) copy[index].isOil = false;
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
            const startMins = safeNormalizeMins(targetTimeStr);
            const targetDateStandard = (form.date || "").replace(/-/g, '/');
            
            // 0. 營業時間檢查
            let maxDuration = 0;
            guestDetails.forEach(g => {
                const d = safeGetDuration(g.service, 60);
                if (d > maxDuration) maxDuration = d;
            });
            const bizCheck = checkBusinessHoursViolation(targetTimeStr, maxDuration);
            if (!bizCheck.valid) return bizCheck;

            // 嚴格過濾
            const todays = safeBookings.filter(b => {
                if (!b || !b.startTimeString) return false;
                const bDate = b.startTimeString.split(' ')[0].replace(/-/g, '/');
                const isValidStatus = !b.status.includes('取消') && !b.status.includes('Cancel'); 
                return bDate === targetDateStandard && isValidStatus;
            });

            // A. 人力
            const activeStaff = safeStaffList.filter(s => isStaffWorkingAt(s, startMins, form.date));
            const totalActive = activeStaff.length;
            
            let busyTotal = 0;
            const checkEndMins = startMins + maxDuration;

            todays.forEach(b => {
                const bStart = safeNormalizeMins(b.startTimeString.split(' ')[1]);
                const bEnd = bStart + (b.duration || 60);
                const bPax = parseInt(b.pax) || 1;
                if (Math.max(startMins, bStart) < Math.min(checkEndMins, bEnd)) {
                    busyTotal += bPax;
                }
            });

            const remainingTotal = totalActive - busyTotal;
            if (remainingTotal < form.pax) return { valid: false, reason: `❌ 技師人手不足 (剩餘: ${remainingTotal})` };

            // B. [V52 修正] 指定技師檢查 (Specific Staff Check) - 優先執行，並使用嚴格休假檢查
            for (let i = 0; i < guestDetails.length; i++) {
                const st = guestDetails[i].staff;
                if (['隨機', '男', '女'].some(k => st.includes(k))) continue;
                
                const staffObj = safeStaffList.find(s => s.id === st || s.name === st);
                
                // 檢查 1: 是否休假 (最重要修正)
                if (staffObj) {
                    // 強制檢查休假狀態，不依賴 isStaffWorkingAt 的副作用
                    const dayStatus = getStaffDayStatus(staffObj, form.date);
                    if (dayStatus === 'OFF') {
                        return { valid: false, reason: `❌ 技師 ${st} 當天休假 (OFF)` };
                    }
                    // 再次檢查是否在班表時間內
                    if (!isStaffWorkingAt(staffObj, startMins, form.date)) {
                        return { valid: false, reason: `❌ 技師 ${st} 該時段未上班` };
                    }
                } else {
                    return { valid: false, reason: `❌ 找不到技師 ${st}` };
                }

                // 檢查 2: 是否忙碌
                const isBusy = todays.some(b => {
                    const bStart = safeNormalizeMins(b.startTimeString.split(' ')[1]);
                    const bEnd = bStart + (b.duration || 60);
                    const overlap = (startMins < bEnd && checkEndMins > bStart);
                    const staffInOrder = [b.serviceStaff, b.staffId, b.technician, b.staffId2, b.staffId3, b.staffId4].map(s=>String(s));
                    return overlap && staffInOrder.some(name => name && (name.includes(st) || st.includes(name)));
                });
                if (isBusy) return { valid: false, reason: `❌ 技師 ${st} 該時段忙碌` };
            }

            // C. 硬體總量
            const { chairUsage, bedUsage } = calculateResourceUsage(todays);
            const tempChairUsage = new Uint8Array(chairUsage);
            const tempBedUsage = new Uint8Array(bedUsage);
            const CLEANUP_BUFFER = 10;

            for (let i = 0; i < guestDetails.length; i++) {
                const guest = guestDetails[i];
                const d = safeGetDuration(guest.service, 60);
                const type = getServiceType(guest.service);
                
                if (type === 'COMBO') {
                    const half = d / 2;
                    for(let t = startMins; t < startMins + half + CLEANUP_BUFFER; t++) tempChairUsage[t]++;
                    for(let t = startMins + half; t < startMins + d + CLEANUP_BUFFER; t++) tempBedUsage[t]++;
                } else if (type === 'CHAIR') {
                    for(let t = startMins; t < startMins + d + CLEANUP_BUFFER; t++) tempChairUsage[t]++;
                } else {
                    for(let t = startMins; t < startMins + d + CLEANUP_BUFFER; t++) tempBedUsage[t]++;
                }
            }

            for (let t = startMins; t < checkEndMins + CLEANUP_BUFFER; t++) {
                if (tempChairUsage[t] > SHOP_CONFIG.LIMIT_CHAIRS) return { valid: false, reason: `❌ 足底區客滿 (時段 ${Math.floor(t/60)}:${(t%60).toString().padStart(2,'0')} 已滿 ${SHOP_CONFIG.LIMIT_CHAIRS})` };
                if (tempBedUsage[t] > SHOP_CONFIG.LIMIT_BEDS) return { valid: false, reason: `❌ 身體區客滿 (時段 ${Math.floor(t/60)}:${(t%60).toString().padStart(2,'0')} 已滿 ${SHOP_CONFIG.LIMIT_BEDS})` };
            }

            // D. Tetris
            const slotMap = buildDetailedSlotMap(todays);
            const canFit = tryFitMixedServicesTetris(guestDetails, startMins, slotMap);
            if (!canFit) return { valid: false, reason: "❌ 座位/床位無法安排 (碎片化)" };

            return { valid: true, reason: "OK" };
        };

        const performCheck = () => {
            const result = checkSlotAvailability(form.time);
            if (result.valid) { setCheckResult({ status: 'OK', message: "✅ 此時段可以預約 (Available)" }); setSuggestions([]); }
            else {
                setCheckResult({ status: 'FAIL', message: result.reason });
                const foundSuggestions = [];
                const parts = form.time.split(':').map(Number);
                let currentTotalMins = (parts[0]||0) * 60 + (parts[1]||0);
                for (let i = 1; i <= 24; i++) { 
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
                ngayDen: (form.date||"").replace(/-/g, '/'), 
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

        const [currentHour, currentMinute] = (form.time || "12:00").split(':');

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
                    <div className="bg-[#10b981] p-4 text-white flex justify-between items-center">
                        <h3 className="font-bold text-lg">📅 電話預約 (Booking Check)</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold text-gray-500">日期</label><input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form, date:e.target.value}); setCheckResult(null);}}/></div>
                                    <div><label className="text-xs font-bold text-gray-500">時間</label><div className="flex items-center gap-1"><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] appearance-none text-center bg-white" value={currentHour} onChange={(e) => handleTimeChange('HOUR', e.target.value)}>{HOURS_24.map(h => <option key={h} value={h}>{h}</option>)}</select></div><span className="font-bold">:</span><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] appearance-none text-center bg-white" value={currentMinute} onChange={(e) => handleTimeChange('MINUTE', e.target.value)}>{MINUTES_10.map(m => <option key={m} value={m}>{m}</option>)}</select></div></div></div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">人數</label>
                                    <select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select>
                                </div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">詳細資訊</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestServiceChange(idx, e.target.value)}>
                                                    {(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}
                                                </select>
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
                                    <div className="text-green-700">{form.pax} 位顧客</div>
                                    {guestDetails.map((g,i)=> <div key={i} className="text-xs text-green-600 mt-1 border-t border-green-100 pt-1">#{i+1}: {g.service} - {g.staff}</div>)}
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
    // 2. 現場客模組 (NewWalkInModal)
    // ==================================================================================
    const NewWalkInModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [waitSuggestion, setWaitSuggestion] = useState(null); 

        // 初始化時間
        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2,'0');
        let currentMin = Math.ceil(now.getMinutes() / 10) * 10;
        let startHour = parseInt(currentHour);
        if (currentMin >= 60) { currentMin = 0; startHour += 1; }
        const currentTimeStr = `${startHour.toString().padStart(2,'0')}:${currentMin === 0 ? '00' : currentMin}`;
        const todayStr = initialDate || now.toISOString().slice(0, 10);
        const defaultService = window.SERVICES_LIST ? window.SERVICES_LIST[2] : "Body Massage";

        const [form, setForm] = useState({ pax: 1, custName: '現場客', custPhone: '', time: currentTimeStr, date: todayStr });
        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
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
                if (newService && newService.includes('足')) copy[index].isOil = false;
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

        // --- 核心檢查 (Walk-in) ---
        const runCheckForTime = (timeToCheck, dateToCheck) => {
            const startMins = safeNormalizeMins(timeToCheck);
            const targetDateStandard = (dateToCheck||"").replace(/-/g, '/');

            // 0. 營業時間檢查
            let maxDuration = 0;
            guestDetails.forEach(g => {
                const d = safeGetDuration(g.service, 60);
                if (d > maxDuration) maxDuration = d;
            });
            const bizCheck = checkBusinessHoursViolation(timeToCheck, maxDuration);
            if (!bizCheck.valid) return bizCheck;

            const todays = safeBookings.filter(b => {
                if (!b || !b.startTimeString) return false;
                const bDate = b.startTimeString.split(' ')[0].replace(/-/g, '/');
                const isValidStatus = !b.status.includes('取消') && !b.status.includes('Cancel');
                return bDate === targetDateStandard && isValidStatus;
            });

            // 1. 人力
            const activeStaff = safeStaffList.filter(s => isStaffWorkingAt(s, startMins, dateToCheck));
            const totalActive = activeStaff.length;
            
            let busyTotal = 0;
            const checkEndMins = startMins + maxDuration;

            todays.forEach(b => {
                const bStart = safeNormalizeMins(b.startTimeString.split(' ')[1]);
                const bEnd = bStart + (b.duration || 60);
                const bPax = parseInt(b.pax) || 1;
                if (Math.max(startMins, bStart) < Math.min(checkEndMins, bEnd)) busyTotal += bPax;
            });

            const availTotal = totalActive - busyTotal;
            if (availTotal < form.pax) return { valid: false, reason: `❌ 人手不足 (剩餘: ${availTotal})` };

            // 1.5 [V52] 指定技師休假檢查 (Walk-in)
            for (let i = 0; i < guestDetails.length; i++) {
                const st = guestDetails[i].staff;
                if (['隨機', '男', '女'].some(k => st.includes(k))) continue;
                
                const staffObj = safeStaffList.find(s => s.id === st || s.name === st);
                if (staffObj) {
                    const dayStatus = getStaffDayStatus(staffObj, dateToCheck);
                    if (dayStatus === 'OFF') return { valid: false, reason: `❌ 技師 ${st} 當天休假` };
                    if (!isStaffWorkingAt(staffObj, startMins, dateToCheck)) return { valid: false, reason: `❌ 技師 ${st} 該時段未上班` };
                }
            }

            // 2. 硬體總量
            const { chairUsage, bedUsage } = calculateResourceUsage(todays);
            const tempChairUsage = new Uint8Array(chairUsage);
            const tempBedUsage = new Uint8Array(bedUsage);
            const CLEANUP_BUFFER = 10;

            for (let i = 0; i < guestDetails.length; i++) {
                const guest = guestDetails[i];
                const d = safeGetDuration(guest.service, 60);
                const type = getServiceType(guest.service);
                if (type === 'COMBO') {
                    const half = d / 2;
                    for(let t = startMins; t < startMins + half + CLEANUP_BUFFER; t++) tempChairUsage[t]++;
                    for(let t = startMins + half; t < startMins + d + CLEANUP_BUFFER; t++) tempBedUsage[t]++;
                } else if (type === 'CHAIR') {
                    for(let t = startMins; t < startMins + d + CLEANUP_BUFFER; t++) tempChairUsage[t]++;
                } else {
                    for(let t = startMins; t < startMins + d + CLEANUP_BUFFER; t++) tempBedUsage[t]++;
                }
            }

            for (let t = startMins; t < checkEndMins + CLEANUP_BUFFER; t++) {
                if (tempChairUsage[t] > SHOP_CONFIG.LIMIT_CHAIRS) return { valid: false, reason: "❌ 現場椅位客滿" };
                if (tempBedUsage[t] > SHOP_CONFIG.LIMIT_BEDS) return { valid: false, reason: "❌ 現場床位客滿" };
            }

            // 3. Tetris
            const slotMap = buildDetailedSlotMap(todays);
            const canFit = tryFitMixedServicesTetris(guestDetails, startMins, slotMap);
            if (!canFit) return { valid: false, reason: "❌ 現場座位碎片化 (無法安排連續)" };

            return { valid: true, reason: "OK" };
        };

        const performCheck = () => {
            const result = runCheckForTime(form.time, form.date);
            if (result.valid) {
                setCheckResult({ status: 'OK', message: "✅ 目前有空位，可直接入座" });
                setWaitSuggestion(null);
            } else {
                const parts = form.time.split(':').map(Number);
                let currentTotalMins = (parts[0]||0) * 60 + (parts[1]||0);
                let foundTime = null;
                let foundDate = form.date;
                let waitMins = 0;
                let isNextDay = false;

                for (let i = 1; i <= 18; i++) {
                    const nextMins = currentTotalMins + (i * 10);
                    let nh = Math.floor(nextMins / 60); let nm = nextMins % 60;
                    if (nh >= 24) nh -= 24; 
                    const nextTimeStr = `${nh.toString().padStart(2,'0')}:${(Math.floor(nm / 10) * 10).toString().padStart(2,'0')}`;
                    const nextCheck = runCheckForTime(nextTimeStr, form.date);
                    if (nextCheck.valid) { foundTime = nextTimeStr; waitMins = i * 10; break; }
                }

                if (!foundTime) {
                    const tmr = new Date(form.date); tmr.setDate(tmr.getDate() + 1);
                    const tomorrowStr = tmr.toISOString().slice(0, 10);
                    const morningSlots = ["08:00", "08:10", "08:20", "08:30", "08:40", "08:50", "09:00"];
                    for (let slot of morningSlots) {
                        if (runCheckForTime(slot, tomorrowStr).valid) { foundTime = slot; foundDate = tomorrowStr; isNextDay = true; break; }
                    }
                }

                if (foundTime) {
                    if (isNextDay) { setCheckResult({ status: 'FAIL', message: "⛔ 今日已滿" }); setWaitSuggestion({ time: foundTime, date: foundDate, isNextDay: true }); }
                    else { setCheckResult({ status: 'FAIL', message: `⚠️ 客滿 (${result.reason})` }); setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay: false }); }
                } else {
                    setCheckResult({ status: 'FAIL', message: "❌ 無法安排 (或已打烊)" });
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
                ngayDen: (form.date||"").replace(/-/g, '/'), 
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
                                    <label className="text-xs font-bold text-gray-500">人數</label>
                                    <select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select>
                                </div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">詳細資訊</div>
                                    {guestDetails.map((g, idx) => {
                                        const selectValue = (g.staff === '女' && g.isOil) ? 'FEMALE_OIL' : g.staff;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{idx+1}</div>
                                                <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestServiceChange(idx, e.target.value)}>
                                                    {(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}
                                                </select>
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
                                        <span>📅 {form.date === todayStr ? '今天' : form.date}</span>
                                        <span>⏰ {form.time}</span>
                                    </div>
                                    <div className="text-amber-800">{form.pax} 位顧客</div>
                                    {guestDetails.map((g,i)=> <div key={i} className="text-xs text-amber-700 mt-1 border-t border-amber-200 pt-1">#{i+1}: {g.service} - {g.staff}</div>)}
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
            console.log("♻️ AvailabilityModal Updated (V52)");
        }
        if (window.WalkInModal !== NewWalkInModal) {
            window.WalkInModal = NewWalkInModal;
            console.log("♻️ WalkInModal Updated (V52 - Aggressive OFF Check)");
        }
    }, 200);
    setTimeout(() => clearInterval(overrideInterval), 5000);

})();
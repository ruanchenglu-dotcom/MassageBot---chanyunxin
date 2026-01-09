/**
 * ============================================================================
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V86 (CORE V4.2 INTEGRATED)
 * NGÀY CẬP NHẬT: 2026-01-10
 * TÁC GIẢ: AI ASSISTANT & USER
 * * * * * * CẬP NHẬT LOGIC (V86):
 * 1. [CORE V4.2]: Tích hợp bộ xử lý trung tâm mới nhất (Resource Core V4.2).
 * 2. [FIX - TIME PARSING]: Sửa lỗi nghiêm trọng khi đọc thời gian booking cũ (dạng Date string).
 * -> Giúp hệ thống đếm đúng số lượng khách hiện tại (Total Capacity).
 * 3. [FIX - RESOURCE TYPE]: Cải thiện logic đoán Tài nguyên (Giường/Ghế) cho khách cũ.
 * -> Khách Combo cũ đang diễn ra sẽ được ưu tiên giữ Giường.
 * 4. [UI PRESERVATION]: Giữ nguyên giao diện React Tiếng Trung (ZH-TW) từ V85.
 * ============================================================================
 */

(function() {
    console.log("🚀 BookingHandler V86: Initializing with CORE V4.2 (Time Fix & Resource Fix)...");

    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React not found. Cannot start BookingHandler.");
        return;
    }

    // ========================================================================
    // PHẦN 1: CORE KERNEL V4.2 (EMBEDDED - GLOBAL OPTIMIZER)
    // "Bộ não" xử lý logic, tính toán tài nguyên và tìm thợ
    // ========================================================================
    const CoreKernel = (function() {
        
        // --- 1. CẤU HÌNH HỆ THỐNG ---
        const CONFIG = {
            // Tài nguyên phần cứng
            MAX_CHAIRS: 6,        
            MAX_BEDS: 6,          
            MAX_TOTAL_GUESTS: 12, 
            
            // Cấu hình thời gian (Đơn vị: Giờ)
            OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
            
            // Bộ đệm thời gian (Đơn vị: Phút)
            CLEANUP_BUFFER: 5,    // Thời gian dọn dẹp sau mỗi khách
            TRANSITION_BUFFER: 5, // Thời gian khách di chuyển giữa 2 dịch vụ (Combo)
            
            // Dung sai cho phép (Tránh lỗi làm tròn số học)
            TOLERANCE: 1,         
            
            // Giới hạn lịch trình
            MAX_TIMELINE_MINS: 1440 // 24 giờ * 60 phút
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
            console.log(`[CORE V4.2] Services Database Updated: ${Object.keys(SERVICES).length} entries.`);
        }

        // --- 3. BỘ CÔNG CỤ XỬ LÝ THỜI GIAN (TIME UTILITIES - NÂNG CẤP V4.2) ---
        /**
         * Phân tích chuỗi giờ thành số phút trong ngày (0 - 1440)
         * Nâng cấp V4.2: Xử lý được các định dạng "YYYY-MM-DD HH:mm", "HH:mm:ss", "T" separator
         */
        function getMinsFromTimeStr(timeStr) {
            if (!timeStr) return -1; 
            try {
                let str = timeStr.toString();
                
                // Bước 1: Nếu chuỗi chứa ngày tháng (có khoảng trắng hoặc chữ T), tách lấy phần giờ
                // Ví dụ: "2026-10-01 15:00:00" -> lấy "15:00:00"
                if (str.includes('T') || str.includes(' ')) {
                    // Regex tìm pattern HH:mm hoặc HH:mm:ss
                    const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
                    if (timeMatch) {
                        str = timeMatch[0]; // Lấy "15:00"
                    }
                }

                // Bước 2: Làm sạch và parse
                let cleanStr = str.trim().replace(/：/g, ':');
                const parts = cleanStr.split(':');
                
                if (parts.length < 2) return -1;
                
                let h = parseInt(parts[0], 10);
                let m = parseInt(parts[1], 10);
                
                if (isNaN(h) || isNaN(m)) return -1;
                
                // Xử lý logic qua ngày (nếu shop mở 24h hoặc làm đêm, nhưng ở đây fix theo OPEN_HOUR)
                // Nếu input là 01:00 mà Open Hour là 08:00, hệ thống hiểu là 25:00 (1h sáng hôm sau)
                if (h < CONFIG.OPEN_HOUR) h += 24; 
                
                return (h * 60) + m;
            } catch (e) {
                console.error("Error parsing time:", timeStr, e);
                return -1;
            }
        }

        function getTimeStrFromMins(mins) {
            let h = Math.floor(mins / 60);
            let m = mins % 60;
            if (h >= 24) h -= 24; 
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

        function isOverlap(startA, endA, startB, endB) {
            // Logic Overlap chuẩn: (StartA < EndB) và (StartB < EndA)
            const safeEndA = endA - CONFIG.TOLERANCE; 
            const safeEndB = endB - CONFIG.TOLERANCE;
            return (startA < safeEndB) && (startB < safeEndA);
        }

        // --- 4. KIỂM TRA TÀI NGUYÊN (LINE SWEEP ALGORITHM) ---
        function checkResourceCapacity(resourceType, start, end, bookings) {
            let limit = 0;
            if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
            else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
            else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
            else return true; 

            // Lọc ra các booking có liên quan đến khung giờ này
            let relevantBookings = bookings.filter(bk => {
                let isTypeMatch = (resourceType === 'TOTAL') ? true : (bk.resourceType === resourceType);
                return isTypeMatch && isOverlap(start, end, bk.start, bk.end);
            });

            if (relevantBookings.length === 0) return true;

            // Tạo các điểm sự kiện (Vào/Ra) để quét
            let points = [];
            
            // Thêm điểm bắt đầu và kết thúc của khoảng thời gian cần check (Window)
            points.push({ time: start, type: 'check_start' });
            points.push({ time: end, type: 'check_end' });

            relevantBookings.forEach(bk => {
                points.push({ time: bk.start, type: 'start' });
                points.push({ time: bk.end, type: 'end' });
            });

            // Sắp xếp: Thời gian tăng dần
            points.sort((a, b) => {
                if (a.time !== b.time) return a.time - b.time;
                // Thứ tự ưu tiên: start booking > check_start > check_end > end booking
                const priority = { 'start': 1, 'check_start': 2, 'check_end': 3, 'end': 4 };
                return priority[a.type] - priority[b.type];
            });

            let currentLoad = 0;
            
            for (const p of points) {
                if (p.type === 'start') currentLoad++;
                else if (p.type === 'end') currentLoad--;
                
                // Chỉ kiểm tra quá tải NẾU điểm thời gian nằm trong khoảng cần check
                if (p.time >= start && p.time < end) {
                     if (currentLoad > limit) {
                         return false; // QUÁ TẢI
                     }
                }
            }
            return true; 
        }

        // --- 5. TÌM NHÂN VIÊN (STAFF FINDER) ---
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
                if (!staffInfo || staffInfo.off) return false; 
                
                const shiftStart = getMinsFromTimeStr(staffInfo.start); 
                const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
                if (shiftStart === -1 || shiftEnd === -1) return false; 

                // Rule: Thời gian khách đặt phải nằm trong ca làm việc
                if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
                
                const isStrict = staffInfo.isStrictTime === true;
                if (isStrict) {
                    if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
                } else {
                    if (start > shiftEnd) return false;
                }

                // Rule: Không trùng lịch bận
                for (const b of busyList) {
                    if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
                }

                if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
                if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;

                return true; 
            };

            if (staffReq && staffReq !== 'RANDOM' && staffReq !== 'MALE' && staffReq !== 'FEMALE' && staffReq !== '隨機' && staffReq !== 'Any') {
                return checkOneStaff(staffReq) ? staffReq : null;
            } else {
                const allStaffNames = Object.keys(staffListRef);
                for (const name of allStaffNames) {
                    if (checkOneStaff(name)) return name;
                }
                return null;
            }
        }

        // --- 6. GLOBAL OPTIMIZER V4.2 (MAIN LOGIC) ---
        function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "錯誤：無效的時間格式 (Invalid Time Format)" };

            // ========================================================================
            // BƯỚC A: PHÂN LOẠI & TIỀN XỬ LÝ DỮ LIỆU
            // ========================================================================
            
            let hardBookings = [];
            let flexibleIntentions = [];
            let processedFlexibleStaff = new Set();

            // Sắp xếp booking cũ theo giờ để xử lý thứ tự chuẩn
            let sortedBookings = [...currentBookingsRaw].sort((a,b) => getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime));

            sortedBookings.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                
                // [FIX V4.2] Nếu parse lỗi, log warning nhưng không crash.
                if (bStart === -1) {
                    console.warn(`[CORE] Skipped booking due to time error: ${b.startTime}`);
                    return;
                }

                let svcInfo = SERVICES[b.serviceCode] || {};
                let isCombo = svcInfo.category === 'COMBO';
                // Fallback nhận diện qua tên
                if (!svcInfo.category && (b.serviceName.includes('Combo') || b.serviceName.includes('套餐'))) isCombo = true;

                let duration = b.duration || 60;
                
                // LOGIC "FLEXIBLE" (Khách cũ có thể đảo chiều):
                // Chỉ áp dụng nếu booking bắt đầu SAU hoặc CÙNG LÚC request mới.
                if (isCombo && bStart >= requestStartMins) {
                     if (processedFlexibleStaff.has(b.staffName)) return; 
                     
                     flexibleIntentions.push({
                         source: 'OLD',
                         staffName: b.staffName,
                         start: bStart,
                         duration: svcInfo.duration || 90, 
                         price: 0,
                         serviceName: b.serviceName
                     });
                     
                     processedFlexibleStaff.add(b.staffName);

                } else {
                    // LOGIC "HARD" (Khách cũ đã an bài / đang diễn ra):
                    // [FIX V4.2]: Cải thiện logic đoán Resource Type
                    
                    let rType = svcInfo.type || 'CHAIR'; 
                    const nameUpper = b.serviceName.toUpperCase();
                    
                    // 1. Nếu tên có Body/Oil/Pressure -> Chắc chắn là BED
                    if (nameUpper.includes('BODY') || nameUpper.includes('指壓') || nameUpper.includes('油') || nameUpper.includes('BED')) {
                        rType = 'BED';
                    }
                    // 2. [FIX V4.2] Nếu là Combo hoặc Set (套餐) đang diễn ra:
                    // Để an toàn và tránh báo ảo "Còn chỗ" khi thực tế giường đã full, ta ưu tiên gán là BED.
                    else if (isCombo || nameUpper.includes('COMBO') || nameUpper.includes('套餐') || nameUpper.includes('SET')) {
                         rType = 'BED';
                    }
                    
                    hardBookings.push({ 
                        start: bStart, 
                        end: bStart + duration, 
                        resourceType: rType, 
                        staffName: b.staffName 
                    });
                }
            });

            // --- Xử lý Khách Mới (Request) ---
            let newSingleGuests = [];
            
            guestList.forEach((g, index) => {
                const svc = SERVICES[g.serviceCode];
                if (!svc) return; 
                
                const guestObj = {
                    id: index,
                    staffReq: g.staffName,
                    serviceName: svc.name,
                    duration: svc.duration,
                    price: svc.price,
                    type: svc.type,
                    category: svc.category
                };

                if (svc.category === 'COMBO') {
                    flexibleIntentions.push({
                        source: 'NEW',
                        guestRef: guestObj,
                        start: requestStartMins,
                        duration: svc.duration,
                        staffReq: g.staffName
                    });
                } else {
                    newSingleGuests.push(guestObj);
                }
            });

            // ========================================================================
            // BƯỚC B: XẾP KHÁCH MỚI LẺ (SINGLE) TRƯỚC
            // ========================================================================
            
            let tentativeHardBookings = [...hardBookings];
            let finalDetails = new Array(guestList.length);

            for (const g of newSingleGuests) {
                const start = requestStartMins;
                const end = start + g.duration + CONFIG.CLEANUP_BUFFER;
                
                // Check Tài nguyên riêng (Giường/Ghế)
                if (!checkResourceCapacity(g.type, start, end, tentativeHardBookings)) {
                     return { feasible: false, reason: `資源不足 (Resource Full): ${g.type}` };
                }

                // Tìm Staff
                let allBusyStaffRanges = [...tentativeHardBookings];
                flexibleIntentions.forEach(f => {
                    if (f.source === 'OLD') {
                        allBusyStaffRanges.push({ start: f.start, end: f.start + f.duration, staffName: f.staffName });
                    }
                });

                const staff = findAvailableStaff(g.staffReq, start, end, staffList, allBusyStaffRanges);
                if (!staff) return { feasible: false, reason: `無可用技師 (No Staff): ${g.staffReq || 'Random'}` };

                tentativeHardBookings.push({ start: start, end: end, resourceType: g.type, staffName: staff });
                
                finalDetails[g.id] = {
                    guestIndex: g.id, staff: staff, service: g.serviceName, price: g.price, 
                    timeStr: `${timeStr} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
                };
            }

            // Nếu không có Combo nào cần tính -> Check tổng rồi Return
            if (flexibleIntentions.length === 0) {
                 // [FIX V4.2] Check Total Capacity một cách cẩn thận với toàn bộ danh sách
                 if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 5, tentativeHardBookings))
                    return { feasible: false, reason: "客滿 (已達12人上限/Full House)" };
                    
                 return { feasible: true, details: finalDetails, totalPrice: finalDetails.reduce((a,b)=>a+(b?b.price:0),0) };
            }

            // ========================================================================
            // BƯỚC C: GIẢ LẬP ĐA VŨ TRỤ (MULTIVERSE SIMULATION)
            // ========================================================================

            const scenarios = ['ALL_FB', 'ALL_BF', 'BALANCE_A', 'BALANCE_B'];
            
            for (const scenName of scenarios) {
                let simulationBookings = JSON.parse(JSON.stringify(tentativeHardBookings)); 
                let scenarioValid = true;
                let scenarioDetails = []; 

                for (let i = 0; i < flexibleIntentions.length; i++) {
                    const item = flexibleIntentions[i];
                    const half = Math.floor(item.duration / 2);
                    
                    // Quyết định chiến thuật đảo (Foot-Body hay Body-Foot)
                    let mode = 'FB';
                    if (scenName === 'ALL_FB') mode = 'FB';
                    else if (scenName === 'ALL_BF') mode = 'BF';
                    else if (scenName === 'BALANCE_A') mode = (i % 2 === 0) ? 'FB' : 'BF';
                    else if (scenName === 'BALANCE_B') mode = (i % 2 === 0) ? 'BF' : 'FB';

                    const p1Res = (mode === 'FB') ? 'CHAIR' : 'BED';
                    const p2Res = (mode === 'FB') ? 'BED' : 'CHAIR';
                    
                    const tStart = item.start;
                    const p1End = tStart + half;
                    const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                    const p2End = p2Start + half;
                    const fullEnd = p2End + CONFIG.CLEANUP_BUFFER;

                    // 1. Kiểm tra tài nguyên Giai đoạn 1
                    if (!checkResourceCapacity(p1Res, tStart, p1End + CONFIG.CLEANUP_BUFFER, simulationBookings)) {
                        scenarioValid = false; break;
                    }
                    simulationBookings.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: 'TEMP_P1' });

                    // 2. Kiểm tra tài nguyên Giai đoạn 2
                    if (!checkResourceCapacity(p2Res, p2Start, fullEnd, simulationBookings)) {
                        scenarioValid = false; break;
                    }

                    // 3. Xử lý Staff (Chỉ với khách NEW, khách OLD đã có staff cố định)
                    let assignedStaff = item.staffName; 
                    if (item.source === 'NEW') {
                        assignedStaff = findAvailableStaff(item.staffReq, tStart, fullEnd, staffList, simulationBookings);
                        if (!assignedStaff) {
                            scenarioValid = false; break;
                        }
                        scenarioDetails.push({
                            guestIndex: item.guestRef.id,
                            staff: assignedStaff,
                            service: item.guestRef.serviceName,
                            price: item.guestRef.price,
                            mode: mode, 
                            timeStr: `${timeStr} - ${getTimeStrFromMins(p2End)}`
                        });
                    }

                    // 4. Chốt Booking vào Simulation
                    simulationBookings.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: assignedStaff });
                    simulationBookings.push({ start: p2Start, end: fullEnd, resourceType: p2Res, staffName: assignedStaff });
                }

                // 5. Kiểm tra TỔNG SỐ KHÁCH (TOTAL LIMIT) lần cuối
                if (scenarioValid) {
                     if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 5, simulationBookings)) {
                         scenarioValid = false;
                     }
                }

                if (scenarioValid) {
                    scenarioDetails.forEach(d => { finalDetails[d.guestIndex] = d; });
                    const cleanDetails = finalDetails.filter(d => d);
                    
                    return {
                        feasible: true,
                        strategy: scenName,
                        details: cleanDetails,
                        totalPrice: cleanDetails.reduce((sum, item) => sum + item.price, 0)
                    };
                }
            }

            return { feasible: false, reason: "已嘗試優化排程，但仍無空位 (All Configurations Failed)" };
        }

        return { checkRequestAvailability, setDynamicServices };
    })();

    // ========================================================================
    // PHẦN 2: REACT UI LOGIC (GIAO DIỆN V86 - TIẾNG TRUNG PHỒN THỂ)
    // ========================================================================
    
    const { useState, useEffect, useMemo, useCallback } = React;

    const SHOP_UI_CONFIG = {
        HOURS_LIST: ['08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','00','01','02'],
        MINUTES_STEP: ['00', '10', '20', '30', '40', '50'],
        OPEN_HOUR: 8,
        MAX_PAX_SELECT: 6 
    };

    // --- DATA ADAPTERS ---
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
        
        const coreGuests = guests.map(g => ({
            serviceCode: g.service,
            staffName: g.staff === '隨機' ? 'RANDOM' : (g.staff === '女' || g.staff === 'FEMALE_OIL') ? 'FEMALE' : (g.staff === '男') ? 'MALE' : g.staff
        }));

        const targetDateStandard = date.replace(/-/g, '/');
        // V4.2 UPDATE: Xử lý booking cũ cẩn thận hơn để tránh lỗi dữ liệu
        const coreBookings = (Array.isArray(bookings) ? bookings : []).filter(b => {
            if (!b || !b.startTimeString || (b.status && (b.status.includes('hủy') || b.status.includes('Cancel')))) return false;
            // Chỉ lấy booking của ngày được chọn hoặc các booking xuyên ngày (cần logic phức tạp hơn nếu shop 24h)
            // Hiện tại filter theo ngày để tối ưu performance
            return b.startTimeString.split(' ')[0].replace(/-/g, '/') === targetDateStandard;
        }).map(b => ({
            serviceCode: b.serviceName, serviceName: b.serviceName, 
            // TRUYỀN NGUYÊN CHUỖI GỐC ĐỂ CORE V4.2 TỰ PARSE (QUAN TRỌNG)
            startTime: b.startTimeString, 
            duration: parseInt(b.duration) || 60, staffName: b.technician || b.staffId || "Unassigned"
        }));

        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = String(s.id).trim();
                staffMap[sId] = {
                    id: sId,
                    gender: s.gender,
                    start: s.shiftStart || "00:00", end: s.shiftEnd || "00:00",
                    isStrictTime: (s.isStrictTime === true || s.isStrictTime === 'TRUE'), 
                    off: (String(s.offDays).includes(date) || String(s[date]||"").toUpperCase().includes('OFF'))
                };
                if (s.name) staffMap[s.name] = staffMap[sId];
            });
        }

        try {
            const result = CoreKernel.checkRequestAvailability(date, time, coreGuests, coreBookings, staffMap);
            return result.feasible ? { valid: true, details: result.details } : { valid: false, reason: result.reason };
        } catch (err) {
            console.error("Core Error:", err);
            return { valid: false, reason: "System Error: " + err.message };
        }
    };

    const forceGlobalRefresh = () => { if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender(); else window.location.reload(); };

    // ==================================================================================
    // 3. COMPONENT: PHONE BOOKING MODAL (ZH-TW) - V86
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
            if (res.valid) { setCheckResult({ status: 'OK', message: "✅ 此時段可預約 (Available)" }); setSuggestions([]); }
            else {
                setCheckResult({ status: 'FAIL', message: res.reason });
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
            if (!form.custName.trim()) { alert("⚠️ 請輸入顧客姓名！"); return; }
            setIsSubmitting(true);
            try {
                const svcSum = guestDetails.map(g => g.service).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
                const oils = guestDetails.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean).join(',');
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
                        <h3 className="font-bold text-lg">📅 電話預約 (V86)</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step==='CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold text-gray-500">日期 (Date)</label><input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form,date:e.target.value});setCheckResult(null);}}/></div>
                                    <div><label className="text-xs font-bold text-gray-500">時間 (Time)</label>
                                    <div className="flex items-center gap-1"><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cH} onChange={e=>handleTimeChange('HOUR',e.target.value)}>{SHOP_UI_CONFIG.HOURS_LIST.map(h=><option key={h} value={h}>{h}</option>)}</select></div><span className="font-bold">:</span><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cM} onChange={e=>handleTimeChange('MINUTE',e.target.value)}>{SHOP_UI_CONFIG.MINUTES_STEP.map(m=><option key={m} value={m}>{m}</option>)}</select></div></div></div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">人數 (Pax)</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2"><div className="text-xs font-bold text-gray-400">詳細需求</div>
                                    {guestDetails.map((g,i)=>(
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師傅</option><option value="FEMALE_OIL">🚺 女+精油</option><option value="男">🚹 男師傅</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
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
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名 (Name)</label><input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custName} onChange={e=>setForm({...form,custName:e.target.value})} placeholder="請輸入顧客姓名..." disabled={isSubmitting}/></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼 (Phone)</label><input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custPhone} onChange={e=>setForm({...form,custPhone:e.target.value})} placeholder="09xx..." disabled={isSubmitting}/></div>
                                <div className="flex gap-2 pt-2"><button onClick={(e)=>{e.preventDefault();if(!isSubmitting)setStep('CHECK');}} className="flex-1 bg-gray-200 p-3 rounded font-bold text-gray-700 hover:bg-gray-300" disabled={isSubmitting}>⬅️ 返回</button><button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting?"處理中...":"✅ 確認預約"}</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 4. COMPONENT: WALK-IN MODAL (ZH-TW) - V86
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
            if (!form.custName.trim()) { alert("⚠️ 請輸入姓名！"); return; }
            setIsSubmitting(true);
            try {
                const svcSum = guestDetails.map(g => g.service).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
                const oils = guestDetails.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean).join(',');
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
                        <h3 className="font-bold text-lg">⚡ 現場客 (V86)</h3>
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
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師</option><option value="FEMALE_OIL">🚺+精油</option><option value="男">🚹 男師</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
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
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) { window.AvailabilityCheckModal = NewAvailabilityCheckModal; console.log("♻️ AvailabilityModal Injected (V86)"); }
        if (window.WalkInModal !== NewWalkInModal) { window.WalkInModal = NewWalkInModal; console.log("♻️ WalkInModal Injected (V86)"); }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);
})();
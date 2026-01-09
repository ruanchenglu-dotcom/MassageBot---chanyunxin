/**
 * ============================================================================
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V58 (Core Integrated - Logic Centralization)
 * NGÀY CẬP NHẬT: 2026-01-09
 * * * * * TÍNH NĂNG CỐT LÕI (V58):
 * 1. [REMOVED] Logic tính toán tài nguyên tại chỗ (Local Calculation).
 * 2. [ADDED]   Cầu nối trực tiếp tới `resource_core.js` (Backend Logic).
 * 3. [SYNC]    Đồng bộ dữ liệu Services và Bookings chuẩn xác trước khi check.
 * 4. [SCANNER] Hệ thống Smart Scanner sử dụng Core Logic để tìm giờ trống.
 * * * * * YÊU CẦU HỆ THỐNG:
 * - File `resource_core.js` phải được load trước file này hoặc các hàm của nó
 * phải khả dụng trong phạm vi toàn cục (Global Scope/Window).
 * ============================================================================
 */

(function() {
    console.log("🚀 BookingHandler V58 (Core Integrated): Hệ thống đang khởi động kết nối tới Core...");

    // -------------------------------------------------------------------------
    // 1. SAFETY CHECKS & SYSTEM DEPENDENCIES
    // -------------------------------------------------------------------------
    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React chưa được tải. BookingHandler dừng hoạt động.");
        return;
    }

    // Kiểm tra xem Core Logic có tồn tại không
    // Giả định: Các hàm của resource_core.js được expose ra window hoặc một object global
    // Nếu bạn dùng module bundler, bạn cần import chúng. Ở đây viết theo kiểu Browser Script.
    const CoreInterface = {
        checkRequestAvailability: window.checkRequestAvailability || (window.ResourceCore ? window.ResourceCore.checkRequestAvailability : null),
        setDynamicServices: window.setDynamicServices || (window.ResourceCore ? window.ResourceCore.setDynamicServices : null),
        isReady: function() {
            return typeof this.checkRequestAvailability === 'function';
        }
    };

    if (!CoreInterface.isReady()) {
        console.warn("⚠️ CẢNH BÁO: Không tìm thấy 'resource_core.js'. Hệ thống sẽ cố gắng tìm lại khi chạy.");
    }

    const { useState, useEffect, useMemo, useCallback } = React;

    // --- CẤU HÌNH CỬA HÀNG (UI CONFIG ONLY) ---
    // Các giới hạn Logic (Ghế/Giường) giờ đây do resource_core quyết định.
    const SHOP_UI_CONFIG = {
        OPEN_HOUR: 8,         
        CLOSE_HOUR: 3,        
        HOURS_LIST: [
            '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19',
            '20', '21', '22', '23', '00', '01', '02'
        ],
        MINUTES_STEP: ['00', '10', '20', '30', '40', '50']
    };

    // -------------------------------------------------------------------------
    // 2. DATA ADAPTERS (CẦU NỐI DỮ LIỆU UI <-> CORE)
    // -------------------------------------------------------------------------

    /**
     * Đồng bộ danh sách dịch vụ từ Window (UI) xuống Core (Logic).
     * Core cần biết duration, type của từng dịch vụ để tính toán.
     */
    const syncServicesToCore = () => {
        if (!CoreInterface.setDynamicServices) return;
        
        const rawServices = window.SERVICES_DATA || {};
        const formattedServices = {};

        // Chuyển đổi định dạng nếu cần thiết
        Object.keys(rawServices).forEach(key => {
            const svc = rawServices[key];
            formattedServices[key] = {
                name: svc.name || key,
                duration: parseInt(svc.duration) || 60,
                type: svc.type ? svc.type.toUpperCase() : 'BODY', // Default fallback
                category: svc.category || 'SINGLE',
                price: svc.price || 0
            };
        });

        CoreInterface.setDynamicServices(formattedServices);
        console.log("🔄 Synced Services to Core:", Object.keys(formattedServices).length);
    };

    /**
     * Chuyển đổi danh sách Booking hiện tại (từ API/UI) sang định dạng Core hiểu.
     * Core cần: { serviceCode, startTime (HH:mm), duration, staffName, ... }
     */
    const adaptBookingsForCore = (rawBookings, targetDateStr) => {
        if (!Array.isArray(rawBookings)) return [];

        // Chuẩn hóa ngày target (YYYY/MM/DD)
        const targetDateStandard = targetDateStr.replace(/-/g, '/');

        return rawBookings.filter(b => {
            if (!b || !b.startTimeString) return false;
            if (b.status && (b.status.includes('hủy') || b.status.includes('Cancel'))) return false;
            
            // Chỉ lấy booking của ngày đang check
            const bDatePart = b.startTimeString.split(' ')[0].replace(/-/g, '/');
            return bDatePart === targetDateStandard;
        }).map(b => {
            const timePart = b.startTimeString.split(' ')[1] || "00:00";
            return {
                serviceCode: b.serviceName, // Giả định serviceName đóng vai trò là Code
                serviceName: b.serviceName,
                startTime: timePart,
                duration: b.duration || 60,
                staffName: b.technician || b.staffId || b.serviceStaff || "Unassigned",
                // Các field phụ nếu Core cần
                rowId: b.rowId
            };
        });
    };

    /**
     * Chuyển đổi danh sách khách đang chọn trên UI sang format Core.
     * UI: [{ service: "Name", staff: "Id/Name" }]
     * Core: [{ serviceCode: "Code", staffName: "Id/Name" }]
     */
    const adaptGuestsForCore = (uiGuestDetails) => {
        return uiGuestDetails.map(g => ({
            serviceCode: g.service, // Ở hệ thống này Service Name đang dùng như ID
            staffName: g.staff === '隨機' ? 'RANDOM' : 
                       (g.staff === '女' || g.staff === 'FEMALE_OIL') ? 'FEMALE' : 
                       (g.staff === '男') ? 'MALE' : g.staff
        }));
    };

    /**
     * Hàm Wrapper quan trọng nhất: Gọi Core để kiểm tra khả thi.
     */
    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList) => {
        if (!CoreInterface.checkRequestAvailability) {
            console.error("❌ Resource Core functions not found!");
            return { valid: false, reason: "Lỗi hệ thống: Core Logic không phản hồi." };
        }

        // 1. Sync Service Definitions mới nhất
        syncServicesToCore();

        // 2. Prepare Data
        const coreGuests = adaptGuestsForCore(guests);
        const coreBookings = adaptBookingsForCore(bookings, date);
        
        // Chuyển staffList thành Map {ID: Data} nếu Core yêu cầu, hoặc để nguyên tùy implement
        // Giả sử Core nhận StaffList dạng object dictionary hoặc array. 
        // Dựa vào resource_core.js bạn cung cấp, nó cần staffListRef dạng Object { 'StaffName': { start, end, off... } }
        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = String(s.id).trim(); // ID nhân viên dùng làm Key
                staffMap[sId] = {
                    start: s.shiftStart || "00:00",
                    end: s.shiftEnd || "00:00",
                    off: (String(s.offDays).includes(date) || String(s[date]).toUpperCase().includes('OFF'))
                };
                // Map thêm tên nếu cần
                if (s.name && s.name !== s.id) {
                    staffMap[s.name] = staffMap[sId];
                }
            });
        }

        // 3. CALL CORE
        // Hàm signature trong resource_core.js: 
        // checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList)
        try {
            console.log(`📡 Sending to Core: Date=${date}, Time=${time}, Guests=${coreGuests.length}`);
            
            const result = CoreInterface.checkRequestAvailability(
                date,
                time,
                coreGuests,
                coreBookings,
                staffMap
            );

            // 4. Translate Result
            if (result.feasible) {
                return { valid: true, reason: "OK", details: result.details };
            } else {
                return { valid: false, reason: result.reason || "Không đủ tài nguyên (Core refused)" };
            }
        } catch (err) {
            console.error("🔥 Core Execution Error:", err);
            return { valid: false, reason: "Lỗi xử lý logic: " + err.message };
        }
    };

    /**
     * Refresh UI Helper
     */
    const forceGlobalRefresh = () => {
        console.log("🔄 Global Refresh Triggered.");
        if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender();
        else if (typeof window.location.reload === 'function') window.location.reload(); 
    };

    // ==================================================================================
    // 3. COMPONENT: 電話預約 (PHONE BOOKING MODAL V58)
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);

        const defaultService = (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) 
            ? window.SERVICES_LIST[2] // Thường là Body 60p
            : "Body Massage";

        const [form, setForm] = useState({
            date: initialDate || new Date().toISOString().slice(0, 10), 
            time: "12:00",
            pax: 2, 
            custName: '', 
            custPhone: ''
        });

        // Guest Details State
        const [guestDetails, setGuestDetails] = useState([
            { service: defaultService, staff: '隨機', isOil: false },
            { service: defaultService, staff: '隨機', isOil: false }
        ]);

        // Handler: Change Time
        const handleTimeChange = useCallback((type, value) => {
            setForm(prev => {
                const parts = (prev.time || "12:00").split(':');
                const h = type === 'HOUR' ? value : (parts[0] || "12");
                const m = type === 'MINUTE' ? value : (parts[1] || "00");
                return { ...prev, time: `${h}:${m}` };
            });
            setCheckResult(null); setSuggestions([]);
        }, []);

        // Handler: Change Pax
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

        // Handler: Update Guest Row
        const handleGuestUpdate = (index, field, value) => {
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const copy = [...prev];
                const current = { ...copy[index] };
                
                if (field === 'service') {
                    current.service = value;
                    // Auto-detect Oil flag based on service name if needed
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

        // --- CORE CHECK ACTION ---
        const performCheck = (e) => {
            if (e) e.preventDefault(); 
            
            // Gọi qua Bridge
            const result = callCoreAvailabilityCheck(
                form.date, 
                form.time, 
                guestDetails, 
                safeBookings, 
                safeStaffList
            );
            
            if (result.valid) { 
                setCheckResult({ status: 'OK', message: "✅ Core: 此時段可以預約 (Available)" }); 
                setSuggestions([]); 
            } else {
                setCheckResult({ status: 'FAIL', message: result.reason });
                
                // --- SCANNER LOGIC: Gọi Core liên tục để tìm giờ ---
                const foundSuggestions = [];
                const parts = form.time.split(':').map(Number);
                let currentTotalMins = (parts[0]||0) * 60 + (parts[1]||0);
                
                // Scan 4 hours next
                for (let i = 1; i <= 24; i++) { 
                    const nextMins = currentTotalMins + (i * 10);
                    let h = Math.floor(nextMins / 60); 
                    let m = nextMins % 60;
                    if (h >= 24) h -= 24; 
                    
                    const mStr = Math.floor(m / 10) * 10;
                    const nextTimeStr = `${h.toString().padStart(2,'0')}:${mStr.toString().padStart(2,'0')}`;
                    
                    // RE-CALL CORE for each slot
                    const scanRes = callCoreAvailabilityCheck(form.date, nextTimeStr, guestDetails, safeBookings, safeStaffList);
                    
                    if (scanRes.valid) { 
                        foundSuggestions.push(nextTimeStr); 
                        if (foundSuggestions.length >= 4) break; 
                    }
                }
                setSuggestions(foundSuggestions);
            }
        };

        // --- SAVE BOOKING ---
        const handleFinalSave = async (e) => {
            if (e) e.preventDefault();
            if (isSubmitting) return; 
            
            if (!form.custName || form.custName.trim() === '') { 
                alert("⚠️ 請輸入顧客姓名!"); 
                return; 
            }

            setIsSubmitting(true);

            try {
                // Tạo summary string
                const serviceSummary = guestDetails.map(g => g.service).filter((v, i, a) => a.indexOf(v) === i).join(', ');
                const oilNotes = guestDetails.map((g, i) => g.isOil ? `K${i+1}:油推` : null).filter(Boolean).join(',');
                
                // Construct Payload
                const payload = {
                    hoTen: form.custName, 
                    sdt: form.custPhone || "", 
                    dichVu: serviceSummary, 
                    pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), 
                    gioDen: form.time,
                    // Lấy thông tin khách đầu tiên làm đại diện (cho legacy structure)
                    nhanVien: guestDetails[0].staff, 
                    isOil: guestDetails[0].isOil,
                    // Map các khách tiếp theo vào các trường staffId2...
                    staffId2: guestDetails[1]?.staff || null, 
                    staffId3: guestDetails[2]?.staff || null, 
                    staffId4: guestDetails[3]?.staff || null, 
                    staffId5: guestDetails[4]?.staff || null, 
                    staffId6: guestDetails[5]?.staff || null,
                    ghiChu: oilNotes ? `(${oilNotes})` : "",
                    guestDetails: guestDetails // Full details object for advanced backend
                };

                console.log("💾 Saving Booking (V58 via Core Checked):", payload);

                if (typeof onSave === 'function') {
                    await Promise.resolve(onSave(payload));
                    forceGlobalRefresh();
                    setTimeout(() => { onClose(); setIsSubmitting(false); }, 500);
                }
            } catch (err) {
                console.error("Save Error:", err);
                alert("Lỗi khi lưu: " + err.message);
                setIsSubmitting(false);
            }
        };

        const [currentHour, currentMinute] = (form.time || "12:00").split(':');

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
                    
                    {/* HEADER */}
                    <div className="bg-[#0891b2] p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">📅 電話預約 (Core V58)</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>

                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                {/* DATE & TIME SELECTOR */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500">日期</label>
                                        <input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form, date:e.target.value}); setCheckResult(null);}}/>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500">時間</label>
                                        <div className="flex items-center gap-1">
                                            <div className="relative flex-1">
                                                <select className="w-full border p-2 rounded font-bold h-[42px] appearance-none text-center bg-white" value={currentHour} onChange={(e) => handleTimeChange('HOUR', e.target.value)}>
                                                    {SHOP_UI_CONFIG.HOURS_LIST.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                            <span className="font-bold">:</span>
                                            <div className="relative flex-1">
                                                <select className="w-full border p-2 rounded font-bold h-[42px] appearance-none text-center bg-white" value={currentMinute} onChange={(e) => handleTimeChange('MINUTE', e.target.value)}>
                                                    {SHOP_UI_CONFIG.MINUTES_STEP.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* PAX SELECTOR */}
                                <div>
                                    <label className="text-xs font-bold text-gray-500">人數</label>
                                    <select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>
                                        {[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} 位</option>)}
                                    </select>
                                </div>

                                {/* GUEST DETAILS */}
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
                                                    <optgroup label="技師列表">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup>
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* CHECK ACTION AREA */}
                                <div>
                                    {!checkResult ? (
                                        <button onClick={performCheck} className="w-full bg-cyan-600 text-white p-3 rounded font-bold shadow-lg hover:bg-cyan-700 transition">
                                            🔍 查詢空位 (Ask Core)
                                        </button>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {checkResult.message}
                                            </div>
                                            
                                            {/* Suggestion Chips */}
                                            {checkResult.status === 'FAIL' && suggestions.length > 0 && (
                                                <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                                                    <div className="text-xs font-bold text-yellow-700 mb-2">💡 Core 建議時段:</div>
                                                    <div className="flex gap-2 flex-wrap">
                                                        {suggestions.map(t=>(
                                                            <button key={t} onClick={()=>{setForm(f=>({...f, time:t})); setCheckResult(null); setSuggestions([]);}} className="px-3 py-1 bg-white border border-yellow-300 text-yellow-800 rounded font-bold hover:bg-yellow-100">
                                                                {t}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {checkResult.status === 'OK' ? (
                                                <button onClick={()=>setStep('INFO')} className="w-full bg-emerald-600 text-white p-3 rounded font-bold shadow-lg animate-pulse hover:bg-emerald-700">
                                                    ➡️ 下一步 (Next)
                                                </button>
                                            ) : (
                                                <button onClick={()=>{setCheckResult(null); setSuggestions([])}} className="w-full bg-gray-400 text-white p-3 rounded font-bold hover:bg-gray-500">
                                                    🔄 重新選擇 (Retry)
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-green-50 p-3 rounded border border-green-200">
                                    <div className="font-bold text-green-800 text-lg flex justify-between">
                                        <span>{form.date}</span>
                                        <span>{form.time}</span>
                                    </div>
                                    <div className="text-green-700">{form.pax} 位顧客</div>
                                    {guestDetails.map((g,i)=> (
                                        <div key={i} className="text-xs text-green-600 mt-1 border-t border-green-100 pt-1">
                                            #{i+1}: {g.service} - {g.staff} {g.isOil ? '(油)' : ''}
                                        </div>
                                    ))}
                                </div>

                                {/* INPUT FIELDS */}
                                <div>
                                    <label className="text-xs font-bold text-gray-500">顧客姓名 (Name)</label>
                                    <input 
                                        className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" 
                                        value={form.custName} 
                                        onChange={e => setForm({...form, custName: e.target.value})}
                                        placeholder="Nhập tên khách..."
                                        disabled={isSubmitting} 
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">電話號碼 (Phone)</label>
                                    <input 
                                        className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" 
                                        value={form.custPhone} 
                                        onChange={e => setForm({...form, custPhone: e.target.value})}
                                        placeholder="09xx..."
                                        disabled={isSubmitting} 
                                    />
                                </div>

                                {/* ACTION BUTTONS */}
                                <div className="flex gap-2 pt-2">
                                    <button 
                                        onClick={(e)=>{ e.preventDefault(); if(!isSubmitting) setStep('CHECK'); }} 
                                        className={`flex-1 bg-gray-200 p-3 rounded font-bold text-gray-700 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-300'}`}
                                        disabled={isSubmitting}
                                    >
                                        ⬅️ 返回 (Back)
                                    </button>
                                    
                                    <button 
                                        onClick={handleFinalSave} 
                                        className={`flex-1 p-3 rounded font-bold shadow-xl flex items-center justify-center gap-2 text-white transition-all
                                            ${isSubmitting ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Processing...
                                            </>
                                        ) : "✅ Confirm"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 4. COMPONENT: 現場客 (WALK-IN MODAL V58)
    // ==================================================================================
    const NewWalkInModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [waitSuggestion, setWaitSuggestion] = useState(null); 
        const [isSubmitting, setIsSubmitting] = useState(false); 

        // Init Time Logic (Rounding up to nearest 10m)
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

        // Handlers similar to Phone Modal
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

        const handleGuestUpdate = (index, field, value) => {
            setCheckResult(null); setWaitSuggestion(null);
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

        // --- SCANNER LOGIC FOR WALK-IN ---
        const performCheck = (e) => {
            if (e) e.preventDefault();
            
            // 1. Check current slot via Core
            const result = callCoreAvailabilityCheck(form.date, form.time, guestDetails, safeBookings, safeStaffList);
            
            if (result.valid) {
                setCheckResult({ status: 'OK', message: "✅ Core: 目前有空位，可直接入座" });
                setWaitSuggestion(null);
            } else {
                // 2. Not valid -> Start Smart Scanner (Core powered)
                const parts = form.time.split(':').map(Number);
                let currentTotalMins = (parts[0]||0) * 60 + (parts[1]||0);
                
                let foundTime = null;
                let foundDate = form.date;
                let waitMins = 0;
                let isNextDay = false;

                // A. Scan next 3 hours (Today)
                for (let i = 1; i <= 18; i++) { // 18 * 10 = 180 mins
                    const nextMins = currentTotalMins + (i * 10);
                    let nh = Math.floor(nextMins / 60); let nm = nextMins % 60;
                    if (nh >= 24) nh -= 24; 
                    
                    const nextTimeStr = `${nh.toString().padStart(2,'0')}:${(Math.floor(nm / 10) * 10).toString().padStart(2,'0')}`;
                    const nextCheck = callCoreAvailabilityCheck(form.date, nextTimeStr, guestDetails, safeBookings, safeStaffList);
                    
                    if (nextCheck.valid) { foundTime = nextTimeStr; waitMins = i * 10; break; }
                }

                // B. Scan Tomorrow Morning (Smart Next-Day)
                if (!foundTime) {
                    const tmr = new Date(form.date); 
                    tmr.setDate(tmr.getDate() + 1);
                    const tomorrowStr = tmr.toISOString().slice(0, 10);
                    
                    const openH = SHOP_UI_CONFIG.OPEN_HOUR;
                    const startScanMins = openH * 60; 
                    const maxScanMins = startScanMins + (4 * 60); // Scan 4 hours from Open

                    for (let t = startScanMins; t < maxScanMins; t += 10) {
                        const h = Math.floor(t / 60);
                        const m = t % 60;
                        const scanTimeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                        
                        const slotCheck = callCoreAvailabilityCheck(tomorrowStr, scanTimeStr, guestDetails, safeBookings, safeStaffList);
                        
                        if (slotCheck.valid) {
                            foundTime = scanTimeStr;
                            foundDate = tomorrowStr;
                            isNextDay = true;
                            break; 
                        }
                    }
                }

                // C. Feedback to User
                if (foundTime) {
                    if (isNextDay) { 
                        setCheckResult({ status: 'FAIL', message: "⛔ 今日已滿" }); 
                        setWaitSuggestion({ time: foundTime, date: foundDate, isNextDay: true }); 
                    } else { 
                        setCheckResult({ status: 'FAIL', message: `⚠️ 客滿 (${result.reason})` }); 
                        setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay: false }); 
                    }
                } else {
                    setCheckResult({ status: 'FAIL', message: "❌ 無法安排 (Core refused all slots)" });
                    setWaitSuggestion(null);
                }
            }
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault();
            if (isSubmitting) return;

            if (!form.custName || form.custName.trim() === '') { alert("⚠️ 請輸入顧客姓名!"); return; }
            
            setIsSubmitting(true);

            try {
                const serviceSummary = guestDetails.map(g => g.service).filter((v, i, a) => a.indexOf(v) === i).join(', ');
                const oilNotes = guestDetails.map((g, i) => g.isOil ? `K${i+1}:油推` : null).filter(Boolean).join(',');
                
                const payload = {
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
                };

                console.log("💾 Saving Walk-in (V58 via Core):", payload);

                if (typeof onSave === 'function') {
                    await Promise.resolve(onSave(payload));
                    forceGlobalRefresh();
                    setTimeout(() => { onClose(); setIsSubmitting(false); }, 500);
                }
            } catch(err) {
                console.error("Save error:", err);
                alert("Lỗi lưu đơn: " + err.message);
                setIsSubmitting(false);
            }
        };

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-600 p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg flex items-center gap-2"><i className="fas fa-bolt"></i> 現場客 (Core Walk-in)</h3>
                        <button onClick={onClose}><i className="fas fa-times text-xl"></i></button>
                    </div>
                    
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">人數</label>
                                    <select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} 位</option>)}</select>
                                </div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    <div className="text-xs font-bold text-gray-400">詳細資訊</div>
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
                                                    <optgroup label="技師列表">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup>
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
                                                <button onClick={(e) => { e.preventDefault(); setForm({...form, time: waitSuggestion.time, date: waitSuggestion.date}); setStep('INFO'); }} className="w-full bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">
                                                    ➡️ 接受安排
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                <div className="pt-2 grid grid-cols-2 gap-3">
                                    <button onClick={onClose} className="bg-gray-100 text-gray-500 font-bold p-3 rounded hover:bg-gray-200">取消</button>
                                    {!checkResult || checkResult.status === 'FAIL' ? (
                                        <button onClick={performCheck} className="bg-amber-500 text-white font-bold p-3 rounded hover:bg-amber-600 shadow-lg">🔍 檢查</button>
                                    ) : (
                                        <button onClick={() => setStep('INFO')} className="bg-emerald-600 text-white font-bold p-3 rounded hover:bg-emerald-700 shadow-lg animate-pulse">➡️ 下一步</button>
                                    )}
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
                                
                                <div>
                                    <label className="text-xs font-bold text-gray-500">顧客姓名</label>
                                    <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custName} onChange={e=>setForm({...form, custName:e.target.value})} placeholder="Nhập tên khách..." disabled={isSubmitting} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">電話號碼</label>
                                    <input className="w-full border p-3 rounded font-bold text-lg focus:ring-2 focus:ring-amber-500 outline-none" value={form.custPhone} onChange={e=>setForm({...form, custPhone:e.target.value})} placeholder="09xx..." disabled={isSubmitting} />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button onClick={(e) => {e.preventDefault(); if(!isSubmitting) setStep('CHECK');}} className={`bg-gray-200 text-gray-600 p-3 rounded font-bold ${isSubmitting?'opacity-50':''}`} disabled={isSubmitting}>⬅️ 返回</button>
                                    
                                    <button onClick={handleFinalSave} className={`flex items-center justify-center gap-2 text-white p-3 rounded font-bold shadow-xl transition-all ${isSubmitting ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'}`} disabled={isSubmitting}>
                                        {isSubmitting ? "Processing..." : "✅ 確認開單"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 5. SYSTEM INJECTION (AUTO LOAD)
    // ==================================================================================
    const overrideInterval = setInterval(() => {
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) {
            window.AvailabilityCheckModal = NewAvailabilityCheckModal;
            console.log("♻️ AvailabilityModal Injected (V58 - Core)");
        }
        if (window.WalkInModal !== NewWalkInModal) {
            window.WalkInModal = NewWalkInModal;
            console.log("♻️ WalkInModal Injected (V58 - Core)");
        }
    }, 200);

    setTimeout(() => {
        clearInterval(overrideInterval);
        console.log("✅ BookingHandler V58: Injection Completed.");
    }, 5000);

})();
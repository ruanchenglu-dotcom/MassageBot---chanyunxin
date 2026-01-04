// TYPE: views.js
const { useState, useEffect, useMemo, useRef } = React;

// --- 1. TIMELINE VIEW ---
const TimelineView = ({ timelineData }) => {
    // Cấu hình thời gian hiển thị
    const startHour = 8;
    const endHour = 27; // 27 = 3h sáng hôm sau
    const hours = Array.from({length: endHour - startHour + 1}, (_, i) => i + startHour);

    // Cấu hình kích thước
    const PIXELS_PER_MIN = 2.2; 
    const HOUR_WIDTH = 60 * PIXELS_PER_MIN; // ~132px/giờ
    const HEADER_HEIGHT = 45;
    const ROW_HEIGHT = 60; 
    const LEFT_COL_WIDTH = 80;

    // Tổng độ rộng (Quan trọng để thanh cuộn hoạt động)
    const TOTAL_WIDTH = LEFT_COL_WIDTH + (hours.length * HOUR_WIDTH);

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

    const safeData = timelineData || {};

    return (
        <div className="bg-white rounded shadow border border-slate-200 h-[calc(100vh-170px)] overflow-x-scroll overflow-y-auto relative custom-scrollbar pb-2">
            
            {/* Style riêng cho thanh cuộn */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar:horizontal { height: 25px !important; }
                .custom-scrollbar::-webkit-scrollbar:vertical { width: 14px !important; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #94a3b8; border-radius: 20px; border: 4px solid #f1f5f9; background-clip: content-box; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #64748b; }
                .custom-scrollbar::-webkit-scrollbar-corner { background: #f1f5f9; }
            `}</style>

            <div style={{ width: `${TOTAL_WIDTH}px`, minWidth: '100%' }}>
                
                {/* HEADER (Sticky) */}
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

                {/* BODY ROWS */}
                <div className="relative bg-white pb-4">
                    {rows.map((row, index) => {
                        // Logic thêm đường kẻ đỏ phân cách khu vực
                        const isLastChairRow = index === 5;
                        const rowStyleClass = isLastChairRow 
                            ? "border-b-4 border-red-500" // Đường kẻ đỏ đậm
                            : "border-b border-slate-100"; 

                        return (
                            <div key={row.id} className={`flex relative transition-colors hover:bg-slate-50 ${rowStyleClass}`} style={{ height: `${ROW_HEIGHT}px` }}>
                                {/* Cột tên (Sticky Left) */}
                                <div className={`sticky left-0 z-20 shrink-0 border-r border-slate-300 flex items-center justify-center font-bold text-sm shadow-[2px_0_5px_rgba(0,0,0,0.05)] ${row.type === 'chair' ? 'bg-teal-50 text-teal-800' : 'bg-purple-50 text-purple-800'}`}
                                     style={{ width: `${LEFT_COL_WIDTH}px` }}>
                                    {row.label}
                                </div>
                                
                                {/* Vùng Timeline */}
                                <div className="relative flex-1 h-full">
                                    {/* Kẻ dọc */}
                                    <div className="absolute inset-0 flex pointer-events-none z-0">
                                        {hours.map(h => (
                                            <div key={h} className="shrink-0 border-r border-slate-200 h-full border-dashed" style={{width: `${HOUR_WIDTH}px`}}></div>
                                        ))}
                                    </div>

                                    {/* Booking Blocks */}
                                    {safeData[row.id] && safeData[row.id].map((slot, idx) => {
                                        let startMins = slot.start; 
                                        let duration = slot.end - slot.start;
                                        const startOffset = startMins - (startHour * 60); 
                                        const leftPos = startOffset * PIXELS_PER_MIN;
                                        const width = duration * PIXELS_PER_MIN;

                                        let bgClass = "bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200";
                                        if (slot.booking.category === 'COMBO') bgClass = "bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200";
                                        if (slot.booking.isOil) bgClass = "bg-pink-100 text-pink-800 border-pink-300 hover:bg-pink-200";
                                        
                                        const label = getDisplayLabel(slot.booking);

                                        return (
                                            <div key={idx} 
                                                 className={`absolute top-1 bottom-1 rounded border px-2 flex flex-col justify-center text-xs overflow-hidden shadow-sm z-10 cursor-pointer transition-all ${bgClass}`}
                                                 style={{left: `${leftPos}px`, width: `${width}px`}}
                                                 title={`${slot.booking.serviceName} - ${slot.booking.customerName}`}
                                            >
                                                <div className="font-bold truncate text-[12px] leading-tight">{label}</div>
                                                <div className="truncate opacity-75 text-[10px] flex items-center gap-1 mt-0.5">
                                                    <i className="fas fa-clock text-[9px]"></i> {slot.booking.serviceName}
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

// --- 2. COMMISSION VIEW ---
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
        if (name.includes('50')) return 1.5;
        if (name.includes('45')) return 1;
        if (name.includes('40')) return 1;
        if (name.includes('35')) return 1;
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

        bookings.forEach(b => {
            if (b.status && (b.status.includes('取消') || b.status.includes('Cancel') || b.status.includes('❌'))) return;
            
            let potentialRawStrings = [
                b.staffId, b.serviceStaff, b.technician, b.StaffId, 
                b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6,
                b.ServiceStaff, b.Technician
            ];
            const distinctNames = potentialRawStrings.join(',').split(/[,，\s/]+/).map(s => s.trim()).filter(s => s && s !== 'null' && s !== 'undefined' && s.length > 0);
            const validNames = [...new Set(distinctNames)].filter(name => {
                const n = name.toLowerCase();
                return !['隨機', '男', '女', '男師傅', '女師傅', '不指定', '指定', 'male', 'female', 'random'].some(bad => n.includes(bad));
            });

            validNames.forEach(key => {
                const normKey = normalize(key);
                let staffStat = lookupMap[normKey];
                if (!staffStat) {
                    staffStat = { id: key, name: key, jie: 0, oil: 0, income: 0, orderCount: 0, isGhost: true };
                    stats[key] = staffStat; 
                    lookupMap[normKey] = staffStat; 
                }
                if (staffStat) {
                    const q = getJieCount(b.serviceName, b.duration);
                    const hasOil = isOilService(b);
                    staffStat.jie += q;
                    staffStat.orderCount += 1;
                    if (hasOil) staffStat.oil += 1;
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
                <div className="flex items-center gap-4"><h2 className="text-sm font-bold flex items-center gap-2"><i className="fas fa-calculator"></i> 薪資與節數統計</h2><span className="text-xs text-gray-300 bg-white/10 px-2 py-0.5 rounded">有效單數: {validOrders}</span></div>
                <div className="text-right"><div className="text-[10px] text-gray-300 bg-white/10 px-2 py-0.5 rounded inline-block font-mono">(節數×{RATES.JIE_PRICE}) + (精油×{RATES.OIL_BONUS})</div></div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50">
                <table className="w-full text-left border-collapse relative">
                    <thead className="sticky top-0 z-10 shadow-sm"><tr className="bg-slate-200 text-slate-700 font-bold text-sm border-b border-slate-300"><th className="py-2 px-4 text-left w-1/4">技師</th><th className="py-2 px-4 text-center">總節數</th><th className="py-2 px-4 text-center">精油</th><th className="py-2 px-4 text-center">客數</th><th className="py-2 px-4 text-right w-1/4">總薪資</th></tr></thead>
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

// --- 3. REPORT VIEW ---
const ReportView = ({ bookings }) => {
    const safeBookings = Array.isArray(bookings) ? bookings : [];
    
    // Tính toán doanh thu bao gồm cả đơn hoàn thành
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
                <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100"><h3 className="text-gray-500 font-bold mb-2">本日營收</h3><div className="text-4xl font-black text-emerald-600">${processedStats.revenue.toLocaleString()}</div></div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100"><h3 className="text-gray-500 font-bold mb-2">已服務人數</h3><div className="text-4xl font-black text-blue-600">{processedStats.guests}</div></div>
            </div>
            <div className="bg-white rounded-xl shadow border overflow-hidden flex flex-col h-[600px]">
                <div className="p-3 bg-slate-50 border-b font-bold text-slate-700 shrink-0">交易明細</div>
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-slate-500 sticky top-0 shadow-sm z-10"><tr><th className="p-3 bg-white">時間</th><th className="p-3 bg-white">姓名</th><th className="p-3 bg-white">服務</th><th className="p-3 bg-white">師傅</th><th className="p-3 text-right bg-white">金額</th></tr></thead>
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
                                        const unitPrice = window.getPrice(b.serviceName); const oilPrice = window.getOilPrice(b.isOil || (b.serviceName && b.serviceName.includes('油'))); const singlePrice = unitPrice + oilPrice;
                                        let staffName = staffList[k] || b.serviceStaff || b.staffId || '隨機';
                                        rows.push(<tr key={`${b.rowId}-${k}`}><td className="p-3 font-mono">{(b.startTimeString||' ').split(' ')[1]}</td><td className="p-3 font-bold">{b.customerName}{(pax > 1 || k > 0) && <span className="ml-2 text-xs text-gray-400 font-normal">#{k + 1}</span>}</td><td className="p-3">{b.serviceName}</td><td className="p-3 font-mono font-bold text-indigo-700">{staffName}</td><td className="p-3 text-right font-bold text-emerald-700">${singlePrice.toLocaleString()}</td></tr>);
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

// --- 4. RESOURCE CARD ---
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
                
                // Logic nhận diện Combo (kể cả khi Category chưa kịp update, dựa vào tên)
                const isComboName = data.booking.serviceName && (data.booking.serviceName.includes('套餐') || data.booking.serviceName.includes('Combo'));
                const isCombo = data.booking.category === 'COMBO' || isComboName;

                if (isCombo) {
                    const sequence = (data.comboMeta && data.comboMeta.sequence) || 'FB';
                    const split = window.getComboSplit(data.booking.duration, data.isMaxMode, sequence);
                    const flex = data.comboMeta && data.comboMeta.flex ? data.comboMeta.flex : 0;
                    const phase1Ms = (split.phase1 + flex) * 60000; 
                    const currentSwitchPct = ((split.phase1 + flex) / (data.booking.duration || 1)) * 100;
                    setSwitchPercent(currentSwitchPct);
                    
                    if (elapsed < phase1Ms) {
                        const left = Math.floor((phase1Ms - elapsed) / 60000);
                        setPhaseTimeLeft(left);
                        setPhaseLabel(split.type1 === 'FOOT' ? '👣 足部 (Phase 1)' : '🛏️ 身體 (Phase 1)');
                    } else {
                        setPhaseTimeLeft(totalLeft);
                        setPhaseLabel(split.type2 === 'FOOT' ? '👣 足部 (Phase 2)' : '🛏️ 身體 (Phase 2)');
                    }
                } else { setPhaseLabel(null); setSwitchPercent(null); }
            }, 1000); 
            return () => clearInterval(timer);
        } else { setPercent(0); setTimeLeft(0); setPhaseLabel(null); }
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
    if(isOccupied && data.isRunning && data.startTime) {
        startObj = new Date(data.startTime);
        endObj = new Date(startObj.getTime() + (data.booking.duration || 60) * 60000);
        if(isCombo) {
            const seq = (data.comboMeta && data.comboMeta.sequence) || 'FB';
            const split = window.getComboSplit(data.booking.duration, data.isMaxMode, seq);
            switchObj = new Date(startObj.getTime() + (split.phase1 + flexMinutes) * 60000);
        }
    }
    let splitText = '';
    if (isCombo) {
        const sequence = (data.comboMeta && data.comboMeta.sequence) || 'FB';
        const split = window.getComboSplit(data.booking.duration, true, sequence);
        splitText = sequence === 'FB' ? `(足:${split.phase1} ➜ 身:${split.phase2})` : `(身:${split.phase1} ➜ 足:${split.phase2})`;
    }

    if (!isOccupied) {
        return (
            <div className={`res-card h-72 flex flex-col border-2 ${statusColor} relative`}>
                <div className="flex justify-between items-center p-2 border-b border-black/5 bg-black/5"><span className="font-black text-xs text-gray-500 uppercase">{type} {index}</span></div>
                <div className="flex-1 p-2 relative flex flex-col justify-center text-center"><button onClick={onSelect} className="w-full h-full flex flex-col items-center justify-center text-gray-300 hover:text-green-600 transition-colors group"><i className="fas fa-plus text-5xl"></i><span className="text-sm font-bold mt-2">排入 (Assign)</span></button></div>
            </div>
        );
    }
    return (
        <div className={`res-card h-72 flex flex-col border-2 ${statusColor} relative`}>
            <div className="flex justify-between items-center p-2 border-b border-black/5 bg-black/5"><span className="font-black text-xs text-gray-500 uppercase">{type} {index}</span>{data.isRunning && !isPreview && (<div className={`text-xs font-mono font-bold ${timeLeft < 0 ? 'text-red-600 animate-pulse' : 'text-green-700'}`}>{timeLeft}m</div>)}{isPreview && data.timeToStart !== undefined && (<div className="text-xs font-bold text-blue-600 bg-blue-100 px-1 rounded">{data.previewType === 'NOW' ? 'NOW' : `${data.timeToStart}m`}</div>)}</div>
            <div className="flex-1 p-2 relative flex flex-col justify-center text-center pb-12">
                {data.isRunning && !isPreview && (<><div className="absolute bottom-0 left-0 h-1 bg-green-500 progress-bar z-0" style={{width: `${percent}%`}}></div>{isCombo && switchPercent && (<div className="absolute bottom-0 h-full w-[2px] bg-red-400 z-0 opacity-30 border-r border-white" style={{left: `${switchPercent}%`}}></div>)}</>)}
                <div className="z-10 relative flex flex-col gap-2">
                    <div className="absolute -top-12 right-0 z-40 bg-white border-2 border-slate-200 rounded-lg shadow-sm px-3 py-1 flex items-center gap-2"><div className="text-xl font-black text-slate-800 text-center">{staffDisplay || <span className="text-gray-300 text-xs">Waiting</span>}</div><button onClick={(e) => { e.stopPropagation(); onSplit(id); }} className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 text-xs shadow-sm transition-transform hover:scale-110" title="Split / Add Staff"><i className="fas fa-user-plus"></i></button></div>
                    {isCombo && (<div className="absolute -top-12 left-0 flex gap-1"><button onClick={(e) => { e.stopPropagation(); onToggleSequence(id); }} className="text-xs font-bold px-2 py-1 rounded shadow z-50 bg-blue-100 text-blue-700 hover:bg-blue-200"><i className="fas fa-sync-alt"></i></button><button onClick={(e) => { e.stopPropagation(); onToggleMax(id); }} className={`text-xs font-bold px-2 py-1 rounded shadow z-50 transition-colors ${data.isMaxMode ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-500'}`}><i className="fas fa-bolt"></i> Max</button></div>)}
                    <div className="font-bold text-slate-800 text-2xl truncate mt-4">{(data.booking.customerName || 'Unknown').split('(')[0]}{(data.booking.pax > 1) && <span className="text-sm text-gray-400 ml-1">(Grp)</span>}</div>
                    <select className="text-sm font-bold text-gray-500 text-center bg-transparent border-b border-dashed border-gray-300 focus:outline-none w-full truncate cursor-pointer hover:bg-gray-50" value={data.booking.serviceName || ''} onChange={(e) => onServiceChange(id, e.target.value)} onClick={(e) => e.stopPropagation()}>{window.SERVICES_LIST.map(svc => <option key={svc} value={svc}>{svc}</option>)}</select>
                    {isCombo && <div className="text-xs text-slate-400 font-mono">{splitText}</div>}
                    {isCombo && data.isRunning && phaseLabel && (<div className={`text-sm font-black p-2 rounded border bg-white/80 ${phaseLabel.includes('足') ? 'text-emerald-700 border-emerald-200' : 'text-purple-700 border-purple-200'}`}>{phaseLabel} {flexMinutes>0 && <span className="text-xs text-orange-500 bg-orange-100 px-1 rounded ml-1">+{flexMinutes}m</span>} <div className="text-xl font-mono mt-1">{phaseTimeLeft}分</div></div>)}
                    {isCombo && data.isRunning && data.comboMeta && data.comboMeta.targetId && (<div className="text-[10px] text-gray-400">➜ 轉: {data.comboMeta.targetId.toUpperCase()}</div>)}
                    {isOilJob && <div className="text-xs text-purple-600 font-bold border border-purple-200 bg-purple-50 rounded px-2 py-1 inline-block">💧 精油 (Oil)</div>}
                    {data.isRunning && !isPreview && startObj && (<div className="bg-slate-50 rounded p-2 text-xs text-left space-y-1 mt-2 border border-slate-200 shadow-inner opacity-90"><div className="text-slate-600 font-bold flex justify-between"><span>🕒 開始:</span> <span className="font-mono text-blue-600">{formatTimeStr(startObj)}</span></div>{isCombo && switchObj && <div className="text-slate-500 flex justify-between"><span>⇄ 轉場:</span> <span className="font-mono text-orange-500">{formatTimeStr(switchObj)}</span></div>}<div className="text-slate-600 font-bold flex justify-between"><span>🏁 結束:</span> <span className="font-mono text-green-600">{formatTimeStr(endObj)}</span></div></div>)}
                    {isPreview && (<div className="mt-2 text-xs font-bold text-center">{data.previewType === 'NOW' && <span className="text-red-500 animate-pulse">🔴 該上鐘了 (Start Now)</span>}{data.previewType === 'SOON' && <span className="text-blue-500">🔵 預約即將到來</span>}{data.previewType === 'PHASE2' && <span className="text-orange-500">🟠 轉場準備</span>}</div>)}
                </div>
            </div>
            <div className="absolute bottom-0 left-0 w-full p-2 bg-white z-50 border-t">
                {!data.isRunning || isPreview ? (
                    <div className="grid grid-cols-2 gap-2"><button onClick={()=>onAction(id, 'start')} className={`py-2 rounded font-bold text-white text-sm shadow-md ${isPreview && data.previewType==='NOW' ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-green-600 hover:bg-green-700'}`}>開始 (Start)</button><button onClick={()=>onAction(id, 'cancel')} className="py-2 rounded font-bold text-red-600 bg-red-50 border border-red-200 text-sm shadow-sm">取消 (Cancel)</button></div>
                ) : (
                    <div className="grid grid-cols-2 gap-2"><button onClick={()=>onAction(id, 'pause')} className={`py-1.5 rounded font-bold text-white text-xs shadow flex items-center justify-center ${data.isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}>{data.isPaused ? '▶ 繼續' : '⏸ 暫停'}</button>{isCombo ? (<button onClick={()=>onSwitch(id, type==='FOOT'?'bed':'chair')} className="py-1.5 rounded font-bold text-white bg-orange-500 hover:bg-orange-600 flex items-center justify-center text-xs shadow"><i className="fas fa-exchange-alt mr-1"></i> 轉場</button>) : (<div className="hidden"></div>)}<button onClick={()=>onAction(id, 'finish')} className="py-1.5 rounded font-bold text-white bg-blue-600 hover:bg-blue-700 text-xs shadow flex items-center justify-center"><i className="fas fa-check-square mr-1"></i> 結帳</button><button onClick={()=>onAction(id, 'cancel_midway')} className="py-1.5 rounded font-bold text-white bg-red-500 hover:bg-red-600 text-xs shadow flex items-center justify-center"><i className="fas fa-times-circle mr-1"></i> 棄單</button></div>
                )}
            </div>
        </div>
    );
};
window.ResourceCard = ResourceCard;
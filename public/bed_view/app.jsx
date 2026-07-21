const { useState, useEffect, useRef } = React;

const SHOPS = ['本館', '對面館'];
const getBedsForShop = (shop) => {
    const prefix = shop === '本館' ? '1-' : '2-';
    const beds = [];
    for (let i = 1; i <= 6; i++) { beds.push(`床${prefix}${i}`); }
    for (let i = 1; i <= 6; i++) { beds.push(`腳${prefix}${i}`); }
    return beds;
};

const getInternalBedId = (displayBedId) => {
    if (!displayBedId) return '';
    const isBed = displayBedId.includes('床');
    const type = isBed ? 'BED' : 'CHAIR';
    const numPart = displayBedId.replace(/[^0-9-]/g, ''); // Extracts '1-1'
    return `${type}-${numPart}`;
};

// --- Setup Screen Component ---
const SetupScreen = ({ onComplete }) => {
    const [shop, setShop] = useState(SHOPS[0]);
    const [leftBed, setLeftBed] = useState('');
    const [rightBed, setRightBed] = useState('');
    const beds = getBedsForShop(shop);

    useEffect(() => {
        setLeftBed(beds[0]);
        setRightBed(beds[1]);
    }, [shop]);

    const handleSave = () => {
        if (!leftBed || !rightBed) return alert('請選擇2張床/椅');
        const config = { shop, leftBed, rightBed };
        localStorage.setItem('bed_display_config', JSON.stringify(config));
        onComplete(config);
    };

    return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-slate-900 text-white p-2">
            <h1 className="text-xl font-bold mb-2 text-cyan-400">床/椅螢幕設定</h1>
            
            <div className="bg-slate-800 p-4 rounded-xl shadow-lg w-full max-w-lg border border-slate-700">
                <div className="mb-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1">選擇分店</label>
                    <select 
                        value={shop} 
                        onChange={e => setShop(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded p-1.5 text-sm focus:ring-2 focus:ring-cyan-500"
                    >
                        {SHOPS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">左側螢幕</label>
                        <select 
                            value={leftBed} 
                            onChange={e => setLeftBed(e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded p-1.5 text-sm"
                        >
                            {beds.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">右側螢幕</label>
                        <select 
                            value={rightBed} 
                            onChange={e => setRightBed(e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded p-1.5 text-sm"
                        >
                            {beds.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                </div>

                <button 
                    onClick={handleSave}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded text-sm transition-all shadow-lg"
                >
                    <i className="fas fa-save mr-1"></i> 儲存設定並開始
                </button>
            </div>
        </div>
    );
};

// --- Single Bed Panel Component ---
const BedPanel = ({ bedId, bookings, shop }) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const internalBedId = getInternalBedId(bedId);
    
    // Updated filter logic: matching actual internal IDs from API payload
    const bedBookings = bookings.filter(b => 
        b.phase1_res_idx === internalBedId || 
        b.phase2_res_idx === internalBedId ||
        b.phase1_resource === internalBedId ||
        b.phase2_resource === internalBedId ||
        (b.allocated_resource && b.allocated_resource.includes(internalBedId))
    );
    
    const parseTime = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        
        // Handle cross-day (00:00 - 05:00 belong to the next day if current physical time is > 05:00)
        if (h < 5) {
            if (new Date().getHours() >= 5) {
                d.setDate(d.getDate() + 1);
            }
        }
        return d.getTime();
    };

    const isRunning = (status) => ['Running', '服務中', 'Serving', '🟡'].some(k => status?.includes(k));
    const isDone = (status) => ['Done', 'hoàn thành', 'Completed', '✅', '結帳', '已結帳', '完成'].some(k => status?.includes(k));
    
    bedBookings.sort((a, b) => {
        const tA = parseTime(a.booking_time || a.start_time_str || a.time);
        const tB = parseTime(b.booking_time || b.start_time_str || b.time);
        return tA - tB;
    });

    let currentBooking = null;
    let nextBooking = null;

    const nowTime = currentTime.getTime();

    // 1. Check if any booking is currently RUNNING
    currentBooking = bedBookings.find(b => !isDone(b.status) && isRunning(b.status));

    // 2. If none running, find the earliest NOT DONE booking that hasn't expired completely
    if (!currentBooking) {
        currentBooking = bedBookings.find(b => {
            if (isDone(b.status)) return false;
            const t = parseTime(b.booking_time || b.start_time_str || b.time);
            const durationMs = (b.duration || 60) * 60000;
            // It's valid if its end time + 60 mins grace period is still in the future
            return (t + durationMs + 60 * 60000) > nowTime;
        });
    }

    // 3. Find the next booking
    if (currentBooking) {
        nextBooking = bedBookings.find(b => {
            if (isDone(b.status)) return false;
            if (b.rowId === currentBooking.rowId) return false;
            const t = parseTime(b.booking_time || b.start_time_str || b.time);
            const currT = parseTime(currentBooking.booking_time || currentBooking.start_time_str || currentBooking.time);
            return t >= currT;
        });
    }

    const updateStatus = async (status, setStartTime = false) => {
        if (!currentBooking) return;
        try {
            await axios.post('/api/update-status', {
                rowId: currentBooking.rowId,
                status: status,
                syncStartTime: setStartTime
            });
        } catch (e) {
            console.error('Update status failed', e);
            alert('狀態更新失敗');
        }
    };

    const serviceStr = currentBooking?.service || currentBooking?.serviceName || '';
    const isCombo = serviceStr.toLowerCase().includes('combo') || serviceStr.toLowerCase().includes('thái') || serviceStr.toLowerCase().includes('泰');
    const running = currentBooking ? isRunning(currentBooking.status) : false;
    
    let displayTime = "00:00";
    if (currentBooking && running) {
        let bTimeStr = currentBooking.time || currentBooking.booking_time || currentBooking.start_time_str;
        if (bTimeStr) {
            const start = parseTime(bTimeStr);
            const diff = Math.max(0, nowTime - start);
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            displayTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }

    const isOccupied = currentBooking && running;
    const headerBg = isOccupied ? 'bg-red-900/50 text-red-400 border-red-800' : 'bg-emerald-900/50 text-emerald-400 border-emerald-800';

    return (
        <div className="flex flex-col h-full w-full border-r border-slate-700 last:border-r-0 relative">
            
            {/* Top Half: Current Booking */}
            <div className="flex-[3] flex flex-col border-b border-slate-700 p-1 sm:p-2 min-h-0">
                {/* Header */}
                <div className={`px-2 py-1 rounded flex justify-center items-center gap-2 border ${headerBg} mb-1 sm:mb-2 shrink-0`}>
                    <div className="text-[12px] sm:text-base font-bold">
                        {isOccupied ? <i className="fas fa-bed"></i> : <i className="fas fa-check-circle"></i>}
                    </div>
                    <h2 className="text-lg sm:text-xl font-black">{bedId}</h2>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-row gap-1 sm:gap-2 min-h-0">
                    
                    {/* Left: Info & Timer */}
                    <div className="flex-1 flex flex-col justify-center bg-slate-800/80 rounded border border-slate-700 p-1.5 sm:p-2 min-w-0">
                        {currentBooking ? (
                            <div className="flex flex-col text-[10px] sm:text-xs mb-1 min-h-0 shrink-0">
                                <div className="truncate"><span className="text-slate-400">客戶: </span><span className="font-bold text-white">{currentBooking.name || currentBooking.customerName || currentBooking.originalName}</span></div>
                                <div className="truncate"><span className="text-slate-400">師傅: </span><span className="font-bold text-amber-400">{currentBooking.staff || currentBooking.staffName || currentBooking.serviceStaff}</span></div>
                                <div className="truncate text-cyan-300 font-semibold">{serviceStr}</div>
                            </div>
                        ) : (
                            <div className="text-[10px] sm:text-xs text-slate-500 mb-1 flex items-center justify-center shrink-0">目前無客</div>
                        )}
                        <div className={`flex-1 flex items-center justify-center text-4xl sm:text-5xl font-black tabular-nums tracking-tighter ${running ? 'text-white' : 'text-slate-600'}`}>
                            {displayTime}
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="w-16 sm:w-24 flex flex-col gap-1 sm:gap-2 shrink-0">
                        {currentBooking && !running && (
                            <button 
                                onClick={() => updateStatus('🟡服務中', true)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs sm:text-sm transition-all shadow-md active:scale-95 flex flex-col items-center justify-center"
                            >
                                <i className="fas fa-play mb-0.5"></i> 開始
                            </button>
                        )}
                        
                        {currentBooking && running && (
                            <>
                                {isCombo ? (
                                    <button 
                                        onClick={() => updateStatus('⏳等待中')}
                                        className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded text-[10px] sm:text-xs transition-all active:scale-95 flex flex-col items-center justify-center leading-tight"
                                    >
                                        <i className="fas fa-exchange-alt mb-0.5"></i> 換面/換椅
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => updateStatus('⏳等待中')}
                                        className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded text-[10px] sm:text-xs transition-all active:scale-95 flex flex-col items-center justify-center leading-tight"
                                    >
                                        <i className="fas fa-pause mb-0.5"></i> 暫停
                                    </button>
                                )}
                                
                                <button 
                                    onClick={() => {
                                        if(confirm('您確定要結束此服務嗎？')) {
                                            updateStatus('✅完成');
                                        }
                                    }}
                                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-[10px] sm:text-xs transition-all shadow-md active:scale-95 flex flex-col items-center justify-center leading-tight"
                                >
                                    <i className="fas fa-flag-checkered mb-0.5"></i> 結束
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Half: Next Booking */}
            <div className="flex-[2] flex flex-col p-1 sm:p-2 min-h-0 bg-slate-900">
                <div className="bg-indigo-900/30 border border-indigo-800/50 px-2 py-0.5 rounded flex items-center mb-1 shrink-0">
                    <span className="text-[10px] sm:text-xs font-bold text-indigo-400 uppercase">下一位</span>
                </div>
                
                <div className="flex-1 flex flex-col justify-center items-center text-center bg-slate-800/30 rounded border border-slate-700/50 p-1 sm:p-2 min-h-0 overflow-hidden">
                    {nextBooking ? (
                        <div className="flex flex-col gap-0.5 w-full text-[10px] sm:text-xs">
                            <div className="text-white font-black text-xs sm:text-sm">{nextBooking.time || nextBooking.booking_time || nextBooking.start_time_str}</div>
                            <div className="text-cyan-400 font-bold truncate">{nextBooking.name || nextBooking.customerName || nextBooking.originalName}</div>
                            <div className="text-amber-400 truncate">師傅: {nextBooking.staff || nextBooking.staffName || nextBooking.serviceStaff}</div>
                            <div className="text-slate-400 truncate scale-90 origin-top">{nextBooking.service || nextBooking.serviceName}</div>
                        </div>
                    ) : (
                        <div className="text-slate-600 text-[10px] sm:text-xs flex flex-col items-center">
                            <i className="fas fa-calendar-times mb-1 opacity-50"></i>
                            無預約
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- Main Split Screen Layout ---
const SplitScreenApp = ({ config, onReset }) => {
    const [bookings, setBookings] = useState([]);
    const [now, setNow] = useState(new Date());
    
    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const res = await axios.get(`/api/info?_t=${Date.now()}`);
                if (res.data && res.data.bookings) {
                    setBookings(res.data.bookings);
                }
            } catch (e) {
                console.error("Fetch info error:", e);
            }
        };

        fetchInfo();
        const interval = setInterval(fetchInfo, 5000);
        
        let wakeLock = null;
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await navigator.wakeLock.request('screen');
                }
            } catch (err) {}
        };
        requestWakeLock();
        document.addEventListener('visibilitychange', () => {
            if (wakeLock !== null && document.visibilityState === 'visible') requestWakeLock();
        });

        return () => {
            clearInterval(interval);
            if (wakeLock) wakeLock.release();
        };
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei' });

    return (
        <div className="flex w-full h-full bg-slate-900 relative overflow-hidden">
            
            {/* Clock - Top Center */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 z-50 text-white font-black text-lg sm:text-xl bg-slate-900/95 px-4 py-1 rounded-full border-2 border-slate-600 shadow-xl backdrop-blur-md">
                {timeString}
            </div>

            {/* Fullscreen - Top Left */}
            <button 
                onClick={() => {
                    if (!document.fullscreenElement) {
                        if (document.documentElement.requestFullscreen) {
                            document.documentElement.requestFullscreen().catch(e => console.log(e));
                        } else if (document.documentElement.webkitRequestFullscreen) {
                            document.documentElement.webkitRequestFullscreen();
                        }
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen().catch(e => console.log(e));
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        }
                    }
                }}
                className="absolute top-1 left-2 z-50 bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white w-7 h-7 flex items-center justify-center rounded-full text-xs border border-slate-600 backdrop-blur shadow-md transition-colors"
                title="全螢幕"
            >
                <i className="fas fa-expand"></i>
            </button>
            
            {/* Settings - Top Right */}
            <button 
                onClick={onReset}
                className="absolute top-1 right-2 z-50 bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white w-7 h-7 flex items-center justify-center rounded-full text-xs border border-slate-600 backdrop-blur shadow-md transition-colors"
                title="設定"
            >
                <i className="fas fa-cog"></i>
            </button>
            
            <div className="w-1/2 h-full">
                <BedPanel bedId={config.leftBed} bookings={bookings} shop={config.shop} />
            </div>
            <div className="w-1/2 h-full">
                <BedPanel bedId={config.rightBed} bookings={bookings} shop={config.shop} />
            </div>
        </div>
    );
};

// --- Login Component ---
const LoginScreen = ({ onLogin }) => {
    const [pwd, setPwd] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (pwd === '888888') {
            localStorage.setItem('bed_auth_token', 'true');
            onLogin();
        } else {
            setError('密碼錯誤！');
            setPwd('');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-slate-900 text-white p-2">
            <div className="bg-slate-800 p-4 sm:p-6 rounded-xl shadow-2xl border border-slate-700 max-w-sm w-full text-center">
                <i className="fas fa-lock text-2xl text-cyan-400 mb-2"></i>
                <h2 className="text-lg font-bold mb-4">登入床位管理系統</h2>
                <form onSubmit={handleSubmit}>
                    <input 
                        type="password" 
                        value={pwd}
                        onChange={(e) => setPwd(e.target.value)}
                        placeholder="輸入密碼..."
                        className="w-full bg-slate-700 border border-slate-600 rounded p-2 text-sm text-center mb-2 focus:ring-2 focus:ring-cyan-500"
                        autoFocus
                    />
                    {error && <p className="text-red-400 mb-2 font-semibold text-[10px]">{error}</p>}
                    <button 
                        type="submit"
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded text-sm transition-all"
                    >
                        登入系統
                    </button>
                </form>
            </div>
        </div>
    );
};

// --- Main Entry ---
const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [config, setConfig] = useState(null);

    useEffect(() => {
        const auth = localStorage.getItem('bed_auth_token');
        if (auth === 'true') {
            setIsAuthenticated(true);
        }
        
        const saved = localStorage.getItem('bed_display_config');
        if (saved) {
            setConfig(JSON.parse(saved));
        }
    }, []);

    if (!isAuthenticated) {
        return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
    }

    if (!config) {
        return <SetupScreen onComplete={setConfig} />;
    }

    return <SplitScreenApp config={config} onReset={() => setConfig(null)} />;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

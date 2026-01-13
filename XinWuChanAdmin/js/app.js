// TYPE: app.js
// VERSION: V100.0 (COMPACT INTERLEAVING - LOGIC TIẾT KIỆM TÀI NGUYÊN)
// UPDATE: 2026-01-13
// AUTHOR: AI ASSISTANT & USER
//
// --- CHANGE LOG V100.0 ---
// 1. [OPTIMIZATION] LOGIC XẾP SLOT THÔNG MINH (COMPACT PLACEMENT):
//    - Vấn đề cũ (V99.9): Nhóm 6 người (3FB + 3BF) bị xếp dàn trải ra 6 Ghế + 6 Giường. Gây lãng phí tài nguyên, chặn khách lẻ.
//    - Giải pháp mới: Áp dụng thuật toán "Modulo Wrapping" (Cuốn chiếu).
//      + Nửa nhóm đầu (K1-K3) -> Ưu tiên Slot 1, 2, 3.
//      + Nửa nhóm sau (K4-K6) -> Quay vòng lại ưu tiên Slot 1, 2, 3.
//      + Kết quả: K1 (làm chân Ghế 1) và K4 (làm body Giường 1) sẽ đổi chỗ cho nhau ở Phase 2.
//      + Tổng tài nguyên tiêu tốn: Chỉ 3 Ghế + 3 Giường cho cả nhóm 6 người.

const { useState, useEffect, useMemo, useRef } = React;

// --- 1. COMPONENT IMPORTS ---
const CommissionView = window.CommissionView;
const TimelineView = window.TimelineView;
const BookingListView = window.BookingListView;

// --- MATRIX HELPER ENHANCED ---
const MatrixHelper = {
    // Kiểm tra va chạm thời gian giữa 2 khoảng [startA, endA] và [startB, endB]
    isOverlap: (startA, endA, startB, endB) => {
        return (startA < endB) && (startB < endA);
    },

    // Hàm tìm slot trống thông minh (First-Fit Strategy)
    // Hỗ trợ tham số preferredIndex để cố gắng xếp khách vào vị trí tương ứng với số thứ tự của họ (Khách 1 -> Ghế 1)
    findBestSlot: (type, start, end, gridState, reservedTimes, preferredIndex = null) => {
        const limit = 6;
        
        // [Optimization]: Thử index ưu tiên trước (VD: Để nhóm khách nằm gần nhau hoặc lắp vào chỗ trống)
        if (preferredIndex) {
            const id = `${type}-${preferredIndex}`;
            let valid = true;
            
            // Check 1: Va chạm với đơn ĐANG CHẠY (Hard Reservation)
            // reservedTimes chứa thời điểm kết thúc của các đơn đang chạy thực tế
            if (reservedTimes[id] && start < reservedTimes[id]) valid = false;
            
            // Check 2: Va chạm với đơn DỰ KIẾN (Ghost Blocks / Planned)
            // gridState chứa các block đã được xếp (cả đang chạy và dự kiến)
            if (valid && gridState[id]) {
                for (const slot of gridState[id]) {
                    if (MatrixHelper.isOverlap(start, end, slot.start, slot.end)) {
                        valid = false;
                        break;
                    }
                }
            }
            if (valid) return id;
        }

        // Fallback: Nếu slot ưu tiên không được, quét tất cả các slot từ 1 đến 6
        for (let i = 1; i <= limit; i++) {
            const id = `${type}-${i}`;
            
            // Check 1: Va chạm với đơn ĐANG CHẠY (Hard Reservation)
            if (reservedTimes[id] && start < reservedTimes[id]) continue;
            
            // Check 2: Va chạm với đơn DỰ KIẾN (Ghost Blocks / Planned)
            let isClash = false;
            if (gridState[id]) {
                for (const slot of gridState[id]) {
                    if (MatrixHelper.isOverlap(start, end, slot.start, slot.end)) {
                        isClash = true;
                        break;
                    }
                }
            }
            
            // Nếu không va chạm, đây là slot tốt nhất (First-Fit)
            if (!isClash) return id;
        }
        return null; // Không tìm thấy slot trống nào
    }
};

// --- SMART NOTE PARSER V99.8 (ROBUST VERSION) ---
// Hàm này giúp phân tích ghi chú để tìm Flow cho TỪNG khách cụ thể (K1, K2...)
// Được nâng cấp để xử lý các trường hợp ký tự lạ, khoảng trắng, dấu câu khác nhau.
const detectFlowFromNote = (note, guestIndex) => {
    if (!note) return null;
    
    // 1. Data Cleaning (Làm sạch dữ liệu đầu vào)
    // - Chuyển về chữ hoa
    // - Thay thế dấu hai chấm/phẩy tiếng Trung (： ，) thành tiếng Anh
    // - Xóa khoảng trắng thừa để tránh lỗi split
    const rawStr = note.toString().toUpperCase();
    const cleanNote = rawStr
        .replace(/：/g, ':')
        .replace(/，/g, ',')
        .replace(/;/g, ',')
        .replace(/\(/g, ',')
        .replace(/\)/g, ',')
        .replace(/\s+/g, ''); // Xóa hết dấu cách: "K 4 : 先做腳" -> "K4:先做腳"

    // 2. Logic cho ghi chú cụ thể (Có thẻ K1, K2...)
    // guestIndex input vào đây là 0, 1, 2... -> Map thành K1, K2, K3...
    const kTag = `K${guestIndex + 1}`; 
    
    // Kiểm tra sơ bộ xem note có chứa tag K nào không
    const hasAnyKTag = /K\d/.test(cleanNote);

    if (hasAnyKTag) {
        // Cắt chuỗi note thành các phần dựa trên dấu phẩy
        // Do đã clean ở trên, chuỗi sẽ dạng: "SDT:099,K1:BODY,K2:FOOT,K3:..."
        const parts = cleanNote.split(',');
        
        for (const part of parts) {
            // Chỉ xét phần text có chứa tag của khách hiện tại (VD: K4)
            // Logic tìm kiếm bao dung hơn: Chỉ cần trong đoạn text đó có K4 và từ khóa
            if (part.includes(kTag)) {
                
                // [V99.8 KEYWORD UPDATE]
                // 1. Nhóm từ khóa Body First (Làm giường trước)
                if (part.includes('BODY') || part.includes('BF') || 
                    part.includes('先做身體') || part.includes('先身') || part.includes('先做身体')) {
                    return 'BF';
                }
                
                // 2. Nhóm từ khóa Foot First (Làm ghế trước)
                if (part.includes('FOOT') || part.includes('FB') || 
                    part.includes('先做腳') || part.includes('先做脚') || 
                    part.includes('先足') || part.includes('先做足') || 
                    part.includes('腳') || part.includes('脚') || part.includes('足')) {
                    return 'FB';
                }
            }
        }
        // Nếu có K-Tag tổng thể nhưng không tìm thấy chỉ thị cho khách index này -> Trả về null
        // ĐỂ CHO LOGIC SKEPTIC XỬ LÝ
        return null; 
    }

    // 3. Logic cho ghi chú chung (Fallback cũ - dành cho đơn lẻ hoặc nhóm nhỏ không dùng tag K)
    if (cleanNote.includes('BF') || cleanNote.includes('BODYFIRST') || cleanNote.includes('先做身體')) return 'BF';
    if (cleanNote.includes('FB') || cleanNote.includes('FOOTFIRST') || cleanNote.includes('先做腳')) return 'FB';
    
    return null;
};


// --- APP COMPONENT ---
const App = () => {
    // 1. STATE MANAGEMENT
    const [activeTab, setActiveTab] = useState('map'); // map | timeline | list | report | commission
    const [staffList, setStaffList] = useState([]);
    const [bookings, setBookings] = useState([]); 
    const [resourceState, setResourceState] = useState({}); 
    const [statusData, setStatusData] = useState({});
    const [timelineData, setTimelineData] = useState({}); 
    
    // Modal States
    const [showWalkIn, setShowWalkIn] = useState(false);
    const [showCheckIn, setShowCheckIn] = useState(false);
    const [showAvailability, setShowAvailability] = useState(false); 
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [billingData, setBillingData] = useState(null);
    const [comboStartData, setComboStartData] = useState(null);
    const [splitData, setSplitData] = useState(null);
    
    // Manual Edit State (Cây bút chì)
    const [editComboTarget, setEditComboTarget] = useState(null);

    // System States
    const [viewDate, setViewDate] = useState(window.getOperationalDateInputFormat());
    const [syncLock, setSyncLock] = useState(false);
    const [quotaError, setQuotaError] = useState(false); 

    // 2. HELPER FUNCTIONS & LOGIC
    
    // Kiểm tra xem nhân viên có đang bận thật sự không
    const isActuallyBusy = (staffId) => {
        if (!resourceState) return false;
        return Object.values(resourceState).some(r => {
            if (!r.isRunning || r.isPaused || r.isPreview === true) return false;
            const b = r.booking || {};
            // Kiểm tra tất cả các trường có thể chứa ID nhân viên
            const possibleKeys = [
                b.serviceStaff, b.staffId, b.ServiceStaff, b.technician, b.Technician,
                b.staffId2, b.StaffId2, b.staff2, b.Staff2,
                b.staffId3, b.StaffId3, b.staff3, b.Staff3,
                b.staffId4, b.StaffId4, b.staff4, b.Staff4,
                b.staffId5, b.StaffId5, b.staff5, b.Staff5,
                b.staffId6, b.StaffId6, b.staff6, b.Staff6
            ];
            return possibleKeys.includes(staffId);
        });
    };

    // Lấy danh sách ID nhân viên đang bận (Dùng cho UI hiển thị thẻ nhân viên)
    const busyStaffIds = useMemo(() => {
        const ids = new Set();
        Object.values(resourceState).forEach(r => {
            if (r.isRunning && !r.isPaused && r.isPreview !== true) {
                const b = r.booking || {};
                if(b.serviceStaff) ids.add(b.serviceStaff);
                if(b.staffId) ids.add(b.staffId);
                if(b.staffId2) ids.add(b.staffId2);
                if(b.staffId3) ids.add(b.staffId3);
                if(b.staffId4) ids.add(b.staffId4);
                if(b.staffId5) ids.add(b.staffId5);
                if(b.staffId6) ids.add(b.staffId6);
            }
        });
        return Array.from(ids);
    }, [resourceState]);

    // API Sync Functions
    const updateResource = async (newState) => { 
        setResourceState(newState); 
        await axios.post('/api/sync-resource', newState); 
    };
    
    const updateStaffStatus = async (newStatus) => { 
        setStatusData(newStatus); 
        await axios.post('/api/sync-staff-status', newStatus); 
    }

    // Xác định xem booking hiện tại là khách thứ mấy trong nhóm
    const getGroupMemberIndex = (targetResId, targetRowId) => {
        const allSlots = [];
        for(let i=1; i<=6; i++) allSlots.push(`chair-${i}`);
        for(let i=1; i<=6; i++) allSlots.push(`bed-${i}`);
        
        const groupSlots = allSlots.filter(slotId => {
            const res = resourceState[slotId];
            return res && res.booking && String(res.booking.rowId) === String(targetRowId);
        });
        
        groupSlots.sort((a, b) => window.getWeight(a) - window.getWeight(b));
        return groupSlots.indexOf(targetResId); 
    };

    const universalSend = async (endpoint, payload) => {
        try { await axios.post(endpoint, payload); } catch(e) { console.log("Universal send check (ignore):", e); }
    };

    // 3. CORE LOGIC (FETCH & RENDER) - TRÁI TIM CỦA HỆ THỐNG
    const fetchData = async () => {
        if (syncLock) return;
        if (quotaError) return;

        try {
            const res = await axios.get('/api/info');
            setQuotaError(false); 
            
            const { bookings: apiBookings, staffList: apiStaff, resourceState: serverRes, staffStatus: serverStaff } = res.data;
            
            // PARSING DỮ LIỆU TỪ SERVER
            const cleanBookings = (apiBookings || []).map(b => {
                let rawFlow = b.flow || null;
                const p1 = b.phase1_duration ? parseInt(b.phase1_duration) : null;
                const p2 = b.phase2_duration ? parseInt(b.phase2_duration) : null;

                return { 
                    ...b, 
                    duration: window.getSafeDuration(b.serviceName, b.duration),
                    pax: parseInt(b.pax, 10) || 1,
                    rowId: String(b.rowId),
                    phase1_duration: p1,
                    phase2_duration: p2,
                    flow: rawFlow,
                    // Giữ lại ghi chú gốc để xử lý logic nhóm sau
                    originalNote: b.ghiChu || b.note || "" 
                };
            });

            // Lọc các booking
            const safeBookingsArray = Array.isArray(cleanBookings) ? cleanBookings : [];
            const relevantBookings = safeBookingsArray.filter(b => 
                window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate) && 
                !b.status.includes('取消') && 
                !b.status.includes('Cancelled')
            );
            
            // Merge bookings để tránh UI flickering
            if (!syncLock) {
                setBookings(prev => {
                    const combinedMap = new Map();
                    relevantBookings.forEach(b => combinedMap.set(String(b.rowId), b));
                    prev.forEach(localBooking => {
                        const rid = String(localBooking.rowId);
                        if (combinedMap.has(rid)) {
                            const serverBooking = combinedMap.get(rid);
                            const mergedBooking = { ...serverBooking };
                            // Giữ lại trạng thái hoàn thành cục bộ nếu server chưa sync
                            for(let i=1; i<=6; i++) {
                                const key = `Status${i}`;
                                const localVal = localBooking[key];
                                const serverVal = serverBooking[key];
                                if (localVal && localVal.includes('完成') && (!serverVal || !serverVal.includes('完成'))) {
                                    mergedBooking[key] = localVal; 
                                }
                            }
                            combinedMap.set(rid, mergedBooking);
                        }
                    });
                    return Array.from(combinedMap.values());
                });
            }
            
            setStaffList(apiStaff || []);
            const currentRes = serverRes || {};
            setStatusData(serverStaff || {});

            const nowObj = window.getTaipeiDate();
            const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes() + (nowObj.getHours() < 8 ? 1440 : 0);
            
            let tempState = {}; 
            const activeEndTimes = {};
            const timelineGrid = {};

            const addToGrid = (resId, start, end, booking, meta) => {
                if (!timelineGrid[resId]) timelineGrid[resId] = [];
                timelineGrid[resId].push({ start, end, booking, meta });
            };

            // =================================================================
            // MATRIX LAYER 1: RUNNING STATE (Đang chạy thực tế)
            // =================================================================
            Object.keys(currentRes).forEach(key => {
                if(currentRes[key].isRunning) {
                    tempState[key] = currentRes[key];
                    
                    const startTime = new Date(currentRes[key].startTime);
                    const startMins = startTime.getHours() * 60 + startTime.getMinutes() + (startTime.getHours() < 8 ? 1440 : 0);
                    
                    let durationUsed = currentRes[key].booking.duration;
                    let isPhase1 = false;

                    if (currentRes[key].comboMeta) {
                        const seq = currentRes[key].comboMeta.sequence || 'FB';
                        const isMax = currentRes[key].isMaxMode;
                        const customPhase1 = currentRes[key].booking.phase1_duration;
                        const split = window.getComboSplit(durationUsed, isMax, seq, customPhase1);
                        
                        // Xác định Phase hiện tại
                        isPhase1 = (seq === 'FB' && key.includes('chair')) || (seq === 'BF' && key.includes('bed'));
                        
                        if (isPhase1) durationUsed = split.phase1 + (currentRes[key].comboMeta.flex || 0);
                        else durationUsed = split.phase2; 
                    }

                    const endMins = startMins + durationUsed;
                    activeEndTimes[key] = endMins;
                    
                    addToGrid(key, startMins, endMins, currentRes[key].booking, {
                        isCombo: !!currentRes[key].comboMeta,
                        phase: isPhase1 ? 1 : 2,
                        sequence: currentRes[key].comboMeta?.sequence,
                        isRunning: true 
                    });
                }
            });

            // =================================================================
            // MATRIX LAYER 2: GHOST BLOCKS (Dự đoán Phase 2 của đơn đang chạy)
            // =================================================================
            Object.keys(tempState).forEach(key => {
                const item = tempState[key];
                if (item.comboMeta) {
                    const seq = item.comboMeta.sequence || 'FB';
                    const isChair = key.includes('chair');
                    const isPhase1 = (seq === 'FB' && isChair) || (seq === 'BF' && !isChair);
                    
                    if (isPhase1) {
                        const finishTimeMins = activeEndTimes[key]; 
                        const p2Start = finishTimeMins + 5; 
                        const customPhase1 = item.booking.phase1_duration;
                        const split = window.getComboSplit(item.booking.duration, item.isMaxMode, seq, customPhase1);
                        const p2End = p2Start + split.phase2;
                        
                        let finalTargetId = item.comboMeta.targetId;
                        const targetType = key.includes('chair') ? 'bed' : 'chair';
                        
                        if (!finalTargetId || (activeEndTimes[finalTargetId] && p2Start < activeEndTimes[finalTargetId])) {
                             finalTargetId = MatrixHelper.findBestSlot(targetType, p2Start, p2End, timelineGrid, activeEndTimes);
                        }
                        
                        if (finalTargetId) {
                            addToGrid(finalTargetId, p2Start, p2End, item.booking, { 
                                isCombo: true, phase: 2, sequence: seq, originId: key, isPrediction: true 
                            });
                        }
                    }
                }
            });

            // =================================================================
            // MATRIX LAYER 3: PENDULUM SIMULATION (Tính toán lịch chưa chạy)
            // =================================================================
            const pendingBookings = relevantBookings.filter(b => 
                !b.status.includes('完成') && !b.status.includes('✅') && !b.status.includes('Done')
            );
            
            // --- GROUPING LOGIC (V99.9 RETAINED) ---
            // Thay vì gom theo rowId (luôn duy nhất), ta gom theo (Giờ + SĐT) hoặc (Giờ + Tên)
            const groupedPending = {};
            
            pendingBookings.forEach(b => {
                // 1. Tạo Key định danh nhóm
                const timeKey = (b.startTimeString || "").split(' ')[1] || '00:00';
                // Lấy 5 số cuối của SĐT để làm key (đủ để phân biệt các nhóm khác nhau trong ngày)
                const phoneRaw = b.phone || b.sdt || b.custPhone || ""; 
                const phoneKey = phoneRaw.replace(/\D/g, '').slice(-6); 
                const nameKey = (b.customerName || "Guest").trim();
                
                let groupKey;

                if (phoneKey.length >= 3) {
                    // Ưu tiên 1: Giờ + SĐT (Chính xác nhất cho nhóm đặt cùng lúc)
                    groupKey = `${timeKey}_P_${phoneKey}`;
                } else if (nameKey.length > 0 && nameKey !== 'Guest') {
                    // Ưu tiên 2: Giờ + Tên khách (Trường hợp không có SĐT)
                    groupKey = `${timeKey}_N_${nameKey}`;
                } else {
                    // Fallback: Nếu không có gì định danh, dùng rowId (Chấp nhận tách lẻ)
                    groupKey = `ROW_${b.rowId}`;
                }

                if(!groupedPending[groupKey]) groupedPending[groupKey] = [];
                groupedPending[groupKey].push(b);
            });

            const listSingles = [];
            const listCombosGroups = [];

            Object.values(groupedPending).forEach(group => {
                // Đảm bảo sort lại group theo thứ tự rowId để index khớp với thứ tự nhập liệu
                group.sort((a, b) => parseInt(a.rowId) - parseInt(b.rowId));

                const first = group[0];
                const isCombo = first.category === 'COMBO' || (first.serviceName && first.serviceName.includes('套餐'));
                if (isCombo) listCombosGroups.push(group);
                else group.forEach(b => listSingles.push(b));
            });
            
            const sortFn = (a,b) => window.normalizeToTimelineMins(a.startTimeString.split(' ')[1]) - window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
            listSingles.sort(sortFn);
            listCombosGroups.sort((a,b) => sortFn(a[0], b[0]));

            // --- ALLOCATE SINGLES (Xếp lịch đơn trước) ---
            listSingles.forEach(b => {
                const originalStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                const type = b.type === 'CHAIR' ? 'chair' : 'bed';
                let searchOffsets = [0]; for(let i=1; i<=120; i++) searchOffsets.push(i);
                
                for(let delay of searchOffsets) {
                    let tryStart = originalStart + delay;
                    let tryEnd = tryStart + b.duration;
                    const slotId = MatrixHelper.findBestSlot(type, tryStart, tryEnd, timelineGrid, activeEndTimes);
                    if (slotId) {
                        addToGrid(slotId, tryStart, tryEnd, b, { isCombo: false, isPending: true });
                        break; 
                    }
                }
            });

            // --- ALLOCATE COMBOS (V100.0 UPDATED - MODULO WRAPPING) ---
            listCombosGroups.forEach(group => {
                const b = group[0]; 
                const originalStart = window.normalizeToTimelineMins(b.startTimeString.split(' ')[1]);
                const groupSize = group.length;
                
                // Tính toán điểm gãy (Split point) để chia nhóm
                const idealNumBF = Math.ceil(groupSize / 2);
                const halfSize = Math.ceil(groupSize / 2); // Kích thước của 1 nửa nhóm

                // Group loop: Idx chạy từ 0 -> groupSize - 1
                group.forEach((bookingItem, idx) => {
                    const rawNote = bookingItem.originalNote || "";
                    
                    // --- 1. PRIORITY LEVEL 1: ABSOLUTE OBEDIENCE (EXPLICIT NOTE) ---
                    const explicitFlow = detectFlowFromNote(rawNote, idx);
                    let preferredSeq = null;

                    if (explicitFlow) {
                        preferredSeq = explicitFlow; 
                    } else {
                        // --- 2. PRIORITY LEVEL 2: SKEPTIC MODE ---
                        const hasKTags = /K\d/i.test(rawNote);
                        if (hasKTags) {
                            preferredSeq = null;
                        } else {
                            if (groupSize <= 2) {
                                preferredSeq = bookingItem.flow;
                            } else {
                                preferredSeq = null;
                            }
                        }
                    }

                    // --- 3. PRIORITY LEVEL 3: PENDULUM (AUTO BALANCING) ---
                    // Chia bài tự động
                    if (!preferredSeq) {
                        if (idx < idealNumBF) preferredSeq = 'BF';
                        else preferredSeq = 'FB';
                    }
                    
                    // --- Bắt đầu tìm slot dựa trên Sequence đã quyết định ---
                    let searchOffsets = [0]; for(let i=1; i<=120; i++) searchOffsets.push(i);
                    
                    for(let delay of searchOffsets) {
                        let tryStart = originalStart + delay;
                        const customPhase1 = bookingItem.phase1_duration;

                        const trySequence = (seq) => {
                            const split = window.getComboSplit(bookingItem.duration, true, seq, customPhase1);
                            
                            const p1End = tryStart + split.phase1;
                            const p2Start = p1End + 5; 
                            const p2End = p2Start + split.phase2;
                            
                            const type1 = seq === 'FB' ? 'chair' : 'bed';
                            const type2 = seq === 'FB' ? 'bed' : 'chair';
                            
                            // [V100.0 CRITICAL LOGIC CHANGE]
                            // Thay vì preferredSlotIndex = idx + 1 (Tuyến tính) -> Gây lãng phí
                            // Sử dụng MODULO để "cuộn" nhóm lại.
                            // VD nhóm 6 người: 0,1,2 -> Slot 1,2,3. 3,4,5 -> Quay lại Slot 1,2,3.
                            // Điều này tận dụng việc K1 và K4 đổi chỗ cho nhau.
                            
                            let preferredSlotIndex;
                            if (groupSize >= 4) {
                                // Nếu nhóm đông (>= 4), áp dụng Modulo Wrapping
                                const normalizedIdx = idx % halfSize;
                                preferredSlotIndex = normalizedIdx + 1;
                            } else {
                                // Nếu nhóm nhỏ (2-3 người), cứ xếp bình thường để dễ nhìn
                                preferredSlotIndex = idx + 1;
                            }

                            // Tìm slot với gợi ý ưu tiên
                            const s1 = MatrixHelper.findBestSlot(type1, tryStart, p1End, timelineGrid, activeEndTimes, preferredSlotIndex);
                            const s2 = MatrixHelper.findBestSlot(type2, p2Start, p2End, timelineGrid, activeEndTimes, preferredSlotIndex);
                            
                            if (s1 && s2) {
                                addToGrid(s1, tryStart, p1End, bookingItem, { isCombo: true, phase: 1, sequence: seq, targetId: s2, isPending: true });
                                addToGrid(s2, p2Start, p2End, bookingItem, { isCombo: true, phase: 2, sequence: seq, isPending: true });
                                return true;
                            }
                            return false;
                        };

                        if (trySequence(preferredSeq)) {
                            break; 
                        }
                    }
                });
            });

            setTimelineData(timelineGrid);

            // --- PREVIEW RESOURCE CARD LOGIC (Tạo dữ liệu hiển thị cho thẻ 3D/Map) ---
            const allSlots = [];
            for(let i=1; i<=6; i++) allSlots.push(`chair-${i}`);
            for(let i=1; i<=6; i++) allSlots.push(`bed-${i}`);

            allSlots.forEach(resId => {
                if (tempState[resId]) return; // Nếu đã có booking đang chạy thì bỏ qua
                
                const slots = timelineGrid[resId] || [];
                // Tìm slot nào đang diễn ra ngay bây giờ (Simulation)
                const currentSlot = slots.find(s => (nowMins >= s.start && nowMins < s.end));
                
                if (currentSlot) {
                    const nameLabel = currentSlot.booking.pax > 1 ? `${currentSlot.booking.customerName} (Grp)` : currentSlot.booking.customerName;
                    tempState[resId] = { 
                        booking: { ...currentSlot.booking, customerName: nameLabel, serviceStaff: null }, 
                        startTime: null, isRunning: false, 
                        isPreview: true, previewType: 'NOW', 
                        comboMeta: currentSlot.meta.isCombo ? { sequence: currentSlot.meta.sequence, phase: currentSlot.meta.phase, targetId: currentSlot.meta.targetId } : null, 
                        isMaxMode: true 
                    };
                } else {
                    // Tìm slot sắp diễn ra trong 30 phút tới
                    const upcomingSlot = slots.find(s => s.start > nowMins && s.start - nowMins <= 30);
                    if (upcomingSlot) {
                         tempState[resId] = {
                            booking: { ...upcomingSlot.booking, serviceStaff: null },
                            startTime: null, isRunning: false,
                            isPreview: true, previewType: 'SOON',
                            timeToStart: upcomingSlot.start - nowMins,
                            comboMeta: upcomingSlot.meta.isCombo ? { sequence: upcomingSlot.meta.sequence, phase: upcomingSlot.meta.phase } : null
                        }
                    }
                }
            });
            
            setResourceState(prev => {
                if(syncLock) return prev; 
                return { ...tempState }; 
            });
            
        } catch(e) { 
            console.error("API Error", e);
            if (e.response && e.response.status === 429) setQuotaError(true);
        }
    };

    // Auto Fetch Loop
    useEffect(() => { 
        fetchData(); 
        const t = setInterval(fetchData, 2000); 
        return () => clearInterval(t); 
    }, [viewDate, syncLock, quotaError]); 

    // 4. ACTION HANDLERS
    
    // Split Staff (Tách thợ cho khách trong nhóm)
    const handleSplitConfirm = async (staffId2) => {
        if (!splitData) return;
        const { resourceId } = splitData;
        const current = resourceState[resourceId];
        if (!current) return;
        setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);
        
        const newStatusData = { ...statusData, [staffId2]: { ...statusData[staffId2], status: 'BUSY' } };
        updateStaffStatus(newStatusData);
        
        const grpIdx = getGroupMemberIndex(resourceId, current.booking.rowId);
        let primaryKey = "服務師傅1"; let targetProp = "serviceStaff"; 
        if (grpIdx === 1) { primaryKey = "服務師傅2"; targetProp = "staffId2"; }
        else if (grpIdx === 2) { primaryKey = "服務師傅3"; targetProp = "staffId3"; }
        else if (grpIdx === 3) { primaryKey = "服務師傅4"; targetProp = "staffId4"; }
        else if (grpIdx === 4) { primaryKey = "服務師傅5"; targetProp = "staffId5"; }
        else if (grpIdx === 5) { primaryKey = "服務師傅6"; targetProp = "staffId6"; }
        
        const currentName = current.booking[targetProp] || "";
        const newNameCombined = currentName ? `${currentName}, ${staffId2}` : staffId2;
        const newBooking = { ...current.booking, [targetProp]: newNameCombined };
        const newState = { ...resourceState, [resourceId]: { ...current, booking: newBooking } };
        
        setResourceState(newState);
        const payload = { rowId: current.booking.rowId, [primaryKey]: newNameCombined, forceSync: true };
        await universalSend('/api/update-booking-details', payload);
        await updateResource(newState);
        setSplitData(null);
    };

    // Change Staff (Đổi thợ)
    const handleStaffChange = async (resId, newStaffId) => {
        const current = resourceState[resId]; if (!current) return;
        setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);
        
        const oldServiceStaff = current.booking.serviceStaff || current.booking.staffId; 
        const grpIdx = getGroupMemberIndex(resId, current.booking.rowId);
        const newBooking = { ...current.booking };
        
        if (grpIdx === 0) newBooking.serviceStaff = newStaffId;
        else if (grpIdx === 1) newBooking.staffId2 = newStaffId;
        else if (grpIdx === 2) newBooking.staffId3 = newStaffId;
        else if (grpIdx === 3) newBooking.staffId4 = newStaffId;
        else if (grpIdx === 4) newBooking.staffId5 = newStaffId;
        else if (grpIdx === 5) newBooking.staffId6 = newStaffId;
        
        const newState = { ...resourceState, [resId]: { ...current, booking: newBooking } };
        setResourceState(newState);
        
        const newStatusData = { ...statusData };
        if (oldServiceStaff !== '隨機' && oldServiceStaff !== newStaffId) { newStatusData[oldServiceStaff] = { status: 'READY', checkInTime: Date.now() }; }
        if (newStaffId !== '隨機') { newStatusData[newStaffId] = { status: 'BUSY' }; }
        updateStaffStatus(newStatusData);
        
        let primaryKey = "服務師傅1"; let fallbackKey = "ServiceStaff1";
        if (grpIdx === 1) { primaryKey = "服務師傅2"; fallbackKey = "ServiceStaff2"; }
        if (grpIdx === 2) { primaryKey = "服務師傅3"; fallbackKey = "ServiceStaff3"; }
        if (grpIdx === 3) { primaryKey = "服務師傅4"; fallbackKey = "ServiceStaff4"; }
        if (grpIdx === 4) { primaryKey = "服務師傅5"; fallbackKey = "ServiceStaff5"; }
        if (grpIdx === 5) { primaryKey = "服務師傅6"; fallbackKey = "ServiceStaff6"; }
        
        const payload = { rowId: current.booking.rowId, [primaryKey]: newStaffId, [fallbackKey]: newStaffId, [`staff${grpIdx + 1}`]: newStaffId, technician: newStaffId, forceSync: true };
        try { await universalSend('/api/update-booking-details', payload); await updateResource(newState); } catch(e) { console.error("Sync Failed", e); alert("⚠️ Staff Sync Failed! Please check internet."); }
    };

    // Change Service (Đổi dịch vụ)
    const handleServiceChange = async (resId, newServiceName) => {
        const current = resourceState[resId]; if (!current) return;
        const newDef = window.SERVICES_DATA[newServiceName]; if (!newDef) return;
        const updatedBooking = { ...current.booking, serviceName: newServiceName, duration: newDef.duration, type: newDef.type, category: newDef.category };
        const newState = { ...resourceState, [resId]: { ...current, booking: updatedBooking } };
        setResourceState(newState);
        await axios.post('/api/update-booking-details', { rowId: current.booking.rowId, serviceName: newServiceName });
        await updateResource(newState);
    };

    // Edit Combo Time (Chỉnh sửa thời gian Phase 1/Phase 2)
    const handleOpenEdit = (resId) => {
        const current = resourceState[resId];
        if (!current || !current.booking) return;
        if (current.booking.category !== 'COMBO' && !current.booking.serviceName.includes('套餐')) {
            alert('⚠️ 僅支援調整套餐時間 (Combo Only)');
            return;
        }
        setEditComboTarget({ id: resId, booking: current.booking });
    };

    const handleSaveComboTime = async (newPhase1) => {
        if (!editComboTarget) return;
        const { booking } = editComboTarget;
        const rowId = booking.rowId;
        const totalDuration = parseInt(booking.duration || 100);
        const newPhase2 = totalDuration - newPhase1;

        setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);

        const newState = { ...resourceState };
        Object.keys(newState).forEach(key => {
            const res = newState[key];
            if (res.booking && String(res.booking.rowId) === String(rowId)) {
                newState[key] = {
                    ...res,
                    booking: {
                        ...res.booking,
                        phase1_duration: newPhase1,
                        phase2_duration: newPhase2
                    }
                };
            }
        });
        setResourceState(newState);

        try {
            await axios.post('/api/update-booking-details', {
                rowId: rowId,
                phase1_duration: newPhase1,
                phase2_duration: newPhase2,
                isManualLocked: true 
            });
            await updateResource(newState);
        } catch(e) { console.error("Save Time Error", e); alert("⚠️ 儲存失敗 (Save Failed)"); }
        setEditComboTarget(null);
    };

    // Start Service (Bắt đầu làm khách)
    const executeStart = (id, comboSequence) => {
        const current = resourceState[id];
        let designatedStaff = current.booking.serviceStaff || current.booking.staffId || current.booking.ServiceStaff || current.booking.technician; 
        if (!designatedStaff || designatedStaff === 'undefined' || designatedStaff === 'null') designatedStaff = '隨機';

        let finalServiceStaff = designatedStaff; 
        let currentId = id; let shouldMove = false; let targetMoveId = null;
        setSyncLock(true); setTimeout(() => setSyncLock(false), 5000);
        
        if (comboSequence) {
            const currentType = id.split('-')[0];
            if (comboSequence === 'BF' && currentType === 'chair') { shouldMove = true; for(let i=1; i<=6; i++) { if(!resourceState[`bed-${i}`]) { targetMoveId = `bed-${i}`; break; } } } 
            else if (comboSequence === 'FB' && currentType === 'bed') { shouldMove = true; for(let i=1; i<=6; i++) { if(!resourceState[`chair-${i}`]) { targetMoveId = `chair-${i}`; break; } } }
        }
        
        if (shouldMove) { if (!targetMoveId) { alert("⚠️ 無法切換區域: 目標區域已滿!"); return; } currentId = targetMoveId; }
        
        // Logic chọn thợ tự động nếu là '隨機' (Random)
        if (['隨機', '男', '女', 'Oil'].some(k => designatedStaff.includes(k))) {
            const liveBusyStaffIds = Object.values(resourceState).filter(r => r.isRunning && !r.isPaused && r.isPreview !== true).map(r => r.booking.serviceStaff || r.booking.staffId || r.booking.ServiceStaff);
            const readyStaff = (staffList||[]).filter(s => { 
                const stat = statusData[s.id]; if (!stat || stat.status !== 'READY') return false;
                if (liveBusyStaffIds.includes(s.id)) return false;
                return true;
            });
            let candidates = readyStaff;
            if (designatedStaff.includes('男') || designatedStaff.includes('Male')) candidates = candidates.filter(s => s.gender === 'M' || s.gender === '男');
            else if (designatedStaff.includes('女') || designatedStaff.includes('Female') || current.booking.isOil) candidates = candidates.filter(s => s.gender === 'F' || s.gender === '女');
            candidates.sort((a,b) => (statusData[a.id]?.checkInTime||0) - (statusData[b.id]?.checkInTime||0));
            if (candidates.length === 0) { alert("⚠️ No suitable staff available!"); return; }
            finalServiceStaff = candidates[0].id;
        }

        const newStatusData = { ...statusData, [finalServiceStaff]: { ...statusData[finalServiceStaff], status: 'BUSY' } };
        updateStaffStatus(newStatusData); 
        
        const grpIdx = getGroupMemberIndex(currentId, current.booking.rowId);
        const isComboService = (current.booking.serviceName && current.booking.serviceName.includes('套餐')) || comboSequence;
        const newBooking = { 
            ...current.booking, 
            category: isComboService ? 'COMBO' : (current.booking.category || 'SINGLE')
        };

        if (grpIdx === 0) newBooking.serviceStaff = finalServiceStaff;
        else if (grpIdx === 1) newBooking.staffId2 = finalServiceStaff;
        else if (grpIdx === 2) newBooking.staffId3 = finalServiceStaff;
        else if (grpIdx === 3) newBooking.staffId4 = finalServiceStaff;
        else if (grpIdx === 4) newBooking.staffId5 = finalServiceStaff;
        else if (grpIdx === 5) newBooking.staffId6 = finalServiceStaff;
        
        let comboMeta = current.comboMeta || null;
        if (comboSequence) {
            const currentType = currentId.split('-')[0]; const index = currentId.split('-')[1];
            let ghostTargetId = null; const targetTypePrefix = currentType === 'chair' ? 'bed' : 'chair';
            
            const sameIndex = `${targetTypePrefix}-${index}`;
            if (!resourceState[sameIndex] && sameIndex !== id) { ghostTargetId = sameIndex; } 
            else { 
                for(let i=1; i<=6; i++) { 
                    const tid = `${targetTypePrefix}-${i}`; 
                    if(!resourceState[tid] && tid !== id) { ghostTargetId = tid; break; } 
                } 
            }
            if (!ghostTargetId) ghostTargetId = `${targetTypePrefix}-${index}`;
            comboMeta = { sequence: comboSequence, targetId: ghostTargetId, flex: (current.comboMeta && current.comboMeta.flex) || 0, phase: 1 };
        }
        
        const newState = { ...resourceState }; if (shouldMove) delete newState[id];
        newState[currentId] = { ...current, booking: newBooking, startTime: new Date().toISOString(), isRunning: true, isPreview: false, comboMeta };
        updateResource(newState);
        
        let primaryKey = "服務師傅1"; let fallbackKey = "ServiceStaff1";
        if (grpIdx === 1) { primaryKey = "服務師傅2"; fallbackKey = "ServiceStaff2"; }
        if (grpIdx === 2) { primaryKey = "服務師傅3"; fallbackKey = "ServiceStaff3"; }
        if (grpIdx === 3) { primaryKey = "服務師傅4"; fallbackKey = "ServiceStaff4"; }
        if (grpIdx === 4) { primaryKey = "服務師傅5"; fallbackKey = "ServiceStaff5"; }
        if (grpIdx === 5) { primaryKey = "服務師傅6"; fallbackKey = "ServiceStaff6"; }
        
        const payload = { rowId: current.booking.rowId, [primaryKey]: finalServiceStaff, [fallbackKey]: finalServiceStaff, [`staff${grpIdx + 1}`]: finalServiceStaff, staffId: designatedStaff };
        universalSend('/api/update-booking-details', payload);
    };

    const handleResourceAction = async (id, action) => {
        const current = resourceState[id]; if (!current) return;
        if (action === 'start') {
            const isCombo = current.booking.category === 'COMBO' || (current.booking.serviceName && current.booking.serviceName.includes('套餐'));
            if (isCombo && !current.isRunning) { setComboStartData({ id, booking: current.booking }); return; }
            executeStart(id, null); 
        }
        else if (action === 'pause') { updateResource({ ...resourceState, [id]: { ...current, isPaused: !current.isPaused } }); }
        else if (action === 'cancel') { if (confirm('確認將顧客從床位移除?')) { const n = { ...resourceState }; delete n[id]; updateResource(n); } }
        else if (action === 'cancel_midway') {
            if (confirm('確定要棄單 (Drop)?\n此操作將標記為「取消」並釋放床位。')) {
                await axios.post('/api/update-status', { rowId: current.booking.rowId, status: '✅ 棄單 (Dropped)' });
                const n = { ...resourceState };
                const staffId = current.booking.serviceStaff || current.booking.staffId;
                if(staffId !== '隨機' && statusData[staffId]) { const newStatus = { ...statusData, [staffId]: { status: 'READY', checkInTime: Date.now() } }; updateStaffStatus(newStatus); }
                delete n[id]; updateResource(n); fetchData();
            }
        }
        else if (action === 'finish') {
            const currentRowId = current.booking.rowId;
            const related = Object.keys(resourceState)
                .filter(k => k !== id && resourceState[k].isRunning)
                .map(k => ({ resourceId: k, booking: resourceState[k].booking }))
                .filter(item => {
                    const b = item.booking;
                    return b.rowId === currentRowId;
                });
            setBillingData({ activeItem: { resourceId: id, booking: current.booking }, relatedItems: related });
        }
    };

    const confirmComboStart = (sequence) => { if (comboStartData) { executeStart(comboStartData.id, sequence); setComboStartData(null); } };
    const handleSwitch = (fromId, toType) => { const currentData = resourceState[fromId]; if(!currentData) return; for(let i=1; i<=6; i++) { const targetId = `${toType}-${i}`; if (!resourceState[targetId]) { const newState = { ...resourceState }; delete newState[fromId]; newState[targetId] = currentData; updateResource(newState); return; } } alert(`該區域 (${toType === 'chair' ? '足底區' : '身體區'}) 已無空位!`); };
    const handleToggleMax = async (resId) => { const res = resourceState[resId]; if (!res) return; updateResource({ ...resourceState, [resId]: { ...res, isMaxMode: !res.isMaxMode } }); };
    const handleToggleSequence = async (resId) => { const res = resourceState[resId]; if (!res || !res.comboMeta) return; const newSeq = res.comboMeta.sequence === 'FB' ? 'BF' : 'FB'; updateResource({ ...resourceState, [resId]: { ...res, comboMeta: { ...res.comboMeta, sequence: newSeq } } }); }
    
    // Payment Logic (Thanh toán)
    const handleConfirmPayment = async (itemsToPay, totalAmount) => {
        try {
            setSyncLock(true); setTimeout(() => setSyncLock(false), 5000); 
            const newState = { ...resourceState }; const newStatusData = { ...statusData }; const updatesByRow = {}; 
            const baseTime = Date.now();

            for (let i = 0; i < itemsToPay.length; i++) {
                const item = itemsToPay[i]; const b = item.booking; const rid = String(b.rowId); const resId = item.resourceId;
                let targetIndex = -1; const currentStaff = b.serviceStaff || b.staffId; 
                
                if (currentStaff && currentStaff !== '隨機' && currentStaff !== 'undefined') {
                    const staffCols = [ b.serviceStaff || b.staffId, b.staffId2, b.staffId3, b.staffId4, b.staffId5, b.staffId6 ];
                    targetIndex = staffCols.findIndex(s => s && s.trim() === currentStaff.trim());
                }
                if (targetIndex === -1) {
                    const seatNum = parseInt(resId.replace(/\D/g, ''));
                    if (!isNaN(seatNum) && seatNum > 0) targetIndex = Math.min(seatNum - 1, 5); 
                    else targetIndex = 0;
                }

                const statusNum = targetIndex + 1; const statusColEnglish = `Status${statusNum}`; 
                if (!updatesByRow[rid]) { updatesByRow[rid] = { rowId: rid, forceSync: true, originalBooking: b }; }
                updatesByRow[rid][statusColEnglish] = '✅ 完成';
                
                let staffId = null;
                if (targetIndex === 0) staffId = b.serviceStaff || b.staffId;
                else if (targetIndex === 1) staffId = b.staffId2;
                else if (targetIndex === 2) staffId = b.staffId3;
                else if (targetIndex === 3) staffId = b.staffId4;
                else if (targetIndex === 4) staffId = b.staffId5;
                else if (targetIndex === 5) staffId = b.staffId6;

                if (staffId && staffId !== '隨機' && staffId !== 'undefined') { newStatusData[staffId] = { status: 'READY', checkInTime: baseTime + (i * 1000) }; }
                delete newState[resId];
            }

            Object.values(updatesByRow).forEach(updatePayload => {
                const booking = updatePayload.originalBooking;
                const staffCols = [booking.serviceStaff || booking.staffId, booking.staffId2, booking.staffId3, booking.staffId4, booking.staffId5, booking.staffId6];
                let activeSlotsCount = 0; let finishedSlotsCount = 0;
                staffCols.forEach((staffName, idx) => {
                    if (staffName && staffName !== 'undefined' && staffName !== 'null' && staffName.trim() !== '') {
                        activeSlotsCount++;
                        const key = `Status${idx + 1}`;
                        const isNewCompletion = updatePayload[key] && updatePayload[key].includes('完成');
                        const wasAlreadyDone = booking[key] && (booking[key].includes('完成') || booking[key].includes('Done') || booking[key].includes('✅'));
                        if (isNewCompletion || wasAlreadyDone) finishedSlotsCount++;
                    }
                });
                if (activeSlotsCount > 0 && finishedSlotsCount >= activeSlotsCount) { updatePayload.mainStatus = '✅ 完成'; }
                delete updatePayload.originalBooking;
            });
            
            updateResource(newState); updateStaffStatus(newStatusData); setBillingData(null); 
            const apiCalls = Object.values(updatesByRow).map(payload => axios.post('/api/update-booking-details', payload));
            await Promise.all(apiCalls); alert(`✅ 結帳成功: $${totalAmount}`);
        } catch(e) { console.error("Payment Sync Error:", e); alert("⚠️ Lỗi kết nối. Vui lòng kiểm tra mạng!"); }
    };

    const handleWalkInSave = async (data) => { await axios.post('/api/admin-booking', data); setShowWalkIn(false); setShowAvailability(false); fetchData(); };
    const handleAssignBooking = (booking) => { if (!selectedSlot) return; updateResource({ ...resourceState, [selectedSlot]: { booking, startTime: null, isRunning: false } }); setSelectedSlot(null); };
    const handleManualUpdateStatus = async (rowId, status) => { if(confirm('確認更新狀態?')) { await axios.post('/api/update-status', { rowId, status }); fetchData(); } };
    const handleRetryConnection = () => { setQuotaError(false); fetchData(); };

    const getStatus = (id) => statusData[id] ? statusData[id].status : 'AWAY';
    
    // UI Helpers (Filter Staff)
    const safeStaffList = staffList || [];
    const awayStaff = safeStaffList.filter(s => { const st = getStatus(s.id); return st === 'AWAY' || st === 'OFF'; }).sort(window.sortIdAsc);
    
    const busyStaff = safeStaffList.filter(s => isActuallyBusy(s.id)).sort((a,b) => { 
        const findRes = (sid) => Object.values(resourceState).find(r => r.isRunning && !r.isPaused && r.booking && ( r.booking.serviceStaff === sid || r.booking.staffId === sid || r.booking.staffId2 === sid || r.booking.staffId3 === sid || r.booking.staffId4 === sid || r.booking.staffId5 === sid || r.booking.staffId6 === sid ) );
        const resA = findRes(a.id); const resB = findRes(b.id);
        const timeA = resA?.startTime ? new Date(resA.startTime).getTime() : 0; const timeB = resB?.startTime ? new Date(resB.startTime).getTime() : 0;
        return timeA !== timeB ? timeA - timeB : window.sortIdAsc(a, b);
    });
    
    const readyStaff = safeStaffList.filter(s => { if (isActuallyBusy(s.id)) return false; const st = getStatus(s.id); return st === 'READY' || st === 'EAT' || st === 'OUT_SHORT'; }).sort((a,b) => { const timeA = statusData[a.id]?.checkInTime || 0; const timeB = statusData[b.id]?.checkInTime || 0; return timeA !== timeB ? timeA - timeB : window.sortIdAsc(a, b); });
    
    const readyQueue = readyStaff.filter(s => getStatus(s.id) === 'READY').map(s => s.id);
    const safeBookings = Array.isArray(bookings) ? bookings : [];
    
    const todaysBookings = useMemo(() => {
        return safeBookings.filter(b => window.isWithinOperationalDay(b.startTimeString.split(' ')[0], b.startTimeString.split(' ')[1], viewDate));
    }, [bookings, viewDate]);

    const waitingList = todaysBookings.filter(b => 
        !b.status.includes('完成') && 
        !b.status.includes('✅') &&
        b.status === '已預約'
    );

    return (
        <div className="min-h-screen flex flex-col bg-slate-50">
            <header className={`text-white p-3 shadow-md flex justify-between items-center sticky top-0 z-50 transition-colors ${quotaError ? 'bg-red-800' : 'bg-[#1e1b4b]'}`}>
                {/* Header Content */}
                <div className="flex items-center gap-3">
                    <span className="bg-amber-500 text-black px-2 py-1 rounded font-black text-sm">V100.0</span>
                    <span className="font-bold hidden md:inline">XinWuChan</span>
                    <div className="flex items-center gap-2 bg-white/10 rounded px-2 py-1 border border-white/20">
                        <button onClick={()=>{const d=new Date(viewDate); d.setDate(d.getDate()-1); setViewDate(d.toISOString().split('T')[0])}} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                        <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} className="bg-transparent text-white font-bold outline-none cursor-pointer text-center" style={{colorScheme: 'dark'}} />
                        <button onClick={()=>{const d=new Date(viewDate); d.setDate(d.getDate()+1); setViewDate(d.toISOString().split('T')[0])}} className="text-white hover:text-amber-400 font-bold px-2">❯</button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={()=>setActiveTab('map')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='map' ? 'bg-blue-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-blue-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-th"></i> <span className="hidden md:inline">平面圖</span></button>
                    <button onClick={()=>setActiveTab('timeline')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='timeline' ? 'bg-purple-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-purple-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-stream"></i> <span className="hidden md:inline">時間軸</span></button>
                    <button onClick={()=>setActiveTab('list')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='list' ? 'bg-cyan-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-cyan-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-list"></i> <span className="hidden md:inline">列表</span></button>
                    <button onClick={()=>setActiveTab('report')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab==='report' ? 'bg-rose-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-rose-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-chart-line"></i> <span className="hidden md:inline">報告</span></button>
                    <button onClick={()=>setActiveTab('commission')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ml-2 border-l border-white/30 pl-4 ${activeTab==='commission' ? 'bg-indigo-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-indigo-800 text-white/90 opacity-70 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-calculator"></i> <span className="hidden md:inline">節數/薪資</span></button>
                </div>

                <div className="flex gap-2 items-center">
                    {quotaError && <button onClick={handleRetryConnection} className="bg-white text-red-600 px-4 py-1.5 rounded font-bold text-sm animate-pulse mr-4"><i className="fas fa-exclamation-triangle"></i> 重連</button>}
                    <button onClick={()=>setShowAvailability(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded font-bold text-sm flex gap-1 items-center shadow-md animate-pulse"><i className="fas fa-phone-volume"></i> <span className="hidden lg:inline">電話預約</span></button>
                    <button onClick={()=>setShowWalkIn(true)} className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded font-bold text-sm flex gap-1 items-center"><i className="fas fa-bolt"></i> <span className="hidden lg:inline">現場客</span></button>
                    <button onClick={()=>setShowCheckIn(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-bold text-sm flex gap-1 items-center"><i className="fas fa-user-clock"></i> <span className="hidden lg:inline">技師報到</span></button>
                </div>
            </header>
            
            <div className="bg-white border-b shadow-sm p-2 overflow-x-auto whitespace-nowrap staff-scroll">
                <div className="flex w-full justify-between items-center min-w-max">
                    <div className="flex gap-1 opacity-30 scale-95 border-r-2 pr-2 mr-1 border-dashed border-slate-300">
                        {awayStaff.map(s => <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} />)}
                    </div>
                    <div className="flex items-center flex-1 justify-end pl-2">
                        <div className="flex gap-1 px-2 border-r border-red-100 flex-row-reverse">
                            {busyStaff.map(s => <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} isForcedBusy={true} />)}
                        </div>
                        <div className="flex flex-row-reverse gap-1 pl-2">
                            {readyStaff.map((s, idx) => { const qIdx = readyQueue.indexOf(s.id); return <window.StaffCard3D key={s.id} s={s} statusData={statusData} resourceState={resourceState} queueIndex={qIdx !== -1 ? qIdx : undefined} />; })}
                        </div>
                    </div>
                </div>
            </div>

            <main className="flex-1 p-4 overflow-y-auto">
                {activeTab === 'map' && (<div className="grid grid-cols-12 gap-6"><div className="col-span-9 space-y-6"><div><h3 className="font-bold text-emerald-600 mb-3 border-b pb-1">足底按摩區 (Foot)</h3><div className="grid grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <window.ResourceCard key={`chair-${i}`} id={`chair-${i}`} type="FOOT" index={i} data={resourceState[`chair-${i}`]} busyStaffIds={busyStaffIds} staffList={staffList} onAction={handleResourceAction} onSelect={()=>setSelectedSlot(`chair-${i}`)} onSwitch={handleSwitch} onToggleMax={handleToggleMax} onToggleSequence={handleToggleSequence} onServiceChange={handleServiceChange} onStaffChange={handleStaffChange} onSplit={(rid)=>setSplitData({resourceId: rid})} getGroupMemberIndex={getGroupMemberIndex} onEdit={handleOpenEdit} />)}</div></div><div><h3 className="font-bold text-purple-600 mb-3 border-b pb-1">身體指壓區 (Body)</h3><div className="grid grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <window.ResourceCard key={`bed-${i}`} id={`bed-${i}`} type="BODY" index={i} data={resourceState[`bed-${i}`]} busyStaffIds={busyStaffIds} staffList={staffList} onAction={handleResourceAction} onSelect={()=>setSelectedSlot(`bed-${i}`)} onSwitch={handleSwitch} onToggleMax={handleToggleMax} onToggleSequence={handleToggleSequence} onServiceChange={handleServiceChange} onStaffChange={handleStaffChange} onSplit={(rid)=>setSplitData({resourceId: rid})} getGroupMemberIndex={getGroupMemberIndex} onEdit={handleOpenEdit} />)}</div></div></div><div className="col-span-3 bg-white rounded-lg shadow p-4 h-fit sticky top-2"><h3 className="font-bold text-gray-700 mb-3">候位名單 ({waitingList.length})</h3><div className="space-y-2 max-h-[500px] overflow-y-auto">{waitingList.map(b => (<div key={b.rowId} className="border p-2 rounded hover:bg-slate-50 relative group bg-white shadow-sm"><div className="flex justify-between font-bold text-sm"><span>{b.customerName}</span><span className="text-indigo-600 font-mono">{(b.startTimeString||' ').split(' ')[1]}</span></div><div className="text-xs text-gray-500 font-bold">{b.serviceName}</div>{(b.isOil || (b.serviceName && b.serviceName.includes('油'))) && <div className="text-[10px] bg-purple-100 text-purple-700 inline-block px-1 rounded mt-1 font-bold border border-purple-200">💧 精油</div>}{b.pax > 1 && <div className="text-[10px] bg-orange-100 text-orange-600 inline-block px-1 rounded mt-1 ml-1 font-bold">{b.pax} 人</div>}{selectedSlot && <button onClick={()=>handleAssignBooking(b)} className="absolute inset-0 bg-green-500/90 text-white font-bold flex items-center justify-center rounded animate-pulse">排入 {selectedSlot}</button>}<button onClick={()=>handleManualUpdateStatus(b.rowId, '❌ Cancelled')} className="absolute top-1 right-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><i className="fas fa-trash"></i></button></div>))}</div></div></div>)}
                
                {activeTab === 'list' && (
                    <window.BookingListView 
                        bookings={todaysBookings} 
                        onCancelBooking={handleManualUpdateStatus} 
                    />
                )}
                
                {activeTab === 'timeline' && <TimelineView timelineData={timelineData} />}
                {activeTab === 'report' && <window.ReportView bookings={todaysBookings} />}
                {activeTab === 'commission' && <CommissionView bookings={todaysBookings} staffList={staffList} />}
            </main>
            
            {showWalkIn && <window.WalkInModal onClose={()=>setShowWalkIn(false)} onSave={handleWalkInSave} staffList={staffList} initialDate={viewDate} />}
            {showCheckIn && <window.CheckInBoard staffList={staffList} statusData={statusData} onUpdateStatus={updateStaffStatus} onClose={()=>setShowCheckIn(false)} bookings={todaysBookings} />}
            {showAvailability && <window.AvailabilityCheckModal onClose={()=>setShowAvailability(false)} onSave={handleWalkInSave} staffList={staffList} bookings={bookings} initialDate={viewDate} />}
            {comboStartData && <window.ComboStartModal onConfirm={confirmComboStart} onCancel={()=>setComboStartData(null)} bookingName={comboStartData.booking.serviceName} />}
            {selectedSlot && waitingList.length === 0 && <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center text-white font-bold" onClick={()=>setSelectedSlot(null)}>目前無候位! (No Waiting)</div>}
            {billingData && <window.BillingModal activeItem={billingData.activeItem} relatedItems={billingData.relatedItems} onConfirm={handleConfirmPayment} onCancel={() => setBillingData(null)} />}
            {splitData && <window.SplitStaffModal staffList={staffList} statusData={statusData} onCancel={()=>setSplitData(null)} onConfirm={handleSplitConfirm} />}
            
            {editComboTarget && <window.ComboTimeEditModal booking={editComboTarget.booking} onConfirm={handleSaveComboTime} onCancel={() => setEditComboTarget(null)} />}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <window.ErrorBoundary>
        <App />
    </window.ErrorBoundary>
);
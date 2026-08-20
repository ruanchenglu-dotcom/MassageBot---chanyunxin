
const normalizeStaffId = (id) => String(id || '').replace(/^0+/, '').trim().toUpperCase();
const safeTimeToMins = (timeStr) => {
    if (!timeStr) return 0;
    let parts = String(timeStr).split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
};
const getSystemConfig = () => ({ TOLERANCE: 15, CLEANUP_BUFFER: 5, TRANSITION_BUFFER: 5, SCALE: { MAX_CHAIRS: 6, MAX_BEDS: 6 } });
const getConfig = getSystemConfig;
const getBookingStatus = () => ({ WAITING: 'WAITING', SERVING: 'SERVING', PAID: 'PAID', CANCELLED: 'CANCELLED', COMPLETED: 'COMPLETED', NOSHOW: 'NOSHOW' });

const CoreKernel = (function () {

        // --- 1. CẤU HÌNH HỆ THỐNG ĐỘNG (DYNAMIC SYSTEM CONFIG) ---
        const getSystemConfig = (locationStr = '本館') => {
            const ext = window.SYSTEM_CONFIG || {};
            const scale = ext.SCALE || {};
            const opTime = ext.OPERATION_TIME || {};
            return {
                MAX_CHAIRS: locationStr === '對面館' ? (scale.OPP_CHAIRS || 4) : (scale.MAX_CHAIRS || ext.MAX_CHAIRS),
                MAX_BEDS: locationStr === '對面館' ? (scale.OPP_BEDS || 6) : (scale.MAX_BEDS || ext.MAX_BEDS),
                MAX_TOTAL_GUESTS: ext.MAX_TOTAL_GUESTS || 18,
                OPEN_HOUR: opTime.OPEN_HOUR || ext.OPEN_HOUR || 3,
                CLEANUP_BUFFER: (ext.BUFFERS && ext.BUFFERS.CLEANUP_MINUTES) || ext.CLEANUP_BUFFER || 5,
                TRANSITION_BUFFER: (ext.BUFFERS && ext.BUFFERS.TRANSITION_MINUTES) || ext.TRANSITION_BUFFER || 5,
                TOLERANCE: (ext.LOGIC_RULES && ext.LOGIC_RULES.TOLERANCE) || ext.TOLERANCE || 1,
                MAX_TIMELINE_MINS: opTime.TOTAL_TIMELINE_MINS || ext.MAX_TIMELINE_MINS || 1440,
                CAPACITY_CHECK_STEP: ext.CAPACITY_CHECK_STEP || 10
            };
        };

        let SERVICES = {};

        function setDynamicServices(newServicesObj) {
            const systemServices = {
                'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
                'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
                'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
                'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
            };
            SERVICES = { ...newServicesObj, ...systemServices };
        }

        // --- UTILS THỜI GIAN ---
        function getMinsFromTimeStr(timeStr) {
            if (!timeStr) return -1;
            const CONF = getSystemConfig();
            try {
                let str = timeStr.toString();
                if (str.includes('T') || str.includes(' ')) {
                    const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
                    if (timeMatch) str = timeMatch[0];
                }
                let cleanStr = str.trim().replace(/：/g, ':');
                const parts = cleanStr.split(':');
                if (parts.length < 2) return -1;
                let h = parseInt(parts[0], 10);
                let m = parseInt(parts[1], 10);
                if (isNaN(h) || isNaN(m)) return -1;
                // [V118.2] Phóng chiếu giờ rạng sáng cho thuật toán vắt chéo ngày (0h-8h)
                // Đảm bảo các hàm isOverlap hoạt động chính xác với ca xuyên đêm.
                if (h < 8) h += 24;
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
            const CONF = getSystemConfig();
            const safeEndA = endA - CONF.TOLERANCE;
            const safeEndB = endB - CONF.TOLERANCE;
            return (startA < safeEndB) && (startB < safeEndA);
        }

        // --- BỘ LỌC TRẠNG THÁI SSOT ---
        function isActiveBookingStatus(statusRaw) {
            if (!statusRaw) return true; // CẦN ĐƯỢC COI LÀ ACTIVE nếu status trống
            const s = statusRaw.toString().toLowerCase().trim();
            const STATUS = getBookingStatus();

            if (s === STATUS.COMPLETED.toLowerCase() || s === STATUS.CANCELLED.toLowerCase()) return false;

            // Legacy keywords
            const inactiveKeywords = ['cancel', 'hủy', 'huỷ', 'finish', 'done', 'xong', 'check-out', 'checkout', '取消', '完成', '空'];
            for (const kw of inactiveKeywords) { if (s.includes(kw)) return false; }
            return true;
        }

        function isStatusRunning(statusRaw) {
            if (!statusRaw) return false;
            const s = statusRaw.toString().toLowerCase().trim();
            const STATUS = getBookingStatus();
            if (s.includes(STATUS.SERVING.toLowerCase())) return true;
            if (s.includes('running') || s.includes('doing')) return true;
            return false;
        }

        function isComboService(serviceCode) {
            if (!serviceCode) return false;
            const codeStr = String(serviceCode).trim();
            if (SERVICES && SERVICES[codeStr] && SERVICES[codeStr].category === 'COMBO') return true;
            return codeStr.toUpperCase().startsWith('A') || codeStr.includes('套餐');
        }

        function detectResourceType(serviceCode) {
            if (!serviceCode) return 'CHAIR';
            const codeStr = String(serviceCode).trim();
            if (SERVICES && SERVICES[codeStr] && SERVICES[codeStr].type) return SERVICES[codeStr].type;
            const codeUpper = codeStr.toUpperCase();
            if (codeUpper.startsWith('B')) return 'BED';
            if (codeUpper.startsWith('F')) return 'CHAIR';
            if (codeUpper.startsWith('A') || codeUpper.includes('套餐')) return 'BED'; // Combo usually starts on BED
            if (codeUpper.startsWith('C')) return 'BED';
            return 'CHAIR';
        }

        // --- HELPER: REAL DURATION CALCULATION (FIX 1) ---
        function calculateRealDurations(booking, defaultDuration, isCombo) {
            const CONF = getSystemConfig();
            let p1 = Math.floor(defaultDuration / 2);
            let p2 = defaultDuration - p1;

            const parseDuration = (val) => {
                if (val === undefined || val === null) return null;
                const strVal = String(val).trim();
                if (strVal === "") return null;
                const num = parseInt(strVal, 10);
                return isNaN(num) ? null : num;
            };

            const parsedP1 = parseDuration(booking.phase1_duration) ?? parseDuration(booking.originalData?.phase1_duration);
            if (parsedP1 !== null) p1 = parsedP1;

            const parsedP2 = parseDuration(booking.phase2_duration) ?? parseDuration(booking.originalData?.phase2_duration);
            if (parsedP2 !== null) p2 = parsedP2;

            const realDuration = isCombo ? (p1 + p2) : defaultDuration;
            return { p1, p2, realDuration };
        }

        function isMathematicallyActive(booking, currentQueryTimeMins) {
            const CONF = getSystemConfig();
            if (!isStatusRunning(booking.status)) return true;

            const start = getMinsFromTimeStr(booking.startTime);
            if (start === -1) return true;

            const duration = parseInt(booking.duration) || 60;
            const svcInfo = SERVICES[booking.serviceCode] || { name: booking.serviceName };
            const storedFlow = booking.originalData?.flowCode || booking.flow;
            const isCombo = isComboService(booking.serviceCode || getServiceCodeByName(booking.serviceName));

            const { realDuration } = calculateRealDurations(booking, duration, isCombo);

            const realEnd = start + realDuration + CONF.CLEANUP_BUFFER;
            if (currentQueryTimeMins >= realEnd) return false;
            return true;
        }

        // --- LOGIC PHÂN TÍCH TÀI NGUYÊN ---
        function inferResourceAtTime(booking, timeMins) {
            const CONF = getSystemConfig();
            const bStart = getMinsFromTimeStr(booking.startTime);
            const duration = parseInt(booking.duration) || 60;

            const svcInfo = SERVICES[booking.serviceCode] || { name: booking.serviceName };
            const storedFlow = booking.originalData?.flowCode || booking.flow;
            const isCombo = isComboService(booking.serviceCode || getServiceCodeByName(booking.serviceName));

            const { p1, realDuration } = calculateRealDurations(booking, duration, isCombo);

            const bEnd = bStart + realDuration + CONF.CLEANUP_BUFFER;
            if (timeMins < bStart || timeMins >= bEnd) return null;

            if (storedFlow === 'FOOTSINGLE') return 'CHAIR';
            if (storedFlow === 'BODYSINGLE') return 'BED';
            if (storedFlow === 'SINGLE') return detectResourceType(booking.serviceCode || getServiceCodeByName(booking.serviceName || svcInfo.name));

            if (!isCombo) return detectResourceType(booking.serviceCode || getServiceCodeByName(booking.serviceName || svcInfo.name));

            let isBodyFirst = false;
            const noteContent = (booking.note || booking.ghiChu || "").toString().toUpperCase();
            const isRunningStatus = booking.status && (booking.status.includes('進行') || booking.status.includes('SERVING') || booking.status.includes('Check-in') || booking.status === '已報到');
            
            if ((isRunningStatus || true) && booking.allocated_resource) {
                if (booking.allocated_resource.includes('BED') || booking.allocated_resource.includes('BODY') || booking.allocated_resource.includes('床')) isBodyFirst = true;
                else if (booking.allocated_resource.includes('CHAIR') || booking.allocated_resource.includes('FOOT') || booking.allocated_resource.includes('足') || booking.allocated_resource.includes('腳')) isBodyFirst = false;
                else {
                    if (storedFlow === 'BF') isBodyFirst = true;
                    else if (storedFlow === 'FB') isBodyFirst = false;
                    else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                }
            } else {
                if (storedFlow === 'BF') isBodyFirst = true;
                else if (storedFlow === 'FB') isBodyFirst = false;
                else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
            }

            const splitTime = bStart + p1;
            if (timeMins < splitTime) return isBodyFirst ? 'BED' : 'CHAIR';
            else return isBodyFirst ? 'CHAIR' : 'BED';
        }

        // --- CONTINUOUS SCAN GUARDRAIL ---
        function checkLaneContinuity(laneOccupiedArr, start, end) {
            const CONF = getSystemConfig();
            const safeEnd = end + CONF.CLEANUP_BUFFER;
            for (let block of laneOccupiedArr) {
                if (isOverlap(start, safeEnd, block.start, block.end)) return false;
            }
            return true;
        }

        function resolveStaffShift(staffInfo, queryDateStr) {
            let start = staffInfo.start;
            let end = staffInfo.end;
            let off = staffInfo.off;
            
            const normDate = queryDateStr ? (typeof normalizeDateStrict === 'function' ? normalizeDateStrict(queryDateStr) : queryDateStr.replace(/-/g, '/')) : null;
            
            if (normDate) {
                off = (staffInfo.offDays && staffInfo.offDays.includes(normDate)) ? true : false;
            }
            
            if (normDate && staffInfo.customShifts && staffInfo.customShifts[normDate]) {
                start = staffInfo.customShifts[normDate].start;
                end = staffInfo.customShifts[normDate].end;
            }
            
            return { start, end, off };
        }


        window.validateGlobalCapacity = validateGlobalCapacity;
        function validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, isSimulation = false, locationStr = '本館') {
            const CONF = getSystemConfig(locationStr);

            const triggerSmartFailure = (reasonMsg, specificSuggestionMins = null) => {
                if (isSimulation) return { pass: false, reason: reasonMsg };
                
                let debugInfo = { suggestions: [] };
                if (specificSuggestionMins !== null && specificSuggestionMins >= 0 && specificSuggestionMins <= 1800) {
                    const timeStr = getTimeStrFromMins(specificSuggestionMins);
                    debugInfo.suggestions.push({ time: timeStr, date: queryDateStr, daysToAdd: 0 });
                }

                let oppositeLoc = locationStr === '本館' ? '對面館' : '本館';
                let oppositeSim = validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, true, oppositeLoc);
                let oppositeSuggestion = "";
                if (oppositeSim.pass) {
                    oppositeSuggestion = `\n💡 系統提示：【${oppositeLoc}】在 ${getTimeStrFromMins(requestStart)} 仍有空位，可建議客人至${oppositeLoc}。`;
                }
                
                let snapMins = new Set();
                let maxReqDur = guestList.reduce((max, g) => Math.max(max, parseInt(g.duration || 60, 10)), 0);
                const normQDate = queryDateStr ? (typeof normalizeDateStrict === 'function' ? normalizeDateStrict(queryDateStr) : queryDateStr.replace(/\//g, '-')) : '';
                const cleanBuffer = CONF.CLEANUP_BUFFER || 5;
                const transBuffer = 0;
                
                currentBookingsRaw.forEach(b => {
                    if (b.status === 'CANCELLED' || b.status === 'NO_SHOW') return;
                    let bDate = b.opDate || (b.startTimeString ? b.startTimeString.split(' ')[0].replace(/\//g, '-') : '');
                    if (bDate === normQDate) {
                        let bTime = b.startTimeString ? b.startTimeString.split(' ')[1] : b.startTime;
                        if (bTime) {
                            let [h, m] = bTime.split(':').map(Number);
                            if (!isNaN(h) && !isNaN(m)) {
                                let start = h * 60 + m;
                                let dur = parseInt(b.duration, 10) || 60;
                                let end = start + dur;
                                snapMins.add(end + cleanBuffer);
                                snapMins.add(end + transBuffer);
                                snapMins.add(start - maxReqDur - cleanBuffer);
                                let p1Dur = parseInt(b.phase1_duration, 10) || (b.originalData && parseInt(b.originalData.phase1_duration, 10));
                                if (!isNaN(p1Dur) && p1Dur > 0) {
                                    snapMins.add(start + p1Dur + cleanBuffer);
                                    snapMins.add(start + p1Dur + transBuffer);
                                    snapMins.add(start + p1Dur - maxReqDur - cleanBuffer);
                                }
                            }
                        }
                    }
                });

                let foundMinsAfter = -1;
                let searchStartAfter = Math.max(requestStart + 5, 0); 
                let afterCandidates = [];
                for (let i = 0; i <= 48; i++) {
                    let t = searchStartAfter + i * 5;
                    if (t <= 1800) afterCandidates.push(t);
                }
                afterCandidates.sort((a, b) => {
                    let aSnap = snapMins.has(a);
                    let bSnap = snapMins.has(b);
                    if (aSnap && !bSnap) return -1;
                    if (!aSnap && bSnap) return 1;
                    return a - b;
                });
                for (let t of afterCandidates) {
                    let sim = validateGlobalCapacity(t, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, true, locationStr);
                    if (sim.pass) {
                        foundMinsAfter = t;
                        break;
                    }
                }
                
                let foundMinsBefore = -1;
                let lowerBound = 0;
                try {
                     const today = new Date();
                     const tzOffset = today.getTimezoneOffset() * 60000;
                     const localToday = (new Date(today - tzOffset)).toISOString().split('T')[0];
                     if (normQDate === localToday) {
                         lowerBound = today.getHours() * 60 + today.getMinutes() + 5;
                     }
                } catch (e) {}

                let searchStartBefore = requestStart - 5;
                let beforeCandidates = [];
                for (let i = 0; i <= 48; i++) {
                    let t = searchStartBefore - i * 5;
                    if (t >= lowerBound) beforeCandidates.push(t);
                }
                beforeCandidates.sort((a, b) => {
                    let aSnap = snapMins.has(a);
                    let bSnap = snapMins.has(b);
                    if (aSnap && !bSnap) return -1;
                    if (!aSnap && bSnap) return 1;
                    return b - a;
                });
                for (let t of beforeCandidates) {
                    let sim = validateGlobalCapacity(t, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, true, locationStr);
                    if (sim.pass) {
                        foundMinsBefore = t;
                        break;
                    }
                }
                
                if (foundMinsAfter !== -1 || foundMinsBefore !== -1) {
                    let suggestionText = "";
                    if (foundMinsBefore !== -1 && foundMinsAfter !== -1) {
                        const timeStrBefore = getTimeStrFromMins(foundMinsBefore);
                        const timeStrAfter = getTimeStrFromMins(foundMinsAfter);
                        suggestionText = `💡 智能建議：${locationStr}最接近可完整安排的時間為 ${timeStrBefore} 或 ${timeStrAfter} 之後。`;
                        if (foundMinsBefore !== specificSuggestionMins) debugInfo.suggestions.push({ time: timeStrBefore, date: queryDateStr, daysToAdd: 0 });
                        if (foundMinsAfter !== specificSuggestionMins) debugInfo.suggestions.push({ time: timeStrAfter, date: queryDateStr, daysToAdd: 0 });
                    } else if (foundMinsBefore !== -1) {
                        const timeStrBefore = getTimeStrFromMins(foundMinsBefore);
                        suggestionText = `💡 智能建議：${locationStr}最接近可完整安排的時間為 ${timeStrBefore}。`;
                        if (foundMinsBefore !== specificSuggestionMins) debugInfo.suggestions.push({ time: timeStrBefore, date: queryDateStr, daysToAdd: 0 });
                    } else {
                        const timeStrAfter = getTimeStrFromMins(foundMinsAfter);
                        suggestionText = `💡 智能建議：${locationStr}最快可完整安排 (含所有階段) 的時間為 ${timeStrAfter} 之後。`;
                        if (foundMinsAfter !== specificSuggestionMins) debugInfo.suggestions.push({ time: timeStrAfter, date: queryDateStr, daysToAdd: 0 });
                    }
                    return { pass: false, reason: `${reasonMsg}${oppositeSuggestion}\n${suggestionText}`, debug: debugInfo };
                } else {
                    return { pass: false, reason: `${reasonMsg}${oppositeSuggestion}\n⚠️ 今日已無足夠資源可完整安排此預約。`, debug: debugInfo };
                }
            };

            const resourceMap = {
                'BED': Array.from({ length: CONF.MAX_BEDS }, () => []),
                'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, () => [])
            };

            const globalStaffBookings = currentBookingsRaw.filter(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                if (bStart === -1) return false;
                if (!isActiveBookingStatus(b.status)) return false;
                if (!isMathematicallyActive(b, requestStart)) return false;

                const svcInfo = SERVICES[b.serviceCode] || { name: b.serviceName };
                const storedFlow = b.originalData?.flowCode || b.flow;
                const isCombo = isComboService(b.serviceCode || getServiceCodeByName(b.serviceName));
                const { realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);

                const bEnd = bStart + realDuration + CONF.CLEANUP_BUFFER;
                return bEnd > requestStart;
            });

            const resolveRealLocation = (b) => {
                let locStr = b.current_resource_id || b.phase1_res_idx || b.originalData?.location || b.location || '本館';
                const match = String(locStr).match(/(?:BED|CHAIR|床|足|腳|OPP)[-_ ]?([12])[-_ ]?\\d+/i);
                if (match) return match[1] === '2' ? '對面館' : '本館';
                return (b.originalData?.location || b.location || '本館') === '對面館' ? '對面館' : '本館';
            };
            const relevantBookings = globalStaffBookings.filter(b => {
                return resolveRealLocation(b) === locationStr;
            });

            relevantBookings.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                const svcInfo = SERVICES[b.serviceCode] || { name: b.serviceName };
                const bLoc = b.originalData?.location || b.location || '本館';
                const storedFlow = b.originalData?.flowCode || b.flow;
                const isCombo = isComboService(b.serviceCode || getServiceCodeByName(b.serviceName));
                const { p1, realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);

                // [V136.1 FIX] Accurate Resource ID Extraction - Removes rowId from matching to avoid false positives on Bed 1
                const resFields = [b.phase1_res_idx, b.phase2_res_idx, b.allocated_resource, b.current_resource_id];
                let extractedMatches = [];
                resFields.forEach(rawId => {
                    if (!rawId) return;
                    let id = String(rawId).toUpperCase().trim();
                    if (!id) return;
                    
                    let isOpp = id.includes('OPP') || id.includes('對') || id.includes('2-') || (b.location === '對面館');
                    let isChair = id.includes('CHAIR') || id.includes('腳') || id.includes('足') || id.includes('FOOT');
                    let isBed = id.includes('BED') || id.includes('床') || id.includes('本') || id.includes('BODY') || id.includes('身');
                    
                    if (!isChair && !isBed) {
                        if (id.includes('本') || id.includes('對') || b.location === '對面館') isBed = true; 
                        else isChair = true; 
                    }
                    
                    let match = id.match(/\d+/g);
                    let num = match && match.length > 0 ? match[match.length - 1] : '';
                    if (!num) return;
                    
                    let building = isOpp ? '2' : '1';
                    let type = isChair ? 'CHAIR' : 'BED';
                    extractedMatches.push(`${type}-${building}-${num}`);
                });
                
                let uniqueMatches = [...new Set(extractedMatches)];

                // [NEW V118.9] Logic Nhận diện Đặt chỗ linh hoạt (Fluid Booking) & Repacking
                const isLockedRaw = b.originalData?.isManualLocked || b.isManualLocked;
                const isLocked = (isLockedRaw === true || isLockedRaw === 'TRUE' || isLockedRaw === 1);
                let isRunning = false;
                if (b.originalData && b.originalData.status) {
                    const stLower = b.originalData.status.toLowerCase();
                    isRunning = stLower.includes('running') || stLower.includes('服務中') || stLower.includes('đang phục vụ');
                }
                if (b.status) {
                    const stLower = b.status.toLowerCase();
                    if (stLower.includes('running') || stLower.includes('服務中') || stLower.includes('đang phục vụ')) isRunning = true;
                }
                
                // Nếu booking không bị khóa và chưa bắt đầu, hệ thống được phép "giả lập dời ghế"
                // [V136.2 FIX] Disabled Fluid Booking Repacking: Cố định toạ độ thực tế để tránh lỗi xếp đè (Overlap)
                const isFluid = false; 

                // Kích hoạt Repacking: Bỏ qua ghế đã chỉ định, ép hệ thống tự tìm ghế trống tối ưu nhất
                if (isFluid) {
                    uniqueMatches = []; 
                }

                const pushToMapFallback = (type, startT, endT) => {
                    if (resourceMap[type]) {
                        for (let i = 0; i < resourceMap[type].length; i++) {
                            const overlaps = resourceMap[type][i].some(blk => isOverlap(startT, endT, blk.start, blk.end));
                            if (!overlaps) {
                                resourceMap[type][i].push({ start: startT, end: endT });
                                return true;
                            }
                        }
                    }
                    return false;
                };

                const pushToMap = (res, startT, endT, fallbackType) => {
                    let success = false;
                    if (res) {
                        const laneMatch = res.match(/(BED|CHAIR|床|足|腳)[-_ ]?(?:\d+[-_ ])?(\d+)/i);
                        if (laneMatch) {
                            const type = (laneMatch[1].toUpperCase().includes('BED') || laneMatch[1].includes('床')) ? 'BED' : 'CHAIR';
                            const idx = parseInt(laneMatch[2]) - 1;
                            if (resourceMap[type] && resourceMap[type][idx]) {
                                resourceMap[type][idx].push({ start: startT, end: endT });
                                success = true;
                            }
                        }
                    }
                    if (!success && fallbackType) {
                        pushToMapFallback(fallbackType, startT, endT);
                    }
                };

                if (isCombo) {
                    let res1 = null, res2 = null;
                    let type1 = 'BED'; let type2 = 'CHAIR';
                    let isBodyFirst = true;
                    const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
                    const isRunningStatus = b.status && (b.status.includes('進行') || b.status.includes('SERVING') || b.status.includes('Check-in') || b.status === '已報到');

                    if ((isRunningStatus || b.phase1_res_idx || b.allocated_resource) && (b.phase1_res_idx || b.allocated_resource)) {
                        const resToCheck = b.phase1_res_idx || b.allocated_resource;
                        if (resToCheck.includes('BED') || resToCheck.includes('BODY') || resToCheck.includes('床')) isBodyFirst = true;
                        else if (resToCheck.includes('CHAIR') || resToCheck.includes('FOOT') || resToCheck.includes('足') || resToCheck.includes('腳')) isBodyFirst = false;
                        else {
                            if (storedFlow === 'BF') isBodyFirst = true;
                            else if (storedFlow === 'FB') isBodyFirst = false;
                            else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                            else if (b._impliedFlow === 'BF') isBodyFirst = true;
                        }
                    } else {
                        if (storedFlow === 'BF') isBodyFirst = true;
                        else if (storedFlow === 'FB') isBodyFirst = false;
                        else {
                            if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                            else if (b._impliedFlow === 'BF') isBodyFirst = true;
                        }
                    }

                    if (uniqueMatches.length >= 2) {
                        if (isBodyFirst) {
                            res1 = uniqueMatches.find(r => r.includes('BED') || r.includes('床')) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('足')) || uniqueMatches[1];
                        } else {
                            res1 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('足')) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('BED') || r.includes('床')) || uniqueMatches[1];
                        }
                    } else if (uniqueMatches.length === 1) {
                        const mType = (uniqueMatches[0].toUpperCase().includes('BED') || uniqueMatches[0].includes('床')) ? 'BED' : 'CHAIR';
                        if (isBodyFirst) {
                            if (mType === 'BED') res1 = uniqueMatches[0];
                            else res2 = uniqueMatches[0];
                        } else {
                            if (mType === 'CHAIR') res1 = uniqueMatches[0];
                            else res2 = uniqueMatches[0];
                        }
                    }
                    
                    if (!isBodyFirst) { type1 = 'CHAIR'; type2 = 'BED'; }

                    pushToMap(res1, bStart, bStart + p1, type1);
                    pushToMap(res2, bStart + p1, bStart + realDuration + CONF.CLEANUP_BUFFER, type2);
                } else {
                    let inferredType = 'BED';
                    if (svcInfo) {
                        if (svcInfo.type === 'CHAIR') inferredType = 'CHAIR';
                        else if (storedFlow === 'FOOTSINGLE') inferredType = 'CHAIR';
                    }
                    if (uniqueMatches.length > 0) {
                        uniqueMatches.forEach(res => {
                            pushToMap(res, bStart, bStart + realDuration + CONF.CLEANUP_BUFFER, inferredType);
                        });
                    } else {
                        pushToMapFallback(inferredType, bStart, bStart + realDuration + CONF.CLEANUP_BUFFER);
                    }
                }
            });

            const availableStaffList = Object.values(staffList).filter(s => {
                const shiftInfo = resolveStaffShift(s, queryDateStr);
                if (shiftInfo.off) return false;
                const ss = getMinsFromTimeStr(shiftInfo.start);
                let se = getMinsFromTimeStr(shiftInfo.end);

                // [FRONTEND V118] Thuật toán Phân đoạn Ca Đêm
                if (se < ss) {
                    se += 1440;
                }

                let inMain = (requestStart >= ss && requestStart < se);
                let inTail = false;
                if (se > 1440) {
                    const origSe = se - 1440;
                    inTail = (requestStart >= 0 && requestStart < origSe);
                }
                return inMain || inTail;
            });

            const normId = (id) => String(id || '').replace(/^0+/, '').trim().toUpperCase();

            const supplyCount = availableStaffList.length;
            const femaleSupply = availableStaffList.filter(s => s.gender === 'F' || s.gender === '女').length;
            const maleSupply = availableStaffList.filter(s => s.gender === 'M' || s.gender === '男').length;

            let staffBusyCount = 0;
            let femaleBusyCount = 0;
            let maleBusyCount = 0;
            let staffBusyPeriods = {}; // { '9': [{start, end}] }

            let distinctStaffs = new Set();
            let distinctFemaleStaffs = new Set();
            let distinctMaleStaffs = new Set();
            let overlapEvents = [];

            globalStaffBookings.forEach(b => {
                const bS = getMinsFromTimeStr(b.startTime);
                const svcInfo = SERVICES[b.serviceCode] || { name: b.serviceName };
                const storedFlow = b.originalData?.flowCode || b.flow;
                const isCombo = isComboService(b.serviceCode || getServiceCodeByName(b.serviceName));
                const { realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);
                const bE = bS + realDuration + CONF.CLEANUP_BUFFER;

                let staffsInBooking = b.assignedStaffs && b.assignedStaffs.length > 0 ? b.assignedStaffs : [b.staffName];

                for (const stf of staffsInBooking) {
                    if (stf) {
                        const sId = normId(stf);
                        if (!staffBusyPeriods[sId]) staffBusyPeriods[sId] = [];
                        staffBusyPeriods[sId].push({ start: bS, end: bE });
                    }
                }

                if (isOverlap(requestStart, requestStart + maxDuration, bS, bE)) {
                    let st = Math.max(requestStart, bS);
                    let en = Math.min(requestStart + maxDuration, bE);
                    
                    if (en > st) {
                        let allDelta = 0;
                        let femaleDelta = 0;
                        let maleDelta = 0;

                        for (const staffName of staffsInBooking) {
                            const sId = normId(staffName);
                            
                            const isRandom = (sId === '隨機' || sId === 'ANY' || sId === 'UNDEFINED' || sId === 'NULL' || sId === 'FALSE' || sId === '');
                            const isFemaleReq = (sId === '女' || sId === '女師' || sId === 'FEMALE');
                            const isMaleReq = (sId === '男' || sId === '男師' || sId === 'MALE');
                            
                            allDelta++;
                            
                            if (isFemaleReq) {
                                femaleDelta++;
                            } else if (isMaleReq) {
                                maleDelta++;
                            } else if (!isRandom) {
                                distinctStaffs.add(sId);
                                const sInfo = staffList[staffName] || Object.values(staffList).find(s => normId(s.name) === sId || normId(s.id) === sId) || {};
                                if (sInfo.gender === 'F' || sInfo.gender === '女' || sInfo.group === '女') {
                                    femaleDelta++;
                                    distinctFemaleStaffs.add(sId);
                                } else if (sInfo.gender === 'M' || sInfo.gender === '男' || sInfo.group === '男') {
                                    maleDelta++;
                                    distinctMaleStaffs.add(sId);
                                }
                            }
                        }
                        
                        if (allDelta > 0) {
                            overlapEvents.push({ time: st, type: 1, all: allDelta, f: femaleDelta, m: maleDelta });
                            overlapEvents.push({ time: en, type: -1, all: allDelta, f: femaleDelta, m: maleDelta });
                        }
                    }
                }
            });

            overlapEvents.sort((a, b) => a.time - b.time || a.type - b.type);
            
            let currAll = 0, currF = 0, currM = 0;
            let maxAll = 0, maxF = 0, maxM = 0;
            
            for (const ev of overlapEvents) {
                currAll += ev.type * ev.all;
                currF += ev.type * ev.f;
                currM += ev.type * ev.m;
                
                if (currAll > maxAll) maxAll = currAll;
                if (currF > maxF) maxF = currF;
                if (currM > maxM) maxM = currM;
            }

            staffBusyCount = Math.max(distinctStaffs.size, maxAll);
            femaleBusyCount = Math.max(distinctFemaleStaffs.size, maxF);
            maleBusyCount = Math.max(distinctMaleStaffs.size, maxM);

            let femaleReqCount = 0;
            let maleReqCount = 0;
            let specificStaffReqs = [];

            guestList.forEach(g => {
                const req = g.staff;
                if (req === 'FEMALE' || req === '女' || req === '女師') femaleReqCount++;
                else if (req === 'MALE' || req === '男' || req === '男師') maleReqCount++;
                else if (req && req !== '隨機' && req !== 'Any' && req !== 'undefined' && req !== 'null') {
                    const sId = normId(req);
                    specificStaffReqs.push({ req: sId, rawReq: req, duration: g.overrideDuration || (SERVICES[g.serviceCode] || { duration: 60 }).duration || 60 });
                }
            });

            // 1. SPECIFIC STAFF DUPLICATE CHECK
            const reqCounts = {};
            for (const specificReq of specificStaffReqs) {
                reqCounts[specificReq.req] = (reqCounts[specificReq.req] || 0) + 1;
            }
            for (const [req, count] of Object.entries(reqCounts)) {
                if (count > 1) {
                    if (isSimulation) return { pass: false, reason: 'Duplicate staff assigned' };
                    return { pass: false, reason: `⚠️ 錯誤: 不可同時指派 ${count} 位客人給同一技師 ${req}。`, debug: {} };
                }
            }

            // 2. SPECIFIC STAFF SECURE CHECK & NEXT GAP PREDICTION
            for (const specificReq of specificStaffReqs) {
                const reqId = specificReq.req;
                const rawName = specificReq.rawReq;
                const dur = specificReq.duration;
                const requiredEnd = requestStart + dur;

                const sInfo = staffList[reqId] || Object.values(staffList).find(s => normId(s.name) === reqId || normId(s.id) === reqId);
                if (sInfo) {
                    const shiftInfo = resolveStaffShift(sInfo, queryDateStr);
                    const ss = getMinsFromTimeStr(shiftInfo.start);
                    let se = getMinsFromTimeStr(shiftInfo.end);
                    if (se < ss) se += 1440;

                    if (shiftInfo.off || requestStart < ss || requestStart >= se) {
                        return triggerSmartFailure(`⚠️ 技師 ${rawName} 該時段未排班或已下班。`);
                    }

                    let busyBlocks = staffBusyPeriods[reqId] || [];
                    busyBlocks.sort((a, b) => a.start - b.start);

                    let isBusy = false;
                    for (const blk of busyBlocks) {
                        if (isOverlap(requestStart, requiredEnd, blk.start, blk.end)) {
                            isBusy = true;
                            break;
                        }
                    }

                    if (isBusy) {
                        return triggerSmartFailure(`⚠️ 技師 ${rawName} 該時段已有預約。`);
                    }
                }
            }

            // 3. GENDER POOL CHECK
            if (femaleReqCount > 0 && (femaleBusyCount + femaleReqCount) > femaleSupply) {
                return triggerSmartFailure(`⚠️ 女技師不足。女師總共: ${femaleSupply}, 忙碌中: ${femaleBusyCount}, 欲預約女師數: ${femaleReqCount}`);
            }

            if (maleReqCount > 0 && (maleBusyCount + maleReqCount) > maleSupply) {
                return triggerSmartFailure(`⚠️ 男技師不足。男師總共: ${maleSupply}, 忙碌中: ${maleBusyCount}, 欲預約男師數: ${maleReqCount}`);
            }

            // 4. OVERALL POOL CHECK
            if ((staffBusyCount + guestList.length) > supplyCount) {
                return triggerSmartFailure(`⚠️ 技師總數不足。總共: ${supplyCount}, 忙碌中: ${staffBusyCount}, 新客: ${guestList.length}`);
            }

            // SIMULATION
            const simulationMap = JSON.parse(JSON.stringify(resourceMap));
            const suggestedLanes = {}; // [NEW V118.6]

            for (let i = 0; i < guestList.length; i++) {
                const g = guestList[i];
                const svc = typeof getServiceInfo === 'function' ? getServiceInfo(g.serviceCode, g.serviceName || g.service) : (SERVICES[g.serviceCode] || { duration: 60 });
                const duration = g.overrideDuration || svc.duration || 60;
                const isCombo = isComboService(g.serviceCode || getServiceCodeByName(g.serviceName || g.service));
                const guestIdKey = g.idx !== undefined ? g.idx : i; // Đảm bảo đúng index

                if (isCombo) {
                    let foundValidSplit = false;
                    let bestOutOfBoundSplit = null;
                    const eStep = svc.elasticStep || 1;
                    const eLimit = svc.elasticLimit || 20;
                    const flowsToTry = (g.flowCode === 'FB' || g.flowCode === 'BF') ? [g.flowCode] : ['FB', 'BF'];
                    
                    for (const testFlow of flowsToTry) {
                        const splitsToTry = generateElasticSplits(duration, eStep, eLimit, null, svc.minFoot, svc.maxFoot, svc.minBody, svc.maxBody, testFlow, true);
                        
                        for (const split of splitsToTry) {
                            const p1 = split.p1;
                            const p2 = split.p2;
                            const tStart = requestStart;
                            const tSwitch = tStart + p1;
                            
                            let bedIdx = -1, chairIdx = -1;
                            
                            if (testFlow === 'BF') {
                                for (let b = 0; b < CONF.MAX_BEDS; b++) {
                                    if (checkLaneContinuity(simulationMap.BED[b], tStart, tStart + p1)) { bedIdx = b; break; }
                                }
                                for (let c = 0; c < CONF.MAX_CHAIRS; c++) {
                                    if (checkLaneContinuity(simulationMap.CHAIR[c], tSwitch, tSwitch + p2)) { chairIdx = c; break; }
                                }
                                if (bedIdx !== -1 && chairIdx !== -1) {
                                    if (split.shiftMins === 0) {
                                        simulationMap.BED[bedIdx].push({ start: tStart, end: tStart + p1 });
                                        simulationMap.CHAIR[chairIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                                        suggestedLanes[guestIdKey] = { BED: bedIdx + 1, CHAIR: chairIdx + 1, flow: testFlow, phase1_duration: p1, phase2_duration: p2 };
                                        foundValidSplit = true;
                                        bestOutOfBoundSplit = null;
                                        break;
                                    } else if (!bestOutOfBoundSplit) {
                                        bestOutOfBoundSplit = split;
                                    }
                                }
                            } else {
                                for (let c = 0; c < CONF.MAX_CHAIRS; c++) {
                                    if (checkLaneContinuity(simulationMap.CHAIR[c], tStart, tStart + p1)) { chairIdx = c; break; }
                                }
                                for (let b = 0; b < CONF.MAX_BEDS; b++) {
                                    if (checkLaneContinuity(simulationMap.BED[b], tSwitch, tSwitch + p2)) { bedIdx = b; break; }
                                }
                                if (chairIdx !== -1 && bedIdx !== -1) {
                                    if (split.shiftMins === 0) {
                                        simulationMap.CHAIR[chairIdx].push({ start: tStart, end: tStart + p1 });
                                        simulationMap.BED[bedIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                                        suggestedLanes[guestIdKey] = { CHAIR: chairIdx + 1, BED: bedIdx + 1, flow: testFlow, phase1_duration: p1, phase2_duration: p2 };
                                        foundValidSplit = true;
                                        bestOutOfBoundSplit = null;
                                        break;
                                    } else if (!bestOutOfBoundSplit) {
                                        bestOutOfBoundSplit = split;
                                    }
                                }
                            }
                        }
                        if (foundValidSplit) break;
                    }

                    if (!foundValidSplit) {
                        let crossLocationMsg = "";
                        if (locationStr === '本館' || locationStr === '對面館') {
                            let oppositeLoc = locationStr === '本館' ? '對面館' : '本館';
                            let oppSim = validateGlobalCapacity(requestStart, maxDuration, [], currentBookingsRaw, staffList, queryDateStr, true, oppositeLoc);
                            let oppMap = oppSim.resourceMap;
                            let oppConfMaxBeds = getSystemConfig(oppositeLoc).MAX_BEDS;
                            let oppConfMaxChairs = getSystemConfig(oppositeLoc).MAX_CHAIRS;
                            
                            for (const testFlow of flowsToTry) {
                                const splitsToTry = generateElasticSplits(duration, eStep, eLimit, null, svc.minFoot, svc.maxFoot, svc.minBody, svc.maxBody, testFlow, true);
                                let foundCross = false;
                                for (const split of splitsToTry) {
                                    if (split.shiftMins !== 0) continue;
                                    const p1 = split.p1;
                                    const p2 = split.p2;
                                    const tStart = requestStart;
                                    const tSwitch = tStart + p1;
                                    
                                    let loc1Idx = -1, loc2Idx = -1;
                                    
                                    if (testFlow === 'BF') {
                                        for (let b = 0; b < CONF.MAX_BEDS; b++) { if (checkLaneContinuity(simulationMap.BED[b], tStart, tStart + p1)) { loc1Idx = b; break; } }
                                        for (let c = 0; c < oppConfMaxChairs; c++) { if (checkLaneContinuity(oppMap.CHAIR[c], tSwitch, tSwitch + p2 + CONF.CLEANUP_BUFFER)) { loc2Idx = c; break; } }
                                        if (loc1Idx !== -1 && loc2Idx !== -1) {
                                            crossLocationMsg = `\n💡 跨館建議：【${locationStr}】目前僅有全身床位，【${oppositeLoc}】有足部座位。是否同意先在【${locationStr}】進行身體按摩，再移步至【${oppositeLoc}】完成足部按摩？`;
                                            foundCross = true;
                                            break;
                                        }
                                    } else {
                                        for (let c = 0; c < CONF.MAX_CHAIRS; c++) { if (checkLaneContinuity(simulationMap.CHAIR[c], tStart, tStart + p1)) { loc1Idx = c; break; } }
                                        for (let b = 0; b < oppConfMaxBeds; b++) { if (checkLaneContinuity(oppMap.BED[b], tSwitch, tSwitch + p2 + CONF.CLEANUP_BUFFER)) { loc2Idx = b; break; } }
                                        if (loc1Idx !== -1 && loc2Idx !== -1) {
                                            crossLocationMsg = `\n💡 跨館建議：【${locationStr}】目前僅有足部座位，【${oppositeLoc}】有全身床位。是否同意先在【${locationStr}】進行足部按摩，再移步至【${oppositeLoc}】完成身體按摩？`;
                                            foundCross = true;
                                            break;
                                        }
                                    }
                                }
                                if (foundCross) break;
                            }
                        }

                        if (bestOutOfBoundSplit) {
                            let suggestedTime = requestStart + bestOutOfBoundSplit.shiftMins;
                            let timeStr = getTimeStrFromMins(suggestedTime);
                            let actionText = bestOutOfBoundSplit.shiftMins > 0 ? '稍晚' : '提早';
                            let shiftVal = Math.abs(bestOutOfBoundSplit.shiftMins);
                            let err = triggerSmartFailure(`⚠️ 在 ${getTimeStrFromMins(requestStart)} 沒有完美符合的連續空位。建議您${actionText} ${shiftVal} 分鐘，改為 ${timeStr} 預約以滿足套餐標準。${crossLocationMsg}`, suggestedTime);
                            err.requiresSmartRepacking = true;
                            return err;
                        } else {
                            let err = triggerSmartFailure(`⚠️ 在 ${getTimeStrFromMins(requestStart)} 沒有足夠的連續空位給套餐。${crossLocationMsg}`);
                            err.requiresSmartRepacking = true;
                            return err;
                        }
                    }

                } else {
                    let rType = 'CHAIR';
                    if (g.flowCode === 'BODYSINGLE') rType = 'BED';
                    else if (g.flowCode === 'FOOTSINGLE') rType = 'CHAIR';
                    else rType = detectResourceType(g.serviceCode || getServiceCodeByName(svc.name || g.serviceName || g.service));

                    let foundIdx = -1;
                    for (let k = 0; k < (rType === 'BED' ? CONF.MAX_BEDS : CONF.MAX_CHAIRS); k++) {
                        if (checkLaneContinuity(simulationMap[rType][k], requestStart, requestStart + duration)) {
                            foundIdx = k;
                            break;
                        }
                    }

                    if (foundIdx !== -1) {
                        simulationMap[rType][foundIdx].push({ start: requestStart, end: requestStart + duration + CONF.CLEANUP_BUFFER });
                        suggestedLanes[guestIdKey] = { [rType]: foundIdx + 1, flow: g.flowCode || 'SINGLE', phase1_duration: duration, phase2_duration: 0 };
                    } else {
                        let err = triggerSmartFailure(`⚠️ 已經沒有連續 ${duration} 分鐘的空${rType === 'BED' ? '床位' : '座位'}。`);
                        err.requiresSmartRepacking = true;
                        return err;
                    }
                }
            }
            return { pass: true, debug: { msg: "V118.6 Continuous Scan Passed" }, resourceMap: resourceMap, suggestedLanes: suggestedLanes };
        }

        // --- MATRIX ENGINE ---
        class VirtualMatrix {
            constructor(locationStr = '本館') {
                const CONF = getSystemConfig(locationStr);
                const isOpp = locationStr === '對面館' || CONF._tempLocation === '對面館';
                const buildingStr = isOpp ? '2' : '1';
                this.lanes = {
                    'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${buildingStr}-${i + 1}`, occupied: [] })),
                    'BED': Array.from({ length: CONF.MAX_BEDS }, (_, i) => ({ id: `BED-${buildingStr}-${i + 1}`, occupied: [] }))
                };
                this.blockLog = [];
            }
            checkLaneFree(lane, start, end) {
                for (let block of lane.occupied) {
                    if (isOverlap(start, end, block.start, block.end)) {
                        return { free: false, blocker: block };
                    }
                }
                return { free: true };
            }
            allocateToLane(lane, start, end, ownerId) {
                lane.occupied.push({ start, end, ownerId });
                lane.occupied.sort((a, b) => a.start - b.start);
                return lane.id;
            }
            tryAllocate(type, start, end, ownerId, preferredIndex = null, isForced = false) {
                const resourceGroup = this.lanes[type];
                if (!resourceGroup) return null;

                if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
                    const targetLane = resourceGroup[preferredIndex - 1];
                    // --- V118.4 BUG FIX: Dù có trùng lịch (checkLaneFree = false), nếu là isForced (đã được ấn định từ trước),
                    // bắt buộc phải nhét vào targetLane để phục dựng chính xác lịch sử, tránh tạo Bóng Ma nhảy sang ghế khác! ---
                    if (isForced || this.checkLaneFree(targetLane, start, end).free) {
                        return this.allocateToLane(targetLane, start, end, ownerId);
                    }
                }
                
                // [V118.9 FIX] 恢復「從上到下緊湊排列」(Top-Down Packing) 邏輯，取消空位優先分配以避免視覺空隙。
                // Không thay đổi thứ tự hàng (CHAIR-1, CHAIR-2...) để luôn cố định ghế/giường.
                let sortedLanes = [...resourceGroup];

                for (let lane of sortedLanes) {
                    const check = this.checkLaneFree(lane, start, end);
                    if (check.free) {
                        return this.allocateToLane(lane, start, end, ownerId);
                    } else {
                        const blockerTime = `${getTimeStrFromMins(check.blocker.start)}-${getTimeStrFromMins(check.blocker.end)}`;
                        this.blockLog.push(`❌ ${lane.id} 被 ${check.blocker.ownerId} (${blockerTime}) 擋住`);
                    }
                }
                
                return null;
            }
        }

        // --- HELPER LOGIC: STAFF MATCHING & ELASTIC (MULTI-STAFF ARRAY UPDATE) ---
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList, queryDateStr = null, outReason = {}) {
            const CONF = getSystemConfig();
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
                if (!staffInfo) { outReason.reason = 'NOT_FOUND'; return false; }
                const shiftInfo = resolveStaffShift(staffInfo, queryDateStr);
                if (shiftInfo.off) { outReason.reason = 'OFF'; return false; }
                const shiftStart = getMinsFromTimeStr(shiftInfo.start);
                let shiftEnd = getMinsFromTimeStr(shiftInfo.end);
                if (shiftStart === -1 || shiftEnd === -1) return false;

                // [FRONTEND V118] Thuật toán Phân đoạn Ca Đêm
                if (shiftEnd < shiftStart) {
                    shiftEnd += 1440;
                }

                const isStrict = staffInfo.isStrictTime === true;
                let inMain = true;
                let failReason = 'OUT_OF_SHIFT';
                if ((start + CONF.TOLERANCE) < shiftStart) {
                    inMain = false;
                    failReason = 'BEFORE_SHIFT';
                }
                else if (isStrict) {
                    if ((end - CONF.TOLERANCE) > shiftEnd) {
                        inMain = false;
                        failReason = 'OUT_OF_SHIFT';
                    }
                } else {
                    if (start >= shiftEnd) {
                        inMain = false;
                        failReason = 'OUT_OF_SHIFT';
                    }
                }

                let inTail = false;
                if (shiftEnd > 1440) {
                    const origEnd = shiftEnd - 1440;
                    inTail = true;
                    if (start < 0) inTail = false;
                    else if (isStrict) {
                        if ((end - CONF.TOLERANCE) > origEnd) inTail = false;
                    } else {
                        if (start >= origEnd) inTail = false;
                    }
                }

                if (!inMain && !inTail) { 
                    outReason.reason = failReason; 
                    if (failReason === 'BEFORE_SHIFT') {
                        outReason.time = `${String(Math.floor(start/60)%24).padStart(2, '0')}:${String(start%60).padStart(2, '0')}`;
                    }
                    return false; 
                }

                // MULTI-STAFF FIX: Kiểm tra xem name có nằm trong mảng thợ của bất kỳ booking nào đang bận không
                for (const b of busyList) {
                    const staffArray = b.assignedStaffs || [b.staffName];
                    if (staffArray.includes(name) && isOverlap(start, end, b.start, b.end)) {
                        outReason.reason = 'BUSY';
                        outReason.time = `${Math.floor(start/60)%24}:${(start%60).toString().padStart(2, '0')}`;
                        return false;
                    }
                }
                if ((staffReq === 'MALE' || staffReq === '男' || staffReq === '男師') && staffInfo.gender !== 'M') { outReason.reason = 'GENDER_MISMATCH'; return false; }
                if ((staffReq === 'FEMALE' || staffReq === '女' || staffReq === '女師') && staffInfo.gender !== 'F') { outReason.reason = 'GENDER_MISMATCH'; return false; }
                return true;
            };
            if (staffReq && !['RANDOM', 'MALE', 'FEMALE', '隨機', 'Any', 'undefined', '男', '女', '男師', '女師'].includes(staffReq)) {
                return checkOneStaff(staffReq) ? staffReq : null;
            } else {
                const allStaffNames = Object.keys(staffListRef);
                for (const name of allStaffNames) {
                    if (checkOneStaff(name)) return name;
                }
                return null;
            }
        }

        function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null, minFoot = null, maxFoot = null, minBody = null, maxBody = null, flow = 'FB', includeOutOfBounds = false) {
            if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
                return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999, shiftMins: 0 }];
            }
            const standardHalf = Math.floor(totalDuration / 2);
            let options = [];
            
            let strictMinP1 = 15, strictMaxP1 = totalDuration - 15;
            let strictMinP2 = 15, strictMaxP2 = totalDuration - 15;

            const isBF = (flow === 'BF');
            if (isBF) {
                if (minBody) strictMinP1 = Math.max(strictMinP1, minBody);
                if (maxBody) strictMaxP1 = Math.min(strictMaxP1, maxBody);
                if (minFoot) strictMinP2 = Math.max(strictMinP2, minFoot);
                if (maxFoot) strictMaxP2 = Math.min(strictMaxP2, maxFoot);
            } else {
                if (minFoot) strictMinP1 = Math.max(strictMinP1, minFoot);
                if (maxFoot) strictMaxP1 = Math.min(strictMaxP1, maxFoot);
                if (minBody) strictMinP2 = Math.max(strictMinP2, minBody);
                if (maxBody) strictMaxP2 = Math.min(strictMaxP2, maxBody);
            }

            let lowerBoundP1 = Math.max(strictMinP1, totalDuration - strictMaxP2);
            let upperBoundP1 = Math.min(strictMaxP1, totalDuration - strictMinP2);

            let scanMinP1 = includeOutOfBounds ? 15 : lowerBoundP1;
            let scanMaxP1 = includeOutOfBounds ? (totalDuration - 15) : upperBoundP1;

            let p2_standard = totalDuration - standardHalf;
            
            const addOption = (p1) => {
                let p2 = totalDuration - p1;
                let shiftMins = 0;
                if (p1 > upperBoundP1) shiftMins = p1 - upperBoundP1;
                else if (p1 < lowerBoundP1) shiftMins = p1 - lowerBoundP1;
                
                if (!includeOutOfBounds && shiftMins !== 0) return;

                // V118.5 FIX: Even if includeOutOfBounds is true, NEVER violate explicit min/max bounds if they are provided!
                if (isBF) {
                    if (minBody != null && p1 < minBody) return;
                    if (maxBody != null && p1 > maxBody) return;
                    if (minFoot != null && p2 < minFoot) return;
                    if (maxFoot != null && p2 > maxFoot) return;
                } else {
                    if (minFoot != null && p1 < minFoot) return;
                    if (maxFoot != null && p1 > maxFoot) return;
                    if (minBody != null && p2 < minBody) return;
                    if (maxBody != null && p2 > maxBody) return;
                }
                
                options.push({ p1: p1, p2: p2, deviation: Math.abs(p1 - standardHalf), shiftMins: shiftMins });
            };

            addOption(standardHalf);

            let realStep = step > 0 ? step : 5;
            if (realStep > 30) realStep = 5; // V118 FIX: Sanitize extremely large steps

            const p1List = [];
            let curMax = standardHalf;
            while (curMax + realStep <= scanMaxP1) curMax += realStep;
            
            let curMin = standardHalf;
            while (curMin - realStep >= scanMinP1) curMin -= realStep;

            if (isBF) {
                for (let p1 = curMax; p1 >= curMin; p1 -= realStep) {
                    if (p1 === standardHalf) continue;
                    p1List.push(p1);
                }
            } else {
                for (let p1 = curMin; p1 <= curMax; p1 += realStep) {
                    if (p1 === standardHalf) continue;
                    p1List.push(p1);
                }
            }

            for (const p1 of p1List) {
                addOption(p1);
            }

            const uniqueOptions = [];
            const seen = new Set();
            for (const opt of options) {
                const key = `${opt.p1}-${opt.p2}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueOptions.push(opt);
                }
            }
            if (uniqueOptions.length === 0) uniqueOptions.push({ p1: standardHalf, p2: p2_standard, deviation: 0, shiftMins: 0 });
            return uniqueOptions;
        }

        function isBlockSetAllocatable(blocks, matrix) {
            for (const b of blocks) {
                const laneGroup = matrix.lanes[b.type];
                if (!laneGroup) return false;
                let foundLaneForThisBlock = false;
                if (b.forcedIndex && b.forcedIndex > 0 && b.forcedIndex <= laneGroup.length) {
                    const targetLane = laneGroup[b.forcedIndex - 1];
                    if (matrix.checkLaneFree(targetLane, b.start, b.end).free) {
                        foundLaneForThisBlock = true;
                    }
                }
                if (!foundLaneForThisBlock) {
                    for (const lane of laneGroup) {
                        if (matrix.checkLaneFree(lane, b.start, b.end).free) { foundLaneForThisBlock = true; break; }
                    }
                }
                if (!foundLaneForThisBlock) return false;
            }
            return true;
        }

        // --- MAIN ENGINE ---
        function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList, options = {}) {
            const locationStr = options.location || '本館';
            const CONF = getSystemConfig(locationStr);
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "❌ 錯誤：時間格式無效" };

            let maxGuestDuration = 0;
            guestList.forEach(g => {
                const s = SERVICES[g.serviceCode] || { duration: 60 };
                const dur = g.overrideDuration || s.duration || 60;
                if (dur > maxGuestDuration) maxGuestDuration = dur;
            });

            const guardrailCheck = validateGlobalCapacity(
                requestStartMins,
                maxGuestDuration,
                guestList,
                currentBookingsRaw,
                staffList,
                dateStr,
                false,
                locationStr
            );

            let guardrailFallbackError = null;
            if (!guardrailCheck.pass) {
                if (guardrailCheck.requiresSmartRepacking) {
                    guardrailFallbackError = { feasible: false, reason: guardrailCheck.reason, debug: guardrailCheck.debug };
                } else {
                    return { feasible: false, reason: guardrailCheck.reason, debug: guardrailCheck.debug };
                }
            }
            const resourceMap = guardrailCheck.resourceMap || { 'BED': [], 'CHAIR': [] };

            // GIAI ĐOẠN A: TIỀN XỬ LÝ
            let sortedRaw = [...currentBookingsRaw].sort((a, b) => {
                return getMinsFromTimeStr(a.startTime) - getMinsFromTimeStr(b.startTime);
            });

            const bookingGroups = {};
            sortedRaw.forEach(b => {
                if (!isActiveBookingStatus(b.status)) return;
                if (!isMathematicallyActive(b, requestStartMins)) return;

                const timeKey = (b.startTime || "").split(' ')[1] || "00:00";
                const contactInfo = b.originalData?.phone || b.originalData?.sdt || b.originalData?.custPhone || b.originalData?.customerName || "Unknown";
                const contactKey = contactInfo.toString().replace(/\D/g, '').slice(-6) || contactInfo.toString().trim();

                const isRunning = isStatusRunning(b.status);
                const groupKey = isRunning ? `RUNNING_${b.rowId}` : `${timeKey}_${contactKey}`;
                if (!bookingGroups[groupKey]) bookingGroups[groupKey] = [];
                bookingGroups[groupKey].push(b);
            });

            let remappedBookings = [];
            Object.values(bookingGroups).forEach(group => {
                group.sort((a, b) => parseInt(a.rowId) - parseInt(b.rowId));
                const groupSize = group.length;
                const halfSize = Math.ceil(groupSize / 2);
                group.forEach((b, idx) => {
                    b._virtualInheritanceIndex = null;
                    b._impliedFlow = null;
                    const isRunning = isStatusRunning(b.status);
                    if (!isRunning) {
                        // [V116.5 FIX / V135 SYNC] Ngăn chặn Bóng Ma Ghi Đè: Tôn trọng vị trí đã gán từ Google Sheets
                        if (!b.allocated_resource) {
                            b._virtualInheritanceIndex = (groupSize >= 2) ? (idx % halfSize) + 1 : idx + 1;
                        } else {
                            b._virtualInheritanceIndex = idx + 1;
                        }
                        if (groupSize >= 2) b._impliedFlow = (idx < halfSize) ? 'BF' : 'FB';
                        else b._impliedFlow = null;
                    }
                    remappedBookings.push(b);
                });
            });

            // GIAI ĐOẠN B: XỬ LÝ CHI TIẾT BOOKING (MULTI-STAFF UPDATE)
            let existingBookingsProcessed = [];
            remappedBookings.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                if (bStart === -1) return;

                let svcInfo = SERVICES[b.serviceCode] || {};
                let storedFlow = b.originalData?.flowCode || b.flow || null;
                let isCombo = isComboService(b.serviceCode || getServiceCodeByName(b.serviceName));

                let duration = b.duration || 60;
                let anchorIndex = null;
                const isRunning = isStatusRunning(b.status);

                const ownerName = b.originalData?.customerName || b.originalData?.hoTen || b.rowId || "Guest";

                // [V136.1 FIX] Accurate Resource ID Extraction - Removes rowId from matching to avoid false positives on Bed 1
                const resFields = [b.phase1_res_idx, b.phase2_res_idx, b.allocated_resource, b.current_resource_id];
                let extractedMatches = [];
                resFields.forEach(rawId => {
                    if (!rawId) return;
                    let id = String(rawId).toUpperCase().trim();
                    if (!id) return;
                    
                    let isOpp = id.includes('OPP') || id.includes('對') || id.includes('2-') || (bLoc === '對面館');
                    let isChair = id.includes('CHAIR') || id.includes('腳') || id.includes('足') || id.includes('FOOT');
                    let isBed = id.includes('BED') || id.includes('床') || id.includes('本') || id.includes('BODY') || id.includes('身');
                    
                    if (!isChair && !isBed) {
                        if (id.includes('本') || id.includes('對') || bLoc === '對面館') isBed = true; 
                        else isChair = true; 
                    }
                    
                    let match = id.match(/\d+/g);
                    let num = match && match.length > 0 ? match[match.length - 1] : '';
                    if (!num) return;
                    
                    let building = isOpp ? '2' : '1';
                    let type = isChair ? 'CHAIR' : 'BED';
                    extractedMatches.push(`${type}-${building}-${num}`);
                });
                let uniqueMatches = [...new Set(extractedMatches)];
                
                if (!anchorIndex && b._virtualInheritanceIndex && !isRunning) {
                    anchorIndex = b._virtualInheritanceIndex;
                }

                // Dùng hàm Helper tính chính xác toàn bộ p1, p2 và tổng thời lượng thực.
                const { p1, p2, realDuration } = calculateRealDurations(b, duration, isCombo);

                let isElastic = isCombo && (b.isManualLocked !== true && b.isManualLocked !== 'TRUE' && b.isManualLocked !== 1) && (!isRunning);
                const isLockedRaw = b.originalData?.isManualLocked || b.isManualLocked;
                const isLocked = (isLockedRaw === true || isLockedRaw === 'TRUE' || isLockedRaw === 1);
                let processedB = {
                    id: ownerName,
                    originalData: b,
                    staffName: b.staffName,
                    assignedStaffs: b.assignedStaffs || [], // GẮN MẢNG MULTI-STAFF
                    serviceName: b.serviceName,
                    category: svcInfo.category,
                    isElastic: isElastic,
                    isLocked: isLocked,
                    isRunning: isRunning,
                    elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
                    startMins: bStart, duration: realDuration, blocks: [], anchorIndex: anchorIndex
                };

                if (isCombo) {
                    let p1End = bStart + p1;
                    let p2Start = p1End; // Combo switch buffer = 0

                    if (b.transition_time) {
                        // Resolve missing getSafeTime dependency by doing time parsing inline if needed
                        let ttMins = -1;
                        if (typeof ResourceCore !== 'undefined' && ResourceCore.getMinsFromTimeStr) {
                            ttMins = ResourceCore.getMinsFromTimeStr(b.transition_time);
                        } else {
                            const match = b.transition_time.match(/(\d{1,2}):(\d{2})/);
                            if (match) {
                                ttMins = parseInt(match[1]) * 60 + parseInt(match[2]);
                                if (ttMins < 360) ttMins += 1440; // past midnight logic
                            }
                        }

                        if (ttMins !== -1 && ttMins >= bStart) {
                            p1End = ttMins;
                            p2Start = ttMins;
                            processedB.p1_current = ttMins - bStart;
                        }
                    }

                    const p2End = p2Start + p2;

                    let isBodyFirst = false;
                    const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();

                    if ((isRunning || b.phase1_res_idx || b.allocated_resource) && (b.phase1_res_idx || b.allocated_resource)) {
                        const resToCheck = b.phase1_res_idx || b.allocated_resource;
                        if (resToCheck.includes('BED') || resToCheck.includes('BODY') || resToCheck.includes('床')) isBodyFirst = true;
                        else if (resToCheck.includes('CHAIR') || resToCheck.includes('FOOT') || resToCheck.includes('足') || resToCheck.includes('腳')) isBodyFirst = false;
                        else {
                            if (storedFlow === 'BF') isBodyFirst = true;
                            else if (storedFlow === 'FB') isBodyFirst = false;
                            else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                            else if (b._impliedFlow === 'BF') isBodyFirst = true;
                        }
                    } else {
                        if (storedFlow === 'BF') isBodyFirst = true;
                        else if (storedFlow === 'FB') isBodyFirst = false;
                        else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                        else if (b._impliedFlow === 'BF') isBodyFirst = true;
                    }

                    // --- V135 FIX: Phân tách toạ độ thông minh từ uniqueMatches ---
                    let p1Index = null;
                    let p2Index = null;

                    if (uniqueMatches.length >= 2) {
                        let res1, res2;
                        if (isBodyFirst) {
                            res1 = uniqueMatches.find(r => r.includes('BED') || r.includes('床')) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('足')) || uniqueMatches[1];
                        } else {
                            res1 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('足')) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('BED') || r.includes('床')) || uniqueMatches[1];
                        }
                        if (res1) { const m = res1.match(/(\d+)$/); if (m) p1Index = parseInt(m[1], 10); }
                        if (res2) { const m = res2.match(/(\d+)$/); if (m) p2Index = parseInt(m[1], 10); }
                    } else if (uniqueMatches.length === 1) {
                        const mType = (uniqueMatches[0].toUpperCase().includes('BED') || uniqueMatches[0].includes('床')) ? 'BED' : 'CHAIR';
                        const m = uniqueMatches[0].match(/(\d+)$/);
                        if (m) {
                            const parsedIdx = parseInt(m[1], 10);
                            if (isBodyFirst) {
                                if (mType === 'BED') p1Index = parsedIdx;
                                else p2Index = parsedIdx;
                            } else {
                                if (mType === 'CHAIR') p1Index = parsedIdx;
                                else p2Index = parsedIdx;
                            }
                        }
                    }

                    if (!p1Index) p1Index = anchorIndex;

                    const comboGuestsCount = guestList.filter(g => {
                        const svc = typeof getServiceInfo === 'function' ? getServiceInfo(g.serviceCode, g.serviceName || g.service) : (SERVICES[g.serviceCode] || { duration: 60 });
                        return isComboService(g.serviceCode || getServiceCodeByName(g.serviceName || g.service));
                    }).length;

                    if (isBodyFirst) {
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: p1Index });
                        processedB.blocks.push({ start: p2Start, end: p2End + CONF.CLEANUP_BUFFER, type: 'CHAIR', forcedIndex: p2Index });
                        processedB.flow = 'BF';
                    } else {
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: p1Index });
                        processedB.blocks.push({ start: p2Start, end: p2End + CONF.CLEANUP_BUFFER, type: 'BED', forcedIndex: p2Index });
                        processedB.flow = 'FB';
                    }
                    processedB.p1_current = p1; processedB.p2_current = p2;
                } else {
                    if (storedFlow === 'FOOTSINGLE' || storedFlow === 'BODYSINGLE') processedB.flow = storedFlow;
                    else processedB.flow = 'SINGLE';
                    let rType = inferResourceAtTime(b, bStart);
                    if (!rType) rType = detectResourceType(booking.serviceCode || getServiceCodeByName(booking.serviceName || svcInfo.name));
                    
                    let forcedIdx = anchorIndex;
                    if (uniqueMatches.length > 0) {
                        const m = uniqueMatches[0].match(/(\d+)$/);
                        if (m) forcedIdx = parseInt(m[1], 10);
                    }
                    
                    processedB.blocks.push({ start: bStart, end: bStart + realDuration + CONF.CLEANUP_BUFFER, type: rType, forcedIndex: forcedIdx });
                }
                const bLoc = b.originalData?.location || b.location || '本館';
                const isResourceStr = /(BED|CHAIR|床|足|腳)[-_ ]?\d+/i.test(bLoc);
                if (bLoc === locationStr || isResourceStr) {
                    existingBookingsProcessed.push(processedB);
                }
            });

            // GIAI ĐOẠN C: KỊCH BẢN KHÁCH MỚI
            const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
            const comboGuests = newGuests.filter(g => {
                const s = SERVICES[g.serviceCode];
                return isComboService(g.serviceCode || getServiceCodeByName(g.serviceName || g.service));
            });
            const newGuestHalfSize = Math.ceil(comboGuests.length / 2);
            const maxBF = comboGuests.length;
            let trySequence = [];

            if (maxBF === 2) { trySequence = [0, 2, 1]; }
            else if (maxBF > 0) {
                let mid = maxBF / 2;
                trySequence.push(Math.ceil(mid));
                if (Math.floor(mid) !== Math.ceil(mid)) trySequence.push(Math.floor(mid));
                let step = 1;
                while (true) {
                    let nextUp = Math.ceil(mid) + step; let nextDown = Math.floor(mid) - step;
                    if (nextUp > maxBF && nextDown < 0) break;
                    if (nextUp <= maxBF) trySequence.push(nextUp);
                    if (nextDown >= 0) trySequence.push(nextDown);
                    step++;
                }
            } else { trySequence.push(0); }

            // GIAI ĐOẠN D: VÒNG LẶP MATRIX
            let successfulScenario = null;
            let failureLog = [];
            let globalBestOutOfBoundSqueeze = null;

            const globalSqueezeStartTime = Date.now();
            let globalSqueezeAttempts = 0;
            let globalSqueezeAbort = false;
            const GLOBAL_MAX_TIME_MS = 2500;

            for (let numBF of trySequence) {
                if (globalSqueezeAbort || Date.now() - globalSqueezeStartTime > GLOBAL_MAX_TIME_MS) {
                    failureLog.push("❌ 老師不夠");
                    break;
                }
                let matrix = new VirtualMatrix(locationStr);
                let scenarioDetails = [];
                let scenarioUpdates = [];
                let scenarioFailed = false;
                let scenarioBestOutOfBoundSqueeze = null;

                // --- V118.4 FIX -> NÂNG CẤP THÔNG MINH (Smart Repacking 3-Pass) ---
                // Pass 1: Các lịch Cũ BẮT BUỘC KHÓA (isStrictlyForced = true)
                let softsToSqueezeCandidates = [];
                for (const exB of existingBookingsProcessed) {
                    const exBLoc = exB.originalData?.location || exB.location || '本館';
                    if (exBLoc !== locationStr) continue;

                    const isStrictlyForced = true; // exB.isRunning || exB.isLocked; // [V136.2 FIX] Disable repacking
                    if (!isStrictlyForced) continue;

                    let placedSuccessfully = true;
                    let allocatedSlots = [];
                    for (const block of exB.blocks) {
                        const realEnd = block.end;
                        const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id, block.forcedIndex, true);
                        if (!slotId) { placedSuccessfully = false; break; }
                        allocatedSlots.push(slotId);
                    }
                    if (exB.isElastic && placedSuccessfully) {
                        exB.allocatedSlots = allocatedSlots;
                        softsToSqueezeCandidates.push(exB);
                    }
                }

                let newGuestBlocksMap = [];
                for (const ng of newGuests) {
                    // [V136 FIX] Sử dụng getServiceInfo để hỗ trợ việc truyền tên dịch vụ (serviceName)
                    const svc = typeof getServiceInfo === 'function' ? getServiceInfo(ng.serviceCode, ng.serviceName || ng.service) : (SERVICES[ng.serviceCode] || { name: ng.serviceCode || 'Unknown', duration: 60, price: 0 });
                    let flow = 'FB';
                    let isThisGuestCombo = isComboService(ng.serviceCode || getServiceCodeByName(ng.serviceName || ng.service));
                    if (isThisGuestCombo) {
                        const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                        if (cIdx >= 0 && cIdx < numBF) { flow = 'BF'; }
                    } else { flow = ng.flowCode || 'SINGLE'; }
                    const duration = ng.overrideDuration || svc.duration || 60;
                    let blocks = [];
                    if (isThisGuestCombo) {
                        const p1Standard = Math.floor(duration / 2);
                        const p2Standard = duration - p1Standard;
                        if (flow === 'FB') {
                            const t1End = requestStartMins + p1Standard;
                            const t2Start = t1End; // Buffer = 0
                            blocks.push({ start: requestStartMins, end: t1End, type: 'CHAIR' });
                            blocks.push({ start: t2Start, end: t2Start + p2Standard + CONF.CLEANUP_BUFFER, type: 'BED' });
                            scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'FB', timeStr: timeStr, allocated: [] });
                        } else {
                            const t1End = requestStartMins + p2Standard;
                            const t2Start = t1End; // Buffer = 0
                            blocks.push({ start: requestStartMins, end: t1End, type: 'BED' });
                            blocks.push({ start: t2Start, end: t2Start + p1Standard + CONF.CLEANUP_BUFFER, type: 'CHAIR' });
                            scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'BF', timeStr: timeStr, allocated: [] });
                        }
                    } else {
                        let rType = 'CHAIR';
                        if (flow === 'FOOTSINGLE') rType = 'CHAIR';
                        else if (flow === 'BODYSINGLE') rType = 'BED';
                        else rType = detectResourceType(ng.serviceCode || getServiceCodeByName(svc.name || ng.serviceName || ng.service));
                        blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONF.CLEANUP_BUFFER, type: rType });
                        scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, flow: flow, timeStr: timeStr, allocated: [] });
                    }
                    newGuestBlocksMap.push({ guest: ng, blocks: blocks, isCombo: isThisGuestCombo, duration: duration, flow: flow });
                }

                let conflictFound = false;
                for (const item of newGuestBlocksMap) {
                    let guestAllocations = [];
                    const useSuggestedLanes = false;
                    let preferredIdx = null;

                    if (!useSuggestedLanes && newGuestHalfSize > 0 && newGuests.length >= 2) {
                        preferredIdx = (item.guest.idx % newGuestHalfSize) + 1;
                        if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdx = item.guest.idx + 1;
                    }

                    for (const block of item.blocks) {
                        let specificPrefIdx = preferredIdx;
                        let isPrefForced = false;

                        const slotId = matrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, specificPrefIdx, isPrefForced);
                        if (!slotId) { conflictFound = true; break; }
                        guestAllocations.push(slotId);
                    }
                if (conflictFound) break;
                    const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
                    if (detail) detail.allocated = guestAllocations;
                }

                // --- Pass 3: Các lịch Cũ KHÔNG BẮT BUỘC (isStrictlyForced = false) ---
                if (!conflictFound) {
                    for (const exB of existingBookingsProcessed) {
                        const exBLoc = exB.originalData?.location || exB.location || '本館';
                        if (exBLoc !== locationStr) continue;
                        
                        const isStrictlyForced = true; // exB.isRunning || exB.isLocked; // [V136.2 FIX] Disable repacking
                        if (isStrictlyForced) continue;

                        let placedSuccessfully = true; let allocatedSlots = [];
                        let coordChanged = false;
                        for (const block of exB.blocks) {
                            const realEnd = block.end;
                            const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id, block.forcedIndex, false);
                            if (!slotId) { placedSuccessfully = false; break; }
                            
                            const bPrefix = (exBLoc === '對面館') ? '2' : '1';
                            const originalRes = block.type + '-' + bPrefix + '-' + (block.forcedIndex || 'X');
                            if (block.forcedIndex && slotId !== originalRes) coordChanged = true;
                            allocatedSlots.push(slotId);
                        }

                        if (!placedSuccessfully) {
                            conflictFound = true; break;
                        }

                        if (coordChanged) {
                            scenarioUpdates.push({
                                rowId: exB.id,
                                customerName: exB.originalData ? exB.originalData.customerName : 'Unknown',
                                newPhase1Res: allocatedSlots[0],
                                newPhase2Res: allocatedSlots[1] || null,
                                reason: '💡 智能空間優化'
                            });
                        }
                        if (exB.isElastic && placedSuccessfully) {
                            exB.allocatedSlots = allocatedSlots;
                            softsToSqueezeCandidates.push(exB);
                        }
                    }
                }

                if (conflictFound) {
                    let matrixSqueeze = new VirtualMatrix(locationStr);
                    let updatesProposed = [];
                    const hardBookings = existingBookingsProcessed;
                    hardBookings.forEach(hb => {
                        const isRunning = isStatusRunning(hb.originalData?.status);
                        hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end, hb.id, blk.forcedIndex, isRunning));
                    });
                    let squeezeScenarioPossible = false;
                    const placeNewGuestsElastically = (guestIndex, currentMatrix, currentDetails, currentUpdates) => {
                        if (globalSqueezeAbort) return false;
                        globalSqueezeAttempts++;
                        if (globalSqueezeAttempts % 100 === 0) {
                            if (Date.now() - globalSqueezeStartTime > GLOBAL_MAX_TIME_MS) {
                                globalSqueezeAbort = true;
                                return false; // Prevent hanging
                            }
                        }
                        if (guestIndex >= newGuestBlocksMap.length) return true;
                        
                        const item = newGuestBlocksMap[guestIndex];
                        const useSuggestedLanes = false;
                        let preferredIdxSqueeze = null;
                        if (!useSuggestedLanes && newGuestHalfSize > 0 && newGuests.length >= 2) {
                            preferredIdxSqueeze = (item.guest.idx % newGuestHalfSize) + 1;
                            if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdxSqueeze = item.guest.idx + 1;
                        }

                        let splitsToTry = [];
                        if (item.isCombo) {
                            const svcDef = SERVICES[item.guest.serviceCode];
                            const eStep = svcDef ? (svcDef.elasticStep || 5) : 5;
                            const flowsToTest = [item.flow];
                            for (const testFlow of flowsToTest) {
                                const splits = generateElasticSplits(item.duration, eStep, 0, null, svcDef ? svcDef.minFoot : null, svcDef ? svcDef.maxFoot : null, svcDef ? svcDef.minBody : null, svcDef ? svcDef.maxBody : null, testFlow, true);
                                for (const sp of splits) {
                                    splitsToTry.push({ ...sp, flow: testFlow });
                                }
                            }
                        } else {
                            splitsToTry = [{ p1: item.duration, p2: 0, deviation: 0, flow: item.flow }];
                        }

                        for (const split of splitsToTry) {
                            let testBlocks = [];
                            if (item.isCombo) {
                                if (split.flow === 'FB') {
                                    const tStart = requestStartMins + (split.shiftMins || 0);
                                    const t1End = tStart + split.p1;
                                    const t2Start = t1End; // Buffer = 0
                                    testBlocks.push({ start: tStart, end: t1End, type: 'CHAIR' });
                                    testBlocks.push({ start: t2Start, end: t2Start + split.p2 + CONF.CLEANUP_BUFFER, type: 'BED' });
                                } else {
                                    const tStart = requestStartMins + (split.shiftMins || 0);
                                    const t1End = tStart + split.p1;
                                    const t2Start = t1End; // Buffer = 0
                                    testBlocks.push({ start: tStart, end: t1End, type: 'BED' });
                                    testBlocks.push({ start: t2Start, end: t2Start + split.p2 + CONF.CLEANUP_BUFFER, type: 'CHAIR' });
                                }
                            } else {
                                testBlocks = item.blocks;
                            }

                            let fit = true;
                            let clonedMatrix = new VirtualMatrix(locationStr);
                            clonedMatrix.lanes = JSON.parse(JSON.stringify(currentMatrix.lanes));
                            clonedMatrix.blockLog = [...currentMatrix.blockLog];
                            
                            let currentAllocations = [];
                            for (const block of testBlocks) {
                                const slotId = clonedMatrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, preferredIdxSqueeze, false);
                                if (!slotId) { fit = false; break; }
                                currentAllocations.push(slotId);
                            }

                            if (fit) {
                                if (split.shiftMins !== 0) {
                                    if (!scenarioBestOutOfBoundSqueeze) {
                                        scenarioBestOutOfBoundSqueeze = { guestIdx: item.guest.idx, shiftMins: split.shiftMins, p1: split.p1, p2: split.p2, flow: split.flow };
                                    }
                                }
                                const detail = currentDetails.find(d => d.guestIndex === item.guest.idx);
                                let oldP1, oldP2, oldAllocated;
                                if (detail) {
                                    oldAllocated = detail.allocated;
                                    detail.allocated = currentAllocations;
                                    if (item.isCombo) {
                                        oldP1 = detail.phase1_duration; oldP2 = detail.phase2_duration;
                                        detail.phase1_duration = split.p1;
                                        detail.phase2_duration = split.p2;
                                    }
                                }
                                
                                let nextUpdates = [...currentUpdates];
                                if (item.isCombo && split.deviation !== 0) {
                                    nextUpdates.push({ rowId: 'NEW', customerName: '新客', newPhase1: split.p1, newPhase2: split.p2, reason: '⚠️ 系統已自動啟動彈性時間安排以符合空位' });
                                }

                                if (placeNewGuestsElastically(guestIndex + 1, clonedMatrix, currentDetails, nextUpdates)) {
                                    Object.assign(currentMatrix.lanes, clonedMatrix.lanes);
                                    currentMatrix.blockLog = clonedMatrix.blockLog;
                                    updatesProposed.push(...nextUpdates);
                                    return true;
                                }
                                
                                if (globalSqueezeAbort) return false;
                                
                                if (detail) {
                                    detail.allocated = oldAllocated;
                                    if (item.isCombo) {
                                        detail.phase1_duration = oldP1;
                                        detail.phase2_duration = oldP2;
                                    }
                                }
                            }
                        }
                        return false;
                    };
                    
                    squeezeScenarioPossible = placeNewGuestsElastically(0, matrixSqueeze, scenarioDetails, []);
                    if (!squeezeScenarioPossible) {
                        if (matrixSqueeze.blockLog.length > 0) failureLog = matrixSqueeze.blockLog;
                        if (scenarioBestOutOfBoundSqueeze && !globalBestOutOfBoundSqueeze) {
                            globalBestOutOfBoundSqueeze = scenarioBestOutOfBoundSqueeze;
                        }
                        scenarioFailed = true; continue;
                    }
                    const softBookings = softsToSqueezeCandidates; // [V119 REVERT] User requested elastic changes for existing bookings again
                    for (const sb of softBookings) {
                        const splits = generateElasticSplits(sb.duration, sb.elasticStep, sb.elasticLimit, null, sb.minFoot, sb.maxFoot, sb.minBody, sb.maxBody, sb.flow);
                        let fit = false;
                        for (const split of splits) {
                            const sP1End = sb.startMins + split.p1;
                            const sP2Start = sP1End; // Combo switch buffer = 0
                            const sP2End = sP2Start + split.p2;
                            const testBlocks = [
                                { type: sb.blocks[0].type, start: sb.startMins, end: sP1End + CONF.CLEANUP_BUFFER, forcedIndex: sb.blocks[0].forcedIndex },
                                { type: sb.blocks[1].type, start: sP2Start, end: sP2End + CONF.CLEANUP_BUFFER, forcedIndex: sb.blocks[1] ? sb.blocks[1].forcedIndex : null }
                            ];
                            if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                                testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id, tb.forcedIndex));
                                fit = true;
                                if (split.deviation !== 0) updatesProposed.push({ rowId: sb.originalData.rowId, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: '💡 系統自動調整了組合項目的時間比例以創造更多可用空間。' });
                                break;
                            }
                        }
                        if (!fit) { squeezeScenarioPossible = false; break; }
                    }
                    if (squeezeScenarioPossible) {
                        scenarioUpdates = updatesProposed;
                        matrix = matrixSqueeze;
                    } else {
                        if (matrixSqueeze.blockLog.length > 0) failureLog = matrixSqueeze.blockLog;
                        scenarioFailed = true; continue;
                    }
                }

                // MULTI-STAFF FIX TẠI TIMELINE
                let flatTimeline = [];
                Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
                    const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
                    if (ex) flatTimeline.push({
                        start: occ.start,
                        end: occ.end,
                        staffName: ex.staffName,
                        assignedStaffs: ex.assignedStaffs || [ex.staffName], // GHI NHẬN MẢNG MULTI-STAFF
                        resourceType: lane.id
                    });
                })));

                let staffAssignmentSuccess = true;

                // --- SMART NEEDS SORTING (V116.7 - ANTI-GREEDY ALLOCATION) ---
                // Ưu tiên gán thợ theo mức độ khắt khe: Thợ Chỉ Định -> Nam/Nữ -> Random
                const sortedGuestsForAllocation = [...newGuestBlocksMap].sort((a, b) => {
                    const reqA = a.guest.staffName;
                    const reqB = b.guest.staffName;
                    const isStrictA = reqA && !['RANDOM', 'MALE', 'FEMALE', '隨機', 'Any', 'undefined', '男', '女', '男師', '女師'].includes(reqA);
                    const isStrictB = reqB && !['RANDOM', 'MALE', 'FEMALE', '隨機', 'Any', 'undefined', '男', '女', '男師', '女師'].includes(reqB);

                    if (isStrictA && !isStrictB) return -1;
                    if (!isStrictA && isStrictB) return 1;

                    // Nếu cùng ưu tiên (ví dụ cùng Nam/Nữ), duy trì thứ tự gốc
                    return a.guest.idx - b.guest.idx;
                });

                for (const item of sortedGuestsForAllocation) {
                    let outReason = {};
                    const assignedStaff = findAvailableStaff(item.guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length - 1].end, staffList, flatTimeline, dateStr, outReason);
                    if (!assignedStaff) {
                        staffAssignmentSuccess = false;
                        let staffReq = item.guest.staffName;
                        let errorMsg = '老師不夠';
                        if (staffReq) {
                            if (['MALE', '男', '男師'].includes(staffReq)) {
                                errorMsg = '男老師不夠';
                            } else if (['FEMALE', '女', '女師'].includes(staffReq)) {
                                errorMsg = '女老師不夠';
                            } else if (!['RANDOM', '隨機', 'Any', 'undefined', '不指定'].includes(staffReq)) {
                                if (outReason.reason === 'OFF') {
                                    errorMsg = `[${staffReq}]老師沒有上班`;
                                } else if (outReason.reason === 'BUSY') {
                                    errorMsg = `${staffReq}老師 ${outReason.time}已經有客人`; 
                                } else if (outReason.reason === 'BEFORE_SHIFT') {
                                    errorMsg = `[${staffReq}]老師${outReason.time}還沒來上班`;
                                } else if (outReason.reason === 'OUT_OF_SHIFT') {
                                    errorMsg = `[${staffReq}]老師已經下班了`;
                                } else {
                                    errorMsg = `[${staffReq}]老師沒有上班`; 
                                }
                            }
                        }
                        failureLog.push(`❌ ${errorMsg}`);
                        break;
                    }
                    const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
                    if (detail) detail.staff = assignedStaff;
                    // Khi khách mới được phân thợ, cũng gán vào mảng assignedStaffs để check cho khách tiếp theo
                    item.blocks.forEach(b => flatTimeline.push({
                        start: b.start,
                        end: b.end,
                        staffName: assignedStaff,
                        assignedStaffs: [assignedStaff]
                    }));
                }

                if (!staffAssignmentSuccess) { scenarioFailed = true; continue; }

                // (V135) Removed DOUBLE-CHECK GUARDRAIL as it breaks Elastic Squeeze.
                // -------------------------------------------------------------

                successfulScenario = { details: scenarioDetails, updates: scenarioUpdates, matrixDump: matrix.lanes };
                break;
            }

            if (successfulScenario) {
                successfulScenario.details.sort((a, b) => a.guestIndex - b.guestIndex);
                return {
                    feasible: true, strategy: 'MATRIX_V116.2_MULTI_STAFF',
                    details: successfulScenario.details,
                    proposedUpdates: successfulScenario.updates,
                    totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price || 0), 0),
                    debug: guardrailCheck.debug
                };
            } else {
                if (guardrailFallbackError) {
                    return guardrailFallbackError;
                }
                if (globalBestOutOfBoundSqueeze) {
                    let suggestedTime = requestStartMins + globalBestOutOfBoundSqueeze.shiftMins;
                    let timeStr = getTimeStrFromMins(suggestedTime);
                    let actionText = globalBestOutOfBoundSqueeze.shiftMins > 0 ? '稍晚' : '提早';
                    let shiftVal = Math.abs(globalBestOutOfBoundSqueeze.shiftMins);
                    let reqTimeStr = getTimeStrFromMins(requestStartMins);
                    let msg = `⚠️ 系統計算出您的套餐分配為 (${globalBestOutOfBoundSqueeze.flow === 'BF' ? '身' : '腳'}:${globalBestOutOfBoundSqueeze.p1} ; ${globalBestOutOfBoundSqueeze.flow === 'BF' ? '腳' : '身'}:${globalBestOutOfBoundSqueeze.p2})，已超出標準限制。建議您${actionText} ${shiftVal} 分鐘，改為 ${timeStr} 預約以滿足標準。`;
                    return triggerSmartFailure(msg, suggestedTime);
                }
                const uniqueLog = [...new Set(failureLog)];
                const debugReason = uniqueLog.length > 0 ? uniqueLog.slice(-1).join('') : "❌ 老師不夠";
                const failMessage = debugReason;
                return { feasible: false, reason: failMessage, debug: guardrailCheck ? guardrailCheck.debug : {} };
            }
        }

        return { checkRequestAvailability, setDynamicServices, getTimeStrFromMins, generateElasticSplits };
    })();

    

let staffMap = {
    '王': { id: 'T2', name: '王', gender: 'M', start: '08:00', end: '20:00', off: false, offDays: [] }
};
let coreGuests = [{
    staff: '王', staffName: '王', serviceCode: 'A+B', service: '90分 腳底+全身', overrideDuration: 90, isYouTui: true
}];

let checkRes = CoreKernel.checkRequestAvailability('2026-08-20', '08:00', coreGuests, [], staffMap, { location: '本館' });
console.log(JSON.stringify(checkRes, null, 2));

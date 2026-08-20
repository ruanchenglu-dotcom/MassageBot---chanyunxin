/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - FRONTEND CONTROLLER & LOGIC BRIDGE
 * FILE: js/bookingHandler.js
 * PHI?N B廕﹫: V116.2 (STATUS SSOT, REAL_DURATION, ID NORMALIZATION & MULTI-STAFF COLLISION FIX)
 * =================================================================================================
 */

(function () {
    console.log("?? BookingHandler V116.2: Multi-Staff Array Supported (Columns L,M,N) for Collision Checks.");

    // Ki廙 tra m繫i tr廙g React
    if (typeof React === 'undefined') {
        console.error("??CRITICAL ERROR: React not found. Cannot start BookingHandler.");
        return;
    }

    // --- DANH S?CH H廙?T廙?SHEET 'NAME' (HARDCODED FOR SPEED) ---
    const PREDEFINED_SURNAMES = [
        "??, "??, "??, "暺?, "??, "??, "??, "撘?, "閮?, "雓?, "蝪?, "??, "擃?, "??, "??, "??, "??, "??, "銝?,
        "??, "??, "頞?, "??, "瘣?, "敶?, "??, "撱?, "鞈?, "敺?, "皜?, "璆?, "摨?, "蝝", "??, "??, "??, "瘙?, "??,
        "??, "??, "??, "??, "瘙?, "雿?, "雿?, "蝢?, "??, "??, "瞏?, "甇?, "瘥?, "??, "撏?, "??, "??, "畾?, "皞?,
        "??, "摮?, "蝔?, "??, "??, "??, "閰?, "??, "??, "瘝?, "擐?, "??, "??, "??, "??, "擐?, "??, "??, "摰?,
        "蝘?, "憪?, "??, "摰?, "??, "璇?, "憿?, "擳?, "蝧?, "??, "鋡?, "??, "憿?, "摮?, "撟?, "皝?, "撠?, "暺?, "撣?,
        "??, "??, "鞈", "??, "靘?, "樴?, "?賊收", "?砍重", "隢貉?", "甇", "銝?", "?望", "", "", "", "", "", "", ""
    ];

    // ========================================================================
    // PH廕吉 0: UNIVERSAL UTILS & STATUS MANAGEMENT
    // ========================================================================

    const normalizeStaffId = (id) => {
        if (!id) return "";
        const strId = String(id).trim();
        // N廕簑 chu廙 l? s廙?v? c籀 s廙?0 廙??廕吟 (v穩 d廙? "01", "05", "007") -> chuy廙 th?nh "1", "5", "7"
        if (/^0+\d+$/.test(strId)) {
            return parseInt(strId, 10).toString();
        }
        return strId;
    };

    const getBookingStatus = () => {
        if (window.BOOKING_STATUS) return window.BOOKING_STATUS;
        return {
            WAITING: '蝑?銝?,
            SERVING: '??銝?,
            COMPLETED: '撌脣???,
            PAID: '撌脩?撣?,
            CANCELLED: '撌脣?瘨?
        };
    };

    const normalizeDateStrict = (input) => {
        if (!input) return "";
        try {
            let dateObj;
            if (typeof input === 'object' && input instanceof Date) {
                dateObj = input;
            } else if (typeof input === 'string' && input.includes('T')) {
                dateObj = new Date(input);
            } else if (typeof input === 'number' && input > 40000) {
                dateObj = new Date(Math.round((input - 25569) * 86400 * 1000));
            } else {
                const dateString = input.toString().trim().replace(/-/g, '/');
                dateObj = new Date(dateString);
            }

            if (isNaN(dateObj.getTime())) return "";

            const taipeiTimeStr = dateObj.toLocaleString("en-US", { timeZone: "Asia/Taipei" });
            const taipeiDate = new Date(taipeiTimeStr);
            const y = taipeiDate.getFullYear();
            const m = String(taipeiDate.getMonth() + 1).padStart(2, '0');
            const d = String(taipeiDate.getDate()).padStart(2, '0');
            return `${y}/${m}/${d}`;
        } catch (e) { return input; }
    };

    const getServiceCodeByName = (serviceName) => {
        if (!serviceName) return "";
        const rawServices = (window.CoreKernel?.dynamicServices || window.SERVICES_DATA) || {};
        if (rawServices[serviceName]) return serviceName;
        const cleanReq = serviceName.replace(/\s+/g, '').toUpperCase();
        for (const [code, details] of Object.entries(rawServices)) {
            if (details.name && details.name.replace(/\s+/g, '').toUpperCase() === cleanReq) return code;
        }
        for (const [code, details] of Object.entries(rawServices)) {
            if (details.name && typeof details.name === "string") {
                const cleanName = details.name.replace(/\s+/g, '').toUpperCase();
                if (cleanName.includes(cleanReq) || cleanReq.includes(cleanName)) return code;
            }
        }
        if (/^[ABFC]\d/.test(serviceName)) return serviceName;
        return "";
    };

    // ========================================================================
    // PH廕吉 1: CORE KERNEL (CLIENT-SIDE BRAIN)
    // ========================================================================
    const CoreKernel = (function () {

        // --- 1. C廕下 H?NH H廙?TH廙G ?廙G (DYNAMIC SYSTEM CONFIG) ---
        const getSystemConfig = (locationStr = '?祇尹') => {
            const ext = window.SYSTEM_CONFIG || {};
            const scale = ext.SCALE || {};
            const opTime = ext.OPERATION_TIME || {};
            return {
                MAX_CHAIRS: locationStr === '撠擗? ? (scale.OPP_CHAIRS || 4) : (scale.MAX_CHAIRS || ext.MAX_CHAIRS),
                MAX_BEDS: locationStr === '撠擗? ? (scale.OPP_BEDS || 6) : (scale.MAX_BEDS || ext.MAX_BEDS),
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
                'OFF_DAY': { name: '??隢? (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
                'BREAK_30': { name: '? ?券? (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
                'SHOP_CLOSE': { name: '??摨? (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
                'LATE': { name: '?? 撱園 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
            };
            SERVICES = { ...newServicesObj, ...systemServices };
        }

        // --- UTILS TH廙 GIAN ---
        function getMinsFromTimeStr(timeStr) {
            if (!timeStr) return -1;
            const CONF = getSystemConfig();
            try {
                let str = timeStr.toString();
                if (str.includes('T') || str.includes(' ')) {
                    const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
                    if (timeMatch) str = timeMatch[0];
                }
                let cleanStr = str.trim().replace(/嚗?g, ':');
                const parts = cleanStr.split(':');
                if (parts.length < 2) return -1;
                let h = parseInt(parts[0], 10);
                let m = parseInt(parts[1], 10);
                if (isNaN(h) || isNaN(m)) return -1;
                // [V118.2] Ph籀ng chi廕簑 gi廙?r廕》g s獺ng cho thu廕負 to獺n v廕眩 ch矇o ng?y (0h-8h)
                // ?廕σ b廕υ c獺c h?m isOverlap ho廕﹀ ?廙g ch穩nh x獺c v廙 ca xuy礙n ?礙m.
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

        // --- B廙?L廙 TR廕G TH?I SSOT ---
        function isActiveBookingStatus(statusRaw) {
            if (!statusRaw) return true; // C廕吉 ?廙＄ COI L? ACTIVE n礙?u status tr繫?ng
            const s = statusRaw.toString().toLowerCase().trim();
            const STATUS = getBookingStatus();

            if (s === STATUS.COMPLETED.toLowerCase() || s === STATUS.CANCELLED.toLowerCase()) return false;

            // Legacy keywords
            const inactiveKeywords = ['cancel', 'h廙囤', 'hu廙?, 'finish', 'done', 'xong', 'check-out', 'checkout', '??', '摰?', '蝛?];
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
            return codeStr.toUpperCase().startsWith('A') || codeStr.includes('憟?');
        }

        function detectResourceType(serviceCode) {
            if (!serviceCode) return 'CHAIR';
            const codeStr = String(serviceCode).trim();
            if (SERVICES && SERVICES[codeStr] && SERVICES[codeStr].type) return SERVICES[codeStr].type;
            const codeUpper = codeStr.toUpperCase();
            if (codeUpper.startsWith('B')) return 'BED';
            if (codeUpper.startsWith('F')) return 'CHAIR';
            if (codeUpper.startsWith('A') || codeUpper.includes('憟?')) return 'BED'; // Combo usually starts on BED
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

        // --- LOGIC PH?N T?CH T?I NGUY?N ---
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
            const isRunningStatus = booking.status && (booking.status.includes('?脰?') || booking.status.includes('SERVING') || booking.status.includes('Check-in') || booking.status === '撌脣??);
            
            if ((isRunningStatus || true) && booking.allocated_resource) {
                if (booking.allocated_resource.includes('BED') || booking.allocated_resource.includes('BODY') || booking.allocated_resource.includes('摨?)) isBodyFirst = true;
                else if (booking.allocated_resource.includes('CHAIR') || booking.allocated_resource.includes('FOOT') || booking.allocated_resource.includes('頞?) || booking.allocated_resource.includes('??)) isBodyFirst = false;
                else {
                    if (storedFlow === 'BF') isBodyFirst = true;
                    else if (storedFlow === 'FB') isBodyFirst = false;
                    else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('??頨恍?')) isBodyFirst = true;
                }
            } else {
                if (storedFlow === 'BF') isBodyFirst = true;
                else if (storedFlow === 'FB') isBodyFirst = false;
                else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('??頨恍?')) isBodyFirst = true;
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
        function validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, isSimulation = false, locationStr = '?祇尹') {
            const CONF = getSystemConfig(locationStr);

            const triggerSmartFailure = (reasonMsg, specificSuggestionMins = null) => {
                if (isSimulation) return { pass: false, reason: reasonMsg };
                
                let debugInfo = { suggestions: [] };
                if (specificSuggestionMins !== null && specificSuggestionMins >= 0 && specificSuggestionMins <= 1800) {
                    const timeStr = getTimeStrFromMins(specificSuggestionMins);
                    debugInfo.suggestions.push({ time: timeStr, date: queryDateStr, daysToAdd: 0 });
                }

                let oppositeLoc = locationStr === '?祇尹' ? '撠擗? : '?祇尹';
                let oppositeSim = validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, true, oppositeLoc);
                let oppositeSuggestion = "";
                if (oppositeSim.pass) {
                    oppositeSuggestion = `\n? 蝟餌絞?內嚗?{oppositeLoc}? ${getTimeStrFromMins(requestStart)} 隞?蝛箔?嚗撱箄降摰Ｖ犖??{oppositeLoc}?;
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
                        suggestionText = `? ?箄撱箄降嚗?{locationStr}??亥??臬??游???????${timeStrBefore} ??${timeStrAfter} 銋??;
                        if (foundMinsBefore !== specificSuggestionMins) debugInfo.suggestions.push({ time: timeStrBefore, date: queryDateStr, daysToAdd: 0 });
                        if (foundMinsAfter !== specificSuggestionMins) debugInfo.suggestions.push({ time: timeStrAfter, date: queryDateStr, daysToAdd: 0 });
                    } else if (foundMinsBefore !== -1) {
                        const timeStrBefore = getTimeStrFromMins(foundMinsBefore);
                        suggestionText = `? ?箄撱箄降嚗?{locationStr}??亥??臬??游???????${timeStrBefore}?;
                        if (foundMinsBefore !== specificSuggestionMins) debugInfo.suggestions.push({ time: timeStrBefore, date: queryDateStr, daysToAdd: 0 });
                    } else {
                        const timeStrAfter = getTimeStrFromMins(foundMinsAfter);
                        suggestionText = `? ?箄撱箄降嚗?{locationStr}?敹怠摰摰? (?急???畾? ??? ${timeStrAfter} 銋??;
                        if (foundMinsAfter !== specificSuggestionMins) debugInfo.suggestions.push({ time: timeStrAfter, date: queryDateStr, daysToAdd: 0 });
                    }
                    return { pass: false, reason: `${reasonMsg}${oppositeSuggestion}\n${suggestionText}`, debug: debugInfo };
                } else {
                    return { pass: false, reason: `${reasonMsg}${oppositeSuggestion}\n?? 隞撌脩頞喳?鞈??臬??游??迨???, debug: debugInfo };
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
                let locStr = b.current_resource_id || b.phase1_res_idx || b.originalData?.location || b.location || '?祇尹';
                const match = String(locStr).match(/(?:BED|CHAIR|摨頞逖?逖OPP)[-_ ]?([12])[-_ ]?\\d+/i);
                if (match) return match[1] === '2' ? '撠擗? : '?祇尹';
                return (b.originalData?.location || b.location || '?祇尹') === '撠擗? ? '撠擗? : '?祇尹';
            };
            const relevantBookings = globalStaffBookings.filter(b => {
                return resolveRealLocation(b) === locationStr;
            });

            relevantBookings.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                const svcInfo = SERVICES[b.serviceCode] || { name: b.serviceName };
                const bLoc = b.originalData?.location || b.location || '?祇尹';
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
                    
                    let isOpp = id.includes('OPP') || id.includes('撠?) || id.includes('2-') || (b.location === '撠擗?);
                    let isChair = id.includes('CHAIR') || id.includes('??) || id.includes('頞?) || id.includes('FOOT');
                    let isBed = id.includes('BED') || id.includes('摨?) || id.includes('??) || id.includes('BODY') || id.includes('頨?);
                    
                    if (!isChair && !isBed) {
                        if (id.includes('??) || id.includes('撠?) || b.location === '撠擗?) isBed = true; 
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

                // [NEW V118.9] Logic Nh廕要 di廙 ?廕暗 ch廙?linh ho廕﹀ (Fluid Booking) & Repacking
                const isLockedRaw = b.originalData?.isManualLocked || b.isManualLocked;
                const isLocked = (isLockedRaw === true || isLockedRaw === 'TRUE' || isLockedRaw === 1);
                let isRunning = false;
                if (b.originalData && b.originalData.status) {
                    const stLower = b.originalData.status.toLowerCase();
                    isRunning = stLower.includes('running') || stLower.includes('??銝?) || stLower.includes('?ang ph廙卉 v廙?);
                }
                if (b.status) {
                    const stLower = b.status.toLowerCase();
                    if (stLower.includes('running') || stLower.includes('??銝?) || stLower.includes('?ang ph廙卉 v廙?)) isRunning = true;
                }
                
                // N廕簑 booking kh繫ng b廙?kh籀a v? cha b廕眩 ?廕吟, h廙?th廙g ?廙θ ph矇p "gi廕?l廕計 d廙 gh廕?
                // [V136.2 FIX] Disabled Fluid Booking Repacking: C廙??廙h to廕??廙?th廙帷 t廕??廙?tr獺nh l廙 x廕穆 ?癡 (Overlap)
                const isFluid = false; 

                // K穩ch ho廕﹀ Repacking: B廙?qua gh廕??瓊 ch廙??廙h, 矇p h廙?th廙g t廙?t穫m gh廕?tr廙g t廙 u nh廕另
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
                        const laneMatch = res.match(/(BED|CHAIR|摨頞逖??[-_ ]?(?:\d+[-_ ])?(\d+)/i);
                        if (laneMatch) {
                            const type = (laneMatch[1].toUpperCase().includes('BED') || laneMatch[1].includes('摨?)) ? 'BED' : 'CHAIR';
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
                    const isRunningStatus = b.status && (b.status.includes('?脰?') || b.status.includes('SERVING') || b.status.includes('Check-in') || b.status === '撌脣??);

                    if ((isRunningStatus || b.phase1_res_idx || b.allocated_resource) && (b.phase1_res_idx || b.allocated_resource)) {
                        const resToCheck = b.phase1_res_idx || b.allocated_resource;
                        if (resToCheck.includes('BED') || resToCheck.includes('BODY') || resToCheck.includes('摨?)) isBodyFirst = true;
                        else if (resToCheck.includes('CHAIR') || resToCheck.includes('FOOT') || resToCheck.includes('頞?) || resToCheck.includes('??)) isBodyFirst = false;
                        else {
                            if (storedFlow === 'BF') isBodyFirst = true;
                            else if (storedFlow === 'FB') isBodyFirst = false;
                            else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('??頨恍?')) isBodyFirst = true;
                            else if (b._impliedFlow === 'BF') isBodyFirst = true;
                        }
                    } else {
                        if (storedFlow === 'BF') isBodyFirst = true;
                        else if (storedFlow === 'FB') isBodyFirst = false;
                        else {
                            if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('??頨恍?')) isBodyFirst = true;
                            else if (b._impliedFlow === 'BF') isBodyFirst = true;
                        }
                    }

                    if (uniqueMatches.length >= 2) {
                        if (isBodyFirst) {
                            res1 = uniqueMatches.find(r => r.includes('BED') || r.includes('摨?)) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('頞?)) || uniqueMatches[1];
                        } else {
                            res1 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('頞?)) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('BED') || r.includes('摨?)) || uniqueMatches[1];
                        }
                    } else if (uniqueMatches.length === 1) {
                        const mType = (uniqueMatches[0].toUpperCase().includes('BED') || uniqueMatches[0].includes('摨?)) ? 'BED' : 'CHAIR';
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

                // [FRONTEND V118] Thu廕負 to獺n Ph璽n ?o廕》 Ca ?礙m
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
            const femaleSupply = availableStaffList.filter(s => s.gender === 'F' || s.gender === '憟?).length;
            const maleSupply = availableStaffList.filter(s => s.gender === 'M' || s.gender === '??).length;

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
                            
                            const isRandom = (sId === '?冽?' || sId === 'ANY' || sId === 'UNDEFINED' || sId === 'NULL' || sId === 'FALSE' || sId === '');
                            const isFemaleReq = (sId === '憟? || sId === '憟喳葦' || sId === 'FEMALE');
                            const isMaleReq = (sId === '?? || sId === '?瑕葦' || sId === 'MALE');
                            
                            allDelta++;
                            
                            if (isFemaleReq) {
                                femaleDelta++;
                            } else if (isMaleReq) {
                                maleDelta++;
                            } else if (!isRandom) {
                                distinctStaffs.add(sId);
                                const sInfo = staffList[staffName] || Object.values(staffList).find(s => normId(s.name) === sId || normId(s.id) === sId) || {};
                                if (sInfo.gender === 'F' || sInfo.gender === '憟? || sInfo.group === '憟?) {
                                    femaleDelta++;
                                    distinctFemaleStaffs.add(sId);
                                } else if (sInfo.gender === 'M' || sInfo.gender === '?? || sInfo.group === '??) {
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
                if (req === 'FEMALE' || req === '憟? || req === '憟喳葦') femaleReqCount++;
                else if (req === 'MALE' || req === '?? || req === '?瑕葦') maleReqCount++;
                else if (req && req !== '?冽?' && req !== 'Any' && req !== 'undefined' && req !== 'null') {
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
                    return { pass: false, reason: `?? ?航炊: 銝???晷 ${count} 雿恥鈭箇策???撣?${req}?, debug: {} };
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
                        return triggerSmartFailure(`?? ?撣?${rawName} 閰脫?畾菜??歇銝?);
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
                        return triggerSmartFailure(`?? ?撣?${rawName} 閰脫?畾萄歇??蝝);
                    }
                }
            }

            // 3. GENDER POOL CHECK
            if (femaleReqCount > 0 && (femaleBusyCount + femaleReqCount) > femaleSupply) {
                return triggerSmartFailure(`?? 憟單?撣思?頞喋戊撣怎蜇?? ${femaleSupply}, 敹?銝? ${femaleBusyCount}, 甈脤?蝝戊撣急: ${femaleReqCount}`);
            }

            if (maleReqCount > 0 && (maleBusyCount + maleReqCount) > maleSupply) {
                return triggerSmartFailure(`?? ?瑟?撣思?頞喋撣怎蜇?? ${maleSupply}, 敹?銝? ${maleBusyCount}, 甈脤?蝝撣急: ${maleReqCount}`);
            }

            // 4. OVERALL POOL CHECK
            if ((staffBusyCount + guestList.length) > supplyCount) {
                return triggerSmartFailure(`?? ?撣怎蜇?訾?頞喋蜇?? ${supplyCount}, 敹?銝? ${staffBusyCount}, ?啣恥: ${guestList.length}`);
            }

            // SIMULATION
            const simulationMap = JSON.parse(JSON.stringify(resourceMap));
            const suggestedLanes = {}; // [NEW V118.6]

            for (let i = 0; i < guestList.length; i++) {
                const g = guestList[i];
                const svc = typeof getServiceInfo === 'function' ? getServiceInfo(g.serviceCode, g.serviceName || g.service) : (SERVICES[g.serviceCode] || { duration: 60 });
                const duration = g.overrideDuration || svc.duration || 60;
                const isCombo = isComboService(g.serviceCode || getServiceCodeByName(g.serviceName || g.service));
                const guestIdKey = g.idx !== undefined ? g.idx : i; // ?廕σ b廕υ ?繳ng index

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
                        if (locationStr === '?祇尹' || locationStr === '撠擗?) {
                            let oppositeLoc = locationStr === '?祇尹' ? '撠擗? : '?祇尹';
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
                                            crossLocationMsg = `\n? 頝券尹撱箄降嚗?{locationStr}????頨怠?雿???{oppositeLoc}??頞喲摨找???血????具?{locationStr}?脰?頨恍??嚗?蝘餅郊?喋?{oppositeLoc}???雲?冽??抬?`;
                                            foundCross = true;
                                            break;
                                        }
                                    } else {
                                        for (let c = 0; c < CONF.MAX_CHAIRS; c++) { if (checkLaneContinuity(simulationMap.CHAIR[c], tStart, tStart + p1)) { loc1Idx = c; break; } }
                                        for (let b = 0; b < oppConfMaxBeds; b++) { if (checkLaneContinuity(oppMap.BED[b], tSwitch, tSwitch + p2 + CONF.CLEANUP_BUFFER)) { loc2Idx = b; break; } }
                                        if (loc1Idx !== -1 && loc2Idx !== -1) {
                                            crossLocationMsg = `\n? 頝券尹撱箄降嚗?{locationStr}????雲?典漣雿???{oppositeLoc}???刻澈摨???血????具?{locationStr}?脰?頞喲?嚗?蝘餅郊?喋?{oppositeLoc}???澈擃??抬?`;
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
                            let actionText = bestOutOfBoundSplit.shiftMins > 0 ? '蝔?' : '?';
                            let shiftVal = Math.abs(bestOutOfBoundSplit.shiftMins);
                            let err = triggerSmartFailure(`?? ??${getTimeStrFromMins(requestStart)} 瘝?摰?蝚血????蝛箔??遣霅唳${actionText} ${shiftVal} ??嚗??${timeStr} ??隞交遛頞喳?擗?皞?{crossLocationMsg}`, suggestedTime);
                            err.requiresSmartRepacking = true;
                            return err;
                        } else {
                            let err = triggerSmartFailure(`?? ??${getTimeStrFromMins(requestStart)} 瘝?頞喳????蝛箔?蝯血?擗?{crossLocationMsg}`);
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
                        let err = triggerSmartFailure(`?? 撌脩?瘝???? ${duration} ???征${rType === 'BED' ? '摨?' : '摨找?'}?);
                        err.requiresSmartRepacking = true;
                        return err;
                    }
                }
            }
            return { pass: true, debug: { msg: "V118.6 Continuous Scan Passed" }, resourceMap: resourceMap, suggestedLanes: suggestedLanes };
        }

        // --- MATRIX ENGINE ---
        class VirtualMatrix {
            constructor(locationStr = '?祇尹') {
                const CONF = getSystemConfig(locationStr);
                const isOpp = locationStr === '撠擗? || CONF._tempLocation === '撠擗?;
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
                    // --- V118.4 BUG FIX: D羅 c籀 tr羅ng l廙h (checkLaneFree = false), n廕簑 l? isForced (?瓊 ?廙θ 廕叩 ?廙h t廙?tr廙),
                    // b廕眩 bu廙 ph廕ξ nh矇t v?o targetLane ?廙?ph廙卉 d廙彫g ch穩nh x獺c l廙h s廙? tr獺nh t廕︽ B籀ng Ma nh廕ㄊ sang gh廕?kh獺c! ---
                    if (isForced || this.checkLaneFree(targetLane, start, end).free) {
                        return this.allocateToLane(targetLane, start, end, ownerId);
                    }
                }
                
                // [V118.9 FIX] ?Ｗ儔??銝銝?皝???Top-Down Packing) ?摩嚗?瘨征雿???誑?踹?閬死蝛粹???
                // Kh繫ng thay ?廙 th廙?t廙?h?ng (CHAIR-1, CHAIR-2...) ?廙?lu繫n c廙??廙h gh廕?gi廙g.
                let sortedLanes = [...resourceGroup];

                for (let lane of sortedLanes) {
                    const check = this.checkLaneFree(lane, start, end);
                    if (check.free) {
                        return this.allocateToLane(lane, start, end, ownerId);
                    } else {
                        const blockerTime = `${getTimeStrFromMins(check.blocker.start)}-${getTimeStrFromMins(check.blocker.end)}`;
                        this.blockLog.push(`??${lane.id} 鋡?${check.blocker.ownerId} (${blockerTime}) ??`);
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

                // [FRONTEND V118] Thu廕負 to獺n Ph璽n ?o廕》 Ca ?礙m
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

                // MULTI-STAFF FIX: Ki廙 tra xem name c籀 n廕彩 trong m廕τg th廙?c廙吧 b廕另 k廙?booking n?o ?ang b廕要 kh繫ng
                for (const b of busyList) {
                    const staffArray = b.assignedStaffs || [b.staffName];
                    if (staffArray.includes(name) && isOverlap(start, end, b.start, b.end)) {
                        outReason.reason = 'BUSY';
                        outReason.time = `${Math.floor(start/60)%24}:${(start%60).toString().padStart(2, '0')}`;
                        return false;
                    }
                }
                if ((staffReq === 'MALE' || staffReq === '?? || staffReq === '?瑕葦') && staffInfo.gender !== 'M') { outReason.reason = 'GENDER_MISMATCH'; return false; }
                if ((staffReq === 'FEMALE' || staffReq === '憟? || staffReq === '憟喳葦') && staffInfo.gender !== 'F') { outReason.reason = 'GENDER_MISMATCH'; return false; }
                return true;
            };
            if (staffReq && !['RANDOM', 'MALE', 'FEMALE', '?冽?', 'Any', 'undefined', '??, '憟?, '?瑕葦', '憟喳葦'].includes(staffReq)) {
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
            const locationStr = options.location || '?祇尹';
            const CONF = getSystemConfig(locationStr);
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "???航炊嚗??撘?? };

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

            // GIAI ?O廕 A: TI廙N X廙?L?
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
                        // [V116.5 FIX / V135 SYNC] Ng?n ch廕搖 B籀ng Ma Ghi ?癡: T繫n tr廙g v廙?tr穩 ?瓊 g獺n t廙?Google Sheets
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

            // GIAI ?O廕 B: X廙?L? CHI TI廕鋁 BOOKING (MULTI-STAFF UPDATE)
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
                    
                    let isOpp = id.includes('OPP') || id.includes('撠?) || id.includes('2-') || (bLoc === '撠擗?);
                    let isChair = id.includes('CHAIR') || id.includes('??) || id.includes('頞?) || id.includes('FOOT');
                    let isBed = id.includes('BED') || id.includes('摨?) || id.includes('??) || id.includes('BODY') || id.includes('頨?);
                    
                    if (!isChair && !isBed) {
                        if (id.includes('??) || id.includes('撠?) || bLoc === '撠擗?) isBed = true; 
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

                // D羅ng h?m Helper t穩nh ch穩nh x獺c to?n b廙?p1, p2 v? t廙g th廙 l廙τg th廙帷.
                const { p1, p2, realDuration } = calculateRealDurations(b, duration, isCombo);

                let isElastic = isCombo && (b.isManualLocked !== true && b.isManualLocked !== 'TRUE' && b.isManualLocked !== 1) && (!isRunning);
                const isLockedRaw = b.originalData?.isManualLocked || b.isManualLocked;
                const isLocked = (isLockedRaw === true || isLockedRaw === 'TRUE' || isLockedRaw === 1);
                let processedB = {
                    id: ownerName,
                    originalData: b,
                    staffName: b.staffName,
                    assignedStaffs: b.assignedStaffs || [], // G廕奘 M廕﹫G MULTI-STAFF
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
                        if (resToCheck.includes('BED') || resToCheck.includes('BODY') || resToCheck.includes('摨?)) isBodyFirst = true;
                        else if (resToCheck.includes('CHAIR') || resToCheck.includes('FOOT') || resToCheck.includes('頞?) || resToCheck.includes('??)) isBodyFirst = false;
                        else {
                            if (storedFlow === 'BF') isBodyFirst = true;
                            else if (storedFlow === 'FB') isBodyFirst = false;
                            else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('??頨恍?')) isBodyFirst = true;
                            else if (b._impliedFlow === 'BF') isBodyFirst = true;
                        }
                    } else {
                        if (storedFlow === 'BF') isBodyFirst = true;
                        else if (storedFlow === 'FB') isBodyFirst = false;
                        else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('??頨恍?')) isBodyFirst = true;
                        else if (b._impliedFlow === 'BF') isBodyFirst = true;
                    }

                    // --- V135 FIX: Ph璽n t獺ch to廕??廙?th繫ng minh t廙?uniqueMatches ---
                    let p1Index = null;
                    let p2Index = null;

                    if (uniqueMatches.length >= 2) {
                        let res1, res2;
                        if (isBodyFirst) {
                            res1 = uniqueMatches.find(r => r.includes('BED') || r.includes('摨?)) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('頞?)) || uniqueMatches[1];
                        } else {
                            res1 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('頞?)) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('BED') || r.includes('摨?)) || uniqueMatches[1];
                        }
                        if (res1) { const m = res1.match(/(\d+)$/); if (m) p1Index = parseInt(m[1], 10); }
                        if (res2) { const m = res2.match(/(\d+)$/); if (m) p2Index = parseInt(m[1], 10); }
                    } else if (uniqueMatches.length === 1) {
                        const mType = (uniqueMatches[0].toUpperCase().includes('BED') || uniqueMatches[0].includes('摨?)) ? 'BED' : 'CHAIR';
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
                const bLoc = b.originalData?.location || b.location || '?祇尹';
                const isResourceStr = /(BED|CHAIR|摨頞逖??[-_ ]?\d+/i.test(bLoc);
                if (bLoc === locationStr || isResourceStr) {
                    existingBookingsProcessed.push(processedB);
                }
            });

            // GIAI ?O廕 C: K廙H B廕﹫ KH?CH M廙
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

            // GIAI ?O廕 D: V?NG L廕賀 MATRIX
            let successfulScenario = null;
            let failureLog = [];
            let globalBestOutOfBoundSqueeze = null;

            const globalSqueezeStartTime = Date.now();
            let globalSqueezeAttempts = 0;
            let globalSqueezeAbort = false;
            const GLOBAL_MAX_TIME_MS = 2500;

            for (let numBF of trySequence) {
                if (globalSqueezeAbort || Date.now() - globalSqueezeStartTime > GLOBAL_MAX_TIME_MS) {
                    failureLog.push("???葦銝?");
                    break;
                }
                let matrix = new VirtualMatrix(locationStr);
                let scenarioDetails = [];
                let scenarioUpdates = [];
                let scenarioFailed = false;
                let scenarioBestOutOfBoundSqueeze = null;

                // --- V118.4 FIX -> N?NG C廕匕 TH?NG MINH (Smart Repacking 3-Pass) ---
                // Pass 1: C獺c l廙h C觼 B廕娛 BU廙 KH?A (isStrictlyForced = true)
                let softsToSqueezeCandidates = [];
                for (const exB of existingBookingsProcessed) {
                    const exBLoc = exB.originalData?.location || exB.location || '?祇尹';
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
                    // [V136 FIX] S廙?d廙叩g getServiceInfo ?廙?h廙?tr廙?vi廙 truy廙 t礙n d廙h v廙?(serviceName)
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

                // --- Pass 3: C獺c l廙h C觼 KH?NG B廕娛 BU廙 (isStrictlyForced = false) ---
                if (!conflictFound) {
                    for (const exB of existingBookingsProcessed) {
                        const exBLoc = exB.originalData?.location || exB.location || '?祇尹';
                        if (exBLoc !== locationStr) continue;
                        
                        const isStrictlyForced = true; // exB.isRunning || exB.isLocked; // [V136.2 FIX] Disable repacking
                        if (isStrictlyForced) continue;

                        let placedSuccessfully = true; let allocatedSlots = [];
                        let coordChanged = false;
                        for (const block of exB.blocks) {
                            const realEnd = block.end;
                            const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id, block.forcedIndex, false);
                            if (!slotId) { placedSuccessfully = false; break; }
                            
                            const bPrefix = (exBLoc === '撠擗?) ? '2' : '1';
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
                                reason: '? ?箄蝛粹??芸?'
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
                                    nextUpdates.push({ rowId: 'NEW', customerName: '?啣恥', newPhase1: split.p1, newPhase2: split.p2, reason: '?? 蝟餌絞撌脰?????扳????誑蝚血?蝛箔?' });
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
                                if (split.deviation !== 0) updatesProposed.push({ rowId: sb.originalData.rowId, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: '? 蝟餌絞?芸?隤踵鈭????桃???瘥?隞亙?憭?函征?? });
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

                // MULTI-STAFF FIX T廕 TIMELINE
                let flatTimeline = [];
                Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
                    const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
                    if (ex) flatTimeline.push({
                        start: occ.start,
                        end: occ.end,
                        staffName: ex.staffName,
                        assignedStaffs: ex.assignedStaffs || [ex.staffName], // GHI NH廕昧 M廕﹫G MULTI-STAFF
                        resourceType: lane.id
                    });
                })));

                let staffAssignmentSuccess = true;

                // --- SMART NEEDS SORTING (V116.7 - ANTI-GREEDY ALLOCATION) ---
                // u ti礙n g獺n th廙?theo m廙妾 ?廙?kh廕眩 khe: Th廙?Ch廙??廙h -> Nam/N廙?-> Random
                const sortedGuestsForAllocation = [...newGuestBlocksMap].sort((a, b) => {
                    const reqA = a.guest.staffName;
                    const reqB = b.guest.staffName;
                    const isStrictA = reqA && !['RANDOM', 'MALE', 'FEMALE', '?冽?', 'Any', 'undefined', '??, '憟?, '?瑕葦', '憟喳葦'].includes(reqA);
                    const isStrictB = reqB && !['RANDOM', 'MALE', 'FEMALE', '?冽?', 'Any', 'undefined', '??, '憟?, '?瑕葦', '憟喳葦'].includes(reqB);

                    if (isStrictA && !isStrictB) return -1;
                    if (!isStrictA && isStrictB) return 1;

                    // N廕簑 c羅ng u ti礙n (v穩 d廙?c羅ng Nam/N廙?, duy tr穫 th廙?t廙?g廙
                    return a.guest.idx - b.guest.idx;
                });

                for (const item of sortedGuestsForAllocation) {
                    let outReason = {};
                    const assignedStaff = findAvailableStaff(item.guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length - 1].end, staffList, flatTimeline, dateStr, outReason);
                    if (!assignedStaff) {
                        staffAssignmentSuccess = false;
                        let staffReq = item.guest.staffName;
                        let errorMsg = '?葦銝?';
                        if (staffReq) {
                            if (['MALE', '??, '?瑕葦'].includes(staffReq)) {
                                errorMsg = '?瑁葦銝?';
                            } else if (['FEMALE', '憟?, '憟喳葦'].includes(staffReq)) {
                                errorMsg = '憟唾葦銝?';
                            } else if (!['RANDOM', '?冽?', 'Any', 'undefined', '銝?摰?].includes(staffReq)) {
                                if (outReason.reason === 'OFF') {
                                    errorMsg = `[${staffReq}]?葦瘝?銝`;
                                } else if (outReason.reason === 'BUSY') {
                                    errorMsg = `${staffReq}?葦 ${outReason.time}撌脩??恥鈭槁; 
                                } else if (outReason.reason === 'BEFORE_SHIFT') {
                                    errorMsg = `[${staffReq}]?葦${outReason.time}??靘??苜;
                                } else if (outReason.reason === 'OUT_OF_SHIFT') {
                                    errorMsg = `[${staffReq}]?葦撌脩?銝鈭;
                                } else {
                                    errorMsg = `[${staffReq}]?葦瘝?銝`; 
                                }
                            }
                        }
                        failureLog.push(`??${errorMsg}`);
                        break;
                    }
                    const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
                    if (detail) detail.staff = assignedStaff;
                    // Khi kh獺ch m廙 ?廙θ ph璽n th廙? c觼ng g獺n v?o m廕τg assignedStaffs ?廙?check cho kh獺ch ti廕穆 theo
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
                    let actionText = globalBestOutOfBoundSqueeze.shiftMins > 0 ? '蝔?' : '?';
                    let shiftVal = Math.abs(globalBestOutOfBoundSqueeze.shiftMins);
                    let reqTimeStr = getTimeStrFromMins(requestStartMins);
                    let msg = `?? 蝟餌絞閮??箸??擗?? (${globalBestOutOfBoundSqueeze.flow === 'BF' ? '頨? : '??}:${globalBestOutOfBoundSqueeze.p1} ; ${globalBestOutOfBoundSqueeze.flow === 'BF' ? '?? : '頨?}:${globalBestOutOfBoundSqueeze.p2})嚗歇頞璅???遣霅唳${actionText} ${shiftVal} ??嚗??${timeStr} ??隞交遛頞單?皞;
                    return triggerSmartFailure(msg, suggestedTime);
                }
                const uniqueLog = [...new Set(failureLog)];
                const debugReason = uniqueLog.length > 0 ? uniqueLog.slice(-1).join('') : "???葦銝?";
                const failMessage = debugReason;
                return { feasible: false, reason: failMessage, debug: guardrailCheck ? guardrailCheck.debug : {} };
            }
        }

        return { checkRequestAvailability, setDynamicServices, getTimeStrFromMins, generateElasticSplits };
    })();

    // Expose cyxCallCoreAvailabilityCheck globally for cyx_views and cyx_app
    window.cyxCallCoreAvailabilityCheck = function(dateStr, timeStr, guestDetails, todays, staffList) {
        syncServicesToCore();
        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = window.normalizeStaffId ? window.normalizeStaffId(String(s.id).trim()) : String(s.id).trim();
                const rawStart = s['銝'] || s.start || s.shiftStart || "00:00";
                const rawEnd = s['銝'] || s.end || s.shiftEnd || "00:00";
                const dayStatus = s[dateStr] || s[dateStr.replace(/\//g, '-')] || "";
                let isOff = (String(s.offDays || "").includes(dateStr) || String(dayStatus).toUpperCase().includes('OFF') || String(dayStatus).toUpperCase() === 'X');
                staffMap[sId] = {
                    id: sId, gender: s.gender, start: rawStart, end: rawEnd,
                    isStrictTime: (s.isStrictTime === true || String(s.isStrictTime).toUpperCase() === 'TRUE'), off: isOff,
                    offDays: s.offDays, customShifts: s.customShifts
                };
                if (s.name) staffMap[window.normalizeStaffId ? window.normalizeStaffId(String(s.name).trim()) : String(s.name).trim()] = staffMap[sId];
            });
        }
        try {
            // extract location from the first guest if it exists, otherwise default to '?祇尹'
            const reqLocation = (guestDetails && guestDetails[0] && guestDetails[0].location) ? guestDetails[0].location : '?祇尹';
            const result = CoreKernel.checkRequestAvailability(dateStr, timeStr, guestDetails, todays, staffMap, { location: reqLocation });
            return result.feasible
                ? { valid: true, details: result.details, proposedUpdates: result.proposedUpdates, debug: result.debug }
                : { valid: false, reason: result.reason, debug: result.debug };
        } catch (err) {
            console.error(err);
            return { valid: false, reason: "System Error: " + err.message };
        }
    };

    // ========================================================================
    // PH廕吉 2: DATA FETCHER
    // ========================================================================
    const fetchLiveServerData = async (isForceRefresh = false) => {
        const apiUrl = window.API_URL || window.GAS_API_URL || (window.CONFIG && window.CONFIG.API_URL);
        if (!apiUrl) { console.warn("?? Warning: API_URL missing."); return null; }
        try {
            const params = [`_t=${new Date().getTime()}`];
            if (isForceRefresh) params.push('forceRefresh=true');
            const targetUrl = apiUrl.includes('?') ? `${apiUrl}&${params.join('&')}` : `${apiUrl}?${params.join('&')}`;
            const response = await fetch(targetUrl);
            const data = await response.json();
            if (data && data.staffList && data.bookings) return data;
            return null;
        } catch (err) { console.error("??Fetch Failed", err); return null; }
    };

    // ========================================================================
    // PH廕吉 3: BRIDGE LOGIC & REACT COMPONENT
    // ========================================================================
    const { useState, useEffect, useMemo, useCallback } = React;

    const syncServicesToCore = () => {
        const rawServices = (window.CoreKernel?.dynamicServices || window.SERVICES_DATA) || {};
        const formattedServices = {};
        Object.keys(rawServices).forEach(key => {
            const svc = rawServices[key];
            const sType = svc.type ? svc.type.toUpperCase() : 'BODY';
            let defFlow = 'BODYSINGLE';
            if (sType === 'FOOT' || sType === 'CHAIR') defFlow = 'FOOTSINGLE';
            else if (sType === 'BODY' || sType === 'BED') defFlow = 'BODYSINGLE';
            formattedServices[key] = {
                name: svc.name || key, duration: parseInt(svc.duration) || 60,
                type: sType, category: svc.category || 'SINGLE', price: svc.price || 0,
                elasticStep: svc.elasticStep || 0, elasticLimit: svc.elasticLimit || 0,
                minBody: svc.minBody, maxBody: svc.maxBody,
                minFoot: svc.minFoot, maxFoot: svc.maxFoot,
            };
        });
        console.log("FORMATTED_KEYS:", Object.keys(formattedServices));
        CoreKernel.setDynamicServices(formattedServices);
    };

    const mergeBookingData = (serverBookings, localBookings) => {
        if (!Array.isArray(serverBookings)) serverBookings = [];
        if (!Array.isArray(localBookings)) localBookings = [];
        const mergedMap = new Map();
        serverBookings.forEach(b => { if (b.rowId) mergedMap.set(b.rowId, b); });
        localBookings.forEach(b => { if (b.rowId) mergedMap.set(b.rowId, b); });
        return Array.from(mergedMap.values());
    };

    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList, locationStr) => {
        syncServicesToCore();
        const now = new Date();
        const STATUS = getBookingStatus();

        const coreGuests = guests.map(g => {
            let foundCode = getServiceCodeByName(g.service);
            const svcDef = (window.CoreKernel?.dynamicServices || window.SERVICES_DATA) && foundCode ? (window.CoreKernel?.dynamicServices || window.SERVICES_DATA)[foundCode] : null;
            let impliedFlow = g.flowCode || undefined;
            if (!impliedFlow && svcDef) {
                const cat = (svcDef.category || '').toUpperCase();
                const sType = (svcDef.type || 'BODY').toUpperCase();
                if (cat !== 'COMBO' && cat !== 'MIXED') {
                    if (sType === 'FOOT' || sType === 'CHAIR') impliedFlow = 'FOOTSINGLE';
                    else impliedFlow = 'BODYSINGLE';
                }
            }

            // CHU廕沐 H?A ID TH廙?T廙?GUEST
            let rawStaff = g.staff;
            let normalizedStaff = 'RANDOM';
            if (rawStaff === '?冽?') normalizedStaff = 'RANDOM';
            else if (rawStaff === '憟? || rawStaff === '憟喳葦') normalizedStaff = 'FEMALE';
            else if (rawStaff === '?? || rawStaff === '?瑕葦') normalizedStaff = 'MALE';
            else normalizedStaff = normalizeStaffId(rawStaff);

            return { serviceCode: foundCode || g.service, staffName: normalizedStaff, staff: g.staff, isYouTui: g.isYouTui, isGuaSha: g.isGuaSha, isHuaGuan: g.isHuaGuan, isBaGuan: g.isBaGuan, flowCode: impliedFlow, overrideDuration: g.overrideDuration };
        });

        const targetDateStandard = normalizeDateStrict(date);
        
        // --- X廙?L? THEO QUY T廕哽 TUY廙 ?廙 簣8 TI廕鋅G ---
        const reqDateParts = targetDateStandard.replace(/\//g, '-').split('-');
        const reqTimeParts = (time || "12:00").split(':');
        const reqDateObj = new Date(parseInt(reqDateParts[0], 10), parseInt(reqDateParts[1], 10) - 1, parseInt(reqDateParts[2], 10), parseInt(reqTimeParts[0], 10), parseInt(reqTimeParts[1], 10), 0);
        const reqTimeMs = reqDateObj.getTime();

        const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

        let reqH = parseInt(reqTimeParts[0], 10);
        let reqM = parseInt(reqTimeParts[1], 10);
        if (reqH < 8) reqH += 24;
        const reqMinsCore = (reqH * 60) + reqM;

        const coreBookings = (Array.isArray(bookings) ? bookings : []).filter(b => {
            if (!b || !b.startTimeString) return false;

            // [V116.7 L廙 TR廕G TH?I] L廙 b廙?ho?n to?n c獺c ?n ?瓊 H廙囤 ho廕搾 ?瓊 Ho?n Th?nh b廕彫g chu廕姊 SSOT
            // Ng?n ch廕搖 vi廙 ?n c觼 b廙?t獺i sinh th?nh "?ang Ph廙卉 V廙? do th廙 gian qu獺 kh廙?
            const isInactive = b.status && (
                b.status.includes('h廙囤') || b.status.includes('Cancel') || b.status.includes('??') || b.status.includes(STATUS.CANCELLED) ||
                b.status.includes('摰?') || b.status.includes('Done') || b.status.includes('??) || b.status.includes(STATUS.COMPLETED)
            );
            if (isInactive) return false;

            let bDateObj;
            try { 
                bDateObj = new Date(b.startTimeString.replace(/\//g, '-')); 
            } catch (e) {}

            if (!bDateObj || isNaN(bDateObj.getTime())) {
                const rawDate = b.startTimeString.split(' ')[0];
                let bOpDate = b.opDate || rawDate;
                return normalizeDateStrict(bOpDate) === targetDateStandard;
            }

            const diffMs = bDateObj.getTime() - reqTimeMs;
            return Math.abs(diffMs) <= EIGHT_HOURS_MS;
        }).map(b => {
            let isRunningStatus = false;
            if (b.status && (b.status.includes('?脰?') || b.status.includes('SERVING') || b.status.includes('??銝?) || b.status.includes('?ang ph廙卉 v廙?))) {
                isRunningStatus = true;
            } else if (b.originalData && b.originalData.status) {
                const stLower = b.originalData.status.toLowerCase();
                if (stLower.includes('running') || stLower.includes('??銝?) || stLower.includes('?ang ph廙卉 v廙?)) {
                    isRunningStatus = true;
                }
            }

            // T穩nh to獺n Fake StartTime
            let bDateObjRaw;
            try { bDateObjRaw = new Date(b.startTimeString.replace(/\//g, '-')); } catch (e) {}
            
            let mappedStartTime = b.startTimeString;
            if (bDateObjRaw && !isNaN(bDateObjRaw.getTime())) {
                const diffMins = Math.round((bDateObjRaw.getTime() - reqTimeMs) / 60000);
                const targetMins = reqMinsCore + diffMins;
                let h_final = Math.floor(targetMins / 60);
                let m_final = targetMins % 60;
                if (m_final < 0) { m_final += 60; h_final -= 1; }
                let h_str = h_final < 8 ? h_final - 24 : h_final;
                mappedStartTime = `${h_str}:${String(m_final).padStart(2, '0')}`;
            }

            let serverLockSignal = b.isManualLocked;
            if (serverLockSignal === undefined && b.originalData) serverLockSignal = b.originalData.isManualLocked;
            const isExplicitlyLocked = (serverLockSignal === true || String(serverLockSignal).toUpperCase() === 'TRUE' || serverLockSignal === 1);
            const finalLockState = isExplicitlyLocked || isRunningStatus;

            // G獺n gi獺 tr廙?tr廕》g th獺i SSOT m廙
            let normalizedStatus = b.status || STATUS.WAITING;
            if (isRunningStatus) normalizedStatus = STATUS.SERVING;

            // ==============================================================
            // TR廙G T?M: GOM TO?N B廙?TH廙?(C廙 L, M, N...) TH?NH M廕﹫G
            // ==============================================================
            let rawStaffs = [];
            if (b.technician) rawStaffs.push(b.technician);
            if (b.staffId) rawStaffs.push(b.staffId);

            // Qu矇t c獺c c廙 ph廙?t廙?staffId2 ?廕積 staffId9 (ho廕搾 tng ?ng)
            for (let i = 2; i <= 9; i++) {
                if (b[`staffId${i}`]) rawStaffs.push(b[`staffId${i}`]);
                if (b.originalData && b.originalData[`staffId${i}`]) rawStaffs.push(b.originalData[`staffId${i}`]);
            }

            // L廙 b廙?undefined/null/Unassigned v? tr羅ng l廕搆
            let uniqueRawStaffs = [...new Set(rawStaffs.filter(s => s && String(s).trim() !== "" && s !== "Unassigned"))];
            let normalizedStaffs = uniqueRawStaffs.map(s => normalizeStaffId(s));

            // L廕句 ID ch穩nh ?廙?tng th穩ch v廙 c獺c UI hi廙 h?nh
            let primaryStaff = normalizedStaffs.length > 0 ? normalizedStaffs[0] : "Unassigned";

            return {
                serviceCode: b.serviceCode || b.serviceName, serviceName: b.serviceName,
                startTime: mappedStartTime, duration: parseInt(b.duration) || 60,
                startTimeString: mappedStartTime, opDate: b.opDate || (b.originalData ? b.originalData.opDate : null) || targetDateStandard,
                staffName: primaryStaff,
                assignedStaffs: normalizedStaffs, // M廕﹫G TH廙?M廙
                rowId: b.rowId,
                allocated_resource: b.resourceId || b.allocated_resource || b.rowId,
                location: b.location || (b.originalData ? b.originalData.location : null),
                current_resource_id: b.current_resource_id || (b.originalData ? b.originalData.current_resource_id : null),
                phase1_res_idx: b.phase1_res_idx || (b.originalData ? b.originalData.phase1_res_idx : null),
                phase2_res_idx: b.phase2_res_idx || (b.originalData ? b.originalData.phase2_res_idx : null),
                originalData: b, isManualLocked: finalLockState,
                phase1_duration: b.phase1_duration !== undefined ? parseInt(b.phase1_duration) : (b.originalData?.phase1_duration ? parseInt(b.originalData.phase1_duration) : null),
                phase2_duration: b.phase2_duration !== undefined ? parseInt(b.phase2_duration) : (b.originalData?.phase2_duration ? parseInt(b.originalData.phase2_duration) : null),
                status: normalizedStatus,
                note: b.ghiChu || b.note, ghiChu: b.ghiChu || b.note,
                flow: b.flow || b.originalData?.flowCode || b.originalData?.mainFlow
            };
        });

        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                // CHU廕沐 H?A ID KEY CHO STAFFMAP
                const sId = normalizeStaffId(String(s.id).trim());
                const rawStart = s['銝'] || s.start || s.shiftStart || "00:00";
                const rawEnd = s['銝'] || s.end || s.shiftEnd || "00:00";
                const dayStatus = s[targetDateStandard] || s[targetDateStandard.replace(/\//g, '-')] || "";
                let isOff = (String(s.offDays || "").includes(targetDateStandard) || String(dayStatus).toUpperCase().includes('OFF') || String(dayStatus).toUpperCase() === 'X');
                staffMap[sId] = {
                    id: sId, gender: s.gender, start: rawStart, end: rawEnd,
                    isStrictTime: (s.isStrictTime === true || String(s.isStrictTime).toUpperCase() === 'TRUE'), off: isOff,
                    offDays: s.offDays, customShifts: s.customShifts
                };
                // ?廙g b廙?c廕?key name n廕簑 c籀
                if (s.name) staffMap[normalizeStaffId(String(s.name).trim())] = staffMap[sId];
            });
        }
        try {
            const result = CoreKernel.checkRequestAvailability(targetDateStandard, time, coreGuests, coreBookings, staffMap, { location: locationStr || '?祇尹' });
            return result.feasible
                ? { valid: true, details: result.details, proposedUpdates: result.proposedUpdates, debug: result.debug }
                : { valid: false, reason: result.reason, debug: result.debug };
        } catch (err) { return { valid: false, reason: "System Error: " + err.message }; }
    };

    const forceGlobalRefresh = () => { if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender(); else window.location.reload(); };

    // ==================================================================================
    // 4. COMPONENT: PHONE BOOKING MODAL
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate, editingBooking }) => {
        // Chu廕姊 h籀a ID th廙?ngay t廙?list ?廕吟 v?o ?廙?tr獺nh l廙 Map/Dropdown
        const safeStaffList = useMemo(() => {
            if (!staffList) return [];
            return staffList.map(s => ({ ...s, id: normalizeStaffId(s.id) }));
        }, [staffList]);

        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [serviceSuggestions, setServiceSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [isChecking, setIsChecking] = useState(false);
        const [isStandbyMode, setIsStandbyMode] = useState(false);
        const [serverData, setServerData] = useState(null);

        // SURNAME PICKER STATE
        const [showSurnamePicker, setShowSurnamePicker] = useState(false);

        // Default: "憟? (120??"
        const defaultService = useMemo(() => {
            if (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) {
                if (window.SERVICES_LIST.includes("憟? (120??")) {
                    return "憟? (120??";
                }
                return window.SERVICES_LIST[0];
            }
            return "頨恍??";
        }, []);

        const getRoundedCurrentTime = () => {
            const now = new Date();
            let h = now.getHours();
            let m = now.getMinutes();
            let remainder = m % 10;
            if (remainder !== 0) {
                m += (10 - remainder);
                if (m >= 60) {
                    m = 0;
                    h = (h + 1) % 24;
                }
            }
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };

        // --- N?NG C廕匕 CA ??M (OVERNIGHT SHIFT) ---
        // initialDate truy廙 t廙?cyx_app.js v廙 d藺 l? Operation Date (VD: 02:30 s獺ng ng?y 21 th穫 initialDate = 20)
        // Ta c廕吵 ph廙卉 h廙 n籀 th?nh Physical Date (21) ?廙?L廙?t璽n hi廙 th廙??繳ng
        const getInitialPhysicalDate = () => {
            let baseDateStr = initialDate;

            // N廕簑 l? Walk-in (t廕︽ m廙 t廙?UI), initialDate ?廙θ truy廙 v?o (VD "2026-04-20")
            // N廕簑 kh繫ng c籀, d羅ng Date hi廙 t廕【 theo timezone (kh繫ng d羅ng ISOString() v穫 b廙?l廙h UTC)
            if (!baseDateStr) {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                baseDateStr = `${y}-${m}-${d}`;
            }

            return baseDateStr;
        };

        // --- TITLE STATE ---
        const [form, setForm] = useState({
            date: getInitialPhysicalDate(),
            time: getRoundedCurrentTime(), pax: 1, custName: '', custTitle: '', custPhone: '09', adminNote: '', timeToArrive: ''
        });

        const [selectedLocation, setSelectedLocation] = useState('?祇尹');
        const [crossLocationDirection, setCrossLocationDirection] = useState('MAIN_TO_OPP');
        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '?冽?', isYouTui: false, isGuaSha: false, isHuaGuan: false, isBaGuan: false }]);

        useEffect(() => {
            if (editingBooking) {
                let timeStr = getRoundedCurrentTime(); let dateStr = initialDate;
                let locStr = editingBooking.location || '?祇尹';
                if (locStr.includes('->') || locStr.includes('?∴?') || locStr === '頝券尹憟?') {
                    setSelectedLocation('頝券尹憟?');
                    if (locStr.includes('?祇尹(頞?') && locStr.indexOf('?祇尹(頞?') === 0) {
                        setCrossLocationDirection('MAIN_TO_OPP');
                    } else if (locStr.includes('撠擗?頞?') && locStr.indexOf('撠擗?頞?') === 0) {
                        setCrossLocationDirection('OPP_TO_MAIN');
                    } else if (locStr.includes('?祇尹')) {
                        setCrossLocationDirection('MAIN_TO_OPP');
                    }
                } else {
                    setSelectedLocation(locStr);
                }
                if (editingBooking.startTimeString) {
                    const parts = editingBooking.startTimeString.split(' ');
                    if (parts.length >= 2) {
                        dateStr = parts[0].replace(/\//g, '-');
                        timeStr = parts[1].substring(0, 5);
                    }
                }

                let rawName = (editingBooking.customerName || "").split('(')[0].trim();
                let parsedTitle = '';
                if (rawName.endsWith('??')) {
                    parsedTitle = '??';
                    rawName = rawName.slice(0, -2).trim();
                } else if (rawName.endsWith('撠?')) {
                    parsedTitle = '撠?';
                    rawName = rawName.slice(0, -2).trim();
                }

                const noteStr = editingBooking.ghiChu || editingBooking.note || "";

                setForm({
                    date: dateStr, time: timeStr, pax: editingBooking.pax || 1,
                    custName: rawName,
                    custTitle: parsedTitle,
                    custPhone: editingBooking.phone || "09",
                    adminNote: editingBooking.adminNote || ""
                });
                setGuestDetails([{
                    service: editingBooking.serviceName || defaultService,
                    staff: editingBooking.staffId ? normalizeStaffId(editingBooking.staffId) : '?冽?',
                    isYouTui: editingBooking.isYouTui || false,
                    isGuaSha: noteStr.includes('?桃/??')
                }]);
            }
            fetchLiveServerData(true).then(data => { if (data) setServerData(data); });
        }, [editingBooking, initialDate, defaultService]);



        const safeQuickNotes = useMemo(() => {
            const rawList = serverData?.quickNotes || window.QUICK_NOTES || [];
            if (!Array.isArray(rawList)) return [];
            return rawList.filter(n => typeof n === 'string' && n.trim() !== '');
        }, [serverData]);

        const handleTimeChange = useCallback((type, value) => {
            setForm(prev => {
                const parts = (prev.time || "12:00").split(':');
                const newHour = type === 'HOUR' ? value : parts[0];
                const newMinute = type === 'MINUTE' ? value : parts[1];
                let newDate = prev.date;

                return { ...prev, date: newDate, time: `${newHour}:${newMinute}` };
            });
            setCheckResult(null); setSuggestions([]);
        }, []);

        const handleDateShift = useCallback((days) => {
            setForm(prev => {
                const dParts = prev.date.replace(/\//g, '-').split('-');
                if (dParts.length === 3) {
                    let d = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
                    d.setDate(d.getDate() + days);
                    return { ...prev, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
                }
                return prev;
            });
            setCheckResult(null); setSuggestions([]);
        }, []);

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
            setForm(prev => ({ ...prev, pax: num })); setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const newD = [...prev];
                if (num > prev.length) for (let i = prev.length; i < num; i++) newD.push({ service: prev[0]?.service || defaultService, staff: '?冽?', isYouTui: false, isGuaSha: false, isHuaGuan: false, isBaGuan: false });
                else newD.length = num;
                return newD;
            });
        };

        const handleGuestUpdate = (idx, field, val) => {
            setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const c = [...prev]; c[idx] = { ...c[idx] };
                if (field === 'service') {
                    c[idx].service = val;
                    if (val && (val.includes('頞?) || val.includes('Foot') || val.includes('??))) c[idx].isYouTui = false;
                    c[idx].serviceCode = getServiceCodeByName(val);
                }
                else if (field === 'staff') {
                    c[idx].staff = val;
                }
                else if (field === 'toggleYouTui') {
                    c[idx].isYouTui = !c[idx].isYouTui;
                }
                else if (field === 'toggleGuaSha') {
                    c[idx].isGuaSha = !c[idx].isGuaSha;
                }
                else if (field === 'toggleHuaGuan') {
                    c[idx].isHuaGuan = !c[idx].isHuaGuan;
                }
                else if (field === 'toggleBaGuan') {
                    c[idx].isBaGuan = !c[idx].isBaGuan;
                }
                return c;
            });
        };

        const handleSurnameSelect = (char) => {
            setForm(prev => ({ ...prev, custName: char }));
            setShowSurnamePicker(false);
        };

        const handleTitleToggle = (titleOption) => {
            setForm(prev => ({
                ...prev,
                custTitle: prev.custTitle === titleOption ? '' : titleOption
            }));
        };

        const performCheck = async (e) => {
            if (e) e.preventDefault();
            
            const blacklist = serverData?.blacklist || window.SYSTEM_DATA?.blacklist || [];
            const masterBlacklist = serverData?.masterBlacklist || window.SYSTEM_DATA?.masterBlacklist || [];
            
            if (form.custPhone) {
                const cleanPhone = form.custPhone.trim().replace(/\D/g, '');
                if (cleanPhone) {
                    if (blacklist.length > 0 && blacklist.some(b => b.phone === cleanPhone)) {
                        Swal.fire('蝟餌絞?內', '?? 甇日閰梯?蝣澆歇?暺??殷?????嚗?, 'error');
                        setIsChecking(false);
                        return;
                    }
                    
                    if (masterBlacklist.length > 0 && typeof guestDetails !== 'undefined') {
                        const safeStaffList = serverData?.staff || window.SYSTEM_DATA?.staff || [];
                        for (const guest of guestDetails) {
                            if (guest.staff && guest.staff !== '?冽?' && guest.staff !== '銝?摰? && guest.staff !== '?? && guest.staff !== '憟?) {
                                const staffObj = safeStaffList.find(s => s.id === guest.staff || s.name === guest.staff);
                                const masterName = staffObj ? staffObj.name : guest.staff;
                                const isBlocked = masterBlacklist.some(b => b.phone === cleanPhone && (b.staffName === guest.staff || b.staffName === masterName));
                                if (isBlocked) {
                                    Swal.fire('蝟餌絞?內', `?? ${masterName}?葦銝?交?摰恥鈭槁, 'error');
                                    setIsChecking(false);
                                    return;
                                }
                            }
                        }
                    }
                }
            }

            setIsChecking(true); setCheckResult(null); setSuggestions([]);
            let freshData = await fetchLiveServerData(true);
            let serverBookingsList = freshData ? freshData.bookings : (serverData?.bookings || []);
            let serverStaffList = freshData ? freshData.staff : (serverData?.staff || safeStaffList);
            let localBookingsList = safeBookings;
            let finalBookings = mergeBookingData(serverBookingsList, localBookingsList);
            if (editingBooking) { finalBookings = finalBookings.filter(b => b.rowId !== editingBooking.rowId); }

            if (selectedLocation === '頝券尹憟?') {
                const loc1 = crossLocationDirection === 'MAIN_TO_OPP' ? '?祇尹' : '撠擗?;
                const loc2 = crossLocationDirection === 'MAIN_TO_OPP' ? '撠擗? : '?祇尹';
                
                const baseDuration = parseInt(extractStandardDuration(guestDetails[0].service) || 60, 10);
                
                const svcDef = window.CoreKernel && window.CoreKernel.SERVICES ? window.CoreKernel.SERVICES[guestDetails[0].serviceCode || 'UNKNOWN'] : null;
                const eLimit = svcDef ? (svcDef.elasticLimit || 15) : 15;
                const flowPrimary = guestDetails[0].flowCode || 'FB';
                const splitsToTry = CoreKernel.generateElasticSplits(baseDuration, 1, eLimit, null, svcDef ? svcDef.minFoot : null, svcDef ? svcDef.maxFoot : null, svcDef ? svcDef.minBody : null, svcDef ? svcDef.maxBody : null, flowPrimary, false);
                
                let foundValid = false;
                let finalRes1 = null, finalRes2 = null;
                let finalP1Dur = null, finalP2Dur = null;

                for (const split of splitsToTry) {
                    if (split.shiftMins !== 0) continue; 
                    
                    const p1Dur = split.p1;
                    const transitionMins = window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5;
                    const p2TimeStr = CoreKernel.getTimeStrFromMins ? CoreKernel.getTimeStrFromMins(safeTimeToMins(form.time) + p1Dur + transitionMins) : form.time;

                    const detailedGuests1 = guestDetails.map((g) => ({ ...g, flow: 'FOOTSINGLE', flowCode: 'FOOTSINGLE', resource_type: 'CHAIR', overrideDuration: p1Dur }));
                    const detailedGuests2 = guestDetails.map((g) => ({ ...g, flow: 'BODYSINGLE', flowCode: 'BODYSINGLE', resource_type: 'BED', overrideDuration: split.p2 || (baseDuration - p1Dur) }));

                    const res1 = callCoreAvailabilityCheck(form.date, form.time, detailedGuests1, finalBookings, serverStaffList, loc1);
                    const res2 = callCoreAvailabilityCheck(form.date, p2TimeStr, detailedGuests2, finalBookings, serverStaffList, loc2);

                    if (res1.valid && res2.valid) {
                        foundValid = true;
                        finalRes1 = res1;
                        finalRes2 = res2;
                        finalP1Dur = p1Dur;
                        finalP2Dur = split.p2 || (baseDuration - p1Dur);
                        break;
                    }
                }

                if (foundValid) {
                    const combinedDetails = guestDetails.map((g, i) => {
                        const d1 = finalRes1.details ? finalRes1.details[i] : {};
                        const d2 = finalRes2.details ? finalRes2.details[i] : {};
                        return {
                            service: g.service,
                            phase1_duration: finalP1Dur,
                            phase2_duration: finalP2Dur,
                            flow: 'FB',
                            allocated: [...(d1.allocated || []), ...(d2.allocated || [])],
                            staff: d1.staff || g.staff || '?冽?'
                        };
                    });
                    
                    let msg = "??甇方楊擗冽?畾萄??嚗歇?箸??撠?鞈?";
                    if (finalP1Dur !== Math.floor(baseDuration / 2)) {
                        msg += ` (??蝟餌絞撌脰?????扳????誑蝚血?蝛箔?: ??{finalP1Dur}/頨?{finalP2Dur})`;
                    }

                    setCheckResult({ 
                        status: 'OK', 
                        message: msg, 
                        coreDetails: combinedDetails, 
                        phase1Details: finalRes1.details,
                        phase2Details: finalRes2.details,
                        debug: {} 
                    });
                } else {
                    setCheckResult({ status: 'FAIL', message: `??頝券尹??憭望?: 瘝?頞喳????蝛箔?蝯行迨頝券尹??`, debug: {} });
                }
                setIsChecking(false);
                return;
            }

            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, finalBookings, serverStaffList, selectedLocation);
            if (res.valid) {
                setCheckResult({ status: 'OK', message: "??甇斗?畾萄??", coreDetails: res.details, debug: res.debug });
            } else {
                setCheckResult({ status: 'FAIL', message: res.reason, debug: res.debug });
                // N?NG C廕匕 V118.9: Thu廕負 to獺n g廙ξ 羸 th廙 gian th繫ng minh d廙帶 tr礙n CLEANUP_MINUTES & TRANSITION_MINUTES
                const found = [];
                
                if (res.debug && res.debug.suggestions) {
                    res.debug.suggestions.forEach(sug => {
                        let finalDate = sug.date || form.date;
                        if (finalDate) finalDate = finalDate.replace(/\//g, '-');
                        found.push({ time: sug.time, date: finalDate, daysToAdd: sug.daysToAdd || 0 });
                    });
                }
                
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0] || 0) * 60 + (parts[1] || 0);
                
                // L廕句 th繫ng s廙??廙 t廙?c廕只 h穫nh
                const ext = window.SYSTEM_CONFIG || (typeof CoreKernel !== 'undefined' ? CoreKernel.CONFIG : {});
                const CLEANUP_BUFFER = (ext.BUFFERS && ext.BUFFERS.CLEANUP_MINUTES) || ext.CLEANUP_BUFFER || 5;
                const TRANSITION_BUFFER = (ext.BUFFERS && ext.BUFFERS.TRANSITION_MINUTES) || ext.TRANSITION_BUFFER || 5;

                let candidateMins = [];

                // 1. D廙彫g c獺c m廙 廙姊g vi礙n theo chu k廙?5 ph繳t c廕?2 chi廙
                for (let i = 1; i <= 48; i++) {
                    candidateMins.push(currMins + (i * 5));
                    candidateMins.push(currMins - (i * 5));
                }

                // 2. Thu th廕計 th廙 gian k廕篙 th繳c c廙吧 c獺c ?n ?ang chi廕禦 d廙叩g
                const reqDate = form.date.replace(/\//g, '-');
                let maxReqDuration = guestDetails.reduce((max, g) => Math.max(max, parseInt(g.duration || 60, 10)), 0);
                
                finalBookings.forEach(b => {
                    let bDate = b.opDate;
                    if (!bDate && b.startTimeString) {
                        bDate = b.startTimeString.split(' ')[0].replace(/\//g, '-');
                    }
                    if (bDate === reqDate) {
                        let bTime = b.startTimeString ? b.startTimeString.split(' ')[1] : b.startTime;
                        if (bTime) {
                            let [hStr, mStr] = bTime.split(':');
                            let h = parseInt(hStr, 10);
                            let m = parseInt(mStr, 10);
                            if (!isNaN(h) && !isNaN(m)) {
                                let startMins = h * 60 + m;
                                let duration = parseInt(b.duration, 10) || 60;
                                let endMins = startMins + duration;

                                // G廙ξ 羸 kh獺ch m廙 v?o ngay sau khi gi廙g/gh廕??廙θ d廙 d廕雷 ho廕搾 chuy廙 ti廕穆
                                candidateMins.push(endMins + CLEANUP_BUFFER);
                                candidateMins.push(endMins + TRANSITION_BUFFER);
                                
                                // G廙ξ 羸 kh獺ch v?o ngay TR廙 khi m廙 booking kh獺c b廕眩 ?廕吟
                                candidateMins.push(startMins - maxReqDuration - CLEANUP_BUFFER);
                                
                                // L廕句 th礙m m廙 k廕篙 th繳c c廙吧 Phase 1 n廕簑 l? Combo
                                let p1Dur = parseInt(b.phase1_duration, 10);
                                if (isNaN(p1Dur) && b.originalData && b.originalData.phase1_duration) {
                                    p1Dur = parseInt(b.originalData.phase1_duration, 10);
                                }
                                if (!isNaN(p1Dur) && p1Dur > 0) {
                                    candidateMins.push(startMins + p1Dur + CLEANUP_BUFFER);
                                    candidateMins.push(startMins + p1Dur + TRANSITION_BUFFER);
                                    candidateMins.push(startMins + p1Dur - maxReqDuration - CLEANUP_BUFFER);
                                }
                            }
                        }
                    }
                });

                // 3. L廙 v? s廕皰 x廕穆 c獺c m廙 th廙 gian 廙姊g vi礙n
                let today = new Date();
                let tzOffset = today.getTimezoneOffset() * 60000;
                let localToday = (new Date(today - tzOffset)).toISOString().split('T')[0];
                let currentRealMins = today.getHours() * 60 + today.getMinutes();
                let isToday = (reqDate === localToday);

                let uniqueCandidates = [...new Set(candidateMins)]
                    .filter(mins => {
                        if (mins === currMins || mins < 0 || mins > 1800) return false;
                        if (isToday && mins <= currentRealMins + 5) return false;
                        return true;
                    })
                    .sort((a, b) => {
                        // u ti礙n c獺c m廙 th廙 gian s獺t v廙 l廙h hi廙 t廕【 (snapping points)
                        // Nh廙疸g m廙 n?y ?瓊 ?廙θ t穩nh to獺n 廙?ph廕吵 2 v? push v?o candidateMins tr廙
                        // Ta c籀 th廙?ki廙 tra xem a v? b c籀 ph廕ξ l? snapping point kh繫ng b廕彫g c獺ch duy廙 l廕【,
                        // Tuy nhi礙n v穫 廙?ph廕吵 2 ta ch廙?push c獺c m廙 "snap", 
                        // v? 廙?ph廕吵 1 ta push theo chu k廙?5 ph繳t.
                        // ?廙??n gi廕τ, n廕簑 a ho廕搾 b kh繫ng chia h廕篙 cho 5, ch廕畚 ch廕疸 n籀 l? snap point (n廕簑 buffer kh繫ng ch廕登 5).
                        // Nhng buffer th廙g l? 5. Do ?籀 ta t廕︽ l廕【 snapMins tng t廙?triggerSmartFailure.
                        
                        let snapMins = new Set();
                        finalBookings.forEach(bk => {
                            let bkDate = bk.opDate || (bk.startTimeString ? bk.startTimeString.split(' ')[0].replace(/\//g, '-') : '');
                            if (bkDate === reqDate) {
                                let bkTime = bk.startTimeString ? bk.startTimeString.split(' ')[1] : bk.startTime;
                                if (bkTime) {
                                    let [h, m] = bkTime.split(':').map(Number);
                                    if (!isNaN(h) && !isNaN(m)) {
                                        let start = h * 60 + m;
                                        let dur = parseInt(bk.duration, 10) || 60;
                                        snapMins.add(start + dur + CLEANUP_BUFFER);
                                        snapMins.add(start + dur + TRANSITION_BUFFER);
                                        snapMins.add(start - maxReqDuration - CLEANUP_BUFFER);
                                        let p1Dur = parseInt(bk.phase1_duration, 10) || (bk.originalData && parseInt(bk.originalData.phase1_duration, 10));
                                        if (!isNaN(p1Dur) && p1Dur > 0) {
                                            snapMins.add(start + p1Dur + CLEANUP_BUFFER);
                                            snapMins.add(start + p1Dur + TRANSITION_BUFFER);
                                            snapMins.add(start + p1Dur - maxReqDuration - CLEANUP_BUFFER);
                                        }
                                    }
                                }
                            }
                        });
                        
                        let aSnap = snapMins.has(a);
                        let bSnap = snapMins.has(b);
                        if (aSnap && !bSnap) return -1;
                        if (!aSnap && bSnap) return 1;
                        return Math.abs(a - currMins) - Math.abs(b - currMins);
                    });


                // 4. Ki廙 tra s廙?kh廕?d廙叩g c廙吧 t廙南g m廙
                for (let nM of uniqueCandidates) {
                    let daysToAdd = Math.floor(nM / 1440);
                    let localM = nM % 1440;
                    let h = Math.floor(localM / 60);
                    let m = localM % 60;
                    
                    let tStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    let sugDate = form.date;
                    
                    if (daysToAdd > 0) {
                        const dParts = sugDate.replace(/\//g, '-').split('-');
                        if (dParts.length === 3) {
                            let d = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
                            d.setDate(d.getDate() + daysToAdd);
                            sugDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        }
                    }

                    let checkRes = callCoreAvailabilityCheck(sugDate, tStr, guestDetails, finalBookings, serverStaffList, selectedLocation);
                    if (checkRes.valid) {
                        if (!found.some(f => f.time === tStr && f.date === sugDate)) {
                            found.push({ time: tStr, date: sugDate, daysToAdd });
                        }
                        if (found.length >= 4) break;
                    } else {
                        console.log(`[DEBUG] getSuggestions rejected ${tStr} because: ${checkRes.reason}`);
                    }
                }
                
                // N?NG C廕匕: S廕皰 x廕穆 c獺c g廙ξ 羸 theo th廙?t廙?th廙 gian t?ng d廕吵
                found.sort((a, b) => {
                    if (a.daysToAdd !== b.daysToAdd) return a.daysToAdd - b.daysToAdd;
                    let aMins = parseInt(a.time.split(':')[0]) * 60 + parseInt(a.time.split(':')[1]);
                    let bMins = parseInt(b.time.split(':')[0]) * 60 + parseInt(b.time.split(':')[1]);
                    return aMins - bMins;
                });
                
                setSuggestions(found);

                // --- [N?NG C廕匕 V118] T?M KI廕醃 D廙H V廙?KH?C T廕 C?NG TH廙 ?I廙 ---
                const altServices = [];
                const currentSvc = guestDetails[0]?.service;
                // N廕簑 kh獺ch ch廙??i 1 ng廙 (?廙??n gi廕τ h籀a g廙ξ 羸) ho廕搾 c籀 th廙?duy廙 m廙 ng廙
                if (guestDetails.length === 1 && window.SERVICES_LIST) {
                    for (let svc of window.SERVICES_LIST) {
                        if (svc === currentSvc) continue;
                        let mockGuestDetails = [{ ...guestDetails[0], service: svc }];
                        let checkAltRes = callCoreAvailabilityCheck(form.date, form.time, mockGuestDetails, finalBookings, serverStaffList, selectedLocation);
                        if (checkAltRes.valid) {
                            altServices.push(svc);
                        }
                    }
                }
                setServiceSuggestions(altServices);
            }
            setIsChecking(false);
        };

        const handleFinalSave = async (e, isStandby = false) => {
            if (e) e.preventDefault(); if (isSubmitting) return;

            const finalCustName = (form.custName.trim() + (form.custTitle || '')).trim();
            if (!finalCustName) { Swal.fire('蝟餌絞?內', '?? 隢撓?仿“摰Ｗ???', 'warning'); return; }

            const blacklist = serverData?.blacklist || window.SYSTEM_DATA?.blacklist || [];
            if (blacklist.length > 0 && form.custPhone) {
                const cleanPhone = form.custPhone.trim().replace(/\D/g, '');
                if (cleanPhone) {
                    const isBlacklisted = blacklist.some(b => b.phone === cleanPhone);
                    if (isBlacklisted) {
                        Swal.fire('蝟餌絞?內', '?? 甇日閰梯?蝣澆歇?暺??殷?????嚗?, 'error');
                        return;
                    }
                }
            }

            setIsSubmitting(true);
            try {
                let checkBookings = mergeBookingData(serverData?.bookings || [], safeBookings);
                if (editingBooking) checkBookings = checkBookings.filter(b => b.rowId !== editingBooking.rowId);

                let finalPayloads = [];

                if (selectedLocation === '頝券尹憟?') {
                    const loc1 = crossLocationDirection === 'MAIN_TO_OPP' ? '?祇尹' : '撠擗?;
                    const loc2 = crossLocationDirection === 'MAIN_TO_OPP' ? '撠擗? : '?祇尹';
                    
                    const baseDuration = parseInt(extractStandardDuration(guestDetails[0].service) || 60, 10);
                    let p1Dur = Math.floor(baseDuration / 2);
                    let p2Dur = Math.ceil(baseDuration / 2);
                    
                    if (checkResult && checkResult.coreDetails && checkResult.coreDetails[0]) {
                        p1Dur = checkResult.coreDetails[0].phase1_duration || p1Dur;
                        p2Dur = checkResult.coreDetails[0].phase2_duration || p2Dur;
                    }
                    
                    const transitionMins = window.SYSTEM_CONFIG?.BUFFERS?.TRANSITION_MINUTES || 5;
                    const p2TimeStr = CoreKernel.getTimeStrFromMins(safeTimeToMins(form.time) + p1Dur + transitionMins);
                    
                    const phase1Details = checkResult?.phase1Details || [];
                    const phase2Details = checkResult?.phase2Details || [];

                    const detailedGuests1 = guestDetails.map((g, i) => {
                        const assignedRes1 = phase1Details[i] ? (phase1Details[i].allocated?.[0] || phase1Details[i].phase1_res_idx || "") : "";
                        return { ...g, serviceCode: getServiceCodeByName(g.service) || "", staff: normalizeStaffId(g.staff), flow: 'FOOTSINGLE', flowCode: 'FOOTSINGLE', phase1_duration: p1Dur, phase2_duration: null, allocated_resource: assignedRes1, phase1_resource: assignedRes1, phase2_resource: "", resource_type: "CHAIR" };
                    });
                    
                    const detailedGuests2 = guestDetails.map((g, i) => {
                        const svc2 = g.service + " (頝券尹?亦?)";
                        const assignedRes2 = phase2Details[i] ? (phase2Details[i].allocated?.[0] || phase2Details[i].phase1_res_idx || "") : "";
                        return { ...g, service: svc2, serviceCode: getServiceCodeByName(svc2) || "", staff: normalizeStaffId(g.staff), flow: 'BODYSINGLE', flowCode: 'BODYSINGLE', phase1_duration: p2Dur, phase2_duration: null, allocated_resource: assignedRes2, phase1_resource: assignedRes2, phase2_resource: "", resource_type: "BED" };
                    });

                    const oils = guestDetails.map((g, i) => g.isYouTui ? `K${i + 1}:瘝寞` : null).filter(Boolean);
                    const guaShas = guestDetails.map((g, i) => g.isGuaSha ? `K${i + 1}:?桃` : null).filter(Boolean);
                    const huaGuans = guestDetails.map((g, i) => g.isHuaGuan ? `K${i + 1}:皛?` : null).filter(Boolean);
                    const baGuans = guestDetails.map((g, i) => g.isBaGuan ? `K${i + 1}:??` : null).filter(Boolean);
                    
                    const noteParts = [...oils, ...guaShas, ...huaGuans, ...baGuans];
                    if (p1Dur !== Math.floor(baseDuration / 2)) {
                        noteParts.push(`?? 蝟餌絞撌脰?????扳????);
                    }
                    
                    const noteStr1 = noteParts.length > 0 ? `(${noteParts.join(', ')}) [頝券尹 1/2]` : "[頝券尹 1/2]";
                    const noteStr2 = noteParts.length > 0 ? `(${noteParts.join(', ')}) [頝券尹 2/2]` : "[頝券尹 2/2]";

                    const buildPayload = (guests, loc, time, note) => {
                        return {
                            hoTen: finalCustName + " [頝券尹]",
                            sdt: form.custPhone || "",
                            dichVu: guests.map(g => g.service).join(','),
                            pax: form.pax,
                            location: loc,
                            ngayDen: normalizeDateStrict(form.date),
                            gioDen: time,
                            nhanVien: guests[0].staff,
                            isYouTui: guests[0].isYouTui,
                            isGuaSha: guests[0].isGuaSha,
                            isHuaGuan: guests[0].isHuaGuan,
                            isBaGuan: guests[0].isBaGuan,
                            serviceCode: guests[0].serviceCode,
                            staffId2: guests[1]?.staff || null,
                            staffId3: guests[2]?.staff || null,
                            staffId4: guests[3]?.staff || null,
                            staffId5: guests[4]?.staff || null,
                            staffId6: guests[5]?.staff || null,
                            staffId7: guests[6]?.staff || null,
                            staffId8: guests[7]?.staff || null,
                            staffId9: guests[8]?.staff || null,
                            ghiChu: note,
                            adminNote: form.adminNote,
                            timeToArrive: form.timeToArrive,
                            guestDetails: guests,
                            flow: guests[0].flowCode,
                            flowCode: guests[0].flowCode,
                            mainFlow: guests[0].flowCode,
                            duration: guests[0].phase1_duration,
                            phase1_duration: guests[0].phase1_duration,
                            phase2_duration: guests[0].phase2_duration,
                            allocated_resource: guests[0].allocated_resource,
                            phase1_resource: guests[0].phase1_resource,
                            phase2_resource: guests[0].phase2_resource,
                            status: isStandby ? (window.BOOKING_STATUS ? window.BOOKING_STATUS.STANDBY : '??') : undefined,
                            proposedUpdates: [],
                            rowId: null
                        };
                    };

                    finalPayloads.push(buildPayload(detailedGuests1, loc1, form.time, noteStr1));
                    finalPayloads.push(buildPayload(detailedGuests2, loc2, p2TimeStr, noteStr2));

                } else {
                    let finalCheck = null;
                    if (!isStandby) {
                        finalCheck = callCoreAvailabilityCheck(form.date, form.time, guestDetails, checkBookings, serverData?.staff || safeStaffList, selectedLocation);

                        if (!finalCheck.valid) {
                            let suggestionsHtml = '';
                            let availableServices = [];
                            const allServices = (window.CoreKernel?.dynamicServices || window.SERVICES_DATA) || {};
                            const currentServiceCode = guestDetails[0].serviceCode || getServiceCodeByName(guestDetails[0].service);
                            
                            for(let svcCode in allServices) {
                                if(svcCode === currentServiceCode) continue;
                                
                                let mockGuestDetails = guestDetails.map(g => ({...g, service: allServices[svcCode].name, serviceCode: svcCode}));
                                let mockCheck = callCoreAvailabilityCheck(form.date, form.time, mockGuestDetails, checkBookings, serverData?.staff || safeStaffList, selectedLocation);
                                
                                if(mockCheck && mockCheck.valid) {
                                    availableServices.push(allServices[svcCode].name + ' (' + allServices[svcCode].duration + '??)');
                                }
                            }
                            
                            if(availableServices.length > 0) {
                                suggestionsHtml = '<br><br><b>? ?刻??畾萄???隞???</b><br><ul style="text-align:left; margin-top:5px; font-size:14px; display:inline-block;">' + availableServices.map(s => '<li>' + s + '</li>').join('') + '</ul>';
                            }
                            
                            Swal.fire({
                                title: '蝟餌絞?內',
                                html: "?? ?豢?撌脰??湛??⊥???嚗? + finalCheck.reason + suggestionsHtml,
                                icon: 'error'
                            });
                            setIsSubmitting(false);
                            return;
                        }
                    }

                    const detailedGuests = guestDetails.map((g, i) => {
                        const detail = finalCheck && finalCheck.details ? finalCheck.details.find(d => d.guestIndex === i) : null;
                        let finalFlow = detail ? detail.flow : 'SINGLE';

                        if (finalFlow === 'SINGLE') {
                            const svcCode = getServiceCodeByName(g.service);
                            if (svcCode && (window.CoreKernel?.dynamicServices || window.SERVICES_DATA) && (window.CoreKernel?.dynamicServices || window.SERVICES_DATA)[svcCode]) {
                                const svcDef = (window.CoreKernel?.dynamicServices || window.SERVICES_DATA)[svcCode];
                                const sType = (svcDef.type || 'BODY').toUpperCase();
                                if (sType === 'FOOT' || sType === 'CHAIR') finalFlow = 'FOOTSINGLE';
                                else finalFlow = 'BODYSINGLE';
                            } else {
                                if (g.service.toUpperCase().match(/FOOT|CHAIR|頞逖??)) finalFlow = 'FOOTSINGLE';
                                else finalFlow = 'BODYSINGLE';
                            }
                        }

                        let allocatedRes = "";
                        let phase1Res = "";
                        let phase2Res = "";
                        if (detail && detail.allocated && Array.isArray(detail.allocated)) {
                            allocatedRes = detail.allocated.join(' + ');
                            if (detail.allocated.length > 0) phase1Res = detail.allocated[0];
                            if (detail.allocated.length > 1) phase2Res = detail.allocated[1];
                        }

                        // [V116.3 FIX] Determine explicit resource_type (Column AD)
                        let explicitResourceType = 'CHAIR';
                        if (finalFlow === 'BODYSINGLE') explicitResourceType = 'BED';
                        else if (finalFlow === 'FOOTSINGLE') explicitResourceType = 'CHAIR';
                        else if (finalFlow === 'BF' || finalFlow === 'FB' || finalFlow === 'COMBO') explicitResourceType = 'COMBO';

                        return {
                            ...g,
                            serviceCode: getServiceCodeByName(g.service) || "",
                            staff: normalizeStaffId(g.staff),
                            flow: finalFlow,
                            flowCode: finalFlow,
                            phase1_duration: detail ? detail.phase1_duration : null,
                            phase2_duration: detail ? detail.phase2_duration : null,
                            allocated_resource: allocatedRes,
                            phase1_resource: phase1Res,
                            phase2_resource: phase2Res,
                            resource_type: explicitResourceType
                        };
                    });

                    const oils = detailedGuests.map((g, i) => g.isYouTui ? `K${i + 1}:瘝寞` : null).filter(Boolean);
                    const guaShas = detailedGuests.map((g, i) => g.isGuaSha ? `K${i + 1}:?桃` : null).filter(Boolean);
                    const huaGuans = detailedGuests.map((g, i) => g.isHuaGuan ? `K${i + 1}:皛?` : null).filter(Boolean);
                    const baGuans = detailedGuests.map((g, i) => g.isBaGuan ? `K${i + 1}:??` : null).filter(Boolean);
                    const flows = detailedGuests.map((g, i) => {
                        if (g.flow === 'BF') return `K${i + 1}:??頨恍?`;
                        if (g.flow === 'FB') return `K${i + 1}:???訢;
                        return null;
                    }).filter(Boolean);

                    const noteParts = [...oils, ...guaShas, ...huaGuans, ...baGuans, ...flows];
                    const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";

                    const payload = {
                        hoTen: finalCustName,
                        sdt: form.custPhone || "",
                        dichVu: detailedGuests.map(g => g.service).join(','),
                        pax: form.pax,
                        location: selectedLocation,
                        ngayDen: normalizeDateStrict(form.date), // [V134.1 N?NG C廕匕] Use Calendar Date
                        gioDen: form.time,
                        nhanVien: detailedGuests[0].staff,
                        isYouTui: detailedGuests[0].isYouTui,
                        isGuaSha: detailedGuests[0].isGuaSha,
                        isHuaGuan: detailedGuests[0].isHuaGuan,
                        isBaGuan: detailedGuests[0].isBaGuan,
                        serviceCode: detailedGuests[0].serviceCode,
                        staffId2: detailedGuests[1]?.staff || null,
                        staffId3: detailedGuests[2]?.staff || null,
                        staffId4: detailedGuests[3]?.staff || null,
                        staffId5: detailedGuests[4]?.staff || null,
                        staffId6: detailedGuests[5]?.staff || null,
                        staffId7: detailedGuests[6]?.staff || null,
                        staffId8: detailedGuests[7]?.staff || null,
                        staffId9: detailedGuests[8]?.staff || null,
                        ghiChu: noteStr,
                        adminNote: form.adminNote,
                        timeToArrive: form.timeToArrive,
                        guestDetails: detailedGuests,
                        flow: detailedGuests[0].flowCode,
                        flowCode: detailedGuests[0].flowCode,
                        mainFlow: detailedGuests[0].flowCode,
                        phase1_duration: detailedGuests[0].phase1_duration,
                        phase2_duration: detailedGuests[0].phase2_duration,

                        allocated_resource: detailedGuests[0].allocated_resource,
                        phase1_resource: detailedGuests[0].phase1_resource,
                        phase2_resource: detailedGuests[0].phase2_resource,
                        status: isStandby ? (window.BOOKING_STATUS ? window.BOOKING_STATUS.STANDBY : '??') : undefined,

                        proposedUpdates: finalCheck ? (finalCheck.proposedUpdates || []) : [],
                        rowId: editingBooking ? editingBooking.rowId : null
                    };

                    finalPayloads.push(payload);
                }

                if (onSave) {
                    await Promise.resolve(onSave(finalPayloads));
                    forceGlobalRefresh();
                    setTimeout(() => { onClose(); setIsSubmitting(false); }, 500);
                }
            } catch (err) { Swal.fire({ title: '蝟餌絞?內', html: "?脣?憭望?嚗? + (err.response?.data?.error || err.message), icon: 'error' }); setIsSubmitting(false); }
        };

        const configTime = window.SYSTEM_CONFIG?.OPERATION_TIME || { OPEN_HOUR: 8, CUT_OFF_HOUR: 2 };
        const HOURS_LIST = [];
        let endDisplayHr = (configTime.CUT_OFF_HOUR - 1 + 24) % 24;
        let currentHr = configTime.OPEN_HOUR;
        for (let i = 0; i < 24; i++) {
            HOURS_LIST.push(String(currentHr).padStart(2, '0'));
            if (currentHr === endDisplayHr) break;
            currentHr = (currentHr + 1) % 24;
        }
        const MINUTES_STEP = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
        const [cH, cM] = (form.time || "12:00").split(':');

        let dynamicMaxPax = 18;
        if (window.SYSTEM_CONFIG && window.SYSTEM_CONFIG.SCALE) {
            const configScale = window.SYSTEM_CONFIG.SCALE;
            const mainMax = (configScale.MAX_CHAIRS || 6) + (configScale.MAX_BEDS || 6);
            const oppMax = (configScale.OPP_CHAIRS || 4) + (configScale.OPP_BEDS || 6);
            if (selectedLocation === '?祇尹') {
                dynamicMaxPax = mainMax;
            } else if (selectedLocation === '撠擗?) {
                dynamicMaxPax = Math.min(oppMax, 8);
            } else {
                dynamicMaxPax = Math.max(mainMax, oppMax);
            }
        }
        const paxOptions = Array.from({ length: dynamicMaxPax }, (_, i) => i + 1);

        const guestDetailsBlock = (
            <div className="bg-slate-50 p-4 rounded-xl border-2 space-y-3">
                <div className="text-base font-bold text-gray-500 uppercase">閰喟敦?瘙?/div>
                {guestDetails.map((g, i) => {
                    const svcCode = getServiceCodeByName(g.service);
                    const svcDef = (window.CoreKernel?.dynamicServices || window.SERVICES_DATA) ? (window.CoreKernel?.dynamicServices || window.SERVICES_DATA)[svcCode] : null;
                    const cat = svcDef?.category || '';
                    const isCombo = cat === 'COMBO' || cat === 'MIXED';
                    let p1 = 0, p2 = 0;
                    let isDefault = true;
                    let flow = 'FB';
                    if (isCombo && svcDef) {
                        if (checkResult && checkResult.coreDetails && checkResult.coreDetails[i]) {
                            const detail = checkResult.coreDetails[i];
                            if (detail.phase1_duration !== undefined && detail.phase2_duration !== undefined) {
                                p1 = detail.phase1_duration;
                                p2 = detail.phase2_duration;
                                flow = detail.flow || 'FB';
                                isDefault = false;
                            }
                        }
                        if (isDefault) {
                            const dur = svcDef.duration || 60;
                            p1 = Math.floor(dur / 2);
                            p2 = dur - p1;
                        }
                    }
                    
                    return (
                    <div key={i} className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center overflow-x-auto pb-1">
                            <div className="w-10 shrink-0 h-[64px] rounded-lg bg-gray-200 hidden sm:flex items-center justify-center font-black text-lg text-slate-500">#{i + 1}</div>

                            <select className="w-[140px] sm:w-[200px] min-w-[100px] border-2 p-1 sm:p-2 rounded-lg font-bold text-sm sm:text-lg h-[64px] bg-white shrink-0" value={g.service} onChange={e => handleGuestUpdate(i, 'service', e.target.value)}>
                                {(window.SERVICES_LIST || []).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>

                            <select className="w-[80px] border-2 p-1 sm:p-2 rounded-lg font-bold text-sm sm:text-lg h-[64px] bg-white shrink-0" value={g.staff} onChange={e => handleGuestUpdate(i, 'staff', e.target.value)}>
                                <option value="?冽?">? ?冽?</option>
                                <option value="憟?>? 憟喳葦</option>
                                <option value="??>? ?瑕葦</option>
                                <optgroup label="?撣?>{safeStaffList.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</optgroup>
                            </select>

                            <button
                                onClick={(e) => { e.preventDefault(); if (!svcCode.startsWith('F')) handleGuestUpdate(i, 'toggleYouTui'); }}
                                disabled={svcCode.startsWith('F')}
                                className={`w-10 sm:w-12 px-0.5 shrink-0 border-2 rounded-lg font-bold text-xs sm:text-sm h-[64px] transition-colors flex flex-col items-center justify-center gap-0.5 ${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isYouTui ? 'bg-orange-100 text-orange-700 border-orange-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200')}`}
                            >
                                <span className={g.isYouTui ? "opacity-100" : "opacity-50"}>?</span>
                                <span>瘝寞</span>
                            </button>

                            <button
                                onClick={(e) => { e.preventDefault(); if (!svcCode.startsWith('F')) handleGuestUpdate(i, 'toggleGuaSha'); }}
                                disabled={svcCode.startsWith('F')}
                                className={`w-10 sm:w-12 px-0.5 shrink-0 border-2 rounded-lg font-bold text-xs sm:text-sm h-[64px] transition-colors flex flex-col items-center justify-center gap-0.5 ${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isGuaSha ? 'bg-red-100 text-red-700 border-red-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200')}`}
                            >
                                <span className={g.isGuaSha ? "opacity-100" : "opacity-50"}>?弩</span>
                                <span>?桃</span>
                            </button>

                            <button
                                onClick={(e) => { e.preventDefault(); if (!svcCode.startsWith('F')) handleGuestUpdate(i, 'toggleHuaGuan'); }}
                                disabled={svcCode.startsWith('F')}
                                className={`w-10 sm:w-12 px-0.5 shrink-0 border-2 rounded-lg font-bold text-xs sm:text-sm h-[64px] transition-colors flex flex-col items-center justify-center gap-0.5 ${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isHuaGuan ? 'bg-purple-100 text-purple-700 border-purple-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200')}`}
                            >
                                <span className={g.isHuaGuan ? "opacity-100" : "opacity-50"}>?</span>
                                <span>皛?</span>
                            </button>
                            
                            <button
                                onClick={(e) => { e.preventDefault(); if (!svcCode.startsWith('F')) handleGuestUpdate(i, 'toggleBaGuan'); }}
                                disabled={svcCode.startsWith('F')}
                                className={`w-10 sm:w-12 px-0.5 shrink-0 border-2 rounded-lg font-bold text-xs sm:text-sm h-[64px] transition-colors flex flex-col items-center justify-center gap-0.5 ${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isBaGuan ? 'bg-blue-100 text-blue-700 border-blue-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200')}`}
                            >
                                <span className={g.isBaGuan ? "opacity-100" : "opacity-50"}>?</span>
                                <span>??</span>
                            </button>

                            {isCombo && (
                                <div className="shrink-0 flex items-center pl-1 gap-2">
                                    <span className="text-sm sm:text-base text-orange-600 font-bold font-mono bg-orange-50 px-3 sm:px-4 py-1.5 rounded-lg border border-orange-200 whitespace-nowrap">
                                        {flow === 'BF' ? `頨?${p1} ; ??${p2}` : `??${p1} ; 頨?${p2}`}
                                    </span>
                                    <span className={`text-sm sm:text-base font-bold font-mono px-3 sm:px-4 py-1.5 rounded-lg border whitespace-nowrap ${flow === 'BF' ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
                                        {flow === 'BF' ? 'BF' : 'FB'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    );
                })}
            </div>
        );

        return (
            <>
                {/* --- M?N H?NH CH廙 H廙?(FULL-SCREEN OVERLAY) --- */}
                {showSurnamePicker && (
                    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-fadeIn">
                        <div className="bg-orange-600 p-6 text-white flex justify-between items-center shadow-md">
                            <h2 className="text-3xl font-bold">隢??瘞?/h2>
                            <button onClick={() => setShowSurnamePicker(false)} className="text-5xl px-4">&times;</button>
                        </div>
                        <div className="flex-1 p-2 sm:p-4 overflow-y-auto custom-scrollbar">
                            <div className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: 'repeat(19, minmax(0, 1fr))' }}>
                                {PREDEFINED_SURNAMES.map((char, index) => {
                                    if (!char) return <div key={`empty-${index}`} className="aspect-square"></div>;
                                    return (
                                        <button
                                            key={`${char}-${index}`}
                                            onClick={(e) => { e.preventDefault(); handleSurnameSelect(char); }}
                                            className="aspect-square flex items-center justify-center bg-orange-50 hover:bg-orange-500 hover:text-white border border-orange-200 rounded-lg font-bold text-4xl transition-colors shadow-sm"
                                        >
                                            {char}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="p-3 bg-slate-100 border-t border-slate-300">
                            <button
                                onClick={(e) => { e.preventDefault(); setShowSurnamePicker(false); }}
                                className="w-full bg-gray-400 text-white text-lg py-2.5 rounded-lg font-bold shadow-md hover:bg-gray-500 transition-colors"
                            >
                                ??
                            </button>
                        </div>
                    </div>
                )}

                {/* --- M?N H?NH MODAL CH?NH --- */}
                <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-2 sm:p-6">
                    <div className="bg-white w-full max-w-[1200px] rounded-2xl shadow-2xl flex flex-col h-[98vh] sm:h-[90vh] overflow-hidden animate-fadeIn">
                        <div className={`${editingBooking ? 'bg-orange-600' : 'bg-[#0891b2]'} p-4 sm:p-6 text-white flex justify-between items-center shrink-0`}>
                            <div className="flex items-center">
                                <h3 className="font-bold text-xl sm:text-2xl whitespace-nowrap">{editingBooking ? "?? 靽格??" : "?? ??"}</h3>
                                <div className="flex bg-white/20 rounded-lg p-1 ml-4 shadow-inner border border-white/30 hidden sm:flex">
                                    <button 
                                        onClick={(e) => { e.preventDefault(); setSelectedLocation('?祇尹'); setCheckResult(null); setSuggestions([]); }} 
                                        className={`px-4 py-1.5 rounded-md font-bold text-sm sm:text-base transition-all ${selectedLocation === '?祇尹' ? 'bg-white text-[#0891b2] shadow-md' : 'text-white hover:bg-white/10'}`}
                                    >?祇尹</button>
                                    <button 
                                        onClick={(e) => { e.preventDefault(); setSelectedLocation('撠擗?); setCheckResult(null); setSuggestions([]); }} 
                                        className={`px-4 py-1.5 rounded-md font-bold text-sm sm:text-base transition-all ${selectedLocation === '撠擗? ? 'bg-white text-[#0891b2] shadow-md' : 'text-white hover:bg-white/10'}`}
                                    >撠擗?/button>
                                    <button 
                                        onClick={(e) => { e.preventDefault(); setSelectedLocation('頝券尹憟?'); setCheckResult(null); setSuggestions([]); }} 
                                        className={`px-4 py-1.5 rounded-md font-bold text-sm sm:text-base transition-all ${selectedLocation === '頝券尹憟?' ? 'bg-white text-[#0891b2] shadow-md' : 'text-white hover:bg-white/10'}`}
                                    >頝券尹憟?</button>
                                </div>
                            </div>
                            {selectedLocation === '頝券尹憟?' && (
                                <div className="w-full mt-3 flex justify-center">
                                    <div className="flex bg-white/20 rounded-lg p-1 shadow-inner border border-white/30">
                                        <button 
                                            onClick={(e) => { e.preventDefault(); setCrossLocationDirection('MAIN_TO_OPP'); setCheckResult(null); }} 
                                            className={`px-4 py-1.5 rounded-md font-bold text-sm sm:text-base transition-all ${crossLocationDirection === 'MAIN_TO_OPP' ? 'bg-orange-500 text-white shadow-md' : 'text-white hover:bg-white/10'}`}
                                        >?祇尹(頞? ?∴? 撠擗?頨?</button>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); setCrossLocationDirection('OPP_TO_MAIN'); setCheckResult(null); }} 
                                            className={`px-4 py-1.5 rounded-md font-bold text-sm sm:text-base transition-all ${crossLocationDirection === 'OPP_TO_MAIN' ? 'bg-orange-500 text-white shadow-md' : 'text-white hover:bg-white/10'}`}
                                        >撠擗?頞? ?∴? ?祇尹(頨?</button>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end mt-2 sm:mt-0">
                                {step === 'CHECK' && (
                                    <>
                                        {!checkResult ? (
                                            <>
                                                <button
                                                    onClick={(e) => { e.preventDefault(); setIsStandbyMode(true); setStep('STANDBY_INFO'); }}
                                                    disabled={isChecking || isSubmitting}
                                                    className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-bold text-sm sm:text-lg shadow-lg border-2 transition-all flex items-center gap-2 ${isSubmitting ? 'bg-gray-400 border-gray-400 text-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 shadow-[0_0_10px_rgba(0,0,0,0.1)]'}`}
                                                >
                                                    ?? ??
                                                </button>
                                                <button
                                                    onClick={performCheck}
                                                    disabled={isChecking}
                                                    className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-bold text-sm sm:text-lg shadow-lg border-2 transition-all flex items-center gap-2 ${isChecking ? 'bg-orange-800 border-orange-700 text-orange-300 cursor-not-allowed' : 'bg-yellow-400 text-yellow-900 border-yellow-200 hover:bg-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.4)]'}`}
                                                >
                                                    {isChecking ? "??.." : "?? ?亥岷蝛箔?"}
                                                </button>
                                            </>
                                        ) : (
                                            <div className="flex items-center gap-2 animate-fadeIn bg-white/10 p-1 sm:p-1.5 rounded-xl border border-white/20">
                                                {/* Removed the green checkResult message banner per request */}

                                                {checkResult.status === 'OK' ? (
                                                    <button onClick={(e) => {
                                                        e.preventDefault();
                                                        const blacklist = serverData?.blacklist || window.SYSTEM_DATA?.blacklist || [];
                                                        if (blacklist.length > 0 && form.custPhone) {
                                                            const cleanPhone = form.custPhone.trim().replace(/\D/g, '');
                                                            if (cleanPhone) {
                                                                const isBlacklisted = blacklist.some(b => b.phone === cleanPhone);
                                                                if (isBlacklisted) {
                                                                    Swal.fire('蝟餌絞?內', '?? 甇日閰梯?蝣澆歇?暺??殷?????嚗?, 'error');
                                                                    return;
                                                                }
                                                            }
                                                        }
                                                        setStep('INFO');
                                                    }} className="px-3 sm:px-4 py-1.5 bg-emerald-500 text-white rounded-lg font-bold shadow-lg hover:bg-emerald-600 border border-emerald-400 whitespace-nowrap animate-pulse flex items-center gap-1">
                                                        <span>銝?甇?/span> <span>?∴?</span>
                                                    </button>
                                                ) : (
                                                    <button onClick={() => { setCheckResult(null); setSuggestions([]) }} className="px-3 sm:px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg font-bold shadow-md hover:bg-gray-300 border border-gray-400 whitespace-nowrap">
                                                        ?? ??亥岷
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                                {(step === 'INFO' || step === 'STANDBY_INFO') && (
                                    <div className="flex items-center gap-2 animate-fadeIn bg-white/10 p-1 sm:p-1.5 rounded-xl border border-white/20">
                                        <button onClick={(e) => { e.preventDefault(); if (!isSubmitting) setStep('CHECK'); }} className="px-3 sm:px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg font-bold shadow-md hover:bg-gray-300 border border-gray-400 whitespace-nowrap flex items-center gap-1" disabled={isSubmitting}>
                                            <span>漎?</span> <span>餈?</span>
                                        </button>
                                        <button onClick={(e) => handleFinalSave(e, isStandbyMode)} className="px-3 sm:px-4 py-1.5 bg-indigo-500 text-white rounded-lg font-bold shadow-lg hover:bg-indigo-600 border border-indigo-400 whitespace-nowrap flex items-center gap-1" disabled={isSubmitting}>
                                            {isSubmitting ? "????銝?.." : (editingBooking ? "? 靽?靽格" : "??蝣箄?")}
                                        </button>
                                    </div>
                                )}
                                <button onClick={onClose} className="text-4xl hover:text-red-100 leading-none ml-1 sm:ml-2">&times;</button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                            {(step === 'CHECK' || step === 'STANDBY_INFO') && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-lg font-bold text-gray-500 block">?交?</label>
                                                <div className="flex gap-1.5 pl-2">
                                                    <button onClick={(e) => { e.preventDefault(); handleDateShift(-1); }} className="w-10 h-8 flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg shadow-sm font-bold border border-slate-300 transition-colors tooltip tooltip-bottom" data-tip="??憭?>?</button>
                                                    <button onClick={(e) => { e.preventDefault(); handleDateShift(1); }} className="w-10 h-8 flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg shadow-sm font-bold border border-slate-300 transition-colors tooltip tooltip-bottom" data-tip="敺?憭?>??/button>
                                                </div>
                                            </div>
                                            <input type="date" className="w-full border-2 p-3 rounded-xl font-bold text-xl h-[64px] bg-slate-50" value={form.date} onChange={e => { setForm({ ...form, date: e.target.value }); setCheckResult(null); }} />
                                        </div>
                                        <div>
                                            <label className="text-lg font-bold text-gray-500 mb-1 block">??</label>
                                            <div className="flex items-center gap-2">
                                                <div className="relative flex-1">
                                                    <select className="w-full border-2 p-3 rounded-xl font-bold text-xl h-[64px] text-center bg-slate-50" value={cH} onChange={e => handleTimeChange('HOUR', e.target.value)}>
                                                        {HOURS_LIST.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </div>
                                                <span className="font-bold text-2xl">:</span>
                                                <div className="relative flex-1">
                                                    <select className="w-full border-2 p-3 rounded-xl font-bold text-xl h-[64px] text-center bg-slate-50" value={cM} onChange={e => handleTimeChange('MINUTE', e.target.value)}>
                                                        {MINUTES_STEP.map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-1 block">?餉店?Ⅳ</label>
                                        <input
                                            className="w-full border-2 border-slate-300 p-3 rounded-xl font-bold text-xl outline-none focus:border-indigo-500 bg-slate-50 h-[64px]"
                                            value={form.custPhone}
                                            onChange={e => setForm({ ...form, custPhone: e.target.value })}
                                            placeholder="09xx..."
                                            disabled={isSubmitting}
                                            type="tel"
                                        />
                                    </div>

                                    <div className="pt-2">
                                        {checkResult && checkResult.status === 'FAIL' && (
                                            <div className="space-y-4 animate-slideIn">
                                                <div className="p-5 rounded-xl text-center font-bold text-xl border-2 bg-red-50 text-red-700 border-red-300">
                                                    {(checkResult.message || "").split('\n').filter(line => line.includes('蝟餌絞?內嚗?)).map((line, idx) => (
                                                        <div key={'blue-'+idx} className="text-blue-600 mb-3">{line}</div>
                                                    ))}
                                                    {(checkResult.message || "").split('\n').filter(line => !line.includes('蝟餌絞?內嚗?)).map((line, idx) => (
                                                        <div key={'red-'+idx}>{line}</div>
                                                    ))}
                                                </div>
                                                {suggestions.length > 0 && (
                                                    <div className="bg-yellow-50 p-4 rounded-xl border-2 border-yellow-300 mt-4">
                                                        <div className="text-base font-bold text-yellow-800 mb-3">? 撱箄降?挾:</div>
                                                        <div className="flex gap-3 flex-wrap">
                                                            {suggestions.map(s => {
                                                                let displayLabel = s.time;
                                                                if (s.daysToAdd > 0) {
                                                                    const dParts = s.date.replace(/\//g, '-').split('-');
                                                                    if (dParts.length === 3) displayLabel = `${dParts[1]}/${dParts[2]} ${s.time}`;
                                                                }
                                                                return (
                                                                    <button key={`${s.date}-${s.time}`} onClick={() => { setForm(f => ({ ...f, time: s.time, date: s.date ? s.date.replace(/\//g, '-') : form.date })); setCheckResult(null); setSuggestions([]); setServiceSuggestions([]); }} className="px-5 py-2 bg-white border-2 border-yellow-400 text-yellow-900 rounded-lg font-bold text-lg hover:bg-yellow-200 whitespace-nowrap">
                                                                        {displayLabel}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {serviceSuggestions.length > 0 && (
                                                    <div className="bg-green-50 p-4 rounded-xl border-2 border-green-300 mt-4">
                                                        <div className="text-base font-bold text-green-800 mb-3">? ?刻??畾萄???隞???</div>
                                                        <div className="flex gap-3 flex-wrap">
                                                            {serviceSuggestions.map(svc => (
                                                                <button key={svc} onClick={(e) => { e.preventDefault(); let newGuests = [...guestDetails]; newGuests[0].service = svc; setGuestDetails(newGuests); setCheckResult(null); setSuggestions([]); setServiceSuggestions([]); }} className="px-5 py-2 bg-white border-2 border-green-400 text-green-900 rounded-lg font-bold text-lg hover:bg-green-200 whitespace-nowrap">
                                                                    {svc}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-1 block">鈭箸</label>
                                        <select className="w-full border-2 p-3 rounded-xl font-bold text-xl text-center h-[64px] bg-slate-50" value={form.pax} onChange={e => handlePaxChange(e.target.value)}>
                                            {paxOptions.map(n => <option key={n} value={n}>{n} 雿?/option>)}
                                        </select>
                                    </div>

                                        {step === 'CHECK' && guestDetailsBlock}
                                </>
                            )}

                            {(step === 'INFO' || step === 'STANDBY_INFO') && (
                                <div className="space-y-6 animate-slideIn flex flex-col h-full">
                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-2 block">憿批恥憪?</label>
                                        <div className="flex gap-3">
                                            <input
                                                className="flex-[2] border-2 border-slate-300 p-4 rounded-xl font-bold text-2xl outline-none focus:border-indigo-500"
                                                value={form.custName}
                                                onChange={e => setForm({ ...form, custName: e.target.value })}
                                                placeholder="頛詨憪?..."
                                                disabled={isSubmitting}
                                            />
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleTitleToggle('??'); }}
                                                className={`flex-[1] border-2 rounded-xl font-bold text-xl transition-colors whitespace-nowrap ${form.custTitle === '??' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'}`}
                                            >
                                                ??
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleTitleToggle('撠?'); }}
                                                className={`flex-[1] border-2 rounded-xl font-bold text-xl transition-colors whitespace-nowrap ${form.custTitle === '撠?' ? 'bg-pink-600 text-white border-pink-600 shadow-md' : 'bg-pink-50 text-pink-700 border-pink-300 hover:bg-pink-100'}`}
                                            >
                                                撠?
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); setShowSurnamePicker(true); }}
                                                className="flex-[1] bg-orange-100 text-orange-700 border-2 border-orange-400 rounded-xl font-bold text-xl hover:bg-orange-200 transition-colors shadow-sm whitespace-nowrap"
                                                title="?豢?憪?"
                                            >
                                                憪?
                                            </button>
                                        </div>
                                    </div>



                                    {step === 'INFO' && (
                                        <div className="mb-4">
                                            <label className="text-lg font-bold text-gray-500 mb-2 block">?餉店?Ⅳ</label>
                                            <input
                                                className="w-full border-2 border-slate-300 p-4 rounded-xl font-bold text-xl outline-none focus:border-indigo-500 bg-slate-50"
                                                value={form.custPhone}
                                                onChange={e => setForm({ ...form, custPhone: e.target.value })}
                                                placeholder="09xx..."
                                                disabled={isSubmitting}
                                                type="tel"
                                            />
                                        </div>
                                    )}
                                    {step === 'STANDBY_INFO' && (
                                        <div className="mb-4">
                                            <label className="text-lg font-bold text-orange-500 mb-2 block">??憭??圈? (??撠)</label>
                                            <select
                                                className="w-full border-2 border-orange-300 p-4 rounded-xl font-bold text-xl outline-none focus:border-orange-500 bg-orange-50 text-orange-800"
                                                value={form.timeToArrive}
                                                onChange={e => setForm({ ...form, timeToArrive: e.target.value })}
                                                disabled={isSubmitting}
                                            >
                                                <option value="">隢?????..</option>
                                                <option value="5??">5 ??</option>
                                                <option value="10??">10 ??</option>
                                                <option value="15??">15 ??</option>
                                                <option value="20??">20 ??</option>
                                                <option value="30??">30 ??</option>
                                                <option value="45??">45 ??</option>
                                                <option value="1撠?">1 撠?</option>
                                                <option value="1撠?隞乩?">1 撠?隞乩?</option>
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-2 block">?孵閬? / ?酉</label>
                                        <div className="flex gap-3">
                                            <input
                                                className="flex-[2] border-2 border-slate-300 p-4 rounded-xl font-bold text-xl outline-none focus:border-indigo-500"
                                                value={form.adminNote}
                                                onChange={e => setForm({ ...form, adminNote: e.target.value })}
                                                placeholder="頛詨?孵閬?..."
                                                disabled={isSubmitting}
                                            />
                                            <select
                                                className="flex-[1] border-2 border-orange-300 bg-orange-50 text-orange-800 p-4 rounded-xl font-bold text-xl outline-none cursor-pointer"
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        setForm(prev => ({
                                                            ...prev,
                                                            adminNote: prev.adminNote ? prev.adminNote + ' ' + val : val
                                                        }));
                                                        e.target.value = ""; // Reset dropdown after selection
                                                    }
                                                }}
                                                disabled={isSubmitting}
                                            >
                                                <option value="">??敹恍??/option>
                                                {safeQuickNotes.map((note, idx) => (
                                                    <option key={idx} value={note}>{note}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {step === 'INFO' && (
                                        <div className="bg-green-50 p-4 rounded-xl border-2 border-green-300 text-green-900 font-bold mt-auto mb-4">
                                        <div className="flex justify-between border-b-2 border-green-200 pb-3 mb-3 text-xl">
                                            <span>{form.date}</span>
                                            <span>{form.time}</span>
                                        </div>
                                        <div className="text-lg font-normal space-y-2">
                                            {checkResult && checkResult.coreDetails && checkResult.coreDetails.map((d, i) => (
                                                <div key={i} className="flex justify-between items-center bg-white p-2 rounded-lg border border-green-200 shadow-sm">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold">#{i + 1} {d.service}</span>
                                                        {(d.phase1_duration && d.phase2_duration) && (
                                                            <span className="text-sm sm:text-base text-orange-600 font-bold font-mono">
                                                                {d.flow === 'BF' ? `頨?${d.phase1_duration} ; ??${d.phase2_duration}` : `??${d.phase1_duration} ; 頨?${d.phase2_duration}`}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="flex gap-2">
                                                            <span className="bg-green-100 px-3 py-1 rounded-md text-green-800 text-sm font-bold">{d.staff}</span>
                                                            {d.flow === 'BF' && <span className="bg-orange-100 px-3 py-1 rounded-md text-orange-800 border border-orange-300 text-sm font-bold">?? ??頨恍?</span>}
                                                            {d.flow === 'FB' && <span className="bg-blue-100 px-3 py-1 rounded-md text-blue-800 border border-blue-300 text-sm font-bold">?朱 ????/span>}
                                                        </div>
                                                        {d.allocated && d.allocated.length > 0 && (
                                                            <div className="text-sm text-gray-500 font-mono mt-1">
                                                                ?? {d.allocated.join(' -> ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    )}

                                    {step === 'STANDBY_INFO' && guestDetailsBlock}

                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </>
        );
    };

    const overrideInterval = setInterval(() => {
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) {
            window.AvailabilityCheckModal = NewAvailabilityCheckModal;
            console.log("?鳴? AvailabilityModal Injected (V116.6 - SMART DUAL-DATE, BUTTONS & UI FIX)");
        }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);

})();


if (window.SERVICES_DATA && typeof window.cyxUpdateServices === 'function') { window.cyxUpdateServices(window.SERVICES_DATA); }

if (window.SERVICES_DATA && typeof window.cyxUpdateServices === 'function') { window.cyxUpdateServices(window.SERVICES_DATA); }

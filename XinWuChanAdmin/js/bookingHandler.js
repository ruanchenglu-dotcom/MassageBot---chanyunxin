/**
 * ============================================================================
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V96 (HYBRID INTERLEAVING & SEQUENCE AWARENESS)
 * NGÀY CẬP NHẬT: 2026-01-12
 * TÁC GIẢ: AI ASSISTANT & USER
 *
 * * * * * * * * * * * NHẬT KÝ NÂNG CẤP (V96):
 * 1. [CORE V7.5 EMBEDDED]:
 * - Tích hợp thuật toán "Hybrid Interleaving" (Đan xen tài nguyên).
 * - Hỗ trợ vòng lặp hoán vị (Permutation Loop) để tìm kịch bản Body-First (BF).
 *
 * 2. [SEQUENCE AWARENESS]:
 * - UI nhận diện được quy trình 'FB' (Xuôi) hay 'BF' (Ngược).
 * - Hiển thị cảnh báo "Body First" cho lễ tân tại bước xác nhận.
 *
 * 3. [PAYLOAD ENRICHMENT]:
 * - Gửi kèm thông tin `flow` ('FB'/'BF') trong object `guestDetails` lên Server.
 * - Tự động append note `[BodyFirst]` vào ghi chú tổng.
 * ============================================================================
 */

(function() {
    console.log("🚀 BookingHandler V96: Initializing with HYBRID INTERLEAVING...");

    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React not found. Cannot start BookingHandler.");
        return;
    }

    // ========================================================================
    // PHẦN 1: CORE KERNEL V7.5 (HYBRID INTERLEAVING LOGIC)
    // Mô tả: Bộ não xử lý logic va chạm, co giãn và ĐẢO CHIỀU quy trình.
    // ========================================================================
    const CoreKernel = (function() {
        
        // --- 1. CẤU HÌNH HỆ THỐNG ---
        const CONFIG = {
            MAX_CHAIRS: 6,        
            MAX_BEDS: 6,          
            MAX_TOTAL_GUESTS: 12, 
            OPEN_HOUR: 8,         
            CLEANUP_BUFFER: 5,    
            TRANSITION_BUFFER: 5, 
            TOLERANCE: 1,         
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
        }

        // --- 3. TIỆN ÍCH THỜI GIAN ---
        function getMinsFromTimeStr(timeStr) {
            if (!timeStr) return -1; 
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

        // --- 4. KIỂM TRA TÀI NGUYÊN (LINE SWEEP) ---
        function checkResourceCapacity(resourceType, start, end, bookings) {
            let limit = 0;
            if (resourceType === 'BED') limit = CONFIG.MAX_BEDS;
            else if (resourceType === 'CHAIR') limit = CONFIG.MAX_CHAIRS;
            else if (resourceType === 'TOTAL') limit = CONFIG.MAX_TOTAL_GUESTS;
            else return true; 

            let relevantBookings = bookings.filter(bk => {
                let isTypeMatch = (resourceType === 'TOTAL') ? true : (bk.resourceType === resourceType);
                return isTypeMatch && isOverlap(start, end, bk.start, bk.end);
            });

            if (relevantBookings.length === 0) return true;

            let points = [];
            points.push({ time: start, type: 'check_start' });
            points.push({ time: end, type: 'check_end' });

            relevantBookings.forEach(bk => {
                points.push({ time: bk.start, type: 'start' });
                points.push({ time: bk.end, type: 'end' });
            });

            points.sort((a, b) => {
                if (a.time !== b.time) return a.time - b.time;
                const priority = { 'start': 1, 'check_start': 2, 'check_end': 3, 'end': 4 };
                return priority[a.type] - priority[b.type];
            });

            let currentLoad = 0;
            for (const p of points) {
                if (p.type === 'start') currentLoad++;
                else if (p.type === 'end') currentLoad--;
                
                if (p.time >= start && p.time < end) {
                     if (currentLoad > limit) return false;
                }
            }
            return true; 
        }

        // --- 5. TÌM NHÂN VIÊN ---
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
                if (!staffInfo || staffInfo.off) return false; 
                
                const shiftStart = getMinsFromTimeStr(staffInfo.start); 
                const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
                
                if (shiftStart === -1 || shiftEnd === -1) return false; 
                if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
                
                const isStrict = staffInfo.isStrictTime === true;
                if (isStrict) { if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; } 
                else { if (start > shiftEnd) return false; }

                for (const b of busyList) {
                    if (b.staffName === name && isOverlap(start, end, b.start, b.end)) return false; 
                }

                if (staffReq === 'MALE' && staffInfo.gender !== 'M') return false;
                if ((staffReq === 'FEMALE' || staffReq === '女') && staffInfo.gender !== 'F') return false;

                return true; 
            };

            if (staffReq && staffReq !== 'RANDOM' && staffReq !== 'MALE' && staffReq !== 'FEMALE' && staffReq !== '隨機' && staffReq !== 'Any' && staffReq !== 'undefined') {
                return checkOneStaff(staffReq) ? staffReq : null;
            } else {
                const allStaffNames = Object.keys(staffListRef);
                for (const name of allStaffNames) {
                    if (checkOneStaff(name)) return name;
                }
                return null;
            }
        }

        // --- 6. SINH BIẾN THỂ ELASTIC ---
        function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
            if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
                return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999 }];
            }
            const standardHalf = Math.floor(totalDuration / 2);
            let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];
            if (!step || !limit || step <= 0 || limit <= 0) return options;
            let currentDeviation = step;
            while (currentDeviation <= limit) {
                let p1_A = standardHalf - currentDeviation; let p2_A = totalDuration - p1_A;
                if (p1_A >= 15 && p2_A >= 15) options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
                let p1_B = standardHalf + currentDeviation; let p2_B = totalDuration - p1_B;
                if (p1_B >= 15 && p2_B >= 15) options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
                currentDeviation += step;
            }
            options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
            return options;
        }

        // --- 7. MAIN LOGIC (V7.5 HYBRID INTERLEAVING) ---
        function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

            // A. PHÂN LOẠI HARD/SOFT
            let hardBookings = [];
            let softBookings = [];
            
            currentBookingsRaw.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                if (bStart === -1) return;
                let svcInfo = SERVICES[b.serviceCode] || {};
                let isCombo = svcInfo.category === 'COMBO' || b.serviceName.includes('Combo') || b.serviceName.includes('套餐');
                let duration = b.duration || 60;
                const isElasticCandidate = isCombo && (b.isManualLocked !== true) && (b.status !== 'Running');

                if (isElasticCandidate) {
                    softBookings.push({
                        id: b.rowId, originalData: b, staffName: b.staffName,
                        serviceName: b.serviceName, duration: duration, startMins: bStart,
                        elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
                        currentPhase1: b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration/2)
                    });
                } else {
                    if (isCombo) {
                        let p1 = Math.floor(duration / 2);
                        if (b.phase1_duration) p1 = parseInt(b.phase1_duration);
                        hardBookings.push({ start: bStart, end: bStart + p1, resourceType: 'CHAIR', staffName: b.staffName, isSoft: false });
                        hardBookings.push({ start: bStart + p1 + CONFIG.TRANSITION_BUFFER, end: bStart + duration, resourceType: 'BED', staffName: b.staffName, isSoft: false });
                    } else {
                        let rType = svcInfo.type || 'CHAIR';
                        if (b.serviceName.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
                        hardBookings.push({ start: bStart, end: bStart + duration, resourceType: rType, staffName: b.staffName, isSoft: false });
                    }
                }
            });

            // B. TIMELINE CƠ SỞ
            let baselineTimeline = [...hardBookings];
            softBookings.forEach(soft => {
                const p1 = soft.currentPhase1; const p2 = soft.duration - p1;
                const p1End = soft.startMins + p1;
                const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                baselineTimeline.push({ start: soft.startMins, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: 'CHAIR', staffName: soft.staffName, isSoft: true, softId: soft.id });
                baselineTimeline.push({ start: p2Start, end: p2Start + p2 + CONFIG.CLEANUP_BUFFER, resourceType: 'BED', staffName: soft.staffName, isSoft: true, softId: soft.id });
            });

            // C. VÒNG LẶP HOÁN VỊ (PERMUTATION LOOP)
            const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
            const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return s && s.category === 'COMBO'; });
            const maxBF = comboGuests.length;
            let successfulScenario = null;

            // Thử kịch bản: i người làm Body First (BF)
            for (let numBF = 0; numBF <= maxBF; numBF++) {
                let scenarioDetails = [];
                let scenarioUpdates = [];
                let scenarioTimeline = [...baselineTimeline];
                let scenarioFailed = false;
                let scenarioSofts = [...softBookings];
                let softConflictIds = new Set();
                let newGuestBlocksMap = [];

                // 1. Setup Blocks & Flow
                for (const ng of newGuests) {
                    const svc = SERVICES[ng.serviceCode];
                    if (!svc) { scenarioFailed = true; break; }
                    let flow = 'FB'; // Default
                    if (svc.category === 'COMBO') {
                        const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                        if (cIdx < numBF) flow = 'BF'; // Interleave
                    }

                    const duration = svc.duration;
                    let blocks = [];
                    if (svc.category === 'COMBO') {
                        const p1Standard = Math.floor(duration / 2);
                        const p2Standard = duration - p1Standard;
                        if (flow === 'FB') {
                            const t1End = requestStartMins + p1Standard;
                            const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                            blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                            blocks.push({ start: t2Start, end: t2Start + p2Standard + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                            scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'FB', timeStr: timeStr });
                        } else {
                            // Body First
                            const t1End = requestStartMins + p2Standard;
                            const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                            blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                            blocks.push({ start: t2Start, end: t2Start + p1Standard + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                            scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'BF', timeStr: timeStr });
                        }
                    } else {
                        let rType = svc.type || 'CHAIR';
                        if (svc.name.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
                        blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONFIG.CLEANUP_BUFFER, type: rType });
                        scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, flow: 'SINGLE', timeStr: timeStr });
                    }
                    newGuestBlocksMap.push({ guest: ng, blocks: blocks });
                }
                if (scenarioFailed) continue;

                // 2. Check Resource Collision
                let allNewBlocks = []; newGuestBlocksMap.forEach(item => allNewBlocks.push(...item.blocks));
                let hardConflict = false;

                for (const block of allNewBlocks) {
                    if (!checkResourceCapacity(block.type, block.start, block.end, scenarioTimeline)) {
                        const blockers = scenarioTimeline.filter(existing => existing.resourceType === block.type && isOverlap(block.start, block.end, existing.start, existing.end));
                        const hardLoad = blockers.filter(b => !b.isSoft).length;
                        const softBlockers = blockers.filter(b => b.isSoft);
                        let limit = (block.type === 'BED') ? CONFIG.MAX_BEDS : CONFIG.MAX_CHAIRS;
                        if (hardLoad >= limit) { hardConflict = true; break; }
                        softBlockers.forEach(sb => softConflictIds.add(sb.softId));
                    }
                }
                if (hardConflict) { scenarioFailed = true; continue; }

                // 3. Smart Squeeze within Scenario
                if (softConflictIds.size > 0) {
                    let squeezeSuccess = true;
                    let trialTimeline = scenarioTimeline.filter(b => !Array.from(softConflictIds).includes(b.softId));
                    
                    for (const softId of softConflictIds) {
                        const softBooking = softBookings.find(s => s.id === softId);
                        if (!softBooking) { squeezeSuccess = false; break; }
                        const softSplits = generateElasticSplits(softBooking.duration, softBooking.elasticStep, softBooking.elasticLimit);
                        let foundFitForSoft = false;

                        for (const sSplit of softSplits) {
                            const sP1End = softBooking.startMins + sSplit.p1;
                            const sP2Start = sP1End + CONFIG.TRANSITION_BUFFER;
                            const softBlocks = [
                                { start: softBooking.startMins, end: sP1End + CONFIG.CLEANUP_BUFFER, resourceType: 'CHAIR', staffName: softBooking.staffName, isSoft: true, softId: softId },
                                { start: sP2Start, end: sP2Start + sSplit.p2 + CONFIG.CLEANUP_BUFFER, resourceType: 'BED', staffName: softBooking.staffName, isSoft: true, softId: softId }
                            ];
                            let sFitTrial = softBlocks.every(sb => checkResourceCapacity(sb.resourceType, sb.start, sb.end, trialTimeline));
                            if (!sFitTrial) continue;
                            let tempWithSoft = [...trialTimeline, ...softBlocks];
                            let sFitNewGuest = allNewBlocks.every(nb => checkResourceCapacity(nb.type, nb.start, nb.end, tempWithSoft));
                            if (sFitNewGuest) {
                                foundFitForSoft = true;
                                trialTimeline.push(...softBlocks);
                                if (sSplit.deviation !== 0) {
                                    scenarioUpdates.push({ rowId: softId, customerName: softBooking.originalData.customerName, newPhase1: sSplit.p1, newPhase2: sSplit.p2, reason: 'Squeezed for Interleaving' });
                                }
                                break;
                            }
                        }
                        if (!foundFitForSoft) { squeezeSuccess = false; break; }
                    }
                    if (!squeezeSuccess) { scenarioFailed = true; continue; }
                    else { scenarioTimeline = trialTimeline; }
                }

                // 4. Staff Check
                let staffAssignmentSuccess = true;
                let finalTimelineForStaffCheck = [...scenarioTimeline];
                for (const item of newGuestBlocksMap) {
                    const guest = item.guest;
                    // Check availability against timeline + other new guests' allocated blocks
                    const assignedStaff = findAvailableStaff(guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length-1].end, staffList, finalTimelineForStaffCheck);
                    if (!assignedStaff) { staffAssignmentSuccess = false; break; }
                    const detail = scenarioDetails.find(d => d.guestIndex === guest.idx);
                    if (detail) detail.staff = assignedStaff;
                    item.blocks.forEach(b => finalTimelineForStaffCheck.push({ ...b, staffName: assignedStaff }));
                }
                if (!staffAssignmentSuccess) { scenarioFailed = true; continue; }

                // 5. Final Total Check
                if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 5, finalTimelineForStaffCheck)) { scenarioFailed = true; continue; }

                // SUCCESS FOUND
                successfulScenario = { details: scenarioDetails, updates: scenarioUpdates };
                break; // Break the numBF loop
            }

            if (successfulScenario) {
                successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
                return { feasible: true, strategy: 'HYBRID_INTERLEAVING_V7.5', details: successfulScenario.details, proposedUpdates: successfulScenario.updates, totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0) };
            } else {
                return { feasible: false, reason: "Hết chỗ (Đã thử đan xen & co giãn nhưng vẫn quá tải)" };
            }
        }

        return { checkRequestAvailability, setDynamicServices };
    })();

    // ========================================================================
    // PHẦN 2: ANTI-CACHE DATA FETCHER (V93 - KEEP)
    // ========================================================================
    const fetchLiveServerData = async (isForceRefresh = false) => {
        const apiUrl = window.API_URL || window.GAS_API_URL || (window.CONFIG && window.CONFIG.API_URL);
        if (!apiUrl) { console.warn("⚠️ Warning: API_URL missing."); return null; }
        try {
            const params = [`_t=${new Date().getTime()}`];
            if (isForceRefresh) params.push('forceRefresh=true');
            const targetUrl = apiUrl.includes('?') ? `${apiUrl}&${params.join('&')}` : `${apiUrl}?${params.join('&')}`;
            const response = await fetch(targetUrl);
            const data = await response.json();
            if (data && data.staff && data.bookings) return data;
            return null;
        } catch (err) { console.error("❌ Fetch Failed", err); return null; }
    };

    // ========================================================================
    // PHẦN 3: BRIDGE LOGIC & REACT COMPONENT
    // ========================================================================
    const { useState, useEffect, useMemo, useCallback } = React;

    const syncServicesToCore = () => {
        const rawServices = window.SERVICES_DATA || {};
        const formattedServices = {};
        Object.keys(rawServices).forEach(key => {
            const svc = rawServices[key];
            formattedServices[key] = {
                name: svc.name || key, duration: parseInt(svc.duration) || 60,
                type: svc.type ? svc.type.toUpperCase() : 'BODY', category: svc.category || 'SINGLE', price: svc.price || 0,
                elasticStep: svc.elasticStep || 0, elasticLimit: svc.elasticLimit || 0
            };
        });
        CoreKernel.setDynamicServices(formattedServices);
    };

    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList) => {
        syncServicesToCore();
        const now = new Date();
        const coreGuests = guests.map(g => ({
            serviceCode: g.service,
            staffName: g.staff === '隨機' ? 'RANDOM' : (g.staff === '女' || g.staff === 'FEMALE_OIL') ? 'FEMALE' : (g.staff === '男') ? 'MALE' : g.staff
        }));

        const targetDateStandard = date.replace(/-/g, '/');
        const targetDateSheetHeader = date.replace(/\//g, '-');

        const coreBookings = (Array.isArray(bookings) ? bookings : []).filter(b => {
            if (!b || !b.startTimeString || (b.status && (b.status.includes('hủy') || b.status.includes('Cancel')))) return false;
            return b.startTimeString.split(' ')[0].replace(/-/g, '/') === targetDateStandard;
        }).map(b => {
            let isPastOrRunning = false;
            try { if (new Date(b.startTimeString) <= now) isPastOrRunning = true; } catch (e) {}
            return {
                serviceCode: b.serviceName, serviceName: b.serviceName, startTime: b.startTimeString, 
                duration: parseInt(b.duration) || 60, staffName: b.technician || b.staffId || "Unassigned", rowId: b.rowId,
                isManualLocked: (b.isManualLocked === true || String(b.isManualLocked) === 'true') || isPastOrRunning, 
                phase1_duration: b.phase1_duration ? parseInt(b.phase1_duration) : null,
                status: isPastOrRunning ? 'Running' : (b.status || 'Reserved') 
            };
        });

        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = String(s.id).trim();
                const rawStart = s['上班'] || s.shiftStart || s.start || "00:00";
                const rawEnd = s['下班'] || s.shiftEnd || s.end || "00:00";
                const dayStatus = s[targetDateSheetHeader] || s[targetDateStandard] || "";
                let isOff = (String(s.offDays || "").includes(targetDateStandard) || String(dayStatus).toUpperCase().includes('OFF'));
                staffMap[sId] = {
                    id: sId, gender: s.gender, start: rawStart, end: rawEnd,
                    isStrictTime: (s.isStrictTime === true || s.isStrictTime === 'TRUE'), off: isOff
                };
                if (s.name) staffMap[s.name] = staffMap[sId];
            });
        }

        try {
            const result = CoreKernel.checkRequestAvailability(date, time, coreGuests, coreBookings, staffMap);
            return result.feasible 
                ? { valid: true, details: result.details, proposedUpdates: result.proposedUpdates } 
                : { valid: false, reason: result.reason };
        } catch (err) {
            console.error("Core Check Error:", err);
            return { valid: false, reason: "System Error: " + err.message };
        }
    };

    const forceGlobalRefresh = () => { if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender(); else window.location.reload(); };

    // ==================================================================================
    // 4. COMPONENT: PHONE BOOKING MODAL (V96)
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [isChecking, setIsChecking] = useState(false); 
        const [serverData, setServerData] = useState(null);

        useEffect(() => {
            fetchLiveServerData(true).then(data => { if (data) setServerData(data); });
        }, []);

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

        const performCheck = async (e) => {
            if (e) e.preventDefault();
            setIsChecking(true); setCheckResult(null); setSuggestions([]);
            let currentStaffList = serverData?.staff || safeStaffList;
            let currentBookings = serverData?.bookings || safeBookings;
            if (!serverData) {
                const freshData = await fetchLiveServerData(false);
                if (freshData) { setServerData(freshData); currentStaffList = freshData.staff; currentBookings = freshData.bookings; }
            }
            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, currentBookings, currentStaffList);
            if (res.valid) { 
                // V96: Lưu chi tiết kết quả (bao gồm flow) vào state
                setCheckResult({ status: 'OK', message: "✅ 此時段可預約 (Available)", coreDetails: res.details }); 
            } else {
                setCheckResult({ status: 'FAIL', message: res.reason });
                const found = [];
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0]||0)*60 + (parts[1]||0);
                for (let i=1; i<=24; i++) {
                    let nM = currMins + (i*10); let h = Math.floor(nM/60); let m = nM%60; if(h>=24) h-=24;
                    let tStr = `${String(h).padStart(2,'0')}:${String(Math.floor(m/10)*10).padStart(2,'0')}`;
                    if (callCoreAvailabilityCheck(form.date, tStr, guestDetails, currentBookings, currentStaffList).valid) {
                        found.push(tStr); if(found.length>=4) break;
                    }
                }
                setSuggestions(found);
            }
            setIsChecking(false);
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入顧客姓名！"); return; }
            setIsSubmitting(true);
            try {
                // [V96] Final Recalculation to capture 'flow' and 'proposedUpdates'
                const finalCheck = callCoreAvailabilityCheck(form.date, form.time, guestDetails, serverData?.bookings || safeBookings, serverData?.staff || safeStaffList);
                
                // [V96] Construct Guest Details with FLOW Info
                const detailedGuests = guestDetails.map((g, i) => {
                    const detail = finalCheck.details ? finalCheck.details.find(d => d.guestIndex === i) : null;
                    return {
                        ...g,
                        staff: detail ? detail.staff : g.staff, // Use assigned staff
                        flow: detail ? detail.flow : 'FB', // Important: Capture 'BF' or 'FB'
                        phase1_duration: detail ? detail.phase1_duration : null,
                        phase2_duration: detail ? detail.phase2_duration : null
                    };
                });

                // [V96] Append Flow Notes to comments
                const oils = guestDetails.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean);
                const flows = detailedGuests.map((g,i)=>g.flow==='BF'?`K${i+1}:先做身體`:null).filter(Boolean);
                const noteParts = [...oils, ...flows];
                const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";
                
                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: detailedGuests.map(g=>g.service).join(','), pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: detailedGuests[0].staff, isOil: detailedGuests[0].isOil,
                    staffId2: detailedGuests[1]?.staff||null, staffId3: detailedGuests[2]?.staff||null,
                    staffId4: detailedGuests[3]?.staff||null, staffId5: detailedGuests[4]?.staff||null, staffId6: detailedGuests[5]?.staff||null,
                    ghiChu: noteStr, 
                    guestDetails: detailedGuests, // Send full details with flow
                    proposedUpdates: finalCheck.proposedUpdates || []
                };
                
                if (onSave) { await Promise.resolve(onSave(payload)); forceGlobalRefresh(); setTimeout(()=>{onClose();setIsSubmitting(false);}, 500); }
            } catch(err) { alert("儲存失敗: "+err.message); setIsSubmitting(false); }
        };

        const HOURS_LIST = ['08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','00','01','02'];
        const MINUTES_STEP = ['00', '10', '20', '30', '40', '50'];
        const [cH, cM] = (form.time || "12:00").split(':');
        const paxOptions = [1,2,3,4,5,6];

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
                    <div className="bg-[#0891b2] p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">📅 電話預約 (V96 Hybrid)</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step==='CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold text-gray-500">日期</label><input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form,date:e.target.value});setCheckResult(null);}}/></div>
                                    <div><label className="text-xs font-bold text-gray-500">時間</label>
                                    <div className="flex items-center gap-1"><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cH} onChange={e=>handleTimeChange('HOUR',e.target.value)}>{HOURS_LIST.map(h=><option key={h} value={h}>{h}</option>)}</select></div><span className="font-bold">:</span><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cM} onChange={e=>handleTimeChange('MINUTE',e.target.value)}>{MINUTES_STEP.map(m=><option key={m} value={m}>{m}</option>)}</select></div></div></div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2"><div className="text-xs font-bold text-gray-400">詳細需求</div>
                                    {guestDetails.map((g,i)=>(
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師</option><option value="FEMALE_OIL">🚺+油</option><option value="男">🚹 男師</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
                                    ))}
                                </div>
                                <div>
                                    {!checkResult ? 
                                        <button onClick={performCheck} disabled={isChecking} className={`w-full text-white p-3 rounded font-bold shadow-lg flex justify-center items-center ${isChecking ? 'bg-gray-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                                            {isChecking ? "正在計算..." : "🔍 查詢空位 (Instant Check)"}
                                        </button> 
                                        : 
                                        <div className="space-y-3">
                                            <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>
                                            {checkResult.status==='FAIL'&&suggestions.length>0&&(<div className="bg-yellow-50 p-3 rounded border border-yellow-200"><div className="text-xs font-bold text-yellow-700 mb-2">💡 建議時段:</div><div className="flex gap-2 flex-wrap">{suggestions.map(t=><button key={t} onClick={()=>{setForm(f=>({...f,time:t}));setCheckResult(null);setSuggestions([]);}} className="px-3 py-1 bg-white border border-yellow-300 text-yellow-800 rounded font-bold hover:bg-yellow-100">{t}</button>)}</div></div>)}
                                            {checkResult.status==='OK'?<button onClick={()=>setStep('INFO')} className="w-full bg-emerald-600 text-white p-3 rounded font-bold shadow-lg animate-pulse hover:bg-emerald-700">➡️ 下一步</button>:<button onClick={()=>{setCheckResult(null);setSuggestions([])}} className="w-full bg-gray-400 text-white p-3 rounded font-bold hover:bg-gray-500">🔄 重新選擇</button>}
                                        </div>
                                    }
                                </div>
                            </>
                        )}
                        {step==='INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-green-50 p-3 rounded border border-green-200 text-green-800 font-bold">
                                    <div className="flex justify-between border-b border-green-200 pb-2 mb-2"><span>{form.date}</span><span>{form.time}</span></div>
                                    {/* V96: Hiển thị Flow (Body First) nếu có */}
                                    <div className="text-sm font-normal space-y-1">
                                        {checkResult && checkResult.coreDetails && checkResult.coreDetails.map((d, i) => (
                                            <div key={i} className="flex justify-between items-center">
                                                <span>#{i+1} {d.service}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-white px-2 py-0.5 rounded text-green-700 border border-green-300 text-xs">{d.staff}</span>
                                                    {d.flow === 'BF' && <span className="bg-orange-100 px-2 py-0.5 rounded text-orange-700 border border-orange-300 text-xs font-bold">⚠️ 先做身體</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名</label><input className="w-full border p-3 rounded font-bold outline-none" value={form.custName} onChange={e=>setForm({...form,custName:e.target.value})} placeholder="請輸入顧客姓名..." disabled={isSubmitting}/></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼</label><input className="w-full border p-3 rounded font-bold outline-none" value={form.custPhone} onChange={e=>setForm({...form,custPhone:e.target.value})} placeholder="09xx..." disabled={isSubmitting}/></div>
                                <div className="flex gap-2 pt-2"><button onClick={(e)=>{e.preventDefault();if(!isSubmitting)setStep('CHECK');}} className="flex-1 bg-gray-200 p-3 rounded font-bold text-gray-700 hover:bg-gray-300" disabled={isSubmitting}>⬅️ 返回</button><button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting?"處理中...":"✅ 確認預約"}</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 5. COMPONENT: WALK-IN MODAL (V96)
    // ==================================================================================
    const NewWalkInModal = ({ onClose, onSave, staffList, bookings, initialDate }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);
        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [waitSuggestion, setWaitSuggestion] = useState(null); 
        const [isSubmitting, setIsSubmitting] = useState(false); 
        const [isChecking, setIsChecking] = useState(false);
        const [serverData, setServerData] = useState(null);

        useEffect(() => {
            fetchLiveServerData(true).then(data => { if (data) setServerData(data); });
        }, []);

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

        const performCheck = async (e) => {
            if (e) e.preventDefault();
            setIsChecking(true); setCheckResult(null); setWaitSuggestion(null);

            let currentStaffList = serverData?.staff || safeStaffList;
            let currentBookings = serverData?.bookings || safeBookings;
            if (!serverData) {
                const freshData = await fetchLiveServerData(false);
                if (freshData) { setServerData(freshData); currentStaffList = freshData.staff; currentBookings = freshData.bookings; }
            }

            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, currentBookings, currentStaffList);
            if (res.valid) { 
                setCheckResult({ status: 'OK', message: "✅ 目前有空位 (Available Now)", coreDetails: res.details }); 
                setWaitSuggestion(null); 
            } else {
                if (res.reason.includes("System")) { setCheckResult({ status: 'FAIL', message: res.reason }); setIsChecking(false); return; }
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0]||0)*60 + (parts[1]||0);
                let foundTime = null, foundDate = form.date, waitMins = 0, isNextDay = false;
                for (let i=1; i<=18; i++) {
                    let nM = currMins + (i*10); let h = Math.floor(nM/60); let m = nM%60; if(h>=24) h-=24;
                    let tStr = `${String(h).padStart(2,'0')}:${String(Math.floor(m/10)*10).padStart(2,'0')}`;
                    if (callCoreAvailabilityCheck(form.date, tStr, guestDetails, currentBookings, currentStaffList).valid) { foundTime=tStr; waitMins=i*10; break; }
                }
                if (!foundTime) {
                    const tmr = new Date(form.date); tmr.setDate(tmr.getDate() + 1);
                    const tomorrowStr = tmr.toISOString().slice(0, 10);
                    const openH = 8;
                    for (let t = openH*60; t < openH*60 + 240; t += 10) {
                        const h = Math.floor(t / 60); const m = t % 60;
                        const tStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                        if (callCoreAvailabilityCheck(tomorrowStr, tStr, guestDetails, currentBookings, currentStaffList).valid) { foundTime=tStr; foundDate=tomorrowStr; isNextDay=true; break; }
                    }
                }
                if (foundTime) { setCheckResult({ status: 'FAIL', message: isNextDay?"⛔ 今日已滿":"⚠️ 需等待" }); setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay }); }
                else { setCheckResult({ status: 'FAIL', message: "❌ 預約已滿 (Fully Booked)" }); setWaitSuggestion(null); }
            }
            setIsChecking(false);
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入姓名！"); return; }
            setIsSubmitting(true);
            try {
                // [V96] Final Recalc
                const finalCheck = callCoreAvailabilityCheck(form.date, form.time, guestDetails, serverData?.bookings || safeBookings, serverData?.staff || safeStaffList);
                
                // [V96] Map Flow
                const detailedGuests = guestDetails.map((g, i) => {
                    const detail = finalCheck.details ? finalCheck.details.find(d => d.guestIndex === i) : null;
                    return { ...g, staff: detail ? detail.staff : g.staff, flow: detail ? detail.flow : 'FB' };
                });

                // [V96] Notes
                const oils = guestDetails.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean);
                const flows = detailedGuests.map((g,i)=>g.flow==='BF'?`K${i+1}:先做身體`:null).filter(Boolean);
                const noteParts = [...oils, ...flows];
                const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";

                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: detailedGuests.map(g=>g.service).join(','), pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: detailedGuests[0].staff, isOil: detailedGuests[0].isOil,
                    staffId2: detailedGuests[1]?.staff||null, staffId3: detailedGuests[2]?.staff||null,
                    staffId4: detailedGuests[3]?.staff||null, staffId5: detailedGuests[4]?.staff||null, staffId6: detailedGuests[5]?.staff||null,
                    ghiChu: noteStr, guestDetails: detailedGuests,
                    proposedUpdates: finalCheck.proposedUpdates || []
                };
                if (onSave) { await Promise.resolve(onSave(payload)); forceGlobalRefresh(); setTimeout(()=>{onClose();setIsSubmitting(false);}, 500); }
            } catch(err) { alert("錯誤: "+err.message); setIsSubmitting(false); }
        };

        const paxOptions = [1,2,3,4,5,6];

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-600 p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">⚡ 現場客 (V96 Hybrid)</h3>
                        <button onClick={onClose}><i className="fas fa-times text-xl"></i></button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div><label className="text-xs font-bold text-gray-500">人數</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    {guestDetails.map((g, i) => (
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師</option><option value="FEMALE_OIL">🚺+油</option><option value="男">🚹 男師</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
                                    ))}
                                </div>
                                {checkResult && (<div className="space-y-2"><div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>{waitSuggestion&&(<div className="bg-blue-50 border border-blue-200 p-3 rounded animate-fadeIn text-center"><div className={`mb-2 font-bold text-lg ${waitSuggestion.isNextDay?'text-orange-600':'text-blue-700'}`}>{waitSuggestion.isNextDay ? `🌅 最快明天: ${waitSuggestion.time}` : `⏳ 需等待 ${waitSuggestion.mins} 分鐘 (${waitSuggestion.time})`}</div><button onClick={(e) => { e.preventDefault(); setForm({...form, time: waitSuggestion.time, date: waitSuggestion.date}); setStep('INFO'); }} className="w-full bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">➡️ 接受安排</button></div>)}</div>)}
                                <div className="pt-2 grid grid-cols-2 gap-3"><button onClick={onClose} className="bg-gray-100 text-gray-500 font-bold p-3 rounded hover:bg-gray-200">取消</button>
                                {(!checkResult || checkResult.status === 'FAIL') ? 
                                    <button onClick={performCheck} disabled={isChecking} className={`font-bold p-3 rounded shadow-lg flex justify-center items-center text-white ${isChecking?'bg-gray-400':'bg-amber-500 hover:bg-amber-600'}`}>
                                        {isChecking ? "計算中..." : "🔍 檢查"}
                                    </button> : 
                                    <button onClick={() => setStep('INFO')} className="bg-emerald-600 text-white font-bold p-3 rounded hover:bg-emerald-700 shadow-lg animate-pulse">➡️ 下一步</button>}
                                </div>
                            </>
                        )}
                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-amber-50 p-3 rounded border border-amber-200 text-amber-900 font-bold">
                                    <div className="flex justify-between border-b border-amber-200 pb-2 mb-2"><span>{form.date}</span><span>{form.time}</span></div>
                                    <div className="text-sm font-normal space-y-1">
                                        {checkResult && checkResult.coreDetails && checkResult.coreDetails.map((d, i) => (
                                            <div key={i} className="flex justify-between items-center">
                                                <span>#{i+1} {d.service}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-white px-2 py-0.5 rounded text-amber-700 border border-amber-300 text-xs">{d.staff}</span>
                                                    {d.flow === 'BF' && <span className="bg-red-100 px-2 py-0.5 rounded text-red-700 border border-red-300 text-xs font-bold">⚠️ 先做身體</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
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
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) { window.AvailabilityCheckModal = NewAvailabilityCheckModal; console.log("♻️ AvailabilityModal Injected (V96)"); }
        if (window.WalkInModal !== NewWalkInModal) { window.WalkInModal = NewWalkInModal; console.log("♻️ WalkInModal Injected (V96)"); }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);
})();
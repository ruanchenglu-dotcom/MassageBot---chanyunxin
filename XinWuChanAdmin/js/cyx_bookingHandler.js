/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - FRONTEND CONTROLLER & LOGIC BRIDGE
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V116.2 (STATUS SSOT, REAL_DURATION, ID NORMALIZATION & MULTI-STAFF COLLISION FIX)
 * =================================================================================================
 */

(function () {
    console.log("🚀 BookingHandler V116.2: Multi-Staff Array Supported (Columns L,M,N) for Collision Checks.");

    // Kiểm tra môi trường React
    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React not found. Cannot start BookingHandler.");
        return;
    }

    // --- DANH SÁCH HỌ TỪ SHEET 'NAME' (HARDCODED FOR SPEED) ---
    const PREDEFINED_SURNAMES = [
        "陳", "林", "王", "黃", "李", "吳", "蔡", "張", "許", "謝", "簡", "曾", "高", "葉", "盧", "劉", "周", "曾", "丁",
        "鄭", "朱", "趙", "郭", "洪", "彭", "邱", "廖", "賴", "徐", "游", "楊", "康", "紀", "方", "杜", "易", "汪", "曹",
        "呂", "錢", "蘇", "莊", "江", "何", "余", "羅", "薛", "蕭", "潘", "武", "毛", "史", "崔", "陶", "陸", "段", "溫",
        "柯", "孫", "程", "鍾", "董", "傅", "詹", "胡", "施", "沈", "馬", "蔣", "唐", "卓", "藍", "馮", "白", "石", "官",
        "秦", "姚", "范", "宋", "喬", "梁", "顏", "魏", "翁", "戴", "袁", "於", "顧", "孟", "平", "湯", "尹", "黎", "常",
        "邵", "鄧", "賀", "韓", "侯", "龔", "司馬", "公孫", "諸葛", "歐陽", "上官", "東方", "", "", "", "", "", "", ""
    ];

    // ========================================================================
    // PHẦN 0: UNIVERSAL UTILS & STATUS MANAGEMENT
    // ========================================================================

    const normalizeStaffId = (id) => {
        if (!id) return "";
        const strId = String(id).trim();
        // Nếu chuỗi là số và có số 0 ở đầu (ví dụ: "01", "05", "007") -> chuyển thành "1", "5", "7"
        if (/^0+\d+$/.test(strId)) {
            return parseInt(strId, 10).toString();
        }
        return strId;
    };

    const getBookingStatus = () => {
        if (window.BOOKING_STATUS) return window.BOOKING_STATUS;
        return {
            WAITING: '等待中',
            SERVING: '服務中',
            COMPLETED: '已完成',
            CANCELLED: '已取消'
        };
    };

    const normalizeDateStrict = (input) => {
        if (!input) return "";
        try {
            let str = input.toString().trim();
            if (str.includes('T')) str = str.split('T')[0];
            if (str.includes(' ')) str = str.split(' ')[0];
            str = str.replace(/-/g, '/').replace(/\./g, '/');
            const parts = str.split('/');
            if (parts.length !== 3) return str;
            const partA = parts[0]; const partB = parts[1]; const partC = parts[2];
            if (partA.length === 4) return `${partA}/${partB.padStart(2, '0')}/${partC.padStart(2, '0')}`;
            if (partC.length === 4) return `${partC}/${partB.padStart(2, '0')}/${partA.padStart(2, '0')}`;
            return str;
        } catch (e) { return input; }
    };

    const getServiceCodeByName = (serviceName) => {
        const rawServices = window.SERVICES_DATA || {};
        for (const [code, details] of Object.entries(rawServices)) {
            if (details.name === serviceName) return code;
        }
        return "";
    };

    // ========================================================================
    // PHẦN 1: CORE KERNEL (CLIENT-SIDE BRAIN)
    // ========================================================================
    const CoreKernel = (function () {

        // --- 1. CẤU HÌNH HỆ THỐNG ĐỘNG (DYNAMIC SYSTEM CONFIG) ---
        const getSystemConfig = () => {
            const ext = window.SYSTEM_CONFIG || {};
            // Quy mô chuẩn 9 ghế x 9 giường
            const scale = ext.SCALE || {};
            const opTime = ext.OPERATION_TIME || {};
            return {
                MAX_CHAIRS: scale.MAX_CHAIRS || ext.MAX_CHAIRS || 9,
                MAX_BEDS: scale.MAX_BEDS || ext.MAX_BEDS || 9,
                MAX_TOTAL_GUESTS: ext.MAX_TOTAL_GUESTS || 18,
                OPEN_HOUR: opTime.OPEN_HOUR || ext.OPEN_HOUR || 3,
                CLEANUP_BUFFER: (ext.BUFFERS && ext.BUFFERS.CLEANUP_MINUTES) || ext.CLEANUP_BUFFER || 5,
                TRANSITION_BUFFER: (ext.BUFFERS && ext.BUFFERS.TRANSITION_MINUTES) || ext.TRANSITION_BUFFER || 5,
                TOLERANCE: ext.TOLERANCE || 1,
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
                // [V116.3 NÂNG CẤP]: Phóng chiếu giờ rạng sáng cho thuật toán ca đêm (0h-6h)
                if (h <= 6) h += 24;
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
            if (!statusRaw) return false;
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

        function isComboService(serviceObj, serviceNameRaw = '', explicitFlow = null) {
            if (explicitFlow) {
                const flowUpper = explicitFlow.toString().toUpperCase().trim();
                if (['SINGLE', 'FOOTSINGLE', 'BODYSINGLE'].includes(flowUpper)) return false;
                if (flowUpper === 'BF' || flowUpper === 'FB') return true;
            }
            if (!serviceObj && !serviceNameRaw) return false;
            const cat = (serviceObj && serviceObj.category ? serviceObj.category : '').toString().toUpperCase().trim();
            if (cat === 'COMBO' || cat === 'MIXED') return true;
            const dbName = (serviceObj && serviceObj.name ? serviceObj.name : '').toString().toUpperCase();
            const rawName = (serviceNameRaw || '').toString().toUpperCase();
            const nameToCheck = dbName + " | " + rawName;
            const comboKeywords = ['COMBO', '套餐', 'MIX', '+', 'SET', '腳身', '全餐', 'FOOT AND BODY', 'BODY AND FOOT', '雙人', 'A餐', 'B餐', 'C餐', '油壓+足'];
            for (const kw of comboKeywords) { if (nameToCheck.includes(kw)) return true; }
            return false;
        }

        function detectResourceType(serviceObj) {
            if (!serviceObj) return 'CHAIR';
            if (serviceObj.type === 'BED' || serviceObj.type === 'CHAIR') return serviceObj.type;
            const name = (serviceObj.name || '').toUpperCase();
            if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|SPA|BACK/)) return 'BED';
            return 'CHAIR';
        }

        // --- HELPER: REAL DURATION CALCULATION (FIX 1) ---
        function calculateRealDurations(booking, defaultDuration, isCombo) {
            const CONF = getSystemConfig();
            let p1 = Math.floor(defaultDuration / 2);
            let p2 = defaultDuration - p1;

            if (booking.phase1_duration !== undefined && booking.phase1_duration !== null && !isNaN(booking.phase1_duration)) {
                p1 = parseInt(booking.phase1_duration, 10);
            } else if (booking.originalData?.phase1_duration !== undefined && !isNaN(booking.originalData.phase1_duration)) {
                p1 = parseInt(booking.originalData.phase1_duration, 10);
            }

            if (booking.phase2_duration !== undefined && booking.phase2_duration !== null && !isNaN(booking.phase2_duration)) {
                p2 = parseInt(booking.phase2_duration, 10);
            } else if (booking.originalData?.phase2_duration !== undefined && !isNaN(booking.originalData.phase2_duration)) {
                p2 = parseInt(booking.originalData.phase2_duration, 10);
            }

            const realDuration = isCombo ? (p1 + p2 + CONF.TRANSITION_BUFFER) : defaultDuration;
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
            const isCombo = isComboService(svcInfo, booking.serviceName, storedFlow);

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
            const isCombo = isComboService(svcInfo, booking.serviceName, storedFlow);

            const { p1, realDuration } = calculateRealDurations(booking, duration, isCombo);

            const bEnd = bStart + realDuration + CONF.CLEANUP_BUFFER;
            if (timeMins < bStart || timeMins >= bEnd) return null;

            if (storedFlow === 'FOOTSINGLE') return 'CHAIR';
            if (storedFlow === 'BODYSINGLE') return 'BED';
            if (storedFlow === 'SINGLE') return detectResourceType(svcInfo);

            if (!isCombo) return detectResourceType(svcInfo);

            let isBodyFirst = false;
            const noteContent = (booking.note || booking.ghiChu || "").toString().toUpperCase();
            if (storedFlow === 'BF') isBodyFirst = true;
            else if (storedFlow === 'FB') isBodyFirst = false;
            else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
            else if (booking.allocated_resource && (booking.allocated_resource.includes('BED') || booking.allocated_resource.includes('BODY'))) isBodyFirst = true;

            const splitTime = bStart + p1 + (CONF.TRANSITION_BUFFER / 2); // Approximate switch
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

        function validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr) {
            const CONF = getSystemConfig();
            const resourceMap = {
                'BED': Array.from({ length: CONF.MAX_BEDS }, () => []),
                'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, () => [])
            };

            const relevantBookings = currentBookingsRaw.filter(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                if (bStart === -1) return false;
                if (!isActiveBookingStatus(b.status)) return false;
                if (!isMathematicallyActive(b, requestStart)) return false;

                const svcInfo = SERVICES[b.serviceCode] || { name: b.serviceName };
                const storedFlow = b.originalData?.flowCode || b.flow;
                const isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
                const { realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);

                const bEnd = bStart + realDuration + CONF.CLEANUP_BUFFER;
                return bEnd > requestStart;
            });

            relevantBookings.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                const svcInfo = SERVICES[b.serviceCode] || { name: b.serviceName };
                const storedFlow = b.originalData?.flowCode || b.flow;
                const isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
                const { realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);

                const rId = b.allocated_resource || b.rowId || "";

                const laneMatch = rId.toString().match(/(BED|CHAIR)[-_ ]?(\d+)/i);
                if (laneMatch) {
                    const type = laneMatch[1].toUpperCase().includes('BED') ? 'BED' : 'CHAIR';
                    const idx = parseInt(laneMatch[2]) - 1;
                    if (resourceMap[type] && resourceMap[type][idx]) {
                        resourceMap[type][idx].push({ start: bStart, end: bStart + realDuration + CONF.CLEANUP_BUFFER });
                    }
                }
            });

            const supplyCount = Object.values(staffList).filter(s => {
                if (s.off) return false;
                const ss = getMinsFromTimeStr(s.start);
                let se = getMinsFromTimeStr(s.end);
                
                // [FRONTEND V116.3] Fix Overnight Shifts (Ca Xuyên Đêm)
                if (se < ss) {
                    se += 1440;
                }

                return (requestStart >= ss && requestStart < se);
            }).length;

            let staffBusyCount = 0;
            relevantBookings.forEach(b => {
                const bS = getMinsFromTimeStr(b.startTime);
                const svcInfo = SERVICES[b.serviceCode] || { name: b.serviceName };
                const storedFlow = b.originalData?.flowCode || b.flow;
                const isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
                const { realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);

                const bE = bS + realDuration + CONF.CLEANUP_BUFFER;

                // MULTI-STAFF FIX: Đếm tất cả thợ bận trong booking này thay vì chỉ đếm 1
                let staffsInBooking = b.assignedStaffs && b.assignedStaffs.length > 0 ? b.assignedStaffs.length : 1;

                if (requestStart >= bS && requestStart < bE) {
                    staffBusyCount += staffsInBooking;
                }
            });

            if ((staffBusyCount + guestList.length) > supplyCount) {
                return { pass: false, reason: `⚠️ 技師不足 (Not Enough Staff)。總共: ${supplyCount}, 忙碌中: ${staffBusyCount}, 新客: ${guestList.length}`, debug: {} };
            }

            // SIMULATION
            const simulationMap = JSON.parse(JSON.stringify(resourceMap));

            for (let i = 0; i < guestList.length; i++) {
                const g = guestList[i];
                const svc = SERVICES[g.serviceCode] || { duration: 60 };
                const duration = svc.duration || 60;
                const isCombo = isComboService(svc, g.serviceCode, g.flowCode);

                if (isCombo) {
                    const p1 = Math.floor(duration / 2);
                    const p2 = duration - p1;
                    const tStart = requestStart;
                    const tSwitch = tStart + p1 + CONF.TRANSITION_BUFFER;

                    let successBF = false;
                    let successFB = false;

                    let bedIdx = -1, chairIdx = -1;
                    for (let b = 0; b < CONF.MAX_BEDS; b++) {
                        if (checkLaneContinuity(simulationMap.BED[b], tStart, tStart + p1)) { bedIdx = b; break; }
                    }
                    for (let c = 0; c < CONF.MAX_CHAIRS; c++) {
                        if (checkLaneContinuity(simulationMap.CHAIR[c], tSwitch, tSwitch + p2)) { chairIdx = c; break; }
                    }

                    if (bedIdx !== -1 && chairIdx !== -1) {
                        successBF = true;
                        simulationMap.BED[bedIdx].push({ start: tStart, end: tStart + p1 + CONF.CLEANUP_BUFFER });
                        simulationMap.CHAIR[chairIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                    } else {
                        chairIdx = -1; bedIdx = -1;
                        for (let c = 0; c < CONF.MAX_CHAIRS; c++) {
                            if (checkLaneContinuity(simulationMap.CHAIR[c], tStart, tStart + p1)) { chairIdx = c; break; }
                        }
                        for (let b = 0; b < CONF.MAX_BEDS; b++) {
                            if (checkLaneContinuity(simulationMap.BED[b], tSwitch, tSwitch + p2)) { bedIdx = b; break; }
                        }

                        if (chairIdx !== -1 && bedIdx !== -1) {
                            successFB = true;
                            simulationMap.CHAIR[chairIdx].push({ start: tStart, end: tStart + p1 + CONF.CLEANUP_BUFFER });
                            simulationMap.BED[bedIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                        }
                    }

                    if (!successBF && !successFB) {
                        return {
                            pass: false,
                            reason: `⚠️ 在 ${getTimeStrFromMins(requestStart)} 沒有足夠的連續空位 (Continuous Gap) 給套餐。`,
                            debug: { msg: "Logic V116.1 detected gap fragmentation." }
                        };
                    }

                } else {
                    let rType = 'CHAIR';
                    if (g.flowCode === 'BODYSINGLE') rType = 'BED';
                    else if (g.flowCode === 'FOOTSINGLE') rType = 'CHAIR';
                    else rType = detectResourceType(svc);

                    let foundIdx = -1;
                    for (let k = 0; k < (rType === 'BED' ? CONF.MAX_BEDS : CONF.MAX_CHAIRS); k++) {
                        if (checkLaneContinuity(simulationMap[rType][k], requestStart, requestStart + duration)) {
                            foundIdx = k;
                            break;
                        }
                    }

                    if (foundIdx !== -1) {
                        simulationMap[rType][foundIdx].push({ start: requestStart, end: requestStart + duration + CONF.CLEANUP_BUFFER });
                    } else {
                        return {
                            pass: false,
                            reason: `⚠️ 已經沒有連續 ${duration} 分鐘的空${rType === 'BED' ? '床位' : '座位'}。`,
                            debug: {}
                        };
                    }
                }
            }
            return { pass: true, debug: { msg: "V116.1 Continuous Scan Passed" } };
        }

        // --- MATRIX ENGINE ---
        class VirtualMatrix {
            constructor() {
                const CONF = getSystemConfig();
                this.lanes = {
                    'CHAIR': Array.from({ length: CONF.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i + 1}`, occupied: [] })),
                    'BED': Array.from({ length: CONF.MAX_BEDS }, (_, i) => ({ id: `BED-${i + 1}`, occupied: [] }))
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
            tryAllocate(type, start, end, ownerId, preferredIndex = null) {
                const resourceGroup = this.lanes[type];
                if (!resourceGroup) return null;

                if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
                    const targetLane = resourceGroup[preferredIndex - 1];
                    if (this.checkLaneFree(targetLane, start, end).free) {
                        return this.allocateToLane(targetLane, start, end, ownerId);
                    }
                }
                for (let lane of resourceGroup) {
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
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
            const CONF = getSystemConfig();
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
                if (!staffInfo || staffInfo.off) return false;
                const shiftStart = getMinsFromTimeStr(staffInfo.start);
                let shiftEnd = getMinsFromTimeStr(staffInfo.end);
                if (shiftStart === -1 || shiftEnd === -1) return false;

                // [FRONTEND V116.3] Fix Overnight Shifts (Ca Xuyên Đêm)
                if (shiftEnd < shiftStart) {
                    shiftEnd += 1440;
                }

                if ((start + CONF.TOLERANCE) < shiftStart) return false;
                const isStrict = staffInfo.isStrictTime === true;
                if (isStrict) {
                    if ((end - CONF.TOLERANCE) > shiftEnd) return false;
                } else {
                    if (start > shiftEnd) return false;
                }

                // MULTI-STAFF FIX: Kiểm tra xem name có nằm trong mảng thợ của bất kỳ booking nào đang bận không
                for (const b of busyList) {
                    const staffArray = b.assignedStaffs || [b.staffName];
                    if (staffArray.includes(name) && isOverlap(start, end, b.start, b.end)) return false;
                }
                if ((staffReq === 'MALE' || staffReq === '男' || staffReq === '男師') && staffInfo.gender !== 'M') return false;
                if ((staffReq === 'FEMALE' || staffReq === '女' || staffReq === '女師') && staffInfo.gender !== 'F') return false;
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

        function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
            if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
                return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999 }];
            }
            const standardHalf = Math.floor(totalDuration / 2);
            let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];
            if (!step || !limit || step <= 0 || limit <= 0) return options;
            let currentDeviation = step;
            while (currentDeviation <= limit) {
                let p1_A = standardHalf - currentDeviation;
                let p2_A = totalDuration - p1_A;
                if (p1_A >= 15 && p2_A >= 15) options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
                let p1_B = standardHalf + currentDeviation;
                let p2_B = totalDuration - p1_B;
                if (p1_B >= 15 && p2_B >= 15) options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
                currentDeviation += step;
            }
            options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
            return options;
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
        function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
            const CONF = getSystemConfig();
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "❌ 錯誤: 時間格式無效 (Invalid Time)" };

            let maxGuestDuration = 0;
            guestList.forEach(g => {
                const s = SERVICES[g.serviceCode] || { duration: 60 };
                const dur = s.duration || 60;
                if (dur > maxGuestDuration) maxGuestDuration = dur;
            });

            const guardrailCheck = validateGlobalCapacity(
                requestStartMins,
                maxGuestDuration,
                guestList,
                currentBookingsRaw,
                staffList,
                dateStr
            );

            if (!guardrailCheck.pass) {
                return { feasible: false, reason: `${guardrailCheck.reason}`, debug: guardrailCheck.debug };
            }

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
                        // [V116.5 FIX] Ngăn chặn Bóng Ma Ghi Đè: Tôn trọng vị trí đã gán từ Google Sheets
                        if (!b.allocated_resource) {
                            b._virtualInheritanceIndex = idx + 1;
                        }
                        b._impliedFlow = null;
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
                let isCombo = isComboService(svcInfo, b.serviceName, storedFlow);

                let duration = b.duration || 60;
                let anchorIndex = null;
                const isRunning = isStatusRunning(b.status);

                const ownerName = b.originalData?.customerName || b.originalData?.hoTen || b.rowId || "Guest";

                if (isRunning) {
                    if (b.allocated_resource) {
                        const match = b.allocated_resource.toString().match(/(\d+)/);
                        if (match) anchorIndex = parseInt(match[0]);
                    } else if (b.rowId && typeof b.rowId === 'string' && (b.rowId.includes('BED') || b.rowId.includes('CHAIR'))) {
                        const match = b.rowId.toString().match(/(\d+)/);
                        if (match) anchorIndex = parseInt(match[0]);
                    }
                } else {
                    if (b._virtualInheritanceIndex) anchorIndex = b._virtualInheritanceIndex;
                    else if (b.allocated_resource) {
                        const match = b.allocated_resource.toString().match(/(\d+)/);
                        if (match) anchorIndex = parseInt(match[0]);
                    }
                }

                // Dùng hàm Helper tính chính xác toàn bộ p1, p2 và tổng thời lượng thực.
                const { p1, p2, realDuration } = calculateRealDurations(b, duration, isCombo);

                let isElastic = isCombo && (b.isManualLocked !== true) && (!isRunning);
                let processedB = {
                    id: ownerName,
                    originalData: b,
                    staffName: b.staffName,
                    assignedStaffs: b.assignedStaffs || [], // GẮN MẢNG MULTI-STAFF
                    serviceName: b.serviceName,
                    category: svcInfo.category,
                    isElastic: isElastic,
                    elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
                    startMins: bStart, duration: realDuration, blocks: [], anchorIndex: anchorIndex
                };

                if (isCombo) {
                    const p1End = bStart + p1;
                    const p2Start = p1End + CONF.TRANSITION_BUFFER;
                    const p2End = p2Start + p2;

                    let isBodyFirst = false;
                    const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
                    if (storedFlow === 'BF') isBodyFirst = true;
                    else if (storedFlow === 'FB') isBodyFirst = false;
                    else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                    else if (isRunning && b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) isBodyFirst = true;
                    else if (b._impliedFlow === 'BF') isBodyFirst = true;

                    if (isBodyFirst) {
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: anchorIndex });
                        processedB.blocks.push({ start: p2Start, end: p2End, type: 'CHAIR', forcedIndex: anchorIndex });
                        processedB.flow = 'BF';
                    } else {
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: anchorIndex });
                        processedB.blocks.push({ start: p2Start, end: p2End, type: 'BED', forcedIndex: anchorIndex });
                        processedB.flow = 'FB';
                    }
                    processedB.p1_current = p1; processedB.p2_current = p2;
                } else {
                    if (storedFlow === 'FOOTSINGLE' || storedFlow === 'BODYSINGLE') processedB.flow = storedFlow;
                    else processedB.flow = 'SINGLE';
                    let rType = inferResourceAtTime(b, bStart);
                    if (!rType) rType = detectResourceType(svcInfo);
                    processedB.blocks.push({ start: bStart, end: bStart + realDuration, type: rType, forcedIndex: anchorIndex });
                }
                existingBookingsProcessed.push(processedB);
            });

            // GIAI ĐOẠN C: KỊCH BẢN KHÁCH MỚI
            const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
            const comboGuests = newGuests.filter(g => {
                const s = SERVICES[g.serviceCode];
                return isComboService(s, g.serviceCode, g.flowCode);
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

            for (let numBF of trySequence) {
                let matrix = new VirtualMatrix();
                let scenarioDetails = [];
                let scenarioUpdates = [];
                let scenarioFailed = false;

                let softsToSqueezeCandidates = [];
                for (const exB of existingBookingsProcessed) {
                    let placedSuccessfully = true;
                    let allocatedSlots = [];
                    for (const block of exB.blocks) {
                        const realEnd = block.end + CONF.CLEANUP_BUFFER;
                        const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id, block.forcedIndex);
                        if (!slotId) { placedSuccessfully = false; break; }
                        allocatedSlots.push(slotId);
                    }
                    if (exB.isElastic) {
                        if (placedSuccessfully) exB.allocatedSlots = allocatedSlots;
                        softsToSqueezeCandidates.push(exB);
                    }
                }

                let newGuestBlocksMap = [];
                for (const ng of newGuests) {
                    const svc = SERVICES[ng.serviceCode] || { name: ng.serviceCode || 'Unknown', duration: 60, price: 0 };
                    let flow = 'FB';
                    let isThisGuestCombo = isComboService(svc, ng.serviceCode, ng.flowCode);
                    if (isThisGuestCombo) {
                        const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                        if (cIdx >= 0 && cIdx < numBF) { flow = 'BF'; }
                    } else { flow = ng.flowCode || 'SINGLE'; }
                    const duration = svc.duration || 60;
                    let blocks = [];
                    if (isThisGuestCombo) {
                        const p1Standard = Math.floor(duration / 2);
                        const p2Standard = duration - p1Standard;
                        if (flow === 'FB') {
                            const t1End = requestStartMins + p1Standard;
                            const t2Start = t1End + CONF.TRANSITION_BUFFER;
                            blocks.push({ start: requestStartMins, end: t1End + CONF.CLEANUP_BUFFER, type: 'CHAIR' });
                            blocks.push({ start: t2Start, end: t2Start + p2Standard + CONF.CLEANUP_BUFFER, type: 'BED' });
                            scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'FB', timeStr: timeStr, allocated: [] });
                        } else {
                            const t1End = requestStartMins + p2Standard;
                            const t2Start = t1End + CONF.TRANSITION_BUFFER;
                            blocks.push({ start: requestStartMins, end: t1End + CONF.CLEANUP_BUFFER, type: 'BED' });
                            blocks.push({ start: t2Start, end: t2Start + p1Standard + CONF.CLEANUP_BUFFER, type: 'CHAIR' });
                            scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'BF', timeStr: timeStr, allocated: [] });
                        }
                    } else {
                        let rType = 'CHAIR';
                        if (flow === 'FOOTSINGLE') rType = 'CHAIR';
                        else if (flow === 'BODYSINGLE') rType = 'BED';
                        else rType = detectResourceType(svc);
                        blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONF.CLEANUP_BUFFER, type: rType });
                        scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, flow: flow, timeStr: timeStr, allocated: [] });
                    }
                    newGuestBlocksMap.push({ guest: ng, blocks: blocks });
                }

                let conflictFound = false;
                for (const item of newGuestBlocksMap) {
                    let guestAllocations = [];
                    let preferredIdx = null;
                    if (newGuestHalfSize > 0 && newGuests.length >= 2) {
                        preferredIdx = (item.guest.idx % newGuestHalfSize) + 1;
                        if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdx = item.guest.idx + 1;
                    }
                    for (const block of item.blocks) {
                        const slotId = matrix.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, preferredIdx);
                        if (!slotId) { conflictFound = true; break; }
                        guestAllocations.push(slotId);
                    }
                    if (conflictFound) break;
                    const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
                    if (detail) detail.allocated = guestAllocations;
                }

                if (conflictFound) {
                    let matrixSqueeze = new VirtualMatrix();
                    let updatesProposed = [];
                    const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
                    hardBookings.forEach(hb => {
                        hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONF.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
                    });
                    let squeezeScenarioPossible = true;
                    for (const item of newGuestBlocksMap) {
                        let preferredIdxSqueeze = null;
                        if (newGuestHalfSize > 0 && newGuests.length >= 2) {
                            preferredIdxSqueeze = (item.guest.idx % newGuestHalfSize) + 1;
                            if (maxBF === 2 && (numBF === 0 || numBF === 2)) preferredIdxSqueeze = item.guest.idx + 1;
                        }
                        for (const block of item.blocks) {
                            if (!matrixSqueeze.tryAllocate(block.type, block.start, block.end, `NEW_GUEST_${item.guest.idx}`, preferredIdxSqueeze)) {
                                squeezeScenarioPossible = false; break;
                            }
                        }
                        if (!squeezeScenarioPossible) break;
                    }
                    if (!squeezeScenarioPossible) {
                        if (matrixSqueeze.blockLog.length > 0) failureLog = matrixSqueeze.blockLog;
                        scenarioFailed = true; continue;
                    }
                    const softBookings = existingBookingsProcessed.filter(b => b.isElastic);
                    for (const sb of softBookings) {
                        const splits = generateElasticSplits(sb.duration, sb.elasticStep, sb.elasticLimit, null);
                        let fit = false;
                        for (const split of splits) {
                            const sP1End = sb.startMins + split.p1;
                            const sP2Start = sP1End + CONF.TRANSITION_BUFFER;
                            const sP2End = sP2Start + split.p2;
                            const testBlocks = [
                                { type: 'CHAIR', start: sb.startMins, end: sP1End + CONF.CLEANUP_BUFFER, forcedIndex: sb.blocks[0].forcedIndex },
                                { type: 'BED', start: sP2Start, end: sP2End + CONF.CLEANUP_BUFFER, forcedIndex: sb.blocks[1] ? sb.blocks[1].forcedIndex : null }
                            ];
                            if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                                testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id, tb.forcedIndex));
                                fit = true;
                                if (split.deviation !== 0) updatesProposed.push({ rowId: sb.originalData.rowId, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze' });
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
                for (const item of newGuestBlocksMap) {
                    const assignedStaff = findAvailableStaff(item.guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length - 1].end, staffList, flatTimeline);
                    if (!assignedStaff) { staffAssignmentSuccess = false; break; }
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
                const debugReason = failureLog.slice(-2).join(' | ');
                const failMessage = debugReason ? `❌ Matrix Full. Details: ${debugReason}` : "❌ 已額滿 (Full - Matrix Logic)";
                return { feasible: false, reason: failMessage, debug: guardrailCheck.debug };
            }
        }

        return { checkRequestAvailability, setDynamicServices };
    })();

    // ========================================================================
    // PHẦN 2: DATA FETCHER
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
            const sType = svc.type ? svc.type.toUpperCase() : 'BODY';
            let defFlow = 'BODYSINGLE';
            if (sType === 'FOOT' || sType === 'CHAIR') defFlow = 'FOOTSINGLE';
            else if (sType === 'BODY' || sType === 'BED') defFlow = 'BODYSINGLE';
            formattedServices[key] = {
                name: svc.name || key, duration: parseInt(svc.duration) || 60,
                type: sType, category: svc.category || 'SINGLE', price: svc.price || 0,
                elasticStep: svc.elasticStep || 0, elasticLimit: svc.elasticLimit || 0,
                defaultFlow: defFlow
            };
        });
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

    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList) => {
        syncServicesToCore();
        const now = new Date();
        const STATUS = getBookingStatus();

        const coreGuests = guests.map(g => {
            let foundCode = getServiceCodeByName(g.service);
            const svcDef = window.SERVICES_DATA && foundCode ? window.SERVICES_DATA[foundCode] : null;
            let impliedFlow = undefined;
            if (svcDef) {
                const cat = (svcDef.category || '').toUpperCase();
                const sType = (svcDef.type || 'BODY').toUpperCase();
                if (cat !== 'COMBO' && cat !== 'MIXED') {
                    if (sType === 'FOOT' || sType === 'CHAIR') impliedFlow = 'FOOTSINGLE';
                    else impliedFlow = 'BODYSINGLE';
                }
            }

            // CHUẨN HÓA ID THỢ TỪ GUEST
            let rawStaff = g.staff;
            let normalizedStaff = 'RANDOM';
            if (rawStaff === '隨機') normalizedStaff = 'RANDOM';
            else if (rawStaff === '女' || rawStaff === '女師') normalizedStaff = 'FEMALE';
            else if (rawStaff === '男' || rawStaff === '男師') normalizedStaff = 'MALE';
            else normalizedStaff = normalizeStaffId(rawStaff);

            return {
                serviceCode: foundCode || g.service,
                staffName: normalizedStaff,
                flowCode: impliedFlow
            };
        });

        const targetDateStandard = normalizeDateStrict(date);
        const coreBookings = (Array.isArray(bookings) ? bookings : []).filter(b => {
            if (!b || !b.startTimeString) return false;

            // [V116.7 LỖI TRẠNG THÁI] Lọc bỏ hoàn toàn các đơn Đã Hủy hoặc Đã Hoàn Thành bằng chuẩn SSOT
            // Ngăn chặn việc đơn cũ bị tái sinh thành "Đang Phục Vụ" do thời gian quá khứ
            const isInactive = b.status && (
                b.status.includes('hủy') || b.status.includes('Cancel') || b.status.includes('取消') || b.status.includes(STATUS.CANCELLED) ||
                b.status.includes('完成') || b.status.includes('Done') || b.status.includes('✅') || b.status.includes(STATUS.COMPLETED)
            );
            if (isInactive) return false;

            const rawDate = b.startTimeString.split(' ')[0];
            const bDate = normalizeDateStrict(rawDate);
            return bDate === targetDateStandard;
        }).map(b => {
            let isPastOrRunning = false;
            try { if (new Date(b.startTimeString) <= now) isPastOrRunning = true; } catch (e) { }
            let serverLockSignal = b.isManualLocked;
            if (serverLockSignal === undefined && b.originalData) serverLockSignal = b.originalData.isManualLocked;
            const isExplicitlyLocked = (serverLockSignal === true || String(serverLockSignal).toUpperCase() === 'TRUE' || serverLockSignal === 1);
            const finalLockState = isExplicitlyLocked || isPastOrRunning;

            // Gán giá trị trạng thái SSOT mới
            let normalizedStatus = b.status || STATUS.WAITING;
            if (isPastOrRunning) normalizedStatus = STATUS.SERVING;

            // ==============================================================
            // TRỌNG TÂM: GOM TOÀN BỘ THỢ (CỘT L, M, N...) THÀNH MẢNG
            // ==============================================================
            let rawStaffs = [];
            if (b.technician) rawStaffs.push(b.technician);
            if (b.staffId) rawStaffs.push(b.staffId);

            // Quét các cột phụ từ staffId2 đến staffId9 (hoặc tương đương)
            for (let i = 2; i <= 9; i++) {
                if (b[`staffId${i}`]) rawStaffs.push(b[`staffId${i}`]);
                if (b.originalData && b.originalData[`staffId${i}`]) rawStaffs.push(b.originalData[`staffId${i}`]);
            }

            // Lọc bỏ undefined/null/Unassigned và trùng lặp
            let uniqueRawStaffs = [...new Set(rawStaffs.filter(s => s && String(s).trim() !== "" && s !== "Unassigned"))];
            let normalizedStaffs = uniqueRawStaffs.map(s => normalizeStaffId(s));

            // Lấy ID chính để tương thích với các UI hiện hành
            let primaryStaff = normalizedStaffs.length > 0 ? normalizedStaffs[0] : "Unassigned";

            return {
                serviceCode: b.serviceCode || b.serviceName, serviceName: b.serviceName,
                startTime: b.startTimeString, duration: parseInt(b.duration) || 60,
                staffName: primaryStaff,
                assignedStaffs: normalizedStaffs, // MẢNG THỢ MỚI
                rowId: b.rowId,
                allocated_resource: b.resourceId || b.allocated_resource || b.rowId,
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
                // CHUẨN HÓA ID KEY CHO STAFFMAP
                const sId = normalizeStaffId(String(s.id).trim());
                const rawStart = s['上班'] || s.shiftStart || s.start || "00:00";
                const rawEnd = s['下班'] || s.shiftEnd || s.end || "00:00";
                const dayStatus = s[targetDateStandard] || s[targetDateStandard.replace(/\//g, '-')] || "";
                let isOff = (String(s.offDays || "").includes(targetDateStandard) || String(dayStatus).toUpperCase().includes('OFF'));
                staffMap[sId] = {
                    id: sId, gender: s.gender, start: rawStart, end: rawEnd,
                    isStrictTime: (s.isStrictTime === true || String(s.isStrictTime).toUpperCase() === 'TRUE'), off: isOff
                };
                // Đồng bộ cả key name nếu có
                if (s.name) staffMap[normalizeStaffId(String(s.name).trim())] = staffMap[sId];
            });
        }
        try {
            const result = CoreKernel.checkRequestAvailability(targetDateStandard, time, coreGuests, coreBookings, staffMap);
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
        // Chuẩn hóa ID thợ ngay từ list đầu vào để tránh lỗi Map/Dropdown
        const safeStaffList = useMemo(() => {
            if (!staffList) return [];
            return staffList.map(s => ({ ...s, id: normalizeStaffId(s.id) }));
        }, [staffList]);

        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [isChecking, setIsChecking] = useState(false);
        const [serverData, setServerData] = useState(null);

        // SURNAME PICKER STATE
        const [showSurnamePicker, setShowSurnamePicker] = useState(false);

        // Default: "套餐 (120分)"
        const defaultService = useMemo(() => {
            if (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) {
                if (window.SERVICES_LIST.includes("套餐 (120分)")) {
                    return "套餐 (120分)";
                }
                return window.SERVICES_LIST[0];
            }
            return "Body Massage";
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

        // --- TITLE STATE ---
        const [form, setForm] = useState({
            date: initialDate || new Date().toISOString().slice(0, 10),
            time: getRoundedCurrentTime(), pax: 1, custName: '', custTitle: '', custPhone: '', adminNote: ''
        });

        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false, isGuaSha: false }]);

        useEffect(() => {
            if (editingBooking) {
                let timeStr = getRoundedCurrentTime(); let dateStr = initialDate;
                if (editingBooking.startTimeString) {
                    const parts = editingBooking.startTimeString.split(' ');
                    if (parts.length >= 2) { 
                        dateStr = parts[0].replace(/\//g, '-'); 
                        timeStr = parts[1].substring(0, 5); 
                        // [V116.3 NÂNG CẤP]: Phục hồi Calendar Date cho UI hiển thị nhảy ngày
                        const hh = parseInt(timeStr.split(':')[0], 10);
                        if (hh >= 0 && hh <= 6) {
                            let d = new Date(dateStr.replace(/-/g, '/')); d.setDate(d.getDate() + 1);
                            dateStr = d.toISOString().split('T')[0];
                        }
                    }
                }

                let rawName = (editingBooking.customerName || "").split('(')[0].trim();
                let parsedTitle = '';
                if (rawName.endsWith('先生')) {
                    parsedTitle = '先生';
                    rawName = rawName.slice(0, -2).trim();
                } else if (rawName.endsWith('小姐')) {
                    parsedTitle = '小姐';
                    rawName = rawName.slice(0, -2).trim();
                }

                const noteStr = editingBooking.ghiChu || editingBooking.note || "";

                setForm({
                    date: dateStr, time: timeStr, pax: editingBooking.pax || 1,
                    custName: rawName,
                    custTitle: parsedTitle,
                    custPhone: editingBooking.phone || "",
                    adminNote: editingBooking.adminNote || ""
                });
                setGuestDetails([{
                    service: editingBooking.serviceName || defaultService,
                    staff: editingBooking.staffId ? normalizeStaffId(editingBooking.staffId) : '隨機',
                    isOil: editingBooking.isOil || false,
                    isGuaSha: noteStr.includes('刮痧/拔罐')
                }]);
            }
            fetchLiveServerData(true).then(data => { if (data) setServerData(data); });
        }, [editingBooking, initialDate, defaultService]);

        // [V116.3 NÂNG CẤP]: Móc nối Dual-Date, chuyển đổi từ Calendar Date (UI) xuống Operational Date (Hệ Thống)
        const getOpDate = (calDateStr, timeStr) => {
            const h = parseInt((timeStr || "12:00").toString().split(':')[0], 10);
            if (h >= 0 && h <= 6) {
                let d = new Date(calDateStr.replace(/-/g, '/'));
                d.setDate(d.getDate() - 1);
                return d.toISOString().split('T')[0];
            }
            return calDateStr;
        };

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

                // [V116.3 NÂNG CẤP]: Dual-Date Mapping - Tự động nhảy ngày UI 
                if (type === 'HOUR' && prev.date) {
                    const oldHour = parseInt(parts[0], 10);
                    const selHour = parseInt(value, 10);
                    if (selHour >= 0 && selHour <= 6 && (oldHour > 6 || isNaN(oldHour))) {
                        let d = new Date(prev.date.replace(/-/g, '/')); d.setDate(d.getDate() + 1);
                        newDate = d.toISOString().split('T')[0];
                    } else if (oldHour >= 0 && oldHour <= 6 && selHour > 6) {
                        let d = new Date(prev.date.replace(/-/g, '/')); d.setDate(d.getDate() - 1);
                        newDate = d.toISOString().split('T')[0];
                    }
                }

                return { ...prev, date: newDate, time: `${newHour}:${newMinute}` };
            });
            setCheckResult(null); setSuggestions([]);
        }, []);

        const handlePaxChange = (val) => {
            const num = parseInt(val) || 1;
            setForm(prev => ({ ...prev, pax: num })); setCheckResult(null); setSuggestions([]);
            setGuestDetails(prev => {
                const newD = [...prev];
                if (num > prev.length) for (let i = prev.length; i < num; i++) newD.push({ service: prev[0]?.service || defaultService, staff: '隨機', isOil: false, isGuaSha: false });
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
                    if (val && (val.includes('足') || val.includes('Foot'))) c[idx].isOil = false;
                }
                else if (field === 'staff') {
                    c[idx].staff = val;
                }
                else if (field === 'toggleOil') {
                    c[idx].isOil = !c[idx].isOil;
                }
                else if (field === 'toggleGuaSha') {
                    c[idx].isGuaSha = !c[idx].isGuaSha;
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
            setIsChecking(true); setCheckResult(null); setSuggestions([]);
            let freshData = await fetchLiveServerData(true);
            let serverBookingsList = freshData ? freshData.bookings : (serverData?.bookings || []);
            let serverStaffList = freshData ? freshData.staff : (serverData?.staff || safeStaffList);
            let localBookingsList = safeBookings;
            let finalBookings = mergeBookingData(serverBookingsList, localBookingsList);
            if (editingBooking) { finalBookings = finalBookings.filter(b => b.rowId !== editingBooking.rowId); }
            const opDateCheck = getOpDate(form.date, form.time);
            const res = callCoreAvailabilityCheck(opDateCheck, form.time, guestDetails, finalBookings, serverStaffList);
            if (res.valid) {
                setCheckResult({ status: 'OK', message: "✅ 此時段可預約 (Available)", coreDetails: res.details, debug: res.debug });
            } else {
                setCheckResult({ status: 'FAIL', message: res.reason, debug: res.debug });
                const found = [];
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0] || 0) * 60 + (parts[1] || 0);
                for (let i = 1; i <= 24; i++) {
                    let nM = currMins + (i * 10); let h = Math.floor(nM / 60); let m = nM % 60; if (h >= 24) h -= 24;
                    let tStr = `${String(h).padStart(2, '0')}:${String(Math.floor(m / 10) * 10).padStart(2, '0')}`;
                    const sugOpDate = getOpDate(form.date, tStr);
                    if (callCoreAvailabilityCheck(sugOpDate, tStr, guestDetails, finalBookings, serverStaffList).valid) {
                        found.push(tStr); if (found.length >= 4) break;
                    }
                }
                setSuggestions(found);
            }
            setIsChecking(false);
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;

            const finalCustName = (form.custName.trim() + (form.custTitle || '')).trim();
            if (!finalCustName) { alert("⚠️ 請輸入顧客姓名 (Enter Name)!"); return; }

            setIsSubmitting(true);
            try {
                let checkBookings = mergeBookingData(serverData?.bookings || [], safeBookings);
                if (editingBooking) checkBookings = checkBookings.filter(b => b.rowId !== editingBooking.rowId);
                const finalOpDate = getOpDate(form.date, form.time);
                const finalCheck = callCoreAvailabilityCheck(finalOpDate, form.time, guestDetails, checkBookings, serverData?.staff || safeStaffList);

                if (!finalCheck.valid) {
                    alert("⚠️ 數據已變更，無法預約: " + finalCheck.reason);
                    setIsSubmitting(false);
                    return;
                }

                const detailedGuests = guestDetails.map((g, i) => {
                    const detail = finalCheck.details ? finalCheck.details.find(d => d.guestIndex === i) : null;
                    let finalFlow = detail ? detail.flow : 'SINGLE';

                    if (finalFlow === 'SINGLE') {
                        const svcCode = getServiceCodeByName(g.service);
                        if (svcCode && window.SERVICES_DATA && window.SERVICES_DATA[svcCode]) {
                            const svcDef = window.SERVICES_DATA[svcCode];
                            const sType = (svcDef.type || 'BODY').toUpperCase();
                            if (sType === 'FOOT' || sType === 'CHAIR') finalFlow = 'FOOTSINGLE';
                            else finalFlow = 'BODYSINGLE';
                        } else {
                            if (g.service.toUpperCase().match(/FOOT|CHAIR|足/)) finalFlow = 'FOOTSINGLE';
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

                const oils = detailedGuests.map((g, i) => g.isOil ? `K${i + 1}:精油` : null).filter(Boolean);
                const guaShas = detailedGuests.map((g, i) => g.isGuaSha ? `K${i + 1}:刮痧/拔罐` : null).filter(Boolean);
                const flows = detailedGuests.map((g, i) => {
                    if (g.flow === 'BF') return `K${i + 1}:先做身體`;
                    if (g.flow === 'FB') return `K${i + 1}:先做腳`;
                    return null;
                }).filter(Boolean);

                const noteParts = [...oils, ...guaShas, ...flows];
                const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";

                const payload = {
                    hoTen: finalCustName,
                    sdt: form.custPhone || "",
                    dichVu: detailedGuests.map(g => g.service).join(','),
                    pax: form.pax,
                    ngayDen: normalizeDateStrict(finalOpDate),
                    gioDen: form.time,
                    nhanVien: detailedGuests[0].staff,
                    isOil: detailedGuests[0].isOil,
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
                    guestDetails: detailedGuests,
                    mainFlow: detailedGuests[0].flowCode,
                    phase1_duration: detailedGuests[0].phase1_duration,
                    phase2_duration: detailedGuests[0].phase2_duration,

                    allocated_resource: detailedGuests[0].allocated_resource,
                    phase1_resource: detailedGuests[0].phase1_resource,
                    phase2_resource: detailedGuests[0].phase2_resource,

                    proposedUpdates: finalCheck.proposedUpdates || [],
                    rowId: editingBooking ? editingBooking.rowId : null
                };

                if (onSave) {
                    await Promise.resolve(onSave(payload));
                    forceGlobalRefresh();
                    setTimeout(() => { onClose(); setIsSubmitting(false); }, 500);
                }
            } catch (err) { alert("儲存失敗: " + err.message); setIsSubmitting(false); }
        };

        const HOURS_LIST = ['05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '00', '01', '02', '03', '04'];
        const MINUTES_STEP = ['00', '10', '20', '30', '40', '50'];
        const [cH, cM] = (form.time || "12:00").split(':');
        const paxOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

        return (
            <>
                {/* --- MÀN HÌNH CHỌN HỌ (FULL-SCREEN OVERLAY) --- */}
                {showSurnamePicker && (
                    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-fadeIn">
                        <div className="bg-orange-600 p-6 text-white flex justify-between items-center shadow-md">
                            <h2 className="text-3xl font-bold">請選擇姓氏 (Select Surname)</h2>
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
                                關閉 (Close)
                            </button>
                        </div>
                    </div>
                )}

                {/* --- MÀN HÌNH MODAL CHÍNH --- */}
                <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-2 sm:p-6">
                    <div className="bg-white w-full max-w-[1000px] rounded-2xl shadow-2xl flex flex-col h-[98vh] sm:h-[90vh] overflow-hidden animate-fadeIn">
                        <div className={`${editingBooking ? 'bg-orange-600' : 'bg-[#0891b2]'} p-6 text-white flex justify-between items-center shrink-0`}>
                            <h3 className="font-bold text-2xl">{editingBooking ? "✏️ 修改預約 (Edit)" : "📅 預約 (V116.2 MULTI-STAFF)"}</h3>
                            <button onClick={onClose} className="text-4xl hover:text-red-100 leading-none">&times;</button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                            {step === 'CHECK' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-lg font-bold text-gray-500 mb-1 block">日期 (Date)</label>
                                            <input type="date" className="w-full border-2 p-3 rounded-xl font-bold text-xl h-[64px] bg-slate-50" value={form.date} onChange={e => { setForm({ ...form, date: e.target.value }); setCheckResult(null); }} />
                                        </div>
                                        <div>
                                            <label className="text-lg font-bold text-gray-500 mb-1 block">時間 (Time)</label>
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
                                        <label className="text-lg font-bold text-gray-500 mb-1 block">人數 (Pax)</label>
                                        <select className="w-full border-2 p-3 rounded-xl font-bold text-xl text-center h-[64px] bg-slate-50" value={form.pax} onChange={e => handlePaxChange(e.target.value)}>
                                            {paxOptions.map(n => <option key={n} value={n}>{n} 位</option>)}
                                        </select>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-xl border-2 space-y-3">
                                        <div className="text-base font-bold text-gray-500 uppercase">詳細需求 (Details)</div>
                                        {guestDetails.map((g, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <div className="w-10 shrink-0 h-[64px] rounded-lg bg-gray-200 hidden sm:flex items-center justify-center font-black text-lg text-slate-500">#{i + 1}</div>

                                                <select className="flex-[1.5] min-w-0 border-2 p-2 sm:p-3 rounded-lg font-bold text-base sm:text-xl h-[64px] bg-white" value={g.service} onChange={e => handleGuestUpdate(i, 'service', e.target.value)}>
                                                    {(window.SERVICES_LIST || []).map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>

                                                <select className="flex-[1] min-w-0 border-2 p-2 sm:p-3 rounded-lg font-bold text-base sm:text-xl h-[64px] bg-white" value={g.staff} onChange={e => handleGuestUpdate(i, 'staff', e.target.value)}>
                                                    <option value="隨機">🎲 隨機</option>
                                                    <option value="女">🚺 女師</option>
                                                    <option value="男">🚹 男師</option>
                                                    <optgroup label="技師">{safeStaffList.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</optgroup>
                                                </select>

                                                <button
                                                    onClick={(e) => { e.preventDefault(); handleGuestUpdate(i, 'toggleOil'); }}
                                                    className={`flex-[0.7] min-w-[70px] px-2 shrink-0 border-2 rounded-lg font-bold text-base sm:text-lg h-[64px] transition-colors whitespace-nowrap flex items-center justify-center gap-1 ${g.isOil ? 'bg-orange-100 text-orange-700 border-orange-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200'}`}
                                                >
                                                    <span className={g.isOil ? "opacity-100" : "opacity-50"}>💧</span>精油
                                                </button>

                                                <button
                                                    onClick={(e) => { e.preventDefault(); handleGuestUpdate(i, 'toggleGuaSha'); }}
                                                    className={`flex-[0.7] min-w-[70px] px-2 shrink-0 border-2 rounded-lg font-bold text-base sm:text-lg h-[64px] transition-colors whitespace-nowrap flex items-center justify-center gap-1 ${g.isGuaSha ? 'bg-red-100 text-red-700 border-red-400 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-300 hover:bg-slate-200'}`}
                                                >
                                                    <span className={g.isGuaSha ? "opacity-100" : "opacity-50"}>[刮]</span>刮/罐
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="pt-4">
                                        {!checkResult ?
                                            <button onClick={performCheck} disabled={isChecking} className={`w-full text-white p-5 rounded-xl font-bold text-xl shadow-lg flex justify-center items-center ${isChecking ? 'bg-gray-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                                                {isChecking ? "🔄 正在同步數據..." : "🔍 查詢空位 (Strict Scan)"}
                                            </button>
                                            :
                                            <div className="space-y-4">
                                                <div className={`p-5 rounded-xl text-center font-bold text-xl border-2 ${checkResult.status === 'OK' ? 'bg-green-100 text-green-700 border-green-400' : 'bg-red-50 text-red-700 border-red-300'}`}>{checkResult.message}</div>
                                                {checkResult.status === 'FAIL' && suggestions.length > 0 && (
                                                    <div className="bg-yellow-50 p-4 rounded-xl border-2 border-yellow-300">
                                                        <div className="text-base font-bold text-yellow-800 mb-3">💡 建議時段 (Suggestions):</div>
                                                        <div className="flex gap-3 flex-wrap">
                                                            {suggestions.map(t => (
                                                                <button key={t} onClick={() => { setForm(f => ({ ...f, time: t })); setCheckResult(null); setSuggestions([]); }} className="px-5 py-2 bg-white border-2 border-yellow-400 text-yellow-900 rounded-lg font-bold text-lg hover:bg-yellow-200">
                                                                    {t}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex gap-4">
                                                    {checkResult.status === 'OK' ?
                                                        <button onClick={() => setStep('INFO')} className="w-full bg-emerald-600 text-white p-5 rounded-xl font-bold text-xl shadow-lg animate-pulse hover:bg-emerald-700">➡️ 下一步 (Next)</button>
                                                        :
                                                        <button onClick={() => { setCheckResult(null); setSuggestions([]) }} className="w-full bg-gray-400 text-white p-5 rounded-xl font-bold text-xl hover:bg-gray-500">🔄 重新選擇 (Retry)</button>
                                                    }
                                                </div>
                                            </div>
                                        }
                                    </div>
                                </>
                            )}

                            {step === 'INFO' && (
                                <div className="space-y-6 animate-slideIn flex flex-col h-full">
                                    <div className="bg-green-50 p-4 rounded-xl border-2 border-green-300 text-green-900 font-bold">
                                        <div className="flex justify-between border-b-2 border-green-200 pb-3 mb-3 text-xl">
                                            <span>{form.date}</span>
                                            <span>{form.time}</span>
                                        </div>
                                        <div className="text-lg font-normal space-y-2">
                                            {checkResult && checkResult.coreDetails && checkResult.coreDetails.map((d, i) => (
                                                <div key={i} className="flex justify-between items-center bg-white p-2 rounded-lg border border-green-200 shadow-sm">
                                                    <span>#{i + 1} {d.service}</span>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="flex gap-2">
                                                            <span className="bg-green-100 px-3 py-1 rounded-md text-green-800 text-sm font-bold">{d.staff}</span>
                                                            {d.flow === 'BF' && <span className="bg-orange-100 px-3 py-1 rounded-md text-orange-800 border border-orange-300 text-sm font-bold">⚠️ 先做身體</span>}
                                                            {d.flow === 'FB' && <span className="bg-blue-100 px-3 py-1 rounded-md text-blue-800 border border-blue-300 text-sm font-bold">🦶 先做腳</span>}
                                                        </div>
                                                        {d.allocated && d.allocated.length > 0 && (
                                                            <div className="text-sm text-gray-500 font-mono mt-1">
                                                                📍 {d.allocated.join(' -> ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-2 block">顧客姓名 (Name)</label>
                                        <div className="flex gap-3">
                                            <input
                                                className="flex-[2] border-2 border-slate-300 p-4 rounded-xl font-bold text-2xl outline-none focus:border-indigo-500"
                                                value={form.custName}
                                                onChange={e => setForm({ ...form, custName: e.target.value })}
                                                placeholder="輸入姓名..."
                                                disabled={isSubmitting}
                                            />
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleTitleToggle('先生'); }}
                                                className={`flex-[1] border-2 rounded-xl font-bold text-xl transition-colors whitespace-nowrap ${form.custTitle === '先生' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'}`}
                                            >
                                                先生
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleTitleToggle('小姐'); }}
                                                className={`flex-[1] border-2 rounded-xl font-bold text-xl transition-colors whitespace-nowrap ${form.custTitle === '小姐' ? 'bg-pink-600 text-white border-pink-600 shadow-md' : 'bg-pink-50 text-pink-700 border-pink-300 hover:bg-pink-100'}`}
                                            >
                                                小姐
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); setShowSurnamePicker(true); }}
                                                className="flex-[1] bg-orange-100 text-orange-700 border-2 border-orange-400 rounded-xl font-bold text-xl hover:bg-orange-200 transition-colors shadow-sm whitespace-nowrap"
                                                title="選擇姓氏 (Select Surname)"
                                            >
                                                姓
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-2 block">電話號碼 (Phone)</label>
                                        <input
                                            className="w-full border-2 border-slate-300 p-4 rounded-xl font-bold text-2xl outline-none focus:border-indigo-500"
                                            value={form.custPhone}
                                            onChange={e => setForm({ ...form, custPhone: e.target.value })}
                                            placeholder="09xx..."
                                            disabled={isSubmitting}
                                            type="tel"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-lg font-bold text-gray-500 mb-2 block">特別要求 / 備註 (Admin Note)</label>
                                        <div className="flex gap-3">
                                            <input
                                                className="flex-[2] border-2 border-slate-300 p-4 rounded-xl font-bold text-xl outline-none focus:border-indigo-500"
                                                value={form.adminNote}
                                                onChange={e => setForm({ ...form, adminNote: e.target.value })}
                                                placeholder="輸入特別要求..."
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
                                                <option value="">⚡ 快速選擇</option>
                                                {safeQuickNotes.map((note, idx) => (
                                                    <option key={idx} value={note}>{note}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 pt-6 mt-auto">
                                        <button onClick={(e) => { e.preventDefault(); if (!isSubmitting) setStep('CHECK'); }} className="flex-[1] bg-gray-200 p-5 rounded-xl font-bold text-gray-700 hover:bg-gray-300 text-xl" disabled={isSubmitting}>
                                            ⬅️ 返回 (Back)
                                        </button>
                                        <button onClick={handleFinalSave} className="flex-[2] bg-indigo-600 text-white p-5 rounded-xl font-bold shadow-xl hover:bg-indigo-700 text-xl" disabled={isSubmitting}>
                                            {isSubmitting ? "處理中..." : (editingBooking ? "💾 保存修改 (Save)" : "✅ 確認預約 (Confirm)")}
                                        </button>
                                    </div>
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
            console.log("♻️ AvailabilityModal Injected (V116.2 - SSOT, DURATION FIX, ID NORM & MULTI-STAFF)");
        }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);

})();
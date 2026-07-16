const fs = require('fs');
const sheet = require('./cyx_sheet_service.js');
const core = require('./cyx_resource_core.js');

const CONF = { TOLERANCE: 15, CLEANUP_BUFFER: 10, TRANSITION_BUFFER: 5 };
const getSystemConfig = () => ({ SCALE: { MAX_CHAIRS: 6, MAX_BEDS: 6 }, BUFFERS: { TRANSITION_MINUTES: 5, CLEANUP_MINUTES: 10 }});
const normalizeDateStrict = (d) => d;
const getMinsFromTimeStr = core.getMinsFromTimeStr;
const isComboService = core.isComboService;
const getServiceInfo = core.getServiceInfo;
const inferFlowFromService = core.inferFlowFromService;
const isStatusRunning = (s) => String(s).toUpperCase().includes('RUNNING') || String(s).toUpperCase().includes('SERVING');
const SERVICES = {};
Object.keys(core.SERVICES).forEach(k => SERVICES[k] = core.SERVICES[k]);
SERVICES['A4'] = core.SERVICES['A4'];

const frontendCode = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');
const checkRequestAvailabilitySrc = frontendCode.substring(
    frontendCode.indexOf('function checkRequestAvailability'),
    frontendCode.indexOf('function validateGlobalCapacity')
);

// We evaluate the checkRequestAvailability function in the current context
function validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, isSimulation = false) {
            const CONF = getSystemConfig();

            const triggerSmartFailure = (reasonMsg) => {
                if (isSimulation) return { pass: false, reason: reasonMsg };
                
                let foundMins = -1;
                let searchStart = Math.max(requestStart + 10, 0); 
                
                for (let t = searchStart; t <= 1800; t += 10) {
                    let sim = validateGlobalCapacity(t, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, true);
                    if (sim.pass) {
                        foundMins = t;
                        break;
                    }
                }
                
                if (foundMins !== -1) {
                    const timeStr = getTimeStrFromMins(foundMins);
                    return { pass: false, reason: `${reasonMsg}\nðŸ’¡ æ™ºèƒ½å»ºè­°ï¼šæœ€å¿«å¯å®Œæ•´å®‰æŽ’ (å«æ‰€æœ‰éšŽæ®µ) çš„æ™‚é–“ç‚º ${timeStr} ä¹‹å¾Œã€‚`, debug: {} };
                } else {
                    return { pass: false, reason: `${reasonMsg}\nâš ï¸ ä»Šæ—¥å¾ŒçºŒæ™‚æ®µå·²ç„¡è¶³å¤ è³‡æºå¯å®Œæ•´å®‰æŽ’æ­¤é ç´„ã€‚`, debug: {} };
                }
            };

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
                const { p1, realDuration } = calculateRealDurations(b, b.duration || 60, isCombo);

                const rIdStr = (b.phase1_res_idx || "") + " " + (b.phase2_res_idx || "") + " " + (b.allocated_resource || "") + " " + (b.location || "") + " " + (b.current_resource_id || "") + " " + (b.rowId || "");
                const matches = [...rIdStr.matchAll(/((?:BED|CHAIR|åºŠ|è¶³|è…³)[-_ ]?\d+)/gi)].map(m => m[1].toUpperCase());
                let uniqueMatches = [...new Set(matches)];

                // [V118.8 FIX] Há»— trá»£ trÃ­ch xuáº¥t sá»‘ gháº¿/giÆ°á»ng náº¿u chuá»—i chá»‰ cÃ³ sá»‘ Ä‘Æ¡n thuáº§n (phÃ²ng ngá»«a BÃ³ng Ma Toáº¡ Äá»™)
                if (uniqueMatches.length === 0) {
                    const backupMatches = [...rIdStr.matchAll(/(\d+)/gi)].map(m => m[1]);
                    let inferredType = 'CHAIR';
                    if (svcInfo) {
                        if (svcInfo.type === 'BED' || svcInfo.type === 'CHAIR') inferredType = svcInfo.type;
                        else {
                            const name = (svcInfo.name || '').toUpperCase();
                            if (name.match(/BODY|æŒ‡å£“|æ²¹|BED|TOAN THAN|å…¨èº«|æ²¹å£“|SPA|BACK/)) inferredType = 'BED';
                        }
                    }
                    uniqueMatches = [...new Set(backupMatches)].map(num => `${inferredType}-${num}`);
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
                        const laneMatch = res.match(/(BED|CHAIR|åºŠ|è¶³|è…³)[-_ ]?(\d+)/i);
                        if (laneMatch) {
                            const type = (laneMatch[1].toUpperCase().includes('BED') || laneMatch[1].includes('åºŠ')) ? 'BED' : 'CHAIR';
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

                    if (storedFlow === 'BF') isBodyFirst = true;
                    else if (storedFlow === 'FB') isBodyFirst = false;
                    else {
                        const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
                        if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('å…ˆåšèº«é«”')) isBodyFirst = true;
                        else if (b._impliedFlow === 'BF') isBodyFirst = true;
                    }

                    if (uniqueMatches.length >= 2) {
                        if (isBodyFirst) {
                            res1 = uniqueMatches.find(r => r.includes('BED') || r.includes('åºŠ')) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('è¶³')) || uniqueMatches[1];
                        } else {
                            res1 = uniqueMatches.find(r => r.includes('CHAIR') || r.includes('è¶³')) || uniqueMatches[0];
                            res2 = uniqueMatches.find(r => r.includes('BED') || r.includes('åºŠ')) || uniqueMatches[1];
                        }
                    } else if (uniqueMatches.length === 1) {
                        const mType = (uniqueMatches[0].toUpperCase().includes('BED') || uniqueMatches[0].includes('åºŠ')) ? 'BED' : 'CHAIR';
                        if (isBodyFirst) {
                            if (mType === 'BED') res1 = uniqueMatches[0];
                            else res2 = uniqueMatches[0];
                        } else {
                            if (mType === 'CHAIR') res1 = uniqueMatches[0];
                            else res2 = uniqueMatches[0];
                        }
                    }
                    
                    if (!isBodyFirst) { type1 = 'CHAIR'; type2 = 'BED'; }

                    pushToMap(res1, bStart, bStart + p1 + CONF.CLEANUP_BUFFER, type1);
                    pushToMap(res2, bStart + p1 + CONF.TRANSITION_BUFFER, bStart + realDuration + CONF.CLEANUP_BUFFER, type2);
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

                // [FRONTEND V118] Thuáº­t toÃ¡n PhÃ¢n Ä‘oáº¡n Ca ÄÃªm
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
            const femaleSupply = availableStaffList.filter(s => s.gender === 'F' || s.gender === 'å¥³').length;
            const maleSupply = availableStaffList.filter(s => s.gender === 'M' || s.gender === 'ç”·').length;

            let staffBusyCount = 0;
            let femaleBusyCount = 0;
            let maleBusyCount = 0;
            let staffBusyPeriods = {}; // { '9': [{start, end}] }

            let distinctStaffs = new Set();
            let distinctFemaleStaffs = new Set();
            let distinctMaleStaffs = new Set();
            let overlapEvents = [];

            relevantBookings.forEach(b => {
                const bS = getMinsFromTimeStr(b.startTime);
                const svcInfo = SERVICES[b.serviceCode] || { name: b.serviceName };
                const storedFlow = b.originalData?.flowCode || b.flow;
                const isCombo = isComboService(svcInfo, b.serviceName, storedFlow);
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
                            if (!staffName) continue;
                            const sId = normId(staffName);
                            
                            const isRandom = (sId === '隨機' || sId === 'éš¨æ©Ÿ' || sId === 'ANY' || sId === 'UNDEFINED' || sId === 'NULL' || sId === 'FALSE' || sId === '');
                            const isFemaleReq = (sId === 'å¥³' || sId === 'å¥³å¸«' || sId === 'FEMALE');
                            const isMaleReq = (sId === 'ç”·' || sId === 'ç”·å¸«' || sId === 'MALE');
                            
                            allDelta++;
                            
                            if (isFemaleReq) {
                                femaleDelta++;
                            } else if (isMaleReq) {
                                maleDelta++;
                            } else if (!isRandom) {
                                distinctStaffs.add(sId);
                                const sInfo = staffList[staffName] || Object.values(staffList).find(s => normId(s.name) === sId || normId(s.id) === sId) || {};
                                if (sInfo.gender === 'F' || sInfo.gender === 'å¥³' || sInfo.group === 'å¥³') {
                                    femaleDelta++;
                                    distinctFemaleStaffs.add(sId);
                                } else if (sInfo.gender === 'M' || sInfo.gender === 'ç”·' || sInfo.group === 'ç”·') {
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
                if (req === 'FEMALE' || req === 'å¥³' || req === 'å¥³å¸«') femaleReqCount++;
                else if (req === 'MALE' || req === 'ç”·' || req === 'ç”·å¸«') maleReqCount++;
                else if (req && req !== 'éš¨æ©Ÿ' && req !== 'Any' && req !== 'undefined' && req !== 'null') {
                    const sId = normId(req);
                    specificStaffReqs.push({ req: sId, rawReq: req, duration: (SERVICES[g.serviceCode] || { duration: 60 }).duration || 60 });
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
                    return { pass: false, reason: `âš ï¸ éŒ¯èª¤: ä¸å¯åŒæ™‚æŒ‡æ´¾ ${count} ä½å®¢äººçµ¦åŒä¸€æŠ€å¸« ${req}ã€‚`, debug: {} };
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
                        return triggerSmartFailure(`âš ï¸ æŠ€å¸« ${rawName} è©²æ™‚æ®µæœªæŽ’ç­æˆ–å·²ä¸‹ç­ã€‚`);
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
                        return triggerSmartFailure(`âš ï¸ æŠ€å¸« ${rawName} è©²æ™‚æ®µå·²æœ‰é ç´„ã€‚`);
                    }
                }
            }

            // 3. GENDER POOL CHECK
            if (femaleReqCount > 0 && (femaleBusyCount + femaleReqCount) > femaleSupply) {
                return triggerSmartFailure(`âš ï¸ å¥³æŠ€å¸«ä¸è¶³ã€‚å¥³å¸«ç¸½å…±: ${femaleSupply}, å¿™ç¢Œä¸­: ${femaleBusyCount}, æ¬²é ç´„å¥³å¸«æ•¸: ${femaleReqCount}`);
            }

            if (maleReqCount > 0 && (maleBusyCount + maleReqCount) > maleSupply) {
                return triggerSmartFailure(`âš ï¸ ç”·æŠ€å¸«ä¸è¶³ã€‚ç”·å¸«ç¸½å…±: ${maleSupply}, å¿™ç¢Œä¸­: ${maleBusyCount}, æ¬²é ç´„ç”·å¸«æ•¸: ${maleReqCount}`);
            }

            // 4. OVERALL POOL CHECK
            if ((staffBusyCount + guestList.length) > supplyCount) {
                return triggerSmartFailure(`âš ï¸ æŠ€å¸«ç¸½æ•¸ä¸è¶³ã€‚ç¸½å…±: ${supplyCount}, å¿™ç¢Œä¸­: ${staffBusyCount}, æ–°å®¢: ${guestList.length}`);
            }

            // SIMULATION
            const simulationMap = JSON.parse(JSON.stringify(resourceMap));
            const suggestedLanes = {}; // [NEW V118.6]

            for (let i = 0; i < guestList.length; i++) {
                const g = guestList[i];
                const svc = SERVICES[g.serviceCode] || { duration: 60 };
                const duration = svc.duration || 60;
                const isCombo = isComboService(svc, g.serviceCode, g.flowCode);
                const guestIdKey = g.idx !== undefined ? g.idx : i; // Äáº£m báº£o Ä‘Ãºng index

                if (isCombo) {
                    let foundValidSplit = false;
                    const eStep = svc.elasticStep || 1;
                    const eLimit = svc.elasticLimit || 20;
                    const flowsToTry = (g.flowCode === 'FB' || g.flowCode === 'BF') ? [g.flowCode] : ['FB', 'BF'];
                    
                    for (const testFlow of flowsToTry) {
                        const splitsToTry = generateElasticSplits(duration, eStep, eLimit, null, svc, testFlow);
                        
                        for (const split of splitsToTry) {
                            const p1 = split.p1;
                            const p2 = split.p2;
                            const tStart = requestStart;
                            const tSwitch = tStart + p1 + CONF.TRANSITION_BUFFER;
                            
                            let bedIdx = -1, chairIdx = -1;
                            
                            if (testFlow === 'BF') {
                                for (let b = 0; b < CONF.MAX_BEDS; b++) {
                                    if (checkLaneContinuity(simulationMap.BED[b], tStart, tStart + p1)) { bedIdx = b; break; }
                                }
                                for (let c = 0; c < CONF.MAX_CHAIRS; c++) {
                                    if (checkLaneContinuity(simulationMap.CHAIR[c], tSwitch, tSwitch + p2)) { chairIdx = c; break; }
                                }
                                if (bedIdx !== -1 && chairIdx !== -1) {
                                    simulationMap.BED[bedIdx].push({ start: tStart, end: tStart + p1 + CONF.CLEANUP_BUFFER });
                                    simulationMap.CHAIR[chairIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                                    suggestedLanes[guestIdKey] = { BED: bedIdx + 1, CHAIR: chairIdx + 1 };
                                    foundValidSplit = true;
                                    break;
                                }
                            } else {
                                for (let c = 0; c < CONF.MAX_CHAIRS; c++) {
                                    if (checkLaneContinuity(simulationMap.CHAIR[c], tStart, tStart + p1)) { chairIdx = c; break; }
                                }
                                for (let b = 0; b < CONF.MAX_BEDS; b++) {
                                    if (checkLaneContinuity(simulationMap.BED[b], tSwitch, tSwitch + p2)) { bedIdx = b; break; }
                                }
                                if (chairIdx !== -1 && bedIdx !== -1) {
                                    simulationMap.CHAIR[chairIdx].push({ start: tStart, end: tStart + p1 + CONF.CLEANUP_BUFFER });
                                    simulationMap.BED[bedIdx].push({ start: tSwitch, end: tSwitch + p2 + CONF.CLEANUP_BUFFER });
                                    suggestedLanes[guestIdKey] = { CHAIR: chairIdx + 1, BED: bedIdx + 1 };
                                    foundValidSplit = true;
                                    break;
                                }
                            }
                        }
                        if (foundValidSplit) break;
                    }

                    if (!foundValidSplit) {
                        return triggerSmartFailure(`âš ï¸ åœ¨ ${getTimeStrFromMins(requestStart)} æ²’æœ‰è¶³å¤ çš„é€£çºŒç©ºä½çµ¦å¥—é¤ã€‚`);
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
                        suggestedLanes[guestIdKey] = { [rType]: foundIdx + 1 };
                    } else {
                        return triggerSmartFailure(`âš ï¸ å·²ç¶“æ²’æœ‰é€£çºŒ ${duration} åˆ†é˜çš„ç©º${rType === 'BED' ? 'åºŠä½' : 'åº§ä½'}ã€‚`);
                    }
                }
            }
            return { pass: true, debug: { msg: "V118.6 Continuous Scan Passed" }, resourceMap: resourceMap, suggestedLanes: suggestedLanes };
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
            tryAllocate(type, start, end, ownerId, preferredIndex = null, isForced = false) {
                const resourceGroup = this.lanes[type];
                if (!resourceGroup) return null;

                if (preferredIndex !== null && preferredIndex > 0 && preferredIndex <= resourceGroup.length) {
                    const targetLane = resourceGroup[preferredIndex - 1];
                    // --- V118.4 BUG FIX: DÃ¹ cÃ³ trÃ¹ng lá»‹ch (checkLaneFree = false), náº¿u lÃ  isForced (Ä‘Ã£ Ä‘Æ°á»£c áº¥n Ä‘á»‹nh tá»« trÆ°á»›c),
                    // báº¯t buá»™c pháº£i nhÃ©t vÃ o targetLane Ä‘á»ƒ phá»¥c dá»±ng chÃ­nh xÃ¡c lá»‹ch sá»­, trÃ¡nh táº¡o BÃ³ng Ma nháº£y sang gháº¿ khÃ¡c! ---
                    if (isForced || this.checkLaneFree(targetLane, start, end).free) {
                        return this.allocateToLane(targetLane, start, end, ownerId);
                    }
                }
                
                // [V118.9 FIX] æ¢å¾©ã€Œå¾žä¸Šåˆ°ä¸‹ç·Šæ¹ŠæŽ’åˆ—ã€(Top-Down Packing) é‚è¼¯ï¼Œå–æ¶ˆç©ºä½å„ªå…ˆåˆ†é…ä»¥é¿å…è¦–è¦ºç©ºéš™ã€‚
                // ä¸å†æ ¹æ“š occupied.length é€²è¡ŒæŽ’åºï¼Œè€Œæ˜¯ä¿ç•™åŽŸå§‹é †åº (CHAIR-1, CHAIR-2...) é€²è¡Œåˆ†é…ã€‚
                let sortedLanes = [...resourceGroup];

                for (let lane of sortedLanes) {
                    const check = this.checkLaneFree(lane, start, end);
                    if (check.free) {
                        return this.allocateToLane(lane, start, end, ownerId);
                    } else {
                        const blockerTime = `${getTimeStrFromMins(check.blocker.start)}-${getTimeStrFromMins(check.blocker.end)}`;
                        this.blockLog.push(`âŒ ${lane.id} è¢« ${check.blocker.ownerId} (${blockerTime}) æ“‹ä½`);
                    }
                }
                
                return null;
            }
        }

        // --- HELPER LOGIC: STAFF MATCHING & ELASTIC (MULTI-STAFF ARRAY UPDATE) ---
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList, queryDateStr = null) {
            const CONF = getSystemConfig();
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
                if (!staffInfo) return false;
                const shiftInfo = resolveStaffShift(staffInfo, queryDateStr);
                if (shiftInfo.off) return false;
                const shiftStart = getMinsFromTimeStr(shiftInfo.start);
                let shiftEnd = getMinsFromTimeStr(shiftInfo.end);
                if (shiftStart === -1 || shiftEnd === -1) return false;

                // [FRONTEND V118] Thuáº­t toÃ¡n PhÃ¢n Ä‘oáº¡n Ca ÄÃªm
                if (shiftEnd < shiftStart) {
                    shiftEnd += 1440;
                }

                const isStrict = staffInfo.isStrictTime === true;
                let inMain = true;
                if ((start + CONF.TOLERANCE) < shiftStart) inMain = false;
                else if (isStrict) {
                    if ((end - CONF.TOLERANCE) > shiftEnd) inMain = false;
                } else {
                    if (start >= shiftEnd) inMain = false;
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

                if (!inMain && !inTail) return false;

                // MULTI-STAFF FIX: Kiá»ƒm tra xem name cÃ³ náº±m trong máº£ng thá»£ cá»§a báº¥t ká»³ booking nÃ o Ä‘ang báº­n khÃ´ng
                for (const b of busyList) {
                    const staffArray = b.assignedStaffs || [b.staffName];
                    if (staffArray.includes(name) && isOverlap(start, end, b.start, b.end)) return false;
                }
                if ((staffReq === 'MALE' || staffReq === 'ç”·' || staffReq === 'ç”·å¸«') && staffInfo.gender !== 'M') return false;
                if ((staffReq === 'FEMALE' || staffReq === 'å¥³' || staffReq === 'å¥³å¸«') && staffInfo.gender !== 'F') return false;
                return true;
            };
            if (staffReq && !['RANDOM', 'MALE', 'FEMALE', 'éš¨æ©Ÿ', 'Any', 'undefined', 'ç”·', 'å¥³', 'ç”·å¸«', 'å¥³å¸«'].includes(staffReq)) {
                return checkOneStaff(staffReq) ? staffReq : null;
            } else {
                const allStaffNames = Object.keys(staffListRef);
                for (const name of allStaffNames) {
                    if (checkOneStaff(name)) return name;
                }
                return null;
            }
        }

        function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null, svcDef = null, flow = 'FB') {
            if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
                return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999 }];
            }
            const standardHalf = Math.floor(totalDuration / 2);
            let options = [];
            
            let minP1 = 15, maxP1 = totalDuration - 15;
            let minP2 = 15, maxP2 = totalDuration - 15;

            if (svcDef) {
                const isBF = (flow === 'BF');
                if (isBF) {
                    if (svcDef.minBody) minP1 = Math.max(minP1, svcDef.minBody);
                    if (svcDef.maxBody) maxP1 = Math.min(maxP1, svcDef.maxBody);
                    if (svcDef.minFoot) minP2 = Math.max(minP2, svcDef.minFoot);
                    if (svcDef.maxFoot) maxP2 = Math.min(maxP2, svcDef.maxFoot);
                } else {
                    if (svcDef.minFoot) minP1 = Math.max(minP1, svcDef.minFoot);
                    if (svcDef.maxFoot) maxP1 = Math.min(maxP1, svcDef.maxFoot);
                    if (svcDef.minBody) minP2 = Math.max(minP2, svcDef.minBody);
                    if (svcDef.maxBody) maxP2 = Math.min(maxP2, svcDef.maxBody);
                }
            }

            // Push 50/50 Ä‘áº§u tiÃªn náº¿u há»£p lá»‡
            let p2_standard = totalDuration - standardHalf;
            if (standardHalf >= minP1 && standardHalf <= maxP1 && p2_standard >= minP2 && p2_standard <= maxP2) {
                options.push({ p1: standardHalf, p2: p2_standard, deviation: 0 });
            }

            if (!step || !limit || step <= 0 || limit <= 0) {
                if (options.length === 0) options.push({ p1: standardHalf, p2: p2_standard, deviation: 0 });
                return options;
            }

            // QuÃ©t Zic-Zac (Zig-Zag)
            for (let d = step; d <= limit; d += step) {
                // Thá»­ giáº£m (vÃ­ dá»¥ 49/51)
                let p1_minus = standardHalf - d;
                let p2_minus = totalDuration - p1_minus;
                if (p1_minus >= minP1 && p1_minus <= maxP1 && p2_minus >= minP2 && p2_minus <= maxP2) {
                    options.push({ p1: p1_minus, p2: p2_minus, deviation: -d });
                }

                // Thá»­ tÄƒng (vÃ­ dá»¥ 51/49)
                let p1_plus = standardHalf + d;
                let p2_plus = totalDuration - p1_plus;
                if (p1_plus >= minP1 && p1_plus <= maxP1 && p2_plus >= minP2 && p2_plus <= maxP2) {
                    options.push({ p1: p1_plus, p2: p2_plus, deviation: d });
                }
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
            if (uniqueOptions.length === 0) uniqueOptions.push({ p1: standardHalf, p2: p2_standard, deviation: 0 });
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
        

sheet.init().then(() => {
    const staffArr = sheet.getStaffList();
    const staffMap = {};
    staffArr.forEach(s => { staffMap[s.id] = s; });
    const bookings = JSON.parse(fs.readFileSync('bookings_0604.json'));
    const guestList = [{ idx: 0, serviceCode: 'A4', serviceName: 'Combo A4', flowCode: 'FB' }, { idx: 1, serviceCode: 'A4', serviceName: 'Combo A4', flowCode: 'FB' }];
    
    console.log('16:00 frontend check:', checkRequestAvailability('2026/06/04', '16:00', guestList, bookings, staffMap));
    console.log('16:20 frontend check:', checkRequestAvailability('2026/06/04', '16:20', guestList, bookings, staffMap));
});


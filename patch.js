const fs = require('fs');
const files = ['test_frontend.js', 'test_frontend_val.js'];
files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    const regex = /let staffBusyCount = 0;[\s\S]*?let femaleReqCount = 0;/;
    const replacement = `let staffBusyCount = 0;
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

            let femaleReqCount = 0;`;
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content);
});
console.log('Patched test_frontend.js and test_frontend_val.js');

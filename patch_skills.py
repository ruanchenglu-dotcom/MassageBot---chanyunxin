import re

def update_core():
    with open('cyx_resource_core.js', 'r', encoding='utf-8') as f:
        code = f.read()

    replacement1 = '''        let currentStaffBusy = 0;
        let currentFemaleBusy = 0;
        let currentMaleBusy = 0;
        let currentYouTuiBusy = 0;
        let currentGuaShaBusy = 0;
        let currentHuaGuanBusy = 0;
        let currentBaGuanBusy = 0;
        let elasticStaffCount = 0;'''
    code = re.sub(r'        let currentStaffBusy = 0;\s*let currentFemaleBusy = 0;\s*let currentMaleBusy = 0;\s*let elasticStaffCount = 0;', replacement1, code)

    replacement2 = '''                for (const staffName of staffsInBooking) {
                    const sInfo = staffList[staffName] || Object.values(staffList).find(s => normId(s.name) === normId(staffName) || normId(s.id) === normId(staffName)) || {};
                    if (sInfo.gender === 'F' || sInfo.gender === '女' || sInfo.group === '女') currentFemaleBusy++;
                    else if (sInfo.gender === 'M' || sInfo.gender === '男' || sInfo.group === '男') currentMaleBusy++;
                    
                    if (sInfo.isYouTui !== false) currentYouTuiBusy++;
                    if (sInfo.isGuaSha !== false) currentGuaShaBusy++;
                    if (sInfo.isHuaGuan !== false) currentHuaGuanBusy++;
                    if (sInfo.isBaGuan !== false) currentBaGuanBusy++;
                }'''
    code = re.sub(r'                for \(const staffName of staffsInBooking\) \{\s*const sInfo = staffList\[staffName\].*?currentMaleBusy\+\+;\s*\}', replacement2, code, flags=re.DOTALL)

    replacement3 = '''        let newGuestsActive = 0;
        let newFemaleReq = 0;
        let newMaleReq = 0;
        let newYouTuiReq = 0;
        let newGuaShaReq = 0;
        let newHuaGuanReq = 0;
        let newBaGuanReq = 0;
        let comboGuestCount = 0;'''
    code = re.sub(r'        let newGuestsActive = 0;\s*let newFemaleReq = 0;\s*let newMaleReq = 0;\s*let comboGuestCount = 0;', replacement3, code)

    replacement4 = '''            if (tCheck >= requestStart && tCheck < requestStart + dur) {
                newGuestsActive++;
                const storedFlow = g.flowCode || 'FB';
                if (isComboService(g.serviceCode)) comboGuestCount++;
                const req = g.staff;
                // N?u khach ch?n d?u (OIL), m?c ??nh yeu c?u n? (tr? khi co config khac)
                if (req === 'FEMALE' || req === '女' || req === '女師' || req === 'OIL') newFemaleReq++;
                else if (req === 'MALE' || req === '男' || req === '男師') newMaleReq++;

                if (g.isYouTui === true || (g.serviceName && g.serviceName.includes('油'))) newYouTuiReq++;
                if (g.isGuaSha === true || (g.serviceName && g.serviceName.includes('刮痧'))) newGuaShaReq++;
                if (g.isHuaGuan === true || (g.serviceName && g.serviceName.includes('滑罐'))) newHuaGuanReq++;
                if (g.isBaGuan === true || (g.serviceName && g.serviceName.includes('拔罐'))) newBaGuanReq++;
            }'''
    code = re.sub(r'            if \(tCheck >= requestStart && tCheck < requestStart \+ dur\) \{.*?else if \(req === \'MALE\' \|\| req === \'男\' \|\| req === \'男師\'\) newMaleReq\+\+;\s*\}', replacement4, code, flags=re.DOTALL)

    replacement5 = '''        const currentSupplyCount = currentAvailableStaff.length;
        const currentFemaleSupply = currentAvailableStaff.filter(s => s.gender === 'F' || s.gender === '女').length;
        const currentMaleSupply = currentAvailableStaff.filter(s => s.gender === 'M' || s.gender === '男').length;
        const currentYouTuiSupply = currentAvailableStaff.filter(s => s.isYouTui !== false).length;
        const currentGuaShaSupply = currentAvailableStaff.filter(s => s.isGuaSha !== false).length;
        const currentHuaGuanSupply = currentAvailableStaff.filter(s => s.isHuaGuan !== false).length;
        const currentBaGuanSupply = currentAvailableStaff.filter(s => s.isBaGuan !== false).length;'''
    code = re.sub(r'        const currentSupplyCount = currentAvailableStaff\.length;\s*const currentFemaleSupply = currentAvailableStaff\.filter.*?\.length;\s*const currentMaleSupply = currentAvailableStaff\.filter.*?\.length;', replacement5, code, flags=re.DOTALL)

    replacement6 = r'''        if (newFemaleReq > 0 && (currentFemaleBusy + newFemaleReq) > currentFemaleSupply) {
            return triggerSmartFailure(`?? 該時段女技師不足。女師總共: ${currentFemaleSupply}, 忙碌中: ${currentFemaleBusy}, 欲預約: ${newFemaleReq}`);
        }
        if (newMaleReq > 0 && (currentMaleBusy + newMaleReq) > currentMaleSupply) {
            return triggerSmartFailure(`?? 該時段男技師不足。男師總共: ${currentMaleSupply}, 忙碌中: ${currentMaleBusy}, 欲預約: ${newMaleReq}`);
        }
        if (newYouTuiReq > 0 && (currentYouTuiBusy + newYouTuiReq) > currentYouTuiSupply) {
            return triggerSmartFailure(`?? 該時段具備油推技能的技師不足。具備油推總共: ${currentYouTuiSupply}, 忙碌中: ${currentYouTuiBusy}, 欲預約: ${newYouTuiReq}`);
        }
        if (newGuaShaReq > 0 && (currentGuaShaBusy + newGuaShaReq) > currentGuaShaSupply) {
            return triggerSmartFailure(`?? 該時段具備刮痧技能的技師不足。具備刮痧總共: ${currentGuaShaSupply}, 忙碌中: ${currentGuaShaBusy}, 欲預約: ${newGuaShaReq}`);
        }
        if (newHuaGuanReq > 0 && (currentHuaGuanBusy + newHuaGuanReq) > currentHuaGuanSupply) {
            return triggerSmartFailure(`?? 該時段具備滑罐技能的技師不足。具備滑罐總共: ${currentHuaGuanSupply}, 忙碌中: ${currentHuaGuanBusy}, 欲預約: ${newHuaGuanReq}`);
        }
        if (newBaGuanReq > 0 && (currentBaGuanBusy + newBaGuanReq) > currentBaGuanSupply) {
            return triggerSmartFailure(`?? 該時段具備拔罐技能的技師不足。具備拔罐總共: ${currentBaGuanSupply}, 忙碌中: ${currentBaGuanBusy}, 欲預約: ${newBaGuanReq}`);
        }'''
    code = re.sub(r'        if \(newFemaleReq > 0 && \(currentFemaleBusy \+ newFemaleReq\) > currentFemaleSupply\) \{.*?\}', replacement6, code, flags=re.DOTALL)

    replacement7 = r'''            if (isBusy) {
                return triggerSmartFailure(`?? 技師 ${rawName} 該時段已有預約。`);
            }
            if ((g.isYouTui === true || (g.serviceName && g.serviceName.includes('油'))) && sInfo.isYouTui === false) {
                return triggerSmartFailure(`?? 技師 ${rawName} 不具備油推技能，無法安排油推服務。`);
            }
            if ((g.isGuaSha === true || (g.serviceName && g.serviceName.includes('刮痧'))) && sInfo.isGuaSha === false) {
                return triggerSmartFailure(`?? 技師 ${rawName} 不具備刮痧技能，無法安排刮痧服務。`);
            }
            if ((g.isHuaGuan === true || (g.serviceName && g.serviceName.includes('滑罐'))) && sInfo.isHuaGuan === false) {
                return triggerSmartFailure(`?? 技師 ${rawName} 不具備滑罐技能，無法安排滑罐服務。`);
            }
            if ((g.isBaGuan === true || (g.serviceName && g.serviceName.includes('拔罐'))) && sInfo.isBaGuan === false) {
                return triggerSmartFailure(`?? 技師 ${rawName} 不具備拔罐技能，無法安排拔罐服務。`);
            }'''
    code = re.sub(r'            if \(isBusy\) \{\s*return triggerSmartFailure\(`?? 技師 \$\{rawName\} 該時段已有預約。`\);\s*\}', replacement7, code)

    with open('cyx_resource_core.js', 'w', encoding='utf-8') as f:
        f.write(code)
    print('cyx_resource_core.js updated')

def update_handler():
    with open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
        code = f.read()

    replacement1 = '''            let currAll = 0, currF = 0, currM = 0;
            let currYouTui = 0, currGuaSha = 0, currHuaGuan = 0, currBaGuan = 0;
            let maxAll = 0, maxF = 0, maxM = 0;
            let maxYouTui = 0, maxGuaSha = 0, maxHuaGuan = 0, maxBaGuan = 0;'''
    code = re.sub(r'            let currAll = 0, currF = 0, currM = 0;\s*let maxAll = 0, maxF = 0, maxM = 0;', replacement1, code)

    replacement2 = '''                        let allDelta = 0;
                        let femaleDelta = 0;
                        let maleDelta = 0;
                        let youTuiDelta = 0;
                        let guaShaDelta = 0;
                        let huaGuanDelta = 0;
                        let baGuanDelta = 0;

                        for (const staffName of staffsInBooking) {'''
    code = re.sub(r'                        let allDelta = 0;\s*let femaleDelta = 0;\s*let maleDelta = 0;\s*for \(const staffName of staffsInBooking\) \{', replacement2, code)

    replacement3 = '''                            if (isFemaleReq) {
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
                                
                                if (sInfo.isYouTui !== false) youTuiDelta++;
                                if (sInfo.isGuaSha !== false) guaShaDelta++;
                                if (sInfo.isHuaGuan !== false) huaGuanDelta++;
                                if (sInfo.isBaGuan !== false) baGuanDelta++;
                            }
                        }
                        
                        if (allDelta > 0) {
                            overlapEvents.push({ time: st, type: 1, all: allDelta, f: femaleDelta, m: maleDelta, yt: youTuiDelta, gs: guaShaDelta, hg: huaGuanDelta, bg: baGuanDelta });
                            overlapEvents.push({ time: en, type: -1, all: allDelta, f: femaleDelta, m: maleDelta, yt: youTuiDelta, gs: guaShaDelta, hg: huaGuanDelta, bg: baGuanDelta });
                        }'''
    code = re.sub(r'                            if \(isFemaleReq\) \{.*?overlapEvents\.push\(\{ time: en, type: -1, all: allDelta, f: femaleDelta, m: maleDelta \}\);\s*\}\s*\}', replacement3, code, flags=re.DOTALL)

    replacement4 = '''            for (const ev of overlapEvents) {
                currAll += ev.type * ev.all;
                currF += ev.type * ev.f;
                currM += ev.type * ev.m;
                currYouTui += ev.type * ev.yt;
                currGuaSha += ev.type * ev.gs;
                currHuaGuan += ev.type * ev.hg;
                currBaGuan += ev.type * ev.bg;
                
                if (currAll > maxAll) maxAll = currAll;
                if (currF > maxF) maxF = currF;
                if (currM > maxM) maxM = currM;
                if (currYouTui > maxYouTui) maxYouTui = currYouTui;
                if (currGuaSha > maxGuaSha) maxGuaSha = currGuaSha;
                if (currHuaGuan > maxHuaGuan) maxHuaGuan = currHuaGuan;
                if (currBaGuan > maxBaGuan) maxBaGuan = currBaGuan;
            }'''
    code = re.sub(r'            for \(const ev of overlapEvents\) \{.*?if \(currM > maxM\) maxM = currM;\s*\}', replacement4, code, flags=re.DOTALL)

    replacement5 = '''            const supplyCount = availableStaffList.length;
            const femaleSupply = availableStaffList.filter(s => s.gender === 'F' || s.gender === '女').length;
            const maleSupply = availableStaffList.filter(s => s.gender === 'M' || s.gender === '男').length;
            const youTuiSupply = availableStaffList.filter(s => s.isYouTui !== false).length;
            const guaShaSupply = availableStaffList.filter(s => s.isGuaSha !== false).length;
            const huaGuanSupply = availableStaffList.filter(s => s.isHuaGuan !== false).length;
            const baGuanSupply = availableStaffList.filter(s => s.isBaGuan !== false).length;'''
    code = re.sub(r'            const supplyCount = availableStaffList\.length;\s*const femaleSupply = availableStaffList\.filter.*?\.length;\s*const maleSupply = availableStaffList\.filter.*?\.length;', replacement5, code, flags=re.DOTALL)

    replacement6 = '''            let femaleReqCount = 0;
            let maleReqCount = 0;
            let youTuiReqCount = 0;
            let guaShaReqCount = 0;
            let huaGuanReqCount = 0;
            let baGuanReqCount = 0;
            let specificStaffReqs = [];

            guestList.forEach(g => {
                const req = g.staff;
                if (req === 'FEMALE' || req === '女' || req === '女師') femaleReqCount++;
                else if (req === 'MALE' || req === '男' || req === '男師') maleReqCount++;
                else if (req && req !== '隨機' && req !== 'Any' && req !== 'undefined' && req !== 'null') {
                    const sId = normId(req);
                    specificStaffReqs.push({ req: sId, rawReq: req, duration: g.overrideDuration || (SERVICES[g.serviceCode] || { duration: 60 }).duration || 60 });
                }
                
                if (g.isYouTui === true || (g.serviceName && g.serviceName.includes('油'))) youTuiReqCount++;
                if (g.isGuaSha === true || (g.serviceName && g.serviceName.includes('刮痧'))) guaShaReqCount++;
                if (g.isHuaGuan === true || (g.serviceName && g.serviceName.includes('滑罐'))) huaGuanReqCount++;
                if (g.isBaGuan === true || (g.serviceName && g.serviceName.includes('拔罐'))) baGuanReqCount++;
            });'''
    code = re.sub(r'            let femaleReqCount = 0;\s*let maleReqCount = 0;\s*let specificStaffReqs = \[\];\s*guestList\.forEach\(g => \{.*?\}\);', replacement6, code, flags=re.DOTALL)

    replacement7 = r'''            // 3. GENDER & SKILLS POOL CHECK
            if (femaleReqCount > 0 && (maxF + femaleReqCount) > femaleSupply) {
                return triggerSmartFailure(`?? 女技師不足。女師總共: ${femaleSupply}, 忙碌中: ${maxF}, 欲預約女師數: ${femaleReqCount}`);
            }

            if (maleReqCount > 0 && (maxM + maleReqCount) > maleSupply) {
                return triggerSmartFailure(`?? 男技師不足。男師總共: ${maleSupply}, 忙碌中: ${maxM}, 欲預約男師數: ${maleReqCount}`);
            }

            if (youTuiReqCount > 0 && (maxYouTui + youTuiReqCount) > youTuiSupply) {
                return triggerSmartFailure(`?? 具備油推技能的技師不足。具備油推總共: ${youTuiSupply}, 忙碌中: ${maxYouTui}, 欲預約油推數: ${youTuiReqCount}`);
            }
            if (guaShaReqCount > 0 && (maxGuaSha + guaShaReqCount) > guaShaSupply) {
                return triggerSmartFailure(`?? 具備刮痧技能的技師不足。具備刮痧總共: ${guaShaSupply}, 忙碌中: ${maxGuaSha}, 欲預約刮痧數: ${guaShaReqCount}`);
            }
            if (huaGuanReqCount > 0 && (maxHuaGuan + huaGuanReqCount) > huaGuanSupply) {
                return triggerSmartFailure(`?? 具備滑罐技能的技師不足。具備滑罐總共: ${huaGuanSupply}, 忙碌中: ${maxHuaGuan}, 欲預約滑罐數: ${huaGuanReqCount}`);
            }
            if (baGuanReqCount > 0 && (maxBaGuan + baGuanReqCount) > baGuanSupply) {
                return triggerSmartFailure(`?? 具備拔罐技能的技師不足。具備拔罐總共: ${baGuanSupply}, 忙碌中: ${maxBaGuan}, 欲預約拔罐數: ${baGuanReqCount}`);
            }'''
    code = re.sub(r'            // 3\. GENDER POOL CHECK\s*if \(femaleReqCount > 0 && \(femaleBusyCount \+ femaleReqCount\) > femaleSupply\) \{.*?\}', replacement7, code, flags=re.DOTALL)

    replacement8 = r'''                    if (isBusy) {
                        return triggerSmartFailure(`?? 技師 ${rawName} 該時段已有預約。`);
                    }
                    const gGuest = guestList.find(g => g.staff === rawName);
                    if (gGuest) {
                        if ((gGuest.isYouTui === true || (gGuest.serviceName && gGuest.serviceName.includes('油'))) && sInfo.isYouTui === false) {
                            return triggerSmartFailure(`?? 技師 ${rawName} 不具備油推技能，無法安排油推服務。`);
                        }
                        if ((gGuest.isGuaSha === true || (gGuest.serviceName && gGuest.serviceName.includes('刮痧'))) && sInfo.isGuaSha === false) {
                            return triggerSmartFailure(`?? 技師 ${rawName} 不具備刮痧技能，無法安排刮痧服務。`);
                        }
                        if ((gGuest.isHuaGuan === true || (gGuest.serviceName && gGuest.serviceName.includes('滑罐'))) && sInfo.isHuaGuan === false) {
                            return triggerSmartFailure(`?? 技師 ${rawName} 不具備滑罐技能，無法安排滑罐服務。`);
                        }
                        if ((gGuest.isBaGuan === true || (gGuest.serviceName && gGuest.serviceName.includes('拔罐'))) && sInfo.isBaGuan === false) {
                            return triggerSmartFailure(`?? 技師 ${rawName} 不具備拔罐技能，無法安排拔罐服務。`);
                        }
                    }'''
    code = re.sub(r'                    if \(isBusy\) \{\s*return triggerSmartFailure\(`?? 技師 \$\{rawName\} 該時段已有預約。`\);\s*\}', replacement8, code)

    with open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'w', encoding='utf-8') as f:
        f.write(code)
    print('cyx_bookingHandler.js updated')

update_core()
update_handler()

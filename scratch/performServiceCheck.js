    const performServiceCheck = (checkIsGroup = isGroupMode, overridePhase1 = null, testFlow = null) => {
        const currentTestingFlow = testFlow !== null ? testFlow : localFlow;
        const isBodyFirstLocal = currentTestingFlow === 'BF';
        
        const currentExcludeRowIds = [String(booking?.rowId)];
        if (checkIsGroup && groupMembersToUpdate) {
            groupMembersToUpdate.forEach(m => currentExcludeRowIds.push(String(m.rowId)));
        }
        
        const getDuration = (serviceName, fallbackDuration = 60) => {
            if (!serviceName) return fallbackDuration;
            const match = serviceName.match(/(190|180|170|160|150|140|130|120|110|100|90|80|75|70|65|60|55|50|45|40|35|30)/);
            if (match) return parseInt(match[0], 10);
            return window.getSafeDuration ? window.getSafeDuration(serviceName, fallbackDuration) : fallbackDuration;
        };

        const newDuration = getDuration(selectedService, booking.duration || 60);
        const endMins = startMins + newDuration;

        const getServiceCategory = (serviceName, flowCode) => {
            if (!serviceName) return ['FB', 'BF'].includes(flowCode) ? 'COMBO' : 'BODY';
            if ((window.CoreKernel?.dynamicServices || window.SERVICES_DATA)) {
                if ((window.CoreKernel?.dynamicServices || window.SERVICES_DATA)[serviceName]) return (window.CoreKernel?.dynamicServices || window.SERVICES_DATA)[serviceName].category;
                for (const code in (window.CoreKernel?.dynamicServices || window.SERVICES_DATA)) {
                    const sData = (window.CoreKernel?.dynamicServices || window.SERVICES_DATA)[code];
                    if (serviceName.includes(sData.name) || sData.name.includes(serviceName)) return sData.category;
                }
            }
            if ((window.CoreKernel?.dynamicServices || window.SERVICES_DATA)) {
        const code = Object.keys((window.CoreKernel?.dynamicServices || window.SERVICES_DATA)).find(k => (window.CoreKernel?.dynamicServices || window.SERVICES_DATA)[k].name === serviceName);
        if (code && code.toUpperCase().startsWith('A')) return 'COMBO';
    }
            if (serviceName.includes('足') || serviceName.includes('腳底') || serviceName.includes('FOOT')) return 'FOOT';
            if (['FB', 'BF'].includes(flowCode)) return 'COMBO';
            return 'BODY';
        };

        const editServiceCategory = getServiceCategory(selectedService, currentTestingFlow || booking.flowCode || booking.flow);
        
        let currentPax = parseInt(booking.pax, 10) || 1;
        if (booking.originalName && /\(\d+\/\d+\)/.test(booking.originalName)) {
            currentPax = 1;
        } else if (booking.customerName && /\(\d+\/\d+\)/.test(booking.customerName)) {
            currentPax = 1;
        } else if (booking.hoTen && /\(\d+\/\d+\)/.test(booking.hoTen)) {
            currentPax = 1;
        }

        // [V136 FIX] Nếu đổi nhóm, cần cộng thêm tất cả các thành viên
        if (checkIsGroup && groupMembersToUpdate && groupMembersToUpdate.length > 0) {
            currentPax = 1 + groupMembersToUpdate.length;
        }

        let editPhase1End = startMins + newDuration;
        let isComboEdit = editServiceCategory === 'COMBO';
        
        if (isComboEdit) {
            if (overridePhase1 !== null) {
                editPhase1End = startMins + overridePhase1;
            } else {
                const getSmartSplit = window.getComboSplit || ((dur) => {
                    if (dur === 130) return { phase1: 70, phase2: 60 };
                    if (dur === 120) return { phase1: 70, phase2: 50 };
                    if (dur === 110) return { phase1: 70, phase2: 40 };
                    if (dur === 100) return { phase1: 60, phase2: 40 };
                    return { phase1: Math.floor(dur / 2), phase2: dur - Math.floor(dur / 2) };
                });
                const split = getSmartSplit(newDuration);
                editPhase1End = startMins + split.phase1;
            }
        }

        const safeBookings = Array.isArray(bookings) ? bookings : [];
        const todays = safeBookings.filter(b => {
            if (String(b.rowId) === String(booking.rowId)) return false;
            if (checkIsGroup && groupMembersToUpdate.some(gb => String(gb.rowId) === String(b.rowId))) return false;
            const bStatus = b.status || '';
            const isCancelled = bStatus === STATUS.CANCELLED || bStatus.includes('取消') || bStatus.includes('Cancel');
            const isNoShow = bStatus === STATUS.NOSHOW || bStatus.includes('爽約') || bStatus.toUpperCase().includes('NOSHOW');
            const isDone = bStatus === STATUS.COMPLETED || bStatus.includes('完成') || bStatus.includes('✅');
            return !isCancelled && !isNoShow && !isDone;
        });

        const totalStaffCapacity = (staffList || []).length;
        let maxConcurrency = 0;
        let maxChairOcc = 0;
        let maxBedOcc = 0;

        const cleanCurrentStaff = (window.normalizeStaffId ? window.normalizeStaffId(booking.serviceStaff || booking.staffId || '') : (booking.serviceStaff || booking.staffId || '').trim()).toUpperCase();
        const cleanSelectedStaff = (window.normalizeStaffId ? window.normalizeStaffId(selectedStaff || '') : (selectedStaff || '').trim()).toUpperCase();
        const isAlreadyAssignedToCurrent = (cleanSelectedStaff !== '' && cleanSelectedStaff !== '隨機' && cleanSelectedStaff === cleanCurrentStaff);

        // [V110.0 FIX] Tính toán thông tin dịch vụ cũ của khách này (để so sánh load)
        const oldDur = window.getSafeDuration ? window.getSafeDuration(booking.serviceName, booking.duration) : 60;
        const oldEndMins = startMins + oldDur;
        const oldCat = getServiceCategory(booking.serviceName);
        const oldSplit = window.getComboSplit ? window.getComboSplit(oldDur) : { phase1: Math.floor(oldDur/2) };
        const oldP1Dur = booking.phase1_duration !== undefined ? parseInt(booking.phase1_duration) : oldSplit.phase1;
        const oldMidMins = startMins + oldP1Dur;

        for (let t = startMins; t < endMins; t += 5) {
            let currentLoad = 0;
            let currentChairLoad = 0;
            let currentBedLoad = 0;

            todays.forEach(b => {
                const bTimeStr = (b.startTimeString || ' ').split(' ')[1] || '00:00';
                const bStart = timeStrToMins(bTimeStr);
                const bDur = getDuration(b.serviceName, b.duration || 60);
                const bEnd = bStart + bDur;
                
                let bPax = parseInt(b.pax, 10) || 1;
                if (b.originalName && /\(\d+\/\d+\)/.test(b.originalName)) {
                    bPax = 1;
                } else if (b.customerName && /\(\d+\/\d+\)/.test(b.customerName)) {
                    bPax = 1;
                } else if (b.hoTen && /\(\d+\/\d+\)/.test(b.hoTen)) {
                    bPax = 1;
                }
                
                const bCat = getServiceCategory(b.serviceName, b.flowCode || b.flow);
                
                if (t >= bStart && t < bEnd) {
                    currentLoad += bPax;

                    if (bCat === 'COMBO') {
                        const bSplit = window.getComboSplit ? window.getComboSplit(bDur) : { phase1: Math.floor(bDur/2) };
                        const bPhase1Dur = b.phase1_duration !== undefined ? parseInt(b.phase1_duration) : bSplit.phase1;
                        const bMid = bStart + bPhase1Dur;
                        const isBF = ['BF', 'BED_FIRST'].includes(b.flowCode || b.flow);
                        if (t < bMid) {
                            if (isBF) currentBedLoad += bPax;
                            else currentChairLoad += bPax;
                        } else {
                            if (isBF) currentChairLoad += bPax;
                            else currentBedLoad += bPax;
                        }
                    } else {
                        let actualResType = null;
                        const resIdx = b.phase1_res_idx || b.allocated_resource || b.current_resource_id || b.location || '';
                        if (resIdx.toUpperCase().includes('CHAIR') || resIdx.includes('足')) {
                            actualResType = 'CHAIR';
                        } else if (resIdx.toUpperCase().includes('BED') || resIdx.includes('床')) {
                            actualResType = 'BED';
                        }

                        if (actualResType === 'CHAIR' || bCat === 'FOOT' || b.type === 'CHAIR' || b.forceResourceType === 'CHAIR') {
                            currentChairLoad += bPax;
                        } else if (actualResType === 'BED') {
                            currentBedLoad += bPax;
                        } else {
                            currentBedLoad += bPax;
                        }
                    }
                }
            });

            // Logic tính tải của dịch vụ MỚI tại thời điểm t
            let willBeOnChair = false;
            let willBeOnBed = false;
            if (isComboEdit) {
                if (t < editPhase1End) {
                    if (isBodyFirstLocal) willBeOnBed = true;
                    else willBeOnChair = true;
                } else {
                    if (isBodyFirstLocal) willBeOnChair = true;
                    else willBeOnBed = true;
                }
            } else if (editServiceCategory === 'FOOT') {
                willBeOnChair = true;
            } else {
                willBeOnBed = true;
            }

            if (willBeOnChair) currentChairLoad += currentPax;
            if (willBeOnBed) currentBedLoad += currentPax;

            const totalLoadAtT = currentLoad + currentPax;
            if (totalLoadAtT > maxConcurrency) maxConcurrency = totalLoadAtT;
            if (currentChairLoad > maxChairOcc) maxChairOcc = currentChairLoad;
            if (currentBedLoad > maxBedOcc) maxBedOcc = currentBedLoad;

            // Logic tính tải của dịch vụ CŨ tại thời điểm t (để so sánh)
            let wasOnChair = false;
            let wasOnBed = false;
            if (t >= startMins && t < oldEndMins) {
                if (oldCat === 'COMBO') {
                    const oldIsBF = ((meta && meta.sequence) ? meta.sequence : (booking.flow || 'FB')) === 'BF';
                    if (t < oldMidMins) {
                        if (oldIsBF) wasOnBed = true;
                        else wasOnChair = true;
                    } else {
                        if (oldIsBF) wasOnChair = true;
                        else wasOnBed = true;
                    }
                } else if (oldCat === 'FOOT' || booking.type === 'CHAIR') {
                    wasOnChair = true;
                } else {
                    wasOnBed = true;
                }
            }

            // Chỉ block nếu việc edit tạo thêm gánh nặng mới tại thời điểm t
            const isNewLoadHigher = (t >= oldEndMins); 
            const isNewChairHigher = (willBeOnChair && !wasOnChair);
            const isNewBedHigher = (willBeOnBed && !wasOnBed);

            if (totalLoadAtT > totalStaffCapacity && isNewLoadHigher && !isAlreadyAssignedToCurrent) {
                if (testFlow !== null) return false;
                setScanServiceStatus('FAILED');
                setScanServiceMessage(`❌ 技師不足`);
                return false;
            }
            if (currentChairLoad > getMaxChairs() && isNewChairHigher) {
                if (isComboEdit) {
                    if (testFlow === null) {
                        const altFlow = currentTestingFlow === 'BF' ? 'FB' : 'BF';
                        if (performServiceCheck(checkIsGroup, overridePhase1, altFlow) === true) {
                            setLocalFlow(altFlow);
                            Swal.fire({
                                title: '系統智能排班',
                                text: `目前時段足底區客滿，系統已自動為您切換為「${altFlow === 'BF' ? '先身後足 (BF)' : '先足後身 (FB)'}」以符合座位安排。`,
                                icon: 'info',
                                confirmButtonText: '確定'
                            });
                            return true;
                        }
                    }
                }
                
                if (isComboEdit && !isBodyFirstLocal) {
                    const defaultP1 = window.getComboSplit ? window.getComboSplit(newDuration).phase1 : Math.floor(newDuration / 2);
                    let currentTest = overridePhase1 !== null ? overridePhase1 : defaultP1;
                    
                    // Auto-stretch: Ưu tiên dùng lại oldP1Dur nếu đang hạ gói
                    if (oldCat === 'COMBO' && newDuration < oldDur && overridePhase1 === null && oldP1Dur < defaultP1 && oldP1Dur >= 30) {
                        setPhase1(oldP1Dur);
                        return performServiceCheck(checkIsGroup, oldP1Dur, testFlow);
                    }
                    
                    let nextTryP1 = currentTest - 5;
                    if (nextTryP1 >= 30 && nextTryP1 >= defaultP1 - 40) {
                        setPhase1(nextTryP1);
                        return performServiceCheck(checkIsGroup, nextTryP1, testFlow);
                    }

                    if (newDuration > oldDur) {
                        const extraTime = newDuration - oldDur;
                        if (testFlow !== null) return false;
                        
                        setScanServiceStatus('FAILED');
                        setScanServiceMessage("❌ 足底區客滿");
                        
                        if (oldCat === 'COMBO') {
                            Swal.fire({
                                title: '足底區客滿',
                                html: `目前足底區已滿，系統嘗試自動調整時間失敗。<br/><br/>請問是否保持腳部 <b>${oldP1Dur} 分鐘</b>，並將增加的時間 (+${extraTime}分) 全部加到身體？<br/>(即：腳部 ${oldP1Dur}分, 身體 ${newDuration - oldP1Dur}分)`,
                                icon: 'question',
                                showCancelButton: true,
                                confirmButtonText: '同意 (加在身體)',
                                cancelButtonText: '取消'
                            }).then((res) => {
                                if (res.isConfirmed) {
                                    setPhase1(oldP1Dur);
                                    performServiceCheck(checkIsGroup, oldP1Dur, testFlow);
                                }
                            });
                        }
                        return false;
                    }
                }
                
                if (testFlow !== null) return false;
                setScanServiceStatus('FAILED');
                setScanServiceMessage("❌ 足底區客滿");
                return false;
            }
            if (currentBedLoad > getMaxBeds() && isNewBedHigher) {
                if (isComboEdit) {
                    if (testFlow === null) {
                        const altFlow = currentTestingFlow === 'BF' ? 'FB' : 'BF';
                        if (performServiceCheck(checkIsGroup, overridePhase1, altFlow) === true) {
                            setLocalFlow(altFlow);
                            Swal.fire({
                                title: '系統智能排班',
                                text: `目前時段床區客滿，系統已自動為您切換為「${altFlow === 'BF' ? '先身後足 (BF)' : '先足後身 (FB)'}」以符合床位安排。`,
                                icon: 'info',
                                confirmButtonText: '確定'
                            });
                            return true;
                        }
                    }
                }
                
                if (isComboEdit && !isBodyFirstLocal) {
                    const defaultP1 = window.getComboSplit ? window.getComboSplit(newDuration).phase1 : Math.floor(newDuration / 2);
                    let currentTest = overridePhase1 !== null ? overridePhase1 : defaultP1;
                    
                    // Auto-stretch: Ưu tiên dùng lại oldP1Dur nếu đang hạ gói
                    if (oldCat === 'COMBO' && newDuration < oldDur && overridePhase1 === null && oldP1Dur > defaultP1 && oldP1Dur <= newDuration - 30) {
                        setPhase1(oldP1Dur);
                        return performServiceCheck(checkIsGroup, oldP1Dur, testFlow);
                    }
                    
                    let nextTryP1 = currentTest + 5;
                    if (nextTryP1 <= newDuration - 30 && nextTryP1 <= defaultP1 + 40) {
                        setPhase1(nextTryP1);
                        return performServiceCheck(checkIsGroup, nextTryP1, testFlow);
                    }
                }
                
                if (testFlow !== null) return false;
                setScanServiceStatus('FAILED');
                setScanServiceMessage("❌ 床區客滿");
                return false;
            }
        }

        const reqStaff = selectedStaff;
        if (reqStaff && reqStaff !== '隨機') {
            const checkStaffBusy = (staffId) => {
                const cleanTargetStaff = (window.normalizeStaffId ? window.normalizeStaffId(staffId) : staffId.trim()).toUpperCase();
                return todays.some(b => {
                    const bTimeStr = (b.startTimeString || ' ').split(' ')[1] || '00:00';
                    const bStart = timeStrToMins(bTimeStr);
                    const bEnd = bStart + getDuration(b.serviceName);
                    const isTimeConflict = (startMins < bEnd && endMins > bStart);
                    
                    const staffCols = [b.serviceStaff, b.staffId, b.staffId2, b.staffId3, b.technician];
                    return isTimeConflict && staffCols.some(s => s && (window.normalizeStaffId ? window.normalizeStaffId(s) : s.trim()).toUpperCase() === cleanTargetStaff);
                });
            };

            const isStaffAvailable = (staffInfo) => {
                if (!staffInfo || staffInfo.off) return false;
                if (!staffInfo.start || !staffInfo.end) return false;
                
                const shiftStart = timeStrToMins(staffInfo.start);
                let shiftEnd = timeStrToMins(staffInfo.end);
                if (shiftEnd < shiftStart) shiftEnd += 1440;
                
                return (startMins >= shiftStart && startMins < shiftEnd);
            };

            const isGenderReq = ['男', '女', '男師', '女師', 'MALE', 'FEMALE'].includes(reqStaff);
            
            if (isGenderReq) {
                const reqGender = (reqStaff === '男' || reqStaff === '男師' || reqStaff === 'MALE') ? 'M' : 'F';
                const genderStaff = (staffList || []).filter(s => {
                    const sGender = s.gender || s.group || '';
                    return sGender === reqGender || sGender === (reqGender === 'M' ? '男' : '女');
                });
                
                const hasAvailable = genderStaff.some(s => isStaffAvailable(s) && !checkStaffBusy(s.id));
                
                if (!hasAvailable) {
                    if (testFlow !== null) return false;
                    setScanServiceStatus('FAILED');
                    setScanServiceMessage(reqGender === 'M' ? `❌ 該時段無可用的男技師` : `❌ 該時段無可用的女技師`);
                    return false;
                }
            } else {
                const cleanReqStaff = (window.normalizeStaffId ? window.normalizeStaffId(reqStaff) : reqStaff.trim()).toUpperCase();
                const targetStaff = (staffList || []).find(s => (window.normalizeStaffId ? window.normalizeStaffId(s.id) : s.id.trim()).toUpperCase() === cleanReqStaff);
                
                if (targetStaff) {
                    if (targetStaff.off && !isAlreadyAssignedToCurrent) {
                        if (testFlow !== null) return false;
                        setScanServiceStatus('FAILED');
                        setScanServiceMessage(`❌ 該技師今日休假`);
                        return false;
                    }
                    if (!isStaffAvailable(targetStaff) && !isAlreadyAssignedToCurrent) {
                        if (testFlow !== null) return false;
                        setScanServiceStatus('FAILED');
                        setScanServiceMessage(`❌ 該技師不在班表時間內`);
                        return false;
                    }
                }
                
                if (checkStaffBusy(reqStaff)) {
                    if (testFlow !== null) return false;
                    setScanServiceStatus('FAILED');
                    setScanServiceMessage(`❌ 該技師時段忙碌`);
                    return false;
                }
            }
        }

        const currentRes = contextResourceId || booking.current_resource_id || booking.allocated_resource || booking.phase1_res_idx;
        if (currentRes) {
            const oldService = booking.serviceName || '';
            const oldCat = getServiceCategory(oldService);
            const isSameCategory = (oldCat === editServiceCategory);

            let isResConflict = false;
            if (isSameCategory) {
                if (editServiceCategory === 'COMBO') {
                    if (booking.phase1_res_idx && checkOverlap(booking.phase1_res_idx, startMins, editPhase1End, currentExcludeRowIds)) isResConflict = true;
                    if (booking.phase2_res_idx && checkOverlap(booking.phase2_res_idx, switchMins + 5, endMins, currentExcludeRowIds)) isResConflict = true;

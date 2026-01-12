/**
 * ============================================================================
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V93 (MAJOR UPGRADE: BRAIN TRANSPLANT V6.0 - GLOBAL OPTIMIZATION)
 * NGÀY CẬP NHẬT: 2026-01-12
 * TÁC GIẢ: AI ASSISTANT & USER
 * * * * * * * * * * * NHẬT KÝ NÂNG CẤP (V93):
 * 1. [BRAIN TRANSPLANT V6.0]:
 * - Tích hợp hoàn toàn logic "Global Optimization" từ resource_core.js V6.0.
 * - Hệ thống giờ đây KHÔNG coi khách cũ là "Đá tảng" (Hard Block) mặc định nữa.
 * - Khách cũ chưa bị khóa tay (isManualLocked=false) sẽ được coi là "Đất sét" (Elastic) để co giãn nhường chỗ cho khách mới.
 * 2. [MANUAL LOCK RESPECT]:
 * - Tôn trọng cờ 'isManualLocked' và 'phase1_duration' từ dữ liệu Backend.
 * 3. [SYNC V91 & V90 PRESERVED]:
 * - Giữ nguyên bản vá lỗi hiển thị nhân viên (Data Mapping '上班'/'下班').
 * - Giữ nguyên cơ chế Anti-Cache (Force Fetch) giúp dữ liệu luôn tươi mới.
 * ============================================================================
 */

(function() {
    console.log("🚀 BookingHandler V93: Initializing with V6.0 GLOBAL OPTIMIZATION BRAIN...");

    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React not found. Cannot start BookingHandler.");
        return;
    }

    // ========================================================================
    // PHẦN 1: CORE KERNEL V6.0 (LOGIC XỬ LÝ TRUNG TÂM - ĐÃ NÂNG CẤP)
    // Mô tả: Đây là bộ não tính toán, quyết định xem có xếp được khách hay không.
    // ========================================================================
    const CoreKernel = (function() {
        
        // --- 1. CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION) ---
        const CONFIG = {
            MAX_CHAIRS: 6,        
            MAX_BEDS: 6,          
            MAX_TOTAL_GUESTS: 12, 
            
            // Cấu hình thời gian
            OPEN_HOUR: 8,         
            
            // Bộ đệm thời gian (Buffer)
            CLEANUP_BUFFER: 5,    
            TRANSITION_BUFFER: 5, 
            
            // Dung sai
            TOLERANCE: 1,         
            MAX_TIMELINE_MINS: 1440 
        };

        let SERVICES = {}; 

        // --- 2. QUẢN LÝ DỊCH VỤ (SERVICE MANAGER) ---
        function setDynamicServices(newServicesObj) {
            const systemServices = {
                'OFF_DAY': { name: '⛔ 請假 (OFF)', duration: 1080, type: 'NONE', price: 0, category: 'SYSTEM' },
                'BREAK_30': { name: '🍱 用餐 (Break)', duration: 30, type: 'NONE', price: 0, category: 'SYSTEM' },
                'SHOP_CLOSE': { name: '⛔ 店休 (Close)', duration: 1440, type: 'NONE', price: 0, category: 'SYSTEM' },
                'LATE': { name: '⚠️ 延遲 (Late)', duration: 0, type: 'NONE', price: 0, category: 'SYSTEM' }
            };
            SERVICES = { ...newServicesObj, ...systemServices };
            // console.log(`[CORE V6.0] Services Updated: ${Object.keys(SERVICES).length} entries.`);
        }

        // --- 3. BỘ CÔNG CỤ XỬ LÝ THỜI GIAN (TIME UTILS) ---
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

        // --- 4. KIỂM TRA TÀI NGUYÊN (CAPACITY CHECK - LINE SWEEP) ---
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

        // --- 5. TÌM NHÂN VIÊN (STAFF FINDER) ---
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
                // Kiểm tra kỹ: Nếu staff không tồn tại HOẶC đang OFF -> Return False ngay
                if (!staffInfo || staffInfo.off) return false; 
                
                const shiftStart = getMinsFromTimeStr(staffInfo.start); 
                const shiftEnd = getMinsFromTimeStr(staffInfo.end);     
                
                if (shiftStart === -1 || shiftEnd === -1) return false; 

                if ((start + CONFIG.TOLERANCE) < shiftStart) return false;
                
                const isStrict = staffInfo.isStrictTime === true;
                if (isStrict) {
                    if ((end - CONFIG.TOLERANCE) > shiftEnd) return false; 
                } else {
                    if (start > shiftEnd) return false;
                }

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

        // --- 6. BỘ SINH BIẾN THỂ THỜI GIAN (ELASTIC GENERATOR V6.0) ---
        // Đã nâng cấp để hỗ trợ locked phase 1
        function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null) {
            // Nếu đã bị khóa cứng (Manual Lock), chỉ trả về đúng 1 phương án
            if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
                return [{ 
                    p1: parseInt(customLockedPhase1), 
                    p2: totalDuration - parseInt(customLockedPhase1), 
                    deviation: 999 // Đánh dấu là Locked
                }];
            }

            const standardHalf = Math.floor(totalDuration / 2);
            let options = [{ p1: standardHalf, p2: totalDuration - standardHalf, deviation: 0 }];

            if (!step || !limit || step <= 0 || limit <= 0) return options;

            let currentDeviation = step;
            while (currentDeviation <= limit) {
                let p1_A = standardHalf - currentDeviation;
                let p2_A = totalDuration - p1_A;
                if (p1_A >= 15 && p2_A >= 15) {
                    options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
                }
                let p1_B = standardHalf + currentDeviation;
                let p2_B = totalDuration - p1_B;
                if (p1_B >= 15 && p2_B >= 15) {
                    options.push({ p1: p1_B, p2: p2_B, deviation: currentDeviation });
                }
                currentDeviation += step;
            }
            // Ưu tiên độ lệch thấp nhất (gần chuẩn nhất)
            options.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
            return options;
        }

        // --- 7. MAIN LOGIC (GLOBAL OPTIMIZER V6.0) ---
        // Logic mới: Tách "Đá tảng" (Hard) và "Đất sét" (Soft)
        function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "Error: Invalid Time Format" };

            // ========================================================================
            // BƯỚC A: PHÂN LOẠI BOOKING (HARD vs SOFT)
            // ========================================================================
            
            let hardBookings = [];      // Danh sách booking không thể thay đổi
            let optimizationQueue = []; // Danh sách cần sắp xếp (bao gồm khách cũ Soft + khách mới)
            
            // --- 1. Duyệt qua khách cũ (Existing Bookings) ---
            currentBookingsRaw.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                if (bStart === -1) return;

                let svcInfo = SERVICES[b.serviceCode] || {};
                let isCombo = svcInfo.category === 'COMBO' || b.serviceName.includes('Combo') || b.serviceName.includes('套餐');
                let duration = b.duration || 60;

                // [LOGIC V6.0] Điều kiện để được tối ưu hóa (Co giãn):
                // 1. Phải là Combo (Chỉ combo mới co giãn được phase)
                // 2. Chưa bị khóa tay (isManualLocked !== true)
                // 3. Không phải là booking đang chạy (status !== 'Running' - frontend truyền status này xuống nếu cần)
                // Lưu ý: Ở frontend bookingHandler, status thường là chuỗi thô, ta giả định mọi booking tương lai đều có thể tối ưu
                // trừ khi bị lock.
                
                const isCandidateForOptimization = isCombo && (b.isManualLocked !== true);

                if (isCandidateForOptimization) {
                    // [OPTIMIZATION]: Đưa vào hàng đợi tối ưu lại
                    optimizationQueue.push({
                        type: 'EXISTING',
                        originalData: b,
                        id: b.rowId || `exist_${Math.random()}`,
                        staffReq: b.staffName, // Giữ nguyên Staff cũ
                        serviceName: b.serviceName,
                        duration: duration,
                        startMins: bStart, // Giờ bắt đầu CỐ ĐỊNH (Khách cũ ko đổi giờ hẹn)
                        elasticStep: svcInfo.elasticStep || 5,
                        elasticLimit: svcInfo.elasticLimit || 15,
                        lockedPhase1: null // Chưa lock
                    });
                } else {
                    // [HARD BLOCK]: Giữ nguyên như cũ
                    if (isCombo) {
                        // Nếu đã có thông số phase1 lưu trong DB, dùng nó. Nếu không, chia đôi.
                        let p1 = Math.floor(duration / 2);
                        if (b.phase1_duration) p1 = parseInt(b.phase1_duration);
                        
                        const p1End = bStart + p1;
                        const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                        
                        // Phase 1 (Chair)
                        hardBookings.push({ start: bStart, end: p1End, resourceType: 'CHAIR', staffName: b.staffName });
                        // Phase 2 (Bed)
                        hardBookings.push({ start: p2Start, end: bStart + duration, resourceType: 'BED', staffName: b.staffName });
                    } else {
                        // Single Booking
                        let rType = svcInfo.type || 'CHAIR';
                        if (b.serviceName.toUpperCase().match(/BODY|指壓|油|BED/)) rType = 'BED';
                        hardBookings.push({ start: bStart, end: bStart + duration, resourceType: rType, staffName: b.staffName });
                    }
                }
            });

            // --- 2. Thêm khách mới vào hàng đợi (New Requests) ---
            guestList.forEach((g, index) => {
                const svc = SERVICES[g.serviceCode];
                if (!svc) return;
                
                optimizationQueue.push({
                    type: 'NEW',
                    id: `new_${index}`,
                    staffReq: g.staffName,
                    serviceName: svc.name,
                    duration: svc.duration,
                    price: svc.price,
                    resourceType: svc.type,
                    category: svc.category,
                    startMins: requestStartMins, // Giờ bắt đầu theo yêu cầu
                    elasticStep: svc.elasticStep || 0,
                    elasticLimit: svc.elasticLimit || 0,
                    lockedPhase1: null
                });
            });

            // ========================================================================
            // BƯỚC B: GIẢI QUYẾT HÀNG ĐỢI (GREEDY OPTIMIZATION LOOP)
            // ========================================================================
            
            // Sắp xếp: Ưu tiên khách cũ trước (để giữ chỗ cho họ), sau đó đến khách mới
            optimizationQueue.sort((a, b) => {
                if (a.type === 'EXISTING' && b.type === 'NEW') return -1;
                if (a.type === 'NEW' && b.type === 'EXISTING') return 1;
                return a.startMins - b.startMins;
            });

            let currentTimeline = [...hardBookings];
            let finalDetails = []; // Kết quả hiển thị cho khách mới
            
            for (const item of optimizationQueue) {
                let isFitted = false;
                
                // 1. Nếu là SINGLE (Thường chỉ khách mới mới vào case này ở đây)
                if (item.category !== 'COMBO' && !item.serviceName.includes('套餐') && item.type === 'NEW') {
                    const start = item.startMins;
                    const end = start + item.duration + CONFIG.CLEANUP_BUFFER;
                    
                    if (checkResourceCapacity(item.resourceType, start, end, currentTimeline)) {
                        const staff = findAvailableStaff(item.staffReq, start, end, staffList, currentTimeline);
                        if (staff) {
                            currentTimeline.push({ start, end, resourceType: item.resourceType, staffName: staff });
                            finalDetails.push({
                                guestIndex: parseInt(item.id.replace('new_', '')),
                                staff: staff,
                                service: item.serviceName,
                                price: item.price,
                                timeStr: `${getTimeStrFromMins(item.startMins)} - ${getTimeStrFromMins(end - CONFIG.CLEANUP_BUFFER)}`
                            });
                            isFitted = true;
                        }
                    }
                } 
                // 2. Nếu là COMBO (Cả cũ và mới đều vào đây để co giãn)
                else {
                    const splits = generateElasticSplits(item.duration, item.elasticStep, item.elasticLimit, item.lockedPhase1);
                    
                    for (const split of splits) {
                        // Thử 2 chiều FB và BF. Với khách cũ, ta mặc định giữ FB để an toàn (hoặc đọc từ DB nếu có).
                        // Ở đây frontend đơn giản hóa: Default FB.
                        let modes = ['FB', 'BF'];
                        if (item.type === 'EXISTING') modes = ['FB']; 

                        for (const mode of modes) {
                            const p1Res = (mode === 'FB') ? 'CHAIR' : 'BED';
                            const p2Res = (mode === 'FB') ? 'BED' : 'CHAIR';
                            
                            const tStart = item.startMins;
                            const p1End = tStart + split.p1;
                            const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                            const p2End = p2Start + split.p2;
                            const fullEnd = p2End + CONFIG.CLEANUP_BUFFER;

                            // Check Resource
                            if (!checkResourceCapacity(p1Res, tStart, p1End + CONFIG.CLEANUP_BUFFER, currentTimeline)) continue;
                            
                            let tempTimeline = [...currentTimeline, { start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: 'TEMP' }];
                            if (!checkResourceCapacity(p2Res, p2Start, fullEnd, tempTimeline)) continue;

                            // Check Staff
                            const assignedStaff = findAvailableStaff(item.staffReq, tStart, fullEnd, staffList, currentTimeline);
                            
                            // Với khách cũ, phải chắc chắn là staff cũ (hoặc staffReq) được assign
                            if (item.type === 'EXISTING' && assignedStaff !== item.staffReq) continue;

                            if (assignedStaff) {
                                // Success!
                                currentTimeline.push({ start: tStart, end: p1End + CONFIG.CLEANUP_BUFFER, resourceType: p1Res, staffName: assignedStaff });
                                currentTimeline.push({ start: p2Start, end: fullEnd, resourceType: p2Res, staffName: assignedStaff });

                                if (item.type === 'NEW') {
                                    finalDetails.push({
                                        guestIndex: parseInt(item.id.replace('new_', '')),
                                        staff: assignedStaff,
                                        service: item.serviceName,
                                        price: item.price,
                                        phase1_duration: split.p1,
                                        phase2_duration: split.p2,
                                        breakdown: `(足:${split.p1} → 身:${split.p2})`,
                                        is_elastic: split.deviation !== 0,
                                        timeStr: `${getTimeStrFromMins(tStart)} - ${getTimeStrFromMins(p2End)}`
                                    });
                                }
                                isFitted = true;
                                break; 
                            }
                        }
                        if (isFitted) break;
                    }
                }

                if (!isFitted) {
                    if (item.type === 'NEW') {
                        return { feasible: false, reason: "Không tìm được chỗ phù hợp (Elastic Failed)" };
                    } else {
                        // Khách cũ bị đẩy ra -> Lỗi nghiêm trọng, nhưng để UI không crash, ta báo lỗi chung
                        console.warn(`[V6.0] Warning: Existing booking ${item.id} could not be refitted. Resource conflict?`);
                        return { feasible: false, reason: "Xung đột với lịch cũ (System Conflict)" };
                    }
                }
            }

            // ========================================================================
            // BƯỚC C: KẾT QUẢ CUỐI CÙNG
            // ========================================================================
            
            // Check tổng 1 lần nữa
            if (!checkResourceCapacity('TOTAL', requestStartMins, requestStartMins + 5, currentTimeline)) {
                return { feasible: false, reason: "Quá tải tổng số khách (Max 12)" };
            }

            // Sort kết quả
            finalDetails.sort((a,b) => a.guestIndex - b.guestIndex);

            return { 
                feasible: true, 
                strategy: 'GLOBAL_ELASTIC_V6', 
                details: finalDetails, 
                totalPrice: finalDetails.reduce((sum, item) => sum + item.price, 0) 
            };
        }

        return { checkRequestAvailability, setDynamicServices };
    })();

    // ========================================================================
    // PHẦN 2: ANTI-CACHE DATA FETCHER (V90 - KEEP)
    // Mô tả: Giữ nguyên logic fetch dữ liệu từ server với tham số timestamp
    // ========================================================================
    const fetchLiveServerData = async (isForceRefresh = false) => {
        const apiUrl = window.API_URL || window.GAS_API_URL || (window.CONFIG && window.CONFIG.API_URL);
        
        if (!apiUrl) {
            console.warn("⚠️ V90 Warning: API_URL not found. Using local cache only.");
            return null; 
        }

        try {
            if (isForceRefresh) {
                console.log("🌐 V90: [FORCE FETCH] Requesting Server to Sync...");
            } else {
                console.log("🚀 V90: [FAST FETCH] Requesting cached data...");
            }

            const params = [];
            params.push(`_t=${new Date().getTime()}`);
            if (isForceRefresh) {
                params.push('forceRefresh=true');
            }

            const queryString = params.join('&');
            const targetUrl = apiUrl.includes('?') ? `${apiUrl}&${queryString}` : `${apiUrl}?${queryString}`;
            
            const response = await fetch(targetUrl);
            const data = await response.json();
            
            if (data && data.staff && data.bookings) {
                console.log(`✅ V90: Data Received! Mode: ${isForceRefresh ? 'FORCE' : 'FAST'}. Items: ${data.bookings.length}`);
                return data;
            }
            return null;
        } catch (err) {
            console.error("❌ V90: Fetch Failed", err);
            return null;
        }
    };

    // ========================================================================
    // PHẦN 3: REACT UI LOGIC (GIAO DIỆN V91 + V92)
    // ========================================================================
    
    const { useState, useEffect, useMemo, useCallback } = React;

    const SHOP_UI_CONFIG = {
        HOURS_LIST: ['08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','00','01','02'],
        MINUTES_STEP: ['00', '10', '20', '30', '40', '50'],
        OPEN_HOUR: 8,
        MAX_PAX_SELECT: 6 
    };

    const syncServicesToCore = () => {
        const rawServices = window.SERVICES_DATA || {};
        const formattedServices = {};
        Object.keys(rawServices).forEach(key => {
            const svc = rawServices[key];
            formattedServices[key] = {
                name: svc.name || key, duration: parseInt(svc.duration) || 60,
                type: svc.type ? svc.type.toUpperCase() : 'BODY', category: svc.category || 'SINGLE', price: svc.price || 0,
                elasticStep: svc.elasticStep || 0,
                elasticLimit: svc.elasticLimit || 0
            };
        });
        CoreKernel.setDynamicServices(formattedServices);
    };

    // ------------------------------------------------------------------------
    // HÀM CẦU NỐI (BRIDGE FUNCTION) - V93 UPDATED
    // Cập nhật để truyền các tham số mới (isManualLocked, phase1_duration) vào Core
    // ------------------------------------------------------------------------
    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList) => {
        syncServicesToCore();
        
        const coreGuests = guests.map(g => ({
            serviceCode: g.service,
            staffName: g.staff === '隨機' ? 'RANDOM' : (g.staff === '女' || g.staff === 'FEMALE_OIL') ? 'FEMALE' : (g.staff === '男') ? 'MALE' : g.staff
        }));

        const targetDateStandard = date.replace(/-/g, '/');
        const targetDateSheetHeader = date.replace(/\//g, '-');

        // [V93 UPDATE]: Map thêm các trường dữ liệu mới cho Core V6.0
        const coreBookings = (Array.isArray(bookings) ? bookings : []).filter(b => {
            if (!b || !b.startTimeString || (b.status && (b.status.includes('hủy') || b.status.includes('Cancel')))) return false;
            return b.startTimeString.split(' ')[0].replace(/-/g, '/') === targetDateStandard;
        }).map(b => ({
            serviceCode: b.serviceName, 
            serviceName: b.serviceName, 
            startTime: b.startTimeString, 
            duration: parseInt(b.duration) || 60, 
            staffName: b.technician || b.staffId || "Unassigned",
            // --- CÁC TRƯỜNG MỚI CHO V6.0 ---
            rowId: b.rowId, // Định danh để tracking
            isManualLocked: (b.isManualLocked === true || b.isManualLocked === 'true'), // Cờ khóa tay
            phase1_duration: b.phase1_duration ? parseInt(b.phase1_duration) : null, // Thời gian P1 nếu đã lưu
            status: b.status // Để check 'Running'
        }));

        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = String(s.id).trim();

                // [FIX V91]: Đọc cột "上班" và "下班" (Tiếng Trung)
                const rawStart = s['上班'] || s.shiftStart || s.start || null;
                const rawEnd = s['下班'] || s.shiftEnd || s.end || null;

                // [FIX V91]: Logic tra cứu ngày nghỉ OFF
                const dayStatus = s[targetDateSheetHeader] || s[targetDateStandard] || "";
                let isOff = (String(s.offDays || "").includes(targetDateStandard) || String(dayStatus).toUpperCase().includes('OFF'));

                // Nếu không có giờ làm, coi như OFF
                if (!rawStart || !rawEnd || rawStart === "00:00") {
                    // Logic an toàn: Nếu không set giờ thì coi như không làm
                    // (Bạn có thể bỏ comment dòng dưới nếu muốn strict check)
                    // isOff = true; 
                }

                staffMap[sId] = {
                    id: sId, gender: s.gender, 
                    start: rawStart || "00:00", 
                    end: rawEnd || "00:00",
                    isStrictTime: (s.isStrictTime === true || s.isStrictTime === 'TRUE'), 
                    off: isOff
                };
                if (s.name) staffMap[s.name] = staffMap[sId];
            });
        }

        try {
            const result = CoreKernel.checkRequestAvailability(date, time, coreGuests, coreBookings, staffMap);
            return result.feasible ? { valid: true, details: result.details } : { valid: false, reason: result.reason };
        } catch (err) {
            console.error("Core Check Error:", err);
            return { valid: false, reason: "System Error: " + err.message };
        }
    };

    const forceGlobalRefresh = () => { if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender(); else window.location.reload(); };

    // ==================================================================================
    // 3. COMPONENT: PHONE BOOKING MODAL (ZH-TW) - V90 + V91 FIX
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
            console.log("⚡ V90: Phone Booking Modal Opened -> Triggering FORCE BACKGROUND FETCH...");
            fetchLiveServerData(true).then(data => {
                if (data) {
                    setServerData(data); 
                    console.log("✅ V90: Force Fetch Complete. Ready for instant & accurate check.");
                }
            });
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
            setIsChecking(true);
            setCheckResult(null); setSuggestions([]);

            let currentStaffList = safeStaffList;
            let currentBookings = safeBookings;
            let isInstant = false;

            if (serverData) {
                currentStaffList = serverData.staff || safeStaffList;
                currentBookings = serverData.bookings || safeBookings;
                isInstant = true;
                console.log("⚡ V90: Using PRE-FETCHED (Forced) data. Accurate & Instant.");
            } else {
                console.log("⏳ V90: Pre-fetch not ready. Falling back to FAST fetch...");
                const freshData = await fetchLiveServerData(false);
                if (freshData) {
                    currentStaffList = freshData.staff || safeStaffList;
                    currentBookings = freshData.bookings || safeBookings;
                    setServerData(freshData); 
                }
            }

            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, currentBookings, currentStaffList);
            
            if (res.valid) { 
                setCheckResult({ status: 'OK', message: "✅ 此時段可預約 (Available)" }); 
                setSuggestions([]); 
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
            
            if (isInstant) setTimeout(() => setIsChecking(false), 200);
            else setIsChecking(false);
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入顧客姓名！"); return; }
            setIsSubmitting(true);
            try {
                const svcSum = guestDetails.map(g => g.service).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
                const oils = guestDetails.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean).join(',');
                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: svcSum, pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: guestDetails[0].staff, isOil: guestDetails[0].isOil,
                    staffId2: guestDetails[1]?.staff||null, staffId3: guestDetails[2]?.staff||null,
                    staffId4: guestDetails[3]?.staff||null, staffId5: guestDetails[4]?.staff||null, staffId6: guestDetails[5]?.staff||null,
                    ghiChu: oils ? `(${oils})` : "", guestDetails: guestDetails
                };
                if (onSave) { await Promise.resolve(onSave(payload)); forceGlobalRefresh(); setTimeout(()=>{onClose();setIsSubmitting(false);}, 500); }
            } catch(err) { alert("儲存失敗: "+err.message); setIsSubmitting(false); }
        };

        const [cH, cM] = (form.time || "12:00").split(':');
        const paxOptions = Array.from({length: SHOP_UI_CONFIG.MAX_PAX_SELECT}, (_, i) => i + 1);

        return (
            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fadeIn">
                    <div className="bg-[#0891b2] p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">📅 電話預約 (V93+Brain V6.0)</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step==='CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold text-gray-500">日期 (Date)</label><input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form,date:e.target.value});setCheckResult(null);}}/></div>
                                    <div><label className="text-xs font-bold text-gray-500">時間 (Time)</label>
                                    <div className="flex items-center gap-1"><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cH} onChange={e=>handleTimeChange('HOUR',e.target.value)}>{SHOP_UI_CONFIG.HOURS_LIST.map(h=><option key={h} value={h}>{h}</option>)}</select></div><span className="font-bold">:</span><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cM} onChange={e=>handleTimeChange('MINUTE',e.target.value)}>{SHOP_UI_CONFIG.MINUTES_STEP.map(m=><option key={m} value={m}>{m}</option>)}</select></div></div></div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">人數 (Pax)</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2"><div className="text-xs font-bold text-gray-400">詳細需求</div>
                                    {guestDetails.map((g,i)=>(
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師傅</option><option value="FEMALE_OIL">🚺 女+精油</option><option value="男">🚹 男師傅</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
                                    ))}
                                </div>
                                <div>
                                    {!checkResult ? 
                                        <button onClick={performCheck} disabled={isChecking} className={`w-full text-white p-3 rounded font-bold shadow-lg flex justify-center items-center ${isChecking ? 'bg-gray-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                                            {isChecking ? <><span className="animate-spin h-5 w-5 mr-3 border-4 border-white border-t-transparent rounded-full"></span> 正在更新數據...</> : "🔍 查詢空位 (Instant Check)"}
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
                                <div className="bg-green-50 p-3 rounded border border-green-200 text-green-800 font-bold"><div className="flex justify-between"><span>{form.date}</span><span>{form.time}</span></div><div className="text-sm font-normal mt-1">{form.pax} 位 - {guestDetails[0].service}...</div></div>
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名 (Name)</label><input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custName} onChange={e=>setForm({...form,custName:e.target.value})} placeholder="請輸入顧客姓名..." disabled={isSubmitting}/></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼 (Phone)</label><input className="w-full border p-3 rounded font-bold focus:ring-2 focus:ring-green-500 outline-none" value={form.custPhone} onChange={e=>setForm({...form,custPhone:e.target.value})} placeholder="09xx..." disabled={isSubmitting}/></div>
                                <div className="flex gap-2 pt-2"><button onClick={(e)=>{e.preventDefault();if(!isSubmitting)setStep('CHECK');}} className="flex-1 bg-gray-200 p-3 rounded font-bold text-gray-700 hover:bg-gray-300" disabled={isSubmitting}>⬅️ 返回</button><button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting?"處理中...":"✅ 確認預約"}</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 4. COMPONENT: WALK-IN MODAL (ZH-TW) - V90 + V91 FIX
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
            console.log("⚡ V90: Walk-in Modal Opened -> Triggering FORCE BACKGROUND FETCH...");
            fetchLiveServerData(true).then(data => {
                if (data) setServerData(data);
            });
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
            setIsChecking(true);
            setCheckResult(null); setWaitSuggestion(null);

            let currentStaffList = safeStaffList;
            let currentBookings = safeBookings;
            let isInstant = false;

            if (serverData) {
                currentStaffList = serverData.staff || safeStaffList;
                currentBookings = serverData.bookings || safeBookings;
                isInstant = true;
            } else {
                const freshData = await fetchLiveServerData(false); 
                if (freshData) {
                    currentStaffList = freshData.staff || safeStaffList;
                    currentBookings = freshData.bookings || safeBookings;
                    setServerData(freshData);
                }
            }

            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, currentBookings, currentStaffList);
            
            if (res.valid) { 
                setCheckResult({ status: 'OK', message: "✅ 目前有空位 (Available Now)" }); 
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
                    const openH = SHOP_UI_CONFIG.OPEN_HOUR;
                    for (let t = openH*60; t < openH*60 + 240; t += 10) {
                        const h = Math.floor(t / 60); const m = t % 60;
                        const tStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                        if (callCoreAvailabilityCheck(tomorrowStr, tStr, guestDetails, currentBookings, currentStaffList).valid) { foundTime=tStr; foundDate=tomorrowStr; isNextDay=true; break; }
                    }
                }

                if (foundTime) { setCheckResult({ status: 'FAIL', message: isNextDay?"⛔ 今日已滿":"⚠️ 需等待" }); setWaitSuggestion({ time: foundTime, date: foundDate, mins: waitMins, isNextDay }); }
                else { setCheckResult({ status: 'FAIL', message: "❌ 預約已滿 (Fully Booked)" }); setWaitSuggestion(null); }
            }
            
            if (isInstant) setTimeout(() => setIsChecking(false), 200);
            else setIsChecking(false);
        };

        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入姓名！"); return; }
            setIsSubmitting(true);
            try {
                const svcSum = guestDetails.map(g => g.service).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
                const oils = guestDetails.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean).join(',');
                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: svcSum, pax: form.pax,
                    ngayDen: (form.date||"").replace(/-/g, '/'), gioDen: form.time,
                    nhanVien: guestDetails[0].staff, isOil: guestDetails[0].isOil,
                    staffId2: guestDetails[1]?.staff||null, staffId3: guestDetails[2]?.staff||null,
                    staffId4: guestDetails[3]?.staff||null, staffId5: guestDetails[4]?.staff||null, staffId6: guestDetails[5]?.staff||null,
                    ghiChu: oils ? `(${oils})` : "", guestDetails: guestDetails 
                };
                if (onSave) { await Promise.resolve(onSave(payload)); forceGlobalRefresh(); setTimeout(()=>{onClose();setIsSubmitting(false);}, 500); }
            } catch(err) { alert("錯誤: "+err.message); setIsSubmitting(false); }
        };

        const paxOptions = Array.from({length: SHOP_UI_CONFIG.MAX_PAX_SELECT}, (_, i) => i + 1);

        return (
            <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl modal-animate flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="bg-amber-600 p-4 text-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-lg">⚡ 現場客 (V93+Brain V6.0)</h3>
                        <button onClick={onClose}><i className="fas fa-times text-xl"></i></button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step === 'CHECK' && (
                            <>
                                <div><label className="text-xs font-bold text-gray-500">人數 (Pax)</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2">
                                    {guestDetails.map((g, i) => (
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師</option><option value="FEMALE_OIL">🚺+精油</option><option value="男">🚹 男師</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
                                    ))}
                                </div>
                                {checkResult && (<div className="space-y-2"><div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>{waitSuggestion&&(<div className="bg-blue-50 border border-blue-200 p-3 rounded animate-fadeIn text-center"><div className={`mb-2 font-bold text-lg ${waitSuggestion.isNextDay?'text-orange-600':'text-blue-700'}`}>{waitSuggestion.isNextDay ? `🌅 最快明天: ${waitSuggestion.time}` : `⏳ 需等待 ${waitSuggestion.mins} 分鐘 (${waitSuggestion.time})`}</div><button onClick={(e) => { e.preventDefault(); setForm({...form, time: waitSuggestion.time, date: waitSuggestion.date}); setStep('INFO'); }} className="w-full bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">➡️ 接受安排</button></div>)}</div>)}
                                <div className="pt-2 grid grid-cols-2 gap-3"><button onClick={onClose} className="bg-gray-100 text-gray-500 font-bold p-3 rounded hover:bg-gray-200">取消</button>
                                {(!checkResult || checkResult.status === 'FAIL') ? 
                                    <button onClick={performCheck} disabled={isChecking} className={`font-bold p-3 rounded shadow-lg flex justify-center items-center text-white ${isChecking?'bg-gray-400':'bg-amber-500 hover:bg-amber-600'}`}>
                                        {isChecking ? <span className="animate-spin h-5 w-5 border-4 border-white border-t-transparent rounded-full"></span> : "🔍 檢查"}
                                    </button> : 
                                    <button onClick={() => setStep('INFO')} className="bg-emerald-600 text-white font-bold p-3 rounded hover:bg-emerald-700 shadow-lg animate-pulse">➡️ 下一步</button>}
                                </div>
                            </>
                        )}
                        {step === 'INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-amber-50 p-3 rounded border border-amber-200 text-amber-900 font-bold"><div className="flex justify-between"><span>{form.date}</span><span>{form.time}</span></div></div>
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
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) { window.AvailabilityCheckModal = NewAvailabilityCheckModal; console.log("♻️ AvailabilityModal Injected (V93)"); }
        if (window.WalkInModal !== NewWalkInModal) { window.WalkInModal = NewWalkInModal; console.log("♻️ WalkInModal Injected (V93)"); }
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);
})();
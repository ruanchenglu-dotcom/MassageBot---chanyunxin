/**
 * =================================================================================================
 * PROJECT: XINWUCHAN MASSAGE BOT - FRONTEND CONTROLLER & LOGIC BRIDGE
 * FILE: js/bookingHandler.js
 * PHIÊN BẢN: V112.2 (REMOVED WALK-IN FEATURE)
 * NGÀY CẬP NHẬT: 2026/01/21
 * TÁC GIẢ: AI ASSISTANT & USER
 *
 * * * * * CHANGE LOG V112.2 * * * * *
 * 1. [FEATURE REMOVAL] REMOVED WALK-IN MODAL:
 * - Theo yêu cầu, đã loại bỏ hoàn toàn nút "Khách vãng lai" (現場客).
 * - Component NewWalkInModal đã bị xóa.
 * * 2. [CORE] LOGIC PRESERVATION:
 * - Giữ nguyên Core Kernel (tính toán tài nguyên, giường/ghế).
 * - Giữ nguyên NewAvailabilityCheckModal (Đặt lịch qua điện thoại).
 * =================================================================================================
 */

(function() {
    console.log("🚀 BookingHandler V112.2: Walk-in Removed. Core Logic Active.");

    // Kiểm tra môi trường React
    if (typeof React === 'undefined') {
        console.error("❌ CRITICAL ERROR: React not found. Cannot start BookingHandler V112.2.");
        return;
    }

    // ========================================================================
    // PHẦN 0: UNIVERSAL UTILS (CÔNG CỤ DÙNG CHUNG)
    // ========================================================================
    
    /**
     * HÀM CHUẨN HÓA NGÀY TUYỆT ĐỐI (CORE)
     * Chuyển mọi định dạng (DD/MM/YYYY, YYYY-MM-DD) về YYYY/MM/DD
     */
    const normalizeDateStrict = (input) => {
        if (!input) return "";
        try {
            let str = input.toString().trim();
            // 1. Loại bỏ giờ giấc nếu dính (VD: 2026-01-20T00:00:00)
            if (str.includes('T')) str = str.split('T')[0];
            if (str.includes(' ')) str = str.split(' ')[0];

            // 2. Thay thế tất cả gạch ngang, chấm bằng gạch chéo
            str = str.replace(/-/g, '/').replace(/\./g, '/');

            // 3. Phân tách các phần
            const parts = str.split('/');
            
            // Nếu không đủ 3 phần, trả về nguyên gốc (fail safe)
            if (parts.length !== 3) return str;

            // 4. Logic nhận diện thông minh
            const partA = parts[0]; // Có thể là YYYY hoặc DD
            const partB = parts[1]; // MM
            const partC = parts[2]; // Có thể là DD hoặc YYYY

            // TRƯỜNG HỢP 1: Dạng YYYY/MM/DD (VD: 2026/01/20)
            if (partA.length === 4) {
                return `${partA}/${partB.padStart(2, '0')}/${partC.padStart(2, '0')}`;
            }
            
            // TRƯỜNG HỢP 2: Dạng DD/MM/YYYY (VD: 20/01/2026) -> Convert đảo ngược lại
            if (partC.length === 4) {
                return `${partC}/${partB.padStart(2, '0')}/${partA.padStart(2, '0')}`;
            }

            // Mặc định trả về nguyên gốc nếu không nhận diện được
            return str;
        } catch (e) {
            console.error("Date Normalize Error:", e);
            return input;
        }
    };

    /**
     * HÀM TRA CỨU MÃ DỊCH VỤ (NEW V112)
     * Tìm Service Code (Cột A Menu) dựa trên Tên hiển thị (Cột B Menu)
     */
    const getServiceCodeByName = (serviceName) => {
        const rawServices = window.SERVICES_DATA || {};
        // rawServices có dạng { "A1": {name: "Body 60", ...}, "B2": {...} }
        for (const [code, details] of Object.entries(rawServices)) {
            if (details.name === serviceName) {
                return code; // Trả về Key (VD: A6, F4...)
            }
        }
        return ""; // Fallback nếu không tìm thấy
    };

    // ========================================================================
    // PHẦN 1: CORE KERNEL (CLIENT-SIDE BRAIN)
    // ========================================================================
    const CoreKernel = (function() {
        
        // --- 1. CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION) ---
        const CONFIG = {
            MAX_CHAIRS: 6,        
            MAX_BEDS: 6,          
            MAX_TOTAL_GUESTS: 12, 
            OPEN_HOUR: 8,         // 08:00 Sáng mở cửa
            
            // Bộ đệm thời gian
            CLEANUP_BUFFER: 5,    
            TRANSITION_BUFFER: 5, 
            
            // Dung sai
            TOLERANCE: 1,         
            MAX_TIMELINE_MINS: 1680, 
            
            // Cấu hình Guardrail
            CAPACITY_CHECK_STEP: 10 
        };

        // Cơ sở dữ liệu dịch vụ Dynamic
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

        // --- 3. TIỆN ÍCH THỜI GIAN & DATA ---
        function getMinsFromTimeStr(timeStr) {
            if (!timeStr) return -1; 
            try {
                let str = timeStr.toString();
                // Xử lý ISO string nếu có
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
            } catch (e) {
                return -1;
            }
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

        function isActiveBookingStatus(statusRaw) {
            if (!statusRaw) return false;
            const s = statusRaw.toString().toLowerCase().trim();
            const inactiveKeywords = ['cancel', 'hủy', 'huỷ', 'finish', 'done', 'xong', 'check-out', 'checkout', '取消', '完成', '空'];
            for (const kw of inactiveKeywords) {
                if (s.includes(kw)) return false;
            }
            return true; 
        }

        // --- 4. BỘ NHẬN DIỆN (SMART CLASSIFIER) ---
        function isComboService(serviceObj, serviceNameRaw = '') {
            if (!serviceObj && !serviceNameRaw) return false;
            const cat = (serviceObj && serviceObj.category ? serviceObj.category : '').toString().toUpperCase().trim();
            if (cat === 'COMBO' || cat === 'MIXED') return true;

            const dbName = (serviceObj && serviceObj.name ? serviceObj.name : '').toString().toUpperCase();
            const rawName = (serviceNameRaw || '').toString().toUpperCase();
            const nameToCheck = dbName + " | " + rawName;
            
            const comboKeywords = [
                'COMBO', '套餐', 'MIX', '+', 'SET', 
                '腳身', '全餐', 'FOOT AND BODY', 'BODY AND FOOT',
                '雙人', 'A餐', 'B餐', 'C餐', '油壓+足'
            ];
            for (const kw of comboKeywords) {
                if (nameToCheck.includes(kw)) return true;
            }
            return false;
        }

        function detectResourceType(serviceObj) {
            if (!serviceObj) return 'CHAIR';
            if (serviceObj.type === 'BED' || serviceObj.type === 'CHAIR') return serviceObj.type;
            const name = (serviceObj.name || '').toUpperCase();
            if (name.match(/BODY|指壓|油|BED|TOAN THAN|全身|油壓|SPA|BACK/)) return 'BED';
            return 'CHAIR'; 
        }

        // --- 5. GLOBAL CAPACITY & STRICT RESOURCE CHECK (GUARDRAIL) ---
        
        function inferResourceAtTime(booking, timeMins) {
            const bStart = getMinsFromTimeStr(booking.startTime);
            const duration = parseInt(booking.duration) || 60;
            const bEnd = bStart + duration + CONFIG.CLEANUP_BUFFER;

            if (timeMins < bStart || timeMins >= bEnd) return null; 

            const svcInfo = SERVICES[booking.serviceCode] || { name: booking.serviceName };
            const isCombo = isComboService(svcInfo, booking.serviceName);

            if (!isCombo) {
                return detectResourceType(svcInfo);
            } else {
                let isBodyFirst = false;
                const storedFlow = booking.originalData?.flowCode || booking.flow;
                const noteContent = (booking.note || booking.ghiChu || "").toString().toUpperCase();
                
                if (storedFlow === 'BF') isBodyFirst = true;
                else if (storedFlow === 'FB') isBodyFirst = false;
                else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                else if (booking.allocated_resource && (booking.allocated_resource.includes('BED') || booking.allocated_resource.includes('BODY'))) isBodyFirst = true;

                let p1 = booking.phase1_duration ? parseInt(booking.phase1_duration) : Math.floor(duration / 2);
                const splitTime = bStart + p1;

                if (timeMins < splitTime) {
                    return isBodyFirst ? 'BED' : 'CHAIR';
                } else {
                    return isBodyFirst ? 'CHAIR' : 'BED';
                }
            }
        }

        function getEligibleStaffCount(staffList, currentTimeMins, requiredEndTime) {
            let count = 0;
            for (const [staffName, info] of Object.entries(staffList)) {
                if (info.off) continue;
                const shiftStart = getMinsFromTimeStr(info.start);
                const shiftEnd = getMinsFromTimeStr(info.end);
                if (shiftStart === -1 || shiftEnd === -1) continue;
                if (currentTimeMins >= shiftStart && currentTimeMins < shiftEnd) {
                    if (info.isStrictTime === true && shiftEnd < (requiredEndTime - CONFIG.TOLERANCE)) continue;
                    count++;
                }
            }
            return count;
        }

        function validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr) {
            const requestEnd = requestStart + maxDuration + CONFIG.CLEANUP_BUFFER;
            const activeExistingBookings = currentBookingsRaw.filter(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                if (bStart === -1) return false;
                if (!isActiveBookingStatus(b.status)) return false;
                const bEnd = bStart + (b.duration || 60) + CONFIG.CLEANUP_BUFFER;
                return isOverlap(requestStart, requestEnd, bStart, bEnd);
            });

            // Biến lưu snapshot debug để trả về UI
            let failureSnapshot = null;

            for (let t = requestStart; t < requestEnd; t += CONFIG.CAPACITY_CHECK_STEP) {
                
                // --- BƯỚC 1: KIỂM TRA NHÂN VIÊN (STAFF) ---
                const supplyCount = getEligibleStaffCount(staffList, t, requestEnd);
                let currentStaffLoad = 0;
                for (const b of activeExistingBookings) {
                    const bStart = getMinsFromTimeStr(b.startTime);
                    const bEnd = bStart + (b.duration || 60) + CONFIG.CLEANUP_BUFFER;
                    if (t >= bStart && t < bEnd) currentStaffLoad++;
                }
                const totalStaffDemand = currentStaffLoad + guestList.length;

                // --- BƯỚC 2: KIỂM TRA TÀI NGUYÊN VẬT LÝ (BEDS & CHAIRS) ---
                let usedBeds = 0;
                let usedChairs = 0;

                for (const b of activeExistingBookings) {
                    const resType = inferResourceAtTime(b, t);
                    if (resType === 'BED') usedBeds++;
                    else if (resType === 'CHAIR') usedChairs++;
                }

                let neededBeds = 0;
                let neededChairs = 0;
                let neededFlexible = 0; 

                for (const g of guestList) {
                    const svc = SERVICES[g.serviceCode] || { duration: 60 };
                    const isCombo = isComboService(svc, g.serviceCode);
                    const gDuration = svc.duration || 60;
                    const elapsed = t - requestStart; 

                    if (elapsed >= gDuration + CONFIG.CLEANUP_BUFFER) continue; 

                    if (!isCombo) {
                        const rType = detectResourceType(svc);
                        if (rType === 'BED') neededBeds++;
                        else neededChairs++;
                    } else {
                        const p1 = Math.floor(gDuration / 2);
                        if (elapsed < p1) neededFlexible++; 
                        else neededFlexible++;
                    }
                }

                const availableBeds = CONFIG.MAX_BEDS - usedBeds;
                const availableChairs = CONFIG.MAX_CHAIRS - usedChairs;

                // Create Snapshot for this moment
                const snapshot = {
                    queryDate: queryDateStr,
                    time: getTimeStrFromMins(t),
                    activeStaff: supplyCount,
                    guestsRunning: currentStaffLoad,
                    usedBeds: usedBeds,
                    usedChairs: usedChairs,
                    maxBeds: CONFIG.MAX_BEDS,
                    maxChairs: CONFIG.MAX_CHAIRS
                };

                // [TRANSLATED] DEBUG MESSAGES (Traditional Chinese)
                if (totalStaffDemand > supplyCount) {
                    return {
                        pass: false,
                        reason: `⚠️ 技師額滿 (Staff Full) @ ${getTimeStrFromMins(t)}. 需: ${totalStaffDemand}, 有: ${supplyCount}.`,
                        debug: snapshot
                    };
                }

                if (neededBeds > availableBeds) {
                    return { 
                        pass: false, 
                        reason: `⚠️ 床位額滿 (No Beds) @ ${getTimeStrFromMins(t)}. (餘: ${availableBeds}, 需: ${neededBeds})`,
                        debug: snapshot
                    };
                }
                if (neededChairs > availableChairs) {
                    return { 
                        pass: false, 
                        reason: `⚠️ 座椅額滿 (No Chairs) @ ${getTimeStrFromMins(t)}. (餘: ${availableChairs}, 需: ${neededChairs})`,
                        debug: snapshot
                    };
                }

                const remainingBeds = availableBeds - neededBeds;
                const remainingChairs = availableChairs - neededChairs;
                const totalSlots = remainingBeds + remainingChairs;

                if (neededFlexible > totalSlots) {
                    return { 
                        pass: false, 
                        reason: `⚠️ 組合資源不足 (Combo Fail) @ ${getTimeStrFromMins(t)}. (餘: ${totalSlots}, 需: ${neededFlexible})`,
                        debug: snapshot
                    };
                }
                
                // Keep the first snapshot as a reference of the start time state
                if (!failureSnapshot) failureSnapshot = snapshot;
            }
            return { pass: true, debug: failureSnapshot };
        }

        // --- 6. MATRIX ENGINE (LOGIC ALLOCATION) ---
        class VirtualMatrix {
            constructor() {
                this.lanes = {
                    'CHAIR': Array.from({ length: CONFIG.MAX_CHAIRS }, (_, i) => ({ id: `CHAIR-${i+1}`, occupied: [] })),
                    'BED': Array.from({ length: CONFIG.MAX_BEDS }, (_, i) => ({ id: `BED-${i+1}`, occupied: [] }))
                };
            }
            checkLaneFree(lane, start, end) {
                for (let block of lane.occupied) {
                    if (isOverlap(start, end, block.start, block.end)) return false; 
                }
                return true; 
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
                    if (this.checkLaneFree(targetLane, start, end)) {
                        return this.allocateToLane(targetLane, start, end, ownerId);
                    }
                }
                for (let lane of resourceGroup) {
                    if (this.checkLaneFree(lane, start, end)) {
                        return this.allocateToLane(lane, start, end, ownerId);
                    }
                }
                return null; 
            }
        }

        // --- 7. HELPER LOGIC: STAFF MATCHING & ELASTIC ---
        function findAvailableStaff(staffReq, start, end, staffListRef, busyList) {
            const checkOneStaff = (name) => {
                const staffInfo = staffListRef[name];
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

            if (staffReq && !['RANDOM', 'MALE', 'FEMALE', '隨機', 'Any', 'undefined'].includes(staffReq)) {
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
                let foundLane = false;
                if (b.forcedIndex && b.forcedIndex > 0 && b.forcedIndex <= laneGroup.length) {
                    const targetLane = laneGroup[b.forcedIndex - 1];
                    let isFree = true;
                    for (const occ of targetLane.occupied) {
                        if (isOverlap(b.start, b.end, occ.start, occ.end)) { isFree = false; break; }
                    }
                    if (isFree) return true; 
                }
                for (const lane of laneGroup) {
                    let isFree = true;
                    for (const occ of lane.occupied) {
                        if (isOverlap(b.start, b.end, occ.start, occ.end)) { isFree = false; break; }
                    }
                    if (isFree) { foundLane = true; break; }
                }
                if (!foundLane) return false;
            }
            return true;
        }

        // --- 8. MAIN ENGINE (INTEGRATED) ---

        function checkRequestAvailability(dateStr, timeStr, guestList, currentBookingsRaw, staffList) {
            const requestStartMins = getMinsFromTimeStr(timeStr);
            if (requestStartMins === -1) return { feasible: false, reason: "錯誤: 時間格式無效 (Invalid Time)" };

            let maxGuestDuration = 0;
            guestList.forEach(g => {
                const s = SERVICES[g.serviceCode] || { duration: 60 };
                const dur = s.duration || 60;
                if (dur > maxGuestDuration) maxGuestDuration = dur;
            });

            // GIAI ĐOẠN 0: KIỂM TRA TÀI NGUYÊN (STRICT GUARDRAIL)
            const guardrailCheck = validateGlobalCapacity(
                requestStartMins, 
                maxGuestDuration, 
                guestList, 
                currentBookingsRaw, 
                staffList,
                dateStr // Pass normalized date string for audit
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
                const timeKey = (b.startTime || "").split(' ')[1] || "00:00";
                const contactInfo = b.originalData?.phone || b.originalData?.sdt || b.originalData?.custPhone || b.originalData?.customerName || "Unknown";
                const contactKey = contactInfo.toString().replace(/\D/g, '').slice(-6) || contactInfo.toString().trim();
                const statusLower = (b.status||'').toLowerCase();
                const groupKey = (statusLower.includes('running') || statusLower.includes('doing')) ? `RUNNING_${b.rowId}` : `${timeKey}_${contactKey}`;
                if (!bookingGroups[groupKey]) bookingGroups[groupKey] = [];
                bookingGroups[groupKey].push(b);
            });

            let remappedBookings = [];
            Object.values(bookingGroups).forEach(group => {
                group.sort((a,b) => parseInt(a.rowId) - parseInt(b.rowId));
                const groupSize = group.length;
                const halfSize = Math.ceil(groupSize / 2);
                group.forEach((b, idx) => {
                    b._virtualInheritanceIndex = null;
                    b._impliedFlow = null;
                    const statusLower = (b.status||'').toLowerCase();
                    if (!statusLower.includes('running')) {
                        let virtualIndex = (groupSize >= 2) ? (idx % halfSize) + 1 : idx + 1;
                        b._virtualInheritanceIndex = virtualIndex; 
                        if (groupSize >= 2) {
                            b._impliedFlow = (idx < halfSize) ? 'BF' : 'FB';
                        }
                    }
                    remappedBookings.push(b);
                });
            });

            // GIAI ĐOẠN B: XỬ LÝ CHI TIẾT BOOKING
            let existingBookingsProcessed = [];
            remappedBookings.forEach(b => {
                const bStart = getMinsFromTimeStr(b.startTime);
                if (bStart === -1) return;

                let svcInfo = SERVICES[b.serviceCode] || {};
                let isCombo = isComboService(svcInfo, b.serviceName);
                let duration = b.duration || 60;
                let anchorIndex = null;
                const statusLower = (b.status||'').toLowerCase();
                const isRunning = statusLower.includes('running');

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

                let processedB = {
                    id: b.rowId, originalData: b, staffName: b.staffName, serviceName: b.serviceName, 
                    category: svcInfo.category, 
                    isElastic: isCombo && (b.isManualLocked !== true) && (!isRunning),
                    elasticStep: svcInfo.elasticStep || 5, elasticLimit: svcInfo.elasticLimit || 15,
                    startMins: bStart, duration: duration, blocks: [], anchorIndex: anchorIndex
                };

                let storedFlow = b.originalData?.flowCode || b.flow || null; 

                if (isCombo) {
                    let p1 = b.phase1_duration ? parseInt(b.phase1_duration) : Math.floor(duration / 2);
                    let p2 = duration - p1;
                    const p1End = bStart + p1;
                    const p2Start = p1End + CONFIG.TRANSITION_BUFFER;
                    let isBodyFirst = false;
                    const noteContent = (b.note || b.ghiChu || b.originalData?.ghiChu || "").toString().toUpperCase();
                    
                    if (storedFlow === 'BF') isBodyFirst = true;
                    else if (storedFlow === 'FB') isBodyFirst = false;
                    else if (noteContent.includes('BF') || noteContent.includes('BODY FIRST') || noteContent.includes('先做身體')) isBodyFirst = true;
                    else if (isRunning && b.allocated_resource && (b.allocated_resource.includes('BED') || b.allocated_resource.includes('BODY'))) isBodyFirst = true; 
                    else if (b._impliedFlow === 'BF') isBodyFirst = true;

                    if (isBodyFirst) {
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'BED', forcedIndex: anchorIndex }); 
                        processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'CHAIR', forcedIndex: anchorIndex });
                        processedB.flow = 'BF'; 
                    } else {
                        processedB.blocks.push({ start: bStart, end: p1End, type: 'CHAIR', forcedIndex: anchorIndex }); 
                        processedB.blocks.push({ start: p2Start, end: bStart + duration, type: 'BED', forcedIndex: anchorIndex });
                        processedB.flow = 'FB'; 
                    }
                    processedB.p1_current = p1; processedB.p2_current = p2;
                } else {
                    let rType = detectResourceType(svcInfo);
                    processedB.blocks.push({ start: bStart, end: bStart + duration, type: rType, forcedIndex: anchorIndex });
                }
                existingBookingsProcessed.push(processedB);
            });

            // GIAI ĐOẠN C: KỊCH BẢN KHÁCH MỚI
            const newGuests = guestList.map((g, idx) => ({ ...g, idx: idx }));
            const comboGuests = newGuests.filter(g => { const s = SERVICES[g.serviceCode]; return isComboService(s, g.serviceCode); });
            const newGuestHalfSize = Math.ceil(comboGuests.length / 2);
            const maxBF = comboGuests.length;
            let trySequence = [];

            if (maxBF === 2) {
                trySequence = [0, 2, 1]; 
            } else if (maxBF > 0) {
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
            } else {
                trySequence.push(0);
            }
            
            // GIAI ĐOẠN D: VÒNG LẶP VÉT CẠN (EXHAUSTIVE MATRIX LOOP)
            let successfulScenario = null;

            for (let numBF of trySequence) {
                let matrix = new VirtualMatrix();
                let scenarioDetails = [];
                let scenarioUpdates = [];
                let scenarioFailed = false;
                
                // 1. NẠP KHÁCH CŨ
                let softsToSqueezeCandidates = []; 
                for (const exB of existingBookingsProcessed) {
                    let placedSuccessfully = true;
                    let allocatedSlots = []; 
                    for (const block of exB.blocks) {
                        const realEnd = block.end + CONFIG.CLEANUP_BUFFER;
                        const slotId = matrix.tryAllocate(block.type, block.start, realEnd, exB.id, block.forcedIndex);
                        if (!slotId) { placedSuccessfully = false; break; }
                        allocatedSlots.push(slotId);
                    }
                    if (exB.isElastic) {
                        if (placedSuccessfully) exB.allocatedSlots = allocatedSlots; 
                        softsToSqueezeCandidates.push(exB); 
                    }
                }

                // 2. TÍNH TOÁN BLOCK KHÁCH MỚI
                let newGuestBlocksMap = []; 
                for (const ng of newGuests) {
                    const svc = SERVICES[ng.serviceCode] || { name: ng.serviceCode || 'Unknown', duration: 60, price: 0 }; 
                    let flow = 'FB'; 
                    let isThisGuestCombo = isComboService(svc, ng.serviceCode);
                    if (isThisGuestCombo) {
                        const cIdx = comboGuests.findIndex(cg => cg.idx === ng.idx);
                        if (cIdx >= 0 && cIdx < numBF) { flow = 'BF'; }
                    }
                    const duration = svc.duration || 60;
                    let blocks = [];
                    if (isThisGuestCombo) {
                        const p1Standard = Math.floor(duration / 2);
                        const p2Standard = duration - p1Standard;
                        if (flow === 'FB') { 
                            const t1End = requestStartMins + p1Standard;
                            const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                            blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                            blocks.push({ start: t2Start, end: t2Start + p2Standard + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                            scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'FB', timeStr: timeStr, allocated: [] });
                        } else { 
                            const t1End = requestStartMins + p2Standard; 
                            const t2Start = t1End + CONFIG.TRANSITION_BUFFER;
                            blocks.push({ start: requestStartMins, end: t1End + CONFIG.CLEANUP_BUFFER, type: 'BED' });
                            blocks.push({ start: t2Start, end: t2Start + p1Standard + CONFIG.CLEANUP_BUFFER, type: 'CHAIR' });
                            scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, phase1_duration: p1Standard, phase2_duration: p2Standard, flow: 'BF', timeStr: timeStr, allocated: [] });
                        }
                    } else { 
                        let rType = detectResourceType(svc);
                        blocks.push({ start: requestStartMins, end: requestStartMins + duration + CONFIG.CLEANUP_BUFFER, type: rType });
                        scenarioDetails.push({ guestIndex: ng.idx, service: svc.name, price: svc.price, flow: 'SINGLE', timeStr: timeStr, allocated: [] });
                    }
                    newGuestBlocksMap.push({ guest: ng, blocks: blocks });
                }

                // 3. XẾP KHÁCH MỚI
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

                // 4. SQUEEZE LOGIC
                if (conflictFound) {
                    let matrixSqueeze = new VirtualMatrix();
                    let updatesProposed = [];
                    
                    const hardBookings = existingBookingsProcessed.filter(b => !b.isElastic);
                    hardBookings.forEach(hb => {
                        hb.blocks.forEach(blk => matrixSqueeze.tryAllocate(blk.type, blk.start, blk.end + CONFIG.CLEANUP_BUFFER, hb.id, blk.forcedIndex));
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

                    if (!squeezeScenarioPossible) { scenarioFailed = true; continue; }

                    const softBookings = existingBookingsProcessed.filter(b => b.isElastic);
                    for (const sb of softBookings) {
                        const splits = generateElasticSplits(sb.duration, sb.elasticStep, sb.elasticLimit, null);
                        let fit = false;
                        for (const split of splits) {
                            const sP1End = sb.startMins + split.p1;
                            const sP2Start = sP1End + CONFIG.TRANSITION_BUFFER;
                            const sP2End = sP2Start + split.p2;
                            const testBlocks = [
                                { type: 'CHAIR', start: sb.startMins, end: sP1End + CONFIG.CLEANUP_BUFFER, forcedIndex: sb.blocks[0].forcedIndex },
                                { type: 'BED', start: sP2Start, end: sP2End + CONFIG.CLEANUP_BUFFER, forcedIndex: sb.blocks[1] ? sb.blocks[1].forcedIndex : null }
                            ];
                            if (isBlockSetAllocatable(testBlocks, matrixSqueeze)) {
                                testBlocks.forEach(tb => matrixSqueeze.tryAllocate(tb.type, tb.start, tb.end, sb.id, tb.forcedIndex));
                                fit = true;
                                if (split.deviation !== 0) updatesProposed.push({ rowId: sb.id, customerName: sb.originalData.customerName, newPhase1: split.p1, newPhase2: split.p2, reason: 'Matrix Squeeze' });
                                break; 
                            }
                        }
                        if (!fit) { squeezeScenarioPossible = false; break; }
                    }
                    if (squeezeScenarioPossible) {
                        scenarioUpdates = updatesProposed;
                        matrix = matrixSqueeze; 
                    } else {
                        scenarioFailed = true; continue;
                    }
                }

                // 5. STAFF CHECK (ASSIGNMENT)
                let flatTimeline = [];
                Object.values(matrix.lanes).forEach(group => group.forEach(lane => lane.occupied.forEach(occ => {
                    const ex = existingBookingsProcessed.find(e => e.id === occ.ownerId);
                    if (ex) flatTimeline.push({ start: occ.start, end: occ.end, staffName: ex.staffName, resourceType: lane.id });
                })));

                let staffAssignmentSuccess = true;
                for (const item of newGuestBlocksMap) {
                    const assignedStaff = findAvailableStaff(item.guest.staffName, item.blocks[0].start, item.blocks[item.blocks.length - 1].end, staffList, flatTimeline);
                    
                    if (!assignedStaff) { staffAssignmentSuccess = false; break; }
                    
                    const detail = scenarioDetails.find(d => d.guestIndex === item.guest.idx);
                    if (detail) detail.staff = assignedStaff;
                    item.blocks.forEach(b => flatTimeline.push({ start: b.start, end: b.end, staffName: assignedStaff }));
                }

                if (!staffAssignmentSuccess) { scenarioFailed = true; continue; }

                successfulScenario = { details: scenarioDetails, updates: scenarioUpdates, matrixDump: matrix.lanes };
                break; 
            }

            if (successfulScenario) {
                successfulScenario.details.sort((a,b) => a.guestIndex - b.guestIndex);
                return {
                    feasible: true, 
                    strategy: 'MATRIX_COUPLE_SYNC_V112.1', 
                    details: successfulScenario.details,
                    proposedUpdates: successfulScenario.updates,
                    totalPrice: successfulScenario.details.reduce((sum, item) => sum + (item.price||0), 0),
                    debug: guardrailCheck.debug // Pass guardrail stats for info
                };
            } else {
                return { feasible: false, reason: "❌ 已額滿 (Full - Matrix Logic)", debug: guardrailCheck.debug };
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
            
            if (data && data.staff && data.bookings) {
                return data;
            }
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

    const mergeBookingData = (serverBookings, localBookings) => {
        if (!Array.isArray(serverBookings)) serverBookings = [];
        if (!Array.isArray(localBookings)) localBookings = [];
        const mergedMap = new Map();
        serverBookings.forEach(b => { if (b.rowId) mergedMap.set(b.rowId, b); });
        localBookings.forEach(b => { if (b.rowId) mergedMap.set(b.rowId, b); });
        return Array.from(mergedMap.values());
    };

    // [V112.0] UPDATED BRIDGE: Mapping Service Code Before Core Check
    const callCoreAvailabilityCheck = (date, time, guests, bookings, staffList) => {
        syncServicesToCore();
        const now = new Date();
        
        // [V112] MAP SERVICE NAME -> SERVICE CODE (Core needs Key A6, F4, etc.)
        const coreGuests = guests.map(g => {
            // Find Service Code from Name
            let foundCode = getServiceCodeByName(g.service);
            
            return {
                serviceCode: foundCode || g.service, // Use Code if found, else fallback to Name
                staffName: g.staff === '隨機' ? 'RANDOM' : (g.staff === '女' || g.staff === 'FEMALE_OIL') ? 'FEMALE' : (g.staff === '男') ? 'MALE' : g.staff
            };
        });

        const targetDateStandard = normalizeDateStrict(date);
        
        const coreBookings = (Array.isArray(bookings) ? bookings : []).filter(b => {
            if (!b || !b.startTimeString || (b.status && (b.status.includes('hủy') || b.status.includes('Cancel')))) return false;
            
            const rawDate = b.startTimeString.split(' ')[0];
            const bDate = normalizeDateStrict(rawDate);
            return bDate === targetDateStandard;
        }).map(b => {
            let isPastOrRunning = false;
            try { if (new Date(b.startTimeString) <= now) isPastOrRunning = true; } catch (e) {}
            
            return {
                serviceCode: b.serviceCode || b.serviceName, // Try to use Code if available from DB
                serviceName: b.serviceName, 
                startTime: b.startTimeString, 
                duration: parseInt(b.duration) || 60, staffName: b.technician || b.staffId || "Unassigned", rowId: b.rowId,
                allocated_resource: b.resourceId || b.allocated_resource || b.rowId,
                originalData: b, 
                isManualLocked: (b.isManualLocked === true || String(b.isManualLocked) === 'true') || isPastOrRunning, 
                phase1_duration: b.phase1_duration ? parseInt(b.phase1_duration) : null,
                phase2_duration: b.phase2_duration ? parseInt(b.phase2_duration) : null,
                status: isPastOrRunning ? 'Running' : (b.status || 'Reserved'),
                note: b.ghiChu || b.note,
                ghiChu: b.ghiChu || b.note,
                flow: b.flow || b.originalData?.flowCode
            };
        });

        const staffMap = {};
        if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                const sId = String(s.id).trim();
                const rawStart = s['上班'] || s.shiftStart || s.start || "00:00";
                const rawEnd = s['下班'] || s.shiftEnd || s.end || "00:00";
                
                const dayStatus = s[targetDateStandard] || s[targetDateStandard.replace(/\//g, '-')] || "";
                let isOff = (String(s.offDays || "").includes(targetDateStandard) || String(dayStatus).toUpperCase().includes('OFF'));
                
                staffMap[sId] = {
                    id: sId, gender: s.gender, start: rawStart, end: rawEnd,
                    isStrictTime: (s.isStrictTime === true || String(s.isStrictTime).toUpperCase() === 'TRUE'), 
                    off: isOff
                };
                if (s.name) staffMap[s.name] = staffMap[sId];
            });
        }

        try {
            const result = CoreKernel.checkRequestAvailability(targetDateStandard, time, coreGuests, coreBookings, staffMap);
            return result.feasible 
                ? { valid: true, details: result.details, proposedUpdates: result.proposedUpdates, debug: result.debug } 
                : { valid: false, reason: result.reason, debug: result.debug };
        } catch (err) {
            console.error("Core Check Error:", err);
            return { valid: false, reason: "System Error: " + err.message };
        }
    };

    const forceGlobalRefresh = () => { if (typeof window.fetchDataAndRender === 'function') window.fetchDataAndRender(); else window.location.reload(); };

    // ==================================================================================
    // 4. COMPONENT: PHONE BOOKING MODAL (STANDARD)
    // ==================================================================================
    const NewAvailabilityCheckModal = ({ onClose, onSave, staffList, bookings, initialDate, editingBooking }) => {
        const safeStaffList = useMemo(() => staffList || [], [staffList]);
        const safeBookings = useMemo(() => bookings || [], [bookings]);

        const [step, setStep] = useState('CHECK');
        const [checkResult, setCheckResult] = useState(null);
        const [suggestions, setSuggestions] = useState([]);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [isChecking, setIsChecking] = useState(false); 
        const [serverData, setServerData] = useState(null);

        const defaultService = (window.SERVICES_LIST && window.SERVICES_LIST.length > 0) ? window.SERVICES_LIST[2] : "Body Massage";
        const [form, setForm] = useState({ 
            date: initialDate || new Date().toISOString().slice(0, 10), 
            time: "12:00", pax: 1, custName: '', custPhone: '' 
        });
        const [guestDetails, setGuestDetails] = useState([{ service: defaultService, staff: '隨機', isOil: false }]);

        useEffect(() => {
            if (editingBooking) {
                let timeStr = "12:00"; let dateStr = initialDate;
                if (editingBooking.startTimeString) {
                    const parts = editingBooking.startTimeString.split(' ');
                    if (parts.length >= 2) { dateStr = parts[0].replace(/\//g, '-'); timeStr = parts[1].substring(0, 5); }
                }
                setForm({
                    date: dateStr, time: timeStr, pax: editingBooking.pax || 1,
                    custName: (editingBooking.customerName || "").split('(')[0].trim(),
                    custPhone: editingBooking.phone || ""
                });
                setGuestDetails([{
                    service: editingBooking.serviceName || defaultService,
                    staff: editingBooking.staffId || '隨機',
                    isOil: editingBooking.isOil || false
                }]);
            }
            fetchLiveServerData(true).then(data => { if (data) setServerData(data); });
        }, [editingBooking, initialDate, defaultService]);

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

            let freshData = await fetchLiveServerData(true);
            let serverBookingsList = freshData ? freshData.bookings : (serverData?.bookings || []);
            let serverStaffList = freshData ? freshData.staff : (serverData?.staff || safeStaffList);
            let localBookingsList = safeBookings;
            let finalBookings = mergeBookingData(serverBookingsList, localBookingsList);

            if (editingBooking) { finalBookings = finalBookings.filter(b => b.rowId !== editingBooking.rowId); }
            
            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, finalBookings, serverStaffList);
            
            if (res.valid) { 
                setCheckResult({ status: 'OK', message: "✅ 此時段可預約 (Available)", coreDetails: res.details, debug: res.debug }); 
            } else {
                setCheckResult({ status: 'FAIL', message: res.reason, debug: res.debug });
                const found = [];
                const parts = form.time.split(':').map(Number);
                let currMins = (parts[0]||0)*60 + (parts[1]||0);
                for (let i=1; i<=24; i++) {
                    let nM = currMins + (i*10); let h = Math.floor(nM/60); let m = nM%60; if(h>=24) h-=24;
                    let tStr = `${String(h).padStart(2,'0')}:${String(Math.floor(m/10)*10).padStart(2,'0')}`;
                    if (callCoreAvailabilityCheck(form.date, tStr, guestDetails, finalBookings, serverStaffList).valid) {
                        found.push(tStr); if(found.length>=4) break;
                    }
                }
                setSuggestions(found);
            }
            setIsChecking(false);
        };

        // [V112.0] UPDATED: HANDLE FINAL SAVE WITH FULL DATA SYNC
        const handleFinalSave = async (e) => {
            if (e) e.preventDefault(); if (isSubmitting) return;
            if (!form.custName.trim()) { alert("⚠️ 請輸入顧客姓名 (Enter Name)!"); return; }
            setIsSubmitting(true);
            try {
                let checkBookings = mergeBookingData(serverData?.bookings || [], safeBookings);
                if (editingBooking) checkBookings = checkBookings.filter(b => b.rowId !== editingBooking.rowId);
                const finalCheck = callCoreAvailabilityCheck(form.date, form.time, guestDetails, checkBookings, serverData?.staff || safeStaffList);
                
                if (!finalCheck.valid) {
                     alert("⚠️ 數據已變更，無法預約: " + finalCheck.reason);
                     setIsSubmitting(false);
                     return;
                }

                // [V112] MAP DATA FOR SHEET COLUMNS (L -> AE)
                const detailedGuests = guestDetails.map((g, i) => {
                    const detail = finalCheck.details ? finalCheck.details.find(d => d.guestIndex === i) : null;
                    return {
                        ...g, 
                        // Find Code (Important for Column U)
                        serviceCode: getServiceCodeByName(g.service) || "",
                        staff: g.staff, 
                        flow: detail ? detail.flow : 'FB',          
                        flowCode: detail ? detail.flow : 'FB',      
                        phase1_duration: detail ? detail.phase1_duration : null,
                        phase2_duration: detail ? detail.phase2_duration : null,
                    };
                });
                
                const oils = detailedGuests.map((g,i)=>g.isOil?`K${i+1}:精油`:null).filter(Boolean);
                const flows = detailedGuests.map((g, i) => {
                    if (g.flow === 'BF') return `K${i+1}:先做身體`; 
                    if (g.flow === 'FB') return `K${i+1}:先做腳`;   
                    return null;
                }).filter(Boolean);
                const noteParts = [...oils, ...flows];
                const noteStr = noteParts.length > 0 ? `(${noteParts.join(', ')})` : "";

                // [V112] FULL PAYLOAD
                const payload = {
                    hoTen: form.custName, sdt: form.custPhone||"", dichVu: detailedGuests.map(g=>g.service).join(','), pax: form.pax,
                    ngayDen: normalizeDateStrict(form.date), // V111 Strict
                    gioDen: form.time,
                    // Primary Guest Info (for standard columns)
                    nhanVien: detailedGuests[0].staff, 
                    isOil: detailedGuests[0].isOil,
                    // Service Code (Column U)
                    serviceCode: detailedGuests[0].serviceCode, 

                    // Additional Staff (Columns M, N...)
                    staffId2: detailedGuests[1]?.staff||null, staffId3: detailedGuests[2]?.staff||null,
                    staffId4: detailedGuests[3]?.staff||null, staffId5: detailedGuests[4]?.staff||null, staffId6: detailedGuests[5]?.staff||null,
                    
                    ghiChu: noteStr, 
                    guestDetails: detailedGuests, 
                    
                    // Matrix Data (Column AA, Y, Z)
                    mainFlow: detailedGuests[0].flowCode, 
                    phase1_duration: detailedGuests[0].phase1_duration, 
                    phase2_duration: detailedGuests[0].phase2_duration,
                    
                    proposedUpdates: finalCheck.proposedUpdates || [],
                    rowId: editingBooking ? editingBooking.rowId : null
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
                    <div className={`${editingBooking ? 'bg-orange-600' : 'bg-[#0891b2]'} p-4 text-white flex justify-between items-center shrink-0`}>
                        <h3 className="font-bold text-lg">{editingBooking ? "✏️ 修改預約 (Edit)" : "📅 電話預約 (Booking V112.1)"}</h3>
                        <button onClick={onClose} className="text-2xl hover:text-red-100">&times;</button>
                    </div>
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {step==='CHECK' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold text-gray-500">日期 (Date)</label><input type="date" className="w-full border p-2 rounded font-bold h-[42px]" value={form.date} onChange={e=>{setForm({...form,date:e.target.value});setCheckResult(null);}}/></div>
                                    <div><label className="text-xs font-bold text-gray-500">時間 (Time)</label>
                                    <div className="flex items-center gap-1"><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cH} onChange={e=>handleTimeChange('HOUR',e.target.value)}>{HOURS_LIST.map(h=><option key={h} value={h}>{h}</option>)}</select></div><span className="font-bold">:</span><div className="relative flex-1"><select className="w-full border p-2 rounded font-bold h-[42px] text-center bg-white" value={cM} onChange={e=>handleTimeChange('MINUTE',e.target.value)}>{MINUTES_STEP.map(m=><option key={m} value={m}>{m}</option>)}</select></div></div></div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">人數 (Pax)</label><select className="w-full border p-2 rounded font-bold text-center h-[42px]" value={form.pax} onChange={e=>handlePaxChange(e.target.value)}>{paxOptions.map(n=><option key={n} value={n}>{n} 位</option>)}</select></div>
                                <div className="bg-slate-50 p-3 rounded border space-y-2"><div className="text-xs font-bold text-gray-400">詳細需求 (Details)</div>
                                    {guestDetails.map((g,i)=>(
                                        <div key={i} className="flex gap-2 items-center"><div className="w-6 h-10 rounded bg-gray-200 flex items-center justify-center font-bold text-sm">#{i+1}</div>
                                        <select className="flex-[2] border p-2 rounded font-bold text-sm h-10" value={g.service} onChange={e=>handleGuestUpdate(i,'service',e.target.value)}>{(window.SERVICES_LIST||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>
                                        <select className="flex-1 border p-2 rounded font-bold text-sm h-10" value={(g.staff==='女'&&g.isOil)?'FEMALE_OIL':g.staff} onChange={e=>handleGuestUpdate(i,'staff',e.target.value)}><option value="隨機">🎲 隨機</option><option value="女">🚺 女師</option><option value="FEMALE_OIL">🚺+油</option><option value="男">🚹 男師</option><optgroup label="技師">{safeStaffList.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</optgroup></select></div>
                                    ))}
                                </div>
                                <div>
                                    {!checkResult ? 
                                        <button onClick={performCheck} disabled={isChecking} className={`w-full text-white p-3 rounded font-bold shadow-lg flex justify-center items-center ${isChecking ? 'bg-gray-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                                            {isChecking ? "🔄 正在同步數據 (Syncing Data)..." : "🔍 查詢空位 (Strict Mode)"}
                                        </button> 
                                        : 
                                        <div className="space-y-3">
                                            <div className={`p-3 rounded text-center font-bold text-sm border-2 ${checkResult.status==='OK'?'bg-green-100 text-green-700 border-green-300':'bg-red-50 text-red-700 border-red-200'}`}>{checkResult.message}</div>
                                            
                                            {/* SYSTEM AUDIT VISIBILITY */}
                                            {checkResult.debug && (
                                                <div className="bg-gray-100 p-2 rounded text-xs font-mono text-gray-600 border border-gray-300">
                                                    <div className="font-bold border-b border-gray-300 pb-1 mb-1">🛠 系統稽核 (AUDIT) - {checkResult.debug.time}</div>
                                                    <div className="mb-1 text-blue-600">📅 查詢日期: {checkResult.debug.queryDate}</div>
                                                    <div className="grid grid-cols-3 gap-1">
                                                        <span>👥 執行中: {checkResult.debug.guestsRunning}</span>
                                                        <span>🛏 床位: {checkResult.debug.usedBeds}/{checkResult.debug.maxBeds}</span>
                                                        <span>🪑 座椅: {checkResult.debug.usedChairs}/{checkResult.debug.maxChairs}</span>
                                                    </div>
                                                </div>
                                            )}

                                            {checkResult.status==='FAIL'&&suggestions.length>0&&(<div className="bg-yellow-50 p-3 rounded border border-yellow-200"><div className="text-xs font-bold text-yellow-700 mb-2">💡 建議時段 (Suggestions):</div><div className="flex gap-2 flex-wrap">{suggestions.map(t=><button key={t} onClick={()=>{setForm(f=>({...f,time:t}));setCheckResult(null);setSuggestions([]);}} className="px-3 py-1 bg-white border border-yellow-300 text-yellow-800 rounded font-bold hover:bg-yellow-100">{t}</button>)}</div></div>)}
                                            {checkResult.status==='OK'?<button onClick={()=>setStep('INFO')} className="w-full bg-emerald-600 text-white p-3 rounded font-bold shadow-lg animate-pulse hover:bg-emerald-700">➡️ 下一步 (Next)</button>:<button onClick={()=>{setCheckResult(null);setSuggestions([])}} className="w-full bg-gray-400 text-white p-3 rounded font-bold hover:bg-gray-500">🔄 重新選擇 (Retry)</button>}
                                        </div>
                                    }
                                </div>
                            </>
                        )}
                        {step==='INFO' && (
                            <div className="space-y-4 animate-slideIn">
                                <div className="bg-green-50 p-3 rounded border border-green-200 text-green-800 font-bold">
                                    <div className="flex justify-between border-b border-green-200 pb-2 mb-2"><span>{form.date}</span><span>{form.time}</span></div>
                                    <div className="text-sm font-normal space-y-1">
                                        {checkResult && checkResult.coreDetails && checkResult.coreDetails.map((d, i) => (
                                            <div key={i} className="flex justify-between items-center bg-white p-1 rounded border border-green-100">
                                                <span>#{i+1} {d.service}</span>
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex gap-1">
                                                        <span className="bg-green-100 px-2 py-0.5 rounded text-green-700 text-xs font-bold">{d.staff}</span>
                                                        {d.flow === 'BF' && <span className="bg-orange-100 px-2 py-0.5 rounded text-orange-700 border border-orange-300 text-xs font-bold">⚠️ 先做身體</span>}
                                                        {d.flow === 'FB' && <span className="bg-blue-100 px-2 py-0.5 rounded text-blue-700 border border-blue-300 text-xs font-bold">🦶 先做腳</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div><label className="text-xs font-bold text-gray-500">顧客姓名 (Name)</label><input className="w-full border p-3 rounded font-bold outline-none" value={form.custName} onChange={e=>setForm({...form,custName:e.target.value})} placeholder="請輸入顧客姓名..." disabled={isSubmitting}/></div>
                                <div><label className="text-xs font-bold text-gray-500">電話號碼 (Phone)</label><input className="w-full border p-3 rounded font-bold outline-none" value={form.custPhone} onChange={e=>setForm({...form,custPhone:e.target.value})} placeholder="09xx..." disabled={isSubmitting}/></div>
                                <div className="flex gap-2 pt-2"><button onClick={(e)=>{e.preventDefault();if(!isSubmitting)setStep('CHECK');}} className="flex-1 bg-gray-200 p-3 rounded font-bold text-gray-700 hover:bg-gray-300" disabled={isSubmitting}>⬅️ 返回 (Back)</button><button onClick={handleFinalSave} className="flex-1 bg-indigo-600 text-white p-3 rounded font-bold shadow-xl hover:bg-indigo-700" disabled={isSubmitting}>{isSubmitting?"處理中...": (editingBooking ? "💾 保存修改 (Save)" : "✅ 確認預約 (Confirm)")}</button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================================================================================
    // 5. COMPONENT: WALK-IN MODAL (REMOVED)
    // ==================================================================================
    // ❌ [WALK-IN FEATURE REMOVED PER REQUEST V112.2]
    // The NewWalkInModal component has been completely deleted to disable the "Khách vãng lai" feature.
    // Logic for walk-in guests is no longer handled by this file.

    // ==================================================================================
    // 6. SYSTEM INJECTION (AUTO UPGRADE)
    // ==================================================================================
    const overrideInterval = setInterval(() => {
        // Chỉ inject AvailabilityCheckModal (Đặt lịch điện thoại/Sửa)
        if (window.AvailabilityCheckModal !== NewAvailabilityCheckModal) { 
            window.AvailabilityCheckModal = NewAvailabilityCheckModal; 
            console.log("♻️ AvailabilityModal Injected (V112.2)"); 
        }
        
        // ❌ [REMOVED] WalkInModal injection is disabled.
        // if (window.WalkInModal !== NewWalkInModal) { ... } -> DELETED
    }, 200);
    setTimeout(() => { clearInterval(overrideInterval); }, 5000);

})();
async function updateBookingGroupAtomic(groupUpdates) {
    if (!groupUpdates || groupUpdates.length === 0) return true;
    try {
        const dataToUpdate = [];
        const originalBookings = STATE.cachedBookings;
        let simulatedBookings = originalBookings.map(b => ({...b}));

        // Remove the 4 people from simulatedBookings so they don't block each other
        const groupIds = groupUpdates.map(g => String(g.rowId));
        const otherBookings = simulatedBookings.filter(b => !groupIds.includes(String(b.rowId)));

        const guestList = [];
        const dateStr = groupUpdates[0].updatedData.ngayDen || simulatedBookings.find(b => String(b.rowId) === groupIds[0])?.opDate;
        const timeStr = groupUpdates[0].updatedData.gioDen || simulatedBookings.find(b => String(b.rowId) === groupIds[0])?.startTimeString;
        const targetLocation = groupUpdates[0].updatedData.location || '本館'; // Assuming location logic

        for (const update of groupUpdates) {
            const b = simulatedBookings.find(x => String(x.rowId) === String(update.rowId));
            if (!b) continue;

            const dichVu = update.updatedData.dichVu || b.serviceName;
            let sCode = update.updatedData.serviceCode || smartFindServiceCode(dichVu);

            let flow = update.updatedData.flow;
            if (flow === undefined) flow = b.flow;
            if (!flow || flow.trim() === '') {
                flow = typeof ResourceCore !== 'undefined' && ResourceCore.inferFlowFromService 
                    ? ResourceCore.inferFlowFromService(sCode || null, null)
                    : 'BODYSINGLE';
                update.updatedData.flow = flow;
            }
            
            let phase1_dur = update.updatedData.phase1_duration !== undefined ? update.updatedData.phase1_duration : b.phase1_duration;
            let phase2_dur = update.updatedData.phase2_duration !== undefined ? update.updatedData.phase2_duration : b.phase2_duration;
            let duration = update.updatedData.duration !== undefined ? update.updatedData.duration : b.duration;

            guestList.push({
                serviceCode: sCode,
                serviceName: dichVu,
                service: dichVu,
                staffName: update.updatedData.nhanVien || b.requestedStaff || '隨機',
                staff: update.updatedData.nhanVien || b.requestedStaff || '隨機',
                isYouTui: update.updatedData.isYouTui !== undefined ? update.updatedData.isYouTui : b.isYouTui,
                isGuaSha: update.updatedData.isGuaSha !== undefined ? update.updatedData.isGuaSha : b.isGuaSha,
                isHuaGuan: update.updatedData.isHuaGuan !== undefined ? update.updatedData.isHuaGuan : b.isHuaGuan,
                isBaGuan: update.updatedData.isBaGuan !== undefined ? update.updatedData.isBaGuan : b.isBaGuan,
                rowId: update.rowId,
                originalBooking: b,
                forcedFlow: flow,
                flow: flow,
                flowCode: flow,
                duration: duration,
                phase1_duration: phase1_dur,
                phase2_duration: phase2_dur
            });
        }

        // Call CoreAPI to find best elastic fit for the whole group simultaneously
        const checkResult = typeof ResourceCore !== 'undefined' && ResourceCore.checkRequestAvailability
            ? ResourceCore.checkRequestAvailability(normalizeDateStrict(dateStr), timeStr, guestList, otherBookings, STATE.STAFF_LIST, { location: targetLocation })
            : { feasible: true, details: guestList.map(g => ({ 
                phase1_duration: g.originalBooking.phase1_duration, 
                phase2_duration: g.originalBooking.phase2_duration, 
                phase1_res_idx: g.originalBooking.phase1_res_idx, 
                phase2_res_idx: g.originalBooking.phase2_res_idx, 
                staffName: g.staffName, 
                total_duration: g.originalBooking.duration 
            })) };

        if (!checkResult.feasible) {
            throw new Error('群組排程衝突，請確認時段或修改服務。 ' + (checkResult.reason || ''));
        }

        // Map the result back to each member's updatedData
        for (let i = 0; i < checkResult.details.length; i++) {
            const mappedRes = checkResult.details[i];
            const originalUpdate = groupUpdates.find(g => String(g.rowId) === String(guestList[i].rowId));
            if (originalUpdate) {
                if (mappedRes.phase1_duration) originalUpdate.updatedData.phase1_duration = mappedRes.phase1_duration;
                if (mappedRes.phase2_duration !== undefined) originalUpdate.updatedData.phase2_duration = mappedRes.phase2_duration;
                if (mappedRes.phase1_res_idx) originalUpdate.updatedData.phase1_res_idx = mappedRes.phase1_res_idx;
                if (mappedRes.phase2_res_idx) originalUpdate.updatedData.phase2_res_idx = mappedRes.phase2_res_idx;
                if (mappedRes.transition_time) originalUpdate.updatedData.transition_time = mappedRes.transition_time;
                if (mappedRes.staffName) originalUpdate.updatedData.nhanVien = mappedRes.staffName;
                if (mappedRes.total_duration) originalUpdate.updatedData.duration = mappedRes.total_duration;
                if (mappedRes.flow) originalUpdate.updatedData.flow = mappedRes.flow;
            }
        }

        for (const update of groupUpdates) {
            const rowId = update.rowId;
            const updatedData = update.updatedData;
            
            const getRes = await sheets.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: `${BOOKING_SHEET_NAME}!A${rowId}:AX${rowId}`
            });
            let row = (getRes.data.values && getRes.data.values[0]) ? [...getRes.data.values[0]] : [];
            while (row.length < 50) row.push("");

            const formattedDate = normalizeDateStrict(updatedData.ngayDen) || row[1];
            let timeVal = updatedData.gioDen || row[2];
            if (timeVal.length > 5) timeVal = timeVal.substring(0, 5);

            if (updatedData.ngayDen !== undefined) row[0] = formattedDate;
            if (updatedData.gioDen !== undefined) row[1] = timeVal;
            if (updatedData.hoTen !== undefined) row[2] = updatedData.hoTen;
            if (updatedData.sdt !== undefined) row[3] = updatedData.sdt;

            let isYouTui = updatedData.isYouTui !== undefined ? updatedData.isYouTui : (row[5] === "Yes");
            row[5] = isYouTui ? "Yes" : "";

            if (updatedData.isGuaSha !== undefined) row[6] = updatedData.isGuaSha ? "Yes" : "";
            if (updatedData.isHuaGuan !== undefined) row[7] = updatedData.isHuaGuan ? "Yes" : "";
            if (updatedData.isBaGuan !== undefined) row[8] = updatedData.isBaGuan ? "Yes" : "";
            if (updatedData.trangThai !== undefined) row[9] = updatedData.trangThai;
            if (updatedData.nhanVien !== undefined) row[10] = updatedData.nhanVien;

            let sCode = null;
            if (updatedData.dichVu !== undefined) {
                let svcName = updatedData.dichVu;
                if (isYouTui && !svcName.includes("油推")) {
                    svcName += getOilSuffixText();
                }
                row[4] = svcName;

                sCode = updatedData.serviceCode;
                if (!sCode) {
                    sCode = smartFindServiceCode(updatedData.dichVu);
                }
                row[24] = sCode;

                if (sCode && STATE.SERVICES[sCode]) {
                    const svcDef = STATE.SERVICES[sCode];
                    let newPrice = svcDef.price || 0;
                    if (isYouTui) {
                        if (sCode === 'B1') newPrice += 100;
                        else newPrice += 200;
                    }
                    row[18] = newPrice;
                    if (svcDef.blocks) {
                        row[15] = "'" + svcDef.blocks;
                    }
                    if (svcDef.category === 'COMBO') {
                        row[34] = 'COMBO';
                    } else if (svcDef.category === 'FOOT') {
                        row[34] = 'CHAIR';
                    } else if (svcDef.category === 'BODY') {
                        row[34] = 'BED';
                    }
                }
            } else {
                sCode = row[24];
            }

            if (updatedData.phase1_duration !== undefined) row[28] = updatedData.phase1_duration;
            if (updatedData.phase2_duration !== undefined) row[30] = updatedData.phase2_duration;
            if (updatedData.phase1_res_idx !== undefined) row[32] = updatedData.phase1_res_idx;
            if (updatedData.phase2_res_idx !== undefined) row[33] = updatedData.phase2_res_idx;
            if (updatedData.flow !== undefined) row[25] = updatedData.flow;

            let parsedColB = row[1];
            if (parsedColB) {
                if (parsedColB.includes(' ')) parsedColB = parsedColB.split(' ')[1];
                if (parsedColB.length > 5) parsedColB = parsedColB.substring(0, 5);
                row[27] = parsedColB;
                
                const startMins = typeof ResourceCore !== 'undefined' ? ResourceCore.getMinsFromTimeStr(parsedColB) : -1;
                if (startMins !== -1) {
                    let p1Dur = parseInt(row[28]) || 0;
                    let p2Dur = parseInt(row[30]) || 0;
                    let finalFlow = row[25] || "FB";
                    const isCombo = (finalFlow === 'FB' || finalFlow === 'BF');
                    const transitionBuffer = isCombo ? (typeof ResourceCore !== 'undefined' && ResourceCore.CONFIG ? ResourceCore.CONFIG.TRANSITION_BUFFER : 3) : 0;
                    
                    if (isCombo) {
                        row[29] = typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + transitionBuffer) : "";
                    } else {
                        row[29] = "";
                    }
                    row[31] = typeof ResourceCore !== 'undefined' ? ResourceCore.getTimeStrFromMins(startMins + p1Dur + p2Dur + transitionBuffer) : "";
                }
            }

            if (updatedData.duration !== undefined) row[45] = updatedData.duration;

            dataToUpdate.push({
                range: `${BOOKING_SHEET_NAME}!A${rowId}:AX${rowId}`,
                values: [row]
            });
        }

        if (dataToUpdate.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SHEET_ID,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: dataToUpdate
                }
            });

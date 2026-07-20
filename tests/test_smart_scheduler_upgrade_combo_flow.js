const testSmartComboUpgrade = () => {
    // 1. Mock Context
    let row = Array(50).fill("");
    const bookingData = {
        rowId: "123",
        serviceName: "腳底按摩 (90分)",
        serviceCode: "F3",
        phase1_res_idx: "腳1-3",
        flow: "FOOTSINGLE",
        category: "FOOT"
    };

    const updatedData = {
        dichVu: "套餐 (100分)",
        flow: "BF", // Frontend proposed BF because beds are full at Phase 2
        phase1_duration: 50,
        phase2_duration: 50
    };

    const svcDef = {
        category: 'COMBO',
        name: '套餐 (100分)',
        duration: 100
    };

    let bestPhase1 = bookingData.phase1_res_idx;
    let bestPhase2 = "";
    let newFlow = "FOOTSINGLE";
    let phase1_dur = 50;
    let phase2_dur = 50;
    let duration = 100;
    
    // Simulating _checkOverlapConflict returning false (no conflict for any new resource we find)
    let checkedConflicts = [];
    const _checkOverlapConflict = (rowId, opDate, opTime, duration, p1, p2, p1_dur, p2_dur, flow) => {
        checkedConflicts.push({p1, p2});
        return false;
    };
    const getConfig = () => ({ SCALE: { MAX_BEDS: 12, MAX_CHAIRS: 12 } });
    
    const formattedDate = "2026/07/20";
    const timeVal = "12:00";
    const rowId = "123";
    const oldCategory = 'FOOT';
    const isComboUpgrade = true;

    // 2. The Logic to Test
    try {
        if (isComboUpgrade && bestPhase1 && oldCategory !== 'COMBO') {
            bestPhase2 = "";
            let isP1Chair = bestPhase1.toUpperCase().includes('CHAIR') || bestPhase1.includes('足') || bestPhase1.includes('腳');
            let isP1Bed = bestPhase1.toUpperCase().includes('BED') || bestPhase1.includes('床');
            
            if (updatedData.flow) {
                newFlow = updatedData.flow;
                row[25] = newFlow;
            } else {
                if (isP1Chair) {
                    newFlow = 'FB';
                    row[25] = newFlow;
                } else if (isP1Bed) {
                    newFlow = 'BF';
                    row[25] = newFlow;
                    const temp = row[28]; row[28] = row[30]; row[30] = temp;
                    phase1_dur = row[28]; phase2_dur = row[30];
                }
            }

            if (newFlow === 'FB' && isP1Bed) {
                bestPhase2 = bestPhase1;
                bestPhase1 = ""; 
            } else if (newFlow === 'BF' && isP1Chair) {
                bestPhase2 = bestPhase1;
                bestPhase1 = ""; 
            }

            const opDate = updatedData.ngayDen !== undefined ? formattedDate : (bookingData.opDate || bookingData.startTimeString);
            const opTime = updatedData.gioDen !== undefined ? timeVal : (bookingData.startTimeString || bookingData.startTime);
            
            let isFindingP1 = !bestPhase1;
            let targetResType = isFindingP1 ? (newFlow === 'BF' ? 'BED' : 'CHAIR') : (newFlow === 'FB' ? 'BED' : 'CHAIR');
            
            let targetLocation = updatedData.location !== undefined ? updatedData.location : (bookingData ? (bookingData.location || '本館') : '本館');
            let locPrefix = targetLocation === '對面館' ? '2' : '1';
            const config = getConfig();
            let maxCount = targetResType === 'BED' ? (config.SCALE.MAX_BEDS || 12) : (config.SCALE.MAX_CHAIRS || 12);
            
            let foundMissing = false;
            for (let i = 1; i <= maxCount; i++) {
                let testRes = `${targetResType}-${locPrefix}-${i}`;
                let testP1 = isFindingP1 ? testRes : null;
                let testP2 = isFindingP1 ? null : testRes;
                
                const conflict = _checkOverlapConflict(rowId, opDate, opTime, duration, testP1, testP2, phase1_dur, phase2_dur, newFlow);
                if (!conflict) {
                    if (isFindingP1) bestPhase1 = testRes;
                    else bestPhase2 = testRes;
                    foundMissing = true;
                    break;
                }
            }

            if (!foundMissing && !updatedData.ignoreOverlap) {
                throw new Error("⚠️ 更改失敗：該時段已無空床位/座位可供套餐使用。");
            }
        }
    } catch (e) {
        console.error("Error occurred:", e);
        process.exit(1);
    }

    // 3. Verify Results
    console.log("=== KẾT QUẢ TEST LOGIC COMBO UPGRADE MỚI ===");
    console.log(`newFlow expected 'BF', got '${newFlow}'`);
    console.log(`bestPhase1 expected 'BED-1-1' (new bed), got '${bestPhase1}'`);
    console.log(`bestPhase2 expected '腳1-3' (old chair), got '${bestPhase2}'`);
    console.log(`_checkOverlapConflict p1: ${checkedConflicts[0].p1}, p2: ${checkedConflicts[0].p2}`);

    if (newFlow === 'BF' && bestPhase1 === 'BED-1-1' && bestPhase2 === '腳1-3') {
        console.log("✅ TEST PASSED: Hệ thống đã xử lý đổi ghế thông minh thành công!");
        process.exit(0);
    } else {
        console.log("❌ TEST FAILED: Logic chưa chính xác.");
        process.exit(1);
    }
};

testSmartComboUpgrade();

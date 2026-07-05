function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null, svcDef = null, flow = 'FB', includeOutOfBounds = false) {
            if (customLockedPhase1 !== null && customLockedPhase1 !== undefined && !isNaN(customLockedPhase1)) {
                return [{ p1: parseInt(customLockedPhase1), p2: totalDuration - parseInt(customLockedPhase1), deviation: 999, shiftMins: 0 }];
            }
            const standardHalf = Math.floor(totalDuration / 2);
            let options = [];
            
            let strictMinP1 = 15, strictMaxP1 = totalDuration - 15;
            let strictMinP2 = 15, strictMaxP2 = totalDuration - 15;

            const isBF = (flow === 'BF');
            if (svcDef) {
                if (isBF) {
                    if (svcDef.minBody) strictMinP1 = Math.max(strictMinP1, svcDef.minBody);
                    if (svcDef.maxBody) strictMaxP1 = Math.min(strictMaxP1, svcDef.maxBody);
                    if (svcDef.minFoot) strictMinP2 = Math.max(strictMinP2, svcDef.minFoot);
                    if (svcDef.maxFoot) strictMaxP2 = Math.min(strictMaxP2, svcDef.maxFoot);
                } else {
                    if (svcDef.minFoot) strictMinP1 = Math.max(strictMinP1, svcDef.minFoot);
                    if (svcDef.maxFoot) strictMaxP1 = Math.min(strictMaxP1, svcDef.maxFoot);
                    if (svcDef.minBody) strictMinP2 = Math.max(strictMinP2, svcDef.minBody);
                    if (svcDef.maxBody) strictMaxP2 = Math.min(strictMaxP2, svcDef.maxBody);
                }
            }

            let lowerBoundP1 = Math.max(strictMinP1, totalDuration - strictMaxP2);
            let upperBoundP1 = Math.min(strictMaxP1, totalDuration - strictMinP2);

            // [BẢN VÁ LỖI]: Áp dụng thuật toán co giãn thời gian (Elastic Time) nếu có limit
            if (limit > 0) {
                const flexLower = standardHalf - limit;
                const flexUpper = standardHalf + limit;
                // Mở rộng biên độ dựa theo limit cấu hình từ trước (vd: 70/30)
                // nhưng vẫn đảm bảo an toàn tuyệt đối (không nhỏ hơn 15 phút)
                lowerBoundP1 = Math.min(lowerBoundP1, Math.max(15, flexLower));
                upperBoundP1 = Math.max(upperBoundP1, Math.min(totalDuration - 15, flexUpper));
            }

            let scanMinP1 = includeOutOfBounds ? 15 : lowerBoundP1;
            let scanMaxP1 = includeOutOfBounds ? (totalDuration - 15) : upperBoundP1;

            let p2_standard = totalDuration - standardHalf;
            
            const addOption = (p1) => {
                let p2 = totalDuration - p1;
                let shiftMins = 0;
                if (p1 > upperBoundP1) shiftMins = p1 - upperBoundP1;
                else if (p1 < lowerBoundP1) shiftMins = p1 - lowerBoundP1;
                
                if (!includeOutOfBounds && shiftMins !== 0) return;
                
                options.push({ p1: p1, p2: p2, deviation: Math.abs(p1 - standardHalf), shiftMins: shiftMins });
            };

            addOption(standardHalf);

            let realStep = step > 0 ? step : 5;

            if (isBF) {
                for (let p1 = scanMaxP1; p1 >= scanMinP1; p1 -= realStep) {
                    if (p1 === standardHalf) continue;
                    addOption(p1);
                }
            } else {
                for (let p1 = scanMinP1; p1 <= scanMaxP1; p1 += realStep) {
                    if (p1 === standardHalf) continue;
                    addOption(p1);
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
            if (uniqueOptions.length === 0) uniqueOptions.push({ p1: standardHalf, p2: p2_standard, deviation: 0, shiftMins: 0 });
            return uniqueOptions;
        }
const svcDef = { minFoot: 30, maxFoot: 40, minBody: 60, maxBody: 70 };
const res = generateElasticSplits(100, 5, 30, null, svcDef, 'BF', true);
console.log(res);
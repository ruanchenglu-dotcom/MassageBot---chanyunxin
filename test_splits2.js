function generateElasticSplits(totalDuration, step = 0, limit = 0, customLockedPhase1 = null, svcDef = null, flow = 'FB') {
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
    let p2_standard = totalDuration - standardHalf;
    if (standardHalf >= minP1 && standardHalf <= maxP1 && p2_standard >= minP2 && p2_standard <= maxP2) {
        options.push({ p1: standardHalf, p2: p2_standard, deviation: 0 });
    }
    for (let currentDeviation = -limit; currentDeviation <= limit; currentDeviation += step) {
        if (currentDeviation === 0) continue;
        let p1_A = standardHalf + currentDeviation;
        let p2_A = totalDuration - p1_A;
        if (p1_A >= minP1 && p1_A <= maxP1 && p2_A >= minP2 && p2_A <= maxP2) {
            options.push({ p1: p1_A, p2: p2_A, deviation: currentDeviation });
        }
    }
    return options;
}
const svc = { elasticStep: 1, elasticLimit: 30, minFoot: 30, maxFoot: 70, minBody: 30, maxBody: 70 };
console.log(generateElasticSplits(100, 1, 30, null, svc, 'FB'));

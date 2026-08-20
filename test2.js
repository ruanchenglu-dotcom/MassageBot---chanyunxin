const normalizeStaffId = (id) => String(id || '').replace(/^0+/, '').trim().toUpperCase();

function run(staffList) {
    let targetDateStandard = '2026-08-20';
    const staffMap = {};
    if (Array.isArray(staffList)) {
        staffList.forEach(s => {
            const sId = normalizeStaffId(String(s.id).trim());
            const rawStart = s['上班'] || s.start || s.shiftStart || "00:00";
            const rawEnd = s['下班'] || s.end || s.shiftEnd || "00:00";
            const dayStatus = s[targetDateStandard] || s[targetDateStandard.replace(/\//g, '-')] || "";
            let isOff = (String(s.offDays || "").includes(targetDateStandard) || String(dayStatus).toUpperCase().includes('OFF') || String(dayStatus).toUpperCase() === 'X');
            staffMap[sId] = {
                id: sId, gender: s.gender, start: rawStart, end: rawEnd,
                isStrictTime: (s.isStrictTime === true || String(s.isStrictTime).toUpperCase() === 'TRUE'), off: isOff,
                offDays: s.offDays, customShifts: s.customShifts
            };
            if (s.name) staffMap[normalizeStaffId(String(s.name).trim())] = staffMap[sId];
        });
    }
    return staffMap;
}

let staffObj = {
    '王': { id: 'T2', name: '王', gender: 'M', start: '08:00', end: '20:00', off: false, offDays: [] }
};

console.log('If object:', run(staffObj));
console.log('If array:', run(Object.values(staffObj)));

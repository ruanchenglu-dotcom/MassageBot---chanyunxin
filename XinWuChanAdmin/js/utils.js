// CÁC HÀM HỖ TRỢ (UTILITY FUNCTIONS)

// Lấy thời lượng an toàn
window.getSafeDuration = (serviceName, fallbackDuration) => {
    if (!serviceName) return fallbackDuration || 60;
    if (window.SERVICES_DATA[serviceName]) return window.SERVICES_DATA[serviceName].duration;
    const key = window.SERVICES_LIST.find(k => serviceName.includes(k));
    if (key) return window.SERVICES_DATA[key].duration;
    return fallbackDuration || 60;
};

window.getTaipeiDate = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

window.getOperationalDateInputFormat = () => {
    const now = window.getTaipeiDate();
    if (now.getHours() < 8) {
        now.setDate(now.getDate() - 1);
    }
    return `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;
};

window.isWithinOperationalDay = (dateStr, timeStr, targetDateStr) => {
    if (!dateStr || !timeStr) return false;
    const opDateStr = targetDateStr ? targetDateStr.replace(/-/g, '/') : window.getOperationalDateInputFormat().replace(/-/g, '/');
    let d = new Date(dateStr); 
    if(isNaN(d.getTime())) d = new Date(dateStr.replace(/-/g, '/'));
    const bDateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
    const [h, m] = timeStr.split(':').map(Number);
    if (bDateStr === opDateStr && h >= 8) return true;
    const nextDay = new Date(opDateStr); nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = `${nextDay.getFullYear()}/${(nextDay.getMonth()+1).toString().padStart(2,'0')}/${nextDay.getDate().toString().padStart(2,'0')}`;
    if (bDateStr === nextDayStr && h < 8) return true;
    return false;
};

window.normalizeToTimelineMins = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    let totalMins = h * 60 + m;
    if (h < 8) totalMins += 24 * 60; 
    return totalMins;
};

window.getPrice = (n) => { 
    if(window.SERVICES_DATA[n]) return window.SERVICES_DATA[n].price;
    for(let k in window.SERVICES_DATA) if(n.includes(k)) return window.SERVICES_DATA[k].price;
    return 0; 
};

window.getOilPrice = (isOil) => isOil ? 200 : 0;

window.stringToColor = (str) => {
    if (!str) return '#cccccc';
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

window.getComboSplit = (duration, isMaxMode, sequence = 'FB') => {
    const dur = parseInt(duration);
    if (!dur) return { phase1: 0, phase2: 0, type1: '?', type2: '?' };
    
    let footTime = Math.floor(dur / 2);
    let bodyTime = dur - footTime;

    if (sequence === 'FB') return { phase1: footTime, phase2: bodyTime, type1: 'FOOT', type2: 'BODY' };
    else return { phase1: bodyTime, phase2: footTime, type1: 'BODY', type2: 'FOOT' };
};

window.getWeight = (id) => { 
    if (!id) return 9999;
    const num = parseInt(id.replace(/\D/g, '')); 
    return isNaN(num) ? 9000 + id.charCodeAt(0) : num; 
};

window.sortIdAsc = (a, b) => window.getWeight(a.id) - window.getWeight(b.id);
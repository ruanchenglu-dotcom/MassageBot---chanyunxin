
function normalizeDateStrict(input) {
    if (!input) return '';
    try {
        let dateObj;
        if (typeof input === 'object' && input instanceof Date) {
            dateObj = input;
        } else if (typeof input === 'string' && input.includes('T')) {
            dateObj = new Date(input);
        } else if (typeof input === 'number' && input > 40000) {
            dateObj = new Date(Math.round((input - 25569) * 86400 * 1000));
        } else {
            const dateString = input.toString().trim().replace(/-/g, '/');
            dateObj = new Date(dateString);
        }

        if (isNaN(dateObj.getTime())) return '';

        const taipeiTimeStr = dateObj.toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
        const taipeiDate = new Date(taipeiTimeStr);
        const y = taipeiDate.getFullYear();
        const m = String(taipeiDate.getMonth() + 1).padStart(2, '0');
        const d = String(taipeiDate.getDate()).padStart(2, '0');
        return y + '/' + m + '/' + d;
    } catch (e) {
        return input;
    }
}
console.log('Result 5:', normalizeDateStrict('29/07'));


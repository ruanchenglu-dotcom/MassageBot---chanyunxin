const fs = require('fs');
const file = 'C:/MassageBot - chanyunxin/XinWuChanAdmin/js/cyx_app.js';
let content = fs.readFileSync(file, 'utf8');

const target1 = "if (payloads && payloads.length > 0) {";
const idx1 = content.lastIndexOf(target1);
if (idx1 !== -1) {
    const endIdx = content.indexOf('universalSend', idx1);
    const replacement = `if (payloads && payloads.length > 0) {
                                if (window.simulateSwapOverlap && window.simulateSwapOverlap(activeBookings, payloads)) {
                                    Swal.fire('⚠️ 無法換位', '目標位置時段重疊，系統無法自動排程。請手動調整。', 'warning');
                                    return;
                                }
                                Swal.fire({ title: '系統處理中...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                                `;
    content = content.substring(0, idx1) + replacement + content.substring(endIdx);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Replaced in cyx_app.js!');
} else {
    console.log('Target not found!');
}

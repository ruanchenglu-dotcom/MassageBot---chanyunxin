const fs = require('fs');
const file = 'XinWuChanAdmin/js/cyx_app.js';
let content = fs.readFileSync(file, 'utf8');

const target = `            } else {
                Swal.fire('系統提示', "⚠️ 儲存失敗，請檢查網路連線。", 'warning');
            }`;

const replacement = `            } else if (errorMsg && (errorMsg.includes('⚠️') || errorMsg.includes('失敗') || errorMsg.includes('錯誤'))) {
                Swal.fire('系統提示', errorMsg, 'warning');
            } else {
                Swal.fire('系統提示', errorMsg || "⚠️ 儲存失敗，請檢查網路連線。", 'warning');
            }`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content);
    console.log("SUCCESS");
} else {
    console.log("TARGET NOT FOUND");
    // Try regex
    const regex = /\} else \{\s*Swal\.fire\('系統提示', "⚠️ 儲存失敗，請檢查網路連線。", 'warning'\);\s*\}/;
    if (regex.test(content)) {
        content = content.replace(regex, `} else if (errorMsg && (errorMsg.includes('⚠️') || errorMsg.includes('失敗') || errorMsg.includes('錯誤'))) {
                Swal.fire('系統提示', errorMsg, 'warning');
            } else {
                Swal.fire('系統提示', errorMsg || "⚠️ 儲存失敗，請檢查網路連線。", 'warning');
            }`);
        fs.writeFileSync(file, content);
        console.log("SUCCESS VIA REGEX");
    } else {
        console.log("REGEX FAILED TOO");
    }
}

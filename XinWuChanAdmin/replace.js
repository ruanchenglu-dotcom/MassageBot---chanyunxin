const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js/cyx_app.js');
let content = fs.readFileSync(filePath, 'utf8');

// replace alert("...") -> Swal.fire('系統提示', "...", 'warning')
// we have to handle both `alert(...)` and `alert(...)`
content = content.replace(/alert\((['"`])((?:(?!\1).|\\\1)*?)\1\)/g, "Swal.fire('系統提示', $1$2$1, 'warning')");

// Special replacements for confirm() inside arrow functions or blocks
content = content.replace(/if\s*\(\s*confirm\((['"`])(.*?)\1\)\s*\)\s*\{([\s\S]*?)\}/g, "Swal.fire({ title: '確認', text: $1$2$1, icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }).then((res) => { if (res.isConfirmed) { $3 } })");

// special one-liners
content = content.replace(/else if \(action === 'cancel'\) \{ if \(confirm\('確定將顧客從位置移除？'\)\) \{ const n = \{ \.\.\.resourceState \}; delete n\[id\]; updateResource\(n\); \} \}/g, "else if (action === 'cancel') { Swal.fire({ title: '確認', text: '確定將顧客從位置移除？', icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }).then(res => { if(res.isConfirmed) { const n = { ...resourceState }; delete n[id]; updateResource(n); } }) }");

content = content.replace(/\.catch\(\(\) => alert\((['"`])(.*?)\1\)\)/g, ".catch(() => Swal.fire('系統提示', $1$2$1, 'error'))");

// alert => Swal for error catches
content = content.replace(/\} catch \((.*?)\) \{ alert\((.*?)\); \}/g, "} catch ($1) { Swal.fire('系統提示', $2, 'error'); }");

// handle window.confirm or just confirm inside handleManualUpdateStatus
content = content.replace(/const handleManualUpdateStatus = async \(rowId, status\) => \{ if \(confirm\('確認更新狀態\?'\)\) \{ await axios\.post\('\/api\/update-status', \{ rowId, status \}\); fetchData\(\); \} \};/g, 
"const handleManualUpdateStatus = async (rowId, status) => { const res = await Swal.fire({ title: '確認', text: '確認更新狀態?', icon: 'warning', showCancelButton: true, confirmButtonText: '確定', cancelButtonText: '取消' }); if (res.isConfirmed) { await axios.post('/api/update-status', { rowId, status }); fetchData(); } };");

// Fix alert(`✅ 結帳成功: $${totalAmount}`); to success
content = content.replace(/Swal\.fire\('系統提示', (`✅ 結帳成功: \$\$\{totalAmount\}`), 'warning'\)/g, "Swal.fire('系統提示', $1, 'success')");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Replacements completed.');

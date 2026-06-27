const fs = require('fs');
let t = fs.readFileSync('c:/MassageBot - chanyunxin/XinWuChanAdmin/js/cyx_app.js', 'utf8');
t = t.replace(/p\.phase1_res_idx = newP1;\s*p\.phase2_res_idx = newP2;\s*p\.flow = isBed\(newP1\) \? 'BF' : 'FB';/g, `p.phase1_res_idx = newP1 ? String(newP1).toUpperCase() : "";\n                                    p.phase2_res_idx = newP2 ? String(newP2).toUpperCase() : "";\n                                    p.flow = isBed(newP1) ? 'BF' : 'FB';`);
fs.writeFileSync('c:/MassageBot - chanyunxin/XinWuChanAdmin/js/cyx_app.js', t);

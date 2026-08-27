const fs = require('fs');
let code = fs.readFileSync('XinWuChanAdmin/js/cyx_bookingHandler.js', 'utf8');
let lines = code.split('\n');

function checkBalance(startLine, endLine) {
    let open = 0;
    for(let i=startLine; i<=endLine; i++) {
        let l = lines[i] || '';
        let strOpen = false;
        let escape = false;
        for(let j=0; j<l.length; j++) {
            if (escape) { escape = false; continue; }
            if (l[j] === '\\') { escape = true; continue; }
            if (l[j]==='\"' || l[j]==='\'') strOpen = !strOpen;
            if (!strOpen && !l.trim().startsWith('//')) {
                if(l[j]==='{') open++;
                if(l[j]==='}') open--;
            }
        }
    }
    return open;
}

console.log('Balance from 353 (validateGlobalCapacity) to 1061:', checkBalance(97, 2024));

console.log('Balance 97 to 2024:', checkBalance(97, 2024));
for(let i=97; i<=2024; i++) { if (checkBalance(97, i) === 0 && i > 98) { console.log('Closed at', i); break; } }
console.log('Balance 97 to 1323:', checkBalance(97, 1323));
for(let i=1324; i<=2024; i++) { let b = checkBalance(1324, i); if (b < 0) { console.log('Extra } at', i); break; } }
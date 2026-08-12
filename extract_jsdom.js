const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const html = fs.readFileSync('page_dump.html', 'utf8');
const rootIdx = html.indexOf('<div id="root">');
if (rootIdx !== -1) {
    const dom = new JSDOM(html.substring(rootIdx));
    const buttons = dom.window.document.querySelectorAll('button');
    buttons.forEach((btn, i) => {
        if (btn.textContent.includes('儲存') || btn.textContent.includes('取消')) {
            console.log('Button ' + i + ': ' + btn.textContent.trim());
            console.log('  OuterHTML: ' + btn.outerHTML);
        }
    });
}

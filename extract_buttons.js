const fs = require('fs');
const html = fs.readFileSync('page_dump.html', 'utf8');
// Use a simple regex to find all <button ...>...</button>
const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
let match;
let i = 0;
while ((match = buttonRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text.includes('儲存') || text.includes('取消')) {
        console.log(`Button ${i}: ${text}`);
        console.log(`  HTML: ${fullTag.substring(0, 100)}...`);
    }
    i++;
}

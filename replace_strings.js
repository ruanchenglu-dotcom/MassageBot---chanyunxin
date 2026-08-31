const fs = require('fs');
const path = require('path');

const excludeDirs = ['node_modules', '.git', '.github'];
const includeExts = ['.js', '.html', '.json', '.md', '.txt', '.py', '.bat', '.ps1', '.css'];

function replaceInFile(filePath) {
    const ext = path.extname(filePath);
    if (!includeExts.includes(ext)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    // Replace exact matches of 秦始皇 and 秦始皇
    content = content.replace(/秦始皇/g, '秦始皇');
    content = content.replace(/秦始皇/g, '秦始皇');
    
    // Also replace 秦始皇 for safety
    content = content.replace(/秦始皇/g, '秦始皇');
    content = content.replace(/qinshihuang/g, 'qinshihuang');
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

function traverseDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            if (!excludeDirs.includes(file)) {
                traverseDir(fullPath);
            }
        } else {
            replaceInFile(fullPath);
        }
    }
}

traverseDir(__dirname);
console.log("Done!");

import io
with io.open('e2e_test_staff_count.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("const page = await browser.newPage();", "const page = await browser.newPage();\n    page.on('console', msg => console.log('PAGE LOG:', msg.text()));")

with io.open('e2e_test_staff_count.js', 'w', encoding='utf-8') as fout:
    fout.write(content)

with open(r'qinshihuang/js/cyx_views.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = '''                            const lastChairIndex = currentRows.reduce((acc, curr, idx) => curr.type === 'chair' ? idx : acc, -1);
                            const isLastChairRow = index === lastChairIndex;
                            const rowStyleClass = isLastChairRow ? "border-b-4 border-red-500" : "border-b border-slate-100";'''

new_logic = '''                            const isLastRow = index === currentRows.length - 1;
                            const rowStyleClass = isLastRow ? "border-b-4 border-red-500" : "border-b border-slate-100";'''

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    print("Replaced cyx_views.js successfully")
else:
    print("Could not find the target string in cyx_views.js")

with open(r'qinshihuang/js/cyx_views.js', 'w', encoding='utf-8') as f:
    f.write(content)

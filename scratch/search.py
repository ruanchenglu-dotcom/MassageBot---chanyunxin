import sys
with open(r'c:\MassageBot - chanyunxin\XinWuChanAdmin\js\cyx_views.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if '檢查通過' in line:
        for j in range(i-5, min(i+5, len(lines))):
            print(f'{j}: {lines[j].strip()}')
        print('---')

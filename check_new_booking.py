import io
with io.open('XinWuChanAdmin/js/cyx_views.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if '新增預約' in line:
        print(str(i+1) + ': ' + line.strip())

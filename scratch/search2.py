with open(r'c:\MassageBot - chanyunxin\XinWuChanAdmin\js\cyx_views.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with open(r'c:\MassageBot - chanyunxin\scratch\temp.txt', 'w', encoding='utf-8') as f:
    for i in range(1080, 1095):
        f.write(str(i) + ': ' + lines[i])

import io
with io.open('XinWuChanAdmin/js/cyx_app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i in range(770, 795):
    print(str(i+1) + ': ' + lines[i].strip())

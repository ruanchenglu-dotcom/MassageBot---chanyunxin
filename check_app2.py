import io
with io.open('XinWuChanAdmin/js/cyx_app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with io.open('temp_app.txt', 'w', encoding='utf-8') as fout:
    for i in range(770, 795):
        fout.write(str(i+1) + ': ' + lines[i])

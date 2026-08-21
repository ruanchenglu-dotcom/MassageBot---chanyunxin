import io
with io.open('XinWuChanAdmin/js/cyx_app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with io.open('temp_app_modal.txt', 'w', encoding='utf-8') as fout:
    for i in range(5400, 5450):
        if i < len(lines):
            fout.write(str(i+1) + ': ' + lines[i])

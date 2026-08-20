import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i in range(630, 670):
    if 'function ' in lines[i] or 'const ' in lines[i] and '=>' in lines[i]:
        print(str(i+1) + ': ' + lines[i].strip())

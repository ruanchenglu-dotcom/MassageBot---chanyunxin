import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i in range(2120, 2150):
    if 'CoreKernel' in lines[i] or 'return' in lines[i]:
        print(str(i+1) + ': ' + lines[i].strip())

import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with io.open('temp_call_core4.txt', 'w', encoding='utf-8') as fout:
    for i in range(2150, 2180):
        fout.write(str(i+1) + ': ' + lines[i])

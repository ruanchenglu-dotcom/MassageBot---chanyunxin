import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with io.open('temp_handlecheck_calls.txt', 'w', encoding='utf-8') as fout:
    for i in range(len(lines)):
        if 'handleCheck(' in lines[i] or 'handleCheck()' in lines[i]:
            fout.write(str(i+1) + ': ' + lines[i])

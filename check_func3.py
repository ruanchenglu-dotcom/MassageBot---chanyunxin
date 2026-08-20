import io
import subprocess
out = subprocess.check_output(['git', 'show', 'HEAD~2:XinWuChanAdmin/js/cyx_bookingHandler.js'])
lines = out.decode('utf-8', errors='ignore').splitlines()
with io.open('temp_out_func.txt', 'w', encoding='utf-8') as fout:
    for i in range(2027, 2150):
        fout.write(lines[i] + '\n')

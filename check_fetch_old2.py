import io
import subprocess
out = subprocess.check_output(['git', 'show', 'HEAD~2:XinWuChanAdmin/js/cyx_bookingHandler.js'])
lines = out.decode('utf-8', errors='ignore').splitlines()
with io.open('temp_fetch_old.txt', 'w', encoding='utf-8') as fout:
    for i, line in enumerate(lines):
        if 'const fetchLiveServerData = async' in line:
            for j in range(20):
                fout.write(lines[i+j] + '\n')
            break

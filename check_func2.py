import io
import subprocess
out = subprocess.check_output(['git', 'show', 'HEAD~2:XinWuChanAdmin/js/cyx_bookingHandler.js'])
lines = out.decode('utf-8', errors='ignore').splitlines()
for i in range(2080, 2110):
    print(lines[i])

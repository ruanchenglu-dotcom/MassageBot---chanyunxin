import subprocess
out = subprocess.check_output(['git', 'show', 'HEAD~2:XinWuChanAdmin/js/cyx_bookingHandler.js'])
lines = out.decode('utf-8', errors='ignore').splitlines()
for i, line in enumerate(lines):
    if 'CoreKernel.checkRequestAvailability' in line and 'locationStr' in line:
        for j in range(-25, 5):
            print(f"{i+j+1}: {lines[i+j].strip()}")
        break

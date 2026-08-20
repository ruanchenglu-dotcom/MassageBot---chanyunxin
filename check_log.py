import subprocess
out = subprocess.check_output(['git', 'log', '-p', '-2', 'XinWuChanAdmin/js/cyx_bookingHandler.js'])
lines = out.decode('utf-8', errors='ignore').splitlines()
for i, line in enumerate(lines):
    if 'let staffList = ' in line or 'let serverStaffList =' in line:
        for j in range(-5, 6):
            if i+j >= 0 and i+j < len(lines):
                print(lines[i+j])
        break

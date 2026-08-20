import subprocess
out = subprocess.check_output(['git', 'grep', '-n', 'serverStaffList', 'HEAD~2', 'XinWuChanAdmin/js/cyx_bookingHandler.js'])
lines = out.decode('utf-8', errors='ignore').splitlines()
for line in lines:
    print(line)

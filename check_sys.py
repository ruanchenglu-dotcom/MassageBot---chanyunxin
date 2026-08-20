import subprocess
out = subprocess.check_output(['git', 'grep', '-n', 'SYSTEM_DATA', 'XinWuChanAdmin/js/cyx_app.js'])
lines = out.decode('utf-8', errors='ignore').splitlines()
for line in lines:
    print(line)

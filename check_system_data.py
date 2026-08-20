import subprocess
out = subprocess.check_output(['git', 'grep', '-n', 'window.SYSTEM_DATA.staff', 'XinWuChanAdmin/js/'])
lines = out.decode('utf-8', errors='ignore').splitlines()
for line in lines:
    print(line)

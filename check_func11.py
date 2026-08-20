import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i in range(2130, 2180):
    if 'validateGlobalCapacity' in lines[i]:
        print(str(i+1) + ': ' + lines[i].strip())

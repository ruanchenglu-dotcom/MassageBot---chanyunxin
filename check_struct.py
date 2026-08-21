import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i in range(1240, 1280):
    if 'function checkRequestAvailability' in lines[i]:
        print(f"checkRequestAvailability is at {i+1}")
    if 'function validateGlobalCapacity' in lines[i]:
        print(f"validateGlobalCapacity is at {i+1}")

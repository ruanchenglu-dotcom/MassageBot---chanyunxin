import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with io.open('temp_call_core.txt', 'w', encoding='utf-8') as fout:
    for i in range(2000, 2180):
        if 'const callCoreAvailabilityCheck' in lines[i]:
            for j in range(50):
                fout.write(str(i+j+1) + ': ' + lines[i+j])
            break

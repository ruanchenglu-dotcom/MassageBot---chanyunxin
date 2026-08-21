import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with io.open('temp_useeffect.txt', 'w', encoding='utf-8') as fout:
    for i in range(2480, 2580):
        if 'useEffect(' in lines[i]:
            for j in range(20):
                fout.write(str(i+j+1) + ': ' + lines[i+j])
            fout.write('...\n')

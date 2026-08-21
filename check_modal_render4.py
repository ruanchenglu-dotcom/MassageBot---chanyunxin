import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with io.open('temp_modal_render3.txt', 'w', encoding='utf-8') as fout:
    for i in range(3000, 3050):
        fout.write(str(i+1) + ': ' + lines[i])

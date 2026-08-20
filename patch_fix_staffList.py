import io
file_path = 'XinWuChanAdmin/js/cyx_bookingHandler.js'
with io.open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("serverStaffList", "staffList")

with io.open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

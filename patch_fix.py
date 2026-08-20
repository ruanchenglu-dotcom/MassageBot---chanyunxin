import io
file_path = 'XinWuChanAdmin/js/cyx_bookingHandler.js'
with io.open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("\\'toggleYouTui\\'", "'toggleYouTui'")
content = content.replace("\\'toggleGuaSha\\'", "'toggleGuaSha'")
content = content.replace("\\'toggleHuaGuan\\'", "'toggleHuaGuan'")
content = content.replace("\\'toggleBaGuan\\'", "'toggleBaGuan'")

with io.open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

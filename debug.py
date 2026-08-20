import io
with io.open('cyx_resource_core.js', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("return inLoc && !isOff && worksToday;", "console.log('DEBUG:', s.id, inLoc, !isOff, worksToday, s.location, s.group, reqLocation); return inLoc && !isOff && worksToday;")
with io.open('cyx_resource_core.js', 'w', encoding='utf-8') as f:
    f.write(c)

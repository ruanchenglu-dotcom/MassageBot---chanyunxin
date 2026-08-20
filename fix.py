import io
with io.open('cyx_resource_core.js', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("g.staffName = g.staffName || '隨機';", "g.staffName = g.staffName || g.staff || '隨機';")
c = c.replace("const req = g.staffName;", "const req = g.staff || g.staffName;")
with io.open('cyx_resource_core.js', 'w', encoding='utf-8') as f:
    f.write(c)

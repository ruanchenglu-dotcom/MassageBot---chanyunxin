import io
with io.open('cyx_resource_core.js', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("let staffData = staffList || window.STAFF_DATA || {};", "let staffData = staffList || {}; console.log('Staff Keys:', Object.keys(staffData));")
with io.open('cyx_resource_core.js', 'w', encoding='utf-8') as f:
    f.write(c)

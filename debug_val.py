import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('const availableStaffList = Object.values(staffList).filter(s => {',
    'const availableStaffList = Object.values(staffList).filter(s => {\n                console.log("[DEBUG] Checking staff:", s);\n                const shiftInfo = resolveStaffShift(s, queryDateStr);\n                console.log("[DEBUG] shiftInfo:", shiftInfo);\n')

with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'w', encoding='utf-8') as fout:
    fout.write(content)

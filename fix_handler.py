import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove my injected debug lines to revert the file to its working state
content = content.replace('                console.log("[DEBUG] Checking staff:", s);\n                const shiftInfo = resolveStaffShift(s, queryDateStr);\n                console.log("[DEBUG] shiftInfo:", shiftInfo);\n', '')
content = content.replace('console.log("[DEBUG] staffList:", typeof staffList, Array.isArray(staffList), staffList);\n            ', '')

with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'w', encoding='utf-8') as f:
    f.write(content)

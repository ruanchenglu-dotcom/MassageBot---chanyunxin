import io
import re

file_path = 'XinWuChanAdmin/js/cyx_bookingHandler.js'
with io.open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace safeStaffList line
content = content.replace(
    'const safeStaffList = serverData?.staff || window.SYSTEM_DATA?.staff || [];',
    'const safeStaffList = serverData?.staffList || serverData?.staff || window.SYSTEM_DATA?.staff || [];'
)

# Replace staffList assignment line
content = content.replace(
    'let staffList = freshData ? freshData.staff : (serverData?.staff || safeStaffList);',
    'let staffList = freshData ? (freshData.staffList || freshData.staff) : (serverData?.staffList || serverData?.staff || safeStaffList);'
)

# Replace callCoreAvailabilityCheck arguments where serverData?.staff is used
content = content.replace(
    'serverData?.staff || safeStaffList',
    'serverData?.staffList || serverData?.staff || safeStaffList'
)

with io.open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Patched XinWuChanAdmin/js/cyx_bookingHandler.js successfully.')

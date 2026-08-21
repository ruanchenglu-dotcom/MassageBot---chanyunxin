import io
with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, finalBookings, staffList, selectedLocation);',
    'console.log("[DEBUG] staffList:", typeof staffList, Array.isArray(staffList), staffList);\n            const res = callCoreAvailabilityCheck(form.date, form.time, guestDetails, finalBookings, staffList, selectedLocation);')

with io.open('XinWuChanAdmin/js/cyx_bookingHandler.js', 'w', encoding='utf-8') as fout:
    fout.write(content)

import sys
import re

file_path = r'c:\MassageBot - chanyunxin\XinWuChanAdmin\js\cyx_views.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add isGroupComboUpgrade
old_str1 = '''let editPhase1End = startMins + newDuration;
        let isComboEdit = editServiceCategory === 'COMBO';'''

new_str1 = '''let editPhase1End = startMins + newDuration;
        let isComboEdit = editServiceCategory === 'COMBO';
        const isGroupComboUpgrade = checkIsGroup && isComboEdit && currentPax > 1;'''

if old_str1 in content:
    content = content.replace(old_str1, new_str1)
else:
    print("Error finding string 1")
    sys.exit(1)

# 2. Modify Chair check
old_str2 = '''if (currentChairLoad > getMaxChairs() && isNewChairHigher) {'''
new_str2 = '''if (currentChairLoad > getMaxChairs() && isNewChairHigher && !isGroupComboUpgrade) {'''

if old_str2 in content:
    content = content.replace(old_str2, new_str2)
else:
    print("Error finding string 2")
    sys.exit(1)

# 3. Modify Bed check
old_str3 = '''if (currentBedLoad > getMaxBeds() && isNewBedHigher) {'''
new_str3 = '''if (currentBedLoad > getMaxBeds() && isNewBedHigher && !isGroupComboUpgrade) {'''

if old_str3 in content:
    content = content.replace(old_str3, new_str3)
else:
    print("Error finding string 3")
    sys.exit(1)

# 4. Modify OK message
old_str4 = '''if (testFlow === null) {
            setScanServiceStatus('OK');
            setScanServiceMessage('✅ 檢查通過，可儲存');
        }'''
new_str4 = '''if (testFlow === null) {
            setScanServiceStatus('OK');
            if (isGroupComboUpgrade) {
                setScanServiceMessage('✅ 系統將自動為群組分配最佳流程組合');
            } else {
                setScanServiceMessage('✅ 檢查通過，可儲存');
            }
        }'''

if old_str4 in content:
    content = content.replace(old_str4, new_str4)
else:
    print("Error finding string 4")
    sys.exit(1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Successfully patched cyx_views.js")

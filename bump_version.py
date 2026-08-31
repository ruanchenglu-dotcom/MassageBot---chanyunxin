import io
import re

with io.open('秦始皇Admin/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace ?v=number with ?v=number+1
def replacer(match):
    return f"?v={int(match.group(1)) + 1}"

content = re.sub(r'\?v=(\d+)', replacer, content)

with io.open('秦始皇Admin/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

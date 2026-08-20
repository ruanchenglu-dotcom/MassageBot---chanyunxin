import json
import urllib.request

try:
    req = urllib.request.Request('http://localhost:5001/api/info')
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print(json.dumps(data['staffList'][0], ensure_ascii=False, indent=2))
except Exception as e:
    print('Error:', e)

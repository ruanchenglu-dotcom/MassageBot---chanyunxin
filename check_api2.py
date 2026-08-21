import urllib.request
import json

url = "http://localhost:5001/api/info"
try:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        if 'staffList' in data and len(data['staffList']) > 0:
            print("staffList length:", len(data['staffList']))
            print("First item:", json.dumps(data['staffList'][0], ensure_ascii=False))
        else:
            print("No staffList or empty")
except Exception as e:
    print("Error:", e)

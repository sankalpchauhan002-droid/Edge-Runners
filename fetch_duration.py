import urllib.request, re
url = 'https://www.youtube.com/watch?v=8y1VdQR-o_U'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    duration = re.search(r'"lengthSeconds":"(\d+)"', html)
    print('Duration:', duration.group(1) if duration else 'Unknown')
except Exception as e:
    print(e)

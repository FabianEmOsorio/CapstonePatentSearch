import urllib.request
import re
from concurrent.futures import ThreadPoolExecutor

def get_patent_cpc(pub_num):
    try:
        url = f'https://patents.google.com/patent/{pub_num}/en'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            html = resp.read().decode('utf-8')
            matches = re.findall(r'<span itemprop="Code">([A-H]\d{2}[A-Z]\d+/\d+)</span>', html)
            return pub_num, list(dict.fromkeys(matches))[:4]
    except Exception as e:
        return pub_num, []

sample_nums = ['US20180140045A1', 'US5918502A', 'US20100154255A1', 'US6255762B1']
with ThreadPoolExecutor(max_workers=6) as ex:
    res = dict(ex.map(get_patent_cpc, sample_nums))
print('EXTRACTED CPCS:')
for k, v in res.items():
    print(k, '->', v)

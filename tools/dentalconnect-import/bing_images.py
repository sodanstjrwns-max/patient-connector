"""Bing 이미지 검색 → 큰 이미지 후보 다운로드. usage: bing_images.py <slot> <query> [max] [--transparent]"""
import sys, re, json, os, subprocess, urllib.parse, html as H
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36'
slot, q = sys.argv[1], sys.argv[2]; mx = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 6
transp = '--transparent' in sys.argv
out = f'imgsearch/{slot}'; os.makedirs(out, exist_ok=True)
qft = '+filterui:imagesize-large' + ('+filterui:photo-transparent' if transp else '')
url = 'https://www.bing.com/images/search?q='+urllib.parse.quote(q)+'&qft='+qft+'&form=IRFLTR&first=1'
page = subprocess.run(['curl','-sL','-m','25','-A',UA,'-H','Accept-Language: en-US,en;q=0.9,ko;q=0.8',url],capture_output=True,text=True).stdout
items = []
for m in re.finditer(r'm="(\{[^"]*\})"', page):
    try: d = json.loads(H.unescape(m.group(1)))
    except Exception: continue
    if 'murl' in d: items.append(d)
print('candidates', len(items))
meta=[]; n=0; seen=set()
for d in items:
    if n >= mx: break
    u = d['murl']
    if u in seen: continue
    seen.add(u)
    ext = 'png' if '.png' in u.lower() else 'webp' if '.webp' in u.lower() else 'jpg'
    f = f'{out}/{n+1:02d}.{ext}'
    subprocess.run(['curl','-sL','-m','25','-A',UA,'-o',f,u])
    t = subprocess.run(['file','-b','--mime-type',f],capture_output=True,text=True).stdout.strip()
    if not os.path.exists(f) or not t.startswith('image') or os.path.getsize(f) < 15000:
        if os.path.exists(f): os.remove(f)
        continue
    sz = subprocess.run(['sips','-g','pixelWidth','-g','pixelHeight',f],capture_output=True,text=True).stdout
    w = int(re.search(r'pixelWidth: (\d+)',sz).group(1)) if 'pixelWidth' in sz else 0
    h = int(re.search(r'pixelHeight: (\d+)',sz).group(1)) if 'pixelHeight' in sz else 0
    if w < 700: os.remove(f); continue
    meta.append({'file': f, 'w': w, 'h': h, 'page': d.get('purl'), 'image': u, 'title': d.get('t')})
    print(f, w, h, (d.get('purl') or '')[:70]); n += 1
json.dump(meta, open(f'{out}/meta.json','w'), ensure_ascii=False, indent=1)

#!/usr/bin/env python3
"""Patient Connect 영상 라이브러리 동기화.

구글 드라이브 폴더(로컬 Google Drive 마운트) → R2(library/…) + D1 library_materials → 전 병원 자료함.
- 주제 폴더(ID 규칙 ABC-123) 단위로 최종 HD 영상·미리보기·자막을 고르고, 목록 시트(tools/library-catalog.csv)로 제목·분류를 채운다.
- tools/library-overrides.json 으로 수동 보정(mode/title/body/skip).
- 변경분만 R2 업로드 후 POST /api/v1/ops/library-sync 로 반영. 상태는 tools/library-state.json.
사용: python3 tools/drive_library_sync.py [--dry-run] [--no-push] [--force]
"""
import argparse, csv, datetime, fcntl, hashlib, json, os, re, shutil, subprocess, sys, unicodedata, urllib.request

# Google Drive 마운트의 한글 파일명은 NFD(자모 분리)로 올 수 있어 매칭 전에 NFC 로 맞춘다. 경로 자체는 원본을 쓴다.
def nfc(s):
    return unicodedata.normalize('NFC', s)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.expanduser('~/Library/CloudStorage/GoogleDrive-sodanstjrwns@gmail.com/내 드라이브/치과 환자설명 영상 라이브러리 · 2026-09-18')
CACHE = os.path.expanduser('~/Library/Caches/patient-connect-library')
STATE = os.path.join(REPO, 'tools', 'library-state.json')
CATALOG = os.path.join(REPO, 'tools', 'library-catalog.csv')
OVERRIDES = os.path.join(REPO, 'tools', 'library-overrides.json')
REPORT = os.path.expanduser('~/pflive/patient-experience-2026/runtime/connect-library-sync-report.md')
SPECIALTY = '치과'  # 이 드라이브 폴더의 진료과. 다른 진료과 폴더가 생기면 ROOT 별 상수로 확장
BUCKET = 'patient-connect-assets'
API = os.environ.get('CONNECT_API_URL', 'https://connect.patientfunnel.kr') + '/api/v1/ops/library-sync'
KEY_FILE = os.path.expanduser('~/.ps-keys/connect.key')
ID_RE = re.compile(r'([A-Z]{3}-\d{3})')
EXCLUDE_VIDEO = re.compile(r'4K|4k|미채택|초안|개별검토|강조본|수술과정만|surgery-only|진행본|봉합미포함|partial|WIP|candidate|rejected|preview', re.I)
SKIP_UNIT = re.compile(r'진행본|WIP|제작중|미채택|구버전|pilot|원본과 작업기록|사용 ?제외|탈락|사용 ?중단|인포그래픽', re.I)
SKIP_SUBDIR = {'images', 'videos', 'requests', 'qa', 'renders', 'archives-final', 'restored', 'captions', 'mattes', 'stage-01', 'stage-02', 'stage-03', 'stage-04'}
POSTER_RE = re.compile(r'미리보기|preview|썸네일|대표이미지', re.I)
INFOGRAPHIC_RE = re.compile(r'인포그래픽|infographic', re.I)
INFOGRAPHIC_EXCLUDE = re.compile(r'제외|사용중단|사용 중단|폐기|이전본|모음에서제외|포스터', re.I)
INFOGRAPHIC_DIR_RE = re.compile(r'인포그래픽', re.I)
FIELD_CATEGORY = {'기초 해부': '예방·구강관리', '검사·진단': '진료 전·후 안내', '충치·수복': '충치·신경치료', '크라운·브릿지': '보철·틀니', '신경치료': '충치·신경치료', '균열·외상': '충치·신경치료', '잇몸질환': '잇몸치료', '잇몸치료': '잇몸치료', '임플란트 구조·보철': '임플란트', '임플란트 수술': '임플란트', '임플란트 유지관리': '임플란트', '발치·구강외과': '사랑니·발치', '틀니': '보철·틀니', '교정': '치아교정', '소아치과': '소아치과', '예방·생활 관리': '예방·구강관리', '턱관절·치아 마모': '턱관절', '심미치료': '심미치료', '구강질환·진료 안내': '구강점막'}
PREFIX_CATEGORY = {'BAS': '예방·구강관리', 'EXM': '진료 전·후 안내', 'CAR': '충치·신경치료', 'CRN': '보철·틀니', 'END': '충치·신경치료', 'PUL': '충치·신경치료', 'CRK': '충치·신경치료', 'GUM': '잇몸치료', 'PER': '잇몸치료', 'IMP': '임플란트', 'SUR': '임플란트', 'IMC': '임플란트', 'EXT': '사랑니·발치', 'DEN': '보철·틀니', 'ORT': '치아교정', 'PED': '소아치과', 'PRV': '예방·구강관리', 'TMJ': '턱관절', 'EST': '심미치료', 'ORL': '구강점막'}
CLOSING = '개인의 상태에 따라 치료 방법과 경과는 달라질 수 있습니다. 자세한 내용은 담당 의료진에게 확인해 주세요.'

def log(*a):
    print(datetime.datetime.now().strftime('%H:%M:%S'), *a, flush=True)

def load_json(p, default):
    try:
        return json.load(open(p, encoding='utf-8'))
    except FileNotFoundError:
        return default

def catalog():
    rows = {}
    if os.path.exists(CATALOG):
        for r in csv.DictReader(open(CATALOG, encoding='utf-8')):
            rows[r['id']] = r
    return rows

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

def cached(src):
    """Google Drive 마운트의 클라우드 전용 파일은 읽을 때 내려받힌다. 캐시로 복사한 뒤 캐시를 쓴다."""
    os.makedirs(CACHE, exist_ok=True)
    st = os.stat(src)
    dst = os.path.join(CACHE, f"{st.st_size}_{int(st.st_mtime)}_{os.path.basename(src)}")
    if not os.path.exists(dst) or os.path.getsize(dst) != st.st_size:
        shutil.copyfile(src, dst)
    return dst

def duration_of(path):
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True, timeout=120).stdout.strip()
        d = float(out)
        return round(d, 2) if d > 0 else None
    except Exception:
        return None

def frame_poster(video_cached):
    """미리보기 jpg 가 없으면 영상 1초 지점 프레임을 1280px JPG 로 뽑아 포스터로 쓴다(512KB 이하)."""
    out = video_cached + '.poster.jpg'
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return out
    for q in (4, 7, 12):
        try:
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', '1', '-i', video_cached, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', str(q), out], capture_output=True, timeout=120)
            if os.path.exists(out) and 0 < os.path.getsize(out) <= 512 * 1024:
                return out
        except Exception:
            return None
    return out if os.path.exists(out) and os.path.getsize(out) > 0 else None

def parse_srt(path):
    text = open(path, encoding='utf-8', errors='ignore').read().replace('\r', '')
    cues = []
    for block in re.split(r'\n\s*\n', text.strip()):
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        lines = [l for l in lines if not re.match(r'^\d+$', l) and '-->' not in l]
        if lines:
            cues.append(lines)
    return cues

def folder_title(name):
    """주제 폴더명 → 제목 후보: 앞 번호·[표시]·ID·날짜·버전·'영상·전체에셋' 제거."""
    t = nfc(name)
    for pat in (r'^\[[^\]]*\]\s*', r'^\d+_', r'[A-Z]{3}-\d{3}[_ ]?', r'\s*·\s*\d{4}-\d{2}-\d{2}\s*$', r'_\d{4}-\d{2}-\d{2}$', r'(^|_)v\d+_?', r'_?영상·전체에셋', r'·전체에셋', r'_영상$'):
        t = re.sub(pat, '', t)
    return t.replace('_', ' ').strip(' ·') or nfc(name)

def unit_label(label):
    """폴더명 → 사람이 읽는 짧은 라벨: 번호·ID·버전·'영상·전체에셋' 제거."""
    t = label
    for pat in (r'^\d+_', r'[A-Z]{3}-\d{3}_?', r'^v\d+_?', r'_v\d+_?', r'_?영상·전체에셋', r'·전체에셋', r'_영상$', r'_\d{4}-\d{2}-\d{2}$'):
        t = re.sub(pat, '', t)
    return t.replace('_', ' ').strip(' ·') or label

def cues_to_lines(cues):
    out = []
    prev = None
    for lines in cues:
        if lines == prev:
            continue
        prev = lines
        first = lines[0]
        fragment = re.search(r'[.!?。]$', first) or (len(lines) == 2 and (len(first) > 16 or re.search(r'(을|를|이|가|은|는|에|와|과|고|아|어|면|서|도|로|의)$', first)))
        if len(lines) >= 2 and not fragment:
            out.append(f"- {first}: {' '.join(lines[1:])}")
        else:
            out.append(f"- {' '.join(lines)}")
    return out

def parse_script(path):
    try:
        j = json.load(open(path, encoding='utf-8'))
        cues = []
        for sc in j.get('scenes', []):
            lines = [sc.get('title', '')] + list(sc.get('copy', []))
            lines = [l for l in lines if l]
            if lines:
                cues.append(lines)
        return cues
    except Exception:
        return []

def version_token(name):
    m = re.search(r'[_\-\s](v\d+)', name, re.I)
    return m.group(1).lower() if m else None

def unit_from_dir(d, topic_hint=None):
    """폴더 하나를 '단위'로 해석: 최종 HD 영상 1개 + 포스터 + 자막 + 카탈로그 항목."""
    base = nfc(os.path.basename(d))
    if SKIP_UNIT.search(base):
        return None
    try:
        names = sorted(os.listdir(d))
    except OSError:
        return None
    files = [(nfc(n), os.path.join(d, n)) for n in names if os.path.isfile(os.path.join(d, n)) and not n.startswith('.')]
    vids = [(n, p) for n, p in files if n.lower().endswith('.mp4') and not EXCLUDE_VIDEO.search(n)]
    if not vids:
        return None
    vids.sort(key=lambda x: os.stat(x[1]).st_mtime)
    vname, vpath = vids[-1]
    vtok = version_token(vname)
    posters = [(n, p) for n, p in files if n.lower().endswith(('.jpg', '.jpeg')) and POSTER_RE.search(n)]
    same = [x for x in posters if version_token(x[0]) == vtok] if vtok else []
    posters = same or posters
    posters.sort(key=lambda x: os.stat(x[1]).st_mtime)
    poster = posters[-1][1] if posters else None
    srts = [(n, p) for n, p in files if n.lower().endswith('.srt') and not re.search(r'partial|진행', n, re.I)]
    srt = sorted(srts, key=lambda x: (0 if x[0] == 'captions.srt' else 1, -os.stat(x[1]).st_mtime))[0][1] if srts else None
    infos = [(n, p) for n, p in files if n.lower().endswith('.png') and INFOGRAPHIC_RE.search(n) and not INFOGRAPHIC_EXCLUDE.search(n)]
    script = next((p for n, p in files if n == 'production-script.json'), None)
    entry = next((p for n, p in files if n == 'catalog-entry.json'), None)
    ids = set()
    for n in [base] + [x[0] for x in files]:
        ids.update(ID_RE.findall(n))
    topic = None
    if topic_hint and topic_hint in ids:
        topic = topic_hint
    elif len(ids) == 1:
        topic = ids.pop()
    elif topic_hint:
        topic = topic_hint
    elif ids:
        topic = sorted(ids)[0]
    return {'dir': d, 'label': base, 'top': nfc(os.path.basename(os.path.relpath(d, ROOT).split(os.sep)[0])), 'topic': topic, 'video': vpath, 'video_name': vname, 'mtime': os.stat(vpath).st_mtime,
            'poster': poster, 'srt': srt, 'script': script, 'entry': entry, 'final': '최종' in base, 'infos': [p for n, p in infos], 'vtok': vtok}

INFO_INDEX = {}  # topic → [png paths] from the '설명 인포그래픽' collection folder(s)

def index_infographics():
    INFO_INDEX.clear()
    for raw in sorted(os.listdir(ROOT)):
        name = nfc(raw); top = os.path.join(ROOT, raw)
        if not os.path.isdir(top) or not INFOGRAPHIC_DIR_RE.search(name):
            continue
        for f in sorted(os.listdir(top)):
            fn = nfc(f); p = os.path.join(top, f)
            if not os.path.isfile(p) or not fn.lower().endswith('.png') or INFOGRAPHIC_EXCLUDE.search(fn):
                continue
            ids = ID_RE.findall(fn)
            if ids:
                INFO_INDEX.setdefault(ids[0], []).append(p)

def pick_infographic(unit, topic):
    """요약 이미지 선택: 채택 단위 폴더 안 → 그 상위 주제 폴더 → 인포그래픽 모음 폴더(같은 버전 토큰 우선, 아니면 최신)."""
    cands = list(unit['infos'])
    if not cands:
        parent = os.path.dirname(unit['dir'])
        try:
            if os.path.abspath(parent) != os.path.abspath(ROOT):
                cands = [os.path.join(parent, f) for f in os.listdir(parent) if nfc(f).lower().endswith('.png') and INFOGRAPHIC_RE.search(nfc(f)) and not INFOGRAPHIC_EXCLUDE.search(nfc(f))]
        except OSError:
            cands = []
    if not cands:
        cands = list(INFO_INDEX.get(topic, []))
    if not cands:
        return None
    if unit['vtok']:
        same = [c for c in cands if version_token(nfc(os.path.basename(c))) == unit['vtok']]
        if same:
            cands = same
    cands.sort(key=lambda c: os.stat(c).st_mtime)
    return cands[-1]

def infographic_jpg(png_cached):
    """4K PNG(8~9MB) → 2560px JPG(수백 KB). 글자가 있으므로 품질 3."""
    out = png_cached + '.2560.jpg'
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return out
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', png_cached, '-vf', 'scale=2560:-2', '-q:v', '3', out], capture_output=True, timeout=180)
    return out if os.path.exists(out) and os.path.getsize(out) > 0 else None

def scan():
    """ROOT 를 걸어 주제별 단위 목록을 만든다."""
    index_infographics()
    units = []
    for raw in sorted(os.listdir(ROOT)):
        name = nfc(raw)
        top = os.path.join(ROOT, raw)
        if not os.path.isdir(top) or name.startswith('.') or SKIP_UNIT.search(name):
            continue
        hint = (ID_RE.findall(name) or [None])[0]
        dirs = [top]
        for sub in sorted(os.listdir(top)):
            p = os.path.join(top, sub)
            if os.path.isdir(p) and nfc(sub) not in SKIP_SUBDIR and not sub.startswith('.'):
                dirs.append(p)
                for sub2 in sorted(os.listdir(p)):
                    p2 = os.path.join(p, sub2)
                    if os.path.isdir(p2) and nfc(sub2) not in SKIP_SUBDIR and not sub2.startswith('.'):
                        dirs.append(p2)
        found = []
        for d in dirs:
            h = (ID_RE.findall(nfc(os.path.basename(d))) or [hint])[0]
            u = unit_from_dir(d, h)
            if u and u['topic']:
                found.append(u)
        # '최종' 단위가 있으면 같은 주제의 상위/형제 단위를 버린다
        finals = {u['topic'] for u in found if u['final']}
        found = [u for u in found if u['final'] or u['topic'] not in finals]
        units.extend(found)
    return units

def build(units, cat, ov):
    """주제별 자료(제목·분류·본문·영상 목록) 구성."""
    by = {}
    for u in units:
        by.setdefault(u['topic'], []).append(u)
    items, notes = [], []
    for topic in sorted(by):
        o = ov.get(topic, {})
        if o.get('skip'):
            notes.append(f"{topic}: 제외(overrides skip)")
            continue
        us = sorted(by[topic], key=lambda u: u['mtime'])
        mode = o.get('mode', 'replace')
        chosen = us if mode == 'append' else us[-1:]
        if mode != 'append' and len(us) > 1:
            notes.append(f"{topic}: 단위 {len(us)}개 중 최신 '{us[-1]['label']}' 채택(replace)")
        row = cat.get(topic, {})
        entry = {}
        for u in reversed(chosen):
            if u['entry']:
                try:
                    entry = json.load(open(u['entry'], encoding='utf-8')); break
                except Exception:
                    pass
        title = o.get('title') or entry.get('title') or row.get('title') or folder_title(chosen[-1]['top'])
        field = row.get('field') or entry.get('category') or ''
        category = o.get('category') or FIELD_CATEGORY.get(field) or PREFIX_CATEGORY.get(topic[:3], '기타 자료')
        typ = row.get('type') or entry.get('purpose') or ''
        kind = o.get('kind') or ('disease' if typ == '질환 진행' else 'notice' if typ == '관리·주의' else 'explain')
        body = o.get('body')
        if not body:
            parts = []
            for u in chosen:
                cues = parse_srt(u['srt']) if u['srt'] else (parse_script(u['script']) if u['script'] else [])
                if not cues:
                    continue
                lines = cues_to_lines(cues)
                if len(chosen) > 1:
                    parts.append(f"▶ {unit_label(u['label'])}")
                parts.extend(lines)
                parts.append('')
            if not parts:
                notes.append(f"{topic}: 자막·대본 없음 → 본문 비어 있음(overrides body 필요)")
            body = '\n'.join(parts).strip()
            body = (body + '\n\n' + CLOSING) if body else CLOSING
        images = []
        for u in chosen:
            v = cached(u['video']); vs = sha256(v)
            im = {'key': f"library/{topic}/{vs[:12]}.mp4", 'media_type': 'video', '_src': v, '_sha': vs, '_ct': 'video/mp4'}
            if len(chosen) > 1:
                im['caption'] = unit_label(u['label'])[:60]
            d = duration_of(v)
            if d:
                im['duration_seconds'] = d
            p = cached(u['poster']) if u['poster'] else frame_poster(v)
            if p:
                ps = sha256(p)
                im['poster_key'] = f"library/{topic}/{ps[:12]}.jpg"; im['_poster_src'] = p; im['_poster_ct'] = 'image/jpeg'
                if not u['poster']:
                    notes.append(f"{topic}: 미리보기 이미지 없음 → 영상 프레임으로 대체({u['label']})")
            else:
                notes.append(f"{topic}: 미리보기 이미지 없음({u['label']})")
            images.append(im)
        order = row.get('order1') or ''
        try:
            sort = int(float(order)) if order else 500 + len(items)
        except ValueError:
            sort = 500 + len(items)
        pub = [{k: v for k, v in im.items() if not k.startswith('_')} for im in images]
        rev = hashlib.sha256(json.dumps({'t': title, 'b': body, 'c': category, 'k': kind, 'i': pub, 's': SPECIALTY}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
        items.append({'key': f'drive:{topic}', 'topic_id': topic, 'kind': kind, 'category': category, 'title': title[:80], 'body': body[:4000], 'images_json': json.dumps(pub, ensure_ascii=False), 'rev': rev, 'sort': sort * 10, 'active': 1, 'specialty': SPECIALTY,
                      'source': nfc(os.path.relpath(chosen[-1]['dir'], ROOT)), '_media': images, '_units': [u['label'] + ' → ' + u['video_name'] for u in chosen]})
        # 요약 이미지(인포그래픽)는 영상과 별개 자료로 — 형식별 검색·선택이 되도록 분리
        info = pick_infographic(chosen[-1], topic)
        if info:
            src = cached(info); jpg = infographic_jpg(src)
            if jpg:
                js = sha256(jpg)
                iim = [{'key': f"library/{topic}/{js[:12]}.jpg", 'media_type': 'image', 'caption': '요약 이미지', '_src': jpg, '_sha': js, '_ct': 'image/jpeg'}]
                ipub = [{k: v for k, v in im.items() if not k.startswith('_')} for im in iim]
                ititle = (title[:70] + ' · 요약 이미지')
                irev = hashlib.sha256(json.dumps({'t': ititle, 'b': body, 'c': category, 'k': kind, 'i': ipub, 's': SPECIALTY}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
                items.append({'key': f'drive:{topic}:img', 'topic_id': topic, 'kind': kind, 'category': category, 'title': ititle, 'body': body[:4000], 'images_json': json.dumps(ipub, ensure_ascii=False), 'rev': irev, 'sort': sort * 10 + 1, 'active': 1, 'specialty': SPECIALTY,
                              'source': nfc(os.path.relpath(info, ROOT)), '_media': iim, '_units': ['요약 이미지 ← ' + nfc(os.path.basename(info))]})
            else:
                notes.append(f"{topic}: 요약 이미지 변환 실패({nfc(os.path.basename(info))})")
        else:
            notes.append(f"{topic}: 요약 이미지(인포그래픽) 없음")
    # 영상은 아직 없고 요약 이미지만 올라온 주제 → 이미지 자료만 먼저 만든다
    covered = {it['topic_id'] for it in items}
    for topic, pngs in sorted(INFO_INDEX.items()):
        if topic in covered:
            continue
        o = ov.get(topic, {})
        if o.get('skip'):
            continue
        row = cat.get(topic, {})
        png = sorted(pngs, key=lambda c: os.stat(c).st_mtime)[-1]
        title = o.get('title') or row.get('title') or folder_title(os.path.basename(png).rsplit('.', 1)[0])
        field = row.get('field') or ''
        category = o.get('category') or FIELD_CATEGORY.get(field) or PREFIX_CATEGORY.get(topic[:3], '기타 자료')
        typ = row.get('type') or ''
        kind = o.get('kind') or ('disease' if typ == '질환 진행' else 'notice' if typ == '관리·주의' else 'explain')
        body = o.get('body') or CLOSING
        src = cached(png); jpg = infographic_jpg(src)
        if not jpg:
            notes.append(f"{topic}: 요약 이미지 변환 실패({nfc(os.path.basename(png))})"); continue
        js = sha256(jpg)
        iim = [{'key': f"library/{topic}/{js[:12]}.jpg", 'media_type': 'image', 'caption': '요약 이미지', '_src': jpg, '_sha': js, '_ct': 'image/jpeg'}]
        ipub = [{k: v for k, v in im.items() if not k.startswith('_')} for im in iim]
        ititle = (title[:70] + ' · 요약 이미지')
        order = row.get('order1') or ''
        try:
            sort = int(float(order)) if order else 500 + len(items)
        except ValueError:
            sort = 500 + len(items)
        irev = hashlib.sha256(json.dumps({'t': ititle, 'b': body, 'c': category, 'k': kind, 'i': ipub, 's': SPECIALTY}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
        items.append({'key': f'drive:{topic}:img', 'topic_id': topic, 'kind': kind, 'category': category, 'title': ititle, 'body': body[:4000], 'images_json': json.dumps(ipub, ensure_ascii=False), 'rev': irev, 'sort': sort * 10 + 1, 'active': 1, 'specialty': SPECIALTY,
                      'source': nfc(os.path.relpath(png, ROOT)), '_media': iim, '_units': ['요약 이미지만(영상 대기) ← ' + nfc(os.path.basename(png))]})
        notes.append(f"{topic}: 영상 없음 → 요약 이미지만 반입(본문은 overrides 필요)")
    return items, notes

def r2_put(key, path, ct):
    cmd = ['npx', 'wrangler', 'r2', 'object', 'put', f'{BUCKET}/{key}', '--file', path, '--content-type', ct, '--remote']
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=900)
    if r.returncode != 0:
        raise RuntimeError(f'R2 업로드 실패 {key}: {r.stderr[-400:]}')

def push(items, remove_missing=True):
    key = open(KEY_FILE).read().strip()
    body = json.dumps({'items': [{k: v for k, v in it.items() if not k.startswith('_')} for it in items], 'remove_missing': remove_missing}, ensure_ascii=False).encode()
    req = urllib.request.Request(API, data=body, method='POST', headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'User-Agent': 'patient-connect-library-sync/1 (+launchd)'})
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.loads(r.read().decode())
    # 【2026-09-26】병원이 많으면 서버가 병원 자료함 반영을 나눠 한다 — propagated.next_cursor 가 있으면 없어질 때까지 이어 부른다.
    #  구버전 서버는 next_cursor 를 주지 않으므로 이 루프를 타지 않는다(호환).
    prop = res.get('propagated') if isinstance(res, dict) else None
    cur = prop.get('next_cursor') if isinstance(prop, dict) else None
    calls = 0
    while cur and calls < 1000:
        calls += 1
        req2 = urllib.request.Request(API.replace('/ops/library-sync', '/ops/library-propagate') + f'?cursor={int(cur)}', data=b'{}', method='POST',
                                      headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'User-Agent': 'patient-connect-library-sync/1 (+launchd)'})
        with urllib.request.urlopen(req2, timeout=120) as r2:
            p2 = (json.loads(r2.read().decode()) or {}).get('propagated') or {}
        for k2 in ('inserted', 'updated', 'deactivated', 'locked', 'specialty_skipped', 'unknown_specialty', 'hospitals', 'statements'):
            if isinstance(p2.get(k2), int):
                prop[k2] = int(prop.get(k2) or 0) + p2[k2]
        nxt = p2.get('next_cursor')
        cur = nxt if nxt and int(nxt) > int(cur) else None
    if isinstance(prop, dict):
        prop['next_cursor'] = cur
        prop['propagate_calls'] = calls + 1
    return res

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='판별 결과만 출력')
    ap.add_argument('--no-push', action='store_true', help='R2 업로드까지만')
    ap.add_argument('--force', action='store_true', help='변경 여부와 무관하게 전부 재반영')
    a = ap.parse_args()
    if not os.path.isdir(ROOT):
        log('드라이브 마운트 폴더를 찾을 수 없음:', ROOT); sys.exit(2)
    lock = open(os.path.join(CACHE if os.path.isdir(CACHE) else '/tmp', '.pc-library-sync.lock'), 'w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log('이미 실행 중'); sys.exit(0)
    state = load_json(STATE, {'topics': {}, 'uploaded': []})
    cat, ov = catalog(), load_json(OVERRIDES, {})
    units = scan()
    items, notes = build(units, cat, ov)
    changed = [it for it in items if a.force or state['topics'].get(it['key'], {}).get('rev') != it['rev']]
    gone = [k for k in state['topics'] if k not in {it['key'] for it in items}]
    lines = [f"# Patient Connect 라이브러리 동기화 · {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}", '', f"주제 {len(items)}개 · 변경 {len(changed)}개 · 사라진 주제 {len(gone)}개", '',
             '| 주제 | 종류 | 분류 | 제목 | 영상 | 변경 |', '|---|---|---|---|---|---|']
    for it in items:
        lines.append(f"| {it['topic_id']} | {it['kind']} | {it['category']} | {it['title']} | {'<br>'.join(it['_units'])} | {'예' if it in changed else ''} |")
    if notes:
        lines += ['', '## 판별 메모'] + [f'- {n}' for n in notes]
    if gone:
        lines += ['', '## 라이브러리에서 빠짐(비활성 처리)'] + [f'- {k}' for k in gone]
    print('\n'.join(lines))
    if a.dry_run:
        return
    uploaded = set(state.get('uploaded', []))
    for it in changed:
        for im in it['_media']:
            for k, src, ct in [(im['key'], im['_src'], im['_ct'])] + ([(im['poster_key'], im['_poster_src'], im['_poster_ct'])] if im.get('poster_key') else []):
                if k in uploaded and not a.force:
                    continue
                log('R2 업로드', k, f'{os.path.getsize(src) // 1024}KB'); r2_put(k, src, ct); uploaded.add(k)
    state['uploaded'] = sorted(uploaded)
    json.dump(state, open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)  # 업로드 목록은 푸시 실패와 무관하게 보존
    if not a.no_push and (changed or gone or a.force):
        res = push(items)
        log('반영 결과', json.dumps(res, ensure_ascii=False))
        lines += ['', '## 반영 결과', '```', json.dumps(res, ensure_ascii=False, indent=1), '```']
        for it in items:
            state['topics'][it['key']] = {'rev': it['rev'], 'title': it['title'], 'units': it['_units'], 'at': datetime.datetime.now().isoformat(timespec='seconds')}
        for k in gone:
            state['topics'].pop(k, None)
    elif not changed and not gone:
        log('변경 없음')
    state['last_run'] = datetime.datetime.now().isoformat(timespec='seconds')
    json.dump(state, open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    open(REPORT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

if __name__ == '__main__':
    main()

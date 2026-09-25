"""덴탈커넥트 비포애프터 합성 이미지 → 치료 전/후 사진 2장으로 분리 (격자 탐지).
usage: python3 split.py <cases_dir>  → <case>/split/NN_before.jpg, NN_after.jpg, split_report.json
layouts: 1x2(전/후) 1x3(전/중/후) 2x1(상/하) 2x2(대각) RxC(행 스트립) 1x1(단일→이웃과 짝) 1x4+(차트→skip)
"""
import sys, os, glob, json
import numpy as np
from PIL import Image

def runs(on, minlen):
    out, i, n = [], 0, len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]: j += 1
            if j - i >= minlen: out.append((i, j))
            i = j
        else:
            i += 1
    return out

def grid(im):
    a = np.asarray(im).astype(np.int16)
    H, W, _ = a.shape
    border = np.concatenate([a[0:3].reshape(-1, 3), a[-3:].reshape(-1, 3), a[:, 0:3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.abs(a - bg).sum(axis=2)
    mask = dist > 85
    if mask.mean() > 0.85:  # 사진 한 장이 꽉 찬 경우
        return [(0, 0, W, H)], 'single'
    y0, y1 = int(H * 0.12), int(H * 0.9)
    col = mask[y0:y1].mean(axis=0)
    cols = runs(col > 0.18, int(W * 0.09))
    if not cols: return [], 'none'
    cx = np.zeros(W, bool)
    for c0, c1 in cols: cx[c0:c1] = True
    row = mask[:, cx].mean(axis=1)
    rows = runs(row > 0.22, int(H * 0.1))
    cells = []
    for r0, r1 in rows:
        for c0, c1 in cols:
            sub = mask[r0:r1, c0:c1]
            if sub.mean() > 0.3:
                # 셀 내부에서 실제 사진 경계로 조임
                rr = runs(sub.mean(axis=1) > 0.2, 5); cc = runs(sub.mean(axis=0) > 0.2, 5)
                if rr and cc:
                    rr = max(rr, key=lambda t: t[1]-t[0]); cc = max(cc, key=lambda t: t[1]-t[0])
                    cells.append((c0+cc[0], r0+rr[0], c0+cc[1], r0+rr[1]))
    return cells, f'{len(rows)}x{len(cols)}'

def trim_uniform(im, maxfrac=0.2):
    a = np.asarray(im).astype(np.int16); H, W, _ = a.shape
    rs = a.reshape(H, -1).std(axis=1); cs = a.transpose(1, 0, 2).reshape(W, -1).std(axis=1)
    rm = a.reshape(H, -1).mean(axis=1); cm = a.transpose(1, 0, 2).reshape(W, -1).mean(axis=1)
    rs = np.where(rm < 70, 99, rs); cs = np.where(cm < 70, 99, cs)
    t = 0
    while t < H*maxfrac and rs[t] < 26: t += 1
    b = H
    while b > H*(1-maxfrac) and rs[b-1] < 26: b -= 1
    l = 0
    while l < W*maxfrac and cs[l] < 26: l += 1
    r = W
    while r > W*(1-maxfrac) and cs[r-1] < 26: r -= 1
    return im.crop((l, t, r, b)) if (t or l or b < H or r < W) else im

def crop(im, b, inset=0.012):
    bw, bh = b[2]-b[0], b[3]-b[1]
    k = int(min(bw, bh) * inset) + 1
    return trim_uniform(im.crop((b[0]+k, b[1]+k, b[2]-k, b[3]-k)))

TPL = {2: ([(0.155, 0.494), (0.505, 0.846)], (0.279, 0.608)), 3: ([(0.05, 0.345), (0.353, 0.647), (0.656, 0.951)], (0.276, 0.655))}
def template_fix(cells, W, H):
    """16:9 표준 템플릿(2단/3단)이면 셀을 템플릿 열에 귀속시켜 열마다 하나로 합치고 y범위도 템플릿 값으로"""
    if abs(W / H - 16 / 9) > 0.03 or not cells: return cells
    if max(c[1] for c in cells) - min(c[1] for c in cells) > H * 0.12: return cells  # 여러 행이면 템플릿 아님
    tol = W * 0.035
    for n, (xs, (y0, y1)) in TPL.items():
        hit = [[] for _ in xs]
        ok = True
        for c in cells:
            found = False
            for i, (tx0, tx1) in enumerate(xs):
                if c[0] >= tx0 * W - tol and c[2] <= tx1 * W + tol: hit[i].append(c); found = True; break
            if not found: ok = False; break
        if ok and all(hit):
            return [(int(tx0 * W), int(y0 * H), int(tx1 * W), int(y1 * H)) for tx0, tx1 in xs]
    return cells

def vstack(im, boxes, gap=24):
    ims = [crop(im, b) for b in boxes]
    w = min(i.width for i in ims)
    ims = [i.resize((w, int(i.height * w / i.width)), Image.LANCZOS) for i in ims]
    h = sum(i.height for i in ims) + gap * (len(ims) - 1)
    out = Image.new('RGB', (w, h), (255, 255, 255))
    y = 0
    for i in ims:
        out.paste(i, (0, y)); y += i.height + gap
    return out

def strip(im, boxes, gap=24):
    ims = [crop(im, b) for b in boxes]
    h = min(i.height for i in ims)
    ims = [i.resize((int(i.width * h / i.height), h), Image.LANCZOS) for i in ims]
    w = sum(i.width for i in ims) + gap * (len(ims) - 1)
    out = Image.new('RGB', (w, h), (255, 255, 255))
    x = 0
    for i in ims:
        out.paste(i, (x, 0)); x += i.width + gap
    return out

def main(root):
    report = {}
    for case in sorted(glob.glob(os.path.join(root, '*/'))):
        od = os.path.join(case, 'split'); os.makedirs(od, exist_ok=True)
        for f in glob.glob(os.path.join(od, '*')): os.remove(f)
        singles = []
        for p in sorted(glob.glob(os.path.join(case, 'orig', '*.*'))):
            n = os.path.splitext(os.path.basename(p))[0]
            key = f'{os.path.basename(os.path.dirname(case))}/{n}'
            try: im = Image.open(p).convert('RGB')
            except Exception as e: report[key] = {'status': f'ERR {e}'}; continue
            cells, shape = grid(im)
            W, H = im.size
            cells = template_fix(cells, W, H)
            r = {'size': [W, H], 'shape': shape, 'cells': cells}
            # 행/열 구조 재구성
            ys = sorted(set(c[1] for c in cells)); xs = sorted(set(c[0] for c in cells))
            def cluster(vals, tol):
                g = []
                for v in vals:
                    if g and abs(v - g[-1][-1]) < tol: g[-1].append(v)
                    else: g.append([v])
                return [min(x) for x in g]
            rws = cluster(ys, H * 0.08); cls = cluster(xs, W * 0.06)
            def rowof(c): return min(range(len(rws)), key=lambda i: abs(rws[i]-c[1]))
            def colof(c): return min(range(len(cls)), key=lambda i: abs(cls[i]-c[0]))
            table = {}
            for c in cells: table[(rowof(c), colof(c))] = c
            R, C = len(rws), len(cls)
            before = after = None
            if shape == 'single' or (R == 1 and C == 1):
                singles.append((n, cells[0] if cells else (0, 0, W, H))); r['status'] = 'single'; report[key] = r; continue
            if R == 1 and C in (2, 3):
                before, after = crop(im, table[(0, 0)]), crop(im, table[(0, C-1)])
            elif R == 2 and C == 1:
                before, after = crop(im, table[(0, 0)]), crop(im, table[(1, 0)])
            elif R == 2 and C == 2 and len(cells) == 4 and abs(W / H - 16 / 9) < 0.03:
                before, after = vstack(im, [table[(0, 0)], table[(1, 0)]]), vstack(im, [table[(0, 1)], table[(1, 1)]])
            elif R == 2 and C == 2 and len(cells) == 4:
                before, after = crop(im, table[(0, 0)]), crop(im, table[(1, 1)])
            elif R >= 2 and C >= 2:
                top = [table[(0, j)] for j in range(C) if (0, j) in table]
                bot = [table[(R-1, j)] for j in range(C) if (R-1, j) in table]
                if top and bot: before, after = strip(im, top), strip(im, bot)
            if before is None:
                r['status'] = f'unhandled {R}x{C} cells={len(cells)}'; report[key] = r; continue
            before.save(os.path.join(od, f'{n}_before.jpg'), quality=94, subsampling=0)
            after.save(os.path.join(od, f'{n}_after.jpg'), quality=94, subsampling=0)
            r['status'] = 'ok'; r['layout'] = f'{R}x{C}'; r['crop'] = [before.size, after.size]
            report[key] = r
        # 단일 사진은 순서대로 2장씩 짝(전→후) — 덴탈커넥트 업로드순 정렬이 최신순이므로 뒤가 전, 앞이 후
        for i in range(0, len(singles) - 1, 2):
            (n1, b1), (n2, b2) = singles[i], singles[i+1]
            im1 = Image.open(glob.glob(os.path.join(case, 'orig', n1 + '.*'))[0]).convert('RGB')
            im2 = Image.open(glob.glob(os.path.join(case, 'orig', n2 + '.*'))[0]).convert('RGB')
            crop(im2, b2, 0).save(os.path.join(od, f'{n1}{n2}_before.jpg'), quality=94, subsampling=0)
            crop(im1, b1, 0).save(os.path.join(od, f'{n1}{n2}_after.jpg'), quality=94, subsampling=0)
            report[f'{os.path.basename(os.path.dirname(case))}/{n1}+{n2}'] = {'status': 'ok', 'layout': 'pair'}
    json.dump(report, open(os.path.join(root, 'split_report.json'), 'w'), ensure_ascii=False, indent=1, default=str)
    okc = sum(1 for v in report.values() if v.get('status') == 'ok')
    print('ok', okc, '/', len(report))
    for k, v in report.items():
        if v.get('status') != 'ok': print('  ', k, v.get('status'), v.get('shape'), v.get('size'))
    import collections
    print(collections.Counter(v.get('layout') for v in report.values() if v.get('status') == 'ok'))

if __name__ == '__main__':
    main(sys.argv[1])

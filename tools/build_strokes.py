"""產生 strokes/strokes.json：題庫五字題用到的字，其筆畫輪廓（描寫範本）與筆畫中心線（算筆順）。

資料來源：hanzi-writer-data 2.0.1（Arphic Public License，授權全文 strokes/ARPHICPL.txt）。
題庫裡有三個客語字該資料沒有，用現有的偏旁左右拼出（結構依維基詞典）：
  𠊎 = ⿰亻厓　𫣆 = ⿰亻恩　吔 = ⿰口也
用法（專案根目錄）：python brush-prototype/tools/build_strokes.py
"""
import glob, io, json, math, os, re, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(os.environ.get('TEMP', '.'), 'hanzi-writer-data-cache')
VERSION = '2.0.1'
os.makedirs(CACHE, exist_ok=True)

def load(ch):
    path = os.path.join(CACHE, ch + '.json')
    if not os.path.exists(path):
        url = f'https://cdn.jsdelivr.net/npm/hanzi-writer-data@{VERSION}/{urllib.parse.quote(ch)}.json'
        with urllib.request.urlopen(url, timeout=30) as r, open(path, 'wb') as f:
            f.write(r.read())
    with io.open(path, encoding='utf-8') as f:
        return json.load(f)

def question_chars():
    seen = {}
    quiz = [os.path.join(ROOT, d, 'data', 'quiz') for d in ('..', '.')]   # 專案內為 ../data，獨立部署倉庫為 ./data
    for f in [f for d in quiz for f in glob.glob(os.path.join(d, 'questions_dialect_*_level_*.json'))]:
        with io.open(f, encoding='utf-8') as fh:
            for q in json.load(fh):
                c = re.sub(r'[^\w\u3400-\u9fff\U00020000-\U0002ffff]', '', q.get('hakka_hanji', ''))
                if q.get('hakka_char_count') == 5 and len(c) == 5:
                    for ch in c: seen[ch] = 1
    return list(seen)

NUM = re.compile(r'-?\d+(?:\.\d+)?')
def xs_of(paths):
    v = []
    for p in paths: v += [float(n) for n in NUM.findall(p)][0::2]
    return min(v), max(v)

def map_path(p, fx):
    """路徑座標成對（x y），只改 x。"""
    out, k = [], 0
    def sub(m):
        nonlocal k
        v = float(m.group()); r = fx(v) if k % 2 == 0 else v; k += 1
        return ('%g' % round(r, 1))
    return NUM.sub(sub, p)

def part(ch, idx):
    d = load(ch)
    return [d['strokes'][i] for i in idx], [d['medians'][i] for i in idx]

def compose(left_src, left_idx, right_ch, ref_ch, ref_right_idx):
    """左邊用 left_src 的偏旁筆畫；右邊字橫向壓進「ref_ch 的右半部」所佔的範圍。"""
    ls, lm = part(left_src, left_idx)
    rs, rm = part(right_ch, range(len(load(right_ch)['strokes'])))
    ref_s, _ = part(ref_ch, ref_right_idx)
    a, b = xs_of(rs); c, d = xs_of(ref_s)
    fx = lambda v: c + (v - a) / (b - a) * (d - c)
    strokes = ls + [map_path(p, fx) for p in rs]
    medians = lm + [[[round(fx(x), 1), y] for x, y in m] for m in rm]
    return strokes, medians

COMPOSED = {
    '𠊎': dict(left_src='仔', left_idx=[0, 1], right_ch='厓', ref_ch='仔', ref_right_idx=[2, 3, 4]),
    '𫣆': dict(left_src='仔', left_idx=[0, 1], right_ch='恩', ref_ch='仔', ref_right_idx=[2, 3, 4]),
    '吔': dict(left_src='咧', left_idx=[0, 1, 2], right_ch='也', ref_ch='咧', ref_right_idx=[3, 4, 5, 6, 7, 8]),
}

def bend_index(pts):
    """折線上轉角最大的點（用來把一筆拆成兩筆）。"""
    best, at = -1, 1
    for i in range(1, len(pts) - 1):
        a1 = math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
        a2 = math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])
        d = abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi)
        if d > best: best, at = d, i
    return at

def split_stroke(s, m, i, at=None):
    """把第 i 筆的中心線拆成兩筆。輪廓仍整筆畫在前一筆，後一筆輪廓留空（畫底字時不會重畫）。"""
    at = bend_index(m[i]) if at is None else at
    s[i:i + 1] = [s[i], '']
    m[i:i + 1] = [m[i][:at + 1], m[i][at:]]

def split_at_x(poly, x):
    for i in range(1, len(poly)):
        (x0, y0), (x1, y1) = poly[i - 1], poly[i]
        if (x0 - x) * (x1 - x) <= 0 and x0 != x1:
            r = (x - x0) / (x1 - x0); q = [round(x, 1), round(y0 + (y1 - y0) * r, 1)]
            return poly[:i] + [q], [q] + poly[i:]
    return poly, [poly[-1]]

def grass(s, m):
    """艹：教育部標準是 丨 一 一 丨（左豎、左橫、右橫、右豎）；資料原本是 一 丨 丨（一橫連寫）。"""
    H, L, R = m[0], m[1], m[2]
    left, right = split_at_x(H, (L[0][0] + R[0][0]) / 2)
    s[0:3] = [s[1], s[0], '', s[2]]
    m[0:3] = [L, left, right, R]

def swap(s, m, i, j):
    s[i], s[j] = s[j], s[i]; m[i], m[j] = m[j], m[i]

def fix_to_moe(ch, s, m):
    """依教育部《國字標準字體筆順學習網》逐字核對後的修正（只改筆畫先後與拆分，不使用該網站的資料檔）。
    核對方法見 README；其餘字的筆畫數與先後都與標準一致。"""
    if ch == '哦': swap(s, m, 8, 9)                          # 戈的點在撇之前
    elif ch == '啊': split_stroke(s, m, 3)                    # 阝：標準是三筆
    elif ch == '哪': split_stroke(s, m, 7)
    elif ch == '過':
        swap(s, m, 2, 3)                                      # 咼上方：短橫在豎之前
        split_stroke(s, m, 10)                                # 辶：撇點分兩筆
    elif ch == '鬼':
        split_stroke(s, m, 5, at=3)                           # 田中間的豎與底下的撇原本連成一筆
        a, b = s.pop(5), s.pop(5); ma, mb = m.pop(5), m.pop(5)
        s[4:4] = [a]; m[4:4] = [ma]                           # 順序：…橫、豎、橫、撇
        s[6:6] = [b]; m[6:6] = [mb]
    elif ch in ('著', '蒙'): grass(s, m)
    return s, m

def main():
    out = {}
    for ch in question_chars():
        if ch in COMPOSED:
            s, m = compose(**COMPOSED[ch])
        else:
            d = load(ch); s, m = list(d['strokes']), [list(x) for x in d['medians']]
        s, m = fix_to_moe(ch, s, m)
        out[ch] = {'s': s, 'm': m}
    dest = os.path.join(ROOT, 'strokes', 'strokes.json')
    with io.open(dest, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    # Same data as a script, for pages opened straight from disk (file://) where fetch() is blocked.
    js = os.path.join(ROOT, 'strokes', 'strokes.js')
    with io.open(js, 'w', encoding='utf-8', newline='
') as f:
        f.write('// Generated by tools/build_strokes.py - do not edit by hand.
window.STROKE_DATA_FILE=')
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';
')
    print(len(out), 'chars,', os.path.getsize(dest), 'bytes ->', dest)

if __name__ == '__main__':
    main()

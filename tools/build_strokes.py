"""產生 strokes/strokes.json：題庫五字題用到的字，其筆畫輪廓（描寫範本）與筆畫中心線（算筆順）。

資料來源：hanzi-writer-data 2.0.1（Arphic Public License，授權全文 strokes/ARPHICPL.txt）。
題庫裡有三個客語字該資料沒有，用現有的偏旁左右拼出（結構依維基詞典）：
  𠊎 = ⿰亻厓　𫣆 = ⿰亻恩　吔 = ⿰口也
用法（專案根目錄）：python brush-prototype/tools/build_strokes.py
"""
import glob, io, json, os, re, sys, urllib.parse, urllib.request

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

def main():
    out = {}
    for ch in question_chars():
        if ch in COMPOSED:
            s, m = compose(**COMPOSED[ch])
        else:
            d = load(ch); s, m = d['strokes'], d['medians']
        out[ch] = {'s': s, 'm': m}
    dest = os.path.join(ROOT, 'strokes', 'strokes.json')
    with io.open(dest, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'chars,', os.path.getsize(dest), 'bytes ->', dest)

if __name__ == '__main__':
    main()

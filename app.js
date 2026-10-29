'use strict';
const $ = id => document.getElementById(id);
const names = ['', '四縣腔', '海陸腔', '大埔腔', '饒平腔', '詔安腔', '南四縣腔'];
const paper = $('paper'), ctx = paper.getContext('2d');
const makeCanvas = () => { const c = document.createElement('canvas'); c.width = c.height = 512; return c; };
let question, chars = [], index = 0, strokes = [], saved = [], started = 0, ended = 0, active = null;
let inked = false, refilled = false, loading = false, loadToken = 0, shareFile = null;
let score = 0, feedback = '', timerId = 0, stamp = null;
const audio = new Audio();
const clean = s => Array.from(s.replace(/[\p{P}\p{Z}\s]/gu, ''));
const time = ms => {
  const t = Math.floor(ms / 10);
  return `${String(Math.floor(t / 6000)).padStart(2, '0')}:${String(Math.floor(t / 100) % 60).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}`;
};

/* ==========================================================================
   評價文案
   依成績分三級；每級可放多句，完成時隨機抽一句，同一次作品的頁面、圖卡與分享文案共用。
   之後要換成正式的隨機文案，只需要改這裡。
   ========================================================================== */
const FEEDBACK_LINES = {
  high: ['筆畫完整，落筆也很穩！'],
  mid: ['字形已經出來了！下次試著讓筆跡更貼近底字。'],
  low: ['五個字完成了！下次把漏掉的筆畫再補齊。'],
  scribble: ['筆畫有點亂喔！下次放慢速度，沿著底字一筆一畫描。']
};
const pick = list => list[Math.floor(Math.random() * list.length)];

/* ==========================================================================
   作品紀念章：依描寫得分分六階段（含 2 分以下的亂寫章），各有不同章名與印章造型。
   門檻為暫定值（計分尚未用真實學生作品校準），之後只需要改這張表。
   style：circle 單線圓章／splash 墨花不規則圓章／square 方章／double 雙線方章／cloud 雲紋邊方章／gold 金邊雙框章
   ========================================================================== */
const STAMPS = [
  { min: 9,   name: '墨韻客家', line: '字裡有客家的味道',   style: 'gold' },
  { min: 7.5, name: '落筆生輝', line: '每一筆都有精神',     style: 'cloud' },
  { min: 6,   name: '運筆漸穩', line: '筆畫愈來愈穩',       style: 'double' },
  { min: 4,   name: '墨字初成', line: '字形出來了',         style: 'square' },
  { min: 2,   name: '墨點初試', line: '第一次落筆，已經很棒', style: 'circle' },
  { min: 0,   name: '墨花亂舞', line: '筆下好熱鬧，下次慢慢描', style: 'splash' }   // 2 分以下，多半是亂寫
];
const stampFor = value => STAMPS.find(st => value >= st.min);

/* 印章：白文（紅底鏤空字），金章為金字。以章名為種子加上固定的斑駁，每次畫出來都一樣。 */
function drawStamp(g, cx, cy, size, st) {
  const S = 240, RED = '#c23b2a', GOLD = '#c9962b';
  const c = document.createElement('canvas'); c.width = c.height = S;
  const k = c.getContext('2d');
  const rr = (x, y, w, h, r) => { k.beginPath(); k.roundRect(x, y, w, h, r); };
  const cut = fn => { k.save(); k.globalCompositeOperation = 'destination-out'; fn(); k.restore(); };
  const chars = Array.from(st.name);
  const round = st.style === 'circle' || st.style === 'splash';
  k.fillStyle = k.strokeStyle = RED;

  if (st.style === 'splash') {
    /* 墨花：邊緣像墨水濺開的不規則圓，四周再濺幾點墨 */
    const edge = (rad, wob) => { k.beginPath(); for (let a = 0; a <= 360; a += 3) { const t = a * Math.PI / 180, r = rad + wob * (Math.sin(5 * t) * .6 + Math.sin(9 * t + 1) * .4); k[a ? 'lineTo' : 'moveTo'](120 + r * Math.cos(t), 120 + r * Math.sin(t)); } k.closePath(); };
    edge(92, 7); k.fill();
    cut(() => { k.lineWidth = 3; edge(80, 4); k.stroke(); });
    for (const [x, y, r] of [[214, 66, 5], [28, 172, 4], [200, 206, 3.5], [48, 38, 3]]) { k.beginPath(); k.arc(x, y, r, 0, Math.PI * 2); k.fill(); }
  } else if (round) {
    k.beginPath(); k.arc(120, 120, 96, 0, Math.PI * 2); k.fill();
    cut(() => { k.lineWidth = 3; k.beginPath(); k.arc(120, 120, 86, 0, Math.PI * 2); k.stroke(); });
  } else if (st.style === 'square') {
    rr(24, 24, 192, 192, 14); k.fill();
    cut(() => { k.lineWidth = 3; rr(33, 33, 174, 174, 8); k.stroke(); });
  } else if (st.style === 'double') {
    k.lineWidth = 6; rr(22, 22, 196, 196, 12); k.stroke();
    rr(36, 36, 168, 168, 8); k.fill();
    cut(() => { k.lineWidth = 2.5; rr(44, 44, 152, 152, 5); k.stroke(); });
  } else if (st.style === 'cloud') {
    rr(24, 24, 192, 192, 8); k.fill();
    cut(() => {
      for (let t = 40; t <= 200; t += 20) {
        for (const [x, y] of [[t, 24], [t, 216], [24, t], [216, t]]) { k.beginPath(); k.arc(x, y, 6.5, 0, Math.PI * 2); k.fill(); }
      }
      k.lineWidth = 3; rr(38, 38, 164, 164, 4); k.stroke();
    });
  } else {
    k.strokeStyle = GOLD; k.lineWidth = 7; rr(21, 21, 198, 198, 14); k.stroke();
    k.lineWidth = 2; rr(32, 32, 176, 176, 8); k.stroke();
    k.fillStyle = RED; rr(38, 38, 164, 164, 6); k.fill();
    k.fillStyle = GOLD;
    for (const [x, y] of [[50, 50], [190, 50], [50, 190], [190, 190]]) { k.beginPath(); k.arc(x, y, 4.5, 0, Math.PI * 2); k.fill(); }
  }

  /* 章名：由左至右、由上而下，兩字一行（沿用現代讀法，方便閱讀） */
  const fs = round ? 54 : st.style === 'gold' ? 62 : 70, dx = round ? 30 : st.style === 'gold' ? 36 : 38, dy = dx;
  const pos = [[120 - dx, 120 - dy], [120 + dx, 120 - dy], [120 - dx, 120 + dy], [120 + dx, 120 + dy]];
  k.font = `${fs}px StampBrush, Hakka, "Microsoft JhengHei", sans-serif`; k.textAlign = 'center'; k.textBaseline = 'middle';
  /* Yuji Mai 筆畫偏細，補一圈同色描邊讓小尺寸也清楚 */
  k.lineJoin = 'round'; k.lineWidth = fs * .02;
  const drawChars = () => chars.forEach((ch, i) => { k.fillText(ch, pos[i][0], pos[i][1] + 3); k.strokeText(ch, pos[i][0], pos[i][1] + 3); });
  if (st.style === 'gold') { k.fillStyle = '#f6dc90'; drawChars(); } else cut(drawChars);

  /* 斑駁：固定亂數，讓同一個章每次一致 */
  let seed = Array.from(st.name).reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  cut(() => { for (let i = 0; i < 46; i++) { k.beginPath(); k.arc(24 + rnd() * 192, 24 + rnd() * 192, .6 + rnd() * 1.5, 0, Math.PI * 2); k.fill(); } });

  g.save(); g.translate(cx, cy); g.rotate(-5 * Math.PI / 180);
  g.drawImage(c, -size / 2, -size / 2, size, size);
  g.restore();
}

/* ==========================================================================
   描寫
   ========================================================================== */
function target() {
  const c = makeCanvas(), g = c.getContext('2d');
  g.fillStyle = '#000'; g.font = '330px Hakka'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(chars[index] || '', 256, 273);
  return c;
}

/* ==========================================================================
   墨量：沾墨後為 1，依筆畫走過的距離遞減（約夠寫三個字），用完（<= 0）必須再沾墨，次數不限，再沾墨歸 1。
   只影響畫面：墨少時墨色變灰、線條變細，並出現飛白（筆毛沒蓋到的細絲）。
   計分用固定線寬另外重畫（fixed），不受墨量影響。
   ========================================================================== */
const INK_SPAN = 4800;      // 畫布單位：一次沾墨可寫的總長度
const INK_FLOOR = .03;      // 顯示用墨量下限：墨快用完時筆跡越來越細、飛白越多，但仍看得到
const DRY_START = .5;       // 墨量低於這個值開始出現飛白
let usedBefore = 0;         // 本次沾墨後，已定稿的字用掉的長度
const pathLen = list => list.reduce((sum, st) => sum + st.reduce((l, p, i) => i ? l + Math.hypot(p.x - st[i - 1].x, p.y - st[i - 1].y) : l, 0), 0);
const inkLeft = () => 1 - (usedBefore + pathLen(strokes)) / INK_SPAN;   // 實際剩餘墨量，<= 0 即用完
const inkLevel = () => Math.max(INK_FLOOR, Math.min(1, inkLeft()));
const inkColor = k => {
  const t = Math.max(0, Math.min(1, k)), mix = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${mix(140, 36)},${mix(133, 34)},${mix(120, 29)})`;
};
const hash01 = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
const vnoise = (x, y) => { const i = Math.floor(y), f = y - i, u = f * f * (3 - 2 * f); return hash01(x, i) * (1 - u) + hash01(x, i + 1) * u; };

function paintStroke(g, s, fixed = false) {
  if (!s.length) return;
  g.strokeStyle = g.fillStyle = fixed ? '#24221d' : inkColor(s[0].k ?? 1);
  g.lineCap = g.lineJoin = 'round';
  if (s.length === 1) {
    g.beginPath(); g.arc(s[0].x, s[0].y, fixed ? 10 : 3, 0, Math.PI * 2); g.fill();
    return;
  }
  if (fixed) {
    for (let i = 1; i < s.length; i++) {
      g.lineWidth = 20;
      g.beginPath(); g.moveTo(s[i - 1].x, s[i - 1].y); g.lineTo(s[i].x, s[i].y); g.stroke();
    }
    return;
  }
  const seed = s[0].x * .37 + s[0].y * .73, N = 7;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i], k = b.k ?? 1, W = b.w * (.4 + .6 * k);
    g.strokeStyle = g.fillStyle = inkColor(k);
    if (k >= DRY_START) {
      g.lineWidth = W;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      continue;
    }
    /* 飛白：一筆拆成幾條平行細線，墨越少越多條被跳過；是否跳過由平滑噪聲決定，每條在不同位置斷開，形成絲狀留白 */
    const miss = (DRY_START - k) / DRY_START * .85;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    g.lineWidth = Math.max(1.8, W / N * 2);
    for (let j = 0; j < N; j++) {
      if (j !== 3 && vnoise(seed + j * 3.7, i / 9) < miss) continue;
      const off = (j / (N - 1) - .5) * W * .92;
      g.beginPath(); g.moveTo(a.x + nx * off, a.y + ny * off); g.lineTo(b.x + nx * off, b.y + ny * off); g.stroke();
    }
  }
  const p = s[s.length - 1];
  g.fillStyle = inkColor(p.k ?? 1);
  g.beginPath(); g.arc(p.x, p.y, 2, 0, Math.PI * 2); g.fill();
}

function inkCanvas(fixed = false) {
  const c = makeCanvas(), g = c.getContext('2d');
  for (const s of strokes) paintStroke(g, s, fixed);
  return c;
}

function updateInkUI() {
  const lvl = inked ? inkLevel() : 0;
  brush.classList.toggle('inked', inked);
  brush.style.setProperty('--ink', inked ? (.35 + .65 * lvl).toFixed(2) : 0);
  $('inkBar').style.width = (lvl * 100).toFixed(0) + '%';
  $('ink').classList.toggle('needs-ink', !inked && !!started && !ended && !$('ink').disabled);
  const dry = inked && lvl < .3, out = !inked && !!started && !ended;
  $('inkInfo').classList.toggle('dry', dry || out);
  if (inked) $('inkInfo').textContent = dry
    ? '墨快乾了，用完記得點墨硯補墨'
    : (refilled ? '墨已補滿，用完可再補' : '墨用完再補，次數不限');
  else if (out) $('inkInfo').textContent = '墨用完了，記得點墨硯補墨';
}

/* 墨用完：停筆，等使用者點墨硯補墨（次數不限，計時持續）。 */
function needRefill() {
  inked = false; $('ink').disabled = false;
  $('inkLabel').textContent = '再沾一次墨';
  $('paperHint').textContent = '墨用完了，點墨硯補墨';
  $('status').textContent = '墨用完了，點墨硯再沾墨；計時持續中。';
}

function render() {
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#d4cbb8'; ctx.lineWidth = 1; ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.moveTo(256, 20); ctx.lineTo(256, 492); ctx.moveTo(20, 256); ctx.lineTo(492, 256);
  ctx.moveTo(20, 20); ctx.lineTo(492, 492); ctx.moveTo(492, 20); ctx.lineTo(20, 492);
  ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = .18; ctx.drawImage(target(), 0, 0); ctx.globalAlpha = 1;
  for (const s of strokes) paintStroke(ctx, s);
  updateInkUI();
  $('undo').disabled = !strokes.length || !!active;
  $('clear').disabled = !strokes.length || !!active;
  $('next').disabled = !strokes.length || !!active;
  $('next').textContent = index === 4 ? '完成五字，查看成果' : '寫好，下一字 →';
  $('steps').replaceChildren(...chars.map((ch, i) => {
    const e = document.createElement('span');
    e.className = 'step ' + (i === index ? 'active' : i < index ? 'done' : '');
    e.textContent = ch;
    return e;
  }));
}

async function loadQuestion() {
  const token = ++loadToken;
  loading = true; cancelAnimationFrame(timerId); audio.pause();
  started = ended = 0; active = null; inked = refilled = false; index = 0; strokes = []; saved = []; shareFile = null; usedBefore = 0;
  $('timer').textContent = '00:00.00';
  $('ink').disabled = $('audio').disabled = $('drawQuestion').disabled = $('dialect').disabled = true;
  $('status').textContent = '正在載入題目與字型…';
  try {
    await Promise.all([document.fonts.load('330px Hakka'), document.fonts.load('60px StampBrush', '墨')]);
    const lists = await Promise.all([1, 2, 3, 4, 5].map(async n => {
      const r = await fetch(`data/quiz/questions_dialect_${$('dialect').value}_level_${n}.json`);
      if (!r.ok) throw Error();
      return r.json();
    }));
    if (token !== loadToken) return;
    const pool = lists.flat().filter(q => q.hakka_char_count === 5 && clean(q.hakka_hanji).length === 5);
    if (!pool.length) throw Error();
    question = pool[Math.floor(Math.random() * pool.length)];
    chars = clean(question.hakka_hanji);
    audio.src = question.audio_url;
    $('sentence').textContent = question.hakka_hanji;
    $('meaning').textContent = question.chinese_sentence || '';
    $('source').textContent = `${names[$('dialect').value]} · 第 ${question.level} 級 · ${question.category}`;
    $('status').textContent = '';
    $('paperHint').textContent = '先點墨硯，再開始下筆';
    $('inkLabel').textContent = '沾墨開始';
    $('inkInfo').textContent = '墨用完再補，次數不限';
    $('ink').disabled = false; $('audio').disabled = false;
    render();
    autoplay();
  } catch {
    $('status').textContent = '題庫或字型載入失敗，請透過本機伺服器開啟，再按「換一句」重試。';
  } finally {
    loading = false; $('drawQuestion').disabled = false; $('dialect').disabled = false;
  }
}

function tick() {
  if (started && !ended) { $('timer').textContent = time(performance.now() - started); timerId = requestAnimationFrame(tick); }
}

$('ink').onclick = () => {
  if (loading || inked) return;
  inked = true;
  if (!started) { started = performance.now(); $('drawQuestion').disabled = true; $('dialect').disabled = true; tick(); }
  else refilled = true;
  $('ink').disabled = true;
  usedBefore = -pathLen(strokes);   // 補墨可能發生在一個字寫到一半，目前字已寫的長度不再扣墨
  dipBrush();
  $('inkLabel').textContent = '墨已備好';
  $('paperHint').textContent = '按住描寫，放開收筆';
  $('status').textContent = refilled ? '墨已補滿，繼續描寫。' : '可以下筆了。慢寫稍粗、快寫稍細。';
  render();
};

/* ==========================================================================
   毛筆圖象：跟著游標／手指，筆尖落在描寫位置。
   沒沾墨時筆毛是淺色，沾墨後筆尖變黑；下筆時依筆寬讓筆尖張開或收攏。
   ========================================================================== */
const BRUSH_SVG = `<svg viewBox="0 0 44 230" aria-hidden="true" focusable="false">
  <rect x="17" y="2" width="10" height="152" rx="5" fill="url(#bamboo)"/>
  <rect x="16" y="0" width="12" height="9" rx="4.5" fill="#3f2512"/>
  <rect x="16.5" y="44" width="11" height="3" rx="1.5" fill="#5a3718" opacity=".55"/>
  <rect x="16.5" y="104" width="11" height="3" rx="1.5" fill="#5a3718" opacity=".55"/>
  <rect x="15" y="150" width="14" height="16" rx="3" fill="url(#ferrule)"/>
  <g class="bristles">
    <path d="M15 164 C11 192 16 214 22 229 C28 214 33 192 29 164 Z" fill="url(#hair)"/>
    <path class="ink-part" d="M15 164 C11 192 16 214 22 229 C28 214 33 192 29 164 Z" fill="#16130f"/>
    <path d="M19 170 C18 192 20 210 22 222" stroke="#fff" stroke-opacity=".1" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;
document.querySelectorAll('[data-brush]').forEach(el => { el.innerHTML = BRUSH_SVG; });
const brush = $('brush');

function moveBrush(e) {
  const r = paper.getBoundingClientRect();
  let spread = 1;
  if (active === e.pointerId) {
    const s = strokes[strokes.length - 1];
    spread = .55 + (Math.min(23, Math.max(6, s[s.length - 1].w)) - 6) / 17 * .9;
  }
  brush.style.setProperty('--x', (e.clientX - r.left) + 'px');
  brush.style.setProperty('--y', (e.clientY - r.top) + 'px');
  brush.style.setProperty('--s', (r.width / 512 * .9).toFixed(3));
  brush.style.setProperty('--spread', spread.toFixed(2));
  brush.classList.add('show');
  paper.parentElement.classList.add('has-brush');
}
function hideBrush() { brush.classList.remove('show'); paper.parentElement.classList.remove('has-brush'); }
paper.addEventListener('pointerenter', moveBrush);
paper.addEventListener('pointermove', moveBrush);
paper.addEventListener('pointerdown', moveBrush);
paper.addEventListener('pointerleave', () => { if (active === null) hideBrush(); });
paper.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') hideBrush(); });
paper.addEventListener('pointercancel', hideBrush);

function dipBrush() {
  const b = $('ink');
  b.classList.remove('is-dip'); void b.offsetWidth; b.classList.add('is-dip');
}

function point(e) {
  const r = paper.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(512, (e.clientX - r.left) * 512 / r.width)),
    y: Math.max(0, Math.min(512, (e.clientY - r.top) * 512 / r.height)),
    t: e.timeStamp, w: 6, k: inkLevel()
  };
}
paper.onpointerdown = e => {
  if (!inked || ended || loading || active !== null || !e.isPrimary || e.button !== 0) return;
  e.preventDefault(); paper.setPointerCapture(e.pointerId); active = e.pointerId; strokes.push([point(e)]); render();
};
paper.onpointermove = e => {
  if (active !== e.pointerId) return;
  e.preventDefault();
  const s = strokes[strokes.length - 1], p = point(e), a = s[s.length - 1];
  const speed = Math.hypot(p.x - a.x, p.y - a.y) / Math.max(1, p.t - a.t);
  p.w = a.w * .65 + Math.max(7, Math.min(23, 23 - speed * 9)) * .35;
  s.push(p); render();
};
function release(e) {
  if (active !== e.pointerId) return;
  active = null;
  /* 墨在一筆中途用完時，這一筆仍可寫完（越寫越淡越細）；收筆後才要求補墨 */
  if (inked && inkLeft() <= 0) needRefill();
  render();
}
paper.onpointerup = paper.onpointercancel = paper.onlostpointercapture = release;
$('undo').onclick = () => { strokes.pop(); render(); };
$('clear').onclick = () => { strokes = []; render(); };

const SCRIBBLE_STROKE_W = 24, SCRIBBLE_FROM = 2.5, SCRIBBLE_TO = 5;   // 亂寫偵測：路徑長度倍數 2.5 起扣分，5 倍以上扣到最重
const LOOSE_LOW = .2, LOOSE_HIGH = .45;                               // 與底字重疊度（F1）太低時額外扣分

/* 評分：描寫墨跡（固定線寬）與標準底字比較，覆蓋率與精準度取調和平均；不辨識筆順。 */
function assess() {
  const t = target().getContext('2d').getImageData(0, 0, 512, 512).data;
  const m = inkCanvas(true).getContext('2d').getImageData(0, 0, 512, 512).data;
  let goal = 0, drawn = 0, hit = 0;
  for (let i = 3; i < t.length; i += 4) {
    const a = t[i] > 80, b = m[i] > 80;
    if (a) goal++; if (b) drawn++; if (a && b) hit++;
  }
  const coverage = goal ? hit / goal : 0, precision = drawn ? hit / drawn : 0;
  const f1 = coverage + precision ? 2 * coverage * precision / (coverage + precision) : 0;
  /* 亂寫偵測：筆畫總長相對底字所需長度（底字面積 ÷ 筆畫粗細）。正常描寫約 1～2 倍；來回塗抹、打圈會高出許多。 */
  const ratio = goal ? pathLen(strokes) / (goal / SCRIBBLE_STROKE_W) : 0;
  const tangle = Math.max(0, Math.min(1, (ratio - SCRIBBLE_FROM) / (SCRIBBLE_TO - SCRIBBLE_FROM)));
  const loose = Math.max(0, Math.min(1, (f1 - LOOSE_LOW) / (LOOSE_HIGH - LOOSE_LOW)));
  return { coverage, precision, f1, ratio, value: f1 * (1 - .8 * tangle) * (.4 + .6 * loose) };
}

$('next').onclick = () => {
  if (active !== null || !strokes.length) return;
  const evaluation = assess();
  if (evaluation.coverage < .12) { $('status').textContent = '底字還有很多地方沒描到，先補上主要筆畫，再往下一字。'; return; }
  saved.push({ canvas: inkCanvas(), ...evaluation });
  if (index === 4) { ended = performance.now(); cancelAnimationFrame(timerId); $('timer').textContent = time(ended - started); finish(); return; }
  usedBefore += pathLen(strokes);
  index++; strokes = [];
  if (inkLeft() <= 0) needRefill();
  else $('status').textContent = `正在描第 ${index + 1} 個字。`;
  render();
};

function finish() {
  audio.pause();
  score = saved.reduce((s, v) => s + v.value, 0) / 5 * 10;
  const coverage = saved.reduce((s, v) => s + v.coverage, 0) / 5;
  feedback = pick(FEEDBACK_LINES[score >= 8 ? 'high' : score < 2 ? 'scribble' : coverage < .65 ? 'low' : 'mid']);
  $('practice').hidden = true; $('result').hidden = false;
  $('feedback').textContent = feedback;
  $('elapsed').textContent = time(ended - started);
  $('artwork').replaceChildren(...saved.map(s => { const c = makeCanvas(); c.getContext('2d').drawImage(s.canvas, 0, 0); return c; }));
  $('resultSentence').textContent = question.hakka_hanji;
  $('resultMeaning').textContent = question.chinese_sentence || '';
  stamp = stampFor(score);
  $('stampName').textContent = stamp.name;
  $('stampLine').textContent = stamp.line;
  const sc = $('stamp'), sg = sc.getContext('2d');
  sg.clearRect(0, 0, sc.width, sc.height);
  drawStamp(sg, 120, 120, 220, stamp);
  drawCard();
  playSettle();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* 結算動畫：分數跳動計數，接著蓋章。使用者偏好減少動態時直接顯示結果。 */
let settleToken = 0;
function playSettle() {
  const token = ++settleToken;
  const stampEl = $('stamp'), card = document.querySelector('.scroll-card'), tile = $('stampName').parentElement;
  const finalText = `${score.toFixed(2)} / 10`;
  stampEl.classList.remove('pre', 'stamp-in'); card.classList.remove('impact'); tile.classList.remove('hold', 'reveal');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { $('score').textContent = finalText; return; }
  stampEl.classList.add('pre'); tile.classList.add('hold');
  $('score').textContent = '0.00 / 10';
  const t0 = performance.now(), DUR = 900;
  const step = now => {
    if (token !== settleToken) return;
    const p = Math.min(1, (now - t0) / DUR), eased = 1 - Math.pow(1 - p, 3);
    $('score').textContent = p < 1 ? `${(score * eased).toFixed(2)} / 10` : finalText;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => { if (token === settleToken) $('score').textContent = finalText; }, DUR + 150);   // 背景分頁會暫停動畫，保證最後顯示正確分數
  setTimeout(() => {
    if (token !== settleToken) return;
    void stampEl.offsetWidth;
    stampEl.classList.remove('pre'); stampEl.classList.add('stamp-in');
    card.classList.add('impact');
    tile.classList.remove('hold'); tile.classList.add('reveal');
  }, 1000);
}

/* ==========================================================================
   分享文案
   ========================================================================== */
function caption() {
  return [
    '我用毛筆學客語！',
    `【${names[$('dialect').value]}】${question.hakka_hanji}`,
    question.chinese_sentence || '',
    `描寫 ${score.toFixed(2)} / 10 分 · ${time(ended - started)}`,
    feedback
  ].filter(Boolean).join('\n');
}

/* ==========================================================================
   分享圖卡（1080×1350）：作品為主角，成績與評價一起留在圖卡上
   ========================================================================== */
let cardVersion = 0;
async function drawCard() {
  if (!saved.length) return;
  const version = ++cardVersion;
  shareFile = null;
  await Promise.all([document.fonts.load('30px Hakka'), document.fonts.load('60px StampBrush', '墨')]);
  if (version !== cardVersion) return;
  const c = $('card'), g = c.getContext('2d');
  c.width = 1080; c.height = 1350;
  g.textAlign = 'center';

  g.fillStyle = '#f8f1df'; g.fillRect(0, 0, 1080, 1350);
  g.strokeStyle = '#9c8151'; g.lineWidth = 3; g.strokeRect(40, 40, 1000, 1270);
  g.fillStyle = '#355b4d'; g.fillRect(40, 40, 1000, 125);
  g.fillStyle = '#fff'; g.font = '30px Hakka'; g.fillText('阿黑的客字繪卷 · 毛筆作品', 540, 115);

  g.fillStyle = '#3b3a2d'; g.font = '56px Hakka'; g.fillText('我用毛筆學客語！', 540, 262);
  g.fillStyle = '#78664a'; g.font = '26px Hakka';
  g.fillText(`${names[$('dialect').value]} · 第 ${question.level} 級 · ${question.category}`, 540, 318, 900);

  g.fillStyle = '#fffdf7'; g.fillRect(75, 360, 930, 250);
  g.strokeStyle = '#e0d4bb'; g.lineWidth = 2; g.strokeRect(75, 360, 930, 250);
  saved.forEach((s, i) => g.drawImage(s.canvas, 85 + i * 182, 394, 182, 182));

  g.fillStyle = '#3b3a2d'; g.font = '40px Hakka'; g.fillText(question.hakka_hanji, 540, 684, 900);
  g.fillStyle = '#55574a'; g.font = '27px Hakka'; g.fillText(question.chinese_sentence || '', 540, 736, 900);

  g.fillStyle = '#e7e5d4'; g.fillRect(90, 790, 900, 205);
  g.fillStyle = '#78664a'; g.font = '22px Hakka';
  g.fillText('描寫得分', 315, 842); g.fillText('描寫時間', 765, 842);
  g.strokeStyle = '#c9bfa5'; g.lineWidth = 2; g.beginPath(); g.moveTo(540, 825); g.lineTo(540, 905); g.stroke();
  g.fillStyle = '#355b4d'; g.font = '52px Hakka';
  g.fillText(`${score.toFixed(2)} / 10`, 315, 902); g.fillText(time(ended - started), 765, 902);
  g.fillStyle = '#3b3a2d'; g.font = '27px Hakka'; g.fillText(feedback, 540, 968, 840);

  /* 作品紀念章 */
  drawStamp(g, 270, 1120, 170, stamp);
  g.textAlign = 'left';
  g.fillStyle = '#78664a'; g.font = '22px Hakka'; g.fillText('作品紀念章', 400, 1078);
  g.fillStyle = '#3b3a2d'; g.font = '46px Hakka'; g.fillText(stamp.name, 400, 1136, 560);
  g.fillStyle = '#55574a'; g.font = '25px Hakka'; g.fillText(stamp.line, 400, 1180, 560);
  g.textAlign = 'center';

  g.fillStyle = '#355b4d'; g.font = '40px Hakka'; g.fillText('你也來玩玩看吧！', 540, 1255);
  g.fillStyle = '#78664a'; g.font = '20px Hakka';
  g.fillText('獨立試寫成果・非正式競賽成績', 540, 1288, 900);

  c.toBlob(blob => {
    if (blob && version === cardVersion) shareFile = new File([blob], '阿黑毛筆作品.png', { type: 'image/png' });
  }, 'image/png');
}

/* ==========================================================================
   分享動作
   ========================================================================== */
function legacyCopy(text) {
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.append(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  t.remove();
  return ok;
}
async function copy() {
  const text = caption();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    if (!legacyCopy(text)) { window.prompt('請手動複製文案：', text); return; }
  }
  $('shareStatus').textContent = '文案已複製，可貼到你的貼文。';
}
$('copy').onclick = copy;

function downloadImage() {
  const u = URL.createObjectURL(shareFile), a = document.createElement('a');
  a.href = u; a.download = shareFile.name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}
$('download').onclick = () => {
  if (!shareFile) { $('shareStatus').textContent = '圖片準備中，請稍後再按一次。'; return; }
  downloadImage();
  $('shareStatus').textContent = '作品圖已準備下載。';
};

/* 社群分享：只給圖片，不附文字、不附網址。
   手機：開啟系統分享面板，只帶圖片。
   電腦：下載圖片，並開啟該平台（LINE 電腦版沒有網頁入口，只下載）。 */
const PLATFORMS = {
  line: { label: 'LINE', open: '' },
  threads: { label: 'Threads', open: 'https://www.threads.net/' },
  facebook: { label: 'Facebook', open: 'https://www.facebook.com/' },
  instagram: { label: 'Instagram', open: 'https://www.instagram.com/' }
};
async function shareImageOnly(platform) {
  if (!shareFile) { $('shareStatus').textContent = '圖片準備中，請稍後再按一次。'; return; }
  if (navigator.canShare?.({ files: [shareFile] })) {
    try {
      await navigator.share({ files: [shareFile] });
      $('shareStatus').textContent = '已交給分享介面；是否發文由你決定。';
    } catch (e) {
      $('shareStatus').textContent = e.name === 'AbortError' ? '已取消分享，作品仍保留。' : '分享未完成，請改用「下載作品圖」。';
    }
    return;
  }
  const cfg = PLATFORMS[platform];
  downloadImage();
  if (cfg && cfg.open) window.open(cfg.open, '_blank', 'noopener,noreferrer');
  $('shareStatus').textContent = cfg ? `作品圖已下載，在 ${cfg.label} 發文時選這張圖即可。` : '作品圖已下載。';
}
$('nativeShare').onclick = () => shareImageOnly('');
document.querySelectorAll('[data-platform]').forEach(b => b.onclick = () => shareImageOnly(b.dataset.platform));

$('audio').onclick = () => {
  audio.currentTime = 0;
  audio.play().catch(() => { $('status').textContent = '音檔暫時無法播放，請確認網路後再試。'; });
};

// 進入題目自動播音；瀏覽器擋住自動播放（頁面剛開、尚無互動）時，改為第一次點擊或觸碰時補播。
function autoplay() {
  audio.currentTime = 0;
  audio.play().catch(() => {
    const src = audio.src;
    const retry = () => { if (audio.src === src && audio.paused && !started) audio.play().catch(() => {}); };
    document.addEventListener('pointerdown', retry, { once: true });
  });
}
$('drawQuestion').onclick = loadQuestion;
$('dialect').onchange = loadQuestion;
$('restart').onclick = () => { $('result').hidden = true; $('practice').hidden = false; loadQuestion(); window.scrollTo(0, 0); };
loadQuestion();

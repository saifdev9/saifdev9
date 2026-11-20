// Draws every panel in ../assets and writes ../README.md. Run `npm run build` inside tools/.
// Fetches the public contribution graph and language totals, so it needs network access;
// .github/workflows/redraw.yml runs it daily. Type is converted to outlines, so the SVGs need
// no fonts when GitHub shows them as images. Content lives in DATA; layout rules in ../DESIGN.md.
import opentype from 'opentype.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const load = (n) => opentype.loadSync(here(`fonts/${n}.ttf`));
// Geist for reading, Geist Mono only where the text is code (the chain, prompts, repo names, URLs)
const F = {
  display: load('GeistMono-700'), mono: load('GeistMono-400'),
  sans: load('Geist-400'), sansMed: load('Geist-500'), sansBold: load('Geist-600'),
};
// ground is GitHub's own dark canvas, so in dark mode the panels read as drawn on the page
const C = { ground: '#0D1117', ink: '#F3F0E7', muted: '#A29E93', line: '#262B33', accent: '#FFC72C' };
// one-hue sequential ramp for the contribution heatmap, empty day to busiest (OKLCH L .24 to .86)
const HEAT = ['#1B2025', '#6B5110', '#9C7714', '#D19F17', C.accent];

// ---------- DATA ----------
const LOGIN = 'saifdev9';
const email = 'saifdev99@gmail.com';
const about = 'The command after && only runs when the one before it exits clean. ' +
  'Same rule at work: the interface has to hold before anything ships.';
const stages = [
  { name: 'write', tools: ['React', 'TypeScript', 'Next.js', 'React Query', 'Supabase', 'Tailwind CSS', 'Rust'],
    note: 'If the interface fails, nothing ships.' },
  { name: 'release', tools: ['GitHub Actions', 'semantic-release', 'cargo-dist', 'PowerShell', 'Bash'],
    note: 'gitcloner: 0.5.0 to 0.6.1 in four days.' },
  { name: 'ship', tools: ['AWS', 'Oracle Cloud', 'Vercel', 'GitHub Pages', 'GitHub Releases'],
    note: 'AWS and Oracle Cloud run the servers.' },
];
// `to` is where the repo lands when it ships; `proof` is a checked fact about it.
const repos = [
  { slug: 'gitcloner', kind: 'Rust terminal UI', year: '2026', to: 'Releases', lead: true,
    what: 'Clones a pile of git repos at once: public, private, or picked from a GitHub org.',
    proof: 'Last release run on CI: success, 19 Oct 2026.' },
  { slug: 'claude-skills', kind: 'Claude Code skills', year: '2026', to: '~/.claude',
    what: 'Home of sound-notify, which plays a sound when Claude finishes a task. Default: “Faaaah”, bass boosted.',
    proof: '247 Indian meme sounds bundled. One command swaps the default.' },
];

// ---------- live data ----------
let token = process.env.GITHUB_TOKEN;
if (!token) try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch { /* public limits */ }
const ua = { 'user-agent': 'profile-readme-build' };
async function get(url, json = true) {
  const res = await fetch(url, { headers: { ...ua, ...(json && token ? { authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return json ? res.json() : res.text();
}
// The public graph, exactly what visitors see; private work appears only as the profile setting allows.
async function contributions() {
  const html = await get(`https://github.com/users/${LOGIN}/contributions`, false);
  const tips = new Map([...html.matchAll(/for="(contribution-day-component-[\d-]+)"[^>]*>([^<]*)<\/tool-tip>/g)].map((m) => [m[1], m[2]]));
  const days = [...html.matchAll(/data-date="([\d-]+)" id="(contribution-day-component-[\d-]+)" data-level="(\d)"/g)]
    .map(([, date, id, level]) => {
      const tip = tips.get(id) ?? '';
      return { date, level: +level, count: tip.startsWith('No ') ? 0 : parseInt(tip.replace(/,/g, ''), 10) || 0 };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (days.length < 300) throw new Error('contribution graph markup changed; parser found ' + days.length + ' days');
  return days;
}
// Streaks as { len, from, to }; the current one may end yesterday, since today is not over yet.
function streaks(days) {
  let longest = { len: 0 }, run = 0;
  days.forEach((d, i) => {
    run = d.count ? run + 1 : 0;
    if (run > longest.len) longest = { len: run, from: days[i - run + 1].date, to: d.date };
  });
  let i = days.length - 1;
  if (!days[i].count) i--;
  const end = i;
  while (i >= 0 && days[i].count) i--;
  const current = { len: end - i, from: days[i + 1]?.date, to: days[end]?.date };
  const best = days.reduce((a, d) => (d.count > a.count ? d : a));
  return { total: days.reduce((s, d) => s + d.count, 0), active: days.filter((d) => d.count).length, longest, current, best };
}
// Quick self-check of the streak logic on a synthetic week (runs on every build).
{
  const t = streaks(['01', '02', '03', '04', '05', '06', '07'].map((n, i) => ({ date: `2026-01-${n}`, count: [1, 1, 0, 2, 3, 4, 0][i] })));
  if (t.longest.len !== 3 || t.longest.from !== '2026-01-04' || t.current.len !== 3 || t.current.to !== '2026-01-06') throw new Error('streaks() self-check failed');
}
async function languages() {
  const own = (await get(`https://api.github.com/users/${LOGIN}/repos?per_page=100`)).filter((r) => !r.fork);
  const bytes = {};
  for (const r of own) for (const [k, v] of Object.entries(await get(r.languages_url))) bytes[k] = (bytes[k] || 0) + v;
  const sum = Object.values(bytes).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(bytes).sort((a, b) => b[1] - a[1]).map(([name, b]) => ({ name, share: b / sum }));
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((s, l) => s + l.share, 0);
  return { repos: own.length, rows: rest > 0 ? [...top, { name: 'Other', share: rest, other: true }] : top };
}

// ---------- type ----------
const advance = (font, size, ch) => (font.charToGlyph(ch).advanceWidth / font.unitsPerEm) * size;
const measure = (s, font, size) => [...s].reduce((w, ch) => w + advance(font, size, ch), 0);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => n.toLocaleString('en-US');
const day = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Relative path data in tenths of a unit. Positions are rounded before differencing, so
// rounding never accumulates along a glyph. Roughly halves the file size of toPathData().
function compact(cmds) {
  let d = '', cx = 0, cy = 0, sx = 0, sy = 0;
  const rel = (pts) => pts.map(([x, y]) => [Math.round(x * 10) - cx, Math.round(y * 10) - cy])
    .flat().map((v) => String(v / 10).replace(/^(-?)0\./, '$1.')).join(' ').replace(/ -/g, '-');
  for (const c of cmds) {
    if (c.type === 'Z') { d += 'z'; cx = sx; cy = sy; continue; }
    const pts = c.type === 'C' ? [[c.x1, c.y1], [c.x2, c.y2], [c.x, c.y]] : c.type === 'Q' ? [[c.x1, c.y1], [c.x, c.y]] : [[c.x, c.y]];
    d += c.type.toLowerCase() + rel(pts);
    cx = Math.round(c.x * 10); cy = Math.round(c.y * 10);
    if (c.type === 'M') { sx = cx; sy = cy; }
  }
  return d;
}
// Glyph by glyph, so no ligature or kerning can break the monospace cell grid.
function outline(s, x, y, size, font) {
  const cmds = [];
  for (const ch of s) {
    if (ch !== ' ') cmds.push(...font.charToGlyph(ch).getPath(x, y, size).commands);
    x += advance(font, size, ch);
  }
  return compact(cmds);
}
function text(s, x, y, size, font, fill, { end = false } = {}) {
  if (end) x -= measure(s, font, size);
  return `<path fill="${fill}" d="${outline(s, x, y, size, font)}"/>`;
}
function runs(parts, x, y, size, font) {
  return parts.map(([s, fill]) => { const p = text(s, x, y, size, font, fill); x += measure(s, font, size); return p; }).join('');
}
// A line of copy where every && is yellow, as it is everywhere on the page.
const amp = (s, x, y, size, font, fill) => runs(s.split('&&').flatMap((part, i) => (i ? [['&&', C.accent], [part, fill]] : [[part, fill]])), x, y, size, font);
function wrap(s, maxW, size, font) {
  const lines = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, font, size) > maxW) { lines.push(line); line = word; } else line = next;
  }
  return [...lines, line];
}
// Each character its own path, typed in at `t0 + i * step` seconds.
function typed(s, x, y, size, font, fill, t0, step = 0.025, cls = 'k') {
  return [...s].map((ch, i) => {
    const p = ch === ' ' ? '' : `<path class="${cls}" style="animation-delay:${(t0 + i * step).toFixed(3)}s" fill="${fill}" d="${outline(ch, x, y, size, font)}"/>`;
    x += advance(font, size, ch);
    return p;
  }).join('');
}
const at = (t, body) => `<g class="k" style="animation-delay:${t}s">${body}</g>`;
const hline = (x1, x2, y, c = C.line) => `<path stroke="${c}" stroke-width="1" d="M${x1} ${y}H${x2}"/>`;
const vline = (x, y1, y2, c = C.line) => `<path stroke="${c}" stroke-width="1" d="M${x} ${y1}V${y2}"/>`;
// The exit-status chip: a yellow cell with a 0 in it, optionally captioned "exit".
function chip(cx, top, s, size, { attrs = '', caption = 0 } = {}) {
  const glyph = text('0', cx - advance(F.display, size, '0') / 2, top + s / 2 + 0.355 * size, size, F.display, C.ground);
  const cap = caption ? text('exit', cx - measure('exit', F.sans, caption) / 2, top + s + caption + 6, caption, F.sans, C.muted) : '';
  return `<g${attrs}><rect x="${cx - s / 2}" y="${top}" width="${s}" height="${s}" fill="${C.accent}"/>${glyph}${cap}</g>`;
}
// A link cue images can carry: the destination in ink, underlined.
const link = (s, x, y, size) => text(s, x, y, size, F.mono, C.ink) + hline(x, x + measure(s, F.mono, size), y + 0.3 * size + 0.5, C.muted);

const CSS = `
@keyframes on{from{opacity:0}to{opacity:1}}
@keyframes snap{from{opacity:0;transform:translateY(12%) scale(1.08)}to{opacity:1;transform:none}}
@keyframes blink{50%{opacity:0}}
.k{animation:on .06s linear both}
.s{animation:snap .18s cubic-bezier(.2,.9,.2,1) both;transform-box:fill-box;transform-origin:50% 100%}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

function svg(w, h, label, body, css = '') {
  h = Math.round(h);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<style>${CSS}${css}</style>
<rect width="${w}" height="${h}" fill="${C.ground}"/>
${body}
</svg>
`;
}

// Three widths. GitHub's README column runs from ~310 px (phone) to ~846 px (desktop), and it
// narrows to ~390 px again when the profile sidebar appears at 768 px, so the media queries in
// README pick art by viewport to keep every variant between ~0.8x and ~1.3x.
// 10 columns: 1 to 9 hold content, 10 is the status gutter.
const V = {
  desktop: { W: 1000, M: 48, suffix: '' },
  mid: { W: 640, M: 32, suffix: '-mid', media: '(max-width: 1199px)' },
  phone: { W: 400, M: 20, suffix: '-phone', media: '(max-width: 600px), (min-width: 768px) and (max-width: 900px)' },
};
const grid = (v) => { const cw = (v.W - 2 * v.M) / 10; return { W: v.W, M: v.M, cw, col: (i) => v.M + (i - 1) * cw, end: v.W - v.M }; };
const top = (g) => hline(0, g.W, 0.5); // panels stack flush; this hairline is the only seam
const MONO_ADV = F.display.charToGlyph('0').advanceWidth / F.display.unitsPerEm; // 0.6
const CAP = F.display.tables.os2.sCapHeight / F.display.unitsPerEm; // 0.71
const title = (g, s, wide) => text(s, g.M, wide ? 52 : 40, wide ? 18 : 17, F.sansBold, C.ink);
// The chain's cell grid. `c` is one cell; nine hold the type, the tenth holds the exit codes.
function chainGrid(out, x, t, c, words, timing, chipS, chip0, caption) {
  const D = c / MONO_ADV, cap = CAP * D, R = 1.05 * D, bot = t + 2 * R;
  for (let i = 0; i <= 9; i++) out.push(vline(x + i * c, t, bot));
  for (const y of [t, t + R, bot]) out.push(hline(x, x + 9 * c, y));
  const y1 = t + 0.1 * D + cap, y2 = y1 + R, cx = x + 9.5 * c;
  out.push(typed(words[0], x, y1, D, F.display, C.ink, timing[0]));
  out.push(chip(cx, y1 - cap, chipS, chip0, { attrs: ` class="s" style="animation-delay:${timing[1]}s"`, caption }));
  out.push(typed('&&', x, y2, D, F.display, C.accent, timing[2], 0.04, 's'));
  out.push(typed(words[1], x + 3 * c, y2, D, F.display, C.ink, timing[3]));
  out.push(chip(cx, y2 - cap, chipS, chip0, { attrs: ` class="s" style="animation-delay:${timing[4]}s"`, caption }));
  return bot;
}

// ---------- hero ----------
const heroLabel = 'Saif Ali, saifdev9, Kolkata. Lead front-end developer && Jr. DevOps engineer at Indiminds. ' +
  `The two roles run as a shell chain: front-end, exit 0, && devops, exit 0. cat about: ${about}`;

function hero(v) {
  const g = grid(v), wide = v === V.desktop, out = [];
  const prompt = (x, y, size) => runs([['saif@kolkata', C.muted], [':~$', C.ink]], x, y, size, F.mono);
  // the prompt prints the about and waits; returns the y of the waiting prompt
  function session(x, y, w, ps, bs, lead) {
    const pw = measure('saif@kolkata:~$ ', F.mono, ps);
    out.push(at(0.78, prompt(x, y, ps)), typed('cat about', x + pw, y, ps, F.mono, C.ink, 0.82));
    y += lead + 6;
    const lines = wrap(about, w, bs, F.sans);
    out.push(at(1.1, lines.map((l, i) => amp(l, x, y + i * lead, bs, F.sans, C.ink)).join('')));
    y += (lines.length - 1) * lead + lead + 12;
    out.push(at(1.2, prompt(x, y, ps)));
    // three blinks from t=0, visible from 1.2 s, solid by 3.2 s: well under WCAG 2.2.2's 5 s
    out.push(at(1.2, `<rect class="cur" x="${x + pw}" y="${y - 0.75 * ps}" width="${0.6 * ps}" height="${ps}" fill="${C.ink}"/>`));
    return y;
  }
  const timing = [0.05, 0.3, 0.38, 0.5, 0.7];
  let H;
  if (wide) { // the chain block on the left, who and why on the right
    const c = g.cw / 2, rx = g.M + 10 * c + 48, rw = g.end - rx;
    out.push(text('Saif Ali', rx, 72, 26, F.sansBold, C.ink), text('Kolkata', g.end, 72, 14, F.sans, C.muted, { end: true }));
    out.push(amp('Lead front-end developer &&', rx, 100, 15, F.sans, C.muted), text('Jr. DevOps engineer, Indiminds', rx, 121, 15, F.sans, C.muted));
    const last = session(rx, 162, rw, 14, 16, 23);
    H = last + 40;
    const blockH = 2 * 1.05 * (c / MONO_ADV);
    chainGrid(out, g.M, (H - blockH) / 2, c, ['front-end', 'devops'], timing, 24, 15, 12);
  } else { // stacked: who, the chain, then the session
    const c = Math.min(g.cw, 40);
    out.push(text('Saif Ali', g.M, 42, 22, F.sansBold, C.ink), text('Kolkata', g.end, 42, 14, F.sans, C.muted, { end: true }));
    out.push(amp('Lead front-end developer &&', g.M, 68, 14, F.sans, C.muted), text('Jr. DevOps engineer, Indiminds', g.M, 88, 14, F.sans, C.muted));
    const bot = chainGrid(out, g.M, 108, c, ['front-end', 'devops'], timing, Math.round(c * 0.6), Math.round(c * 0.38), 0);
    H = session(g.M, bot + 38, g.end - g.M, 14, 15, 22) + 28;
  }
  return svg(g.W, H, heroLabel, out.join('\n'), '.cur{animation:blink 1.06s steps(1) 3}');
}

// ---------- contributions: an isometric year, one bar per day ----------
function contribLabel(days, st) {
  return `Contributions in the last year, from ${day(days[0].date)} to ${day(days.at(-1).date)}: ${fmt(st.total)} contributions ` +
    `on ${st.active} of ${days.length} days. Longest streak ${st.longest.len} days, ${day(st.longest.from)} to ${day(st.longest.to)}. ` +
    `Current streak ${st.current.len} days. Busiest day ${day(st.best.date)} with ${fmt(st.best.count)} contributions.`;
}
const shade = (hex, f) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');
const BAR = [0, 7, 16, 28, 46]; // bar height per GitHub level (its own quartile buckets), before scaling
// Screen vectors per week (shallow, down-right) and per day (steep, down-left), in units of k.
const WEEK = [15.2, 4.2], DAY = [-7.5, 8.6];
const poly = (pts, fill) => `<path fill="${fill}" d="M${pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join('L')}z"/>`;

// Draws the strip with its top-left ground corner at (x, y); returns the ground's lowest y.
function isoYear(out, weeks, x, y, k) {
  const ux = WEEK[0] * k, uy = WEEK[1] * k, vx = DAY[0] * k, vy = DAY[1] * k, gap = 0.16;
  const cells = [];
  weeks.forEach((w, wi) => w.forEach((d, di) => d && cells.push({ wi, di, d })));
  cells.sort((a, b) => a.wi * uy + a.di * vy - (b.wi * uy + b.di * vy)); // back to front
  for (const { wi, di, d } of cells) {
    const p = (a, b) => [x + (wi + a) * ux + (di + b) * vx, y + (wi + a) * uy + (di + b) * vy];
    const lo = gap / 2, hi = 1 - gap / 2;
    const A = p(lo, lo), B = p(hi, lo), Cc = p(hi, hi), Dd = p(lo, hi); // back, right, front, left
    const h = BAR[d.level] * k, up = (q) => [q[0], q[1] - h], col = HEAT[d.level];
    if (!h) { out.push(poly([A, B, Cc, Dd], col)); continue; }
    // the year builds up once, week by week (under 1.5 s)
    out.push(`<g class="b" style="animation-delay:${(0.15 + wi * 0.018).toFixed(3)}s">` +
      poly([Dd, Cc, up(Cc), up(Dd)], shade(col, 0.72)) + poly([B, Cc, up(Cc), up(B)], shade(col, 0.5)) + poly([A, B, Cc, Dd].map(up), col) + '</g>');
  }
  return y + weeks.length * uy + 7 * vy;
}
const barCSS = '@keyframes grow{from{transform:scaleY(0)}to{transform:none}}.b{animation:grow .35s cubic-bezier(.2,.9,.2,1) both;transform-box:fill-box;transform-origin:50% 100%}';

// A figure in the style of the panel: small label, big value, unit, muted note.
function figure(out, x, y, label, value, unit, note, size, end = false) {
  const vw = measure(value, F.sansBold, size), uw = measure(unit, F.sans, 15), w = vw + 8 + Math.max(uw, measure(note, F.sans, 13));
  const x0 = end ? x - w : x;
  out.push(text(label, end ? x - measure(label, F.sans, 14) : x0, y, 14, F.sans, C.muted));
  out.push(text(value, x0, y + size + 4, size, F.sansBold, C.ink));
  out.push(text(unit, x0 + vw + 8, y + size * 0.5 + 6, 15, F.sans, C.ink), text(note, x0 + vw + 8, y + size + 4, 13, F.sans, C.muted));
}

function contribPanel(v, days, st) {
  const g = grid(v), wide = v === V.desktop, phone = v === V.phone, out = [top(g)];
  const weeks = [];
  const first = Date.parse(days[0].date + 'T00:00:00Z');
  for (const d of days) {
    const i = Math.round((Date.parse(d.date + 'T00:00:00Z') - first) / 864e5);
    (weeks[Math.floor(i / 7)] ||= [])[i % 7] = d;
  }
  const shown = phone ? weeks.slice(-26) : weeks;
  const span = shown.length * WEEK[0] - 7 * DAY[0];
  const short = (iso) => day(iso).replace(/ \d{4}$/, '');
  const key = (y) => { // less to more
    let kx = g.end - measure('More', F.sans, 12);
    out.push(text('More', kx, y, 12, F.sans, C.muted));
    for (let i = HEAT.length - 1; i >= 0; i--) { kx -= 15; out.push(`<rect x="${kx}" y="${y - 10}" width="11" height="11" fill="${HEAT[i]}"/>`); }
    out.push(text('Less', kx - 6, y, 12, F.sans, C.muted, { end: true }));
  };
  out.push(title(g, 'Contributions in the last year', wide));

  if (wide) { // the strip runs corner to corner; the figures sit in the two empty corners
    const k = (g.end - g.M - 20) / span, x = g.M - 7 * DAY[0] * k, y = 96 + BAR[4] * k;
    const bottom = isoYear(out, shown, x, y, k);
    figure(out, g.end, 74, 'last 12 months', fmt(st.total), 'contributions', `${day(days[0].date)} to ${day(days.at(-1).date)}`, 40, true);
    figure(out, g.end, 152, 'busiest day', fmt(st.best.count), 'contributions', day(st.best.date), 40, true);
    const fy = bottom - 70;
    figure(out, g.M, fy, 'longest streak', String(st.longest.len), 'days', `${short(st.longest.from)} to ${short(st.longest.to)}`, 40);
    figure(out, g.M + 230, fy, 'current streak', String(st.current.len), 'days', st.current.len ? `${short(st.current.from)} to ${short(st.current.to)}` : 'starts today', 40);
    key(bottom + 30);
    return svg(g.W, bottom + 52, contribLabel(days, st), out.join('\n'), barCSS);
  }
  // compact: three figures in a row, then the strip
  const tw = (g.end - g.M) / 3;
  [[fmt(st.total), 'contributions'], [`${st.longest.len} days`, 'longest streak'], [fmt(st.best.count), `busiest, ${short(st.best.date)}`]]
    .forEach(([value, label], i) => out.push(text(value, g.M + i * tw, 82, 22, F.sansBold, C.ink), text(label, g.M + i * tw, 102, 12, F.sans, C.muted)));
  const k = (g.end - g.M) / span, x = g.M - 7 * DAY[0] * k, y = 124 + BAR[4] * k;
  const bottom = isoYear(out, shown, x, y, k);
  key(bottom + 26);
  out.push(text(phone ? 'Last 26 weeks' : `Active on ${st.active} of ${days.length} days`, g.M, bottom + 26, 12, F.sans, C.muted));
  return svg(g.W, bottom + 46, contribLabel(days, st), out.join('\n'), barCSS);
}

// ---------- languages: ranked bars, one hue, two columns ----------
const langLabel = (L) => `Languages across ${L.repos} public repos, by share of bytes, forks excluded: ` +
  L.rows.map((r) => `${r.name} ${(r.share * 100).toFixed(1)}%`).join(', ') + '.';
function bar(x, y, w, h, fill) { // square at the baseline, rounded data end
  const r = Math.min(4, w / 2, h / 2);
  return `<path fill="${fill}" d="M${x} ${y}H${(x + w - r).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${r}V${(y + h - r).toFixed(1)}a${r} ${r} 0 0 1-${r} ${r}H${x}z"/>`;
}
function langPanel(v, L) {
  const g = grid(v), wide = v === V.desktop, out = [top(g)];
  out.push(title(g, `Languages across ${L.repos} public repos`, wide));
  const note = 'Share of bytes, forks excluded';
  out.push(wide ? text(note, g.end, 52, 13, F.sans, C.muted, { end: true }) : text(note, g.M, 60, 13, F.sans, C.muted));
  const max = L.rows[0].share, perCol = Math.ceil(L.rows.length / 2);
  const gap = wide ? 44 : 20, colW = (g.end - g.M - gap) / 2;
  const pct = (r) => `${(r.share * 100).toFixed(r.share < 0.1 ? 1 : 0)}%`;
  const y0 = wide ? 92 : 94, pitch = wide ? 30 : 42;
  L.rows.forEach((r, i) => {
    const x = g.M + Math.floor(i / perCol) * (colW + gap), y = y0 + (i % perCol) * pitch;
    const fill = r.other ? C.muted : C.ink;
    if (wide) { // name, bar, value at the tip
      const bx = x + 110, bw = Math.max(2, (r.share / max) * (colW - 160));
      out.push(text(r.name, x, y, 14, F.sans, fill), bar(bx, y - 10, bw, 10, fill), text(pct(r), bx + bw + 8, y, 14, F.sansMed, C.ink));
    } else { // name and value on one line, the bar under them
      out.push(text(r.name, x, y, 14, F.sans, fill), text(pct(r), x + colW, y, 14, F.sansMed, C.ink, { end: true }));
      out.push(bar(x, y + 8, Math.max(2, (r.share / max) * colW), 6, fill));
    }
  });
  return svg(g.W, y0 + (perCol - 1) * pitch + (wide ? 30 : 34), langLabel(L), out.join('\n'));
}

// ---------- pipeline: write && release && ship ----------
const pipeLabel = 'How a change leaves my machine: ' + stages.map((st) => `${st.name}: ${st.tools.join(', ')}. ${st.note}`).join(' && ') + ' Exit 0.';
// The track fills once, resting at each stage, and reaches the exit chip, which answers 0. Its
// rest frame is the filled track: every stage passed. One run under 5 s (WCAG 2.2.2): an <img>
// SVG cannot offer a pause control, and Chrome does not pass reduced motion into it.
const trackCSS = (vertical) => {
  const s = (f) => `${vertical ? 'scaleY' : 'scaleX'}(${f})`;
  return `@keyframes fill{0%{transform:${s(0)}}28%,36%{transform:${s(1 / 3)}}60%,68%{transform:${s(2 / 3)}}92%,100%{transform:${s(1)}}}
@keyframes ok{0%,90%{opacity:.35}100%{opacity:1}}
.fill{transform-box:fill-box;transform-origin:0 0;animation:fill 4.5s cubic-bezier(.65,0,.35,1) .8s both}.ok{animation:ok 4.5s linear .8s both}`;
};
function pipeline(v) {
  const g = grid(v), out = [top(g)];
  const head = (st, i, x, y, size) => runs(i ? [['&& ', C.accent], [st.name, C.ink]] : [[st.name, C.ink]], x, y, size, F.display);
  if (v === V.desktop) {
    out.push(title(g, 'How a change leaves my machine', true));
    const hy = 104, rail = 124, colW = 3 * g.cw, chipS = 26;
    const chipL = g.col(10) + g.cw / 2 - chipS / 2; // same vertical as the exit codes elsewhere
    let bottom = 0;
    stages.forEach((st, i) => {
      const x = g.col(1 + 3 * i);
      out.push(head(st, i, x, hy, 26), vline(x, rail - 5, rail + 5, C.muted));
      let y = 158;
      for (const l of wrap(st.tools.join(', '), colW - 20, 15, F.sans)) { out.push(text(l, x, y, 15, F.sans, C.ink)); y += 21; }
      out.push(text(st.note, x, y + 4, 14, F.sans, C.muted));
      bottom = Math.max(bottom, y + 4);
    });
    out.push(hline(g.M, chipL, rail));
    out.push(`<rect class="fill" x="${g.M}" y="${rail - 1.5}" width="${chipL - g.M}" height="3" fill="${C.accent}"/>`);
    out.push(chip(chipL + chipS / 2, rail - chipS / 2, chipS, 16, { attrs: ' class="ok"' }));
    return svg(g.W, bottom + 30, pipeLabel, out.join('\n'), trackCSS(false));
  }
  // compact: stages stacked on a vertical rail that ends on the chip
  out.push(title(g, 'How a change leaves my machine', false));
  const x = g.M + 24, railX = g.M + 8, size = 21, w = g.end - x;
  let y = 84;
  const railTop = y - CAP * size;
  stages.forEach((st, i) => {
    out.push(head(st, i, x, y, size), hline(railX - 5, railX + 5, y - 0.4 * size, C.muted));
    y += 26;
    for (const l of wrap(st.tools.join(', '), w, 15, F.sans)) { out.push(text(l, x, y, 15, F.sans, C.ink)); y += 21; }
    out.push(text(st.note, x, y + 2, 13, F.sans, C.muted));
    y += 44;
  });
  const chipTop = y - 20, cs = 20;
  out.push(vline(railX, railTop, chipTop));
  out.push(`<rect class="fill" x="${railX - 1.5}" y="${railTop}" width="3" height="${chipTop - railTop}" fill="${C.accent}"/>`);
  out.push(chip(railX, chipTop, cs, 13, { attrs: ' class="ok"' }));
  return svg(g.W, chipTop + cs + 18, pipeLabel, out.join('\n'), trackCSS(true));
}

// ---------- work ----------
const workLabel = 'Repos that exited 0. Columns: repo, what it does, exit status.';
function workHead(v) {
  const g = grid(v), wide = v === V.desktop;
  const out = [top(g), title(g, 'Repos that exited 0', wide)];
  if (wide) {
    const y = 82;
    out.push(text('repo', g.col(1), y, 13, F.sans, C.muted), text('what it does', g.col(5), y, 13, F.sans, C.muted),
      text('exit', g.col(10) + g.cw / 2 - measure('exit', F.sans, 13) / 2, y, 13, F.sans, C.muted));
  }
  return svg(g.W, wide ? 96 : 54, workLabel, out.join('\n'));
}

const repoLabel = (r) => `${r.slug}: ${r.kind}. ${r.what} ${r.proof} Ships to ${r.to}, ${r.year}. github.com/${LOGIN}/${r.slug}.`;
function repoRow(r, v) {
  const g = grid(v), out = [hline(g.M, g.end, 0.5)];
  const url = `github.com/${LOGIN}/${r.slug}`;
  // kind, year and where it ships on one line; the exit code sits in the status column
  const meta = (x, y, size) => runs([[`${r.kind}, ${r.year}, ships to `, C.muted], [r.to, C.ink]], x, y, size, F.sans);
  if (v === V.desktop) {
    const size = r.lead ? 30 : 26, capTop = 28, ny = capTop + CAP * size;
    out.push(text(r.slug, g.M, ny, size, F.display, C.ink), meta(g.M, ny + 26, 14), link(url, g.M, ny + 50, 13));
    let y = capTop + 11;
    for (const l of wrap(r.what, 5 * g.cw - 28, 15, F.sans)) { out.push(text(l, g.col(5), y, 15, F.sans, C.ink)); y += 21; }
    for (const l of wrap(r.proof, 5 * g.cw - 28, 14, F.sans)) { out.push(text(l, g.col(5), y + 3, 14, F.sans, C.muted)); y += 20; }
    out.push(chip(g.col(10) + g.cw / 2, capTop, 24, 15));
    return svg(g.W, Math.max(ny + 50, y) + 26, repoLabel(r), out.join('\n'));
  }
  const size = r.lead ? 24 : 21, ny = 22 + CAP * size, cs = 20;
  out.push(text(r.slug, g.M, ny, size, F.display, C.ink), chip(g.end - cs / 2, ny - CAP * size, cs, 13), meta(g.M, ny + 22, 13));
  let y = ny + 48;
  for (const l of wrap(r.what, g.end - g.M, 15, F.sans)) { out.push(text(l, g.M, y, 15, F.sans, C.ink)); y += 21; }
  for (const l of wrap(r.proof, g.end - g.M, 13, F.sans)) { out.push(text(l, g.M, y + 2, 13, F.sans, C.muted)); y += 19; }
  out.push(link(url, g.M, y + 14, 13));
  return svg(g.W, y + 34, repoLabel(r), out.join('\n'));
}

// ---------- footer ----------
const footLabel = `exit 0. Email Saif at ${email}. logout. Saif Ali, Kolkata. Set in Geist and Geist Mono, drawn by tools/build.mjs.`;
function footer(v) {
  const g = grid(v), wide = v === V.desktop, out = [top(g)];
  const c = wide ? g.cw / 2 : Math.min(g.cw, 34), D = c / MONO_ADV, cap = CAP * D, R = 1.05 * D;
  const t = wide ? 34 : 26, y = t + 0.1 * D + cap;
  for (let i = 0; i <= 6; i++) out.push(vline(g.M + i * c, t, t + R));
  out.push(hline(g.M, g.M + 6 * c, t), hline(g.M, g.M + 6 * c, t + R));
  out.push(`<rect x="${g.M + 5 * c}" y="${t}" width="${c}" height="${R}" fill="${C.accent}"/>`);
  out.push(text('exit', g.M, y, D, F.display, C.ink), text('0', g.M + 5 * c, y, D, F.display, C.ground));
  // the last command before exit: write to me
  const mail = (x, y, size, full) => {
    const p = full ? 'saif@kolkata:~$ ' : '~$ ';
    return runs(full ? [['saif@kolkata', C.muted], [':~$ ', C.ink]] : [['~$ ', C.ink]], x, y, size, F.mono) + link(`mail ${email}`, x + measure(p, F.mono, size), y, size);
  };
  if (wide) {
    const x = g.M + 6 * c + 56;
    out.push(mail(x, t + 26, 15, true), text('logout', x, t + 52, 15, F.mono, C.muted));
    out.push(text('Saif Ali, Kolkata. Set in Geist and Geist Mono, drawn by tools/build.mjs.', x, t + 78, 13, F.sans, C.muted));
    return svg(g.W, t + R + 34, footLabel, out.join('\n'));
  }
  let by = t + R + 34;
  out.push(mail(g.M, by, 14, measure(`saif@kolkata:~$ mail ${email}`, F.mono, 14) <= g.end - g.M));
  by += 24;
  out.push(text('logout', g.M, by, 14, F.mono, C.muted), text('Saif Ali, Kolkata', g.end, by, 13, F.sans, C.muted, { end: true }));
  return svg(g.W, by + 24, footLabel, out.join('\n'));
}

// ---------- write ----------
const days = await contributions();
const st = streaks(days);
const langs = await languages();
const repoHref = `https://github.com/${LOGIN}?tab=repositories`;
const panels = [
  { name: 'hero', label: heroLabel, href: repoHref, draw: hero },
  { name: 'contributions', label: contribLabel(days, st), href: `https://github.com/${LOGIN}`, draw: (v) => contribPanel(v, days, st) },
  { name: 'pipeline', label: pipeLabel, href: `https://github.com/${LOGIN}/gitcloner/actions`, draw: pipeline },
  { name: 'languages', label: langLabel(langs), href: repoHref, draw: (v) => langPanel(v, langs) },
  { name: 'work', label: workLabel, href: repoHref, draw: workHead },
  ...repos.map((r) => ({ name: `repo-${r.slug}`, label: repoLabel(r), href: `https://github.com/${LOGIN}/${r.slug}`, draw: (v) => repoRow(r, v) })),
  { name: 'footer', label: footLabel, href: `mailto:${email}`, draw: footer },
];
const dir = here('../assets/');
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (f.endsWith('.svg')) unlinkSync(dir + f); // no panels left behind by removed repos
let bytes = 0;
for (const p of panels) for (const v of Object.values(V)) {
  const out = p.draw(v);
  writeFileSync(`${dir}${p.name}${v.suffix}.svg`, out);
  bytes += out.length;
}
console.log(`${panels.length * 3} panels, ${(bytes / 1024).toFixed(0)} KB; ${fmt(st.total)} contributions, ${langs.rows.length} languages`);

// README: one HTML block with no blank lines, every <img> align="top", so the panels join
// into one slab with no inline gaps between them.
const picture = (p) => `<a href="${p.href}">
<picture>
<source media="${V.phone.media}" srcset="assets/${p.name}-phone.svg">
<source media="${V.mid.media}" srcset="assets/${p.name}-mid.svg">
<img src="assets/${p.name}.svg" width="100%" align="top" alt="${esc(p.label)}">
</picture>
</a>`;
writeFileSync(here('../README.md'), `<!-- Generated by tools/build.mjs. Edit the DATA block there, then run npm run build in tools/. -->

${panels.map(picture).join('\n')}

<br>

<code>mail</code> [<code>${email}</code>](mailto:${email})<br>
<code>cd</code> ${repos.map((r) => `[<code>${r.slug}</code>](https://github.com/${LOGIN}/${r.slug})`).join(' · ')}

<details>
<summary><code>cat .secret</code></summary>
<br>

Why every panel is nine columns wide: \`front-end\` and \`&& devops\` are both nine characters long. In a monospace face that makes a perfect nine-column block, so every panel on this page sits on that grid, with a tenth column kept for exit codes. The panels are drawn by [\`tools/build.mjs\`](tools/build.mjs): Geist and Geist Mono turned into outlines, no fonts or scripts loaded. The contribution and language charts are redrawn every day by a GitHub Action.

</details>
`);
console.log('README.md written');

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
  { name: 'write', tools: ['React', 'TypeScript', 'Next.js', 'React Query, Supabase', 'Tailwind CSS', 'Rust and ratatui'],
    note: 'The interface comes first. If it fails, nothing after the && runs.' },
  { name: 'release', tools: ['GitHub Actions', 'semantic-release', 'cargo-dist', 'PowerShell', 'Bash'],
    note: 'A push to main tests, tags and publishes. 0.5.0 to 0.6.1 took four days.' },
  { name: 'ship', tools: ['AWS', 'Oracle Cloud', 'Vercel', 'GitHub Pages', 'GitHub Releases'],
    note: 'AWS and Oracle Cloud run the servers. gitcloner installs on macOS, Linux and Windows.' },
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
function streaks(days) {
  let longest = 0, run = 0;
  for (const d of days) { run = d.count ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1, current = 0;
  if (!days[i].count) i--; // today is not over yet
  while (i >= 0 && days[i].count) { current++; i--; }
  const best = days.reduce((a, d) => (d.count > a.count ? d : a));
  return { total: days.reduce((s, d) => s + d.count, 0), active: days.filter((d) => d.count).length, longest, current, best };
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
const title = (g, s, wide) => text(s, g.M, wide ? 64 : 44, wide ? 19 : 17, F.sansBold, C.ink);

// ---------- hero ----------
const heroLabel = 'Saif Ali, saifdev9, Kolkata. Lead front-end developer && Jr. DevOps engineer at Indiminds. ' +
  `The two roles run as a shell chain: front-end, exit 0, && devops, exit 0. cat about: ${about}`;

function hero(v) {
  const g = grid(v), wide = v === V.desktop;
  const D = g.cw / MONO_ADV, cap = CAP * D, R = 1.05 * D;
  const s = wide
    ? { name: 24, meta: 16, prompt: 16, body: 19, lead: 29, chip: 36, chip0: 22, cap: 14, top: 150 }
    : { name: 22, meta: 15, prompt: 15, body: 17, lead: 26, chip: v === V.phone ? 22 : Math.round(g.cw * 0.56),
        chip0: v === V.phone ? 14 : Math.round(g.cw * 0.36), cap: v === V.phone ? 0 : 13, top: 122 };
  const out = [];

  // identity and the bio exactly as written on GitHub, its && already yellow
  out.push(text('Saif Ali', g.M, wide ? 66 : 46, s.name, F.sansBold, C.ink));
  if (wide) {
    out.push(amp('Lead front-end developer && Jr. DevOps engineer, Indiminds', g.M, 96, s.meta, F.sans, C.muted));
    out.push(text('Kolkata', g.end, 66, s.meta, F.sansBold, C.ink, { end: true }));
    out.push(text('22.57°N 88.36°E', g.end, 96, s.meta, F.sans, C.muted, { end: true }));
  } else {
    out.push(amp('Lead front-end developer &&', g.M, 74, s.meta, F.sans, C.muted));
    out.push(text('Jr. DevOps engineer, Indiminds', g.M, 96, s.meta, F.sans, C.muted));
    out.push(text('Kolkata', g.end, 46, s.meta, F.sansBold, C.ink, { end: true }));
  }

  // the 9 x 2 cell block; the chain runs: type, exit 0, &&, type, exit 0
  const t = s.top, bot = t + 2 * R;
  for (let i = 1; i <= 10; i++) out.push(vline(g.col(i), t, bot));
  for (const y of [t, t + R, bot]) out.push(hline(g.M, g.col(10), y));
  const y1 = t + 0.1 * D + cap, y2 = y1 + R, cx = g.col(10) + g.cw / 2;
  out.push(typed('front-end', g.M, y1, D, F.display, C.ink, 0.05));
  out.push(chip(cx, y1 - cap, s.chip, s.chip0, { attrs: ' class="s" style="animation-delay:.3s"', caption: s.cap }));
  out.push(typed('&&', g.M, y2, D, F.display, C.accent, 0.38, 0.04, 's'));
  out.push(typed('devops', g.col(4), y2, D, F.display, C.ink, 0.5));
  out.push(chip(cx, y2 - cap, s.chip, s.chip0, { attrs: ' class="s" style="animation-delay:.7s"', caption: s.cap }));

  // the prompt comes back, prints the about, and waits
  const prompt = (y) => runs([['saif@kolkata', C.muted], [':~$', C.ink]], g.M, y, s.prompt, F.mono);
  const pw = measure('saif@kolkata:~$ ', F.mono, s.prompt);
  const lines = wrap(about, 9 * g.cw - 8, s.body, F.sans);
  let y = bot + (wide ? 62 : 46);
  out.push(at(0.78, prompt(y)), typed('cat about', g.M + pw, y, s.prompt, F.mono, C.ink, 0.82));
  y += s.lead + (wide ? 10 : 8);
  out.push(at(1.1, lines.map((l, i) => amp(l, g.M, y + i * s.lead, s.body, F.sans, C.ink)).join('')));
  y += lines.length * s.lead + (wide ? 16 : 12);
  out.push(at(1.2, prompt(y)));
  // three blinks from t=0, visible from 1.2 s, solid by 3.2 s: well under WCAG 2.2.2's 5 s
  out.push(at(1.2, `<rect class="cur" x="${g.M + pw}" y="${y - 0.75 * s.prompt}" width="${0.6 * s.prompt}" height="${s.prompt}" fill="${C.ink}"/>`));
  return svg(g.W, y + (wide ? 44 : 28), heroLabel, out.join('\n'), '.cur{animation:blink 1.06s steps(1) 3}');
}

// ---------- contributions: stat tiles over a one-hue heatmap ----------
function contribLabel(days, st) {
  return `Contributions in the last year, from ${day(days[0].date)} to ${day(days.at(-1).date)}: ${fmt(st.total)} contributions ` +
    `on ${st.active} of ${days.length} days. Longest streak ${st.longest} days, current streak ${st.current} days. ` +
    `Busiest day ${day(st.best.date)} with ${fmt(st.best.count)} contributions.`;
}
function contribPanel(v, days, st) {
  const g = grid(v), wide = v === V.desktop, phone = v === V.phone, out = [top(g)];
  out.push(title(g, 'Contributions in the last year', wide));
  const range = `${day(days[0].date)} to ${day(days.at(-1).date)}`;
  out.push(wide ? text(range, g.end, 64, 14, F.sans, C.muted, { end: true }) : text(range, g.M, 68, 14, F.sans, C.muted));
  // stat tiles: label, value (proportional figures), note
  const tiles = [
    ['contributions', fmt(st.total), `on ${st.active} of ${days.length} days`],
    ['longest streak', `${st.longest} days`, `current: ${st.current} days`],
    ['busiest day', fmt(st.best.count), day(st.best.date)],
  ];
  const perRow = phone ? 2 : 3, tw = (g.end - g.M) / perRow, vs = wide ? 36 : 30;
  let ty = wide ? 112 : 108;
  tiles.forEach(([label, value, note], i) => {
    const x = g.M + (i % perRow) * tw, y = ty + Math.floor(i / perRow) * (vs + 66);
    out.push(text(label, x, y, 14, F.sans, C.muted), text(value, x, y + vs + 8, vs, F.sansBold, C.ink), text(note, x, y + vs + 32, 14, F.sans, C.muted));
  });
  ty += Math.ceil(tiles.length / perRow) * (vs + 66) + (wide ? 22 : 16);

  // heatmap: a column per week, Sunday on top; phones get the last 26 weeks
  const weeks = [];
  const first = Date.parse(days[0].date + 'T00:00:00Z');
  for (const d of days) {
    const i = Math.round((Date.parse(d.date + 'T00:00:00Z') - first) / 864e5);
    (weeks[Math.floor(i / 7)] ||= [])[i % 7] = d;
  }
  const shown = phone ? weeks.slice(-26) : weeks;
  const labelW = phone ? 0 : 34, pitch = (g.end - g.M - labelW) / shown.length, cell = pitch - (phone ? 2.5 : 3);
  const x0 = g.M + labelW, y0 = ty + 12;
  let lastLabel = -9;
  shown.forEach((w, wi) => {
    const sunday = w.find(Boolean);
    const m = new Date(sunday.date + 'T00:00:00Z');
    const newMonth = wi === 0 ? m.getUTCDate() <= 7 : new Date(Date.parse(sunday.date + 'T00:00:00Z') - 7 * 864e5).getUTCMonth() !== m.getUTCMonth();
    if (newMonth && wi - lastLabel >= (phone ? 3 : 4)) {
      out.push(text(m.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).slice(0, 3), x0 + wi * pitch, ty, 12, F.sans, C.muted));
      lastLabel = wi;
    }
    w.forEach((d, di) => d && out.push(`<rect x="${(x0 + wi * pitch).toFixed(1)}" y="${(y0 + di * pitch).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${HEAT[d.level]}"/>`));
  });
  if (!phone) for (const [di, n] of [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]) out.push(text(n, g.M, y0 + di * pitch + cell * 0.78, 12, F.sans, C.muted));
  // scale key: less to more
  const ky = y0 + 7 * pitch + (wide ? 26 : 22), ks = wide ? 11 : 10;
  let kx = g.end - measure('More', F.sans, 12);
  out.push(text('More', kx, ky, 12, F.sans, C.muted));
  for (let i = HEAT.length - 1; i >= 0; i--) { kx -= ks + 4; out.push(`<rect x="${kx}" y="${ky - ks + 1}" width="${ks}" height="${ks}" fill="${HEAT[i]}"/>`); }
  out.push(text('Less', kx - 6, ky, 12, F.sans, C.muted, { end: true }));
  out.push(text(phone ? 'Squares show the last 26 weeks' : 'Each square is a day, brighter is busier', g.M, ky, 12, F.sans, C.muted));
  return svg(g.W, ky + (wide ? 34 : 24), contribLabel(days, st), out.join('\n'));
}

// ---------- languages: ranked bars, one hue ----------
const langLabel = (L) => `Languages across ${L.repos} public repos, by share of bytes, forks excluded: ` +
  L.rows.map((r) => `${r.name} ${(r.share * 100).toFixed(1)}%`).join(', ') + '.';
function bar(x, y, w, h, fill) { // square at the baseline, 4-unit rounded data end
  const r = Math.min(4, w / 2, h / 2);
  return `<path fill="${fill}" d="M${x} ${y}H${(x + w - r).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${r}V${(y + h - r).toFixed(1)}a${r} ${r} 0 0 1-${r} ${r}H${x}z"/>`;
}
function langPanel(v, L) {
  const g = grid(v), wide = v === V.desktop, out = [top(g)];
  out.push(title(g, `Languages across ${L.repos} public repos`, wide));
  const max = L.rows[0].share;
  const pct = (r) => `${(r.share * 100).toFixed(r.share < 0.1 ? 1 : 0)}%`;
  let y = wide ? 112 : 84;
  for (const r of L.rows) {
    const fill = r.other ? C.muted : C.ink;
    if (wide) { // name in cols 1-2, bars from col 3, value at the tip
      const bx = g.col(3), bw = Math.max(2, (r.share / max) * (g.col(9) - bx));
      out.push(text(r.name, g.M, y, 16, F.sans, r.other ? C.muted : C.ink));
      out.push(bar(bx, y - 11, bw, 12, fill), text(pct(r), bx + bw + 10, y, 15, F.sansMed, C.ink));
      y += 36;
    } else { // narrow: the bar drops under the name, value at the right
      out.push(text(r.name, g.M, y, 15, F.sans, r.other ? C.muted : C.ink), text(pct(r), g.end, y, 15, F.sansMed, C.ink, { end: true }));
      out.push(bar(g.M, y + 9, Math.max(2, (r.share / max) * (g.end - g.M)), 8, fill));
      y += 44;
    }
  }
  out.push(text('Share of bytes in public repos, forks excluded. Redrawn daily.', g.M, y + (wide ? 4 : 0), 13, F.sans, C.muted));
  return svg(g.W, y + (wide ? 40 : 30), langLabel(L), out.join('\n'));
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
    const hy = 146, rail = 176, colW = 3 * g.cw, chipS = 30;
    const chipL = g.col(10) + g.cw / 2 - chipS / 2; // same vertical as the hero's exit codes
    let bottom = 0;
    stages.forEach((st, i) => {
      const x = g.col(1 + 3 * i);
      out.push(head(st, i, x, hy, 34));
      st.tools.forEach((tool, j) => out.push(text(tool, x, 226 + j * 29, 17, F.sans, C.ink)));
      const ny = 226 + 6 * 29 + 12;
      wrap(st.note, colW - 12, 15, F.sans).forEach((l, j) => { out.push(text(l, x, ny + j * 22, 15, F.sans, C.muted)); bottom = Math.max(bottom, ny + j * 22); });
      out.push(vline(x, rail - 6, rail + 6, C.muted));
    });
    out.push(hline(g.M, chipL, rail));
    out.push(`<rect class="fill" x="${g.M}" y="${rail - 1.5}" width="${chipL - g.M}" height="3" fill="${C.accent}"/>`);
    out.push(chip(chipL + chipS / 2, rail - chipS / 2, chipS, 18, { attrs: ' class="ok"' }));
    return svg(g.W, bottom + 44, pipeLabel, out.join('\n'), trackCSS(false));
  }
  // compact: stages stacked on a vertical rail that ends on the chip
  out.push(title(g, 'How a change leaves my machine', false));
  const x = g.M + 26, railX = g.M + 10, size = 26, w = g.end - x;
  let y = 100;
  const railTop = y - CAP * size;
  stages.forEach((st, i) => {
    out.push(head(st, i, x, y, size));
    out.push(hline(railX - 5, railX + 5, y - 0.4 * size, C.muted));
    y += 30;
    for (const l of wrap(st.tools.join(', '), w, 16, F.sans)) { out.push(text(l, x, y, 16, F.sans, C.ink)); y += 23; }
    y += 4;
    for (const l of wrap(st.note, w, 15, F.sans)) { out.push(text(l, x, y, 15, F.sans, C.muted)); y += 21; }
    y += 34;
  });
  const chipTop = y - 14;
  out.push(vline(railX, railTop, chipTop));
  out.push(`<rect class="fill" x="${railX - 1.5}" y="${railTop}" width="3" height="${chipTop - railTop}" fill="${C.accent}"/>`);
  const cs = v === V.phone ? 22 : 28;
  out.push(chip(railX, chipTop, cs, Math.round(cs * 0.65), { attrs: ' class="ok"' }));
  return svg(g.W, chipTop + cs + 20, pipeLabel, out.join('\n'), trackCSS(true));
}

// ---------- work ----------
const workLabel = 'Repos that exited 0. Columns: repo and where it ships to, what it does, exit status.';
function workHead(v) {
  const g = grid(v), wide = v === V.desktop;
  const out = [top(g), title(g, 'Repos that exited 0', wide)];
  if (wide) {
    const y = 100;
    out.push(text('repo', g.col(1), y, 14, F.sans, C.muted), text('what it does', g.col(5), y, 14, F.sans, C.muted),
      text('exit', g.col(10) + g.cw / 2 - measure('exit', F.sans, 14) / 2, y, 14, F.sans, C.muted));
  }
  return svg(g.W, wide ? 118 : 64, workLabel, out.join('\n'));
}

const repoLabel = (r) => `${r.slug}: ${r.kind}. ${r.what} ${r.proof} Ships to ${r.to}, ${r.year}. github.com/${LOGIN}/${r.slug}.`;
function repoRow(r, v) {
  const g = grid(v), out = [hline(g.M, g.end, 0.5)];
  const url = `github.com/${LOGIN}/${r.slug}`;
  // the row's exit code sits in the hero's status column, backed by the proof line beside it
  const ships = (x, y, size) => runs([['ships to ', C.muted], [r.to, C.ink]], x, y, size, F.sans);
  if (v === V.desktop) {
    const size = r.lead ? 42 : 32, capTop = 30, ny = capTop + CAP * size, first = capTop + 13;
    out.push(text(r.slug, g.M, ny, size, F.display, C.ink));
    out.push(text(`${r.kind}, ${r.year}`, g.M, ny + 30, 15, F.sans, C.muted));
    out.push(ships(g.M, ny + 54, 15));
    let y = first;
    for (const l of wrap(r.what, 5 * g.cw - 28, 17, F.sans)) { out.push(text(l, g.col(5), y, 17, F.sans, C.ink)); y += 26; }
    y += 4;
    for (const l of wrap(r.proof, 5 * g.cw - 28, 15, F.sans)) { out.push(text(l, g.col(5), y, 15, F.sans, C.muted)); y += 22; }
    out.push(chip(g.col(10) + g.cw / 2, capTop, 30, 18));
    y = Math.max(y + 18, ny + 92);
    out.push(link(url, g.col(5), y, 15));
    return svg(g.W, y + 34, repoLabel(r), out.join('\n'));
  }
  const size = r.lead ? 30 : 24, ny = 26 + CAP * size, cs = v === V.phone ? 22 : 26;
  out.push(text(r.slug, g.M, ny, size, F.display, C.ink));
  out.push(chip(g.end - cs / 2, ny - CAP * size, cs, Math.round(cs * 0.65)));
  out.push(text(`${r.kind}, ${r.year}`, g.M, ny + 26, 15, F.sans, C.muted));
  out.push(ships(g.M, ny + 50, 15));
  let y = ny + 84;
  for (const l of wrap(r.what, g.end - g.M, 16, F.sans)) { out.push(text(l, g.M, y, 16, F.sans, C.ink)); y += 24; }
  y += 4;
  for (const l of wrap(r.proof, g.end - g.M, 15, F.sans)) { out.push(text(l, g.M, y, 15, F.sans, C.muted)); y += 22; }
  y += 12;
  out.push(link(url, g.M, y, 14));
  return svg(g.W, y + 28, repoLabel(r), out.join('\n'));
}

// ---------- footer ----------
const footLabel = `exit 0. Email Saif at ${email}. logout. Saif Ali, Kolkata. Set in Geist and Geist Mono, drawn by tools/build.mjs.`;
function footer(v) {
  const g = grid(v), wide = v === V.desktop, out = [top(g)];
  const D = g.cw / MONO_ADV, cap = CAP * D, R = 1.05 * D;
  const t = wide ? 48 : 28, y = t + 0.1 * D + cap;
  for (let i = 1; i <= 7; i++) out.push(vline(g.col(i), t, t + R));
  out.push(hline(g.M, g.col(7), t), hline(g.M, g.col(7), t + R));
  out.push(`<rect x="${g.col(6)}" y="${t}" width="${g.cw}" height="${R}" fill="${C.accent}"/>`);
  out.push(text('exit', g.M, y, D, F.display, C.ink), text('0', g.col(6), y, D, F.display, C.ground));
  const small = wide ? 16 : 14;
  // the last command before exit: write to me
  const long = measure(`saif@kolkata:~$ mail ${email}`, F.mono, small) <= g.end - g.M;
  let by = t + R + (wide ? 56 : 38);
  out.push(runs(long ? [['saif@kolkata', C.muted], [':~$ ', C.ink]] : [['~$ ', C.ink]], g.M, by, small, F.mono));
  out.push(link(`mail ${email}`, g.M + measure(long ? 'saif@kolkata:~$ ' : '~$ ', F.mono, small), by, small));
  by += wide ? 30 : 26;
  out.push(text('logout', g.M, by, small, F.mono, C.muted));
  const credit = ['Saif Ali, Kolkata', 'Set in Geist and Geist Mono', 'Drawn by tools/build.mjs'];
  if (wide) credit.forEach((c, i) => out.push(text(c, g.end, t + 18 + i * 26, 15, i ? F.sans : F.sansMed, i ? C.muted : C.ink, { end: true })));
  else out.push(text(credit[0], g.end, by, small, F.sans, C.muted, { end: true }));
  return svg(g.W, by + (wide ? 40 : 26), footLabel, out.join('\n'));
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

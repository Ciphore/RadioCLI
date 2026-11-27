import {TAU, clamp, fract, hash, kick, mix, noise, tri, type Pixels} from './cell-canvas.js';
import {lit, mirror, rain, ramp, scene, towers} from './cityscape-receivers.js';
import {disc, snowfall, starlight, wash} from './festive-receivers.js';

// A world tour in the manner of the cityscapes: one landmark, one kind of light, one thing moving. Fixed palettes; greys on mono.
type Tone = (hex: string) => string;
const pick = <T>(list: T[], n: number): T => list[((Math.floor(n) % list.length) + list.length) % list.length]!;
/** A symmetric solid drawn row by row: half-width as a function of height (0 at the top, 1 at the base). */
const solid = (p: Pixels, cx: number, base: number, tall: number, half: (v: number) => number, paint: (dx: number, v: number, w: number) => string | undefined): void => {
  for (let y = Math.round(base - tall); y < base; y++) { const v = (y - (base - tall)) / tall, w = half(v); for (let dx = -Math.round(w); dx <= Math.round(w); dx++) { const tone = paint(dx, v, w); if (tone) p.px(Math.round(cx) + dx, y, tone); } }
};
const sun = (p: Pixels, x: number, y: number, r: number, line: number, a: string, b: string): void => disc(p, x, y, r * 1.25, r, (_, dy) => y + dy * r < line ? mix(a, b, (dy + 1) / 2) : undefined);
const gradient = (p: Pixels, c: Tone, stops: string[], line: number, below: string): ((y: number) => string) => { const sky = (y: number): string => c(ramp(stops, y / line)); wash(p, y => y < line ? sky(y) : c(below)); return sky; };
const boat = (p: Pixels, x: number, y: number, hull: string, sail: string, tall = 4): void => { for (let dx = -4; dx <= 4; dx++) p.px(x + dx, y, hull); for (let s = 1; s <= tall; s++) for (let dx = 0; dx < tall + 1 - s; dx++) p.px(x + dx - 1, y - s, sail); };
const NIGHT = ['#04061a', '#141a48', '#2a2a66'], DUSK = ['#27205a', '#8a3a7a', '#f0683a', '#ffc86a'];

const hongKong = scene((p, t, c, accent) => { const w = Math.round(p.ph * 0.7), sky = gradient(p, c, NIGHT, w, '#05060f'); starlight(p, t, w * 0.4, c('#ffffff'), sky(0));
  for (let x = 0; x < p.pw; x++) for (let y = w - Math.round(p.ph * (0.3 + 0.22 * noise(x * 0.03, 2))); y < w; y++) p.px(x, y, c('#0c1024'));
  towers(p, w, 71, 0.2, 0.6, (n, dx, y, top) => y === top ? c(pick(['#35e8ff', '#ff3fa4', '#ffd23a', accent], n)) : lit(n, dx, y, w, 0.7) ? c(n % 3 ? '#ffd98a' : '#bfe8ff') : c('#080a16'));
  for (let beam = 0; beam < 5; beam++) { const bx = p.pw * (0.15 + beam * 0.18), a = Math.sin(t * 0.6 + beam * 1.3) * 0.5; for (let s = 0; s < w * 0.6; s++) { const x = Math.round(bx + Math.sin(a) * s), y = Math.round(w * 0.55 - Math.cos(a) * s); if (y > 0) p.px(x, y, mix(p.at(x, y) ?? sky(y), c(pick(['#35e8ff', '#b0ff7a', '#ff5ad8'], beam)), 0.5 * (1 - s / (w * 0.6)))); } }
  mirror(p, w, t, c('#05060f'), 0.65); boat(p, Math.round(fract(t * 0.014) * (p.pw + 20)) - 10, w + 3, c('#3a1a10'), c('#d8281e'), 5); });

const timesSquare = scene((p, t, c, accent) => { const g = Math.round(p.ph * 0.8); wash(p, y => c(mix('#0a0a18', '#1a1430', y / p.ph))); const ads = ['#ff2d55', '#35d0ff', '#ffd60a', '#30d158', '#bf5af2', accent];
  towers(p, g, 911, 0.5, 0.95, (n, dx, y, top, tw) => { const board = Math.floor((y - top) / 5), id = n * 7 + board, phase = Math.floor(t * (1 + hash(id, 1) * 2) + hash(id, 2) * 9), kind = Math.floor(hash(id, 3) * 4);
    if (dx === 0 || dx === tw - 1 || (y - top) % 5 === 4) return c('#07070f');
    const u = dx / tw, v = ((y - top) % 5) / 4; return kind === 0 ? c(pick(ads, phase + Math.floor(u * 3))) : kind === 1 ? ((dx + phase) % 3 ? c(pick(ads, id)) : c('#ffffff')) : kind === 2 ? mix(c(pick(ads, id)), c('#000000'), v > fract(t * 0.5 + u) ? 0.6 : 0) : (Math.floor(u * 4 + v * 2 + phase) % 2 ? c(pick(ads, id + 2)) : c('#101018')); });
  for (let y = g; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, mix(c('#0a0a12'), p.at(x, g - 1 - (y - g) * 2) ?? c('#0a0a12'), 0.4));
  for (let cab = 0; cab < 5; cab++) { const x = Math.round((hash(cab, 1) * p.pw + t * (9 + cab * 3) * (cab % 2 ? 1 : -1)) % (p.pw + 12) + p.pw + 12) % (p.pw + 12) - 6; for (let dx = 0; dx < 5; dx++) p.px(x + dx, g + 1 + (cab % 2), c('#ffd21a')); } });

const seattle = scene((p, t, c) => { const g = Math.round(p.ph * 0.82), sky = gradient(p, c, ['#39465a', '#5a6a7e', '#8a96a4'], g, '#1c2a2e');
  for (let x = 0; x < p.pw; x++) { const m = g - Math.round(p.ph * 0.5 * Math.max(0, 1 - Math.abs(x - p.pw * 0.78) / (p.pw * 0.22)) ** 1.3); for (let y = m; y < g; y++) p.px(x, y, y < m + p.ph * 0.12 ? c('#eef2f6') : mix(c('#5a6a7e'), sky(y), 0.4)); }
  towers(p, g, 23, 0.14, 0.46, (n, dx, y) => lit(n, dx, y, g, 0.45) ? c('#ffd98a') : c('#1c2634'));
  const cx = Math.round(p.pw * 0.3), top = Math.round(p.ph * 0.1); for (let y = top; y < g; y++) { const v = (y - top) / (g - top), half = v < 0.1 ? 0 : v < 0.16 ? 7 - Math.abs(v - 0.13) * 90 : v < 0.2 ? 3 : 0.8 + (v - 0.2) ** 2 * 5; for (let dx = -Math.round(half); dx <= half; dx++) p.px(cx + dx, y, v < 0.2 && v > 0.1 ? (Math.abs(v - 0.13) < 0.012 ? c('#ffe9a0') : c('#e8ecf0')) : Math.abs(dx) >= Math.round(half) || v < 0.1 ? c('#d8dce2') : sky(y)); }
  if (fract(t * 0.5) < 0.5) p.px(cx, top - 1, c('#ff3030'));
  for (let x = 0; x < p.pw; x++) for (let y = g; y < p.ph; y++) p.px(x, y, c(noise(x * 0.3 + t, y * 2, 3) > 0.6 ? '#3a4a52' : '#1c2a2e')); boat(p, Math.round(fract(t * 0.01 + 0.4) * (p.pw + 20)) - 10, g + 2, c('#f2f2f2'), c('#2a6a4a'), 2); rain(p, t, c('#c8d2dc')); });

const shanghai = scene((p, t, c, accent) => { const w = Math.round(p.ph * 0.72); gradient(p, c, ['#0a0420', '#2a0a4a', '#5a1a6a'], w, '#06040f'); const glow = ['#ff3fa4', '#35e8ff', '#a45cff', accent];
  towers(p, w, 404, 0.2, 0.62, (n, dx, y, top, tw) => dx === 0 || dx === tw - 1 || y === top ? mix(c(pick(glow, n)), c('#000000'), 0.5 * tri(t * 0.3 + n * 0.2)) : lit(n, dx, y, w, 0.5) ? c('#ffe9c0') : c('#0c0818'));
  const cx = p.pw * 0.36, top = 2; for (let y = top; y < w; y++) for (const leg of [-1, 0, 1]) p.px(Math.round(cx + leg * (y - top) / (w - top) * 5), y, c('#c8ccd6'));
  for (const [v, r] of [[0.3, 0.13], [0.62, 0.17], [0.14, 0.05]] as const) disc(p, cx, top + (w - top) * v, p.ph * r * 1.3, p.ph * r, (dx, dy) => mix(c('#ff3fa4'), c('#ffffff'), clamp(0.6 - dx * 0.3 - dy * 0.5) * (0.6 + 0.4 * kick(t))));
  solid(p, p.pw * 0.66, w, w - 2, v => 1 + v * 4 + Math.sin(v * 9) * 0.6, (dx, v, wd) => Math.abs(dx) > wd - 1 ? c('#35e8ff') : fract(v * 12 - t * 0.5) < 0.2 ? c('#bfe8ff') : c('#141a3a'));
  mirror(p, w, t, c('#06040f'), 0.7); for (let b = 0; b < 2; b++) boat(p, Math.round(fract(t * 0.012 + b * 0.5) * (p.pw + 20)) - 10, w + 2 + b * 3, c('#14101c'), c(pick(glow, b)), 1); });

const cairo = scene((p, t, c) => { const g = Math.round(p.ph * 0.8); gradient(p, c, ['#3a2a6a', '#c0507a', '#ff9a4a', '#ffe08a'], g, '#b88a4a'); sun(p, p.pw * 0.3, g - p.ph * 0.14, p.ph * 0.2, g, c('#fff6c0'), c('#ff9a3a'));
  for (const [at, size] of [[0.5, 0.62], [0.74, 0.46], [0.9, 0.26]] as const) solid(p, p.pw * at, g, p.ph * size, v => v * p.ph * size * 1.05, (dx, v) => mix(c(dx < 0 ? '#c8904a' : '#6a4426'), c('#000000'), (Math.floor(v * 16) % 2) * 0.08));
  for (let x = 0; x < p.pw; x++) for (let y = g - Math.round(2 + 2 * Math.sin(x * 0.05 + 1)); y < p.ph; y++) p.px(x, y, c(mix('#e0b060', '#8a5a2a', (y - g + 4) / (p.ph - g + 4))));
  for (let camel = 0; camel < 4; camel++) { const x = Math.round((t * 2 + camel * 9) % (p.pw + 20)) - 10, y = g - 1; for (let dx = 0; dx < 5; dx++) p.px(x + dx, y - 2, c('#2a1808')); p.px(x + 2, y - 3, c('#2a1808')); p.px(x + 5, y - 3, c('#2a1808')); p.px(x + 6, y - 4, c('#2a1808')); for (const leg of [0, 4]) p.px(x + leg + (Math.floor(t * 3 + camel) % 2), y - 1, c('#2a1808')); }
  for (let palm = 0; palm < 3; palm++) { const x = Math.round(p.pw * (0.06 + palm * 0.07)), top = g - Math.round(p.ph * 0.3); for (let y = top; y < g; y++) p.px(x, y, c('#2a1808')); for (let f = -3; f <= 3; f++) p.px(x + f, top + Math.abs(f) - 1, c('#2a1808')); } });

const santorini = scene((p, t, c) => { const w = Math.round(p.ph * 0.74); gradient(p, c, ['#2a5ab8', '#6aa0e8', '#ffd0a0', '#ffb070'], w, '#1a4a9a'); sun(p, p.pw * 0.2, w - 1, p.ph * 0.15, w, c('#fff6d0'), c('#ff9a4a'));
  for (let x = Math.round(p.pw * 0.35); x < p.pw; x++) { const cliff = w - Math.round(p.ph * 0.5 * clamp((x - p.pw * 0.35) / (p.pw * 0.3)) ** 0.6); for (let y = cliff; y < w; y++) p.px(x, y, c(mix('#8a6a5a', '#4a3a3a', (y - cliff) / (w - cliff)))); }
  for (let n = 0; n < p.pw / 5; n++) { const x = Math.round(p.pw * 0.4 + hash(n, 1) * p.pw * 0.58), base = w - Math.round(p.ph * (0.12 + 0.36 * hash(n, 2)) * clamp((x - p.pw * 0.35) / (p.pw * 0.3))), bw = 3 + Math.floor(hash(n, 3) * 4), bh = 2 + Math.floor(hash(n, 4) * 3);
    for (let dx = 0; dx < bw; dx++) for (let dy = 0; dy < bh; dy++) p.px(x + dx, base - dy, dx === 1 && dy === 0 ? c('#2a5ab8') : c(dy === bh - 1 ? '#ffffff' : '#f2f0ea')); if (n % 3 === 0) disc(p, x + bw / 2, base - bh, bw * 0.55, 1.6, (_, dy) => dy < 0.3 ? c('#2a6ad8') : undefined); }
  const mx = p.pw * 0.55, my = w - p.ph * 0.4; for (let blade = 0; blade < 4; blade++) { const a = t * 0.8 + blade * TAU / 4; for (let s = 0; s < 5; s++) p.px(Math.round(mx + Math.cos(a) * s * 1.3), Math.round(my + Math.sin(a) * s), c('#ffffff')); }
  mirror(p, w, t, c('#1a4a9a'), 0.45); boat(p, Math.round(p.pw * 0.2 + Math.sin(t * 0.1) * 6), w + 3, c('#f2f2f2'), c('#ffffff'), 5); });

const moscow = scene((p, t, c) => { const g = Math.round(p.ph * 0.84), sky = gradient(p, c, ['#101a3a', '#2a3466', '#5a5a8a'], g, '#e6ecf5'); starlight(p, t, g * 0.5, c('#ffffff'), sky(0));
  const domes = [['#e0281e', '#ffffff'], ['#2a6ad8', '#ffd23a'], ['#2f9a4a', '#ffd23a'], ['#ffd23a', '#e0281e'], ['#8a2a8a', '#35d0ff']], cx = p.pw / 2;
  for (let n = -2; n <= 2; n++) { const x = cx + n * p.ph * 0.28, tall = p.ph * (n === 0 ? 0.72 : 0.5 - Math.abs(n) * 0.05), r = p.ph * (n === 0 ? 0.09 : 0.11), pair = pick(domes, n + 2);
    solid(p, x, g, tall * 0.62, () => r * 0.7, (dx, v) => dx % 2 === 0 && Math.floor(v * 8) % 2 ? c('#ffd98a') : c(v < 0.06 ? '#f2f6fb' : '#b8482e'));
    // The onion: a bulb wider than its tower that tapers to a point, striped in a twist.
    solid(p, x, g - tall * 0.62, tall * 0.38, v => v < 0.25 ? v * 1.2 : Math.sin(Math.min(1, (v - 0.2) * 1.25) * Math.PI * 0.82) * r * 1.5 + 0.4, (dx, v, wd) => Math.floor((dx / (wd + 0.1) + v * 2) * 3 + 9) % 2 ? c(pair[0]!) : c(pair[1]!)); p.px(Math.round(x), Math.round(g - tall) - 1, c('#ffd23a')); }
  towers(p, g, 66, 0.08, 0.2, (n, dx, y, top) => y === top ? c('#f2f6fb') : lit(n, dx, y, g, 0.5) ? c('#ffd98a') : c('#3a2a2a'));
  for (let x = 0; x < p.pw; x++) for (let y = g - Math.round(noise(x * 0.08, 3) * 2); y < p.ph; y++) p.px(x, y, c(mix('#f4f7fb', '#b3c0d6', (y - g + 2) / (p.ph - g + 2)))); snowfall(p, t, Math.round(p.pw * p.ph / 24), c('#ffffff')); });

const vegas = scene((p, t, c, accent) => { const g = Math.round(p.ph * 0.78); wash(p, y => c(mix('#0a0618', '#2a1040', y / p.ph))); starlight(p, t, g * 0.3, c('#ffffff'), c('#0a0618')); const neon = ['#ff2d78', '#ffd60a', '#35e8ff', '#7dff5a', '#ff7a1a', accent];
  towers(p, g, 777, 0.24, 0.66, (n, dx, y, top, tw) => { const chase = (dx + (y - top) + Math.floor(t * 8)) % 4 === 0; return y === top || dx === 0 || dx === tw - 1 ? (chase ? c('#ffffff') : c(pick(neon, n))) : (y - top) % 6 === 3 ? c(pick(neon, n + Math.floor(t * 2 + dx / 3))) : lit(n, dx, y, g, 0.4) ? c('#ffe9a0') : c('#10081c'); });
  solid(p, p.pw * 0.5, g, p.ph * 0.5, v => v * p.ph * 0.45, (dx, v) => fract(v * 8) < 0.2 ? c('#ffd60a') : mix(c('#1a1430'), c('#35e8ff'), 0.2 + 0.2 * Math.sin(dx * 0.6 + t)));
  for (let s = 0; s < g * 0.9; s++) { const y = Math.round(g - p.ph * 0.5 - s); if (y >= 0) p.px(Math.round(p.pw * 0.5), y, mix(p.at(Math.round(p.pw * 0.5), y) ?? '#000000', '#ffffff', 0.5)); }
  for (let jet = 0; jet < p.pw / 4; jet++) { const x = jet * 4 + 2, tall = (0.5 + 0.5 * Math.sin(t * 2 + jet * 0.5)) * p.ph * 0.2 * (0.6 + 0.4 * kick(t)); for (let s = 0; s < tall; s++) p.px(x, g - 1 - s, mix(c('#35e8ff'), '#ffffff', s / (tall + 1))); }
  for (let y = g; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, mix(c('#0a0618'), p.at(x, g - 1 - (y - g) * 2) ?? c('#0a0618'), 0.5)); });

const istanbul = scene((p, t, c) => { const w = Math.round(p.ph * 0.72); gradient(p, c, DUSK, w, '#2a2a4a'); sun(p, p.pw * 0.78, w - p.ph * 0.06, p.ph * 0.15, w, c('#fff3b0'), c('#ff7a4a')); const ink = c('#1c1228');
  for (let x = 0; x < p.pw; x++) for (let y = w - Math.round(p.ph * (0.1 + 0.06 * noise(x * 0.08, 4))); y < w; y++) p.px(x, y, ink);
  const cx = p.pw * 0.42, r = p.ph * 0.2; disc(p, cx, w - p.ph * 0.12, r * 1.5, r, (_, dy) => dy > 0 ? undefined : ink); for (const side of [-1, 1]) disc(p, cx + side * r * 1.5, w - p.ph * 0.1, r * 0.8, r * 0.55, (_, dy) => dy > 0 ? undefined : ink);
  for (const at of [-2.6, -1.9, 1.9, 2.6]) { const x = Math.round(cx + at * r), top = w - Math.round(p.ph * 0.56); for (let y = top; y < w; y++) p.px(x, y, ink); p.px(x, top - 1, c('#ffd23a')); for (const ring of [0.3, 0.55]) { const y = Math.round(top + (w - top) * ring); p.px(x - 1, y, ink); p.px(x + 1, y, ink); } }
  for (let lamp = 0; lamp < 9; lamp++) p.px(Math.round(cx - r * 1.2 + lamp * r * 0.3), w - Math.round(p.ph * 0.1), mix(ink, c('#ffd98a'), 0.6 + 0.4 * noise(t, lamp)));
  mirror(p, w, t, c('#2a2a4a'), 0.55); boat(p, Math.round(fract(t * 0.013) * (p.pw + 20)) - 10, w + 3, ink, c('#f2ead8'), 2);
  for (let gull = 0; gull < 5; gull++) { const x = Math.round(fract(t * 0.03 + gull * 0.21) * (p.pw + 10)) - 5, y = Math.round(p.ph * 0.2 + gull * 1.5 + Math.sin(t + gull) * 1.5), up = Math.sin(t * 6 + gull) > 0 ? -1 : 0; p.px(x - 1, y + up, ink); p.px(x, y, ink); p.px(x + 1, y + up, ink); } });

const kyoto = scene((p, t, c) => { const g = Math.round(p.ph * 0.84); gradient(p, c, ['#1a1a4a', '#5a3a7a', '#e87a6a', '#ffc890'], g, '#1c1418');
  for (let x = 0; x < p.pw; x++) for (let y = g - Math.round(p.ph * (0.2 + 0.14 * noise(x * 0.03, 1))); y < g; y++) p.px(x, y, c('#3a2a4a'));
  const cx = Math.round(p.pw * 0.5), tiers = 5, tierH = (g - 3) / (tiers + 0.6);
  for (let tier = 0; tier < tiers; tier++) { const y0 = Math.round(g - (tier + 1) * tierH), wide = Math.round(p.ph * (0.34 - tier * 0.045));
    for (let dx = -wide; dx <= wide; dx++) { const lift = Math.abs(dx) > wide - 3 ? -(Math.abs(dx) - wide + 3) : 0; p.px(cx + dx, y0 + lift, c('#2a1414')); p.px(cx + dx, y0 + 1 + lift, c('#5a2424')); }
    for (let dx = -Math.round(wide * 0.5); dx <= wide * 0.5; dx++) for (let y = y0 + 2; y < y0 + tierH; y++) p.px(cx + dx, y, dx % 3 === 0 ? c('#b83a2a') : c(hash(tier * 9 + dx, 3) > 0.4 ? '#ffd98a' : '#f2e0c0')); }
  for (let s = 1; s < 5; s++) p.px(cx, Math.round(g - tiers * tierH) - s, c('#ffd23a'));
  for (let lamp = 0; lamp < p.pw / 7; lamp++) { const x = lamp * 7 + 3; if (Math.abs(x - cx) < p.ph * 0.4) continue; for (let y = g - 5; y < g; y++) p.px(x, y, c('#1c1418')); for (let dy = 0; dy < 2; dy++) for (let dx = -1; dx <= 1; dx++) p.px(x + dx, g - 7 + dy, mix(c('#e0281e'), c('#ffd98a'), 0.3 + 0.4 * noise(t * 2, lamp))); }
  for (let leaf = 0; leaf < p.pw * p.ph / 60; leaf++) { const fall = fract(hash(leaf, 5) + t * (0.04 + 0.05 * hash(leaf, 6))); p.px(Math.floor(((hash(leaf, 7) * p.pw + Math.sin(t + leaf) * 3 + fall * 10) % p.pw + p.pw) % p.pw), Math.floor(fall * p.ph), c(pick(['#e0281e', '#ff7a1a', '#ffb02a'], leaf))); } });

const cabin = scene((p, t, c, accent) => { const g = Math.round(p.ph * 0.78), sky = gradient(p, c, ['#04081a', '#0c1838', '#16284a'], g, '#dfe8f4'); starlight(p, t, g * 0.7, c('#ffffff'), sky(0));
  for (let x = 0; x < p.pw; x++) for (let y = 0; y < g * 0.6; y++) { const hem = g * (0.25 + 0.2 * noise(x * 0.04, t * 0.1, 3)), above = hem - y; if (above > -1 && above < g * 0.4) p.px(x, y, mix(p.at(x, y) ?? sky(y), mix(c('#3dff9a'), accent, clamp(above / (g * 0.3))), (0.3 + 0.5 * noise(x * 0.5, t * 0.8, 5)) * Math.exp(-above / (g * 0.16)))); }
  for (let fir = 0; fir < p.pw / 6; fir++) { const x = Math.round((fir + hash(fir, 1)) * 6), tall = Math.round(p.ph * (0.2 + 0.2 * hash(fir, 2))); if (Math.abs(x - p.pw * 0.5) < p.ph * 0.45) continue; for (let row = 0; row < tall; row++) for (let dx = -Math.floor(row / 3); dx <= Math.floor(row / 3); dx++) p.px(x + dx, g - tall + row, row % 4 === 0 ? c('#e6ecf5') : c('#0c1c1c')); }
  const cx = Math.round(p.pw * 0.5), cw = Math.round(p.ph * 0.4), ch = Math.round(p.ph * 0.22);
  for (let dx = -cw - 2; dx <= cw + 2; dx++) { const roof = g - ch - Math.round((1 - Math.abs(dx) / (cw + 2)) * ch * 0.8); for (let y = roof; y < g; y++) p.px(cx + dx, y, y < roof + 2 ? c('#f4f7fb') : y < g - ch ? c('#3a241a') : Math.abs(dx) > cw ? (p.at(cx + dx, y) ?? sky(y)) : (g - y) % 2 ? c('#6b4428') : c('#5a381f')); }
  for (const wx of [-cw * 0.55, cw * 0.4]) for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 5; dx++) p.px(Math.round(cx + wx) + dx, g - ch + 3 + dy, dx === 2 || dy === 2 ? c('#3a241a') : mix(c('#ff9a3a'), c('#ffe9a0'), noise(t * 3, dx + dy)));
  for (let puff = 0; puff < 9; puff++) { const age = fract(t * 0.2 + puff / 9), x = cx + cw * 0.6 + age * 6 + Math.sin(age * 8) * 2, y = g - ch * 1.7 - age * p.ph * 0.35; if (y > 0) p.px(Math.round(x), Math.round(y), mix(p.at(Math.round(x), Math.round(y)) ?? sky(y), '#ffffff', 0.5 * (1 - age))); }
  for (let x = 0; x < p.pw; x++) for (let y = g - Math.round(noise(x * 0.06, 9) * 2); y < p.ph; y++) p.px(x, y, c(mix('#f4f7fb', '#9fb0d0', (y - g + 2) / (p.ph - g + 2)))); snowfall(p, t, Math.round(p.pw * p.ph / 60), c('#ffffff')); });

const stormLight = scene((p, t, c) => { const w = Math.round(p.ph * 0.7), strike = Math.floor(t / 4), flash = hash(strike, 1) > 0.4 ? Math.max(0, 1 - (t - strike * 4) * 4) : 0, sky = (y: number): string => mix(c(mix('#0a0e1a', '#232c40', y / w)), c('#d0d8ff'), flash * 0.5);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, y < w ? mix(sky(y), c('#05070c'), noise(x * 0.04 + t * 0.1, y * 0.2, 2) > 0.55 ? 0.5 : 0) : c('#0a1420'));
  const lx = Math.round(p.pw * 0.28), top = Math.round(p.ph * 0.14), lamp = top + 2, sweep = t * 0.9;
  for (let x = 0; x < p.pw; x++) for (let y = 0; y < w; y++) { const a = Math.atan2((y - lamp) * 1.3, x - lx), d = Math.hypot(x - lx, y - lamp); for (const dir of [0, Math.PI]) { const off = Math.abs(((a - Math.cos(sweep) * 0.5 - dir + Math.PI * 3) % TAU) - Math.PI); if (off < 0.09 && d > 2) p.px(x, y, mix(p.at(x, y)!, c('#fff3b0'), 0.55 * Math.abs(Math.sin(sweep)) * (1 - off / 0.09) * clamp(1.2 - d / p.pw))); } }
  for (let x = 0; x < p.pw * 0.5; x++) for (let y = w - Math.round(p.ph * 0.16 * Math.max(0, 1 - Math.abs(x - lx) / (p.pw * 0.22))); y < w + 2; y++) p.px(x, y, c('#14100c'));
  solid(p, lx, w - Math.round(p.ph * 0.14), w - p.ph * 0.14 - top - 3, v => 1.5 + v * 2.5, (_, v) => Math.floor(v * 5) % 2 ? c('#e0281e') : c('#f2f2f2')); for (let dx = -3; dx <= 3; dx++) { p.px(lx + dx, top + 3, c('#14141c')); if (Math.abs(dx) < 2) { p.px(lx + dx, lamp, c('#fff3b0')); p.px(lx + dx, top, c('#14141c')); } }
  for (let y = w; y < p.ph; y++) for (let x = 0; x < p.pw; x++) { const crest = Math.sin(x * 0.12 + t * 2 + y * 0.9) + Math.sin(x * 0.05 - t * 1.3 + y * 0.4); if (x > p.pw * 0.5 || y > w + 1) p.px(x, y, crest > 1.2 ? c('#e6f0f8') : mix(c('#0a1420'), c('#1c3a52'), clamp(0.5 + crest * 0.3) + flash * 0.3)); }
  rain(p, t, c('#b9c6e6')); });

const houndstooth = scene((p, t, c, accent) => { const s = Math.max(4, Math.round(p.ph / 5)), slide = Math.floor(t * 3), a = c('#f2ead8'), b = mix(accent, '#000000', 0.55);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) { const u = (Math.floor((x + slide) / 1.4) % (s * 2) + s * 2) % (s * 2), v = ((y + Math.floor(slide / 2)) % (s * 2) + s * 2) % (s * 2), qx = u < s, qy = v < s, diag = ((u + v) % s) < s / 2;
    // Four quarters: one solid dark, one solid light, and two cut on the diagonal, which makes the broken check.
    p.px(x, y, mix(qx && qy ? b : !qx && !qy ? a : diag ? b : a, '#000000', ((x + y) & 1) * 0.06)); } });

const popCity = scene((p, t, c, accent) => { const base = Math.round(p.ph * 0.82), flats = ['#ffd800', '#e8102a', '#1a4fd8', accent].map(c), ink = c('#0a0a10'), dot = (x: number, y: number, size: number): boolean => { const cx = Math.round(x / 4) * 4, cy = Math.round(y / 3) * 3 + (Math.round(x / 4) % 2); return Math.hypot((x - cx) / 1.3, y - cy) < size; };
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, dot(x, y, 0.5 + 1.1 * (1 - y / base)) && y < base ? c('#1a4fd8') : c('#f6f2e4'));
  const sx = p.pw * 0.74, sy = p.ph * 0.26, sr = p.ph * (0.17 + 0.02 * kick(t)); disc(p, sx, sy, sr * 1.3, sr, (dx, dy) => Math.hypot(dx, dy) > 0.85 ? ink : c('#ffd800')); for (let ray = 0; ray < 12; ray++) { const a = ray / 12 * TAU + t * 0.2; for (let s = sr * 1.2; s < sr * 1.7; s++) p.px(Math.round(sx + Math.cos(a) * s * 1.3), Math.round(sy + Math.sin(a) * s), ink); }
  towers(p, base, 321, 0.16, 0.6, (n, dx, y, top, tw) => dx === 0 || dx === tw - 1 || y === top || y === top + 1 ? ink : dx % 2 === 1 && (base - y) % 3 === 0 ? (hash(n * 5 + dx, y + Math.floor(t)) > 0.5 ? c('#ffffff') : ink) : dot(dx + n * 3, y, 0.9) ? mix(pick(flats, n), '#000000', 0.25) : pick(flats, n));
  for (let y = base; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, y === base ? ink : (x + Math.floor(t * 20)) % 12 < 6 && y === base + Math.floor((p.ph - base) / 2) ? c('#ffffff') : c('#3a3a44')); });

const pierLights = scene((p, t, c, accent) => { const w = Math.round(p.ph * 0.66), sky = gradient(p, c, ['#0a0a2a', '#2a1a5a', '#a03a7a', '#ff8a5a'], w, '#0a0a1c'); starlight(p, t, w * 0.4, c('#ffffff'), sky(0)); const bulbs = ['#ff3b6b', '#ffd23a', '#35d0ff', '#7dff5a', accent];
  const deck = w - Math.round(p.ph * 0.1); for (let x = 0; x < p.pw; x++) { p.px(x, deck, c('#4a3424')); p.px(x, deck + 1, c('#2a1c12')); if (x % 6 === 2) for (let y = deck + 2; y < p.ph; y++) p.px(x, y, c('#1c120c')); if (x % 3 === 0) p.px(x, deck - 1, mix(c(pick(bulbs, x / 3)), '#000000', (x / 3 + Math.floor(t * 4)) % 3 ? 0 : 0.6)); }
  const cx = p.pw * 0.3, r = Math.min(p.ph * 0.3, p.pw * 0.16), cy = deck - r - 2, cars = 12;
  for (let i = 0; i < r * 9; i++) { const a = i / (r * 9) * TAU; p.px(Math.round(cx + Math.cos(a) * r * 1.3), Math.round(cy + Math.sin(a) * r), c('#c8ccd6')); }
  for (let car = 0; car < cars; car++) { const a = t * 0.3 + car / cars * TAU; for (let s = 0; s < r; s += 1.2) p.px(Math.round(cx + Math.cos(a) * s * 1.3), Math.round(cy + Math.sin(a) * s), (Math.floor(s) + Math.floor(t * 6)) % 3 ? c('#5a5f70') : c(pick(bulbs, car))); const x = Math.round(cx + Math.cos(a) * r * 1.3), y = Math.round(cy + Math.sin(a) * r); for (let dx = -1; dx <= 1; dx++) p.px(x + dx, y + 1, c(pick(bulbs, car))); }
  for (const leg of [-1, 1]) for (let s = 0; s < r + 2; s++) p.px(Math.round(cx + leg * s * 0.5), Math.round(cy + s), c('#8a909c'));
  const track = (x: number): number => deck - 3 - (Math.abs(Math.sin((x - p.pw * 0.5) * 0.09)) ** 1.5) * p.ph * 0.34;
  for (let x = Math.round(p.pw * 0.5); x < p.pw; x++) { const y = Math.round(track(x)); p.px(x, y, c('#f2ead8')); if (x % 3 === 0) for (let h = y + 1; h < deck; h++) if ((h + x) % 2) p.px(x, h, c('#6a5a52')); }
  const ride = p.pw * 0.5 + fract(t * 0.08) * p.pw * 0.5; for (let dx = 0; dx < 4; dx++) p.px(Math.round(ride) - dx, Math.round(track(ride - dx)) - 1, c(dx ? '#e0281e' : '#ffd23a'));
  mirror(p, w, t, c('#0a0a1c'), 0.6); });

export const worldtourReceiverBuilders = {
  'hong-kong-harbor': hongKong, 'times-square': timesSquare, 'seattle-drizzle': seattle,
  'shanghai-neon': shanghai, 'cairo-dusk': cairo, 'santorini': santorini, 'moscow-snow': moscow, 'vegas-strip': vegas,
  'istanbul-dusk': istanbul, 'kyoto-lanterns': kyoto, 'aurora-cabin': cabin, 'storm-lighthouse': stormLight, 'houndstooth': houndstooth,
  'pop-city': popCity, 'pier-lights': pierLights
};

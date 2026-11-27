import type {ThemeName} from '../../types.js';
import {panelBackground} from '../theme.js';
import {TAU, band, braille, clamp, fract, grid, hash, kick, mix, mulberry, noise, pixels, sceneColors, seconds, smooth, tri, type Builder, type Grid} from './cell-canvas.js';

// Second takes on the original receivers: the same ideas, redrawn at full strength. The originals are untouched.
type Ink = (hue: number, level: number) => string;
type Frame = ReturnType<Grid['finish']>;
const finite = (n: number): number => Number.isFinite(n) ? n : 0;
const palette = (g: Grid, hues = 33, levels = 15): Ink => {
  const table = Array.from({length: hues}, (_, h) => Array.from({length: levels}, (_, l) => {
    const at = l / (levels - 1), tone = g.paint.fan(h / (hues - 1) * 2 - 1);
    return at < 0.8 ? mix(panelBackground, tone, at / 0.8) : mix(tone, '#ffffff', (at - 0.8) / 0.2 * 0.65);
  }));
  return (hue, level) => table[Math.round(clamp(finite(hue) * 0.5 + 0.5) * (hues - 1))]![Math.round(clamp(finite(level)) * (levels - 1))]!;
};
const make = (f: (g: Grid, t: number, theme: ThemeName) => Frame): Builder => (pulse, width, height, theme) => f(grid(width, height, theme), seconds(pulse), theme);
const accentInk = (g: Grid): Ink => (_, level) => g.paint.ink(level * 0.85);
type Shade = [number, number] | string | null;
/** Per-pixel scenes. u and v are in panel heights, centred; x and y are pixels. */
const shade = (
  f: (u: number, v: number, t: number, x: number, y: number, pw: number, ph: number) => Shade,
  inkFor: (g: Grid, theme: ThemeName) => Ink = g => palette(g)
): Builder => make((g, t, theme) => {
  const p = pixels(g), ink = inkFor(g, theme);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const r = f((x + 0.5 - p.pw / 2) / p.ph, (y + 0.5) / p.ph - 0.5, t, x, y, p.pw, p.ph);
    if (r) p.px(x, y, typeof r === 'string' ? r : ink(r[0], r[1]));
  }
  p.flush();
  return g.finish();
});
type Dots = ReturnType<typeof braille>;
/** Line drawings in braille. cx, cy centre the drawing; r is the largest radius that fits. */
const draw = (f: (b: Dots, ink: Ink, t: number, cx: number, cy: number, r: number, g: Grid) => void): Builder => make((g, t) => {
  const b = braille(g);
  f(b, palette(g), t, b.dw / 2 - 0.5, b.dh / 2 - 0.5, Math.max(1, b.dh * 0.47), g);
  b.flush();
  return g.finish();
});
const polar = (u: number, v: number): [number, number] => [Math.hypot(u, v) + 1e-4, Math.atan2(v, u)];
const fbm = (x: number, y: number, seed: number): number => noise(x, y, seed) * 0.55 + noise(x * 2.1, y * 2.1, seed + 1) * 0.3 + noise(x * 4.3, y * 4.3, seed + 2) * 0.15;
const spin = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const hexPulse = shade((u, v, t) => {
  const s = 9, q = u * s, r = v * s / 0.866, row = Math.round(r), col = Math.round(q - (row & 1) * 0.5), cx = col + (row & 1) * 0.5, cy = row * 0.866;
  const dx = Math.abs(q - cx), dy = Math.abs(v * s - cy), edge = Math.max(dx, dx * 0.5 + dy * 0.866), far = Math.hypot(cx, cy), w = 0.5 + 0.5 * Math.sin(far * 1.1 - t * 3.2);
  return [0, edge > 0.44 ? 0.12 : 0.2 + 0.75 * w * (1 - edge)];
}, accentInk);
const moire = shade((u, v, t) => { const a = Math.hypot(u - 0.7 * Math.sin(t * 0.31), v - 0.2 * Math.cos(t * 0.43)), b = Math.hypot(u + 0.7 * Math.cos(t * 0.27), v + 0.2 * Math.sin(t * 0.37)); const m = Math.sin(a * 70) * Math.sin(b * 70); return m > 0 ? [0, 0.35 + 0.6 * m] : null; }, accentInk);
const cyclone = shade((u, v, t) => { const [d, a] = polar(u * 0.75, v), arm = Math.sin(a * 2 + 2.6 / (d + 0.12) - t * 1.6), eye = smooth(d * 9); return [Math.sin(d * 3 - t * 0.2), (0.15 + 0.8 * Math.max(0, arm) ** 0.7) * eye * clamp(1.5 - d * 1.1)]; });
const brailleWave = draw((b, ink, t) => { for (let line = 0; line < 5; line++) { let last = b.dh / 2; for (let x = 0; x < b.dw; x++) { const s = x / b.dw, y = b.dh / 2 + (Math.sin(s * 9 + t * 2 + line * 0.5) * 0.5 + Math.sin(s * 23 - t * 3.1 + line) * 0.25) * b.dh * (0.2 + line * 0.045) * Math.sin(s * Math.PI) * (0.6 + 0.4 * kick(t)); b.line(x, last, x, y, ink(line / 2 - 1, 1 - line * 0.14)); last = y; } } });
const silk = draw((b, ink, t) => { for (let line = 0; line < 34; line++) for (let x = 0; x < b.dw; x++) { const s = x / b.dw, k = line / 33; b.dot(x, b.dh / 2 + Math.sin(s * 5 + t * 0.7 + k * 1.6) * Math.sin(s * 2.1 - t * 0.4 + k * 3) * b.dh * 0.42 + (k - 0.5) * b.dh * 0.25 * Math.cos(s * 3 + t * 0.3), ink(k * 2 - 1, 0.75 + 0.25 * Math.sin(s * 7 + k * 5 + t))); } });
const figure = (xy: (s: number, t: number) => [number, number], turns: number): Builder => draw((b, ink, t, cx, cy, r) => { const n = Math.round(r * 90); for (let i = 0; i < n; i++) { const s = i / n * TAU * turns, [x, y] = xy(s, t); b.dot(cx + x * r * 1.9, cy + y * r, ink(Math.sin(s * 0.5 + t * 0.3), 0.8 + 0.2 * Math.sin(s * 2 - t * 2))); } });
const lissajous = figure((s, t) => [Math.sin(s * 3 + t * 0.4), Math.sin(s * 4 + Math.sin(t * 0.11) * 2)], 1);
const harmonograph = figure((s, t) => { const k = Math.exp(-s * 0.012); return [(Math.sin(s * 2.01 + t * 0.2) * 0.6 + Math.sin(s * 3 + 1) * 0.4) * k, (Math.sin(s * 3.02 + t * 0.13) * 0.6 + Math.sin(s * 2 + t * 0.07) * 0.4) * k]; }, 28);
const spectrogram = shade((_, v, t, x, __, pw) => { const e = band((0.5 - v) * 22, t - (1 - x / pw) * 7) ** 0.8; return [e * 2 - 1.1, 0.06 + e * 0.95]; });
const caustics = shade((u, v, t) => { const wx = u * 5 + fbm(u * 2 + t * 0.2, v * 2, 1) * 3, wy = v * 5 + fbm(u * 2, v * 2 - t * 0.2, 4) * 3, net = (1 - Math.abs(Math.sin(wx))) * (1 - Math.abs(Math.sin(wy))) + (1 - Math.abs(Math.sin(wx + wy + t * 0.6))) * 0.5; return [-0.5 + net * 0.5, 0.16 + 0.8 * clamp(net) ** 2.2]; });
const leds = make((g, t) => { const ink = palette(g), cols = Math.floor(g.w / 2); for (let c = 0; c < cols; c++) { const level = band(c * 22 / cols, t) * g.h * 1.15; for (let y = 0; y < g.h; y++) { const up = g.h - 1 - y, on = up < level, at = up / g.h; g.set(c * 2, y, '●', ink(at * 1.9 - 0.95, on ? 0.95 : 0.14), undefined, on); } } return g.finish(); });
const RAIN = '0123456789ABCDEFZXKTHN+*=<>:';
const matrix = make((g, t) => { const ink = palette(g); for (let x = 0; x < g.w; x++) { const speed = 5 + 9 * hash(x, 1), lap = g.h + 16, head = (t * speed + hash(x, 2) * lap) % lap; for (let y = 0; y < g.h; y++) { const behind = head - y; if (behind < 0 || behind > 14) continue; g.set(x, y, RAIN[Math.floor(hash(x * 31 + y, Math.floor(t * 6 + hash(x, y) * 6)) * RAIN.length)]!, behind < 1 ? '#ffffff' : ink(-0.2, 0.95 - behind / 15), undefined, behind < 2); } } return g.finish(); });
const orderedDither = shade((u, v, t, x, y) => { const lx = Math.sin(t * 0.6) * 1.2, ly = Math.cos(t * 0.45) * 0.3, d = Math.hypot(u, v) / 0.46; const lit = d < 1 ? clamp(0.15 + 0.85 * (Math.sqrt(1 - d * d) * 0.6 + (lx - u) * 0.35 + (ly - v) * 0.5)) : clamp(0.28 - Math.hypot(u - lx * 0.3, v) * 0.12); return lit * 16 > BAYER[(y & 3) * 4 + (x & 3)]! + 0.5 ? [d < 1 ? 0.6 : -0.6, d < 1 ? 0.95 : 0.6] : [-0.6, 0.06]; });
const pixelCrush = shade((_, __, t, x, y) => { const size = 2 ** (1 + Math.floor(fract(t * 0.25) * 4)), bx = Math.floor(x / size / 1.5), by = Math.floor(y / size), n = fbm(bx * size * 0.03 + t * 0.2, by * size * 0.06, 3), q = Math.floor(n * 6) / 5; return [q * 2 - 1, 0.2 + 0.75 * q]; });
const copperBars = shade((_, v, t) => { let best: Shade = [-0.7, 0.05], depth = -9; for (let i = 0; i < 8; i++) { const mid = 0.4 * Math.sin(t * 1.1 + i * 0.55), z = Math.cos(t * 1.1 + i * 0.55), off = (v - mid) / 0.055; if (Math.abs(off) < 1 && z > depth) { depth = z; best = [i / 3.5 - 1, 0.35 + 0.65 * Math.cos(off * Math.PI / 2) ** 0.8]; } } return best; });
const mesh = draw((b, ink, t) => { const rows = 14, cols = 30, at = (i: number, j: number): [number, number, number] => { const z = 1 + j / rows * 3.2, hgt = Math.sin(i * 0.5 + t * 1.2) * Math.cos(j * 0.6 - t * 0.9) * (0.5 + 0.5 * kick(t)), x = (i / (cols - 1) - 0.5) * 5 / z; return [b.dw / 2 + x * b.dw * 0.42, b.dh * 0.26 + (0.9 - hgt * 0.32) / z * b.dh * 0.72, z]; }; for (let j = rows - 1; j >= 0; j--) for (let i = 0; i < cols; i++) { const [x, y, z] = at(i, j), tone = ink(i / cols * 2 - 1, 1.15 - z * 0.26); if (i + 1 < cols) { const [x1, y1] = at(i + 1, j); b.line(x, y, x1, y1, tone); } if (j + 1 < rows) { const [x1, y1] = at(i, j + 1); b.line(x, y, x1, y1, tone); } } });
const hologram = shade((u, v, t, _, y) => { const d = Math.hypot(u, v) / 0.44, scan = (y + Math.floor(t * 20)) % 3 === 0 ? 0.6 : 1, glitch = hash(y, Math.floor(t * 8)) > 0.96 ? 0.06 : 0; if (d > 1) return Math.abs(v - 0.46) < 0.02 && Math.abs(u) < 0.6 ? [-0.3, 0.6] : Math.abs(u) < (0.5 - v) * 0.9 && v > 0.1 ? [-0.3, 0.07] : null; const nz = Math.sqrt(1 - d * d), lon = Math.atan2(u + glitch, nz * 0.44) + t * 0.7, lat = Math.asin(clamp(v / 0.44, -1, 1)), line = Math.abs(fract(lon / TAU * 12) - 0.5) < 0.07 || Math.abs(fract(lat / Math.PI * 8) - 0.5) < 0.09; return [-0.3, (line ? 0.95 : 0.2 + 0.25 * (1 - nz)) * scan]; });
const tunnel = shade((u, v, t) => { const [d, a] = polar(u * 0.7 + 0.12 * Math.sin(t * 0.5), v + 0.06 * Math.cos(t * 0.7)), z = 0.35 / d + t * 1.4, ring = Math.floor(z * 2), seg = Math.floor((a / TAU + 0.5) * 16 + ring * 0.5); return (ring + seg) & 1 ? [tri(ring * 0.09) * 2 - 1, clamp(d * 2.6) * 0.9] : [0, clamp(d * 2.6) * 0.14]; });
const kaleidoscope = shade((u, v, t) => { const [d, a0] = polar(u * 0.8, v), wedge = TAU / 10, a = Math.abs(((a0 + t * 0.1) % wedge + wedge) % wedge - wedge / 2), x = Math.cos(a) * d, y = Math.sin(a) * d, n = fbm(x * 5 + t * 0.3, y * 9 - t * 0.2, 2), cell = Math.floor(n * 7); return [tri(cell * 0.31) * 2 - 1, 0.25 + 0.7 * fract(n * 7) * clamp(1.4 - d)]; });
const phosphene = shade((u, v, t) => { let glow = 0, hue = 0; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 0.2, r = 0.25 + 0.12 * Math.sin(t * 0.7 + i), k = Math.exp(-(((u * 0.75 - Math.cos(a) * r * 1.6) ** 2 + (v - Math.sin(a) * r) ** 2) / (0.012 + 0.01 * kick(t - i * 0.08)))); if (k > glow) hue = i / 2.5 - 1; glow = Math.max(glow, k); } const [d] = polar(u * 0.75, v); return [hue, clamp(glow * 0.95 + 0.25 * Math.max(0, Math.sin(d * 26 - t * 3)) * Math.exp(-d * 2.5))]; });
const newton = shade((u, v, t) => { let [x, y] = spin(u * (1.3 + 0.5 * Math.sin(t * 0.2)), v * (1.3 + 0.5 * Math.sin(t * 0.2)), t * 0.1), i = 0; for (; i < 14; i++) { const x2 = x * x - y * y, y2 = 2 * x * y, d = 3 * (x2 * x2 + y2 * y2) + 1e-9, fx = x * x2 - y * y2 - 1, fy = x * y2 + y * x2; const nx = x - (fx * x2 + fy * y2) / d, ny = y - (fy * x2 - fx * y2) / d; if ((nx - x) ** 2 + (ny - y) ** 2 < 1e-5) break; x = nx; y = ny; } const root = x > 0.5 ? 0 : y > 0 ? 1 : 2; return [root - 1, 0.95 - i / 15]; });
const torusKnot = draw((b, ink, t, cx, cy, r) => { const n = Math.round(r * 70); for (let i = 0; i < n; i++) { const s = i / n * TAU, rad = 0.62 + 0.3 * Math.cos(3 * s); let x = rad * Math.cos(2 * s), y = rad * Math.sin(2 * s), z = 0.3 * Math.sin(3 * s); [x, z] = spin(x, z, t * 0.6); [y, z] = spin(y, z, t * 0.37); const lens = 2.6 / (2.6 - z); b.dot(cx + x * lens * r * 1.7, cy + y * lens * r * 0.95, ink(s / Math.PI - 1, 0.55 + 0.45 * z)); if (z > 0) b.dot(cx + x * lens * r * 1.7 + 1, cy + y * lens * r * 0.95, ink(s / Math.PI - 1, 0.9)); } });
const lorenzPath = (() => { const pts: number[] = []; let x = 0.1, y = 0, z = 0; for (let i = 0; i < 5200; i++) { const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - 8 / 3 * z; x += dx * 0.006; y += dy * 0.006; z += dz * 0.006; pts.push(x / 22, y / 26, (z - 25) / 26); } return pts; })();
const lorenz = draw((b, ink, t, cx, cy, r) => { const n = lorenzPath.length / 3, head = Math.floor(t * 55) % n; for (let i = 0; i < n; i++) { const [x] = spin(lorenzPath[i * 3]!, lorenzPath[i * 3 + 1]!, t * 0.25), behind = (head - i + n) % n; b.dot(cx + x * r * 2.4, cy - lorenzPath[i * 3 + 2]! * r, ink(i / n * 2 - 1, behind < 260 ? 1 : 0.6)); } });
const fernPoints = (() => { const rand = mulberry(7), pts: number[] = []; let x = 0, y = 0; for (let i = 0; i < 9000; i++) { const k = rand(); if (k < 0.01) [x, y] = [0, 0.16 * y]; else if (k < 0.86) [x, y] = [0.85 * x + 0.04 * y, -0.04 * x + 0.85 * y + 1.6]; else if (k < 0.93) [x, y] = [0.2 * x - 0.26 * y, 0.23 * x + 0.22 * y + 1.6]; else [x, y] = [-0.15 * x + 0.28 * y, 0.26 * x + 0.24 * y + 0.44]; pts.push(x, y); } return pts; })();
const fern = draw((b, ink, t) => { const n = fernPoints.length / 2, shown = Math.floor(n * clamp(0.25 + ((t % 24) / 14))), ferns = Math.max(1, Math.round(b.dw / (b.dh * 1.1))); for (let f = 0; f < ferns; f++) for (let i = 0; i < shown; i++) { const x = fernPoints[i * 2]!, y = fernPoints[i * 2 + 1]!, sway = Math.sin(t * 0.8 + f) * 0.05 * y * y / 10; b.dot((f + 0.5) * b.dw / ferns + (x + sway) * b.dh * 0.16 * (f % 2 ? -1 : 1), b.dh - 1 - y * b.dh * 0.098, ink(y / 5 - 1, 0.5 + 0.5 * hash(i, 1))); } });
const fireworks = shade((u, v, t, x, y, pw, ph) => { let best = 0, hue = 0; for (let n = Math.floor(t / 0.7); n > Math.floor(t / 0.7) - 5; n--) { const age = t - n * 0.7, bx = (hash(n, 1) - 0.5) * pw / ph * 0.85, by = -0.32 + 0.4 * hash(n, 2), reach = (0.2 + 0.16 * hash(n, 3)) * (1 - Math.exp(-age * 2.8)), [d, a] = polar(u - bx, v - by - age * age * 0.02), ray = Math.abs(fract(a / TAU * 26 + hash(n, 4)) - 0.5); const k = d < reach && ray < 0.16 ? (1 - age / 3.2) * (0.35 + 0.65 * d / reach) * (hash(x * 7 + y, Math.floor(t * 12)) > 0.25 ? 1 : 0.3) : 0; if (k > best) { best = k; hue = hash(n, 5) * 2 - 1; } } return best > 0.04 ? [hue, best] : hash(x, y * 3.3) > 0.993 ? [0, 0.5] : null; });
const fire = shade((u, v, t) => {
  const rise = 0.5 - v;
  const heat = 1.25 - rise * 1.45 + (fbm(u * 3.2, v * 3 + t * 2.4, 1) - 0.5) * 1.5 - Math.abs(Math.sin(u * 2.2 + 1)) * 0.25 * rise;
  return heat < 0.25 ? null : [0, heat < 0.5 ? 0 : heat < 0.8 ? 1 : heat < 1.05 ? 2 : 3];
}, (_, theme) => {
  const flame = ['#721500', '#dc4408', '#ff942b', '#ffe08a'].map(sceneColors(theme));
  return (_, level) => flame[level]!;
});
const planetarium = make((g, t) => { const b = braille(g), ink = palette(g), cx = b.dw / 2, cy = b.dh / 2, most = Math.min(b.dw * 0.48, b.dh * 1.6), marks: [number, number, string, number][] = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (hash(x * 1.7, y * 3.1) > 0.965) g.set(x, y, '·', ink(0, 0.25 + 0.3 * tri(t * 0.2 + hash(x, y)))); for (let pl = 0; pl < 7; pl++) { const r = most * (0.16 + 0.84 * (pl + 1) / 7), a = t * 0.9 / (pl + 1) ** 1.2 + pl * 1.7; for (let i = 0; i < r * 5; i++) { const s = i / (r * 5) * TAU; b.dot(cx + Math.cos(s) * r, cy + Math.sin(s) * r * 0.3, ink(pl / 3 - 1, 0.25)); } marks.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.3, pl === 5 ? '◉' : pl > 3 ? '●' : '•', pl / 3 - 1]); } b.flush(); g.set(Math.floor(cx / 2), Math.floor(cy / 4), '✹', ink(0.9, 1), undefined, true); for (const [x, y, glyph, hue] of marks) g.set(Math.floor(x / 2), Math.floor(y / 4), glyph, ink(hue, 1), undefined, true); return g.finish(); });
const crossfade = shade((u, v, t) => { const a = u * 7 + v * 5 + Math.sin(v * 6 - t * 0.7) * 1.4 - t * 1.1, b = v * 9 - u * 3 + Math.sin(u * 4 + t * 0.5) * 1.2 + t * 0.8, f = 0.5 + 0.5 * Math.sin(t * 0.25 + u), wave = Math.cos(a) * (1 - f) + Math.cos(b) * f; return [f * 1.6 - 0.8 + wave * 0.25, 0.5 + 0.42 * wave]; });

export const encoreReceiverBuilders = {
  'hex-pulse-ii': hexPulse, 'moire-ii': moire, 'cyclone-ii': cyclone,
  'braille-wave-ii': brailleWave, 'silk-ii': silk, 'lissajous-ii': lissajous,
  'harmonograph-ii': harmonograph, 'spectrogram-ii': spectrogram, 'caustics-ii': caustics,
  'leds-ii': leds, 'matrix-ii': matrix, 'ordered-dither-ii': orderedDither, 'pixel-crush-ii': pixelCrush,
  'copper-bars-ii': copperBars, 'mesh-ii': mesh, 'hologram-ii': hologram, 'tunnel-ii': tunnel, 'kaleidoscope-ii': kaleidoscope,
  'phosphene-ii': phosphene, 'newton-ii': newton, 'torus-knot-ii': torusKnot,
  'lorenz-ii': lorenz, 'fern-ii': fern, 'fireworks-ii': fireworks,
  'fire-ii': fire, 'planetarium-ii': planetarium,
  'crossfade-ii': crossfade
};

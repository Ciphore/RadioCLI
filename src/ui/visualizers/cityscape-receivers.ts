import {TAU, clamp, fract, grid, hash, kick, mix, noise, pixels, seconds, tri, type Builder, type Pixels} from './cell-canvas.js';
import {disc, lettering, season, starlight, wash} from './festive-receivers.js';

// More places and patterns in the manner of the skyline, bridge and Christmas scenes: fixed palettes, greys on mono.
type Tone = (hex: string) => string;
type Scene = (p: Pixels, t: number, c: Tone, accent: string) => void;
export const scene = (f: Scene): Builder => (pulse, width, height, theme) => { const g = grid(width, height, theme), p = pixels(g); f(p, seconds(pulse), season(theme), g.paint.accent); p.flush(); return g.finish(); };
export const ramp = (stops: string[], at: number): string => { const s = clamp(at) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(s)); return mix(stops[i]!, stops[i + 1]!, s - i); };
/** A run of towers along a baseline; the painter gets the tower number, column, row, roof row and width. */
export const towers = (p: Pixels, base: number, seed: number, low: number, high: number, paint: (n: number, dx: number, y: number, top: number, w: number) => string | undefined, shift = 0): void => {
  for (let x = -shift % 40 - 40, n = Math.floor(shift / 40) * 7; x < p.pw; n++) {
    const w = 4 + Math.floor(hash(seed + n, 1) * 7), top = base - Math.round(p.ph * (low + (high - low) * hash(seed + n, 2) ** 1.5));
    for (let dx = 0; dx < w; dx++) for (let y = Math.max(0, top); y < base; y++) { const tone = paint(n, dx, y, top, w); if (tone && x + dx >= 0) p.px(x + dx, y, tone); }
    x += w + (hash(seed + n, 3) > 0.6 ? 1 : 0);
  }
};
export const lit = (n: number, dx: number, y: number, base: number, share: number): boolean => dx % 2 === 1 && (base - y) % 2 === 0 && hash(n * 13 + dx, y) < share;
/** Water below a waterline: whatever is above, repeated upside down, stretched and broken by ripples. */
export const mirror = (p: Pixels, line: number, t: number, water: string, strength = 0.5): void => {
  for (let y = line; y < p.ph; y++) for (let x = 0; x < p.pw; x++) { const src = p.at(x + Math.round(Math.sin(y * 2.1 + t * 2.4 + x * 0.3) * (0.6 + (y - line) * 0.15)), line - 1 - (y - line) * 2); p.px(x, y, mix(water, src ?? water, (noise(x * 0.4 + t, y * 1.8, 6) > 0.5 ? strength : strength * 0.45) * (1 - (y - line) / (p.ph - line) * 0.5))); }
};
export const rain = (p: Pixels, t: number, tone: string): void => { for (let d = 0; d < p.pw * p.ph / 12; d++) { const fall = fract(hash(d, 6) + t * (1.2 + 0.6 * hash(d, 7))), x = Math.floor(hash(d, 8) * (p.pw + 10) - fall * 6), y = Math.floor(fall * p.ph), u = p.at(x, y); if (u) p.px(x, y, mix(u, tone, 0.4)); } };

// Tokyo in the rain: stacked signs in every colour, a train crossing on its viaduct, and the whole street doubled in the wet.
const tokyoRain = scene((p, t, c, accent) => {
  const base = Math.round(p.ph * 0.68), signs = ['#ff2d78', '#28e0ff', '#ffe03a', '#7dff5a', '#c05cff', accent];
  wash(p, y => c(mix('#070a18', '#1a1838', y / base)));
  towers(p, base, 900, 0.2, 0.42, (_, __, y) => c(mix('#10142a', '#1a1838', y / base)));
  towers(p, base, 300, 0.14, 0.62, (n, dx, y, top, w) => {
    // Every other building wears a vertical sign of stacked blocks that blink in sequence.
    if (n % 2 === 0 && dx === Math.floor(w / 2) && y > top + 1 && y < top + 10) return (y - top + Math.floor(t * 5)) % 4 ? c(signs[n % 6]!) : c('#0a0c18');
    if (y === top && n % 3 === 0) return c(signs[(n + 2) % 6]!);
    return lit(n, dx, y, base, 0.5) ? c(n % 4 === 1 ? '#bfe8ff' : '#ffd27a') : c('#06070e');
  });
  const rail = base - Math.round(p.ph * 0.16);
  for (let x = 0; x < p.pw; x++) { p.px(x, rail, c('#2a2e44')); if (x % 9 === 0) for (let y = rail + 1; y < base; y++) p.px(x, y, c('#1a1d2e')); }
  const tx = Math.round((t * 30) % (p.pw + 70)) - 50;
  for (let dx = 0; dx < 44; dx++) { p.px(tx + dx, rail - 1, c(dx % 11 === 10 ? '#0a0c18' : '#d8dce6')); p.px(tx + dx, rail - 2, c(dx % 11 === 10 ? '#0a0c18' : dx % 3 ? '#ffe9a0' : '#d8dce6')); }
  mirror(p, base, t, c('#05060e'), 0.62);
  rain(p, t, c('#b9c6e6'));
});

// Miami in neon: a striped sun, palms in silhouette, pastel hotel fronts outlined in tube, and a grid road running out to sea.
const miamiSynth = scene((p, t, c, accent) => {
  const base = Math.round(p.ph * 0.64), sky = (y: number): string => c(ramp(['#12063a', '#5a1880', '#ff4f9a', '#ffb060'], y / base)), sunR = Math.min(p.ph * 0.34, p.pw * 0.18), sunY = base - sunR * 0.3;
  wash(p, y => y < base ? sky(y) : c('#0c0424')); starlight(p, t, base * 0.4, c('#ffffff'), c('#12063a'));
  disc(p, p.pw / 2, sunY, sunR * 1.25, sunR, (_, dy) => { const y = sunY + dy * sunR; return y >= base || (dy > 0 && fract(dy * 4.5 - t * 0.3) < 0.16 + dy * 0.3) ? undefined : c(ramp(['#fff06a', '#ff9a3c', '#ff2e7e'], (dy + 1) / 2)); });
  const tubes = ['#35f0ff', '#ff5ad8', '#b0ff5a', '#ffd23a', accent];
  towers(p, base, 610, 0.1, 0.34, (n, dx, y, top, w) => (y === top || dx === 0 || dx === w - 1 || (base - y) % 4 === 0) ? c(tubes[n % 5]!) : lit(n, dx, y, base, 0.4) ? c('#fff3c0') : c('#1a0838'));
  for (let n = 0; n < p.pw / 20; n++) { let x = (n + 0.5) * 20, y = base; const tall = p.ph * (0.3 + 0.12 * hash(n, 1)); for (let s = 0; s < tall; s++) { x += (n % 2 ? 1 : -1) * s / tall * 0.5; y--; p.px(Math.round(x), y, c('#07020f')); } for (let f = 0; f < 7; f++) { const a = -Math.PI * 0.95 + f / 6 * Math.PI * 0.9 + Math.sin(t + f + n) * 0.07; for (let s = 0; s < tall * 0.45; s++) p.px(Math.round(x + Math.cos(a) * s * 1.3), Math.round(y + Math.sin(a) * s * 0.7 + (s / (tall * 0.45)) ** 2 * tall * 0.24), c('#07020f')); } }
  const row = (y: number): number => Math.floor(1.5 / ((y - base + 1) / (p.ph - base)) + t * 2);
  for (let y = base; y < p.ph; y++) { const depth = (y - base + 1) / (p.ph - base), gap = depth * p.pw * 0.12 + 0.6, line = y === base || (depth > 0.25 && row(y) !== row(y - 1)); for (let x = 0; x < p.pw; x++) { const lane = (x + 0.5 - p.pw / 2) / gap; if (line || Math.abs(lane - Math.round(lane)) * gap < 0.5) p.px(x, y, mix(c('#0c0424'), c('#35f0ff'), 0.3 + 0.6 * depth + 0.1 * kick(t))); } }
});

// Chicago in the snow: the elevated train rattling round the Loop, steam from the vents, and the lake wind driving the flakes sideways.
const chicagoSnow = scene((p, t, c) => {
  const base = Math.round(p.ph * 0.82), sky = (y: number): string => c(ramp(['#1c2440', '#3a4466', '#6f7590'], y / base));
  wash(p, y => y < base ? sky(y) : c('#dfe6f0'));
  towers(p, base, 210, 0.3, 0.74, (n, _, y) => mix(c('#2a3350'), sky(y), 0.45 + 0.1 * (n % 2)));
  towers(p, base, 420, 0.2, 0.6, (n, dx, y, top, w) => y <= top + (n % 3 ? 0 : 1) ? c('#f2f6fb') : lit(n, dx, y, base, 0.55) ? c('#ffd486') : dx === w - 1 ? c('#141a2a') : c('#1c2336'));
  const rail = base - Math.round(p.ph * 0.22), steel = c('#2a1f1a');
  for (let x = 0; x < p.pw; x++) { p.px(x, rail, steel); p.px(x, rail - 1, c('#f2f6fb')); if (x % 2 === 0) p.px(x, rail + 1, steel); if (x % 12 === 3) for (let y = rail + 1; y < base; y++) { p.px(x, y, steel); if ((y - rail) < 4) { p.px(x - (y - rail), y, steel); p.px(x + (y - rail), y, steel); } } }
  const tx = Math.round(p.pw + 20 - (t * 24) % (p.pw + 80));
  for (let car = 0; car < 3; car++) for (let dx = 0; dx < 14; dx++) for (let dy = 2; dy < 5; dy++) p.px(tx + car * 15 + dx, rail - dy, dy === 4 ? c('#f2f6fb') : dx % 3 === 1 && dy === 3 ? c('#ffe9a0') : c('#8a909c'));
  if (Math.floor(t * 9) % 3 === 0) p.px(tx + 2, rail, c('#8fd0ff'));
  for (let vent = 0; vent < 3; vent++) for (let puff = 0; puff < 9; puff++) { const age = fract(t * 0.3 + puff / 9), x = p.pw * (0.2 + vent * 0.3) + age * 9 + Math.sin(age * 8 + vent) * 2, y = base - 1 - age * p.ph * 0.3; p.px(Math.round(x), Math.round(y), mix(p.at(Math.round(x), Math.round(y)) ?? sky(y), '#ffffff', 0.6 * (1 - age))); }
  for (let x = 0; x < p.pw; x++) for (let y = base - Math.round(noise(x * 0.08, 3) * 2); y < p.ph; y++) p.px(x, y, mix(c('#f4f7fb'), c('#b3c0d6'), (y - base + 2) / (p.ph - base + 2)));
  for (let f = 0; f < p.pw * p.ph / 18; f++) { const fall = fract(hash(f, 5) + t * (0.08 + 0.1 * hash(f, 6))); p.px(Math.floor(((hash(f, 7) * p.pw + t * 9 + fall * 30) % p.pw + p.pw) % p.pw), Math.floor(fall * p.ph), c(hash(f, 8) > 0.5 ? '#ffffff' : '#c3cee0')); }
});

// Sydney on the big night: the sails lit from below, the arch behind them, and fireworks going up off the bridge itself.
const sydneyHarbor = scene((p, t, c, accent) => {
  const water = Math.round(p.ph * 0.72), sky = (y: number): string => c(mix('#04061a', '#1c1848', y / water)), sparks = ['#ffd23a', '#ff5d73', '#63e6ff', '#b0ff7a', '#d59bff', accent].map(c);
  wash(p, y => y < water ? sky(y) : c('#05060f')); starlight(p, t, water * 0.5, c('#ffffff'), c('#0a0b24'));
  const a = p.pw * 0.42, b = p.pw * 0.98, deck = water - Math.round(p.ph * 0.14), steel = c('#2a3048');
  for (let x = Math.round(a); x < b && x < p.pw; x++) { const u = (x - a) / (b - a) * 2 - 1, arch = deck - (1 - u * u) * p.ph * 0.34, inner = deck - (1 - u * u) * p.ph * 0.26; p.px(x, Math.round(arch), steel); p.px(x, Math.round(inner), steel); p.px(x, deck, steel); if (x % 3 === 0) for (let y = Math.round(arch); y < deck; y++) if (y < inner || x % 6 === 0) p.px(x, y, mix(sky(y), steel, 0.6)); if (x % 4 === 0) p.px(x, Math.round(arch), c('#ffe9a0')); }
  for (const x of [a, b - 1]) for (let y = deck - Math.round(p.ph * 0.2); y < water; y++) for (let w = -1; w <= 1; w++) p.px(Math.round(x) + w, y, c('#3a3f58'));
  for (let n = Math.floor(t / 0.6); n > Math.floor(t / 0.6) - 5; n--) { const age = t - n * 0.6, bx = a + (0.1 + 0.8 * hash(n, 1)) * (b - a), by = p.ph * (0.1 + 0.22 * hash(n, 2)), reach = p.ph * (0.2 + 0.14 * hash(n, 3)) * (1 - Math.exp(-age * 3)); for (let ray = 0; ray < 30; ray++) { const ang = ray / 30 * TAU; for (let tail = 0; tail < 3; tail++) { const r = reach * (1 - tail * 0.08), x = Math.round(bx + Math.cos(ang) * r * 1.3), y = Math.round(by + Math.sin(ang) * r + age * age * 1.5); if (y < water && age < 2.4) p.px(x, y, mix(p.at(x, y) ?? sky(y), sparks[n % 6 < 0 ? 0 : ((n % 6) + 6) % 6]!, clamp(1.2 - age * 0.5 - tail * 0.25))); } } }
  // The opera house: a row of shells, each a quarter of a sphere, leaning the same way and lit along its rim.
  const shells = 5, ox = p.pw * 0.08;
  for (let s = 0; s < shells; s++) { const r = p.ph * (0.3 - s * 0.035), cx = ox + s * p.ph * 0.2; disc(p, cx, water, r * 0.9, r, (dx, dy) => dy > 0 || dx < -0.15 - dy * 0.6 ? undefined : c(mix('#f4f0e4', '#8a90b0', clamp(Math.hypot(dx, dy) < 0.9 ? 0.25 + dx * 0.5 + (1 + dy) * 0.3 : 0)))); }
  for (let x = Math.round(ox - p.ph * 0.3); x < ox + shells * p.ph * 0.22; x++) p.px(x, water - 1, c('#6a5a4a'));
  mirror(p, water, t, c('#05060f'), 0.6);
});

// Argyle: knitted diamonds in three yarns with fine diagonal stitching laid over them, the whole cloth sliding slowly sideways.
const argyle = scene((p, t, c, accent) => {
  const s = Math.max(6, Math.round(p.ph / 2.2)), yarns = [mix(accent, '#000000', 0.35), accent, c('#efe6d0'), mix(accent, '#ffffff', 0.45)], slide = t * 3;
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const u = (x + slide) / (s * 1.3), v = y / s, a = u + v, b = u - v, cell = (Math.floor(a) + Math.floor(b)) & 1, row = Math.floor(a) - Math.floor(b);
    // Diamonds alternate two colours by row; a thin contrasting line runs through the middle of every one.
    const stitch = Math.abs(fract(a + 0.5) - 0.5) < 0.045 || Math.abs(fract(b + 0.5) - 0.5) < 0.045, knit = ((x + y) & 1) ? 0.08 : 0;
    p.px(x, y, stitch && ((x + y) % 3 !== 0) ? yarns[2]! : mix(cell ? yarns[((row % 2) + 2) % 2 ? 1 : 3]! : yarns[0]!, '#000000', knit));
  }
});

const SHOUT = ['WOW!', 'POP!', 'ZING', 'OH!', 'BANG', 'YEAH'];
// A comic page: four panels of Ben-Day dots in flat primaries, each with its own burst and its own shout, taking turns to jump.
const popPanels = scene((p, t, c, accent) => {
  const cols = p.pw >= 70 ? 4 : 2, rows = p.ph >= 22 && cols === 2 ? 2 : 1, w = p.pw / cols, h = p.ph / rows, flats = ['#ffd800', '#e8102a', '#1a4fd8', '#ffffff', accent].map(c), ink = c('#0a0a10');
  for (let n = 0; n < cols * rows; n++) {
    const x0 = Math.round((n % cols) * w), y0 = Math.round(Math.floor(n / cols) * h), cx = x0 + w / 2, cy = y0 + h / 2, jump = n === Math.floor(t) % (cols * rows) ? 1 + 0.25 * kick(t) : 1, word = SHOUT[(n + Math.floor(t / 4)) % SHOUT.length]!, back = flats[(n + 2) % 4]!, dot = flats[(n + 3) % 4]!;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const edge = x - x0 < 1 || y - y0 < 1 || x0 + w - x <= 1 || y0 + h - y <= 1, dx = (x + 0.5 - cx) / (w * 0.42 * jump), dy = (y + 0.5 - cy) / (h * 0.44 * jump), ang = Math.atan2(dy, dx), r = Math.hypot(dx, dy) / (0.72 + 0.28 * tri(ang / TAU * 9 + n * 0.3));
      const dots = ((x >> 1) + (y >> 1)) % 2 === 0 && (x % 2 === 0) && (y % 2 === 0);
      p.px(x, y, edge ? ink : r < 0.92 ? flats[n % 4 === 3 ? 0 : n % 4]! : r < 1 ? ink : dots ? dot : back);
    }
    const wl = word.length * 6 - 1, left = Math.round(cx - wl / 2), top = Math.round(cy - 2.5);
    for (const pass of [1, 0]) for (let y = 0; y < 5; y++) for (let x = 0; x < wl; x++) if (lettering(word, x, y)) p.px(left + x + pass, top + y + pass, pass ? ink : n % 4 === 3 ? c('#e8102a') : c('#ffffff'));
  }
});

// Every idle logo at once: a dozen shapes rattling round the panel, trading colours whenever two of them cross, and flashing when one finds a corner.
const bounceParty = scene((p, t, c, accent) => {
  wash(p, () => c('#05060c'));
  const tones = ['#ff3b6b', '#35d0ff', '#ffd23a', '#7dff5a', '#c05cff', accent].map(c), count = Math.max(4, Math.round(p.pw * p.ph / 260));
  const fold = (d: number, range: number): number => range > 0 ? range - Math.abs(d % (2 * range) - range) : 0;
  const at = (n: number, when: number): [number, number, number] => { const size = 3 + Math.floor(hash(n, 1) * 4), rx = p.pw - size * 2, ry = p.ph - size, dx = when * (7 + 9 * hash(n, 2)) + hash(n, 3) * 90, dy = when * (4 + 6 * hash(n, 4)) + hash(n, 5) * 50; return [fold(dx, rx), fold(dy, ry), Math.floor(dx / Math.max(1, rx)) + Math.floor(dy / Math.max(1, ry))]; };
  for (let n = 0; n < count; n++) for (let trail = 5; trail >= 0; trail--) {
    const [x, y, hits] = at(n, t - trail * 0.05), size = 3 + Math.floor(hash(n, 1) * 4), tone = tones[(((n + hits) % 6) + 6) % 6]!, kind = n % 3, corner = (x < 1.5 || x > p.pw - size * 2 - 1.5) && (y < 1.5 || y > p.ph - size - 1.5);
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size * 2; dx++) {
      const u = dx / (size * 2 - 1) * 2 - 1, v = dy / (size - 1) * 2 - 1, inside = kind === 0 ? true : kind === 1 ? u * u + v * v <= 1.05 : Math.abs(u) + Math.abs(v) <= 1.05;
      if (inside) p.px(Math.round(x) + dx, Math.round(y) + dy, trail ? mix(c('#05060c'), tone, 0.34 - trail * 0.05) : corner ? '#ffffff' : mix(tone, '#ffffff', dy === 0 ? 0.35 : 0));
    }
  }
});

export const cityscapeReceiverBuilders = {
  'tokyo-rain': tokyoRain,
  'miami-synth': miamiSynth, 'chicago-snow': chicagoSnow, 'sydney-harbor': sydneyHarbor,
  'argyle': argyle, 'pop-panels': popPanels, 'bounce-party': bounceParty
};

import {panelBackground} from '../theme.js';
import {TAU, band, braille, clamp, fract, grid, hash, kick, mix, noise, pixels, seconds, tri, type Builder} from './cell-canvas.js';
import {horseAspect, horseMask} from './gallop.js';

// Star figures in a unit box: [x, y] points, then the pairs to join.
const FIGURES: {name: string; stars: [number, number][]; links: [number, number][]}[] = [
  {name: 'ORION', stars: [[0.2, 0], [0.8, 0.08], [0.38, 0.45], [0.5, 0.5], [0.62, 0.55], [0.15, 1], [0.85, 0.95]], links: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6], [0, 1]]},
  {name: 'URSA MAJOR', stars: [[0, 0.3], [0.2, 0.2], [0.38, 0.3], [0.55, 0.45], [0.6, 0.85], [0.92, 0.9], [1, 0.5]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]]},
  {name: 'CASSIOPEIA', stars: [[0, 0.2], [0.25, 0.8], [0.5, 0.35], [0.75, 0.9], [1, 0.1]], links: [[0, 1], [1, 2], [2, 3], [3, 4]]},
  {name: 'CYGNUS', stars: [[0.5, 0], [0.5, 0.4], [0.5, 1], [0, 0.3], [1, 0.5], [0.25, 0.35], [0.75, 0.45]], links: [[0, 1], [1, 2], [3, 5], [5, 1], [1, 6], [6, 4]]},
  {name: 'LYRA', stars: [[0.5, 0], [0.3, 0.4], [0.7, 0.35], [0.4, 1], [0.8, 0.95]], links: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4]]},
  {name: 'SCORPIUS', stars: [[0, 0], [0.1, 0.2], [0.05, 0.4], [0.3, 0.3], [0.5, 0.5], [0.65, 0.8], [0.85, 1], [1, 0.8], [0.95, 0.6]], links: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]]}
];

// A turning night sky: real figures drift past, and each in turn is traced star to star and named.
export const constellation: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const sparkle = hash(x * 1.7, y * 3.1);
    if (sparkle > 0.93) g.set(x, y, sparkle > 0.985 ? '∙' : '·', g.paint.ink(0.2 + 0.4 * tri(t * (0.1 + sparkle) + sparkle * 9)));
  }
  const size = Math.max(4, b.dh * 0.72), pitch = size * 1.9;
  const sky = FIGURES.length * pitch, drift = t * 2.2;
  // Whichever figure is nearest the middle of the panel is the one being traced.
  const middle = (index: number): number => ((index * pitch - drift) % sky + sky) % sky - size / 2 - b.dw / 2 + size * 0.6;
  const chosen = FIGURES.map((_, index) => index).sort((p, q) => Math.abs(middle(p)) - Math.abs(middle(q)))[0]!;
  const traced = clamp(1.15 - Math.abs(middle(chosen)) / (pitch * 0.5));
  const points: [number, number, boolean, number][] = [];
  FIGURES.forEach((figure, index) => {
    const left = ((index * pitch - drift) % sky + sky) % sky - size;
    if (left > b.dw) return;
    const top = (b.dh - size) / 2 + Math.sin(index * 2.4) * b.dh * 0.1;
    const at = (star: number): [number, number] => [left + figure.stars[star]![0] * size * 1.15, top + figure.stars[star]![1] * size];
    const active = index === chosen;
    figure.links.forEach(([from, to], link) => {
      const [x0, y0] = at(from), [x1, y1] = at(to);
      // The chosen figure is drawn in link by link; the rest stay as faint guides.
      const done = active ? clamp(traced * figure.links.length - link) : 1;
      if (done > 0) b.line(x0, y0, x0 + (x1 - x0) * done, y0 + (y1 - y0) * done, active ? g.paint.ink(0.9) : g.paint.ink(0.4));
    });
    figure.stars.forEach((_, star) => points.push([...at(star), active, star]));
    if (active && g.h >= 6) {
      const label = figure.name.slice(0, Math.round(traced * 1.3 * figure.name.length));
      g.write(Math.round((left + size * 0.55) / 2 - label.length / 2), g.h - 1, label, g.paint.fan(0.8));
    }
  });
  b.flush();
  for (const [x, y, active, star] of points) {
    const glow = tri(t * 0.7 + star * 0.37);
    g.set(Math.floor(x / 2), Math.floor(y / 4), active ? (glow > 0.6 ? '✦' : '★') : '•', active ? mix(g.paint.accent, '#ffffff', 0.35 + 0.5 * glow) : g.paint.ink(0.8), undefined, active);
  }
  return g.finish();
};

// The hypercube: an inner cube and an outer cube trading places through the fourth dimension.
export const tesseract: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const a = t * 0.55, c = t * 0.31, tilt = 0.5;
  const scale = Math.min(b.dh * 0.27, b.dw * 0.27);
  const corners = Array.from({length: 16}, (_, i) => {
    let x = i & 1 ? 1 : -1, y = i & 2 ? 1 : -1, z = i & 4 ? 1 : -1, w = i & 8 ? 1 : -1;
    // One turn through the fourth dimension, then ordinary turns so the solid is seen at an angle.
    [x, w] = [x * Math.cos(a) - w * Math.sin(a), x * Math.sin(a) + w * Math.cos(a)];
    [x, z] = [x * Math.cos(c) - z * Math.sin(c), x * Math.sin(c) + z * Math.cos(c)];
    [y, z] = [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
    const near = 1 / (2.6 - w), lens = 3.4 / (3.4 - z * near);
    return {x: b.dw / 2 - 0.5 + x * near * lens * scale * 1.5, y: b.dh / 2 - 0.5 + y * near * lens * scale * 1.5, w};
  });
  const edges: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) for (let bit = 0; bit < 4; bit++) if (!(i & (1 << bit))) edges.push([i, i | (1 << bit), (corners[i]!.w + corners[i | (1 << bit)]!.w) / 2]);
  // Far-in-w edges first, so the cube that is currently outside is drawn over the one inside.
  for (const [from, to, w] of edges.sort((p, q) => p[2] - q[2])) {
    b.line(corners[from]!.x, corners[from]!.y, corners[to]!.x, corners[to]!.y, mix(panelBackground, g.paint.fan(w * 0.9), 0.5 + 0.5 * (w * 0.5 + 0.5)));
  }
  b.flush();
  for (const corner of corners) if (corner.w > 0) g.set(Math.floor(corner.x / 2), Math.floor(corner.y / 4), '●', mix(g.paint.fan(corner.w * 0.9), '#ffffff', 0.4 + 0.3 * kick(t)), undefined, true);
  return g.finish();
};

// Flying into the stars: every one a streak from where it was to where it is, longer and brighter as it passes.
export const starfield: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const count = Math.round(clamp(g.w * g.h / 5, 30, 420));
  const speed = 0.22 + 0.05 * kick(t);
  const heads: [number, number, number, number][] = [];
  for (let star = 0; star < count; star++) {
    const depth = 1 - fract(hash(star, 1) + t * (0.16 + 0.1 * hash(star, 2)));
    const angle = hash(star, 3) * TAU, spread = 0.06 + Math.sqrt(hash(star, 4)) * 1.1;
    const at = (z: number): [number, number] => [b.dw / 2 + Math.cos(angle) * spread / z * b.dw * 0.24, b.dh / 2 + Math.sin(angle) * spread / z * b.dh * 0.42];
    const z = 0.06 + depth * 0.94;
    const [x, y] = at(z), [px, py] = at(z * (1 + speed));
    if (x < -4 || y < -4 || x > b.dw + 4 || y > b.dh + 4) continue;
    const near = 1 - depth;
    b.line(px, py, x, y, mix(panelBackground, g.paint.fan(hash(star, 5) * 2 - 1), 0.45 + 0.55 * near));
    if (near > 0.72) heads.push([x, y, near, star]);
  }
  b.flush();
  for (const [x, y, near, star] of heads) g.set(Math.floor(x / 2), Math.floor(y / 4), near > 0.9 ? '✦' : '•', mix(g.paint.fan(hash(star, 5) * 2 - 1), '#ffffff', 0.6), undefined, true);
  return g.finish();
};

// Rain on a pond, seen from above: every drop throws a ring, the rings cross, and the light catches their slopes.
export const rippleTank: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const shades = Array.from({length: 40}, (_, i) => g.paint.ink(0.87 * (i / 39) ** 1.5));
  const drops = Array.from({length: 14}, (_, k) => {
    const born = Math.floor(t / 0.32) - k;
    return {x: hash(born, 1) * p.pw, y: hash(born, 2) * p.ph, age: t - born * 0.32, power: 0.6 + 0.4 * hash(born, 3)};
  });
  const height0 = (x: number, y: number): number => {
    let h = 0.12 * Math.sin(x * 0.11 + y * 0.07 + t * 0.9);
    for (const drop of drops) {
      const r = Math.hypot(x - drop.x, y - drop.y), front = drop.age * 9;
      const behind = front - r;
      // Only the water the ring has reached moves, and it settles again once the ring has gone by.
      if (behind > 0 && behind < 16) h += drop.power * Math.sin(behind * 1.15) * Math.exp(-behind * 0.2) * Math.exp(-drop.age * 0.3) / Math.sqrt(1 + r / 10);
    }
    return h;
  };
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const slope = (height0(x + 1, y) - height0(x - 1, y)) * 0.9 + (height0(x, y + 1) - height0(x, y - 1)) * 0.7;
    p.px(x, y, shades[Math.round(clamp(0.34 + slope * 1.15) * 39)]!);
  }
  for (const drop of drops) if (drop.age < 0.16) p.px(Math.floor(drop.x), Math.floor(drop.y), g.paint.accent);
  p.flush();
  return g.finish();
};

// Curtains of light over a dark ridge and a still lake: sharp along their lower hem, fading upward, and folded by the wind.
export const aurora: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const mono = theme === 'mono';
  const green = mono ? '#d0d0d0' : '#3dff9a', crown = mono ? '#909090' : mix(g.paint.accent, '#c04bff', 0.5), hem = mono ? '#ffffff' : '#d8ffe9';
  const shore = Math.round(p.ph * 0.74);
  const ridgeAt = (x: number): number => shore - Math.round(p.ph * (0.06 + 0.09 * noise(x * 0.045, 3) + 0.05 * noise(x * 0.16, 7)));
  const sky = (y: number): string => mix('#03050d', '#0a1626', y / shore);
  const light = new Float32Array(p.pw * 3);
  const column = (x: number, y: number): [number, number, number] => {
    // Three curtains at different heights; each column of each is a ray with its own brightness.
    let r = 0, gg = 0, b = 0;
    for (let sheet = 0; sheet < 3; sheet++) {
      const fold = noise(x * 0.035 + sheet * 9, t * 0.11 + sheet) + 0.35 * Math.sin(x * 0.09 + t * 0.5 + sheet * 2);
      const hemY = p.ph * (0.3 + sheet * 0.12) + (fold - 0.6) * p.ph * 0.34;
      const above = hemY - y;
      if (above < -1.5) continue;
      const ray = 0.35 + 0.65 * noise(x * 0.55 + sheet * 31, t * 0.9 + sheet * 5) ** 1.5;
      const strength = (above < 0 ? 1 + above / 1.5 : Math.exp(-above / (p.ph * (0.2 + 0.14 * ray)))) * ray * (0.5 + 0.5 * noise(x * 0.02 + sheet, t * 0.2 + 40)) * (0.9 - sheet * 0.2);
      const high = clamp(above / (p.ph * 0.3)), low = clamp(1 - above / 1.6);
      const tone = [green, crown, hem].map(hex => [1, 3, 5].map(o => parseInt(hex.slice(o, o + 2), 16)));
      for (let ch = 0; ch < 3; ch++) {
        const value = (tone[0]![ch]! * (1 - high) + tone[1]![ch]! * high) * (1 - low * 0.6) + tone[2]![ch]! * low * 0.6;
        if (ch === 0) r += value * strength; else if (ch === 1) gg += value * strength; else b += value * strength;
      }
    }
    return [r, gg, b];
  };
  const tones = new Map<number, string>();
  const paint = (x: number, y: number, base: string, r: number, gr: number, b: number): void => {
    const key = (Math.min(31, Math.round(r / 8)) << 10) | (Math.min(31, Math.round(gr / 8)) << 5) | Math.min(31, Math.round(b / 8));
    if (key === 0) { p.px(x, y, base); return; }
    let tone = tones.get(key);
    if (!tone) tones.set(key, tone = '#' + [key >> 10, (key >> 5) & 31, key & 31].map(v => Math.min(255, v * 8).toString(16).padStart(2, '0')).join(''));
    p.px(x, y, mix(base, tone, clamp(Math.max(r, gr, b) / 150)));
  };
  for (let x = 0; x < p.pw; x++) {
    const ridge = ridgeAt(x);
    light.fill(0, x * 3, x * 3 + 3);
    for (let y = 0; y < p.ph; y++) {
      if (y >= ridge && y < shore) { p.px(x, y, '#04070c'); continue; }
      // The lake repeats the sky upside down, squeezed, and broken by ripples.
      const mirrored = y >= shore;
      const sy = mirrored ? shore - (y - shore) * 2.2 - 2 : y, sx = mirrored ? x + Math.sin(y * 1.7 + t * 2) * 1.5 : x;
      if (mirrored && sy >= ridgeAt(Math.round(sx))) { p.px(x, y, '#050911'); continue; }
      const [r, gr, b] = column(sx, sy);
      const dim = mirrored ? 0.5 : 1;
      const star = !mirrored && hash(x, y * 3.3) > 0.985 ? mix(sky(y), '#ffffff', 0.5 * tri(t * 0.3 + hash(y, x))) : undefined;
      paint(x, y, star ?? (mirrored ? '#060c18' : sky(y)), r * dim, gr * dim, b * dim);
    }
  }
  p.flush();
  return g.finish();
};

/** The stride pose for this pulse, centred in a W×H grid of units that are `stretch` times taller than wide. */
const stride = (pulse: number, W: number, H: number, stretch: number, share = 0.86) => {
  const tall = Math.max(2, Math.floor(Math.min(H * share, W * share / (horseAspect * stretch))));
  const wide = Math.max(2, Math.floor(tall * horseAspect * stretch));
  const mask = horseMask(pulse, wide, tall);
  const left = Math.floor((W - wide) / 2), top = Math.floor((H - tall) / 2);
  return {wide, tall, left, top, ink: (x: number, y: number): boolean => x >= left && y >= top && x < left + wide && y < top + tall && mask[(y - top) * wide + x - left] === 1};
};

const DENSITY = ' .:;+=*#@';
// The horse typed out: each character chosen by how much of the drawing passes through its cell.
export const gallopAscii: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const horse = stride(pulse, g.w * 2, g.h * 4, 1);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    let ink = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) if (horse.ink(x * 2 + dx, y * 4 + dy)) ink++;
    if (ink) g.set(x, y, DENSITY[ink]!, g.paint.ink(0.42 + 0.58 * ink / 8), undefined, ink > 4);
  }
  return g.finish();
};

// The horse on a sign board: a full grid of lamps, with the ones that make the picture switched on.
export const gallopLed: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const horse = stride(pulse, g.w, g.h * 2, 1, 0.94);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    // Each lamp is one cell: lit if the drawing touches either half of it.
    const lit = horse.ink(x, y * 2) || horse.ink(x, y * 2 + 1);
    const fresh = lit && !(stride(pulse - 1, g.w, g.h * 2, 1, 0.94).ink(x, y * 2) || stride(pulse - 1, g.w, g.h * 2, 1, 0.94).ink(x, y * 2 + 1));
    g.set(x, y, lit ? '●' : '·', lit ? mix(g.paint.accent, '#ffffff', fresh ? 0.5 : 0.1) : g.paint.ink(0.12), undefined, lit);
  }
  return g.finish();
};

const EIGHTHS = ' ▁▂▃▄▅▆▇█';

// A spectrum analyser: bars that rise in eighth-row steps through a cool-to-hot gradient, white caps that hang and fall, and a faint mirror image below.
export const equalizer: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const pitch = g.w >= 40 ? 3 : 2, bars = Math.max(1, Math.floor((g.w + 1) / pitch)), left = Math.floor((g.w - (bars * pitch - 1)) / 2);
  const mirror = g.h >= 8 ? Math.max(1, Math.round(g.h * 0.22)) : 0, rows = g.h - mirror;
  const tones = Array.from({length: rows}, (_, up) => g.paint.fan(-0.85 + 1.75 * up / Math.max(1, rows - 1)));
  for (let bar = 0; bar < bars; bar++) {
    const index = bar * 22 / bars, level = clamp(band(index, t) * 1.15) * rows;
    let peak = level;
    for (let k = 1; k < 14; k++) peak = Math.max(peak, clamp(band(index, t - k * 0.08) * 1.15) * rows - Math.max(0, k - 5) * 0.45);
    for (let w = 0; w < pitch - 1; w++) {
      const x = left + bar * pitch + w;
      for (let up = 0; up < rows; up++) {
        const fill = clamp(level - up), y = rows - 1 - up;
        if (fill > 0) g.set(x, y, EIGHTHS[Math.max(1, Math.round(fill * 8))]!, tones[up]!);
        else if (Math.floor(peak) === up && peak > level + 0.3) g.set(x, y, '▁▂▃▄▅▆▇▇'[Math.floor((peak - up) * 8)]! === '▁' ? '▁' : '▔', '#ffffff', undefined, true);
        else if (up === 0) g.set(x, y, '▁', mix(panelBackground, tones[0]!, 0.5));
      }
      // The reflection: the same bar hanging down from the baseline, squeezed and dimmed with depth.
      for (let down = 0; down < mirror; down++) {
        const fill = clamp(level * mirror / rows * 0.9 - down);
        if (fill > 0) g.set(x, rows + down, fill >= 1 ? '█' : '▀', mix(panelBackground, tones[Math.min(rows - 1, Math.round(down * rows / mirror))]!, 0.34 * (1 - down / mirror)));
      }
    }
  }
  return g.finish();
};

// The spectrum as terrain: a filled, glowing outline at the front, and the shapes it had a moment ago standing behind it like a range of hills.
export const motionContour: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const layers = 4;
  for (let layer = layers - 1; layer >= 0; layer--) {
    const depth = layer / (layers - 1), when = t - layer * 0.28, tint = g.paint.fan(0.85 - depth * 1.7);
    const foot = p.ph - 1 - Math.round(depth * p.ph * 0.3), tall = (p.ph - 2) * (0.92 - depth * 0.42);
    let last = foot;
    for (let x = 0; x < p.pw; x++) {
      // A smooth curve through the bands, tapered to nothing at both ends so each range closes on itself.
      const u = x / Math.max(1, p.pw - 1), taper = Math.sin(u * Math.PI) ** 0.5;
      const level = clamp(0.06 + band(u * 16 + layer * 1.3, when) * 1.05) * taper;
      const top = Math.round(foot - level * tall);
      for (let y = top; y <= foot; y++) {
        const into = (y - top) / Math.max(1, foot - top);
        p.px(x, y, mix(panelBackground, tint, (0.55 - 0.4 * into) * (1 - depth * 0.55)));
      }
      for (let y = Math.min(top, last); y <= Math.max(top, last); y++) p.px(x, y, mix(tint, '#ffffff', layer ? 0.1 : 0.45));
      last = top;
    }
  }
  p.flush();
  return g.finish();
};

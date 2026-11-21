import type {ThemeName} from '../../types.js';
import {themeAccent} from '../theme.js';

type Cell = {text: string; color: string; backgroundColor?: string};
type Line = {text: string; color: string; segments: Cell[]};
type Builder = (pulse: number, width: number, height: number, theme: ThemeName) => Line[];
type Ink = {tint: number};

const TAU = Math.PI * 2;
const clamp = (n: number, low = 0, high = 1): number => Math.max(low, Math.min(high, n));
const fract = (n: number): number => n - Math.floor(n);
const tri = (n: number): number => 1 - Math.abs(2 * fract(n) - 1);
const smooth = (n: number): number => { const c = clamp(n); return c * c * (3 - 2 * c); };
const hash = (a: number, b = 0): number => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

// The receiver has no audio tap, so every scene dances to the same synthetic
// 120 bpm signal: a kick envelope, a spectrum and a waveform.
const seconds = (pulse: number): number => pulse * 0.08;
const kick = (t: number): number => (1 - fract(t * 2)) ** 3;
const band = (i: number, t: number): number => clamp(
  0.5 + 0.3 * Math.sin(i * 0.61 + t * 2.3) + 0.24 * Math.sin(i * 0.23 - t * 1.5 + 1.7) + 0.18 * Math.sin(i * 1.37 + t * 3.7)
) ** 1.6 * (0.6 + 0.4 * kick(t));
const wave = (s: number, t: number): number => (
  Math.sin(s * 6.3 + t * 5.1) * 0.55 + Math.sin(s * 14.7 - t * 8.3) * 0.28 + Math.sin(s * 29 + t * 13.7) * 0.17
) * (0.45 + 0.55 * kick(t));

const TINTS = 64;
const paletteCache = new Map<ThemeName, Float32Array>();
const hex2 = Array.from({length: 32}, (_, i) => Math.min(255, i * 8 + (i >> 2)).toString(16).padStart(2, '0'));

/** A 150-degree hue fan centered on the theme accent; neutral themes stay neutral. */
function palette(theme: ThemeName): Float32Array {
  const cached = paletteCache.get(theme);
  if (cached) return cached;
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(themeAccent(theme).slice(offset, offset + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  const hue = chroma === 0 ? 0 : max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  const saturation = max === 0 ? 0 : chroma / max;
  const value = clamp(max, 0.78, 1);
  const lut = new Float32Array(TINTS * 3);
  for (let i = 0; i < TINTS; i++) {
    const h = (hue + (i / (TINTS - 1) - 0.5) * 2.5 + 6) % 6;
    const channel = (n: number): number => {
      const k = (n + h) % 6;
      return value - value * saturation * clamp(Math.min(k, 4 - k));
    };
    lut.set([channel(5), channel(3), channel(1)], i * 3);
  }
  paletteCache.set(theme, lut);
  return lut;
}

/**
 * An additive light buffer at two pixels per cell (upper and lower half
 * blocks). Scene coordinates are u,v with v in [-1, 1]; wide panels stretch u
 * so centered figures use the room instead of sitting in a square.
 */
function surface(width: number, height: number, theme: ThemeName) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const ph = h * 2;
  const half = ph / 2;
  const stretch = clamp(w / ph / 1.6, 1, 2);
  const sx = half * stretch;
  const U = w / (2 * sx);
  const lut = palette(theme);
  const light = new Float32Array(w * ph * 3);

  const put = (x: number, y: number, tint: number, amount: number): void => {
    if (x < 0 || x >= w || y < 0 || y >= ph) return;
    const p = (y * w + x) * 3;
    const c = Math.round(clamp(tint) * (TINTS - 1)) * 3;
    light[p] = light[p]! + lut[c]! * amount;
    light[p + 1] = light[p + 1]! + lut[c + 1]! * amount;
    light[p + 2] = light[p + 2]! + lut[c + 2]! * amount;
  };
  const erase = (x: number, y: number): void => {
    if (x < 0 || x >= w || y < 0 || y >= ph) return;
    light.fill(0, (y * w + x) * 3, (y * w + x) * 3 + 3);
  };
  /** Sub-pixel splat in scene coordinates. */
  const dot = (u: number, v: number, tint: number, amount: number): void => {
    const fx = w / 2 - 0.5 + u * sx;
    const fy = half - 0.5 + v * half;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const ax = fx - x;
    const ay = fy - y;
    put(x, y, tint, amount * (1 - ax) * (1 - ay));
    put(x + 1, y, tint, amount * ax * (1 - ay));
    put(x, y + 1, tint, amount * (1 - ax) * ay);
    put(x + 1, y + 1, tint, amount * ax * ay);
  };
  const line = (u0: number, v0: number, u1: number, v1: number, tint: number, amount: number): void => {
    const steps = Math.min(4 * (w + ph), Math.ceil(Math.max(Math.abs(u1 - u0) * sx, Math.abs(v1 - v0) * half))) + 1;
    for (let i = 0; i <= steps; i++) dot(u0 + (u1 - u0) * i / steps, v0 + (v1 - v0) * i / steps, tint, amount);
  };
  /** A column trace joined to the previous column so steep waves stay unbroken. */
  const trace = (x: number, y: number, previous: number | undefined, tint: number, amount: number): void => {
    const from = previous === undefined ? y : previous < y ? previous + 1 : previous > y ? previous - 1 : y;
    for (let yy = Math.min(from, y); yy <= Math.max(from, y); yy++) put(x, yy, tint, amount);
  };
  const shade = (shader: (u: number, v: number, ink: Ink) => number): void => {
    const ink: Ink = {tint: 0.5};
    for (let y = 0; y < ph; y++) {
      const v = (y + 0.5 - half) / half;
      for (let x = 0; x < w; x++) {
        const amount = shader((x + 0.5 - w / 2) / sx, v, ink);
        if (amount > 0) put(x, y, ink.tint, amount);
      }
    }
  };

  const colorAt = (x: number, y: number): string | undefined => {
    const p = (y * w + x) * 3;
    let r = light[p]!, g = light[p + 1]!, b = light[p + 2]!;
    // Overdriven light spills into the other channels: hot cores burn white.
    const spill = Math.max(0, Math.max(r, g, b) - 1) * 0.6;
    r = Math.round(clamp(r + spill) * 31);
    g = Math.round(clamp(g + spill) * 31);
    b = Math.round(clamp(b + spill) * 31);
    return Math.max(r, g, b) < 3 ? undefined : `#${hex2[r]}${hex2[g]}${hex2[b]}`;
  };
  const finish = (): Line[] => {
    const accent = themeAccent(theme);
    return Array.from({length: h}, (_, row) => {
      const segments: Cell[] = [];
      let text = '';
      for (let x = 0; x < w; x++) {
        const top = colorAt(x, row * 2);
        const bottom = colorAt(x, row * 2 + 1);
        const cell: Cell = top === bottom
          ? top ? {text: ' ', color: top, backgroundColor: top} : {text: ' ', color: accent}
          : !bottom ? {text: '▀', color: top!}
            : !top ? {text: '▄', color: bottom}
              : {text: '▀', color: top, backgroundColor: bottom};
        text += cell.text;
        const last = segments.at(-1);
        if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor) last.text += cell.text;
        else segments.push(cell);
      }
      return {text, color: accent, segments};
    });
  };
  // Splatted scenes overlap more as the panel shrinks; keep them from burning out.
  const gain = clamp(half / 14, 0.3, 1);
  return {w, ph, half, stretch, U, gain, put, erase, dot, line, trace, shade, finish};
}

// Slow coloured smoke folding through itself.
const ambience: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const breath = 0.8 + 0.2 * Math.sin(t * 1.57);
  s.shade((u, v, ink) => {
    const a = Math.sin(u * 1.3 + t * 0.31 + Math.sin(v * 1.7 - t * 0.23) * 1.2);
    const b = Math.cos(v * 1.9 - t * 0.27 + Math.sin(u * 1.1 + t * 0.19) * 1.4);
    const cloud = Math.sin((u + b) * 2.1 + t * 0.4) * Math.cos((v + a) * 2.3 - t * 0.33);
    const filament = Math.max(0, Math.sin(a * 3 + b * 2 + t * 0.5)) ** 8;
    ink.tint = 0.5 + 0.5 * Math.sin(a * 1.5 + b + t * 0.2);
    return smooth(0.5 + 0.5 * cloud) * 0.8 * breath + filament * 0.55;
  });
  return s.finish();
};

type Formation = (i: number, n: number, out: Float32Array) => void;
const formations: Formation[] = [
  (i, n, out) => { // sphere
    const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963;
    out[0] = Math.cos(a) * r; out[1] = y; out[2] = Math.sin(a) * r;
  },
  (i, n, out) => { // torus
    const a = i / n * TAU * 13, b = i / n * TAU, r = 0.72 + 0.3 * Math.cos(a);
    out[0] = Math.cos(b) * r; out[1] = 0.3 * Math.sin(a); out[2] = Math.sin(b) * r;
  },
  (i, n, out) => { // double helix
    const a = i / n * TAU * 3 + (i % 2) * Math.PI;
    out[0] = Math.cos(a) * 0.55; out[1] = i / n * 2 - 1; out[2] = Math.sin(a) * 0.55;
  },
  (i, n, out) => { // trefoil knot
    const a = i / n * TAU;
    out[0] = (Math.sin(a) + 2 * Math.sin(2 * a)) / 2.6; out[1] = (Math.cos(a) - 2 * Math.cos(2 * a)) / 2.6; out[2] = -Math.sin(3 * a) * 0.6;
  }
];

// A swarm of sparks that keeps reorganising itself into new solids.
const alchemy: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const count = 200;
  const stage = t / 5;
  const from = formations[Math.floor(stage) % formations.length]!;
  const to = formations[(Math.floor(stage) + 1) % formations.length]!;
  const mix = smooth((fract(stage) - 0.55) / 0.45);
  const a = new Float32Array(3), b = new Float32Array(3);
  for (let k = 5; k >= 0; k--) {
    const tk = t - k * 0.045;
    const ry = tk * 0.9, rx = 0.5 + Math.sin(tk * 0.4) * 0.5;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sxr = Math.sin(rx);
    const size = 1.12 * (1 + 0.1 * kick(tk));
    for (let i = 0; i < count; i++) {
      from(i, count, a); to(i, count, b);
      const x0 = a[0]! + (b[0]! - a[0]!) * mix, y0 = a[1]! + (b[1]! - a[1]!) * mix, z0 = a[2]! + (b[2]! - a[2]!) * mix;
      const x = x0 * cy + z0 * sy, z1 = z0 * cy - x0 * sy;
      const y = y0 * cx - z1 * sxr, z = y0 * sxr + z1 * cx;
      const lens = 2.3 / (2.8 - z) * size;
      s.dot(x * lens, y * lens, i / count, (0.3 + 0.25 * (z + 1)) * 0.6 ** k * s.gain);
    }
  }
  return s.finish();
};

// Spectrum bars standing in still water, with the waveform drifting overhead.
const oceanMist: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const base = Math.max(1, Math.floor(s.ph * 0.7));
  const pitch = s.w >= 48 ? 3 : 2;
  const bars = Math.ceil(s.w / pitch);
  for (let bar = 0; bar < bars; bar++) {
    const i = bar / bars * 22;
    const top = Math.round(band(i, t) * (base - 1));
    let peak = top;
    for (let k = 1; k < 10; k++) peak = Math.max(peak, band(i, t - k * 0.08) * (base - 1) - k * 0.7);
    for (let x = bar * pitch; x < bar * pitch + Math.max(1, pitch - 1); x++) {
      for (let n = 0; n < top; n++) s.put(x, base - 1 - n, 0.12 + 0.75 * n / base, 0.6 + 0.5 * n / base);
      s.put(x, base - 1 - Math.round(peak), 0.95, 1.5);
      for (let d = 0; d < Math.min(top, s.ph - base - 1); d++) {
        const fade = (1 - d / (s.ph - base)) ** 2 * (0.7 + 0.3 * Math.sin(d * 1.3 + t * 4 + x * 0.4));
        s.put(x, base + 1 + d, 0.12 + 0.7 * d / base, 0.34 * fade);
      }
    }
  }
  let previous: number | undefined;
  for (let x = 0; x < s.w; x++) {
    s.put(x, base, 0.5, 0.22);
    const y = Math.round(s.ph * 0.24 + wave(x / s.w * 2 - 1, t) * s.ph * 0.19);
    s.trace(x, y, previous, 0.88, 0.95);
    s.put(x, y + 1, 0.7, 0.22);
    previous = y;
  }
  return s.finish();
};

// Three charged arms spiralling into a white-hot terminal.
const battery: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const charge = 0.5 + 0.8 * kick(t);
  s.shade((u, v, ink) => {
    const r = Math.hypot(u, v) + 1e-3;
    const a = Math.atan2(v, u);
    const lr = Math.log(r);
    const arms = 0.5 + 0.5 * Math.sin(a * 3 + lr * 5 - t * 1.6);
    const arcs = 0.5 + 0.5 * Math.sin(lr * 11 - t * 4 + Math.sin(a * 6 + t * 0.9) * 0.8);
    ink.tint = tri(lr * 0.35 - t * 0.07 + a / TAU);
    return arms ** 4 * (0.35 + 0.65 * arcs) * 1.1 + 0.12 / (r * r * 6 + 0.08) * charge;
  });
  return s.finish();
};

// Counter-rotating petals of light, each layer with one more lobe than the last.
const plenoptic: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const swell = 1 + 0.16 * kick(t);
  s.shade((u, v, ink) => {
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);
    let total = 0, strongest = 0, layer = 0;
    for (let l = 0; l < 3; l++) {
      const rotation = t * (0.3 + 0.17 * l) * (l % 2 ? -1 : 1);
      const d = r - (0.42 + 0.27 * l) * (0.55 + 0.45 * Math.cos((3 + l) * (a + rotation))) * swell;
      const glow = Math.exp(-d * d * 150) + (d < 0 ? 0.2 : 0.07) * Math.exp(-d * d * 9);
      if (glow > strongest) { strongest = glow; layer = l; }
      total += glow;
    }
    ink.tint = tri(layer / 3 + a / TAU + t * 0.03);
    return total * 0.95;
  });
  return s.finish();
};

// A spectrum bent into a sunburst, throwing ghosts of itself outward.
const spikes: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const count = 56;
  for (let k = 4; k >= 0; k--) {
    const tk = t - k * 0.07;
    const scale = 1 + 0.38 * k;
    const fade = 0.42 ** k * s.gain;
    const r0 = 0.3 * (1 + 0.25 * kick(tk)) * scale;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + tk * 0.25;
      const r1 = r0 + (0.08 + 0.75 * band(Math.min(i, count - i) * 0.7, tk)) * scale;
      const c = Math.cos(a), sn = Math.sin(a);
      s.line(c * r0, sn * r0, c * r1, sn * r1, tri(i / count * 2 + tk * 0.05), 0.42 * fade);
    }
    for (let i = 0; i < 120; i++) s.dot(Math.cos(i / 120 * TAU) * r0, Math.sin(i / 120 * TAU) * r0, 0.5, 0.5 * fade);
  }
  return s.finish();
};

// Flat slabs of colour marching out of the centre, one polygon per bar of music.
const musicalColors: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const sector = TAU / (3 + Math.floor(t / 6) % 4);
  const rotation = t * 0.15 + Math.sin(t * 0.5) * 0.3;
  s.shade((u, v, ink) => {
    const a = Math.atan2(v, u) + rotation;
    const phase = Math.hypot(u, v) * Math.cos(a - Math.floor(a / sector) * sector - sector / 2) * 5 - t * 1.4;
    const ring = Math.floor(phase);
    const f = phase - ring;
    if (f > 0.84) return 0;
    ink.tint = hash(ring, 7);
    return (0.22 + 0.78 * band((ring % 9 + 9) % 9 * 2.1, t)) * (0.7 + 0.3 * f);
  });
  return s.finish();
};

// The waveform fed back into itself: every echo a little larger and further round.
const milkdrop: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const samples = Math.max(8, Math.min(120, s.w));
  for (let k = 10; k >= 0; k--) {
    const tk = t - k * 0.06;
    const zoom = 1.2 ** k;
    const turn = k * 0.11 * Math.sin(t * 0.21) + t * 0.1;
    const c = Math.cos(turn) * zoom, sn = Math.sin(turn) * zoom;
    const tint = tri(k / 11 + t * 0.04);
    const amount = (k ? 0.5 : 1.1) * 0.84 ** k * s.gain;
    const drive = 0.5 + 0.5 * kick(tk);
    let pu = 0, pv = 0;
    for (let i = 0; i <= samples; i++) {
      const x = (i / samples * 2 - 1) * 0.75;
      const y = (Math.sin(x * 5.3 + tk * 3.1) * 0.6 + Math.sin(x * 12 - tk * 4.7) * 0.3) * drive * 0.4;
      const u = x * c - y * sn, v = x * sn + y * c;
      if (i) s.line(pu, pv, u, v, tint, amount);
      pu = u; pv = v;
    }
  }
  return s.finish();
};

// Fans of beams sweeping up through haze from three rigs under the stage.
const laserShow: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const focus = s.half * s.half * 2;
  const beams: {u: number; dx: number; dy: number; tint: number; power: number; phase: number}[] = [];
  for (let e = 0; e < 3; e++) {
    const spread = 0.1 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.9 + e * 1.3));
    const power = hash(Math.floor(t * 2), e) > 0.2 ? 1 : 0.4;
    for (let j = 0; j < 4; j++) {
      const angle = Math.sin(t * (0.5 + 0.13 * e) + e * 2.1) * 0.7 + (j - 1.5) * spread;
      beams.push({u: (e - 1) * 0.8 * s.U, dx: Math.sin(angle), dy: -Math.cos(angle), tint: tri(e / 3 + j * 0.09 + t * 0.02), power, phase: j});
    }
  }
  s.shade((u, v, ink) => {
    let total = 0, strongest = 0;
    for (const beam of beams) {
      const x = u - beam.u, y = v - 1.06;
      const along = x * beam.dx + y * beam.dy;
      if (along <= 0) continue;
      const across = (x * beam.dy - y * beam.dx) ** 2;
      if (across > 0.1) continue;
      const glow = ((across * focus < 9 ? Math.exp(-across * focus) : 0) + 0.16 * Math.exp(-across * 50)) *
        beam.power * (0.75 + 0.25 * Math.sin(along * 14 - t * 9 + beam.phase));
      if (glow > strongest) { strongest = glow; ink.tint = beam.tint; }
      total += glow;
    }
    return total;
  });
  return s.finish();
};

// A mirror ball turning over a floor of tiles that change on the beat.
const disco: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const beat = Math.floor(t * 2);
  const thump = 0.55 + 0.45 * kick(t);
  const ballV = -0.42, ballR = 0.46;
  const spots = Array.from({length: 14}, (_, i) => ({
    u: (fract(hash(i, 1) + t * 0.05 * (1 + i % 3) * (i % 2 ? 1 : -1)) * 2 - 1) * s.U * 1.1,
    v: -0.95 + hash(i, 2) * 0.9 + Math.sin(t * 0.8 + i) * 0.05,
    tint: hash(i, 3)
  }));
  s.shade((u, v, ink) => {
    if (v > 0.08) {
      const near = (v - 0.08) / 0.92;
      const depth = 1 / (near + 0.04);
      const wx = u * depth * 1.5, wz = depth * 1.9 + t * 0.5;
      const ix = Math.floor(wx), iz = Math.floor(wz);
      const fx = wx - ix, fz = wz - iz;
      if (fx < 0.06 || fx > 0.94 || fz < 0.08 || fz > 0.92) return 0;
      ink.tint = hash(ix + 0.5, iz + 0.25);
      return (hash(ix * 3.1 + iz * 17.3, beat) > 0.58 ? thump : 0.1) * clamp(near * 1.6 + 0.15);
    }
    const nx = u * s.stretch / ballR, ny = (v - ballV) / ballR;
    const d2 = nx * nx + ny * ny;
    if (d2 < 1) {
      const nz = Math.sqrt(1 - d2);
      const fi = Math.floor((Math.atan2(nx, nz) + t * 0.7) * 4.5), fj = Math.floor(Math.asin(ny) * 5);
      ink.tint = hash(fi, fj);
      return (0.22 + 0.9 * hash(fi * 7.7 + fj, Math.floor(t * 4 + hash(fi, fj) * 4)) ** 3) * (0.4 + 0.6 * nz);
    }
    if (v < ballV && Math.abs(u * s.stretch) < 0.03) return 0.3;
    let total = 0, strongest = 0;
    for (const spot of spots) {
      const du = (u - spot.u) * s.stretch, dv = v - spot.v;
      const glow = Math.exp(-(du * du + dv * dv) * 200);
      if (glow > strongest) { strongest = glow; ink.tint = spot.tint; }
      total += glow;
    }
    return total * 0.85;
  });
  return s.finish();
};

// Each new slice of spectrum lands in front and pushes the older ones to the horizon.
const ridgeline: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const lines = Math.max(2, Math.min(18, Math.floor(s.ph * 0.4)));
  for (let k = 0; k < lines; k++) {
    const depth = 1 - k / (lines - 1);
    const scale = 1 / (1 + depth * 1.3);
    const base = s.ph * (0.3 + 0.66 * (1 - depth) ** 1.35) - 0.5;
    const tk = t - depth * 2.2;
    let previous: number | undefined;
    for (let x = 0; x < s.w; x++) {
      const xn = (x / Math.max(1, s.w - 1) * 2 - 1) / scale * 0.8;
      if (Math.abs(xn) > 1.3) { previous = undefined; continue; }
      const ridge = clamp(0.5 + 0.3 * Math.sin(xn * 8 + tk * 2.3) + 0.26 * Math.sin(xn * 19 - tk * 3.1) + 0.2 * Math.sin(xn * 3.3 - tk * 1.2)) ** 2 *
        Math.exp(-xn * xn * 2.6) * (0.7 + 0.3 * kick(tk));
      const y = Math.round(base - ridge * s.ph * 0.42 * scale);
      for (let yy = Math.min(y, previous ?? y); yy < s.ph; yy++) s.erase(x, yy);
      s.trace(x, y, previous, 0.15 + 0.7 * (1 - depth), 0.3 + 0.8 * (1 - depth));
      previous = y;
    }
  }
  return s.finish();
};

// A two-channel scope whose phosphor is slow to let go of the last few sweeps.
const afterglow: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const channels = s.ph >= 8 ? 2 : 1;
  for (let y = 0; y < s.ph; y++) {
    for (let x = 0; x < s.w; x++) {
      if ((x % 10 === 5 && y % 2 === 0) || (y % 7 === 3 && x % 2 === 0)) s.put(x, y, 0.5, 0.09);
    }
  }
  for (let k = 7; k >= 0; k--) {
    const tk = t - k * 0.08;
    for (let channel = 0; channel < channels; channel++) {
      const center = channels === 1 ? s.half : s.ph * (channel ? 0.73 : 0.27);
      const amplitude = s.ph * (channels === 1 ? 0.4 : 0.21);
      const tint = clamp(0.5 + (channel ? 0.28 : -0.28) * (channels - 1) + k * 0.025);
      let previous: number | undefined;
      for (let x = 0; x < s.w; x++) {
        const phase = (x / Math.max(1, s.w - 1) * 2 - 1) * (channel ? 1.3 : 1) + channel * 0.7;
        const y = Math.round(center - 0.5 + wave(phase, tk + channel * 0.31) * amplitude);
        s.trace(x, y, previous, tint, (k ? 0.55 : 1.4) * 0.66 ** k);
        previous = y;
      }
    }
  }
  return s.finish();
};

export const mediaPlayerReceiverBuilders = {
  ambience,
  alchemy,
  'ocean-mist': oceanMist,
  battery,
  plenoptic,
  spikes,
  'musical-colors': musicalColors,
  milkdrop,
  'laser-show': laserShow,
  disco,
  ridgeline,
  afterglow
};

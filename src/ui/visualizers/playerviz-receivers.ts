import type {ThemeName} from '../../types.js';
import {themeAccent} from '../theme.js';
import {TAU, band, clamp, fract, hash, kick, seconds, smooth, tri, type Builder} from './cell-canvas.js';

type Cell = {text: string; color: string; backgroundColor?: string};
type Line = {text: string; color: string; segments: Cell[]};
type Ink = {tint: number};

const wave = (s: number, t: number): number => (
  Math.sin(s * 6.3 + t * 5.1) * 0.55 + Math.sin(s * 14.7 - t * 8.3) * 0.28 + Math.sin(s * 29 + t * 13.7) * 0.17
) * (0.45 + 0.55 * kick(t));

const TINTS = 64;
const paletteCache = new Map<ThemeName, Float32Array>();
const hex2 = Array.from({length: 32}, (_, i) => Math.min(255, i * 8 + (i >> 2)).toString(16).padStart(2, '0'));

function palette(theme: ThemeName): Float32Array {
  const cached = paletteCache.get(theme);
  if (cached) return cached;
  const [r, g, b] = [1, 3, 5].map(o => parseInt(themeAccent(theme).slice(o, o + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b), chroma = max - Math.min(r, g, b);
  const hue = chroma === 0 ? 0 : max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  const sat = max === 0 ? 0 : chroma / max, val = clamp(max, 0.78, 1);
  const lut = new Float32Array(TINTS * 3);
  for (let i = 0; i < TINTS; i++) {
    const h = (hue + (i / (TINTS - 1) - 0.5) * 2.8 + 6) % 6;
    const ch = (n: number): number => { const k = (n + h) % 6; return val - val * sat * clamp(Math.min(k, 4 - k)); };
    lut.set([ch(5), ch(3), ch(1)], i * 3);
  }
  paletteCache.set(theme, lut);
  return lut;
}

/** Additive half-block light buffer for luminous media-player visualizations. */
function surface(width: number, height: number, theme: ThemeName) {
  const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height)), ph = h * 2;
  const half = ph / 2, stretch = clamp(w / ph / 1.6, 1, 2), sx = half * stretch, U = w / (2 * sx);
  const lut = palette(theme);
  const light = new Float32Array(w * ph * 3);

  const put = (x: number, y: number, tint: number, amount: number): void => {
    if (x < 0 || x >= w || y < 0 || y >= ph) return;
    const p = (y * w + x) * 3, c = Math.round(clamp(tint) * (TINTS - 1)) * 3;
    light[p] = light[p]! + lut[c]! * amount;
    light[p + 1] = light[p + 1]! + lut[c + 1]! * amount;
    light[p + 2] = light[p + 2]! + lut[c + 2]! * amount;
  };
  const dot = (u: number, v: number, tint: number, amount: number): void => {
    const fx = w / 2 - 0.5 + u * sx, fy = half - 0.5 + v * half;
    const x = Math.floor(fx), y = Math.floor(fy), ax = fx - x, ay = fy - y;
    put(x, y, tint, amount * (1 - ax) * (1 - ay));
    put(x + 1, y, tint, amount * ax * (1 - ay));
    put(x, y + 1, tint, amount * (1 - ax) * ay);
    put(x + 1, y + 1, tint, amount * ax * ay);
  };
  const line = (u0: number, v0: number, u1: number, v1: number, tint: number, amount: number): void => {
    const steps = Math.min(4 * (w + ph), Math.ceil(Math.max(Math.abs(u1 - u0) * sx, Math.abs(v1 - v0) * half))) + 1;
    for (let i = 0; i <= steps; i++) dot(u0 + (u1 - u0) * i / steps, v0 + (v1 - v0) * i / steps, tint, amount);
  };
  const trace = (x: number, y: number, prev: number | undefined, tint: number, amount: number): void => {
    const from = prev === undefined ? y : prev < y ? prev + 1 : prev > y ? prev - 1 : y;
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
        const top = colorAt(x, row * 2), bot = colorAt(x, row * 2 + 1);
        const cell: Cell = top === bot
          ? top ? {text: ' ', color: top, backgroundColor: top} : {text: ' ', color: accent}
          : !bot ? {text: '▀', color: top!}
            : !top ? {text: '▄', color: bot}
              : {text: '▀', color: top, backgroundColor: bot};
        text += cell.text;
        const last = segments.at(-1);
        if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor) last.text += cell.text;
        else segments.push(cell);
      }
      return {text, color: accent, segments};
    });
  };
  const gain = clamp(half / 14, 0.32, 1);
  return {w, ph, half, stretch, U, gain, put, dot, line, trace, shade, finish};
}

// Classic WMP "Bars and Waves": mirrored blazing spectrum pillars with hot floating peaks and a dual oscilloscope wave.
const barsAndWaves: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const mid = Math.floor(s.ph / 2);
  const pitch = s.w >= 48 ? 3 : 2, bars = Math.max(1, Math.ceil(s.w / pitch));
  for (let b = 0; b < bars; b++) {
    const idx = b / bars * 20;
    const h = Math.round(band(idx, t) * (mid - 1));
    let pk = h;
    for (let k = 1; k < 10; k++) pk = Math.max(pk, Math.round(band(idx, t - k * 0.08) * (mid - 1) - k * 0.55));
    for (let x = b * pitch; x < b * pitch + Math.max(1, pitch - 1); x++) {
      for (let d = 0; d < h; d++) {
        const f = d / Math.max(1, mid - 1);
        const tint = 0.12 + 0.78 * f, lum = 0.42 + 0.52 * f;
        s.put(x, mid - 1 - d, tint, lum);
        s.put(x, mid + d, tint, lum * 0.85);
      }
      s.put(x, mid - 1 - pk, 0.96, 1.45);
      s.put(x, mid + pk, 0.96, 1.15);
    }
  }
  let p1: number | undefined, p2: number | undefined;
  for (let x = 0; x < s.w; x++) {
    const u = x / Math.max(1, s.w - 1) * 2 - 1;
    const y1 = Math.round(mid + wave(u, t) * s.ph * 0.32);
    const y2 = Math.round(mid + wave(u + 0.14, t - 0.12) * s.ph * 0.24);
    s.trace(x, y1, p1, 0.88, 1.35);
    s.trace(x, y2, p2, 0.25, 0.65);
    s.put(x, y1 - 1, 0.75, 0.28); s.put(x, y1 + 1, 0.75, 0.28);
    p1 = y1; p2 = y2;
  }
  return s.finish();
};

// Iconic Windows Media Player XP "Energy Bliss": sweeping translucent silky plasma ribbons and drifting luminous motes.
const energyBliss: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const surge = 0.78 + 0.42 * kick(t);
  s.shade((u, v, ink) => {
    let total = 0, top = 0, topTint = 0.5;
    for (let r = 0; r < 5; r++) {
      const p = r * 1.17 + t * (0.48 + r * 0.09);
      const center = Math.sin(u * (1.25 + r * 0.22) + p) * (0.46 + 0.12 * Math.sin(t * 0.7 + r))
        + Math.cos(u * 2.4 - p * 0.7) * 0.18 + (r - 2) * 0.15;
      const d = Math.abs(v - center);
      const thick = 0.14 + 0.06 * Math.sin(u * 2.1 + p * 1.3);
      const body = Math.exp(-(d * d) / (thick * thick * 1.4)) * 0.36;
      const edge = Math.exp(-((d - thick * 0.65) ** 2) * 260) * 0.95;
      const glow = (body + edge) * (0.75 + 0.35 * band(r * 3.2, t)) * surge;
      const tint = tri(r / 5 + u * 0.16 + t * 0.05);
      if (glow > top) { top = glow; topTint = tint; }
      total += glow;
    }
    ink.tint = topTint;
    return total * 0.72;
  });
  // Drifting glowing motes caught in the ribbons.
  for (let m = 0; m < 16; m++) {
    const mu = (fract(hash(m, 3) + t * (0.04 + 0.06 * hash(m, 4))) * 2 - 1) * s.U;
    const mv = Math.sin(mu * 1.5 + t * 0.8 + m) * 0.65;
    s.dot(mu, mv, hash(m, 5), (0.65 + 0.65 * kick(t)) * s.gain);
  }
  return s.finish();
};

// Classic WMP "Blazing Colors": fluid iridescent interference bands folding outward from shifting focal points.
const blazingColors: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const f1u = Math.sin(t * 0.63) * 0.65 * s.U, f1v = Math.cos(t * 0.47) * 0.55;
  const f2u = Math.cos(t * 0.51 + 1.2) * 0.65 * s.U, f2v = Math.sin(t * 0.72 + 0.8) * 0.55;
  const boost = 0.82 + 0.36 * kick(t);
  s.shade((u, v, ink) => {
    const r1 = Math.hypot(u - f1u, v - f1v), r2 = Math.hypot(u - f2u, v - f2v);
    const warp = Math.sin(u * 2.1 - t * 0.9) * Math.cos(v * 2.3 + t * 0.7) * 0.7;
    const field = Math.sin(r1 * 8.5 - t * 3.4 + warp) + Math.sin(r2 * 7.8 - t * 2.9 - warp);
    const crest = Math.abs(Math.sin(field * 1.65)) ** 2.4;
    const flare = Math.exp(-r1 * r1 * 2.5) * 0.55 + Math.exp(-r2 * r2 * 2.5) * 0.55;
    ink.tint = tri(field * 0.24 + (r1 - r2) * 0.2 + t * 0.08);
    return (0.16 + crest * 0.82 + flare) * boost;
  });
  return s.finish();
};

// WMP "Trilogy" / AVS 3D orbiting light spheres with comet ribbon trails and beat shockwave rings.
const trilogyOrbs: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  // Expanding beat shockwave ring from the center star.
  const ringR = fract(t * 1.0) * 1.45, ringFade = (1 - fract(t * 1.0)) ** 1.5;
  s.shade((u, v, ink) => {
    const r = Math.hypot(u, v);
    const shock = Math.exp(-((r - ringR) ** 2) * 90) * ringFade * 0.75;
    const core = 0.14 / (r * r * 14 + 0.09) * (0.7 + 0.6 * kick(t));
    ink.tint = tri(r * 0.4 + t * 0.1);
    return shock + core;
  });
  // Three luminous 3D orbiting orbs with sweeping multi-step ribbon trails.
  const trailSteps = 22;
  for (let o = 0; o < 3; o++) {
    const baseA = o * TAU / 3;
    const tint = o / 3 + 0.15;
    let pu = 0, pv = 0;
    for (let k = trailSteps; k >= 0; k--) {
      const tk = t - k * 0.032;
      const a = tk * (1.35 + o * 0.19) + baseA;
      const inc = 0.65 + o * 0.45;
      const x = Math.cos(a) * 0.85, y = Math.sin(a) * Math.cos(inc + tk * 0.3) * 0.72, z = Math.sin(a) * Math.sin(inc + tk * 0.3) * 0.85;
      const persp = 1.9 / (2.5 - z);
      const u = x * persp, v = y * persp;
      const fade = (1 - k / trailSteps) ** 1.7 * (0.55 + 0.45 * (z + 1) / 2);
      if (k < trailSteps) s.line(pu, pv, u, v, tri(tint + k * 0.015), 0.72 * fade * s.gain);
      if (k === 0) {
        const glow = (1.5 + 0.7 * kick(t)) * s.gain;
        s.dot(u, v, tint, glow * 1.8);
        for (let r = 0; r < 6; r++) {
          const ra = r * TAU / 6 + t * 2;
          s.dot(u + Math.cos(ra) * 0.07, v + Math.sin(ra) * 0.07, tint, glow * 0.7);
        }
      }
      pu = u; pv = v;
    }
  }
  return s.finish();
};

// Classic 1999 Winamp "Geiss" feedback swirl: warped audio waveform echoes spiraling outward from a pulsing core.
const geissVortex: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  // Radial motion-blur vortex haze underneath.
  s.shade((u, v, ink) => {
    const r = Math.hypot(u, v) + 1e-3, a = Math.atan2(v, u);
    const streaks = (0.5 + 0.5 * Math.sin(a * 12 + Math.log(r) * 4.5 - t * 3.2)) ** 3;
    const core = 0.1 / (r * r * 12 + 0.06) * (0.7 + 0.6 * kick(t));
    ink.tint = tri(Math.log(r) * 0.25 - t * 0.12 + a / TAU);
    return streaks * 0.36 * clamp(1.2 - r * 0.65) + core;
  });
  // Nine zooming, twisting feedback echoes of a closed polar audio ring.
  const segs = 48;
  for (let k = 8; k >= 0; k--) {
    const tk = t - k * 0.055;
    const scale = 0.26 * 1.22 ** k;
    const twist = k * 0.18 * Math.sin(t * 0.35) + tk * 0.3;
    const tint = tri(k / 9 + t * 0.06);
    const lum = (k === 0 ? 1.35 : 0.62 * 0.8 ** k) * s.gain;
    let pu = 0, pv = 0;
    for (let i = 0; i <= segs; i++) {
      const a = i / segs * TAU;
      const rad = scale * (0.72 + 0.42 * band((i % 16) * 1.3, tk) + 0.22 * Math.sin(a * 4 + tk * 4));
      const u = Math.cos(a + twist) * rad, v = Math.sin(a + twist) * rad;
      if (i > 0) s.line(pu, pv, u, v, tint, lum);
      pu = u; pv = v;
    }
  }
  return s.finish();
};

// Classic Winamp AVS parametric superscope morphing between 4 mathematical presets with glowing phosphor trails.
const avsSuperscope: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const presetAt = (idx: number, f: number, tk: number): [number, number] => {
    const a = f * TAU, mod = 0.25 * wave(f * 2 - 1, tk);
    switch (idx % 4) {
      case 0: { // 5-petal harmonic rose
        const r = (0.55 + 0.35 * Math.cos(a * 5 + tk * 1.5) + mod * 0.6) * (0.85 + 0.2 * kick(tk));
        return [Math.cos(a + tk * 0.4) * r, Math.sin(a + tk * 0.4) * r];
      }
      case 1: { // Spiraling star
        const r = (0.3 + 0.62 * f) * (0.78 + 0.26 * Math.sin(a * 7 - tk * 4) + mod * 0.4);
        return [Math.cos(a * 3 + tk * 0.9) * r, Math.sin(a * 3 + tk * 0.9) * r];
      }
      case 2: { // Butterfly wave
        const r = (Math.exp(Math.cos(a)) - 2 * Math.cos(4 * a)) * 0.24 + mod * 0.35;
        return [Math.sin(a + tk * 0.5) * r, Math.cos(a + tk * 0.5) * r];
      }
      default: { // Twisted Lissajous knot
        return [Math.sin(a * 3 + tk * 1.2) * (0.78 + mod * 0.4), Math.sin(a * 4 - tk * 0.9) * (0.78 - mod * 0.4)];
      }
    }
  };
  const stage = t / 5, from = Math.floor(stage), blend = smooth((fract(stage) - 0.6) / 0.4);
  const pts = 110;
  for (let k = 4; k >= 0; k--) {
    const tk = t - k * 0.045;
    const lum = (k === 0 ? 1.25 : 0.48 * 0.68 ** k) * s.gain;
    let pu = 0, pv = 0;
    for (let i = 0; i <= pts; i++) {
      const f = i / pts;
      const [u0, v0] = presetAt(from, f, tk), [u1, v1] = presetAt(from + 1, f, tk);
      const u = u0 + (u1 - u0) * blend, v = v0 + (v1 - v0) * blend;
      if (i > 0) s.line(pu, pv, u, v, tri(f * 2 + tk * 0.08 + k * 0.07), lum);
      pu = u; pv = v;
    }
  }
  return s.finish();
};

// WMP "Scope" / Winamp dual-channel glowing stereo oscilloscope with center beat-spike bridges.
const scopePeaks: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const midL = s.ph * 0.3, midR = s.ph * 0.7, amp = s.ph * 0.2;
  let prevL: number | undefined, prevR: number | undefined;
  for (let x = 0; x < s.w; x++) {
    const u = x / Math.max(1, s.w - 1) * 2 - 1;
    const yL = Math.round(midL + wave(u, t) * amp);
    const yR = Math.round(midR + wave(u * 1.15 + 0.6, t * 1.04 + 0.9) * amp);
    // Subtle phosphor graticule & center harmonic beat spikes bridging L and R.
    if (x % 6 === 0) {
      const spike = Math.round(band(x / 6 * 1.5, t) * (s.ph * 0.22));
      const cy = Math.floor(s.ph / 2);
      for (let d = -spike; d <= spike; d++) s.put(x, cy + d, 0.52, 0.32 * (1 - Math.abs(d) / Math.max(1, spike + 1)));
    }
    s.trace(x, yL, prevL, 0.2, 1.35);
    s.trace(x, yR, prevR, 0.82, 1.35);
    for (const dy of [-2, -1, 1, 2]) {
      const halo = Math.abs(dy) === 1 ? 0.42 : 0.15;
      s.put(x, yL + dy, 0.2, halo);
      s.put(x, yR + dy, 0.82, halo);
    }
    prevL = yL; prevR = yR;
  }
  return s.finish();
};

// Classic 2000s 3D mirrored-floor equalizer: glowing spectrum pillars, rising dust motes, and rippled glassy reflections.
const mirrorBars: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const horizon = Math.max(2, Math.floor(s.ph * 0.64));
  const pitch = s.w >= 54 ? 4 : s.w >= 26 ? 3 : 2;
  const bars = Math.max(1, Math.floor(s.w / pitch));
  const left = Math.floor((s.w - bars * pitch) / 2);
  // Subtle horizon line sheen.
  for (let x = 0; x < s.w; x++) s.put(x, horizon, 0.5, 0.26);
  for (let b = 0; b < bars; b++) {
    const i = b / bars * 22;
    const h = Math.round(band(i, t) * (horizon - 2));
    let pk = h;
    for (let k = 1; k < 12; k++) pk = Math.max(pk, Math.round(band(i, t - k * 0.08) * (horizon - 2) - k * 0.6));
    const bw = Math.max(1, pitch - 1);
    for (let dx = 0; dx < bw; dx++) {
      const x = left + b * pitch + dx;
      const edgeDim = bw >= 3 && (dx === 0 || dx === bw - 1) ? 0.78 : 1;
      for (let d = 0; d < h; d++) {
        const f = d / Math.max(1, horizon - 2);
        const seg = d % 2 === 0 ? 1 : 0.65;
        s.put(x, horizon - 1 - d, 0.1 + 0.82 * f, (0.45 + 0.65 * f) * seg * edgeDim);
      }
      s.put(x, horizon - 1 - pk, 0.96, 1.5);
      // Shimmering vertically-flipped floor reflection.
      const maxRef = Math.min(h, s.ph - horizon - 1);
      for (let d = 0; d < maxRef; d++) {
        const fade = (1 - d / Math.max(1, s.ph - horizon)) ** 1.9;
        const ripple = 0.62 + 0.38 * Math.sin(d * 1.4 - t * 5 + b * 0.7);
        s.put(x, horizon + 1 + d, 0.1 + 0.75 * d / Math.max(1, horizon), 0.36 * fade * ripple * edgeDim);
      }
    }
    // Floating equalizer dust sparks rising above hot bars.
    const sparkAge = fract(t * 0.8 + hash(b, 9));
    if (h > horizon * 0.45) s.put(left + b * pitch + Math.floor(bw / 2), Math.max(0, horizon - 1 - pk - Math.round(sparkAge * 6)), 0.92, (1 - sparkAge) * 0.9);
  }
  return s.finish();
};

// Circular eclipse corona visualizer: dark central disc ringed by a solar corona of radial spectrum spikes & orbital arcs.
const soundEclipse: Builder = (pulse, width, height, theme) => {
  const s = surface(width, height, theme);
  const t = seconds(pulse);
  const r0 = 0.36 * (1 + 0.12 * kick(t));
  // Soft eclipse corona ring and outer halo arcs.
  s.shade((u, v, ink) => {
    const r = Math.hypot(u, v), a = Math.atan2(v, u);
    if (r < r0 * 0.92) return 0;
    const rim = Math.exp(-((r - r0) ** 2) * 420) * (1.3 + 0.5 * kick(t));
    const arc1 = Math.exp(-((r - (r0 + 0.42)) ** 2) * 380) * (Math.sin(a * 2 + t * 1.4) > 0.25 ? 0.65 : 0);
    const arc2 = Math.exp(-((r - (r0 + 0.56)) ** 2) * 380) * (Math.sin(a * 3 - t * 1.1) > 0.35 ? 0.5 : 0);
    ink.tint = tri(a / TAU + t * 0.06);
    return rim + arc1 + arc2;
  });
  // 52 radiating spectrum spikes bursting outward from the eclipse rim.
  const spikes = 52;
  for (let i = 0; i < spikes; i++) {
    const a = i / spikes * TAU + t * 0.16;
    const sym = Math.min(i, spikes - i);
    const reach = r0 + 0.06 + band(sym * 0.85, t) * 0.58;
    const c = Math.cos(a), sn = Math.sin(a);
    s.line(c * r0, sn * r0, c * reach, sn * reach, tri(i / spikes * 2 + t * 0.05), (0.8 + 0.5 * kick(t)) * s.gain);
  }
  // Floating ember motes drifting radially away from the corona.
  for (let m = 0; m < 18; m++) {
    const age = fract(t * 0.28 + hash(m, 17));
    const a = hash(m, 18) * TAU + t * 0.2;
    const r = r0 + 0.08 + age * 0.95;
    s.dot(Math.cos(a) * r, Math.sin(a) * r, hash(m, 19), (1 - age) * 0.9 * s.gain);
  }
  return s.finish();
};

export const playervizReceiverBuilders = {
  'bars-and-waves': barsAndWaves,
  'energy-bliss': energyBliss,
  'blazing-colors': blazingColors,
  'trilogy-orbs': trilogyOrbs,
  'geiss-vortex': geissVortex,
  'avs-superscope': avsSuperscope,
  'scope-peaks': scopePeaks,
  'mirror-bars': mirrorBars,
  'sound-eclipse': soundEclipse,
};

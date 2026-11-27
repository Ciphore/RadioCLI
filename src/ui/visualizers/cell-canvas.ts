import type {ThemeName} from '../../types.js';
import {panelBackground, themeAccent} from '../theme.js';

type Cell = {text: string; color: string; backgroundColor?: string; bold?: boolean};
type Line = {text: string; color: string; segments: Cell[]};
export type ReceiverData = {
  nowMs?: number;
  listeningSeconds?: number;
  streamSeconds?: number;
  stopwatchSeconds?: number;
  title?: string;
  paused?: boolean;
};
export type Builder = (pulse: number, width: number, height: number, theme: ThemeName, data?: ReceiverData) => Line[];
export type Rgb = [number, number, number];

export const TAU = Math.PI * 2;
export const clamp = (n: number, low = 0, high = 1): number => Math.max(low, Math.min(high, n));
export const fract = (n: number): number => n - Math.floor(n);
export const tri = (n: number): number => 1 - Math.abs(2 * fract(n) - 1);
export const hash = (a: number, b = 0): number => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
export const seconds = (pulse: number): number => pulse * 0.08;
export const kick = (t: number): number => (1 - fract(t * 2)) ** 3;

const rgb = (hex: string): Rgb => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)) as Rgb;
const hexOf = (color: number[]): string => '#' + color.map(channel => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number): string => {
  const from = rgb(a), to = rgb(b);
  return hexOf(from.map((channel, index) => channel + (to[index]! - channel) * clamp(t)));
};

/** Keep a scene's own palette, with a grayscale rendering in Mono. */
export const sceneColors = (theme: ThemeName) => (hex: string): string => {
  if (theme !== 'mono') return hex;
  const [r, g, b] = rgb(hex);
  const grey = 0.3 * r + 0.59 * g + 0.11 * b;
  return hexOf([grey, grey, grey]);
};

type Paint = {accent: string; ink(level: number): string; fan(turn: number): string};
const paints = new Map<ThemeName, Paint>();

/** `ink` is a brightness ramp in the accent; `fan` swings the accent's hue for scenes that need several colours. */
function paintFor(theme: ThemeName): Paint {
  const cached = paints.get(theme);
  if (cached) return cached;
  const accent = themeAccent(theme);
  const [r, g, b] = rgb(accent).map(channel => channel / 255) as Rgb;
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  const hue = chroma === 0 ? 0 : max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  const saturation = max === 0 ? 0 : chroma / max;
  const value = clamp(max, 0.8, 1);
  const inks = Array.from({length: 25}, (_, i) => i <= 18 ? mix(panelBackground, accent, 0.14 + 0.86 * i / 18) : mix(accent, '#ffffff', (i - 18) / 6 * 0.7));
  const fans = Array.from({length: 33}, (_, i) => {
    const h = (hue + (i / 32 - 0.5) * 2.6 + 6) % 6;
    return hexOf([5, 3, 1].map(n => {
      const k = (n + h) % 6;
      return (value - value * saturation * clamp(Math.min(k, 4 - k))) * 255;
    }));
  });
  const paint: Paint = {
    accent,
    ink: level => inks[Math.round(clamp(level) * 24)]!,
    fan: turn => fans[Math.round(clamp(turn * 0.5 + 0.5) * 32)]!
  };
  paints.set(theme, paint);
  return paint;
}

/** A plain character grid: every scene below decides for itself what a cell is made of. */
export function grid(width: number, height: number, theme: ThemeName) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const paint = paintFor(theme);
  const cells: Cell[] = Array.from({length: w * h}, () => ({text: ' ', color: paint.accent}));
  const set = (x: number, y: number, text: string, color: string, backgroundColor?: string, bold?: boolean): void => {
    if (x < 0 || x >= w || y < 0 || y >= h || !Number.isInteger(x) || !Number.isInteger(y)) return;
    cells[y * w + x] = {text, color, backgroundColor, bold};
  };
  const write = (x: number, y: number, text: string, color: string, backgroundColor?: string): void => {
    for (let i = 0; i < text.length; i++) if (text[i] !== ' ' || backgroundColor) set(x + i, y, text[i]!, color, backgroundColor);
  };
  const finish = (): Line[] => Array.from({length: h}, (_, y) => {
    const segments: Cell[] = [];
    let text = '';
    for (let x = 0; x < w; x++) {
      const cell = cells[y * w + x]!;
      text += cell.text;
      const last = segments.at(-1);
      if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor && last.bold === cell.bold) last.text += cell.text;
      else segments.push({...cell});
    }
    return {text, color: paint.accent, segments};
  });
  return {w, h, paint, set, write, finish};
}
export type Grid = ReturnType<typeof grid>;

/** Eight dots per cell for thin vector strokes. */
export function braille(g: Grid) {
  const dw = g.w * 2, dh = g.h * 4;
  const bits = new Uint8Array(g.w * g.h);
  const colors: string[] = [];
  const masks = [[1, 8], [2, 16], [4, 32], [64, 128]];
  const dot = (fx: number, fy: number, color: string): void => {
    const x = Math.round(fx), y = Math.round(fy);
    if (x < 0 || x >= dw || y < 0 || y >= dh) return;
    const cell = (y >> 2) * g.w + (x >> 1);
    bits[cell] = bits[cell]! | masks[y & 3]![x & 1]!;
    colors[cell] = color;
  };
  const line = (x0: number, y0: number, x1: number, y1: number, color: string): void => {
    const steps = Math.min(4 * (dw + dh), Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))) || 1;
    for (let i = 0; i <= steps; i++) dot(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, color);
  };
  const flush = (background?: string): void => {
    for (let cell = 0; cell < bits.length; cell++) {
      if (bits[cell]) g.set(cell % g.w, Math.floor(cell / g.w), String.fromCharCode(0x2800 + bits[cell]!), colors[cell]!, background);
    }
  };
  return {dw, dh, dot, line, flush};
}

/** Two square pixels per cell for solid sprites and lettering. */
export function pixels(g: Grid) {
  const pw = g.w, ph = g.h * 2;
  const colors: (string | undefined)[] = new Array(pw * ph);
  const at = (x: number, y: number): string | undefined => x < 0 || x >= pw || y < 0 || y >= ph ? undefined : colors[y * pw + x];
  const px = (x: number, y: number, color: string): void => {
    if (x >= 0 && x < pw && y >= 0 && y < ph && Number.isInteger(x) && Number.isInteger(y)) colors[y * pw + x] = color;
  };
  const flush = (): void => {
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < pw; x++) {
        const top = colors[y * 2 * pw + x], bottom = colors[(y * 2 + 1) * pw + x];
        if (top && top === bottom) g.set(x, y, ' ', top, top);
        else if (top && bottom) g.set(x, y, '▀', top, bottom);
        else if (top) g.set(x, y, '▀', top);
        else if (bottom) g.set(x, y, '▄', bottom);
      }
    }
  };
  return {pw, ph, at, px, flush};
}

// Five rows of five bits per glyph.
const FONT: Record<string, number[]> = {
  A: [14, 17, 31, 17, 17], B: [30, 17, 30, 17, 30], C: [15, 16, 16, 16, 15], D: [30, 17, 17, 17, 30], E: [31, 16, 30, 16, 31],
  F: [31, 16, 30, 16, 16], G: [15, 16, 19, 17, 15], H: [17, 17, 31, 17, 17], I: [31, 4, 4, 4, 31], J: [7, 1, 1, 17, 14],
  K: [17, 18, 28, 18, 17], L: [16, 16, 16, 16, 31], M: [17, 27, 21, 17, 17], N: [17, 25, 21, 19, 17], O: [14, 17, 17, 17, 14],
  P: [30, 17, 30, 16, 16], Q: [14, 17, 21, 18, 13], R: [30, 17, 30, 18, 17], S: [15, 16, 14, 1, 30], T: [31, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 14], V: [17, 17, 17, 10, 4], W: [17, 17, 21, 27, 17], X: [17, 10, 4, 10, 17], Y: [17, 10, 4, 4, 4],
  Z: [31, 2, 4, 8, 31], '*': [4, 21, 14, 21, 4], '!': [4, 4, 4, 0, 4], '.': [0, 0, 0, 0, 4], ',': [0, 0, 0, 4, 8], '-': [0, 0, 31, 0, 0]
};
/** Is the pixel lit in a line of text set on a six-pixel advance? */
export function textPixel(text: string, x: number, y: number): boolean {
  if (x < 0 || y < 0 || y > 4 || x % 6 === 5) return false;
  const rows = FONT[text[Math.floor(x / 6)] ?? ' '];
  return rows ? (rows[y]! >> (4 - x % 6) & 1) === 1 : false;
}

export function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = state + 0x6d2b79f5 >>> 0;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export const smooth = (n: number): number => { const c = clamp(n); return c * c * (3 - 2 * c); };
/** Smooth value noise in [0, 1]. */
export const noise = (x: number, y: number, seed = 0): number => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const at = (dx: number, dy: number): number => hash(ix + dx + seed * 57, iy + dy);
  return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) + (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy;
};
export type Pixels = ReturnType<typeof pixels>;
/** A round-ended stroke in pixel space. */
export const stroke = (p: Pixels, x0: number, y0: number, x1: number, y1: number, radius: number, color: string): void => {
  const dx = x1 - x0, dy = y1 - y0, length = dx * dx + dy * dy || 1;
  for (let y = Math.floor(Math.min(y0, y1) - radius); y <= Math.ceil(Math.max(y0, y1) + radius); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - radius); x <= Math.ceil(Math.max(x0, x1) + radius); x++) {
      const along = clamp(((x - x0) * dx + (y - y0) * dy) / length);
      if (Math.hypot(x - x0 - dx * along, y - y0 - dy * along) <= radius) p.px(x, y, color);
    }
  }
};

export type Run<State> = {epoch: number; step: number; state: State};

/**
 * Real simulations cannot be written as a function of the pulse, so they are
 * replayed instead: each run restarts from a seed every epoch, and a frame is
 * that run advanced to the requested step. Stepping forward is one tick; a
 * jump backwards replays the epoch, which bounds the cost at one epoch.
 */
export function replay<State>(runs: Map<string, Run<State>>, key: string, epoch: number, step: number, start: (epoch: number) => State, tick: (state: State, step: number) => void): State {
  let run = runs.get(key);
  if (!run || run.epoch !== epoch || run.step > step) {
    if (!run && runs.size >= 4) runs.delete(runs.keys().next().value!);
    run = {epoch, step: 0, state: start(epoch)};
    runs.set(key, run);
  }
  while (run.step < step) tick(run.state, run.step++);
  return run.state;
}

/** The synthetic spectrum every meter reads: band level in [0, 1] at a time in seconds. */
export const band = (index: number, t: number): number => clamp(
  0.5 + 0.3 * Math.sin(index * 0.61 + t * 2.3) + 0.24 * Math.sin(index * 0.23 - t * 1.5 + 1.7) + 0.18 * Math.sin(index * 1.37 + t * 3.7)
) ** 1.6 * (0.6 + 0.4 * kick(t));

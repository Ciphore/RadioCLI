import {panelBackground} from '../theme.js';
import {TAU, band, clamp, fract, grid, hash, kick, mix, noise, seconds, tri, type Builder} from './cell-canvas.js';

// In the spirit of the first receivers, at a middle weight: drawn in braille dots, but with strokes two or three dots wide and
// shading done by dot density, so nothing is hair-thin and nothing is blocky.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BITS = [[1, 8], [2, 16], [4, 32], [64, 128]] as const;
type Canvas = {dw: number; dh: number; put: (x: number, y: number, hue: number, level: number) => void; stamp: (x: number, y: number, r: number, hue: number, level: number) => void};
/** A dot canvas. Levels of 1 and above are solid; lower levels are dithered; each cell takes the average hue of its dots. */
const fine = (f: (c: Canvas, t: number) => void): Builder => (pulse, width, height, theme) => {
  const g = grid(width, height, theme), dw = g.w * 2, dh = g.h * 4, cells = g.w * g.h;
  const bits = new Uint8Array(cells), hues = new Float32Array(cells), levels = new Float32Array(cells), counts = new Uint16Array(cells);
  const put = (px: number, py: number, hue: number, level: number): void => {
    const x = Math.round(px), y = Math.round(py);
    if (!(level > 0) || x < 0 || y < 0 || x >= dw || y >= dh || (level < 1 && level * 16 <= BAYER[(y & 3) * 4 + (x & 3)]! + 0.5)) return;
    const cell = (y >> 2) * g.w + (x >> 1);
    bits[cell]! |= BITS[y & 3]![x & 1]!; hues[cell]! += hue; levels[cell]! += Math.min(1.25, level); counts[cell]!++;
  };
  const stamp = (x: number, y: number, r: number, hue: number, level: number): void => { for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (dx * dx + dy * dy <= r * r + 0.3) put(x + dx, y + dy, hue, level); };
  f({dw, dh, put, stamp}, seconds(pulse));
  const tones = new Map<number, string>();
  for (let cell = 0; cell < cells; cell++) {
    if (!bits[cell]) continue;
    const hue = Math.round(clamp(hues[cell]! / counts[cell]! * 0.5 + 0.5) * 24), level = Math.round(clamp(0.42 + 0.58 * levels[cell]! / counts[cell]! / 1.05) * 12), key = hue * 16 + level;
    let tone = tones.get(key);
    if (!tone) { const base = g.paint.fan(hue / 12 - 1), at = level / 12; tones.set(key, tone = at < 0.85 ? mix(panelBackground, base, at / 0.85) : mix(base, '#ffffff', (at - 0.85) / 0.15 * 0.6)); }
    g.set(cell % g.w, Math.floor(cell / g.w), String.fromCharCode(0x2800 + bits[cell]!), tone);
  }
  return g.finish();
};
type Sample = [number, number] | null;
/** Per-dot pictures; u and v are in panel heights from the centre. */
const field = (f: (u: number, v: number, t: number, x: number, y: number, dw: number) => Sample): Builder => fine((c, t) => {
  for (let y = 0; y < c.dh; y++) for (let x = 0; x < c.dw; x++) { const s = f((x + 0.5 - c.dw / 2) / c.dh, (y + 0.5) / c.dh - 0.5, t, x, y, c.dw); if (s) c.put(x, y, s[0], s[1]); }
});
/** Curves drawn with a round nib. */
const trace = (turns: number, nib: (s: number, t: number) => number, xy: (s: number, t: number) => [number, number, number?]): Builder => fine((c, t) => {
  const n = Math.round(c.dh * 26 * Math.sqrt(turns)), r = c.dh * 0.46;
  for (let i = 0; i < n; i++) { const s = i / n * TAU * turns, [x, y, z = 0] = xy(s, t); c.stamp(c.dw / 2 + x * r * 1.7, c.dh / 2 + y * r, nib(s, t) * (1 + z * 0.6) * Math.max(1, c.dh / 56), Math.sin(s * 0.5 + t * 0.2), 0.75 + 0.35 * z); }
});
const polar = (u: number, v: number): [number, number] => [Math.hypot(u, v) + 1e-4, Math.atan2(v, u)];
const fbm = (x: number, y: number, seed: number): number => noise(x, y, seed) * 0.55 + noise(x * 2.1, y * 2.1, seed + 1) * 0.3 + noise(x * 4.3, y * 4.3, seed + 2) * 0.15;

// After Ultracode: rings of dashes leaving the centre, each ring cut into a different number of pieces and turning its own way.
const rippleCode = field((u, v, t) => { const [d, a] = polar(u * 0.8, v), ring = d * 10 - t * 1.1, i = Math.floor(ring), dash = fract(a / TAU * (5 + ((i % 4) + 4) % 4 * 3) + i * 0.37 + t * 0.05 * (i % 2 ? 1 : -1)); return fract(ring) < 0.42 && dash < 0.64 ? [tri(i * 0.13) * 2 - 1, 1] : null; });
// After Pulse Grid: a lattice of discs that swell and shrink as rings of pressure pass through them.
const dotLattice = field((u, v, t) => { const s = 7, iu = Math.floor(u * s), iv = Math.floor(v * s + 0.5), far = Math.hypot(iu + 0.5, iv) / s, r = 0.14 + 0.32 * (0.5 + 0.5 * Math.sin(far * 9 - t * 3)), d = Math.hypot(fract(u * s) - 0.5, fract(v * s + 0.5) - 0.5); return d < r ? [far * 2 - 1, d < r * 0.6 ? 1.1 : 0.8] : null; });
// After Hex Pulse: a honeycomb whose cells fill from the middle outward as the pulse reaches them.
const hivePulse = field((u, v, t) => { const s = 5.5, q = u * s, row = Math.round(v * s / 0.866), col = Math.round(q - (row & 1) * 0.5), cx = col + (row & 1) * 0.5, cy = row * 0.866, dx = Math.abs(q - cx), dy = Math.abs(v * s - cy), edge = Math.max(dx, dx * 0.5 + dy * 0.866), far = Math.hypot(cx, cy), w = 0.5 + 0.5 * Math.sin(far * 1.2 - t * 3); return edge > 0.39 ? [w * 2 - 1, 1] : edge < 0.3 * w ? [far * 0.3 - 0.7, 0.3 + 0.7 * w] : null; });
// After Moiré: two fine gratings laid across each other and slowly turned, so broad bands appear where they agree.
const moireLines = field((u, v, t) => { const g1 = fract(Math.hypot(u - 0.5 * Math.sin(t * 0.3), v) * 9) < 0.5, g2 = fract(Math.hypot(u + 0.5 * Math.cos(t * 0.23), v - 0.1 * Math.sin(t * 0.4)) * 9) < 0.5; return g1 !== g2 ? [Math.sin(u * 2.2 + v * 3 + t * 0.2), 1] : null; });
// After Galaxy: two arms of stars wound round a bright core, seen at a tilt.
const spiralArms = field((u, v, t, x, y) => { const [d, a] = polar(u * 0.62, v * 1.5), arm = Math.cos(a * 2 - Math.log(d + 0.04) * 4.4 + t * 0.3), dens = (0.5 + 0.5 * arm) ** 2.2 * Math.exp(-d * 2.2) * 1.5 + Math.exp(-d * d * 90) * 1.3; return hash(x * 1.7, y * 2.9) > 0.996 ? [0, 1.2] : [d * 3 - 1, clamp(dens) * (0.7 + 0.3 * hash(x, y))]; });
// After Cyclone: rain bands wrapped round a clear eye.
const eyeWall = field((u, v, t) => { const [d, a] = polar(u * 0.72, v), f = fract((a + 1.9 / (d + 0.08) - t * 0.8) / TAU * 3); return d < 0.055 ? null : [Math.sin(d * 5 - t * 0.2), (f < 0.55 ? 0.2 + 0.85 * (1 - f / 0.55) : 0.04) * clamp(1.5 - d * 1.25)]; });
// After Nebula: clouds of gas in soft grain, with a few hard bright stars set in them.
const starNursery = field((u, v, t, x, y) => { const n = fbm(u * 1.7 + t * 0.03 + fbm(u * 2 + 4, v * 2 - t * 0.02, 9) * 0.9, v * 2.3, 1); return hash(x * 3.3, y * 7.1) > 0.9955 ? [0, 1.25] : [fbm(u * 1.2 - t * 0.02, v * 1.5, 5) * 3 - 1.5, clamp((n - 0.36) * 2.4)]; });
// After Lava Lamp: wax drawn as a contour map, the lines crowding together where two blobs are about to join.
const waxFlow = field((u, v, t) => { let f = 0; for (let i = 0; i < 6; i++) { const bx = (hash(i, 1) - 0.5) * 2.8 + 0.25 * Math.sin(t * 0.3 + i), by = 0.4 * Math.sin(t * (0.14 + 0.07 * hash(i, 2)) + i * 2.1), r = 0.15 + 0.09 * hash(i, 3); f += r * r / ((u - bx) ** 2 + (v - by) ** 2 + 1e-3); } return f > 1 ? [v * 2.4, fract(f * 1.6) < 0.34 ? 1 : 0.4] : f > 0.42 && fract(f * 5) < 0.3 ? [v * 2.4 - 0.4, 0.85] : null; });
// After Motion Contour: the spectrum as six outlines standing one behind another, each a moment older than the one in front.
const contourStack = fine((c, t) => { for (let layer = 5; layer >= 0; layer--) for (let x = 0; x < c.dw; x++) { const u = x / (c.dw - 1), level = clamp(0.05 + band(u * 16 + layer * 1.1, t - layer * 0.22) * 1.05) * Math.sin(u * Math.PI) ** 0.5, foot = c.dh - 2 - layer * c.dh * 0.075, top = foot - level * c.dh * (0.8 - layer * 0.07); for (let y = Math.round(top) + 2; y <= foot; y++) c.put(x, y, 0.85 - layer * 0.34, layer ? 0 : 0.16); c.stamp(x, top, layer ? 0.8 : 1.2, 0.85 - layer * 0.34, 1.1 - layer * 0.14); } });
// After Ribbon: two bands twisting past each other, hatched along their length so the twist shows.
const twinRibbons = field((_u, v, t, x, _, dw) => { for (let i = 0; i < 2; i++) { const s = x / dw * TAU, mid = 0.27 * Math.sin(s * (0.9 + i * 0.4) + t * (0.7 + i * 0.25) + i * 2.4), twist = Math.cos(s * 1.6 - t * 1.1 + i * 1.3), half = 0.025 + 0.12 * Math.abs(twist), off = (v - mid) / half; if (Math.abs(off) < 1) return [i * 1.4 - 0.7 + 0.2 * twist, Math.abs(off) > 0.84 ? 1.1 : fract(off * 2.2 + s * 3) < 0.42 ? (twist > 0 ? 1 : 0.55) : twist > 0 ? 0.22 : 0.06]; } return null; });
// After Braille Wave: five strands of one wave, a little out of step, thick enough to cross over each other.
const waveBraid = fine((c, t) => { for (let i = 0; i < 5; i++) for (let x = 0; x < c.dw; x++) { const s = x / c.dw; c.stamp(x, c.dh / 2 + (Math.sin(s * 8 + t * 1.8 + i * 0.7) * 0.6 + Math.sin(s * 19 - t * 2.6 + i * 1.3) * 0.22) * c.dh * 0.36 * Math.sin(s * Math.PI) ** 0.7 * (0.65 + 0.35 * kick(t)), 1.05, i / 2 - 1, 1 - i * 0.08); } });
// After Silk: cloth shown by its threads alone, bunching into dark folds and spreading over the rises.
const silkFold = field((u, v, t) => { const phase = v * 24 + 3.2 * Math.sin(u * 2.4 + t * 0.4) + 2.2 * Math.sin(u * 5.1 - t * 0.6 + v * 3), lit = 0.5 + 0.5 * Math.sin(u * 3 + t * 0.5 + v * 2); return fract(phase) < 0.3 + 0.3 * lit ? [Math.sin(phase * 0.21 + t * 0.1), 0.6 + 0.5 * lit] : null; });
// After Lissajous: the figure as a tube that swells toward the viewer and narrows as it goes behind.
const lissajousTube = trace(1, () => 1.1, (s, t) => [Math.sin(s * 3 + t * 0.4), Math.sin(s * 4 + Math.sin(t * 0.11) * 2), Math.sin(s * 5 + t * 0.7)]);
// After Harmonograph: a pen on two pendulums, the drawing tightening as the swing dies away.
const harmonographInk = trace(7, () => 0.7, (s, t) => { const k = Math.exp(-s * 0.035); return [(Math.sin(s * 2.01 + t * 0.2) * 0.62 + Math.sin(s * 3 + 1) * 0.38) * k, (Math.sin(s * 3.02 + t * 0.13) * 0.62 + Math.sin(s * 2 + t * 0.07) * 0.38) * k]; });
// After Spirograph: a rose of loops from a wheel rolling inside a ring, the wheel slowly changing size.
const spiroRose = trace(7, () => 0.8, (s, t) => { const k = 0.28, l = 0.85 + 0.45 * Math.sin(t * 0.2); return [(1 - k) * Math.cos(s + t * 0.1) + l * k * Math.cos((1 - k) / k * s), (1 - k) * Math.sin(s + t * 0.1) - l * k * Math.sin((1 - k) / k * s)]; });
// After Goniometer: left against right, the trace leaning and fattening as the two channels fall in and out of phase.
const phaseScope = fine((c, t) => { const cx = c.dw / 2, cy = c.dh / 2, r = c.dh * 0.46; for (let k = -r; k <= r; k++) { c.put(cx + k * 1.4, cy + k, 0, 0.22); c.put(cx - k * 1.4, cy + k, 0, 0.22); } for (let i = 0; i < 700; i++) { const when = t - i * 0.0011, l = Math.sin(when * 31) * 0.62 + Math.sin(when * 73 + 1) * 0.3, rr = Math.sin(when * 31 + 0.9 + Math.sin(t * 0.5)) * 0.62 + Math.sin(when * 67) * 0.3, e = 0.55 + 0.45 * kick(t); c.stamp(cx + (l - rr) * r * 2.4 * e, cy - (l + rr) * r * 0.62 * e, i < 120 ? 1.1 : 0.75, i / 350 - 1, 1.1 - i / 900); } });
// After Radial EQ: the bands as spokes of stacked segments round a ring.
const radialSpectrum = field((u, v, t) => { const [d, a] = polar(u * 0.5, v), slot = (a + Math.PI) / TAU * 40, i = Math.floor(slot), level = Math.min(0.37, 0.1 + 0.6 * band(Math.abs(i - 20) * 0.9, t)), core = 0.11; return Math.abs(d - core + 0.025) < 0.011 ? [0.9, 1] : fract(slot) > 0.24 && d > core && d < core + level && fract((d - core) * 34) < 0.68 ? [(d - core) * 5.5 - 0.9, 1] : null; });
// After Spectrogram: time running left, pitch running up, loudness as the density of the grain.
const spectrumFall = field((_, v, t, x, __, dw) => { const e = band((0.5 - v) * 22, t - (1 - x / dw) * 6) ** 0.85; return [e * 2.1 - 1.1, e * 1.15]; });
// After Caustics: the net of light on the floor of a pool, bright cords over a faint shimmer.
const poolLight = field((u, v, t) => { const wx = u * 4.6 + fbm(u * 2 + t * 0.2, v * 2, 1) * 3, wy = v * 4.6 + fbm(u * 2, v * 2 - t * 0.2, 4) * 3, net = (1 - Math.abs(Math.sin(wx))) * (1 - Math.abs(Math.sin(wy))) + (1 - Math.abs(Math.sin(wx + wy + t * 0.6))) * 0.5; return net > 0.5 ? [-0.3 + net * 0.5, net > 0.75 ? 1.15 : 0.8] : [-0.6, net * 0.3]; });
// After LEDs: a board of small round lamps, lit up each column as far as its band reaches.
const ledField = field((_u, v, t, x, _, dw) => { const s = 9, col = Math.floor(x / (dw / Math.floor(dw / 7))), cu = fract(x / (dw / Math.floor(dw / 7))) - 0.5, row = Math.floor((0.5 - v) * s), cv = fract((0.5 - v) * s) - 0.5, level = (0.2 + band(col * 0.55, t) * 1.1) * s, d = Math.hypot(cu * 1.25, cv); return row < level ? (d < 0.36 ? [row / s * 2 - 1, d < 0.2 ? 1.2 : 0.85] : null) : d < 0.24 ? [row / s * 2 - 1, 0.55] : null; });
// Two stones dropped in still water: where their rings cross they cancel into quiet lanes.
const waveInterference = field((u, v, t) => { const d1 = Math.hypot(u - 0.55, v - 0.05 * Math.sin(t * 0.4)), d2 = Math.hypot(u + 0.55, v + 0.05 * Math.sin(t * 0.3)), w = Math.sin(d1 * 34 - t * 3) + Math.sin(d2 * 34 - t * 3); return w > 0.75 ? [(d1 - d2) * 1.6, 0.7 + w * 0.25] : [(d1 - d2) * 1.6, clamp(w + 1) * 0.06]; });
// A model of the planets: dashed orbits seen at a tilt, each world keeping its own year.
const orbitRings = field((u, v, t) => { const e = Math.hypot(u * 0.62, v * 2.1), ring = Math.round(e / 0.1), a = Math.atan2(v * 2.1, u * 0.62); if (e < 0.06) return [0.9, 1.25]; for (let k = 1; k <= 8; k++) { const pa = t * 0.9 / k ** 1.3 + k * 1.9, far = Math.hypot(u - Math.cos(pa) * k * 0.1 / 0.62, (v - Math.sin(pa) * k * 0.1 / 2.1) * 1.4); if (far < 0.03 + (k % 3) * 0.012) return [k / 4 - 1, 1.25]; } return ring >= 1 && ring <= 8 && Math.abs(e - ring * 0.1) < 0.016 && fract(a / TAU * ring * 5 + t * 0.03 * (ring % 2 ? 1 : -1)) < 0.6 ? [ring / 4 - 1, 1] : null; });
// Warp and weft: bands of three threads passing over and under each other, the cloth creeping diagonally.
const weaveLines = field((u, v, t) => { const P = 0.17, su = u / P + t * 0.12, sv = v / P + t * 0.07, hu = fract(su), hv = fract(sv), across = hv > 0.18 && hv < 0.82, down = hu > 0.18 && hu < 0.82, over = (Math.floor(su) + Math.floor(sv)) & 1; if (!across && !down) return null; const useAcross = across && (!down || over === 1), f = useAcross ? hv : hu, thread = fract((f - 0.18) / 0.64 * 3), edge = f < 0.23 || f > 0.77; return thread < 0.62 || edge ? [useAcross ? -0.65 : 0.65, edge ? 0.55 : across && down ? 1.15 : 0.85] : null; });
// A flower that opens to the music: three rings of petals, each petal as long as its band is loud.
const soundBloom = field((u, v, t) => { const [d, a] = polar(u * 0.5, v); for (let layer = 0; layer < 3; layer++) { const petals = 6 + layer * 2, turn = a + t * 0.15 * (layer % 2 ? -1 : 1), k = Math.floor((turn / TAU + 0.5) * petals), lobe = Math.abs(Math.cos(turn * petals / 2)) ** 0.7, r = (0.12 + layer * 0.08) + (0.1 + 0.4 * band(((k % petals) + petals) % petals + layer * 3, t)) * lobe * (1 - layer * 0.18); if (Math.abs(d - r) < 0.02) return [layer - 1, 1.1]; if (d < r && d > r - 0.07 && layer === 0) return [layer - 1, 0.35]; } return d < 0.035 ? [0.9, 1.2] : null; });

export const finespunReceiverBuilders = {
  'ripple-code': rippleCode, 'dot-lattice': dotLattice, 'hive-pulse': hivePulse, 'moire-lines': moireLines, 'spiral-arms': spiralArms, 'eye-wall': eyeWall,
  'star-nursery': starNursery, 'wax-flow': waxFlow, 'contour-stack': contourStack, 'twin-ribbons': twinRibbons, 'wave-braid': waveBraid, 'silk-fold': silkFold,
  'lissajous-tube': lissajousTube, 'harmonograph-ink': harmonographInk, 'spiro-rose': spiroRose, 'phase-scope': phaseScope, 'radial-spectrum': radialSpectrum, 'spectrum-fall': spectrumFall,
  'pool-light': poolLight, 'led-field': ledField, 'wave-interference': waveInterference, 'orbit-rings': orbitRings, 'weave-lines': weaveLines, 'sound-bloom': soundBloom
};

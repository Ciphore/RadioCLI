import {panelBackground} from '../theme.js';
import {TAU, band, braille, clamp, fract, grid, hash, kick, mix, noise, pixels, seconds, tri, type Builder, type Grid} from './cell-canvas.js';
import {lettering} from './festive-receivers.js';

// Full-bleed graphics: every one fills the panel edge to edge and reads from across the room.
/** Colour by hue position (-1..1) and brightness (0..1), built once per frame so per-pixel work is a table lookup. */
const palette = (g: Grid, hues = 25, levels = 13) => {
  const table = Array.from({length: hues}, (_, h) => Array.from({length: levels}, (_, l) => {
    const at = l / (levels - 1), tone = g.paint.fan(h / (hues - 1) * 2 - 1);
    return at < 0.8 ? mix(panelBackground, tone, at / 0.8) : mix(tone, '#ffffff', (at - 0.8) / 0.2 * 0.6);
  }));
  return (hue: number, level: number): string => table[Math.round(clamp(hue * 0.5 + 0.5) * (hues - 1))]![Math.round(clamp(level) * (levels - 1))]!;
};

// The track as a ribbon: a mirrored waveform across the whole panel, bright where it has played and dim where it has yet to.
const soundRibbon: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  const mid = p.ph / 2, head = fract(t / 40) * p.pw;
  for (let x = 0; x < p.pw; x += 1) {
    const u = x / p.pw, bar = x % 3 !== 2;
    // A fixed song shape, with the part under the playhead breathing with the music.
    const shape = (0.25 + 0.75 * noise(u * 26, 3) ** 1.3) * (0.55 + 0.45 * Math.sin(u * Math.PI)) * (Math.abs(x - head) < 6 ? 1 + 0.35 * kick(t) : 1);
    const half = Math.max(1, shape * (mid - 1));
    if (!bar) continue;
    for (let y = Math.round(mid - half); y < mid + half; y++) {
      const played = x < head, edge = Math.abs(y - mid) / half;
      p.px(x, y, ink(u * 2 - 1, played ? 0.95 - edge * 0.35 : 0.3 - edge * 0.1));
    }
  }
  for (let y = 0; y < p.ph; y++) p.px(Math.round(head), y, '#ffffff');
  p.flush();
  return g.finish();
};

// Old-school plasma: four sine fields summed and pushed through the palette, rolling for ever.
const demoPlasma: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const u = x / p.ph, v = y / p.ph;
    const value = Math.sin(u * 3.1 + t * 0.9) + Math.sin(v * 4.3 - t * 0.7) + Math.sin((u + v) * 2.6 + t * 0.5) + Math.sin(Math.hypot(u - 1.6 - Math.sin(t * 0.3), v - 0.5 - 0.4 * Math.cos(t * 0.4)) * 6 - t * 1.6);
    p.px(x, y, ink(Math.sin(value * 1.2 + t * 0.3), 0.42 + 0.4 * Math.sin(value * 2.1)));
  }
  p.flush();
  return g.finish();
};

// Wind made visible: thousands of short streaks following an invisible field that slowly changes its mind.
const flowField: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), b = braille(g), t = seconds(pulse), ink = palette(g);
  const angle = (x: number, y: number): number => (noise(x * 0.018, y * 0.04 + t * 0.03, 4) * 2 + noise(x * 0.05 + t * 0.05, y * 0.1, 7)) * TAU * 0.7;
  const count = Math.round(clamp(b.dw * b.dh / 9, 120, 2200));
  for (let i = 0; i < count; i++) {
    const life = 2.2 + hash(i, 1) * 2, born = Math.floor((t + hash(i, 2) * life) / life), age = (t + hash(i, 2) * life) % life;
    let x = hash(i, born + 3) * b.dw, y = hash(i, born + 4) * b.dh;
    const steps = Math.floor(age * 9), from = Math.max(0, steps - 14);
    for (let s = 0; s < steps; s++) {
      const a = angle(x, y);
      x += Math.cos(a) * 1.4; y += Math.sin(a) * 0.9;
      if (s >= from) b.dot(x, y, ink(Math.cos(a), 0.5 + 0.5 * (s - from) / 14 * Math.sin(age / life * Math.PI)));
    }
  }
  b.flush();
  return g.finish();
};

// Stained glass that will not hold still: every pane belongs to its nearest lamp, and the lamps drift.
const mosaicDrift: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  const seeds = Array.from({length: Math.round(clamp(p.pw * p.ph / 150, 6, 40))}, (_, i) => ({
    x: p.pw * (0.5 + 0.5 * Math.sin(t * (0.1 + 0.1 * hash(i, 1)) + hash(i, 2) * TAU)), y: p.ph * (0.5 + 0.5 * Math.cos(t * (0.13 + 0.1 * hash(i, 3)) + hash(i, 4) * TAU)), hue: hash(i, 5) * 2 - 1, i
  }));
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    let first = Infinity, second = Infinity, owner = seeds[0]!;
    for (const seed of seeds) { const d = Math.hypot((x - seed.x) / 1.3, y - seed.y); if (d < first) { second = first; first = d; owner = seed; } else if (d < second) second = d; }
    // Lead between the panes; each pane brightest at its heart and lit in turn by the beat.
    p.px(x, y, second - first < 1.1 ? '#05070a' : ink(owner.hue, 0.78 - first * 0.035 + (owner.i === Math.floor(t * 2) % seeds.length ? 0.2 * kick(t) : 0)));
  }
  p.flush();
  return g.finish();
};

// Seventies racing stripes: fat bands of colour sweeping diagonally across the panel and bending as they go.
const retroStripes: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const v = y / p.ph, bend = Math.sin(x / p.pw * Math.PI * 1.5 + t * 0.4) * 0.28 + (x / p.pw - 0.5) * 0.5;
    const stripe = (v - 0.5 - bend) * 7 + 3.5, index = Math.floor(stripe), inside = stripe - index;
    const on = index >= 0 && index < 7 && inside > 0.1;
    p.px(x, y, on ? ink(index / 3 - 1, 0.78 + 0.12 * Math.sin(x * 0.2 - t * 6 + index)) : ink(-0.6, 0.1));
  }
  p.flush();
  return g.finish();
};

const ARCS = ['╭╯', '╰╮'];
// A floor of arc tiles: each one is turned one of two ways, and waves of turning roll through, rewriting the maze as they pass.
const arcTiles: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), t = seconds(pulse), ink = palette(g);
  for (let y = 0; y < g.h; y++) for (let x = 0; x + 1 < g.w + 1; x += 2) {
    const col = x / 2, front = (col * 0.7 + y * 1.3 - t * 6) / 28, flips = Math.floor(front + hash(col, y) * 0.35), fresh = fract(front + hash(col, y) * 0.35);
    const way = (Math.floor(hash(col * 31 + y, 7) * 2) + flips) & 1;
    const lit = fresh > 0.9 ? 1 : 0.45 + 0.2 * Math.sin(col * 0.3 + y * 0.5 + t);
    g.set(x, y, ARCS[way]![0]!, ink(tri(flips * 0.19 + col * 0.01) * 2 - 1, lit), undefined, fresh > 0.9);
    if (x + 1 < g.w) g.set(x + 1, y, ARCS[way]![1]!, ink(tri(flips * 0.19 + col * 0.01) * 2 - 1, lit), undefined, fresh > 0.9);
  }
  return g.finish();
};

const SHADES = ' .·:;+=xX#%@';
// A sea made of type: the weight of each character is the height of the water there, and the swell runs through it.
const glyphTide: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), t = seconds(pulse), ink = palette(g);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const u = x / g.h / 2, v = y / g.h;
    const swell = 0.5 + 0.28 * Math.sin(u * 2.4 + v * 3 - t * 1.1) + 0.2 * Math.sin(u * 5.1 - v * 4 + t * 0.7) + 0.16 * Math.sin((u - v) * 9 + t * 1.9) * (0.5 + 0.5 * kick(t));
    const level = clamp(swell);
    g.set(x, y, SHADES[Math.round(level * (SHADES.length - 1))]!, ink(v * 1.6 - 0.8 + level * 0.4, 0.3 + 0.7 * level), undefined, level > 0.75);
  }
  return g.finish();
};

// Glitch art: a calm gradient whose columns keep getting sorted by brightness between two shifting thresholds.
const pixelSort: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  const column = new Float32Array(p.ph);
  for (let x = 0; x < p.pw; x++) {
    for (let y = 0; y < p.ph; y++) column[y] = clamp(0.5 + 0.35 * Math.sin(y * 0.33 + x * 0.05 + t * 0.6) + 0.3 * (noise(x * 0.06 - t * 0.2, y * 0.18, 2) - 0.5) + 0.2 * Math.sin(x * 0.11 - t));
    // The sorted span starts and stops where the picture crosses a threshold, so it tears along the picture's own edges.
    const low = 0.3 + 0.2 * Math.sin(t * 0.5 + x * 0.02), reach = 0.35 + 0.6 * noise(x * 0.09, t * 0.35, 9);
    let y = 0;
    while (y < p.ph) {
      if (column[y]! < low) { y++; continue; }
      let end = y;
      while (end < p.ph && column[end]! >= low && end - y < p.ph * reach) end++;
      column.subarray(y, end).sort();
      y = end + 1;
    }
    for (let row = 0; row < p.ph; row++) p.px(x, row, ink(x / p.pw * 1.6 - 0.8 + column[row]! * 0.5, column[row]!));
  }
  p.flush();
  return g.finish();
};

// A newspaper picture of something moving: the whole panel is dots, and only their sizes change.
const halftoneWave: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), t = seconds(pulse), ink = palette(g);
  for (let y = 0; y < g.h; y++) for (let x = y % 2; x < g.w; x += 2) {
    const u = (x - g.w / 2) / g.h / 2, v = (y - g.h / 2) / g.h;
    const a = Math.hypot(u - 0.9 * Math.sin(t * 0.5), v - 0.3 * Math.cos(t * 0.7)), b2 = Math.hypot(u + 0.9 * Math.cos(t * 0.4), v + 0.3 * Math.sin(t * 0.6));
    const level = clamp(0.5 + 0.5 * Math.sin(a * 9 - t * 3) * Math.exp(-a * 0.9) + 0.5 * Math.sin(b2 * 9 - t * 3.4) * Math.exp(-b2 * 0.9));
    g.set(x, y, level > 0.78 ? '⬤' : level > 0.58 ? '●' : level > 0.38 ? '•' : level > 0.2 ? '∙' : '·', ink(u * 0.8 + level * 0.6 - 0.4, 0.3 + 0.7 * level), undefined, level > 0.58);
  }
  return g.finish();
};

// Marbled paper: inks floated on water and combed, the veins folding back on themselves as the tray is tilted.
const marbling: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const u = x / p.ph * 0.9, v = y / p.ph * 0.9;
    const wx = u + 0.5 * noise(u * 1.4 + t * 0.05, v * 1.4, 1) + 0.25 * Math.sin(v * 5 + t * 0.2), wy = v + 0.5 * noise(u * 1.4, v * 1.4 - t * 0.05, 2) + 0.2 * Math.sin(u * 4 - t * 0.15);
    const vein = noise(wx * 2.2, wy * 2.2, 3) * 9 + wx * 1.5, band2 = Math.floor(vein), edge = Math.abs(vein - band2 - 0.5) * 2;
    p.px(x, y, edge > 0.86 ? ink(0, 1) : ink(tri(band2 * 0.29) * 2 - 1, 0.35 + 0.45 * hash(band2, 4) + 0.1 * edge));
  }
  p.flush();
  return g.finish();
};

// A circuit board from above: copper traces laid on a grid, with pulses of current running the routes.
const circuitTraces: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), t = seconds(pulse), ink = palette(g);
  const board = mix(panelBackground, g.paint.fan(-0.5), 0.14);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.set(x, y, ' ', board, board);
  const routes = Math.max(3, Math.round(g.w * g.h / 45));
  for (let route = 0; route < routes; route++) {
    // Each route runs along a row, steps to another row, runs on, and ends at a pad.
    const y0 = Math.floor(hash(route, 1) * g.h), y1 = Math.floor(hash(route, 2) * g.h), x0 = Math.floor(hash(route, 3) * g.w * 0.3), turn = x0 + 3 + Math.floor(hash(route, 4) * g.w * 0.4), x1 = Math.min(g.w - 1, turn + 3 + Math.floor(hash(route, 5) * g.w * 0.4));
    const cells: [number, number, string][] = [];
    for (let x = x0; x < turn; x++) cells.push([x, y0, '─']);
    cells.push([turn, y0, y1 > y0 ? '╮' : y1 < y0 ? '╯' : '─']);
    for (let y = y0 + Math.sign(y1 - y0); y !== y1 && y1 !== y0; y += Math.sign(y1 - y0)) cells.push([turn, y, '│']);
    if (y1 !== y0) cells.push([turn, y1, y1 > y0 ? '╰' : '╭']);
    for (let x = turn + 1; x < x1; x++) cells.push([x, y1, '─']);
    const head = (t * (9 + 8 * hash(route, 6)) + hash(route, 7) * 80) % (cells.length + 30), hue = hash(route, 8) * 2 - 1;
    cells.forEach(([x, y, glyph], i) => { const behind = head - i; g.set(x, y, glyph, ink(hue, behind >= 0 && behind < 7 ? 1 - behind * 0.06 : 0.55), board, behind >= 0 && behind < 2); });
    g.set(x0, y0, '◉', ink(hue, 0.7), board); g.set(x1, y1, head > cells.length && head < cells.length + 6 ? '◉' : '○', ink(hue, head > cells.length && head < cells.length + 6 ? 1 : 0.6), board, true);
  }
  return g.finish();
};

// A sunburst: alternating rays turning slowly behind a sun that swells on the beat.
const sunburst: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  const cx = p.pw / 2, cy = p.ph * 1.02, sun = p.ph * (0.34 + 0.05 * kick(t));
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const dx = (x + 0.5 - cx) / 1.25, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d < sun) { p.px(x, y, ink(0.9, 0.82 + 0.18 * (1 - d / sun))); continue; }
    const ray = Math.floor((a + t * 0.12) / (Math.PI / 14)), far = clamp((d - sun) / (p.pw * 0.5));
    p.px(x, y, ink(ray % 2 ? 0.75 - far * 0.9 : -0.2 - far * 0.6, ray % 2 ? 0.72 - far * 0.3 : 0.34 - far * 0.14));
  }
  p.flush();
  return g.finish();
};

// Contour lines over shifting ground: every elevation gets its own tint, and the hills slide by underneath.
const topoMap: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const high = (noise(x * 0.035 + t * 0.12, y * 0.07, 1) * 0.65 + noise(x * 0.09 + t * 0.12, y * 0.18 + t * 0.03, 2) * 0.35) * 9, level = Math.floor(high), into = high - level;
    p.px(x, y, into < 0.12 ? ink(level / 4 - 1, level % 3 === 0 ? 1 : 0.7) : ink(level / 4 - 1, 0.1 + level * 0.035));
  }
  p.flush();
  return g.finish();
};

// Op art: stripes that swell and pinch as a wave passes through them, until the flat panel seems to bulge.
const rileyWaves: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const v = y / p.ph, shift = Math.sin(v * TAU * 1.2 + t * 0.9) * 2.6 + Math.sin(v * TAU * 0.5 - t * 0.5 + x * 0.02) * 3.4;
    const stripe = fract((x + shift * (1 + 0.6 * Math.sin(x * 0.05 + t * 0.3))) / 5);
    p.px(x, y, stripe < 0.5 ? ink(Math.sin(x * 0.02 + t * 0.2), 0.9) : '#06080b');
  }
  p.flush();
  return g.finish();
};

// Nothing but colour: big soft fields drifting through each other, slow enough to forget it is moving.
const aura: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g, 49, 17);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const u = x / p.pw, v = y / p.ph;
    const hue = Math.sin(u * 2.2 + t * 0.11) * 0.5 + Math.sin(v * 2.6 - t * 0.09 + u * 1.3) * 0.35 + Math.sin((u - v) * 1.7 + t * 0.07) * 0.3;
    const glow = 0.56 + 0.22 * Math.sin(u * 3.1 - t * 0.13 + v * 2) + 0.14 * Math.sin(v * 4.2 + t * 0.1);
    p.px(x, y, ink(hue, glow + (hash(x, y) - 0.5) * 0.03));
  }
  p.flush();
  return g.finish();
};

const WORDS = ['LOUDER', 'RADIO', 'ON AIR', 'TUNE IN', 'ALL NIGHT'];
// Kinetic type: rows of huge lettering sliding past each other in opposite directions, filled and outlined by turns.
const kineticType: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  const rows = Math.max(1, Math.round(p.ph / 14)), rowH = p.ph / rows, scale = Math.max(1, Math.floor((rowH - 1) / 5));
  for (let row = 0; row < rows; row++) {
    const word = WORDS[(row + Math.floor(t / 8)) % WORDS.length]! + '  ', long = word.length * 6, way = row % 2 ? -1 : 1, top = Math.round(row * rowH + (rowH - 5 * scale) / 2);
    const solid = (row + Math.floor(t * 2)) % 2 === 0;
    for (let y = -1; y < 5 * scale + 1; y++) for (let x = 0; x < p.pw; x++) {
      const at = (dx: number, dy: number): boolean => { const fx = Math.floor((x + dx + way * t * 22 * scale) / scale), fy = Math.floor((y + dy) / scale); return y + dy >= 0 && lettering(word, ((fx % long) + long) % long, fy); };
      const here = at(0, 0), rim = !here && (at(1, 0) || at(-1, 0) || at(0, 1) || at(0, -1));
      if (here && solid) p.px(x, top + y, ink(row / Math.max(1, rows - 1) * 1.6 - 0.8, 0.92));
      else if (rim && !solid) p.px(x, top + y, ink(row / Math.max(1, rows - 1) * 1.6 - 0.8, 0.8));
    }
  }
  p.flush();
  return g.finish();
};

// The hypnotist's wheel: two arms of a spiral turning inward, pulling the eye to the middle.
const hypnoSpiral: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  const cx = p.pw / 2, cy = p.ph / 2;
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const dx = (x + 0.5 - cx) / 1.3, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const arm = Math.sin(a * 2 + Math.log(d + 1) * 5.5 - t * 2.4);
    p.px(x, y, arm > 0 ? ink(Math.sin(d * 0.06 - t * 0.3), 0.55 + 0.4 * arm) : '#05070a');
  }
  p.flush();
  return g.finish();
};

const ruleRows = new Map<string, Uint8Array[]>();
// One-dimensional life: a row of cells and a rule for the next row, printed line after line into lace.
const rule110: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), ink = palette(g);
  const rules = [110, 30, 90, 150, 73], which = Math.floor(pulse / 260) % rules.length, rule = rules[which]!, step = Math.floor(pulse) % 260, key = `${p.pw}/${rule}`;
  let rows = ruleRows.get(key);
  if (!rows) {
    // The whole run is small; work it out once per width and rule.
    rows = [Uint8Array.from({length: p.pw}, (_, x) => rule === 90 || rule === 150 ? (x === Math.floor(p.pw / 2) ? 1 : 0) : hash(x, rule) > 0.5 ? 1 : 0)];
    for (let n = 1; n < 260 + 80; n++) { const last = rows[n - 1]!; rows.push(Uint8Array.from({length: p.pw}, (_, x) => (rule >> ((last[(x + p.pw - 1) % p.pw]! << 2) | (last[x]! << 1) | last[(x + 1) % p.pw]!)) & 1)); }
    if (ruleRows.size >= 6) ruleRows.delete(ruleRows.keys().next().value!);
    ruleRows.set(key, rows);
  }
  for (let y = 0; y < p.ph; y++) {
    const n = step + y - p.ph + 40;
    if (n < 0) continue;
    const row = rows[Math.min(rows.length - 1, n)]!;
    for (let x = 0; x < p.pw; x++) if (row[x]) p.px(x, y, ink(tri(n * 0.01 + x / p.pw * 0.5) * 2 - 1, y === p.ph - 1 ? 1 : 0.8));
  }
  p.flush();
  if (g.w > 20) g.write(g.w - 9, 0, ` RULE ${rule} `.padEnd(9), panelBackground, g.paint.accent);
  return g.finish();
};

/** Flat layered silhouettes, far to near; each layer scrolls faster than the one behind. */
const layers = (g: Grid, t: number, count: number, crest: (x: number, layer: number, time: number) => number, tone: (layer: number, depth: number) => string, sky: (y: number) => string): ReturnType<Grid['finish']> => {
  const p = pixels(g);
  for (let y = 0; y < p.ph; y++) { const s = sky(y / p.ph); for (let x = 0; x < p.pw; x++) p.px(x, y, s); }
  for (let layer = 0; layer < count; layer++) for (let x = 0; x < p.pw; x++) {
    const top = Math.round(p.ph * crest(x, layer, t));
    for (let y = Math.max(0, top); y < p.ph; y++) p.px(x, y, tone(layer, (y - top) / p.ph));
  }
  p.flush();
  return g.finish();
};

// Dunes at dusk in flat colour: ridge behind ridge, each with a lit face and a shadowed one, sliding past at its own speed.
const duneSea: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), ink = palette(g);
  return layers(g, seconds(pulse), 5,
    (x, layer, t) => 0.34 + layer * 0.15 - 0.24 * Math.abs(Math.sin(x * (0.035 + layer * 0.006) + layer * 2.1 + t * (0.05 + layer * 0.06))) ** 0.6,
    (layer, depth) => ink(0.9 - layer * 0.28, 0.9 - layer * 0.1 - depth * 2.2),
    v => ink(-0.9 + v * 1.9, 0.3 + v * 0.55));
};

// A sea in flat bands: swells rolling through at different depths, foam on every crest.
const swell: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), ink = palette(g);
  return layers(g, seconds(pulse), 6,
    (x, layer, t) => 0.2 + layer * 0.14 + 0.05 * Math.sin(x * (0.05 - layer * 0.004) + t * (0.8 + layer * 0.35) * (layer % 2 ? 1 : -1) + layer * 1.7) + 0.02 * Math.sin(x * 0.17 - t * 2 + layer),
    (layer, depth) => depth < 0.035 ? ink(-0.5, 1) : ink(-0.2 - layer * 0.14, 0.72 - layer * 0.09 - depth * 0.5),
    v => ink(0.7 - v * 0.9, 0.62 + v * 0.25));
};

// Drops of ink let into clear water: each one blooms, feathers at its edge, and thins away as the next arrives.
const inkBloom: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  const drops = Array.from({length: 7}, (_, k) => { const born = Math.floor(t / 2.2) - k; return {x: hash(born, 1) * p.pw, y: (0.15 + 0.7 * hash(born, 2)) * p.ph, age: t - born * 2.2, hue: hash(born, 3) * 2 - 1, born}; });
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    let dense = 0, hue = 0;
    for (const drop of drops) {
      const dx = (x - drop.x) / 1.4, dy = y - drop.y - drop.age * 0.6, a = Math.atan2(dy, dx);
      // The edge of the bloom is ragged, and gets more so as it spreads.
      const reach = p.ph * 0.5 * (1 - Math.exp(-drop.age * 0.5)) * (0.75 + 0.35 * noise(a * 2.2 + drop.born, drop.age * 0.3, 5)), d = Math.hypot(dx, dy) / (reach + 0.1);
      if (d >= 1) continue;
      const amount = (1 - d) ** 0.6 * Math.max(0, 1 - drop.age / 14) * (0.6 + 0.4 * noise(x * 0.25, y * 0.4 - drop.age, drop.born));
      if (amount > dense) { dense = amount; hue = drop.hue; }
    }
    p.px(x, y, dense > 0.03 ? ink(hue, 0.12 + dense * 0.85) : ink(-0.4, 0.05));
  }
  p.flush();
  return g.finish();
};

// The spectrum as a sunrise: bars fanned in a half-circle on the horizon, pushing rays up the sky as the music climbs.
const sunriseEq: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse), ink = palette(g);
  const cx = p.pw / 2, cy = p.ph - 1, core = p.ph * 0.22, reach = Math.min(p.ph * 0.98, p.pw * 0.42) - core, bars = 40;
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const dx = (x + 0.5 - cx) / 1.35, dy = cy - y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d < core) { p.px(x, y, ink(0.9, 0.9)); continue; }
    const slot = a / Math.PI * bars, index = Math.floor(slot), level = 0.2 + band(Math.abs(index - bars / 2) * 0.9, t) * 1.5, far = (d - core) / reach;
    if (fract(slot) > 0.18 && far < level) p.px(x, y, ink(0.9 - far * 1.8, 0.95 - far * 0.25));
    else p.px(x, y, ink(-0.7, 0.07 + 0.06 * (1 - y / p.ph)));
  }
  p.flush();
  return g.finish();
};

// The test card: colour bars, a grey staircase, a sweep and a circle, with one line of text that proves the station is alive.
const testCard: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), p = pixels(g), t = seconds(pulse);
  const mono = theme === 'mono', bars = mono ? ['#e0e0e0', '#c4c4c4', '#a8a8a8', '#8c8c8c', '#707070', '#545454', '#383838'] : ['#e8e8e8', '#e8e800', '#00e8e8', '#00e800', '#e800e8', '#e80000', '#0000e8'];
  const split = Math.round(p.ph * 0.62), lower = Math.round(p.ph * 0.8), cx = p.pw / 2, cy = p.ph / 2, r = p.ph * 0.44;
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const u = x / p.pw;
    let tone = y < split ? bars[Math.min(6, Math.floor(u * 7))]! : y < lower ? mix('#000000', '#ffffff', Math.floor(u * 10) / 9) : Math.sin(u * u * 260 + t * 2) > 0 ? '#f0f0f0' : '#101010';
    const d = Math.hypot((x + 0.5 - cx) / 1.25, y + 0.5 - cy);
    if (Math.abs(d - r) < 0.8) tone = '#ffffff';
    else if (d < r && Math.abs(y - cy) < 1 ) tone = '#101010';
    // The sweep hand shows the picture is live.
    if (d < r && Math.abs(Math.atan2(y + 0.5 - cy, (x + 0.5 - cx) / 1.25) - ((t * 1.2) % TAU - Math.PI)) < 0.05) tone = '#ffffff';
    p.px(x, y, tone);
  }
  p.flush();
  const label = ' RADIOCLI  TEST TRANSMISSION ', clock = ` ${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')} `;
  if (g.w > label.length + 4) g.write(Math.floor((g.w - label.length) / 2), Math.floor(g.h / 2), label, '#ffffff', '#101010');
  if (g.w > 20 && g.h > 4) g.write(Math.floor((g.w - clock.length) / 2), Math.floor(g.h / 2) + 1, clock, '#101010', '#ffffff');
  return g.finish();
};

// A wall of light tiles running through its programmes: sweeps, checkerboards, ripples from the middle, and rain.
const lightWall: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme), t = seconds(pulse), ink = palette(g);
  const tileW = g.w >= 60 ? 6 : 4, tileH = g.h >= 10 ? 2 : 1, columns = Math.ceil(g.w / tileW), rows = Math.ceil(g.h / tileH), programme = Math.floor(t / 6) % 4, beat = Math.floor(t * 4);
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const far = Math.hypot(col - columns / 2, (row - rows / 2) * 2);
    const level = programme === 0 ? clamp(1 - Math.abs(((col + row) - t * 9) % (columns + rows) + (columns + rows)) % (columns + rows) / 5)
      : programme === 1 ? ((col + row + beat) % 2 ? 0.95 : 0.12)
        : programme === 2 ? clamp(0.5 + 0.5 * Math.sin(far * 0.9 - t * 5))
          : hash(col * 17 + row, beat) > 0.7 ? 1 : 0.1;
    const tone = ink(tri(col / columns + row * 0.13 + t * 0.05) * 2 - 1, 0.1 + 0.85 * level), dark = mix(tone, '#000000', 0.35);
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW - 1; x++) g.set(col * tileW + x, row * tileH + y, y === tileH - 1 && tileH > 1 ? '▁' : ' ', dark, tone);
  }
  return g.finish();
};

export const boldReceiverBuilders = {
  'sound-ribbon': soundRibbon, 'demo-plasma': demoPlasma, 'flow-field': flowField, 'mosaic-drift': mosaicDrift,
  'retro-stripes': retroStripes, 'arc-tiles': arcTiles, 'glyph-tide': glyphTide, 'pixel-sort': pixelSort,
  'halftone-wave': halftoneWave, marbling, 'circuit-traces': circuitTraces, sunburst,
  'topo-map': topoMap, 'riley-waves': rileyWaves, aura, 'kinetic-type': kineticType,
  'hypno-spiral': hypnoSpiral, 'rule-110': rule110, 'dune-sea': duneSea, swell,
  'ink-bloom': inkBloom, 'sunrise-eq': sunriseEq, 'test-card': testCard, 'light-wall': lightWall
};

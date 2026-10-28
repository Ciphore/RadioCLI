import type {ThemeName} from '../../types.js';
import {encodeTerminalCell} from './terminal-cell.js';

type Segment = {text: string; color: string; backgroundColor: string};
type Row = {text: string; color: string; segments: Segment[]};
type Cell = ReturnType<typeof encodeTerminalCell>;
type CellRun = {text: string; fg: number; bg: number};
type OceanScene = {
  skyline: CellRun[][];
  moonColumn: number;
  moonRow: number;
  moonX: number;
  sky: Float32Array;
  depths: Float32Array;
  firstWater: number;
};

// Original artwork inspired by the quiet horizon and moon path at boat.dev.
const palette = [
  '#05091b', '#080e26', '#0b1432', '#101c40', '#14254e', '#192e60',
  '#1f3973', '#284784', '#335694', '#4165a4', '#5376b4', '#688ac2',
  '#809fd0', '#9ab4dd', '#b8cbe9', '#d6e2f3', '#ecf2fb', '#fcfdff'
];
const mono = palette.map(color => {
  const value = Number.parseInt(color.slice(1), 16);
  const channel = Math.round(((value >> 16) * 0.2126 + ((value >> 8) & 255) * 0.7152 + (value & 255) * 0.0722));
  return `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
});
const scenes = new Map<string, OceanScene>();
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {const t = clamp(value); return t * t * (3 - 2 * t);};

function hash(x: number, y: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, row: number): number {
  const left = Math.floor(x), blend = smooth(x - left);
  return hash(left, row) * (1 - blend) + hash(left + 1, row) * blend;
}

function sceneFor(width: number, height: number): OceanScene {
  const key = `${width}:${height}`;
  const cached = scenes.get(key);
  if (cached) return cached;
  // 2×4 square subpixels match a terminal's 1:2 cell aspect. The previous 2×2
  // grid made the tiny moon rectangular and merged thin crests into blocks.
  const columns = width * 2, rows = height * 4;
  const horizon = rows * (height <= 6 ? 0.43 : 0.46);
  const moonColumn = Math.round(width * 0.78);
  const moonRow = Math.floor(horizon / 4 * 0.40);
  const moonX = (moonColumn + (height <= 8 ? 0.5 : 0)) * 2;
  const moonY = height <= 8 ? moonRow * 4 + 2 : horizon * 0.40;
  const radius = Math.max(height <= 3 ? 1.6 : 2, Math.min(6, height * 0.24));
  const sky = new Float32Array(columns * rows).fill(-1);
  const depths = Float32Array.from({length: rows}, (_, y) => (y + 0.5 - horizon) / Math.max(1, rows - horizon));
  const firstWater = depths.findIndex(depth => depth >= 0);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const index = y * columns + x;
    const u = (x + 0.5) / columns;
    if (y < firstWater) {
      const dx = x + 0.5 - moonX, dy = y + 0.5 - moonY;
      const distance = Math.hypot(dx, dy);
      const halo = Math.exp(-(distance * distance) / (radius * radius * 5));
      const altitude = (y + 0.5) / horizon;
      let shade = 1.1 + altitude * 2.6 + halo * 3.6;
      const cloud = Math.sin(u * 15 + altitude * 4) * Math.sin(altitude * 11 - u * 4);
      shade += Math.max(0, cloud) * smooth((altitude - 0.3) / 0.5) * 0.55;
      const limb = smooth((radius + 0.4 - distance) / 0.8);
      if (limb > 0 && height > 8) {
        const crater = Math.exp(-(((dx + radius * 0.25) ** 2 + (dy - radius * 0.15) ** 2) / (radius * radius * 0.16)));
        shade = shade * (1 - limb) + (17 - crater * 1.3) * limb;
      } else if (height >= 7 && y < horizon * 0.65 && distance > radius * 3 && hash(x, y + 17) > 0.997) {
        shade += 2.4;
      }
      sky[index] = shade;
      continue;
    }
  }
  const samples = new Float32Array(8);
  // Only the sky is static. Cache complete sky rows, and sample the boundary
  // again with the water so every ripple across the sea can travel sideways.
  const skyline = Array.from({length: Math.floor(firstWater / 4)}, (_, y) => {
    const runs: CellRun[] = [];
    for (let x = 0; x < width; x++) {
      for (let q = 0; q < 8; q++) samples[q] = sky[(y * 4 + (q >> 1)) * columns + x * 2 + (q & 1)]!;
      const moon = height <= 8 && width >= 8 && y === moonRow && x === moonColumn;
      const cell = moon ? {glyph: '●', fg: 17, bg: 4} : encodeTerminalCell(samples, x, y, 17);
      const previous = runs.at(-1);
      if (previous?.fg === cell.fg && previous.bg === cell.bg) previous.text += cell.glyph;
      else runs.push({text: cell.glyph, fg: cell.fg, bg: cell.bg});
    }
    return runs;
  });
  const scene = {sky, skyline, depths, firstWater, moonColumn, moonRow, moonX};
  if (scenes.size >= 4) scenes.delete(scenes.keys().next().value!);
  scenes.set(key, scene);
  return scene;
}

const quadrants = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';

// Broad quadrant marks retain the previous receiver's soft, horizontal water.
// Average the fine samples instead of fitting sharp diagonal shapes to glints.
function waterCell(samples: Float32Array, ambient?: number): Cell {
  const values = [(samples[0]! + samples[2]!) / 2, (samples[1]! + samples[3]!) / 2,
    (samples[4]! + samples[6]!) / 2, (samples[5]! + samples[7]!) / 2];
  const mean = values.reduce((sum, value) => sum + value, 0) / 4;
  const threshold = ambient === undefined ? mean : ambient + 0.2;
  let mask = 0, high = 0, low = 0, count = 0;
  for (let q = 0; q < 4; q++) {
    if (values[q]! > threshold) {mask |= 1 << q; high += values[q]!; count++;}
    else low += values[q]!;
  }
  const base = Math.max(1, Math.floor((ambient ?? mean) - 0.35));
  const fg = ambient === undefined ? Math.min(17, Math.round(count ? high / count : mean)) : base + 2;
  const bg = ambient === undefined ? Math.min(17, Math.round(count < 4 ? low / (4 - count) : mean)) : base;
  return {glyph: fg === bg ? ' ' : quadrants[mask]!, fg, bg};
}

/** A steady moon above travelling water and a broad, ripple-broken reflection. */
export function buildSumiOcean(pulse: number, width: number, height: number, theme: ThemeName): Row[] {
  const scene = sceneFor(width, height);
  const columns = width * 2, rows = height * 4;
  const time = pulse * 0.08;
  const colors = theme === 'mono' ? mono : palette;
  const field = new Float32Array(scene.sky.length);
  const ambient = new Float32Array(rows);
  for (let y = scene.firstWater; y < rows; y++) {
    const depth = scene.depths[y]!;
    // Preserve the old perspective at normal sizes, with fewer distinct wave
    // bands when the viewport is short so the surface cannot alias away.
    const band = Math.floor(depth * Math.min(30, Math.max(6, height * 2)));
    const phase = time * 0.48 + depth * 31;
    const wander = Math.sin(phase * 0.63) * (0.003 + depth * 0.008) * columns;
    const pathWidth = Math.max(1.1, columns * 0.008) + depth * columns * 0.055;
    const base = 5.7 - depth * 2.6 + Math.sin(depth * 24 - time * 0.42) * 0.4;
    ambient[y] = base;
    const catchLight = smooth((noise(time * 0.5 + band * 0.37, band + 51) - 0.3) / 0.48);
    const scale = 68 - depth * 45;
    const drift = time * (0.18 + depth * 0.25);
    for (let x = 0; x < columns; x++) {
      const ripple = noise((x + 0.5) / columns * scale + drift, band + 23);
      let value = base + (ripple - 0.5) * (1 + depth * 1.5);
      const offset = (x + 0.5 - scene.moonX - wander) / pathWidth;
      if (Math.abs(offset) < 3.2) {
        const path = Math.exp(-offset * offset);
        const fragment = smooth((ripple - 0.33) / 0.42);
        value += path * (2.7 + catchLight * fragment * (7.5 - depth * 1.7));
      }
      value += smooth((ripple - 0.72) / 0.2) * (0.8 + depth * 1.6);
      field[y * columns + x] = Math.min(17, value);
    }
  }
  const result: Row[] = [];
  const samples = new Float32Array(8);
  for (let y = 0; y < height; y++) {
    let text = '';
    const segments: Segment[] = [];
    const append = (value: string, fg: number, bg: number) => {
      const color = colors[fg]!, backgroundColor = colors[bg]!;
      text += value;
      const previous = segments.at(-1);
      if (previous?.color === color && previous.backgroundColor === backgroundColor) previous.text += value;
      else segments.push({text: value, color, backgroundColor});
    };
    const skyline = scene.skyline[y];
    if (skyline) {
      for (const run of skyline) append(run.text, run.fg, run.bg);
    } else for (let x = 0; x < width; x++) {
      for (let q = 0; q < 8; q++) {
        const sy = y * 4 + (q >> 1), index = sy * columns + x * 2 + (q & 1);
        samples[q] = sy < scene.firstWater ? scene.sky[index]! : field[index]!;
      }
      const depth = (scene.depths[y * 4]! + scene.depths[y * 4 + 3]!) / 2;
      const farFromReflection = Math.abs((x + 0.5) * 2 - scene.moonX) / columns > 0.018 + depth * 0.13;
      const base = y * 4 >= scene.firstWater && farFromReflection ? (ambient[y * 4]! + ambient[y * 4 + 3]!) / 2 : undefined;
      let cell = waterCell(samples, base);
      if (height <= 8 && width >= 8 && y === scene.moonRow && x === scene.moonColumn) cell = {glyph: '●', fg: 17, bg: 4};
      append(cell.glyph, cell.fg, cell.bg);
    }
    result.push({text, color: colors[7]!, segments});
  }
  return result;
}

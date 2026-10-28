import {encodeTerminalCell} from './terminal-cell.js';
import type {ThemeName} from '../../types.js';
import * as kernel from './boat-lake-kernel.js';

type Layout = {W: number; H: number; hz: number; full: boolean; copyW: number; fade: number};
type Lighting = ReturnType<typeof kernel.lighting> & {hull: number; sail: number};
type Segment = {text: string; color: string; backgroundColor: string};
type Cell = {glyph: string; fg: number; bg: number};
type Scene = {water: Float32Array; cells: (Cell | undefined)[]; layout: Layout; light: Lighting; fleet: ReturnType<typeof kernel.fleet>; samples: Float32Array};

const colors: readonly string[] = kernel.palette;
const mono = colors.map((_, index) => {
  const level = Math.round(248 - index * 10.8).toString(16).padStart(2, '0');
  return `#${level}${level}${level}`;
});
// Bounded by viewport count, independent of playback duration. No frame history.
const scenes = new Map<string, Scene>();

function landscape(layout: Layout, light: Lighting, x: number, y: number): number {
  const pine = kernel.pines(layout, light, x, y);
  if (pine >= 0) return pine;
  const land = kernel.land(layout, light, x, y);
  return land >= 0 ? land : kernel.sky(layout, light, x, y);
}

function sceneFor(width: number, height: number): Scene {
  const key = `${width}:${height}`;
  const cached = scenes.get(key);
  if (cached) return cached;
  // Keep native-sized artwork, rather than shrinking a 160×42 scene into
  // every receiver. Short receivers need larger sails and less empty sky.
  const columns = Math.max(20, width);
  const rows = Math.max(8, height);
  const layout: Layout = {...kernel.layout(columns, rows, Math.round(rows * 0.6)), full: true, copyW: 0, fade: 0};
  layout.hz = Math.round(layout.H * (height <= 7 ? 0.36 : 0.45));
  const light = kernel.lighting(layout, 0.44, 0) as Lighting;
  const samples = new Float32Array(width * height * 8).fill(-1);
  for (let y = 0; y < height * 4; y++) {
    const vy = (y + 0.5) * layout.H / (height * 4);
    for (let x = 0; x < width * 2; x++) {
      const vx = (x + 0.5) * layout.W / (width * 2);
      const pine = kernel.pines(layout, light, vx, vy);
      if (pine >= 0 || vy < layout.hz) samples[y * width * 2 + x] = pine >= 0 ? pine : landscape(layout, light, vx, vy);
    }
  }
  const water = layout.H - layout.hz;
  const size = (fraction: number, minimum: number) => Math.round(Math.max(minimum, layout.H * fraction) / 16) * 16;
  const fleet = [{x: layout.W * 0.41, y: layout.H - 16, h: size(0.18, width < 24 ? 48 : 64)}];
  if (width >= 50 && height >= 7) fleet.unshift({x: layout.W * 0.30, y: layout.hz + water * 0.37, h: size(0.11, 32)});
  if (width >= 70 && height >= 7) fleet.unshift({x: layout.W * 0.81, y: layout.hz + water * 0.18, h: 32});
  // The expensive reflected scene is stable at fixed lighting. Preserve its
  // eight-sample detail, then animate small horizontal refractions at runtime.
  const reflected = new Float32Array(samples.length);
  for (let y = 0; y < height * 4; y++) for (let x = 0; x < width * 2; x++) {
    const index = y * width * 2 + x;
    reflected[index] = samples[index]! >= 0 ? samples[index]! : kernel.water(layout, light, fleet, (x + 0.5) * layout.W / (width * 2), (y + 0.5) * layout.H / (height * 4));
  }
  const cells: (Cell | undefined)[] = new Array(width * height);
  const cellSamples = new Float32Array(8);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    for (let q = 0; q < 8; q++) cellSamples[q] = samples[(y * 4 + (q >> 1)) * width * 2 + x * 2 + (q & 1)]!;
    if (cellSamples.every(value => value >= 0)) cells[y * width + x] = encodeTerminalCell(cellSamples, x, y, 20);
  }
  const scene = {layout, light, fleet, samples, cells, water: reflected};
  if (scenes.size >= 4) scenes.delete(scenes.keys().next().value!);
  scenes.set(key, scene);
  return scene;
}

/** At four rows, subpixel averages cannot retain a sail's silhouette. Draw
 * its two sails and hull on the terminal grid, with transparent water behind. */
function compactBoat(x: number, y: number, width: number, height: number) {
  if (width < 12 || height < 3 || height > 6) return undefined;
  const left = Math.round(width * 0.41) - 3;
  const column = x - left;
  const hull = height - 1;
  if (y === hull && column >= 0 && column <= 6) return {glyph: column === 0 ? '◥' : column === 6 ? '◤' : '▀', fg: 18};
  if (y === hull - 1 && column >= 1 && column <= 5) return {glyph: column === 1 ? '◢' : column === 5 ? '◣' : column === 4 ? '▌' : '█', fg: column === 5 ? 5 : 1};
  if (height >= 4 && y === hull - 2 && (column === 3 || column === 4)) return {glyph: column === 3 ? '◢' : '▌', fg: 1};
  return undefined;
}

function compactPine(x: number, y: number, width: number, height: number): Cell | undefined {
  if (width < 12 || height < 3 || height > 6 || y > 1) return undefined;
  const local = x < width / 2 ? x : x - width + 4;
  if (y === 0 && (local === 1 || local === 2)) return {glyph: local === 1 ? '◢' : '◣', fg: 18, bg: 14};
  if (height >= 4 && y === 1 && local >= 0 && local <= 3) return {glyph: local === 0 ? '◢' : local === 3 ? '◣' : '█', fg: 18, bg: 14};
  return undefined;
}

/** Boat's lake artwork with viewport-sized scenery and legible compact sails. */
export function buildBoatLake(pulse: number, width: number, height: number, theme: ThemeName) {
  const scene = sceneFor(width, height);
  const {layout} = scene;
  const time = pulse * 0.08;
  const light = scene.light;
  const fleet = scene.fleet.map((boat, index) => ({...boat, y: boat.y + Math.sin(time * 0.6 + index) * 1.5}));
  const shifts = new Float32Array(height * 4);
  for (let y = 0; y < shifts.length; y++) {
    const depth = Math.max(0, ((y + 0.5) * layout.H / shifts.length - layout.hz) / (layout.H - layout.hz));
    shifts[y] = Math.sin(time * 0.7 + y * 0.65) * (0.3 + 1.2 * depth);
  }
  const palette = theme === 'mono' ? mono : colors;
  const rows = [];
  const samples = new Float32Array(8);
  for (let y = 0; y < height; y++) {
    let text = '';
    const segments: Segment[] = [];
    for (let x = 0; x < width; x++) {
      const vx0 = x * layout.W / width, vy0 = y * layout.H / height;
      const cached = scene.cells[y * width + x];
      const overlapsBoat = height > 6 && fleet.some(boat => vx0 < boat.x + boat.h * 0.55 && vx0 + layout.W / width > boat.x - boat.h * 0.55 && vy0 < boat.y && vy0 + layout.H / height > boat.y - boat.h);
      let cell = cached;
      if (!cell || overlapsBoat) {
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          const sy = y * 4 + dy;
          const vx = (sx + 0.5) * layout.W / (width * 2);
          const vy = (sy + 0.5) * layout.H / (height * 4);
          let value = scene.samples[sy * width * 2 + sx]!;
          if (value < 0) {
            const sampleX = Math.max(0, Math.min(width * 2 - 1, sx + shifts[sy]!));
            const left = Math.floor(sampleX), fraction = sampleX - left;
            const a = scene.water[sy * width * 2 + left]!;
            const b = scene.water[sy * width * 2 + Math.min(width * 2 - 1, left + 1)]!;
            value = a + (b - a) * fraction;
          }
          // Rasterize the original sail/hull polygons at the target resolution.
          // Sampling an already quantized sprite erased small sails a second time.
          if (overlapsBoat) for (const boat of fleet) {
            if (vy < boat.y - boat.h || vy > boat.y || Math.abs(vx - boat.x) > boat.h * 0.55) continue;
            const shape = kernel.boatShape(boat, vx, vy);
            if (shape) value = shape === 3 ? light.hull : light.sail + (shape === 2 ? 2 : 0);
          }
          samples[dy * 2 + dx] = value;
        }
        cell = encodeTerminalCell(samples, x, y, 20);
      }
      const detail = compactBoat(x, y, width, height) ?? compactPine(x, y, width, height);
      const {glyph, fg, bg} = detail ? {...cell, ...detail} : cell;
      const color = palette[fg]!;
      const backgroundColor = palette[bg]!;
      text += glyph;
      const previous = segments.at(-1);
      if (previous?.color === color && previous.backgroundColor === backgroundColor) previous.text += glyph;
      else segments.push({text: glyph, color, backgroundColor});
    }
    rows.push({text, color: palette[14]!, segments});
  }
  return rows;
}

import {buildGallopFine} from './gallop.js';
import type {ThemeName} from '../../types.js';
import {panelBackground, themeAccent, themeContributionColors} from '../theme.js';

type Cell = {text: string; color: string; backgroundColor?: string; bold?: boolean};
type Line = {text: string; color: string; segments: Cell[]};
type Builder = (pulse: number, width: number, height: number, theme: ThemeName) => Line[];
const clamp = (n: number): number => Math.max(0, Math.min(1, n));

function blend(a: string, b: string, t: number): string {
  return '#' + [1, 3, 5].map(offset => Math.round(
    parseInt(a.slice(offset, offset + 2), 16) * (1 - t) + parseInt(b.slice(offset, offset + 2), 16) * t
  ).toString(16).padStart(2, '0')).join('');
}

/** A cell canvas, not a bitmap: glyphs, whole-cell color and intentional empty space. */
function canvas(width: number, height: number, theme: ThemeName) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const accent = themeAccent(theme);
  const contributions = themeContributionColors(theme);
  const ramp = [panelBackground, blend(panelBackground, contributions[1]!, 0.55),
    ...contributions.slice(1), blend(accent, '#ffffff', 0.36), '#ffffff'];
  const cells: Cell[][] = Array.from({length: h}, () => Array.from({length: w}, () => ({text: ' ', color: accent})));
  const paint = (x: number, y: number, text: string, level: number, background = false, color?: string): void => {
    const row = Math.round(y);
    const col = Math.round(x);
    if (row < 0 || row >= h || col < 0 || col >= w) return;
    const ink = color ?? ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(level)))]!;
    cells[row]![col] = background ? {text: ' ', color: ink, backgroundColor: ink} : {text, color: ink};
  };
  const finish = (): Line[] => cells.map(row => {
    const segments: Cell[] = [];
    for (const cell of row) {
      const last = segments.at(-1);
      if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor) last.text += cell.text;
      else segments.push({...cell});
    }
    return {text: row.map(c => c.text).join(''), color: accent, segments};
  });
  return {w, h, ramp, paint, finish};
}

// Interleaved wavefronts, folded through each other. Entire cells are the light source.
const crossfade: Builder = (pulse, width, height, theme) => {
  const c = canvas(width, height, theme);
  const t = pulse * 0.08;
  const shades = Array.from({length: 18}, (_, i) => blend(c.ramp[2]!, c.ramp[5]!, i / 17));
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const u = x / c.w * 2 - 1;
      const v = y / c.h * 2 - 1;
      const a = u * 8.5 + v * 3 + Math.sin(v * 3.4 - t * 0.7) * 2 - t * 1.1;
      const b = v * 5 - u * 2 + Math.sin(u * 3 + t * 0.5) * 1.5 + t * 0.75;
      const value = clamp(0.5 + 0.28 * Math.cos(a) + 0.24 * Math.cos(b));
      c.paint(x, y, ' ', 0, true, shades[Math.round(value * 17)]);
    }
  }
  return c.finish();
};

export const terminalReceiverBuilders = {
  crossfade,
  'gallop-fine': buildGallopFine
};

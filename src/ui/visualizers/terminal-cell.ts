type Cell = {glyph: string; fg: number; bg: number};
const dither = [0, 0.5, 0.125, 0.625, 0.75, 0.25, 0.875, 0.375, 0.1875, 0.6875, 0.0625, 0.5625, 0.9375, 0.4375, 0.8125, 0.3125];
const glyphs = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';

// Eight samples retain diagonals that disappear when collapsed into quadrants.
// All glyphs are single-column BMP characters supported by existing TUI fonts.
const patterns = [...glyphs].slice(1, 8).map((glyph, index) => {
  const quadrant = index + 1;
  return {glyph, mask: (quadrant & 1 ? 5 : 0) | (quadrant & 2 ? 10 : 0) | (quadrant & 4 ? 80 : 0) | (quadrant & 8 ? 160 : 0)};
});
patterns.push({glyph: '◢', mask: 232}, {glyph: '◣', mask: 212}, {glyph: '◤', mask: 23}, {glyph: '◥', mask: 43}, {glyph: '▂', mask: 192}, {glyph: '▆', mask: 252});
const clusters = patterns.map(pattern => ({...pattern, indices: Array.from({length: 8}, (_, q) => q).filter(q => pattern.mask & (1 << q))}));

export function encodeTerminalCell(samples: Float32Array, x: number, y: number, maximum: number): Cell {
  let total = 0, squared = 0;
  for (const sample of samples) {total += sample; squared += sample * sample;}
  const mean = total / 8;
  const base = Math.floor(mean);
  const shade = Math.min(4, Math.floor((mean - base) * 4 + dither[(y & 3) * 4 + (x & 3)]!));
  const value = base + shade / 4;
  let error = 0;
  for (const sample of samples) error += (sample - value) ** 2;
  error *= 0.8;
  let glyph = [' ', '░', '▒', '▓', ' '][shade]!;
  let fg = Math.min(maximum, base + 1), bg = Math.min(maximum, base + (shade === 4 ? 1 : 0));
  for (const pattern of clusters) {
    let sum = 0;
    const count = pattern.indices.length;
    for (const q of pattern.indices) sum += samples[q]!;
    const a = Math.round(sum / count), b = Math.round((total - sum) / (8 - count));
    if (a === b) continue;
    // Sum of squared residuals, without resampling each cluster's members.
    const cost = squared - 2 * a * sum + count * a * a - 2 * b * (total - sum) + (8 - count) * b * b;
    if (cost < error) {error = cost; glyph = pattern.glyph; fg = a; bg = b;}
  }
  return {glyph, fg, bg};
}

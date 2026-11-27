import {panelBackground} from '../theme.js';
import {TAU, braille, clamp, fract, grid, hash, kick, mix, noise, pixels, seconds, smooth, stroke, type Builder, type Pixels} from './cell-canvas.js';
import {season} from './festive-receivers.js';

const disc = (p: Pixels, cx: number, cy: number, rx: number, ry: number, color: (dx: number, dy: number) => string | undefined): void => {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const tone = color(dx, dy);
    if (tone) p.px(x, y, tone);
  }
};

// A Tibetan-style sand timer of colour: a prism splitting one white beam into a fan that slowly turns.
const prism: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const cx = b.dw * 0.45, cy = b.dh / 2, side = Math.min(b.dh * 0.42, b.dw * 0.16), tilt = Math.sin(t * 0.3) * 0.12;
  const corners = [0, 1, 2].map(i => [cx + Math.cos(-Math.PI / 2 + i * TAU / 3) * side * 1.3, cy + Math.sin(-Math.PI / 2 + i * TAU / 3) * side] as const);
  const entry: [number, number] = [(corners[0]![0] + corners[2]![0]) / 2, (corners[0]![1] + corners[2]![1]) / 2], exit: [number, number] = [(corners[0]![0] + corners[1]![0]) / 2, (corners[0]![1] + corners[1]![1]) / 2];
  b.line(0, entry[1] + (entry[0]) * (0.18 + tilt), entry[0], entry[1], '#ffffff');
  b.line(0, entry[1] + (entry[0]) * (0.18 + tilt) + 1, entry[0], entry[1] + 1, g.paint.ink(0.8));
  b.line(entry[0], entry[1], exit[0], exit[1], g.paint.ink(0.5));
  // Seven rays leave the far face, each bent a little more than the last, and each one shimmering along its length.
  const hues = theme === 'mono' ? ['#ffffff', '#e0e0e0', '#c0c0c0', '#a0a0a0', '#888888', '#707070', '#585858'] : ['#ff3b3b', '#ff9a2a', '#ffe23a', '#3ddc5a', '#35b8ff', '#5a5aff', '#b04bff'];
  hues.forEach((hue, i) => {
    const slope = -0.1 + i * 0.075 + tilt * 0.6;
    for (let s = 0; s < b.dw - exit[0]; s++) { const y = exit[1] + s * slope * 0.9; if (hash(s + i * 40, Math.floor(t * 8)) > 0.12) b.dot(exit[0] + s, y, hue); if (s > 6) b.dot(exit[0] + s, y + 1, mix(panelBackground, hue, 0.6)); }
  });
  for (let i = 0; i < 3; i++) b.line(corners[i]![0], corners[i]![1], corners[(i + 1) % 3]![0], corners[(i + 1) % 3]![1], mix(g.paint.accent, '#ffffff', 0.6));
  b.flush();
  return g.finish();
};

// A music box: the pinned cylinder turns, and each tooth of the comb rings as a pin goes under it.
const musicBox: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const teeth = g.h, brass = mix(panelBackground, '#d6a856', 0.9), comb = Math.min(12, Math.floor(g.w * 0.22)), drum = g.w - comb - 2;
  const pin = (tooth: number, step: number): boolean => hash(tooth * 31 + ((step % 64) + 64) % 64, 7) > 0.86 || (step % 8 === 0 && tooth === (Math.floor(step / 8) * 3) % teeth);
  const head = Math.floor(t * 8);
  for (let row = 0; row < teeth; row++) {
    const struck = pin(row, head), since = fract(t * 8) / 8, long = comb - Math.round(row / teeth * comb * 0.5);
    // The comb: long teeth for low notes, short for high; a struck tooth shivers and lights.
    for (let x = 0; x < long; x++) g.set(x, row, struck ? (x % 2 === Math.floor(since * 60) % 2 ? '═' : '≈') : '═', struck ? '#ffffff' : mix(panelBackground, '#c8ccd6', 0.5 + 0.4 * row / teeth), undefined, struck);
    if (struck) g.set(long, row, '♪', g.paint.fan(row / teeth * 2 - 1), undefined, true);
    for (let x = 0; x < drum; x++) {
      const step = head + x, shade = 0.35 + 0.65 * Math.sin((row + 0.5) / teeth * Math.PI);
      g.set(comb + 2 + x, row, pin(row, step) ? '●' : step % 8 === 0 ? '┊' : ' ', pin(row, step) ? mix('#3a2a10', '#fff0c0', shade) : mix(brass, '#000000', 0.45), mix('#000000', brass, shade * 0.75));
    }
  }
  return g.finish();
};

// A campfire seen from across it: flames, sparks climbing into the dark, and the faces of the trees coming and going.
const campfire: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const ground = p.ph - Math.max(2, Math.round(p.ph * 0.12)), cx = p.pw / 2, blaze = 0.7 + 0.3 * noise(t * 3, 1);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const near = Math.exp(-(((x - cx) / (p.pw * 0.3)) ** 2)) * blaze;
    p.px(x, y, y >= ground ? c(mix('#0a0806', '#5a3418', near)) : hash(x, y * 5.3) > 0.992 ? c('#c8c8e0') : c(mix('#03040a', '#1a0f0a', near * (y / ground) * 0.8)));
  }
  for (let tree = 0; tree < p.pw / 9; tree++) {
    const x = Math.round((tree + hash(tree, 1)) * 9), far = Math.abs(x - cx) / (p.pw / 2), tall = Math.round(p.ph * (0.5 + 0.3 * hash(tree, 2)));
    if (far < 0.25) continue;
    for (let row = 0; row < tall; row++) for (let dx = -Math.floor(row / 3) - 1; dx <= Math.floor(row / 3) + 1; dx++) p.px(x + dx, ground - tall + row, c(mix('#05070a', '#3a2412', (dx * Math.sign(cx - x) > 0 ? 0.5 : 0.1) * (1 - far) * blaze)));
  }
  const tall = Math.max(4, p.ph * 0.5), wide = Math.max(4, p.ph * 0.42);
  for (let y = ground - Math.round(tall); y < ground; y++) for (let x = Math.round(cx - wide); x <= cx + wide; x++) {
    const rise = (ground - y) / tall, across = (x - cx) / wide;
    const heat = 1.35 - rise * 1.3 - across * across * 2.2 + (noise(x * 0.3, y * 0.28 + t * 3.6, 2) - 0.5) * 1.3;
    if (heat > 0.2) p.px(x, y, c(heat < 0.45 ? '#b3261a' : heat < 0.75 ? '#ff8a2a' : heat < 1.05 ? '#ffd24a' : '#fff6cf'));
  }
  for (const log of [-1, 1]) stroke(p, cx - wide * 0.9, ground - (log > 0 ? 2 : 0), cx + wide * 0.9, ground - (log > 0 ? 0 : 2), 0.7, c('#2a1a10'));
  for (let spark = 0; spark < 26; spark++) {
    const age = fract(t * (0.25 + 0.3 * hash(spark, 3)) + hash(spark, 4)), x = cx + (hash(spark, 5) - 0.5) * wide + Math.sin(age * 9 + spark) * (2 + age * 6), y = ground - tall * 0.6 - age * (ground - tall * 0.6);
    if (y > 0) p.px(Math.round(x), Math.round(y), mix(c('#03040a'), c('#ffb040'), (1 - age) ** 1.5));
  }
  for (const side of [-1, 1]) { const sx = Math.round(cx + side * wide * 2.2); disc(p, sx, ground - 4, 2.2, 2, () => c(mix('#0a0806', '#6a3a22', blaze * 0.6))); for (let y = ground - 2; y < ground + 1; y++) for (let dx = -2; dx <= 2; dx++) p.px(sx + dx, y, c(mix('#0a0806', '#4a2a1a', blaze * 0.6))); }
  p.flush();
  return g.finish();
};

// A glass of something fizzy held up to the light: bubbles form on the wall, let go, and wobble to the top.
const sodaFizz: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const top = Math.max(1, Math.round(p.ph * 0.14)), drink = mix(panelBackground, g.paint.accent, 0.55);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const surface = top + Math.sin(x * 0.2 + t * 2) * 0.6;
    p.px(x, y, y < surface ? mix(panelBackground, '#ffffff', 0.04) : mix(drink, '#000000', 0.5 * (y - top) / (p.ph - top) + (noise(x * 0.06, y * 0.1 - t * 0.2, 3) - 0.5) * 0.12));
  }
  for (let bubble = 0; bubble < p.pw * 1.4; bubble++) {
    const speed = 0.12 + 0.3 * hash(bubble, 1), cycle = fract(t * speed + hash(bubble, 2));
    // Small ones climb straight; big ones climb faster and wander.
    const size = hash(bubble, 3), y = p.ph - 1 - cycle ** 0.8 * (p.ph - 1 - top), x = hash(bubble, 4) * p.pw + Math.sin(cycle * 14 + bubble) * (0.4 + size * 1.6);
    const px = Math.round(x), py = Math.round(y);
    p.px(px, py, mix(drink, '#ffffff', 0.5 + 0.5 * size));
    if (size > 0.72) { p.px(px + 1, py, mix(drink, '#ffffff', 0.4)); p.px(px, py + 1, mix(drink, '#ffffff', 0.4)); p.px(px + 1, py + 1, mix(drink, '#ffffff', 0.25)); }
    if (cycle > 0.97) for (const dx of [-1, 1]) p.px(px + dx, top - 1, '#ffffff');
  }
  for (let x = 0; x < p.pw; x++) if (hash(x, Math.floor(t * 6)) > 0.55) p.px(x, top, mix(drink, '#ffffff', 0.7));
  if (p.pw > 40) for (const cube of [0.3, 0.62]) { const cx = p.pw * cube + Math.sin(t * 0.7 + cube * 9) * 2, cy = top + 3 + Math.sin(t + cube * 5) * 0.8; for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 8; dx++) p.px(Math.round(cx) + dx, Math.round(cy) + dy, mix(p.at(Math.round(cx) + dx, Math.round(cy) + dy) ?? drink, '#ffffff', dx === 0 || dy === 0 ? 0.55 : 0.22)); }
  p.flush();
  return g.finish();
};

// A marching band on parade, seen from the grandstand: ranks wheeling through their figures, plumes and brass catching the light.
const marchingBand: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, c(Math.floor(x / 10) % 2 ? '#2f8a3e' : '#2a7a38'));
  for (let line = 0; line <= p.pw; line += 10) for (let y = 0; y < p.ph; y++) p.px(line, y, c('#d8f0d8'));
  const files = Math.max(4, Math.floor(p.pw / 6)), ranks = Math.max(2, Math.floor(p.ph / 5)), figure = Math.floor(t / 8) % 4, blend = smooth(clamp((t % 8) / 3));
  // Four drill figures; each player has a place in every one and walks between them.
  const place = (which: number, i: number, j: number): [number, number] => {
    const u = i / (files - 1), v = j / (ranks - 1);
    if (which === 0) return [p.pw * (0.08 + 0.84 * u), p.ph * (0.15 + 0.7 * v)];
    if (which === 1) { const a = (i + j * files) / (files * ranks) * TAU; return [p.pw / 2 + Math.cos(a) * p.pw * 0.36 * (0.5 + 0.5 * v), p.ph / 2 + Math.sin(a) * p.ph * 0.38 * (0.5 + 0.5 * v)]; }
    if (which === 2) return [p.pw * (0.08 + 0.84 * u), p.ph * (0.5 + (v - 0.5) * 0.6 + 0.3 * Math.abs(u - 0.5) * (v < 0.5 ? -1 : 1))];
    return [p.pw * (0.08 + 0.84 * u), p.ph * (0.5 + 0.34 * Math.sin(u * TAU * 1.5 + v * 2))];
  };
  for (let j = 0; j < ranks; j++) for (let i = 0; i < files; i++) {
    const [x0, y0] = place((figure + 3) % 4, i, j), [x1, y1] = place(figure, i, j), x = Math.round(x0 + (x1 - x0) * blend), y = Math.round(y0 + (y1 - y0) * blend), step = Math.floor(t * 4) % 2 === (i + j) % 2;
    p.px(x, y - 2, c(j % 2 ? '#ffd23a' : '#ffffff')); p.px(x, y - 1, c('#f2c6a0')); p.px(x, y, c('#c0281e')); p.px(x, y + 1, c('#c0281e')); p.px(x + (step ? 1 : -1), y + 2, c('#14141c')); p.px(x, y + 2, c('#ffffff'));
    if ((i + j) % 3 === 0) p.px(x + 1, y, mix(c('#d6a856'), '#ffffff', kick(t)));
  }
  p.flush();
  return g.finish();
};

// Honeycomb, being filled: bees land, cells take colour one at a time, and a capped cell is done.
const honeycomb: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const size = Math.max(3, Math.round(p.ph / 5)), hexW = size * 2.2, hexH = size * 1.7, epoch = Math.floor(t / 40), local = t % 40;
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    // Nearest hexagon centre on a staggered grid.
    const row = Math.round(y / hexH), col = Math.round((x - (row & 1) * hexW / 2) / hexW), cx = col * hexW + (row & 1) * hexW / 2, cy = row * hexH;
    const dx = Math.abs(x - cx) / (hexW / 2), dy = Math.abs(y - cy) / (hexH / 1.5), edge = Math.max(dx, dx * 0.5 + dy);
    const fill = clamp((local - hash(col * 13 + row, epoch + 1) * 30) / 5), capped = fill >= 1;
    p.px(x, y, edge > 0.86 ? c('#6a4a12') : capped ? c(mix('#f2c94a', '#fff0b0', (1 - edge) * 0.5)) : mix(c('#2a1c08'), c('#f2a01a'), fill * (0.4 + 0.6 * (1 - edge))));
  }
  for (let bee = 0; bee < Math.max(2, p.pw / 18); bee++) {
    const x = Math.round(p.pw * (0.5 + 0.45 * Math.sin(t * (0.3 + 0.1 * bee) + bee * 2))), y = Math.round(p.ph * (0.5 + 0.4 * Math.sin(t * (0.41 + 0.07 * bee) + bee)));
    for (let dx = 0; dx < 4; dx++) p.px(x + dx, y, c(dx % 2 ? '#14100a' : '#ffd23a'));
    if (Math.floor(t * 20) % 2) { p.px(x + 1, y - 1, '#ffffff'); p.px(x + 2, y - 1, '#ffffff'); }
  }
  p.flush();
  return g.finish();
};

export const wonderReceiverBuilders = {
  'light-prism': prism,
  'music-box': musicBox,
  bonfire: campfire,
  'soda-fizz': sodaFizz,
  'marching-band': marchingBand,
  beehive: honeycomb,
};

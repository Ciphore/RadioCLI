import type {ThemeName} from '../../types.js';
import {TAU, clamp, fract, grid, hash, kick, mix, noise, pixels, seconds, smooth, stroke, textPixel, tri, type Builder, type Pixels} from './cell-canvas.js';

// These scenes keep the colours the season is known by; only their lights follow the theme. Mono gets the same scenes in greys.
const RED = '#d8283c', GREEN = '#1f8f4d', PINE = '#12613a', GOLD = '#f6c453', SNOW = '#f2f6fb', EMBER = '#ff8a2a', NIGHT = '#0b1630', WOOD = '#7a4a2a', INK = '#05070c';
const season = (theme: ThemeName) => (hex: string): string => {
  if (theme !== 'mono') return hex;
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const grey = Math.round(0.3 * r! + 0.59 * g! + 0.11 * b!).toString(16).padStart(2, '0');
  return `#${grey}${grey}${grey}`;
};
const DIGITS = [[14, 17, 17, 17, 14], [4, 12, 4, 4, 14], [30, 1, 14, 16, 31], [30, 1, 14, 1, 30], [18, 18, 31, 2, 2], [31, 16, 30, 1, 30], [14, 16, 30, 17, 14], [31, 1, 2, 4, 4], [14, 17, 14, 17, 14], [14, 17, 15, 1, 14]];

/** Is this pixel lit in a line of letters and digits on a six-pixel advance? */
const lettering = (text: string, x: number, y: number): boolean => {
  if (x < 0 || y < 0 || y > 4 || x % 6 === 5) return false;
  const glyph = text[Math.floor(x / 6)] ?? ' ';
  return glyph >= '0' && glyph <= '9' ? ((DIGITS[Number(glyph)]![y]! >> (4 - x % 6)) & 1) === 1 : textPixel(text, x, y);
};
/** Set lettering in pixels; the painter chooses a colour per pixel, or nothing to leave it clear. */
const write = (p: Pixels, text: string, left: number, top: number, scale: number, paint: (letter: number, x: number, y: number) => string | undefined): void => {
  for (let y = 0; y < 5 * scale; y++) for (let x = 0; x < (text.length * 6 - 1) * scale; x++) {
    if (!lettering(text, Math.floor(x / scale), Math.floor(y / scale))) continue;
    const color = paint(Math.floor(x / scale / 6), x, y);
    if (color) p.px(left + x, top + y, color);
  }
};
const snowfall = (p: Pixels, t: number, flakes: number, color: string): void => {
  for (let flake = 0; flake < flakes; flake++) {
    const drift = hash(flake, 1) * p.pw + Math.sin(t * 0.6 + flake) * 2.5;
    p.px(Math.floor(((drift % p.pw) + p.pw) % p.pw), Math.floor(fract(hash(flake, 2) + t * (0.035 + 0.05 * hash(flake, 3))) * p.ph), color);
  }
};
const starlight = (p: Pixels, t: number, horizon: number, color: string, ground: string): void => {
  for (let star = 0; star < p.pw * horizon / 70; star++) {
    p.px(Math.floor(hash(star, 41) * p.pw), Math.floor(hash(star, 42) * horizon), mix(ground, color, 0.25 + 0.75 * tri(t * (0.15 + 0.2 * hash(star, 43)) + hash(star, 44))));
  }
};
const fill = (p: Pixels, color: (x: number, y: number) => string): void => {
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, color(x, y));
};
/** A background that only changes from row to row. */
const wash = (p: Pixels, color: (y: number) => string): void => {
  for (let y = 0; y < p.ph; y++) { const tone = color(y); for (let x = 0; x < p.pw; x++) p.px(x, y, tone); }
};
const disc = (p: Pixels, cx: number, cy: number, rx: number, ry: number, color: (dx: number, dy: number) => string | undefined): void => {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const tone = color(dx, dy);
    if (tone) p.px(x, y, tone);
  }
};
/** A candle or lamp flame: a teardrop that leans and stretches a little every frame. */
const flame = (p: Pixels, x: number, base: number, tall: number, t: number, seed: number, c: (hex: string) => string): void => {
  const flicker = 0.8 + 0.2 * noise(t * 5, seed * 7.3), lean = (noise(t * 3, seed * 3.1 + 9) - 0.5) * 1.6;
  const height = Math.max(1, tall * flicker);
  for (let rise = 0; rise < height; rise++) {
    const up = rise / height;
    const half = Math.max(0, Math.sin(Math.PI * Math.min(1, up * 1.25 + 0.12)) * tall * 0.3);
    for (let dx = -Math.round(half); dx <= Math.round(half); dx++) {
      p.px(Math.round(x + lean * up) + dx, base - rise, c(Math.abs(dx) < half * 0.5 && up < 0.6 ? '#fff7d6' : up < 0.75 ? '#ffc94d' : EMBER));
    }
  }
};

// The greeting itself, snow settling on every letter, under a string of lights.
const merryChristmas: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c(NIGHT), c('#1b2b55'), y / p.ph));
  snowfall(p, t * 0.6, Math.round(p.pw * p.ph / 60), c('#7f8fb5'));
  // The long word sets the size; the short one may be one step larger, never more.
  const below = Math.max(1, Math.floor(Math.min(p.pw * 0.94 / 53, (p.ph - 7) / 11)));
  const top = Math.max(1, Math.min(below + 1, Math.floor(Math.min(p.pw * 0.92 / 29, (p.ph - 7 - 5 * below) / 5))));
  const gap = p.ph >= 14 ? 2 : 1;
  const start = Math.max(p.ph >= 12 ? 3 : 0, Math.floor((p.ph - (5 * top + gap + 5 * below)) / 2));
  const glint = fract(t * 0.22) * (p.pw + 30) - 15;
  const letters = (text: string, scale: number, y0: number): void => {
    const left = Math.floor((p.pw - (text.length * 6 - 1) * scale) / 2);
    write(p, text, left, y0, scale, (letter, x, y) => {
      const capped = y < scale && !lettering(text, Math.floor(x / scale), -1);
      const shine = Math.abs(left + x - y * 0.6 - glint) < 2.5;
      return capped && y < Math.max(1, scale / 2) ? c(SNOW) : shine ? c('#fff3c4') : mix(c(letter % 2 ? GREEN : RED), '#ffffff', y < scale ? 0.25 : 0);
    });
  };
  letters('MERRY', top, start);
  letters('CHRISTMAS', below, start + 5 * top + gap);
  // A swagged wire of bulbs across the top, each on its own slow blink.
  const bulbs = [c(RED), c(GOLD), c(GREEN), c('#4aa3ff'), g.paint.accent];
  const swags = Math.max(1, Math.round(p.pw / 34));
  for (let x = 0; x < p.pw && p.ph >= 12; x++) {
    const along = fract(x / p.pw * swags);
    const y = Math.round(4 * along * (1 - along) * 2.2);
    p.px(x, y, c('#33415f'));
    if (x % 4 === 1) p.px(x, y + 1, mix(c(NIGHT), bulbs[(x >> 2) % bulbs.length]!, 0.35 + 0.65 * tri(t * 0.7 + (x >> 2) * 0.37)));
  }
  for (let x = 0; x < p.pw; x++) {
    const drift = p.ph - 1 - Math.round(0.8 + Math.sin(x * 0.13) * 0.8 + Math.sin(x * 0.041 + 1) * 0.9);
    for (let y = Math.max(0, drift); y < p.ph; y++) p.px(x, y, mix(c(SNOW), c('#9fb4d8'), (y - drift) / 3));
  }
  snowfall(p, t, Math.round(p.pw * p.ph / 46), c(SNOW));
  p.flush();
  return g.finish();
};

const REINDEER = [
  ['       a a', '        hh', ' bbbbbbbhn', 'bbbbbbbb  ', ' l    l   ', 'l      l  '],
  ['       a a', '        hh', ' bbbbbbbhn', 'bbbbbbbb  ', '  l  l    ', '  l  l    ']
] as const;
const SLEIGH = ['    s       ', '   ss  gg   ', '  wssw ggg  ', ' rrrrrrrrr  ', 'krrrrrrrrrk ', ' kkkkkkkkkk '] as const;

// Rooftops under a full moon, and a sleigh crossing it with a trail of bells behind.
const santaSleigh: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const sky = (y: number): string => mix(c('#070d22'), c('#243a6b'), (y / p.ph) ** 1.6);
  wash(p, y => sky(y));
  starlight(p, t, p.ph * 0.8, c(SNOW), c('#0c1530'));
  const moonX = p.pw * 0.72, moonY = p.ph * 0.36, moonR = Math.max(2, p.ph * 0.27);
  disc(p, moonX, moonY, moonR * 1.5, moonR * 1.5, (dx, dy) => mix(sky(moonY + dy * moonR * 1.5), c('#fdf3c8'), 0.22 * (1 - Math.hypot(dx, dy))));
  disc(p, moonX, moonY, moonR, moonR, (dx, dy) => mix(c('#fdf3c8'), c('#d9c98e'), smooth((noise(dx * 2.2 + 3, dy * 2.2, 4) - 0.45) * 3) * 0.6));
  // Roofs: a run of pitched silhouettes, snow on every ridge, a few windows still lit.
  let x = -3, house = 0;
  while (x < p.pw) {
    const wide = 9 + Math.floor(hash(house, 1) * 9), tall = Math.max(2, Math.round(p.ph * (0.14 + 0.16 * hash(house, 2))));
    const eave = p.ph - tall;
    for (let dx = 0; dx < wide; dx++) {
      const ridge = eave - Math.round((wide / 2 - Math.abs(dx - wide / 2)) * 0.55);
      for (let y = Math.max(0, ridge); y < p.ph; y++) p.px(x + dx, y, y <= ridge + 0 ? c(SNOW) : y < eave ? c('#1a2440') : c('#111a30'));
    }
    if (hash(house, 3) > 0.35) {
      const lit = c(mix('#3a2c14', '#ffcf6b', 0.55 + 0.45 * noise(t * 0.8, house * 5.1)));
      for (let wy = 0; wy < 2; wy++) for (let wx = 0; wx < 2; wx++) p.px(x + 3 + wx + Math.floor(hash(house, 4) * (wide - 7)), eave + 1 + wy, lit);
    }
    if (hash(house, 5) > 0.5) for (let y = eave - 4; y < eave; y++) for (let dx = 0; dx < 2; dx++) p.px(x + wide - 4 + dx, y, y === eave - 4 ? c(SNOW) : c('#1a2440'));
    x += wide + 1; house++;
  }
  // The team gallops along a shallow arc, right across the moon.
  const team = p.pw >= 70 ? 3 : p.pw >= 44 ? 2 : 1;
  const long = team * 11 + 13;
  const way = fract(t / 16);
  const head = -long + way * (p.pw + long * 2);
  const flight = (at: number): number => p.ph * 0.5 - Math.sin(clamp(at / p.pw) * Math.PI) * p.ph * 0.26;
  const coat = c('#a8794f');
  for (let trail = 0; trail < 46; trail++) {
    const back = 2 + trail * 1.4 + hash(trail, 7) * 2;
    const tx = head - long - back, ty = flight(tx + long / 2) + 4 + (hash(trail, 8) - 0.5) * 5 + back * 0.05;
    if (hash(trail, Math.floor(t * 9)) > 0.45) p.px(Math.round(tx), Math.round(ty), mix(sky(ty), trail % 3 ? c(GOLD) : g.paint.accent, clamp(1.1 - trail / 46)));
  }
  for (let deer = 0; deer < team; deer++) {
    const dx = Math.round(head - 11 - deer * 11), dy = Math.round(flight(dx + 5) + Math.sin(t * 7 + deer * 1.4) * 0.8);
    REINDEER[Math.floor(t * 6 + deer) & 1]!.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const key = row[rx]!;
        if (key !== ' ') p.px(dx + rx, dy + ry, key === 'n' ? (deer ? coat : c('#ff3b3b')) : key === 'a' ? c('#d9b98a') : key === 'l' ? c('#6b4a2d') : coat);
      }
    });
    stroke(p, dx, dy + 3, dx - 3, dy + 3, 0.3, c('#caa15a'));
  }
  const sx = Math.round(head - team * 11 - 14), sy = Math.round(flight(sx + 6) + Math.sin(t * 7 + 4) * 0.6);
  SLEIGH.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const key = row[rx]!;
      if (key !== ' ') p.px(sx + rx, sy + ry, c(key === 's' || key === 'r' ? RED : key === 'w' ? SNOW : key === 'g' ? GREEN : GOLD));
    }
  });
  snowfall(p, t, Math.round(p.pw * p.ph / 70), c(SNOW));
  p.flush();
  return g.finish();
};

/** One decorated tree: tiered boughs, a garland, baubles on a three-phase blink, a star, and presents. */
const tree = (p: Pixels, cx: number, base: number, tall: number, t: number, c: (hex: string) => string, accent: string, seed: number): void => {
  const trunk = Math.max(1, Math.round(tall * 0.1)), crown = tall - trunk;
  const tiers = Math.max(2, Math.round(crown / 6));
  const top = base - tall;
  for (let y = 0; y < trunk; y++) for (let dx = -1; dx <= (tall > 12 ? 1 : 0); dx++) p.px(Math.round(cx) + dx, base - 1 - y, c(WOOD));
  const half = (row: number): number => {
    const tier = Math.min(tiers - 1, Math.floor(row / crown * tiers));
    const within = row / crown * tiers - tier;
    return 0.7 + (tier * 0.62 + within * 1.25) * crown / tiers * 0.52;
  };
  for (let row = 0; row < crown; row++) {
    const reach = half(row);
    for (let dx = -Math.ceil(reach); dx <= Math.ceil(reach); dx++) {
      if (Math.abs(dx) > reach) continue;
      const edge = Math.abs(dx) > reach - 1.2;
      p.px(Math.round(cx) + dx, top + row, mix(c(edge ? PINE : GREEN), c('#0c3d25'), 0.5 * noise(dx * 0.7 + seed * 9, row * 0.9)));
    }
    // The garland zigzags down the tree with a bright bead running along it.
    const swing = tri(row / crown * tiers * 0.5 + 0.25) * 2 - 1;
    if (row > 1) p.px(Math.round(cx + swing * (reach - 1)), top + row, mix(c(GOLD), '#ffffff', 0.7 * Math.exp(-(((fract(row / crown - t * 0.25) - 0.5) * 8) ** 2))));
  }
  const lights = [c(RED), c(GOLD), c('#4aa3ff'), accent, c('#ff7bd0')];
  for (let bauble = 0; bauble < Math.round(crown * crown / 26); bauble++) {
    const row = 2 + Math.floor(hash(bauble, seed + 1) * (crown - 3));
    const dx = Math.round((hash(bauble, seed + 2) * 2 - 1) * (half(row) - 1.2));
    const on = (bauble + Math.floor(t * 2)) % 3 !== 0;
    p.px(Math.round(cx) + dx, top + row, on ? lights[bauble % lights.length]! : mix(lights[bauble % lights.length]!, c('#0c3d25'), 0.7));
  }
  const glow = 0.6 + 0.4 * kick(t);
  for (const [dx, dy] of [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1]] as const) p.px(Math.round(cx) + dx, top - 1 + dy, mix(c(GOLD), '#ffffff', dx || dy ? 0.1 : glow));
  if (tall > 12) for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2]] as const) p.px(Math.round(cx) + dx, top - 1 + dy, mix(c(NIGHT), c(GOLD), glow * 0.8));
  const wraps = [c(RED), c('#3b7dd8'), c(GOLD), c('#8e44ad'), c(GREEN)];
  for (let gift = 0; gift < (tall > 12 ? 4 : 0); gift++) {
    const side = gift % 2 ? 1 : -1, wide = 3 + Math.floor(hash(gift, seed + 5) * 3), high = 2 + Math.floor(hash(gift, seed + 6) * 2);
    const left = Math.round(cx + side * (3 + Math.floor(gift / 2) * 6)) - (side < 0 ? wide : 0);
    for (let y = 0; y < high; y++) for (let x = 0; x < wide; x++) p.px(left + x, base - 1 - y, x === Math.floor(wide / 2) || y === high - 1 ? c(SNOW) : wraps[(gift + seed) % wraps.length]!);
  }
};

// The tree, lit: a star that answers the beat, baubles taking turns, and presents waiting underneath.
const christmasTree: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#0a1226'), c('#1c2748'), y / p.ph));
  snowfall(p, t * 0.7, Math.round(p.pw * p.ph / 50), c('#8795b8'));
  for (let x = 0; x < p.pw; x++) for (let y = p.ph - 1 - Math.round(1 + Math.sin(x * 0.09) * 0.9); y < p.ph; y++) p.px(x, y, c(y === p.ph - 1 ? '#b9c8e6' : SNOW));
  const tall = Math.max(3, p.ph - 4);
  const side = Math.round(tall * 0.62);
  for (let n = 1; n <= Math.floor((p.pw / 2 - tall * 0.5) / (side * 1.25)); n++) {
    for (const dir of [-1, 1]) tree(p, p.pw / 2 + dir * (tall * 0.55 + (n - 0.4) * side * 1.25), p.ph - 1, n % 2 ? side : Math.round(side * 0.75), t + n * 0.31, c, g.paint.accent, n * 2 + (dir > 0 ? 1 : 0));
  }
  tree(p, p.pw / 2, p.ph - 1, tall, t, c, g.paint.accent, 0);
  snowfall(p, t, Math.round(p.pw * p.ph / 80), c(SNOW));
  p.flush();
  return g.finish();
};

// A brick hearth with the fire going, stockings on the mantel, and snow at the window.
const fireside: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const cx = Math.round(p.pw / 2), floor = p.ph - Math.max(1, Math.round(p.ph * 0.1));
  const hearth = Math.max(6, Math.min(Math.round(p.ph * 0.9), Math.round(p.pw * 0.45))), mantel = Math.max(1, Math.round(p.ph * 0.2));
  const blaze = 0.75 + 0.25 * noise(t * 3, 1);
  // The room is lit by the fire alone: warm near the hearth, dark in the corners.
  fill(p, (x, y) => {
    const near = Math.exp(-(((x - cx) / (hearth * 1.5)) ** 2)) * blaze;
    return y >= floor ? mix(c('#24130c'), c('#8a4b22'), near * 0.8) : mix(c('#150c12'), c('#4a2418'), near * 0.6);
  });
  for (let y = mantel; y < floor; y++) for (let x = cx - hearth; x <= cx + hearth; x++) {
    const mortar = y % 3 === 0 || (x + (Math.floor(y / 3) & 1) * 3) % 6 === 0;
    p.px(x, y, c(mortar ? '#3a1d17' : mix('#8f3b2b', '#6d2a20', hash(Math.floor((x + (Math.floor(y / 3) & 1) * 3) / 6), Math.floor(y / 3)))));
  }
  const mouth = Math.round(hearth * 0.62), lintel = mantel + Math.max(1, Math.round((floor - mantel) * 0.22));
  for (let y = lintel; y < floor; y++) for (let x = cx - mouth; x <= cx + mouth; x++) {
    const rise = (floor - y) / (floor - lintel), across = (x - cx) / mouth;
    const heat = 1.3 - rise * 1.25 - across * across * 1.1 + (noise(x * 0.34, y * 0.3 + t * 3.4, 2) - 0.5) * 1.15;
    p.px(x, y, heat < 0.18 ? c('#12080a') : heat < 0.42 ? c('#b3261a') : heat < 0.7 ? c(EMBER) : heat < 1 ? c('#ffd24a') : c('#fff6cf'));
  }
  for (const log of [-1, 1]) stroke(p, cx - mouth * 0.7, floor - 1 - (log > 0 ? 1 : 0), cx + mouth * 0.7, floor - 1 - (log > 0 ? 0 : 1), 0.6, c('#3b2416'));
  for (let x = cx - hearth - 2; x <= cx + hearth + 2; x++) for (let y = mantel - 1; y <= mantel; y++) p.px(x, y, c(y < mantel ? '#b98a5a' : '#8a5e38'));
  // Garland along the shelf, with a light every few needles.
  for (let x = cx - hearth - 1; x <= cx + hearth + 1 && mantel >= 3; x++) {
    p.px(x, mantel - 2, c(x % 2 ? GREEN : PINE));
    if (x % 5 === 0) p.px(x, mantel - 2, mix(c(RED), g.paint.accent, tri(t * 0.6 + x * 0.21)));
  }
  const socks = Math.max(2, Math.min(5, Math.floor(hearth / 5)));
  for (let sock = 0; sock < socks && floor - mantel >= 8; sock++) {
    const x = Math.round(cx + (sock - (socks - 1) / 2) * (hearth * 1.7 / socks)), sway = Math.round(Math.sin(t * 1.3 + sock) * 0.6);
    const felt = c([RED, GREEN, '#c9a227', RED, GREEN][sock]!);
    for (let y = 1; y <= 5; y++) for (let dx = 0; dx < 3; dx++) p.px(x + dx + (y > 2 ? sway : 0), mantel + y, y === 1 ? c(SNOW) : felt);
    for (let dx = 3; dx < 5; dx++) for (let y = 4; y <= 5; y++) p.px(x + dx + sway, mantel + y, felt);
  }
  for (const side of [-1, 1]) if (mantel >= 5) {
    const x = cx + side * (hearth - 2);
    for (let y = mantel - 4; y < mantel - 1; y++) p.px(x, y, c('#f3ead6'));
    flame(p, x, mantel - 5, 3, t, side + 3, c);
  }
  // A window on the cold side of the room.
  if (p.pw > hearth * 2 + 26 && p.ph >= 16) {
    const wx = Math.round((cx - hearth) / 2), wy = Math.round(p.ph * 0.42), ww = Math.min(9, Math.round((cx - hearth) / 3)), wh = Math.round(p.ph * 0.26);
    for (let y = wy - wh; y <= wy + wh; y++) for (let x = wx - ww; x <= wx + ww; x++) {
      const frame = x === wx - ww || x === wx + ww || y === wy - wh || y === wy + wh || x === wx || y === wy;
      const flake = hash(x * 3.1 + Math.floor(y + t * 5) * 7.7, 3) > 0.93;
      p.px(x, y, c(frame ? '#b98a5a' : flake ? SNOW : mix('#0b1630', '#22386b', (y - wy + wh) / (wh * 2))));
    }
    tree(p, p.pw - wx, floor, Math.round(p.ph * 0.62), t, c, g.paint.accent, 5);
  }
  p.flush();
  return g.finish();
};

// A village asleep under snow: lit windows, chimney smoke, a steeple, and more snow on the way down.
const winterVillage: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#0c1433'), c('#3a3f75'), (y / p.ph) ** 1.4));
  starlight(p, t, p.ph * 0.55, c(SNOW), c('#111a3a'));
  const hill = (x: number, depth: number): number => p.ph * (0.62 + depth * 0.2) + Math.sin(x * 0.045 + depth * 5) * p.ph * 0.07 + Math.sin(x * 0.11 + depth * 2) * p.ph * 0.03;
  for (let x = 0; x < p.pw; x++) for (let y = Math.round(hill(x, 0)); y < p.ph; y++) p.px(x, y, c('#6f7fb0'));
  // Far firs along the back ridge.
  for (let fir = 0; fir < p.pw / 7; fir++) {
    const x = Math.round((fir + hash(fir, 1)) * 7), root = Math.round(hill(x, 0)), tall = 3 + Math.floor(hash(fir, 2) * 4);
    for (let row = 0; row < tall; row++) for (let dx = -Math.floor(row / 2); dx <= Math.floor(row / 2); dx++) p.px(x + dx, root - tall + row, row === 0 || (dx === -Math.floor(row / 2) && row % 2 === 0) ? c('#c9d6ee') : c('#1d3a3a'));
  }
  for (let x = 0; x < p.pw; x++) for (let y = Math.round(hill(x, 1)); y < p.ph; y++) p.px(x, y, mix(c(SNOW), c('#a9bbe0'), clamp((y - hill(x, 1)) / (p.ph * 0.3))));
  let x = 2, house = 0;
  while (x < p.pw - 6) {
    const church = house % 5 === 2 && p.ph >= 16;
    const wide = church ? 7 : 7 + Math.floor(hash(house, 3) * 5), tall = Math.max(3, Math.round(p.ph * (church ? 0.3 : 0.16 + 0.07 * hash(house, 4))));
    const foot = Math.round(hill(x + wide / 2, 1)) + 1, eave = foot - tall;
    const wall = c(['#7a3b33', '#8a6a48', '#5b4a6b', '#6d3f52'][house % 4]!);
    for (let dx = 0; dx < wide; dx++) {
      const ridge = eave - Math.round((wide / 2 - Math.abs(dx - (wide - 1) / 2)) * (church ? 1.5 : 0.7));
      for (let y = ridge; y < foot; y++) p.px(x + dx, y, y <= ridge + (church ? 0 : 1) ? c(SNOW) : y < eave ? c('#3b2a2e') : wall);
    }
    if (church) for (let y = eave - Math.round(wide * 0.75) - 5; y < eave - Math.round(wide * 0.75); y++) p.px(x + Math.floor(wide / 2), y, c(y < eave - Math.round(wide * 0.75) - 3 ? GOLD : '#3b2a2e'));
    for (let pane = 0; pane < (wide > 8 ? 2 : 1); pane++) {
      const lit = c(mix('#4a3515', '#ffd070', 0.6 + 0.4 * noise(t * 0.7, house * 3.3 + pane)));
      for (let wy = 0; wy < 2; wy++) for (let wx = 0; wx < 2; wx++) p.px(x + 1 + pane * 4 + wx + (wide > 8 ? 1 : Math.floor(wide / 2) - 2), eave + 1 + wy, lit);
    }
    if (!church) {
      const flue = x + wide - 3;
      for (let y = eave - 3; y < eave; y++) p.px(flue, y, y === eave - 3 ? c(SNOW) : c('#3b2a2e'));
      for (let puff = 0; puff < 7; puff++) {
        const age = fract(t * 0.16 + puff / 7 + house * 0.13);
        const py = Math.round(eave - 4 - age * p.ph * 0.36);
        if (py >= 0) p.px(Math.round(flue + age * 6 + Math.sin(age * 7 + house) * 1.5), py, mix(c('#3a3f75'), c('#c7cfe6'), 0.75 * (1 - age)));
      }
    }
    x += wide + 2 + Math.floor(hash(house, 6) * 6); house++;
  }
  snowfall(p, t, Math.round(p.pw * p.ph / 32), c(SNOW));
  p.flush();
  return g.finish();
};

// Brass bells on a bough, swinging in turn and ringing on the beat, over the words everyone is waiting for.
const sleighBells: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#2a0d14'), c('#12060a'), y / p.ph));
  const caption = p.ph >= 20;
  const lines = !caption ? [] : p.pw >= 94 ? ['MERRY CHRISTMAS'] : ['MERRY', 'CHRISTMAS'];
  const hang = Math.max(1, Math.round(p.ph * 0.1));
  // The bells hang in whatever height the greeting leaves them.
  const size = Math.max(1.5, Math.min((p.ph - hang - lines.length * 6 - 2) / 3.2, p.pw / 14));
  const bells = Math.max(1, Math.min(9, Math.floor(p.pw / (size * 3.2))));
  for (let x = 0; x < p.pw; x++) {
    const sag = hang + Math.round(Math.sin(x / p.pw * Math.PI * bells) ** 2 * 1.6) - 1;
    for (let y = Math.max(0, sag - 1); y <= sag; y++) p.px(x, y, c(hash(x, y) > 0.5 ? GREEN : PINE));
    if (hash(x, 9) > 0.86) p.px(x, sag, mix(c(RED), g.paint.accent, 0.3 * tri(t + x)));
  }
  const ring = kick(t);
  for (let bell = 0; bell < bells; bell++) {
    const px = (bell + 0.5) * p.pw / bells;
    // Neighbours swing against each other, and every beat gives the whole row a push.
    const angle = Math.sin(TAU * t + bell * Math.PI) * (0.28 + 0.22 * ring);
    const cx = px + Math.sin(angle) * size * 1.6, cy = hang + 1 + Math.cos(angle) * size * 1.6;
    stroke(p, px, hang, cx, cy - size, 0.4, c(RED));
    const ax = Math.sin(angle), ay = Math.cos(angle);
    for (let y = Math.floor(cy - size * 1.5); y <= cy + size * 1.5; y++) for (let x = Math.floor(cx - size * 1.5); x <= cx + size * 1.5; x++) {
      // Work in the bell's own frame: v runs from crown to lip, u across.
      const rx = x + 0.5 - cx, ry = y + 0.5 - cy;
      const v = (rx * ax + ry * ay) / size, u = (rx * ay - ry * ax) / size;
      const flare = v < -1 || v > 1 ? -1 : 0.34 + 0.5 * smooth((v + 1) / 2) + (v > 0.7 ? (v - 0.7) * 1.3 : 0);
      if (Math.abs(u) > flare) continue;
      const shine = clamp(0.5 - u / flare * 0.45 + (Math.abs(u / flare + 0.35) < 0.14 ? 0.5 : 0));
      p.px(x, y, mix(c('#7a5312'), mix(c(GOLD), '#ffffff', 0.25 + 0.3 * ring), shine));
    }
    const swing = Math.sin(TAU * t * 2 + bell) * size * 0.3;
    disc(p, cx + ax * size * 1.15 + ay * swing, cy + ay * size * 1.15 - ax * swing, Math.max(0.8, size * 0.24), Math.max(0.8, size * 0.24), () => c('#5c3d0c'));
    disc(p, px, hang, 1.2, 1.2, () => c(RED));
  }
  {
    lines.forEach((line, row) => {
      const left = Math.floor((p.pw - (line.length * 6 - 1)) / 2);
      write(p, line, left, p.ph - (lines.length - row) * 6, 1, letter => {
        // Each letter is struck in turn, like a peal running along the line.
        const struck = Math.exp(-(((fract(t * 0.5 - (letter + row * 5) / 15) - 0.5) * 6) ** 2));
        return mix(mix(c(RED), c(GOLD), 0.45), '#ffffff', struck * 0.8);
      });
    });
  }
  snowfall(p, t, Math.round(p.pw * p.ph / 90), c(SNOW));
  p.flush();
  return g.finish();
};

// Ten beats of counting down over a waiting city, then the year turns and the sky goes up.
const newYear: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const local = t % 24;
  const counting = local < 10;
  const sky = (y: number): string => mix(c('#05060f'), c('#1a1740'), (y / p.ph) ** 1.5);
  wash(p, y => sky(y));
  starlight(p, t, p.ph * 0.7, c(SNOW), c('#0a0b1c'));
  const sparks = [c(GOLD), c('#ff5d73'), c('#63e6ff'), c('#b0ff7a'), c('#d59bff'), g.paint.accent];
  if (!counting) {
    // A shell every seven tenths of a second: it bursts, spreads, sags and fades.
    for (let shell = Math.floor((local - 10) / 0.7); shell > Math.floor((local - 10) / 0.7) - 5; shell--) {
      if (shell < 0) continue;
      const age = local - 10 - shell * 0.7, epoch = Math.floor(t / 24) * 31 + shell;
      const bx = (0.1 + 0.8 * hash(epoch, 1)) * p.pw, by = (0.16 + 0.4 * hash(epoch, 2)) * p.ph;
      const tone = sparks[Math.floor(hash(epoch, 3) * sparks.length)]!;
      const reach = p.ph * (0.3 + 0.2 * hash(epoch, 4)) * (1 - Math.exp(-age * 2.6));
      for (let ray = 0; ray < 34; ray++) {
        const a = ray / 34 * TAU + hash(epoch, 5), spread = 0.72 + 0.28 * hash(ray, epoch);
        for (let tail = 0; tail < 4; tail++) {
          const r = reach * spread * (1 - tail * 0.07);
          const y = by + Math.sin(a) * r + age * age * p.ph * 0.05;
          p.px(Math.round(bx + Math.cos(a) * r), Math.round(y), mix(sky(y), tail ? tone : mix(tone, '#ffffff', 0.5), clamp(1.25 - age * 0.55 - tail * 0.2)));
        }
      }
    }
    for (let piece = 0; piece < p.pw * p.ph / 70; piece++) {
      const y = fract(hash(piece, 11) + (local - 10) * (0.05 + 0.07 * hash(piece, 12))) * p.ph;
      p.px(Math.floor(hash(piece, 13) * p.pw + Math.sin(t * 2 + piece) * 2), Math.floor(y), sparks[piece % sparks.length]!);
    }
  }
  // The city: flat-topped towers with their own lights on.
  let x = 0, tower = 0;
  while (x < p.pw) {
    const wide = 4 + Math.floor(hash(tower, 21) * 6), tall = Math.round(p.ph * (0.1 + 0.22 * hash(tower, 22)));
    for (let dx = 0; dx < wide; dx++) for (let y = p.ph - tall; y < p.ph; y++) {
      const pane = dx % 2 === 1 && (p.ph - y) % 2 === 0 && hash(tower * 17 + dx, y) > 0.45;
      p.px(x + dx, y, pane ? c(mix('#3a3320', '#ffd77a', counting ? 0.6 : 0.6 + 0.4 * kick(t))) : c('#0b0c18'));
    }
    x += wide + 1; tower++;
  }
  if (counting) {
    const number = String(10 - Math.floor(local));
    const scale = Math.max(1, Math.floor(Math.min(p.ph * 0.6 / 5, p.pw * 0.5 / (number.length * 6 - 1))));
    const swell = 1 - fract(local);
    const left = Math.floor((p.pw - (number.length * 6 - 1) * scale) / 2), top = Math.floor(p.ph * 0.42 - 2.5 * scale);
    // A ring closes round the number as its second runs out.
    const hoop = scale * 5.2;
    for (let i = 0; i < hoop * 7 * swell; i++) {
      const a = i / (hoop * 7) * TAU - Math.PI / 2;
      p.px(Math.round(p.pw / 2 + Math.cos(a) * hoop), Math.round(p.ph * 0.42 + Math.sin(a) * hoop), g.paint.accent);
    }
    write(p, number, left, top, scale, () => mix(c(GOLD), '#ffffff', swell * swell));
  } else {
    const lines = p.pw >= 90 ? ['HAPPY NEW YEAR'] : ['HAPPY', 'NEW YEAR'];
    const scale = Math.max(1, Math.floor(Math.min(p.pw * 0.92 / (Math.max(...lines.map(line => line.length)) * 6 - 1), p.ph * 0.36 / (lines.length * 6))));
    lines.forEach((line, row) => {
      const left = Math.floor((p.pw - (line.length * 6 - 1) * scale) / 2);
      write(p, line, left, Math.floor(p.ph * 0.4 - lines.length * 3 * scale) + row * 6 * scale, scale, (letter, lx) => {
        return mix(sparks[(letter + row * 2 + Math.floor(t * 2)) % sparks.length]!, '#ffffff', 0.55 * tri(t * 1.5 + lx * 0.03));
      });
    });
  }
  p.flush();
  return g.finish();
};

// A row of clay lamps along the threshold and a rangoli laid out ring by ring above them.
const diwali: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const lampRow = p.ph - 2;
  wash(p, y => mix(c('#0d0716'), c('#2b1206'), (y / p.ph) ** 2));
  starlight(p, t, p.ph * 0.5, c('#ffe9b0'), c('#120a1c'));
  const cy = Math.max(2, (lampRow - 6) / 2), reach = Math.max(2, Math.min(cy - 0.5, p.pw * 0.2));
  const cx = p.pw / 2, rings = clamp(Math.round(reach / 2.2), 2, 6);
  const powders = [c('#ff3f8e'), c('#ffb000'), c('#ffe24a'), c('#2fd27a'), c('#3aa0ff'), c('#b56cff'), g.paint.accent];
  const laid = 1.5 + (t * 0.4) % (rings + 4);
  disc(p, cx, cy, reach * 1.5, reach, (dx, dy) => {
    const r = Math.hypot(dx, dy) * rings, ring = Math.floor(r);
    if (ring >= laid) return undefined;
    const a = Math.atan2(dy, dx) + (ring % 2 ? 1 : -1) * t * 0.06;
    // Each ring is a row of petals; odd rings turn one way, even rings the other.
    const petals = 6 + ring * 4, lobe = Math.abs(Math.sin(a * petals / 2));
    const inside = r - ring < 0.25 + 0.75 * lobe;
    const fresh = clamp(laid - ring);
    return inside ? mix(c('#0d0716'), mix(powders[(ring * 2 + (lobe > 0.72 ? 1 : 0)) % powders.length]!, '#ffffff', 0.25 * kick(t - ring * 0.05)), fresh) : ring === 0 ? c('#fff2c2') : undefined;
  });
  const lamps = Math.max(1, Math.floor(p.pw / 9));
  for (let lamp = 0; lamp < lamps; lamp++) {
    const x = Math.round((lamp + 0.5) * p.pw / lamps);
    disc(p, x, lampRow - 3, 5, 4, (dx, dy) => mix(p.at(x + Math.round(dx * 5), lampRow - 3 + Math.round(dy * 4)) ?? c('#1a0c08'), c('#ff9a2e'), 0.3 * (1 - Math.hypot(dx, dy)) * (0.7 + 0.3 * noise(t * 4, lamp))));
    for (let dx = -3; dx <= 3; dx++) for (let dy = 0; dy < 2; dy++) if (Math.abs(dx) <= 3 - dy) p.px(x + dx, lampRow + dy, c(dy ? '#8a4a22' : '#c06a32'));
    flame(p, x, lampRow - 1, Math.max(2, Math.min(4, p.ph * 0.16)), t, lamp, c);
  }
  p.flush();
  return g.finish();
};

// Lanterns on a line, firecrackers at the gate, and a dragon dancing the length of the street.
const lunarNewYear: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#1a0508'), c('#3a0b10'), y / p.ph));
  const lanterns = Math.max(1, Math.floor(p.pw / 16));
  const body = Math.max(1.6, Math.min(p.ph * 0.13, 4));
  for (let x = 0; x < p.pw; x++) p.px(x, Math.round(1 + Math.sin(x / p.pw * Math.PI * lanterns) ** 2 * 1.4), c('#5a2a12'));
  for (let lantern = 0; lantern < lanterns; lantern++) {
    const hx = (lantern + 0.5) * p.pw / lanterns, sway = Math.sin(t * 1.1 + lantern * 1.7) * 1.2;
    const lx = hx + sway, ly = 3 + body * 1.2;
    disc(p, lx, ly, body * 2.4, body * 2, (dx, dy) => mix(p.at(Math.round(lx + dx * body * 2.4), Math.round(ly + dy * body * 2)) ?? c('#2a080c'), c('#ff6a2a'), 0.32 * (1 - Math.hypot(dx, dy))));
    stroke(p, hx, 1, lx, ly - body, 0.3, c(GOLD));
    disc(p, lx, ly, body * 1.25, body, (dx, dy) => Math.abs(dy) > 0.78 ? c(GOLD) : mix(c('#b3121f'), c('#ff5a3c'), clamp(0.9 - Math.abs(dx) * 0.9) * (0.75 + 0.25 * noise(t * 2, lantern))));
    for (let tassel = 1; tassel <= Math.round(body * 1.3); tassel++) p.px(Math.round(lx + Math.sin(t * 1.1 + lantern * 1.7 - tassel * 0.3) * 0.8), Math.round(ly + body + tassel), c(tassel === 1 ? GOLD : RED));
  }
  // The dragon: a chain of discs that follow the head through the same wave, half a beat behind each other.
  const links = Math.max(6, Math.round(p.pw / 5)), thick = Math.max(1.4, p.ph * 0.085);
  const lane = p.ph * 0.68, wave = p.ph * 0.12;
  const lead = fract(t / 18) * (p.pw + links * thick * 1.3 + 20) - 10;
  for (let link = links - 1; link >= 0; link--) {
    const x = lead - link * thick * 1.25, y = lane + Math.sin(t * 2.6 - link * 0.5) * wave * (0.5 + 0.5 * Math.min(1, link / 4));
    const girth = thick * (link === 0 ? 1.5 : 1 - link / links * 0.45);
    disc(p, x, y, girth, girth, (dx, dy) => dy < -0.45 ? c(GOLD) : (link + Math.floor((dx + 1) * 1.5)) % 2 ? c('#e0202e') : c('#ff7a1a'));
    if (link % 3 === 1) for (const leg of [-1, 1]) stroke(p, x + leg, y + girth, x + leg * 2, y + girth + thick * 0.9, 0.3, c(GOLD));
    if (link === 0) {
      p.px(Math.round(x + girth * 0.35), Math.round(y - girth * 0.2), c(SNOW));
      p.px(Math.round(x + girth * 0.35) + 1, Math.round(y - girth * 0.2), c(INK));
      for (const horn of [-1, 1]) stroke(p, x - girth * 0.2, y - girth * 0.7, x - girth * 0.9, y - girth * 1.6 + horn * 0.8, 0.3, c(GOLD));
      stroke(p, x + girth, y + girth * 0.3, x + girth * 1.9, y + girth * 0.8 + Math.sin(t * 5) * 1.2, 0.3, c(GOLD));
      disc(p, x + girth * 2.6, y - girth * 0.4 + Math.sin(t * 2.6 + 1) * 2, 1.4, 1.4, () => mix(c(GOLD), g.paint.accent, 0.5 + 0.5 * kick(t)));
    }
  }
  for (const side of [0, 1]) for (let cracker = 0; cracker < Math.min(8, p.ph / 3); cracker++) {
    const x = side ? p.pw - 3 : 2, y = 3 + cracker * 2;
    const pop = hash(cracker + side * 20, Math.floor(t * 8)) > 0.86;
    for (let dx = 0; dx < 2; dx++) p.px(x + (cracker % 2) + dx - 1, y, pop ? c('#fff1a8') : c(RED));
    if (pop) for (let spark = 0; spark < 5; spark++) p.px(x + Math.round((hash(spark, cracker + pulse) - 0.5) * 7), y + Math.round((hash(spark + 9, cracker + pulse) - 0.5) * 5), c(GOLD));
  }
  p.flush();
  return g.finish();
};

// A new crescent over domes and minarets, with lanterns hung out for the feast.
const eidNight: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const sky = (y: number): string => mix(c('#070b24'), c('#2a2f73'), (y / p.ph) ** 1.3);
  wash(p, y => sky(y));
  starlight(p, t, p.ph * 0.75, c('#fff3c4'), c('#0c1030'));
  const mx = p.pw * 0.7, my = p.ph * 0.3, mr = Math.max(2, p.ph * 0.2);
  disc(p, mx, my, mr * 1.7, mr * 1.7, (dx, dy) => mix(sky(my + dy * mr * 1.7), c(GOLD), 0.16 * (1 - Math.hypot(dx, dy))));
  disc(p, mx, my, mr, mr, (dx, dy) => Math.hypot(dx - 0.36, dy + 0.12) < 0.86 ? undefined : c('#ffe9a3'));
  const star = 0.6 + 0.4 * tri(t * 0.4);
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) p.px(Math.round(mx + mr * 0.42) + dx, Math.round(my - mr * 0.1) + dy, mix(sky(my), c('#fff7d6'), dx || dy ? star * 0.7 : 1));
  // The skyline: a low wall of houses, a dome every so often, a minaret beside each dome.
  const base = p.ph - 1, stone = c('#080a1e'), lamp = c('#ffcf6b');
  for (let x = 0; x < p.pw; x++) {
    const roof = base - Math.round(p.ph * 0.16 + 1.5 * hash(Math.floor(x / 5), 61));
    for (let y = roof; y <= base; y++) p.px(x, y, stone);
    if (x % 5 === 2 && hash(x, 62) > 0.4) p.px(x, roof + 2, mix(stone, lamp, 0.5 + 0.5 * noise(t * 0.6, x)));
  }
  for (let dome = 0; dome < Math.max(1, Math.round(p.pw / 44)); dome++) {
    const dx = (dome + 0.32 + 0.2 * hash(dome, 63)) * p.pw / Math.max(1, Math.round(p.pw / 44)), size = Math.max(2, p.ph * (0.2 + 0.06 * hash(dome, 64)));
    const foot = base - Math.round(p.ph * 0.16);
    disc(p, dx, foot, size, size * 1.15, (_, uy) => uy > 0 ? undefined : stone);
    for (let y = Math.round(foot - size * 1.15) - 3; y < foot - size * 1.15; y++) p.px(Math.round(dx), y, c(GOLD));
    for (let arch = -1; arch <= 1; arch++) for (let y = 0; y < 2; y++) p.px(Math.round(dx + arch * size * 0.5), foot + 1 + y, lamp);
    for (const side of [-1, 1]) {
      const tx = Math.round(dx + side * size * 1.45), tall = Math.round(size * 2.3);
      for (let y = foot - tall; y <= base; y++) for (let w = 0; w < 2; w++) p.px(tx + w, y, y === foot - tall + 3 ? lamp : stone);
      p.px(tx, foot - tall - 1, stone); p.px(tx, foot - tall - 2, c(GOLD));
    }
  }
  const glass = [c('#2fd27a'), c('#b56cff'), c('#ff5d73'), c('#3aa0ff'), g.paint.accent];
  const lanterns = Math.max(1, Math.floor(p.pw / 13));
  for (let lantern = 0; lantern < lanterns && p.ph >= 12; lantern++) {
    const hx = (lantern + 0.5) * p.pw / lanterns, drop = 2 + hash(lantern, 71) * p.ph * 0.2;
    if (Math.abs(hx - mx) < mr * 1.6) continue;
    const lx = Math.round(hx + Math.sin(t * 0.9 + lantern * 2.1) * 1.3), ly = Math.round(drop);
    stroke(p, hx, 0, lx, ly, 0.3, c('#8a6a2a'));
    const pane = mix(glass[lantern % glass.length]!, '#ffffff', 0.25 + 0.25 * noise(t * 2.5, lantern * 4.4));
    // A fanous: a pointed cap, coloured glass, a pointed foot.
    [[0], [-1, 0, 1], [-1, 0, 1], [-1, 0, 1], [0]].forEach((row, i) => row.forEach(dx => p.px(lx + dx, ly + i, i === 0 || i === 4 ? c(GOLD) : dx === 0 ? mix(pane, '#ffffff', 0.4) : pane)));
  }
  p.flush();
  return g.finish();
};

// Eight nights: the helper candle first, then one more light each night until the whole lamp is burning.
const menorah: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#050a24'), c('#16245c'), (y / p.ph) ** 1.4));
  starlight(p, t, p.ph, c(SNOW), c('#0a1030'));
  const cx = Math.round(p.pw / 2), base = p.ph - 1;
  const step = Math.max(2, Math.min(Math.floor(p.pw / 11), Math.round(p.ph * 0.2)));
  const cups = base - Math.round(p.ph * 0.5), wick = Math.max(1, Math.round(p.ph * 0.12));
  const brass = (y: number): string => mix(c('#8a6a1e'), c(GOLD), 0.5 + 0.5 * Math.sin(y * 0.9));
  const night = 1 + Math.floor(t / 3) % 9;
  const holding = night === 9;
  for (let x = cx - step * 2; x <= cx + step * 2; x++) for (let y = base - 1; y <= base; y++) if (y === base || Math.abs(x - cx) <= step) p.px(x, y, brass(x));
  for (let y = cups - 2; y < base - 1; y++) for (let w = -1; w <= 0; w++) p.px(cx + w, y, brass(y));
  // Four pairs of arms, each a half ring from one cup down and up to its partner.
  for (let pair = 1; pair <= 4; pair++) {
    const rx = pair * step, ry = Math.min(base - cups - 3, pair * (base - cups - 3) / 4);
    for (let i = 0; i <= rx * 4; i++) {
      const a = i / (rx * 4) * Math.PI;
      p.px(Math.round(cx + Math.cos(a) * rx), Math.round(cups + Math.sin(a) * ry), brass(i));
    }
  }
  for (let cup = -4; cup <= 4; cup++) {
    const x = cx + cup * step, top = cups - (cup === 0 ? 2 : 0);
    for (let w = -1; w <= 1; w++) p.px(x + w, top, brass(x));
    for (let y = 1; y <= wick; y++) p.px(x, top - y, c(cup === 0 ? '#ffffff' : cup % 2 ? '#7fb2ff' : '#f2f6fb'));
    // Candles are placed from the right and lit from the left: the newest light is kindled first.
    const order = cup > 0 ? 5 - cup : cup < 0 ? 4 - cup : 0;
    const lit = cup === 0 || order <= (holding ? 8 : night);
    if (!lit) continue;
    disc(p, x, top - wick - 2, step * 0.9, 3.4, (dx, dy) => mix(p.at(Math.round(x + dx * step * 0.9), Math.round(top - wick - 2 + dy * 3.4)) ?? c('#0a1030'), cup === 0 ? g.paint.accent : c('#ffb347'), 0.3 * (1 - Math.hypot(dx, dy)) ** 2));
    flame(p, x, top - wick - 1, Math.max(2, Math.min(4, p.ph * 0.14)), t, cup + 5, c);
  }
  // A dreidel either side, spinning on its point.
  if (p.pw >= step * 8 + 34 && p.ph >= 16) for (const side of [-1, 1]) {
    const dx = cx + side * (step * 4 + 12), turn = Math.abs(Math.cos(t * 4 + side)), lean = Math.sin(t * 1.3 + side) * 1.5;
    for (let y = 0; y < 8; y++) {
      const half = y < 2 ? 0.5 : y < 6 ? 3.2 * turn + 0.6 : (8 - y) * 1.3 * turn + 0.4;
      for (let w = -Math.round(half); w <= Math.round(half); w++) p.px(Math.round(dx + lean * (8 - y) / 8) + w, base - 8 + y, y < 2 ? c('#c9a227') : mix(c('#2c5bd8'), c('#8fb6ff'), clamp(0.5 + w / (half * 2 + 0.1))));
    }
  }
  p.flush();
  return g.finish();
};

// Handfuls of colour thrown into the air, hanging there and drifting into each other.
const holi: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const powders = ['#ff2f92', '#ffd400', '#00c2ff', '#3ddc5a', '#ff7a00', '#9b4dff'].map(c).concat(g.paint.accent)
    .map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
  const light = new Float32Array(p.pw * p.ph * 3);
  // Two throws a second. Each cloud leaves the ground fast, slows, spreads and thins.
  for (let throwAt = Math.floor(t * 2); throwAt > Math.floor(t * 2) - 11; throwAt--) {
    const age = t - throwAt / 2;
    const fromX = hash(throwAt, 1) * p.pw, lift = (0.35 + 0.55 * hash(throwAt, 2)) * p.ph, lean = (hash(throwAt, 3) - 0.5) * p.pw * 0.28;
    const rise = 1 - Math.exp(-age * 2.2);
    const cx = fromX + lean * rise, cy = p.ph - lift * rise + age * age * 0.25;
    const size = (2 + p.ph * 0.42 * (1 - Math.exp(-age * 1.5))) * (0.75 + 0.5 * hash(throwAt, 4));
    const strength = clamp(1.5 - age * 0.27) * (1.5 + 0.9 * hash(throwAt, 5));
    const tone = powders[(throwAt % powders.length + powders.length) % powders.length]!;
    for (let y = Math.max(0, Math.floor(cy - size)); y < Math.min(p.ph, cy + size); y++) {
      for (let x = Math.max(0, Math.floor(cx - size * 1.5)); x < Math.min(p.pw, cx + size * 1.5); x++) {
        const d = Math.hypot((x - cx) / 1.5, y - cy) / size;
        if (d >= 1) continue;
        // Powder is grainy: the cloud is solid in the middle and speckled towards its edge.
        const grain = hash(x * 3.3 + y * 7.9, throwAt);
        const dust = strength * (1 - d) ** 1.5 * (grain < 1.15 - d ? 1 : 0.15) * (0.6 + 0.4 * noise(x * 0.3, y * 0.3 - t * 0.6, throwAt));
        const at = (y * p.pw + x) * 3;
        light[at] = light[at]! + tone[0]! * dust; light[at + 1] = light[at + 1]! + tone[1]! * dust; light[at + 2] = light[at + 2]! + tone[2]! * dust;
      }
    }
  }
  const channel = (value: number): string => Math.round(clamp(value / 255) * 31).toString(32);
  const tones = new Map<string, string>();
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const at = (y * p.pw + x) * 3;
    const peak = Math.max(light[at]!, light[at + 1]!, light[at + 2]!);
    if (peak < 26) continue;
    // Overlapping clouds mix like pigment, not like light: scale back instead of burning out to white.
    const scale = peak > 255 ? 255 / peak : 1;
    const key = channel(light[at]! * scale) + channel(light[at + 1]! * scale) + channel(light[at + 2]! * scale);
    let tone = tones.get(key);
    if (!tone) tones.set(key, tone = '#' + [...key].map(digit => (parseInt(digit, 32) * 8).toString(16).padStart(2, '0')).join(''));
    p.px(x, y, tone);
  }
  p.flush();
  return g.finish();
};

export const festiveReceiverBuilders = {
  'merry-christmas': merryChristmas,
  'santa-sleigh': santaSleigh,
  'christmas-tree': christmasTree,
  fireside,
  'winter-village': winterVillage,
  'sleigh-bells': sleighBells,
  'new-year': newYear,
  diwali,
  'lunar-new-year': lunarNewYear,
  'eid-night': eidNight,
  menorah,
  holi
};

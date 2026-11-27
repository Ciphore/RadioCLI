import {buildCosmoWorldMap} from '../cosmo-world-map.js';
import {panelBackground} from '../theme.js';
import {TAU, braille, clamp, fract, grid, hash, kick, mix, mulberry, pixels, replay, seconds, smooth, tri, type Builder, type Run} from './cell-canvas.js';
const BLOCKS = ' ▁▂▃▄▅▆▇█';

// The disk optimiser: scattered blocks are read from the far end and packed against the start.
const defrag: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const status = g.h >= 6 ? 2 : 0;
  const rows = g.h - status, total = g.w * rows;
  const epoch = Math.floor(t / 44);
  const progress = Math.min(1, (t - epoch * 44) / 40);
  const used = Array.from({length: total}, (_, i) => hash(i, epoch * 3 + 1) < 0.5 + 0.3 * Math.sin(i * 0.011 + epoch));
  const frontier = Math.floor(progress * used.filter(Boolean).length);
  // Every packed block that was not already in place came from the tail.
  let borrowed = frontier - used.slice(0, frontier).filter(Boolean).length;
  let tail = total;
  while (borrowed > 0 && tail > frontier) if (used[--tail]) borrowed--;
  const packed = g.paint.accent, loose = mix(panelBackground, g.paint.fan(-0.8), 0.6), free = g.paint.ink(0.05);
  for (let i = 0; i < total; i++) {
    const x = i % g.w, y = Math.floor(i / g.w);
    if (progress < 1 && i >= frontier - 2 && i <= frontier) g.set(x, y, '■', g.paint.fan(0.9), undefined, true);
    else if (progress < 1 && i >= tail && i < tail + 3) g.set(x, y, '■', g.paint.ink(1), undefined, true);
    else g.set(x, y, '■', i < frontier ? packed : used[i] && i < tail ? loose : free);
  }
  if (status) {
    const done = Math.round(progress * g.w);
    g.write(0, g.h - 2, '█'.repeat(done), g.paint.accent);
    g.write(done, g.h - 2, '░'.repeat(g.w - done), g.paint.ink(0.2));
    g.write(0, g.h - 1, (progress < 1 ? `Defragmenting drive C:  ${Math.floor(progress * 100)}% complete` : 'Defragmentation complete.').slice(0, g.w), g.paint.ink(0.8));
  }
  return g.finish();
};

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// You won. The foundations empty themselves a card at a time, and each one bounces away leaving its whole flight behind.
const solitaire: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const interval = 1.1, cycle = 52 * interval + 6;
  const epoch = Math.floor(t / cycle), local = t - epoch * cycle;
  const face = mix(g.paint.accent, '#ffffff', 0.86);
  const inks = [mix(g.paint.accent, '#000000', 0.3), '#1c1c1c'];
  // Each card keeps a faint tint of its own, so its flight stays legible inside the pile-up.
  const papers = Array.from({length: 52}, (_, i) => mix(face, g.paint.fan(hash(i >> 2, i & 3) * 2 - 1), 0.3));
  const shadows = papers.map(paper => mix(paper, '#000000', 0.45));
  const card = (x: number, y: number, rank: number, suit: number): void => {
    const paper = papers[rank * 4 + suit]!;
    g.write(x, y, (RANKS[rank]! + '♥♠♦♣'[suit]!).padEnd(4), inks[suit % 2]!, paper);
    g.write(x, y + 1, '    ', paper, paper);
    g.write(x, y + 2, '▁▁▁▁', shadows[rank * 4 + suit]!, paper);
  };
  const pile = (suit: number): number => g.w >= 26 ? g.w - 5 * (4 - suit) - 1 : suit * 5;
  const launched = Math.min(52, Math.floor(local / interval) + 1);
  for (let suit = 0; suit < 4; suit++) {
    const top = 12 - Math.ceil((launched - suit) / 4);
    if (top >= 0) card(pile(suit), 0, top, suit);
  }
  const floor = Math.max(0, g.h - 3);
  for (let k = 0; k < launched; k++) {
    let x = pile(k % 4), y = 0, lastX = NaN, lastY = NaN;
    const vx = (hash(k, epoch + 1) < 0.5 ? -1 : 1) * (5 + 9 * hash(k, epoch + 2));
    let vy = -4 * hash(k, epoch + 3);
    for (let step = Math.floor((local - k * interval) / 0.04); step >= 0 && x > -4 && x < g.w; step--) {
      const cx = Math.round(x), cy = Math.round(y);
      if (cx !== lastX || cy !== lastY) card(lastX = cx, lastY = cy, 12 - Math.floor(k / 4), k % 4);
      vy += 26 * 0.04; x += vx * 0.04; y += vy * 0.04;
      if (y > floor) { y = floor; vy *= -0.78; }
    }
  }
  return g.finish();
};

type Maze = {size: number; wall: Uint8Array; tour: [number, number][]};
let mazeCache: Maze | undefined;

/** A perfect maze and the walk that visits all of it: depth-first out, and back along the same corridors. */
function maze(): Maze {
  if (mazeCache) return mazeCache;
  const cells = 8, size = cells * 2 + 1;
  const wall = new Uint8Array(size * size).fill(1);
  const random = mulberry(0x52414449);
  const seen = new Uint8Array(cells * cells);
  const tour: [number, number][] = [[0, 0]];
  const stack: [number, number][] = [[0, 0]];
  seen[0] = 1; wall[size + 1] = 0;
  while (stack.length) {
    const [x, y] = stack.at(-1)!;
    const open = [[1, 0], [0, 1], [-1, 0], [0, -1]].filter(([dx, dy]) => {
      const nx = x + dx!, ny = y + dy!;
      return nx >= 0 && ny >= 0 && nx < cells && ny < cells && !seen[ny * cells + nx];
    });
    if (!open.length) {
      stack.pop();
      if (stack.length) tour.push(stack.at(-1)!);
      continue;
    }
    const [dx, dy] = open[Math.floor(random() * open.length)]!;
    seen[(y + dy!) * cells + x + dx!] = 1;
    wall[(2 * y + 1 + dy!) * size + 2 * x + 1 + dx!] = 0;
    wall[(2 * (y + dy!) + 1) * size + 2 * (x + dx!) + 1] = 0;
    stack.push([x + dx!, y + dy!]);
    tour.push([x + dx!, y + dy!]);
  }
  return mazeCache = {size, wall, tour};
}

// The first-person maze: brick corridors ray-cast a column at a time, walked without ever getting lost.
const maze3d: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const {size, wall, tour} = maze();
  const legs = tour.length - 1;
  const clock = seconds(pulse) / 0.6;
  const leg = Math.floor(clock) % legs, along = fract(clock);
  const heading = (i: number): number => { const a = tour[(i + legs) % legs]!, b = tour[(i + legs) % legs + 1]!; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  let swing = heading(leg) - heading(leg - 1);
  swing -= Math.round(swing / TAU) * TAU;
  const angle = heading(leg - 1) + swing * smooth(along / 0.45);
  const from = tour[leg]!, to = tour[leg + 1]!;
  const px = 2 * (from[0] + (to[0] - from[0]) * along) + 1.5, py = 2 * (from[1] + (to[1] - from[1]) * along) + 1.5;
  const lens = clamp(0.66 * p.pw / p.ph / 1.6, 0.5, 1.2);
  const focal = p.pw / 2 / lens;
  const ceiling = g.paint.fan(0.8), ground = g.paint.fan(-0.8);
  for (let x = 0; x < p.pw; x++) {
    const pan = ((x + 0.5) / p.pw * 2 - 1) * lens;
    const rx = Math.cos(angle) - Math.sin(angle) * pan, ry = Math.sin(angle) + Math.cos(angle) * pan;
    let mx = Math.floor(px), my = Math.floor(py), side = 0;
    const stepX = rx < 0 ? -1 : 1, stepY = ry < 0 ? -1 : 1;
    const deltaX = Math.abs(1 / rx), deltaY = Math.abs(1 / ry);
    let reachX = (rx < 0 ? px - mx : mx + 1 - px) * deltaX, reachY = (ry < 0 ? py - my : my + 1 - py) * deltaY;
    for (let guard = 0; guard < 64; guard++) {
      if (reachX < reachY) { reachX += deltaX; mx += stepX; side = 0; } else { reachY += deltaY; my += stepY; side = 1; }
      if (mx < 0 || my < 0 || mx >= size || my >= size || wall[my * size + mx]) break;
    }
    const distance = Math.max(0.05, side ? reachY - deltaY : reachX - deltaX);
    const tall = focal / distance;
    const top = p.ph / 2 - tall / 2;
    const across = fract(side ? px + distance * rx : py + distance * ry);
    const lit = clamp(1.2 - distance * 0.22, 0.25, 1) * (side ? 0.7 : 1);
    for (let y = 0; y < p.ph; y++) {
      const v = (y + 0.5 - top) / tall;
      if (v < 0) p.px(x, y, mix(panelBackground, ceiling, 0.2 * (1 - (y + 0.5) / (p.ph / 2))));
      else if (v >= 1) p.px(x, y, mix(panelBackground, ground, 0.08 + 0.3 * ((y + 0.5) / (p.ph / 2) - 1)));
      else {
        const course = Math.floor(v * 4);
        const mortar = fract(v * 4) < 0.16 || fract(across * 2 + course % 2 * 0.5) < 0.07;
        p.px(x, y, g.paint.ink(lit * (mortar ? 0.3 : 0.62 + 0.14 * hash(Math.floor(across * 2 + course % 2 * 0.5) + mx * 7 + my * 13, course))));
      }
    }
  }
  p.flush();
  return g.finish();
};

type Sand = {grains: Uint8Array; random: () => number};
const sandRuns = new Map<string, Run<Sand>>();

// A falling-sand toy: wandering spouts lay down coloured strata grain by grain until the floor gives way.
const sand: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const spouts = Math.max(2, Math.round(p.pw / 22));
  const filling = Math.max(30, Math.round(p.pw * p.ph * 0.5 / spouts));
  const warm = Math.min(40, filling - 1);
  const life = filling - warm + p.ph + 2;
  const step = Math.floor(pulse);
  const tick = (state: Sand, now: number): void => {
    const cells = state.grains;
    // The spouts never stop; once the panel is full enough the floor simply stops holding.
    if (now >= filling) cells.fill(0, (p.ph - 1) * p.pw);
    for (let spout = 0; spout < spouts; spout++) {
      const x = Math.round(p.pw * (0.5 + 0.44 * Math.sin(now * 0.021 * (1 + spout * 0.37) + spout * 2.4)));
      if (x >= 0 && x < p.pw && !cells[x]) cells[x] = 1 + Math.floor(tri(now * 0.0035 + spout / spouts) * 31);
    }
    for (let y = p.ph - 2; y >= 0; y--) {
      for (let i = 0; i < p.pw; i++) {
        const x = now % 2 ? i : p.pw - 1 - i;
        const here = y * p.pw + x, grain = cells[here]!;
        if (!grain) continue;
        const below = here + p.pw;
        let target = below;
        if (cells[below]) {
          const lean = state.random() < 0.5 ? -1 : 1;
          target = x + lean >= 0 && x + lean < p.pw && !cells[below + lean] ? below + lean
            : x - lean >= 0 && x - lean < p.pw && !cells[below - lean] ? below - lean : -1;
        }
        if (target >= 0) { cells[target] = grain; cells[here] = 0; }
      }
    }
  };
  const state = replay(sandRuns, `${p.pw}x${p.ph}`, Math.floor(step / life), step % life, epoch => {
    const fresh: Sand = {grains: new Uint8Array(p.pw * p.ph), random: mulberry(epoch * 7907 + p.pw * 17 + p.ph)};
    for (let now = 0; now < warm; now++) tick(fresh, now);
    return fresh;
  }, (run, now) => tick(run, now + warm));
  for (let y = 0; y < p.ph; y++) {
    for (let x = 0; x < p.pw; x++) {
      const grain = state.grains[y * p.pw + x]!;
      if (grain) p.px(x, y, mix(g.paint.fan((grain - 1) / 31 * 2 - 1), panelBackground, 0.12 * hash(x, y)));
    }
  }
  p.flush();
  return g.finish();
};

// The bean machine: every ball takes a coin-flip at every peg, and the pile underneath turns into a bell curve anyway.
const galtonBoard: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const pegRows = clamp(Math.floor(g.h * 0.5) - 1, 1, 9);
  const pitch = (pegRows + 1) * 4 <= g.w ? 4 : 2;
  const boards = Math.max(1, Math.floor(g.w / ((pegRows + 2) * pitch + 2)));
  const binRows = Math.max(1, g.h - pegRows - 1);
  const balls = 130, interval = 0.2, drop = 0.16;
  const cycle = balls * interval + pegRows * drop + 3.5;
  let peak = 1;
  for (let i = 1; i <= pegRows / 2; i++) peak = peak * (pegRows - i + 1) / i;
  const unit = binRows * 8 / (balls * peak / 2 ** pegRows * 1.3);
  for (let board = 0; board < boards; board++) {
    const center = Math.round((board + 0.5) * g.w / boards);
    const clock = t + board * 7.3;
    const epoch = Math.floor(clock / cycle), local = clock - epoch * cycle;
    for (let r = 0; r < pegRows; r++) for (let j = 0; j <= r; j++) g.set(center + Math.round((j - r / 2) * pitch), 1 + r, '·', g.paint.ink(0.38));
    const counts = new Array<number>(pegRows + 1).fill(0);
    for (let k = 0; k < Math.min(balls, Math.floor(local / interval) + 1); k++) {
      const fallen = (local - k * interval) / drop;
      let offset = 0;
      const bounce = (r: number): number => hash(k * 31 + r, epoch * 17 + board) < 0.5 ? -1 : 1;
      for (let r = 0; r < Math.min(pegRows, Math.floor(fallen)); r++) offset += bounce(r);
      if (fallen >= pegRows + 1) counts[(offset + pegRows) / 2] = counts[(offset + pegRows) / 2]! + 1;
      else {
        const x = fallen < pegRows ? offset + bounce(Math.floor(fallen)) * fract(fallen) : offset;
        g.set(center + Math.round(x * pitch / 2), Math.min(g.h - 1, Math.floor(fallen) + (fallen < pegRows ? 0 : 1)), '●', g.paint.fan(hash(k, 3) * 2 - 1), undefined, true);
      }
    }
    const emptying = clamp(1 - (local - (cycle - 1.2)) / 1.2);
    counts.forEach((count, bin) => {
      const level = Math.min(binRows * 8, Math.round(count * unit * emptying));
      for (let row = 0; row < Math.ceil(level / 8); row++) {
        const glyph = BLOCKS[Math.min(8, level - row * 8)]!;
        for (let x = 0; x < pitch - 1; x++) g.set(center + Math.round((bin - pegRows / 2) * pitch) - Math.floor((pitch - 1) / 2) + x, g.h - 1 - row, glyph, g.paint.fan(bin / pegRows * 1.4 - 0.7));
      }
    });
  }
  return g.finish();
};

// Pins round a hoop, thread from each pin to its multiple: the multiplier creeps, and cardioids bloom and dissolve.
const stringArt: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const pins = Math.round(clamp(b.dh * 0.8, 16, 64));
  const multiplier = 2 + t * 0.045;
  const rx = Math.min(b.dw * 0.49, b.dh * 0.49 * 1.7), ry = b.dh * 0.48;
  const pin = (n: number): [number, number] => [b.dw / 2 - 0.5 + Math.cos(n / pins * TAU - Math.PI / 2) * rx, b.dh / 2 - 0.5 + Math.sin(n / pins * TAU - Math.PI / 2) * ry];
  for (let n = 0; n < pins; n++) {
    const [x0, y0] = pin(n), [x1, y1] = pin(n * multiplier);
    b.line(x0, y0, x1, y1, mix(panelBackground, g.paint.fan(tri(n / pins + t * 0.02) * 2 - 1), 0.55 + 0.45 * kick(t - n / pins * 0.5)));
  }
  for (let n = 0; n < pins * 4; n++) { const [x, y] = pin(n / 4); b.dot(x, y, g.paint.ink(0.9)); }
  b.flush();
  return g.finish();
};

const TOWERS: [number, number][] = [[35.7, 139.7], [6.5, 3.4], [-12, -77], [59.9, 10.7], [48.9, 2.3], [23.1, -82.4], [-1.3, 36.8], [64.1, -21.9], [19.1, 72.9],
  [52.5, 13.4], [37.6, 127], [4.7, -74.1], [30, 31.2], [53.3, -6.3], [-33.9, 151.2], [45.5, -73.6], [38.7, -9.1], [5.6, -0.2], [18, -76.8], [21, 105.8],
  [34, -118.2], [-23.5, -46.6], [-33.9, 18.4], [55.8, 37.6], [-36.8, 174.8]];

// The whole dial at once: a world map in daylight and darkness, with broadcasts arcing from city to city.
const shortwave: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const land = buildCosmoWorldMap(g.w, g.h);
  const sun = 180 - fract(t / 40) * 360;
  const signal = new Uint8Array(g.w * g.h);
  const tints: string[] = [];
  const masks = [[1, 8], [2, 16], [4, 32], [64, 128]];
  const live = new Map<number, number>();
  const slot = Math.floor(t / 0.7);
  for (let s = slot - 5; s <= slot; s++) {
    const from = Math.floor(hash(s, 1) * TOWERS.length), to = Math.floor(hash(s, 2) * TOWERS.length);
    if (from === to) continue;
    const head = (t - s * 0.7) / 3.2 * 1.3;
    const [lat0, lon0] = TOWERS[from]!, [lat1, lon1] = TOWERS[to]!;
    const lift = 10 + Math.abs(lon1 - lon0) * 0.12;
    const color = g.paint.fan(hash(s, 3) * 2 - 1);
    if (head < 0.35) live.set(from, 1 - head / 0.35);
    if (head > 1 && head < 1.3) live.set(to, 1);
    for (let i = 0; i <= 160; i++) {
      const u = i / 160;
      if (u > head || u < head - 0.6) continue;
      const lat = lat0 + (lat1 - lat0) * u + Math.sin(u * Math.PI) * lift, lon = lon0 + (lon1 - lon0) * u;
      const x = Math.floor((lon + 180) / 360 * g.w * 2), y = Math.floor((90 - lat) / 180 * g.h * 4);
      if (x < 0 || y < 0 || x >= g.w * 2 || y >= g.h * 4) continue;
      const cell = (y >> 2) * g.w + (x >> 1);
      signal[cell] = signal[cell]! | masks[y & 3]![x & 1]!;
      tints[cell] = mix(panelBackground, color, 0.4 + 0.6 * (1 - (head - u) / 0.6));
    }
  }
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const char = land[y]?.cells[x]?.char ?? ' ';
      const bits = (char === ' ' ? 0 : char.charCodeAt(0) - 0x2800) | signal[y * g.w + x]!;
      if (!bits) continue;
      const daylight = smooth(0.5 + Math.cos(((x + 0.5) / g.w * 360 - 180 - sun) * Math.PI / 180) * 1.5);
      g.set(x, y, String.fromCharCode(0x2800 + bits), tints[y * g.w + x] ?? g.paint.ink(0.16 + 0.26 * daylight));
    }
  }
  TOWERS.forEach(([lat, lon], index) => {
    const glow = live.get(index);
    g.set(Math.min(g.w - 1, Math.floor((lon + 180) / 360 * g.w)), Math.min(g.h - 1, Math.floor((90 - lat) / 180 * g.h)),
      glow ? '◉' : '•', glow ? g.paint.ink(1) : g.paint.ink(0.62), undefined, Boolean(glow));
  });
  return g.finish();
};

export const nostalgiaReceiverBuilders = {
  defrag,
  solitaire,
  'maze-3d': maze3d,
  sand,
  'galton-board': galtonBoard,
  'string-art': stringArt,
  shortwave
};

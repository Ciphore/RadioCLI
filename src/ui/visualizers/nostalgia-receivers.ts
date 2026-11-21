import {buildCosmoWorldMap} from '../cosmo-world-map.js';
import {panelBackground} from '../theme.js';
import {TAU, braille, clamp, fract, grid, hash, kick, mix, mulberry, pixels, seconds, textPixel, tri, type Builder} from './cell-canvas.js';

const smooth = (n: number): number => { const c = clamp(n); return c * c * (3 - 2 * c); };
const pad2 = (n: number): string => String(Math.floor(n)).padStart(2, '0');
const BLOCKS = ' ▁▂▃▄▅▆▇█';
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';

type Run<State> = {epoch: number; step: number; state: State};

/**
 * Real simulations cannot be written as a function of the pulse, so they are
 * replayed instead: each run restarts from a seed every epoch, and a frame is
 * that run advanced to the requested step. Stepping forward is one tick; a
 * jump backwards replays the epoch, which bounds the cost at one epoch.
 */
function replay<State>(runs: Map<string, Run<State>>, key: string, epoch: number, step: number, start: (epoch: number) => State, tick: (state: State, step: number) => void): State {
  let run = runs.get(key);
  if (!run || run.epoch !== epoch || run.step > step) {
    if (!run && runs.size >= 4) runs.delete(runs.keys().next().value!);
    run = {epoch, step: 0, state: start(epoch)};
    runs.set(key, run);
  }
  while (run.step < step) tick(run.state, run.step++);
  return run.state;
}

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

const NOTES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const SCALE = [0, 3, 5, 7, 10];
/** What a channel plays on a row of the module, or nothing. */
function trackerNote(channel: number, row: number): {note: string; instrument: string; effect: string} | undefined {
  const pitch = (seed: number, octave: number): string => {
    const degree = Math.floor(hash(seed, channel + 5) * 10);
    return NOTES[SCALE[degree % 5]!]! + (octave + Math.floor(degree / 5));
  };
  if (channel === 0) return row % 4 === 0 || (row % 16 === 10 && hash(row, 1) < 0.6) ? {note: 'C-2', instrument: '01', effect: 'C40'} : undefined;
  if (channel === 1) return row % 8 === 4 ? {note: 'D-2', instrument: '02', effect: '...'} : row % 16 === 15 ? {note: 'D-2', instrument: '02', effect: 'C18'} : undefined;
  if (channel === 2) return row % 2 === 0 ? {note: 'F#3', instrument: '03', effect: row % 4 === 2 ? 'C30' : 'C10'} : undefined;
  if (channel === 3) return row % 2 === 0 && hash(row, 2) < 0.8 ? {note: pitch(Math.floor(row / 8), 1), instrument: '04', effect: '...'} : undefined;
  return hash(row, channel * 3) < 0.4 ? {note: pitch(row, 3 + channel % 2), instrument: pad2(channel + 1), effect: hash(row, channel + 9) < 0.3 ? ['A0F', '4A2', '103', 'E93'][Math.floor(hash(row, channel + 11) * 4)]! : '...'} : undefined;
}

// A module tracker: the pattern scrolls up through the play row while each channel's meter kicks.
const tracker: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const channels = clamp(Math.floor((g.w - 3) / 12), 1, 8);
  const left = Math.max(0, Math.floor((g.w - (3 + channels * 12)) / 2));
  const head = g.h >= 7 ? 2 : 0;
  const lines = g.h - head, middle = Math.floor(lines / 2);
  const row = Math.floor(t / 0.125);
  const playing = mix(panelBackground, g.paint.accent, 0.28);
  if (head) {
    g.write(left, 0, `RADIOCLI.MOD  POS ${pad2(Math.floor(row / 64) % 32)}/1F  PAT ${pad2(Math.floor(row / 64) * 7 % 24)}  BPM 125`.slice(0, g.w - left), g.paint.ink(0.6));
    for (let channel = 0; channel < channels; channel++) {
      let last = row;
      while (last > row - 16 && !trackerNote(channel, last)) last--;
      const level = last > row - 16 ? Math.exp(-(t - last * 0.125) * 7) : 0;
      const lit = Math.round(level * 9);
      g.write(left + 3 + channel * 12, 1, `${channel + 1} `, g.paint.ink(0.45));
      g.write(left + 5 + channel * 12, 1, '▮'.repeat(lit), g.paint.fan(channel / Math.max(1, channels - 1) * 2 - 1));
      g.write(left + 5 + channel * 12 + lit, 1, '▯'.repeat(9 - lit), g.paint.ink(0.15));
    }
  }
  for (let y = 0; y < lines; y++) {
    const at = row + y - middle;
    const here = y === middle;
    const back = here ? playing : undefined;
    if (here) for (let x = 0; x < g.w; x++) g.set(x, head + y, ' ', g.paint.accent, playing);
    if (at < 0) continue;
    g.write(left, head + y, (at % 64).toString(16).toUpperCase().padStart(2, '0'), g.paint.ink(at % 4 === 0 ? 0.7 : 0.3), back);
    for (let channel = 0; channel < channels; channel++) {
      const x = left + 3 + channel * 12;
      const cell = trackerNote(channel, at);
      g.write(x - 1, head + y, '│', g.paint.ink(0.14), back);
      g.write(x, head + y, cell?.note ?? '---', cell ? g.paint.ink(here ? 1 : 0.85) : g.paint.ink(0.18), back);
      g.write(x + 4, head + y, cell?.instrument ?? '..', cell ? g.paint.fan(-0.6) : g.paint.ink(0.18), back);
      g.write(x + 7, head + y, cell?.effect ?? '...', cell && cell.effect !== '...' ? g.paint.fan(0.7) : g.paint.ink(0.18), back);
    }
  }
  return g.finish();
};

const LISTINGS = ['NOW PLAYING', 'WORLD DIAL', 'JAZZ AND SOUL', 'AFTER HOURS', 'NEWS ROUND-UP', 'SHIPPING FORECAST', 'LISTENER LETTERS', 'TOMORROW ON AIR'];
const spectrum = (band: number, t: number): number => clamp(
  0.5 + 0.3 * Math.sin(band * 0.61 + t * 2.3) + 0.24 * Math.sin(band * 0.23 - t * 1.5 + 1.7) + 0.18 * Math.sin(band * 1.37 + t * 3.7)
) ** 1.6 * (0.6 + 0.4 * kick(t));

// A broadcast text page: block-mosaic headline, numbered listings, and the four coloured keys along the bottom.
const teletext: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const paper = g.paint.ink(0.92);
  const hunting = fract(t / 12) < 0.12;
  const page = hunting ? 100 + Math.floor(t * 23) % 100 : 100;
  g.write(0, 0, `P${page}`, hunting ? g.paint.fan(0.7) : paper);
  if (g.w >= 30) g.write(Math.floor((g.w - 9) / 2), 0, 'RADIOTEXT', g.paint.fan(-0.7));
  const clock = `${pad2(t / 60 % 60)}:${pad2(t % 60)}`;
  if (g.w >= 16) g.write(g.w - clock.length, 0, clock, g.paint.fan(0.7));
  // Each font pixel becomes a square of quarter-cell blocks.
  const scale = g.h >= 9 && g.w >= 34 ? 2 : 1;
  const banner = g.h >= 5 ? Math.ceil(5 * scale / 2) : 0;
  const lit = (qx: number, qy: number): boolean => textPixel('RADIO', Math.floor(qx / scale) - 2, Math.floor(qy / scale));
  const band = mix(panelBackground, g.paint.fan(-0.6), 0.32);
  const headline = g.paint.fan(Math.sin(t * 0.4) * 0.5 + 0.5);
  const titleEnd = Math.min(g.w, Math.ceil((29 + 4) * scale / 2));
  for (let y = 0; y < banner; y++) {
    for (let x = 0; x < g.w; x++) {
      let bits = 0;
      if (x < titleEnd) {
        for (let q = 0; q < 4; q++) if (lit(x * 2 + (q & 1), y * 2 + (q >> 1))) bits |= 1 << q;
      } else if (x > titleEnd) {
        // Separated mosaic meters: three quarter-columns lit, one dark, measured in half rows.
        for (let q = 0; q < 4; q++) {
          const qx = (x - titleEnd - 1) * 2 + (q & 1);
          if (qx % 4 !== 3 && y * 2 + (q >> 1) >= banner * 2 - Math.round(spectrum(Math.floor(qx / 4), t) * banner * 2)) bits |= 1 << q;
        }
      }
      g.set(x, 1 + y, QUADRANTS[bits]!, x < titleEnd ? headline : g.paint.fan(0.9 - (y / Math.max(1, banner - 1)) * 0.8), x < titleEnd ? band : undefined);
    }
  }
  const first = 1 + banner + (banner && g.h >= 9 ? 1 : 0);
  const keys = g.h >= 7 ? 1 : 0;
  const chosen = Math.floor(t / 2);
  for (let y = first; y < g.h - keys; y++) {
    const index = y - first;
    const label = LISTINGS[index % LISTINGS.length]!;
    const selected = index === chosen % Math.max(1, g.h - keys - first);
    const line = `${101 + index} ${label} ${'.'.repeat(Math.max(0, Math.min(g.w, 44) - label.length - 11))} ${(88.1 + Math.floor(hash(index, 4) * 100) * 0.2).toFixed(1).padStart(5)}`.slice(0, g.w);
    if (selected) g.write(0, y, line.padEnd(Math.min(g.w, 44)), panelBackground, g.paint.accent);
    else {
      g.write(0, y, line, paper);
      g.write(0, y, line.slice(0, 3), g.paint.fan(0.7));
      g.write(line.length - 5, y, line.slice(-5), g.paint.fan(-0.7));
    }
  }
  if (keys) ['Stations', 'Favourites', 'World', 'Index'].forEach((key, i) => g.write(Math.floor(i * Math.min(g.w, 60) / 4), g.h - 1, key.slice(0, Math.max(1, Math.floor(g.w / 4) - 1)), g.paint.fan(i / 1.5 - 1)));
  return g.finish();
};

// A worn tape on pause: colour bars that will not hold still, a tracking band rolling through, and the deck's own lettering on top.
const vhs: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const tape = mix(panelBackground, g.paint.accent, 0.16);
  const frame = Math.floor(t * 12.5);
  const tracking = (1 - fract(t * 0.13)) * (g.h + 4) - 2;
  const tear = hash(Math.floor(t / 3.1), 7) > 0.6 && fract(t / 3.1) < 0.08;
  const inset = g.h >= 7 ? 2 : 0;
  const bars = [0.74, 0.62].map(strength => Array.from({length: 7}, (_, bar) => mix(tape, g.paint.fan(bar / 3 - 1), strength)));
  for (let y = 0; y < g.h; y++) {
    const rolling = Math.abs(y - tracking) < 1.3;
    const switching = g.h >= 4 && y === g.h - 1;
    const slip = Math.round(Math.sin(t * 5 + y * 0.9) * 0.6) +
      (rolling || switching ? Math.round((hash(y, frame) - 0.5) * 16) : 0) + (tear && y > g.h * 0.4 ? 5 : 0);
    for (let x = 0; x < g.w; x++) {
      const bar = Math.floor((((x - slip) % g.w + g.w) % g.w) / g.w * 7);
      const picture = y >= inset && y < g.h - inset;
      const back = picture ? bars[y % 2]![bar]! : tape;
      const snow = hash(x * 1.3 + y * 7.1, frame);
      if ((rolling || switching) && snow > (switching ? 0.72 : 0.5)) g.set(x, y, '░▒▓▁▂─'[Math.floor(snow * 97) % 6]!, g.paint.ink(0.8 + 0.2 * snow), back);
      else g.set(x, y, ' ', g.paint.accent, back);
    }
  }
  const type = g.paint.ink(1);
  const caption = (x: number, y: number, text: string): void => { for (let i = 0; i < text.length; i++) if (text[i] !== ' ') g.set(x + i, y, text[i]!, type, tape, true); };
  if (g.w >= 12) caption(1, 0, fract(t) < 0.75 ? 'PLAY ►' : 'PLAY');
  if (g.w >= 20) caption(g.w - 3, 0, 'SP');
  if (g.h >= 3 && g.w >= 12) caption(1, g.h - 1, `0:${pad2(t / 60 % 60)}:${pad2(t % 60)}`);
  if (g.h >= 3 && g.w >= 24) caption(g.w - 9, g.h - 1, 'RADIOCLI');
  return g.finish();
};

type Slime = {x: Float32Array; y: Float32Array; heading: Float32Array; trail: Float32Array; spare: Float32Array; food: number[]; random: () => number};
const slimeRuns = new Map<string, Run<Slime>>();

// Thousands of blind agents that only follow each other's scent, and end up building a transport network.
const slimeMold: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  // At this resolution the network is at its best young; it is regrown before it can ball up.
  const life = 110;
  const step = Math.floor(pulse);
  const tick = (state: Slime): void => {
    const {x: xs, y: ys, heading, trail, spare, random} = state;
    const smell = (x: number, y: number): number => x < 0 || y < 0 || x > p.pw - 1 || y > p.ph - 1 ? -0.5 : trail[Math.round(y) * p.pw + Math.round(x)]!;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!, y = ys[i]!, a = heading[i]!;
      const ahead = smell(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5);
      const port = smell(x + Math.cos(a - 0.7) * 3.5, y + Math.sin(a - 0.7) * 3.5);
      const starboard = smell(x + Math.cos(a + 0.7) * 3.5, y + Math.sin(a + 0.7) * 3.5);
      // Follow the strongest scent, but shy away from a strand that is already packed.
      let turned = ahead > 1.3 ? a + (random() - 0.5) * 2.4
        : ahead >= port && ahead >= starboard ? a + (random() - 0.5) * 0.2
          : port > starboard ? a - 0.45 : starboard > port ? a + 0.45 : a + (random() - 0.5) * 0.9;
      let nx = x + Math.cos(turned), ny = y + Math.sin(turned);
      // Walls turn an agent back towards the middle; a wrapping world only grows straight laps.
      if (nx < 0 || nx >= p.pw || ny < 0 || ny >= p.ph) {
        nx = clamp(nx, 0, p.pw - 1); ny = clamp(ny, 0, p.ph - 1);
        turned = Math.atan2(p.ph / 2 - ny, p.pw / 2 - nx) + (random() - 0.5) * 2;
      }
      xs[i] = nx; ys[i] = ny; heading[i] = turned;
      const cell = Math.round(ny) * p.pw + Math.round(nx);
      trail[cell] = Math.min(2, trail[cell]! + 0.22);
    }
    // Food never runs out; it is what keeps the network strung out instead of balling up.
    for (const cell of state.food) trail[cell] = 2;
    for (let y = 0; y < p.ph; y++) {
      const up = Math.max(0, y - 1) * p.pw, down = Math.min(p.ph - 1, y + 1) * p.pw, row = y * p.pw;
      for (let x = 0; x < p.pw; x++) {
        spare[row + x] = (trail[row + x]! * 4 + trail[row + Math.max(0, x - 1)]! + trail[row + Math.min(p.pw - 1, x + 1)]! + trail[up + x]! + trail[down + x]!) / 8 * 0.9;
      }
    }
    state.trail = spare; state.spare = trail;
  };
  const state = replay(slimeRuns, `${p.pw}x${p.ph}`, Math.floor(step / life), step % life, epoch => {
    const random = mulberry(epoch * 9973 + p.pw * 131 + p.ph);
    const count = Math.round(clamp(p.pw * p.ph * 0.2, 30, 1500));
    const fresh: Slime = {x: new Float32Array(count), y: new Float32Array(count), heading: new Float32Array(count),
      trail: new Float32Array(p.pw * p.ph), spare: new Float32Array(p.pw * p.ph), food: [], random};
    const meals = Math.round(clamp(p.pw * p.ph / 240, 3, 16));
    for (let meal = 0; meal < meals; meal++) {
      // One meal per column band, so the network has to span the panel.
      const x = Math.floor((meal + 0.15 + random() * 0.7) * p.pw / meals), y = Math.floor((0.12 + random() * 0.76) * p.ph);
      fresh.food.push(y * p.pw + x);
    }
    for (let i = 0; i < count; i++) {
      fresh.x[i] = random() * (p.pw - 1); fresh.y[i] = random() * (p.ph - 1);
      fresh.heading[i] = random() * TAU;
    }
    for (let warm = 0; warm < 14; warm++) tick(fresh);
    return fresh;
  }, tick);
  const fade = Math.min(1, 0.4 + 0.6 * (life - step % life) / 16);
  const meal = g.paint.fan(0.85);
  const hot = Array.from({length: 9}, (_, i) => mix(g.paint.accent, g.paint.fan(0.8), i / 8));
  for (let y = 0; y < p.ph; y++) {
    for (let x = 0; x < p.pw; x++) {
      const scent = state.trail[y * p.pw + x]! * fade;
      if (scent > 0.22) p.px(x, y, scent > 1.3 ? hot[Math.round(clamp(scent - 1.3) * 8)]! : g.paint.ink(clamp(scent * 0.55) * 0.75));
    }
  }
  for (const cell of state.food) p.px(cell % p.pw, Math.floor(cell / p.pw), mix(panelBackground, meal, fade));
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

// An endless lead sheet sliding under a reading line; notes ring as they cross it.
const sheetMusic: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const gap = g.h >= 11 ? 2 : 1;
  const tall = 4 * gap + 1;
  const staves = g.h >= 24 ? 2 : 1;
  const top = Math.max(0, Math.floor((g.h - (staves * tall + (staves - 1) * 3)) / 2));
  const reading = Math.min(6, Math.floor(g.w / 4));
  const first = Math.floor(t / 0.25) - Math.ceil(reading / 2) - 1;
  for (let staff = 0; staff < staves; staff++) {
    const base = top + staff * (tall + 3) + tall - 1;
    for (let line = 0; line < 5; line++) for (let x = 0; x < g.w; x++) g.set(x, base - line * gap, '─', g.paint.ink(0.26));
    for (let j = first; j < first + Math.ceil(g.w / 2) + 4; j++) {
      const x = reading + Math.round((j * 0.25 - t) * 8);
      if (j % 8 === 0) for (let y = base - tall + 1; y <= base; y++) g.set(x - 1, y, '│', g.paint.ink(0.34));
      const voice = staff * 50;
      const sounding = staff ? j % 2 === 0 && hash(j, voice + 2) < 0.85 : hash(j, 2) < 0.74;
      if (!sounding) continue;
      const degree = Math.round(clamp(4 + Math.sin(j * (staff ? 0.19 : 0.37)) * 3.4 + (hash(j, voice + 1) - 0.5) * 3, -1, 9));
      const y = base - Math.round(degree * gap / 2);
      const glyph = staff ? '♩' : j % 2 === 0 && hash(j, 5) < 0.35 ? '♫' : hash(j, 6) < 0.5 ? '♪' : '♩';
      if (x === reading) g.set(x, y, glyph, g.paint.ink(1), g.paint.accent, true);
      else g.set(x, y, glyph, x < reading ? g.paint.ink(0.36) : g.paint.fan(degree / 4.5 - 1), undefined, x > reading);
    }
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
  tracker,
  teletext,
  vhs,
  'slime-mold': slimeMold,
  sand,
  'galton-board': galtonBoard,
  'sheet-music': sheetMusic,
  'string-art': stringArt,
  shortwave
};

import {panelBackground} from '../theme.js';
import {TAU, braille, clamp, fract, grid, hash, kick, mix, mulberry, pixels, seconds, textPixel, tri, type Builder, type Rgb} from './cell-canvas.js';

// Box-drawing plumbing that grows until the panel is full, then starts over.
const pipes: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const cycle = Math.max(24, Math.round(g.w * g.h * 0.55));
  const step = Math.floor(pulse) * 2;
  const epoch = Math.floor(step / (cycle + 36 - Math.round(cycle * 0.12)));
  // Each run opens with some plumbing already laid, so the panel is never bare.
  const grown = Math.min(cycle, Math.round(cycle * 0.12) + step % (cycle + 36 - Math.round(cycle * 0.12)));
  const random = mulberry(epoch * 7919 + g.w * 131 + g.h);
  const dx = [1, 0, -1, 0], dy = [0, 1, 0, -1];
  const joints: Record<string, string> = {'02': '━', '13': '┃', '01': '┏', '12': '┓', '03': '┗', '23': '┛'};
  const outside = (x: number, y: number): boolean => x < 0 || x >= g.w || y < 0 || y >= g.h;
  let x = 0, y = 0, heading = 0, remaining = 0, color = '', count = 0;
  for (let i = 0; i < grown; i++) {
    if (remaining <= 0) {
      x = Math.floor(random() * g.w); y = Math.floor(random() * g.h); heading = Math.floor(random() * 4);
      remaining = 12 + Math.floor(random() * (g.w + g.h));
      color = g.paint.fan(tri(count++ * 0.31 + epoch * 0.17) * 2 - 1);
    }
    const turn = random();
    let next = turn < 0.12 ? (heading + 1) % 4 : turn < 0.24 ? (heading + 3) % 4 : heading;
    for (let tries = 0; tries < 4 && outside(x + dx[next]!, y + dy[next]!); tries++) next = (next + 1) % 4;
    const from = (heading + 2) % 4;
    g.set(x, y, joints[`${Math.min(from, next)}${Math.max(from, next)}`] ?? (next % 2 ? '┃' : '━'), color, undefined, true);
    if (outside(x + dx[next]!, y + dy[next]!)) { remaining = 0; continue; }
    x += dx[next]!; y += dy[next]!; heading = next; remaining--;
  }
  if (grown > 0 && grown < cycle) g.set(x, y, '●', g.paint.ink(1), undefined, true);
  return g.finish();
};

// Two wandering quadrilaterals dragging their recent past behind them.
const mystify: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  for (let shape = 0; shape < 2; shape++) {
    const color = g.paint.fan((shape ? 0.6 : -0.6) + Math.sin(t * 0.2 + shape) * 0.35);
    for (let k = 3; k >= 0; k--) {
      const tk = t - k * 0.3;
      const corners = Array.from({length: 4}, (_, v) => {
        const id = shape * 4 + v;
        return [tri(tk * (0.11 + 0.04 * hash(id, 1)) + hash(id, 2)) * (b.dw - 1), tri(tk * (0.13 + 0.05 * hash(id, 3)) + hash(id, 4)) * (b.dh - 1)] as const;
      });
      const shade = mix(panelBackground, color, (1 - k / 4) ** 1.3);
      corners.forEach((corner, v) => b.line(corner[0], corner[1], corners[(v + 1) % 4]![0], corners[(v + 1) % 4]![1], shade));
    }
  }
  b.flush();
  return g.finish();
};

const FLAPS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-';
const CITIES = ['TOKYO', 'LAGOS', 'LIMA', 'OSLO', 'PARIS', 'HAVANA', 'NAIROBI', 'REYKJAVIK', 'MUMBAI', 'BERLIN', 'SEOUL', 'BOGOTA', 'CAIRO', 'DUBLIN', 'SYDNEY', 'MONTREAL', 'LISBON', 'ACCRA', 'KINGSTON', 'HANOI'];
const GENRES = ['JAZZ', 'SOUL', 'HIGHLIFE', 'CUMBIA', 'AMBIENT', 'TECHNO', 'FADO', 'BOSSA', 'DUB', 'RAGA', 'FUNK', 'NEWS', 'K-POP', 'AFROBEAT', 'BAROQUE', 'INDIE'];
const flapLine = (id: number, epoch: number): string => {
  const seed = id * 13 + epoch * 7;
  const city = CITIES[Math.floor(hash(seed, 1) * CITIES.length)]!;
  const dial = (88.1 + Math.floor(hash(seed, 2) * 100) * 0.2).toFixed(1);
  return `${city.padEnd(10)}${dial.padStart(5)} ${GENRES[Math.floor(hash(seed, 3) * GENRES.length)]!}`;
};

// A departures board for the dial: each row clatters through the alphabet to its next station.
const splitFlap: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const board = Math.min(g.w, 26);
  const columns = Math.max(1, Math.floor((g.w + 3) / (board + 3)));
  const left = Math.floor((g.w - (columns * (board + 3) - 3)) / 2);
  const pitch = g.h >= 9 ? 2 : 1;
  const rows = Math.ceil(g.h / pitch);
  const top = Math.floor((g.h - ((rows - 1) * pitch + 1)) / 2);
  const tile = mix(panelBackground, g.paint.accent, 0.12);
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const id = column * 100 + row;
      const clock = t + id * 0.37 + 40;
      const epoch = Math.floor(clock / 5);
      const elapsed = clock - epoch * 5;
      const from = flapLine(id, epoch - 1), to = flapLine(id, epoch);
      for (let c = 0; c < board; c++) {
        const start = Math.max(0, FLAPS.indexOf(from[c] ?? ' ')), end = Math.max(0, FLAPS.indexOf(to[c] ?? ' '));
        const needed = (end - start + FLAPS.length) % FLAPS.length;
        const done = clamp(Math.floor((elapsed - c * 0.04) * 16), 0, needed);
        const moving = done < needed;
        g.set(left + column * (board + 3) + c, top + row * pitch, FLAPS[(start + done) % FLAPS.length]!,
          moving ? g.paint.accent : g.paint.ink(0.95), moving ? mix(panelBackground, g.paint.accent, 0.24) : tile, !moving);
      }
    }
  }
  return g.finish();
};

const SCROLL = '   RADIOCLI  ***  TUNE IN, TURN UP  ***  GREETINGS TO EVERY LISTENER ACROSS THE DIAL  ***  STAY TUNED ...';

// A cracktro greeting: fat pixel letters riding a sine wave over raster bars.
const sineScroller: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const scale = Math.max(1, Math.floor(p.ph * 0.45 / 5));
  const swing = Math.max(0, (p.ph - 5 * scale) / 2 - 1);
  for (let y = 0; y < p.ph; y++) {
    const bar = mix(panelBackground, g.paint.accent, 0.03 + 0.13 * (0.5 + 0.5 * Math.sin(y * 0.55 - t * 1.6)) ** 2);
    for (let x = 0; x < p.pw; x++) p.px(x, y, bar);
  }
  const shadow = mix(panelBackground, '#000000', 0.6);
  for (const pass of [1, 0]) {
    for (let x = 0; x < p.pw; x++) {
      const top = Math.round(p.ph / 2 - 2.5 * scale + Math.sin(x * 0.045 / Math.sqrt(scale) + t * 2.4) * swing);
      const fx = Math.floor((x + t * 14 * scale) / scale) % (SCROLL.length * 6);
      for (let fy = 0; fy < 5; fy++) {
        if (!textPixel(SCROLL, fx, fy)) continue;
        for (let sy = 0; sy < scale; sy++) {
          const y = top + fy * scale + sy;
          p.px(x + pass, y + pass, pass ? shadow : g.paint.fan(tri(y / p.ph + t * 0.25) * 2 - 1));
        }
      }
    }
  }
  p.flush();
  return g.finish();
};

// The idle logo that never quite hits the corner, changing colour off every wall.
const bounce: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const label = p.pw >= 44 && p.ph >= 14 ? 'RADIO' : p.pw >= 16 && p.ph >= 6 ? 'FM' : '*';
  const disc = p.ph >= 12;
  const sw = label.length * 6 - 1, sh = disc ? 9 : 5;
  const rangeX = Math.max(0, p.pw - sw), rangeY = Math.max(0, p.ph - sh);
  const fold = (distance: number, range: number): number => range ? Math.round(range - Math.abs(distance % (2 * range) - range)) : 0;
  {
    const travelX = t * 9 + 3, travelY = t * 5.5 + 2;
    const hits = (rangeX ? Math.floor(travelX / rangeX) : 0) + (rangeY ? Math.floor(travelY / rangeY) : 0);
    const color = g.paint.fan(hash(hits, 5) * 2 - 1);
    const left = fold(travelX, rangeX), top = fold(travelY, rangeY);
    for (let y = 0; y < 5; y++) for (let x = 0; x < sw; x++) if (textPixel(label, x, y)) p.px(left + x, top + y, color);
    for (let y = 0; y < 3 && disc; y++) {
      for (let x = y === 1 ? 0 : 3; x < (y === 1 ? sw : sw - 3); x++) {
        if (y !== 1 || Math.abs(x - (sw - 1) / 2) > 2.5) p.px(left + x, top + 6 + y, color);
      }
    }
  }
  p.flush();
  return g.finish();
};

const PHI = (1 + Math.sqrt(5)) / 2;
const FACETS: Rgb[] = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1]]
  .map(([x, y, z]) => { const n = Math.hypot(x!, y!, z!); return [x! / n, y! / n, z! / n] as Rgb; });
const RAMP = '.:-=+*#%@';

// A cut stone turning under one lamp, shaded the way ASCII art always was: by how much ink a letter uses.
const gem: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (hash(x, y) > 0.975) g.set(x, y, '·', g.paint.ink(0.15 + 0.35 * tri(t * 0.3 + hash(x, y + 7))));
    }
  }
  const stones = [{at: g.w / 2, size: 0.72, phase: 0}];
  if (g.w / g.h >= 5) stones.push({at: g.w * 0.17, size: 0.44, phase: 2.1}, {at: g.w * 0.83, size: 0.44, phase: 4.3});
  for (const stone of stones) {
    const a = t * 0.6 + stone.phase, b = t * 0.37 + stone.phase * 1.7;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    // World to object: undo the X tilt, then the Y spin.
    const local = (x: number, y: number, z: number): Rgb => {
      const y1 = y * cb + z * sb, z1 = z * cb - y * sb;
      return [x * ca - z1 * sa, y1, x * sa + z1 * ca];
    };
    const ray = local(0, 0, 1), lamp = local(-0.45, -0.7, -0.55);
    const size = stone.size * (1 + 0.04 * kick(t));
    const reach = Math.ceil(g.h * 1.8 * stone.size);
    for (let y = 0; y < g.h; y++) {
      for (let x = Math.max(0, Math.floor(stone.at - reach)); x < Math.min(g.w, Math.ceil(stone.at + reach)); x++) {
        const origin = local((x + 0.5 - stone.at) / g.h, (y + 0.5 - g.h / 2) / (g.h / 2), -5);
        let enter = -Infinity, exit = Infinity, face = FACETS[0]!;
        for (const n of FACETS) {
          const along = n[0] * ray[0] + n[1] * ray[1] + n[2] * ray[2];
          const distance = (size - (n[0] * origin[0] + n[1] * origin[1] + n[2] * origin[2])) / along;
          if (along < 0) { if (distance > enter) { enter = distance; face = n; } }
          else if (distance < exit) exit = distance;
        }
        if (enter >= exit) continue;
        const lit = clamp(0.12 + 0.95 * Math.max(0, face[0] * lamp[0] + face[1] * lamp[1] + face[2] * lamp[2]));
        g.set(x, y, RAMP[Math.round(lit * (RAMP.length - 1))]!, g.paint.ink(0.3 + 0.7 * lit), undefined, lit > 0.8);
      }
    }
  }
  return g.finish();
};

const EIGHTHS = ' ▏▎▍▌▋▊▉█';

// Notes sliding towards a keyboard on eighth-cell steps, so the roll moves smoothly rather than a column at a time.
const pianoRoll: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const keys = g.w >= 12 ? 2 : 0;
  const slot = 0.25, speed = 10;
  const sharps = Array.from({length: g.h}, (_, lane) => [1, 3, 6, 8, 10].includes(lane % 12));
  const sharpColor = mix(panelBackground, g.paint.accent, 0.07);
  const dark = (lane: number): boolean => sharps[lane] === true;
  const laneColor = (lane: number): string => sharps[lane] ? sharpColor : panelBackground;
  const struck = new Set<number>();
  for (let lane = 0; lane < g.h; lane++) {
    if (dark(lane)) for (let x = keys; x < g.w; x++) g.set(x, lane, ' ', g.paint.accent, laneColor(lane));
  }
  const first = Math.floor(t / slot) - 4;
  for (let x = keys; x < g.w; x++) {
    const beat = (x - keys) / speed / slot + t / slot;
    if (Math.abs(beat - Math.round(beat / 8) * 8) < 0.5 / (speed * slot)) for (let lane = 0; lane < g.h; lane++) g.set(x, lane, '│', g.paint.ink(0.12), laneColor(lane));
  }
  for (let j = first; j < first + Math.ceil(g.w / (speed * slot)) + 6; j++) {
    const notes: [number, number][] = [];
    if (hash(j, 2) < 0.72) notes.push([Math.round(clamp(g.h / 2 + Math.sin(j * 0.41) * g.h * 0.3 + (hash(j, 1) - 0.5) * g.h * 0.3, 0, g.h - 1)), hash(j, 3) < 0.25 ? 2 : 1]);
    if (j % 4 === 0) notes.push([g.h - 1 - Math.floor(j / 16) % 2, 3]);
    if ((j % 8 + 8) % 8 === 4) for (let n = 0; n < 3; n++) notes.push([Math.floor(hash(Math.floor(j / 8), 4) * 3) + n * 2, 2]);
    for (const [lane, length] of notes) {
      if (lane < 0 || lane >= g.h) continue;
      const start = keys + (j * slot - t) * speed, end = start + length * slot * speed - 0.4;
      if (start <= keys && end > keys) struck.add(lane);
      const color = g.paint.fan(lane / Math.max(1, g.h - 1) * 2 - 1);
      for (let x = Math.max(keys, Math.floor(start)); x < Math.min(g.w, Math.ceil(end)); x++) {
        const from = Math.max(start, keys, x), to = Math.min(end, x + 1);
        if (from <= x && to >= x + 1) g.set(x, lane, ' ', color, color);
        else if (from <= x) { const n = Math.round((to - x) * 8); if (n) g.set(x, lane, EIGHTHS[n]!, color, laneColor(lane)); }
        else { const n = Math.round((from - x) * 8); if (n < 8) g.set(x, lane, EIGHTHS[n]!, laneColor(lane), color); }
      }
    }
  }
  for (let lane = 0; lane < g.h && keys; lane++) {
    const key = struck.has(lane) ? g.paint.ink(1) : dark(lane) ? g.paint.ink(0.1) : g.paint.ink(0.62);
    g.set(0, lane, ' ', key, key);
    g.set(1, lane, dark(lane) && !struck.has(lane) ? '▏' : ' ', g.paint.ink(0.62), key);
  }
  return g.finish();
};

// Folded paper: each cell is one triangle, and the creases keep changing their minds.
const quilt: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const u = (x + 0.5 - g.w / 2) / g.h, v = (y + 0.5 - g.h / 2) / (g.h / 2);
      const fold = Math.sin(u * 2.2 + t * 0.5) + Math.cos(v * 2.6 - t * 0.4) + Math.sin((u + v) * 1.7 + t * 0.3);
      const facing = (Math.floor(fract(fold * 0.5 + t * 0.05) * 4) + ((x + y) & 1) * 2) % 4;
      const front = 0.5 + 0.5 * Math.sin(fold * 2 + t * 0.8), back = 0.5 + 0.5 * Math.cos(fold * 1.3 - t * 0.6 + Math.hypot(u, v) * 2);
      g.set(x, y, '◢◣◤◥'[facing]!, g.paint.ink(0.3 + 0.6 * front), g.paint.ink(0.04 + 0.4 * back));
    }
  }
  return g.finish();
};

// Three gimbal rings, each turning inside the last, around a spinning rotor.
const gyroscope: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const radius = b.dh * 0.47;
  const stretch = clamp(b.dw / b.dh / 1.5, 1, 1.4);
  type Turn = (p: Rgb) => Rgb;
  const aboutX = (a: number): Turn => { const c = Math.cos(a), s = Math.sin(a); return ([x, y, z]) => [x, y * c - z * s, y * s + z * c]; };
  const aboutY = (a: number): Turn => { const c = Math.cos(a), s = Math.sin(a); return ([x, y, z]) => [x * c + z * s, y, z * c - x * s]; };
  const shades = new Map<number, string[]>();
  const shade = (tint: number, depth: number): string => {
    let ramp = shades.get(tint);
    if (!ramp) shades.set(tint, ramp = Array.from({length: 8}, (_, i) => mix(panelBackground, g.paint.fan(tint), 0.4 + 0.6 * i / 7)));
    return ramp[Math.round(clamp((depth + 1) / 2) * 7)]!;
  };
  // Innermost turn first: each ring inherits every turn outside it.
  const turns: Turn[] = [aboutX(0.35), aboutY(t * 0.5), aboutX(t * 0.9), aboutY(t * 1.3), aboutX(t * 1.7 + kick(t) * 0.3)];
  const plot = (point: Rgb, depth: number, tint: number): void => {
    let p = point;
    for (let i = depth; i >= 0; i--) p = turns[i]!(p);
    const lens = 3.2 / (3.2 - p[2]);
    b.dot(b.dw / 2 - 0.5 + p[0] * lens * radius * stretch, b.dh / 2 - 0.5 + p[1] * lens * radius, shade(tint, p[2]));
  };
  const count = Math.max(24, Math.round(radius * 9));
  for (let ring = 0; ring < 3; ring++) {
    const size = 0.92 - ring * 0.21;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU;
      for (const rim of [size, size * 0.95]) plot(ring % 2 ? [0, Math.cos(a) * rim, Math.sin(a) * rim] : [Math.cos(a) * rim, Math.sin(a) * rim, 0], ring + 2, ring * 0.6 - 0.6);
    }
  }
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU + t * 9;
    for (const spoke of [0.12, 0.24, 0.36]) plot([Math.cos(a) * spoke, 0, Math.sin(a) * spoke], 4, 0.9);
    plot([0, (i / count * 2 - 1) * 0.5, 0], 4, 0.9);
  }
  b.flush();
  return g.finish();
};

const ARROWS = '→↘↓↙←↖↑↗';

// A weather chart of needles that swing to follow two drifting pressure systems.
const windMap: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const pressure = (u: number, v: number): number =>
    Math.sin(u * 1.7 + t * 0.3) * Math.cos(v * 2.1 - t * 0.25) + 0.5 * Math.sin(u * 3.1 - v * 2.3 + t * 0.4);
  for (let y = 0; y < g.h; y++) {
    for (let x = y % 2; x < g.w; x += 2) {
      const u = (x + 0.5 - g.w / 2) / g.h, v = (y + 0.5 - g.h / 2) / (g.h / 2);
      const windX = (pressure(u, v + 0.01) - pressure(u, v - 0.01)) / 0.02, windY = -(pressure(u + 0.01, v) - pressure(u - 0.01, v)) / 0.02;
      const force = clamp(Math.hypot(windX, windY) / 2.6);
      const gust = 0.5 + 0.5 * Math.sin(pressure(u, v) * 7 - t * 3);
      const level = 0.12 + 0.88 * force * (0.55 + 0.45 * gust);
      if (force < 0.12) g.set(x, y, '·', g.paint.ink(0.2));
      else g.set(x, y, ARROWS[(Math.round(Math.atan2(windY, windX) / (TAU / 8)) + 8) % 8]!, level > 0.8 ? g.paint.fan(0.7) : g.paint.ink(level), undefined, level > 0.8);
    }
  }
  return g.finish();
};

const FISH: [string, string][] = [['><>', '<><'], ["><(('>", "<'))><"], ['><(((*>', '<*)))><'], ['>=>', '<=<'], ["}><{{{'>", "<'}}}><{"]];

// The terminal aquarium: typed fish, typed weed, and bubbles that are just the letter o.
const aquarium: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  for (let x = 0; x < g.w; x++) {
    g.set(x, 0, Math.sin(x * 0.6 + t * 1.8) + Math.sin(x * 0.23 - t) > 0.5 ? '^' : '~', g.paint.ink(0.45));
    if (g.h > 3) g.set(x, g.h - 1, hash(x, 9) > 0.7 ? '.' : '_', g.paint.ink(0.3));
  }
  for (let weed = 0; weed < Math.floor(g.w / 9); weed++) {
    const x = Math.floor((weed + hash(weed, 11)) * 9);
    const tall = 1 + Math.floor(hash(weed, 12) * Math.max(1, g.h * 0.45));
    for (let n = 0; n < tall; n++) g.set(x, g.h - 2 - n, Math.sin(t * 1.3 + n * 0.9 + weed) > 0 ? ')' : '(', g.paint.fan(-0.75 + 0.2 * hash(weed, 13)));
  }
  for (let bubble = 0; bubble < Math.max(2, Math.floor(g.w / 7)); bubble++) {
    const rise = fract(t * (0.07 + 0.06 * hash(bubble, 21)) + hash(bubble, 22));
    const y = Math.round((1 - rise) * (g.h - 2)) + 1;
    const x = Math.round(hash(bubble, 23) * (g.w - 1) + Math.sin(t * 2 + bubble) * 0.8);
    if (y > 0 && y < g.h - 1) g.set(x, y, rise > 0.7 ? 'O' : rise > 0.35 ? 'o' : '.', g.paint.ink(0.35 + 0.4 * rise));
  }
  for (let fish = 0; fish < Math.max(2, Math.round(g.w * g.h / 150)); fish++) {
    const shape = FISH[Math.floor(hash(fish, 31) * FISH.length)]!;
    const right = hash(fish, 32) > 0.5;
    const body = shape[right ? 0 : 1];
    const lap = g.w + body.length + 6;
    const swum = fract(t * (2 + 5 * hash(fish, 33)) / lap + hash(fish, 34)) * lap;
    const x = Math.round(right ? swum - body.length : g.w - swum);
    const y = Math.max(1, 1 + Math.round(hash(fish, 35) * Math.max(0, g.h - 4) + Math.sin(t * 0.7 + fish * 1.9) * 0.6));
    g.write(x, Math.min(y, Math.max(0, g.h - 2)), body, g.paint.fan(hash(fish, 36) * 2 - 1));
  }
  return g.finish();
};

// Extruded lettering swinging on its axis, with shade blocks standing in for the lit and unlit sides.
const spinText: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const label = g.w >= 56 ? 'RADIO' : g.w >= 14 ? 'FM' : '*';
  const wide = label.length * 6 - 1;
  const scale = Math.max(0.2, Math.min(g.w * 0.92 / (wide * 2), g.h * 0.8 / 5));
  const swing = Math.sin(t * 0.9) * 0.9;
  const cs = Math.cos(swing), ss = Math.sin(swing);
  const depth = 0.8, steps = 14;
  for (let y = 0; y < g.h; y++) {
    const fy = Math.floor((y + 0.5 - g.h / 2) / scale + 2.5);
    for (let x = 0; x < g.w; x++) {
      const sx = (x + 0.5 - g.w / 2) / (2 * scale);
      // Walk the ray only through the slab the letters occupy, nearest face first.
      const near = (-depth - sx * ss) / cs, far = (depth - sx * ss) / cs;
      for (let i = 0; i < steps; i++) {
        const fx = sx * cs - (near + (far - near) * i / (steps - 1)) * ss + wide / 2;
        if (!textPixel(label, Math.floor(fx), fy)) continue;
        if (i === 0) g.set(x, y, '█', g.paint.ink(0.66 + 0.34 * (0.5 + 0.5 * Math.sin(fx * 0.5 - t * 2.2))));
        else g.set(x, y, i < steps / 2 ? '▓' : '▒', g.paint.ink(0.42 - 0.2 * i / steps));
        break;
      }
    }
  }
  return g.finish();
};

export const screensaverReceiverBuilders = {
  pipes,
  mystify,
  'split-flap': splitFlap,
  'sine-scroller': sineScroller,
  bounce,
  gem,
  'piano-roll': pianoRoll,
  quilt,
  gyroscope,
  'wind-map': windMap,
  aquarium,
  'spin-text': spinText
};

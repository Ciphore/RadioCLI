import {panelBackground} from '../theme.js';
import {TAU, braille, clamp, fract, grid, hash, kick, mix, mulberry, noise, pixels, replay, seconds, smooth, tri, type Builder, type Run} from './cell-canvas.js';

// A gas pipe with a speaker at one end: the standing wave inside decides how tall each flame burns.
const rubensTube: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const pipe = Math.max(1, p.ph - 3);
  const tallest = Math.max(1, pipe - 1);
  const frame = Math.floor(t * 12.5);
  // The pipe resonates in one mode, then slides to the next.
  const stage = t / 6, mode = 2 + Math.floor(stage) % 4, slide = smooth(fract(stage) * 4 - 3);
  const drive = 0.78 + 0.22 * kick(t);
  const base = g.paint.fan(-0.85), body = g.paint.accent, tip = mix(g.paint.fan(0.7), '#ffffff', 0.55);
  for (let x = 3; x < p.pw - 1; x += 2) {
    const along = (x - 3) / Math.max(1, p.pw - 4);
    const pressure = Math.abs(Math.sin(Math.PI * mode * along) * (1 - slide) + Math.sin(Math.PI * (mode + 1) * along) * slide);
    const flame = tallest * (0.12 + 0.88 * pressure * drive) * (0.95 + 0.05 * hash(x, frame));
    for (let rise = 0; rise < flame; rise++) {
      const up = rise / flame;
      const lean = up > 0.7 ? Math.round(Math.sin(t * 9 + x * 1.3) * 0.7) : 0;
      p.px(x + lean, pipe - 1 - rise, up < 0.22 ? base : up < 0.68 ? mix(base, body, (up - 0.22) / 0.2) : mix(body, tip, (up - 0.68) / 0.32));
    }
  }
  for (let x = 0; x < p.pw; x++) { p.px(x, pipe, g.paint.ink(0.62)); p.px(x, pipe + 1, g.paint.ink(0.3)); }
  // The speaker: a box on the left end whose cone jumps with the beat.
  for (let y = Math.max(0, pipe - 2); y < Math.min(p.ph, pipe + 3); y++) for (let x = 0; x < 2 + Math.round(kick(t)); x++) p.px(x, y, g.paint.ink(0.85));
  p.flush();
  return g.finish();
};

// What sound is: the air itself, bunching up and thinning out in rings that leave a speaker.
const soundField: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const middle = (g.h - 1) / 2;
  const loud = 0.6 + 0.4 * kick(t);
  for (let row = 0; row < g.h; row++) {
    for (let column = row % 2 + 3; column < g.w + 2; column += 2) {
      // Each particle only rocks about its own resting place; the pattern is what travels.
      const dx = column + 2, dy = (row - middle) * 2;
      const r = Math.hypot(dx, dy);
      const wave = r * TAU / 15 - t * TAU * 1.1;
      const push = 1.7 * loud * Math.sin(wave) * Math.min(1, 26 / (r + 8)) + 0.5 * Math.sin(wave * 2.3 + 1);
      const packed = -Math.cos(wave);
      const x = Math.round(column + push * dx / r), y = Math.round(row + push * dy / r / 2);
      if (x < 3) continue;
      if (packed > 0.35) g.set(x, y, '●', mix(g.paint.accent, '#ffffff', 0.35 * (packed - 0.35)), undefined, true);
      else if (packed > -0.3) g.set(x, y, '•', g.paint.ink(0.55));
      else g.set(x, y, '·', g.paint.ink(0.28));
    }
  }
  const cone = Math.round(kick(t));
  for (let y = Math.max(0, Math.round(middle - 2)); y <= Math.min(g.h - 1, Math.round(middle + 2)); y++) {
    g.set(0, y, '█', g.paint.ink(0.7));
    g.set(1 + cone, y, Math.abs(y - middle) < 1.4 ? ')' : y < middle ? '\\' : '/', g.paint.ink(1), undefined, true);
  }
  return g.finish();
};

const WAVES: [number, number][][] = [
  [1, 3, 5, 7, 9].map(n => [n, 4 / (Math.PI * n)]),
  [1, 2, 3, 4, 5, 6].map(n => [n, 2 / (Math.PI * n) * (n % 2 ? 1 : -1)]),
  [1, 3, 5, 7].map(n => [n, 8 / (Math.PI * Math.PI * n * n) * (n % 4 === 1 ? 1 : -1)])
];

// Circles riding on circles. The last one's height, written out to the right, is a square wave, then a sawtooth, then a triangle.
const epicycles: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const terms = WAVES[Math.floor(t / 10) % WAVES.length]!;
  const unit = b.dh * 0.3;
  const cx = Math.min(b.dw / 2, unit * 1.8), cy = b.dh / 2 - 0.5;
  const tipAt = (when: number): [number, number] => {
    let x = cx, y = cy;
    for (const [n, size] of terms) { x += Math.cos(n * when * 1.5) * size * unit; y -= Math.sin(n * when * 1.5) * size * unit; }
    return [x, y];
  };
  let x = cx, y = cy;
  terms.forEach(([n, size], index) => {
    const radius = Math.abs(size) * unit;
    const ring = mix(panelBackground, g.paint.fan(index / Math.max(1, terms.length - 1) * 1.6 - 0.8), 0.8);
    for (let i = 0; i < Math.max(10, radius * 5); i++) b.dot(x + Math.cos(i / Math.max(10, radius * 5) * TAU) * radius, y + Math.sin(i / Math.max(10, radius * 5) * TAU) * radius, ring);
    const nx = x + Math.cos(n * t * 1.5) * size * unit, ny = y - Math.sin(n * t * 1.5) * size * unit;
    b.line(x, y, nx, ny, g.paint.ink(0.9));
    x = nx; y = ny;
  });
  const paper = Math.round(cx + unit * 2.2);
  if (paper < b.dw - 8) {
    for (let dash = Math.round(x); dash < paper; dash += 3) b.dot(dash, y, g.paint.ink(0.4));
    let last = y;
    for (let gx = paper; gx < b.dw; gx++) {
      const [, wy] = tipAt(t - (gx - paper) / 24);
      b.line(gx, last, gx, wy, g.paint.fan(0.85 - (gx - paper) / (b.dw - paper) * 1.2));
      last = wy;
    }
  }
  b.flush();
  g.set(Math.floor(x / 2), Math.floor(y / 4), '●', g.paint.ink(1), undefined, true);
  return g.finish();
};

// No two alike: six arms and their mirror images, branching as they freeze outward, then gone.
const snowflake: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  for (let i = 0; i < Math.round(g.w * g.h / 28); i++) {
    const x = Math.floor(hash(i, 1) * g.w + Math.sin(t * 0.3 + i) * 2), y = Math.floor(fract(hash(i, 2) + t * (0.015 + 0.02 * hash(i, 3))) * g.h);
    g.set(x, y, '·', g.paint.ink(0.16 + 0.2 * hash(i, 4)));
  }
  const flake = (cx: number, cy: number, reach: number, clock: number, ice: string): void => {
    const epoch = Math.floor(clock / 17), local = clock - epoch * 17;
    const grown = smooth(local / 10), melt = smooth((local - 14.2) / 2.8);
    const random = mulberry(epoch * 8191 + Math.round(cx));
    const count = 2 + Math.floor(random() * 2);
    const limbs = Array.from({length: count}, (_, j) => {
      const at = 0.22 + 0.66 * (j + random() * 0.6) / count;
      return {at, long: (0.16 + 0.2 * random()) * (1.2 - at * 0.85), twig: random() < 0.3};
    });
    const plate = random() < 0.6 ? 0.16 + 0.14 * random() : 0;
    const size = reach * (1 - melt * 0.35), color = mix(ice, panelBackground, melt);
    const turn = clock * 0.05;
    for (let arm = 0; arm < 6; arm++) {
      const a = turn + arm * Math.PI / 3, ax = Math.cos(a), ay = Math.sin(a);
      b.line(cx, cy, cx + ax * size * grown, cy + ay * size * grown, color);
      if (plate) b.line(cx + ax * size * plate * grown, cy + ay * size * plate * grown, cx + Math.cos(a + Math.PI / 3) * size * plate * grown, cy + Math.sin(a + Math.PI / 3) * size * plate * grown, color);
      for (const limb of limbs) {
        if (grown <= limb.at) continue;
        const long = size * limb.long * Math.min(1, (grown - limb.at) / (1 - limb.at) * 1.5);
        const bx = cx + ax * size * limb.at, by = cy + ay * size * limb.at;
        for (const mirror of [-1, 1]) {
          const d = a + mirror * Math.PI / 3, ex = Math.cos(d), ey = Math.sin(d);
          b.line(bx, by, bx + ex * long, by + ey * long, color);
          // A twig runs parallel to the arm it grew beside.
          if (limb.twig && long > size * 0.1) b.line(bx + ex * long * 0.55, by + ey * long * 0.55, bx + ex * long * 0.55 + ax * long * 0.45, by + ey * long * 0.55 + ay * long * 0.45, color);
        }
      }
    }
  };
  const reach = Math.min(b.dh * 0.47, b.dw * 0.47);
  if (b.dw / b.dh > 3) {
    flake(b.dw * 0.17, b.dh * 0.5, reach * 0.62, t + 6.1, g.paint.fan(-0.6));
    flake(b.dw * 0.83, b.dh * 0.5, reach * 0.62, t + 11.7, g.paint.fan(0.6));
  }
  flake(b.dw / 2, b.dh / 2, reach, t, mix(g.paint.accent, '#ffffff', 0.7));
  b.flush();
  return g.finish();
};

// A month in a row: the same moon at every phase, with the terminator creeping across all of them at once.
const moonPhases: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (hash(x, y + 11) > 0.955) g.set(x, y, '·', g.paint.ink(0.14 + 0.3 * tri(t * 0.25 + hash(x, y))));
  }
  const moons = Math.round(clamp(Math.floor(p.pw / (p.ph * 0.95)), 1, 9));
  const pitch = p.pw / moons;
  const radius = Math.max(1, Math.min(p.ph * 0.42, pitch * 0.43));
  const regolith = mix(g.paint.accent, '#ffffff', 0.72), night = mix(panelBackground, g.paint.accent, 0.07);
  const shades = Array.from({length: 24}, (_, i) => mix(night, regolith, i / 23));
  for (let moon = 0; moon < moons; moon++) {
    const cx = (moon + 0.5) * pitch, cy = p.ph / 2;
    const phase = TAU * (t / 50 + moon / moons);
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
      const dx = (x + 0.5 - cx) / radius, dy = (y + 0.5 - cy) / radius;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const toward = Math.sqrt(1 - d);
      // Sunlight arrives from a direction that swings round the moon once a month.
      const sun = clamp((dx * Math.sin(phase) + toward * Math.cos(phase)) * 3.5);
      const sea = smooth((noise(dx * 2.4 + 5, dy * 2.4 + 9, 3) - 0.42) * 4);
      p.px(x, y, shades[Math.round(sun * (0.82 - 0.34 * sea) * (0.72 + 0.28 * toward) * 23)]!);
    }
  }
  p.flush();
  return g.finish();
};

type Bubble = {x: number; y: number; r: number; live: boolean; tint: number};
type Packing = {bubbles: Bubble[]; random: () => number};
const packings = new Map<string, Run<Packing>>();

// Circles appear wherever there is room and swell until they touch something. Then the next ones fit in between.
const circlePacking: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const life = 300, step = Math.floor(pulse);
  const tick = (state: Packing, now: number): void => {
    // Seeds arrive slowly at first, so the early circles have room to become the big ones.
    for (let attempt = 0; attempt < (now < 90 ? (now % 4 === 0 ? 1 : 0) : 2); attempt++) {
      const x = state.random() * p.pw, y = state.random() * p.ph;
      if (state.bubbles.every(other => Math.hypot(other.x - x, other.y - y) > other.r + 2.2)) {
        state.bubbles.push({x, y, r: 0.6, live: true, tint: state.random() * 2 - 1});
      }
    }
    for (const bubble of state.bubbles) {
      if (!bubble.live) continue;
      bubble.r += 0.26;
      const walled = bubble.x - bubble.r < 0 || bubble.y - bubble.r < 0 || bubble.x + bubble.r > p.pw || bubble.y + bubble.r > p.ph;
      if (walled || state.bubbles.some(other => other !== bubble && Math.hypot(other.x - bubble.x, other.y - bubble.y) < other.r + bubble.r + 0.9)) bubble.live = false;
    }
  };
  const state = replay(packings, `${p.pw}x${p.ph}`, Math.floor(step / life), step % life, epoch => {
    const fresh: Packing = {bubbles: [], random: mulberry(epoch * 5081 + p.pw * 7 + p.ph)};
    for (let warm = 0; warm < 16; warm++) tick(fresh, warm * 4);
    return fresh;
  }, tick);
  const fade = Math.min(1, (life - step % life) / 18);
  const beat = kick(seconds(pulse));
  for (const bubble of state.bubbles) {
    const tone = g.paint.fan(bubble.tint);
    const rim = mix(panelBackground, tone, fade), fill = mix(panelBackground, tone, (bubble.live ? 0.3 + 0.2 * beat : 0.16) * fade);
    for (let y = Math.floor(bubble.y - bubble.r); y <= bubble.y + bubble.r; y++) for (let x = Math.floor(bubble.x - bubble.r); x <= bubble.x + bubble.r; x++) {
      const d = Math.hypot(x + 0.5 - bubble.x, y + 0.5 - bubble.y);
      if (d <= bubble.r) p.px(x, y, d > bubble.r - 0.95 ? rim : fill);
    }
  }
  p.flush();
  return g.finish();
};

// One compass, one radius: each new circle is centred where two others cross, and the petals appear on their own.
const flowerOfLife: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const radius = Math.max(3, b.dh * 0.235);
  const centres: {x: number; y: number; ring: number}[] = [];
  const rows = Math.ceil(b.dh / 2 / (radius * 0.866)) , columns = Math.ceil(b.dw / 2 / radius) + 1;
  for (let j = -rows; j <= rows; j++) for (let i = -columns; i <= columns; i++) {
    const x = (i + (j & 1) / 2) * radius, y = j * radius * 0.866;
    if (Math.abs(x) > b.dw / 2 + radius * 0.2 || Math.abs(y) > b.dh / 2 - radius * 0.72) continue;
    centres.push({x, y, ring: Math.round(Math.hypot(x, y) / radius)});
  }
  centres.sort((a, c) => a.ring - c.ring || Math.atan2(a.y, a.x) - Math.atan2(c.y, c.x));
  const each = Math.max(0.2, Math.min(0.6, 22 / centres.length));
  const span = centres.length * each + 6;
  // Open with the seed of the pattern already on the page.
  const local = (t + each * 4) % span;
  const fade = 1 - smooth((local - (span - 2.2)) / 2);
  const steps = Math.ceil(TAU * radius * 1.2);
  let tip: [number, number] | undefined;
  centres.forEach((centre, index) => {
    const done = clamp((local - index * each) / each);
    if (done <= 0) return;
    const color = mix(panelBackground, g.paint.fan(tri(centre.ring * 0.22) * 2 - 1), (0.55 + 0.45 * (done < 1 ? 1 : 0.6)) * fade);
    for (let i = 0; i <= steps * done; i++) {
      const a = i / steps * TAU - Math.PI / 2;
      b.dot(b.dw / 2 - 0.5 + centre.x + Math.cos(a) * radius, b.dh / 2 - 0.5 + centre.y + Math.sin(a) * radius, color);
    }
    if (done < 1) tip = [b.dw / 2 + centre.x + Math.cos(done * TAU - Math.PI / 2) * radius, b.dh / 2 + centre.y + Math.sin(done * TAU - Math.PI / 2) * radius];
  });
  b.flush();
  if (tip) g.set(Math.floor(tip[0] / 2), Math.floor(tip[1] / 4), '●', g.paint.ink(1), undefined, true);
  return g.finish();
};

// A three-strand plait, properly over and under, with a glint running down each cord.
const knotwork: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const bands = p.ph >= 44 ? 2 : 1;
  const tall = p.ph / bands;
  const swing = tall * 0.33, half = Math.max(0.8, tall * 0.085);
  const pace = TAU / (tall * 1.7);
  const edge = '#05070a';
  for (let band = 0; band < bands; band++) {
    const cy = (band + 0.5) * tall - 0.5;
    for (const rail of [-1, 1]) for (let x = 0; x < p.pw; x++) p.px(x, Math.round(cy + rail * (tall / 2 - 0.6)), g.paint.ink(0.34));
    for (let x = 0; x < p.pw; x++) {
      const cords = [0, 1, 2].map(cord => {
        const phase = (x + t * 7 * (band ? -1 : 1)) * pace + cord * TAU / 3;
        return {cord, y: cy + Math.sin(phase) * swing, depth: Math.cos(phase), slope: Math.cos(phase) * swing * pace};
      }).sort((a, c) => a.depth - c.depth);
      // Painted back to front, so the nearer cord covers the further one where they cross.
      for (const {cord, y, depth, slope} of cords) {
        const thick = half * Math.sqrt(1 + slope * slope);
        const glint = Math.exp(-(((fract(x / p.pw - t * 0.16 - cord / 3) - 0.5) * 9) ** 2));
        const tone = mix(mix('#000000', g.paint.fan(cord - 1), 0.62 + 0.38 * (depth * 0.5 + 0.5)), '#ffffff', 0.6 * glint);
        for (let dy = -Math.ceil(thick) - 1; dy <= Math.ceil(thick) + 1; dy++) {
          const off = Math.abs(dy + Math.round(y) - y);
          if (off <= thick + 1) p.px(x, Math.round(y) + dy, off <= thick ? tone : edge);
        }
      }
    }
  }
  p.flush();
  return g.finish();
};

const SETT: [number, number][] = [[0, 9], [1, 2], [0, 2], [2, 7], [3, 1], [2, 2], [4, 1]];

// Tartan the way it is woven: one striped sett for the warp, the same for the weft, and a twill that lets each show through the other.
const tartan: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const yarns = [mix(panelBackground, g.paint.fan(-0.9), 0.55), g.paint.accent, mix(panelBackground, g.paint.fan(0.75), 0.8), '#07090c', g.paint.ink(0.97)];
  // Stripes breathe a thread or two, then the sett is mirrored so it reads the same both ways.
  const half: number[] = [];
  SETT.forEach(([yarn, threads], i) => { for (let n = 0; n < Math.max(1, Math.round(threads * (1 + 0.3 * Math.sin(t * 0.13 + i * 1.9)))); n++) half.push(yarn); });
  const sett = [...half, ...half.slice().reverse()];
  const at = (n: number): number => sett[((n % sett.length) + sett.length) % sett.length]!;
  const blends = yarns.map(warp => yarns.map(weft => [mix(warp, '#ffffff', 0.05), mix(weft, '#000000', 0.12)] as const));
  const slideX = Math.floor(t * 5), slideY = Math.floor(t * 2.2);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const warp = at(x + slideX), weft = at(y + slideY);
    // Two over, two under, stepping one thread each row: the diagonal rib of a twill.
    p.px(x, y, blends[warp]![weft]![((x + slideX + y + slideY) & 3) < 2 ? 0 : 1]!);
  }
  p.flush();
  return g.finish();
};

const MOTIFS: {rows: number[]; yarn: number; ground: number}[] = [
  {rows: [0], yarn: 0, ground: -0.9},
  {rows: [0b10101010], yarn: 0.9, ground: -0.9},
  {rows: [0], yarn: 0, ground: -0.9},
  {rows: [0b00010000, 0b00111000, 0b01111100, 0b11111110, 0b01111100, 0b00111000, 0b00010000], yarn: 0.2, ground: -0.55},
  {rows: [0], yarn: 0, ground: 0.9},
  {rows: [0b10001000, 0b01010101, 0b00100010], yarn: -0.9, ground: 0.9},
  {rows: [0], yarn: 0, ground: 0.9},
  {rows: [0b00010000, 0b01010100, 0b00111000, 0b11111110, 0b00111000, 0b01010100, 0b00010000], yarn: 0.95, ground: -0.2},
  {rows: [0b11111111], yarn: 0.5, ground: -0.2}
];
const KNIT_ROWS = MOTIFS.flatMap(motif => motif.rows.map(bits => ({bits, yarn: motif.yarn, ground: motif.ground})));

// A jumper being knitted from the top row down the screen: two yarns at a time, one stitch after another.
const fairIsle: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const perRow = g.w / 42 + 0.25;
  // The piece is already a panel deep when we look in.
  const current = Math.floor(t / perRow) + g.h;
  const done = Math.min(g.w, Math.floor((t - (current - g.h) * perRow) * 42));
  for (let y = 0; y < g.h; y++) {
    const row = current - y;
    if (row < 0) continue;
    const {bits, yarn, ground} = KNIT_ROWS[row % KNIT_ROWS.length]!;
    const backwards = row % 2 === 1;
    for (let x = 0; x < g.w; x++) {
      const knitted = y > 0 || (backwards ? x >= g.w - done : x < done);
      const stitch = (bits >> (7 - (x + Math.floor(row / KNIT_ROWS.length) * 3) % 8)) & 1;
      if (knitted) g.set(x, y, 'V', stitch ? g.paint.fan(yarn) : mix(panelBackground, g.paint.fan(ground), 0.62), undefined, stitch === 1);
      // Stitches still waiting on the needle are bare loops.
      else g.set(x, y, 'o', g.paint.ink(0.2));
    }
    if (y === 0 && done < g.w) g.set(backwards ? g.w - 1 - done : done, 0, backwards ? '<' : '>', g.paint.ink(1), undefined, true);
  }
  return g.finish();
};

// Two mirrors and a ring of lights between them: the same frame again and again, smaller and dimmer, all the way in.
const infinityMirror: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const depth = 11;
  for (let layer = depth - 1; layer >= 0; layer--) {
    const shrink = 0.79 ** layer;
    const hx = Math.max(0.5, (g.w / 2 - 1) * shrink), hy = Math.max(0.25, (g.h / 2 - 0.5) * shrink);
    // Lean the far frames a little, as if the viewer were swaying in front of the glass.
    const cx = (g.w - 1) / 2 + Math.sin(t * 0.42) * layer * 0.9, cy = (g.h - 1) / 2 + Math.cos(t * 0.31) * layer * 0.22;
    const around = 4 * hx + 8 * hy;
    const lamps = Math.max(8, Math.round(around / (2.2 + layer * 0.25)));
    const flash = 0.5 + 0.5 * kick(t - layer * 0.055);
    for (let lamp = 0; lamp < lamps; lamp++) {
      let along = lamp / lamps * around, x: number, y: number;
      if (along < 2 * hx) { x = cx - hx + along; y = cy - hy; }
      else if ((along -= 2 * hx) < 4 * hy) { x = cx + hx; y = cy - hy + along / 2; }
      else if ((along -= 4 * hy) < 2 * hx) { x = cx + hx - along; y = cy + hy; }
      else { x = cx - hx; y = cy + hy - (along - 2 * hx) / 2; }
      const chase = (lamp + Math.floor(t * 9) + layer) % 5 === 0 ? 0.35 : 1;
      const tone = g.paint.fan(tri(lamp / lamps + t * 0.07 + layer * 0.06) * 2 - 1);
      g.set(Math.round(x), Math.round(y), layer < 2 ? '●' : layer < 5 ? '•' : '·', mix(panelBackground, tone, clamp((1 - layer / depth * 0.82) * flash * chase)), undefined, layer < 3);
    }
  }
  return g.finish();
};

// The big wheel at night: it turns slowly, the cars hang level, and the lights chase out along the spokes.
const ferrisWheel: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (hash(x, y + 23) > 0.965) g.set(x, y, '·', g.paint.ink(0.14 + 0.25 * tri(t * 0.2 + hash(y, x))));
  const cx = b.dw / 2 - 0.5, cy = b.dh * 0.46;
  const radius = Math.max(2, Math.min(b.dh * 0.43, b.dw * 0.32));
  const turn = t * 0.22;
  const steel = g.paint.ink(0.42), cars = Math.max(6, Math.min(14, Math.round(radius / 2.1)));
  for (const leg of [-1, 1]) b.line(cx, cy, cx + leg * radius * 0.6, b.dh - 1, g.paint.ink(0.6));
  for (let x = 0; x < b.dw; x++) b.dot(x, b.dh - 1, g.paint.ink(0.3));
  for (let i = 0; i < radius * 8; i++) {
    const a = i / (radius * 8) * TAU;
    b.dot(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, g.paint.ink(0.7));
    b.dot(cx + Math.cos(a) * radius * 0.88, cy + Math.sin(a) * radius * 0.88, steel);
  }
  for (let car = 0; car < cars; car++) {
    const a = turn + car / cars * TAU;
    b.line(cx, cy, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, steel);
  }
  b.flush();
  const cell = (x: number, y: number): [number, number] => [Math.floor(x / 2), Math.floor(y / 4)];
  for (let car = 0; car < cars; car++) {
    const a = turn + car / cars * TAU;
    // Lights run outward along each spoke, one step behind the spoke before it.
    for (let lamp = 1; lamp <= 4; lamp++) {
      if ((lamp + car + Math.floor(t * 6)) % 3) continue;
      const [x, y] = cell(cx + Math.cos(a) * radius * lamp / 5, cy + Math.sin(a) * radius * lamp / 5);
      g.set(x, y, '•', g.paint.fan(tri(car / cars + t * 0.1) * 2 - 1), undefined, true);
    }
    const [x, y] = cell(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius + 3);
    g.set(x, y, '■', g.paint.fan(car / cars * 2 - 1), undefined, true);
  }
  const [hubX, hubY] = cell(cx, cy);
  g.set(hubX, hubY, '◉', g.paint.ink(1), undefined, true);
  // A string of bulbs swagged across the top of the fairground.
  const swags = Math.max(1, Math.round(g.w / 26));
  for (let x = 0; x < g.w && g.h >= 6; x += 2) {
    const along = fract(x / g.w * swags);
    const y = Math.round(4 * along * (1 - along) * Math.min(2.4, g.h * 0.16));
    const [wheelX, wheelY] = [Math.abs(x - hubX) * 2, Math.abs(y - hubY) * 4];
    if (Math.hypot(wheelX, wheelY) < radius + 3) continue;
    g.set(x, y, '●', mix(panelBackground, g.paint.fan(tri(x * 0.09) * 2 - 1), 0.45 + 0.55 * hash(x, Math.floor(t * 2 + hash(x, 1) * 3))));
  }
  return g.finish();
};

export const cabinetReceiverBuilders = {
  'rubens-tube': rubensTube,
  'sound-field': soundField,
  epicycles,
  snowflake,
  'moon-phases': moonPhases,
  'circle-packing': circlePacking,
  'flower-of-life': flowerOfLife,
  knotwork,
  tartan,
  'fair-isle': fairIsle,
  'infinity-mirror': infinityMirror,
  'ferris-wheel': ferrisWheel
};

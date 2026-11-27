import {TAU, clamp, fract, grid, hash, kick, mix, noise, pixels, seconds, smooth, stroke, tri, type Builder, type Pixels} from './cell-canvas.js';
import {GOLD, GREEN, INK, NIGHT, PINE, RED, SNOW, WOOD, disc, flame, season, snowfall, tree, wash, write} from './festive-receivers.js';

const sprite = (p: Pixels, rows: readonly string[], left: number, top: number, palette: Record<string, string>, scale = 1, flip = false): void => {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const key = row[flip ? row.length - 1 - x : x]!;
      if (key === ' ') continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) p.px(Math.round(left) + x * scale + dx, Math.round(top) + y * scale + dy, palette[key]!);
    }
  });
};
const box = (p: Pixels, x: number, y: number, w: number, h: number, color: (dx: number, dy: number) => string | undefined): void => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) { const tone = color(dx, dy); if (tone) p.px(Math.round(x) + dx, Math.round(y) + dy, tone); }
};

const SANTA = [
  '     rrrrrr    w',
  '    rrrrrrrrr ww',
  '   rrrrrrrrrrrw ',
  '   wwwwwwwwwww  ',
  '  wwwwwwwwwwwww ',
  '   ffffffffff   ',
  '   fefffffeff   ',
  '  pfffffnffffp  ',
  '   wwfwwwwfww   ',
  '   wwwwmmwwww   ',
  '   wwwwwwwwww   ',
  '    wwwwwwww    ',
  '     wwwwww     ',
  '       ww       '
] as const;

// The man himself: a twinkle, a wink now and then, and the laugh written out beside him.
const santaClaus: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#3a0d14'), c('#160609'), y / p.ph));
  snowfall(p, t * 0.6, Math.round(p.pw * p.ph / 60), c('#bb8888'));
  const scale = Math.max(1, Math.floor(p.ph / 15));
  const face = {r: c(RED), w: c(SNOW), f: c('#f2c6a0'), e: c(INK), n: c('#e8897a'), p: c('#f09a8c'), m: c('#a8323e')};
  const bob = Math.round(Math.sin(t * Math.PI * 2) * 0.6 * scale);
  const left = Math.round(p.pw * (p.pw > 70 ? 0.28 : 0.5) - 8 * scale), top = Math.round((p.ph - 14 * scale) / 2) + bob;
  sprite(p, SANTA, left, top, face, scale);
  if (fract(t / 4.5) < 0.07) box(p, left + 9 * scale, top + 6 * scale, scale, scale, () => c('#f2c6a0'));
  if (kick(t) > 0.5) box(p, left + 7 * scale, top + 9 * scale + scale, 2 * scale, Math.max(1, scale / 2), () => c('#5c1820'));
  // HO HO HO: one word per beat, each landing a little bigger than it stays.
  if (p.pw > 70) for (let word = 0; word < 3; word++) {
    const since = (t * 2 - word + 300) % 4;
    if (since > 3.2) continue;
    const size = Math.max(1, Math.floor(p.ph / 18)) + (since < 0.25 ? 1 : 0);
    write(p, 'HO', Math.round(p.pw * 0.55 + word * p.pw * 0.14), Math.round(p.ph * (0.2 + 0.2 * word) - (since < 0.25 ? 2 : 0)), size, () => mix(c(GOLD), '#ffffff', since < 0.25 ? 0.6 : 0));
  }
  snowfall(p, t, Math.round(p.pw * p.ph / 90), c(SNOW));
  p.flush();
  return g.finish();
};

// A glass globe on its stand. Every few bars it is shaken, and the snow takes its time coming down.
const snowGlobe: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#141018'), c('#2a1a14'), y / p.ph));
  const r = Math.max(3, Math.min(p.ph * 0.44, p.pw * 0.3)), cx = p.pw / 2, cy = p.ph * 0.46;
  const since = t % 12, shake = since < 0.9 ? Math.sin(since * 40) * (0.9 - since) * 2.5 : 0;
  const ox = cx + shake;
  disc(p, ox, cy, r, r, (dx, dy) => mix(c('#0f2038'), c('#2d4f7c'), clamp(0.5 - dy * 0.5 + dx * 0.15)));
  const floor = cy + r * 0.62;
  disc(p, ox, cy, r, r, (_, dy) => cy + dy * r > floor ? c(SNOW) : undefined);
  tree(p, ox - r * 0.3, floor, Math.round(r * 0.9), t, c, g.paint.accent, 3);
  box(p, ox + r * 0.12, floor - r * 0.36, Math.round(r * 0.42), Math.round(r * 0.36), (dx, dy) => dy === 0 ? c(SNOW) : dx === 2 && dy > 2 ? c('#ffd070') : c('#8a3a2c'));
  const settle = clamp(since / 9);
  for (let flake = 0; flake < r * r * 0.5; flake++) {
    // Thrown up by the shake, then each flake sinks at its own speed and stays where it lands.
    const a = hash(flake, 1) * TAU, far = Math.sqrt(hash(flake, 2)) * r * 0.92;
    const fx = ox + Math.cos(a) * far + Math.sin(t * 1.5 + flake) * (1 - settle) * 2;
    const drop = clamp(settle * (0.6 + 1.6 * hash(flake, 3)));
    const fy = cy + Math.sin(a) * far * (1 - drop) + (floor - cy - 1) * drop;
    if (Math.hypot(fx - ox, fy - cy) < r - 1 && drop < 1) p.px(Math.round(fx), Math.round(fy), c(SNOW));
  }
  disc(p, ox - r * 0.4, cy - r * 0.45, r * 0.22, r * 0.14, (dx, dy) => mix(p.at(Math.round(ox - r * 0.4 + dx * r * 0.22), Math.round(cy - r * 0.45 + dy * r * 0.14)) ?? '#fff', '#ffffff', 0.45));
  box(p, ox - r * 0.72, cy + r * 0.86, Math.round(r * 1.44), Math.max(2, Math.round(p.ph - (cy + r * 0.86))), (dx, dy) => dy === 0 ? c(GOLD) : mix(c(WOOD), c('#3a2212'), dx / (r * 1.44)));
  p.flush();
  return g.finish();
};

// Peppermint: red and white wound round each other, turning like a barber's pole.
const candyCane: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#10261c'), c('#0a1812'), y / p.ph));
  const thick = Math.max(2, Math.round(p.ph * 0.16)), pitch = thick * 3.4;
  for (let cane = 0; cane * pitch < p.pw + pitch; cane++) {
    const cx = cane * pitch + thick, flip = cane % 2 === 1;
    const hookY = flip ? p.ph - thick * 1.6 : thick * 1.6, hookX = cx + thick * 1.1;
    const paint = (x: number, y: number, across: number, along: number): void => {
      // Stripes run on the diagonal and slide along the stick; the middle of the stick is brighter than its edges.
      const stripe = fract((along + across * thick * 0.9) / (thick * 1.6) - t * 0.5 * (flip ? -1 : 1));
      const base = stripe < 0.42 ? c(RED) : stripe < 0.5 ? c(GREEN) : c(SNOW);
      p.px(Math.round(x), Math.round(y), mix(base, '#000000', 0.38 * Math.abs(across)));
    };
    for (let y = 0; y < p.ph; y++) {
      if (flip ? y > hookY : y < hookY) continue;
      for (let w = -thick / 2; w <= thick / 2; w++) paint(cx + w, y, w / (thick / 2), y);
    }
    for (let i = 0; i <= thick * 8; i++) {
      const a = Math.PI + i / (thick * 8) * Math.PI;
      for (let w = -thick / 2; w <= thick / 2; w += 0.5) paint(hookX + Math.cos(a) * (thick * 1.1 + w), hookY + Math.sin(a) * (thick * 1.1 + w) * (flip ? -1 : 1), w / (thick / 2), p.ph + i);
    }
  }
  snowfall(p, t, Math.round(p.pw * p.ph / 120), c(SNOW));
  p.flush();
  return g.finish();
};

// A wreath on the door: a chase of lights running round it, a red bow, and one candle in the middle.
const wreath: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => c((y >> 2) % 2 ? '#3d1418' : '#451a1e'));
  const wreaths = Math.max(1, Math.floor(p.pw / (p.ph * 1.5)));
  for (let n = 0; n < wreaths; n++) {
    const cx = (n + 0.5) * p.pw / wreaths, cy = p.ph * 0.5, r = Math.max(3, p.ph * 0.4);
    disc(p, cx, cy, r, r, (dx, dy) => {
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (d < 0.58) return undefined;
      // Needles: the ring is rough on both edges and darker where the boughs overlap.
      const rough = noise(a * 5 + n * 3, d * 6, 2);
      return d > 0.96 - rough * 0.12 || d < 0.6 + rough * 0.08 ? undefined : mix(c(PINE), c(GREEN), noise(a * 9, d * 9 + n, 4));
    });
    const lights = Math.max(8, Math.round(r * 2.2)), colours = [c(RED), c(GOLD), c('#4aa3ff'), g.paint.accent];
    for (let light = 0; light < lights; light++) {
      const a = light / lights * TAU, on = (light - Math.floor(t * 6 + n * 3) + lights * 9) % lights < lights * 0.35;
      p.px(Math.round(cx + Math.cos(a) * r * 0.79), Math.round(cy + Math.sin(a) * r * 0.79), on ? mix(colours[light % 4]!, '#ffffff', 0.3) : mix(colours[light % 4]!, c(PINE), 0.7));
    }
    for (const side of [-1, 1]) {
      disc(p, cx + side * r * 0.2, cy + r * 0.8, r * 0.2, r * 0.13, () => c(RED));
      stroke(p, cx, cy + r * 0.82, cx + side * r * 0.22, cy + r * 1.12, 0.6, c('#a81c2c'));
    }
    p.px(Math.round(cx), Math.round(cy + r * 0.8), c(GOLD));
    box(p, cx - 1, cy, 2, Math.round(r * 0.34), () => c('#f3ead6'));
    flame(p, cx, cy - 1, Math.max(2, r * 0.3), t, n, c);
  }
  p.flush();
  return g.finish();
};

// Glass baubles on ribbons, swinging a little and turning the room's light over as they go.
const ornaments: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#0f2a1e'), c('#07140e'), y / p.ph));
  for (let x = 0; x < p.pw; x++) for (let y = 0; y < 2; y++) if (hash(x, y + 5) > 0.3) p.px(x, y, c(hash(x, y) > 0.5 ? GREEN : PINE));
  const r = Math.max(2, p.ph * 0.2), count = Math.max(1, Math.floor(p.pw / (r * 2.7)));
  const glass = [RED, GOLD, '#2f6fd8', '#c0c8d8', '#8a2a8a', GREEN];
  for (let n = 0; n < count; n++) {
    const hx = (n + 0.5) * p.pw / count, long = p.ph * (0.22 + 0.3 * hash(n, 1));
    const swing = Math.sin(t * (1.1 + 0.4 * hash(n, 2)) + n * 1.9) * 0.16 * (1 + 0.6 * kick(t));
    const cx = hx + Math.sin(swing) * (long + r), cy = 1 + Math.cos(swing) * (long + r);
    stroke(p, hx, 1, cx, cy - r, 0.3, c(GOLD));
    box(p, cx - 1, cy - r - 1, 2, 2, () => c(GOLD));
    const tone = c(glass[n % glass.length]!), kind = n % 3;
    disc(p, cx, cy, r, r, (dx, dy) => {
      const lit = clamp(0.55 - dx * 0.25 - dy * 0.4);
      // Three patterns: a waist band, zigzags, and plain glass.
      const mark = kind === 0 ? Math.abs(dy) < 0.2 : kind === 1 ? Math.abs(dy - 0.25 * (tri(dx * 1.5 + t * 0.2) * 2 - 1)) < 0.14 : false;
      const glint = Math.hypot(dx + 0.38, dy + 0.42) < 0.2;
      return glint ? '#ffffff' : mix('#000000', mark ? c(SNOW) : tone, 0.35 + 0.65 * lit);
    });
  }
  p.flush();
  return g.finish();
};

// The workshop line: bare boxes go in on the left, get wrapped, get a bow, and roll off to the sleigh.
const workshop: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c('#2a1c14'), c('#1a110c'), y / p.ph));
  const belt = Math.round(p.ph * 0.72);
  for (let x = 0; x < p.pw; x++) {
    p.px(x, belt, c('#8a8f9a')); p.px(x, belt + 1, c((x + Math.floor(t * 12)) % 4 < 2 ? '#3a3d46' : '#22242b'));
    if (x % 9 === 4) disc(p, x, belt + 3, 1.6, 1.6, (dx, dy) => Math.abs(dx * Math.cos(t * 4) + dy * Math.sin(t * 4)) < 0.3 ? c('#22242b') : c('#6a6f7a'));
  }
  const stations = [0.33, 0.66].map(at => Math.round(p.pw * at));
  const wraps = [RED, GREEN, '#2f6fd8', '#8a2a8a', GOLD], pitch = Math.max(10, Math.round(p.ph * 0.7));
  const travel = t * 12, slide = travel % pitch;
  const gifts: {center: number; top: number; size: number; id: number}[] = [];
  for (let n = -1; n * pitch < p.pw + pitch; n++) {
    const x = Math.round(n * pitch + slide), id = n - Math.floor(travel / pitch);
    const size = Math.max(3, Math.round(p.ph * (0.18 + 0.12 * hash(id, 1)))), top = belt - size;
    const center = n * pitch + slide + (size - 1) / 2;
    gifts.push({center, top, size, id});
    const wrapped = center >= stations[0]!, bowed = center >= stations[1]!;
    const paper = c(wraps[((id % 5) + 5) % 5]!);
    box(p, x, top, size, size, (dx, dy) => !wrapped ? (dx === 0 || dy === 0 || dx === size - 1 ? c('#6b4a2d') : c('#a9794a')) : dx === Math.floor(size / 2) || dy === Math.floor(size / 2) ? c(bowed ? GOLD : SNOW) : mix(paper, '#000000', dy / size * 0.25));
    if (bowed) for (const side of [-1, 1]) disc(p, x + size / 2 + side * 1.6, top - 1, 1.6, 1.2, () => c(GOLD));
  }
  stations.forEach((x, n) => {
    const gift = gifts.reduce((nearest, next) => Math.abs(next.center - x) < Math.abs(nearest.center - x) ? next : nearest);
    const distance = Math.abs(gift.center - x);
    const reach = Math.min(pitch / 3, (gift.size + 6) / 2);
    const contact = Math.max(0, gift.top - 2), rest = Math.min(contact, Math.round(p.ph * 0.2));
    const head = Math.round(rest + (contact - rest) * smooth(1 - (distance - 1) / reach));
    box(p, x - 1, 0, 3, head, () => c('#5a5f6a'));
    box(p, x - 4, head, 9, 2, () => c(n ? GOLD : RED));
    if (distance <= 1.5) for (const side of [-1, 1]) for (let spark = 0; spark < 3; spark++) {
      const dx = Math.ceil(gift.size / 2 + hash(spark, gift.id) * 3);
      p.px(Math.round(gift.center) + side * dx, gift.top - Math.floor(hash(spark + 9, gift.id) * 3), c('#fff3c0'));
    }
  });
  p.flush();
  return g.finish();
};

// Strings of bulbs along the eaves, running through the programmes every set of lights has: chase, twinkle, alternate, fade.
const christmasLights: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  wash(p, y => mix(c(NIGHT), c('#101c3a'), y / p.ph));
  const colours = [c(RED), c(GOLD), c(GREEN), c('#3a8dff'), c('#ff7bd0'), g.paint.accent];
  const strings = Math.max(1, Math.round(p.ph / 7)), programme = Math.floor(t / 6) % 4;
  for (let string = 0; string < strings; string++) {
    const swags = Math.max(1, Math.round(p.pw / 30)) + (string % 2), y0 = (string + 0.3) * p.ph / strings;
    for (let x = 0; x < p.pw; x++) {
      const along = fract(x / p.pw * swags + string * 0.5), y = Math.round(y0 + 4 * along * (1 - along) * p.ph / strings * 0.6);
      p.px(x, y, c('#243252'));
      if (x % 3 !== 1) continue;
      const bulb = Math.floor(x / 3), tone = colours[(bulb + string) % colours.length]!;
      const on = programme === 0 ? ((bulb - Math.floor(t * 8) + 999) % 6 < 3 ? 1 : 0.12)
        : programme === 1 ? (hash(bulb + string * 50, Math.floor(t * 4)) > 0.45 ? 1 : 0.12)
          : programme === 2 ? ((bulb + Math.floor(t * 2)) % 2 ? 1 : 0.12)
            : 0.15 + 0.85 * tri(t * 0.5 + (bulb % colours.length) / colours.length);
      // A lit bulb also throws a little of its colour onto the wall beside it.
      if (on > 0.6) for (const [dx, dy] of [[-1, 1], [1, 1], [0, 2]] as const) p.px(x + dx, y + dy, mix(p.at(x + dx, y + dy) ?? c(NIGHT), tone, 0.22));
      p.px(x, y + 1, mix(c('#101c3a'), on > 0.6 ? mix(tone, '#ffffff', 0.25) : tone, on));
    }
  }
  p.flush();
  return g.finish();
};

type Shell = {x: number; apex: number; kind: number; tone: string; second: string; size: number; age: number};

// Midnight over the river: rockets climb on a thread of sparks, break, hang, and fall, and the water keeps a copy.
const fireworksSkyline: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const shore = Math.round(p.ph * 0.84);
  const palette = [c(GOLD), c('#ff5d73'), c('#63e6ff'), c('#b0ff7a'), c('#d59bff'), c('#ffffff'), g.paint.accent];
  const shells: Shell[] = [];
  for (let n = Math.floor(t / 0.55); n > Math.floor(t / 0.55) - 8; n--) {
    shells.push({x: (0.08 + 0.84 * hash(n, 1)) * p.pw, apex: (0.08 + 0.26 * hash(n, 2)) * p.ph, kind: Math.floor(hash(n, 3) * 4),
      tone: palette[Math.floor(hash(n, 4) * palette.length)]!, second: palette[Math.floor(hash(n, 5) * palette.length)]!, size: p.ph * (0.2 + 0.16 * hash(n, 6)), age: t - n * 0.55});
  }
  // Each burst lights the smoke around it, so the sky itself brightens and dims.
  const glow = (x: number, y: number): [number, string] => {
    let best = 0, tone = '#000000';
    for (const shell of shells) {
      const burst = shell.age - 0.9;
      if (burst < 0 || burst > 1.6) continue;
      const lit = Math.exp(-(((x - shell.x) ** 2 + ((y - shell.apex) * 1.2) ** 2) / (shell.size * shell.size * 2.2))) * (1 - burst / 1.6) ** 2;
      if (lit > best) { best = lit; tone = shell.tone; }
    }
    return [best, tone];
  };
  const sky = (y: number): string => mix(c('#04050e'), c('#141233'), (y / shore) ** 1.5);
  for (let y = 0; y < shore; y++) for (let x = 0; x < p.pw; x++) { const [lit, tone] = glow(x, y); p.px(x, y, lit > 0.03 ? mix(sky(y), tone, lit * 0.3) : sky(y)); }
  const spark = (x: number, y: number, tone: string, strength: number): void => {
    const px = Math.round(x), py = Math.round(y);
    if (py >= 0 && py < shore && strength > 0.05) p.px(px, py, mix(p.at(px, py) ?? sky(py), tone, clamp(strength)));
  };
  for (const shell of shells) {
    if (shell.age < 0.9) {
      const rise = shell.age / 0.9, y = shore - (shore - shell.apex) * (1 - (1 - rise) ** 2);
      for (let tail = 0; tail < 6; tail++) spark(shell.x + Math.sin(shell.age * 30 + tail) * 0.4, y + tail * 1.2, c('#ffd9a0'), 1 - tail / 6);
      continue;
    }
    const age = shell.age - 0.9, life = shell.kind === 2 ? 2.4 : 1.7;
    if (age > life) continue;
    const reach = shell.size * (1 - Math.exp(-age * 3.2)), fade = (1 - age / life) ** 1.3;
    const rays = shell.kind === 1 ? 30 : 46;
    for (let ray = 0; ray < rays; ray++) {
      const a = ray / rays * TAU + hash(ray, shell.x) * (shell.kind === 1 ? 0 : 0.25);
      // Peony: filled with sparks at every radius. Ring: one shell. Willow: long drooping tails. Crackle: late white flashes.
      const layers = shell.kind === 0 ? 3 : 1;
      for (let layer = 0; layer < layers; layer++) {
        const r = reach * (shell.kind === 0 ? (layer + 1) / 3 * (0.8 + 0.2 * hash(ray, layer)) : 1);
        const droop = age * age * p.ph * (shell.kind === 2 ? 0.12 : 0.045);
        const tails = shell.kind === 2 ? 7 : 3;
        for (let tail = 0; tail < tails; tail++) {
          const back = 1 - tail * (shell.kind === 2 ? 0.07 : 0.05);
          spark(shell.x + Math.cos(a) * r * back * 1.25, shell.apex + Math.sin(a) * r * back + droop * back * back, tail ? (layer % 2 ? shell.second : shell.tone) : mix(shell.tone, '#ffffff', 0.6), fade * (1 - tail / tails));
        }
      }
    }
    if (shell.kind === 3 && age > 0.5) for (let pop = 0; pop < 26; pop++) {
      if (hash(pop, Math.floor(t * 14)) > 0.3) continue;
      const a = hash(pop, shell.x) * TAU, r = Math.sqrt(hash(pop, shell.apex)) * reach;
      spark(shell.x + Math.cos(a) * r * 1.25, shell.apex + Math.sin(a) * r + age * 3, '#ffffff', 1);
    }
  }
  // The city: a dark wall with its lights on and one clock tower counting past midnight.
  for (let x = 0, n = 0; x < p.pw; n++) {
    const wide = 4 + Math.floor(hash(n, 21) * 6), tall = Math.round(p.ph * (0.1 + 0.26 * hash(n, 22) ** 1.5));
    for (let dx = 0; dx < wide && x + dx < p.pw; dx++) for (let y = shore - tall; y < shore; y++) {
      const pane = dx % 2 === 1 && (shore - y) % 2 === 0 && hash(n * 17 + dx, y) > 0.5;
      const [lit, tone] = glow(x + dx, shore - tall);
      p.px(x + dx, y, pane ? c('#ffd77a') : mix(c('#07080f'), tone, y === shore - tall ? lit * 0.7 : lit * 0.12));
    }
    x += wide + 1;
  }
  for (let y = shore; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const reach = y - shore, source = p.at(x + Math.round(Math.sin(y * 2.3 + t * 2.2 + x * 0.25) * (0.5 + reach * 0.2)), shore - 2 - reach * 3);
    p.px(x, y, mix(c('#05060f'), source ?? c('#05060f'), noise(x * 0.5 + t * 0.8, y * 1.9, 5) > 0.45 ? 0.55 : 0.22));
  }
  p.flush();
  return g.finish();
};

export const yuletideReceiverBuilders = {
  'santa-claus': santaClaus,
  'snow-globe': snowGlobe,
  'candy-cane': candyCane,
  wreath,
  ornaments,
  workshop,
  'christmas-lights': christmasLights,
  'fireworks-skyline': fireworksSkyline
};

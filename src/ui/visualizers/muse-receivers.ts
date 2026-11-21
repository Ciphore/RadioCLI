import {panelBackground} from '../theme.js';
import {TAU, braille, clamp, fract, grid, hash, kick, mix, noise, pixels, seconds, smooth, stroke, tri, type Builder, type Pixels} from './cell-canvas.js';
import {season} from './festive-receivers.js';

const disc = (p: Pixels, cx: number, cy: number, rx: number, ry: number, color: (dx: number, dy: number, x: number, y: number) => string | undefined): void => {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const tone = color(dx, dy, x, y);
    if (tone) p.px(x, y, tone);
  }
};
const wash = (p: Pixels, color: (y: number) => string): void => { for (let y = 0; y < p.ph; y++) { const tone = color(y); for (let x = 0; x < p.pw; x++) p.px(x, y, tone); } };
const under = (p: Pixels, x: number, y: number, fallback: string): string => p.at(Math.round(x), Math.round(y)) ?? fallback;

// Moon jellies rising through dark water: each bell squeezes, coasts, and trails its threads behind it.
const moonJellies: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const deep = (y: number): string => mix('#02060f', mix(panelBackground, g.paint.fan(-0.6), 0.35), 1 - y / p.ph);
  wash(p, deep);
  for (let mote = 0; mote < p.pw * p.ph / 60; mote++) p.px(Math.floor(hash(mote, 1) * p.pw), Math.floor(fract(hash(mote, 2) + t * 0.01) * p.ph), mix(deep(0), '#ffffff', 0.12));
  for (let jelly = 0; jelly < Math.max(3, Math.round(p.pw / 13)); jelly++) {
    const r = Math.max(2, p.ph * (0.09 + 0.1 * hash(jelly, 3))), beat = t * (0.7 + 0.4 * hash(jelly, 4)) + hash(jelly, 5) * 9, squeeze = Math.max(0, Math.sin(beat * TAU / 2.5)) ** 2;
    // Each squeeze buys a little height; between them it sinks back a touch.
    const lap = p.ph + r * 8, y = p.ph + r * 3 - ((t * (1.3 + hash(jelly, 6)) + hash(jelly, 7) * lap + squeeze * 2) % lap), x = (hash(jelly, 8) * p.pw + Math.sin(t * 0.3 + jelly) * 3);
    const tone = g.paint.fan(hash(jelly, 9) * 2 - 1), rx = r * (1.25 - 0.3 * squeeze), ry = r * (0.8 + 0.25 * squeeze);
    for (let thread = -2; thread <= 2; thread++) for (let s = 0; s < r * 3.2; s++) {
      const tx = x + thread * rx * 0.36 + Math.sin(s * 0.5 - beat * 2 + thread) * (0.6 + s * 0.08), ty = y + s;
      p.px(Math.round(tx), Math.round(ty), mix(under(p, tx, ty, deep(ty)), tone, 0.5 * (1 - s / (r * 3.2))));
    }
    disc(p, x, y, rx, ry, (dx, dy, px, py) => dy > 0.15 ? undefined : mix(under(p, px, py, deep(py)), mix(tone, '#ffffff', 0.45), Math.hypot(dx, dy) > 0.8 ? 0.85 : 0.3 + 0.3 * (1 + dy)));
    for (const organ of [-1, 1]) p.px(Math.round(x + organ * rx * 0.3), Math.round(y - ry * 0.4), mix(tone, '#ffffff', 0.7));
  }
  p.flush();
  return g.finish();
};

// A murmuration at dusk: thousands of small birds that fold, stretch and pour as if they were one thing.
const starlings: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const cx = b.dw * (0.5 + 0.28 * Math.sin(t * 0.23)), cy = b.dh * (0.45 + 0.2 * Math.sin(t * 0.31 + 1));
  const birds = Math.round(clamp(b.dw * b.dh / 9, 80, 900));
  for (let bird = 0; bird < birds; bird++) {
    const u = hash(bird, 1) * TAU, v = Math.sqrt(hash(bird, 2));
    // The cloud is a blob whose outline keeps changing; birds near a fold bunch together and darken it.
    const reach = b.dh * 0.62 * (0.55 + 0.45 * Math.sin(u * 2 + t * 0.9) * Math.cos(u * 3 - t * 0.5)) * (0.6 + 0.4 * noise(u * 1.3, t * 0.3, 2));
    const twist = Math.sin(t * 0.4 + v * 3) * 0.8;
    const x = cx + Math.cos(u + twist) * v * reach * 2.3 + Math.sin(t * 2 + bird) * 0.8, y = cy + Math.sin(u + twist) * v * reach * 0.9 + Math.cos(t * 2.3 + bird) * 0.6;
    b.dot(x, y, g.paint.ink(0.6 + 0.4 * (1 - v)));
  }
  for (let x = 0; x < b.dw; x++) { const tree = b.dh - 1 - Math.round(1.5 + 2.5 * noise(x * 0.08, 5)); for (let y = tree; y < b.dh; y++) b.dot(x, y, g.paint.ink(0.22)); }
  b.flush();
  return g.finish();
};

// Sky lanterns let go over water: warm paper lights climbing at their own pace, and their doubles trembling below.
const paperLanterns: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const shore = Math.round(p.ph * 0.82), sky = (y: number): string => c(mix('#050818', '#1c1a44', y / shore));
  wash(p, y => y < shore ? sky(y) : c('#04060f'));
  for (let star = 0; star < p.pw * shore / 80; star++) p.px(Math.floor(hash(star, 1) * p.pw), Math.floor(hash(star, 2) * shore * 0.7), mix(sky(0), '#ffffff', 0.25 + 0.5 * tri(t * 0.2 + hash(star, 3))));
  const lanterns = Array.from({length: Math.max(5, Math.round(p.pw / 6))}, (_, i) => ({i, near: hash(i, 4)})).sort((a, c2) => a.near - c2.near);
  for (const {i, near} of lanterns) {
    const size = 1 + near * Math.max(1.2, p.ph * 0.08), lap = shore + size * 6;
    const y = shore + size * 2 - ((t * (0.8 + near * 1.6) + hash(i, 5) * lap) % lap), x = hash(i, 6) * p.pw + Math.sin(t * 0.4 + i) * (1 + near * 2) + t * 0.3 * near;
    const lit = 0.75 + 0.25 * noise(t * 4, i), paper = c(mix('#ff8a2a', '#ffd070', near));
    disc(p, ((x % p.pw) + p.pw) % p.pw, y, size * 2.6, size * 2.4, (dx, dy, px, py) => py < shore ? mix(under(p, px, py, sky(py)), paper, 0.28 * lit * (1 - Math.hypot(dx, dy)) ** 2) : undefined);
    for (let dy = 0; dy < size * 2; dy++) for (let dx = -Math.round(size * 0.7); dx <= size * 0.7; dx++) {
      const px = Math.round(((x % p.pw) + p.pw) % p.pw) + dx, py = Math.round(y - size + dy);
      if (py < shore) p.px(px, py, mix(c('#3a1a08'), mix(paper, '#ffffff', dy > size ? 0.5 : 0.1), lit * (0.5 + 0.5 * near)));
    }
  }
  for (let y = shore; y < p.ph; y++) for (let x = 0; x < p.pw; x++) { const source = p.at(x + Math.round(Math.sin(y * 2.4 + t * 2 + x * 0.3) * 1.2), shore - 1 - (y - shore) * 4); p.px(x, y, mix(c('#04060f'), source ?? c('#04060f'), 0.45)); }
  p.flush();
  return g.finish();
};

// A pond from above: koi turning lazily under the lily pads, each one a chain of brushstrokes following its own head.
const koiPond: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, c(mix('#0a2a2e', '#124a48', noise(x * 0.07 + t * 0.05, y * 0.12, 1) * 0.8 + (noise(x * 0.3 - t * 0.3, y * 0.5, 4) > 0.78 ? 0.25 : 0))));
  const coats = [['#f4f0e6', '#ff6a1a'], ['#ff7a1a', '#f4f0e6'], ['#f4f0e6', '#14110f'], ['#ffc02a', '#ff6a1a'], ['#f4f0e6', '#e0281e']];
  for (let fish = 0; fish < Math.max(3, Math.round(p.pw * p.ph / 420)); fish++) {
    const pace = 0.16 + 0.1 * hash(fish, 1), size = Math.max(1.2, p.ph * (0.045 + 0.03 * hash(fish, 2))), coat = coats[fish % coats.length]!;
    const at = (when: number): [number, number] => [p.pw * (0.5 + 0.44 * Math.sin(when * pace + fish * 2.1) * Math.cos(when * pace * 0.37 + fish)), p.ph * (0.5 + 0.38 * Math.sin(when * pace * 1.31 + fish * 1.3))];
    for (let seg = 9; seg >= 0; seg--) {
      const [x, y] = at(t - seg * 0.22 / pace * 0.16), girth = size * (seg === 0 ? 0.85 : seg < 5 ? 1 : (10 - seg) / 6) * (seg === 9 ? 1.5 : 1);
      disc(p, x, y, girth * 1.3, girth, () => c(seg === 9 ? mix(coat[0]!, '#124a48', 0.35) : hash(fish * 7 + seg, 3) > 0.55 ? coat[1]! : coat[0]!));
    }
    const [hx, hy] = at(t); p.px(Math.round(hx), Math.round(hy), c('#14110f'));
  }
  for (let pad = 0; pad < Math.max(3, Math.round(p.pw / 14)); pad++) {
    const x = (hash(pad, 5) * p.pw + Math.sin(t * 0.1 + pad) * 2), y = hash(pad, 6) * p.ph, r = Math.max(2, p.ph * (0.08 + 0.05 * hash(pad, 7))), notch = hash(pad, 8) * TAU;
    disc(p, x, y, r * 1.4, r, (dx, dy) => Math.abs(Math.atan2(dy, dx) - notch + Math.PI) % TAU < 0.35 ? undefined : c(mix('#2f8a3e', '#1d5e2c', Math.hypot(dx, dy))));
    if (hash(pad, 9) > 0.6) disc(p, x, y, r * 0.5, r * 0.4, (dx, dy) => c(mix('#ffd0e0', '#ff7ab0', Math.hypot(dx, dy))));
  }
  p.flush();
  return g.finish();
};

// The molecule turning on its axis: two strands trading places, and the rungs between them coming round in four colours.
const doubleHelix: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const mid = b.dh / 2 - 0.5, swing = b.dh * 0.4, pitch = TAU / Math.max(18, b.dh * 1.4);
  const beads: [number, number, boolean][] = [];
  for (let x = 0; x < b.dw; x++) {
    const a = x * pitch + t * 1.2, y1 = mid + Math.sin(a) * swing, y2 = mid - Math.sin(a) * swing, front = Math.cos(a) > 0;
    if (x % 5 === 2) { const base = g.paint.fan([-0.9, -0.3, 0.3, 0.9][Math.floor(hash(Math.floor(x / 5) + Math.floor(t * 0.05), 1) * 4)]!); b.line(x, y1, x, mid, mix(panelBackground, base, 0.75)); b.line(x, mid, x, y2, mix(panelBackground, g.paint.fan(-0.6), 0.55)); }
    for (const [y, near] of [[y1, front], [y2, !front]] as const) { b.dot(x, y, near ? mix(g.paint.accent, '#ffffff', 0.35) : g.paint.ink(0.4)); if (near) b.dot(x, y + (y < mid ? 1 : -1), g.paint.accent); }
    if (x % 10 === 5) beads.push([x, front ? y1 : y2, true]);
  }
  b.flush();
  for (const [x, y] of beads) g.set(Math.floor(x / 2), Math.floor(y / 4), '●', mix(g.paint.accent, '#ffffff', 0.5 + 0.3 * kick(t)), undefined, true);
  return g.finish();
};

// A row of pendulums, each a little quicker than the last: they fall out of step into waves, then knots, then back into line.
const pendulumWave: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const count = Math.max(6, Math.min(28, Math.floor(p.pw / 5))), pitch = p.pw / count, r = Math.max(1, Math.min(pitch * 0.42, p.ph * 0.09)), mid = p.ph * 0.56, swing = p.ph * 0.36;
  for (let x = 0; x < p.pw; x++) p.px(x, 1, g.paint.ink(0.55));
  for (let i = 0; i < count; i++) {
    // Over one sixty-second cycle, pendulum i makes 30 + i swings, so they all come home together.
    const y = mid + Math.cos(TAU * (30 + i) * (t / 60)) * swing, x = (i + 0.5) * pitch, tone = g.paint.fan(i / (count - 1) * 2 - 1);
    for (let s = 2; s < y - r; s++) p.px(Math.round(x), s, g.paint.ink(0.16));
    disc(p, x, y, r * 1.25, r, (dx, dy) => mix('#000000', Math.hypot(dx + 0.35, dy + 0.4) < 0.3 ? '#ffffff' : tone, clamp(0.75 - dx * 0.25 - dy * 0.35)));
  }
  p.flush();
  return g.finish();
};

// A mandala drawn ring by ring from the middle, each ring turning against its neighbours, then swept away.
const mandala: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const local = (t + 4) % 32, rings = 7, most = Math.min(b.dh * 0.49, b.dw * 0.3), cx = b.dw / 2 - 0.5, cy = b.dh / 2 - 0.5, fade = 1 - smooth((local - 29) / 3);
  for (let ring = 0; ring < rings; ring++) {
    const drawn = clamp((local - ring * 2.4) / 2.4);
    if (drawn <= 0) continue;
    const base = most * (ring + 1) / rings, petals = 6 * (1 + (ring % 3)), turn = t * 0.1 * (ring % 2 ? -1 : 1), tone = mix(panelBackground, g.paint.fan(ring / (rings - 1) * 2 - 1), fade);
    const steps = Math.ceil(base * 14);
    for (let i = 0; i <= steps * drawn; i++) {
      const a = i / steps * TAU, lobe = Math.abs(Math.sin(a * petals / 2));
      // Odd rings are scalloped, even rings pointed; a plain circle closes each one.
      const r = base * (ring % 2 ? 0.82 + 0.18 * lobe : 0.82 + 0.18 * lobe ** 3);
      b.dot(cx + Math.cos(a + turn) * r * 1.6, cy + Math.sin(a + turn) * r, tone);
      if (i % 3 === 0) b.dot(cx + Math.cos(a) * base * 0.8 * 1.6, cy + Math.sin(a) * base * 0.8, mix(panelBackground, tone, 0.45));
    }
  }
  b.flush();
  g.set(Math.floor(cx / 2), Math.floor(cy / 4), '✦', mix(panelBackground, '#ffffff', fade), undefined, true);
  return g.finish();
};

// A sheet of bubble wrap, and somebody who cannot leave it alone: pop, pop, pop, until there is nothing left and a fresh sheet arrives.
const bubbleWrap: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const epoch = Math.floor(t / 26), local = t - epoch * 26, slide = local > 24 ? Math.round(smooth((local - 24) / 2) * g.w) : 0;
  for (let y = 0; y < g.h; y++) for (let x = y % 2; x < g.w; x += 2) {
    const fresh = x < slide, due = hash(x * 31 + y, epoch + 1) * 22;
    // A finger works across the sheet in patches rather than rows.
    const order = due * 0.5 + (noise(x * 0.12, y * 0.3, epoch) * 22) * 0.5, since = local - order;
    if (fresh || since < 0) g.set(x, y, '◯', g.paint.ink(0.75));
    else if (since < 0.16) g.set(x, y, '✳', '#ffffff', undefined, true);
    else g.set(x, y, '·', g.paint.ink(0.22));
  }
  if (g.w > 24 && g.h > 2) { let popped = 0, total = 0; for (let y = 0; y < g.h; y++) for (let x = y % 2; x < g.w; x += 2) { total++; if (local > hash(x * 31 + y, epoch + 1) * 11 + noise(x * 0.12, y * 0.3, epoch) * 11) popped++; } g.write(g.w - 12, g.h - 1, ` ${String(popped).padStart(3)} / ${total} `, panelBackground, g.paint.accent); }
  return g.finish();
};

// Turbines on a ridge: blades sweeping round faster when the wind gets up, and the cloud shadows sliding underneath.
const windTurbines: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const sky = (y: number): string => c(mix('#3f7fc4', '#bfe0f5', y / p.ph));
  wash(p, sky);
  for (let cloud = 0; cloud < 5; cloud++) { const cx = ((hash(cloud, 1) * p.pw + t * (1.5 + cloud * 0.5)) % (p.pw + 30)) - 15, cy = p.ph * (0.1 + 0.3 * hash(cloud, 2)); for (const [dx, r] of [[-4, 1.6], [0, 2.4], [5, 1.8]] as const) disc(p, cx + dx, cy, r * 1.7, r * 0.7, () => c('#ffffff')); }
  const ridge = (x: number, layer: number): number => p.ph * (0.7 + layer * 0.12) - Math.sin(x * 0.03 + layer * 4) * p.ph * 0.07 - Math.sin(x * 0.08 + layer) * p.ph * 0.03;
  for (let layer = 0; layer < 2; layer++) for (let x = 0; x < p.pw; x++) for (let y = Math.round(ridge(x, layer)); y < p.ph; y++) p.px(x, y, c(mix(layer ? '#4f9a4a' : '#7ab86a', '#2a5a30', clamp((y - ridge(x, layer)) / (p.ph * 0.3)) + (noise((x - t * 3) * 0.04, y * 0.2, 6) > 0.62 ? 0.18 : 0))));
  const wind = 0.6 + 0.8 * noise(t * 0.15, 3);
  for (let mill = 0; mill < Math.max(2, Math.round(p.pw / 22)); mill++) {
    const x = (mill + 0.5) * p.pw / Math.max(2, Math.round(p.pw / 22)) + (hash(mill, 4) - 0.5) * 6, foot = ridge(x, 0), tall = p.ph * (0.32 + 0.14 * hash(mill, 5)), hubY = foot - tall, blade = tall * 0.6;
    stroke(p, x, foot, x, hubY, 0.6, c('#f2f4f6'));
    const turn = t * 2.4 * wind + mill * 0.9;
    for (let n = 0; n < 3; n++) stroke(p, x, hubY, x + Math.cos(turn + n * TAU / 3) * blade * 1.25, hubY + Math.sin(turn + n * TAU / 3) * blade, 0.45, c('#ffffff'));
    disc(p, x, hubY, 1.3, 1.1, () => c('#c8ccd2'));
  }
  p.flush();
  return g.finish();
};

// A balloon festival at first light: striped envelopes hanging in the still air, a burner flaring here and there.
const balloonFiesta: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const sky = (y: number): string => c(y < p.ph * 0.5 ? mix('#3a4f9a', '#f09a7a', y / (p.ph * 0.5)) : mix('#f09a7a', '#ffe0a0', (y - p.ph * 0.5) / (p.ph * 0.5)));
  wash(p, sky);
  for (let x = 0; x < p.pw; x++) for (let y = Math.round(p.ph * 0.9 - noise(x * 0.04, 2) * p.ph * 0.12); y < p.ph; y++) p.px(x, y, c('#3a2a4a'));
  const stripes = [['#e8382e', '#ffd23a'], ['#2f6fd8', '#f2f2f2'], ['#8a2a8a', '#ffb0d0'], ['#2fa85a', '#ffe9a0'], ['#ff7a1a', '#2a2a6a'], ['#e8382e', '#2f6fd8']];
  const fleet = Array.from({length: Math.max(3, Math.round(p.pw / 13))}, (_, i) => ({i, near: hash(i, 1)})).sort((a, b2) => a.near - b2.near);
  for (const {i, near} of fleet) {
    const r = Math.max(1.5, p.ph * (0.07 + 0.13 * near)), x = ((hash(i, 2) * p.pw + t * (0.3 + near * 0.8)) % (p.pw + r * 4)) - r * 2, y = p.ph * (0.2 + 0.5 * hash(i, 3)) + Math.sin(t * 0.3 + i) * (1 + near * 2), pair = stripes[i % stripes.length]!;
    const burn = hash(i, Math.floor(t / 1.7 + hash(i, 4) * 9)) > 0.72 ? 1 : 0;
    // The envelope is a ball drawn out to a point underneath; gores alternate two colours round it.
    for (let dy = -r; dy <= r * 1.5; dy++) {
      const half = dy < 0 ? Math.sqrt(1 - (dy / r) ** 2) * r * 1.15 : r * 1.15 * (1 - dy / (r * 1.5)) ** 0.7;
      for (let dx = -half; dx <= half; dx++) { const gore = Math.floor((Math.asin(clamp(dx / (half + 0.01), -1, 1)) / Math.PI + 0.5) * 6); p.px(Math.round(x + dx), Math.round(y + dy), mix(c(mix(pair[gore % 2]!, sky(y), (1 - near) * 0.4)), '#ffe0a0', burn * 0.35 * (dy > 0 ? 1 : 0.4))); }
    }
    for (const rope of [-1, 1]) p.px(Math.round(x + rope * r * 0.2), Math.round(y + r * 1.5) + 1, c('#3a2a1a'));
    for (let dx = -Math.max(0, Math.round(r * 0.25)); dx <= r * 0.25; dx++) p.px(Math.round(x) + dx, Math.round(y + r * 1.5) + 2, c('#6b4a2d'));
    if (burn) p.px(Math.round(x), Math.round(y + r * 1.5), c('#fff3a0'));
  }
  p.flush();
  return g.finish();
};

// A comet rounding the sun: a bright head, a curved veil of dust, and a straight blue thread pointing dead away from the light.
const comet: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const night = (y: number): string => mix('#02030a', mix(panelBackground, g.paint.fan(-0.7), 0.2), y / p.ph);
  wash(p, night);
  for (let star = 0; star < p.pw * p.ph / 55; star++) p.px(Math.floor(hash(star, 1) * p.pw), Math.floor(hash(star, 2) * p.ph), mix(night(0), '#ffffff', 0.15 + 0.6 * hash(star, 3) * tri(t * 0.15 + hash(star, 4))));
  const way = fract(t / 28), a = Math.PI * (1.1 - way * 1.2), hx = p.pw * 0.5 + Math.cos(a) * p.pw * 0.55, hy = p.ph * 1.25 + Math.sin(a) * p.ph * 1.05;
  // The sun is below and off to the left of frame; both tails lean away from it, the dust one lagging along the orbit.
  const awayX = hx - p.pw * 0.5, awayY = hy - p.ph * 1.6, far = Math.hypot(awayX, awayY) || 1, ax = awayX / far, ay = awayY / far, lagX = -Math.sin(a), lagY = Math.cos(a);
  const long = p.pw * 0.5;
  for (let k = 0; k < long * 5; k++) {
    const s = hash(k, 5) ** 1.6 * long, spread = (hash(k, 6) - 0.5) * s * 0.34;
    const x = hx + ax * s + lagX * s * s / long * -0.5 + -ay * spread, y = hy + ay * s * 0.6 + lagY * s * s / long * -0.3 + ax * spread * 0.6;
    p.px(Math.round(x), Math.round(y), mix(under(p, x, y, night(y)), '#fff0c8', 0.4 * (1 - s / long) ** 1.5));
  }
  for (let s = 0; s < long * 1.25; s++) { const x = hx + ax * s, y = hy + ay * s * 0.6 + Math.sin(s * 0.3 - t * 3) * 0.3; p.px(Math.round(x), Math.round(y), mix(under(p, x, y, night(y)), g.paint.fan(-0.8), 0.7 * (1 - s / (long * 1.25)))); }
  disc(p, hx, hy, 3.4, 2.6, (dx, dy, x, y) => mix(under(p, x, y, night(y)), '#ffffff', (1 - Math.hypot(dx, dy)) ** 1.2));
  p.flush();
  return g.finish();
};

// A dark beach where the sea lights up when it moves: every breaking wave a line of cold blue fire that fades on the sand.
const bioluminescence: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const horizon = Math.round(p.ph * 0.3), sand = Math.round(p.ph * 0.9), glow = theme === 'mono' ? '#e0e0e0' : mix('#35e8ff', g.paint.accent, 0.25);
  wash(p, y => y < horizon ? mix('#02030a', '#0a1024', y / horizon) : y < sand ? mix('#03060f', '#020409', (y - horizon) / (sand - horizon)) : '#0c0b0a');
  for (let star = 0; star < p.pw * horizon / 40; star++) p.px(Math.floor(hash(star, 1) * p.pw), Math.floor(hash(star, 2) * horizon), mix('#0a1024', '#ffffff', 0.2 + 0.6 * tri(t * 0.2 + hash(star, 3))));
  for (let wave = 0; wave < 5; wave++) {
    const run = fract(t * 0.07 + wave / 5), near = run ** 1.7;
    for (let x = 0; x < p.pw; x++) {
      const y = horizon + near * (sand - horizon) + Math.sin(x * 0.07 + wave * 2 + t * 0.3) * (1 + near * 2);
      // Far out it is a faint thread; as it steepens it brightens, and the last few rows are all sparks.
      const thick = 1 + Math.round(near * 3);
      for (let d = 0; d < thick; d++) { const spark = hash(x * 3 + d, Math.floor(t * 9) + wave); p.px(x, Math.round(y) + d, mix(under(p, x, y + d, '#03060f'), glow, clamp((0.15 + near * 0.95) * (d === 0 ? 1 : 0.55) * (near > 0.75 ? 0.35 + spark : 0.7 + 0.3 * spark)))); }
      if (near > 0.82 && hash(x, wave + Math.floor(t * 4)) > 0.7) for (let d = 0; d < 3; d++) p.px(x, Math.min(p.ph - 1, Math.round(y) + thick + d), mix('#0c0b0a', glow, 0.5 * (1 - d / 3)));
    }
  }
  // Footprints: someone has walked along the wet sand, and each step is still glowing.
  for (let step = 0; step < p.pw / 5; step++) { const age = fract(t * 0.05 - step / (p.pw / 5)); p.px(step * 5 + (step % 2), sand + 1 + (step % 2), mix('#0c0b0a', glow, (1 - age) ** 3)); }
  p.flush();
  return g.finish();
};

export const museReceiverBuilders = {
  'moon-jellies': moonJellies,
  starlings,
  'paper-lanterns': paperLanterns,
  'koi-pond': koiPond,
  'double-helix': doubleHelix,
  'pendulum-wave': pendulumWave,
  mandala,
  'bubble-wrap': bubbleWrap,
  'wind-turbines': windTurbines,
  'balloon-fiesta': balloonFiesta,
  comet,
  bioluminescence
};

import {panelBackground} from '../theme.js';
import {TAU, band, braille, clamp, fract, grid, hash, kick, mix, pixels, seconds, smooth, tri, type Builder, type Pixels} from './cell-canvas.js';
import {lettering} from './festive-receivers.js';

const pad = (n: number, width: number): string => String(Math.floor(n)).padStart(width, '0');
const fold = (distance: number, range: number): number => range > 0 ? range - Math.abs(((distance % (2 * range)) + 2 * range) % (2 * range) - range) : 0;
const stamp = (p: Pixels, rows: readonly string[], left: number, top: number, color: string): void => {
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== ' ') p.px(Math.round(left) + x, Math.round(top) + y, color); });
};
const digits = (p: Pixels, text: string, left: number, top: number, scale: number, color: string): void => {
  for (let y = 0; y < 5 * scale; y++) for (let x = 0; x < (text.length * 6 - 1) * scale; x++) if (lettering(text, Math.floor(x / scale), Math.floor(y / scale))) p.px(left + x, top + y, color);
};

const INVADER = [['  x   x  ', '   xxx   ', '  xxxxx  ', ' xx x xx ', ' x     x '], ['  x   x  ', 'x  xxx  x', 'x xxxxx x', ' xx x xx ', '  x   x  ']] as const;

// The ranks come down a step at a time; the cannon underneath picks them off one by one, and then a fresh wave arrives.
const spaceInvaders: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const local = t % 40, wave = Math.floor(t / 40), step = Math.floor(local * 2);
  const columns = Math.max(1, Math.floor(p.pw * 0.7 / 11)), ranks = Math.max(1, Math.min(4, Math.floor((p.ph - 9) / 7)));
  const range = Math.max(1, p.pw - columns * 11 - 2), march = fold(step * 2, range) + 1, sink = Math.min(Math.floor(step * 2 / range), Math.max(0, p.ph - 9 - ranks * 7));
  const order = Array.from({length: columns * ranks}, (_, i) => i).sort((a, b) => hash(a, wave + 1) - hash(b, wave + 1));
  const fallen = Math.min(order.length, Math.floor(local / 36 * order.length));
  const target = order[fallen] ?? order[0]!;
  order.forEach((id, n) => {
    const x = march + (id % columns) * 11, y = 1 + sink + Math.floor(id / columns) * 7;
    if (n < fallen - 1) return;
    if (n === fallen - 1) { for (let spark = 0; spark < 8; spark++) p.px(x + 4 + Math.round((hash(spark, n) - 0.5) * 10), y + 2 + Math.round((hash(spark + 9, n) - 0.5) * 6), '#ffffff'); return; }
    stamp(p, INVADER[step & 1]!, x, y, g.paint.fan(Math.floor(id / columns) / Math.max(1, ranks - 1) * 1.6 - 0.8));
  });
  // The cannon slides under whichever invader is next, and its shot takes the rest of the interval to climb.
  const gunX = march + (target % columns) * 11 + 4, shot = fract(local / 36 * order.length);
  stamp(p, ['  x  ', ' xxx ', 'xxxxx'], gunX - 2, p.ph - 3, g.paint.accent);
  if (fallen < order.length) for (let dy = 0; dy < 2; dy++) p.px(gunX, Math.round(p.ph - 4 - shot * (p.ph - 6 - sink - Math.floor(target / columns) * 7)) - dy, '#ffffff');
  for (let shield = 0; shield < Math.floor(p.pw / 24); shield++) for (let x = 0; x < 6; x++) for (let y = 0; y < 2; y++) if (hash(shield * 9 + x, y + wave) > 0.25) p.px(12 + shield * 24 + x, p.ph - 7 + y, g.paint.ink(0.45));
  p.flush();
  if (g.w > 30) { g.write(0, 0, `SCORE ${pad(fallen * 30 + wave * 990, 5)}`, g.paint.ink(0.6)); g.write(g.w - 9, 0, `WAVE ${pad(wave % 100 + 1, 2)}`, g.paint.ink(0.6)); }
  return g.finish();
};

// One ball, a wall of bricks, and a bat that is always where it needs to be.
const brickBreaker: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const local = t % 36, round = Math.floor(t / 36);
  const brickW = 5, columns = Math.floor(p.pw / brickW), rows = Math.max(1, Math.min(6, Math.floor(p.ph * 0.4 / 2)));
  const left = Math.floor((p.pw - columns * brickW) / 2), wall = 2 + rows * 2;
  const bx = 1 + fold(t * p.pw * 0.31 + 5, p.pw - 3);
  for (let brick = 0; brick < columns * rows; brick++) {
    // Lower rows go first: a brick lasts as long as its place in the queue.
    const row = Math.floor(brick / columns), due = (1 - row / rows) * 0.55 + hash(brick, round + 3) * 0.45;
    // The last few bricks are still standing when the wall is rebuilt.
    if (due < Math.min(0.9, local / 32)) continue;
    const tone = g.paint.fan(row / Math.max(1, rows - 1) * 2 - 1);
    for (let x = 0; x < brickW - 1; x++) { p.px(left + (brick % columns) * brickW + x, 2 + row * 2, tone); p.px(left + (brick % columns) * brickW + x, 3 + row * 2, mix(tone, '#000000', 0.3)); }
  }
  for (let x = -3; x <= 3; x++) p.px(Math.round(clamp(bx, 4, p.pw - 5)) + x, p.ph - 2, g.paint.ink(0.95));
  for (let tail = 3; tail >= 0; tail--) p.px(Math.round(1 + fold((t - tail * 0.02) * p.pw * 0.31 + 5, p.pw - 3)), Math.round(wall + fold((t - tail * 0.02) * p.ph * 0.9, Math.max(1, p.ph - wall - 4))), tail ? mix(panelBackground, g.paint.accent, 0.5 - tail * 0.12) : '#ffffff');
  p.flush();
  return g.finish();
};

const EATER = [[' xxx ', 'xxxxx', 'xxxxx', 'xxxxx', ' xxx '], [' xxx ', 'xxxx ', 'xxx  ', 'xxxx ', ' xxx ']] as const;
const GHOST = [' xxx ', 'xxxxx', 'x x x', 'xxxxx', 'x x x'] as const;

// A yellow mouth working its way along the corridors, four ghosts in tow, and the tables turning whenever it finds a big dot.
const mazeChase: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const lanes = Math.max(1, Math.floor(p.ph / 9)), laneH = p.ph / lanes, run = p.pw - 8, lap = lanes * run;
  const at = (distance: number): [number, number, boolean] => {
    const d = ((distance % lap) + lap) % lap, lane = Math.floor(d / run), along = d - lane * run, back = lane % 2 === 1;
    return [4 + (back ? run - along : along), Math.round((lane + 0.5) * laneH), back];
  };
  const wall = g.paint.fan(-0.8);
  for (let lane = 0; lane <= lanes; lane++) for (let x = 0; x < p.pw; x++) {
    const y = Math.min(p.ph - 1, Math.round(lane * laneH));
    // Each wall has a gap at alternate ends, where the corridor turns back on itself.
    if (lane > 0 && lane < lanes && (lane % 2 ? x > p.pw - 9 : x < 8)) continue;
    p.px(x, y, wall);
  }
  const head = t * 22, scared = fract(t / 9) > 0.7;
  for (let d = 0; d < lap; d += 6) {
    const ahead = ((d - head) % lap + lap) % lap;
    if (ahead < 2) continue;
    const [x, y] = at(d), big = d % 96 === 0;
    if (ahead < lap * 0.85) { p.px(Math.round(x), y, big ? '#ffffff' : g.paint.ink(0.7)); if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) p.px(Math.round(x) + dx, y + dy, '#ffffff'); }
  }
  ['#ff4a4a', '#ffb0e0', '#4ae0ff', '#ffb040'].forEach((tone, n) => {
    const [x, y] = at(head - 12 - n * 9 + (scared ? -Math.sin(t * 3) * 3 : 0));
    stamp(p, GHOST, x - 2, y - 2, scared ? (fract(t * 4) < 0.5 ? '#3a50ff' : '#e8e8ff') : theme === 'mono' ? g.paint.ink(0.5 + n * 0.12) : tone);
  });
  const [ex, ey, back] = at(head);
  stamp(p, EATER[Math.floor(t * 8) & 1]!.map(row => back ? [...row].reverse().join('') : row), ex - 2, ey - 2, theme === 'mono' ? '#ffffff' : '#ffe000');
  p.flush();
  return g.finish();
};

// Vector rocks tumbling across a black screen, and a small ship in the middle turning to meet them.
const asteroids: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const cx = b.dw / 2, cy = b.dh / 2, line = g.paint.ink(0.9);
  const wrap = (v: number, size: number): number => ((v % size) + size) % size;
  for (let rock = 0; rock < Math.max(3, Math.round(b.dw * b.dh / 1400)); rock++) {
    const size = (rock % 3 === 0 ? 0.2 : rock % 3 === 1 ? 0.13 : 0.08) * b.dh;
    const x = wrap(hash(rock, 1) * b.dw + t * (hash(rock, 2) - 0.5) * 18, b.dw + size * 2) - size, y = wrap(hash(rock, 3) * b.dh + t * (hash(rock, 4) - 0.5) * 10, b.dh + size * 2) - size;
    const corner = (i: number): [number, number] => {
      const a = i / 9 * TAU + t * (hash(rock, 5) - 0.5), r = size * (0.7 + 0.3 * hash(rock * 11 + (i % 9), 6));
      return [x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r];
    };
    for (let i = 0; i < 9; i++) { const [x0, y0] = corner(i), [x1, y1] = corner(i + 1); b.line(x0, y0, x1, y1, g.paint.ink(0.6)); }
  }
  // The ship swings back and forth across the field of fire, and every shot keeps the heading it left with.
  const aim = (when: number): number => Math.sin(when * 0.45) * 2.6 + when * 0.2;
  const a = aim(t), nose = b.dh * 0.14;
  const point = (turn: number, r: number): [number, number] => [cx + Math.cos(a + turn) * r, cy + Math.sin(a + turn) * r];
  const tip = point(0, nose), port = point(2.5, nose * 0.8), star = point(-2.5, nose * 0.8), tail = point(Math.PI, nose * 0.3);
  for (const [from, to] of [[tip, port], [port, tail], [tail, star], [star, tip]] as const) b.line(from[0], from[1], to[0], to[1], mix(g.paint.accent, '#ffffff', 0.4));
  if (kick(t * 2) > 0.5) { const flame = point(Math.PI, nose * 0.9); b.line(tail[0], tail[1], flame[0], flame[1], g.paint.fan(0.9)); }
  for (let shot = Math.floor(t / 0.35); shot > Math.floor(t / 0.35) - 7; shot--) {
    const fired = shot * 0.35, far = nose + (t - fired) * b.dh * 1.1, heading = aim(fired);
    b.dot(cx + Math.cos(heading) * far, cy + Math.sin(heading) * far, line); b.dot(cx + Math.cos(heading) * (far + 1), cy + Math.sin(heading) * (far + 1), line);
  }
  b.flush();
  if (g.w > 20) g.write(1, 0, pad(t * 13, 6), g.paint.ink(0.5));
  return g.finish();
};

// A handheld with a liquid-crystal picture: everything it can show is printed on the glass, and only one pose of each is ever dark.
const lcdGame: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const glassTone = mix(panelBackground, '#a9b89a', 0.86), ghost = mix(glassTone, '#000000', 0.07), dark = '#161c14';
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, glassTone);
  const tick = Math.floor(t * 2), cx = p.pw / 2, floor = p.ph - 2, reach = Math.min(p.pw * 0.36, p.ph * 1.6), lift = Math.max(3, p.ph - 12);
  // Nine places a ball can be, on an arc from one hand to the other; three balls step round it out of phase.
  const place = (n: number): [number, number] => { const a = Math.PI * (1 - n / 8); return [cx + Math.cos(a) * reach, floor - 6 - Math.sin(a) * lift]; };
  const lit = new Set([0, 1, 2].map(ball => { const k = (tick + ball * 5) % 16; return k < 9 ? k : 16 - k; }));
  for (let n = 0; n < 9; n++) { const [x, y] = place(n); stamp(p, [' xx ', 'xxxx', 'xxxx', ' xx '], x - 2, y - 2, lit.has(n) ? dark : ghost); }
  const hands = lit.has(0) ? -1 : lit.has(8) ? 1 : 0;
  for (const pose of [-1, 0, 1]) {
    const tone = pose === hands ? dark : ghost;
    for (const side of [-1, 1]) {
      const hx = cx + side * (reach - 1) + pose * 2, hy = floor - 4 - (side === pose ? 2 : 0);
      for (let s = 0; s <= 6; s++) p.px(Math.round(cx + side * 2 + (hx - cx - side * 2) * s / 6), Math.round(floor - 6 + (hy - floor + 6) * s / 6), tone);
    }
  }
  stamp(p, [' xxx ', ' xxx ', '  x  ', 'xxxxx', ' xxx ', ' xxx ', ' x x ', 'xx xx'], cx - 2, floor - 9, dark);
  for (let x = 0; x < p.pw; x++) p.px(x, floor, dark);
  digits(p, pad(tick % 1000, 3), p.pw - 20, 1, 1, dark);
  if (p.pw > 50) digits(p, 'GAME A', 2, 1, 1, dark);
  p.flush();
  return g.finish();
};

const TRACKS: [string, (step: number, bar: number) => boolean][] = [
  ['KICK ', step => step % 4 === 0], ['SNARE', step => step % 8 === 4], ['HAT  ', step => step % 2 === 0], ['OPEN ', step => step % 8 === 6],
  ['CLAP ', (step, bar) => step % 8 === 4 && bar % 2 === 1], ['TOM  ', (step, bar) => bar % 4 === 3 && step > 11], ['COW  ', (step, bar) => hash(step, bar % 4 + 9) > 0.86], ['BASS ', (step, bar) => hash(step, bar % 2 + 3) > 0.6]
];

// A step sequencer: sixteen pads a row, the pattern programmed in, and a light running across in time.
const drumMachine: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const step = Math.floor(t * 8) % 16, bar = Math.floor(t / 2), head = g.h >= 5 ? 1 : 0;
  const tracks = TRACKS.slice(0, Math.max(1, g.h - head)), pad2 = Math.max(2, Math.min(4, Math.floor((g.w - 7) / 16)));
  const left = Math.floor((g.w - 6 - 16 * pad2) / 2), top = head + Math.floor((g.h - head - tracks.length) / 2);
  if (head) g.write(left, 0, `120 BPM  PATTERN A${pad(bar % 4 + 1, 2)}  BAR ${pad(bar % 100, 2)}  ${'●○○○'.split('').map((_, i) => i === Math.floor(t * 2) % 4 ? '●' : '○').join('')}`.slice(0, g.w - left), g.paint.ink(0.6));
  tracks.forEach(([name, on], row) => {
    g.write(left, top + row, name, g.paint.ink(0.6));
    for (let s = 0; s < 16; s++) {
      const armed = on(s, bar), playing = s === step, tone = g.paint.fan(row / Math.max(1, tracks.length - 1) * 2 - 1);
      const back = armed ? (playing ? '#ffffff' : tone) : playing ? g.paint.ink(0.3) : s % 4 === 0 ? g.paint.ink(0.13) : g.paint.ink(0.08);
      for (let w = 0; w < pad2 - 1; w++) g.set(left + 6 + s * pad2 + w, top + row, ' ', back, back);
    }
  });
  return g.finish();
};

// A record going round at thirty-three and a third: the light lies across the grooves, the label turns, and the arm tracks inward.
const turntable: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const r = Math.max(2, Math.min(p.ph * 0.49, p.pw * 0.33)), cx = p.pw / 2 - r * 0.25, cy = p.ph / 2, spin = t * 3.49;
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, mix(panelBackground, '#3a2c20', 0.5));
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r * 1.2); x <= cx + r * 1.2; x++) {
    const dx = (x + 0.5 - cx) / 1.2, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / r;
    if (d > 1) continue;
    const a = Math.atan2(dy, dx);
    if (d < 0.07) p.px(x, y, '#c8ccd6');
    else if (d < 0.34) p.px(x, y, Math.abs(Math.sin(a - spin)) < 0.16 && d > 0.14 ? '#ffffff' : mix(g.paint.accent, '#000000', 0.15 + 0.2 * Math.sin((a - spin) * 2)));
    else {
      // Two fans of reflected light, fixed in the room; the grooves are what slides underneath them.
      const sheen = Math.max(0, Math.cos(a * 2 - 0.9)) ** 8, groove = fract(d * r * 0.9) < 0.5 ? 0.06 : 0, band2 = Math.abs(fract(d * 4.2 + 0.1) - 0.5) < 0.04 ? -0.05 : 0;
      p.px(x, y, mix('#08080a', '#c9ced8', clamp(0.05 + groove + band2 + sheen * 0.55 * (0.7 + 0.3 * Math.sin(d * r * 3)))));
    }
  }
  const pivot: [number, number] = [cx + r * 1.45, cy - r * 0.85], inward = 0.92 - 0.5 * fract(t / 120), swing = Math.PI * 0.62 + (1 - inward) * 0.5 + Math.sin(t * 3.49) * 0.006;
  const needle: [number, number] = [pivot[0] + Math.cos(swing) * r * 1.5, pivot[1] + Math.sin(swing) * r * 1.5];
  for (let s = 0; s <= 40; s++) p.px(Math.round(pivot[0] + (needle[0] - pivot[0]) * s / 40), Math.round(pivot[1] + (needle[1] - pivot[1]) * s / 40), '#d8dce6');
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]] as const) { p.px(Math.round(pivot[0]) + dx, Math.round(pivot[1]) + dy, '#8a8f9a'); p.px(Math.round(needle[0]) + dx, Math.round(needle[1]) + dy, g.paint.fan(0.9)); }
  p.flush();
  return g.finish();
};

const POST = ['RadioBIOS (C) 1994 Ciphore Systems', 'CPU: 486DX2 at 66 MHz', '', 'Memory Test: @ OK', '', 'Detecting IDE Primary Master ... WDC AC2850', 'Detecting IDE Primary Slave  ... None', 'Detecting Sound Card ......... SB16 at 220h IRQ 5', 'Detecting Tuner .............. FM/AM/SW ready', '', 'Starting RADIO-DOS...', '', 'HIMEM is testing extended memory...done.', 'C:\\>radiocli', '', '   R A D I O C L I', '   tuning in the world', ''];

// The machine waking up: a memory count racing to its total, a roll-call of hardware, then the prompt and the one command worth typing.
const bootSequence: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const local = t % 26, shown = Math.floor(local / 0.8), first = Math.max(0, Math.min(shown, POST.length) - g.h + 1);
  for (let row = 0; row < g.h; row++) {
    const index = first + row;
    if (index > shown || index >= POST.length) continue;
    const age = local - index * 0.8;
    let line = POST[index]!;
    if (line.includes('@')) line = line.replace('@', `${pad(Math.min(16384, age * 9000), 5)}K`);
    // The command at the prompt is typed by hand; everything else appears as fast as the machine can print it.
    if (line.startsWith('C:')) line = 'C:\\>' + 'radiocli'.slice(0, Math.floor(age * 6));
    const banner = line.startsWith('   ');
    g.write(0, row, line.slice(0, g.w), banner ? g.paint.accent : index === 0 ? g.paint.ink(1) : g.paint.ink(0.72));
    if (index === Math.min(shown, POST.length - 1) && fract(t * 2) < 0.5) g.set(Math.min(g.w - 1, line.length), row, '▁', g.paint.ink(1));
  }
  if (g.w > 60 && shown < 10) { g.write(g.w - 22, 0, '┌─────────────────┐', g.paint.fan(0.7)); g.write(g.w - 22, 1, '│ ENERGY ★ SAVER  │', g.paint.fan(0.7)); g.write(g.w - 22, 2, '└─────────────────┘', g.paint.fan(0.7)); }
  return g.finish();
};

const PAYLOAD = 'Now playing on RadioCLI. Stay tuned for more music from around the world. ';

// A hex editor paging through the stream: offsets on the left, bytes in the middle, and whatever text they spell on the right.
const hexDump: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const per = g.w >= 76 ? 16 : g.w >= 44 ? 8 : 4, firstRow = Math.floor(t * 3), cursor = Math.floor(t * 9);
  const byte = (at: number): number => hash(Math.floor(at / 97), 5) > 0.4 ? PAYLOAD.charCodeAt(at % PAYLOAD.length) : Math.floor(hash(at, 6) * 256);
  for (let row = 0; row < g.h; row++) {
    const base = (firstRow + row) * per;
    g.write(0, row, base.toString(16).toUpperCase().padStart(6, '0'), g.paint.ink(0.4));
    for (let i = 0; i < per; i++) {
      const at = base + i, value = byte(at), here = at === firstRow * per + cursor % (per * g.h);
      const printable = value >= 32 && value < 127, x = 8 + i * 3 + (i >= per / 2 ? 1 : 0);
      const tone = here ? panelBackground : value === 0 ? g.paint.ink(0.2) : printable ? g.paint.ink(0.8) : g.paint.fan(value / 128 - 1);
      g.write(x, row, value.toString(16).toUpperCase().padStart(2, '0'), tone, here ? g.paint.accent : undefined);
      g.set(8 + per * 3 + 3 + i, row, printable ? String.fromCharCode(value) : '.', here ? panelBackground : printable ? g.paint.accent : g.paint.ink(0.25), here ? g.paint.accent : undefined);
    }
    g.set(8 + per * 3 + 2, row, '│', g.paint.ink(0.25));
  }
  return g.finish();
};

// A mileage counter: the last wheel never stops, and each wheel to its left only turns while the one beside it passes nine.
const odometer: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const wheels = Math.max(2, Math.min(7, Math.floor(p.pw / 14))), scale = Math.max(1, Math.floor(Math.min((p.ph - 4) / 7, p.pw / (wheels * 7.5))));
  const cellW = 7 * scale, cellH = 7 * scale, left = Math.floor((p.pw - wheels * cellW) / 2), top = Math.floor((p.ph - cellH) / 2);
  const value = 12345.6 * 10 + t * 4.3;
  for (let wheel = 0; wheel < wheels; wheel++) {
    const place = wheels - 1 - wheel, turns = value / 10 ** place;
    // A wheel shows its whole digit until the wheel to its right is in the last tenth of a turn, then rolls with it.
    const lower = place === 0 ? fract(turns) : clamp((fract(turns) * 10 - 9));
    const digit = Math.floor(turns) % 10, roll = place === 0 ? fract(turns) : smooth(lower);
    const paper = place === 0 ? '#e8e2d0' : '#14161a', ink = place === 0 ? '#c0281e' : '#f0ece0';
    for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW - 1; x++) {
      const drum = 1 - Math.abs(y / (cellH - 1) - 0.5) * 0.9, fy = y + roll * cellH;
      const which = fy >= cellH ? (digit + 1) % 10 : digit, gy = Math.floor((fy % cellH) / scale) - 1, gx = Math.floor(x / scale) - 1;
      p.px(left + wheel * cellW + x, top + y, mix('#000000', gx >= 0 && gx < 5 && lettering(String(which), gx, gy) ? ink : paper, 0.35 + 0.65 * drum));
    }
  }
  for (let x = left - 2; x < left + wheels * cellW + 1; x++) { p.px(x, top - 1, g.paint.ink(0.5)); p.px(x, top + cellH, g.paint.ink(0.5)); }
  p.flush();
  if (g.h > Math.ceil((top + cellH) / 2) + 1) g.write(Math.floor(g.w / 2) - 6, Math.ceil((top + cellH) / 2) + 1, 'km  ●  TRIP A', g.paint.ink(0.45));
  return g.finish();
};

const MORSE: Record<string, string> = {A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..'};
const SIGNAL = 'CQ CQ CQ DE RADIOCLI ON THE AIR TONIGHT K ';
const TAPE = (() => {
  // One unit per column: dot one on, dash three on, one off between marks, three between letters, seven between words.
  const marks: number[] = [], letters: string[] = [];
  for (const char of SIGNAL) {
    if (char === ' ') { for (let i = 0; i < 4; i++) { marks.push(0); letters.push(' '); } continue; }
    const startAt = marks.length;
    for (const mark of MORSE[char]!) { for (let i = 0; i < (mark === '.' ? 1 : 3); i++) marks.push(1); marks.push(0); }
    marks.push(0, 0);
    while (letters.length < marks.length) letters.push(letters.length === startAt ? char : ' ');
  }
  return {marks, letters};
})();

// A message coming in on the wire: marks inked on a moving tape, a sounder lamp keeping time, and the letters decoded underneath.
const telegraph: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const paper = mix(panelBackground, '#eadfc4', 0.9), mid = Math.floor(g.h / 2), tapeH = Math.max(1, Math.min(3, g.h - 4)), head = g.w - 8;
  const now = Math.floor(t * 12), length = TAPE.marks.length, on = TAPE.marks[now % length] === 1;
  for (let x = 0; x < head; x++) {
    const at = ((now - (head - 1 - x)) % length + length) % length;
    for (let y = 0; y < tapeH; y++) g.set(x, mid - Math.floor(tapeH / 2) + y, ' ', paper, paper);
    if (TAPE.marks[at]) g.set(x, mid, '━', '#1d1a16', paper, true);
    if (g.h >= 5 && TAPE.letters[at] !== ' ' && now - (head - 1 - x) >= 0) g.set(x, mid + Math.floor(tapeH / 2) + 1, TAPE.letters[at]!, g.paint.accent, undefined, true);
    if (g.h >= 6 && x % 6 === 0) g.set(x, mid - Math.floor(tapeH / 2) - 1, '·', g.paint.ink(0.3));
  }
  g.write(head + 1, mid, on ? '◉' : '○', on ? '#ffd24a' : g.paint.ink(0.3));
  g.write(head + 3, mid, on ? '))) ' : '    ', g.paint.ink(0.6));
  if (g.h >= 4) g.write(Math.max(0, head - 2), Math.max(0, mid - Math.floor(tapeH / 2) - 1), '▼', g.paint.ink(0.6));
  if (g.h >= 7) g.write(1, 0, `WIRE  ${pad(12 + band(3, t) * 4, 2)} WPM  ${fract(t) < 0.5 ? 'RX' : '  '}`, g.paint.ink(0.45));
  return g.finish();
};

// The mast itself: a lattice with a red lamp on top, and the signal leaving it in rings that thin out as they go.
const radioTower: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (hash(x * 1.3, y + 31) > 0.96) g.set(x, y, '·', g.paint.ink(0.14 + 0.3 * tri(t * 0.2 + hash(x, y))));
  const cx = b.dw / 2 - 0.5, base = b.dh - 2, top = b.dh * 0.14, steel = g.paint.ink(0.7);
  const halfAt = (y: number): number => 1 + (y - top) / (base - top) * b.dh * 0.2;
  for (const side of [-1, 1]) b.line(cx + side * halfAt(top), top, cx + side * halfAt(base), base, steel);
  const bays = Math.max(3, Math.round((base - top) / 7));
  for (let bay = 0; bay < bays; bay++) {
    const y0 = top + (base - top) * bay / bays, y1 = top + (base - top) * (bay + 1) / bays;
    b.line(cx - halfAt(y1), y1, cx + halfAt(y1), y1, steel);
    b.line(cx - halfAt(y0), y0, cx + halfAt(y1), y1, g.paint.ink(0.45)); b.line(cx + halfAt(y0), y0, cx - halfAt(y1), y1, g.paint.ink(0.45));
  }
  b.line(cx, top, cx, top - b.dh * 0.1, steel);
  for (let x = 0; x < b.dw; x++) b.dot(x, b.dh - 1, g.paint.ink(0.3));
  // Rings leave the antenna twice a second; only the sideways arcs are drawn, the way a broadcast is always drawn.
  for (let ring = 0; ring < 7; ring++) {
    const age = fract(t * 0.5 + ring / 7) , r = age * b.dw * 0.5, tone = mix(panelBackground, g.paint.fan(ring % 2 ? 0.7 : -0.5), (1 - age) ** 1.3 * (0.6 + 0.4 * kick(t)));
    for (const side of [-1, 1]) for (let i = -10; i <= 10; i++) { const a = i / 10 * 0.62; b.dot(cx + side * Math.cos(a) * r, top - b.dh * 0.06 + Math.sin(a) * r * 0.9, tone); }
  }
  b.flush();
  g.set(Math.floor(cx / 2), Math.max(0, Math.floor((top - b.dh * 0.1) / 4)), '●', fract(t * 0.7) < 0.5 ? '#ff3a3a' : mix(panelBackground, '#ff3a3a', 0.25), undefined, true);
  if (g.h >= 6) for (let hut = 0; hut < g.w / 14; hut++) {
    const x = Math.round((hut + hash(hut, 3)) * 14);
    if (Math.abs(x - g.w / 2) > 8) g.write(x, g.h - 1, '▟█▙', g.paint.ink(0.3)), g.set(x + 1, g.h - 1, '▪', mix(panelBackground, '#ffd98a', 0.5 + 0.5 * hash(hut, Math.floor(t / 3))), g.paint.ink(0.3));
  }
  return g.finish();
};

export const arcadeReceiverBuilders = {
  'space-invaders': spaceInvaders,
  'brick-breaker': brickBreaker,
  'maze-chase': mazeChase,
  asteroids,
  'lcd-game': lcdGame,
  'drum-machine': drumMachine,
  turntable,
  'boot-sequence': bootSequence,
  'hex-dump': hexDump,
  odometer,
  telegraph,
  'radio-tower': radioTower
};

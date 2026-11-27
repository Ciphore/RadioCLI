import {panelBackground} from '../theme.js';
import {TAU, braille, clamp, fract, grid, hash, kick, mix, mulberry, noise, pixels, replay, seconds, smooth, tri, type Builder, type Run} from './cell-canvas.js';

const fold = (distance: number, range: number): number => range > 0 ? range - Math.abs(((distance % (2 * range)) + 2 * range) % (2 * range) - range) : 0;

const SHAPES = [[[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 0], [1, 0], [2, 0], [0, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]];
type Well = {cells: Uint8Array; piece: number[][]; kind: number; x: number; y: number; target: number; random: () => number; lines: number; flash: number[]};
const wells = new Map<string, Run<Well>>();

// Falling blocks, played by something patient: every piece is turned, steered to the lowest gap, and dropped; full rows flash and go.
const fallingBlocks: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const columns = Math.max(4, Math.min(Math.floor(g.w / 2), g.h >= 12 ? 14 : 24)), rows = Math.max(4, g.h);
  const left = Math.floor((g.w - columns * 2) / 2);
  const fits = (well: Well, piece: number[][], x: number, y: number): boolean => piece.every(([px, py]) => x + px! >= 0 && x + px! < columns && y + py! < rows && (y + py! < 0 || !well.cells[(y + py!) * columns + x + px!]));
  const turn = (piece: number[][]): number[][] => { const tall = Math.max(...piece.map(c => c[1]!)); return piece.map(([x, y]) => [tall - y!, x!]); };
  const spawn = (well: Well): void => {
    well.kind = Math.floor(well.random() * 7);
    let best = Infinity;
    let piece = SHAPES[well.kind]!;
    // Try every turn in every column; keep whichever lands lowest and leaves the fewest holes under it.
    for (let r = 0; r < 4; r++) {
      const wide = Math.max(...piece.map(c => c[0]!)) + 1;
      for (let x = 0; x <= columns - wide; x++) {
        let y = -4;
        while (fits(well, piece, x, y + 1)) y++;
        let holes = 0;
        for (const [px, py] of piece) for (let below = y + py! + 1; below < rows; below++) { if (well.cells[below * columns + x + px!] || piece.some(c => c[0] === px && y + c[1]! === below)) break; holes++; }
        const score = -y * 3 + holes * 4 + well.random() * 0.5 - piece.filter(c => y + c[1]! === rows - 1).length;
        if (score < best) { best = score; well.piece = piece; well.target = x; }
      }
      piece = turn(piece);
    }
    well.x = Math.floor(columns / 2) - 1; well.y = -2;
  };
  const tick = (well: Well): void => {
    if (well.flash.length) {
      for (const row of well.flash.sort((a, b) => a - b)) { well.cells.copyWithin(columns, 0, row * columns); well.cells.fill(0, 0, columns); }
      well.flash = []; return;
    }
    if (well.x !== well.target) well.x += Math.sign(well.target - well.x);
    if (fits(well, well.piece, well.x, well.y + 1)) { well.y++; return; }
    let over = false;
    for (const [px, py] of well.piece) { if (well.y + py! < 0) over = true; else well.cells[(well.y + py!) * columns + well.x + px!] = well.kind + 1; }
    for (let row = 0; row < rows; row++) if (well.cells.subarray(row * columns, (row + 1) * columns).every(Boolean)) { well.flash.push(row); well.lines++; }
    if (over) well.cells.fill(0);
    spawn(well);
  };
  const life = 900, step = Math.floor(pulse);
  const well = replay(wells, `${columns}x${rows}`, Math.floor(step / life), step % life, epoch => {
    const fresh: Well = {cells: new Uint8Array(columns * rows), piece: [], kind: 0, x: 0, y: 0, target: 0, random: mulberry(epoch * 3571 + columns), lines: 0, flash: []};
    spawn(fresh);
    return fresh;
  }, tick);
  const tone = (kind: number): string => g.paint.fan(kind / 3 - 1);
  const brick = (x: number, y: number, color: string): void => { if (y >= 0) { g.set(left + x * 2, y, '▐', mix(color, '#ffffff', 0.35), color); g.set(left + x * 2 + 1, y, '▌', mix(color, '#000000', 0.35), color); } };
  for (let y = 0; y < rows; y++) {
    g.set(left - 1, y, '│', g.paint.ink(0.4)); g.set(left + columns * 2, y, '│', g.paint.ink(0.4));
    for (let x = 0; x < columns; x++) {
      const kind = well.cells[y * columns + x]!;
      if (well.flash.includes(y)) brick(x, y, '#ffffff'); else if (kind) brick(x, y, tone(kind - 1)); else g.set(left + x * 2, y, '·', g.paint.ink(0.1));
    }
  }
  for (const [px, py] of well.piece) brick(well.x + px!, well.y + py!, mix(tone(well.kind), '#ffffff', 0.2));
  if (left > 14) { g.write(left + columns * 2 + 3, 1, 'LINES', g.paint.ink(0.5)); g.write(left + columns * 2 + 3, 2, String(well.lines).padStart(5, '0'), g.paint.accent); }
  return g.finish();
};

// The snake that can never lose: it follows one loop through every square, eating as it goes, until it is the whole board.
const serpent: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const columns = Math.max(2, Math.floor(g.w / 2) & ~1), rows = Math.max(2, g.h);
  const left = Math.floor((g.w - columns * 2) / 2), cells = columns * rows;
  // A comb: along the top row, then down and up the columns in pairs, back to the start.
  const at = (n: number): [number, number] => {
    const k = ((n % cells) + cells) % cells;
    if (k < columns) return [k, 0];
    const c = columns - 1 - Math.floor((k - columns) / (rows - 1)), r = (k - columns) % (rows - 1);
    return [c, (columns - 1 - c) % 2 === 0 ? 1 + r : rows - 1 - r];
  };
  const step = Math.floor(pulse * 2), lap = cells * 9, local = step % lap;
  const long = Math.min(cells - 1, 3 + Math.floor(local / 7));
  const food = at(local + 4 + ((7 - local % 7) % 7 || 7) + long * 0);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) g.set(left + x * 2, y, '·', g.paint.ink(0.1));
  g.set(left + food[0] * 2, food[1], '●', g.paint.fan(0.95), undefined, true);
  for (let n = long; n >= 0; n--) {
    const [x, y] = at(local - n), tone = n === 0 ? mix(g.paint.accent, '#ffffff', 0.5) : mix(panelBackground, g.paint.fan(tri(n * 0.03) * 1.2 - 0.6), 0.5 + 0.5 * (1 - n / (long + 1)));
    g.set(left + x * 2, y, ' ', tone, tone); g.set(left + x * 2 + 1, y, ' ', tone, tone);
  }
  return g.finish();
};

// Two paddles and a ball, rallying for ever: neither misses, and the score only goes up when the ball is feeling generous.
const paddleBall: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const ink = g.paint.ink(0.95);
  for (let y = 0; y < p.ph; y += 3) p.px(Math.floor(p.pw / 2), y, g.paint.ink(0.3));
  const bx = 3 + fold(t * p.pw * 0.42, p.pw - 7), by = fold(t * p.ph * 0.33 + 3, p.ph - 1);
  const paddle = Math.max(2, Math.round(p.ph * 0.24));
  [2, p.pw - 3].forEach((x, side) => {
    // Each paddle drifts towards the ball, a little late when the ball is far away.
    const near = side ? bx / p.pw : 1 - bx / p.pw;
    const aim = clamp(by + (1 - near) * Math.sin(t * 1.3 + side * 2) * p.ph * 0.25 - paddle / 2, 0, p.ph - paddle);
    for (let y = 0; y < paddle; y++) p.px(x, Math.round(aim) + y, ink);
  });
  for (let trail = 3; trail >= 0; trail--) {
    const tx = 3 + fold((t - trail * 0.03) * p.pw * 0.42, p.pw - 7), ty = fold((t - trail * 0.03) * p.ph * 0.33 + 3, p.ph - 1);
    p.px(Math.round(tx), Math.round(ty), trail ? mix(panelBackground, g.paint.accent, 0.5 - trail * 0.12) : mix(g.paint.accent, '#ffffff', 0.6));
  }
  p.flush();
  const rallies = Math.floor(t * 0.42 / 2);
  g.write(Math.floor(g.w / 2) - 5, 0, String(Math.floor(rallies / 2) % 100).padStart(2, '0'), g.paint.ink(0.5));
  g.write(Math.floor(g.w / 2) + 4, 0, String(Math.floor((rallies + 1) / 2) % 100).padStart(2, '0'), g.paint.ink(0.5));
  return g.finish();
};

// A heart monitor: the trace sweeps left to right behind a gap, spiking once a beat, with the rate and a small heart keeping time.
const heartbeat: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (x % 8 === 0 || y % 3 === 0) g.set(x, y, x % 8 === 0 && y % 3 === 0 ? '┼' : x % 8 === 0 ? '│' : '─', g.paint.ink(0.08));
  const beat = (phase: number): number => {
    // P wave, the sharp QRS complex, then the slow T wave.
    const f = fract(phase);
    return 0.12 * Math.exp(-(((f - 0.16) / 0.04) ** 2)) - 0.18 * Math.exp(-(((f - 0.28) / 0.022) ** 2)) + Math.exp(-(((f - 0.33) / 0.028) ** 2)) - 0.28 * Math.exp(-(((f - 0.385) / 0.024) ** 2)) + 0.22 * Math.exp(-(((f - 0.6) / 0.07) ** 2));
  };
  const speed = 46, head = (t * speed) % b.dw, mid = b.dh * 0.62, tall = b.dh * 0.52;
  let last = mid;
  for (let x = 0; x < b.dw; x++) {
    const behind = ((head - x) % b.dw + b.dw) % b.dw;
    const y = mid - beat(t - behind / speed) * tall;
    if (behind < b.dw - 10) b.line(x, last, x, y, mix(panelBackground, g.paint.accent, clamp(1.15 - behind / b.dw)));
    last = y;
  }
  b.flush();
  g.set(Math.floor(head / 2), Math.floor((mid - beat(t) * tall) / 4), '●', '#ffffff', undefined, true);
  const thump = Math.exp(-(((fract(t) - 0.33) / 0.12) ** 2));
  if (g.w > 30) { g.write(g.w - 9, 0, thump > 0.35 ? '♥' : '♡', g.paint.fan(0.95)); g.write(g.w - 7, 0, ' 60 bpm', g.paint.ink(0.8), panelBackground); }
  return g.finish();
};

// Breathe with it: a ring that opens for four counts, holds, and closes for six, with the count written underneath.
const breathe: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const local = t % 12;
  const [word, open] = local < 4 ? ['breathe in', smooth(local / 4)] as const : local < 6 ? ['hold', 1] as const : ['breathe out', 1 - smooth((local - 6) / 6)] as const;
  const cx = p.pw / 2, cy = (p.ph - (g.h >= 6 ? 4 : 0)) / 2, most = Math.max(2, Math.min(cy - 1, p.pw * 0.3));
  for (let ring = 0; ring < 5; ring++) {
    const r = most * (0.28 + 0.72 * open) * (1 - ring * 0.17), tone = mix(panelBackground, g.paint.fan(ring * 0.3 - 0.6), 0.9 - ring * 0.15);
    for (let i = 0; i < r * 9; i++) {
      const a = i / (r * 9) * TAU;
      p.px(Math.round(cx + Math.cos(a) * r * 1.35), Math.round(cy + Math.sin(a) * r), tone);
    }
  }
  p.flush();
  if (g.h >= 6) {
    g.write(Math.floor((g.w - word.length) / 2), g.h - 2, word, g.paint.ink(0.75));
    const count = local < 4 ? 4 : local < 6 ? 2 : 6, done = Math.floor(local < 4 ? local : local < 6 ? local - 4 : local - 6);
    for (let dot = 0; dot < count; dot++) g.set(Math.floor(g.w / 2) - count + dot * 2 + 1, g.h - 1, dot <= done ? '●' : '○', dot <= done ? g.paint.accent : g.paint.ink(0.3));
  }
  return g.finish();
};

// Rain on the window, the city out of focus behind it: drops gather, hesitate, and run, each leaving a clear track.
const rainWindow: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const lights = Array.from({length: Math.round(p.pw / 6)}, (_, i) => ({x: hash(i, 1) * p.pw, y: (0.2 + 0.7 * hash(i, 2)) * p.ph, r: 2 + hash(i, 3) * p.ph * 0.16, tint: hash(i, 4) * 2 - 1, lit: 0.5 + 0.5 * tri(t * 0.1 + hash(i, 5))}));
  const tones = lights.map(light => [1, 3, 5].map(o => parseInt(g.paint.fan(light.tint).slice(o, o + 2), 16) * light.lit));
  const blur = (x: number, y: number): string => {
    let r = 10, gr = 12, b = 20;
    lights.forEach((light, i) => {
      const d = Math.hypot(x - light.x, y - light.y) / light.r;
      if (d < 1.6) { const w = Math.exp(-d * d * 1.6) * 0.75; r += tones[i]![0]! * w; gr += tones[i]![1]! * w; b += tones[i]![2]! * w; }
    });
    return '#' + [r, gr, b].map(v => Math.min(255, Math.round(v / 12) * 12).toString(16).padStart(2, '0')).join('');
  };
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, blur(x, y));
  for (let drop = 0; drop < p.pw * 0.6; drop++) {
    const period = 5 + 9 * hash(drop, 6), local = (t + hash(drop, 7) * period) % period;
    const x = Math.floor(hash(drop, 8) * p.pw + Math.sin(local * 2 + drop) * 0.6);
    // It sits for a while, then lets go and accelerates; the track behind it shows the lights sharp and upside down.
    const run = Math.max(0, local - period * 0.45), y = Math.floor(hash(drop, 9) * p.ph * 0.5 + run * run * 3);
    if (y >= p.ph) continue;
    for (let tail = 1; tail < Math.min(run * run * 3, 14); tail++) if (y - tail >= 0) p.px(x, y - tail, mix(p.at(x, y - tail)!, '#ffffff', 0.1));
    p.px(x, y, mix(blur(x, p.ph - y), '#ffffff', 0.55));
    if (y + 1 < p.ph) p.px(x, y + 1, mix(blur(x, p.ph - y), '#ffffff', 0.25));
  }
  p.flush();
  return g.finish();
};

// Driving at night: the road coming out of the dark, lane dashes ticking under the car, lamps going by, and the dials glowing.
const nightDrive: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const horizon = Math.round(p.ph * 0.36), dash = p.ph >= 20 ? Math.round(p.ph * 0.78) : p.ph;
  const bend = Math.sin(t * 0.21) * p.pw * 0.22, vx = p.pw / 2 + bend;
  for (let y = 0; y < horizon; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, hash(x, y * 7.7) > 0.992 ? '#8f98b8' : mix('#04050d', '#141a34', y / horizon));
  for (let x = 0; x < p.pw; x++) { const hill = horizon - Math.round(2 + 2.5 * noise(x * 0.05 + t * 0.05, 3)); for (let y = hill; y < horizon; y++) p.px(x, y, '#070a14'); }
  for (let y = horizon; y < dash; y++) {
    const depth = (y - horizon + 1) / (dash - horizon), half = depth * p.pw * 0.46, centre = vx - bend * depth * 1.1;
    const z = 1 / depth + t * 5;
    for (let x = 0; x < p.pw; x++) {
      const across = (x - centre) / half;
      // Headlights reach a short way; beyond them the road is only its paint.
      const beam = clamp(1.25 - 1 / (depth * 5 + 0.2) * 0.35) * (1 - Math.abs(across) * 0.3);
      const paint = Math.abs(across) < 0.035 && fract(z * 0.5) < 0.5 || Math.abs(Math.abs(across) - 0.94) < 0.035;
      p.px(x, y, Math.abs(across) > 1 ? mix('#05070c', '#0e1a12', beam * 0.5) : paint ? mix('#3a3a30', '#ffe9a0', beam) : mix('#08090d', '#2a2c34', beam * 0.7));
    }
  }
  for (let lamp = 0; lamp < 6; lamp++) {
    const depth = fract(lamp / 6 + t * 0.35) ** 2.2, y = horizon + depth * (dash - horizon);
    for (const side of [-1, 1]) {
      const x = Math.round(vx - bend * depth * 1.1 + side * depth * p.pw * 0.52), tall = Math.round(depth * p.ph * 0.5);
      for (let up = 0; up < tall; up++) p.px(x, Math.round(y) - up, '#20242e');
      p.px(x - side, Math.round(y) - tall, mix('#ffd98a', '#ffffff', depth)); if (depth > 0.4) p.px(x - side * 2, Math.round(y) - tall, '#ffd98a');
    }
  }
  if (dash < p.ph) {
    for (let y = dash; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, y === dash ? '#1a1d26' : '#0a0b10');
    for (const [at, level] of [[0.3, 0.55 + 0.1 * Math.sin(t * 0.7)], [0.7, 0.35 + 0.25 * kick(t)]] as const) {
      const cx = p.pw * at, cy = p.ph + 1, r = (p.ph - dash) * 1.05;
      for (let i = 0; i <= 40; i++) { const a = Math.PI * (1.15 + 0.7 * i / 40); p.px(Math.round(cx + Math.cos(a) * r * 1.6), Math.round(cy + Math.sin(a) * r), i > 32 ? '#ff4a3a' : g.paint.accent); }
      const a = Math.PI * (1.15 + 0.7 * level);
      for (let s = 0.2; s < 0.9; s += 0.08) p.px(Math.round(cx + Math.cos(a) * r * 1.6 * s), Math.round(cy + Math.sin(a) * r * s), '#ff6a4a');
    }
  }
  p.flush();
  return g.finish();
};

// An hourglass: the top empties grain by grain through the neck, the heap below grows, and then it is turned over.
const hourglass: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const local = t % 24, run = clamp(local / 20), flip = local > 20 ? smooth((local - 20) / 4) : 0;
  const cx = p.pw / 2, cy = p.ph / 2, half = Math.max(2, p.ph * 0.46), wideAt = (v: number): number => (0.06 + 0.94 * Math.abs(v) ** 0.9) * half * 1.25;
  const sand = g.paint.accent, frame = g.paint.ink(0.75), angle = flip * Math.PI, ca = Math.cos(angle), sa = Math.sin(angle);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    // Work in the glass's own frame, so the turn at the end carries the sand with it.
    const dx = (x + 0.5 - cx) / 1.0, dy = y + 0.5 - cy;
    const u = dx * ca + dy * sa, v = (dy * ca - dx * sa) / half;
    if (Math.abs(v) > 1.08) continue;
    const reach = wideAt(clamp(v, -1, 1));
    if (Math.abs(v) > 1) { if (Math.abs(u) < half * 1.35) p.px(x, y, frame); continue; }
    if (Math.abs(u) > reach) continue;
    if (Math.abs(Math.abs(u) - reach) < 1) { p.px(x, y, g.paint.ink(0.45)); continue; }
    const top = v < 0;
    // Top: a level that sinks and dimples in the middle. Bottom: a cone that rises.
    const filled = top ? -v < (1 - run) ** 0.6 - 0.12 * (1 - Math.abs(u) / (reach + 0.1)) * (run > 0 ? 1 : 0)
      : v > 1 - run ** 0.6 * 0.9 + Math.abs(u) / (half * 1.25) * 0.5 * (run < 1 ? 1 : 0.4);
    if (filled) p.px(x, y, mix(sand, panelBackground, 0.25 * hash(x, y)));
    else if (!top && run > 0 && run < 1 && Math.abs(u) < 0.6 && hash(Math.floor(v * 40 - t * 30), 1) > 0.35) p.px(x, y, mix(sand, '#ffffff', 0.4));
  }
  p.flush();
  return g.finish();
};

// A metronome: the arm swings through its arc and the weight catches the light at each end, exactly on the beat.
const metronome: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const cx = b.dw / 2, base = b.dh - 2, tall = b.dh * 0.92, wood = g.paint.ink(0.5);
  // The case: a tall trapezium with a scale down its face.
  for (const side of [-1, 1]) b.line(cx + side * tall * 0.34, base, cx + side * tall * 0.1, base - tall, wood);
  b.line(cx - tall * 0.34, base, cx + tall * 0.34, base, wood); b.line(cx - tall * 0.1, base - tall, cx + tall * 0.1, base - tall, wood);
  for (let mark = 1; mark < 9; mark++) b.line(cx - 2, base - tall * mark / 10, cx + 2, base - tall * mark / 10, g.paint.ink(0.25));
  const swing = Math.sin(Math.PI * t * 2) * 0.5, pivotY = base - tall * 0.12;
  const tipX = cx + Math.sin(swing) * tall * 0.86, tipY = pivotY - Math.cos(swing) * tall * 0.86;
  for (let ghost = 3; ghost >= 1; ghost--) {
    const past = Math.sin(Math.PI * (t - ghost * 0.035) * 2) * 0.5;
    b.line(cx, pivotY, cx + Math.sin(past) * tall * 0.86, pivotY - Math.cos(past) * tall * 0.86, mix(panelBackground, g.paint.accent, 0.3 - ghost * 0.07));
  }
  b.line(cx, pivotY, tipX, tipY, mix(g.paint.accent, '#ffffff', 0.4));
  b.flush();
  const weight = 0.55;
  g.set(Math.floor((cx + Math.sin(swing) * tall * 0.86 * weight) / 2), Math.floor((pivotY - Math.cos(swing) * tall * 0.86 * weight) / 4), '◆', mix(g.paint.fan(0.8), '#ffffff', Math.abs(Math.sin(swing * 2)) > 0.8 ? 0.6 : 0), undefined, true);
  if (g.w > 34) {
    const count = Math.floor(t * 2) % 4;
    for (let n = 0; n < 4; n++) g.write(Math.floor(g.w / 2 + tall * 0.25) + 2 + n * 3, Math.floor(g.h / 2), String(n + 1), n === count ? (n === 0 ? g.paint.fan(0.95) : g.paint.accent) : g.paint.ink(0.2));
    g.write(Math.floor(g.w / 2 + tall * 0.25) + 2, Math.floor(g.h / 2) + 1, '120 allegro', g.paint.ink(0.4));
  }
  return g.finish();
};

const CHORES = ['Reticulating splines', 'Warming up the valves', 'Untangling headphone cables', 'Rewinding the tape', 'Tuning the fourth string', 'Dusting the stylus', 'Counting the stars', 'Aligning the antenna', 'Polishing the dial', 'Buffering good vibes', 'Asking the cat to move', 'Waiting for the bridge', 'Finding the lost chord', 'Charging the flux capacitor'];

// The installer that never finishes: a list of important-sounding jobs, each with its own bar, some of them going backwards.
const progressBars: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const label = Math.min(30, Math.floor(g.w * 0.42)), bar = Math.max(4, g.w - label - 8);
  const first = Math.floor(t / 2.6);
  for (let row = 0; row < g.h; row++) {
    const job = first + row - (g.h - 1), started = t - job * 2.6;
    if (job < 0 || started < 0) continue;
    const pace = 0.06 + 0.2 * hash(job, 1);
    // Most jobs finish. Some stall at ninety-nine. One in a while changes its mind.
    let done = clamp(started * pace);
    if (hash(job, 2) > 0.8) done = Math.min(done, 0.99);
    if (hash(job, 3) > 0.86) done = clamp(0.5 + 0.4 * Math.sin(started * 0.5));
    const name = CHORES[job % CHORES.length]!;
    const finished = done >= 1;
    g.write(0, row, (name + (finished ? '' : '.'.repeat(1 + Math.floor(t * 2) % 3))).slice(0, label).padEnd(label), finished ? g.paint.ink(0.4) : g.paint.ink(0.85));
    const cells = done * bar, whole = Math.floor(cells);
    g.write(label + 1, row, '█'.repeat(whole), finished ? g.paint.ink(0.35) : g.paint.fan(tri(job * 0.17) * 2 - 1));
    if (whole < bar) g.set(label + 1 + whole, row, ' ▏▎▍▌▋▊▉'[Math.floor((cells - whole) * 8)]!, g.paint.fan(tri(job * 0.17) * 2 - 1));
    for (let x = whole + 1; x < bar; x++) g.set(label + 1 + x, row, '░', g.paint.ink(0.14));
    g.write(label + bar + 2, row, finished ? ' ok ' : `${String(Math.floor(done * 100)).padStart(3)}%`, finished ? g.paint.accent : g.paint.ink(0.7));
  }
  return g.finish();
};

export const reverieReceiverBuilders = {
  'falling-blocks': fallingBlocks,
  serpent,
  'paddle-ball': paddleBall,
  heartbeat,
  breathe,
  'rain-window': rainWindow,
  'night-drive': nightDrive,
  hourglass,
  metronome,
  'progress-bars': progressBars,
};

import {panelBackground} from '../theme.js';
import {TAU, clamp, fract, grid, hash, kick, mix, pixels, seconds, stroke, tri, type Builder} from './cell-canvas.js';

const pad2 = (n: number): string => String(Math.floor(n)).padStart(2, '0');
/** Distance travelled back and forth inside a range, as a position. */
const fold = (distance: number, range: number): number => range > 0 ? range - Math.abs(distance % (2 * range) - range) : 0;

// The bouncing ball that sold a computer: a chequered sphere, a ruled wall, and a shadow that proves there is depth.
const boingBall: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const rule = mix(panelBackground, g.paint.fan(-0.7), 0.42);
  const pitch = Math.max(4, Math.round(p.ph / 4.5));
  const floor = p.ph - Math.max(2, Math.round(p.ph * 0.16));
  const middle = p.pw / 2;
  for (let y = 0; y < p.ph; y++) {
    for (let x = 0; x < p.pw; x++) {
      if (y < floor) { if (Math.round(x - middle) % pitch === 0 || y % pitch === 0 || y === floor - 1) p.px(x, y, rule); }
      else {
        // The floor is the same ruling tipped towards the viewer: rows spread out, columns fan.
        const below = y - floor, spread = pitch * (1 + below / (p.ph - floor) * 1.6);
        const column = (x + 0.5 - middle) / spread;
        if (Math.floor(Math.sqrt(below * 1.5)) !== Math.floor(Math.sqrt((below + 1) * 1.5)) || Math.abs(column - Math.round(column)) * spread < 0.5) p.px(x, y, rule);
      }
    }
  }
  const radius = Math.max(1.5, p.ph * 0.27);
  const drop = fract(t);
  const travel = t * p.pw * 0.11;
  const cx = radius + 1 + fold(travel, p.pw - 2 * radius - 2);
  const cy = floor - radius - Math.max(0, floor - 2 * radius - 1) * 4 * drop * (1 - drop);
  const roll = cx / radius * 0.9;
  const shadow = mix(panelBackground, '#000000', 0.55);
  const red = g.paint.accent;
  const lats = Math.PI / 6, tilt = 0.36;
  for (const pass of [0, 1]) {
    const ox = pass ? cx : cx + radius * 0.5, oy = pass ? cy : cy + radius * 0.22;
    for (let y = Math.floor(oy - radius); y <= oy + radius; y++) {
      for (let x = Math.floor(ox - radius); x <= ox + radius; x++) {
        const dx = (x + 0.5 - ox) / radius, dy = (y + 0.5 - oy) / radius;
        const d = dx * dx + dy * dy;
        if (d >= 1) continue;
        if (!pass) { if (y < floor) p.px(x, y, shadow); continue; }
        const dz = Math.sqrt(1 - d);
        const tx = dx * Math.cos(tilt) - dy * Math.sin(tilt), ty = dx * Math.sin(tilt) + dy * Math.cos(tilt);
        const check = (Math.floor((Math.atan2(tx, dz) + roll) / lats + 64) + Math.floor((Math.asin(clamp(ty, -1, 1)) + Math.PI / 2) / lats)) & 1;
        const lit = clamp(0.42 + 0.58 * (dz * 0.75 - dx * 0.3 - dy * 0.42));
        p.px(x, y, mix('#000000', check ? red : '#ffffff', lit));
      }
    }
  }
  p.flush();
  return g.finish();
};

type Minefield = {columns: number; rows: number; mine: Uint8Array; count: Uint8Array; shown: Float32Array; flagged: Float32Array; total: number; mines: number};
const minefields = new Map<string, Minefield>();

/** Lay a field and play it through once, recording when each square is opened or flagged. */
function minefield(columns: number, rows: number, epoch: number): Minefield {
  const key = `${columns}x${rows}@${epoch}`;
  const cached = minefields.get(key);
  if (cached) return cached;
  const size = columns * rows;
  const mine = new Uint8Array(size), count = new Uint8Array(size);
  const shown = new Float32Array(size).fill(Infinity), flagged = new Float32Array(size).fill(Infinity);
  const start = Math.floor(rows / 2) * columns + Math.floor(columns / 2);
  const around = (cell: number): number[] => {
    const x = cell % columns, y = Math.floor(cell / columns), out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && x + dx >= 0 && x + dx < columns && y + dy >= 0 && y + dy < rows) out.push(cell + dy * columns + dx);
    }
    return out;
  };
  const safeStart = new Set([start, ...around(start)]);
  let mines = 0;
  for (let cell = 0; cell < size; cell++) if (!safeStart.has(cell) && hash(cell, epoch * 13 + columns) < 0.15) { mine[cell] = 1; mines++; }
  for (let cell = 0; cell < size; cell++) count[cell] = around(cell).filter(other => mine[other]).length;
  let clock = 0;
  const open = (first: number): void => {
    // Opening a blank square opens its whole neighbourhood, almost at once.
    const queue = [first];
    shown[first] = clock;
    while (queue.length) {
      const cell = queue.shift()!;
      if (count[cell]) continue;
      for (const other of around(cell)) if (!mine[other] && shown[other] === Infinity) { clock += 0.12; shown[other] = clock; queue.push(other); }
    }
  };
  open(start);
  for (;;) {
    // Then the player thinks, and opens a safe square on the edge of what is known.
    let best = -1, rank = Infinity;
    for (let cell = 0; cell < size; cell++) {
      if (mine[cell] || shown[cell] !== Infinity || !around(cell).some(other => shown[other] !== Infinity)) continue;
      const order = hash(cell, epoch + 77);
      if (order < rank) { rank = order; best = cell; }
    }
    if (best < 0) break;
    clock += 2.5;
    open(best);
  }
  for (let cell = 0; cell < size; cell++) if (!mine[cell] && shown[cell] === Infinity) { clock += 1; shown[cell] = clock; }
  // A mine is flagged once everything safe around it has been opened.
  for (let cell = 0; cell < size; cell++) {
    if (mine[cell]) flagged[cell] = Math.max(0, ...around(cell).filter(other => !mine[other]).map(other => shown[other]!)) + 1.5;
  }
  if (minefields.size >= 6) minefields.delete(minefields.keys().next().value!);
  const field = {columns, rows, mine, count, shown, flagged, total: clock + 2, mines};
  minefields.set(key, field);
  return field;
}

// The other game that came with the computer, playing itself: squares open, numbers appear, flags go down, sunglasses go on.
const minesweeper: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const header = g.h >= 6 ? 1 : 0;
  const columns = Math.max(1, Math.floor(g.w / 2)), rows = g.h - header;
  const left = Math.floor((g.w - columns * 2) / 2);
  const epoch = Math.floor(t / 34), local = t - epoch * 34;
  const field = minefield(columns, rows, epoch);
  const clock = Math.min(1, local / 30) * field.total;
  const won = local >= 30;
  const raised = [g.paint.ink(0.36), g.paint.ink(0.31)], sunk = g.paint.ink(0.06);
  let flags = 0, latest = -1, latestAt = -1;
  for (let cell = 0; cell < columns * rows; cell++) {
    if (field.shown[cell]! <= clock && field.shown[cell]! > latestAt) { latestAt = field.shown[cell]!; latest = cell; }
  }
  for (let cell = 0; cell < columns * rows; cell++) {
    const x = left + cell % columns * 2, y = header + Math.floor(cell / columns);
    const tile = raised[(cell % columns + Math.floor(cell / columns)) & 1]!;
    if (field.mine[cell]) {
      const flag = won || field.flagged[cell]! <= clock;
      if (flag) flags++;
      g.set(x, y, flag ? '►' : ' ', g.paint.fan(0.95), tile, true);
      g.set(x + 1, y, ' ', tile, tile);
    } else if (field.shown[cell]! <= clock) {
      const back = cell === latest && !won ? g.paint.accent : sunk;
      const n = field.count[cell]!;
      g.set(x, y, n ? String(n) : ' ', back === sunk ? g.paint.fan(clamp((n - 1) / 2.5 - 1, -1, 1)) : panelBackground, back, true);
      g.set(x + 1, y, ' ', back, back);
    } else { g.set(x, y, ' ', tile, tile); g.set(x + 1, y, ' ', tile, tile); }
  }
  if (header) {
    const face = won ? 'B)' : clock - latestAt < field.total * 0.004 ? ':O' : ':)';
    g.write(left, 0, String(Math.max(0, field.mines - flags)).padStart(3, '0'), g.paint.fan(0.95));
    g.write(Math.floor(g.w / 2) - 1, 0, face, g.paint.ink(1));
    g.write(Math.max(left + 4, left + columns * 2 - 3), 0, String(Math.floor(Math.min(local, 30) * 3)).padStart(3, '0'), g.paint.fan(0.95));
  }
  return g.finish();
};

const ENGINE = [
  '   ++      _____  ',
  '   ||_____|[] []|_',
  ' _/  RADIO      | ',
  '|_______________|_',
  '/=(O)==(O)==(O)-o-'
];
const COACH = [
  ' ______________ ',
  '|  []  []  []  |',
  '|______________|',
  '-(O)--------(O)-'
];

// A typed locomotive pulling typed coaches across the bottom of the screen, leaving typed smoke.
const steamTrain: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const rail = g.h - 1;
  for (let x = 0; x < g.w; x++) g.set(x, rail, x % 4 === 2 ? '#' : '=', g.paint.ink(x % 4 === 2 ? 0.3 : 0.45));
  for (let x = 9; x < g.w && g.h >= 8; x += 23) {
    for (let y = rail - 6; y < rail; y++) g.set(x, y, y === rail - 6 ? 'T' : '|', g.paint.ink(0.22));
  }
  const coaches = Math.max(2, Math.ceil(g.w / 30));
  const long = ENGINE[0]!.length + coaches * COACH[0]!.length;
  const speed = 13, lap = g.w + long + 14;
  const frontAt = (when: number): number => g.w - ((when * speed) % lap + lap) % lap;
  const front = Math.round(frontAt(t));
  const spokes = '|\\-/';
  const draw = (art: readonly string[], x: number, body: string, glass: string): void => {
    art.forEach((row, i) => {
      const y = rail - art.length + i;
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]!;
        if (ch === ' ') continue;
        if (ch === 'O' && i === art.length - 1) g.set(x + c, y, spokes[Math.floor(t * speed / 1.6) % 4]!, g.paint.ink(1), undefined, true);
        else g.set(x + c, y, ch, '[]'.includes(ch) ? glass : /[A-Z]/.test(ch) ? g.paint.ink(1) : i === art.length - 1 ? g.paint.ink(0.75) : body, undefined, /[A-Z]/.test(ch));
      }
    });
  };
  draw(ENGINE, front, g.paint.accent, g.paint.fan(0.9));
  for (let coach = 0; coach < coaches; coach++) {
    draw(COACH, front + ENGINE[0]!.length + coach * COACH[0]!.length, g.paint.fan(coach % 2 ? -0.6 : 0.5), g.paint.fan(0.9));
  }
  // One chuff a beat: each puff starts where the funnel was, then rises, swells and thins.
  for (let puff = Math.floor(t * 4); puff > Math.floor(t * 4) - 14; puff--) {
    const age = t - puff / 4;
    const x = Math.round(frontAt(puff / 4) + 3.5 + age * 2.5 + Math.sin(puff * 1.7) * age), y = Math.round(rail - 6 - age * 2.1);
    const body = age < 0.35 ? '.' : age < 0.9 ? 'o' : age < 1.7 ? 'O' : age < 2.6 ? '()' : '~';
    if (y >= 0 && x >= 0) g.write(x, y, body, g.paint.ink(clamp(0.95 - age * 0.24)));
  }
  return g.finish();
};

const PLACES = ['TOKYO', 'LAGOS', 'LIMA', 'OSLO', 'PARIS', 'HAVANA', 'NAIROBI', 'MUMBAI', 'BERLIN', 'SEOUL', 'BOGOTA', 'CAIRO', 'DUBLIN', 'SYDNEY', 'LISBON', 'ACCRA'];
/** One line of the report the printer is working through. */
const reportLine = (line: number, wide: number): string => {
  const item = line % 14;
  if (item === 0) return `RADIOCLI SIGNAL REPORT${' '.repeat(Math.max(1, wide - 30))}PAGE ${pad2(1 + line / 14)}`.slice(0, wide);
  if (item === 1) return '='.repeat(wide);
  if (item === 13) return '- '.repeat(wide / 2);
  const level = 0.15 + 0.85 * hash(line, 1) ** 0.7;
  const meter = Math.max(4, Math.min(34, wide - 30));
  const filled = Math.round(level * meter);
  return `${(88.1 + line * 7 % 100 * 0.2).toFixed(1).padStart(5)} MHz |${'#'.repeat(filled)}${' '.repeat(meter - filled)}| ${String(Math.round(level * 100)).padStart(3)}%  ${PLACES[Math.floor(hash(line, 2) * PLACES.length)]!}`.slice(0, wide);
};

// Fanfold paper climbing out of a dot-matrix printer, one pass of the head at a time, out and back.
const dotMatrix: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const strip = g.w >= 24 ? 3 : 0;
  const wide = Math.max(1, g.w - strip * 2);
  const perLine = wide / 95 + 0.22;
  // The job is already a page deep when we look in.
  const current = Math.floor(t / perLine) + g.h;
  const struck = Math.min(wide, Math.floor((t - (current - g.h) * perLine) * 95));
  const printing = g.h >= 3 ? g.h - 2 : g.h - 1;
  for (let y = 0; y < g.h; y++) {
    const line = current - (printing - y);
    // Green-bar paper: the shading belongs to the sheet, so it climbs with the print.
    const paper = Math.floor(line / 2) & 1 ? g.paint.ink(0.11) : g.paint.ink(0.05);
    for (let x = 0; x < g.w; x++) g.set(x, y, ' ', paper, paper);
    if (strip) {
      for (const edge of [0, g.w - 1]) g.set(edge, y, line & 1 ? ' ' : 'o', g.paint.ink(0.4), paper);
      for (const edge of [2, g.w - 3]) g.set(edge, y, '┊', g.paint.ink(0.22), paper);
    }
    if (line < 0 || y > printing) continue;
    const text = reportLine(line, wide);
    const backwards = line % 2 === 1;
    for (let c = 0; c < text.length; c++) {
      const done = y < printing || (backwards ? c >= wide - struck : c < struck);
      if (done && text[c] !== ' ') g.set(strip + c, y, text[c]!, text[c] === '#' ? g.paint.fan(c / wide * 2 - 1) : g.paint.ink(0.86), paper);
    }
    if (y === printing && struck < wide) g.set(strip + (backwards ? wide - 1 - struck : struck), y, '█', g.paint.accent, paper);
  }
  return g.finish();
};

const ICONS = [[10, 31, 31, 14, 4], [21, 21, 31, 4, 4], [21, 14, 31, 14, 21], [14, 21, 31, 21, 14], [4, 14, 31, 31, 14]];
const NOTE = [6, 5, 4, 12, 28, 8];

// A pocket pet on a liquid-crystal screen, bouncing in time and singing to itself.
const lcdPet: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const glass = mix(panelBackground, g.paint.accent, 0.36), ghost = mix(glass, '#000000', 0.1), dark = '#0a0e0c';
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, (x + y) & 1 ? glass : ghost);
  const s = p.ph >= 44 ? 2 : 1;
  const dot = (x: number, y: number): void => { for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) p.px(Math.round(x) * s + dx, Math.round(y) * s + dy, dark); };
  const bitmap = (rows: readonly number[], left: number, top: number, invert = false): void => {
    rows.forEach((bits, y) => { for (let x = 0; x < 5; x++) if (((bits >> (4 - x)) & 1) !== (invert ? 1 : 0)) dot(left + x, top + y); });
  };
  const lw = Math.floor(p.pw / s), lh = Math.floor(p.ph / s);
  const menu = lh >= 20 ? 7 : 0, status = lh >= 14 ? 7 : 0;
  if (menu) ICONS.forEach((icon, i) => {
    const left = Math.round((i + 0.5) * lw / ICONS.length - 2.5);
    const chosen = i === Math.floor(t / 2.5) % ICONS.length;
    if (chosen) for (let y = 0; y < 7; y++) for (let x = -1; x < 6; x++) if (y === 0 || y === 6 || x === -1 || x === 5) dot(left + x, y);
    bitmap(icon, left, 1);
  });
  if (status) for (let heart = 0; heart < 4; heart++) {
    const full = heart <= Math.floor(t / 5) % 4;
    bitmap(full ? ICONS[0]! : [10, 21, 17, 10, 4], 2 + heart * 7, lh - 6);
  }
  const floor = lh - status - 1;
  for (let x = 0; x < lw; x += 2) dot(x, floor);
  const beat = kick(t);
  const room = floor - menu - 2;
  const ry0 = Math.max(1.5, Math.min(7, room / 2 - 1)), ry = ry0 * (1 - 0.2 * beat), rx = ry0 * 1.3 * (1 + 0.15 * beat);
  const cx = lw / 2 + Math.sin(t * 0.45) * lw * 0.2;
  const cy = floor - 1 - ry - Math.abs(Math.sin(Math.PI * t * 2)) * Math.min(3, room * 0.2);
  const rim = 2 / Math.min(rx, ry);
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const e = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (e <= 1 && e > 1 - rim) dot(x, y);
  }
  for (const side of [-1, 1]) {
    // Ears, eyes and feet come in pairs.
    dot(cx + side * rx * 0.55, cy - ry - 0.5); dot(cx + side * rx * 0.55, cy - ry - 1.5);
    const blink = fract(t / 3.3) < 0.045;
    dot(cx + side * rx * 0.36, cy - ry * 0.15); if (!blink) dot(cx + side * rx * 0.36, cy - ry * 0.15 - 1);
    dot(cx + side * rx * 0.45 + (Math.floor(t * 4) & 1 ? side : 0), cy + ry + 0.5);
  }
  for (let x = -1; x <= 1; x++) { dot(cx + x, cy + ry * 0.42); if (beat > 0.45 && x) dot(cx + x, cy + ry * 0.42 + 1); }
  if (beat > 0.45) dot(cx, cy + ry * 0.42 + 2);
  for (let note = 0; note < 3; note++) {
    const age = fract(t * 0.36 + note / 3);
    const x = cx + (note % 2 ? -1 : 1) * (rx + 3 + age * 9), y = cy - ry * 0.4 - age * Math.min(9, room * 0.6) + Math.sin(age * 9 + note) * 1.2;
    if (y > menu) NOTE.forEach((bits, row) => { for (let c = 0; c < 5; c++) if ((bits >> (4 - c)) & 1) dot(x + c, y + row); });
  }
  p.flush();
  return g.finish();
};

// Steel balls on strings. One lifts, falls, and the far one answers: a click on every beat.
const newtonsCradle: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const radius = Math.max(1, p.ph * 0.095);
  const balls = Math.round(clamp(p.pw * 0.42 / (radius * 2), 3, 13));
  const lifted = 1 + Math.floor(t / 4) % Math.max(1, Math.min(3, Math.floor(balls / 2)));
  const top = Math.max(1, Math.round(p.ph * 0.08)), cord = p.ph * 0.62;
  const cx = p.pw / 2, span = balls * radius * 2;
  const swing = Math.sin(TAU * t);
  const frame = g.paint.ink(0.5);
  stroke(p, cx - span / 2 - radius * 3, top, cx + span / 2 + radius * 3, top, 0.6, frame);
  for (const side of [-1, 1]) {
    stroke(p, cx + side * (span / 2 + radius * 3), top, cx + side * (span / 2 + radius * 4.2), p.ph - 2, 0.6, frame);
  }
  stroke(p, cx - span / 2 - radius * 5, p.ph - 1, cx + span / 2 + radius * 5, p.ph - 1, 0.6, frame);
  for (let ball = 0; ball < balls; ball++) {
    const home = cx + (ball - (balls - 1) / 2) * radius * 2;
    // The lifted group leaves from whichever end the swing is on; everything else hangs still.
    const moving = swing > 0 ? ball >= balls - lifted : ball < lifted;
    const angle = moving ? swing * 0.78 : 0;
    const x = home + Math.sin(angle) * cord, y = top + Math.cos(angle) * cord;
    stroke(p, home, top, x, y, 0.3, g.paint.ink(0.34));
    const tint = moving ? g.paint.fan(swing > 0 ? 0.8 : -0.8) : g.paint.ink(0.8);
    for (let py = Math.floor(y - radius); py <= y + radius; py++) for (let px = Math.floor(x - radius); px <= x + radius; px++) {
      const dx = (px + 0.5 - x) / radius, dy = (py + 0.5 - y) / radius;
      if (dx * dx + dy * dy > 1) continue;
      const shine = clamp(0.35 + 0.65 * (Math.sqrt(1 - dx * dx - dy * dy) * 0.6 - dx * 0.35 - dy * 0.45));
      p.px(px, py, mix('#05070a', mix(tint, '#ffffff', shine > 0.86 ? 0.7 : 0), shine));
    }
  }
  p.flush();
  // The click itself: a spark where the lifted group meets the rest.
  if (kick(t) > 0.7) {
    const at = cx + (swing > 0 ? 1 : -1) * (span / 2 - lifted * radius * 2);
    g.set(Math.round(at), Math.min(g.h - 1, Math.round((top + cord - radius * 1.6) / 2)), '✦', g.paint.ink(1), undefined, true);
  }
  return g.finish();
};

// A counting frame doing the counting: sixteenth notes on the right-hand rod, and every carry ripples left.
const abacus: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const framed = g.h >= 10 && g.w >= 12;
  const tall = framed ? 10 : g.h;
  const top = Math.floor((g.h - tall) / 2) + (framed ? 1 : 0);
  const heaven = tall >= 7 ? 2 : 1;
  const beam = top + heaven;
  const earth = Math.max(1, (framed ? tall - 2 : tall) - heaven - 1);
  const rods = Math.round(clamp(Math.floor((g.w - (framed ? 4 : 0)) / 4), 1, 15));
  const left = Math.floor((g.w - rods * 4) / 2);
  const value = Math.floor(t * 8);
  const wood = g.paint.ink(0.5);
  if (framed) {
    for (let x = left - 1; x <= left + rods * 4; x++) { g.set(x, top - 1, '━', wood); g.set(x, top + tall - 2, '━', wood); }
    for (let y = top; y < top + tall - 2; y++) { g.set(left - 2, y, '┃', wood); g.set(left + rods * 4 + 1, y, '┃', wood); }
    g.set(left - 2, top - 1, '┏', wood); g.set(left + rods * 4 + 1, top - 1, '┓', wood);
    g.set(left - 2, top + tall - 2, '┗', wood); g.set(left + rods * 4 + 1, top + tall - 2, '┛', wood);
  }
  for (let x = Math.max(0, left - 1); x <= Math.min(g.w - 1, left + rods * 4); x++) g.set(x, beam, '═', g.paint.ink(0.7));
  for (let rod = 0; rod < rods; rod++) {
    const place = rods - 1 - rod;
    const digit = Math.floor(value / 10 ** place) % 10;
    // A rod has just moved if the count rolled past a multiple of its place value this instant.
    const fresh = place === 0 || value % 10 ** place === 0;
    const x = left + rod * 4 + 1;
    const tint = g.paint.fan(rods > 1 ? rod / (rods - 1) * 2 - 1 : 0);
    const bead = (y: number, live: boolean): void => {
      g.write(x, y, '●●', live ? (fresh ? g.paint.ink(1) : tint) : mix(panelBackground, tint, 0.3), undefined);
    };
    for (let y = top; y < beam + 1 + earth; y++) if (y !== beam) g.write(x, y, '││', g.paint.ink(0.16));
    if (place % 3 === 0) g.set(x, beam, '•', g.paint.ink(1));
    // Heaven bead: worth five, and counted when it rests on the beam.
    bead(digit >= 5 ? beam - 1 : top, digit >= 5);
    const ones = digit % 5, slots = Math.min(4, earth - 1 >= 1 ? earth - 1 : earth);
    for (let i = 0; i < slots; i++) {
      const live = i < ones;
      bead(live ? beam + 1 + i : beam + 1 + earth - slots + i, live);
    }
  }
  return g.finish();
};

// A domino rally snaking down the screen: it topples end to end, pauses, and stands itself back up.
const dominoes: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const gap = g.h >= 9 ? 2 : 1;
  const lanes = Math.ceil(g.h / gap);
  const perLane = Math.max(1, Math.floor(g.w / 2));
  const each = perLane + (gap === 2 ? 1 : 0);
  const count = lanes * each;
  const run = count / 30;
  const local = t % (run * 2 + 3);
  // Falling sweeps forwards; standing back up sweeps the same way, so the snake never runs backwards.
  const rising = local > run + 1.5;
  const front = (rising ? local - run - 1.5 : local) * 30;
  for (let i = 0; i < count; i++) {
    const lane = Math.floor(i / each), step = i % each;
    const rightward = lane % 2 === 0;
    const turning = step === perLane;
    const x = turning ? (rightward ? (perLane - 1) * 2 + 1 : 0) : rightward ? step * 2 : (perLane - 1 - step) * 2;
    const y = lane * gap + (turning ? 1 : 0);
    if (y >= g.h || x >= g.w) continue;
    const age = front - i;
    const down = rising ? age < 0 : age > 1.6;
    const tipping = age >= 0 && age <= 1.6;
    const tint = g.paint.fan(tri(i / count * 2) * 2 - 1);
    if (tipping) g.set(x, y, turning ? '\\' : rightward ? '/' : '\\', g.paint.ink(1), undefined, true);
    else if (down) g.set(x, y, '_', mix(panelBackground, tint, 0.4));
    else g.set(x, y, '|', tint, undefined, true);
  }
  return g.finish();
};

export const playroomReceiverBuilders = {
  'boing-ball': boingBall,
  minesweeper,
  'steam-train': steamTrain,
  'dot-matrix': dotMatrix,
  'lcd-pet': lcdPet,
  'newtons-cradle': newtonsCradle,
  abacus,
  dominoes
};

import {panelBackground} from '../theme.js';
import {band, braille, clamp, fract, grid, hash, kick, mix, pixels, seconds, smooth, tri, type Builder, type Pixels} from './cell-canvas.js';
import {lettering} from './festive-receivers.js';

const pad2 = (n: number): string => String(Math.floor(n)).padStart(2, '0');
const clock = (t: number): string => `${pad2(t / 60 % 100)}:${pad2(t % 60)}`;
const TITLE = 'RADIOCLI  ***  WORLD RADIO IN YOUR TERMINAL  ***  STEREO  ***  ';
const scroll = (text: string, t: number, wide: number, speed = 6): string => {
  const at = Math.floor(t * speed);
  return Array.from({length: Math.max(0, wide)}, (_, i) => text[(at + i) % text.length]!).join('');
};
/** Pixel lettering with the unlit segments faintly visible, the way a fluorescent tube shows its ghosts. */
const glass = (p: Pixels, text: string, left: number, top: number, scale: number, lit: string, ghost?: string): void => {
  for (let y = 0; y < 5 * scale; y++) for (let x = 0; x < (text.length * 6 - 1) * scale; x++) {
    const fx = Math.floor(x / scale), fy = Math.floor(y / scale);
    if (lettering(text, fx, fy)) p.px(left + x, top + y, lit);
    else if (ghost && fx % 6 !== 5 && lettering('8'.repeat(text.length), fx, fy) && /\d/.test(text[Math.floor(fx / 6)] ?? '')) p.px(left + x, top + y, ghost);
  }
};

// The dashboard at night: frequency in glowing segments, a stereo lamp, station text crawling past, and six presets underneath.
const headUnit: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const tube = g.paint.accent, dim = mix(panelBackground, tube, 0.13), face = '#05080b';
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, face);
  const preset = Math.floor(t / 7) % 6, seeking = (t % 7) < 1.2;
  const freq = seeking ? 87.5 + ((t * 31) % 20.5) : [88.1, 91.5, 94.9, 98.7, 101.1, 104.3][preset]!;
  const scale = Math.max(1, Math.floor(Math.min((p.ph - 10) / 5, p.pw * 0.62 / 29)));
  const top = Math.max(2, Math.floor((p.ph - 5 * scale) / 2) - 2);
  const text = freq.toFixed(1);
  glass(p, text, 2, top, scale, mix(tube, '#ffffff', 0.25), dim);
  const right = 2 + text.length * 6 * scale + 9;
  // Spectrum: narrow stacked segments, the lowest always lit.
  const bars = Math.max(0, Math.floor((p.pw - right - 3) / 3)), tall = Math.max(2, p.ph - 12);
  for (let bar = 0; bar < bars; bar++) {
    const level = Math.round(band(bar * 1.3, t) * tall / 2);
    for (let seg = 0; seg < tall / 2; seg++) for (let w = 0; w < 2; w++) p.px(right + bar * 3 + w, p.ph - 8 - seg * 2, seg <= level ? (seg > tall * 0.38 ? g.paint.fan(0.9) : tube) : dim);
  }
  p.flush();
  const cell = (x: number): number => Math.floor(x);
  g.write(1, 0, 'FM1', tube, face);
  g.write(6, 0, seeking ? 'SEEK' : 'ST', seeking ? (fract(t * 4) < 0.5 ? g.paint.fan(0.9) : dim) : tube, face);
  if (g.w > 44) g.write(g.w - 9, 0, 'LOUD  DX', dim, face);
  g.write(cell(2 + text.length * 6 * scale), Math.floor((top + 5 * scale) / 2) - 1, 'MHz', tube, face);
  if (g.h >= 6) g.write(1, g.h - 2, scroll(TITLE, t, Math.min(g.w - 2, 40)), mix(tube, '#ffffff', 0.15), face);
  for (let n = 0; n < 6 && g.h >= 4; n++) {
    const x = 1 + n * Math.floor((g.w - 2) / 6), on = n === preset && !seeking;
    g.write(x, g.h - 1, ` ${n + 1} `, on ? face : dim, on ? tube : mix(panelBackground, tube, 0.07));
  }
  return g.finish();
};

// A fluorescent analyser: every band a ladder of bright bricks behind a fine mesh, with a cap that hangs before it falls.
const vfdSpectrum: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const scaleW = g.w >= 30 ? 4 : 0, pitch = g.w >= 60 ? 4 : 3;
  const bands = Math.max(1, Math.floor((g.w - scaleW) / pitch)), rows = g.h - (g.h >= 6 ? 1 : 0);
  const left = scaleW + Math.floor((g.w - scaleW - bands * pitch) / 2);
  const tube = g.paint.accent, hot = g.paint.fan(0.95), off = mix(panelBackground, tube, 0.1);
  for (let row = 0; row < rows && scaleW; row += 2) g.write(0, row, String(-row * 3).padStart(3), mix(panelBackground, tube, 0.4));
  for (let b = 0; b < bands; b++) {
    const level = band(b * 24 / bands, t) * rows;
    let peak = level;
    for (let k = 1; k < 12; k++) peak = Math.max(peak, band(b * 24 / bands, t - k * 0.08) * rows - Math.max(0, k - 4) * 0.5);
    for (let row = 0; row < rows; row++) {
      const up = rows - 1 - row, lit = up < Math.round(level), cap = up === Math.round(peak);
      for (let w = 0; w < pitch - 1; w++) g.set(left + b * pitch + w, row, lit || cap ? '▬' : '─', cap ? '#ffffff' : lit ? (up > rows * 0.72 ? hot : mix(tube, '#ffffff', 0.1)) : off, undefined, lit);
    }
    if (rows < g.h && b % 3 === 0) g.write(left + b * pitch, g.h - 1, ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'][Math.floor(b / 3) % 10]!.slice(0, pitch * 3 - 1), mix(panelBackground, tube, 0.4));
  }
  return g.finish();
};

// The player everyone had: title bar, running time, a crawling song title, the little analyser, a seek bar and five buttons.
const winamp: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const wide = Math.min(g.w, 58), left = Math.floor((g.w - wide) / 2);
  const tall = Math.min(g.h, 12), top = Math.floor((g.h - tall) / 2);
  const body = '#23252f', bar = '#16182a', lcd = '#04060a', led = g.paint.accent, ink = '#aeb4c6';
  for (let y = 0; y < tall; y++) for (let x = 0; x < wide; x++) g.set(left + x, top + y, ' ', body, y === 0 ? bar : body);
  g.write(left + 1, top, '≡ RADIOCLI ' + '═'.repeat(Math.max(0, wide - 20)) + ' _ □ ×', g.paint.fan(0.8), bar);
  if (tall < 5) { g.write(left + 1, top + 1, `► ${clock(t)}  ${scroll(TITLE, t, wide - 12)}`, led, lcd); return g.finish(); }
  const panel = Math.min(15, Math.floor(wide * 0.3));
  for (let y = 1; y <= 3; y++) for (let x = 1; x < wide - 1; x++) if (x < panel + 1 || (y === 1 && x > panel + 1)) g.set(left + x, top + y, ' ', lcd, lcd);
  g.write(left + 2, top + 1, fract(t) < 0.5 ? '►' : ' ', led, lcd);
  g.write(left + 4, top + 1, clock(t), mix(led, '#ffffff', 0.3), lcd);
  for (let b = 0; b < panel - 2; b++) {
    const level = band(b * 1.6, t) * 16;
    g.set(left + 2 + b, top + 3, ' ▁▂▃▄▅▆▇█'[clamp(Math.round(level), 0, 8)]!, led, lcd);
    g.set(left + 2 + b, top + 2, ' ▁▂▃▄▅▆▇█'[clamp(Math.round(level - 8), 0, 8)]!, g.paint.fan(0.9), lcd);
  }
  g.write(left + panel + 3, top + 1, scroll(TITLE, t, wide - panel - 5), led, lcd);
  g.write(left + panel + 3, top + 2, '128 kbps  44 kHz', ink, body);
  if (wide - panel > 34) g.write(left + wide - 14, top + 2, 'mono ', '#555a6c', body), g.write(left + wide - 9, top + 2, 'stereo', led, body);
  const vol = Math.max(4, Math.floor((wide - panel - 8) * 0.6));
  g.write(left + panel + 3, top + 3, '━'.repeat(vol), g.paint.fan(0.6), body);
  g.set(left + panel + 3 + Math.round(vol * 0.78), top + 3, '▮', '#e6e8f0', body);
  if (tall >= 6) {
    const seek = wide - 4, at = Math.round(fract(t / 215) * (seek - 1));
    g.write(left + 2, top + 4, '─'.repeat(seek), '#555a6c', body);
    g.write(left + 2, top + 4, '━'.repeat(at), ink, body);
    g.write(left + 2 + at, top + 4, '▰▰', '#e6e8f0', body);
    const pressed = Math.floor(t / 3) % 5;
    ['|◄', ' ►', ' ‖', ' ■', '►|'].forEach((label, n) => g.write(left + 2 + n * 5, top + 5, ` ${label} `, n === pressed && fract(t / 3) < 0.15 ? body : ink, n === pressed && fract(t / 3) < 0.15 ? ink : '#343746'));
    if (wide > 44) g.write(left + wide - 16, top + 5, ' SHUFFLE  REP ', '#7c8298', '#343746');
  }
  // The equaliser window underneath, sliders riding the music.
  if (tall >= 10) {
    g.write(left + 1, top + 6, '≡ EQUALIZER ' + '═'.repeat(Math.max(0, wide - 14)), g.paint.fan(0.8), bar);
    const sliders = Math.min(10, Math.floor((wide - 14) / 4)), track = tall - 8;
    g.write(left + 2, top + 7, 'ON', led, body); g.write(left + 5, top + 7, 'AUTO', '#555a6c', body);
    for (let s = 0; s < sliders; s++) {
      const x = left + 12 + s * 4, knob = Math.round((1 - (0.2 + 0.6 * smooth(0.5 + 0.5 * Math.sin(s * 0.9 + t * 0.35)) + 0.2 * band(s * 2, t))) * (track - 1));
      for (let y = 0; y < track; y++) g.set(x, top + 7 + y, y === knob ? '█' : '│', y === knob ? '#e6e8f0' : mix(g.paint.fan(-0.8), g.paint.fan(0.9), 1 - y / Math.max(1, track - 1)), body);
    }
  }
  return g.finish();
};

// A pair of moving-coil meters: needles that overshoot and settle, a red sector past zero, and a lamp when the peak clips.
const vuNeedles: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const meters = g.w >= 44 ? 2 : 1, paper = mix(panelBackground, '#f2e6c4', 0.9), mark = '#2b241a';
  const meterW = Math.floor(g.w / meters) - 2;
  const clips: [number, boolean][] = [];
  for (let m = 0; m < meters; m++) {
    const x0 = 1 + m * (meterW + 2);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < meterW; x++) g.set(x0 + x, y, ' ', paper, paper);
    const r = Math.min(b.dh * 1.08, meterW * 1.5), cx = (x0 + meterW / 2) * 2, cy = b.dh * 0.2 + r;
    const at = (v: number, radius: number): [number, number] => { const a = (-0.62 + 1.24 * v) ; return [cx + Math.sin(a) * radius, cy - Math.cos(a) * radius]; };
    for (let i = 0; i <= 120; i++) { const [x, y] = at(i / 120, r); b.dot(x, y, i > 88 ? '#c8281e' : mark); if (i > 88) { const [x2, y2] = at(i / 120, r - 1.5); b.dot(x2, y2, '#c8281e'); } }
    for (let tick = 0; tick <= 10; tick++) { const [x1, y1] = at(tick / 10, r), [x2, y2] = at(tick / 10, r - (tick % 5 ? 3 : 5)); b.line(x1, y1, x2, y2, tick > 7 ? '#c8281e' : mark); }
    // The needle follows the level through a slow spring, so it leans into loud passages and hangs on the way back.
    let level = 0;
    for (let k = 0; k < 6; k++) level += band(3 + m * 5 + k, t - k * 0.05) * (6 - k) / 21;
    const v = clamp(0.12 + level * 1.15 + 0.05 * Math.sin(t * 9 + m) * kick(t));
    const [nx, ny] = at(v, r - 2), [bx, by] = at(v, r * 0.25);
    b.line(bx, by, nx, ny, '#101010');
    clips.push([x0, v > 0.84]);
  }
  b.flush(paper);
  clips.forEach(([x0, clip], m) => {
    g.write(x0 + 1, g.h - 1, m ? 'R' : 'L', mark, paper);
    g.write(x0 + Math.floor(meterW / 2) - 1, Math.max(0, g.h - 2), 'VU', mark, paper);
    if (g.h >= 4) { g.write(x0 + 2, 0, '-20', mark, paper); g.write(x0 + meterW - 4, 0, '+3', '#c8281e', paper); }
    g.write(x0 + meterW - 3, g.h - 1, '●', clip ? '#ff3020' : '#6b5d48', paper);
  });
  return g.finish();
};

// A cassette playing: two reels turning, one filling as the other empties, and the counter ticking over.
const tapeDeck: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const shellW = Math.min(p.pw - 2, Math.round(p.ph * 2.9)), shellH = Math.min(p.ph, Math.round(shellW / 2.9) + 2);
  const left = Math.floor((p.pw - shellW) / 2), top = Math.floor((p.ph - shellH) / 2);
  const shell = mix(panelBackground, g.paint.accent, 0.55), label = '#efe9d8', tape = '#3a2418';
  for (let y = 0; y < shellH; y++) for (let x = 0; x < shellW; x++) {
    const inLabel = y > shellH * 0.1 && y < shellH * 0.72 && x > shellW * 0.06 && x < shellW * 0.94;
    p.px(left + x, top + y, inLabel ? (y < shellH * 0.26 ? label : y < shellH * 0.3 ? g.paint.fan(0.8) : mix(label, '#000000', 0.06)) : mix(shell, '#000000', y / shellH * 0.3));
  }
  const played = fract(t / 90), winY = top + shellH * 0.5, reelR = shellH * 0.2;
  // The window between the hubs shows the tape packs: their radii trade places over the length of the side.
  [0.3, 0.7].forEach((at, side) => {
    const cx = left + shellW * at, pack = reelR * (0.55 + 0.75 * (side ? played : 1 - played));
    for (let y = Math.floor(winY - reelR * 1.4); y <= winY + reelR * 1.4; y++) for (let x = Math.floor(cx - reelR * 1.5); x <= cx + reelR * 1.5; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - winY, d = Math.hypot(dx, dy);
      if (d > reelR * 1.4) continue;
      const spoke = Math.abs(Math.sin((Math.atan2(dy, dx) + t * (side ? 3.2 : 4.4) * (side ? 1 : 1)) * 3)) < 0.35;
      p.px(x, y, d < reelR * 0.5 ? (spoke ? '#f4f4f4' : '#1a1a1a') : d < pack ? tape : '#0c0e12');
    }
  });
  for (let x = Math.round(left + shellW * 0.3); x < left + shellW * 0.7; x++) p.px(x, Math.round(winY + reelR * 1.4) + 1, tape);
  for (let hole = 0; hole < 5; hole++) p.px(Math.round(left + shellW * (0.3 + hole * 0.1)), top + shellH - 2, '#0c0e12');
  p.flush();
  const row = Math.floor((top + shellH * 0.18) / 2);
  if (shellW > 40) g.write(Math.floor(left + shellW * 0.1), row, 'A  RADIOCLI MIX  C-90', '#2a2a2a', label);
  if (g.h >= 5) g.write(Math.floor(left + shellW / 2 - 2), Math.min(g.h - 1, Math.floor((top + shellH) / 2)), String(Math.floor(t * 2.3) % 1000).padStart(3, '0'), g.paint.accent, '#05080b');
  return g.finish();
};

// Nothing but the time: tall segmented digits, a blinking colon, and a thin row of level lamps underneath.
const segmentClock: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const tube = g.paint.accent, ghost = mix(panelBackground, tube, 0.1);
  const text = clock(t);
  const scale = Math.max(1, Math.floor(Math.min((p.ph - (p.ph >= 12 ? 5 : 0)) / 5, p.pw * 0.92 / 29)));
  const left = Math.floor((p.pw - 29 * scale) / 2), top = Math.max(0, Math.floor((p.ph - 5 * scale) / 2) - (p.ph >= 12 ? 2 : 0));
  glass(p, fract(t) < 0.5 ? text : text.replace(':', ' '), left, top, scale, mix(tube, '#ffffff', 0.3), ghost);
  if (p.ph >= 12) for (let lamp = 0; lamp < Math.floor(29 * scale / 3); lamp++) {
    const on = lamp / (29 * scale / 3) < band(4, t) * 1.2;
    for (let w = 0; w < 2; w++) p.px(left + lamp * 3 + w, top + 5 * scale + 3, on ? (lamp / (29 * scale / 3) > 0.8 ? g.paint.fan(0.95) : tube) : ghost);
  }
  p.flush();
  return g.finish();
};

// A graphic equaliser: a row of sliders riding up and down their slots, with the curve they make drawn through the knobs.
const graphicEq: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const labels = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
  const pitch = Math.max(3, Math.floor(g.w / 10)), sliders = Math.min(10, Math.floor(g.w / pitch)), left = Math.floor((g.w - sliders * pitch) / 2);
  const rows = g.h - (g.h >= 6 ? 1 : 0), slot = g.paint.ink(0.16);
  for (let s = 0; s < sliders; s++) {
    const x = left + s * pitch + Math.floor(pitch / 2);
    const level = clamp(0.5 + 0.34 * Math.sin(s * 0.8 + t * 0.5) + 0.22 * (band(s * 2.4, t) - 0.3));
    const knob = Math.round((1 - level) * (rows - 1));
    for (let y = 0; y < rows; y++) {
      const centre = y === Math.floor(rows / 2);
      g.set(x, y, y === knob ? '█' : '│', y === knob ? mix(g.paint.accent, '#ffffff', 0.5) : y > knob ? g.paint.fan(s / Math.max(1, sliders - 1) * 2 - 1) : slot, undefined, y === knob);
      if (y === knob) { g.set(x - 1, y, '▐', g.paint.ink(0.8)); g.set(x + 1, y, '▌', g.paint.ink(0.8)); }
      else if (centre) { g.set(x - 1, y, '─', slot); g.set(x + 1, y, '─', slot); }
    }
    if (rows < g.h) g.write(x - Math.floor(labels[s]!.length / 2), g.h - 1, labels[s]!, g.paint.ink(0.42));
  }
  return g.finish();
};

// A dot-matrix sign: every lamp of the board is there, and the message walks through them from right to left.
const marquee: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const message = 'NOW PLAYING  ***  RADIOCLI  ***  ALL NIGHT LONG  ***  ';
  const rowsPer = Math.max(1, Math.floor((g.h - 2) / 5)), top = Math.floor((g.h - 5 * rowsPer) / 2);
  const at = Math.floor(t * 14);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x += 2) {
    const fy = Math.floor((y - top) / rowsPer), fx = Math.floor(x / 2 / Math.max(1, Math.round(rowsPer * 0.75))) + at;
    const lit = fy >= 0 && fy < 5 && lettering(message, ((fx % (message.length * 6)) + message.length * 6) % (message.length * 6), fy);
    const letter = Math.floor(fx / 6);
    g.set(x, y, '●', lit ? mix(g.paint.fan(tri(letter * 0.09) * 2 - 1), '#ffffff', 0.15 + 0.2 * kick(t)) : g.paint.ink(0.1), undefined, lit);
  }
  return g.finish();
};

// An analogue tuner: a lit scale, a needle hunting along it, and the signal meter rising when it lands on a station.
const dialScale: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const lamp = mix(panelBackground, '#ffd98a', 0.9), glassTone = mix(panelBackground, '#ffd98a', 0.1);
  const stations = [88.5, 91.1, 94.3, 97.9, 100.7, 103.5, 106.9];
  const leg = Math.floor(t / 5), from = stations[Math.floor(hash(leg, 1) * 7)]!, to = stations[Math.floor(hash(leg + 1, 1) * 7)]!;
  const moving = smooth(clamp((t - leg * 5) / 2.2)), freq = from + (to - from) * moving;
  const locked = moving >= 1;
  const scaleRow = Math.floor(g.h * 0.35), pos = (f: number): number => Math.round(2 + (f - 87) / 21 * (g.w - 5));
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.set(x, y, ' ', lamp, y < g.h - (g.h >= 6 ? 2 : 0) ? glassTone : undefined);
  for (let f = 88; f <= 108; f += 0.5) {
    const x = pos(f), whole = f % 2 === 0;
    g.set(x, scaleRow, whole ? '┃' : f % 1 === 0 ? '│' : '╵', lamp, glassTone);
    if (whole && scaleRow > 0) g.write(x - 1, scaleRow - 1, String(f), lamp, glassTone);
  }
  if (g.h >= 8) for (let f = 540; f <= 1600; f += 106) g.write(Math.round(2 + (f - 540) / 1060 * (g.w - 8)), scaleRow + 2, String(f), mix(glassTone, lamp, 0.4), glassTone);
  g.write(0, scaleRow, 'FM', g.paint.accent, glassTone);
  const needle = pos(freq);
  for (let y = 0; y < g.h - (g.h >= 6 ? 2 : 0); y++) g.set(needle, y, '┃', '#ff4a3a', glassTone, true);
  if (g.h >= 6) {
    const signal = locked ? 0.75 + 0.2 * band(2, t) : 0.15 + 0.2 * hash(Math.floor(t * 12), 3);
    const meter = Math.max(0, Math.min(24, g.w - 26));
    g.write(1, g.h - 1, 'SIGNAL ', g.paint.ink(0.5));
    g.write(8, g.h - 1, '▮'.repeat(Math.round(signal * meter)), g.paint.accent);
    g.write(8 + Math.round(signal * meter), g.h - 1, '▯'.repeat(meter - Math.round(signal * meter)), g.paint.ink(0.2));
    g.write(g.w - 15, g.h - 1, '● STEREO', locked ? '#ff4a3a' : g.paint.ink(0.2));
    g.write(g.w - 6, g.h - 1, freq.toFixed(1).padStart(5), g.paint.ink(0.9));
  }
  return g.finish();
};

// A disc at speed: the rainbow that slides round a spinning CD, and the track counter beside it.
const compactDisc: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const r = Math.max(2, Math.min(p.ph * 0.48, p.pw * 0.3)), cx = p.pw > r * 4.4 ? p.pw * 0.32 : p.pw / 2, cy = p.ph / 2;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / r;
    if (d > 1 || d < 0.1) continue;
    const a = Math.atan2(dy, dx);
    // Two bright fans, opposite each other, sweep round; inside them the colour depends on the radius.
    const fan = Math.max(0, Math.cos((a - t * 1.6) * 2)) ** 6;
    const silver = mix('#4a5060', '#d6dae4', 0.35 + 0.3 * Math.sin(a * 3 + t * 5) * (d > 0.3 ? 1 : 0));
    p.px(x, y, d < 0.3 ? (d < 0.16 ? '#c8ccd6' : mix(silver, '#000000', 0.3)) : mix(silver, g.paint.fan(Math.sin(d * 9 - t * 0.7)), fan * 0.9));
  }
  p.flush();
  if (p.pw > r * 4.4) {
    const x = Math.floor((cx + r) ) + 4, track = 1 + Math.floor(t / 20) % 12, tube = g.paint.accent;
    const lines = ['COMPACT DISC', '', `TRACK  ${pad2(track)}`, `TIME   ${clock(t % 20 + track * 7)}`, '', `${'▮'.repeat(1 + Math.floor(t / 20) % 12)}${'▯'.repeat(11 - Math.floor(t / 20) % 12)}`, fract(t) < 0.5 ? '► PLAY' : '  PLAY'];
    const top = Math.max(0, Math.floor((g.h - lines.length) / 2));
    lines.forEach((line, i) => { if (top + i < g.h) g.write(x, top + i, line.slice(0, g.w - x), i === 0 ? g.paint.ink(0.5) : tube); });
  }
  return g.finish();
};

// A boombox: two cones punching out on the beat, a row of level lamps, and the tape turning in the middle.
const boombox: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const wide = Math.min(p.pw, Math.round(p.ph * 3.4)), left = Math.floor((p.pw - wide) / 2);
  const caseTone = mix(panelBackground, '#aeb4c0', 0.5), dark = '#101218';
  for (let y = 2; y < p.ph; y++) for (let x = 0; x < wide; x++) p.px(left + x, y, mix(caseTone, '#000000', y / p.ph * 0.35));
  for (let x = Math.round(wide * 0.2); x < wide * 0.8; x++) { p.px(left + x, 0, caseTone); p.px(left + x, 1, x < wide * 0.24 || x > wide * 0.76 ? caseTone : dark); }
  const thump = kick(t), r = Math.min(p.ph * 0.36, wide * 0.17);
  for (const side of [0.19, 0.81]) {
    const cx = left + wide * side, cy = p.ph * 0.58;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d > 1) continue;
      // The cone is a set of rings; on the beat they all step outward and the dust cap flashes.
      const ring = Math.floor((d - thump * 0.08) * 6);
      p.px(x, y, d > 0.92 ? '#c8ccd6' : d < 0.22 + thump * 0.05 ? mix(g.paint.accent, '#ffffff', thump * 0.6) : ring % 2 ? '#1a1d26' : '#2a2e3a');
    }
  }
  const midL = Math.round(left + wide * 0.36), midW = Math.round(wide * 0.28);
  for (let lamp = 0; lamp < Math.floor(midW / 2); lamp++) {
    const on = lamp / (midW / 2) < band(lamp, t) * 0.5 + thump * 0.6;
    p.px(midL + lamp * 2, 4, on ? (lamp > midW * 0.38 ? g.paint.fan(0.95) : g.paint.accent) : dark);
  }
  for (let y = Math.round(p.ph * 0.42); y < p.ph * 0.8; y++) for (let x = 0; x < midW; x++) p.px(midL + x, y, dark);
  for (const side of [0.3, 0.7]) {
    const cx = midL + midW * side, cy = p.ph * 0.61, rr = Math.max(1.2, p.ph * 0.09);
    for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (Math.hypot(dx, dy) <= rr) p.px(x, y, Math.abs(Math.sin((Math.atan2(dy, dx) + t * 4) * 1.5)) < 0.4 ? '#e8e8e8' : '#3a2418');
    }
  }
  for (let knob = 0; knob < 4; knob++) p.px(Math.round(midL + midW * (0.15 + knob * 0.23)), Math.round(p.ph * 0.9), knob === Math.floor(t) % 4 ? g.paint.accent : '#e8e8e8');
  p.flush();
  return g.finish();
};

// Studio ladders: left and right in rows of lamps from green through amber to red, each with a peak that waits before letting go.
const ledLadder: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const names = g.h >= 8 ? ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'].slice(0, Math.min(6, Math.floor((g.h - 1) / 2))) : g.h >= 3 ? ['L', 'R'] : ['M'];
  const gap = Math.max(1, Math.floor((g.h - 1) / names.length)), label = 4, lamps = Math.max(1, Math.floor((g.w - label - 1) / 2));
  const top = Math.floor((g.h - 1 - names.length * gap) / 2);
  const tone = (at: number): string => at > 0.9 ? g.paint.fan(0.98) : at > 0.74 ? g.paint.fan(0.55) : g.paint.accent;
  names.forEach((name, ch) => {
    const y = top + ch * gap;
    const level = clamp(band(2 + ch * 4, t) * 1.25 + 0.06), levelLamp = Math.round(level * lamps);
    let peak = levelLamp;
    for (let k = 1; k < 16; k++) peak = Math.max(peak, Math.round(clamp(band(2 + ch * 4, t - k * 0.08) * 1.25 + 0.06) * lamps) - Math.max(0, k - 7));
    g.write(0, y, name.padEnd(3), g.paint.ink(0.7));
    for (let lamp = 0; lamp < lamps; lamp++) {
      const at = lamp / lamps, on = lamp < levelLamp || lamp === peak;
      g.set(label + lamp * 2, y, '▮', on ? (lamp === peak ? mix(tone(at), '#ffffff', 0.5) : tone(at)) : mix(panelBackground, tone(at), 0.16), undefined, on);
    }
  });
  if (g.h >= 3) for (const [db, at] of [['-40', 0], ['-20', 0.36], ['-10', 0.58], ['-3', 0.78], ['0', 0.88], ['+3', 0.96]] as const) g.write(label + Math.round(at * lamps) * 2, g.h - 1, db, g.paint.ink(0.4));
  return g.finish();
};

export const deckReceiverBuilders = {
  'head-unit': headUnit,
  'vfd-spectrum': vfdSpectrum,
  winamp,
  'vu-needles': vuNeedles,
  'tape-deck': tapeDeck,
  'segment-clock': segmentClock,
  'graphic-eq': graphicEq,
  marquee,
  'dial-scale': dialScale,
  'compact-disc': compactDisc,
  boombox,
  'led-ladder': ledLadder
};

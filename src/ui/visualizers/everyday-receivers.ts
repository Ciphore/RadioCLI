import {panelBackground} from '../theme.js';
import {TAU, braille, clamp, fract, grid, hash, mix, noise, pixels, seconds, smooth, stroke, tri, type Builder, type Pixels} from './cell-canvas.js';

const pad = (n: number, width: number): string => String(Math.floor(n)).padStart(width, '0');
const disc = (p: Pixels, cx: number, cy: number, rx: number, ry: number, color: (dx: number, dy: number) => string | undefined): void => {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const tone = color(dx, dy);
    if (tone) p.px(x, y, tone);
  }
};
const fillAll = (p: Pixels, color: (x: number, y: number) => string): void => { for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, color(x, y)); };

// The view from a train: far hills barely moving, fields sliding, poles and their wires whipping past the glass.
const trainWindow: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const dusk = [g.paint.fan(-0.7), g.paint.fan(0.2), g.paint.fan(0.9)];
  const sky = (y: number): string => { const at = clamp(y / (p.ph * 0.6)) * 2, i = Math.min(1, Math.floor(at)); return mix(panelBackground, mix(dusk[i]!, dusk[i + 1]!, at - i), 0.25 + 0.35 * at / 2); };
  fillAll(p, (_, y) => sky(y));
  disc(p, p.pw * 0.7, p.ph * 0.5, p.ph * 0.13, p.ph * 0.13, () => mix(g.paint.fan(0.9), '#ffffff', 0.6));
  [[0.52, 0.4, 0.025, 0.13, 0.1], [0.6, 2, 0.05, 0.2, 0.18], [0.7, 7, 0.09, 0.32, 0.12]].forEach(([level, speed, scale, shade, lift], layer) => {
    for (let x = 0; x < p.pw; x++) {
      const top = Math.round(p.ph * (level! - lift! * noise((x + t * speed! * 8) * scale!, layer * 9, layer)));
      for (let y = top; y < p.ph; y++) p.px(x, y, mix(panelBackground, g.paint.fan(-0.5 + layer * 0.2), shade! * (1 - (y - top) / p.ph * 0.5)));
    }
  });
  for (let x = 0; x < p.pw; x++) for (let y = Math.round(p.ph * 0.82); y < p.ph; y++) p.px(x, y, mix(panelBackground, g.paint.accent, hash(Math.floor((x + t * 150) / 3), y) > 0.6 ? 0.2 : 0.12));
  // Poles come by one a second; the wires between them sag and rise as each one passes.
  const gap = p.pw * 0.9, offset = (t * 150) % gap, wireTop = p.ph * 0.2;
  for (let x = 0; x < p.pw; x++) {
    const along = fract((x + offset) / gap);
    for (let wire = 0; wire < 2; wire++) p.px(x, Math.round(wireTop + wire * 2 + 4 * along * (1 - along) * p.ph * 0.18), '#0a0c10');
  }
  for (let pole = -1; pole < 2; pole++) {
    const x = Math.round(pole * gap + gap - offset);
    for (let y = Math.round(wireTop) - 2; y < p.ph; y++) for (let w = 0; w < 2; w++) p.px(x + w, y, '#0a0c10');
    for (let w = -3; w <= 4; w++) p.px(x + w, Math.round(wireTop) - 1, '#0a0c10');
  }
  p.flush();
  return g.finish();
};

// An apartment block after dark: lights going on and off behind the blinds, a television flickering, somebody at a window.
const cityWindows: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const wall = mix(panelBackground, '#3a3340', 0.6), paneW = 5, paneH = 5, columns = Math.floor(p.pw / (paneW + 3)), rows = Math.max(1, Math.floor(p.ph / (paneH + 3)));
  const left = Math.floor((p.pw - columns * (paneW + 3)) / 2) + 1, top = Math.floor((p.ph - rows * (paneH + 3)) / 2) + 1;
  fillAll(p, (x, y) => mix(wall, '#000000', 0.12 * hash(x >> 2, y >> 1)));
  for (let flat = 0; flat < columns * rows; flat++) {
    const x0 = left + (flat % columns) * (paneW + 3), y0 = top + Math.floor(flat / columns) * (paneH + 3);
    // Every flat keeps its own hours: a slow on-off cycle, shifted from its neighbours.
    const cycle = 22 + 30 * hash(flat, 1), on = fract(t / cycle + hash(flat, 2)) < 0.3 + 0.5 * hash(flat, 3), kind = Math.floor(hash(flat, 4) * 5);
    const lamp = kind === 1 ? mix('#5a8dff', '#e0ecff', noise(t * 6, flat)) : kind === 2 ? '#ffb070' : mix('#ffd98a', g.paint.accent, kind === 3 ? 0.35 : 0);
    for (let y = 0; y < paneH; y++) for (let x = 0; x < paneW; x++) {
      const blind = kind === 4 && y < 3 && y % 2 === 0, frame = x === Math.floor(paneW / 2);
      p.px(x0 + x, y0 + y, !on ? mix('#0a0d16', '#2a3550', y / paneH * 0.5) : frame ? mix(lamp, '#000000', 0.5) : blind ? mix(lamp, '#000000', 0.35) : lamp);
    }
    if (on && kind === 0) { const sx = x0 + 1 + Math.round(tri(t * 0.07 + hash(flat, 5)) * 2); for (let y = 2; y < paneH; y++) p.px(sx, y0 + y, '#2a2018'); p.px(sx, y0 + 1, '#2a2018'); }
    for (let x = -1; x <= paneW; x++) p.px(x0 + x, y0 + paneH, mix(wall, '#ffffff', 0.18));
  }
  p.flush();
  return g.finish();
};

// A cat asleep on the sill: sides rising and falling, an ear that twitches, a tail that cannot quite keep still.
const catNap: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const sill = p.ph - Math.max(2, Math.round(p.ph * 0.16)), fur = mix(panelBackground, g.paint.accent, 0.8), shade = mix(fur, '#000000', 0.35);
  fillAll(p, (_, y) => y >= sill ? mix(panelBackground, '#8a6a48', y === sill ? 0.75 : 0.5) : mix('#0a1024', '#1c2748', y / sill));
  for (let star = 0; star < p.pw * sill / 70; star++) p.px(Math.floor(hash(star, 1) * p.pw), Math.floor(hash(star, 2) * sill * 0.8), mix('#1c2748', '#ffffff', 0.3 + 0.6 * tri(t * 0.2 + hash(star, 3))));
  disc(p, p.pw * 0.18, sill * 0.28, sill * 0.16, sill * 0.16, (dx, dy) => Math.hypot(dx - 0.35, dy + 0.1) < 0.85 ? undefined : '#fdf3c8');
  for (const x of [0, Math.floor(p.pw / 2), p.pw - 1]) for (let y = 0; y < sill; y++) p.px(x, y, mix(panelBackground, '#8a6a48', 0.6));
  const cx = p.pw * 0.6, size = Math.min(sill * 0.42, p.pw * 0.14), breath = 1 + 0.06 * Math.sin(t * 1.3);
  // The tail hangs over the edge and flicks from the tip, with the odd bigger swish.
  const swish = Math.sin(t * 0.9) * 0.5 + (fract(t / 7) < 0.1 ? Math.sin(t * 12) * 0.5 : 0);
  let tx = cx - size * 1.6, ty = sill - size * 0.3;
  for (let seg = 0; seg < 12; seg++) { const a = Math.PI * 0.55 + swish * seg / 12 * 1.2; const nx = tx + Math.cos(a) * size * 0.16, ny = ty + Math.sin(a) * size * 0.16; stroke(p, tx, ty, nx, ny, Math.max(0.6, size * 0.11), seg % 4 < 2 ? fur : shade); tx = nx; ty = ny; }
  disc(p, cx, sill - size * 0.62 * breath, size * 1.7, size * 0.66 * breath, (dx, dy) => Math.abs(fract(dx * 2.2 + dy * 0.4) - 0.5) < 0.12 && dy < 0.2 ? shade : mix(fur, '#000000', clamp(dy * 0.3)));
  const hx = cx + size * 1.45, hy = sill - size * 0.5;
  for (const ear of [-1, 1]) { const twitch = ear > 0 && fract(t / 5.3) < 0.06 ? -1 : 0; for (let row = 0; row < size * 0.5; row++) for (let w = -row * 0.7; w <= row * 0.7; w++) p.px(Math.round(hx + ear * size * 0.34 + w), Math.round(hy - size * 0.95 + row) + twitch, fur); }
  disc(p, hx, hy, size * 0.62, size * 0.55, (_, dy) => mix(fur, '#000000', clamp(dy * 0.25)));
  for (const eye of [-1, 1]) for (let w = -1; w <= 1; w++) p.px(Math.round(hx + eye * size * 0.26 + w), Math.round(hy - size * 0.02 + (Math.abs(w) === 1 ? 0 : 1)), '#14100c');
  p.px(Math.round(hx), Math.round(hy + size * 0.2), '#e8897a');
  // Z's drift up and to the right while it sleeps.
  for (let z = 0; z < 3; z++) { const age = fract(t * 0.25 + z / 3); p.px(Math.round(hx + size * 0.8 + age * size * 1.4), Math.round(hy - size * 0.9 - age * sill * 0.4), mix('#1c2748', '#ffffff', 1 - age)); }
  p.flush();
  for (let z = 0; z < 3; z++) { const age = fract(t * 0.25 + z / 3); g.set(Math.round(hx + size * 0.8 + age * size * 1.4), Math.max(0, Math.round((hy - size * 0.9 - age * sill * 0.4) / 2)), age > 0.5 ? 'Z' : 'z', mix(panelBackground, '#ffffff', 0.9 * (1 - age))); }
  return g.finish();
};

// A cup left to cool: the surface catching the light, and steam unwinding from it in slow braided threads.
const coffeeSteam: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const table = p.ph - 2, cupH = Math.max(3, Math.round(p.ph * 0.3)), cupW = Math.max(6, Math.round(cupH * 2.4)), cx = Math.round(p.pw / 2), top = table - cupH;
  fillAll(p, (_, y) => y >= table ? mix(panelBackground, '#6b4a2d', 0.7) : mix(panelBackground, g.paint.accent, 0.05 + 0.05 * y / p.ph));
  const china = mix(panelBackground, '#f0ece4', 0.95);
  for (let y = 0; y < cupH; y++) { const half = cupW / 2 - (y / cupH) ** 2 * cupW * 0.14; for (let x = -Math.round(half); x <= Math.round(half); x++) p.px(cx + x, top + y, y > cupH * 0.3 && y < cupH * 0.48 ? mix(g.paint.accent, '#000000', clamp(x / half * 0.25 + 0.1)) : mix(china, '#000000', clamp(x / half * 0.25 + 0.1))); }
  for (let x = -Math.round(cupW / 2) + 1; x < cupW / 2; x++) p.px(cx + x, top, mix('#3a2212', '#8a5a34', 0.5 + 0.5 * Math.sin(x * 0.5 + t)));
  for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + i / 13 * Math.PI; p.px(Math.round(cx + cupW / 2 + Math.cos(a) * cupH * 0.3), Math.round(top + cupH * 0.45 + Math.sin(a) * cupH * 0.3), china); }
  for (let x = -Math.round(cupW * 0.8); x <= cupW * 0.8; x++) p.px(cx + x, table, china);
  for (let thread = 0; thread < 5; thread++) for (let rise = 0; rise < top; rise++) {
    // Each thread wanders further from the cup the higher it gets, and thins out as it goes.
    const up = rise / Math.max(1, top), x = cx + (thread - 2) * cupW * 0.14 + Math.sin(rise * 0.35 - t * 1.6 + thread * 1.9) * (1 + up * cupW * 0.3) + Math.sin(rise * 0.11 + t * 0.4 + thread) * up * cupW * 0.4;
    const strength = (1 - up) ** 1.4 * (0.35 + 0.3 * noise(rise * 0.3 - t * 2, thread));
    if (strength > 0.06) { const px = Math.round(x), py = top - 1 - rise; p.px(px, py, mix(p.at(px, py) ?? panelBackground, '#ffffff', strength)); }
  }
  p.flush();
  return g.finish();
};

// A row of machines mid-cycle: drums turning one way then the other, suds against the glass, a timer counting down on each.
const laundromat: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const unit = Math.min(p.ph, Math.max(12, Math.floor(p.pw / Math.max(1, Math.floor(p.pw / (p.ph * 1.05)))))), count = Math.max(1, Math.floor(p.pw / unit)), left = Math.floor((p.pw - count * unit) / 2);
  const body = mix(panelBackground, '#d8dce4', 0.8), clothes = [g.paint.fan(-0.9), g.paint.fan(0), g.paint.fan(0.9), '#f2f2f2'];
  const labels: [number, number, string][] = [];
  for (let n = 0; n < count; n++) {
    const x0 = left + n * unit, cx = x0 + unit / 2, cy = p.ph * 0.58, r = Math.min(unit * 0.36, p.ph * 0.36);
    for (let y = 0; y < p.ph; y++) for (let x = 1; x < unit - 1; x++) p.px(x0 + x, y, y < 3 ? mix(body, '#000000', 0.25) : mix(body, '#000000', 0.08 * (x / unit)));
    // Tumble one way for a few seconds, pause, then back the other way; a spin every so often.
    const phase = (t + n * 3.7) % 20, spinning = phase > 15, turn = spinning ? t * 14 : phase % 7 < 6 ? (Math.floor(phase / 7) % 2 ? -1 : 1) * t * 2.2 : 0;
    disc(p, cx, cy, r, r, (dx, dy) => {
      const d = Math.hypot(dx, dy);
      if (d > 0.86) return '#8a909c';
      const a = Math.atan2(dy, dx) - turn, load = noise(Math.cos(a) * d * 2.2 + n * 7, Math.sin(a) * d * 2.2, n);
      const water = dy > 0.25 + 0.08 * Math.sin(dx * 6 + t * 5) && !spinning;
      const item = clothes[Math.floor(clamp(load, 0, 0.999) * 4)]!;
      return mix(spinning ? mix(item, '#8fa8c8', 0.55) : item, water ? '#cfe4ff' : '#101820', water ? 0.45 : d > 0.55 ? 0.1 : 0.35 * (1 - load));
    });
    for (let lamp = 0; lamp < 3; lamp++) p.px(Math.round(x0 + unit * 0.2 + lamp * 2), 1, lamp === Math.floor(phase / 7) ? g.paint.accent : '#4a4f5a');
    labels.push([Math.round(x0 + unit * 0.6), 0, `${pad((20 - phase) / 1, 2)}:${pad(fract(20 - phase) * 60, 2)}`]);
  }
  p.flush();
  for (const [x, y, text] of labels) if (unit >= 18) g.write(x, y, text, g.paint.accent, '#101418');
  return g.finish();
};

// A transit diagram with the trains on it: coloured lines, interchange rings, and dots that stop at every station.
const subwayMap: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const lines = Math.max(2, Math.min(5, Math.floor(p.ph / 5)));
  const route = (line: number): [number, number][] => {
    // Each line is a few straight runs joined by forty-five degree bends, as the diagrams always are.
    const y0 = (line + 0.5) * p.ph / lines, points: [number, number][] = [[1, y0]];
    let x = 1, y = y0;
    for (let leg = 0; x < p.pw - 2; leg++) {
      const run = p.pw * (0.12 + 0.14 * hash(line * 9 + leg, 1)); x = Math.min(p.pw - 2, x + run); points.push([x, y]);
      const drop = (hash(line * 9 + leg, 2) - 0.5) * p.ph * 0.5, to = clamp(y + drop, 2, p.ph - 3), jump = Math.abs(to - y);
      if (x < p.pw - 2 - jump) { x += jump; y = to; points.push([x, y]); }
    }
    return points;
  };
  const marks: [number, number, string][] = [];
  for (let line = 0; line < lines; line++) {
    const points = route(line), tone = g.paint.fan(lines > 1 ? line / (lines - 1) * 2 - 1 : 0);
    let total = 0;
    const lengths = points.slice(1).map((point, i) => { const d = Math.hypot(point[0] - points[i]![0], point[1] - points[i]![1]); total += d; return d; });
    const at = (distance: number): [number, number] => { let d = distance; for (let i = 0; i < lengths.length; i++) { if (d <= lengths[i]!) { const u = d / lengths[i]!; return [points[i]![0] + (points[i + 1]![0] - points[i]![0]) * u, points[i]![1] + (points[i + 1]![1] - points[i]![1]) * u]; } d -= lengths[i]!; } return points.at(-1)!; };
    for (let d = 0; d <= total; d += 0.5) { const [x, y] = at(d); p.px(Math.round(x), Math.round(y), tone); p.px(Math.round(x), Math.round(y) + 1, mix(tone, '#000000', 0.25)); }
    const stops = Math.max(2, Math.round(total / 14));
    for (let stop = 0; stop <= stops; stop++) { const [x, y] = at(total * stop / stops); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) p.px(Math.round(x) + dx, Math.round(y) + dy, '#ffffff'); }
    for (let train = 0; train < 2; train++) {
      // Shuttle end to end, easing in and out of each stop and dwelling there.
      const legTime = 2.6, clock = t / legTime + train * stops * 0.5 + line * 0.37, lap = stops * 2, k = ((clock % lap) + lap) % lap, forward = k < stops, leg = Math.floor(forward ? k : lap - k - 0.0001), within = smooth(clamp(fract(k) * 1.35));
      const [x, y] = at(total * clamp((forward ? leg + within : leg + 1 - within) / stops));
      marks.push([Math.round(x), Math.round(y), tone]);
    }
  }
  for (const [x, y, tone] of marks) for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) p.px(x + dx, y + dy, dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1 ? tone : '#101216');
  p.flush();
  return g.finish();
};

// A weather radar: the beam going round, and bands of rain lighting up as it passes over them and fading until it returns.
const weatherRadar: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const cx = p.pw / 2, cy = p.ph / 2, r = Math.min(p.ph * 0.49, p.pw * 0.4), sweep = t * 1.3;
  const scale = [g.paint.fan(-0.9), g.paint.fan(-0.3), g.paint.fan(0.4), g.paint.fan(0.95)];
  disc(p, cx, cy, r * 1.25, r, (dx, dy) => {
    const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), since = fract((sweep - a) / TAU);
    // Storm cells drift with the wind; what the screen shows is how hard it was raining when the beam last looked.
    const seen = t - since * TAU / 1.3, rain = noise(dx * 2.6 + seen * 0.08 + 9, dy * 2.6 - seen * 0.03, 4) * 1.3 - 0.78 + 0.25 * noise(dx * 7, dy * 7 + seen * 0.1, 8);
    const ringMark = Math.abs(fract(d * 3) - 0.5) > 0.47 || Math.abs(dx) < 0.012 || Math.abs(dy) < 0.02;
    const glow = (1 - since) ** 6;
    const echo = rain > 0 ? mix(panelBackground, scale[Math.min(3, Math.floor(rain * 7))]!, 0.4 + 0.6 * (1 - since) ** 0.7) : mix(panelBackground, g.paint.accent, 0.05);
    return mix(ringMark ? mix(echo, g.paint.accent, 0.3) : echo, '#ffffff', glow * 0.5);
  });
  p.flush();
  if (g.w > 46) { g.write(1, 0, 'WX RADAR', g.paint.ink(0.6)); g.write(1, 1, `RANGE ${pad(120, 3)} km`, g.paint.ink(0.4)); g.write(g.w - 12, g.h - 1, `AZ ${pad((sweep / TAU * 360) % 360, 3)}°`, g.paint.ink(0.5)); }
  return g.finish();
};

// Sonar: a ping leaves the centre, and whatever it reaches answers with a blip that fades until the next one.
const sonar: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const cx = b.dw / 2, cy = b.dh / 2, reach = Math.hypot(b.dw / 2, b.dh / 2), period = 3, since = t % period, front = since / period * reach * 1.1;
  for (let ring = 1; ring <= 4; ring++) for (let i = 0; i < 90; i++) { const a = i / 90 * TAU; b.dot(cx + Math.cos(a) * ring * b.dh * 0.22 * 1.4, cy + Math.sin(a) * ring * b.dh * 0.22, g.paint.ink(0.13)); }
  for (let i = 0; i < front * 5; i++) { const a = i / (front * 5) * TAU; b.dot(cx + Math.cos(a) * front, cy + Math.sin(a) * front * 0.8, mix(panelBackground, g.paint.accent, clamp(1.1 - since / period))); }
  b.flush();
  const contacts: [number, number, number][] = [];
  for (let contact = 0; contact < Math.max(4, Math.round(g.w * g.h / 120)); contact++) {
    const drift = t * 0.02, x = (hash(contact, 1) + drift * (hash(contact, 2) - 0.5)) % 1, y = hash(contact, 3);
    contacts.push([x * g.w, y * g.h, Math.hypot((x - 0.5) * b.dw, (y - 0.5) * b.dh / 0.8)]);
  }
  for (const [x, y, far] of contacts) {
    const heard = front - far, age = heard > 0 ? heard / (reach * 1.1) * period : since + period - far / (reach * 1.1) * period;
    const strength = clamp(1.1 - age / 2.6);
    if (strength > 0.05) g.set(Math.floor(x), Math.floor(y), age < 0.25 ? '◉' : '●', mix(panelBackground, mix(g.paint.fan(0.8), '#ffffff', age < 0.25 ? 0.6 : 0), strength), undefined, age < 0.5);
  }
  g.set(Math.floor(g.w / 2), Math.floor(g.h / 2), '◆', g.paint.ink(1), undefined, true);
  if (g.w > 40) g.write(1, 0, `PING ${pad(Math.floor(t / period) % 1000, 3)}   ${since < 0.3 ? '•))' : '   '}`, g.paint.ink(0.5));
  return g.finish();
};

// A drum of paper turning under three pens: mostly a tremor, then a jolt that takes a long time to die away.
const seismograph: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const paper = mix(panelBackground, '#efe8d6', 0.92), traces = Math.max(1, Math.min(3, Math.floor(g.h / 4)));
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.set(x, y, ' ', paper, paper);
  const shake = (when: number, trace: number): number => {
    // A quake every twelve seconds or so: a sharp onset, then ringing that decays.
    let total = 0.05 * Math.sin(when * 7 + trace) + 0.04 * (noise(when * 9, trace) - 0.5);
    for (let quake = Math.floor(when / 12); quake > Math.floor(when / 12) - 2; quake--) {
      const since = when - quake * 12 - hash(quake, 1) * 6 - trace * 0.12;
      if (since > 0) total += (0.4 + 0.6 * hash(quake, 2)) * Math.exp(-since * 0.55) * Math.sin(since * (16 + trace * 3)) * (1 + 0.5 * Math.sin(since * 41));
    }
    return total;
  };
  for (let trace = 0; trace < traces; trace++) {
    const mid = (trace + 0.5) * b.dh / traces, swing = b.dh / traces * 0.46;
    let last = mid;
    for (let x = 0; x < b.dw; x++) { const y = mid - clamp(shake(t - (b.dw - 1 - x) / 40, trace), -1, 1) * swing; b.line(x, last, x, y, ['#1a2a6a', '#8a1a1a', '#1a5a2a'][trace]!); last = y; }
  }
  for (let x = g.w - 1 - Math.floor(t * 20) % 10; x >= 0; x -= 10) for (let y = 0; y < g.h; y++) if (g.h > 2 && y % 2 === 0) g.set(x, y, '┊', mix(paper, '#000000', 0.12), paper);
  b.flush(paper);
  if (g.w > 30) g.write(1, 0, `SEISMO  M ${(2 + 5 * Math.abs(shake(t, 0))).toFixed(1)}`, '#3a352c', paper);
  return g.finish();
};

// A dandelion clock in a light wind: seeds let go one at a time and sail off on their parachutes, and then it grows them back.
const dandelion: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const local = t % 30, headX = b.dw * 0.26, headY = b.dh * 0.44, r = Math.min(b.dh * 0.3, b.dw * 0.16), seeds = 46;
  const lean = Math.sin(t * 0.8) * 2;
  for (let s = 0; s <= 30; s++) { const u = s / 30; b.dot(headX + lean * u * u - (1 - u) * 3, b.dh - 1 - u * (b.dh - 1 - headY), g.paint.fan(-0.6)); b.dot(headX + lean * u * u - (1 - u) * 3 + 1, b.dh - 1 - u * (b.dh - 1 - headY), g.paint.fan(-0.6)); }
  for (let seed = 0; seed < seeds; seed++) {
    const a = seed / seeds * TAU * 3.3, depth = 0.5 + 0.5 * Math.sin(seed * 2.1), leaves = 2 + hash(seed, 1) * 21, regrow = local > 25 ? smooth((local - 25) / 5) : 0;
    const gone = local - leaves, tone = mix(panelBackground, mix(g.paint.accent, '#ffffff', 0.6), 0.45 + 0.55 * depth);
    let x = headX + lean + Math.cos(a) * r * (0.5 + 0.5 * depth) * 1.2, y = headY + Math.sin(a) * r * (0.5 + 0.5 * depth), tiltA = a;
    if (gone > 0 && !regrow) {
      // Off the head: the wind carries it right and gently up, bobbing, the tuft always trailing above the seed.
      x += gone * (9 + 6 * hash(seed, 2)) + Math.sin(gone * 1.3 + seed) * 3; y += -gone * (1.2 + 1.5 * hash(seed, 3)) + Math.sin(gone * 2.1 + seed) * 2.5; tiltA = -Math.PI / 2 + Math.sin(gone * 1.3 + seed) * 0.4;
      if (x > b.dw + 4) continue;
    } else if (regrow) { x = headX + lean + (x - headX - lean) * regrow; y = headY + (y - headY) * regrow; }
    b.line(x, y, x + Math.cos(tiltA) * 3, y + Math.sin(tiltA) * 3, tone);
    for (const fan of [-0.7, 0, 0.7]) b.dot(x + Math.cos(tiltA + fan) * 4.5, y + Math.sin(tiltA + fan) * 4.5, tone);
  }
  for (let i = 0; i < 16; i++) b.dot(headX + lean + Math.cos(i / 16 * TAU) * 1.5, headY + Math.sin(i / 16 * TAU) * 1.5, g.paint.fan(0.6));
  b.flush();
  return g.finish();
};

// Kites up on a good day: diamonds leaning into the gusts, tails snapping behind, strings running down to the hill.
const kites: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const sky = (y: number): string => mix(mix(panelBackground, g.paint.fan(-0.6), 0.5), mix(panelBackground, g.paint.fan(-0.2), 0.22), y / p.ph);
  fillAll(p, (_, y) => sky(y));
  for (let cloud = 0; cloud < 4; cloud++) { const cx = ((hash(cloud, 1) * p.pw + t * (1 + cloud * 0.6)) % (p.pw + 30)) - 15, cy = p.ph * (0.12 + 0.3 * hash(cloud, 2)); for (const [dx, r] of [[-5, 3], [0, 4.5], [6, 3.2]] as const) disc(p, cx + dx, cy, r * 1.6, r * 0.7, () => mix(sky(cy), '#ffffff', 0.5)); }
  const hill = (x: number): number => p.ph - 2 - Math.round(Math.sin(x / p.pw * Math.PI) * p.ph * 0.1);
  for (let x = 0; x < p.pw; x++) for (let y = hill(x); y < p.ph; y++) p.px(x, y, mix(panelBackground, g.paint.fan(-0.75), 0.6));
  const count = Math.max(2, Math.round(p.pw / 24));
  for (let kite = 0; kite < count; kite++) {
    const gust = noise(t * 0.35, kite * 5.3), ax = (kite + 0.5) * p.pw / count, ay = hill(Math.round(ax));
    const kx = ax + p.pw * 0.08 + Math.sin(t * 0.6 + kite * 2) * p.pw * 0.05 + gust * 6, ky = p.ph * (0.16 + 0.24 * hash(kite, 3)) + Math.cos(t * 0.8 + kite) * 2 - gust * 2;
    const size = Math.max(2, p.ph * 0.13), tilt = 0.5 + Math.sin(t * 1.1 + kite) * 0.25, tone = g.paint.fan(kite / Math.max(1, count - 1) * 2 - 1);
    // The string sags towards the flier; the harder the gust, the straighter it pulls.
    for (let s = 0; s <= 40; s++) { const u = s / 40; p.px(Math.round(ax + (kx - ax) * u), Math.round(ay + (ky - ay) * u + Math.sin(u * Math.PI) * (5 - gust * 3)), mix(sky(ay), '#ffffff', 0.45)); }
    for (let dy = -size; dy <= size * 1.5; dy++) { const half = dy < 0 ? (size + dy) * 0.8 : (size * 1.5 - dy) * 0.55; for (let dx = -half; dx <= half; dx++) { const rx = dx * Math.cos(tilt) - dy * Math.sin(tilt), ry = dx * Math.sin(tilt) + dy * Math.cos(tilt); p.px(Math.round(kx + rx), Math.round(ky + ry), dx < 0 === dy < 0 ? tone : mix(tone, '#000000', 0.25)); } }
    let tx = kx - Math.sin(tilt) * size * 1.5, ty = ky + Math.cos(tilt) * size * 1.5;
    for (let seg = 0; seg < 10; seg++) { tx -= 1.4; ty += 0.9 + Math.sin(t * 6 - seg * 0.9 + kite) * 0.9; p.px(Math.round(tx), Math.round(ty), seg % 3 === 1 ? mix(tone, '#ffffff', 0.5) : tone); }
    stroke(p, ax, ay, ax, ay - 3, 0.3, '#14181c'); p.px(Math.round(ax), ay - 4, '#14181c');
  }
  p.flush();
  return g.finish();
};

// The lift: a shaft in cross-section, the car answering calls, and the indicator over the door counting the floors.
const elevator: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const floors = Math.max(2, g.h), shaft = Math.max(8, Math.min(14, Math.floor(g.w * 0.2))), left = Math.floor(g.w / 2 - shaft / 2);
  const trip = Math.floor(t / 5), from = Math.floor(hash(trip, 1) * floors), to = Math.floor(hash(trip + 1, 1) * floors), local = t - trip * 5;
  // Two seconds between any two floors, then the doors: open, wait, close.
  const moving = smooth(clamp(local / 2.4)), at = from + (to - from) * moving, doors = local > 2.6 && local < 4.6 ? smooth(clamp(Math.min(local - 2.6, 4.6 - local) * 2.5)) : 0;
  for (let row = 0; row < g.h; row++) {
    const floor = floors - 1 - row;
    g.set(left - 1, row, '│', g.paint.ink(0.5)); g.set(left + shaft, row, '│', g.paint.ink(0.5));
    g.write(left - 5, row, pad(floor + 1, 2), Math.round(at) === floor ? g.paint.accent : g.paint.ink(0.3));
    for (let x = 0; x < shaft; x++) g.set(left + x, row, x === Math.floor(shaft / 2) ? '┆' : ' ', g.paint.ink(0.14));
    const called = floor === to && moving < 1;
    g.write(left + shaft + 2, row, called ? (to > from ? '▲' : '▼') : '·', called ? (Math.floor(t * 4) % 2 ? g.paint.fan(0.9) : g.paint.ink(0.5)) : g.paint.ink(0.2));
    if (g.w > 50 && hash(floor, 7) > 0.4) g.write(left + shaft + 5, row, ['LOBBY', 'POST ROOM', 'RECORDS', 'STUDIO A', 'STUDIO B', 'NEWSROOM', 'LIBRARY', 'CANTEEN', 'TRANSMITTER', 'ROOF'][floor % 10]!, g.paint.ink(0.3));
  }
  const carRow = clamp(Math.round(floors - 1 - at), 0, g.h - 1), steel = mix(panelBackground, '#c8ccd6', 0.8), open = Math.round(doors * (shaft / 2 - 1));
  for (let x = 0; x < shaft; x++) {
    const gap = Math.abs(x - (shaft - 1) / 2) < open;
    g.set(left + x, carRow, gap ? (Math.abs(x - (shaft - 1) / 2) < 1 ? '☻' : ' ') : '▓', gap ? '#2a2018' : steel, gap ? '#ffd98a' : steel);
  }
  if (g.w > 44) {
    const dial = `${to > from && moving < 1 ? '▲' : to < from && moving < 1 ? '▼' : '■'} ${pad(Math.round(at) + 1, 2)}`;
    g.write(Math.max(0, left - 16), Math.floor(g.h / 2), ` ${dial} `, '#ff5a3a', '#14080a');
    if (g.h > 3) g.write(Math.max(0, left - 16), Math.floor(g.h / 2) + 1, moving < 1 ? 'going' : doors > 0.5 ? 'ding!' : '     ', g.paint.ink(0.4));
  }
  return g.finish();
};

export const everydayReceiverBuilders = {
  'train-window': trainWindow,
  'city-windows': cityWindows,
  'cat-nap': catNap,
  'coffee-steam': coffeeSteam,
  laundromat,
  'subway-map': subwayMap,
  'weather-radar': weatherRadar,
  sonar,
  seismograph,
  dandelion,
  kites,
  elevator
};

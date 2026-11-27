import type {ThemeName} from '../../types.js';
import {TAU, band, braille, clamp, fract, grid, hash, kick, mix, noise, pixels, replay, seconds, smooth, stroke, tri, type Builder, type Pixels, type Run} from './cell-canvas.js';

const pad2 = (n: number): string => String(Math.floor(n)).padStart(2, '0');
const safe = (theme: ThemeName) => (hex: string): string => {
  if (theme !== 'mono') return hex;
  const [r, g, b] = [1, 3, 5].map(o => parseInt(hex.slice(o, o + 2), 16));
  const grey = Math.round(0.3 * r! + 0.59 * g! + 0.11 * b!).toString(16).padStart(2, '0');
  return `#${grey}${grey}${grey}`;
};
const discPx = (p: Pixels, cx: number, cy: number, rx: number, ry: number, color: string): void => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / Math.max(0.5, rx), dy = (y + 0.5 - cy) / Math.max(0.5, ry);
      if (dx * dx + dy * dy <= 1) p.px(x, y, color);
    }
  }
};

// 1. Precision medieval celestial brass astrolabe: stereographic almucantar arcs, rotating starry rete, and swinging alidade.
const astrolabe: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#050814');
  const brass = theme === 'mono' ? '#c8c8c8' : mix(c('#d9a94a'), g.paint.accent, 0.32);
  const bright = mix(brass, '#ffffff', 0.45), dimBrass = mix(bg, brass, 0.36), starCol = mix(g.paint.accent, '#ffffff', 0.55);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.set(x, y, ' ', brass, bg);
  // Subtle starfield outside the mater.
  for (let s = 0; s < Math.max(6, Math.floor(g.w * g.h / 28)); s++) {
    const sx = Math.floor(hash(s, 7) * g.w), sy = Math.floor(hash(s, 8) * g.h);
    if (tri(t * 0.25 + hash(s, 9)) > 0.6) g.set(sx, sy, '·', dimBrass, bg);
  }
  const hasTelemetry = g.w >= 54 && g.h >= 8;
  const cx = hasTelemetry ? b.dw * 0.38 : b.dw * 0.5, cy = b.dh * 0.52;
  const R = Math.max(4, Math.min(b.dh * 0.45, b.dw * (hasTelemetry ? 0.32 : 0.45)));
  // Outer mater rings and 36 ten-degree bevel ticks.
  for (let i = 0; i < 140; i++) {
    const a = i / 140 * TAU;
    b.dot(cx + Math.cos(a) * R, cy + Math.sin(a) * R, brass);
    b.dot(cx + Math.cos(a) * (R * 0.88), cy + Math.sin(a) * (R * 0.88), dimBrass);
  }
  for (let k = 0; k < 36; k++) {
    const a = k / 36 * TAU;
    b.line(cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx + Math.cos(a) * (R * (k % 3 === 0 ? 0.86 : 0.91)), cy + Math.sin(a) * (R * (k % 3 === 0 ? 0.86 : 0.91)), k % 9 === 0 ? bright : dimBrass);
  }
  // Stereographic almucantar altitude arcs & meridian cross inside the tympan.
  b.line(cx - R * 0.86, cy, cx + R * 0.86, cy, dimBrass);
  b.line(cx, cy - R * 0.86, cx, cy + R * 0.86, dimBrass);
  for (const frac of [0.3, 0.52, 0.72]) {
    const ar = R * frac, acy = cy - R * (0.28 * (1 - frac));
    for (let i = 0; i < 80; i++) {
      const a = i / 80 * TAU, px = cx + Math.cos(a) * ar, py = acy + Math.sin(a) * ar;
      if (Math.hypot(px - cx, py - cy) < R * 0.87) b.dot(px, py, dimBrass);
    }
  }
  // Rotating eccentric ecliptic rete & 6 star-pointer daggers.
  const reteA = t * 0.28;
  const ex = cx + Math.cos(reteA) * R * 0.19, ey = cy + Math.sin(reteA) * R * 0.19, eR = R * 0.52;
  for (let i = 0; i < 96; i++) {
    const a = i / 96 * TAU;
    b.dot(ex + Math.cos(a) * eR, ey + Math.sin(a) * eR, bright);
  }
  const stars = [
    {name: 'VEGA', a: 0.4, r: 0.68}, {name: 'ALTAIR', a: 1.5, r: 0.76}, {name: 'SIRIUS', a: 2.7, r: 0.62},
    {name: 'DENEB', a: 3.9, r: 0.74}, {name: 'RIGEL', a: 5.0, r: 0.66}, {name: 'ARCTURUS', a: 5.8, r: 0.58}
  ];
  const starCells: {x: number; y: number; name: string; hot: boolean}[] = [];
  stars.forEach((st, idx) => {
    const a = st.a + reteA, sr = R * st.r;
    const sx = cx + Math.cos(a) * sr, sy = cy + Math.sin(a) * sr;
    const baseA = a - 0.18, bx = ex + Math.cos(baseA) * eR, by = ey + Math.sin(baseA) * eR;
    b.line(bx, by, sx, sy, brass);
    starCells.push({x: Math.round(sx / 2), y: Math.round(sy / 4), name: st.name, hot: band(idx * 3, t) > 0.48});
  });
  // Swinging sighting alidade rule pivoted at the center horse-pin.
  const aliA = Math.sin(t * 0.42) * 0.95 - 0.35;
  b.line(cx - Math.cos(aliA) * R * 0.96, cy - Math.sin(aliA) * R * 0.96, cx + Math.cos(aliA) * R * 0.96, cy + Math.sin(aliA) * R * 0.96, bright);
  b.flush(bg);
  starCells.forEach(s => g.set(s.x, s.y, s.hot ? '✦' : '✧', s.hot ? '#ffffff' : starCol, bg, s.hot));
  g.set(Math.round(cx / 2), Math.round(cy / 4), '●', bright, bg, true);
  if (hasTelemetry) {
    const tx = Math.floor(g.w * 0.72), alt = Math.round(45 + 32 * Math.sin(aliA)), azm = Math.floor(((reteA * 57.3) % 360 + 360) % 360);
    const activeStar = stars[Math.floor(t / 4) % stars.length]!;
    g.write(tx, 1, 'ASTROLABE', bright, bg);
    g.write(tx, 3, `ALT  ${String(alt).padStart(2, '0')}°`, brass, bg);
    g.write(tx, 4, `AZM ${String(azm).padStart(3, '0')}°`, brass, bg);
    g.write(tx, 6, `★ ${activeStar.name}`, starCol, bg);
    g.write(tx, 7, `LAT 37°46'N`, dimBrass, bg);
    if (g.h >= 11) {
      const mW = Math.max(4, Math.min(14, g.w - tx - 1)), fill = Math.round(clamp(0.35 + 0.65 * band(3, t)) * mW);
      g.write(tx, 9, 'EPOCH 1609', dimBrass, bg);
      g.write(tx, 10, '─'.repeat(fill) + '·'.repeat(mW - fill), bright, bg);
    }
  }
  return g.finish();
};

// 2. Kinetic retro arcade pinball playfield with live replayed physics, flashing pop bumpers, flippers & score display.
type PinballState = {x: number; y: number; vx: number; vy: number; score: number; mult: number; lanes: boolean[]; flash: number[]; trail: [number, number][]; sparks: {x: number; y: number; vx: number; vy: number; age: number}[]};
const pinballRuns = new Map<string, Run<PinballState>>();
const pinball: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#070816'), rail = c('#343a56'), lit = mix(g.paint.accent, '#ffffff', 0.35), mid = g.paint.accent, hot = g.paint.fan(0.95), cool = g.paint.fan(-0.75);
  const hasHud = p.pw >= 48 && p.ph >= 12;
  const playW = hasHud ? Math.floor(p.pw * 0.66) : p.pw;
  const x0 = hasHud ? 2 : 0, x1 = Math.max(x0 + 4, playW - 2), y0 = 1, y1 = Math.max(y0 + 4, p.ph - 1);
  const pw = x1 - x0, ph = y1 - y0;
  const bumpers: [number, number, number][] = [
    [x0 + pw * 0.34, y0 + ph * 0.34, Math.max(1.8, Math.min(pw, ph) * 0.1)],
    [x0 + pw * 0.66, y0 + ph * 0.34, Math.max(1.8, Math.min(pw, ph) * 0.1)],
    [x0 + pw * 0.5, y0 + ph * 0.54, Math.max(1.8, Math.min(pw, ph) * 0.1)]
  ];
  const epoch = Math.floor(pulse / 900), step = pulse - epoch * 900;
  const st = replay(pinballRuns, `${p.pw}x${p.ph}`, epoch, step, ep => ({
    x: x0 + pw * (0.28 + 0.44 * hash(ep, 1)), y: y0 + ph * 0.2,
    vx: (hash(ep, 2) > 0.5 ? 1 : -1) * Math.max(0.45, pw * 0.03), vy: -Math.max(0.35, ph * 0.02),
    score: 12400 + Math.floor(hash(ep, 3) * 8000), mult: 1, lanes: [false, false, false], flash: [0, 0, 0], trail: [], sparks: []
  }), (s, k) => {
    s.vy += Math.max(0.035, ph * 0.0024);
    s.x += s.vx; s.y += s.vy;
    s.trail.push([s.x, s.y]); if (s.trail.length > 7) s.trail.shift();
    for (let i = 0; i < 3; i++) s.flash[i] = Math.max(0, s.flash[i]! - 1);
    s.sparks.forEach(sp => { sp.x += sp.vx; sp.y += sp.vy; sp.age++; });
    s.sparks = s.sparks.filter(sp => sp.age < 7);
    if (s.x < x0 + 1.5) { s.x = x0 + 1.5; s.vx = Math.abs(s.vx) * 0.92; }
    if (s.x > x1 - 1.5) { s.x = x1 - 1.5; s.vx = -Math.abs(s.vx) * 0.92; }
    if (s.y < y0 + 1.5) { s.y = y0 + 1.5; s.vy = Math.abs(s.vy) * 0.85; const lane = clamp(Math.floor((s.x - x0) / pw * 3), 0, 2); s.lanes[lane] = true; s.score += 250 * s.mult; if (s.lanes.every(Boolean)) { s.mult = Math.min(5, s.mult + 1); s.lanes = [false, false, false]; s.score += 2000; } }
    // Pop bumper elastic kick + sparks.
    bumpers.forEach(([bx, by, br], idx) => {
      const dx = s.x - bx, dy = s.y - by, d = Math.hypot(dx, dy);
      if (d < br + 1.2 && d > 0.01) {
        const nx = dx / d, ny = dy / d, boost = Math.max(0.85, Math.min(pw, ph) * 0.055);
        s.x = bx + nx * (br + 1.3); s.y = by + ny * (br + 1.3);
        s.vx = nx * boost + (hash(k, idx) - 0.5) * 0.35; s.vy = ny * boost - 0.2;
        s.flash[idx] = 6; s.score += 500 * s.mult;
        for (let q = 0; q < 5; q++) { const a = hash(k * 7 + q, idx) * TAU; s.sparks.push({x: bx + nx * br, y: by + ny * br, vx: Math.cos(a) * 0.9, vy: Math.sin(a) * 0.9, age: 0}); }
      }
    });
    // Flipper strike zone launches ball back up the table.
    if (s.y > y1 - Math.max(2.5, ph * 0.16) && s.vy > 0) {
      const aim = (s.x - (x0 + pw * 0.5)) / Math.max(1, pw * 0.5);
      s.y = y1 - Math.max(2.6, ph * 0.17);
      s.vy = -Math.max(1.1, ph * 0.078) * (0.85 + 0.3 * hash(k, 19));
      s.vx = clamp(-aim * 1.1 + (hash(k, 23) - 0.5) * 1.4, -1.6, 1.6);
      s.score += 100 * s.mult;
    }
    const spd = Math.hypot(s.vx, s.vy), maxSpd = Math.max(1.4, Math.min(pw, ph) * 0.085);
    if (spd > maxSpd) { s.vx *= maxSpd / spd; s.vy *= maxSpd / spd; }
  });
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, bg);
  // Playfield border, top arch, rollover lanes, and slingshots.
  for (let y = y0; y <= y1; y++) { p.px(x0, y, rail); p.px(x1, y, rail); }
  for (let x = x0; x <= x1; x++) p.px(x, y0, rail);
  for (let l = 0; l < 3; l++) {
    const lx = Math.round(x0 + pw * (0.22 + l * 0.28));
    p.px(lx, y0 + 2, st.lanes[l] ? hot : mix(bg, mid, 0.3));
    p.px(lx + 1, y0 + 2, st.lanes[l] ? hot : mix(bg, mid, 0.3));
  }
  // Slingshot walls & animated flippers.
  const flipY = y1 - Math.max(2, Math.floor(ph * 0.12));
  const lFlip = st.y > flipY - 4 && st.x < x0 + pw * 0.5 ? -2.2 : 1.2;
  const rFlip = st.y > flipY - 4 && st.x >= x0 + pw * 0.5 ? -2.2 : 1.2;
  stroke(p, x0 + 2, flipY - 4, x0 + pw * 0.22, flipY, 0.6, cool);
  stroke(p, x1 - 2, flipY - 4, x1 - pw * 0.22, flipY, 0.6, cool);
  stroke(p, x0 + pw * 0.22, flipY, x0 + pw * 0.45, flipY + lFlip, 0.75, hot);
  stroke(p, x1 - pw * 0.22, flipY, x1 - pw * 0.45, flipY + rFlip, 0.75, hot);
  // Pop bumpers & spark bursts.
  bumpers.forEach(([bx, by, br], idx) => {
    const fl = st.flash[idx]! > 0;
    discPx(p, bx, by, br, br, fl ? '#ffffff' : idx === 2 ? hot : mid);
    discPx(p, bx, by, br * 0.52, br * 0.52, fl ? hot : lit);
  });
  st.sparks.forEach(sp => p.px(Math.round(sp.x), Math.round(sp.y), sp.age < 3 ? '#ffffff' : hot));
  // Steel ball trail + gleaming chrome ball.
  st.trail.forEach(([tx, ty], i) => p.px(Math.round(tx), Math.round(ty), mix(bg, lit, (i + 1) / st.trail.length * 0.55)));
  discPx(p, st.x, st.y, 1.05, 1.05, '#ffffff');
  p.flush();
  if (hasHud) {
    const hx = x1 + 3;
    g.write(hx, 1, 'PINBALL', lit, bg);
    g.write(hx, 3, 'SCORE', mix(bg, mid, 0.5), bg);
    g.write(hx, 4, String(st.score).padStart(7, '0'), '#ffffff', bg);
    g.write(hx, 6, `BONUS ${st.mult}X`, hot, bg);
    g.write(hx, 8, `LANES ${st.lanes.map((on, i) => on ? 'ABC'[i] : '·').join(' ')}`, lit, bg);
    if (g.h >= 12) g.write(hx, 11, kick(t) > 0.45 ? '★ EXTRA BALL' : '  BALL 01   ', kick(t) > 0.45 ? hot : mix(bg, mid, 0.45), bg);
  }
  return g.finish();
};

// 3. Faceted glass tabletop botanical moss terrarium with soil strata, swaying ferns, glowing mushrooms, condensation & sunbeam.
const terrarium: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#07090e'), shelf = c('#1c1714');
  const glassRim = mix(c('#9ec4cc'), g.paint.accent, 0.28);
  const mossHi = theme === 'mono' ? '#a6a6a6' : mix(c('#48b566'), g.paint.accent, 0.25);
  const mossLo = theme === 'mono' ? '#5e5e5e' : mix(c('#1d5e36'), g.paint.accent, 0.2);
  const loam = c('#2c2017'), charcoal = c('#16181c'), pebble = c('#767268');
  const capGlow = mix(g.paint.fan(0.75), '#ffffff', 0.25), sunTint = mix(g.paint.accent, c('#fff2c2'), 0.55);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, y >= p.ph - 2 ? shelf : bg);
  const cx = p.pw / 2, domeTop = 1, domeBot = p.ph - 3;
  const maxHalf = Math.max(3, Math.min(p.pw * 0.44, p.ph * 1.15));
  const halfAt = (y: number): number => {
    const u = (y - domeTop) / Math.max(1, domeBot - domeTop);
    if (u < 0.35) return maxHalf * (0.48 + 0.52 * smooth(u / 0.35));
    if (u > 0.85) return maxHalf * (1 - 0.14 * ((u - 0.85) / 0.15));
    return maxHalf;
  };
  const mossY = (x: number): number => domeTop + (domeBot - domeTop) * (0.64 + 0.05 * Math.sin(x * 0.22) + 0.03 * Math.cos(x * 0.45));
  // Fill interior of faceted glass vessel: diagonal sunbeam, layered soil strata & moss carpet.
  for (let y = domeTop; y <= domeBot; y++) {
    const hw = halfAt(y), lx = Math.round(cx - hw), rx = Math.round(cx + hw);
    for (let x = lx; x <= rx; x++) {
      const edge = x === lx || x === rx || y === domeTop || y === domeBot;
      const my = mossY(x), soilDepth = (y - my) / Math.max(1, domeBot - my);
      if (edge) { p.px(x, y, glassRim); continue; }
      if (y < my) {
        const beamDist = Math.abs((x - cx) - (y - domeTop) * 0.55 + Math.sin(t * 0.3) * 3);
        const beam = Math.exp(-beamDist * beamDist / Math.max(12, maxHalf * 2.5)) * 0.18;
        const spec = Math.abs(x - (lx + 2)) <= 0.5 ? 0.24 : 0;
        p.px(x, y, mix(mix(bg, glassRim, 0.08), sunTint, clamp(beam + spec)));
      } else if (soilDepth < 0.26) {
        const tuft = noise(x * 0.4, y * 0.6) > 0.48;
        p.px(x, y, tuft ? mossHi : mossLo);
      } else if (soilDepth < 0.62) {
        p.px(x, y, hash(x, y) > 0.85 ? mix(loam, c('#5a4332'), 0.4) : loam);
      } else if (soilDepth < 0.74) {
        p.px(x, y, charcoal);
      } else {
        const stone = hash(Math.floor(x / 2), y) > 0.52;
        p.px(x, y, stone ? pebble : mix(pebble, charcoal, 0.55));
      }
    }
  }
  // Swaying botanical fern fronds rising from the moss bed.
  const ferns = [cx - maxHalf * 0.34, cx + maxHalf * 0.22];
  ferns.forEach((fx, idx) => {
    const baseY = mossY(fx), h = Math.max(3, (domeBot - domeTop) * (idx ? 0.34 : 0.42));
    const sway = Math.sin(t * 1.1 + idx * 2.1) * (1.4 + 0.6 * kick(t));
    for (let k = 0; k <= 12; k++) {
      const f = k / 12, sy = baseY - f * h, sx = fx + (idx ? 1 : -1) * f * f * 3.5 + sway * f;
      p.px(Math.round(sx), Math.round(sy), mossHi);
      if (k >= 2 && k <= 11 && k % 2 === 0) {
        const span = Math.round((1 - f * 0.75) * Math.max(1.5, maxHalf * 0.14));
        for (let d = 1; d <= span; d++) {
          p.px(Math.round(sx - d), Math.round(sy + d * 0.3), mossHi);
          p.px(Math.round(sx + d), Math.round(sy + d * 0.3), mossLo);
        }
      }
    }
  });
  // Three whimsical glowing mushrooms pulsing gently on the beat.
  [-0.08, 0.05, 0.44].forEach((off, idx) => {
    const mx = cx + maxHalf * off, my = mossY(mx);
    const stemH = Math.max(2, Math.round(p.ph * (idx === 1 ? 0.12 : 0.09)));
    const pulseGlow = mix(capGlow, '#ffffff', 0.25 + 0.45 * band(idx * 4 + 1, t));
    for (let k = 0; k < stemH; k++) p.px(Math.round(mx), Math.round(my - k), c('#e6dec8'));
    discPx(p, mx, my - stemH, Math.max(1.2, maxHalf * 0.08), 1.1, pulseGlow);
  });
  // Slow trickling glass condensation droplets & floating luminous spores.
  for (let d = 0; d < 6; d++) {
    const prog = fract(hash(d, 41) + t * (0.04 + 0.03 * hash(d, 42)));
    const dy = domeTop + 2 + prog * (domeBot - domeTop) * 0.55;
    const hw = halfAt(dy);
    const dx = cx + (d % 2 ? 1 : -1) * (hw - 1.5 - hash(d, 43) * 2);
    p.px(Math.round(dx), Math.round(dy), mix(glassRim, '#ffffff', 0.5));
  }
  for (let s = 0; s < 10; s++) {
    const sy = domeTop + 3 + fract(hash(s, 51) - t * 0.05) * (domeBot - domeTop) * 0.45;
    const sx = cx + (hash(s, 52) * 2 - 1) * halfAt(sy) * 0.72 + Math.sin(t + s) * 1.5;
    p.px(Math.round(sx), Math.round(sy), mix(sunTint, '#ffffff', 0.35 + 0.4 * tri(t + s)));
  }
  p.flush();
  return g.finish();
};

// 6. Exposed Swiss skeleton mechanical tourbillon watch movement: meshing phase-locked Braille gears, oscillating balance wheel & ruby jewels.
const tourbillon: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#090c14'), plate = c('#131926');
  const gold = theme === 'mono' ? '#d4d4d4' : mix(c('#e0b354'), g.paint.accent, 0.28);
  const steel = c('#9aa8be'), ruby = theme === 'mono' ? '#f2f2f2' : c('#e82848'), blueHand = mix(g.paint.accent, '#ffffff', 0.35);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.set(x, y, ' ', steel, (x + y) % 4 === 0 ? bg : plate);
  const cx = b.dw / 2, cy = b.dh / 2, U = Math.max(4, Math.min(b.dh * 0.44, b.dw * 0.22));
  const drawGear = (gx: number, gy: number, r: number, teeth: number, angle: number, col: string, spokes: number): void => {
    const inner = r * 0.78, hub = r * 0.22;
    for (let i = 0; i < teeth * 4; i++) {
      const a = angle + i / (teeth * 4) * TAU;
      const rad = (i % 4 < 2) ? r : r * 0.87;
      const a2 = angle + (i + 1) / (teeth * 4) * TAU;
      const rad2 = ((i + 1) % 4 < 2) ? r : r * 0.87;
      b.line(gx + Math.cos(a) * rad, gy + Math.sin(a) * rad, gx + Math.cos(a2) * rad2, gy + Math.sin(a2) * rad2, col);
    }
    for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; b.dot(gx + Math.cos(a) * inner, gy + Math.sin(a) * inner, col); }
    for (let s = 0; s < spokes; s++) {
      const a = angle + s / spokes * TAU;
      b.line(gx + Math.cos(a) * hub, gy + Math.sin(a) * hub, gx + Math.cos(a) * inner, gy + Math.sin(a) * inner, col);
    }
  };
  // Four phase-locked meshing gears: central carriage, upper-left mainspring barrel, right intermediate wheel, lower seconds wheel.
  const tickStep = Math.floor(t * 4) / 4 + smooth(fract(t * 4)) * 0.25;
  const w1 = tickStep * 0.85;
  const rMain = U * 0.92, rLeft = U * 0.72, rRight = U * 0.58;
  const lx = cx - (rMain + rLeft) * 0.9, ly = cy - U * 0.22;
  const rx = cx + (rMain + rRight) * 0.92, ry = cy + U * 0.14;
  drawGear(lx, ly, rLeft, 14, -w1 * (rMain / rLeft) + 0.2, steel, 5);
  drawGear(rx, ry, rRight, 11, -w1 * (rMain / rRight) + 0.15, gold, 4);
  drawGear(cx, cy, rMain, 18, w1, gold, 3);
  // Oscillating balance wheel + breathing spiral hairspring inside the central tourbillon cage.
  const balA = Math.sin(t * 7.8) * 1.15, balR = rMain * 0.56;
  for (let i = 0; i < 56; i++) { const a = i / 56 * TAU; b.dot(cx + Math.cos(a) * balR, cy + Math.sin(a) * balR, blueHand); }
  b.line(cx - Math.cos(balA) * balR, cy - Math.sin(balA) * balR, cx + Math.cos(balA) * balR, cy + Math.sin(balA) * balR, blueHand);
  for (let i = 0; i < 40; i++) {
    const f = i / 40, a = f * TAU * 2.4 + balA * 0.5, sr = (0.1 + 0.34 * f * (1 + 0.12 * Math.sin(t * 7.8))) * balR;
    b.dot(cx + Math.cos(a) * sr, cy + Math.sin(a) * sr, mix(blueHand, '#ffffff', 0.3));
  }
  // Sweeping seconds hand on the right sub-wheel.
  const secA = tickStep * 1.2 - Math.PI / 2;
  b.line(rx, ry, rx + Math.cos(secA) * rRight * 0.85, ry + Math.sin(secA) * rRight * 0.85, blueHand);
  b.flush(plate);
  // Glowing ruby jewel bearings at every pivot.
  for (const [jx, jy] of [[cx, cy], [lx, ly], [rx, ry]]) {
    g.set(Math.round(jx! / 2), Math.round(jy! / 4), '●', ruby, plate, true);
  }
  if (g.w >= 32 && g.h >= 6) {
    g.write(2, 0, 'TOURBILLON', gold, bg);
    g.write(g.w - 11, 0, '28800 VPH', steel, bg);
    g.write(2, g.h - 1, 'SWISS MADE', mix(plate, steel, 0.5), bg);
    g.write(g.w - 11, g.h - 1, '21 JEWELS', ruby, bg);
  }
  return g.finish();
};

// 9. Gothic cathedral stained-glass rose window: 12-fold stone tracery mullions illuminated by a traversing diagonal sunbeam.
const roseWindow: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const wall = c('#0b0b10'), stone = c('#181920');
  const cx = p.pw / 2, cy = p.ph / 2, R = Math.max(3, Math.min(p.ph * 0.47, p.pw * 0.38));
  const beamCenter = Math.sin(t * 0.32) * R * 1.15;
  const swell = 0.85 + 0.3 * kick(t);
  for (let y = 0; y < p.ph; y++) {
    for (let x = 0; x < p.pw; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / R;
      if (d > 1.04) {
        // Subtle nave dust motes catching stray light outside the rose.
        const mote = hash(x * 13 + y, Math.floor(t * 0.7)) > 0.996 ? 0.35 : 0;
        p.px(x, y, mix(wall, g.paint.accent, mote));
        continue;
      }
      if (d > 0.96) { p.px(x, y, stone); continue; }
      const ang = (Math.atan2(dy, dx) + TAU) % TAU;
      const sector = Math.floor(ang / TAU * 12), secF = fract(ang / TAU * 12);
      const petalRib = Math.abs(secF - 0.5) > 0.44 && d > 0.18;
      const ringRib = Math.abs(d - 0.2) < 0.045 || Math.abs(d - 0.58) < 0.042 || Math.abs(d - 0.82) < 0.04;
      const archRib = d > 0.58 && d < 0.82 && Math.abs((d - 0.58) / 0.24 - Math.sin(secF * Math.PI) * 0.85) < 0.08;
      if (petalRib || ringRib || archRib) { p.px(x, y, stone); continue; }
      // Jewel-toned stained glass color per ring & petal, lit dynamically by the diagonal sunbeam.
      const hueShift = d < 0.2 ? 0.0 : d < 0.58 ? (sector % 2 ? 0.75 : -0.65) : d < 0.82 ? (sector % 3 - 1) * 0.85 : (sector % 2 ? -0.85 : 0.9);
      const jewel = g.paint.fan(hueShift + Math.sin(t * 0.15) * 0.2);
      const beamDist = Math.abs((dx * 0.75 + dy * 0.65) - beamCenter);
      const sun = Math.exp(-(beamDist * beamDist) / Math.max(18, R * R * 0.28)) * swell;
      const bandBoost = band(sector * 1.8, t) * 0.28;
      const litGlass = mix(mix(wall, jewel, 0.42 + bandBoost), mix(jewel, '#ffffff', 0.48), clamp(sun));
      p.px(x, y, litGlass);
    }
  }
  p.flush();
  return g.finish();
};

// 12. Historic Grandmaster Chess Match (Paul Morphy's 1858 Opera Game) playing move-by-move with clocks & algebraic log.
const OPERA_MOVES: [number, number, number, number, string][] = [
  [6, 4, 4, 4, '1. e4'], [1, 4, 3, 4, 'e5'], [7, 6, 5, 5, '2. Nf3'], [1, 3, 2, 3, 'd6'],
  [6, 3, 4, 3, '3. d4'], [0, 2, 4, 6, 'Bg4'], [4, 3, 3, 4, '4. dxe5'], [4, 6, 5, 5, 'Bxf3'],
  [7, 3, 5, 5, '5. Qxf3'], [2, 3, 3, 4, 'dxe5'], [7, 5, 4, 2, '6. Bc4'], [0, 6, 2, 5, 'Nf6'],
  [5, 5, 5, 1, '7. Qb3'], [0, 3, 1, 4, 'Qe7'], [7, 1, 5, 2, '8. Nc3'], [1, 2, 2, 2, 'c6'],
  [7, 2, 3, 6, '9. Bg5'], [1, 1, 3, 1, 'b5'], [5, 2, 3, 1, '10. Nxb5'], [2, 2, 3, 1, 'cxb5'],
  [4, 2, 3, 1, '11. Bxb5+'], [0, 1, 1, 3, 'Nbd7'], [7, 4, 7, 2, '12. O-O-O'], [0, 0, 0, 3, 'Rd8'],
  [7, 3, 1, 3, '13. Rxd7'], [0, 3, 1, 3, 'Rxd7'], [7, 7, 7, 3, '14. Rd1'], [1, 4, 2, 4, 'Qe6'],
  [3, 1, 1, 3, '15. Bxd7+'], [2, 5, 1, 3, 'Nxd7'], [5, 1, 0, 1, '16. Qb8+'], [1, 3, 0, 1, 'Nxb8'],
  [7, 3, 0, 3, '17. Rd8#']
];
const INITIAL_BOARD = ['♜♞♝♛♚♝♞♜', '♟♟♟♟♟♟♟♟', '........', '........', '........', '........', '♙♙♙♙♙♙♙♙', '♖♘♗♕♔♗♘♖'];
const chessMatch: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#0c0e14'), frame = c('#241d18'), litSq = theme === 'mono' ? '#a8a8a8' : mix(c('#d9c4a3'), g.paint.accent, 0.14);
  const darkSq = theme === 'mono' ? '#585858' : mix(c('#7a593f'), g.paint.accent, 0.16);
  const hiFrom = mix(darkSq, g.paint.accent, 0.45), hiTo = mix(litSq, g.paint.fan(0.9), 0.55);
  const whitePc = '#ffffff', blackPc = c('#101218'), ink = mix(bg, g.paint.accent, 0.8), dim = mix(bg, g.paint.accent, 0.42);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.set(x, y, ' ', ink, bg);
  // Replay Morphy's 1858 Opera Game up to the current ply.
  const ply = Math.floor(t / 1.35) % (OPERA_MOVES.length + 3);
  const board = INITIAL_BOARD.map(row => [...row]);
  let last: [number, number, number, number] | null = null;
  let captured = false;
  for (let m = 0; m < Math.min(ply, OPERA_MOVES.length); m++) {
    const [r0, c0, r1, c1] = OPERA_MOVES[m]!;
    captured = board[r1]![c1] !== '.';
    const piece = board[r0]![c0]!;
    board[r0]![c0] = '.';
    board[r1]![c1] = piece;
    // Handle white queenside castling on move 12 (ply index 22).
    if (m === 22) { board[7]![0] = '.'; board[7]![3] = '♖'; }
    last = [r0, c0, r1, c1];
  }
  const hasLog = g.w >= 42 && g.h >= 9;
  const sqW = g.w >= 24 ? 2 : 1;
  const boardW = 8 * sqW, boardH = Math.min(8, g.h);
  const bx = hasLog ? Math.max(2, Math.floor((g.w * 0.54 - boardW) / 2)) : Math.max(0, Math.floor((g.w - boardW) / 2));
  const by = Math.max(0, Math.floor((g.h - boardH) / 2));
  const rowOff = Math.max(0, 8 - boardH);
  const flashCap = captured && fract(t / 1.35) < 0.25;
  for (let r = 0; r < boardH; r++) {
    const br = r + Math.floor(rowOff / 2);
    if (bx >= 2) g.write(bx - 2, by + r, String(8 - br), dim, bg);
    for (let col = 0; col < 8; col++) {
      const isFrom = last && last[0] === br && last[1] === col;
      const isTo = last && last[2] === br && last[3] === col;
      const sqBg = isTo ? (flashCap ? g.paint.fan(0.95) : hiTo) : isFrom ? hiFrom : (br + col) % 2 === 0 ? litSq : darkSq;
      const pc = board[br]![col]!;
      const isWhite = '♔♕♖♗♘♙'.includes(pc);
      const sx = bx + col * sqW;
      g.set(sx, by + r, pc === '.' ? ' ' : pc, isWhite ? whitePc : blackPc, sqBg, isWhite);
      if (sqW === 2) g.set(sx + 1, by + r, ' ', isWhite ? whitePc : blackPc, sqBg);
    }
  }
  if (by + boardH < g.h && sqW === 2) g.write(bx, by + boardH, 'a b c d e f g h ', dim, bg);
  if (by > 0 && bx >= 1) g.write(bx, by - 1, '─'.repeat(boardW), frame, bg);
  if (hasLog) {
    const lx = bx + boardW + 4;
    const isMate = ply >= OPERA_MOVES.length;
    g.write(lx, 1, 'OPERA GAME 1858', g.paint.accent, bg);
    const wSec = Math.max(0, 300 - Math.floor(ply * 4.5)), bSec = Math.max(0, 300 - Math.floor(ply * 5.2));
    g.write(lx, 2, `♔ ${pad2(wSec / 60)}:${pad2(wSec % 60)}  ♚ ${pad2(bSec / 60)}:${pad2(bSec % 60)}`, ink, bg);
    const shown = Math.min(ply, OPERA_MOVES.length);
    const startPair = Math.max(0, Math.floor((shown - 1) / 2) - Math.max(1, g.h - 7));
    for (let row = 0; row < Math.min(g.h - 5, 8); row++) {
      const pIdx = (startPair + row) * 2;
      if (pIdx >= shown) break;
      const wMove = OPERA_MOVES[pIdx]![4], bMove = pIdx + 1 < shown ? ' ' + OPERA_MOVES[pIdx + 1]![4] : '';
      const latest = pIdx + 1 >= shown - 1;
      g.write(lx, 4 + row, (wMove + bMove).slice(0, Math.max(1, g.w - lx - 1)), latest ? '#ffffff' : dim, bg);
    }
    if (g.h >= 6) g.write(lx, g.h - 1, isMate ? '★ 1-0 CHECKMATE' : ply % 2 ? '♚ BLACK TO MOVE' : '♔ WHITE TO MOVE', isMate ? g.paint.fan(0.95) : g.paint.accent, bg);
  }
  return g.finish();
};

export const atelierReceiverBuilders = {
  astrolabe,
  pinball,
  terrarium,
  tourbillon,
  'rose-window': roseWindow,
  'chess-match': chessMatch
};

import type {ThemeName} from '../../types.js';
import {TAU, band, braille, clamp, fract, grid, hash, kick, mix, pixels, seconds, smooth, stroke, tri, type Builder, type Pixels} from './cell-canvas.js';
import {lettering} from './festive-receivers.js';

const pad2 = (n: number): string => String(Math.floor(n)).padStart(2, '0');
const scroll = (text: string, t: number, wide: number, speed = 6): string => {
  const at = Math.floor(t * speed);
  return Array.from({length: Math.max(0, wide)}, (_, i) => text[(at + i) % text.length]!).join('');
};
const safe = (theme: ThemeName) => (hex: string): string => {
  if (theme !== 'mono') return hex;
  const [r, g, b] = [1, 3, 5].map(o => parseInt(hex.slice(o, o + 2), 16));
  const grey = Math.round(0.3 * r! + 0.59 * g! + 0.11 * b!).toString(16).padStart(2, '0');
  return `#${grey}${grey}${grey}`;
};
const oelGlass = (p: Pixels, accent: string, bg: string): void => {
  const rowA = mix(bg, accent, 0.04), rowB = mix(bg, accent, 0.08);
  for (let y = 0; y < p.ph; y++) {
    const tone = y % 2 ? rowA : rowB;
    for (let x = 0; x < p.pw; x++) p.px(x, y, tone);
  }
};
const discPx = (p: Pixels, cx: number, cy: number, rx: number, ry: number, color: string): void => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / Math.max(0.5, rx), dy = (y + 0.5 - cy) / Math.max(0.5, ry);
      if (dx * dx + dy * dy <= 1) p.px(x, y, color);
    }
  }
};

// Pioneer-style OEL jumping dolphins over bass-driven phosphor waves, moon, and splash spray.
const oelDolphins: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#030812'), lit = mix(g.paint.accent, '#ffffff', 0.32), mid = g.paint.accent, dim = mix(bg, mid, 0.34);
  oelGlass(p, mid, bg);
  const waterAt = (x: number): number => p.ph * 0.68
    + Math.sin(x * 0.14 - t * 3.1) * Math.max(0.8, p.ph * 0.06)
    + Math.sin(x * 0.27 + t * 2.2) * Math.max(0.4, p.ph * 0.03) * (0.6 + 0.7 * kick(t));
  // Crescent moon & OEL sky stars.
  const moonX = p.pw * 0.82, moonY = p.ph * 0.2, moonR = Math.max(1.5, Math.min(p.ph * 0.14, p.pw * 0.06));
  for (let y = Math.floor(moonY - moonR); y <= Math.ceil(moonY + moonR); y++) {
    for (let x = Math.floor(moonX - moonR); x <= Math.ceil(moonX + moonR); x++) {
      const d1 = Math.hypot(x - moonX, y - moonY), d2 = Math.hypot(x - (moonX + moonR * 0.45), y - (moonY - moonR * 0.2));
      if (d1 <= moonR && d2 > moonR * 0.85) p.px(x, y, lit);
    }
  }
  for (let s = 0; s < Math.max(4, Math.floor(p.pw / 5)); s++) {
    const sx = Math.floor(hash(s, 11) * p.pw), sy = Math.floor(hash(s, 12) * p.ph * 0.48);
    if (tri(t * 0.4 + hash(s, 13)) > 0.55) p.px(sx, sy, dim);
  }
  // Two articulated leaping dolphins arcing out of the sea.
  const drawDolphin = (phase: number, span: number, baseX: number, dir: number, scale: number): void => {
    const u = fract(phase);
    const arcX = (s: number): number => baseX + (s - 0.5) * span * dir;
    const arcY = (s: number): number => p.ph * 0.78 - Math.sin(s * Math.PI) * p.ph * 0.62 * scale;
    const len = 0.24;
    for (let k = 0; k <= 24; k++) {
      const f = k / 24;
      const s = u * 1.35 - 0.17 - f * len;
      if (s < -0.05 || s > 1.05) continue;
      const x = arcX(s), y = arcY(s);
      if (y > waterAt(x) + 1) continue;
      const nx = arcX(s + 0.02) - arcX(s - 0.02), ny = arcY(s + 0.02) - arcY(s - 0.02);
      const norm = Math.hypot(nx, ny) || 1, px = -ny / norm, py = nx / norm;
      const thick = (f < 0.14 ? 0.5 + f * 4.5 : Math.sin(Math.pow(1 - f, 0.75) * Math.PI) * 2.1 + 0.35) * Math.max(0.55, p.ph / 24) * scale;
      discPx(p, x, y, thick, thick * 0.85, f < 0.55 ? lit : mid);
      // Dorsal fin near the middle of the back.
      if (f > 0.34 && f < 0.48) {
        const fin = (1 - Math.abs(f - 0.41) / 0.07) * thick * 1.55;
        stroke(p, x, y, x - px * fin * dir, y - py * fin * dir, Math.max(0.45, thick * 0.35), lit);
      }
      // Tail flukes at the end of the spine.
      if (f > 0.9) {
        const fl = thick * 2.4;
        stroke(p, x, y, x + px * fl, y + py * fl, Math.max(0.45, thick * 0.45), lit);
        stroke(p, x, y, x - px * fl, y - py * fl, Math.max(0.45, thick * 0.45), lit);
      }
    }
    // Splash droplets on entry and breach.
    for (const edge of [0.14, 0.86]) {
      const age = u - edge;
      if (age > 0 && age < 0.24) {
        const sx = arcX(edge), sy = waterAt(sx);
        for (let d = 0; d < 7; d++) {
          const ang = -Math.PI * (0.18 + 0.64 * hash(d, edge * 10));
          const spd = (0.4 + 0.8 * hash(d, 31)) * p.ph * 0.45;
          p.px(Math.round(sx + Math.cos(ang) * spd * age * 2.8), Math.round(sy + Math.sin(ang) * spd * age * 2.2 + age * age * p.ph * 2.6), lit);
        }
      }
    }
  };
  drawDolphin(t * 0.24, p.pw * 0.54, p.pw * 0.42, 1, 1);
  if (p.pw >= 28) drawDolphin(t * 0.24 + 0.48, p.pw * 0.44, p.pw * 0.64, -1, 0.82);
  // Rolling illuminated OEL waves.
  for (let x = 0; x < p.pw; x++) {
    const wy = Math.round(waterAt(x));
    for (let y = wy; y < p.ph; y++) {
      const depth = (y - wy) / Math.max(1, p.ph - wy);
      const shimmer = Math.sin(x * 0.32 + y * 0.9 - t * 5) > 0.45;
      p.px(x, y, y === wy ? lit : shimmer ? mix(mid, lit, 0.35 * (1 - depth)) : mix(bg, mid, 0.25 * (1 - depth) + (y % 2 ? 0.05 : 0.14)));
    }
  }
  p.flush();
  if (g.w >= 26 && g.h >= 5) {
    g.write(1, 0, 'OEL', lit, bg);
    g.write(5, 0, 'STEREO', dim, bg);
    if (g.w >= 44) g.write(g.w - 11, 0, 'LOUD  EQ3', dim, bg);
  }
  return g.finish();
};

// Pioneer/Kenwood OEL highway chase coupe: curving road, rushing pylons, turbo exhaust & live RPM/KMH HUD.
const oelRacer: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#04070e'), lit = mix(g.paint.accent, '#ffffff', 0.35), mid = g.paint.accent, hot = g.paint.fan(0.95), dim = mix(bg, mid, 0.24);
  oelGlass(p, mid, bg);
  const horizon = Math.max(2, Math.floor(p.ph * 0.38));
  const curve = Math.sin(t * 0.55) * 0.55;
  // Distant glowing mountain ridge along horizon.
  for (let x = 0; x < p.pw; x++) {
    const ridge = Math.round(horizon - 1 - (Math.sin(x * 0.11 + t * 0.3) * 0.5 + Math.cos(x * 0.23 - t * 0.15) * 0.5 + 1) * Math.max(1, p.ph * 0.08));
    for (let y = ridge; y < horizon; y++) p.px(x, y, y === ridge ? mid : dim);
  }
  // Perspective road surface, kerbs, dashed centerline, and roadside reflector posts.
  for (let y = horizon; y < p.ph; y++) {
    const near = (y - horizon + 1) / Math.max(1, p.ph - horizon);
    const z = 1 / (near + 0.06);
    const center = p.pw / 2 + curve * (1 - near) ** 2 * p.pw * 0.42;
    const halfW = p.pw * (0.04 + 0.44 * near);
    const stripe = fract(z * 0.75 - t * 4.5) < 0.48;
    const lEdge = Math.round(center - halfW), rEdge = Math.round(center + halfW);
    for (let x = Math.max(0, lEdge); x <= Math.min(p.pw - 1, rEdge); x++) {
      const roadTone = (x === lEdge || x === rEdge) ? (stripe ? lit : mid) : mix(bg, mid, 0.08 + 0.06 * (y % 2));
      p.px(x, y, roadTone);
    }
    if (stripe) p.px(Math.round(center), y, near > 0.35 ? lit : mid);
    // Roadside posts rushing past.
    if (fract(z * 0.45 - t * 4.5) < 0.09) {
      const postH = Math.max(1, Math.round(near * p.ph * 0.22));
      for (let h = 0; h < postH; h++) {
        p.px(lEdge - Math.max(1, Math.round(near * 3)), y - h, h === postH - 1 ? lit : mid);
        p.px(rEdge + Math.max(1, Math.round(near * 3)), y - h, h === postH - 1 ? lit : mid);
      }
    }
  }
  // Rear-chase sports coupe in lower center.
  const carW = clamp(Math.round(p.pw * 0.22), 6, 18), carH = clamp(Math.round(p.ph * 0.28), 3, 8);
  const cx = Math.round(p.pw / 2 + curve * p.pw * 0.05), cy = p.ph - Math.max(2, Math.floor(carH * 0.6)) - Math.round(kick(t) * 0.6);
  const halfC = Math.floor(carW / 2);
  for (let dy = -Math.floor(carH / 2); dy <= Math.floor(carH / 2); dy++) {
    const roof = dy < -Math.floor(carH / 6);
    const span = roof ? Math.max(2, Math.floor(halfC * 0.65)) : halfC;
    for (let dx = -span; dx <= span; dx++) {
      const edge = Math.abs(dx) === span || dy === -Math.floor(carH / 2);
      p.px(cx + dx, cy + dy, roof && !edge ? dim : edge ? lit : mix(bg, mid, 0.48));
    }
  }
  // Tail lamps, wing, wheels, and turbo exhaust pulse.
  for (const s of [-1, 1]) {
    p.px(cx + s * (halfC - 1), cy, hot);
    p.px(cx + s * Math.max(1, halfC - 2), cy, hot);
    p.px(cx + s * halfC, cy + Math.floor(carH / 2), c('#11141c'));
    p.px(cx + s * (halfC - 1), cy + Math.floor(carH / 2), c('#11141c'));
    if (kick(t) > 0.35) p.px(cx + s * Math.max(1, Math.floor(halfC * 0.45)), cy + Math.floor(carH / 2) + 1, mix(hot, '#ffffff', 0.4));
  }
  p.flush();
  const speed = Math.round(168 + 62 * (0.5 + 0.5 * Math.sin(t * 0.8)) + 16 * kick(t));
  const gear = clamp(Math.floor((speed - 110) / 24), 1, 6);
  if (g.h >= 4 && g.w >= 24) {
    g.write(1, 0, `${String(speed).padStart(3)} KM/H`, lit, bg);
    const rpmW = Math.max(4, Math.min(20, g.w - 22));
    const rpmFill = Math.round(clamp(0.45 + 0.4 * band(3, t) + 0.2 * kick(t)) * rpmW);
    const rx = Math.floor((g.w - rpmW) / 2);
    for (let i = 0; i < rpmW; i++) g.set(rx + i, 0, i < rpmFill ? '▮' : '▯', i > rpmW * 0.78 ? hot : i < rpmFill ? lit : dim, bg);
    g.write(g.w - 7, 0, `GEAR ${gear}`, mid, bg);
  }
  return g.finish();
};

// Car-stereo OEL fighter-jet cockpit HUD: banking pitch ladder, airspeed/altitude tapes, and beat-locked target reticle.
const oelJet: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#030a08'), lit = mix(g.paint.accent, '#ffffff', 0.3), mid = g.paint.accent, hot = g.paint.fan(0.95), dim = mix(bg, mid, 0.32);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.set(x, y, ' ', mid, bg);
  const cx = b.dw / 2, cy = b.dh / 2;
  const roll = Math.sin(t * 0.55) * 0.34, pitch = Math.sin(t * 0.85) * b.dh * 0.12;
  const cs = Math.cos(roll), sn = Math.sin(roll);
  const rot = (x: number, y: number): [number, number] => [cx + x * cs - (y + pitch) * sn, cy + x * sn + (y + pitch) * cs];
  // Horizon bar and +/- pitch ladder rungs.
  for (const rung of [-2, -1, 0, 1, 2]) {
    const ry = rung * b.dh * 0.16, span = rung === 0 ? b.dw * 0.28 : b.dw * 0.16, gap = b.dw * 0.05;
    for (const s of [-1, 1]) {
      const [x0, y0] = rot(s * gap, ry), [x1, y1] = rot(s * span, ry);
      b.line(x0, y0, x1, y1, rung === 0 ? lit : mid);
      if (rung !== 0) {
        const [tx, ty] = rot(s * span, ry + (rung > 0 ? -3 : 3));
        b.line(x1, y1, tx, ty, mid);
      }
    }
  }
  // Fixed center boresight wings (-v-).
  b.line(cx - 7, cy, cx - 2, cy, lit); b.line(cx + 2, cy, cx + 7, cy, lit);
  b.line(cx - 2, cy, cx, cy + 3, lit); b.line(cx, cy + 3, cx + 2, cy, lit);
  // Sweeping target reticle diamond that locks on-beat.
  const tx = cx + Math.sin(t * 0.9) * b.dw * 0.22, ty = cy + Math.cos(t * 1.15) * b.dh * 0.2;
  const locked = kick(t) > 0.45, rad = locked ? 6 : 8;
  b.line(tx, ty - rad, tx + rad, ty, locked ? hot : lit);
  b.line(tx + rad, ty, tx, ty + rad, locked ? hot : lit);
  b.line(tx, ty + rad, tx - rad, ty, locked ? hot : lit);
  b.line(tx - rad, ty, tx, ty - rad, locked ? hot : lit);
  // Left airspeed & right altitude scrolling scale rails.
  if (b.dw >= 44) {
    const lx = 10, rx = b.dw - 11;
    b.line(lx, 5, lx, b.dh - 6, dim); b.line(rx, 5, rx, b.dh - 6, dim);
    const step = 6, off = fract(t * 1.6) * step;
    for (let y = 6 + off; y < b.dh - 6; y += step) {
      b.line(lx, y, lx + 3, y, mid);
      b.line(rx - 3, y, rx, y, mid);
    }
  }
  b.flush(bg);
  // Crisp text HUD callouts and bottom afterburner thrust meters.
  if (g.w >= 26 && g.h >= 5) {
    const hdg = Math.floor(((t * 14) % 360 + 360) % 360);
    g.write(Math.floor(g.w / 2) - 4, 0, `HDG ${String(hdg).padStart(3, '0')}`, lit, bg);
    g.write(1, Math.floor(g.h / 2), `M${(1.1 + 0.4 * band(2, t)).toFixed(1)}`, mid, bg);
    const alt = Math.round(14200 + 800 * Math.sin(t * 0.7));
    g.write(g.w - 5, Math.floor(g.h / 2), String(alt).slice(0, 4), mid, bg);
    const thrW = Math.max(3, Math.min(12, Math.floor((g.w - 18) / 2)));
    const lThr = Math.round(clamp(0.4 + 0.6 * band(1, t)) * thrW), rThr = Math.round(clamp(0.4 + 0.6 * band(6, t)) * thrW);
    g.write(1, g.h - 1, 'L ' + '▰'.repeat(lThr) + '▱'.repeat(thrW - lThr), lThr > thrW * 0.78 ? hot : lit, bg);
    g.write(g.w - thrW - 3, g.h - 1, '▰'.repeat(rThr) + '▱'.repeat(thrW - rThr) + ' R', rThr > thrW * 0.78 ? hot : lit, bg);
    if (g.w >= 40) g.write(Math.floor(g.w / 2) - 3, g.h - 1, locked ? ' LOCK ' : ' SCAN ', locked ? hot : dim, bg);
  }
  return g.finish();
};

// Pioneer OEL midnight boulevard cruise: parallax dot-matrix skyline, streetlights, and cowl equalizer.
const oelCityCruise: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#040710'), lit = mix(g.paint.accent, '#ffffff', 0.35), mid = g.paint.accent, dim = mix(bg, mid, 0.25), dark = mix(bg, mid, 0.12);
  oelGlass(p, mid, bg);
  const roadY = Math.max(2, Math.floor(p.ph * 0.74));
  // Far slow skyline silhouettes.
  for (let x = 0; x < p.pw; x++) {
    const wx = Math.floor((x + t * 4) / 7);
    const bh = Math.floor((0.2 + 0.45 * hash(wx, 21)) * roadY);
    for (let y = roadY - bh; y < roadY; y++) {
      const win = (x + Math.floor(t * 4)) % 2 === 0 && y % 2 === 0 && hash(wx * 13 + y, 22) > 0.48;
      p.px(x, y, win ? dim : dark);
    }
  }
  // Midground faster towers + lit billboards + rooftop beacons.
  for (let x = 0; x < p.pw; x++) {
    const sx = x + Math.floor(t * 11), bx = Math.floor(sx / 10);
    if (hash(bx, 31) < 0.32) continue;
    const bh = Math.floor((0.22 + 0.5 * hash(bx, 32)) * roadY);
    const top = roadY - bh;
    for (let y = top; y < roadY; y++) {
      const edge = sx % 10 === 0 || sx % 10 === 9 || y === top;
      const win = sx % 2 === 1 && y % 2 === 1 && hash(bx * 7 + y, 33) > 0.42;
      p.px(x, y, edge ? mid : win ? lit : mix(bg, mid, 0.16));
    }
    if (sx % 10 === 5 && top > 2 && fract(t * 1.5 + hash(bx, 34)) < 0.5) p.px(x, top - 1, g.paint.fan(0.95));
  }
  // Foreground passing streetlights & boulevard reflections.
  const lampGap = 18, shift = Math.floor(t * 24);
  for (let x = 0; x < p.pw; x++) {
    const mod = ((x + shift) % lampGap + lampGap) % lampGap;
    if (mod === 0) {
      for (let y = Math.floor(roadY * 0.48); y < roadY; y++) p.px(x, y, mid);
      p.px(x, Math.floor(roadY * 0.48), lit);
      p.px(x + 1, Math.floor(roadY * 0.48), lit);
    }
    // Boulevard asphalt and passing dashed lane line.
    for (let y = roadY; y < p.ph; y++) {
      const dash = y === roadY + Math.max(1, Math.floor((p.ph - roadY) * 0.4)) && ((x + shift * 2) % 10) < 5;
      p.px(x, y, y === roadY ? mid : dash ? lit : bg);
    }
  }
  // Bass-reactive mini EQ nestled on the car cowl at the bottom edge.
  const bars = Math.max(4, Math.min(18, Math.floor(p.pw / 4)));
  const eqLeft = Math.floor((p.pw - bars * 3) / 2);
  for (let b = 0; b < bars; b++) {
    const h = Math.round(band(b * 1.5, t) * Math.max(1, p.ph - roadY - 1));
    for (let k = 0; k < h; k++) {
      p.px(eqLeft + b * 3, p.ph - 1 - k, k > 2 ? g.paint.fan(0.95) : lit);
      p.px(eqLeft + b * 3 + 1, p.ph - 1 - k, k > 2 ? g.paint.fan(0.95) : lit);
    }
  }
  p.flush();
  if (g.w >= 26 && g.h >= 5) g.write(1, 0, 'NIGHT CRUISE  FM 99.5', dim, bg);
  return g.finish();
};

// Classic 2001 car-stereo dot-matrix silhouette groovers on a perspective checker floor with side EQ towers.
const oelDancers: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#05060f'), lit = mix(g.paint.accent, '#ffffff', 0.35), mid = g.paint.accent, hot = g.paint.fan(0.92), dim = mix(bg, mid, 0.24);
  oelGlass(p, mid, bg);
  const floorY = Math.max(2, Math.floor(p.ph * 0.72));
  // Perspective dance floor tiles pulsing on the beat.
  for (let y = floorY; y < p.ph; y++) {
    const near = (y - floorY + 1) / Math.max(1, p.ph - floorY);
    const depth = 1 / (near + 0.12);
    for (let x = 0; x < p.pw; x++) {
      const wx = Math.floor((x - p.pw / 2) * depth * 0.14), wz = Math.floor(depth * 1.8 - t * 2.2);
      const checker = (wx + wz) & 1;
      p.px(x, y, y === floorY ? mid : checker ? mix(bg, mid, 0.2 + 0.25 * kick(t) * near) : bg);
    }
  }
  // Articulated pixel groovers dancing in sync with the 120 BPM kick.
  const count = p.pw >= 52 ? 3 : p.pw >= 26 ? 2 : 1;
  const hScale = Math.max(0.4, Math.min(1.15, (floorY - 2) / 14));
  for (let i = 0; i < count; i++) {
    const cx = p.pw * ((i + 1) / (count + 1));
    const phase = t * Math.PI * 2 + i * 1.4;
    const bounce = Math.abs(Math.sin(phase)) * 2.1 * hScale;
    const sway = Math.sin(phase * 0.5) * 2.5 * hScale;
    const hipY = floorY - 5.2 * hScale - bounce, shoulderY = hipY - 4.6 * hScale, headY = shoulderY - 2.6 * hScale;
    const tone = i === Math.floor(count / 2) ? lit : mid;
    discPx(p, cx + sway * 0.6, headY, 1.5 * hScale, 1.5 * hScale, lit);
    stroke(p, cx + sway * 0.4, shoulderY, cx + sway * 0.15, hipY, Math.max(0.6, 1.15 * hScale), tone);
    // Arms pumping on alternate beats.
    const lArmY = shoulderY + Math.sin(phase) * 3.8 * hScale - 1.2 * hScale;
    const rArmY = shoulderY - Math.sin(phase) * 3.8 * hScale - 1.2 * hScale;
    stroke(p, cx + sway * 0.4, shoulderY + 0.5, cx + sway * 0.4 - 4.2 * hScale, lArmY, Math.max(0.5, 0.75 * hScale), lit);
    stroke(p, cx + sway * 0.4, shoulderY + 0.5, cx + sway * 0.4 + 4.2 * hScale, rArmY, Math.max(0.5, 0.75 * hScale), lit);
    // Stepping legs & knees.
    const step = Math.sin(phase) * 2.4 * hScale;
    stroke(p, cx + sway * 0.15, hipY, cx - 2.3 * hScale + step * 0.5, floorY - 0.8, Math.max(0.5, 0.85 * hScale), tone);
    stroke(p, cx + sway * 0.15, hipY, cx + 2.3 * hScale - step * 0.5, floorY - 0.8, Math.max(0.5, 0.85 * hScale), tone);
  }
  // Flanking left & right segmented equalizer towers.
  if (p.pw >= 22) {
    const towerH = Math.max(2, floorY - 3);
    for (const side of [0, 1]) {
      for (let col = 0; col < 2; col++) {
        const bx = side ? p.pw - 2 - col * 3 : 1 + col * 3;
        const lv = Math.round(band(side * 6 + col * 3, t) * towerH / 2);
        for (let seg = 0; seg < towerH / 2; seg++) {
          const on = seg <= lv;
          const colTone = on ? (seg > towerH * 0.36 ? hot : lit) : dim;
          p.px(bx, floorY - 2 - seg * 2, colTone);
          p.px(bx + 1, floorY - 2 - seg * 2, colTone);
        }
      }
    }
  }
  p.flush();
  if (g.w >= 28 && g.h >= 5) {
    g.write(Math.floor(g.w / 2) - 5, 0, 'DEMO  GROOVE', dim, bg);
  }
  return g.finish();
};

// Nighttime twin analog-digital car dashboard cluster: braille RPM tachometer + speed/boost gauge & gear indicator.
const carTachometer: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#07090e'), lit = mix(g.paint.accent, '#ffffff', 0.3), mid = g.paint.accent, red = c('#ff3b30'), dim = mix(bg, mid, 0.25);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.set(x, y, ' ', mid, bg);
  const dual = g.w >= 38;
  const dials = dual ? [0.27, 0.73] : [0.5];
  const r = Math.max(4, Math.min(b.dh * 0.44, b.dw * (dual ? 0.21 : 0.42)));
  const cy = b.dh * 0.54;
  // Engine cycle revs smoothly through gears with crisp shift drops.
  const cycle = fract(t * 0.28);
  const rpm = clamp(0.22 + (cycle < 0.78 ? cycle / 0.78 * 0.68 : 0.9 - (cycle - 0.78) * 3.1) + 0.08 * band(2, t) + 0.06 * kick(t));
  const mph = clamp(0.28 + 0.45 * smooth(0.5 + 0.5 * Math.sin(t * 0.45)) + 0.2 * band(7, t));
  dials.forEach((pos, idx) => {
    const cx = b.dw * pos;
    const start = Math.PI * 0.75, sweep = Math.PI * 1.5;
    for (let i = 0; i <= 96; i++) {
      const f = i / 96, a = start + f * sweep;
      const col = idx === 0 && f > 0.78 ? red : dim;
      b.dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, col);
      if (idx === 0 && f > 0.78) b.dot(cx + Math.cos(a) * (r - 1.5), cy + Math.sin(a) * (r - 1.5), red);
    }
    const ticks = 8;
    for (let k = 0; k <= ticks; k++) {
      const f = k / ticks, a = start + f * sweep;
      b.line(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a) * (r - 3.5), cy + Math.sin(a) * (r - 3.5), idx === 0 && f > 0.74 ? red : mid);
    }
    const val = idx === 0 ? rpm : mph;
    const na = start + val * sweep;
    b.line(cx - Math.cos(na) * r * 0.18, cy - Math.sin(na) * r * 0.18, cx + Math.cos(na) * (r - 2), cy + Math.sin(na) * (r - 2), idx === 0 && val > 0.78 ? red : lit);
    b.dot(cx, cy, lit);
  });
  b.flush(bg);
  if (g.h >= 5 && g.w >= 16) {
    const gx = Math.floor(g.w * dials[0]!);
    g.write(gx - 1, Math.min(g.h - 1, Math.floor(g.h * 0.78)), 'RPM', dim, bg);
    if (dual) {
      g.write(Math.floor(g.w * dials[1]!) - 1, Math.min(g.h - 1, Math.floor(g.h * 0.78)), 'MPH', dim, bg);
      const midX = Math.floor(g.w / 2);
      const gear = 1 + Math.floor(cycle * 5);
      g.write(midX - 2, Math.max(0, Math.floor(g.h * 0.35)), `[ ${gear} ]`, lit, bg);
      g.write(midX - 3, Math.min(g.h - 1, Math.floor(g.h * 0.62)), String(84210 + Math.floor(t * 3)).padStart(6, '0'), mid, bg);
      g.write(midX - 4, g.h - 1, 'FM ST DSP', kick(t) > 0.4 ? lit : dim, bg);
    }
  }
  return g.finish();
};

// Early-2000s Sony Xplod / Alpine concentric rotary dial head unit with radial spectrum wedges and wing meters.
const xplodRing: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#060812'), bezel = c('#181c28'), lit = mix(g.paint.accent, '#ffffff', 0.36), mid = g.paint.accent, hot = g.paint.fan(0.95), dim = mix(bg, mid, 0.22);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, y < 2 || y >= p.ph - 2 ? bezel : bg);
  const cx = p.pw / 2, cy = p.ph / 2;
  const maxR = Math.max(3, Math.min(p.ph * 0.44, p.pw * 0.26));
  const innerR = maxR * 0.42, midR = maxR * 0.62;
  const sectors = 24;
  for (let y = Math.floor(cy - maxR - 1); y <= Math.ceil(cy + maxR + 1); y++) {
    for (let x = Math.floor(cx - maxR - 1); x <= Math.ceil(cx + maxR + 1); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d > maxR + 0.5) continue;
      const ang = (Math.atan2(dy, dx) + TAU) % TAU;
      const rotAng = (ang - t * 0.45 + TAU * 4) % TAU;
      const sec = Math.floor(rotAng / TAU * sectors);
      const secFrac = fract(rotAng / TAU * sectors);
      if (d >= midR) {
        if (secFrac < 0.14 || secFrac > 0.86) continue;
        const lv = band((sec % 12) * 1.9, t);
        const reach = midR + (maxR - midR) * clamp(0.18 + lv * 0.92);
        p.px(x, y, d <= reach ? (d > midR + (maxR - midR) * 0.72 ? hot : mix(mid, lit, (d - midR) / Math.max(1, maxR - midR))) : dim);
      } else if (d >= innerR) {
        const sweep = fract((ang - t * 1.4) / TAU);
        p.px(x, y, sweep < 0.28 + 0.4 * kick(t) ? lit : dim);
      } else if (d < innerR * 0.85) {
        p.px(x, y, mix(bg, mid, 0.08 + 0.12 * kick(t)));
      }
    }
  }
  // Left & right slanted wing level meters on wider viewports.
  if (p.pw >= 46) {
    const wingW = Math.floor((p.pw / 2 - maxR - 4) / 2);
    for (const side of [-1, 1]) {
      for (let seg = 0; seg < wingW; seg++) {
        const lv = band(seg * 1.8 + (side > 0 ? 5 : 0), t);
        const tall = Math.max(1, Math.round(lv * p.ph * 0.32));
        const x = Math.round(cx + side * (maxR + 3 + seg * 2));
        for (let dy = -tall; dy <= tall; dy++) p.px(x, Math.round(cy + dy), Math.abs(dy) > p.ph * 0.22 ? hot : mid);
      }
    }
  }
  p.flush();
  if (g.w >= 26 && g.h >= 5) {
    g.write(2, 0, 'XPLOD  EQ3', lit, bezel);
    g.write(g.w - 11, 0, 'BBE  LOUD', dim, bezel);
    g.write(Math.floor(g.w / 2) - 2, Math.floor(g.h / 2), '101.9', lit, bg);
    g.write(2, g.h - 1, 'FM1  STEREO', mid, bezel);
    g.write(g.w - 10, g.h - 1, '4x52W DSP', dim, bezel);
  }
  return g.finish();
};

// Open-reel studio tape deck: twin machined 3-spoke aluminum reels, routed magnetic tape, head block & twin VU strips.
const reelToReel: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const plate = c('#272b34'), lower = c('#12151c'), metal = c('#c8ceda'), tape = c('#3d2518'), lit = g.paint.accent, hot = g.paint.fan(0.95);
  const split = Math.floor(p.ph * 0.72);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, y < split ? mix(plate, '#000000', y / Math.max(1, p.ph) * 0.25) : lower);
  const reelR = Math.max(2.5, Math.min(split * 0.44, p.pw * 0.2));
  const cy = Math.max(reelR + 1, split * 0.5);
  const lx = p.pw * 0.29, rx = p.pw * 0.71;
  const progress = fract(t / 70);
  const packL = reelR * (0.45 + 0.48 * (1 - progress)), packR = reelR * (0.45 + 0.48 * progress);
  // Routed magnetic tape around tension rollers and across the center play head block.
  const headY = Math.min(p.ph - 3, split + Math.max(1, Math.floor((p.ph - split) * 0.38)));
  const rollL = lx - reelR * 0.55, rollR = rx + reelR * 0.55;
  stroke(p, lx - packL * 0.75, cy + packL * 0.65, rollL, headY, 0.5, tape);
  stroke(p, rollL, headY, rollR, headY, 0.5, tape);
  stroke(p, rollR, headY, rx + packR * 0.75, cy + packR * 0.65, 0.5, tape);
  discPx(p, rollL, headY, 1.1, 1.1, metal);
  discPx(p, rollR, headY, 1.1, 1.1, metal);
  // Center head block housing.
  const hbW = Math.max(4, Math.floor(p.pw * 0.14));
  for (let y = headY - 2; y <= headY + 1; y++) for (let x = Math.floor(p.pw / 2 - hbW / 2); x <= Math.floor(p.pw / 2 + hbW / 2); x++) p.px(x, y, c('#434958'));
  p.px(Math.floor(p.pw / 2), headY - 1, fract(t * 2) < 0.5 ? hot : lit);
  // Two rotating 3-spoke NAB aluminum reels.
  [[lx, packL, t * 2.2], [rx, packR, t * (2.2 * (packL / Math.max(1, packR)))]].forEach(([cx, pack, spin]) => {
    for (let y = Math.floor(cy - reelR); y <= Math.ceil(cy + reelR); y++) {
      for (let x = Math.floor(cx! - reelR); x <= Math.ceil(cx! + reelR); x++) {
        const dx = x + 0.5 - cx!, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        if (d > reelR) continue;
        const a = Math.atan2(dy, dx) + spin!;
        const cutout = d > reelR * 0.34 && d < reelR * 0.84 && Math.cos(a * 3) > 0.25;
        if (d < reelR * 0.22) p.px(x, y, c('#14161c'));
        else if (d < reelR * 0.34) p.px(x, y, lit);
        else if (cutout) p.px(x, y, d < pack! ? tape : lower);
        else p.px(x, y, d > reelR * 0.9 ? mix(metal, '#ffffff', 0.25) : metal);
      }
    }
  });
  p.flush();
  if (g.h >= 6 && g.w >= 26) {
    const barW = Math.max(4, Math.min(18, Math.floor((g.w - 16) / 2)));
    const lLv = Math.round(band(2, t) * barW), rLv = Math.round(band(6, t) * barW);
    g.write(2, g.h - 1, 'L ' + '▮'.repeat(lLv) + '▯'.repeat(barW - lLv), lLv > barW * 0.78 ? hot : lit, lower);
    g.write(g.w - barW - 4, g.h - 1, 'R ' + '▮'.repeat(rLv) + '▯'.repeat(barW - rLv), rLv > barW * 0.78 ? hot : lit, lower);
    g.write(Math.floor(g.w / 2) - 2, g.h - 1, String(Math.floor(t * 4) % 10000).padStart(4, '0'), metal, lower);
  }
  return g.finish();
};

// In-dash 6-disc car stereo CD changer: illuminated 6-slot tray magazine, motorized disc shuttle, optical laser sled & OEL display.
const cdChanger: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const chassis = c('#171b24'), bay = c('#080b12'), metal = c('#b8c0d0'), lit = mix(g.paint.accent, '#ffffff', 0.32), mid = g.paint.accent, hot = g.paint.fan(0.95), dim = mix(bay, mid, 0.22);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, chassis);
  const cycle = t / 7, discIdx = Math.floor(cycle) % 6, phase = fract(cycle);
  const changing = phase < 0.22;
  const slide = changing ? Math.sin((phase / 0.22) * Math.PI) : 0;
  // Left magazine rack of 6 disc trays.
  const magW = Math.max(6, Math.min(26, Math.floor(p.pw * 0.38)));
  for (let y = 2; y < p.ph - 2; y++) for (let x = 2; x < 2 + magW; x++) p.px(x, y, bay);
  for (let slot = 0; slot < 6; slot++) {
    const sy = Math.round(3 + (slot + 0.5) * ((p.ph - 6) / 6));
    const active = slot === discIdx;
    const ext = active ? Math.round(slide * Math.max(2, Math.floor(magW * 0.35))) : 0;
    const ledColor = active ? (changing ? hot : lit) : dim;
    p.px(3, sy, ledColor);
    for (let x = 5 + ext; x < Math.min(p.pw - 2, magW + ext); x++) {
      const shimmer = active && !changing && ((x + Math.floor(t * 16)) % 5 === 0);
      p.px(x, sy, active ? (shimmer ? '#ffffff' : mix(metal, lit, 0.45)) : c('#485060'));
    }
  }
  // Right OEL status bay: spinning disc profile, optical laser pickup sled & stereo meters.
  const rx0 = magW + 5, rw = Math.max(4, p.pw - rx0 - 2);
  if (rw >= 6) {
    for (let y = 2; y < p.ph - 2; y++) for (let x = rx0; x < rx0 + rw; x++) p.px(x, y, y % 2 ? bay : mix(bay, mid, 0.06));
    // Spinning disc platter edge + rainbow sheen.
    const discY = Math.max(4, Math.floor(p.ph * 0.42)), dw = Math.max(4, Math.floor(rw * 0.72));
    const dx0 = rx0 + Math.floor((rw - dw) / 2);
    for (let x = 0; x < dw; x++) {
      const sheen = Math.max(0, Math.sin((x / dw) * Math.PI * 3 - t * 6)) ** 3;
      p.px(dx0 + x, discY, mix(metal, g.paint.fan(x / dw * 2 - 1), sheen * 0.85));
      p.px(dx0 + x, discY - 1, mix(bay, mid, 0.2 + sheen * 0.4));
    }
    // Optical laser pickup sled tracking underneath the disc.
    const laserX = dx0 + Math.round((0.15 + 0.7 * smooth(0.5 + 0.5 * Math.sin(t * 0.65))) * (dw - 1));
    for (let x = dx0; x < dx0 + dw; x++) p.px(x, discY + 2, dim);
    p.px(laserX, discY + 2, lit);
    p.px(laserX, discY + 1, hot);
    // Mini bouncing spectrum bars along the lower OEL display.
    const bars = Math.max(3, Math.floor((rw - 2) / 3)), maxH = Math.max(1, Math.floor(p.ph * 0.25));
    for (let b = 0; b < bars; b++) {
      const lv = Math.round(band(b * 1.9, t) * maxH);
      for (let k = 0; k < lv; k++) {
        p.px(rx0 + 2 + b * 3, p.ph - 4 - k, k > maxH * 0.72 ? hot : mid);
        p.px(rx0 + 3 + b * 3, p.ph - 4 - k, k > maxH * 0.72 ? hot : mid);
      }
    }
  }
  p.flush();
  if (g.w >= 34 && g.h >= 6) {
    const cellX = rx0 + 1;
    const track = 1 + (discIdx * 3 + Math.floor(t / 12)) % 16;
    g.write(2, 0, '6-CD CHANGER', lit, chassis);
    g.write(cellX, 1, changing ? `LOAD DISC ${discIdx + 1}` : `DISC 0${discIdx + 1} TR ${pad2(track)}`, changing ? hot : lit, bay);
    if (g.w - cellX >= 18) g.write(cellX, 2, `${pad2((t % 240) / 60)}:${pad2(t % 60)}  PCM 16B`, dim, bay);
  }
  return g.finish();
};

// Warm vintage Nixie-tube audio deck: five glowing glass cathode tubes with faint mesh & unlit numeral depth.
const nixieDeck: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#08060a'), base = c('#1b1410'), glass = mix(bg, g.paint.accent, 0.12);
  const glow = theme === 'mono' ? '#d8d8d8' : mix(g.paint.accent, '#ff8b2b', 0.52);
  const core = mix(glow, c('#fff7de'), 0.58), ghost = mix(bg, glow, 0.17), rim = mix(bg, c('#b0b8c8'), 0.25);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, y >= p.ph - Math.max(2, Math.floor(p.ph * 0.15)) ? base : bg);
  const showClock = Math.floor(t / 6) % 2 === 0;
  const freq = [88.5, 91.3, 94.7, 98.1, 101.9, 105.3][Math.floor(t / 12) % 6]!.toFixed(1).padStart(5, '0');
  const display = showClock ? `${pad2(t / 60 % 100)}:${pad2(t % 60)}` : freq;
  const tubes = display.length;
  const tubeW = Math.max(3, Math.floor((p.pw - 4) / tubes) - 1);
  const scale = Math.max(1, Math.floor(Math.min((p.ph - 6) / 5, (tubeW - 2) / 5)));
  const totalW = tubes * (tubeW + 1) - 1, left0 = Math.floor((p.pw - totalW) / 2);
  const top = Math.max(1, Math.floor((p.ph - 5 * scale - 4) / 2)), bot = Math.min(p.ph - 2, top + 5 * scale + 3);
  const flicker = 0.88 + 0.12 * Math.sin(t * 21) * (0.4 + 0.6 * kick(t));
  for (let i = 0; i < tubes; i++) {
    const ch = display[i]!, tx = left0 + i * (tubeW + 1);
    const tubeBg = mix(bg, glow, 0.09 * flicker);
    for (let y = top; y <= bot; y++) {
      for (let x = tx; x < tx + tubeW; x++) {
        const edge = x === tx || x === tx + tubeW - 1 || y === top;
        const mesh = (x + y) % 2 === 0 && !edge;
        p.px(x, y, edge ? rim : mesh ? mix(tubeBg, glass, 0.45) : tubeBg);
      }
    }
    // Glowing pool reflected on the walnut base plate beneath each tube.
    for (let x = tx + 1; x < tx + tubeW - 1; x++) p.px(x, Math.min(p.ph - 1, bot + 1), mix(base, glow, 0.35 * flicker));
    const gx0 = tx + Math.floor((tubeW - 5 * scale) / 2), gy0 = top + 2;
    if (ch === ':' || ch === '.') {
      const cx = tx + Math.floor(tubeW / 2);
      if (ch === ':') {
        if (fract(t) < 0.72) { discPx(p, cx, top + (bot - top) * 0.35, 0.8 * scale, 0.8 * scale, core); discPx(p, cx, top + (bot - top) * 0.7, 0.8 * scale, 0.8 * scale, core); }
      } else {
        discPx(p, cx, bot - 2, 0.8 * scale, 0.8 * scale, core);
      }
      continue;
    }
    for (let y = 0; y < 5 * scale; y++) {
      for (let x = 0; x < 5 * scale; x++) {
        const fx = Math.floor(x / scale), fy = Math.floor(y / scale);
        if (lettering(ch, fx, fy)) p.px(gx0 + x, gy0 + y, mix(glow, core, 0.5 + 0.5 * flicker));
        else if (lettering('8', fx, fy)) p.px(gx0 + x, gy0 + y, ghost);
      }
    }
  }
  p.flush();
  return g.finish();
};

// Glowing vacuum-tube Hi-Fi amplifier: four glass KT88/300B tubes pulsing warm filaments on a brushed chassis.
const tubeAmp: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bg = c('#07060b'), deck = c('#262932'), front = c('#161820'), rim = c('#7e8799');
  const warm = theme === 'mono' ? '#cfcfcf' : mix(g.paint.accent, '#ff7d26', 0.55);
  const hotCore = mix(warm, c('#fff5d1'), 0.65);
  const deckY = Math.max(2, Math.floor(p.ph * 0.74)), apronY = Math.max(deckY + 1, Math.floor(p.ph * 0.84));
  for (let y = 0; y < p.ph; y++) {
    const tone = y < deckY ? bg : y < apronY ? deck : front;
    for (let x = 0; x < p.pw; x++) p.px(x, y, tone);
  }
  const tubes = p.pw >= 36 ? 4 : p.pw >= 18 ? 2 : 1;
  const tubeW = clamp(Math.floor(p.pw / (tubes * 1.9)), 4, 12);
  const tubeH = Math.max(4, Math.floor(deckY * 0.82));
  for (let i = 0; i < tubes; i++) {
    const cx = Math.round(p.pw * ((i + 0.5) / tubes));
    const energy = 0.55 + 0.45 * band(i * 4 + 2, t) + 0.25 * kick(t);
    const topY = deckY - tubeH, half = Math.floor(tubeW / 2);
    // Warm glow pool cast onto the brushed deck surface.
    for (let x = cx - half - 3; x <= cx + half + 3; x++) {
      const f = clamp(1 - Math.abs(x - cx) / (half + 4));
      p.px(x, deckY, mix(deck, warm, f * 0.55 * energy));
    }
    // Glass tube envelope, getter silver top, dark anode plate, pulsing filament core, and specular highlight.
    for (let y = topY; y < deckY; y++) {
      const u = (y - topY) / Math.max(1, tubeH);
      const span = u < 0.22 ? Math.max(1, Math.round(half * Math.sin((u / 0.22) * Math.PI * 0.5))) : half;
      for (let dx = -span; dx <= span; dx++) {
        const edge = Math.abs(dx) === span || y === topY;
        const spec = dx === -span + 1 && u > 0.18 && u < 0.85;
        const getter = u < 0.18;
        const inPlate = Math.abs(dx) <= Math.max(1, Math.floor(half * 0.55)) && u > 0.24 && u < 0.86;
        const inHeater = Math.abs(dx) <= Math.max(0, Math.floor(half * 0.2)) && u > 0.3 && u < 0.82;
        if (edge) p.px(cx + dx, y, rim);
        else if (getter) p.px(cx + dx, y, c('#6a7080'));
        else if (spec) p.px(cx + dx, y, mix(rim, '#ffffff', 0.4));
        else if (inHeater) p.px(cx + dx, y, mix(warm, hotCore, clamp(energy * (0.7 + 0.3 * Math.sin(u * 12)))));
        else if (inPlate) p.px(cx + dx, y, mix(c('#1b1a22'), warm, 0.28 * energy));
        else p.px(cx + dx, y, mix(bg, warm, 0.14 * energy));
      }
    }
    // Metal tube socket base collar.
    for (let dx = -half; dx <= half; dx++) p.px(cx + dx, deckY - 1, c('#424854'));
  }
  // Glowing power jewel & front bias meter strip.
  discPx(p, 3, Math.min(p.ph - 1, apronY + 1), 1, 1, g.paint.accent);
  p.flush();
  if (g.h >= 6 && g.w >= 26) {
    const meterW = Math.max(4, Math.min(18, g.w - 20));
    const fill = Math.round(clamp(0.45 + 0.45 * band(4, t)) * meterW);
    g.write(6, g.h - 1, 'CLASS-A', rim, front);
    g.write(g.w - meterW - 2, g.h - 1, '━'.repeat(fill) + '─'.repeat(meterW - fill), warm, front);
  }
  return g.finish();
};

  // Late-90s Sony MiniDisc / Hi-MD OLED/LCD: spinning pixel disc cartridge, big pixel clock, scrolling title & dual peak meters.
const minidisc: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = safe(theme);
  const bezel = c('#1f2430'), lcd = mix(c('#07131b'), g.paint.accent, 0.08), lit = mix(g.paint.accent, '#ffffff', 0.3), mid = g.paint.accent, dim = mix(lcd, mid, 0.22), hot = g.paint.fan(0.92);
  for (let y = 0; y < p.ph; y++) {
    for (let x = 0; x < p.pw; x++) {
      const frame = y < 2 || y >= p.ph - 2 || x === 0 || x === p.pw - 1;
      p.px(x, y, frame ? bezel : y % 2 ? lcd : mix(lcd, mid, 0.03));
    }
  }
  // Spinning MiniDisc cartridge + disc window on the left of the LCD.
  if (p.pw >= 28 && p.ph >= 12) {
    const cx = Math.min(11, Math.floor(p.pw * 0.14)), cy = Math.floor(p.ph * 0.48);
    const r = Math.max(2.5, Math.min(5.2, p.ph * 0.2));
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        const a = Math.atan2(dy, dx);
        const blade = Math.sin(a * 2 + t * 6) > 0.35;
        p.px(x, y, d < 0.28 ? lcd : d > 0.85 ? lit : blade ? lit : dim);
      }
    }
    // Large glowing pixel-matrix elapsed time on the center-right of the LCD.
    const elapsed = `${pad2((t % 3600) / 60)}:${pad2(t % 60)}`;
    const scale = p.pw >= 52 && p.ph >= 20 ? 2 : 1;
    const textW = (elapsed.length * 6 - 1) * scale;
    const tx0 = Math.max(Math.ceil(cx + r) + 4, Math.floor((p.pw - textW) * 0.45));
    const ty0 = Math.max(5, Math.floor(p.ph * 0.36) - Math.floor(5 * scale / 2));
    for (let y = 0; y < 5 * scale; y++) {
      for (let x = 0; x < textW; x++) {
        const fx = Math.floor(x / scale), fy = Math.floor(y / scale);
        if (elapsed[Math.floor(fx / 6)] === ':' && fract(t) >= 0.5) continue;
        if (lettering(elapsed, fx, fy)) p.px(tx0 + x, ty0 + y, lit);
        else if (fx % 6 !== 5 && /\d/.test(elapsed[Math.floor(fx / 6)] ?? '') && lettering('8', fx % 6, fy)) p.px(tx0 + x, ty0 + y, dim);
      }
    }
    // Mini vertical EQ bars next to the pixel clock when space allows.
    const eqX = tx0 + textW + 4;
    const eqBars = Math.max(0, Math.min(8, Math.floor((p.pw - eqX - 3) / 2)));
    for (let b = 0; b < eqBars; b++) {
      const lv = Math.round(band(b * 2.2, t) * (5 * scale));
      for (let k = 0; k < lv; k++) p.px(eqX + b * 2, ty0 + 5 * scale - 1 - k, k > 5 * scale * 0.7 ? hot : mid);
    }
  }
  p.flush();
  if (g.w < 12 || g.h < 4) {
    g.write(0, Math.floor(g.h / 2), 'MDLP ' + '▮'.repeat(Math.max(1, Math.round(band(2, t) * Math.max(1, g.w - 5)))), lit, lcd);
    return g.finish();
  }
  const innerW = g.w - 2;
  g.write(2, 1, 'MDLP', lit, lcd);
  if (innerW >= 24) g.write(8, 1, 'ATRAC3', mid, lcd);
  if (innerW >= 36) g.write(16, 1, 'MEGABASS', kick(t) > 0.45 ? lit : dim, lcd);
  const track = 1 + Math.floor(t / 18) % 14;
  if (innerW >= 46) g.write(26, 1, `TR${pad2(track)}`, lit, lcd);
  const bat = ['[███]', '[██ ]', '[███]'][Math.floor(t / 4) % 3]!;
  if (innerW >= 18) g.write(g.w - 7, 1, bat, mid, lcd);
  const tickerRow = Math.max(2, g.h - (g.h >= 7 ? 4 : 2));
  const ticker = '► RADIOCLI HI-MD  //  LATE NIGHT STEREO STREAM  //  OPTICAL IN  //  ';
  if (innerW >= 12) g.write(2, tickerRow, scroll(ticker, t, innerW - 2, 7), mid, lcd);
  if (g.h >= 6) {
    const meterW = Math.max(4, innerW - 6);
    for (let ch = 0; ch < 2; ch++) {
      const y = g.h - 3 + ch;
      if (y <= tickerRow || y >= g.h - 1) continue;
      const lv = Math.round(clamp(band(2 + ch * 5, t) * 1.15) * meterW);
      let pk = lv;
      for (let k = 1; k < 10; k++) pk = Math.max(pk, Math.round(clamp(band(2 + ch * 5, t - k * 0.08) * 1.15) * meterW) - Math.max(0, k - 4));
      g.write(2, y, ch ? 'R' : 'L', dim, lcd);
      for (let x = 0; x < meterW; x++) {
        const on = x < lv || x === pk;
        g.set(4 + x, y, on ? '▮' : '·', x === pk ? '#ffffff' : x > meterW * 0.8 && on ? hot : on ? lit : dim, lcd, on);
      }
    }
  }
  return g.finish();
};

export const oelReceiverBuilders = {
  'oel-dolphins': oelDolphins,
  'oel-racer': oelRacer,
  'oel-jet': oelJet,
  'oel-city-cruise': oelCityCruise,
  'oel-dancers': oelDancers,
  'car-tachometer': carTachometer,
  'xplod-ring': xplodRing,
  'reel-to-reel': reelToReel,
  'cd-changer': cdChanger,
  'nixie-deck': nixieDeck,
  'tube-amp': tubeAmp,
  minidisc
};

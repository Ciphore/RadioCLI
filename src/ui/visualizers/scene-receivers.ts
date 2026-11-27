import type {ThemeName} from '../../types.js';
import {clamp, fract, grid, hash, mix, noise, pixels, seconds, smooth, stroke, tri, type Builder, type Pixels} from './cell-canvas.js';

// Places keep their own colours, like the scenes they sit beside; mono renders them in greys.
const tint = (theme: ThemeName) => (hex: string): string => {
  if (theme !== 'mono') return hex;
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const grey = Math.round(0.3 * r! + 0.59 * g! + 0.11 * b!).toString(16).padStart(2, '0');
  return `#${grey}${grey}${grey}`;
};
const wash = (p: Pixels, color: (y: number) => string): void => {
  for (let y = 0; y < p.ph; y++) { const tone = color(y); for (let x = 0; x < p.pw; x++) p.px(x, y, tone); }
};
const ramp = (stops: string[], at: number): string => {
  const scaled = clamp(at) * (stops.length - 1), index = Math.min(stops.length - 2, Math.floor(scaled));
  return mix(stops[index]!, stops[index + 1]!, scaled - index);
};
const stars = (p: Pixels, t: number, below: number, sky: (y: number) => string, visibility = 1): void => {
  for (let star = 0; star < p.pw * below / 60; star++) {
    const y = Math.floor(hash(star, 42) * below);
    p.px(Math.floor(hash(star, 41) * p.pw), y, mix(sky(y), '#ffffff', visibility * (0.2 + 0.6 * tri(t * (0.15 + 0.2 * hash(star, 43)) + hash(star, 44)))));
  }
};
const orb = (p: Pixels, cx: number, cy: number, r: number, color: (d: number, x: number, y: number) => string | undefined): void => {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (d > 1) continue;
    const tone = color(d, x, y);
    if (tone) p.px(x, y, tone);
  }
};

type Mood = {
  sky: (height: number) => string;
  water: [string, string];
  steel: string;
  shade: string;
  hills: string;
  fog: number;
  night: number;
  sun?: {color: string; visibility: number; x: number; yAboveWater: number};
};
/** The bridge, seen side on: two towers, the long sag of the cables, a deck of traffic, and the strait underneath. */
const bridge = (atmosphere: Mood | ((nowMs: number | undefined) => Mood)): Builder => (pulse, width, height, theme, data) => {
  const mood = typeof atmosphere === 'function' ? atmosphere(data?.nowMs) : atmosphere;
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = tint(theme);
  const sea = Math.round(p.ph * 0.74), deck = Math.round(p.ph * 0.58), crown = Math.max(1, Math.round(p.ph * 0.1));
  const sky = (y: number): string => c(mood.sky(y / sea));
  wash(p, y => y < sea ? sky(y) : c(mix(mood.water[0], mood.water[1], (y - sea) / (p.ph - sea))));
  if (mood.night) stars(p, t, sea * 0.8, sky, mood.night);
  const sun = mood.sun, sunlight = sun?.visibility ?? 0;
  const sunX = p.pw * (sun?.x ?? 0.5), sunY = sea - p.ph * (sun?.yAboveWater ?? 0.27), sunR = Math.max(2, p.ph * 0.2);
  if (sun && sunlight) {
    orb(p, sunX, sunY, sunR * 2.2, (d, x, y) => y < sea ? mix(p.at(x, y) ?? sky(y), c(sun.color), sunlight * 0.45 * (1 - d) ** 1.5) : undefined);
    orb(p, sunX, sunY, sunR, (d, x, y) => y < sea
      ? mix(p.at(x, y) ?? sky(y), c(mix(sun.color, '#ffffff', 0.85 - 0.3 * d)), sunlight)
      : undefined);
  }
  if (mood.night) orb(p, p.pw * 0.16, p.ph * 0.2, Math.max(1.5, p.ph * 0.08),
    (d, x, y) => mix(p.at(x, y) ?? sky(y), c(mix('#fdf3c8', '#cfc08a', d)), mood.night));
  const hill = (x: number): number => sea - Math.round(p.ph * (0.05 + 0.13 * noise(x * 0.03, 5) * smooth(Math.abs(x / p.pw - 0.5) * 2.4)));
  for (let x = 0; x < p.pw; x++) for (let y = hill(x); y < sea; y++) p.px(x, y, c(mood.hills));
  // Water: the sky's light lies on it in broken horizontal dashes.
  const reflectedLight = mix(mix('#ffffff', '#ffd9a0', mood.night), sun?.color ?? '#ffffff', sunlight);
  const reflectionStrength = mood.night === 1 ? 0.25 : 0.3 - 0.05 * mood.night;
  for (let y = sea; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const glitter = noise(x * 0.5 + t * (1 + (y - sea) * 0.2), y * 2.1, 3);
    const path = sunlight ? sunlight * Math.exp(-(((x - sunX) / (sunR * (0.8 + (y - sea) * 0.35))) ** 2)) : 0;
    if (glitter > 0.72 - path * 0.45) p.px(x, y, c(mix(mood.water[1], reflectedLight, reflectionStrength + 0.6 * path)));
  }
  const towers = [0.28, 0.72].map(at => Math.round(p.pw * at));
  const thick = Math.max(1, Math.round(p.pw / 55));
  const cable = (x: number): number => {
    // Parabola between the towers; straight runs down to the anchorages outside them.
    const [a, b] = towers as [number, number];
    if (x < a) return crown + (deck - 1 - crown) * (1 - x / a) ** 1.25;
    if (x > b) return crown + (deck - 1 - crown) * ((x - b) / (p.pw - 1 - b)) ** 1.25;
    const u = (x - a) / (b - a) * 2 - 1;
    return deck - 2 - (deck - 2 - crown) * u * u;
  };
  const steel = c(mood.steel), shade = c(mood.shade);
  const cableLight = mix(steel, c('#ffe2a0'), mood.night), towerLight = mix(shade, c('#ff4a4a'), mood.night);
  for (let x = 0; x < p.pw; x++) {
    const y = Math.round(cable(x));
    p.px(x, y, steel);
    if (x % 3 === 0) for (let hang = y + 1; hang < deck; hang++) p.px(x, hang, mix(sky(hang), steel, 0.6));
    for (let d = 0; d < 2; d++) p.px(x, deck + d, d ? shade : steel);
    if (mood.night && x % 4 === 0) p.px(x, y, cableLight);
  }
  for (const x of towers) {
    for (let y = crown - 1; y < p.ph; y++) for (const leg of [-1, 1]) for (let w = 0; w < thick; w++) {
      const px = x + leg * (thick + 1) + (leg > 0 ? -w : w);
      if (y < sea) p.px(px, y, leg > 0 ? shade : steel);
      // Each leg stands on its own wavering reflection.
      else if ((y + Math.floor(t * 3)) % 2 === 0) p.px(px + Math.round(Math.sin(y * 1.3 + t * 2)), y, mix(c(mood.water[1]), steel, 0.5 * (1 - (y - sea) / (p.ph - sea))));
    }
    for (let brace = 0; brace < 4; brace++) {
      const y = Math.round(crown + (deck - crown) * (brace / 4) ** 0.9);
      for (let dx = -thick; dx <= thick; dx++) p.px(x + dx, y, steel);
    }
    if (mood.night) p.px(x, crown - 2, fract(t * 0.6) < 0.5 ? towerLight : shade);
  }
  for (let car = 0; car < p.pw / 7; car++) {
    const way = car % 2 ? 1 : -1, lap = p.pw + 8;
    const x = Math.round((((hash(car, 1) * lap + way * t * (7 + 6 * hash(car, 2))) % lap) + lap) % lap) - 4;
    p.px(x, deck - 1, c(mix(['#e8e8e8', '#30405a', '#c7b23a', '#a03030'][car % 4]!, way > 0 ? '#fff3c0' : '#ff5a5a', mood.night)));
  }
  const boat = Math.round(fract(t * 0.012 + 0.3) * (p.pw + 12)) - 6, by = sea + Math.max(1, Math.round((p.ph - sea) * 0.4));
  for (let dx = -3; dx <= 3; dx++) p.px(boat + dx, by, c('#1b2230'));
  const sail = c(mix('#ffffff', '#c9d2e0', mood.night));
  for (let dy = 1; dy <= 3; dy++) for (let dx = 0; dx < 4 - dy; dx++) p.px(boat + dx, by - dy, sail);
  if (mood.fog) {
    // Fog pours through in banks: thickest at deck height, with the tower tops left standing clear of it.
    for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
      const bank = noise(x * 0.045 - t * 0.35, y * 0.16, 9) * 0.65 + noise(x * 0.13 - t * 0.6, y * 0.4, 4) * 0.35;
      const level = Math.exp(-(((y - deck * 1.02) / (p.ph * 0.26)) ** 2));
      const cover = clamp((bank * (0.5 + level) - 0.5) * 2.6) * 0.86 * mood.fog;
      if (cover > 0.04) p.px(x, y, mix(p.at(x, y)!, c('#e9edf2'), cover));
    }
  }
  p.flush();
  return g.finish();
};

const fog: Mood = {sky: y => ramp(['#6f9fc9', '#a9c6dc', '#dfe6ea'], y), water: ['#3f6f8f', '#274a66'], steel: '#d2452f', shade: '#96281d', hills: '#4d5f52', fog: 1, night: 0};
const sunset: Mood = {
  sky: y => ramp(['#2a2350', '#7a3b6e', '#d85f45', '#f08a4a'], y), water: ['#7a3d4d', '#241a3a'],
  steel: '#3a1418', shade: '#220a10', hills: '#2a1a2e', fog: 0, night: 0,
  sun: {color: '#ffb347', visibility: 1, x: 0.5, yAboveWater: 0.27}
};
const night: Mood = {sky: y => ramp(['#04061a', '#0c1638', '#1c2a5a'], y), water: ['#0a1430', '#04081a'], steel: '#c2402c', shade: '#6e1f18', hills: '#070b18', fog: 0.35, night: 1};
const daylight: Mood = {...fog, sky: y => ramp(['#4787bd', '#8ac1de', '#d9e5e8'], y), water: ['#41839d', '#225575'], fog: 0.08};
export const goldenGateFog = bridge(fog);
export const goldenGateSunset = bridge(sunset);
export const goldenGateNight = bridge(night);

const radians = Math.PI / 180;
const bridgeLatitude = 37.82 * radians;
const bridgeLongitude = -122.48;
const dayMs = 86_400_000;

// NOAA's solar position approximation uses UTC and geographic coordinates.
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
function bridgeSun(nowMs: number): {altitude: number; progress: number; morning: boolean} {
  const year = new Date(nowMs).getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const fraction = (nowMs - yearStart - dayMs / 2) / (Date.UTC(year + 1, 0, 1) - yearStart);
  const angle = 2 * Math.PI * fraction;
  const timeCorrection = 229.18 * (0.000075 + 0.001868 * Math.cos(angle) - 0.032077 * Math.sin(angle) -
    0.014615 * Math.cos(2 * angle) - 0.040849 * Math.sin(2 * angle));
  const declination = 0.006918 - 0.399912 * Math.cos(angle) + 0.070257 * Math.sin(angle) -
    0.006758 * Math.cos(2 * angle) + 0.000907 * Math.sin(2 * angle) -
    0.002697 * Math.cos(3 * angle) + 0.00148 * Math.sin(3 * angle);
  const solarDay = fract((nowMs / dayMs) + (timeCorrection + 4 * bridgeLongitude) / 1440);
  const hourAngle = (360 * solarDay - 180) * radians;
  const latitudeTerm = Math.sin(bridgeLatitude) * Math.sin(declination);
  const dailyArc = Math.cos(bridgeLatitude) * Math.cos(declination);
  const altitude = Math.asin(latitudeTerm + dailyArc * Math.cos(hourAngle)) / radians;
  const horizonAngle = Math.acos(-latitudeTerm / dailyArc);
  return {altitude, progress: clamp(hourAngle / horizonAngle, -1, 1), morning: hourAngle < 0};
}

export const goldenGateLive = bridge(nowMs => {
  const {altitude, progress, morning} = bridgeSun(nowMs ?? Date.UTC(2026, 0, 1, 20));
  const light = smooth((altitude + 12) / 12);
  if (light === 0) return night;
  const highSun = smooth((altitude - (morning ? 5 : 4)) / (morning ? 22 : 23));
  const horizon = morning ? fog : sunset;
  const tone = (dark: string, low: string, high: string): string => mix(dark, mix(low, high, highSun), light);
  const water = (i: 0 | 1): string => tone(night.water[i], horizon.water[i], daylight.water[i]);
  return {
    sky: y => tone(night.sky(y), horizon.sky(y), daylight.sky(y)),
    water: [water(0), water(1)],
    steel: tone(night.steel, horizon.steel, daylight.steel),
    shade: tone(night.shade, horizon.shade, daylight.shade),
    hills: tone(night.hills, horizon.hills, daylight.hills),
    fog: night.fog * (1 - light) + (horizon.fog * (1 - highSun) + daylight.fog * highSun) * light,
    night: 1 - light,
    sun: {
      color: mix(horizon.sun?.color ?? '#ffdba0', '#fff2b9', highSun),
      visibility: smooth((altitude + 3) / 5) * (0.7 * highSun + (morning ? 0.12 : 1) * (1 - highSun)),
      x: 0.5 + 0.33 * progress,
      yAboveWater: 0.08 + 0.51 * clamp(altitude / 74)
    }
  };
});

type Tower = {x: number; w: number; top: number; seed: number; crown: number};
/** A row of towers along a baseline. `crown` picks the roof: flat, stepped, spire or slant. */
const block = (seed: number, from: number, to: number, base: number, low: number, high: number, wide: [number, number]): Tower[] => {
  const towers: Tower[] = [];
  for (let x = from, n = 0; x < to; n++) {
    const w = wide[0] + Math.floor(hash(seed + n, 1) * (wide[1] - wide[0] + 1));
    towers.push({x, w, top: base - Math.round(low + (high - low) * hash(seed + n, 2) ** 1.6), seed: seed + n, crown: Math.floor(hash(seed + n, 3) * 4)});
    x += w + (hash(seed + n, 4) > 0.7 ? 1 : 0);
  }
  return towers;
};
const roofline = (tower: Tower, dx: number): number => {
  const mid = Math.abs(dx - (tower.w - 1) / 2);
  if (tower.crown === 1) return tower.top - (mid < tower.w * 0.3 ? 2 : mid < tower.w * 0.42 ? 1 : 0);
  if (tower.crown === 2) return tower.top - (mid < 0.6 ? 5 : mid < tower.w * 0.25 ? 2 : 0);
  if (tower.crown === 3) return tower.top - Math.round((tower.w - 1 - dx) * 0.5);
  return tower.top;
};
const raise = (p: Pixels, towers: Tower[], base: number, shift: number, paint: (tower: Tower, dx: number, y: number, roof: number) => string | undefined): void => {
  for (const tower of towers) for (let dx = 0; dx < tower.w; dx++) {
    const x = tower.x + dx - shift;
    if (x < 0 || x >= p.pw) continue;
    const roof = roofline(tower, dx);
    for (let y = Math.max(0, roof); y < base; y++) { const tone = paint(tower, dx, y, roof); if (tone) p.px(x, y, tone); }
  }
};
const windowAt = (tower: Tower, dx: number, y: number, base: number): boolean => dx % 2 === 1 && dx < tower.w - 1 && (base - y) % 2 === 0 && y > tower.top + 1;

// The city waking: the sun comes up behind the towers, the sky warms, and the last lit windows go out one at a time.
export const skylineDawn: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = tint(theme);
  const base = p.ph - Math.max(1, Math.round(p.ph * 0.08));
  const day = smooth((t % 40) / 30);
  const sky = (y: number): string => c(mix(ramp(['#1a1c4a', '#5a3a78', '#d9705a', '#ffb070'], y / base), ramp(['#5fa0e0', '#a8cdf0', '#ffe3b0', '#fff0c8'], y / base), day));
  wash(p, y => y < base ? sky(y) : c(mix('#1c1a2c', '#3a3a4a', day)));
  const sunY = base - day * p.ph * 0.55 + 2, sunX = p.pw * 0.5, sunR = Math.max(2, p.ph * 0.16);
  orb(p, sunX, sunY, sunR * 2.4, (d, _, y) => y < base ? mix(sky(y), c('#fff2c0'), 0.5 * (1 - d) ** 1.6) : undefined);
  orb(p, sunX, sunY, sunR, (_, __, y) => y < base ? c('#fff6d8') : undefined);
  for (let cloud = 0; cloud < 4; cloud++) {
    const cx = ((hash(cloud, 1) * p.pw + t * (0.6 + hash(cloud, 2))) % (p.pw + 30)) - 15, cy = p.ph * (0.1 + 0.25 * hash(cloud, 3));
    for (let dx = -9; dx <= 9; dx++) for (let dy = 0; dy < 2; dy++) if (Math.abs(dx) < 9 - dy * 4) p.px(Math.round(cx + dx), Math.round(cy - dy), mix(sky(cy), c('#ffd9c0'), 0.55));
  }
  const far = block(100, -4, p.pw, base, p.ph * 0.2, p.ph * 0.5, [4, 8]), near = block(300, -4, p.pw, base, p.ph * 0.15, p.ph * 0.72, [5, 11]);
  const hazy = c(mix('#5a4a7a', '#9fb6d0', day));
  raise(p, far, base, 0, (_, __, y) => mix(hazy, sky(y), 0.35));
  raise(p, near, base, 0, (tower, dx, y, roof) => {
    const lit = windowAt(tower, dx, y, base) && hash(tower.seed * 13 + dx, y) > 0.35 + day * 0.75;
    const face = mix(c('#17142a'), c('#3c4660'), day * (dx < tower.w / 2 ? 1 : 0.55));
    return y === roof ? mix(face, c('#ffd9a0'), 0.5 * day) : lit ? c('#ffd27a') : face;
  });
  for (let bird = 0; bird < 5; bird++) {
    const bx = Math.round(fract(t * 0.02 + bird * 0.07) * (p.pw + 20) - 10), by = Math.round(p.ph * 0.18 + bird * 1.6 + Math.sin(t + bird) * 1.5);
    const flap = Math.sin(t * 6 + bird) > 0 ? -1 : 0;
    p.px(bx - 1, by + flap, c('#20202c')); p.px(bx, by, c('#20202c')); p.px(bx + 1, by + flap, c('#20202c'));
  }
  p.flush();
  return g.finish();
};

// The same streets in a downpour: slanting rain, lightning behind the towers, and every light doubled on the wet road.
export const skylineRain: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = tint(theme);
  const base = Math.round(p.ph * 0.7);
  const strike = Math.floor(t / 3.7), since = t - strike * 3.7;
  const flash = hash(strike, 1) > 0.35 ? Math.max(0, 1 - since * 4) * (fract(since * 9) < 0.6 ? 1 : 0.3) : 0;
  const sky = (y: number): string => mix(c(mix('#0b0f1c', '#1d2638', y / base)), c('#cfd8ff'), flash * 0.55);
  wash(p, y => y < base ? sky(y) : c('#080b14'));
  if (flash > 0.2) {
    let bx = p.pw * (0.2 + 0.6 * hash(strike, 2));
    for (let y = 0; y < base * 0.8; y++) { bx += (hash(strike * 7 + y, 3) - 0.5) * 2.6; p.px(Math.round(bx), y, '#ffffff'); }
  }
  const shift = Math.floor(t * 3);
  const far = block(500, 0, p.pw * 3, base, p.ph * 0.18, p.ph * 0.4, [4, 8]), near = block(700, 0, p.pw * 3, base, p.ph * 0.12, p.ph * 0.6, [5, 10]);
  const wrap = (towers: Tower[], speed: number): number => Math.floor(shift * speed) % Math.max(1, towers.at(-1)!.x + towers.at(-1)!.w - p.pw);
  raise(p, far, base, wrap(far, 0.4), (_, __, y) => mix(c('#141a2a'), sky(y), 0.5));
  const signs = [c('#ff3b6b'), c('#35d0ff'), c('#ffd23a'), g.paint.accent];
  raise(p, near, base, wrap(near, 1), (tower, dx, y) => {
    const lit = windowAt(tower, dx, y, base) && hash(tower.seed * 13 + dx, y) > 0.55;
    const sign = tower.crown === 0 && dx === 0 && y > tower.top + 1 && y < tower.top + 7;
    return sign ? mix(signs[tower.seed % 4]!, '#000000', hash(tower.seed, Math.floor(t * 5)) > 0.9 ? 0.7 : 0) : lit ? c('#ffcf70') : mix(c('#06080f'), c('#cfd8ff'), flash * 0.2);
  });
  // The road is a dark mirror: columns above are repeated below, stretched, shaken and dimmed.
  for (let y = base; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    const source = p.at(x + Math.round(Math.sin(y * 2.1 + t * 3 + x * 0.2) * 1.2), base - 1 - Math.floor((y - base) * 1.6));
    if (source) p.px(x, y, mix(c('#080b14'), source, 0.5 * (1 - (y - base) / (p.ph - base) * 0.6)));
  }
  for (let car = 0; car < 3; car++) {
    const way = car % 2 ? 1 : -1, x = Math.round((((hash(car, 5) + way * t * 0.07 * (1 + car * 0.3)) % 1) + 1) % 1 * (p.pw + 10)) - 5, y = base + 1 + car;
    for (let dx = 0; dx < 4; dx++) p.px(x + dx, y, dx === (way > 0 ? 3 : 0) ? c('#fff3c0') : dx === (way > 0 ? 0 : 3) ? c('#ff3030') : c('#1a1f2c'));
  }
  for (let drop = 0; drop < p.pw * p.ph / 14; drop++) {
    const fall = fract(hash(drop, 6) + t * (1.1 + 0.6 * hash(drop, 7)));
    const x = Math.floor(hash(drop, 8) * (p.pw + 10) - fall * 6), y = Math.floor(fall * p.ph);
    const under = p.at(x, y);
    if (under) { p.px(x, y, mix(under, c('#b9c6e6'), 0.4)); p.px(x + 1, y - 1, mix(p.at(x + 1, y - 1) ?? under, c('#b9c6e6'), 0.25)); }
  }
  p.flush();
  return g.finish();
};

/** The island from across the water: a low wall of blocks, with the three towers everyone can name. */
const island = (p: Pixels, base: number, t: number, c: (hex: string) => string, face: string, lamp: string, lit: number, sky: (y: number) => string): void => {
  const far = block(40, 0, p.pw, base, p.ph * 0.1, p.ph * 0.3, [3, 6]), near = block(60, 0, p.pw, base, p.ph * 0.08, p.ph * 0.42, [4, 8]);
  raise(p, far, base, 0, (_, __, y) => mix(c(face), sky(y), 0.5));
  raise(p, near, base, 0, (tower, dx, y) => windowAt(tower, dx, y, base) && hash(tower.seed * 13 + dx, y) < lit ? mix(c(lamp), c(face), 0.35 * noise(t * 0.4, tower.seed + dx + y)) : c(face));
  const landmark = (at: number, tall: number, shape: (rise: number) => number, tip: number, glow?: string): void => {
    const cx = Math.round(p.pw * at), top = base - Math.round(p.ph * tall);
    for (let y = top; y < base; y++) {
      const half = Math.max(0, shape((base - y) / (base - top)));
      for (let dx = -Math.round(half); dx <= Math.round(half); dx++) {
        const pane = (dx + 40) % 2 === 1 && (base - y) % 2 === 0 && hash(cx + dx, y) < lit;
        p.px(cx + dx, y, glow && y < top + 3 ? c(glow) : pane ? c(lamp) : mix(c(face), '#ffffff', dx < 0 ? 0.06 : 0));
      }
    }
    for (let y = top - tip; y < top; y++) p.px(cx, y, y === top - tip && fract(t * 0.5) < 0.5 ? c('#ff4040') : c(face));
  };
  const s = Math.max(1, p.pw / 80);
  // Stepped setbacks, a scalloped crown, and a taper: the Empire State, the Chrysler, and the tower downtown.
  landmark(0.46, 0.66, rise => (rise > 0.86 ? 0.8 : rise > 0.72 ? 1.6 : rise > 0.5 ? 2.6 : 3.6) * s, Math.round(p.ph * 0.12), '#ffffff');
  landmark(0.64, 0.56, rise => (rise > 0.8 ? (1 - rise) * 9 + 0.3 : 2.2) * s, Math.round(p.ph * 0.07), '#ffe9a0');
  landmark(0.2, 0.62, rise => (3.4 - rise * 2.2) * s, Math.round(p.ph * 0.1));
};

// Twice a year the sun sets dead in line with the cross streets, and the whole canyon lights up.
export const manhattanHenge: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = tint(theme);
  const vx = p.pw / 2, vy = Math.round(p.ph * 0.6);
  const sink = fract(t / 36), sunY = vy - p.ph * 0.3 + sink * p.ph * 0.34, sunR = Math.max(2, p.ph * 0.17);
  const sky = (y: number): string => c(ramp(['#2b1b52', '#a23a5e', '#ff8a3c', '#ffd27a'], y / vy));
  wash(p, y => y < vy ? sky(y) : c('#20131a'));
  orb(p, vx, sunY, sunR * 2.6, (d, _, y) => y < vy ? mix(sky(y), c('#fff0b0'), 0.6 * (1 - d) ** 1.4) : undefined);
  orb(p, vx, sunY, sunR, (_, __, y) => y < vy ? c('#fff7d0') : undefined);
  // Street: light pours down it from the vanishing point, with lane dashes and a line of cabs.
  for (let y = vy; y < p.ph; y++) {
    const depth = (y - vy + 1) / (p.ph - vy), half = depth * p.pw * 0.36 + 1;
    for (let x = Math.round(vx - half); x <= vx + half; x++) {
      const across = (x - vx) / half;
      const dash = Math.abs(across) < 0.05 && fract(1 / depth * 0.6 + t * 0.8) < 0.5;
      p.px(x, y, dash ? c('#ffe9a0') : mix(c('#3a2420'), c('#ffb060'), (1 - Math.abs(across)) ** 2 * (1 - depth * 0.6) * (0.9 - sink * 0.4)));
    }
  }
  // Walls: each side is a run of blocks that grow taller and wider as they come towards the viewer.
  for (const side of [-1, 1]) for (let n = 9; n >= 0; n--) {
    const nearEdge = (n + 1) / 10, farEdge = n / 10;
    const x0 = vx + side * (2 + farEdge ** 1.7 * p.pw * 0.52), x1 = vx + side * (2 + nearEdge ** 1.7 * p.pw * 0.52);
    const tall = (0.35 + 0.65 * hash(n + (side > 0 ? 50 : 0), 9)) * 1.25;
    for (let x = Math.round(Math.min(x0, x1)); x <= Math.max(x0, x1); x++) {
      const along = Math.abs(x - vx) / (p.pw * 0.52), scale = 0.06 + along ** 1.2 * 0.94;
      const top = Math.round(vy - scale * p.ph * 1.1 * tall), foot = Math.round(vy + scale * (p.ph - vy) * 1.02);
      for (let y = Math.max(0, top); y < Math.min(p.ph, foot); y++) {
        // The faces that look down the street catch the sun; the windows burn with it.
        const rim = Math.abs(x - x0) < 1.2;
        const pane = Math.floor((y - top) / Math.max(1, scale * 3)) % 2 === 1 && Math.floor(Math.abs(x - x0) / Math.max(1, scale * 2.4)) % 2 === 1;
        p.px(x, y, rim ? c(mix('#ffb060', '#ffe9b0', 1 - sink)) : pane ? mix(c('#1a0f1a'), c('#ff9a4a'), (1 - along) * 0.9 * (1 - sink * 0.5)) : c(mix('#120b16', '#2a1620', along)));
      }
    }
  }
  for (let cab = 0; cab < 5; cab++) {
    const depth = fract(hash(cab, 1) + t * 0.05) ** 2, y = Math.round(vy + depth * (p.ph - vy - 1)), lane = (cab % 2 ? 0.3 : -0.3) * (depth * p.pw * 0.36 + 1);
    for (let dx = 0; dx <= Math.round(depth * 3); dx++) p.px(Math.round(vx + lane) + dx, y, c('#ffd21a'));
  }
  p.flush();
  return g.finish();
};

// The island under snow: flakes drifting past the lit towers and settling on the bare trees of the park.
export const manhattanSnow: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = tint(theme);
  const base = Math.round(p.ph * 0.8);
  const sky = (y: number): string => c(ramp(['#1a2238', '#343f5c', '#6b6f88'], y / base));
  wash(p, y => y < base ? sky(y) : c('#e6ecf5'));
  island(p, base, t, c, '#1b2030', '#ffd486', 0.5, sky);
  for (let x = 0; x < p.pw; x++) {
    const drift = base - Math.round(1 + noise(x * 0.07, 2) * 2);
    for (let y = drift; y < p.ph; y++) p.px(x, y, mix(c('#f4f7fb'), c('#b3c0d6'), (y - drift) / (p.ph - drift + 1)));
  }
  for (let tree = 0; tree < p.pw / 9; tree++) {
    const x = Math.round((tree + hash(tree, 1)) * 9), tall = Math.round(p.ph * (0.12 + 0.1 * hash(tree, 2)));
    stroke(p, x, p.ph - 2, x, p.ph - 2 - tall, 0.3, c('#2a2420'));
    for (const side of [-1, 1]) for (let limb = 1; limb <= 3; limb++) {
      const y = p.ph - 2 - tall * limb / 3.4, reach = (4 - limb) * 1.4;
      stroke(p, x, y, x + side * reach, y - reach * 0.7, 0.3, c('#2a2420'));
      p.px(Math.round(x + side * reach), Math.round(y - reach * 0.7) - 1, c('#ffffff'));
    }
  }
  for (let lamp = 0; lamp < p.pw / 22; lamp++) {
    const x = Math.round((lamp + 0.5) * 22);
    for (let y = p.ph - 6; y < p.ph - 1; y++) p.px(x, y, c('#1b2030'));
    orb(p, x + 0.5, p.ph - 6.5, 3, (d, px, py) => mix(p.at(px, py) ?? c('#343f5c'), c('#ffd98a'), 0.7 * (1 - d)));
  }
  for (let flake = 0; flake < p.pw * p.ph / 22; flake++) {
    const fall = fract(hash(flake, 5) + t * (0.05 + 0.08 * hash(flake, 6)));
    p.px(Math.floor(((hash(flake, 7) * p.pw + Math.sin(t * 0.7 + flake) * 3 + t * 1.5) % p.pw + p.pw) % p.pw), Math.floor(fall * p.ph), c(hash(flake, 8) > 0.5 ? '#ffffff' : '#c3cee0'));
  }
  p.flush();
  return g.finish();
};

// From the harbour at dusk: the skyline lit, its lights running down the water, and a ferry working across.
export const manhattanHarbor: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = tint(theme);
  const base = Math.round(p.ph * 0.6);
  const sky = (y: number): string => c(ramp(['#0e1436', '#3a2a62', '#b0507a', '#ff9a62'], y / base));
  wash(p, y => y < base ? sky(y) : c('#0b1026'));
  stars(p, t, base * 0.45, sky);
  island(p, base, t, c, '#121628', '#ffd98a', 0.7, sky);
  for (let y = base; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    // Reflections: every lit column above is drawn out into a wavering streak below.
    const reach = y - base, source = p.at(x + Math.round(Math.sin(y * 1.9 + t * 2.4 + x * 0.3) * (0.6 + reach * 0.12)), base - 1 - reach * 2);
    const ripple = noise(x * 0.4 + t, y * 1.7, 6) > 0.62;
    p.px(x, y, mix(c(mix('#0b1026', '#1c1840', reach / (p.ph - base))), source ?? c('#0b1026'), ripple ? 0.6 : 0.28));
  }
  const way = fract(t * 0.014 + 0.2), fx = Math.round(way * (p.pw + 30)) - 15, fy = base + Math.round((p.ph - base) * 0.45);
  for (let dx = -7; dx <= 7; dx++) {
    p.px(fx + dx, fy, c('#d9702a'));
    if (Math.abs(dx) < 6) p.px(fx + dx, fy - 1, dx % 2 ? c('#ffe9a0') : c('#f2f2f2'));
    if (Math.abs(dx) < 4) p.px(fx + dx, fy - 2, c('#f2f2f2'));
  }
  p.px(fx - 1, fy - 3, c('#1b2030')); p.px(fx - 1, fy - 4, c('#1b2030'));
  for (let wake = 1; wake < 12; wake++) p.px(fx - 7 - wake, fy + (wake % 2), mix(c('#0b1026'), '#ffffff', 0.5 * (1 - wake / 12)));
  // The statue, small and far off to the left, torch lit.
  const sx = Math.round(p.pw * 0.07), sy = base + 1;
  for (let y = 0; y < 5; y++) p.px(sx, sy - y, c('#3c8f7c'));
  for (let dx = -1; dx <= 1; dx++) p.px(sx + dx, sy + 1, c('#6b6f88'));
  p.px(sx + 1, sy - 5, c('#3c8f7c')); p.px(sx + 1, sy - 6, mix(c('#ffd98a'), '#ffffff', 0.5 * tri(t)));
  for (let gull = 0; gull < 3; gull++) {
    const gx = Math.round(fract(t * 0.03 + gull * 0.31) * (p.pw + 10)) - 5, gy = Math.round(p.ph * 0.2 + gull * 2 + Math.sin(t * 1.3 + gull) * 1.5), up = Math.sin(t * 7 + gull) > 0 ? -1 : 0;
    p.px(gx - 1, gy + up, c('#e8e8f0')); p.px(gx, gy, c('#e8e8f0')); p.px(gx + 1, gy + up, c('#e8e8f0'));
  }
  p.flush();
  return g.finish();
};

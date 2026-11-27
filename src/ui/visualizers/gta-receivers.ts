import {clamp, fract, grid, hash, mix, noise, pixels, seconds, type Builder, type Pixels} from './cell-canvas.js';
import {season} from './festive-receivers.js';

// A tribute in the palette of the Grand Theft Auto VI campaign: hot pink into orange over deep violet. Fixed colours; greys on mono.
const SKY = ['#2a1458', '#7a2a8a', '#e0447c', '#ff8a4a', '#ffd070'];
const ramp = (stops: string[], at: number): string => {
  const scaled = clamp(at) * (stops.length - 1), index = Math.min(stops.length - 2, Math.floor(scaled));
  return mix(stops[index]!, stops[index + 1]!, scaled - index);
};
/** A leaning palm in silhouette: a curved trunk and a crown of drooping fronds that stir in the wind. */
const palm = (p: Pixels, x: number, foot: number, tall: number, lean: number, t: number, color: string): void => {
  let tx = x, ty = foot;
  for (let s = 0; s < tall; s++) { tx += lean * (s / tall) * 0.6; ty -= 1; for (let w = 0; w < (tall > 14 ? 2 : 1); w++) p.px(Math.round(tx) + w, Math.round(ty), color); }
  for (let frond = 0; frond < 7; frond++) {
    const a = -Math.PI * 0.95 + frond / 6 * Math.PI * 0.9 + Math.sin(t * 1.2 + frond + x) * 0.07, long = tall * (0.42 + 0.1 * hash(frond, x));
    for (let s = 0; s < long; s++) { const u = s / long; p.px(Math.round(tx + Math.cos(a) * s * 1.3), Math.round(ty + Math.sin(a) * s * 0.7 + u * u * long * 0.55), color); if (s % 2 === 0) p.px(Math.round(tx + Math.cos(a) * s * 1.3), Math.round(ty + Math.sin(a) * s * 0.7 + u * u * long * 0.55) + 1, color); }
  }
};
const sunset = (p: Pixels, t: number, c: (hex: string) => string, horizon: number): ((x: number, y: number) => string) => {
  const sunX = p.pw * 0.5, sunY = horizon - p.ph * 0.1, sunR = Math.max(3, p.ph * 0.26);
  return (x, y) => {
    if (y >= horizon) {
      // Water: the sky's colours upside down, cut into ripples, with the sun's path down the middle.
      const path = Math.exp(-(((x - sunX) / (sunR * (0.7 + (y - horizon) * 0.25))) ** 2));
      const ripple = noise(x * 0.35 + t * 1.2, y * 2.3, 2) > 0.52 - path * 0.3;
      return c(mix(ramp(SKY, 1 - (y - horizon) / (p.ph - horizon) * 0.8), '#1a0f3a', ripple ? 0.25 - path * 0.2 : 0.62));
    }
    const d = Math.hypot(x - sunX, (y - sunY) * 1.05) / sunR;
    if (d < 1) { const low = (y - sunY) / sunR; return low > 0.05 && fract(low * 4 - t * 0.25) < 0.16 + low * 0.25 ? c(ramp(SKY, y / horizon)) : c(mix('#fff0a0', '#ff5a8a', clamp((y - (sunY - sunR)) / (sunR * 2)))); }
    const cloud = noise(x * 0.05 + t * 0.03, y * 0.4, 7) > 0.66 && y < horizon * 0.7;
    return c(mix(ramp(SKY, y / horizon), '#ffe9c0', (cloud ? 0.28 : 0) + 0.35 * Math.max(0, 1 - d / 2.4) ** 2));
  };
};

// The numeral as a window: a Leonida sunset, palms and all, seen only through a towering VI.
const gtaViSunset: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const tall = p.ph - 2, stroke = Math.max(3, tall * 0.34), vW = tall * 1.15, gap = stroke * 0.7, total = vW + gap + stroke, left = (p.pw - total) / 2, top = 1;
  const inside = (x: number, y: number): boolean => {
    const v = (y - top) / tall;
    if (v < 0 || v > 1) return false;
    const lx = x - left;
    // V: two bars converging on the baseline. I: one upright bar.
    const centre = vW / 2, spread = (vW / 2 - stroke / 2) * (1 - v);
    return Math.abs(lx - (centre - spread)) < stroke / 2 || Math.abs(lx - (centre + spread)) < stroke / 2 || (lx > vW + gap && lx < total);
  };
  const scene = sunset(p, t, c, Math.round(p.ph * 0.66));
  const back = (x: number, y: number): string => c(mix('#0d0620', '#1a0b33', y / p.ph + 0.15 * noise(x * 0.1, y * 0.2 + t * 0.1, 3)));
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, back(x, y));
  const stage = pixels(g);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) stage.px(x, y, scene(x, y));
  const shadow = c('#12061f');
  for (let n = 0; n < Math.max(3, p.pw / 14); n++) palm(stage, Math.round(left + (n + 0.3 + 0.4 * hash(n, 1)) * total / Math.max(3, p.pw / 14)), Math.round(p.ph * 0.72), Math.round(p.ph * (0.36 + 0.26 * hash(n, 2))), hash(n, 3) > 0.5 ? 3 : -3, t, shadow);
  for (let bird = 0; bird < 6; bird++) { const bx = Math.round(fract(t * 0.02 + bird * 0.13) * (p.pw + 10)) - 5, by = Math.round(p.ph * 0.2 + bird * 1.4 + Math.sin(t + bird) * 1.5), up = Math.sin(t * 6 + bird) > 0 ? -1 : 0; stage.px(bx - 1, by + up, shadow); stage.px(bx, by, shadow); stage.px(bx + 1, by + up, shadow); }
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    if (inside(x, y)) p.px(x, y, stage.at(x, y) ?? back(x, y));
    else if (inside(x - 1, y - 1)) p.px(x, y, c('#05020c'));
  }
  // A slow gleam crosses the numeral.
  const gleam = fract(t * 0.12) * (p.pw + 40) - 20;
  for (let y = 0; y < p.ph; y++) for (let x = Math.round(gleam - y * 0.5) - 1; x <= gleam - y * 0.5 + 1; x++) { const under = p.at(x, y); if (under && inside(x, y)) p.px(x, y, mix(under, '#ffffff', 0.35)); }
  p.flush();
  return g.finish();
};

// Ocean Drive after dark: neon stacked up the hotel fronts, palms against it, a car rolling by, and the stars filling in when the lights go red and blue.
const gtaViNeon: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const street = Math.round(p.ph * 0.72), heat = Math.floor(t / 12) % 2 === 1, flash = heat ? (Math.floor(t * 5) % 2 ? '#ff2a4a' : '#2a6aff') : '';
  const sky = (y: number): string => c(mix(mix('#0a0424', '#3a1466', y / street), flash || '#000000', heat ? 0.1 : 0));
  for (let y = 0; y < street; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, hash(x, y * 3.1) > 0.99 ? c('#c8b8ff') : sky(y));
  const tubes = ['#ff3fa4', '#35e8ff', '#ffd23a', '#a45cff', '#3dff9a'];
  for (let x = 0, n = 0; x < p.pw; n++) {
    const wide = 9 + Math.floor(hash(n, 1) * 8), top = street - Math.round(p.ph * (0.3 + 0.3 * hash(n, 2))), tone = c(tubes[n % tubes.length]!);
    // Each front is outlined in one colour of tube, with a vertical sign that stutters now and then.
    const buzz = hash(n, Math.floor(t * 7)) > 0.93 ? 0.3 : 1;
    for (let dx = 0; dx < wide && x + dx < p.pw; dx++) for (let y = top; y < street; y++) {
      const edge = y === top || dx === 0 || dx === wide - 1, band2 = (street - y) % 4 === 0 && dx > 1 && dx < wide - 2, sign = dx === Math.floor(wide / 2) && y > top + 1 && y < top + 8;
      p.px(x + dx, y, edge ? mix(c('#12082a'), tone, buzz) : sign ? mix(c('#12082a'), c(tubes[(n + 2) % tubes.length]!), (y + Math.floor(t * 6)) % 3 ? 1 : 0.35) : band2 ? mix(c('#12082a'), tone, 0.45) : (dx % 3 === 1 && (street - y) % 4 === 2 && hash(n * 9 + dx, y) > 0.5) ? c('#ffe9a0') : c('#12082a'));
    }
    x += wide + 1;
  }
  // Street palms stay below the rooflines and take a little of the neon, so they read as trees rather than a dark band.
  for (let n = 0; n < p.pw / 26; n++) palm(p, Math.round((n + 0.5) * 26), street, Math.round(p.ph * 0.24), n % 2 ? 2 : -2, t, c('#2a1250'));
  for (let y = street; y < p.ph; y++) for (let x = 0; x < p.pw; x++) {
    // Wet asphalt: the fronts repeat below, smeared sideways.
    const source = p.at(x + Math.round(Math.sin(y * 2.2 + t * 2 + x * 0.3) * 1.3), street - 1 - (y - street) * 2);
    p.px(x, y, mix(c(mix('#0a0618', flash || '#0a0618', heat ? 0.25 : 0)), source ?? c('#0a0618'), 0.5 * (1 - (y - street) / (p.ph - street) * 0.5)));
  }
  const lap = p.pw + 30, carX = Math.round((t * (heat ? 34 : 16)) % lap) - 15, cy = street + 1;
  const body = c('#ff3fa4');
  for (let dx = 0; dx < 12; dx++) { p.px(carX + dx, cy, body); if (dx > 2 && dx < 9) p.px(carX + dx, cy - 1, dx > 3 && dx < 8 ? c('#1a1030') : body); }
  for (const wheel of [2, 9]) p.px(carX + wheel, cy + 1, c('#000000'));
  p.px(carX + 12, cy, c('#fff3c0')); p.px(carX + 13, cy, c('#fff3c0')); p.px(carX - 1, cy, c('#ff2020'));
  if (heat) { const cop = carX - 26; for (let dx = 0; dx < 11; dx++) { p.px(cop + dx, cy, c(dx > 3 && dx < 7 ? '#f2f2f2' : '#14141c')); } p.px(cop + 4, cy - 1, c('#ff2a4a')); p.px(cop + 6, cy - 1, c('#2a6aff')); if (Math.floor(t * 5) % 2) { p.px(cop + 3, cy - 2, c('#ff2a4a')); p.px(cop + 7, cy - 2, c('#2a6aff')); } }
  p.flush();
  const stars = heat ? Math.min(5, 1 + Math.floor((t % 12) / 2)) : 0;
  if (g.w > 16) g.write(g.w - 11, 0, '★ '.repeat(stars) + '☆ '.repeat(5 - stars), heat ? '#ffffff' : c('#5a4a7a'));
  if (g.w > 40) g.write(1, 0, 'VICE CITY', c('#ff3fa4'));
  return g.finish();
};

export const gtaReceiverBuilders = {
  'gta-vi-sunset': gtaViSunset,
  'gta-vi-neon': gtaViNeon,
};

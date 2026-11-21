import {TAU, band, braille, clamp, fract, grid, hash, kick, mix, noise, pixels, seconds, smooth, stroke, type Builder, type Pixels} from './cell-canvas.js';
import {lettering, season} from './festive-receivers.js';

const VICE_PINK = '#ff3ea5';
const VICE_CYAN = '#2ee8ff';
const VICE_GOLD = '#ffd466';
const VICE_VIOLET = '#8c3dff';
const VICE_NIGHT = '#0b051d';

const ramp = (stops: string[], at: number): string => {
  const scaled = clamp(at) * (stops.length - 1), idx = Math.min(stops.length - 2, Math.floor(scaled));
  return mix(stops[idx]!, stops[idx + 1]!, scaled - idx);
};

const palmSilhouette = (p: Pixels, x: number, baseY: number, tall: number, lean: number, t: number, color: string): void => {
  let tx = x, ty = baseY;
  for (let s = 0; s < tall; s++) {
    tx += lean * (s / Math.max(1, tall)) * 0.55;
    ty -= 1;
    p.px(Math.round(tx), Math.round(ty), color);
    if (tall > 12) p.px(Math.round(tx) + 1, Math.round(ty), color);
  }
  for (let f = 0; f < 6; f++) {
    const a = -Math.PI * 0.92 + f / 5 * Math.PI * 0.84 + Math.sin(t * 1.3 + f + x * 0.2) * 0.08;
    const len = tall * (0.42 + 0.08 * hash(f, x));
    for (let s = 0; s < len; s++) {
      const u = s / Math.max(1, len);
      p.px(Math.round(tx + Math.cos(a) * s * 1.25), Math.round(ty + Math.sin(a) * s * 0.65 + u * u * len * 0.52), color);
    }
  }
};

const STATIONS = [
  {name: 'RADIOCLI VI', freq: '106.1', genre: 'OFFICIAL LIVE', track: 'LEONIDA NIGHTS - SYNTH MIX'},
  {name: 'VICE FM', freq: '98.3', genre: '80S NEON POP', track: 'OUTRUN THE SUNSET'},
  {name: 'KEYS WAVE', freq: '104.7', genre: 'TROPICAL HOUSE', track: 'BISCAYNE AFTERGLOW'},
  {name: 'OCEAN DRIVE', freq: '94.5', genre: 'MIDNIGHT SYNTH', track: 'PALM SHADOWS 1986'},
  {name: 'STARFISH ROCK', freq: '101.9', genre: 'ARENA ROCK', track: 'THUNDER ON CAUSEWAY'},
  {name: 'GRASSRIVERS', freq: '89.7', genre: 'BAYOU BLUES', track: 'AIRBOAT AT DUSK'},
  {name: 'PORT GELLHORN', freq: '92.1', genre: 'BASS & HIP-HOP', track: 'ALL GAS NO BRAKES'},
  {name: 'VICE BEACH CLUB', freq: '107.9', genre: 'ELECTRO FUNK', track: 'NEON VELVET'}
];

// 1. Iconic GTA VI In-Game Radio Station Selector Wheel HUD with glowing VI core, live station tuning & beat spectrum.
const viceRadioWheel: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const c = season(theme);
  const bg = c(VICE_NIGHT);
  const pink = c(mix(VICE_PINK, g.paint.accent, 0.14)), cyan = c(VICE_CYAN), gold = c(VICE_GOLD);
  const dim = c('#351e5e'), violet = c(VICE_VIOLET), panelBg = c('#140a2e');
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.set(x, y, ' ', pink, bg);
  const hasCard = g.w >= 46 && g.h >= 7;
  const cx = hasCard ? b.dw * 0.27 : b.dw * 0.5, cy = b.dh * 0.52;
  const R = Math.max(4, Math.min(b.dh * 0.44, b.dw * (hasCard ? 0.23 : 0.44)));
  const rIn = R * 0.44;
  const count = STATIONS.length;
  const activeIdx = Math.floor(t / 4.5) % count;
  const smoothIdx = activeIdx + smooth(clamp((fract(t / 4.5) - 0.82) / 0.18));
  const activeCenter = (smoothIdx / count) * TAU - Math.PI / 2;
  // Concentric wheel bezel rings & radial sector dividers.
  for (let i = 0; i < 140; i++) {
    const a = i / 140 * TAU;
    const dAng = Math.abs(Math.atan2(Math.sin(a - activeCenter), Math.cos(a - activeCenter)));
    const inActive = dAng < (TAU / count) * 0.48;
    b.dot(cx + Math.cos(a) * R, cy + Math.sin(a) * R, inActive ? cyan : dim);
    b.dot(cx + Math.cos(a) * (R * 0.92), cy + Math.sin(a) * (R * 0.92), inActive ? pink : dim);
    b.dot(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn, inActive ? gold : violet);
  }
  for (let s = 0; s < count; s++) {
    const a = (s - 0.5) / count * TAU - Math.PI / 2;
    const isBorder = s === activeIdx || (s + count - 1) % count === activeIdx;
    b.line(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn, cx + Math.cos(a) * R, cy + Math.sin(a) * R, isBorder ? cyan : dim);
    // Station icon marker dots & active wedge highlight fill.
    const midA = s / count * TAU - Math.PI / 2;
    const mr = (rIn + R) * 0.52;
    const mx = cx + Math.cos(midA) * mr, my = cy + Math.sin(midA) * mr;
    if (s === activeIdx) {
      for (let rad = rIn + 1.5; rad < R - 1.5; rad += 2.2) {
        const a0 = midA - (TAU / count) * 0.32, a1 = midA + (TAU / count) * 0.32;
        b.line(cx + Math.cos(a0) * rad, cy + Math.sin(a0) * rad, cx + Math.cos(a1) * rad, cy + Math.sin(a1) * rad, pink);
      }
    } else {
      b.dot(mx, my, violet); b.dot(mx + 1, my, violet);
    }
  }
  // Pulsing radial audio beat halo inside the hub.
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU + t * 0.6;
    const reach = rIn * (0.55 + 0.38 * band(i * 0.9, t));
    b.dot(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach, i % 2 ? cyan : gold);
  }
  b.flush(bg);
  // Crisp glowing "VI" inside the hub center.
  const hubX = Math.round(cx / 2), hubY = Math.round(cy / 4);
  if (g.w >= 14) g.write(hubX - 1, hubY, 'VI', '#ffffff', bg);
  if (hasCard) {
    const st = STATIONS[activeIdx]!;
    const cardX = Math.floor(g.w * 0.52), cardW = Math.max(16, g.w - cardX - 2);
    for (let y = 1; y < g.h - 1; y++) for (let x = cardX; x < cardX + cardW; x++) g.set(x, y, ' ', pink, panelBg);
    g.write(cardX + 1, 1, 'GTA VI  x  RADIOCLI'.slice(0, cardW - 2), gold, panelBg);
    g.write(cardX + 1, 2, '━'.repeat(Math.max(1, cardW - 2)), pink, panelBg);
    g.write(cardX + 1, 3, `${st.name}  ${st.freq}`.slice(0, cardW - 2), '#ffffff', panelBg);
    g.write(cardX + 1, 4, st.genre.slice(0, cardW - 2), cyan, panelBg);
    if (g.h >= 8) g.write(cardX + 1, 6, (`► ${st.track}`).slice(0, cardW - 2), mix(pink, '#ffffff', 0.3), panelBg);
    // Live neon Vice-colored audio equalizer bars inside the HUD card.
    const eqTop = Math.min(g.h - 3, 8), eqBot = g.h - 3;
    if (eqBot >= eqTop && g.h >= 10) {
      const bars = Math.max(4, Math.min(20, Math.floor((cardW - 2) / 2)));
      for (let k = 0; k < bars; k++) {
        const lv = band(k * 1.4, t);
        const glyph = ' ▁▂▃▄▅▆▇█'[clamp(Math.round(lv * 8), 1, 8)]!;
        const col = lv > 0.72 ? gold : lv > 0.42 ? pink : cyan;
        g.set(cardX + 1 + k * 2, eqBot, glyph, col, panelBg, lv > 0.65);
        if (eqBot > eqTop && lv > 0.55) g.set(cardX + 1 + k * 2, eqBot - 1, ' ▁▂▃▄▅▆▇█'[clamp(Math.round((lv - 0.5) * 16), 1, 8)]!, gold, panelBg, true);
      }
    }
    g.write(cardX + 1, g.h - 2, (`CH ${activeIdx + 1}/${count}   LEONIDA STEREO`).slice(0, cardW - 2), violet, panelBg);
  } else if (g.h >= 3 && g.w >= 14) {
    g.write(1, 0, 'GTA VI RADIO'.slice(0, g.w - 2), gold, bg);
  }
  return g.finish();
};

// 2. GTA VI Leonida Aerial Chopper Searchlight & GPS Minimap Pursuit with police vision cones & 5-star Wanted HUD.
const leonidaChase: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const mapBg = c('#080d1a'), blockCol = c('#121c33'), roadCol = c('#223357'), waterCol = c('#071d36');
  const routeCol = c(mix(VICE_PINK, g.paint.accent, 0.15)), cyan = c(VICE_CYAN), gold = c(VICE_GOLD);
  const red = c('#ff2b4a'), blue = c('#2e7dff'), hudBg = c('#0d071d');
  const hasHud = p.pw >= 48 && p.ph >= 12;
  const mapW = hasHud ? Math.floor(p.pw * 0.66) : p.pw;
  const scrollY = t * 14, scrollX = Math.sin(t * 0.45) * 10;
  // Police helicopter sweeping spotlight circle across the Vice Beach grid.
  const spotX = mapW * (0.48 + 0.24 * Math.sin(t * 0.95)), spotY = p.ph * (0.46 + 0.22 * Math.cos(t * 0.72));
  const spotR = Math.max(4, Math.min(mapW, p.ph) * 0.34);
  const sirenRed = Math.floor(t * 6) % 2 === 0;
  // Player getaway car & 3 converging police interceptors.
  const carX = mapW * 0.44 + Math.sin(t * 1.1) * mapW * 0.06, carY = p.ph * 0.56;
  const cops: [number, number, number][] = [
    [carX - 8 + Math.sin(t * 1.8) * 3, carY + 5 + Math.cos(t * 1.4) * 2, -Math.PI * 0.45],
    [carX + 10 + Math.cos(t * 1.5) * 3, carY + 4 + Math.sin(t * 1.3) * 2, -Math.PI * 0.58],
    [carX - 2 + Math.sin(t * 2.1) * 5, carY - 9 + Math.cos(t * 1.1) * 2, Math.PI * 0.48]
  ];
  // Render nighttime GPS city grid, Biscayne shoreline, neon GPS route, police vision cones & chopper searchlight.
  for (let y = 0; y < p.ph; y++) {
    for (let x = 0; x < p.pw; x++) {
      if (x >= mapW) { p.px(x, y, x === mapW ? cyan : hudBg); continue; }
      const wx = x + scrollX, wy = y - scrollY;
      const shore = mapW * 0.84 + Math.sin(wy * 0.08) * 3;
      let col: string;
      if (x > shore) {
        const surf = Math.abs(x - shore) < 1.3;
        col = surf ? c('#3a88a8') : mix(waterCol, cyan, noise(wx * 0.2, wy * 0.25) * 0.12);
      } else {
        const ave = ((Math.floor(wx) % 12) + 12) % 12 < 2;
        const st = ((Math.floor(wy) % 9) + 9) % 9 < 2;
        col = ave || st ? roadCol : ((Math.floor(wx) % 12 === 5 || Math.floor(wy) % 9 === 4) ? mapBg : blockCol);
      }
      // Glowing magenta GPS route line snaking north ahead of the car.
      const routeX = mapW * 0.44 + Math.sin((y - scrollY) * 0.09) * mapW * 0.08;
      if (y < carY + 2 && Math.abs(x - routeX) < 1.1 && x < shore - 1) col = routeCol;
      // Flashing police vision cones sweeping ahead of each cruiser.
      for (const [cx, cy, ang] of cops) {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d > 1.5 && d < 10) {
          const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - ang), Math.cos(Math.atan2(dy, dx) - ang)));
          if (da < 0.42) col = mix(col, sirenRed ? red : blue, (1 - d / 10) * 0.55);
        }
      }
      // Chopper spotlight circle illuminating the night blocks.
      const sd = Math.hypot(x - spotX, y - spotY) / spotR;
      if (sd < 1) col = mix(col, '#ffffff', (1 - sd * sd) * 0.36);
      else if (sd < 1.08) col = mix(col, cyan, 0.55);
      p.px(x, y, col);
    }
  }
  // Player getaway vehicle blip (bright gold arrow) + twin headlight beams.
  stroke(p, carX, carY - 1, carX - 1.5, carY - 5, 0.45, c('#fff4b8'));
  stroke(p, carX, carY - 1, carX + 1.5, carY - 5, 0.45, c('#fff4b8'));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) p.px(Math.round(carX + dx), Math.round(carY + dy), dx === 0 && dy === 0 ? '#ffffff' : gold);
  // Police cruiser blips flashing red/blue.
  cops.forEach(([cx, cy], idx) => {
    const flash = (idx + (sirenRed ? 1 : 0)) % 2 === 0;
    p.px(Math.round(cx), Math.round(cy), flash ? red : blue);
    p.px(Math.round(cx) + 1, Math.round(cy), flash ? blue : red);
  });
  p.flush();
  if (hasHud) {
    const hx = mapW + 2, hudW = Math.max(12, g.w - hx - 1);
    const stars = 2 + (Math.floor(t / 4) % 4);
    const cash = 148200 + Math.floor(t * 175);
    g.write(hx, 1, 'GTA VI  CHASE'.slice(0, hudW), routeCol, hudBg);
    g.write(hx, 2, ('★'.repeat(stars) + '☆'.repeat(5 - stars)).slice(0, hudW), sirenRed ? red : blue, hudBg);
    g.write(hx, 4, 'VICE BEACH'.slice(0, hudW), cyan, hudBg);
    g.write(hx, 5, 'LEONIDA GPS'.slice(0, hudW), c('#7a8db5'), hudBg);
    g.write(hx, 7, `$${cash.toLocaleString('en-US')}`.slice(0, hudW), gold, hudBg);
    if (g.h >= 11) {
      const mW = Math.max(4, Math.min(14, hudW)), lv = Math.round(clamp(0.45 + 0.55 * band(3, t)) * mW);
      g.write(hx, 9, (sirenRed ? '● CHOPPER LOCK' : '○ PURSUIT HOT ').slice(0, hudW), sirenRed ? red : cyan, hudBg);
      g.write(hx, 10, '▮'.repeat(lv) + '▯'.repeat(mW - lv), sirenRed ? routeCol : cyan, hudBg);
    }
    if (g.h >= 13) g.write(hx, 12, 'RADIOCLI x VI'.slice(0, hudW), c('#9a78d6'), hudBg);
  }
  return g.finish();
};

// 3. Cinematic GTA VI Vice Bay Sunset Billboard: glowing "GTA VI" roadside neon billboard, Art Deco bay skyline, blimp & causeway traffic.
const viceBillboard: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const c = season(theme);
  const skyStops = ['#140836', '#4a176e', '#c93282', '#ff7052', '#ffd166'];
  const horizon = Math.max(4, Math.floor(p.ph * 0.68));
  const pink = c(mix(VICE_PINK, g.paint.accent, 0.14)), cyan = c(VICE_CYAN), gold = c(VICE_GOLD);
  const silhouette = c('#100724');
  // Golden-magenta Vice Bay sunset sky & shimmering water reflection below horizon.
  for (let y = 0; y < p.ph; y++) {
    for (let x = 0; x < p.pw; x++) {
      if (y < horizon) {
        const u = y / Math.max(1, horizon);
        const cloud = noise(x * 0.08 + t * 0.06, y * 0.32, 5) > 0.64 && u < 0.72;
        p.px(x, y, c(mix(ramp(skyStops, u), '#ffe8c2', cloud ? 0.28 : 0)));
      } else {
        const u = (y - horizon) / Math.max(1, p.ph - horizon);
        const shimmer = Math.sin(x * 0.35 + y * 1.4 - t * 3.2) > 0.35;
        p.px(x, y, c(mix(ramp(skyStops, 1 - u * 0.75), '#130829', shimmer ? 0.35 : 0.68)));
      }
    }
  }
  // Distant Art Deco Vice Bay skyscraper skyline along the right-side horizon.
  const cityStart = Math.floor(p.pw * 0.56);
  for (let x = cityStart, bIdx = 0; x < p.pw - 1; bIdx++) {
    const bw = 3 + Math.floor(hash(bIdx, 1) * 4);
    const bh = Math.max(2, Math.floor((0.24 + 0.42 * hash(bIdx, 2)) * horizon));
    const top = horizon - bh;
    const crown = bIdx % 2 === 0 ? cyan : pink;
    for (let dx = 0; dx < bw && x + dx < p.pw; dx++) {
      for (let y = top; y < horizon; y++) {
        const win = y > top + 1 && (y - top) % 2 === 0 && dx % 2 === 1 && hash(bIdx * 11 + dx, y) > 0.42;
        p.px(x + dx, y, y === top ? crown : win ? gold : silhouette);
      }
      // Subtle skyline neon reflection rippling in the bay below.
      for (let ry = 1; ry < Math.min(p.ph - horizon, Math.floor(bh * 0.6)); ry++) {
        if ((ry + Math.floor(t * 4) + dx) % 2 === 0) p.px(x + dx, horizon + ry, mix(p.at(x + dx, horizon + ry) ?? silhouette, crown, 0.35 * (1 - ry / Math.max(1, p.ph - horizon))));
      }
    }
    x += bw + 1;
  }
  // Cruising Vice City blimp gliding high across the twilight sky.
  if (p.pw >= 36 && horizon >= 8) {
    const blimpX = Math.round(fract(t * 0.025) * (p.pw + 18)) - 9, blimpY = Math.max(2, Math.floor(horizon * 0.2));
    for (let dx = -4; dx <= 4; dx++) {
      p.px(blimpX + dx, blimpY, Math.abs(dx) === 4 ? pink : c('#241247'));
      if (Math.abs(dx) <= 2) p.px(blimpX + dx, blimpY - 1, c('#381c6b'));
    }
    p.px(blimpX + (Math.floor(t * 6) % 5) - 2, blimpY, cyan);
  }
  // Giant roadside illuminated "GTA VI" neon billboard frame on steel trusses (left/center-left).
  const msg = Math.floor(t / 7) % 2 === 0 ? 'GTA VI' : 'VICE 6';
  const bx0 = Math.max(2, Math.floor(p.pw * 0.06));
  const bwMax = Math.max(12, Math.floor(p.pw * 0.52));
  const scale = bwMax >= 38 && horizon >= 14 ? 1 : 1;
  const wordW = msg.length * 6 - 1;
  const boardW = Math.min(bwMax, wordW + 4), boardH = Math.min(horizon - 2, 11);
  const by0 = Math.max(1, horizon - boardH - Math.max(2, Math.floor(horizon * 0.14)));
  const boardBg = c('#13072b');
  if (boardW >= 10 && boardH >= 5) {
    // Steel support trusses down to the causeway.
    for (let y = by0 + boardH; y < horizon; y++) {
      p.px(bx0 + 2, y, c('#2c2147')); p.px(bx0 + boardW - 3, y, c('#2c2147'));
      if (y % 2 === 0) p.px(bx0 + 3, y, c('#1e1536'));
    }
    // Neon double-bordered billboard panel with chase marquee bulbs along top & bottom edges.
    for (let y = by0; y < by0 + boardH; y++) {
      for (let x = bx0; x < bx0 + boardW; x++) {
        const edge = y === by0 || y === by0 + boardH - 1 || x === bx0 || x === bx0 + boardW - 1;
        const bulb = (y === by0 || y === by0 + boardH - 1) && ((x + Math.floor(t * 6)) % 4 === 0);
        p.px(x, y, bulb ? gold : edge ? (kick(t) > 0.45 ? cyan : pink) : boardBg);
      }
    }
    // Glowing chrome-pink-cyan pixel lettering inside the billboard with sweeping sheen.
    const tx0 = bx0 + Math.max(1, Math.floor((boardW - wordW * scale) / 2));
    const ty0 = by0 + Math.max(1, Math.floor((boardH - 5 * scale) / 2));
    const gleamX = fract(t * 0.35) * (wordW + 10) - 5;
    for (let y = 0; y < 5 * scale; y++) {
      for (let x = 0; x < wordW * scale; x++) {
        if (!lettering(msg, Math.floor(x / scale), Math.floor(y / scale))) continue;
        const gx = tx0 + x, gy = ty0 + y;
        if (gx <= bx0 || gx >= bx0 + boardW - 1 || gy <= by0 || gy >= by0 + boardH - 1) continue;
        const baseLetter = mix(gold, pink, y / Math.max(1, 5 * scale - 1));
        const flash = Math.exp(-((x - gleamX) ** 2) / 6);
        p.px(gx, gy, mix(baseLetter, flash > 0.35 ? '#ffffff' : cyan, clamp(flash * 0.9 + (x > wordW * 0.62 ? 0.35 : 0))));
      }
    }
  }
  // Swaying foreground palm silhouettes framing the left and right edges.
  palmSilhouette(p, Math.max(1, bx0 - 1), horizon + 1, Math.max(5, Math.floor(horizon * 0.72)), 2.5, t, silhouette);
  if (p.pw >= 30) palmSilhouette(p, p.pw - 3, horizon + 1, Math.max(5, Math.floor(horizon * 0.65)), -2.8, t + 1.1, silhouette);
  // Multi-lane Ocean Causeway bridge across the bay with streaking headlights & ruby taillights.
  const bridgeY = Math.min(p.ph - 2, horizon + Math.max(1, Math.floor((p.ph - horizon) * 0.42)));
  for (let x = 0; x < p.pw; x++) {
    p.px(x, bridgeY, c('#1a1033'));
    if (x % 6 === 0) p.px(x, bridgeY - 1, gold);
  }
  for (let car = 0; car < 7; car++) {
    const east = car % 2 === 0;
    const cx = Math.round(fract(hash(car, 9) + t * (east ? 0.16 : -0.14) * (1 + 0.25 * (car % 3))) * p.pw);
    p.px(cx, bridgeY, east ? c('#fff6d0') : c('#ff2442'));
    p.px((cx + (east ? -1 : 1) + p.pw) % p.pw, bridgeY, east ? cyan : pink);
  }
  p.flush();
  if (g.w >= 34 && g.h >= 7) {
    g.write(2, g.h - 1, 'VICE CITY  x  RADIOCLI', pink, c('#0d0622'));
    g.write(g.w - 13, g.h - 1, 'NOW PLAYING', cyan, c('#0d0622'));
  }
  return g.finish();
};

export const viceCollabReceiverBuilders = {
  'vice-radio-wheel': viceRadioWheel,
  'leonida-chase': leonidaChase,
  'vice-billboard': viceBillboard
};

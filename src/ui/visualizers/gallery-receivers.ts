import {panelBackground} from '../theme.js';
import {TAU, braille, clamp, fract, grid, hash, kick, mix, mulberry, pixels, seconds, smooth, stroke, textPixel, tri, type Builder} from './cell-canvas.js';

type Panel = {x: number; y: number; w: number; h: number; tint: number};
/** Split the canvas the way the painter did: unevenly, and stopping early more often than not. */
function composition(width: number, height: number, seed: number): Panel[] {
  const random = mulberry(seed);
  const panels: Panel[] = [];
  const split = (x: number, y: number, w: number, h: number, depth: number): void => {
    const across = w >= 16 && (h < 6 || w > h * 2.2 || random() < 0.45);
    if (depth > 4 || (!across && h < 6) || (depth > 1 && random() < 0.22)) {
      const roll = random();
      panels.push({x, y, w, h, tint: roll < 0.17 ? -0.9 : roll < 0.32 ? 0 : roll < 0.47 ? 0.9 : roll < 0.5 ? 2 : 3});
      return;
    }
    if (across) {
      const cut = Math.round(w * (0.28 + random() * 0.44) / 2) * 2;
      split(x, y, cut, h, depth + 1); split(x + cut, y, w - cut, h, depth + 1);
    } else {
      const cut = Math.max(2, Math.round(h * (0.3 + random() * 0.4)));
      split(x, y, w, cut, depth + 1); split(x, y + cut, w, h - cut, depth + 1);
    }
  };
  split(0, 0, width, height, 0);
  return panels;
}

// Black bars, pale fields and three colours: a new composition is wiped across the old one every few bars.
const mondrian: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const t = seconds(pulse);
  const epoch = Math.floor(t / 9);
  const wipe = Math.round(smooth((t - epoch * 9) / 1.4) * (g.w + 2)) - 2;
  const paper = mix(g.paint.accent, '#f4f1e6', 0.86), bar = '#08090b';
  const beat = Math.floor(t * 2);
  for (const [age, from, to] of [[epoch - 1, Math.max(0, wipe + 2), g.w], [epoch, 0, Math.min(g.w, wipe)]] as const) {
    const panels = composition(g.w, g.h, age * 7919 + g.w * 31 + g.h);
    const coloured = panels.filter(panel => panel.tint < 2);
    const struck = coloured[beat % Math.max(1, coloured.length)];
    for (const panel of panels) {
      const base = panel.tint === 3 ? paper : panel.tint === 2 ? bar : g.paint.fan(panel.tint);
      const fill = panel === struck ? mix(base, '#ffffff', 0.3 * kick(t)) : base;
      for (let y = panel.y; y < panel.y + panel.h; y++) {
        for (let x = Math.max(from, panel.x); x < Math.min(to, panel.x + panel.w); x++) {
          // Bars are two columns or one row: the same weight in either direction.
          const edge = (x >= panel.x + panel.w - 2 && panel.x + panel.w < g.w) || (y === panel.y + panel.h - 1 && panel.y + panel.h < g.h);
          g.set(x, y, ' ', bar, edge ? bar : fill);
        }
      }
    }
  }
  for (let y = 0; y < g.h; y++) for (let x = Math.max(0, wipe); x < Math.min(g.w, wipe + 2); x++) g.set(x, y, ' ', bar, bar);
  return g.finish();
};


// Circles, triangles and rules set against each other, each on its own slow orbit.
const kandinsky: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const unit = p.ph / 2, cx = p.pw / 2, cy = p.ph / 2, reach = p.pw / p.ph;
  const ground = mix(panelBackground, g.paint.accent, 0.07);
  for (let y = 0; y < p.ph; y++) for (let x = 0; x < p.pw; x++) p.px(x, y, ground);
  const at = (u: number, v: number): [number, number] => [cx + u * unit, cy + v * unit];
  const disc = (u: number, v: number, radius: number, color: string, ring = 0): void => {
    const [x0, y0] = at(u, v), r = radius * unit;
    for (let y = Math.floor(y0 - r); y <= y0 + r; y++) {
      for (let x = Math.floor(x0 - r); x <= x0 + r; x++) {
        const d = Math.hypot(x + 0.5 - x0, y + 0.5 - y0);
        if (d <= r && d >= r * ring) p.px(x, y, color);
      }
    }
  };
  const rule = (u0: number, v0: number, u1: number, v1: number, weight: number, color: string): void => {
    const [x0, y0] = at(u0, v0), [x1, y1] = at(u1, v1);
    stroke(p, x0, y0, x1, y1, weight, color);
  };
  const beat = kick(t);
  // The great circle and its halo.
  const sunU = -reach * 0.52 + Math.sin(t * 0.11) * 0.1, sunV = -0.2 + Math.cos(t * 0.13) * 0.08;
  disc(sunU, sunV, 0.74 + 0.03 * beat, g.paint.ink(0.18));
  disc(sunU, sunV, 0.56, mix('#07080b', g.paint.accent, 0.04));
  disc(sunU, sunV, 0.4 + 0.03 * beat, g.paint.ink(0.68));
  // A chequered band, drifting.
  const bandU = reach * 0.3 + Math.sin(t * 0.17) * 0.25, bandV = 0.55;
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) {
    const [x0, y0] = at(bandU + i * 0.13, bandV + j * 0.13 - i * 0.03);
    for (let y = 0; y < Math.max(1, unit * 0.13); y++) for (let x = 0; x < Math.max(1, unit * 0.13); x++) p.px(Math.floor(x0 + x), Math.floor(y0 + y), g.paint.ink(0.92));
  }
  // Long rules crossing the whole sheet, and a comb of short ones.
  rule(-reach, 0.7 + Math.sin(t * 0.09) * 0.1, reach, -0.55 + Math.sin(t * 0.09) * 0.1, 0.3, g.paint.ink(0.85));
  rule(-reach * 0.2, -1, reach * 0.55 + Math.sin(t * 0.07) * 0.2, 1, 0.3, g.paint.ink(0.52));
  rule(reach * 0.1, 1, reach * 0.9, -0.2 + Math.cos(t * 0.1) * 0.15, 0.6, g.paint.ink(0.71));
  for (let i = 0; i < 5; i++) rule(-reach * 0.1 + i * 0.09, 0.45 + i * 0.03, -reach * 0.1 + i * 0.09 + 0.16, 0.86 + i * 0.03, 0.3, g.paint.ink(0.7));
  // A triangle turning about its centre.
  const turn = t * 0.22;
  const corners = [0, 1, 2].map(i => [reach * 0.42 + Math.cos(turn + i * TAU / 3) * 0.62, -0.18 + Math.sin(turn + i * TAU / 3) * 0.62] as const);
  corners.forEach((corner, i) => rule(corner[0], corner[1], corners[(i + 1) % 3]![0], corners[(i + 1) % 3]![1], 0.7, g.paint.ink(0.98)));
  // Satellites.
  for (let i = 0; i < 6; i++) {
    const orbit = t * (0.12 + 0.05 * hash(i, 1)) * (i % 2 ? -1 : 1) + hash(i, 2) * TAU;
    disc(reach * (hash(i, 3) * 1.5 - 0.6) + Math.cos(orbit) * 0.2, (hash(i, 4) - 0.5) * 1.5 + Math.sin(orbit) * 0.18,
      0.07 + 0.11 * hash(i, 5) + (i === Math.floor(t * 2) % 6 ? 0.04 * beat : 0), g.paint.ink(0.42 + 0.46 * hash(i, 6)), i % 3 === 0 ? 0.55 : 0);
  }
  p.flush();
  return g.finish();
};

const SHOUTS = ['POW!', 'ZAP!', 'BOOM', 'WHAM', 'BAM!', 'ZOOM'];

// A comic panel: Ben-Day dots, a jagged burst that jumps on the beat, and a new shout every two bars.
const lichtenstein: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const cx = p.pw / 2, cy = p.ph / 2;
  const dot = g.paint.fan(-0.85);
  for (let y = 0; y < g.h; y++) {
    for (let x = y % 2 * 2; x < g.w; x += 4) {
      const far = Math.hypot((x - g.w / 2) / g.w, (y - g.h / 2) / g.h * 0.6);
      g.set(x, y, far > 0.42 ? '●' : far > 0.3 ? '•' : '·', mix(panelBackground, dot, 0.55 + 0.45 * tri(far * 3 - t * 0.25)), undefined, true);
    }
  }
  const word = SHOUTS[Math.floor(t / 2) % SHOUTS.length]!;
  const scale = p.pw >= 60 && p.ph >= 20 ? 2 : 1;
  const wide = (word.length * 6 - 1) * scale;
  const punch = 1 + 0.16 * kick(t) + 0.25 * Math.max(0, 1 - fract(t / 2) * 6);
  const rx = Math.min(p.pw * 0.36, wide * 0.72) * punch, ry = Math.min(p.ph * 0.5, Math.max(4, 5.4 * scale)) * punch;
  const ink = '#08090b', burst = g.paint.fan(0.92), shout = g.paint.fan(-0.95);
  for (let y = 0; y < p.ph; y++) {
    for (let x = 0; x < p.pw; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const angle = Math.atan2(dy, dx) + Math.sin(t * 0.3) * 0.1;
      const spike = 0.7 + 0.3 * tri(angle / TAU * 11) ** 0.8;
      const r = Math.hypot(dx, dy) / spike;
      if (r < 1) p.px(x, y, r > 1 - 1.4 / Math.min(rx, ry) ? ink : burst);
      else if (r < 1.5 && r > 1.12 && tri(angle / TAU * 22 + 0.25) > 0.86) p.px(x, y, g.paint.ink(0.9));
    }
  }
  const left = Math.round(cx - wide / 2), top = Math.round(cy - 2.5 * scale);
  for (const pass of [1, 0]) {
    for (let y = 0; y < 5 * scale; y++) for (let x = 0; x < wide; x++) {
      if (textPixel(word, Math.floor(x / scale), Math.floor(y / scale))) p.px(left + x + pass, top + y + pass, pass ? ink : shout);
    }
  }
  p.flush();
  return g.finish();
};

// Radiant figures dancing in a row: flat colour, a bold outline, and action marks on every beat.
const haring: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const size = p.ph / 30;
  const dancers = Math.max(1, Math.floor(p.pw / (22 * size + 4)));
  const outline = g.paint.ink(1);
  const floor = p.ph - 1;
  for (let x = 0; x < p.pw; x++) p.px(x, floor, g.paint.ink(0.45));
  for (let dancer = 0; dancer < dancers; dancer++) {
    const swing = t * Math.PI * 2 + dancer * 1.3;
    const move = dancer % 3;
    const hop = -Math.abs(Math.sin(swing / 2 + dancer)) * 2.2 * size;
    const ox = (dancer + 0.5) * p.pw / dancers + Math.sin(swing / 2) * 1.5 * size, oy = floor - 13.5 * size + hop;
    const fill = g.paint.fan(tri(dancer * 0.37 + 0.1) * 2 - 1);
    const joint = (x: number, y: number, angle: number, length: number): [number, number] => [x + Math.sin(angle) * length * size, y + Math.cos(angle) * length * size];
    const hip: [number, number] = [ox + Math.sin(swing) * 1.2 * size, oy + 3 * size], neck: [number, number] = [ox, oy - 5 * size];
    const limbs: [number, number, number, number][] = [[neck[0], neck[1], hip[0], hip[1]]];
    // Arms hang from the neck, legs from the hip; each has two segments and its own phase.
    for (const side of [-1, 1]) {
      const raise = move === 0 ? 2.2 + 0.5 * Math.sin(swing + side) : move === 1 ? 1.3 + side * 0.9 * Math.sin(swing) : 1.6 + 0.9 * Math.sin(swing * 0.5 + side * 1.4);
      const elbow = joint(neck[0], neck[1] + size, side * raise, 4.6);
      const hand = joint(elbow[0], elbow[1], side * (raise + 0.6 + 0.7 * Math.sin(swing + side * 2)), 4.2);
      limbs.push([neck[0], neck[1] + size, elbow[0], elbow[1]], [elbow[0], elbow[1], hand[0], hand[1]]);
      const stride = move === 1 ? side * 0.75 * Math.sin(swing) : side * (0.62 + 0.2 * Math.sin(swing + side));
      const knee = joint(hip[0], hip[1], stride, 5);
      const foot = joint(knee[0], knee[1], stride * 0.3 - side * 0.25 * Math.max(0, Math.sin(swing + side)), 5.2);
      limbs.push([hip[0], hip[1], knee[0], knee[1]], [knee[0], knee[1], Math.min(Math.max(foot[0], 0), p.pw - 1), Math.min(foot[1], floor - 1)]);
    }
    const head: [number, number] = [neck[0] + Math.sin(swing) * 0.6 * size, neck[1] - 3.2 * size];
    for (const [weight, color] of [[0.9 * size + 0.95, outline], [0.9 * size, fill]] as const) {
      for (const [x0, y0, x1, y1] of limbs) stroke(p, x0, y0, x1, y1, weight, color);
      stroke(p, head[0], head[1], head[0], head[1], weight + 1.5 * size, color);
    }
    // Action marks: short rays off the head, loudest on the beat.
    if (kick(t + dancer * 0.07) > 0.25) {
      for (let ray = -2; ray <= 2; ray++) {
        const a = ray * 0.5;
        stroke(p, head[0] + Math.sin(a) * 5.2 * size, head[1] - Math.cos(a) * 5.2 * size, head[0] + Math.sin(a) * 7.4 * size, head[1] - Math.cos(a) * 7.4 * size, 0.3, outline);
      }
    }
  }
  p.flush();
  return g.finish();
};

// A golden tree whose every branch ends in a spiral, hung with small ornaments, unfurling and then starting again.
const klimt: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const epoch = Math.floor(t / 26), local = t - epoch * 26;
  const grown = smooth(local / 13) * smooth((26 - local) / 2.5);
  const gold = g.paint.accent;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (hash(x, y + 3) > 0.94) g.set(x, y, '·', g.paint.ink(0.14 + 0.2 * tri(t * 0.2 + hash(x, y))));
  const reach = Math.min(b.dw * 0.5, b.dh * 2.6);
  const limit = (b.dh * 0.4 + reach * 2.1) * grown;
  const gems: [number, number, number][] = [];
  const random = mulberry(epoch * 4099 + b.dw);
  const branch = (x: number, y: number, heading: number, curl: number, length: number, travelled: number, depth: number): void => {
    const buds = depth < 2 ? 3 + depth : 0;
    for (let s = 0; s < length; s += 0.6) {
      if (travelled + s > limit) return;
      // A clothoid: the further along, the tighter the turn, so every limb winds itself into a spiral.
      heading += curl * 60 * (s / length) ** 3 / length * 0.6;
      x += Math.cos(heading) * 0.6; y += Math.sin(heading) * 0.6;
      b.dot(x, y, depth ? mix(panelBackground, gold, 0.9 - depth * 0.14) : mix(gold, '#ffffff', 0.25));
      if (depth === 0) b.dot(x, y + 1, gold);
      const mark = Math.floor(s / 0.6);
      if (buds && mark > 0 && mark % Math.floor(length / 0.6 / (buds + 1)) === 0 && s < length * 0.72) {
        branch(x, y, heading - curl * (0.9 + random() * 0.5), -curl, length * (0.5 - depth * 0.08), travelled + s, depth + 1);
      } else if (mark % 9 === 4) gems.push([x, y, travelled + s]);
    }
  };
  const rootX = b.dw / 2, rootY = b.dh - 1;
  for (let s = 0; s < b.dh * 0.4 && s <= limit; s += 0.6) for (const thick of [-1, 0, 1]) b.dot(rootX + thick, rootY - s, gold);
  for (const side of [-1, 1]) branch(rootX, rootY - b.dh * 0.4, -Math.PI / 2 + side * 1.25, -side, reach, b.dh * 0.4, 0);
  b.flush();
  gems.forEach(([x, y, born], index) => {
    if (hash(index, 7) < 0.45 || born > limit - 6) return;
    const kind = Math.floor(hash(index, 8) * 5);
    g.set(Math.floor(x / 2), Math.floor(y / 4), '◆●▪◉▲'[kind]!, mix(g.paint.fan(kind / 2 - 1), '#ffffff', 0.35 * tri(t * 0.5 + hash(index, 9))), undefined, true);
  });
  return g.finish();
};

// Rows of squares that hold their grid at one end and fall into rubble at the other; the calm end wanders.
const schotter: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const b = braille(g);
  const t = seconds(pulse);
  const rows = Math.max(1, Math.round(b.dh / 11));
  const side = b.dh / rows;
  const columns = Math.max(1, Math.floor(b.dw / side));
  const left = (b.dw - columns * side) / 2;
  const calm = 0.5 + 0.5 * Math.sin(t * 0.13);
  for (let column = 0; column < columns; column++) {
    const unrest = clamp(Math.abs(column / Math.max(1, columns - 1) - calm) * 1.5) ** 1.6;
    for (let row = 0; row < rows; row++) {
      const id = column * 31 + row;
      const sway = (seed: number): number => Math.sin(t * (0.5 + hash(id, seed)) + hash(id, seed + 1) * TAU) * (0.75 + 0.25 * kick(t));
      const angle = sway(1) * unrest * 0.9;
      const cx = left + (column + 0.5) * side + sway(3) * unrest * side * 0.45, cy = (row + 0.5) * side + sway(5) * unrest * side * 0.45;
      const half = side * 0.43;
      const color = mix(g.paint.ink(0.5), g.paint.fan(0.8), unrest);
      const corner = (i: number): [number, number] => {
        const a = angle + Math.PI / 4 + i * Math.PI / 2;
        return [cx + Math.cos(a) * half * Math.SQRT2, cy + Math.sin(a) * half * Math.SQRT2];
      };
      for (let i = 0; i < 4; i++) { const [x0, y0] = corner(i), [x1, y1] = corner(i + 1); b.line(x0, y0, x1, y1, color); }
    }
  }
  b.flush();
  return g.finish();
};

// Star-and-cross tilework. Each star turns against its neighbours like a gear, and a slow wave of light crosses the wall.
const zellige: Builder = (pulse, width, height, theme) => {
  const g = grid(width, height, theme);
  const p = pixels(g);
  const t = seconds(pulse);
  const tile = Math.max(6, p.ph / Math.max(1, Math.round(p.ph / 14)));
  const strap = g.paint.ink(0.95), ground = mix(panelBackground, g.paint.fan(-0.9), 0.3);
  const turn = smooth(fract(t / 4) * 2.2) * Math.PI / 4;
  for (let y = 0; y < p.ph; y++) {
    for (let x = 0; x < p.pw; x++) {
      const tx = Math.floor((x + 0.5 - p.pw / 2) / tile), ty = Math.floor((y + 0.5) / tile);
      const lx = ((x + 0.5 - p.pw / 2) / tile - tx) * 2 - 1, ly = ((y + 0.5) / tile - ty) * 2 - 1;
      const spin = ((tx + ty) & 1 ? -1 : 1) * turn;
      const rx = Math.abs(lx * Math.cos(spin) - ly * Math.sin(spin)), ry = Math.abs(lx * Math.sin(spin) + ly * Math.cos(spin));
      // An eight-pointed star is a square laid over the same square turned an eighth.
      const star = Math.min(Math.max(rx, ry), (rx + ry) / Math.SQRT2);
      const wave = 0.5 + 0.5 * Math.sin((tx * 0.9 + ty * 0.6) - t * 0.8);
      const line = 1.5 / tile;
      if (Math.abs(star - 0.62) < line || Math.abs(star - 0.3) < line * 0.7) p.px(x, y, strap);
      else if (star < 0.3) p.px(x, y, mix(ground, g.paint.fan(0.9), 0.5 + 0.5 * wave));
      else if (star < 0.62) p.px(x, y, mix(ground, g.paint.fan(-0.6 + ((tx + ty) & 1) * 0.5), 0.45 + 0.5 * wave));
      else {
        // What is left between four stars is the cross; give it a diamond at its heart.
        const cross = Math.abs(Math.abs(lx) - 1) + Math.abs(Math.abs(ly) - 1);
        p.px(x, y, cross < 0.26 ? mix(ground, g.paint.accent, 0.55 + 0.45 * (1 - wave)) : Math.abs(cross - 0.26) < line * 1.4 ? strap : ground);
      }
    }
  }
  p.flush();
  return g.finish();
};

export const galleryReceiverBuilders = {
  mondrian,
  kandinsky,
  lichtenstein,
  haring,
  klimt,
  schotter,
  zellige
};

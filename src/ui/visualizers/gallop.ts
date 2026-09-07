import type {ThemeName} from '../../types.js';
import {themeAccent} from '../theme.js';
import {horseStrideFrames, horseStrideHeight, horseStrideWidth} from './horse-stride.js';

const frames = horseStrideFrames.map(frame => Buffer.from(frame, 'base64'));
const brailleBits = [[1, 8], [2, 16], [4, 32], [64, 128]] as const;

/** One pose per receiver tick. The same scale and torso anchor are used for every pose. */
export function buildGallop(pulse: number, width: number, height: number, theme: ThemeName) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const color = themeAccent(theme);
  const frameIndex = ((Math.floor(pulse) % frames.length) + frames.length) % frames.length;
  const frame = frames[frameIndex]!;
  const usableW = w > 8 ? w - 4 : w;
  const usableH = h > 4 ? h - 2 : h;
  const scale = Math.min(usableW * 2 / horseStrideWidth, usableH * 4 / horseStrideHeight);
  const dotsW = Math.max(1, Math.floor(horseStrideWidth * scale));
  const dotsH = Math.max(1, Math.floor(horseStrideHeight * scale));
  const left = Math.floor((w - Math.ceil(dotsW / 2)) / 2) * 2;
  const top = Math.floor((h - Math.ceil(dotsH / 4)) / 2) * 4;
  const masks = new Uint8Array(w * h);

  for (let y = 0; y < dotsH; y++) {
    const sy0 = Math.floor(y * horseStrideHeight / dotsH);
    const sy1 = Math.ceil((y + 1) * horseStrideHeight / dotsH);
    for (let x = 0; x < dotsW; x++) {
      const sx0 = Math.floor(x * horseStrideWidth / dotsW);
      const sx1 = Math.ceil((x + 1) * horseStrideWidth / dotsW);
      let ink = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const bit = sy * horseStrideWidth + sx;
        ink += (frame[bit >> 3]! >> (bit & 7)) & 1;
      }
      // Area coverage keeps thin legs continuous as the terminal becomes smaller.
      if (ink / ((sx1 - sx0) * (sy1 - sy0)) < 0.22) continue;
      const dx = left + x;
      const dy = top + y;
      const index = Math.floor(dy / 4) * w + Math.floor(dx / 2);
      masks[index]! |= brailleBits[dy % 4]![dx % 2]!;
    }
  }

  return Array.from({length: h}, (_, y) => {
    let text = '';
    for (let x = 0; x < w; x++) {
      const mask = masks[y * w + x]!;
      text += mask === 0 ? ' ' : String.fromCharCode(0x2800 + mask);
    }
    // No background color: only the horse's ink is drawn over the receiver panel.
    return {text, color, segments: [{text, color}]};
  });
}

/** Lightly pare back thick stroke edges, keeping endpoints and junctions intact. */
export function buildGallopFine(pulse: number, width: number, height: number, theme: ThemeName) {
  return thinGallopStrokes(buildGallop(pulse, width, height, theme), 0.14);
}

function thinGallopStrokes(original: ReturnType<typeof buildGallop>, reduction: number) {
  const w = original[0]!.text.length;
  const h = original.length;
  const dw = w * 2;
  const dh = h * 4;
  const dots = new Uint8Array(dw * dh);
  let inkCount = 0;
  original.forEach((row, y) => {
    [...row.text].forEach((glyph, x) => {
      const mask = glyph === ' ' ? 0 : glyph.charCodeAt(0) - 0x2800;
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 2; xx++) {
        if (mask & brailleBits[yy]![xx]!) {
          dots[(y * 4 + yy) * dw + x * 2 + xx] = 1;
          inkCount++;
        }
      }
    });
  });
  const neighbors = [-dw, -dw + 1, 1, dw + 1, dw, dw - 1, -1, -dw - 1];
  const canThin = (index: number): boolean => {
    if (!dots[index]) return false;
    const ring = neighbors.map(offset => dots[index + offset]!);
    const count = ring.reduce((total, dot) => total + dot, 0);
    // Already-fine lines and endpoints stay untouched. A single connected arc of
    // neighbors ensures removing this edge dot cannot split a leg or contour.
    if (count < 3 || count > 6) return false;
    let transitions = 0;
    for (let i = 0; i < 8; i++) if (!ring[i] && ring[(i + 1) % 8]) transitions++;
    return transitions === 1;
  };
  const candidates: number[] = [];
  for (let y = 1; y < dh - 1; y++) for (let x = 1; x < dw - 1; x++) {
    const index = y * dw + x;
    if (canThin(index)) candidates.push(index);
  }
  const budget = Math.min(candidates.length, Math.floor(inkCount * reduction));
  for (let i = 0; i < budget; i++) {
    // Spread the small reduction over the entire horse instead of thinning its
    // head first. Recheck after each removal to preserve connected strokes.
    const index = candidates[Math.floor(i * candidates.length / budget)]!;
    if (canThin(index)) dots[index] = 0;
  }
  return original.map((row, y) => {
    let text = '';
    for (let x = 0; x < w; x++) {
      let mask = 0;
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 2; xx++) {
        if (dots[(y * 4 + yy) * dw + x * 2 + xx]) mask |= brailleBits[yy]![xx]!;
      }
      text += mask ? String.fromCharCode(0x2800 + mask) : ' ';
    }
    return {text, color: row.color, segments: [{text, color: row.color}]};
  });
}

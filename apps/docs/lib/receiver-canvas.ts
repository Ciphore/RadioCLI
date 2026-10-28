import {buildVisualizer, type ReceiverStyle, type ThemeName} from './receiver-engine';
import type {PlaybackState} from '../../../src/types';

// Draw a full-size terminal before scaling to the preview. No outer padding.
export const columns = 120;
export const rows = 30;
const cellWidth = 10;
const cellHeight = 20;
const playback = {state: 'playing', ready: true} as PlaybackState;
let surface: HTMLCanvasElement | undefined;
const brailleBits = [[1, 8], [2, 16], [4, 32], [64, 128]];
const triangles: Record<string, readonly (readonly [number, number])[]> = {
  '◢': [[1, 0], [1, 1], [0, 1]], '◣': [[0, 0], [0, 1], [1, 1]],
  '◤': [[0, 0], [1, 0], [0, 1]], '◥': [[0, 0], [1, 0], [1, 1]],
};
const quadrants: Record<string, number> = {
  '▘': 1, '▝': 2, '▖': 4, '▗': 8, '▌': 5, '▐': 10, '▀': 3, '▄': 12,
  '▚': 9, '▞': 6, '▛': 7, '▜': 11, '▙': 13, '▟': 14, '█': 15,
};

export function drawReceiver(canvas: HTMLCanvasElement, style: ReceiverStyle, pulse: number, theme: ThemeName) {
  surface ??= document.createElement('canvas');
  if (surface.width !== columns * cellWidth) {
    surface.width = columns * cellWidth;
    surface.height = rows * cellHeight;
  }
  const context = surface.getContext('2d', {alpha: false})!;
  context.fillStyle = '#070a0f';
  context.fillRect(0, 0, surface.width, surface.height);
  context.textBaseline = 'alphabetic';
  const frame = buildVisualizer(style, pulse, columns, rows, null, playback, theme);
  frame.forEach((row, y) => {
    let x = 0;
    for (const segment of row.segments ?? [{text: row.text, color: row.color}]) {
      context.font = `${'bold' in segment && segment.bold ? 'bold ' : ''}17px monospace`;
      for (const glyph of segment.text) {
        const left = x++ * cellWidth;
        const top = y * cellHeight;
        if ('backgroundColor' in segment && segment.backgroundColor) {
          context.fillStyle = segment.backgroundColor;
          context.fillRect(left, top, cellWidth, cellHeight);
        }
        if (glyph === ' ') continue;
        context.fillStyle = segment.color;
        const code = glyph.codePointAt(0)!;
        if (code >= 0x2800 && code <= 0x28ff) {
          // A fixed terminal dot grid avoids font fallback changing braille
          // widths and distorting the horse, circles, and continuous curves.
          const mask = code - 0x2800;
          context.beginPath();
          for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
            if (mask & brailleBits[dy][dx]) {
              context.moveTo(left + 2.5 + dx * 5 + 1.6, top + 2.5 + dy * 5);
              context.arc(left + 2.5 + dx * 5, top + 2.5 + dy * 5, 1.6, 0, Math.PI * 2);
            }
          }
          context.fill();
        } else if (style === 'sumi-ocean' && glyph === '●') {
          context.beginPath();
          context.arc(left + cellWidth / 2, top + cellHeight / 2, cellWidth / 2, 0, Math.PI * 2);
          context.fill();
        } else if (glyph in triangles) {
          context.beginPath();
          triangles[glyph].forEach(([dx, dy], index) => {
            if (index === 0) context.moveTo(left + dx * cellWidth, top + dy * cellHeight);
            else context.lineTo(left + dx * cellWidth, top + dy * cellHeight);
          });
          context.fill();
        } else if (glyph in quadrants) {
          const mask = quadrants[glyph];
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            if (mask & (1 << (dy * 2 + dx))) context.fillRect(left + dx * 5, top + dy * 10, 5, 10);
          }
        } else if (code >= 0x2581 && code <= 0x2587) {
          const fill = (code - 0x2580) / 8 * cellHeight;
          context.fillRect(left, top + cellHeight - fill, cellWidth, fill);
        } else if (code >= 0x2589 && code <= 0x258f) {
          context.fillRect(left, top, (0x2590 - code) / 8 * cellWidth, cellHeight);
        } else if (glyph === '░' || glyph === '▒' || glyph === '▓') {
          const level = code - 0x2590;
          for (let dy = 0; dy < cellHeight; dy += 2) for (let dx = 0; dx < cellWidth; dx += 2) {
            if ((dx / 2 + dy / 2 * 3) % 4 < level) context.fillRect(left + dx, top + dy, 2, 2);
          }
        } else {
          context.fillText(glyph, left, top + 16, cellWidth);
        }
      }
    }
  });
  // The compositor's CSS scaling aliases a dense braille grid. Downsample
  // explicitly into a display-sized canvas so thin contours retain coverage.
  const displayWidth = Math.max(2, Math.round(canvas.getBoundingClientRect().width * Math.min(window.devicePixelRatio, 2)));
  if (canvas.width !== displayWidth) {
    canvas.width = displayWidth;
    canvas.height = Math.round(displayWidth / 2);
  }
  const display = canvas.getContext('2d', {alpha: false})!;
  display.imageSmoothingEnabled = true;
  display.imageSmoothingQuality = 'high';
  display.drawImage(surface, 0, 0, canvas.width, canvas.height);
  canvas.dataset.frame = String(pulse);
  canvas.dataset.theme = theme;
}

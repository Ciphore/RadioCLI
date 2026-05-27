import {describe, expect, it} from 'vitest';
import {receiverStyleNames, type PlaybackState, type Station} from '../../types.js';
import {buildVisualizer, visualizerHeight} from './receiver-visualizers.js';

const station: Station = {
  id: 'station-1',
  provider: 'radio-browser',
  name: 'KEXP 90.3 FM',
  country: 'United States',
  tags: ['alternative', 'indie']
};

const playback: PlaybackState = {
  state: 'playing',
  backend: 'mpv',
  message: 'playing',
  volume: 70,
  muted: false,
  ready: true
};

const inactivePlaybacks: PlaybackState[] = [
  {...playback, state: 'idle', backend: 'none', message: 'idle', ready: false},
  {...playback, state: 'paused', message: 'paused'},
  {...playback, state: 'stopped', message: 'stopped', ready: false},
  {...playback, state: 'loading', message: 'loading', ready: false},
  {...playback, state: 'error', message: 'error', ready: false}
];

function frameText(rows: ReturnType<typeof buildVisualizer>): string {
  return rows.map(row => row.text).join('\n');
}

function glyphFootprint(rows: ReturnType<typeof buildVisualizer>, pattern: RegExp): {width: number; minY: number; maxY: number} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  rows.forEach((row, y) => {
    for (let x = 0; x < row.text.length; x += 1) {
      if (!pattern.test(row.text[x]!)) {
        continue;
      }

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  });

  return {
    width: Number.isFinite(minX) ? maxX - minX + 1 : 0,
    minY: Number.isFinite(minY) ? minY : -1,
    maxY: Number.isFinite(maxY) ? maxY : -1
  };
}

describe('receiver visualizers', () => {
  it('renders every receiver style inside the requested width', () => {
    for (const style of receiverStyleNames) {
      const height = visualizerHeight(style, 12);
      const rows = buildVisualizer(style, 4, 64, height, station, playback, 'green');

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(height);
      for (const row of rows) {
        expect(row.text.length).toBeLessThanOrEqual(64);
      }
    }
  });

  it('animates the ascii cube receiver style', () => {
    const firstFrame = buildVisualizer('cube', 1, 64, 12, station, playback, 'green')
      .map(row => row.text)
      .join('\n');
    const nextFrame = buildVisualizer('cube', 10, 64, 12, station, playback, 'green')
      .map(row => row.text)
      .join('\n');

    expect(firstFrame).toMatch(/[#@*+=;:%]/);
    expect(nextFrame).not.toBe(firstFrame);
  });

  it('keeps the ascii cube centered inside the receiver viewport', () => {
    for (const pulse of [1, 10, 22]) {
      const rows = buildVisualizer('cube', pulse, 120, 12, station, playback, 'ruby');
      const footprint = glyphFootprint(rows, /[#@*%=;:]/);

      expect(footprint.width).toBeGreaterThan(0);
      expect(footprint.width).toBeLessThanOrEqual(58);
      expect(footprint.minY).toBeGreaterThan(0);
      expect(footprint.maxY).toBeLessThan(rows.length - 1);
    }
  });

  it('renders audioMotion-inspired styles with segmented color data', () => {
    const motionStyles = ['motion-bars', 'motion-blob', 'motion-area', 'motion-dots', 'motion-contour', 'motion-braid'] as const;

    for (const style of motionStyles) {
      const rows = buildVisualizer(style, 8, 64, visualizerHeight(style, 12), station, playback, 'ruby');
      expect(rows.some(row => row.segments && row.segments.length > 1)).toBe(true);
    }
  });

  it('holds every receiver style at a zero-signal frame when playback is inactive', () => {
    for (const style of receiverStyleNames) {
      const height = visualizerHeight(style, 12);
      for (const inactivePlayback of inactivePlaybacks) {
        const firstFrame = buildVisualizer(style, 1, 64, height, station, inactivePlayback, 'ruby');
        const laterFrame = buildVisualizer(style, 24, 64, height, station, inactivePlayback, 'ruby');

        expect(frameText(laterFrame)).toBe(frameText(firstFrame));
        expect(firstFrame.length).toBeGreaterThan(0);
        expect(firstFrame.length).toBeLessThanOrEqual(height);
        for (const row of firstFrame) {
          expect(row.text.length).toBeLessThanOrEqual(64);
        }
      }
    }
  });

  it('renders inactive neon as a flat zero-level baseline', () => {
    const rows = buildVisualizer('neon', 8, 32, 6, station, inactivePlaybacks[0]!, 'ruby');

    expect(rows).toHaveLength(6);
    expect(rows.slice(0, -1).every(row => row.text.trim() === '')).toBe(true);
    expect(rows.at(-1)?.text).toBe('▁'.repeat(32));
    expect(frameText(rows)).not.toMatch(/[▃▅▆▇█]/);
  });
});

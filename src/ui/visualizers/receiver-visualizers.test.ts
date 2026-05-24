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

  it('renders audioMotion-inspired styles with segmented color data', () => {
    const motionStyles = ['motion-bars', 'motion-blob', 'motion-area', 'motion-dots', 'motion-contour', 'motion-braid'] as const;

    for (const style of motionStyles) {
      const rows = buildVisualizer(style, 8, 64, visualizerHeight(style, 12), station, playback, 'ruby');
      expect(rows.some(row => row.segments && row.segments.length > 1)).toBe(true);
    }
  });
});

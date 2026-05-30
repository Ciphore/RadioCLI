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

const cubeGlyph = /[.:;=+*#%@/\\|_\-]/;
const asciiAnimationStyles = ['fire', 'fireworks', 'plasma', 'spinning-donut', 'starfield'] as const;
const newlyResponsiveStyles = [
  'equalizer',
  'motion-blob',
  'motion-area',
  'motion-contour',
  'leds',
  'matrix',
  'hologram',
  'cube',
  'fire',
  'fireworks',
  'plasma',
  'spinning-donut',
  'starfield'
] as const;
const retiredExternalStylePrefix = `${'term'}${'flix'}-`;
const removedReceiverStyles = [
  'spectrum',
  'oscilloscope',
  'motion-bars',
  'motion-dots',
  'motion-braid',
  'radar',
  'blocks',
  'vu-meters',
  'spirograph',
  'dejong',
  'truchet',
  'tuning-dial',
  'prism',
  `${retiredExternalStylePrefix}plasma`,
  `${retiredExternalStylePrefix}fire`,
  `${retiredExternalStylePrefix}matrix`,
  `${retiredExternalStylePrefix}starfield`,
  `${retiredExternalStylePrefix}waterfall`,
  `${retiredExternalStylePrefix}radar`,
  'pendulum',
  'lightning',
  'smoke',
  'garden',
  'pulse',
  'sandstorm',
  'crystallize',
  'dragon',
  'sierpinski',
  'maze',
  'sort',
  'tetris',
  'snake',
  'invaders',
  'pong',
  'flappy-bird',
  'waterfall',
  'cassette',
  'stars',
  'radio-waves',
  'raindrops',
  'vinyl',
  'soundwave',
  'spectrum-3d',
  'rf-constellation',
  'sphere',
  'mobius',
  's-meter',
  'dna',
  'jellyfish'
] as const;

function glyphFootprint(rows: ReturnType<typeof buildVisualizer>, pattern: RegExp): {width: number; height: number; minY: number; maxY: number} {
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
    height: Number.isFinite(minY) ? maxY - minY + 1 : 0,
    minY: Number.isFinite(minY) ? minY : -1,
    maxY: Number.isFinite(maxY) ? maxY : -1
  };
}

describe('receiver visualizers', () => {
  it('excludes retired receiver styles from the UI cycle', () => {
    const styles = new Set<string>(receiverStyleNames);

    for (const style of removedReceiverStyles) {
      expect(styles.has(style)).toBe(false);
    }
  });

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

  it('lets spacious receiver styles grow in tall panels without exceeding a landscape-safe height', () => {
    const compactMeshHeight = visualizerHeight('mesh', 12, 114);
    const tallMeshHeight = visualizerHeight('mesh', 42, 114);

    expect(compactMeshHeight).toBe(12);
    expect(tallMeshHeight).toBeGreaterThan(compactMeshHeight);
    expect(tallMeshHeight).toBeLessThanOrEqual(Math.floor(114 / 3));
  });

  it('lets the core receiver styles grow in tall panels', () => {
    for (const style of newlyResponsiveStyles) {
      const compactHeight = visualizerHeight(style, 12, 114);
      const tallHeight = visualizerHeight(style, 42, 114);
      const tallRows = buildVisualizer(style, 8, 114, tallHeight, station, playback, 'ruby');

      expect(compactHeight).toBe(12);
      expect(tallHeight).toBeGreaterThan(compactHeight);
      expect(tallHeight).toBeLessThanOrEqual(Math.floor(114 / 3));
      expect(tallRows.length).toBe(tallHeight);
    }
  });

  it('adds more mesh geometry instead of only spacing rows apart in tall panels', () => {
    const compactRows = frameText(buildVisualizer('mesh', 8, 114, visualizerHeight('mesh', 12, 114), station, playback, 'ruby'));
    const tallRows = frameText(buildVisualizer('mesh', 8, 114, visualizerHeight('mesh', 42, 114), station, playback, 'ruby'));

    expect(tallRows.split('\n').length).toBeGreaterThan(compactRows.split('\n').length);
    expect((tallRows.match(/[─╱╲]/g) ?? []).length).toBeGreaterThan((compactRows.match(/[─╱╲]/g) ?? []).length);
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
      const footprint = glyphFootprint(rows, cubeGlyph);

      expect(footprint.width).toBeGreaterThan(0);
      expect(footprint.width).toBeGreaterThanOrEqual(18);
      expect(footprint.width).toBeLessThanOrEqual(42);
      expect(footprint.height).toBeGreaterThanOrEqual(8);
      expect(footprint.minY).toBeGreaterThanOrEqual(0);
      expect(footprint.maxY).toBeLessThanOrEqual(rows.length - 1);
    }
  });

  it('keeps the ascii cube legible on wide receiver panels', () => {
    const rows = buildVisualizer('cube', 10, 152, 13, station, playback, 'ruby');
    const footprint = glyphFootprint(rows, cubeGlyph);
    const text = frameText(rows);

    expect(footprint.width).toBeGreaterThanOrEqual(18);
    expect(footprint.width).toBeLessThanOrEqual(42);
    expect(footprint.height).toBeGreaterThanOrEqual(10);
    expect(text).toMatch(/[\\/]/);
    expect(text).toMatch(/[=-]/);
    expect(text).not.toMatch(/[╱╲─│═║]/);
  });

  it('animates the added ASCII animation receiver styles', () => {
    for (const style of asciiAnimationStyles) {
      const height = visualizerHeight(style, 13);
      const firstFrame = frameText(buildVisualizer(style, 4, 80, height, station, playback, 'ruby'));
      const laterFrame = frameText(buildVisualizer(style, 16, 80, height, station, playback, 'ruby'));

      expect(firstFrame.trim()).not.toBe('');
      expect(laterFrame).not.toBe(firstFrame);
    }
  });

  it('renders audioMotion-inspired styles with segmented color data', () => {
    const motionStyles = ['motion-blob', 'motion-area', 'motion-contour'] as const;

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

  it('renders inactive receiver visuals as a flat zero-level baseline', () => {
    const rows = buildVisualizer('equalizer', 8, 32, 6, station, inactivePlaybacks[0]!, 'ruby');

    expect(rows).toHaveLength(6);
    expect(rows.slice(0, -1).every(row => row.text.trim() === '')).toBe(true);
    expect(rows.at(-1)?.text).toBe('▁'.repeat(32));
    expect(frameText(rows)).not.toMatch(/[▃▅▆▇█]/);
  });
});

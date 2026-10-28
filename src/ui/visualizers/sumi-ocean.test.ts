import stringWidth from 'string-width';
import {describe, expect, it} from 'vitest';
import {buildSumiOcean} from './sumi-ocean.js';
import {buildVisualizer} from './receiver-visualizers.js';
import type {PlaybackState} from '../../types.js';

const playback = {state: 'playing', ready: true} as PlaybackState;

describe('Sumi Ocean moonlit receiver', () => {
  it.each([[1, 1], [100, 4], [160, 3], [12, 3], [20, 3], [20, 4], [24, 4], [36, 4], [60, 7], [80, 10], [100, 14], [120, 30]])('fills %i by %i with continuous color and terminal-width-safe glyphs', (width, height) => {
    const frame = buildVisualizer('sumi-ocean', 24, width, height, null, playback, 'blue', height < 7 ? 'micro' : 'standard');
    expect(frame).toHaveLength(height);
    for (const row of frame) {
      expect(stringWidth(row.text)).toBe(width);
      expect(row.segments?.map(segment => segment.text).join('')).toBe(row.text);
      for (const [index, segment] of row.segments!.entries()) {
        expect(segment.color).toMatch(/^#[\da-f]{6}$/i);
        expect(segment.backgroundColor).toMatch(/^#[\da-f]{6}$/i);
        expect(segment.text).toMatch(/^[ ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█◢◣◤◥▂▆░▒▓●]+$/u);
        const previous = row.segments![index - 1];
        if (previous) expect([segment.color, segment.backgroundColor]).not.toEqual([previous.color, previous.backgroundColor]);
      }
    }
  });

  it('places a bright moon in the right sky even in micro layouts', () => {
    for (const [width, height] of [[36, 4], [100, 14], [120, 30]] as const) {
      const frame = buildSumiOcean(0, width, height, 'blue');
      let moon = false;
      for (const row of frame.slice(0, Math.ceil(height * 0.4))) {
        let x = 0;
        for (const segment of row.segments) {
          if (x + segment.text.length > width * 0.65 && x < width * 0.9
            && [segment.color, segment.backgroundColor].some(color => Number.parseInt(color.slice(1, 3), 16) > 210)) moon = true;
          x += segment.text.length;
        }
      }
      expect(moon, `${width}x${height}`).toBe(true);
    }
  });

  it.each([[20, 3], [24, 4], [36, 4], [60, 7]])('preserves a round moon and visible reflected light at %i × %i throughout playback', (width, height) => {
    const column = Math.round(width * 0.78);
    const moonRow = Math.floor(height * (height <= 6 ? 0.43 : 0.46) * 0.40);
    for (const pulse of [0, 24, 100, 10_000, 1_000_000]) {
      const frame = buildSumiOcean(pulse, width, height, 'blue');
      expect(frame[moonRow]!.text[column]).toBe('●');
      const water = frame.slice(Math.ceil(height * (height <= 6 ? 0.43 : 0.46)));
      let reflectedLight = 0, ambientLight = 0;
      for (const row of water) {
        let x = 0;
        for (const segment of row.segments) for (const glyph of segment.text) {
          const red = Math.max(Number.parseInt(segment.backgroundColor.slice(1, 3), 16), glyph === ' ' ? 0 : Number.parseInt(segment.color.slice(1, 3), 16));
          if (Math.abs(x - column) <= 2) reflectedLight = Math.max(reflectedLight, red);
          if (x < width * 0.2) ambientLight = Math.max(ambientLight, red);
          x++;
        }
      }
      // Light can skip a row: its overall contrast matters, not a forced bar
      // on every row, which made the previous reflection look like a ladder.
      expect(reflectedLight).toBeGreaterThan(ambientLight + 8);
    }
  });

  it('uses fine shading without fixed reflection bars', () => {
    const text = buildSumiOcean(24, 100, 14, 'blue').map(row => row.text).join('');
    expect(text).toMatch(/[░▒▓]/u);
    expect(text).not.toMatch(/[─▁]/u);
  });

  it('animates only the water and keeps the moon, halo and stars steady', () => {
    const first = buildSumiOcean(0, 120, 30, 'blue');
    const later = buildSumiOcean(40, 120, 30, 'blue');
    expect(first.slice(0, 13)).toEqual(later.slice(0, 13));
    expect(first.slice(15)).not.toEqual(later.slice(15));
  });

  it('moves water texture across the whole surface, including both sides away from the moon', () => {
    const first = buildSumiOcean(24, 100, 14, 'blue');
    const later = buildSumiOcean(64, 100, 14, 'blue');
    for (const [left, right] of [[0, 25], [30, 55], [90, 100]]) {
      const texture = (frame: typeof first) => frame.slice(7).map(row => row.text.slice(left, right)).join('');
      expect(texture(first), `water columns ${left}–${right}`).not.toEqual(texture(later));
    }
    // The previous refinement's diagonal fitting made the reflection look
    // angular. Water keeps the broader quadrant marks of the preferred scene.
    expect(first.slice(7).map(row => row.text).join('')).not.toMatch(/[◢◣◤◥░▒▓]/u);
  });

  it('keeps its indigo art palette and provides a grayscale mode', () => {
    expect(buildSumiOcean(24, 100, 14, 'ruby')).toEqual(buildSumiOcean(24, 100, 14, 'blue'));
    for (const row of buildSumiOcean(24, 100, 14, 'mono')) for (const segment of row.segments) {
      for (const color of [segment.color, segment.backgroundColor]) {
        expect(color.slice(1, 3)).toBe(color.slice(3, 5));
        expect(color.slice(3, 5)).toBe(color.slice(5, 7));
      }
    }
  });

  it('does not expose mutable cached runs through returned frames', () => {
    const expected = buildSumiOcean(24, 100, 14, 'blue');
    const changed = buildSumiOcean(24, 100, 14, 'blue');
    changed[0]!.segments[0]!.text = 'changed';
    changed[0]!.segments[0]!.color = '#ffffff';
    expect(buildSumiOcean(24, 100, 14, 'blue')).toEqual(expected);
  });

  it('does not depend on frame order, long playback or evicted viewport caches', () => {
    const expected = buildSumiOcean(24, 100, 14, 'blue');
    for (const width of [30, 40, 50, 60, 70]) buildSumiOcean(1_000_000, width, 7, 'blue');
    buildSumiOcean(99_000, 100, 14, 'mono');
    expect(buildSumiOcean(24, 100, 14, 'blue')).toEqual(expected);
  });
});

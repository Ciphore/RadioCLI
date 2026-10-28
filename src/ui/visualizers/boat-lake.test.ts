import stringWidth from 'string-width';
import {describe, expect, it} from 'vitest';
import {buildVisualizer} from './receiver-visualizers.js';
import {buildBoatLake} from './boat-lake.js';
import type {PlaybackState} from '../../types.js';

const playback = {state: 'playing', ready: true} as PlaybackState;

describe('Boat Lake receiver', () => {
  it.each([[1, 1], [12, 3], [20, 3], [24, 4], [36, 4], [60, 7], [80, 10], [100, 14], [120, 18], [120, 30]])('fills a %i by %i viewport with valid, merged color runs', (width, height) => {
    const frame = buildVisualizer('boat-lake', 24, width, height, null, playback, 'blue', height < 7 ? 'micro' : 'standard');
    expect(frame).toHaveLength(height);
    for (const row of frame) {
      expect(stringWidth(row.text)).toBe(width);
      expect(row.segments?.map(segment => segment.text).join('')).toBe(row.text);
      for (const [index, segment] of row.segments!.entries()) {
        expect(segment.color).toMatch(/^#[\da-f]{6}$/i);
        expect(segment.backgroundColor).toMatch(/^#[\da-f]{6}$/i);
        expect(segment.text).toMatch(/^[ ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█◢◣◤◥▂▆░▒▓]+$/u);
        const previous = row.segments![index - 1];
        if (previous) expect([segment.color, segment.backgroundColor]).not.toEqual([previous.color, previous.backgroundColor]);
      }
    }
  });

  it('keeps the original blue palette across color themes, and supports monochrome', () => {
    expect(buildBoatLake(24, 100, 14, 'ruby')).toEqual(buildBoatLake(24, 100, 14, 'blue'));
    const mono = buildBoatLake(24, 100, 14, 'mono');
    for (const row of mono) for (const segment of row.segments) {
      for (const color of [segment.color, segment.backgroundColor]) {
        expect(color.slice(1, 3)).toBe(color.slice(3, 5));
        expect(color.slice(3, 5)).toBe(color.slice(5, 7));
      }
    }
  });

  it('animates the water while the cached landscape stays steady', () => {
    const first = buildBoatLake(0, 120, 30, 'blue');
    const later = buildBoatLake(40, 120, 30, 'blue');
    expect(first.slice(0, 10)).toEqual(later.slice(0, 10));
    expect(first.slice(16)).not.toEqual(later.slice(16));
  });

  it.each([[20, 3], [24, 4], [36, 4], [48, 6]])('keeps both sails and a connected hull legible at %i × %i throughout playback', (width, height) => {
    const left = Math.round(width * 0.41) - 3;
    for (const pulse of [0, 24, 100, 10_000, 1_000_000]) {
      const frame = buildBoatLake(pulse, width, height, 'blue');
      expect(frame[0]!.text.slice(1, 3)).toBe('◢◣');
      expect(frame[0]!.text.slice(width - 3, width - 1)).toBe('◢◣');
      expect(frame[height - 1]!.text.slice(left, left + 7)).toBe('◥▀▀▀▀▀◤');
      expect(frame[height - 2]!.text.slice(left + 1, left + 6)).toBe('◢██▌◣');
      const sailColors = frame[height - 2]!.segments.filter(segment => segment.text.includes('◢') || segment.text.includes('◣')).map(segment => segment.color);
      expect(sailColors).toContain('#F8F9FC');
      expect(sailColors).toContain('#D1D6EC');
    }
  });

  it('retains diagonal edges and fine shading in the standard receiver', () => {
    const text = buildBoatLake(24, 100, 14, 'blue').map(row => row.text).join('');
    expect(text).toMatch(/[◢◣◤◥]/u);
    expect(text).toMatch(/[░▒▓]/u);
  });

  it('rebuilds the same frame after viewport cache eviction and long playback', () => {
    const first = buildBoatLake(17, 100, 14, 'blue');
    for (const width of [30, 40, 50, 60, 70]) buildBoatLake(1_000_000, width, 7, 'blue');
    expect(buildBoatLake(17, 100, 14, 'blue')).toEqual(first);
  });
});

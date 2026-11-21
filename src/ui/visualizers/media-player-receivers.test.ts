import {describe, expect, it} from 'vitest';
import {themeNames, type PlaybackState} from '../../types.js';
import {displayWidth} from '../format.js';
import {buildVisualizer} from './receiver-visualizers.js';
import {mediaPlayerReceiverBuilders} from './media-player-receivers.js';
import {receiverStyleNames} from './receiver-style-registry.js';

const styles = Object.keys(mediaPlayerReceiverBuilders) as (keyof typeof mediaPlayerReceiverBuilders)[];
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};

describe('media player receivers', () => {
  it('registers a dozen distinct, animated scenes', () => {
    expect(styles).toHaveLength(12);
    const signatures = new Set<string>();
    for (const style of styles) {
      expect(receiverStyleNames).toContain(style);
      const frames = [0, 3, 7, 10, 90].map(pulse => JSON.stringify(buildVisualizer(style, pulse, 80, 12, null, playback, 'violet')));
      expect(new Set(frames).size, style).toBe(5);
      signatures.add(frames[1]!);
    }
    expect(signatures.size).toBe(12);
  });

  it('fits tiny, narrow, tall and wide viewports with consistent segment widths', () => {
    for (const style of styles) {
      for (const [width, height] of [[1, 1], [9, 3], [23, 5], [64, 7], [80, 14], [160, 24], [12, 30]]) {
        for (const theme of [themeNames[0]!, 'pine', 'ivory', 'mono'] as const) {
          const rows = buildVisualizer(style, 17, width!, height!, null, playback, theme, 'micro');
          expect(rows, style).toHaveLength(height!);
          for (const row of rows) {
            expect(row.text.length, style).toBe(width);
            expect(displayWidth(row.text), style).toBe(width);
            expect(row.segments?.map(segment => segment.text).join('')).toBe(row.text);
            expect(row.segments?.every(segment => /^#[0-9a-f]{6}$/i.test(segment.color))).toBe(true);
          }
        }
      }
    }
  }, 20_000);

  it('lights a meaningful share of the panel on every beat', () => {
    for (const style of styles) {
      for (const pulse of [0, 5, 31, 64, 200, 5000]) {
        const rows = buildVisualizer(style, pulse, 80, 14, null, playback, 'green');
        const lit = rows.reduce((total, row) => total + (row.segments ?? [])
          .reduce((sum, segment) => sum + (segment.backgroundColor || segment.text.trim() ? segment.text.length : 0), 0), 0);
        expect(lit / (80 * 14), `${style} @ ${pulse}`).toBeGreaterThan(0.05);
      }
    }
  });

  it('follows the theme, and stays neutral on mono', () => {
    for (const style of styles) {
      expect(mediaPlayerReceiverBuilders[style](24, 80, 12, 'ruby')).not.toEqual(mediaPlayerReceiverBuilders[style](24, 80, 12, 'blue'));
      for (const row of mediaPlayerReceiverBuilders[style](24, 80, 12, 'mono')) {
        for (const segment of row.segments) {
          for (const color of [segment.color, segment.backgroundColor]) {
            if (color) expect(new Set([color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)]).size, style).toBe(1);
          }
        }
      }
    }
  });
});

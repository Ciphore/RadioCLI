import {describe, expect, it} from 'vitest';
import {themeNames, type PlaybackState} from '../../types.js';
import {displayWidth} from '../format.js';
import {buildVisualizer} from './receiver-visualizers.js';
import {nostalgiaReceiverBuilders} from './nostalgia-receivers.js';
import {receiverStyleNames} from './receiver-style-registry.js';

const styles = Object.keys(nostalgiaReceiverBuilders) as (keyof typeof nostalgiaReceiverBuilders)[];
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};
const frame = (style: (typeof styles)[number], pulse: number, width = 80, height = 14): string =>
  JSON.stringify(nostalgiaReceiverBuilders[style](pulse, width, height, 'violet'));
const glyphs = (style: (typeof styles)[number], pulse = 150): string =>
  nostalgiaReceiverBuilders[style](pulse, 80, 14, 'violet').map(row => row.text).join('\n');

describe('nostalgia receivers', () => {
  it('registers distinct, animated scenes', () => {
    expect(styles).toHaveLength(7);
    const signatures = new Set<string>();
    for (const style of styles) {
      expect(receiverStyleNames).toContain(style);
      const frames = [0, 3, 7, 10, 90].map(pulse => JSON.stringify(buildVisualizer(style, pulse, 80, 12, null, playback, 'violet')));
      expect(new Set(frames).size, style).toBe(5);
      signatures.add(frames[1]!);
    }
    expect(signatures.size).toBe(styles.length);
  });

  it('draws what each scene is named for', () => {
    expect(glyphs('defrag')).toMatch(/Defragmenting drive C: +\d+% complete/);
    expect(glyphs('solitaire')).toMatch(/[AKQJ\d][♥♠♦♣]/);
    expect(glyphs('maze-3d')).toMatch(/[▀▄]/);
    expect(glyphs('galton-board')).toMatch(/●[\s\S]*█/);
    expect(glyphs('string-art')).toMatch(/[⠁-⣿]/);
    expect(glyphs('shortwave')).toMatch(/•/);
  });

  it('replays simulations to the same frame however the pulse was reached', () => {
    const style = 'sand';
    const stepped = [58, 59, 60, 61].map(pulse => frame(style, pulse));
    // A backwards jump and a cold start in another epoch both rebuild the run from its seed.
    frame(style, 2000);
    expect(frame(style, 60), style).toBe(stepped[2]);
    frame(style, 5);
    expect(frame(style, 61), style).toBe(stepped[3]);
    // Other viewports keep their own runs.
    frame(style, 61, 40, 9);
    expect(frame(style, 59), style).toBe(stepped[1]);
    expect(new Set(stepped).size, style).toBe(4);
  });

  it('fits tiny, narrow, tall and wide viewports with consistent segment widths', () => {
    for (const style of styles) {
      for (const [width, height] of [[1, 1], [2, 2], [9, 3], [20, 4], [23, 5], [64, 7], [80, 14], [160, 24], [12, 30]]) {
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

  it('never leaves the panel bare', () => {
    for (const style of styles) {
      for (const pulse of [0, 5, 31, 64, 109, 200, 315, 5000]) {
        const rows = buildVisualizer(style, pulse, 80, 14, null, playback, 'green');
        const lit = rows.reduce((total, row) => total + (row.segments ?? [])
          .reduce((sum, segment) => sum + (segment.backgroundColor ? segment.text.length : segment.text.replace(/\s/g, '').length), 0), 0);
        expect(lit / (80 * 14), `${style} @ ${pulse}`).toBeGreaterThan(0.03);
      }
    }
  });

  it('follows the theme', () => {
    for (const style of styles) {
      expect(nostalgiaReceiverBuilders[style](24, 80, 12, 'ruby')).not.toEqual(nostalgiaReceiverBuilders[style](24, 80, 12, 'blue'));
    }
  });
});

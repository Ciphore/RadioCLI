import {describe, expect, it} from 'vitest';
import {themeNames, type PlaybackState} from '../../types.js';
import {displayWidth} from '../format.js';
import {buildVisualizer} from './receiver-visualizers.js';
import {cabinetReceiverBuilders} from './cabinet-receivers.js';
import {receiverStyleNames} from './receiver-style-registry.js';

const styles = Object.keys(cabinetReceiverBuilders) as (keyof typeof cabinetReceiverBuilders)[];
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};
const glyphs = (style: (typeof styles)[number], pulse = 30): string =>
  cabinetReceiverBuilders[style](pulse, 80, 14, 'violet').map(row => row.text).join('');

describe('cabinet receivers', () => {
  it('registers distinct, animated scenes', () => {
    expect(styles).toHaveLength(10);
    const signatures = new Set<string>();
    for (const style of styles) {
      expect(receiverStyleNames).toContain(style);
      const frames = [0, 3, 7, 10, 90].map(pulse => JSON.stringify(buildVisualizer(style, pulse, 80, 12, null, playback, 'violet')));
      expect(new Set(frames).size, style).toBe(5);
      signatures.add(frames[1]!);
    }
    expect(signatures.size).toBe(styles.length);
  });

  it('draws each scene with its own kind of mark', () => {
    for (const style of ['epicycles', 'snowflake', 'flower-of-life'] as const) expect(glyphs(style, 150), style).toMatch(/[⠁-⣿]/);
    for (const style of ['rubens-tube', 'circle-packing'] as const) expect(glyphs(style, 150), style).toMatch(/[▀▄]/);
    expect(glyphs('sound-field')).toMatch(/●[\s\S]*·/);
    expect(glyphs('fair-isle', 150)).toMatch(/V{20}/);
    expect(glyphs('infinity-mirror')).toMatch(/●[\s\S]*•[\s\S]*·/);
  });

  it('weaves cloth that covers the whole panel', () => {
    for (const style of ['tartan', 'knotwork'] as const) {
      const rows = cabinetReceiverBuilders[style](30, 80, 14, 'violet');
      const covered = rows.flatMap(row => row.segments).filter(segment => segment.backgroundColor || /[▀▄]/.test(segment.text))
        .reduce((total, segment) => total + segment.text.length, 0);
      expect(covered / (80 * 14), style).toBeGreaterThan(style === 'tartan' ? 0.99 : 0.4);
    }
  });

  it('replays circle packing to the same frame however the pulse was reached', () => {
    const frame = (pulse: number, width = 80): string => JSON.stringify(cabinetReceiverBuilders['circle-packing'](pulse, width, 14, 'violet'));
    const stepped = [70, 71, 72].map(pulse => frame(pulse));
    frame(2000);
    expect(frame(72)).toBe(stepped[2]);
    frame(72, 40);
    expect(frame(70)).toBe(stepped[0]);
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
      for (const pulse of [0, 5, 31, 64, 200, 299, 420, 5000]) {
        const rows = buildVisualizer(style, pulse, 80, 14, null, playback, 'green');
        const lit = rows.reduce((total, row) => total + (row.segments ?? [])
          .reduce((sum, segment) => sum + (segment.backgroundColor ? segment.text.length : segment.text.replace(/\s/g, '').length), 0), 0);
        expect(lit / (80 * 14), `${style} @ ${pulse}`).toBeGreaterThan(0.03);
      }
    }
  });

  it('follows the theme', () => {
    for (const style of styles) {
      expect(cabinetReceiverBuilders[style](24, 80, 12, 'ruby')).not.toEqual(cabinetReceiverBuilders[style](24, 80, 12, 'blue'));
    }
  });
});

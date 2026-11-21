import {describe, expect, it} from 'vitest';
import {themeNames, type PlaybackState, type ReceiverStyle} from '../../types.js';
import {displayWidth} from '../format.js';
import {buildVisualizer} from './receiver-visualizers.js';
import {receiverStyleNames} from './receiver-style-registry.js';

const variations = ['gallop-herd', 'gallop-plates', 'gallop-dust', 'gallop-echo', 'golden-gate-fog', 'golden-gate-sunset', 'golden-gate-night',
  'skyline-dawn', 'skyline-rain', 'skyline-synth', 'manhattan-henge', 'manhattan-snow', 'manhattan-harbor'] as const satisfies readonly ReceiverStyle[];
const revised = ['constellation', 'tesseract', 'starfield', 'ripple-tank', 'aurora'] as const satisfies readonly ReceiverStyle[];
const styles = [...variations, ...revised];
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};
const frame = (style: ReceiverStyle, pulse: number, theme: (typeof themeNames)[number] = 'violet') => buildVisualizer(style, pulse, 80, 14, null, playback, theme);
const text = (style: ReceiverStyle, pulse = 60): string => frame(style, pulse).map(row => row.text).join('\n');
const colours = (style: ReceiverStyle, pulse = 60, theme: (typeof themeNames)[number] = 'violet'): Set<string> =>
  new Set(frame(style, pulse, theme).flatMap(row => (row.segments ?? []).flatMap(segment => [segment.color, segment.backgroundColor ?? ''])));

describe('scene variations and revised receivers', () => {
  it('registers every variation as its own animated scene', () => {
    const signatures = new Set<string>();
    for (const style of styles) {
      expect(receiverStyleNames).toContain(style);
      const frames = [0, 3, 7, 10, 90].map(pulse => JSON.stringify(frame(style, pulse)));
      // The plates are stills by design: only the lit frame moves on.
      expect(new Set(frames).size, style).toBeGreaterThanOrEqual(style === 'gallop-plates' ? 3 : 5);
      signatures.add(frames[1]!);
    }
    expect(signatures.size).toBe(styles.length);
  });

  it('draws the horse in braille in every gallop, each arranged differently', () => {
    const ink = (style: ReceiverStyle): number => (text(style).match(/[⠁-⣿]/g) ?? []).length;
    for (const style of ['gallop-herd', 'gallop-plates', 'gallop-dust', 'gallop-echo'] as const) expect(ink(style), style).toBeGreaterThan(60);
    expect(text('gallop-plates')).toMatch(/└1─+[\s\S]*└2─/);
    expect(text('gallop-dust')).toMatch(/─{3}/);
    // The herd and the echo use several tones; the plates light exactly one frame.
    expect(colours('gallop-herd').size).toBeGreaterThan(4);
    expect(colours('gallop-echo').size).toBeGreaterThan(3);
  });

  it('keeps each bridge in its own light', () => {
    expect(colours('golden-gate-fog').has('#d2452f')).toBe(true);
    expect(colours('golden-gate-night').has('#c2402c')).toBe(true);
    expect(colours('golden-gate-sunset').has('#3a1418')).toBe(true);
    for (const style of ['golden-gate-fog', 'golden-gate-sunset', 'golden-gate-night'] as const) {
      // Places keep their colours whatever the theme, and go grey on mono.
      const backgrounds = (theme: 'ruby' | 'blue'): string => JSON.stringify(frame(style, 60, theme).map(row => (row.segments ?? []).map(segment => [segment.text, segment.backgroundColor])));
      expect(backgrounds('ruby'), style).toBe(backgrounds('blue'));
      for (const color of colours(style, 60, 'mono')) if (color) expect(new Set([color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)]).size, style).toBe(1);
    }
  });

  it('fits tiny, narrow, tall and wide viewports with consistent segment widths', () => {
    for (const style of styles) {
      for (const [width, height] of [[1, 1], [2, 2], [9, 3], [20, 4], [23, 5], [64, 7], [80, 14], [160, 24], [12, 30]]) {
        for (const theme of ['violet', 'mono'] as const) {
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
      for (const pulse of [0, 5, 31, 64, 200, 5000]) {
        const lit = frame(style, pulse).reduce((total, row) => total + (row.segments ?? [])
          .reduce((sum, segment) => sum + (segment.backgroundColor ? segment.text.length : segment.text.replace(/\s/g, '').length), 0), 0);
        expect(lit / (80 * 14), `${style} @ ${pulse}`).toBeGreaterThan(0.03);
      }
    }
  });
});

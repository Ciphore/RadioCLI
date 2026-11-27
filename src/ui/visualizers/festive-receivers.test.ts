import {describe, expect, it} from 'vitest';
import {themeNames, type PlaybackState} from '../../types.js';
import {displayWidth} from '../format.js';
import {buildVisualizer} from './receiver-visualizers.js';
import {festiveReceiverBuilders} from './festive-receivers.js';
import {receiverStyleNames} from './receiver-style-registry.js';

const styles = Object.keys(festiveReceiverBuilders) as (keyof typeof festiveReceiverBuilders)[];
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};
const colours = (style: (typeof styles)[number], pulse: number, theme: (typeof themeNames)[number] = 'violet', width = 80, height = 14): string[] =>
  festiveReceiverBuilders[style](pulse, width, height, theme).flatMap(row => row.segments.flatMap(segment => [segment.color, segment.backgroundColor ?? '']));
/** Read the half-block pixels back as a bitmap of "is this one of these colours". */
const bitmap = (style: (typeof styles)[number], pulse: number, width: number, height: number, wanted: (color: string) => boolean): string[] => {
  const rows = festiveReceiverBuilders[style](pulse, width, height, 'violet');
  return rows.flatMap(row => {
    const top: string[] = [], bottom: string[] = [];
    for (const segment of row.segments) for (const glyph of segment.text) {
      const upper = glyph === '▄' ? segment.backgroundColor : glyph === '▀' ? segment.color : segment.backgroundColor;
      const lower = glyph === '▀' ? segment.backgroundColor : glyph === '▄' ? segment.color : segment.backgroundColor;
      top.push(upper && wanted(upper) ? '#' : '.'); bottom.push(lower && wanted(lower) ? '#' : '.');
    }
    return [top.join(''), bottom.join('')];
  });
};

describe('festive receivers', () => {
  it('registers eleven distinct, animated scenes', () => {
    expect(styles).toHaveLength(11);
    const signatures = new Set<string>();
    for (const style of styles) {
      expect(receiverStyleNames).toContain(style);
      const frames = [0, 3, 7, 10, 90].map(pulse => JSON.stringify(buildVisualizer(style, pulse, 80, 12, null, playback, 'violet')));
      expect(new Set(frames).size, style).toBe(5);
      signatures.add(frames[1]!);
    }
    expect(signatures.size).toBe(styles.length);
  });

  it('spells the greeting out in red and green', () => {
    // The top stroke of the M in MERRY: two uprights, a gap between them.
    const red = bitmap('merry-christmas', 40, 120, 20, color => /^#(d8283c|e[0-9a-f]{5})$/.test(color));
    const green = bitmap('merry-christmas', 40, 120, 20, color => /^#(1f8f4d|5[0-9a-f]{5})$/.test(color));
    expect(red.some(row => /#{2,}\.+#{2,}/.test(row))).toBe(true);
    expect(green.some(row => row.includes('####'))).toBe(true);
  });

  it('shows the New Year greeting and successive fireworks from the first frame onward', () => {
    const pulses = [0, 124, 125, 299, 300, 5000];
    const frames = pulses.map(pulse => festiveReceiverBuilders['new-year'](pulse, 38, 14, 'violet'));
    for (const frame of frames) {
      expect(frame.map(row => row.text).join('\n')).toContain('HAPPY NEW YEAR');
      const skyColors = new Set(frame.slice(0, 5).flatMap(row => row.segments.map(segment => segment.color)));
      expect(skyColors.size).toBeGreaterThan(15);
    }
    expect(new Set(frames.map(frame => JSON.stringify(frame))).size).toBe(pulses.length);
  });

  it('lights one more candle each night', () => {
    // Flames flicker, so count the columns that hold one rather than their pixels.
    const flames = (pulse: number): number => {
      const rows = bitmap('menorah', pulse, 120, 20, color => color === '#fff7d6');
      const columns = [...rows[0]!].map((_, x) => rows.some(row => row[x] === '#') ? '#' : '.').join('');
      return (columns.match(/#+/g) ?? []).length;
    };
    const nights = [0, 1, 2, 3, 4, 5, 6, 7].map(night => flames(night * 38 + 10));
    for (let night = 1; night < nights.length; night++) expect(nights[night], `night ${night + 1}`).toBeGreaterThan(nights[night - 1]!);
  });

  it('keeps the colours of the season whatever the theme, and goes grey on mono', () => {
    for (const style of styles) {
      const fixed = new Set(colours(style, 24, 'ruby'));
      const shared = colours(style, 24, 'blue').filter(color => fixed.has(color));
      expect(shared.length / colours(style, 24, 'blue').length, style).toBeGreaterThan(0.6);
      for (const color of colours(style, 24, 'mono')) {
        if (color) expect(new Set([color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)]).size, `${style} ${color}`).toBe(1);
      }
    }
  });

  it('fits tiny, narrow, tall and wide viewports with consistent segment widths', () => {
    for (const style of styles) {
      for (const [width, height] of [[1, 1], [2, 2], [9, 3], [20, 4], [23, 5], [64, 7], [80, 14], [160, 24], [12, 30]]) {
        for (const theme of [themeNames[0]!, 'pine', 'ivory', 'mono'] as const) {
          const frame = buildVisualizer(style, 17, width!, height!, null, playback, theme, 'micro');
          expect(frame, style).toHaveLength(height!);
          for (const row of frame) {
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
      for (const pulse of [0, 5, 31, 64, 200, 299, 5000]) {
        const frame = buildVisualizer(style, pulse, 80, 14, null, playback, 'green');
        const lit = frame.reduce((total, row) => total + (row.segments ?? [])
          .reduce((sum, segment) => sum + (segment.backgroundColor ? segment.text.length : segment.text.replace(/\s/g, '').length), 0), 0);
        expect(lit / (80 * 14), `${style} @ ${pulse}`).toBeGreaterThan(0.03);
      }
    }
  });
});

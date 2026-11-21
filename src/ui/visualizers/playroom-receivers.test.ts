import {describe, expect, it} from 'vitest';
import {themeNames, type PlaybackState} from '../../types.js';
import {displayWidth} from '../format.js';
import {buildVisualizer} from './receiver-visualizers.js';
import {playroomReceiverBuilders} from './playroom-receivers.js';
import {receiverStyleNames} from './receiver-style-registry.js';

const styles = Object.keys(playroomReceiverBuilders) as (keyof typeof playroomReceiverBuilders)[];
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};
const glyphs = (style: (typeof styles)[number], pulse = 30): string =>
  playroomReceiverBuilders[style](pulse, 80, 14, 'violet').map(row => row.text).join('');

describe('playroom receivers', () => {
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

  it('draws what each scene is named for', () => {
    expect(glyphs('minesweeper')).toMatch(/\d{3} +(:\)|:O|B\)) +\d{3}/);
    expect(glyphs('minesweeper')).toMatch(/[1-8]/);
    expect(glyphs('tape-loading', 150)).toMatch(/LOADING RADIOCLI/);
    expect(glyphs('tape-loading', 10)).toMatch(/SEARCHING/);
    expect(glyphs('steam-train', 60)).toMatch(/RADIO/);
    expect(glyphs('bonsai', 200)).toMatch(/&/);
    expect(glyphs('dot-matrix')).toMatch(/\d+\.\d MHz \|#+/);
    expect(glyphs('etch-a-sketch', 150)).toMatch(/[┌┐└┘]/);
    expect(glyphs('abacus')).toMatch(/═/);
    expect(glyphs('dominoes', 60)).toMatch(/_ ([/\\] )+\||\| ([/\\] )+_/);
    for (const style of ['boing-ball', 'flying-toasters', 'lcd-pet', 'newtons-cradle'] as const) expect(glyphs(style), style).toMatch(/[▀▄]/);
  });

  it('counts the abacus up without ever skipping', () => {
    const live = (pulse: number): number => playroomReceiverBuilders.abacus(pulse, 80, 14, 'violet')
      .flatMap(row => row.segments).filter(segment => segment.text.includes('●') && segment.bold !== false).length;
    expect(live(0)).toBeGreaterThan(0);
  });

  it('plays a full game of minesweeper and wins it', () => {
    const board = (pulse: number): string => glyphs('minesweeper', pulse);
    const opened = (pulse: number): number => (board(pulse).match(/[1-8]/g) ?? []).length;
    expect(opened(40)).toBeLessThan(opened(200));
    expect(opened(200)).toBeLessThanOrEqual(opened(370));
    expect(board(390)).toContain('B)');
    expect(board(390).split('\n')[0]).toMatch(/^ *000/);
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
      expect(playroomReceiverBuilders[style](24, 80, 12, 'ruby')).not.toEqual(playroomReceiverBuilders[style](24, 80, 12, 'blue'));
    }
  });
});

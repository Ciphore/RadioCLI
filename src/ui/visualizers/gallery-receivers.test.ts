import {describe, expect, it} from 'vitest';
import {themeNames, type PlaybackState} from '../../types.js';
import {displayWidth} from '../format.js';
import {buildVisualizer} from './receiver-visualizers.js';
import {galleryReceiverBuilders} from './gallery-receivers.js';
import {receiverStyleNames} from './receiver-style-registry.js';

const styles = Object.keys(galleryReceiverBuilders) as (keyof typeof galleryReceiverBuilders)[];
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};
const rows = (style: (typeof styles)[number], pulse = 150, width = 80, height = 14) => galleryReceiverBuilders[style](pulse, width, height, 'violet');
const glyphs = (style: (typeof styles)[number], pulse = 150): string => rows(style, pulse).map(row => row.text).join('\n');

describe('gallery receivers', () => {
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

  it('paints each canvas in its own medium', () => {
    // Flat fields with nothing drawn on them.
    for (const style of ['mondrian', 'pollock', 'vasarely', 'zellige'] as const) {
      expect(rows(style).every(row => row.segments.every(segment => segment.backgroundColor || /[▀▄]/.test(segment.text))), style).toBe(true);
    }
    expect(glyphs('mondrian').trim()).toBe('');
    expect(glyphs('starry-night')).toMatch(/[─╲│╱]{6}[\s\S]*●/);
    expect(glyphs('seurat')).toMatch(/^[●•∙\n]+$/);
    expect(glyphs('rothko')).toMatch(/[░▒▓]/);
    expect(glyphs('lichtenstein')).toMatch(/[●•·]/);
    expect(glyphs('klimt')).toMatch(/[⠁-⣿][\s\S]*[◆●▪◉▲]/);
    expect(glyphs('schotter')).toMatch(/^[\s⠁-⣿]+$/);
    for (const style of ['kandinsky', 'haring'] as const) expect(glyphs(style), style).toMatch(/[▀▄]/);
  });

  it('keeps a Mondrian to three colours, black and paper', () => {
    const fields = new Set(rows('mondrian', 60).flatMap(row => row.segments.map(segment => segment.backgroundColor)));
    expect(fields.size).toBeGreaterThanOrEqual(3);
    expect(fields.size).toBeLessThanOrEqual(6);
  });

  it('replays the drip painting to the same canvas however the pulse was reached', () => {
    const stepped = [58, 59, 60].map(pulse => JSON.stringify(rows('pollock', pulse)));
    rows('pollock', 2000);
    expect(JSON.stringify(rows('pollock', 60))).toBe(stepped[2]);
    rows('pollock', 60, 40, 9);
    expect(JSON.stringify(rows('pollock', 58))).toBe(stepped[0]);
    expect(new Set(stepped).size).toBe(3);
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
      for (const pulse of [0, 5, 31, 64, 200, 324, 379, 5000]) {
        const frame = buildVisualizer(style, pulse, 80, 14, null, playback, 'green');
        const lit = frame.reduce((total, row) => total + (row.segments ?? [])
          .reduce((sum, segment) => sum + (segment.backgroundColor ? segment.text.length : segment.text.replace(/\s/g, '').length), 0), 0);
        expect(lit / (80 * 14), `${style} @ ${pulse}`).toBeGreaterThan(0.03);
      }
    }
  });

  it('follows the theme', () => {
    for (const style of styles) {
      expect(galleryReceiverBuilders[style](24, 80, 12, 'ruby')).not.toEqual(galleryReceiverBuilders[style](24, 80, 12, 'blue'));
    }
  });
});

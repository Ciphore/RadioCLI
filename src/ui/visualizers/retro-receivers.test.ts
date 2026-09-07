import {describe, expect, it} from 'vitest';
import {themeNames, type PlaybackState} from '../../types.js';
import {displayWidth} from '../format.js';
import {buildVisualizer} from './receiver-visualizers.js';
import {retroReceiverBuilders} from './retro-receivers.js';
import {migrateReceiverStyle, receiverStyleNames} from './receiver-style-registry.js';

const styles = Object.keys(retroReceiverBuilders) as (keyof typeof retroReceiverBuilders)[];
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};

describe('retro receivers', () => {
  it('retires the rejected styles without invalidating saved settings', () => {
    for (const style of ['din-stack', 'bass-shutters', 'velvet-dither', 'chrome-sweep', 'prism-steps', 'stereo-iris',
      'magnetic-bloom', 'liquid-chrome', 'vector-braid', 'halftone-orbit', 'sonic-fan', 'raster-disc', 'diamond-current', 'velvet-vortex',
      'dot-current', 'flip-matrix', 'raster-harp', 'spin-lattice', 'packet-storm', 'spark-chamber',
      'duplex-wave', 'color-drift', 'undertow', 'cube-tide', 'parallax-slabs', 'voxel-swell',
      'phosphor-marquee', 'ascii-drive', 'prism-bank', 'gallop', 'gallop-ultrafine',
      'gallop-solid', 'gallop-shaded', 'gallop-dither', 'gallop-hatch', 'gallop-scanline']) {
      expect(receiverStyleNames).not.toContain(style);
      expect(receiverStyleNames).toContain(migrateReceiverStyle(style));
    }
    for (const style of styles) expect(migrateReceiverStyle(style)).toBe(style);
  });

  it('registers only the retained terminal designs', () => {
    expect(styles).toEqual(['crossfade', 'gallop-fine']);
    const signatures = new Set<string>();
    for (const style of styles) {
      expect(receiverStyleNames).toContain(style);
      const frames = [0, 3, 7, 10].map(pulse => JSON.stringify(buildVisualizer(style, pulse, 80, 12, null, playback, 'violet')));
      expect(new Set(frames).size, style).toBeGreaterThanOrEqual(3);
      signatures.add(frames[1]!);
    }
    expect(signatures.size).toBe(2);
  });

  it('fits tiny, narrow, tall and wide viewports with consistent segment widths', () => {
    for (const style of styles) {
      for (const [width, height] of [[1, 1], [9, 3], [23, 5], [64, 7], [80, 14], [160, 24]]) {
        for (const theme of themeNames) {
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
  });

  it('adapts every retained style to the theme', () => {
    for (const style of styles) {
      expect(retroReceiverBuilders[style](24, 80, 12, 'ruby')).not.toEqual(retroReceiverBuilders[style](24, 80, 12, 'blue'));
    }
  });
});

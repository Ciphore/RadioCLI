import {describe, expect, it} from 'vitest';
import type {PlaybackState, ReceiverStyle} from '../../types.js';
import {displayWidth} from '../format.js';
import {oelReceiverBuilders} from './oel-receivers.js';
import {playervizReceiverBuilders} from './playerviz-receivers.js';
import {receiverStyleNames} from './receiver-style-registry.js';
import {buildVisualizer} from './receiver-visualizers.js';

const sets = {oel: oelReceiverBuilders, playerviz: playervizReceiverBuilders};
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};
const frame = (style: ReceiverStyle, pulse: number, theme: 'violet' | 'mono' | 'ruby' | 'blue' = 'violet') =>
  buildVisualizer(style, pulse, 80, 14, null, playback, theme);
const text = (style: ReceiverStyle, pulse = 60): string => frame(style, pulse).map(row => row.text).join('\n');

describe.each(Object.entries(sets))('%s receivers', (_, builders) => {
  const styles = Object.keys(builders) as ReceiverStyle[];

  it('registers a dozen distinct, animated scenes', () => {
    expect(styles).toHaveLength(12);
    const signatures = new Set<string>();
    for (const style of styles) {
      expect(receiverStyleNames).toContain(style);
      const frames = [0, 7, 40, 90, 200].map(pulse => JSON.stringify(frame(style, pulse)));
      expect(new Set(frames).size, style).toBeGreaterThanOrEqual(4);
      signatures.add(frames[2]!);
    }
    expect(signatures.size).toBe(styles.length);
  });

  it('fits tiny, narrow, tall and wide viewports with consistent segment widths', () => {
    for (const style of styles) {
      for (const [width, height] of [[1, 1], [2, 2], [9, 3], [20, 4], [23, 5], [64, 7], [80, 14], [160, 24], [12, 30]]) {
        for (const theme of ['violet', 'mono'] as const) {
          const rows = buildVisualizer(style, 17, width!, height!, null, playback, theme, 'micro');
          expect(rows, style).toHaveLength(height!);
          for (const row of rows) {
            expect(row.text.length, `${style} ${width}x${height}`).toBe(width);
            expect(displayWidth(row.text), `${style} ${width}x${height}`).toBe(width);
            expect(row.segments?.map(segment => segment.text).join('')).toBe(row.text);
            expect(row.segments?.every(segment => /^#[0-9a-f]{6}$/i.test(segment.color))).toBe(true);
            expect(row.segments?.every(segment => !segment.backgroundColor || /^#[0-9a-f]{6}$/i.test(segment.backgroundColor))).toBe(true);
          }
        }
      }
    }
  }, 30_000);

  it('never leaves the panel bare across beats', () => {
    for (const style of styles) {
      for (const pulse of [0, 5, 31, 64, 200, 899, 5000]) {
        const lit = frame(style, pulse).reduce((total, row) => total + (row.segments ?? [])
          .reduce((sum, segment) => sum + (segment.backgroundColor ? segment.text.length : segment.text.replace(/\s/g, '').length), 0), 0);
        expect(lit / (80 * 14), `${style} @ ${pulse}`).toBeGreaterThan(0.04);
      }
    }
  });

  it('follows theme colors and stays neutral greyscale on mono', () => {
    for (const style of styles) {
      expect(frame(style, 32, 'ruby'), style).not.toEqual(frame(style, 32, 'blue'));
      for (const row of frame(style, 32, 'mono')) {
        for (const segment of row.segments ?? []) {
          for (const color of [segment.color, segment.backgroundColor]) {
            if (color) {
              expect(new Set([color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)]).size, `${style} ${color}`).toBe(1);
            }
          }
        }
      }
    }
  });
});

describe('OEL and classic media player details', () => {
  it('renders recognizable car head-unit and classic player furniture', () => {
    expect(text('oel-dolphins')).toMatch(/OEL[\s\S]*STEREO/);
    expect(text('oel-racer')).toMatch(/KM\/H[\s\S]*GEAR \d/);
    expect(text('oel-jet')).toMatch(/HDG \d{3}/);
    expect(text('oel-city-cruise')).toMatch(/NIGHT CRUISE/);
    expect(text('oel-dancers')).toMatch(/DEMO\s+GROOVE/);
    expect(text('car-tachometer')).toMatch(/RPM[\s\S]*MPH/);
    expect(text('xplod-ring')).toMatch(/XPLOD[\s\S]*101\.9/);
    expect(text('cd-changer')).toMatch(/6-CD CHANGER/);
    expect(text('minidisc')).toMatch(/MDLP[\s\S]*ATRAC3[\s\S]*TR\d\d/);
    expect(text('win98-player')).toMatch(/Media Player - RadioCLI[\s\S]*File\s+View\s+Play[\s\S]*Playing/);
  });
});

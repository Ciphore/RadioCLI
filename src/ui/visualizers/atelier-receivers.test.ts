import {describe, expect, it} from 'vitest';
import type {PlaybackState, ReceiverStyle} from '../../types.js';
import {displayWidth} from '../format.js';
import {atelierReceiverBuilders} from './atelier-receivers.js';
import {receiverStyleNames} from './receiver-style-registry.js';
import {buildVisualizer} from './receiver-visualizers.js';

const styles = Object.keys(atelierReceiverBuilders) as ReceiverStyle[];
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};
const frame = (style: ReceiverStyle, pulse: number, theme: 'violet' | 'mono' | 'ruby' | 'blue' = 'violet') =>
  buildVisualizer(style, pulse, 80, 14, null, playback, theme);
const text = (style: ReceiverStyle, pulse = 80): string => frame(style, pulse).map(row => row.text).join('\n');

describe('atelier receivers', () => {
  it('registers distinct, animated signature scenes', () => {
    expect(styles).toHaveLength(6);
    const signatures = new Set<string>();
    for (const style of styles) {
      expect(receiverStyleNames).toContain(style);
      const frames = [0, 12, 45, 110, 240].map(pulse => JSON.stringify(frame(style, pulse)));
      expect(new Set(frames).size, style).toBeGreaterThanOrEqual(4);
      signatures.add(frames[2]!);
    }
    expect(signatures.size).toBe(styles.length);
  });

  it('fits tiny, narrow, tall and wide viewports with consistent segment widths', () => {
    for (const style of styles) {
      for (const [width, height] of [[1, 1], [2, 2], [9, 3], [20, 4], [23, 5], [64, 7], [80, 14], [160, 24], [12, 30]]) {
        for (const theme of ['violet', 'mono'] as const) {
          const rows = buildVisualizer(style, 29, width!, height!, null, playback, theme, 'micro');
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
        expect(lit / (80 * 14), `${style} @ ${pulse}`).toBeGreaterThan(0.05);
      }
    }
  });

  it('follows theme colors and stays neutral greyscale on mono', () => {
    for (const style of styles) {
      expect(frame(style, 48, 'ruby'), style).not.toEqual(frame(style, 48, 'blue'));
      for (const row of frame(style, 48, 'mono')) {
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

  it('replays deterministic physics and renders signature scene details', () => {
    const pinA = JSON.stringify(frame('pinball', 140));
    frame('pinball', 1800); frame('pinball', 20);
    expect(JSON.stringify(frame('pinball', 140))).toBe(pinA);

    expect(text('astrolabe')).toMatch(/ASTROLABE[\s\S]*ALT[\s\S]*AZM/);
    expect(text('pinball')).toMatch(/PINBALL[\s\S]*SCORE[\s\S]*\d{7}/);
    expect(text('tourbillon')).toMatch(/TOURBILLON[\s\S]*28800 VPH[\s\S]*21 JEWELS/);
    expect(text('chess-match', 220)).toMatch(/OPERA GAME 1858[\s\S]*1\. e4 e5[\s\S]*[♔♕♖♗♘♙]/);
    expect(text('chess-match', 560)).toMatch(/17\. Rd8#[\s\S]*CHECKMATE/);
  });
});

import {describe, expect, it} from 'vitest';
import type {PlaybackState, ReceiverStyle} from '../../types.js';
import type {ReceiverData} from './cell-canvas.js';
import {buildVisualizer} from './receiver-visualizers.js';

const playback: PlaybackState = {state: 'playing', backend: 'mpv', volume: 70, muted: false, ready: true};
const frame = (style: ReceiverStyle, pulse: number, data?: ReceiverData, width = 80, height = 14) =>
  buildVisualizer(style, pulse, width, height, null, playback, 'violet', 'standard', data);
const text = (rows: ReturnType<typeof frame>) => rows.map(row => row.text).join('\n');

describe('receiver clocks and continuous scenes', () => {
  it('uses San Francisco daylight across midnight and the seasons', () => {
    const live = (iso: string) => frame('golden-gate-live', 19, {nowMs: Date.parse(iso)});
    const night = frame('golden-gate-night', 19);
    expect(live('2026-01-01T07:59:59Z')).toEqual(night);
    expect(live('2026-01-01T08:00:00Z')).toEqual(night);
    expect(live('2026-07-01T06:59:59Z')).toEqual(night);
    expect(live('2026-07-01T07:00:00Z')).toEqual(night);
    const dawn = live('2026-01-01T16:00:00Z');
    const noon = live('2026-01-01T20:00:00Z');
    const sunset = live('2026-01-02T00:58:00Z');
    expect(new Set([night, dawn, noon, sunset].map(rows => JSON.stringify(rows))).size).toBe(4);
    expect(live('2026-01-02T03:00:00Z')).toEqual(night);
    expect(live('2026-07-01T03:00:00Z')).not.toEqual(night);
    const atTransition = live('2026-01-02T00:57:59Z');
    const palette = (rows: typeof sunset) => rows.flatMap(row => row.segments!.flatMap(segment =>
      Array.from(segment.text, () => [segment.color, segment.backgroundColor ?? segment.color]).flat()));
    const before = palette(atTransition), after = palette(sunset);
    const colorChange = before.reduce((sum, color, i) =>
      sum + [1, 3, 5].reduce((delta, offset) =>
        delta + Math.abs(parseInt(color.slice(offset, offset + 2), 16) - parseInt(after[i]!.slice(offset, offset + 2), 16)), 0), 0);
    expect(colorChange / (before.length * 3)).toBeLessThan(1);
  });

  it('lowers each Workshop press to the gift lid as it passes underneath', () => {
    const column = (pulse: number, x: number) => frame('workshop', pulse).flatMap(row => {
      const pixels = row.segments!.flatMap(segment => Array.from(segment.text, glyph =>
        [glyph === '▀' ? segment.color : segment.backgroundColor, segment.backgroundColor]));
      return pixels[x]!;
    });
    const wrapRest = column(0, 26);
    const wrapContact = column(4, 26);
    expect(wrapContact.indexOf('#d8283c')).toBeGreaterThan(wrapRest.indexOf('#d8283c'));
    expect(wrapContact.slice(13, 16)).toEqual(['#d8283c', '#d8283c', '#6b4a2d']);
    expect(column(5, 26)[15]).toBe('#1f8f4d');
    const bowRest = column(4, 53);
    const bowContact = column(9, 53);
    expect(bowContact.indexOf('#f6c453')).toBeGreaterThan(bowRest.indexOf('#f6c453'));
    expect(bowContact.slice(10, 13)).toEqual(['#f6c453', '#f6c453', '#f2f6fb']);
  });

  it('shows real time values even in narrow terminals', () => {
    const nowMs = new Date(2026, 1, 5, 23, 48).getTime();
    expect(text(frame('nixie-deck', 90, {nowMs}, 20, 6))).toContain('23:48');
    expect(text(frame('segment-clock', 90, {stopwatchSeconds: 0}, 20, 6))).toContain('00:00');
    expect(text(frame('segment-clock', 0, {stopwatchSeconds: 6001}, 20, 6))).toContain('100:01');
    expect(text(frame('minidisc', 0, {streamSeconds: 3661}, 20, 6))).toContain('1:01:01');
    expect(text(frame('minidisc', 0, {title: 'Björk - Jóga', paused: true}))).toMatch(/PAUSE[\s\S]*Bjork - Joga/);
    const minute = (listeningSeconds: number, pulse = 0) => frame('odometer', pulse, {listeningSeconds});
    expect(minute(59)).toEqual(minute(0));
    expect(minute(60)).not.toEqual(minute(59));
    expect(minute(119, 300)).toEqual(minute(60));
  });
});

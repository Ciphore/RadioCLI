import {describe, expect, it} from 'vitest';
import type {PlaybackState, ReceiverStyle} from '../../types.js';
import {displayWidth} from '../format.js';
import {buildVisualizer} from './receiver-visualizers.js';
import {deckReceiverBuilders} from './deck-receivers.js';
import {reverieReceiverBuilders} from './reverie-receivers.js';
import {yuletideReceiverBuilders} from './yuletide-receivers.js';
import {arcadeReceiverBuilders} from './arcade-receivers.js';
import {everydayReceiverBuilders} from './everyday-receivers.js';
import {gtaReceiverBuilders} from './gta-receivers.js';
import {museReceiverBuilders} from './muse-receivers.js';
import {boldReceiverBuilders} from './bold-receivers.js';
import {encoreReceiverBuilders} from './encore-receivers.js';
import {cityscapeReceiverBuilders} from './cityscape-receivers.js';
import {wonderReceiverBuilders} from './wonder-receivers.js';
import {receiverStyleNames} from './receiver-style-registry.js';

const sets = {yuletide: yuletideReceiverBuilders, deck: deckReceiverBuilders, reverie: reverieReceiverBuilders, arcade: arcadeReceiverBuilders, everyday: everydayReceiverBuilders, gta: gtaReceiverBuilders, muse: museReceiverBuilders, bold: boldReceiverBuilders, encore: encoreReceiverBuilders, cityscape: cityscapeReceiverBuilders, wonder: wonderReceiverBuilders};
const playback: PlaybackState = {state: 'playing', backend: 'mpv', message: 'playing', volume: 70, muted: false, ready: true};
const frame = (style: ReceiverStyle, pulse: number, theme: 'violet' | 'mono' | 'ruby' = 'violet') => buildVisualizer(style, pulse, 80, 14, null, playback, theme);
const text = (style: ReceiverStyle, pulse = 60): string => frame(style, pulse).map(row => row.text).join('\n');

describe.each(Object.entries(sets))('%s receivers', (_, builders) => {
  const styles = Object.keys(builders) as ReceiverStyle[];

  it('registers distinct, animated scenes', () => {
    expect(styles.length).toBeGreaterThanOrEqual(3);
    const signatures = new Set<string>();
    for (const style of styles) {
      expect(receiverStyleNames).toContain(style);
      const frames = [0, 7, 40, 90, 200].map(pulse => JSON.stringify(frame(style, pulse)));
      expect(new Set(frames).size, style).toBeGreaterThanOrEqual(3);
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
            expect(row.text.length, style).toBe(width);
            expect(displayWidth(row.text), style).toBe(width);
            expect(row.segments?.map(segment => segment.text).join('')).toBe(row.text);
            expect(row.segments?.every(segment => /^#[0-9a-f]{6}$/i.test(segment.color))).toBe(true);
          }
        }
      }
    }
  }, 30_000);

  it('never leaves the panel bare', () => {
    for (const style of styles) {
      for (const pulse of [0, 5, 31, 64, 200, 899, 5000]) {
        const lit = frame(style, pulse).reduce((total, row) => total + (row.segments ?? [])
          .reduce((sum, segment) => sum + (segment.backgroundColor ? segment.text.length : segment.text.replace(/\s/g, '').length), 0), 0);
        expect(lit / (80 * 14), `${style} @ ${pulse}`).toBeGreaterThan(0.02);
      }
    }
  });
});

describe('late receiver details', () => {
  it('shows the furniture of each old machine', () => {
    expect(text('head-unit')).toMatch(/FM1[\s\S]*MHz[\s\S]* 1 /);
    expect(text('winamp')).toMatch(/RADIOCLI[\s\S]*\d\d:\d\d[\s\S]*kbps[\s\S]*EQUALIZER/);
    expect(text('vu-needles')).toMatch(/-20[\s\S]*VU/);
    expect(text('graphic-eq')).toMatch(/32 +64 +125/);
    expect(text('dial-scale')).toMatch(/92 +94 +96[\s\S]*SIGNAL/);
    expect(text('compact-disc')).toMatch(/TRACK +\d\d/);
    expect(text('led-ladder')).toMatch(/L +▮+[\s\S]*R +▮+/);
    expect(text('vfd-spectrum')).toMatch(/▬/);
  });

  it('plays its games and keeps its small promises', () => {
    expect(text('falling-blocks', 300)).toMatch(/LINES\n? *[\s\S]*\d{5}/);
    expect(text('heartbeat')).toMatch(/[♥♡].{1,3}60 bpm/);
    expect(text('breathe', 20)).toMatch(/breathe in/);
    expect(text('breathe', 60)).toMatch(/hold/);
    expect(text('breathe', 100)).toMatch(/breathe out/);
    expect(text('progress-bars', 400)).toMatch(/\d+%|ok/);
    expect(text('typewriter', 200)).toMatch(/the radio is on in the next room/);
    expect(text('advent-calendar', 10)).toMatch(/24/);
    // Replayed simulations give the same frame however the pulse was reached.
    for (const style of ['falling-blocks', 'game-of-life'] as const) {
      const first = JSON.stringify(frame(style, 120));
      frame(style, 2000); frame(style, 30);
      expect(JSON.stringify(frame(style, 120)), style).toBe(first);
    }
  });

  it('shows what the newest machines are for', () => {
    expect(text('space-invaders')).toMatch(/SCORE \d{5}[\s\S]*WAVE \d\d/);
    expect(text('drum-machine')).toMatch(/120 BPM[\s\S]*KICK[\s\S]*SNARE[\s\S]*HAT/);
    expect(text('boot-sequence', 60)).toMatch(/Memory Test: \d{5}K OK/);
    expect(text('boot-sequence', 200)).toMatch(/Starting RADIO-DOS[\s\S]*C:\\>radiocli/);
    expect(text('hex-dump')).toMatch(/^[0-9A-F]{6}  ([0-9A-F]{2} ){8}/m);
    expect(text('telegraph')).toMatch(/━[\s\S]*[A-Z]/);
    expect(text('elevator')).toMatch(/01 +│/);
    expect(text('weather-radar')).toMatch(/WX RADAR[\s\S]*AZ \d{3}°/);
    expect(text('sonar')).toMatch(/PING \d{3}[\s\S]*◆/);
    expect(text('seismograph')).toMatch(/SEISMO +M \d\.\d/);
  });

  it('keeps Christmas in its own colours and greys it on mono', () => {
    for (const style of Object.keys(yuletideReceiverBuilders) as ReceiverStyle[]) {
      for (const color of frame(style, 60, 'mono').flatMap(row => (row.segments ?? []).flatMap(segment => [segment.color, segment.backgroundColor ?? '']))) {
        if (color) expect(new Set([color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)]).size, `${style} ${color}`).toBe(1);
      }
    }
  });
});

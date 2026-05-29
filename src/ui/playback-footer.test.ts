import {describe, expect, it} from 'vitest';
import type {PlaybackState, Station} from '../types.js';
import {playbackFooterText, shouldShowPlaybackFooter} from './playback-footer.js';

const station: Station = {
  id: 'radio-paradise',
  provider: 'radio-browser',
  name: 'Radio Paradise',
  country: 'The United States Of America',
  state: 'California',
  tags: ['eclectic'],
  codec: 'OGG',
  bitrate: 192,
  language: 'english',
  distanceKm: 150
};

const playback: PlaybackState = {
  backend: 'mpv',
  state: 'playing',
  volume: 70,
  muted: false,
  ready: true
};

describe('playback footer', () => {
  it('shows active playback states and hides inactive states', () => {
    expect(shouldShowPlaybackFooter(station, playback)).toBe(true);
    expect(shouldShowPlaybackFooter(station, {...playback, state: 'paused'})).toBe(true);
    expect(shouldShowPlaybackFooter(station, {...playback, state: 'loading'})).toBe(false);
    expect(shouldShowPlaybackFooter(station, {...playback, state: 'error'})).toBe(false);
    expect(shouldShowPlaybackFooter(station, {...playback, state: 'stopped'})).toBe(false);
    expect(shouldShowPlaybackFooter(null, playback)).toBe(false);
  });

  it('keeps active playback footer concise', () => {
    const text = playbackFooterText({
      station,
      playback,
      metadata: {title: 'Artist - Track', updatedAt: '2026-05-24T09:00:00.000Z'},
      queue: {
        title: 'Nearby',
        sourceScreen: 'nearby',
        sourceContextKey: 'nearby',
        stations: [{...station, id: 'kiis'}, station, {...station, id: 'kroq'}]
      },
      favorite: true,
      sleepLabel: 'Sleep 29m',
      width: 240
    });

    expect(text).toBe('Radio Paradise · Artist - Track · vol 70 · Sleep 29m');
    expect(text).not.toContain('Now:');
    expect(text).not.toContain('California');
    expect(text).not.toContain('mpv');
    expect(text).not.toContain('Nearby');
    expect(text).toContain('Sleep 29m');
  });

  it('truncates to the available footer width', () => {
    const text = playbackFooterText({
      station,
      playback,
      metadata: null,
      queue: null,
      favorite: false,
      sleepLabel: 'Sleep off',
      width: 16
    });

    expect(text).toHaveLength(16);
    expect(text?.endsWith('…')).toBe(true);
  });
});

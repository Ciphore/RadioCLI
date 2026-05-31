import {describe, expect, it} from 'vitest';
import type {PlaybackState, Station} from '../types.js';
import {
  loadingSpinnerFrame,
  loadingSpinnerFrames,
  playbackFooterText,
  shouldShowPlaybackFooter
} from './playback-footer.js';

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
  it('shows active and loading playback states and hides inactive states', () => {
    expect(shouldShowPlaybackFooter(station, playback)).toBe(true);
    expect(shouldShowPlaybackFooter(station, {...playback, state: 'paused'})).toBe(true);
    expect(shouldShowPlaybackFooter(station, {...playback, state: 'loading'})).toBe(true);
    expect(shouldShowPlaybackFooter(station, {...playback, state: 'error'})).toBe(false);
    expect(shouldShowPlaybackFooter(station, {...playback, state: 'stopped'})).toBe(false);
    expect(shouldShowPlaybackFooter(null, playback)).toBe(false);
  });

  it('shows a loading station from player state before the React station is set', () => {
    // Fresh tune: playingStation is still null, but the player knows the name.
    expect(
      shouldShowPlaybackFooter(null, {...playback, state: 'loading', stationName: 'KEXP'})
    ).toBe(true);
  });

  it('prefixes the station name with a square spinner frame while loading', () => {
    const text = playbackFooterText({
      station: null,
      playback: {...playback, state: 'loading', stationName: 'KEXP'},
      metadata: null,
      queue: null,
      favorite: false,
      sleepLabel: 'Sleep off',
      width: 240,
      spinnerFrame: 2
    });

    expect(text).toBe(`${loadingSpinnerFrame(2)} KEXP · buffering… · vol 70`);
    expect(loadingSpinnerFrames).toContain(loadingSpinnerFrame(2));
  });

  it('wraps and normalizes spinner frame indices', () => {
    expect(loadingSpinnerFrame(0)).toBe(loadingSpinnerFrames[0]);
    expect(loadingSpinnerFrame(loadingSpinnerFrames.length)).toBe(loadingSpinnerFrames[0]);
    expect(loadingSpinnerFrame(-1)).toBe(loadingSpinnerFrames[loadingSpinnerFrames.length - 1]);
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

  it('shows the active AirPlay receiver before volume', () => {
    const text = playbackFooterText({
      station,
      playback: {...playback, backend: 'airplay', airPlayDeviceName: 'Office'},
      metadata: {title: 'Artist - Track', updatedAt: '2026-05-24T09:00:00.000Z'},
      queue: null,
      favorite: false,
      sleepLabel: 'Sleep off',
      width: 240
    });

    expect(text).toBe('Radio Paradise · Artist - Track · AirPlay Office · vol 70');
  });

  it('falls back to an AirPlay output label when the receiver name is not known', () => {
    const text = playbackFooterText({
      station,
      playback: {...playback, backend: 'airplay'},
      metadata: null,
      queue: null,
      favorite: false,
      sleepLabel: 'Sleep off',
      width: 240
    });

    expect(text).toBe('Radio Paradise · AirPlay · vol 70');
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

import {describe, expect, it} from 'vitest';
import type {Station} from '../types.js';
import {
  activeTabForScreen,
  addMediaKeyBinding,
  applyStationFilters,
  applyTextInput,
  defaultExploreCursor,
  favoriteTarget,
  formatExploreCursor,
  mediaTransportActionForInput,
  moveExploreCursor,
  nextSleepTimerMinutes,
  normalizeMediaKeyBindings,
  shouldHandleKeyboardEvent,
  shouldAnimateReceiver,
  stationContextKeyForScreen,
  topTabs
} from './app-state.js';
import type {PlaybackState} from '../types.js';

const station: Station = {
  id: 'station-1',
  provider: 'radio-browser',
  name: 'Test FM',
  tags: [],
  codec: 'MP3',
  bitrate: 128,
  language: 'English'
};

const playingPlayback: PlaybackState = {
  backend: 'mpv',
  state: 'playing',
  volume: 70,
  muted: false,
  ready: true
};

describe('app state helpers', () => {
  it('orders top tabs around listening first, then library and discovery', () => {
    expect(topTabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Playing',
      'Library',
      'Explore',
      'Search',
      'Countries',
      'Nearby',
      'Stats',
      'Settings'
    ]);
  });

  it('keeps station-context screens mapped explicitly', () => {
    expect(stationContextKeyForScreen('explore')).toBe('explore');
    expect(stationContextKeyForScreen('stations')).toBe('stations');
    expect(stationContextKeyForScreen('library')).toBe('library');
    expect(stationContextKeyForScreen('map')).toBeNull();
    expect(activeTabForScreen('stations')).toBe('countries');
    expect(activeTabForScreen('map')).toBe('countries');
  });

  it('filters station lists consistently with command filters', () => {
    expect(applyStationFilters([station], {codec: 'mp3', language: 'eng', minBitrate: 64})).toHaveLength(1);
    expect(applyStationFilters([station], {codec: 'aac', language: null, minBitrate: null})).toHaveLength(0);
    expect(applyStationFilters([station], {codec: null, language: null, minBitrate: 192})).toHaveLength(0);
  });

  it('targets favorites based on the active screen', () => {
    const playing = {...station, id: 'playing'};
    expect(favoriteTarget('library', station, playing)?.id).toBe('station-1');
    expect(favoriteTarget('search', station, playing)?.id).toBe('station-1');
    expect(favoriteTarget('now-playing', station, playing)?.id).toBe('playing');
    expect(favoriteTarget('settings', null, playing)?.id).toBe('playing');
  });

  it('applies terminal text editing without control-key leakage', () => {
    expect(applyTextInput('abc', '', {backspace: true})).toBe('ab');
    expect(applyTextInput('abc', 'd', {})).toBe('abcd');
    expect(applyTextInput('abc', 'x', {ctrl: true})).toBe('abc');
  });

  it('ignores Kitty release events for command handling', () => {
    expect(shouldHandleKeyboardEvent(undefined)).toBe(true);
    expect(shouldHandleKeyboardEvent('press')).toBe(true);
    expect(shouldHandleKeyboardEvent('repeat')).toBe(true);
    expect(shouldHandleKeyboardEvent('release')).toBe(false);
  });

  it('maps terminal function-key transport sequences', () => {
    expect(mediaTransportActionForInput('\u001B[18~')).toBe('previous');
    expect(mediaTransportActionForInput('\u001B[19~')).toBe('playPause');
    expect(mediaTransportActionForInput('\u001B[20~')).toBe('next');
    expect(mediaTransportActionForInput('\u001B[20;2~')).toBe('next');
    expect(mediaTransportActionForInput('\u001B[57436;1u')).toBe('previous');
    expect(mediaTransportActionForInput('\u001B[57430;1u')).toBe('playPause');
    expect(mediaTransportActionForInput('\u001B[57435;1u')).toBe('next');
    expect(mediaTransportActionForInput('\u001B[57435;1:1u')).toBe('next');
    expect(mediaTransportActionForInput('\u001B[57435;1:2u')).toBe('next');
    expect(mediaTransportActionForInput('\u001B[57435;1:3u')).toBeNull();
    expect(mediaTransportActionForInput('\u001B[1;2D')).toBe('previous');
    expect(mediaTransportActionForInput('\u001B[1;2C')).toBe('next');
    expect(mediaTransportActionForInput('n')).toBeNull();
  });

  it('uses learned transport bindings when the terminal emits custom input', () => {
    const mediaKeys = addMediaKeyBinding(normalizeMediaKeyBindings(null), 'next', '\u001B[custom-next');
    expect(mediaTransportActionForInput('\u001B[custom-next', mediaKeys)).toBe('next');
  });

  it('cycles sleep timer through off instead of skipping it', () => {
    expect(nextSleepTimerMinutes(null)).toBe(15);
    expect(nextSleepTimerMinutes(15)).toBe(30);
    expect(nextSleepTimerMinutes(30)).toBe(60);
    expect(nextSleepTimerMinutes(60)).toBeNull();
  });

  it('moves the explore cursor around the globe and wraps longitude', () => {
    expect(formatExploreCursor(defaultExploreCursor)).toBe('48.9N, 2.4E');
    expect(moveExploreCursor({latitude: 83, longitude: 176}, 'up')).toEqual({latitude: 84, longitude: 176});
    expect(moveExploreCursor({latitude: -83, longitude: -176}, 'down')).toEqual({latitude: -84, longitude: -176});
    expect(moveExploreCursor({latitude: 0, longitude: 176}, 'right')).toEqual({latitude: 0, longitude: 178});
    expect(moveExploreCursor({latitude: 0, longitude: -176}, 'left', true)).toEqual({latitude: 0, longitude: 172});
  });

  it('animates the receiver only while playback is actively playing', () => {
    expect(shouldAnimateReceiver('now-playing', playingPlayback)).toBe(true);
    expect(shouldAnimateReceiver('now-playing', {...playingPlayback, state: 'paused'})).toBe(false);
    expect(shouldAnimateReceiver('now-playing', {...playingPlayback, state: 'stopped', ready: false})).toBe(false);
    expect(shouldAnimateReceiver('now-playing', {...playingPlayback, state: 'idle', ready: false})).toBe(false);
    expect(shouldAnimateReceiver('search', playingPlayback)).toBe(false);
  });
});

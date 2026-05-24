import {describe, expect, it} from 'vitest';
import type {Station} from '../types.js';
import {
  activeTabForScreen,
  addMediaKeyBinding,
  applyStationFilters,
  applyTextInput,
  favoriteTarget,
  mediaTransportActionForInput,
  normalizeMediaKeyBindings,
  stationContextKeyForScreen
} from './app-state.js';

const station: Station = {
  id: 'station-1',
  provider: 'radio-browser',
  name: 'Test FM',
  tags: [],
  codec: 'MP3',
  bitrate: 128,
  language: 'English'
};

describe('app state helpers', () => {
  it('keeps station-context screens mapped explicitly', () => {
    expect(stationContextKeyForScreen('explore')).toBe('explore');
    expect(stationContextKeyForScreen('stations')).toBe('stations');
    expect(stationContextKeyForScreen('map')).toBeNull();
    expect(activeTabForScreen('stations')).toBe('explore');
  });

  it('filters station lists consistently with command filters', () => {
    expect(applyStationFilters([station], {codec: 'mp3', language: 'eng', minBitrate: 64})).toHaveLength(1);
    expect(applyStationFilters([station], {codec: 'aac', language: null, minBitrate: null})).toHaveLength(0);
    expect(applyStationFilters([station], {codec: null, language: null, minBitrate: 192})).toHaveLength(0);
  });

  it('targets favorites based on the active screen', () => {
    const playing = {...station, id: 'playing'};
    expect(favoriteTarget('search', station, playing)?.id).toBe('station-1');
    expect(favoriteTarget('now-playing', station, playing)?.id).toBe('playing');
    expect(favoriteTarget('settings', null, playing)?.id).toBe('playing');
  });

  it('applies terminal text editing without control-key leakage', () => {
    expect(applyTextInput('abc', '', {backspace: true})).toBe('ab');
    expect(applyTextInput('abc', 'd', {})).toBe('abcd');
    expect(applyTextInput('abc', 'x', {ctrl: true})).toBe('abc');
  });

  it('maps terminal function-key transport sequences', () => {
    expect(mediaTransportActionForInput('\u001B[18~')).toBe('previous');
    expect(mediaTransportActionForInput('\u001B[19~')).toBe('playPause');
    expect(mediaTransportActionForInput('\u001B[20~')).toBe('next');
    expect(mediaTransportActionForInput('\u001B[20;2~')).toBe('next');
    expect(mediaTransportActionForInput('\u001B[57436;1u')).toBe('previous');
    expect(mediaTransportActionForInput('\u001B[57430;1u')).toBe('playPause');
    expect(mediaTransportActionForInput('\u001B[57435;1u')).toBe('next');
    expect(mediaTransportActionForInput('\u001B[1;2D')).toBe('previous');
    expect(mediaTransportActionForInput('\u001B[1;2C')).toBe('next');
    expect(mediaTransportActionForInput('n')).toBeNull();
  });

  it('uses learned transport bindings when the terminal emits custom input', () => {
    const mediaKeys = addMediaKeyBinding(normalizeMediaKeyBindings(null), 'next', '\u001B[custom-next');
    expect(mediaTransportActionForInput('\u001B[custom-next', mediaKeys)).toBe('next');
  });
});

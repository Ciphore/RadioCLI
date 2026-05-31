import {describe, expect, it} from 'vitest';
import type {PlaybackState} from '../../types.js';
import {isAirPlayCodePromptActive} from './AirPlayCodeScreen.js';

const playback: PlaybackState = {
  backend: 'airplay',
  state: 'loading',
  volume: 70,
  muted: false,
  ready: false
};

describe('AirPlay code screen helpers', () => {
  it('recognizes the active AirPlay passcode prompt', () => {
    expect(isAirPlayCodePromptActive({
      ...playback,
      message: 'AirPlay code required. Use :airplay-code 1234.'
    })).toBe(true);

    expect(isAirPlayCodePromptActive({...playback, message: 'AirPlay code sent.'})).toBe(false);
    expect(isAirPlayCodePromptActive({...playback, backend: 'mpv'})).toBe(false);
  });
});

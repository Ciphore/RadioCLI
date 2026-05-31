import {describe, expect, it} from 'vitest';
import type {AppSettings, PlaybackDiagnostics} from '../types.js';
import {audioOutputLabel, audioOutputSettingValue, resolvedAudioOutput} from './audio-output.js';

describe('audio output helpers', () => {
  it('uses user-facing labels for playback outputs', () => {
    expect(audioOutputLabel('auto')).toBe('Automatic');
    expect(audioOutputLabel('mpv')).toBe('This device (mpv)');
    expect(audioOutputLabel('ffplay')).toBe('This device (ffplay fallback)');
    expect(audioOutputLabel('airplay')).toBe('AirPlay');
  });

  it('resolves automatic output to the best installed local option', () => {
    expect(resolvedAudioOutput('auto', ['mpv', 'airplay'])).toBe('mpv');
    expect(resolvedAudioOutput('auto', ['airplay'])).toBeNull();
    expect(resolvedAudioOutput('auto', [])).toBeNull();
  });

  it('shows when the selected output differs from the active stream', () => {
    expect(
      audioOutputSettingValue(
        settings({preferredBackend: 'mpv'}),
        diagnostics({active: true, backend: 'airplay'}),
        ['mpv', 'airplay']
      )
    ).toBe('This device (mpv) · currently AirPlay');
  });
});

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    theme: 'green',
    receiverStyle: 'pulse-grid',
    receiverStyleVersion: 2,
    volume: 70,
    enableRadioGarden: false,
    enableNearbyLocation: false,
    preferredBackend: 'auto',
    tuneTimeoutSeconds: 12,
    skipBrokenStreams: true,
    mediaKeys: {previous: [], playPause: [], next: []},
    ...overrides
  };
}

function diagnostics(overrides: Partial<PlaybackDiagnostics> = {}): PlaybackDiagnostics {
  return {
    backend: 'mpv',
    availableBackends: ['mpv'],
    preferredBackend: 'mpv',
    active: false,
    volume: 70,
    muted: false,
    ready: true,
    ...overrides
  };
}

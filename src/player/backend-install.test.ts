import {describe, expect, it} from 'vitest';
import {detectPlaybackBackends, mpvInstallCommand, playbackBackendCapabilities, playbackBackendLabel, playbackBackendStatusLines} from './backend-install.js';

describe('playback backend install guidance', () => {
  it('uses Homebrew for macOS mpv guidance', () => {
    expect(mpvInstallCommand('darwin')).toBe('brew install mpv');
  });

  it('uses apt for Debian-like Linux mpv guidance', () => {
    expect(mpvInstallCommand('linux', 'ID=ubuntu\nID_LIKE=debian\n')).toBe('sudo apt install mpv');
  });

  it('uses dnf for Fedora-like Linux mpv guidance', () => {
    expect(mpvInstallCommand('linux', 'ID=fedora\n')).toBe('sudo dnf install mpv');
  });

  it('uses winget for native Windows mpv guidance', () => {
    expect(mpvInstallCommand('win32')).toBe('winget install --id shinchiro.mpv -e');
  });

  it('reports npm and native playback responsibilities separately', () => {
    expect(playbackBackendStatusLines([], 'darwin')).toEqual([
      'playback=missing',
      'playback_backend=none',
      'controls=missing',
      'controls_hint=install mpv for playback and controls',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'install_mpv=brew install mpv',
      'optional_ffplay=brew install ffmpeg'
    ]);
  });

  it('reports native Windows playback setup with winget commands', () => {
    expect(playbackBackendStatusLines([], 'win32')).toEqual([
      'playback=missing',
      'playback_backend=none',
      'controls=missing',
      'controls_hint=install mpv for playback and controls',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'install_mpv=winget install --id shinchiro.mpv -e',
      'optional_ffplay=winget install --id Gyan.FFmpeg -e'
    ]);
  });

  it('prefers mpv when available', () => {
    expect(playbackBackendStatusLines(['ffplay', 'mpv'], 'darwin')).toEqual([
      'playback=ready',
      'playback_backend=mpv',
      'controls=full',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'install_mpv=brew install mpv',
      'optional_ffplay=brew install ffmpeg'
    ]);
  });

  it('only reports AirPlay when macOS tools and the bundled sender are available', () => {
    const hasCommand = (command: string): boolean => ['ffmpeg', 'dns-sd'].includes(command);

    expect(detectPlaybackBackends({platform: 'darwin', hasCommand, hasAirPlaySender: () => false})).toEqual([]);
    expect(detectPlaybackBackends({platform: 'darwin', hasCommand, hasAirPlaySender: () => true})).toEqual(['airplay']);
    expect(detectPlaybackBackends({platform: 'linux', hasCommand, hasAirPlaySender: () => true})).toEqual([]);
  });

  it('reports AirPlay as limited output-only playback when it is the only backend', () => {
    expect(playbackBackendStatusLines(['airplay'], 'darwin')).toEqual([
      'playback=airplay-only',
      'playback_backend=airplay',
      'controls=airplay-limited',
      'controls_hint=AirPlay supports volume and mute; pause is not supported',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'install_mpv=brew install mpv',
      'optional_ffplay=brew install ffmpeg'
    ]);
    expect(playbackBackendLabel('airplay')).toBe('AirPlay');
    expect(playbackBackendCapabilities('airplay')).toMatchObject({
      supportsPause: false,
      supportsMute: true,
      supportsVolume: true,
      supportsMediaKeys: false
    });
  });

  it('reports ffplay as fallback playback with limited controls', () => {
    expect(playbackBackendStatusLines(['ffplay'], 'darwin')).toEqual([
      'playback=fallback-only',
      'playback_backend=ffplay',
      'controls=limited',
      'controls_hint=install mpv for pause, mute, volume, and media keys',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'install_mpv=brew install mpv',
      'optional_ffplay=brew install ffmpeg'
    ]);
    expect(playbackBackendLabel('ffplay')).toBe('ffplay fallback');
    expect(playbackBackendCapabilities('ffplay')).toMatchObject({
      supportsPause: false,
      supportsMute: false,
      supportsVolume: false,
      supportsMediaKeys: false
    });
  });
});

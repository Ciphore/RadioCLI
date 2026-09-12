import {describe, expect, it} from 'vitest';
import {detectPlaybackBackends, playbackBackendInstallHint, playbackBackendCapabilities, playbackBackendLabel, playbackBackendStatusLines} from './backend-install.js';
import {mpvInstallCommand} from '../platform/packages.js';

const hintOptions = {hasCommand: () => true, getUid: () => 1000};

describe('playback backend install guidance', () => {
  it('uses Homebrew for macOS mpv guidance', () => {
    expect(mpvInstallCommand('darwin', '', {}, hintOptions)).toBe('brew install mpv');
  });

  it('uses apt for Debian-like Linux mpv guidance', () => {
    expect(mpvInstallCommand('linux', 'ID=ubuntu\nID_LIKE=debian\n', {}, hintOptions)).toBe('sudo apt-get install -y mpv');
  });

  it('uses dnf for Fedora-like Linux mpv guidance', () => {
    expect(mpvInstallCommand('linux', 'ID=fedora\n', {}, hintOptions)).toBe('sudo dnf install -y mpv');
  });

  it('uses winget for native Windows mpv guidance', () => {
    expect(mpvInstallCommand('win32', '', {}, hintOptions)).toBe('winget install --id shinchiro.mpv -e --accept-package-agreements --accept-source-agreements');
  });

  it.each([
    ['freebsd', 'pkg install -y mpv'], ['openbsd', 'sudo pkg_add -I mpv'], ['netbsd', 'pkgin -y install mpv']
  ] as const)('describes the explicit %s mpv installation path', (platform, command) => {
    expect(mpvInstallCommand(platform, '', {}, hintOptions)).toContain(command);
  });

  it('reports npm and native playback responsibilities separately', () => {
    expect(playbackBackendStatusLines([], 'darwin', '', hintOptions)).toEqual([
      'playback=missing',
      'playback_backend=none',
      'controls=missing',
      'controls_hint=install mpv for playback and controls',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'guided_setup=radiocli setup',
      'install_mpv=brew install mpv',
      'optional_ffplay=brew install ffmpeg'
    ]);
  });

  it('reports native Windows playback setup with winget commands', () => {
    expect(playbackBackendStatusLines([], 'win32', '', hintOptions)).toEqual([
      'playback=missing',
      'playback_backend=none',
      'controls=missing',
      'controls_hint=install mpv for playback and controls',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'guided_setup=radiocli setup',
      'install_mpv=winget install --id shinchiro.mpv -e --accept-package-agreements --accept-source-agreements',
      'optional_ffplay=winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements'
    ]);
  });

  it.each([{backends: []}, {backends: ['ffplay']}, {backends: ['vlc']}, {backends: ['mpv']}])('keeps diagnostics on the available Scoop route for backends $backends', ({backends}) => {
    const options = {hasCommand: (command: string) => command === 'scoop', getUid: () => undefined};
    const lines = playbackBackendStatusLines(backends, 'win32', '', options);
    expect(lines).toContain('install_mpv=scoop install mpv (first run scoop bucket add extras)');
    expect(lines).toContain('optional_ffplay=scoop install ffmpeg');
    expect(lines.join(' ')).not.toContain('winget');
    expect(playbackBackendInstallHint('win32', '', options)).toContain('scoop install mpv');
  });

  it('prefers mpv when available', () => {
    expect(playbackBackendStatusLines(['ffplay', 'mpv'], 'darwin', '', hintOptions)).toEqual([
      'playback=ready',
      'playback_backend=mpv',
      'controls=full',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'guided_setup=radiocli setup',
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
    expect(playbackBackendStatusLines(['airplay'], 'darwin', '', hintOptions)).toEqual([
      'playback=airplay-only',
      'playback_backend=airplay',
      'controls=airplay-limited',
      'controls_hint=AirPlay supports volume and mute; pause is not supported',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'guided_setup=radiocli setup',
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
    expect(playbackBackendStatusLines(['ffplay'], 'darwin', '', hintOptions)).toEqual([
      'playback=fallback-only',
      'playback_backend=ffplay',
      'controls=limited',
      'controls_hint=install mpv for pause, mute, volume, and media keys',
      'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
      'guided_setup=radiocli setup',
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

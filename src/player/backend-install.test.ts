import {describe, expect, it} from 'vitest';
import {mpvInstallCommand, playbackBackendStatusLines} from './backend-install.js';

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

  it('reports npm and native playback responsibilities separately', () => {
    expect(playbackBackendStatusLines([], 'darwin')).toEqual([
      'playback=missing',
      'playback_backend=none',
      'npm_install=RadioCLI only; native playback comes from mpv or ffplay',
      'install_mpv=brew install mpv',
      'optional_ffplay=brew install ffmpeg'
    ]);
  });

  it('prefers mpv when available', () => {
    expect(playbackBackendStatusLines(['ffplay', 'mpv'], 'darwin')).toEqual([
      'playback=ready',
      'playback_backend=mpv',
      'npm_install=RadioCLI only; native playback comes from mpv or ffplay',
      'install_mpv=brew install mpv',
      'optional_ffplay=brew install ffmpeg'
    ]);
  });
});

import {describe, expect, it} from 'vitest';
import {identifyPlatform, nativeAdapters} from './runtime.js';

describe('platform identity and adapter policy', () => {
  it.each(['darwin', 'win32', 'linux', 'freebsd', 'openbsd', 'netbsd', 'sunos', 'aix', 'haiku'] as const)(
    'identifies %s without borrowing another operating system identity', platform => {
      const host = identifyPlatform({platform, arch: 'x64', env: {}, release: '1', nodeVersion: '22.23.2'});
      expect(host.id).toBe(platform);
      expect(host.platform).toBe(platform);
      expect(host.isWsl).toBe(false);
    }
  );

  it('distinguishes Android/Termux from ordinary Linux and musl', () => {
    expect(identifyPlatform({platform: 'android', env: {TERMUX_VERSION: '0.118.3'}})).toMatchObject({id: 'termux', libc: 'bionic'});
    expect(identifyPlatform({platform: 'linux', env: {TERMUX_VERSION: '0.118.3', PREFIX: '/data/data/com.termux/files/usr'}})).toMatchObject({id: 'termux', libc: 'bionic'});
    expect(identifyPlatform({platform: 'android', env: {}})).toMatchObject({id: 'android', libc: 'bionic'});
    expect(identifyPlatform({platform: 'darwin', env: {TERMUX_VERSION: '0.118.3'}}).id).toBe('darwin');
  });

  it('records WSL and libc independently of Linux adapters', () => {
    const host = identifyPlatform({platform: 'linux', release: '6.6.87.2-microsoft-standard-WSL2', libc: 'glibc', env: {}});
    expect(host).toMatchObject({id: 'linux', isWsl: true, libc: 'glibc'});
    expect(nativeAdapters(host).scheduler).toBe('systemd');
    expect(identifyPlatform({platform: 'linux', release: '6.6', libc: 'musl', env: {}})).toMatchObject({isWsl: false, libc: 'musl'});
  });

  it('records explicit ARM ISA evidence without assuming every arm runtime is ARMv7', () => {
    expect(identifyPlatform({platform: 'linux', arch: 'arm', armVersion: 7, env: {}})).toMatchObject({arch: 'arm', armVersion: 7});
    expect(identifyPlatform({platform: 'linux', arch: 'arm', armVersion: null, env: {}}).armVersion).toBeNull();
    expect(identifyPlatform({platform: 'linux', arch: 'arm64', armVersion: 7, env: {}}).armVersion).toBeNull();
  });

  it('does not invent a native service for BSD, Termux, Haiku, illumos, or AIX', () => {
    for (const platform of ['freebsd', 'openbsd', 'netbsd', 'android', 'haiku', 'sunos', 'aix'] as const) {
      const policy = nativeAdapters(identifyPlatform({platform, env: {}}));
      expect(policy.scheduler, platform).toBeNull();
      expect(policy.inhibitor, platform).toBeNull();
      expect(policy.airPlay, platform).toBe(false);
      expect(policy.ipc, platform).toBe('unix-socket');
      expect(policy.posixPermissions, platform).toBe(true);
    }
  });

  it('preserves the existing macOS, Linux, and Windows adapter selections', () => {
    const host = (platform: NodeJS.Platform) => identifyPlatform({platform, env: {}});
    expect(nativeAdapters(host('darwin'))).toMatchObject({scheduler: 'launchd', inhibitor: 'caffeinate', volume: 'macos', terminal: 'macos', airPlay: true, ipc: 'unix-socket'});
    expect(nativeAdapters(host('linux'))).toMatchObject({scheduler: 'systemd', inhibitor: 'logind', volume: 'unix-audio', terminal: 'unix', airPlay: false, ipc: 'unix-socket'});
    expect(nativeAdapters(host('win32'))).toMatchObject({scheduler: 'task-scheduler', inhibitor: 'windows', volume: 'windows', terminal: 'windows', airPlay: false, ipc: 'named-pipe', posixPermissions: false});
  });

  it.each(['freebsd', 'openbsd', 'netbsd'])('selects a graphical terminal family independently of scheduling on %s', platform => {
    expect(nativeAdapters(identifyPlatform({platform, env: {}}))).toMatchObject({terminal: 'unix', scheduler: null, inhibitor: null});
  });

  it('keeps unknown runtimes explicit rather than calling them Linux', () => {
    const host = identifyPlatform({platform: 'future-os', arch: 'future-cpu', nodeVersion: '24.20.0', env: {}});
    expect(host).toMatchObject({id: 'unknown', platform: 'future-os', arch: 'future-cpu', nodeMajor: 24});
    expect(nativeAdapters(host)).toMatchObject({scheduler: null, inhibitor: null, volume: null, terminal: null, airPlay: false});
  });
});

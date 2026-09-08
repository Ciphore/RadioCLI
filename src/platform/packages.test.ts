import {describe, expect, it} from 'vitest';
import {detectPackageManager, ffplayInstallCommand, mpvInstallCommand, packageCommandInvocation, packageInstallCommand, packageManagerNeedsRoot, packageManagerNotes, platformLabel} from './packages.js';
import {identifyPlatform} from './runtime.js';

describe('native package plans', () => {
  it.each([
    ['freebsd', 'pkg'], ['openbsd', 'pkg_add'], ['netbsd', 'pkgin'], ['sunos', 'pkgin'], ['haiku', 'pkgman']
  ] as const)('selects %s package tools without confusing other Unix commands', (platform, expected) => {
    expect(detectPackageManager(platform, '', () => true)).toBe(expected);
    expect(detectPackageManager(platform, '', () => false)).toBeNull();
  });

  it('does not treat the illumos IPS pkg command as FreeBSD pkg', () => {
    expect(detectPackageManager('sunos', '', command => command === 'pkg')).toBeNull();
  });

  it.each(['android', 'linux'] as const)('keeps Termux pkg distinct on %s and never falls back to a Linux installer', platform => {
    const env = {TERMUX_VERSION: '0.118.3', PREFIX: '/data/data/com.termux/files/usr'};
    expect(detectPackageManager(platform, 'ID=debian', () => true, env)).toBe('termux-pkg');
    expect(detectPackageManager(platform, 'ID=debian', command => command === 'apt', env)).toBeNull();
    expect(platformLabel(platform, '', env)).toBe('Android / Termux');
  });

  it('recognizes the shared Termux prefix without accepting pkg on ordinary Linux or Android', () => {
    expect(detectPackageManager('linux', '', command => command === 'pkg', {PREFIX: '/data/user/10/com.termux/files/usr'})).toBe('termux-pkg');
    expect(detectPackageManager('linux', '', command => command === 'pkg', {})).toBeNull();
    expect(detectPackageManager('android', '', () => true, {})).toBeNull();
    expect(detectPackageManager('freebsd', '', () => true, {TERMUX_VERSION: '0.118.3'})).toBe('pkg');
  });

  it('requires a manual AIX playback installation even when DNF is installed', () => {
    expect(detectPackageManager('aix', '', () => true, {})).toBeNull();
    expect(mpvInstallCommand('aix', '', {})).toContain('no verified AIX');
    expect(ffplayInstallCommand('aix', '', {})).toContain('no verified AIX');
    expect(packageManagerNotes(null, identifyPlatform({platform: 'aix', env: {}})).join(' ')).toContain('RADIOCLI_MPV_PATH');
  });

  it.each(['sudo', 'doas', null] as const)('does not elevate Termux or Haiku package commands with %s', elevation => {
    expect(packageInstallCommand('termux-pkg', 'mpv', {elevation})).toMatchObject({program: 'pkg', args: ['install', '-y', 'mpv']});
    expect(packageInstallCommand('pkgman', 'mpv', {elevation})).toMatchObject({program: 'pkgman', args: ['install', '-y', 'mpv']});
    expect(packageManagerNeedsRoot('termux-pkg')).toBe(false);
    expect(packageManagerNeedsRoot('pkgman')).toBe(false);
  });

  it('plans only verified Termux and Haiku components', () => {
    expect(packageInstallCommand('termux-pkg', 'ffmpeg')).toBeNull();
    expect(packageInstallCommand('termux-pkg', 'vlc')).toBeNull();
    expect(packageInstallCommand('pkgman', 'ffmpeg')).toMatchObject({program: 'pkgman', args: ['install', '-y', 'ffmpeg8_tools']});
    expect(packageInstallCommand('pkgman', 'vlc')).toBeNull();
    expect(packageManagerNotes('termux-pkg').join(' ')).toContain('x11-repo');
    expect(packageManagerNotes('pkgman').join(' ')).toMatch(/Node 20.*Node 22/);
  });

  it('keeps the printed installation hints consistent with each verified route', () => {
    const termux = {TERMUX_VERSION: '0.118.3'};
    expect(mpvInstallCommand('android', '', termux)).toBe('pkg install -y mpv');
    expect(ffplayInstallCommand('linux', '', termux)).toContain('x11-repo');
    expect(mpvInstallCommand('haiku', '', {})).toBe('pkgman install -y mpv');
    expect(ffplayInstallCommand('haiku', '', {})).toBe('pkgman install -y ffmpeg8_tools');
    expect(mpvInstallCommand('sunos', '', {})).toContain('pkgin -y install mpv');
    expect(ffplayInstallCommand('sunos', '', {})).toContain('matching pkgsrc');
  });

  it('uses verified noninteractive BSD syntax', () => {
    expect(packageInstallCommand('pkg', 'mpv')).toMatchObject({program: 'sudo', args: ['pkg', 'install', '-y', 'mpv']});
    expect(packageInstallCommand('pkg_add', 'mpv', {elevation: 'doas'})).toMatchObject({program: 'doas', args: ['pkg_add', '-I', 'mpv']});
    expect(packageInstallCommand('pkgin', 'mpv', {elevation: null})).toMatchObject({program: 'pkgin', args: ['-y', 'install', 'mpv']});
    expect(packageInstallCommand('pkgin', 'ffmpeg')).toBeNull();
  });

  it('uses the available privilege boundary for non-systemd Linux', () => {
    expect(packageInstallCommand('apk', 'mpv', {elevation: 'doas'})).toMatchObject({program: 'doas', args: ['apk', 'add', 'mpv']});
    expect(packageInstallCommand('apt', 'mpv', {elevation: null})).toMatchObject({program: 'apt-get', args: ['install', '-y', 'mpv']});
  });

  it('executes a discovered package manager path through the selected privilege helper', () => {
    const plan = packageInstallCommand('pkgin', 'mpv', {elevation: 'doas'})!;
    const paths: Record<string, string> = {pkgin: '/opt/local/bin/pkgin', doas: '/usr/local/bin/doas'};
    expect(packageCommandInvocation(plan, 'sunos', command => paths[command] ?? null)).toEqual({
      program: '/usr/local/bin/doas', args: ['/opt/local/bin/pkgin', '-y', 'install', 'mpv']
    });
    expect(plan.display).toBe('doas pkgin -y install mpv');
    expect(packageCommandInvocation(packageInstallCommand('termux-pkg', 'mpv')!, 'android', command => command === 'pkg' ? '/data/data/com.termux/files/usr/bin/pkg' : null)).toEqual({
      program: '/data/data/com.termux/files/usr/bin/pkg', args: ['install', '-y', 'mpv']
    });
  });

  it('uses an encoded PowerShell transport for Windows script shims', () => {
    const plan = packageInstallCommand('scoop', 'mpv')!;
    const windows = packageCommandInvocation(plan, 'win32');
    expect(windows.program).toBe('powershell.exe');
    expect(windows.args).toContain('-EncodedCommand');
    expect(windows.args).not.toContain('/c');
    const script = Buffer.from(windows.args.at(-1)!, 'base64').toString('utf16le');
    const payload = JSON.parse(Buffer.from(/FromBase64String\('([^']+)'\)/.exec(script)![1]!, 'base64').toString('utf8'));
    expect(payload).toEqual({command: 'scoop', args: ['install', 'mpv'], environment: {}});
    expect(packageCommandInvocation(plan, 'linux')).toEqual({program: 'scoop', args: ['install', 'mpv']});
  });
});

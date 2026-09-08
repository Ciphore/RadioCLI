import {describe, expect, it} from 'vitest';
import {detectPackageManager, packageCommandInvocation, packageInstallCommand} from './packages.js';

describe('native package plans', () => {
  it.each([
    ['freebsd', 'pkg'], ['openbsd', 'pkg_add'], ['netbsd', 'pkgin']
  ] as const)('selects %s package tools without confusing other Unix commands', (platform, expected) => {
    expect(detectPackageManager(platform, '', () => true)).toBe(expected);
    expect(detectPackageManager(platform, '', () => false)).toBeNull();
  });

  it('does not treat the illumos IPS pkg command as FreeBSD pkg', () => {
    expect(detectPackageManager('sunos', '', command => command === 'pkg')).toBeNull();
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

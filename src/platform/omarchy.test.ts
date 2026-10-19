import {describe, expect, it, vi} from 'vitest';
import {identifyOmarchy, type OmarchyProbeOptions} from './omarchy.js';
import {identifyPlatform} from './runtime.js';

const desktop = {HOME: '/home/radio', PATH: '/usr/bin', WAYLAND_DISPLAY: 'wayland-1', XDG_SESSION_TYPE: 'wayland', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus'};
const packagedRoot = '/usr/share/omarchy';

function fixture(overrides: OmarchyProbeOptions = {}): OmarchyProbeOptions {
  return {
    platform: 'linux', env: desktop,
    isDirectory: path => path === packagedRoot,
    readFile: () => null,
    resolve: command => command.startsWith('/') ? command : `/usr/bin/${command}`,
    run: (_command, args) => args[1] === 'omarchy' ? 'omarchy 4.0.4-1\n' : null,
    ...overrides
  };
}

describe('Omarchy installation evidence', () => {
  it('identifies a packaged release without changing its platform ID', () => {
    const run = vi.fn((_command: string, args: readonly string[]) => args[1] === 'omarchy' ? 'omarchy 4.0.4-1\n' : null);
    const profile = identifyOmarchy(fixture({run}));
    expect(profile).toEqual({
      kind: 'quattro', version: '4.0.4-1', major: 4, source: 'package', root: packagedRoot, packageName: 'omarchy',
      session: {type: 'wayland', remote: false, localDesktop: true},
      terminal: {available: true, command: `${packagedRoot}/bin/omarchy-launch-tui`, missing: []}
    });
    expect(identifyPlatform({platform: 'linux', env: desktop}).id).toBe('linux');
    expect(run.mock.calls.map(call => call[1])).toEqual([['-Q', 'omarchy-dev'], ['-Q', 'omarchy']]);
    expect(run).toHaveBeenCalledWith('/usr/bin/pacman', ['-Q', 'omarchy'], expect.objectContaining({timeout: 500, maxBuffer: 4096}));
  });

  it.each([
    ['omarchy-dev 4.0.4-1', 'development', 4],
    ['omarchy 3.3.3-1', 'legacy', 3],
    ['omarchy 5.0.0-1', 'unknown', 5],
    ['omarchy 4.1.0.rc1-1', 'unknown', null],
    ['omarchy 1:4.0.4-2', 'quattro', 4]
  ] as const)('classifies installed metadata %s without promoting unverified releases', (output, kind, major) => {
    const profile = identifyOmarchy(fixture({run: (_command, args) => output.startsWith(`${args[1]} `) ? output : null}));
    expect(profile).toMatchObject({kind, major});
    expect(profile.terminal.available).toBe(kind === 'quattro');
  });

  it('retains helper version diagnostics without assuming stable channel when package queries fail', () => {
    const run = vi.fn((command: string) => command.endsWith('/omarchy-version') ? '4.0.4-1\n' : null);
    const profile = identifyOmarchy(fixture({run}));
    expect(profile).toMatchObject({kind: 'unknown', version: '4.0.4-1', major: 4, source: 'helper', packageName: null, terminal: {available: false}});
    expect(run).toHaveBeenLastCalledWith(`${packagedRoot}/bin/omarchy-version`, [], expect.objectContaining({env: expect.objectContaining({OMARCHY_PATH: packagedRoot}), timeout: 500, maxBuffer: 4096}));
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('preserves an explicit development helper result without activating Quattro', () => {
    expect(identifyOmarchy(fixture({run: command => command.endsWith('/omarchy-version') ? 'dev (f00ba42)' : null}))).toMatchObject({kind: 'development', version: 'dev (f00ba42)', major: null, source: 'helper', terminal: {available: false}});
  });

  it.each([null, '', 'dev (f00ba42)', '4.0.4\n5.0.0', '4.0.4\0', '4'.repeat(4097)])('does not activate Quattro from malformed, development or missing helper output %s', output => {
    const profile = identifyOmarchy(fixture({run: command => command.endsWith('/omarchy-version') ? output : null}));
    expect(profile.kind).not.toBe('quattro');
    expect(profile.terminal.available).toBe(false);
  });

  it('requires installed evidence even when Omarchy and Hyprland environment hints are present', () => {
    const run = vi.fn(() => '4.0.4-1');
    const readFile = vi.fn(() => null);
    const profile = identifyOmarchy(fixture({env: {...desktop, OMARCHY_PATH: '/fake/omarchy', OMARCHY_VERSION: '4.0.4', XDG_CURRENT_DESKTOP: 'Hyprland'}, isDirectory: () => false, readFile, run}));
    expect(profile.kind).toBe('none');
    expect(profile.terminal.available).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it.each([
    ['3.3.3\n', 'legacy'], ['4.0.4\n', 'development']
  ] as const)('recognizes a legacy user checkout with version %s separately from packaged Quattro', (version, kind) => {
    const root = '/home/radio/.local/share/omarchy';
    const run = vi.fn(() => null);
    expect(identifyOmarchy(fixture({isDirectory: path => path === root, readFile: path => path === `${root}/version` ? version : null, run}))).toMatchObject({kind, version: version.trim(), source: 'legacy-metadata', root, terminal: {available: false}});
    expect(run).not.toHaveBeenCalled();
  });

  it('treats an installed custom checkout as development even alongside a packaged release', () => {
    const run = vi.fn(() => 'omarchy 4.0.4-1');
    const profile = identifyOmarchy(fixture({env: {...desktop, OMARCHY_PATH: '/work/omarchy'}, isDirectory: path => path === packagedRoot || path === '/work/omarchy', run}));
    expect(profile).toMatchObject({kind: 'development', root: '/work/omarchy', terminal: {available: false}});
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['darwin', 'win32', 'freebsd', 'android'] as const)('does not probe installed Linux files or commands on %s', platform => {
    const isDirectory = vi.fn(() => true);
    const run = vi.fn(() => 'omarchy 4.0.4-1');
    expect(identifyOmarchy(fixture({platform, isDirectory, run})).kind).toBe('none');
    expect(isDirectory).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('does not apply desktop detection in Termux', () => {
    const isDirectory = vi.fn(() => true);
    expect(identifyOmarchy(fixture({env: {...desktop, TERMUX_VERSION: '0.118.3'}, isDirectory})).kind).toBe('none');
    expect(isDirectory).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === 'linux')('does not run native probes for a different injected platform without probe dependencies', () => {
    const resolve = vi.fn(() => '/usr/bin/pacman');
    expect(identifyOmarchy({platform: 'linux', env: desktop, resolve}).kind).toBe('none');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('caches bounded installation probes briefly while revalidating launcher capabilities on every call', () => {
    let time = 1000;
    let helper = true;
    const run = vi.fn((_command: string, args: readonly string[]) => args[1] === 'omarchy' ? 'omarchy 4.0.4-1' : null);
    const options = fixture({now: () => time, run, resolve: command => posixBasename(command) === 'uwsm-app' && !helper ? undefined : command.startsWith('/') ? command : `/usr/bin/${command}`});
    expect(identifyOmarchy(options).terminal.available).toBe(true);
    helper = false;
    expect(identifyOmarchy(options).terminal.missing).toContain('uwsm-app');
    expect(run).toHaveBeenCalledTimes(2);
    time += 5000;
    identifyOmarchy(options);
    expect(run).toHaveBeenCalledTimes(4);
  });
});

describe('Omarchy session and launcher prerequisites', () => {
  it.each([
    {SSH_CONNECTION: 'remote 1 local 2'}, {SSH_CLIENT: 'remote 1 2'}, {SSH_TTY: '/dev/pts/1'}, {XDG_SESSION_REMOTE: 'true'}
  ])('keeps installation evidence separate from a remote session (%j)', remote => {
    const profile = identifyOmarchy(fixture({env: {...desktop, ...remote}}));
    expect(profile.kind).toBe('quattro');
    expect(profile.session).toMatchObject({remote: true, localDesktop: false});
    expect(profile.terminal.missing).toContain('local-wayland-session');
  });

  it.each([
    [{}, 'headless'], [{DISPLAY: ':0'}, 'x11'], [{...desktop, XDG_SESSION_TYPE: 'tty'}, 'headless']
  ] as const)('does not enable native launch for %j', (env, type) => {
    const profile = identifyOmarchy(fixture({env}));
    expect(profile).toMatchObject({kind: 'quattro', session: {type}, terminal: {available: false}});
    expect(profile.terminal.missing).toContain('local-wayland-session');
  });

  it.each(['omarchy-launch-tui', 'setsid', 'uwsm-app', 'xdg-terminal-exec'])('requires the actual %s prerequisite', missing => {
    const profile = identifyOmarchy(fixture({resolve: command => posixBasename(command) === missing ? undefined : command.startsWith('/') ? command : `/usr/bin/${command}`}));
    expect(profile.terminal).toMatchObject({available: false, missing: [missing]});
  });

  it('does not claim launcher readiness from missing user-bus connection information', () => {
    const profile = identifyOmarchy(fixture({env: {...desktop, DBUS_SESSION_BUS_ADDRESS: ''}}));
    expect(profile.terminal.missing).toEqual(['session-bus']);
  });

  it('rejects relative or control-character helper paths from a resolver', () => {
    for (const path of ['uwsm-app', '/usr/bin/uwsm-app\n']) {
      expect(identifyOmarchy(fixture({resolve: command => posixBasename(command) === 'uwsm-app' ? path : command.startsWith('/') ? command : `/usr/bin/${command}`})).terminal.missing).toContain('uwsm-app');
    }
  });

  it('does not mistake fallback executable locations for helpers reachable from a restricted PATH', () => {
    const resolve = vi.fn((command: string) => command.startsWith('/isolated/bin/') ? undefined : command.startsWith('/') ? command : `/usr/bin/${command}`);
    const profile = identifyOmarchy(fixture({env: {...desktop, PATH: '/isolated/bin'}, resolve}));
    expect(profile).toMatchObject({kind: 'quattro', terminal: {available: false, missing: ['setsid', 'uwsm-app', 'xdg-terminal-exec']}});
    expect(resolve).toHaveBeenCalledWith('/isolated/bin/uwsm-app');
    expect(resolve).not.toHaveBeenCalledWith('uwsm-app');
  });

  it('accepts system helpers after a Node version-manager directory without changing PATH or its order', () => {
    const env = {...desktop, PATH: '/home/radio/.local/share/mise/installs/node/24/bin:/usr/bin'};
    const resolve = vi.fn((command: string) => command.startsWith('/home/radio/.local/share/mise/') ? undefined : command.startsWith('/') ? command : `/usr/bin/${command}`);
    expect(identifyOmarchy(fixture({env, resolve})).terminal.available).toBe(true);
    expect(resolve.mock.calls.filter(([command]) => command.endsWith('/setsid')).map(([command]) => command)).toEqual(['/home/radio/.local/share/mise/installs/node/24/bin/setsid', '/usr/bin/setsid']);
    expect(env.PATH).toBe('/home/radio/.local/share/mise/installs/node/24/bin:/usr/bin');
  });
});

function posixBasename(path: string): string { return path.slice(path.lastIndexOf('/') + 1); }

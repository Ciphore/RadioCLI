import {EventEmitter} from 'node:events';
import * as childProcess from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {probeDoctorScheduler, probeNativeIntegrations} from './diagnostics.js';
import * as schedulers from '../alarms/scheduler.js';
import * as executables from './executables.js';
import * as airPlaySender from '../player/airplay-sender-health.js';
import {mprisServiceName} from './mpris.js';
import type {OmarchyProfile} from './omarchy.js';
import {identifyOmarchy} from './omarchy.js';
import {identifyPlatform} from './runtime.js';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {...actual, spawn: vi.fn()};
});

type Options = Parameters<typeof probeNativeIntegrations>[0];
const desktop = {HOME: '/home/private-account', PATH: '/usr/bin', XDG_RUNTIME_DIR: '/run/user/1000', WAYLAND_DISPLAY: 'wayland-1', XDG_SESSION_TYPE: 'wayland', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus'};
const linux = identifyPlatform({platform: 'linux', env: desktop, osRelease: '', libc: 'glibc', release: '6.6'});
const quattro: OmarchyProfile = {kind: 'quattro', version: '4.0.4-1', major: 4, source: 'package', packageName: 'omarchy', root: '/home/private-account/omarchy',
  session: {type: 'wayland', remote: false, localDesktop: true}, terminal: {available: true, command: '/home/private-account/bin/omarchy-launch-tui', missing: []}};
const airPlay = {eligible: true, discoveryExecutable: true, discoveryService: 'ready' as const, senderLoaded: true, ffmpeg: true, ready: true, message: 'Experimental prerequisites ready.'};
const result = (output: string) => ({output, code: 0, timedOut: false, truncated: false});
const success: NonNullable<Options['run']> = async (command, args) => result(command.endsWith('busctl') ? 'b false' : args.includes('get-volume') ? 'Volume: 0.50' : 'Volume: front-left: 32768 / 50% / -18.06 dB');
let root: string;
let library: string;

function fixture(overrides: Partial<Options> = {}): Options {
  return {host: linux, env: desktop, libraryPath: () => library, resolve: name => name.startsWith('/') ? name : `/usr/bin/${name}`,
    omarchy: () => quattro, mpv: () => ({status: 'compatible', args: [], reason: 'Compatible.'}),
    terminalPlan: () => ({terminal: 'linux:/home/private-account/bin/ghostty', command: '/home/private-account/bin/ghostty'}),
    run: success, isSocket: () => true, airPlay: async () => airPlay, ...overrides};
}

beforeEach(() => { vi.mocked(childProcess.spawn).mockReset(); root = mkdtempSync(join(tmpdir(), 'radiocli-diagnostics-')); library = join(root, 'library.json'); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); rmSync(root, {recursive: true, force: true}); });

describe('read-only native diagnostic report', () => {
  it('keeps policy, bus readiness, current owner, terminal prerequisites and audio response independent', async () => {
    const run = vi.fn(success);
    const report = await probeNativeIntegrations(fixture({run}));
    expect(report.omarchy).toEqual({status: 'detected', kind: 'quattro', version: '4.0.4-1', major: 4, source: 'package', packageName: 'omarchy',
      session: {type: 'wayland', remote: false, localDesktop: true}, terminal: {prerequisitesReady: true, missing: []}});
    expect(report.desktopMedia).toMatchObject({preference: {value: 'auto', source: 'default', status: 'available'}, policy: {eligible: true, status: 'ready'}, sessionBus: {status: 'ready'}, owner: {status: 'absent'}});
    expect(report.terminalLauncher).toMatchObject({selected: 'linux:ghostty', prerequisites: 'ready', launch: 'unverified'});
    expect(report.audio).toMatchObject({status: 'ready', backend: 'pipewire', wpctl: {installed: true, status: 'ready'}, pactl: {installed: true, status: 'ready'}});
    expect(report.airPlay).toMatchObject({...airPlay, ready: false, enabled: false, state: 'disabled', prerequisitesReady: true, message: expect.stringContaining('setup --airplay')});
    expect(JSON.stringify(report)).not.toMatch(/private-account|\/run\/user|library\.json|org\.mpris|32768|0\.50/);
    expect(existsSync(library)).toBe(false);
    expect(run.mock.calls.map(call => call[1])).toEqual([
      ['--address=unix:path=%2Frun%2Fuser%2F1000%2Fbus', '--auto-start=no', '--timeout=0.5', 'call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'NameHasOwner', 's', mprisServiceName(library)],
      ['get-volume', '@DEFAULT_AUDIO_SINK@'], ['--server=unix:/run/user/1000/pulse/native', 'get-sink-volume', '@DEFAULT_SINK@']
    ]);
    expect(JSON.stringify(run.mock.calls)).not.toMatch(/RequestName|StartService|set-volume|set-mute|avahi-browse|dns-sd|systemctl/);
  });

  it('reports a registered owner without treating current policy as the owner of that bridge', async () => {
    const report = await probeNativeIntegrations(fixture({env: {...desktop, RADIOCLI_DESKTOP_MEDIA: 'off'}, run: async () => result('b true')}));
    expect(report.desktopMedia).toMatchObject({preference: {value: 'off'}, policy: {eligible: false}, sessionBus: {status: 'ready'}, owner: {status: 'registered'}});
    expect(report.desktopMedia.owner.message).toContain('playback state was not inspected');
  });

  it.each([
    ['omarchy 4.0.4-1', 'quattro', true], ['omarchy-dev 4.0.4-1', 'development', false],
    ['omarchy 3.3.3-1', 'legacy', false], ['omarchy 5.0.0-1', 'unknown', false], ['', 'none', false]
  ] as const)('uses installation evidence %s without changing Linux identity', async (metadata, kind, eligible) => {
    const report = await probeNativeIntegrations(fixture({omarchy: () => identifyOmarchy({platform: 'linux', env: desktop, readFile: () => null,
      isDirectory: path => Boolean(metadata) && path === '/usr/share/omarchy', resolve: command => command.startsWith('/') ? command : `/usr/bin/${command}`,
      run: (_command, args) => metadata.startsWith(`${args[1]} `) ? metadata : null})}));
    expect(report.omarchy.kind).toBe(kind);
    expect(report.desktopMedia.policy.eligible).toBe(eligible);
    expect(linux.id).toBe('linux');
  });

  it('redacts unrecognized helper versions and private roots and commands', async () => {
    const report = await probeNativeIntegrations(fixture({omarchy: () => ({...quattro, kind: 'unknown', version: 'https://secret.test/token', terminal: {...quattro.terminal, missing: ['/home/private-account/token']}})}));
    expect(report.omarchy.version).toBeNull();
    expect(report.omarchy.terminal.missing).toEqual([]);
    expect(JSON.stringify(report)).not.toMatch(/private-account|secret\.test|token/);
  });

  it.each(['headless', 'x11', 'wayland'] as const)('reports a remote %s session separately from installed Quattro', async type => {
    const report = await probeNativeIntegrations(fixture({omarchy: () => ({...quattro, session: {type, remote: true, localDesktop: false}, terminal: {...quattro.terminal, available: false, missing: ['local-wayland-session']}})}));
    expect(report.omarchy).toMatchObject({kind: 'quattro', session: {type, remote: true}, terminal: {prerequisitesReady: false}});
    expect(report.desktopMedia.policy.eligible).toBe(false);
  });

  it('contains every optional probe failure without disclosing raw errors', async () => {
    const secret = () => { throw new Error('https://secret.test/token /home/private-account unixexec:path=/secret'); };
    const report = await probeNativeIntegrations(fixture({omarchy: secret, terminalPlan: secret, mpv: secret, run: async () => secret(), airPlay: async () => secret()}));
    expect(report.omarchy.status).toBe('unverified');
    expect(report.desktopMedia.policy.status).toBe('unverified');
    expect(report.desktopMedia.sessionBus.status).toBe('unverified');
    expect(report.terminalLauncher.prerequisites).toBe('unavailable');
    expect(report.audio.status).toBe('unverified');
    expect(report.airPlay).toMatchObject({ready: false, discoveryService: 'unverified'});
    expect(JSON.stringify(report)).not.toMatch(/secret|token|private-account|unixexec/);
  });

  it('isolates a failed audio tool from the other local backend and terminal selection', async () => {
    const report = await probeNativeIntegrations(fixture({run: async (command, args, env) => { if (command.endsWith('wpctl')) throw new Error('failed'); return success(command, args, env); }}));
    expect(report.audio).toMatchObject({status: 'ready', backend: 'pulse', wpctl: {status: 'unverified'}, pactl: {status: 'ready'}});
    expect(report.terminalLauncher.prerequisites).toBe('ready');
  });

  it('does not probe the execution host when inspecting an injected different platform', async () => {
    const platform = process.platform === 'linux' ? 'darwin' : 'linux';
    const spawn = vi.mocked(childProcess.spawn);
    const report = await probeNativeIntegrations({host: identifyPlatform({platform, env: {}, osRelease: '', libc: 'glibc', release: '6.6'}), env: {}, libraryPath: () => library});
    expect(spawn).not.toHaveBeenCalled();
    expect(report.terminalLauncher.prerequisites).toBe('unverified');
    expect(report.airPlay.ready).toBe(false);
  });

  it.each(['iterm', 'kitty', 'wezterm', 'ghostty'])('keeps the uninspected macOS %s application separate from the available launch utility', async name => {
    vi.stubGlobal('process', {...process, platform: 'darwin'});
    const env = {RADIOCLI_ALARM_TERMINAL: `darwin:${name}`};
    const report = await probeNativeIntegrations(fixture({
      host: identifyPlatform({platform: 'darwin', env}), env, terminalPlan: undefined,
      resolve: command => ['/usr/bin/open', '/usr/bin/osascript'].includes(command) ? command : undefined
    }));
    expect(report.terminalLauncher).toMatchObject({selected: `darwin:${name}`, prerequisites: 'unverified', launch: 'unverified'});
    expect(report.terminalLauncher.message).toContain('target terminal application has not been inspected');
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it('passes resolved fallback executables through the real AirPlay readiness boundary with a restricted PATH', async () => {
    vi.stubGlobal('process', {...process, platform: 'linux'});
    vi.spyOn(airPlaySender, 'probeAirPlaySender').mockResolvedValue({loaded: true, message: 'Loaded'});
    vi.mocked(childProcess.spawn).mockImplementation((_command, args) => {
      const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(), unref: vi.fn()});
      queueMicrotask(() => { child.stdout.write(args?.includes('GetState') ? 'i 2' : 'b false'); child.emit('close', 0); });
      return child as unknown as childProcess.ChildProcess;
    });
    const report = await probeNativeIntegrations(fixture({env: {...desktop, PATH: '/nonexistent'}, run: undefined, airPlay: undefined, isSocket: () => false}));
    expect(report.airPlay.discoveryService).toBe('ready');
    const avahi = vi.mocked(childProcess.spawn).mock.calls.find(([, args]) => args?.includes('GetState'));
    expect(avahi?.[0]).toBe('/usr/bin/busctl');
    expect(avahi?.[2]).toMatchObject({env: {PATH: '/nonexistent'}});
  });
});

describe('desktop media preference inspection does not migrate or repair libraries', () => {
  it.each(['auto', 'on', 'off'] as const)('reads only the %s preference without rewriting a read-only file', async value => {
    const text = JSON.stringify({settings: {desktopMediaControls: value}, imported: [{streamUrl: 'https://secret.test/token'}], unrelated: 'preserve me'});
    writeFileSync(library, text, {mode: 0o400});
    const before = statSync(library);
    const report = await probeNativeIntegrations(fixture());
    expect(report.desktopMedia.preference).toMatchObject({value, source: 'library', status: 'available'});
    expect(readFileSync(library, 'utf8')).toBe(text);
    expect(statSync(library).mtimeMs).toBe(before.mtimeMs);
    expect(readdirSync(root)).toEqual(['library.json']);
    expect(JSON.stringify(report)).not.toContain('secret.test');
  });

  it.each(['not json', '{"settings":{"desktopMediaControls":"invalid"}}', '{"settings":null}', 'null', '[]'])('keeps invalid library bytes unchanged: %s', async text => {
    writeFileSync(library, text);
    const report = await probeNativeIntegrations(fixture());
    expect(report.desktopMedia.preference).toMatchObject({value: 'auto', status: 'unverified'});
    expect(report.desktopMedia.policy).toMatchObject({eligible: false, status: 'unverified'});
    expect(readFileSync(library, 'utf8')).toBe(text);
    expect(readdirSync(root)).toEqual(['library.json']);
  });

  it('respects a valid environment preference even if the library is unreadable', async () => {
    const report = await probeNativeIntegrations(fixture({env: {...desktop, RADIOCLI_DESKTOP_MEDIA: 'off'}, libraryPath: () => { throw new Error('private path'); }}));
    expect(report.desktopMedia.preference).toMatchObject({value: 'off', source: 'environment', status: 'available'});
    expect(report.desktopMedia.sessionBus.status).toBe('ready');
    expect(report.desktopMedia.owner.status).toBe('unverified');
  });

  it('reports an inaccessible library path without creating backup or replacement state', async () => {
    const text = '{"settings":{"desktopMediaControls":"off"}}';
    writeFileSync(library, text);
    const report = await probeNativeIntegrations(fixture({libraryPath: () => { throw Object.assign(new Error('access denied'), {code: 'EACCES'}); }}));
    expect(report.desktopMedia.preference.status).toBe('unverified');
    expect(readdirSync(root)).toEqual(['library.json']);
    expect(readFileSync(library, 'utf8')).toBe(text);
  });

  // Windows chmod does not remove read access; root also bypasses POSIX modes.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports a POSIX file that cannot be read without creating backup or replacement state', async () => {
    writeFileSync(library, '{"settings":{"desktopMediaControls":"off"}}', {mode: 0});
    const report = await probeNativeIntegrations(fixture());
    expect(report.desktopMedia.preference.status).toBe('unverified');
    expect(readdirSync(root)).toEqual(['library.json']);
    chmodSync(library, 0o600);
    expect(readFileSync(library, 'utf8')).toContain('"off"');
  });

  it('rejects directories and oversized regular files as preference evidence', async () => {
    mkdirSync(library);
    expect((await probeNativeIntegrations(fixture())).desktopMedia.preference.status).toBe('unverified');
    rmSync(library, {recursive: true});
    writeFileSync(library, ' '.repeat(2 * 1024 * 1024 + 1));
    expect((await probeNativeIntegrations(fixture())).desktopMedia.preference.status).toBe('unverified');
    expect(statSync(library).size).toBe(2 * 1024 * 1024 + 1);
  });

  it.skipIf(process.platform === 'win32')('rejects a FIFO without blocking or replacing it', async () => {
    childProcess.execFileSync('mkfifo', [library]);
    const start = Date.now();
    expect((await probeNativeIntegrations(fixture())).desktopMedia.preference.status).toBe('unverified');
    expect(Date.now() - start).toBeLessThan(1000);
    expect(statSync(library).isFIFO()).toBe(true);
  });
});

describe('only normalized local bus and audio transports are probed', () => {
  it.each(['', 'unixexec:path=/tmp/run', 'tcp:host=example.test,port=1234', 'autolaunch:', 'unix:path=relative', 'unix:path=/ok,path=/other', 'unix:path=/bad%00', 'unix:path=/bad%ZZ'])('rejects a missing or unsupported bus without running it: %s', address => {
    return (async () => {
      const run = vi.fn(success);
      const report = await probeNativeIntegrations(fixture({env: {...desktop, DBUS_SESSION_BUS_ADDRESS: address}, run, resolve: name => name === 'busctl' ? '/usr/bin/busctl' : undefined}));
      expect(report.desktopMedia).toMatchObject({policy: {eligible: false}, sessionBus: {status: 'unavailable'}, owner: {status: 'unverified'}});
      expect(run).not.toHaveBeenCalled();
    })();
  });

  it.each([
    ['unixexec:path=/tmp/run;unix:path=/run/user/1000/my%20bus,guid=private;autolaunch:', 'unix:path=%2Frun%2Fuser%2F1000%2Fmy%20bus'],
    ['unix:abstract=/tmp/bus%2Cname,guid=private', 'unix:abstract=%2Ftmp%2Fbus%2Cname'],
    ['unix:path=/tmp/bus,unexpected=unixexec%3Apath%3D%2Ftmp%2Frun', 'unix:path=%2Ftmp%2Fbus']
  ])('normalizes valid local transport from %s before passing it to busctl', async (address, normalized) => {
    const run = vi.fn(success);
    await probeNativeIntegrations(fixture({env: {...desktop, DBUS_SESSION_BUS_ADDRESS: address}, run}));
    const bus = run.mock.calls.find(call => call[0].endsWith('busctl'))!;
    expect(bus[1][0]).toBe(`--address=${normalized}`);
    expect(bus[1]).toContain('--auto-start=no');
    expect(bus[2].DBUS_SESSION_BUS_ADDRESS).toBeUndefined();
    expect(JSON.stringify(bus)).not.toMatch(/unixexec|autolaunch|guid|unexpected/);
  });

  it('keeps installed bus/audio tools separate from unavailable services', async () => {
    const report = await probeNativeIntegrations(fixture({run: async () => ({...result('private failure'), code: 1})}));
    expect(report.desktopMedia).toMatchObject({policy: {eligible: true}, sessionBus: {status: 'unavailable'}, owner: {status: 'unverified'}});
    expect(report.audio).toMatchObject({status: 'unavailable', backend: null, wpctl: {installed: true}, pactl: {installed: true}});
    expect(JSON.stringify(report)).not.toContain('private failure');
  });

  it('leaves a valid but unprobed bus unverified when busctl is missing', async () => {
    const report = await probeNativeIntegrations(fixture({resolve: name => name === 'busctl' ? undefined : `/usr/bin/${name}`}));
    expect(report.desktopMedia).toMatchObject({policy: {eligible: true}, sessionBus: {status: 'unverified'}, owner: {status: 'unverified'}});
  });

  it('does not run audio clients when their local sockets are absent', async () => {
    const run = vi.fn(success);
    const report = await probeNativeIntegrations(fixture({isSocket: () => false, run}));
    expect(report.audio).toMatchObject({status: 'unavailable', wpctl: {installed: true, status: 'unavailable'}, pactl: {installed: true, status: 'unavailable'}});
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toContain('busctl');
  });

  it('does not use remote audio configuration, debug destinations or daemon flags', async () => {
    const run = vi.fn(success);
    const report = await probeNativeIntegrations(fixture({env: {...desktop, PULSE_SERVER: 'tcp:secret.test', PIPEWIRE_REMOTE: 'tcp:secret.test', PIPEWIRE_DAEMON: 'true', PIPEWIRE_DEBUG: '/private/debug'}, run}));
    expect(report.audio.status).toBe('unavailable');
    expect(run).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(run.mock.calls)).not.toMatch(/secret\.test|\/private\/debug|PIPEWIRE_DAEMON/);
  });

  it.each([{...result('b true'), timedOut: true}, {...result('b true'), truncated: true}, result('b true\nhttps://secret.test'), result('x'.repeat(5000))])('does not accept unbounded, timed out or malformed responses', async output => {
    const report = await probeNativeIntegrations(fixture({run: async () => output}));
    expect(report.desktopMedia.sessionBus.status).toBe('unavailable');
    expect(report.audio.status).toBe('unavailable');
    expect(JSON.stringify(report)).not.toMatch(/secret\.test|x{20}/);
  });
});

describe('native diagnostic subprocess bounds', () => {
  function child() {
    return Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true), unref: vi.fn()});
  }
  function nativeOptions(): Options {
    return fixture({host: {...linux, platform: process.platform}, run: undefined, resolve: name => name === 'busctl' ? '/usr/bin/busctl' : undefined});
  }

  it('kills a stalled optional command and settles without publishing errors', async () => {
    vi.useFakeTimers();
    const process = child();
    vi.mocked(childProcess.spawn).mockReturnValue(process as unknown as childProcess.ChildProcess);
    const pending = probeNativeIntegrations(nativeOptions());
    await vi.advanceTimersByTimeAsync(601);
    const report = await pending;
    expect(process.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    expect(report.desktopMedia.sessionBus.status).toBe('unavailable');
  });

  it('caps stdout and stderr together and never returns raw diagnostics', async () => {
    const process = child();
    vi.mocked(childProcess.spawn).mockReturnValue(process as unknown as childProcess.ChildProcess);
    const pending = probeNativeIntegrations(nativeOptions());
    process.stdout.write('b true');
    process.stderr.write('private error'.repeat(500));
    const report = await pending;
    expect(process.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    expect(report.desktopMedia.sessionBus.status).toBe('unavailable');
    expect(JSON.stringify(report)).not.toContain('private error');
  });
});

describe('Doctor scheduler probes use a bounded local transport without activation', () => {
  const versionArgs = ['--user', 'show', '--property=Version', '--value'];
  const capability = {name: 'systemd', supported: true, exactWake: false, catchUpAfterWake: true, message: 'Manager replied.'};
  beforeEach(() => {
    // Native Linux is simulated only with a mocked spawn boundary. Other-host
    // callers remain guarded, and these tests never invoke macOS host tools.
    vi.stubGlobal('process', {...process, platform: 'linux'});
    vi.spyOn(executables, 'resolveCommandDetails').mockImplementation(command => ({path: `/usr/bin/${command}`, discovery: 'path'}));
  });
  function adapter(command = 'systemctl', args = versionArgs) {
    return vi.spyOn(schedulers, 'createSchedulerAdapter').mockImplementation((deps = {}) => ({
      capabilities: () => capability,
      probeCapabilities: async () => {
        const result = await deps.run!(command, args);
        return {...capability, supported: result.code === 0, message: result.stderr || capability.message};
      },
      install: async () => {}, remove: async () => {}, status: async () => ({installed: false, healthy: false, message: 'Not inspected.'})
    }));
  }
  function child(output?: string, code = 0) {
    const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true), unref: vi.fn()});
    vi.mocked(childProcess.spawn).mockReturnValue(child as unknown as childProcess.ChildProcess);
    if (output !== undefined) queueMicrotask(() => { child.stdout.write(output); child.emit('close', code); });
    return child;
  }

  it.each(['unixexec:path=/probe-only', 'tcp:host=secret.test,port=1234', 'autolaunch:', 'unix:path=relative'])('rejects unsafe scheduler transport %s before constructing or invoking an adapter', async address => {
    const create = adapter();
    const report = await probeDoctorScheduler(linux, {...desktop, DBUS_SESSION_BUS_ADDRESS: address});
    expect(report).toMatchObject({supported: false, catchUpAfterWake: false});
    expect(report?.message).toContain('local Unix session-bus');
    expect(create).not.toHaveBeenCalled();
    expect(childProcess.spawn).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toMatch(/probe-only|secret\.test|unixexec|tcp:|autolaunch/);
  });

  it('normalizes the Unix address and translates the exact manager query without executing systemctl', async () => {
    adapter(); child('v s "256.4"\n');
    const report = await probeDoctorScheduler(linux, {...desktop, DBUS_SESSION_BUS_ADDRESS: 'unixexec:path=/probe-only;unix:path=/tmp/local%20bus,guid=secret;tcp:host=secret.test', DBUS_SYSTEM_BUS_ADDRESS: 'unixexec:path=/system-secret', DBUS_STARTER_ADDRESS: 'autolaunch:secret'});
    expect(report?.supported).toBe(true);
    expect(childProcess.spawn).toHaveBeenCalledExactlyOnceWith('/usr/bin/busctl', ['--address=unix:path=%2Ftmp%2Flocal%20bus', '--auto-start=no', '--timeout=2', 'call', 'org.freedesktop.systemd1', '/org/freedesktop/systemd1', 'org.freedesktop.DBus.Properties', 'Get', 'ss', 'org.freedesktop.systemd1.Manager', 'Version'], {
      detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: expect.objectContaining({DBUS_SESSION_BUS_ADDRESS: 'unix:path=%2Ftmp%2Flocal%20bus', LC_ALL: 'C'})
    });
    expect(JSON.stringify(vi.mocked(childProcess.spawn).mock.calls)).not.toMatch(/unixexec|autolaunch|tcp:|secret|systemctl|DBUS_SYSTEM_BUS_ADDRESS|DBUS_STARTER_ADDRESS/);
  });

  it('does not run scheduler mutations if an adapter asks for an unexpected command', async () => {
    adapter('systemctl', ['--user', 'start', 'unit.service']);
    expect((await probeDoctorScheduler(linux, desktop))?.supported).toBe(false);
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it('keeps tooling unverified when the no-activation bus tool is missing', async () => {
    adapter();
    vi.mocked(executables.resolveCommandDetails).mockImplementation(command => ({path: command === 'busctl' ? null : `/usr/bin/${command}`, discovery: command === 'busctl' ? 'missing' : 'path'}));
    expect(await probeDoctorScheduler(linux, desktop)).toBeUndefined();
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it('does not confuse an unavailable guessed bus with an unavailable headless manager', async () => {
    adapter(); child('private failure', 1);
    expect(await probeDoctorScheduler(linux, {XDG_RUNTIME_DIR: '/run/user/1000'})).toBeUndefined();
    expect(vi.mocked(childProcess.spawn).mock.calls[0]![1]).toContain('--address=unix:path=%2Frun%2Fuser%2F1000%2Fbus');
  });

  it('does not probe host tools for a foreign platform profile', async () => {
    const create = adapter();
    expect(await probeDoctorScheduler({...linux, platform: 'darwin', id: 'darwin'}, desktop)).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    expect(executables.resolveCommandDetails).not.toHaveBeenCalled();
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it('kills a stalled manager probe before the scheduler result deadline', async () => {
    vi.useFakeTimers(); adapter(); const process = child();
    const pending = probeDoctorScheduler(linux, desktop);
    await vi.advanceTimersByTimeAsync(2501);
    expect((await pending)?.supported).toBe(false);
    expect(process.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
  });

  it('caps combined scheduler output and keeps failure diagnostics private', async () => {
    adapter(); const process = child();
    const pending = probeDoctorScheduler(linux, desktop);
    process.stdout.write('v s "256"\n'); process.stderr.write('private-token'.repeat(500));
    const report = await pending;
    expect(report?.supported).toBe(false);
    expect(process.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    expect(JSON.stringify(report)).not.toContain('private-token');
  });

  it('allows Windows startup time and still kills a stalled scheduler command', async () => {
    vi.stubGlobal('process', {...process, platform: 'win32'});
    const kill = vi.spyOn(process, 'kill');
    vi.useFakeTimers(); adapter('powershell.exe', ['-NoProfile', '-NonInteractive']); const probeChild = child();
    const pending = probeDoctorScheduler({...linux, id: 'win32', platform: 'win32'}, {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(probeChild.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5001);
    expect((await pending)?.supported).toBe(false);
    expect(probeChild.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    expect(probeChild.stdout.destroyed).toBe(true);
    expect(probeChild.stderr.destroyed).toBe(true);
    expect(probeChild.unref).toHaveBeenCalledOnce();
    expect(kill).not.toHaveBeenCalled();
    expect(childProcess.spawn).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.objectContaining({detached: false, windowsHide: true}));
  });
});

describe('read-only Linux AirPlay consent diagnostics', () => {
  it('distinguishes a disabled feature from ready prerequisites without creating a library', async () => {
    const report = await probeNativeIntegrations(fixture());
    expect(report.airPlay).toMatchObject({state: 'disabled', enabled: false, ready: false, prerequisitesReady: true});
    expect(existsSync(library)).toBe(false);
  });
  it('reads the flag without rewriting the library and retains missing-prerequisite evidence', async () => {
    const source = JSON.stringify({settings: {linuxAirPlayEnabled: true}, untouched: 'value'});
    writeFileSync(library, source);
    const report = await probeNativeIntegrations(fixture({airPlay: async () => ({...airPlay, ffmpeg: false, ready: false, message: 'FFmpeg is missing.'})}));
    expect(report.airPlay).toMatchObject({state: 'enabled', enabled: true, ready: false, prerequisitesReady: false, ffmpeg: false});
    expect(readFileSync(library, 'utf8')).toBe(source);
  });
});

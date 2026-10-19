import {airPlaySenderPackageJson} from './airplay-sender-package.js';
import {EventEmitter} from 'node:events';
import * as childProcess from 'node:child_process';
import {PassThrough} from 'node:stream';
import {afterEach, describe, expect, it, vi} from 'vitest';
import * as executables from '../platform/executables.js';
import {probeAirPlayReadiness} from './airplay-readiness.js';
import {probeAirPlaySender, type AirPlaySenderHealth} from './airplay-sender-health.js';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {...actual, spawn: vi.fn()};
});

afterEach(() => { vi.mocked(childProcess.spawn).mockReset(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const linux = {platform: 'linux' as const, env: {}, release: '6.6', resolve: (command: string) => `/usr/bin/${command}`, hasCommand: () => true};
const success = {output: 'i 2\n', code: 0, timedOut: false, truncated: false};
const health: AirPlaySenderHealth = {available: true, safe: true, packageName: 'node-airtunes2', version: '2.5.0', vulnerablePackages: [], warningPackages: [], message: 'Safe'};

describe('explicit AirPlay readiness without LAN discovery', () => {
  it('checks running Avahi without service activation and native sender separately', async () => {
    const run = vi.fn(async () => success);
    const sender = vi.fn(async () => ({loaded: true, message: 'Loaded'}));
    expect(await probeAirPlayReadiness({...linux, run, sender})).toMatchObject({ready: true, discoveryExecutable: true, discoveryService: 'ready', senderLoaded: true});
    expect(run).toHaveBeenCalledExactlyOnceWith('/usr/bin/busctl', ['--address=unix:path=%2Frun%2Fdbus%2Fsystem_bus_socket', '--auto-start=no', '--timeout=0.5', 'call', 'org.freedesktop.Avahi', '/', 'org.freedesktop.Avahi.Server', 'GetState'], 600, 4096, {env: {}});
  });

  it('uses a platform/environment-aware resolved executable when PATH omits system directories', async () => {
    const env = {PATH: '/nonexistent'};
    const resolve = vi.spyOn(executables, 'resolveCommandDetails').mockImplementation(command => ({path: `/usr/bin/${command}`, discovery: 'package-manager-shim'}));
    const run = vi.fn(async () => success);
    const report = await probeAirPlayReadiness({platform: 'linux', release: '6.6', env, run, sender: async () => ({loaded: true, message: 'Loaded'})});
    expect(report.discoveryService).toBe('ready');
    expect(resolve).toHaveBeenCalledWith('busctl', {platform: 'linux', env});
    expect(run).toHaveBeenCalledWith('/usr/bin/busctl', expect.any(Array), 600, 4096, {env});
  });

  it.each(['unixexec:path=/probe-only', 'tcp:host=secret.test,port=1234', 'autolaunch:', 'unix:path=relative', 'unix:path=/bad%00'])('never runs a configured unsafe system-bus transport: %s', address => {
    return (async () => {
      const run = vi.fn();
      expect(await probeAirPlayReadiness({...linux, env: {DBUS_SYSTEM_BUS_ADDRESS: address}, run, sender: async () => ({loaded: true, message: 'Loaded'})})).toMatchObject({ready: false, discoveryService: 'unavailable'});
      expect(run).not.toHaveBeenCalled();
    })();
  });

  it.each([
    {provided: {}, expected: 'unix:path=%2Frun%2Fdbus%2Fsystem_bus_socket'},
    {provided: {PATH: '/test/bin', DBUS_SYSTEM_BUS_ADDRESS: 'unixexec:path=/probe-only;unix:path=/tmp/local%20bus,guid=private;tcp:host=secret.test', DBUS_SESSION_BUS_ADDRESS: 'unixexec:path=/secret-session', DBUS_STARTER_ADDRESS: 'autolaunch:private'}, expected: 'unix:path=%2Ftmp%2Flocal%20bus'},
    {provided: {DBUS_SYSTEM_BUS_ADDRESS: 'unix:abstract=/tmp/local-bus,guid=private'}, expected: 'unix:abstract=%2Ftmp%2Flocal-bus'}
  ])('uses the default runner with only the supplied environment and a normalized Unix address', async ({provided, expected}) => {
    vi.stubEnv('DBUS_SYSTEM_BUS_ADDRESS', 'unixexec:path=/ambient-probe-only');
    vi.stubEnv('DBUS_SESSION_BUS_ADDRESS', 'tcp:host=ambient-secret.test');
    vi.stubEnv('DBUS_STARTER_ADDRESS', 'autolaunch:ambient-secret');
    vi.stubEnv('RADIOCLI_PROBE_SECRET', 'ambient-secret');
    const spawn = vi.mocked(childProcess.spawn).mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(), unref: vi.fn()});
      queueMicrotask(() => { child.stdout.write('i 2\n'); child.emit('close', 0); });
      return child as unknown as childProcess.ChildProcess;
    });
    const report = await probeAirPlayReadiness({...linux, env: provided, sender: async () => ({loaded: true, message: 'Loaded'})});
    expect(report.discoveryService).toBe('ready');
    expect(spawn).toHaveBeenCalledExactlyOnceWith('/usr/bin/busctl', [`--address=${expected}`, '--auto-start=no', '--timeout=0.5', 'call', 'org.freedesktop.Avahi', '/', 'org.freedesktop.Avahi.Server', 'GetState'], {
      detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: 'PATH' in provided ? {PATH: provided.PATH, LC_ALL: 'C'} : {LC_ALL: 'C'}
    });
    expect(JSON.stringify(spawn.mock.calls)).not.toMatch(/unixexec|tcp:|autolaunch|ambient-secret|probe-only|DBUS_|private/);
    expect(JSON.stringify(report)).not.toMatch(/\/tmp\/|\/run\/|secret/);
  });

  it('keeps macOS discovery prerequisites independent from Linux D-Bus configuration', async () => {
    const run = vi.fn();
    expect(await probeAirPlayReadiness({...linux, platform: 'darwin', env: {DBUS_SYSTEM_BUS_ADDRESS: 'unixexec:path=/probe-only'}, run, sender: async () => ({loaded: true, message: 'Loaded'})})).toMatchObject({discoveryExecutable: true, discoveryService: 'unverified', ready: true});
    expect(run).not.toHaveBeenCalled();
  });

  it.each([{...success, code: 1}, {...success, output: 'i 1'}, {...success, timedOut: true}, {...success, truncated: true}])('keeps an installed discovery tool independent from daemon readiness: %j', async result => {
    expect(await probeAirPlayReadiness({...linux, run: async () => result, sender: async () => ({loaded: true, message: 'Loaded'})})).toMatchObject({ready: false, discoveryExecutable: true, discoveryService: 'unavailable', senderLoaded: true});
  });

  it('reports an unverified service without inventing a mandatory busctl dependency', async () => {
    const run = vi.fn();
    expect(await probeAirPlayReadiness({...linux, hasCommand: command => command !== 'busctl', run, sender: async () => ({loaded: true, message: 'Loaded'})})).toMatchObject({ready: true, discoveryService: 'unverified'});
    expect(run).not.toHaveBeenCalled();
  });

  it('does not load a sender on unsupported hosts', async () => {
    const sender = vi.fn();
    expect(await probeAirPlayReadiness({...linux, env: {WSL_INTEROP: '1'}, sender})).toMatchObject({eligible: false, ready: false, senderLoaded: false});
    expect(sender).not.toHaveBeenCalled();
  });

  it('reports a present but unloadable optional sender accurately', async () => {
    expect(await probeAirPlayReadiness({...linux, run: async () => success, sender: async () => ({loaded: false, message: 'Native module failed'})})).toMatchObject({ready: false, discoveryService: 'ready', senderLoaded: false});
  });

  it('does not load absent or safety-blocked optional packages', async () => {
    const run = vi.fn();
    expect(await probeAirPlaySender({health: {...health, safe: false}, run})).toMatchObject({loaded: false});
    expect(run).not.toHaveBeenCalled();
  });

  it.each([{...success, code: 1}, {...success, code: null}, {...success, timedOut: true}, {...success, truncated: true}])('contains isolated native module failure: %j', async result => {
    expect(await probeAirPlaySender({health, run: async () => result})).toMatchObject({loaded: false});
  });

  it('bounds the isolated load and verifies its callable sender interface', async () => {
    const run = vi.fn(async () => success);
    expect(await probeAirPlaySender({health, run, timeoutMs: 9000})).toMatchObject({loaded: true});
    expect(run).toHaveBeenCalledWith(process.execPath, ['-e', expect.stringContaining('s.prototype.add'), airPlaySenderPackageJson], 1500, 4096);
  });
});

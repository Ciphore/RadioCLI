import {chmodSync, existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PlayerController} from '../player/player-controller.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {JsonLibraryStore} from '../storage/store.js';
import type {PlaybackState, Station} from '../types.js';
import {runHeadlessAgentHost} from './headless-host.js';
import {connectRadioSession, type RadioSessionClient, type RadioSessionCommand} from './session.js';
import * as radioSession from './session.js';
import * as desktopMedia from '../platform/desktop-media.js';
import * as airPlayDiscovery from '../player/airplay-discovery.js';
import * as backendInstall from '../player/backend-install.js';

const first: Station = {id: 'first', provider: 'playlist', name: 'First Radio', tags: [], streamUrl: 'https://radio.example/first'};
const second: Station = {...first, id: 'second', name: 'Second Radio', streamUrl: 'https://radio.example/second'};
const historyMethods = ['addRecent', 'startListeningSession', 'finishActiveListeningSession', 'checkpointActiveListeningSession'] as const;
const signalNames = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
let root: string;
let playback: PlaybackState;
let originalListeners: Map<NodeJS.Signals, Set<NodeJS.SignalsListener>>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'radiocli headless 音楽-'));
  vi.stubEnv('RADIOCLI_HOME', root);
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']});
  originalListeners = new Map(signalNames.map(signal => [signal, new Set(process.listeners(signal))]));
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.spyOn(process, 'kill').mockReturnValue(true);
  playback = {backend: 'mpv', state: 'idle', volume: 70, muted: false, ready: false};
  vi.spyOn(PlayerController.prototype, 'refreshDetectedBackends').mockReturnValue(['mpv']);
  vi.spyOn(PlayerController.prototype, 'getState').mockImplementation(() => ({...playback}));
  vi.spyOn(PlayerController.prototype, 'play').mockImplementation(async (station, url, options) => {
    playback = {...playback, backend: 'mpv', state: options?.startPaused ? 'paused' : 'playing', stationName: station.name, streamUrl: url, ready: true};
  });
  vi.spyOn(PlayerController.prototype, 'stop').mockImplementation(async () => {
    playback = {backend: 'none', state: 'stopped', volume: playback.volume, muted: false, ready: false};
  });
  vi.spyOn(PlayerController.prototype, 'pause').mockImplementation(async () => {
    playback = {...playback, state: 'paused'};
    return {ok: true};
  });
  vi.spyOn(PlayerController.prototype, 'resume').mockImplementation(async () => {
    playback = {...playback, state: 'playing'};
    return {ok: true};
  });
  vi.spyOn(PlayerController.prototype, 'setVolume').mockImplementation(async volume => {
    playback = {...playback, volume};
    return {ok: true};
  });
  vi.spyOn(PlayerController.prototype, 'setMuted').mockImplementation(async muted => { playback = {...playback, muted}; return {ok: true}; });
  vi.spyOn(ProviderManager.prototype, 'resolve').mockImplementation(async station => ({url: station.streamUrl!, station}));
  vi.spyOn(ProviderManager.prototype, 'vote').mockResolvedValue(true);
});

afterEach(async () => {
  // Restore storage access before cleanup so a failing regression cannot leak a
  // real loopback listener. Player and process mocks stay in place until closed.
  for (const method of [...historyMethods, 'updateSettings', 'toggleFavorite'] as const) {
    if (vi.isMockFunction(JsonLibraryStore.prototype[method])) vi.mocked(JsonLibraryStore.prototype[method]).mockRestore();
  }
  const libraryPath = join(root, 'radiocli.json');
  if (existsSync(libraryPath)) chmodSync(libraryPath, 0o600);
  const shutdown = hostSignalHandler('SIGTERM');
  if (shutdown) {
    shutdown('SIGTERM');
    await vi.waitFor(() => expect(existsSync(join(root, 'runtime', 'agent-session.json'))).toBe(false));
  }
  for (const signal of signalNames) {
    for (const listener of process.listeners(signal)) {
      if (!originalListeners.get(signal)?.has(listener)) process.removeListener(signal, listener);
    }
  }
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, {recursive: true, force: true});
});

function hostSignalHandler(signal: NodeJS.Signals): NodeJS.SignalsListener | undefined {
  return process.listeners(signal).find(listener => !originalListeners.get(signal)?.has(listener));
}

async function startHost(): Promise<{client: RadioSessionClient; libraryPath: string; sessionPath: string}> {
  const seed = new JsonLibraryStore();
  seed.updateSettings({shareDirectoryVotes: false, agentControl: {...seed.settings().agentControl!, enabled: true}});
  let startupError: unknown;
  void runHeadlessAgentHost({worker: false}).catch(error => {startupError = error;});
  await vi.waitFor(() => {
    if (startupError) throw startupError;
    expect(hostSignalHandler('SIGTERM')).toBeDefined();
  });
  const sessionPath = join(root, 'runtime', 'agent-session.json');
  const client = await connectRadioSession(sessionPath);
  expect(client).not.toBeNull();
  return {client: client!, libraryPath: join(root, 'radiocli.json'), sessionPath};
}

function storageFailure(code = 'ENOSPC'): Error {
  return Object.assign(new Error(`${code}: write failed at ${join(root, 'private library.json')}\u001b[31m`), {code});
}

function failHistory(method: typeof historyMethods[number], code = 'ENOSPC'): void {
  vi.spyOn(JsonLibraryStore.prototype, method).mockImplementation(() => {throw storageFailure(code);});
}

describe('headless host optional persistence', () => {
  it.each(['mpv', 'ffplay', 'vlc', 'airplay'] as const)('reattaches a crashed %s terminal to the same playback and queue while rejecting a second live view', async backend => {
    const {client, sessionPath} = await startHost();
    const cli = (await connectRadioSession(sessionPath, {source: 'cli'}))!;
    await cli.call({type: 'play', station: first, queue: [first, second]});
    playback = {...playback, backend};
    const original = await cli.status();
    const oldPid = 987654;
    const oldClient = randomUUID();
    const nextClient = randomUUID();
    await expect(client.call({type: 'tui-attach', pid: oldPid, clientId: oldClient})).rejects.toThrow('local CLI');
    expect(await cli.call({type: 'tui-attach', pid: oldPid, clientId: oldClient})).toMatchObject({ok: true, status: {owner: 'tui', station: first, queue: [first, second]}});
    expect(await cli.call({type: 'tui-attach', pid: process.pid, clientId: nextClient})).toMatchObject({ok: false, message: expect.stringContaining('another terminal')});
    expect(await cli.call({type: 'tui-detach', clientId: nextClient})).toMatchObject({ok: false});
    vi.mocked(process.kill).mockImplementation((pid, signal) => {
      if (pid === oldPid && signal === 0) throw Object.assign(new Error('dead'), {code: 'ESRCH'});
      return true;
    });
    expect((await cli.status()).owner).toBe('headless');
    const recovered = await cli.call({type: 'tui-attach', pid: process.pid, clientId: nextClient});
    expect(recovered).toMatchObject({ok: true, status: {owner: 'tui', playback: original.playback, station: first, queue: [first, second]}});
    expect(PlayerController.prototype.play).toHaveBeenCalledOnce();
    expect((await cli.call({type: 'next'})).status.station).toEqual(second);
    await cli.call({type: 'stop'});
    await vi.advanceTimersByTimeAsync(100);
    expect(existsSync(sessionPath)).toBe(true);
    expect(await cli.call({type: 'tui-detach', clientId: nextClient})).toMatchObject({ok: true});
    expect(playback.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0));
    expect(existsSync(sessionPath)).toBe(false);
    expect(existsSync(`${sessionPath}.owner`)).toBe(false);
    expect(process.kill).not.toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('retains a TUI queue spanning more than one thousand loaded discovery results', async () => {
    const {sessionPath} = await startHost();
    const cli = (await connectRadioSession(sessionPath, {source: 'cli'}))!;
    await cli.call({type: 'tui-attach', pid: process.pid, clientId: randomUUID()});
    const queue = Array.from({length: 1200}, (_, index) => ({...first, id: `loaded-${index}`}));
    const tuned = await cli.call({type: 'play', station: queue[1100]!, queue});
    expect(tuned.status.station).toEqual(queue[1100]);
    expect((await cli.status()).queue).toEqual(queue);
  });

  it('keeps the sleep timer in the playback owner after the terminal disappears', async () => {
    const {sessionPath} = await startHost();
    const cli = (await connectRadioSession(sessionPath, {source: 'cli'}))!;
    await cli.call({type: 'tui-attach', pid: 987654, clientId: randomUUID()});
    await cli.call({type: 'play', station: first});
    const until = Date.now() + 1000;
    expect((await cli.call({type: 'tui-sleep', until})).status.tui?.sleepUntil).toBe(until);
    vi.mocked(process.kill).mockImplementation((pid, signal) => {
      if (pid === 987654 && signal === 0) throw Object.assign(new Error('dead'), {code: 'ESRCH'});
      return true;
    });
    await vi.advanceTimersByTimeAsync(1100);
    const status = await cli.status();
    expect(status.playback.state).toBe('stopped');
    expect(status.tui?.sleepUntil).toBeNull();
    expect(status.station).toEqual(first);
  });

  it('publishes live metadata, saves track history, and clears the title on retune', async () => {
    let emitMetadata: Parameters<PlayerController['onMetadata']>[0] | undefined;
    const unsubscribe = vi.fn();
    vi.spyOn(PlayerController.prototype, 'onMetadata').mockImplementation(listener => { emitMetadata = listener; return unsubscribe; });
    const {client, libraryPath, sessionPath} = await startHost();
    await client.call({type: 'play', station: first, queue: [first, second]});
    emitMetadata!({title: 'Artist - Live song', updatedAt: '2030-01-01T00:00:00Z'});
    expect((await client.status()).nowPlaying?.title).toBe('Artist - Live song');
    expect(new JsonLibraryStore(libraryPath).snapshot().trackHistory[0]).toMatchObject({title: 'Artist - Live song', stationName: first.name});
    await client.call({type: 'next'});
    expect((await client.status()).nowPlaying).toBeNull();
    hostSignalHandler('SIGTERM')!('SIGTERM');
    await vi.waitFor(() => expect(existsSync(sessionPath)).toBe(false));
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('rejects an RPC attempt to enable experimental output through appearance settings', async () => {
    const {client, libraryPath} = await startHost();
    await expect(client.call({type: 'update-settings', settings: {linuxAirPlayEnabled: true}} as unknown as RadioSessionCommand)).rejects.toThrow('Invalid radio command');
    expect(new JsonLibraryStore(libraryPath).snapshot().settings.linuxAirPlayEnabled).not.toBe(true);
  });

  it('blocks disabled output commands at the owner before discovery or sender access', async () => {
    vi.spyOn(PlayerController.prototype, 'airPlayPolicy').mockReturnValue({eligible: true, enabled: false, state: 'disabled', message: 'Experimental Linux AirPlay is disabled. Run radiocli setup --airplay.'});
    const discover = vi.spyOn(PlayerController.prototype, 'refreshAirPlayDevices');
    const select = vi.spyOn(PlayerController.prototype, 'selectAirPlayDevice');
    const passcode = vi.spyOn(PlayerController.prototype, 'submitAirPlayPasscode');
    const {client} = await startHost();
    for (const command of [{type: 'airplay-list'}, {type: 'airplay-select', deviceId: 'saved'}, {type: 'airplay-passcode', code: '1234'}] as RadioSessionCommand[]) {
      expect(await client.call(command)).toMatchObject({ok: false, message: expect.stringContaining('setup --airplay')});
    }
    expect(discover).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled(); expect(passcode).not.toHaveBeenCalled();
    expect(await client.call({type: 'play', station: first})).toMatchObject({ok: true});
  });

  it('discovers and explicitly selects a receiver, submits a code, switches local, and yields AirPlay to an alarm', async () => {
    new JsonLibraryStore().updateSettings({linuxAirPlayEnabled: true});
    vi.spyOn(PlayerController.prototype, 'airPlayPolicy').mockReturnValue({eligible: true, enabled: true, state: 'enabled', message: 'Enabled.'});
    vi.mocked(PlayerController.prototype.refreshDetectedBackends).mockReturnValue(['mpv', 'airplay']);
    vi.spyOn(backendInstall, 'detectPlaybackBackends').mockReturnValue(['mpv', 'airplay']);
    const receiver = {id: 'ID@Office', name: 'Office', host: '192.168.1.10', port: 5000, txt: ['pw=true'], requiresPassword: true, airplay2: false};
    const discover = vi.spyOn(airPlayDiscovery, 'discoverAirPlayDevices').mockResolvedValue([receiver]);
    const select = vi.spyOn(PlayerController.prototype, 'selectAirPlayDevice');
    const passcode = vi.spyOn(PlayerController.prototype, 'submitAirPlayPasscode').mockReturnValue({ok: true});
    const {client} = await startHost();
    expect(discover).not.toHaveBeenCalled();
    expect(await client.call({type: 'airplay-list'})).toMatchObject({ok: true, data: [receiver]});
    expect(select).not.toHaveBeenCalled();
    expect(await client.call({type: 'airplay-select', deviceId: 'missing'})).toMatchObject({ok: false});
    expect(await client.call({type: 'airplay-select', deviceId: receiver.id})).toMatchObject({ok: true, status: {output: {preferredBackend: 'airplay'}}});
    expect(select).toHaveBeenCalledWith(receiver.id);
    await client.call({type: 'airplay-passcode', code: '1234'});
    expect(passcode).toHaveBeenCalledWith('1234');
    expect(JSON.stringify(new JsonLibraryStore().snapshot())).not.toContain('1234');
    expect(await client.call({type: 'airplay-local'})).toMatchObject({ok: true, status: {output: {preferredBackend: 'mpv'}}});
    expect(select).toHaveBeenCalledWith(null);
    await client.call({type: 'airplay-select', deviceId: receiver.id});
    await client.call({type: 'play', station: first});
    playback = {...playback, backend: 'airplay'};
    expect(await client.call({type: 'alarm-preempt'})).toMatchObject({ok: true, status: {station: null, playback: {state: 'stopped'}}});
    expect(PlayerController.prototype.stop).toHaveBeenCalled();
  });

  it.each([
    'The Avahi discovery service is not ready. Local playback remains available.',
    'AirPlay playback requires FFmpeg.',
    'The optional AirPlay sender could not load. Local playback remains available.'
  ])('propagates a Linux readiness failure and preserves local controls: %s', async message => {
    new JsonLibraryStore().updateSettings({linuxAirPlayEnabled: true});
    vi.spyOn(PlayerController.prototype, 'airPlayPolicy').mockReturnValue({eligible: true, enabled: true, state: 'enabled', message: 'Enabled.'});
    vi.mocked(PlayerController.prototype.refreshDetectedBackends).mockReturnValue(['mpv', 'airplay']);
    const discover = vi.spyOn(airPlayDiscovery, 'discoverAirPlayDevices').mockRejectedValue(new Error(message));
    const {client} = await startHost();
    await expect(client.call({type: 'airplay-list'})).rejects.toThrow(message);
    await expect(client.call({type: 'airplay-select', deviceId: 'saved'})).rejects.toThrow(message);
    expect(await client.call({type: 'play', station: first})).toMatchObject({ok: true});
    discover.mockClear();
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    expect(await client.call({type: 'airplay-list'})).toMatchObject({ok: false, message: 'AirPlay discovery is disabled by RADIOCLI_OFFLINE=1.'});
    expect(discover).not.toHaveBeenCalled();
    expect(await client.call({type: 'pause'})).toMatchObject({ok: true});
  });

  it('executes an earlier HTTP Resume before a later desktop Stop while HTTP Pause is busy', async () => {
    const start = vi.spyOn(desktopMedia, 'startDesktopMediaControls').mockReturnValue({close: vi.fn(), refresh: vi.fn()});
    const serialize = radioSession.serializeRadioCommands;
    let resumeAccepted = false;
    vi.spyOn(radioSession, 'serializeRadioCommands').mockImplementation(handle => {
      const dispatch = serialize(handle);
      return (command, permitted) => {
        if (command.type === 'resume') resumeAccepted = true;
        return dispatch(command, permitted);
      };
    });
    const {client} = await startHost();
    const desktop = start.mock.calls[0]![0];
    await client.call({type: 'play', station: first, queue: [first, second]});
    let entered = false;
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(PlayerController.prototype.pause).mockImplementationOnce(async () => {
      entered = true;
      await held;
      playback = {...playback, state: 'paused'};
      return {ok: true};
    });
    const requests = [client.call({type: 'pause'})];
    try {
      await vi.waitFor(() => expect(entered).toBe(true));
      requests.push(client.call({type: 'resume'}));
      await vi.waitFor(() => expect(resumeAccepted).toBe(true));
      requests.push(desktop.command({type: 'desktop-transport', action: 'stop'}));
      release();
      const results = await Promise.all(requests);
      expect(results.map(result => result.status.playback.state)).toEqual(['paused', 'playing', 'stopped']);
      expect(await client.status()).toMatchObject({station: first, queue: [first, second], playback: {state: 'stopped'}});
    } finally {
      release();
      await Promise.allSettled(requests);
    }
  });

  it.each([
    ['Pause then Play', ['pause', 'play'], 'first'],
    ['two toggles', ['toggle', 'toggle'], 'first'],
    ['Stop then Play', ['stop', 'play'], 'first'],
    ['Stop then Next then Play', ['stop', 'next', 'play'], 'second']
  ] as const)('resolves %s against current state after a busy agent command', async (_label, actions, expectedStation) => {
    const start = vi.spyOn(desktopMedia, 'startDesktopMediaControls').mockReturnValue({close: vi.fn(), refresh: vi.fn()});
    const {client} = await startHost();
    const desktop = start.mock.calls[0]![0];
    await client.call({type: 'play', station: first, queue: [first, second]});
    let release: (() => void) | undefined;
    let entered = false;
    vi.mocked(ProviderManager.prototype.resolve).mockImplementationOnce(async station => {
      entered = true;
      await new Promise<void>(resolve => { release = resolve; });
      return {url: station.streamUrl!};
    });
    const busyAgent = client.call({type: 'play', station: first, queue: [first, second]});
    await vi.waitFor(() => expect(entered).toBe(true));
    const requests = actions.map(action => desktop.command({type: 'desktop-transport', action}));
    release!();
    const results = await Promise.allSettled([busyAgent, ...requests]);
    if ((actions as readonly string[]).includes('stop')) expect(results[0]).toMatchObject({status: 'rejected', reason: expect.objectContaining({message: expect.stringContaining('canceled')})});
    else expect(results[0]).toMatchObject({status: 'fulfilled', value: {ok: true}});
    expect(results.slice(1).every(result => result.status === 'fulfilled' && result.value.ok)).toBe(true);
    expect(await client.status()).toMatchObject({station: {id: expectedStation}, playback: {state: 'playing'}});
  });

  it('runs desktop controls through the existing owner queue, preserves pause, and yields to alarms', async () => {
    const close = vi.fn();
    const refresh = vi.fn();
    const start = vi.spyOn(desktopMedia, 'startDesktopMediaControls').mockReturnValue({close, refresh});
    const {client} = await startHost();
    const desktop = start.mock.calls[0]![0];
    await client.call({type: 'play', station: first, queue: [first, second]});
    await desktop.command({type: 'desktop-transport', action: 'pause'});
    expect(playback.state).toBe('paused');
    const next = await desktop.command({type: 'desktop-transport', action: 'next'});
    expect(next).toMatchObject({ok: true, status: {station: second, playback: {state: 'paused'}}});
    expect(PlayerController.prototype.play).toHaveBeenLastCalledWith(second, second.streamUrl, expect.objectContaining({startPaused: true, signal: expect.any(AbortSignal)}));
    expect(new JsonLibraryStore().snapshot().activity.sessions.some(item => item.station.id === second.id && !item.endedAt)).toBe(false);
    const stopped = await desktop.command({type: 'desktop-transport', action: 'stop'});
    expect(stopped.status).toMatchObject({station: second, queue: [first, second], playback: {state: 'stopped'}});
    await desktop.command({type: 'desktop-transport', action: 'next'});
    expect(playback.state).toBe('stopped');
    const resumed = await desktop.command({type: 'desktop-transport', action: 'play'});
    expect(resumed.status).toMatchObject({station: first, playback: {state: 'playing'}});
    await desktop.command({type: 'set-muted', muted: true});
    await desktop.command({type: 'set-volume', volume: 37, unmute: true});
    expect(playback).toMatchObject({volume: 37, muted: false});
    vi.advanceTimersByTime(50);
    expect(process.kill).not.toHaveBeenCalledWith(process.pid, 'SIGTERM');
    await client.call({type: 'alarm-preempt'});
    expect(desktop.suspended()).toBe(true);
    await expect(desktop.command({type: 'desktop-transport', action: 'next'})).rejects.toThrow('suspended');
    hostSignalHandler('SIGHUP')!('SIGHUP');
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it('stops through the authenticated session after its real library becomes read-only', async context => {
    if (process.platform === 'win32') context.skip('POSIX file permissions are not enforced by Windows ACLs.');
    if (process.getuid?.() === 0) context.skip('Root bypasses POSIX file write permissions.');
    const {client, libraryPath, sessionPath} = await startHost();
    await client.call({type: 'play', station: first});
    const saved = readFileSync(libraryPath, 'utf8');
    chmodSync(libraryPath, 0o400);

    const stopped = await client.call({type: 'stop'});

    expect(stopped).toMatchObject({ok: true, message: 'Stopped RadioCLI.', status: {
      station: null, queue: [], playback: {state: 'stopped'}, persistenceWarning: expect.stringContaining('RADIOCLI_HOME')
    }});
    expect(stopped.status.persistenceWarning).toContain('EACCES');
    expect(stopped.status.persistenceWarning).not.toContain(root);
    expect(readFileSync(libraryPath, 'utf8')).toBe(saved);
    expect(await client.status()).toMatchObject({playback: {state: 'stopped'}});
    await vi.advanceTimersByTimeAsync(50);
    expect(process.kill).not.toHaveBeenCalledWith(process.pid, 'SIGTERM');
    await vi.waitFor(() => expect(existsSync(sessionPath)).toBe(false));
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(existsSync(`${sessionPath}.owner`)).toBe(false);
  });

  it.each(['addRecent', 'startListeningSession'] as const)('keeps a successful tune when %s fails', async method => {
    const {client} = await startHost();
    failHistory(method);

    const played = await client.call({type: 'play', station: first});

    expect(played).toMatchObject({ok: true, message: 'Playing First Radio.', status: {
      station: first, playback: {state: 'playing', ready: true}, persistenceWarning: expect.stringContaining('ENOSPC')
    }});
    expect(played.status.persistenceWarning).toContain('RADIOCLI_HOME');
    expect(played.status.persistenceWarning).not.toContain(root);
    expect(played.status.persistenceWarning).not.toContain('\u001b');
  });

  it('retunes the queue when finishing the previous history entry fails', async () => {
    const {client} = await startHost();
    await client.call({type: 'play', station: first, queue: [first, second]});
    failHistory('finishActiveListeningSession');

    const next = await client.call({type: 'next'});

    expect(next).toMatchObject({ok: true, status: {station: second, playback: {state: 'playing'}, persistenceWarning: expect.any(String)}});
  });

  it('yields playback to an alarm when finishing history fails', async () => {
    const {client} = await startHost();
    await client.call({type: 'play', station: first});
    failHistory('finishActiveListeningSession');

    const yielded = await client.call({type: 'alarm-preempt'});

    expect(yielded).toMatchObject({ok: true, status: {station: null, queue: [], playback: {state: 'stopped'}, persistenceWarning: expect.any(String)}});
    expect(await client.status()).toMatchObject({station: null, playback: {state: 'stopped'}});
    expect(process.kill).not.toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it.each(['pause', 'resume'] as const)('keeps acknowledged %s controls successful after a history failure', async type => {
    const {client} = await startHost();
    await client.call({type: 'play', station: first});
    if (type === 'resume') await client.call({type: 'pause'});
    failHistory(type === 'pause' ? 'finishActiveListeningSession' : 'startListeningSession');

    const controlled = await client.call({type});

    expect(controlled).toMatchObject({ok: true, status: {
      playback: {state: type === 'pause' ? 'paused' : 'playing'}, persistenceWarning: expect.any(String)
    }});
  });

  it('contains heartbeat write failures and keeps the authenticated owner responsive', async () => {
    const {client} = await startHost();
    await client.call({type: 'play', station: first});
    failHistory('checkpointActiveListeningSession');

    expect(() => vi.advanceTimersByTime(30_000)).not.toThrow();

    expect(await client.status()).toMatchObject({station: first, playback: {state: 'playing'}, persistenceWarning: expect.stringContaining('ENOSPC')});
  });

  it.each(signalNames)('stops playback and removes session ownership on %s despite a history failure', async signal => {
    const {client, sessionPath} = await startHost();
    await client.call({type: 'play', station: first});
    failHistory('finishActiveListeningSession');

    hostSignalHandler(signal)!(signal);

    await vi.waitFor(() => expect(existsSync(sessionPath)).toBe(false));
    expect(existsSync(`${sessionPath}.owner`)).toBe(false);
    expect(playback.state).toBe('stopped');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('retains the warning through optional saves and clears it after an explicit save succeeds', async () => {
    const {client} = await startHost();
    failHistory('addRecent');
    await client.call({type: 'play', station: first});
    vi.advanceTimersByTime(30_000);
    expect((await client.status()).persistenceWarning).toContain('RADIOCLI_HOME');

    const saved = await client.call({type: 'update-settings', settings: {theme: 'amber'}});

    expect(saved.ok).toBe(true);
    expect(saved.status.persistenceWarning).toBeUndefined();
    expect(new JsonLibraryStore().snapshot().settings.theme).toBe('amber');
  });

  const explicitCommands: RadioSessionCommand[] = [
    {type: 'update-settings', settings: {theme: 'amber'}},
    {type: 'set-volume', volume: 42},
    {type: 'set-favorite', favorite: true}
  ];
  it.each(explicitCommands)('does not claim success for a failed explicit $type save', async command => {
    const {client, libraryPath} = await startHost();
    await client.call({type: 'play', station: first});
    const saved = readFileSync(libraryPath, 'utf8');
    const method = command.type === 'set-favorite' ? 'toggleFavorite' : 'updateSettings';
    vi.spyOn(JsonLibraryStore.prototype, method).mockImplementation(() => {
      throw new Error('Unable to write the RadioCLI library (EACCES). Set RADIOCLI_HOME to a private writable directory.');
    });

    await expect(client.call(command)).rejects.toThrow('RADIOCLI_HOME');

    expect(readFileSync(libraryPath, 'utf8')).toBe(saved);
    expect(new JsonLibraryStore().snapshot()).toMatchObject({favorites: [], settings: {volume: 70, theme: 'green'}});
    expect(ProviderManager.prototype.vote).not.toHaveBeenCalled();
  });
});

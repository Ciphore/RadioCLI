import {chmodSync, existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PlayerController} from '../player/player-controller.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {JsonLibraryStore} from '../storage/store.js';
import type {PlaybackState, Station} from '../types.js';
import {runHeadlessAgentHost} from './headless-host.js';
import {connectRadioSession, type RadioSessionClient, type RadioSessionCommand} from './session.js';

const first: Station = {id: 'first', provider: 'playlist', name: 'First Radio', tags: [], streamUrl: 'https://radio.example/first'};
const second: Station = {...first, id: 'second', name: 'Second Radio', streamUrl: 'https://radio.example/second'};
const historyMethods = ['addRecent', 'startListeningSession', 'finishActiveListeningSession', 'checkpointActiveListeningSession'] as const;
const signalNames = ['SIGTERM', 'SIGINT'] as const;
let root: string;
let playback: PlaybackState;
let originalListeners: Map<NodeJS.Signals, Set<NodeJS.SignalsListener>>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'radiocli headless 音楽-'));
  vi.stubEnv('RADIOCLI_HOME', root);
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']});
  originalListeners = new Map(signalNames.map(signal => [signal, new Set(process.listeners(signal))]));
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.spyOn(process, 'kill').mockReturnValue(true);
  playback = {backend: 'mpv', state: 'idle', volume: 70, muted: false, ready: false};
  vi.spyOn(PlayerController.prototype, 'refreshDetectedBackends').mockReturnValue(['mpv']);
  vi.spyOn(PlayerController.prototype, 'getState').mockImplementation(() => ({...playback}));
  vi.spyOn(PlayerController.prototype, 'play').mockImplementation(async (station, url) => {
    playback = {...playback, state: 'playing', stationName: station.name, streamUrl: url, ready: true};
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
  new JsonLibraryStore().updateSettings({shareDirectoryVotes: false});
  let startupError: unknown;
  void runHeadlessAgentHost().catch(error => {startupError = error;});
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
    vi.advanceTimersByTime(50);
    expect(process.kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    hostSignalHandler('SIGTERM')!('SIGTERM');
    await vi.waitFor(() => expect(existsSync(sessionPath)).toBe(false));
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

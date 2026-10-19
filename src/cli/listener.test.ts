import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {runCommand} from '../cli.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {AgentRadioService} from '../agent/service.js';
import {launchHeadlessHost, launchRadioTui} from '../agent/launcher.js';
import {startRadioSession, type RadioSessionCommand, type RadioSessionStatus} from '../agent/session.js';
import {startActiveAlarmSession} from '../alarms/active-session.js';
import type {Station} from '../types.js';
import {listenerCommands} from './arguments.js';

vi.mock('../agent/launcher.js', () => ({launchHeadlessHost: vi.fn(), launchRadioTui: vi.fn()}));

const first: Station = {id: 'first', provider: 'playlist', name: 'Evening Jazz', tags: ['jazz'], country: 'United States', countryCode: 'US', language: 'english', codec: 'MP3', bitrate: 128, streamUrl: 'https://example.com/first'};
const second: Station = {...first, id: 'second', name: 'Midnight Jazz', bitrate: 256};
const remote: Station = {...first, id: 'remote-id', provider: 'radio-browser', name: 'Remote Jazz'};
const runtime = {nodePath: process.execPath, cliPath: '/radiocli.js'};
let root: string;
let logs: string[];
let errors: string[];
let store: JsonLibraryStore;
let close: (() => Promise<void>) | undefined;
let seen: {command: RadioSessionCommand; source?: string}[];
let status: RadioSessionStatus;
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const initialExitCode = process.exitCode;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'radiocli-listener-'));
  vi.stubEnv('RADIOCLI_HOME', root);
  vi.stubEnv('RADIOCLI_DESKTOP_MEDIA', 'off');
  Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: false});
  Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: false});
  store = new JsonLibraryStore();
  logs = []; errors = []; seen = [];
  status = {owner: 'headless', station: null, queue: [], playback: {backend: 'mpv', state: 'idle', ready: false, volume: 70, muted: false}};
  vi.spyOn(console, 'log').mockImplementation(value => { logs.push(String(value)); });
  vi.spyOn(process.stderr, 'write').mockImplementation(value => { errors.push(String(value)); return true; });
  vi.spyOn(ProviderManager.prototype, 'search').mockResolvedValue([remote]);
  vi.spyOn(ProviderManager.prototype, 'popular').mockResolvedValue([first, second]);
  vi.spyOn(ProviderManager.prototype, 'byCountry').mockResolvedValue([first, second]);
  vi.spyOn(ProviderManager.prototype, 'byId').mockResolvedValue(remote);
  vi.spyOn(ProviderManager.prototype, 'countries').mockResolvedValue([{name: 'United States', code: 'US', stationCount: 12}]);
  vi.spyOn(ProviderManager.prototype, 'vote').mockResolvedValue(true);
});

afterEach(async () => {
  await close?.(); close = undefined;
  process.exitCode = initialExitCode;
  if (stdinTTY) Object.defineProperty(process.stdin, 'isTTY', stdinTTY); else Reflect.deleteProperty(process.stdin, 'isTTY');
  if (stdoutTTY) Object.defineProperty(process.stdout, 'isTTY', stdoutTTY); else Reflect.deleteProperty(process.stdout, 'isTTY');
  vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs();
  rmSync(root, {recursive: true, force: true});
});

async function session(ok = true): Promise<void> {
  const host = await startRadioSession(async (command, source) => {
    seen.push({command, source});
    if (command.type === 'play') status = {...status, station: command.station, queue: command.queue ?? [], playback: {...status.playback, state: 'playing', ready: true}};
    if (command.type === 'pause' && ok) status = {...status, playback: {...status.playback, state: 'paused'}};
    if (command.type === 'resume' && ok) status = {...status, playback: {...status.playback, state: 'playing'}};
    if (command.type === 'set-volume') status = {...status, playback: {...status.playback, volume: command.volume}};
    return {ok: command.type === 'status' || ok, message: ok ? 'Playback updated.' : 'This output cannot pause.', status};
  });
  close = host.close;
}

describe('listener command workflows', () => {
  it.each(listenerCommands)('%s help needs no library, directory, player, or MCP setup', async command => {
    await runCommand([command, '--help']);
    expect(logs.join('\n')).toContain('Usage: radiocli');
    expect(existsSync(join(root, 'radiocli.json'))).toBe(false);
    expect(ProviderManager.prototype.search).not.toHaveBeenCalled();
    expect(launchHeadlessHost).not.toHaveBeenCalled();
  });

  it('passes search filters through and preserves the existing piped search columns', async () => {
    await runCommand(['search', 'late night', 'jazz', '--country=us', '--codec', 'MP3', '--language', 'english', '--min-bitrate', '128', '--limit', '5']);
    expect(ProviderManager.prototype.search).toHaveBeenCalledWith('late night jazz', expect.anything(), {limit: 5, countryCode: 'US', language: 'english', codec: 'MP3', minBitrate: 128});
    expect(logs).toEqual(['radio-browser:remote-id\tRemote Jazz\tUnited States\tMP3\t128']);
  });

  it('returns one JSON document with favorite markers and a stable empty array', async () => {
    store.toggleFavorite(remote);
    await runCommand(['search', 'jazz', '--json']);
    expect(JSON.parse(logs.join('\n'))).toMatchObject([{id: 'radio-browser:remote-id', favorite: true, bitrate: 128}]);
    logs = [];
    vi.mocked(ProviderManager.prototype.search).mockResolvedValueOnce([]);
    await runCommand(['search', 'missing', '--json']);
    expect(logs).toEqual(['[]']);
    expect(errors).toEqual([]);
  });

  it.each([
    ['search', 'jazz', '--limt', '3'], ['search', 'jazz', '--limit', '2.5'],
    ['search', 'jazz', '--limit', '101'], ['search', 'jazz', '--country', 'USA'],
    ['search', 'jazz', '--json', '--plain'], ['search', 'jazz', '--limit'],
    ['search', 'jazz', '--pick'], ['now', '--watch'], ['pause', 'extra'],
    ['play', '--favorites', '--recent'], ['play', '--popular', '--source', 'recent'],
    ['play', 'jazz', '--favorites'], ['play', '--favorites=yes']
  ])('rejects invalid or noninteractive input before playback: %s', async (...args) => {
    await expect(runCommand(args)).rejects.toThrow();
    expect(launchHeadlessHost).not.toHaveBeenCalled();
    expect(ProviderManager.prototype.search).not.toHaveBeenCalled();
  });

  it('plays saved names through the existing session while agents remain disabled', async () => {
    store.addImported([first, second]);
    await session();
    await runCommand(['play', 'evening jazz', '--json']);
    expect(seen.find(item => item.command.type === 'play')).toMatchObject({source: 'cli', command: {station: first, openNowPlaying: false}});
    expect(ProviderManager.prototype.search).not.toHaveBeenCalled();
    expect(launchRadioTui).not.toHaveBeenCalled();
    expect(new JsonLibraryStore().snapshot().settings.agentControl?.enabled).toBe(false);
    await expect(new AgentRadioService(runtime).control({type: 'pause'})).rejects.toThrow('disabled');
  });

  it.each(['custom-4bf0e7aa', 'playlist:custom-4bf0e7aa'])('plays a migrated 0.2.4 stream by its old ID: %s', async id => {
    store.addImported([{...first, id: 'custom-4bf0e7aa', streamUrl: 'https://example.test/Aa'}]);
    const migrated = new JsonLibraryStore().snapshot().imported[0]!;
    expect(migrated.id).toMatch(/^custom-v2-/);
    await session();
    await runCommand(['play', id, '--no-input']);
    expect(status.station).toEqual(migrated);
    expect(ProviderManager.prototype.search).not.toHaveBeenCalled();
    expect(ProviderManager.prototype.byId).not.toHaveBeenCalled();
  });

  it('requires a current ID when two migrated streams share an old ID', async () => {
    store.addImported(['Aa', 'BB'].map(path => ({...first, id: 'custom-4bf0e7aa', streamUrl: `https://example.test/${path}`})));
    await session();
    await expect(runCommand(['play', 'playlist:custom-4bf0e7aa', '--no-input'])).rejects.toThrow('Several stations match');
    expect(seen.some(item => item.command.type === 'play')).toBe(false);
    expect(ProviderManager.prototype.byId).not.toHaveBeenCalled();
  });

  it('starts a detached host when no player exists and returns a reusable session', async () => {
    store.addImported([first]);
    vi.mocked(launchHeadlessHost).mockImplementationOnce(async () => session());
    await runCommand(['play', stationKey(first), '--quiet']);
    await runCommand(['volume', '40', '--quiet']);
    expect(launchHeadlessHost).toHaveBeenCalledOnce();
    expect(launchRadioTui).not.toHaveBeenCalled();
    expect(status.playback.volume).toBe(40);
    expect(logs).toEqual([]);
  });

  it('uses play to resume the current station while preserving its queue', async () => {
    store.addRecent(remote);
    await session();
    status = {...status, station: second, queue: [first, second], playback: {...status.playback, state: 'paused'}};
    await runCommand(['play', '--json']);
    expect(seen.filter(item => item.command.type !== 'status')).toEqual([{source: 'cli', command: {type: 'resume'}}]);
    expect(JSON.parse(logs.join('\n')).status).toMatchObject({station: second, queue: [first, second], playback: {state: 'playing'}});
    expect(ProviderManager.prototype.search).not.toHaveBeenCalled();
    expect(launchHeadlessHost).not.toHaveBeenCalled();
  });

  it.each(['playing', 'loading', 'paused'] as const)('keeps an active %s station without retuning when no change is needed', async state => {
    store.addRecent(remote);
    await session();
    status = {...status, station: second, queue: [first, second], playback: {...status.playback, state}};
    await runCommand(['play', '--quiet', ...(state === 'paused' ? ['--keep-playing'] : [])]);
    expect(seen.every(item => item.command.type === 'status')).toBe(true);
    expect(status).toMatchObject({station: second, queue: [first, second], playback: {state}});
    expect(logs).toEqual([]);
  });

  it('starts the most recent station when play has no active session', async () => {
    store.addRecent(first); store.addRecent(second);
    vi.mocked(launchHeadlessHost).mockImplementationOnce(async () => session());
    await runCommand(['play']);
    expect(status).toMatchObject({station: second, queue: [second, first], playback: {state: 'playing'}});
    expect(launchHeadlessHost).toHaveBeenCalledOnce();
  });

  it.each(['stopped', 'error'] as const)('restarts the selected station and its queue after playback is %s', async state => {
    store.addRecent(remote);
    await session();
    status = {...status, station: second, queue: [first, second], playback: {...status.playback, state}};
    await runCommand(['play']);
    expect(status).toMatchObject({station: second, queue: [first, second], playback: {state: 'playing'}});
  });

  it('offers a direct listening command when there is nothing to continue', async () => {
    await expect(runCommand(['play'])).rejects.toThrow('Start with radiocli play "station name".');
    expect(ProviderManager.prototype.search).not.toHaveBeenCalled();
    expect(launchHeadlessHost).not.toHaveBeenCalled();
  });

  it.each([
    ['--favorites'], ['--recent'], ['--popular'], ['--source', 'favorites'], ['--source', 'favorite']
  ])('selects an explicit queue with %s even while another station is active', async (...options) => {
    store.toggleFavorite(second); store.toggleFavorite(first);
    store.addRecent(second); store.addRecent(first);
    await session();
    status = {...status, station: remote, queue: [remote], playback: {...status.playback, state: 'paused'}};
    await runCommand(['play', ...options]);
    expect(status).toMatchObject({station: first, queue: [first, second], playback: {state: 'playing'}});
    expect(seen.some(item => item.command.type === 'resume')).toBe(false);
  });

  it('combines the favorites shortcut with filters and random selection', async () => {
    store.toggleFavorite(first); store.toggleFavorite(second);
    await session();
    await runCommand(['play', '--favorites', '--country', 'US', '--min-bitrate', '192', '--random']);
    expect(status).toMatchObject({station: second, queue: [second]});
    expect(ProviderManager.prototype.search).not.toHaveBeenCalled();
    expect(ProviderManager.prototype.byCountry).not.toHaveBeenCalled();
  });

  it('honors a filter without resuming an unrelated active station', async () => {
    store.addRecent(first); store.addRecent(second);
    await session();
    status = {...status, station: remote, queue: [remote], playback: {...status.playback, state: 'paused'}};
    await runCommand(['play', '--min-bitrate', '192']);
    expect(status).toMatchObject({station: second, queue: [second]});
  });

  it('resolves a unique remote result and rejects ambiguous names in scripts', async () => {
    await session();
    await runCommand(['play', 'remote', '--no-input']);
    expect(status.station).toEqual(remote);
    vi.mocked(ProviderManager.prototype.search).mockResolvedValue([first, second]);
    const previousPlays = seen.filter(item => item.command.type === 'play').length;
    await expect(runCommand(['play', 'jazz', '--no-input'])).rejects.toThrow(/Several stations match[\s\S]*playlist:first[\s\S]*playlist:second/);
    expect(seen.filter(item => item.command.type === 'play')).toHaveLength(previousPlays);
  });

  it('preserves discovery order so next follows the selected station in its queue', async () => {
    await session();
    vi.mocked(ProviderManager.prototype.search).mockResolvedValue([first, second, remote]);
    await runCommand(['play', 'midnight jazz']);
    expect(status.station).toEqual(second);
    expect(status.queue).toEqual([first, second, remote]);
  });

  it('lists library stations and saves, plays, completes, and removes named presets', async () => {
    store.addImported([first]);
    await runCommand(['preset', 'save', 'Work', 'Evening Jazz', '--json']);
    expect(new JsonLibraryStore().snapshot().presets).toEqual([{name: 'work', station: first}]);
    logs = [];
    await runCommand(['_complete', 'play', 'wo']);
    expect(logs).toEqual(['work']);
    await session();
    await runCommand(['play', 'work']);
    expect(status.station).toEqual(first);
    await runCommand(['preset', 'save', 'current']);
    expect(new JsonLibraryStore().snapshot().presets?.some(item => item.name === 'current')).toBe(true);
    await runCommand(['preset', 'remove', 'work']);
    logs = [];
    await runCommand(['presets', '--json']);
    expect(JSON.parse(logs.join('\n'))).toEqual([{name: 'current', stationId: 'playlist:first', stationName: first.name}]);
  });

  it('keeps concurrent playback writes and backup round trips from erasing presets', () => {
    const stalePlayer = new JsonLibraryStore();
    store.savePreset('work', first);
    stalePlayer.addRecent(second);
    const refreshed = new JsonLibraryStore();
    refreshed.savePreset('night', second);
    store.removePreset('work');
    const library = new JsonLibraryStore();
    expect(library.snapshot().presets).toEqual([{name: 'night', station: second}]);
    expect(library.snapshot().recent[0]?.station).toEqual(second);
    const backup = library.exportBackup(join(root, 'backup.json'));
    expect(readFileSync(backup, 'utf8')).toContain('"night"');
    library.savePreset('extra', first);
    library.importBackup(backup);
    expect(library.snapshot().presets).toEqual([{name: 'night', station: second}]);
  });

  it('favorites the current station through the player, and can save a station while stopped', async () => {
    store.addImported([first]);
    await runCommand(['favorite', 'evening jazz', '--quiet']);
    expect(new JsonLibraryStore().snapshot().favorites).toEqual([first]);
    await runCommand(['unfavorite', 'evening jazz', '--quiet']);
    expect(new JsonLibraryStore().snapshot().favorites).toEqual([]);
    await session();
    status = {...status, station: first};
    await runCommand(['favorite']);
    expect(seen.at(-1)).toMatchObject({source: 'cli', command: {type: 'set-favorite', favorite: true, station: first}});
  });

  it('reports metadata and output, and saves volume without starting playback', async () => {
    await runCommand(['volume', '40', '--quiet']);
    expect(new JsonLibraryStore().snapshot().settings.volume).toBe(40);
    expect(launchHeadlessHost).not.toHaveBeenCalled();
    await session();
    status = {...status, station: first, nowPlaying: {title: 'Artist - Track', updatedAt: '2030-01-01T00:00:00Z'}, playback: {...status.playback, state: 'paused', muted: true, airPlayDeviceName: 'Office'}};
    await runCommand(['now', '--json']);
    expect(JSON.parse(logs.join('\n'))).toMatchObject({station: first, nowPlaying: {title: 'Artist - Track'}, playback: {state: 'paused', airPlayDeviceName: 'Office'}});
  });

  it('preserves backend failures and returns a failing exit code in JSON mode', async () => {
    await session(false);
    await expect(runCommand(['pause'])).rejects.toThrow('cannot pause');
    await runCommand(['pause', '--json']);
    expect(JSON.parse(logs.join('\n')).ok).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it.each([false, true])('does not start or resume ordinary playback over an active alarm (paused: %s)', async paused => {
    store.addImported([first]);
    if (paused) {
      await session();
      status = {...status, station: first, queue: [first], playback: {...status.playback, state: 'paused'}};
    }
    const alarm = await startActiveAlarmSession({alarmId: 'alarm', scheduledAt: '2030-01-01T08:00:00Z', stationName: first.name, station: first, startedAt: '2030-01-01T08:00:01Z', state: 'playing'}, {onDismiss: vi.fn(), onSnooze: vi.fn(), onKeepPlaying: vi.fn(), onHandoff: vi.fn()});
    try {
      await expect(runCommand(paused ? ['play'] : ['play', 'Evening Jazz'])).rejects.toThrow('alarm is currently active');
      expect(launchHeadlessHost).not.toHaveBeenCalled();
      expect(seen.every(item => item.command.type === 'status')).toBe(true);
    } finally { await alarm.close(); }
  });

  it('suggests a misspelled command without executing it', async () => {
    await expect(runCommand(['paly'])).rejects.toThrow('Did you mean radiocli play?');
    expect(launchHeadlessHost).not.toHaveBeenCalled();
  });

  it('does not repair or rewrite a damaged library during shell completion', async () => {
    const path = join(root, 'radiocli.json');
    writeFileSync(path, '{unfinished');
    await runCommand(['_complete', 'play', '--co']);
    expect(readFileSync(path, 'utf8')).toBe('{unfinished');
    expect(logs).toEqual(['--country\n--codec']);
    expect(errors).toEqual([]);
  });

  it.each([
    [['play', '--fav'], '--favorites'], [['help', '--'], '--all'], [['help', 'pl'], 'play']
  ] as const)('completes the simpler playback and help forms: %s', async (words, expected) => {
    await runCommand(['_complete', ...words]);
    expect(logs).toEqual([expected]);
    expect(existsSync(join(root, 'radiocli.json'))).toBe(false);
  });
});

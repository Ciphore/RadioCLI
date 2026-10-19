import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough, Writable} from 'node:stream';
import {act} from 'react';
import {render} from 'ink';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PlayerController} from '../player/player-controller.js';
import * as backends from '../player/backend-install.js';
import * as airplay from '../player/airplay-discovery.js';
import * as session from '../agent/session.js';
import * as presence from '../alarms/tui-presence.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {JsonLibraryStore} from '../storage/store.js';
import {LibraryRepository} from '../storage/repository.js';
import type {AppSettings, DiscoveryPage, PlaybackState, Station} from '../types.js';
import {App} from './App.js';
import * as content from './AppContent.js';
import type {AlarmTuiService} from './alarm-tui-service.js';
import {nextReceiverStyle, nextTheme} from './theme.js';
import {settingsGroups, settingsItemsForPage, type SettingsPage} from './screen-items.js';

const directories: string[] = [];
const instances: ReturnType<typeof render>[] = [];
const station: Station = {id: 'navigation-radio', provider: 'radio-browser', name: 'Navigation Radio', tags: [], streamUrl: 'https://example.test/live'};
const country = {name: 'Canada', code: 'CA', stationCount: 1};
const service: AlarmTuiService = {
  sync: async () => null, syncAll: async () => [], remove: async () => undefined,
  runtimeStatus: async () => ({capabilities: {supported: true, exactWake: false, catchUpAfterWake: true, message: 'ready'}, degradedAlarmIds: new Set(), message: 'ready'}),
  activeAlarms: async () => [], prepareTerminalAccess: async () => undefined,
  verifySetup: async () => ({state: 'passed', startedAt: '2026-10-03T12:00:00.000Z', steps: []})
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  for (const name of ['TERM', 'NO_COLOR', 'RADIOCLI_ASCII', 'RADIOCLI_UNICODE', 'RADIOCLI_SCREEN_READER', 'RADIOCLI_OFFLINE', 'RADIOCLI_LOW_BANDWIDTH']) vi.stubEnv(name, undefined);
  vi.stubEnv('RADIOCLI_DISABLE_UPDATE_CHECK', '1');
  vi.stubEnv('INK_SCREEN_READER', 'false');
  vi.spyOn(backends, 'detectPlaybackBackends').mockReturnValue(['mpv']);
  vi.spyOn(airplay, 'discoverAirPlayDevices').mockResolvedValue([]);
  vi.spyOn(ProviderManager.prototype, 'health').mockResolvedValue({});
  vi.spyOn(ProviderManager.prototype, 'searchPage').mockImplementation(async function(this: ProviderManager, query, settings, options = {}) { const offset = Number(options.cursor ?? 0); const items = await this.search(query, settings, {...options, offset}); return {items, exhausted: items.length < (options.limit ?? 90), sources: [], nextCursor: String(offset + items.length)}; });
  vi.spyOn(ProviderManager.prototype, 'byCountryPage').mockImplementation(async function(this: ProviderManager, code, options = {}) { const offset = Number(options.cursor ?? 0); const items = await this.byCountry(code, options.limit, offset); return {items, exhausted: items.length < (options.limit ?? 120), sources: [], nextCursor: String(offset + items.length)}; });
  vi.spyOn(session, 'startRadioSession').mockResolvedValue({close: async () => undefined});
  vi.spyOn(presence, 'registerTuiPresence').mockReturnValue(() => undefined);
  vi.spyOn(PlayerController.prototype, 'stop').mockResolvedValue(undefined);
  // Observe props while retaining the real renderer and every screen component.
  vi.spyOn(content, 'AppContent');
});

afterEach(() => {
  act(() => { for (const instance of instances.splice(0)) {instance.unmount(); instance.cleanup();} });
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) rmSync(directory, {recursive: true, force: true});
});

function pending<T>() {
  let finish!: (value: T) => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {finish = resolve; fail = reject;});
  return {promise, finish, fail};
}

async function open({platform = process.platform, columns = 100, rows = 30, screenReader = false, settings = {}, favorites = [station]}: {
  platform?: NodeJS.Platform; columns?: number; rows?: number; screenReader?: boolean; settings?: Partial<AppSettings>; favorites?: Station[];
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'radiocli-navigation-'));
  directories.push(directory);
  vi.stubEnv('RADIOCLI_HOME', directory);
  const store = new JsonLibraryStore(join(directory, 'library.json'));
  store.updateSettings({resumeOnLaunch: false, automaticUpdateChecks: false, reduceMotion: true, mouseSupport: false, desktopMediaControls: 'off', ...settings});
  for (const favorite of favorites) store.toggleFavorite(favorite);
  let frame = '';
  const stdout = Object.assign(new Writable({write(chunk, _encoding, done) {frame = String(chunk); done();}}), {columns, rows, isTTY: true, getColorDepth: () => 24}) as NodeJS.WriteStream;
  const errors: string[] = [];
  const stderr = new Writable({write(chunk, _encoding, done) {errors.push(String(chunk)); done();}}) as NodeJS.WriteStream;
  const stdin = Object.assign(new PassThrough(), {isTTY: true, setRawMode: () => undefined, ref: () => undefined, unref: () => undefined}) as unknown as NodeJS.ReadStream;
  await act(async () => {instances.push(render(<App store={store} alarmService={service} platform={platform} />, {
    stdout, stderr, stdin, debug: true, patchConsole: false, exitOnCtrlC: false,
    isScreenReaderEnabled: screenReader, kittyKeyboard: {mode: 'disabled'}
  }));});
  expect(errors.join('')).toBe('');
  return {
    store,
    frame: () => frame,
    input: async (data: string) => {await act(async () => {(stdin as unknown as PassThrough).write(data);});},
    state: () => vi.mocked(content.AppContent).mock.calls.at(-1)![0]
  };
}

function delayFirstSettingsSave() {
  const gate = pending<void>();
  const originalUpdate = LibraryRepository.prototype.updateSettings;
  let first = true;
  const updates = vi.spyOn(LibraryRepository.prototype, 'updateSettings').mockImplementation(async function(this: LibraryRepository, settings) {
    if (first) {first = false; await gate.promise;}
    return originalUpdate.call(this, settings);
  });
  return {gate, updates};
}

async function selectSetting(app: Awaited<ReturnType<typeof open>>, page: Exclude<SettingsPage, 'root'>, item: string) {
  await app.input(':settings\r');
  await app.input('\u001B[B'.repeat(settingsGroups.findIndex(group => group.id === page)) + '\r');
  const index = settingsItemsForPage(page, app.state().airPlaySupported).indexOf(item);
  expect(index).toBeGreaterThanOrEqual(0);
  if (index > 0) await app.input('\u001B[B'.repeat(index));
}

describe('Ordered critical settings', () => {
  it.each([{input: 't', field: 'theme', message: 'Display color:'}, {input: 'v', field: 'receiverStyle', message: 'Receiver style:'}] as const)(
    'retains two rapid $field changes while the first save is pending', async ({input, field, message}) => {
      const {gate, updates} = delayFirstSettingsSave();
      const app = await open();
      const original = app.store.snapshot().settings;
      const expected = field === 'theme'
        ? [nextTheme(original.theme), nextTheme(nextTheme(original.theme))]
        : [nextReceiverStyle(original.receiverStyle), nextReceiverStyle(nextReceiverStyle(original.receiverStyle))];
      await app.input(input);
      await app.input('\t');
      await app.input(input);
      expect(updates).toHaveBeenCalledTimes(1);
      expect(app.state().library.settings[field]).toBe(original[field]);
      expect(app.frame()).not.toContain(message);
      await act(async () => {gate.finish();});
      expect(updates.mock.calls.map(([patch]) => patch[field])).toEqual(expected);
      expect(app.store.snapshot().settings[field]).toBe(expected[1]);
      expect(app.state().library.settings[field]).toBe(expected[1]);
      expect(app.frame()).toContain(`${message} ${expected[1]}`);
    }
  );

  it.each([
    {page: 'discovery', item: 'Toggle nearby location lookup', field: 'enableNearbyLocation'},
    {page: 'discovery', item: 'Toggle Radio Garden experimental adapter', field: 'enableRadioGarden'},
    {page: 'discovery', item: 'Share favorite votes with Radio Browser', field: 'shareDirectoryVotes'},
    {page: 'playback', item: 'Toggle skip broken streams', field: 'skipBrokenStreams'},
    {page: 'playback', item: 'Resume last station on launch', field: 'resumeOnLaunch'},
    {page: 'appearance', item: 'Transparent background', field: 'transparentBackground'},
    {page: 'appearance', item: 'ASCII-safe display', field: 'asciiMode'},
    {page: 'appearance', item: 'Reduce motion', field: 'reduceMotion'},
    {page: 'appearance', item: 'Mouse and trackpad scrolling', field: 'mouseSupport'},
    {page: 'updates', item: 'Automatically check for updates', field: 'automaticUpdateChecks'},
    {page: 'agent', item: 'Open TUI for agent playback', field: 'openUiOnPlay'},
    {page: 'agent', item: 'Show Now Playing for agent playback', field: 'focusNowPlaying'}
  ] as const)('retains both pending $field toggles', async ({page, item, field}) => {
    const {gate, updates} = delayFirstSettingsSave();
    const app = await open();
    const read = (settings: Partial<AppSettings>) => field === 'openUiOnPlay' || field === 'focusNowPlaying'
      ? settings.agentControl?.[field] : settings[field];
    const original = read(app.store.snapshot().settings);
    await selectSetting(app, page, item);
    await app.input('\r'); await app.input('\r');
    expect(updates).toHaveBeenCalledTimes(1);
    expect(read(app.state().library.settings)).toBe(original);
    if (field === 'skipBrokenStreams') expect(app.frame()).not.toContain('Skip broken streams disabled.');
    await act(async () => {gate.finish();});
    expect(updates.mock.calls.map(([patch]) => read(patch))).toEqual([!original, original]);
    expect(read(app.store.snapshot().settings)).toBe(original);
    expect(read(app.state().library.settings)).toBe(original);
  });

  it('recovers after a failed save and evaluates the next action against committed settings', async () => {
    const {gate, updates} = delayFirstSettingsSave();
    const app = await open();
    const original = app.store.snapshot().settings.theme;
    await app.input('t'); await app.input('t');
    await act(async () => {gate.fail(new Error('Disk temporarily unavailable.'));});
    expect(updates.mock.calls.map(([patch]) => patch.theme)).toEqual([nextTheme(original), nextTheme(original)]);
    expect(app.store.snapshot().settings.theme).toBe(nextTheme(original));
    expect(app.frame()).toContain(`Display color: ${nextTheme(original)}`);
  });

  it('merges separate agent preferences when their saves overlap', async () => {
    const {gate} = delayFirstSettingsSave();
    const app = await open();
    const original = app.store.snapshot().settings.agentControl!;
    await selectSetting(app, 'agent', 'Open TUI for agent playback');
    await app.input('\r'); await app.input('\u001B[B\r');
    await act(async () => {gate.finish();});
    expect(app.store.snapshot().settings.agentControl).toEqual({...original, openUiOnPlay: !original.openUiOnPlay, focusNowPlaying: !original.focusNowPlaying});
  });

  it('queues no-value command toggles while preserving explicit command values', async () => {
    const {gate, updates} = delayFirstSettingsSave();
    const app = await open({settings: {asciiMode: false}});
    await app.input(':ascii\r'); await app.input(':ascii\r'); await app.input(':ascii on\r');
    expect(updates).toHaveBeenCalledTimes(1);
    expect(app.frame()).not.toContain('ascii on.');
    await act(async () => {gate.finish();});
    expect(updates.mock.calls.map(([patch]) => patch.asciiMode)).toEqual([true, false, true]);
    expect(app.store.snapshot().settings.asciiMode).toBe(true);
    expect(app.frame()).toContain('ascii on.');
  });

  it('appends every learned key and acknowledges learning only after saving', async () => {
    const {gate} = delayFirstSettingsSave();
    const app = await open();
    await app.input(':learn next\r'); await app.input('z');
    expect(app.frame()).not.toContain('Learned next key.');
    await app.input(':learn next\r'); await app.input('y');
    await act(async () => {gate.finish();});
    expect(app.store.snapshot().settings.mediaKeys?.next).toEqual(['z', 'y']);
    expect(app.frame()).toContain('Learned next key.');
  });

  it('does not acknowledge a failed learned-key reset', async () => {
    const {gate} = delayFirstSettingsSave();
    const app = await open({settings: {mediaKeys: {previous: [], playPause: [], next: ['z']}}});
    await app.input(':keys reset\r');
    expect(app.frame()).not.toContain('Learned media keys reset.');
    await act(async () => {gate.fail(new Error('Disk temporarily unavailable.'));});
    expect(app.store.snapshot().settings.mediaKeys?.next).toEqual(['z']);
    expect(app.frame()).toContain('Disk temporarily unavailable.');
    expect(app.frame()).not.toContain('Learned media keys reset.');
  });

  it('cycles through distinct audio outputs while earlier saves are pending', async () => {
    vi.mocked(backends.detectPlaybackBackends).mockReturnValue(['mpv', 'ffplay']);
    const {gate, updates} = delayFirstSettingsSave();
    const app = await open({settings: {preferredBackend: 'auto'}});
    await app.input('o'); await app.input('o');
    expect(updates).toHaveBeenCalledTimes(1);
    expect(app.store.snapshot().settings.preferredBackend).toBe('auto');
    expect(app.frame()).not.toContain('Audio output: mpv.');
    await act(async () => {gate.finish();});
    expect(updates.mock.calls.map(([patch]) => patch.preferredBackend)).toEqual(['mpv', 'ffplay']);
    expect(app.store.snapshot().settings.preferredBackend).toBe('ffplay');
    expect(app.frame()).toContain('Audio output: This device (ffplay fallback).');
  });

  it('does not acknowledge local AirPlay correction before its save succeeds', async () => {
    vi.mocked(backends.detectPlaybackBackends).mockReturnValue(['mpv', 'airplay']);
    vi.mocked(airplay.discoverAirPlayDevices).mockResolvedValue([{id: 'local', name: 'This computer', host: '127.0.0.1', port: 7000,
      local: true, txt: [], requiresPassword: false, airplay2: false}]);
    const {gate, updates} = delayFirstSettingsSave();
    const app = await open({platform: 'darwin', favorites: [], settings: {preferredBackend: 'airplay', preferredAirPlayDevice: 'local'}});
    await app.input(':airplay\r');
    expect(updates).toHaveBeenCalledWith({preferredBackend: 'mpv'});
    expect(app.frame()).not.toContain('Audio output: This device (mpv).');
    await act(async () => {gate.fail(new Error('Disk temporarily unavailable.'));});
    expect(app.store.snapshot().settings.preferredBackend).toBe('airplay');
    expect(app.frame()).toContain('Disk temporarily unavailable.');
    expect(app.frame()).not.toContain('Audio output: This device (mpv).');
  });
});

describe('Responsive tab navigation', () => {
  const platforms = ['darwin', 'linux', 'win32'] as const;
  const sizes = [{columns: 100, rows: 30}, {columns: 50, rows: 16}, {columns: 24, rows: 8}];
  const keys = [
    {name: 'Right', input: '\u001B[C\u001B[C', destination: 'library'},
    {name: 'Tab', input: '\t\t', destination: 'library'},
    {name: 'Shift+Tab', input: '\u001B[Z\u001B[Z', destination: 'stats'}
  ];
  it.each(platforms.flatMap(platform => sizes.flatMap(size => keys.map(key => ({platform, ...size, ...key})))))(
    'preserves both $name presses on $platform at $columns x $rows', async ({platform, columns, rows, input, destination}) => {
      const app = await open({platform, columns, rows});
      await app.input(input);
      expect(app.state().screen).toBe(destination);
    }
  );

  it('handles rapid tabs in screen reader and ASCII environments', async () => {
    const app = await open({screenReader: true, settings: {asciiMode: true}});
    await app.input('\t\t');
    expect(app.state().screen).toBe('library');
  });

  it('accepts Kitty press/repeat events and ignores releases', async () => {
    const app = await open();
    await app.input('\u001B[9;1:1u\u001B[9;1:2u\u001B[9;1:3u');
    expect(app.state().screen).toBe('library');
  });

  it('keeps a tab press immediately after scrolling', async () => {
    const app = await open();
    await app.input('\u001B[<64;10;10M\t');
    expect(app.state().screen).toBe('now-playing');
  });

  it('handles a media key once while retaining following tab navigation', async () => {
    const pause = vi.spyOn(PlayerController.prototype, 'togglePause').mockResolvedValue({ok: true});
    const app = await open();
    await app.input('\u001B[19~\t');
    expect(pause).toHaveBeenCalledTimes(1);
    expect(app.state().screen).toBe('now-playing');
  });

  it('retains Library selection across a burst that leaves and returns', async () => {
    const app = await open({favorites: [station, {...station, id: 'second', name: 'Second Radio'}]});
    await app.input('2');
    await app.input('\u001B[B');
    expect(app.state().selected).toBe(1);
    await app.input('\u001B[D\u001B[D\u001B[C\u001B[C');
    expect(app.state().screen).toBe('library');
    expect(app.state().selected).toBe(1);
  });

  it('tunes the destination tab selection when Enter arrives in the same chunk', async () => {
    vi.spyOn(ProviderManager.prototype, 'nearby').mockResolvedValue([{...station, id: 'explore', name: 'Explore Radio'}]);
    vi.spyOn(ProviderManager.prototype, 'resolve').mockImplementation(async item => ({url: item.streamUrl!}));
    const play = vi.spyOn(PlayerController.prototype, 'play').mockResolvedValue(undefined);
    const app = await open();
    await app.input('3');
    await app.input('\u001B[D\r');
    expect(app.state().screen).toBe('library');
    expect(play).toHaveBeenCalledWith(station, station.streamUrl, expect.objectContaining({signal: expect.any(AbortSignal)}));
  });

  it('keeps Tab completion in command mode', async () => {
    const app = await open();
    await app.input(':'); await app.input('sett'); await app.input('\t\t'); await app.input('\r');
    expect(app.state().screen).toBe('settings');
  });

  it('preserves pasted queries and commands while ignoring pasted navigation bytes', async () => {
    vi.spyOn(ProviderManager.prototype, 'search').mockResolvedValue([station]);
    const app = await open();
    await app.input('\u001B[200~\t\t\u001B[201~');
    expect(app.state().screen).toBe('home');
    await app.input('\u001B[200~:settings\r\u001B[201~');
    expect(app.state().screen).toBe('settings');
    await app.input('\u001B[200~:search jazz\r\u001B[201~');
    expect(app.state().screen).toBe('search');
    expect(app.state().displayStations).toEqual([station]);
  });

  it('routes a following Enter to Alarms after rapid tab navigation', async () => {
    vi.spyOn(ProviderManager.prototype, 'nearby').mockResolvedValue([station]);
    const play = vi.spyOn(PlayerController.prototype, 'play').mockResolvedValue(undefined);
    const app = await open();
    await app.input('8\u001B[13u');
    expect(app.state().screen).toBe('alarm-editor');
    expect(play).not.toHaveBeenCalled();
  });

  it('uses the destination controls after leaving Alarms in one input chunk', async () => {
    vi.spyOn(ProviderManager.prototype, 'nearby').mockResolvedValue([station]);
    vi.spyOn(ProviderManager.prototype, 'resolve').mockImplementation(async item => ({url: item.streamUrl!}));
    const play = vi.spyOn(PlayerController.prototype, 'play').mockResolvedValue(undefined);
    const app = await open();
    await app.input('3'); await app.input('b'); await app.input('8');
    expect(app.state().screen).toBe('alarms');
    await app.input('\u001B[C\u001B[C\u001B[C\r');
    expect(app.state().screen).toBe('explore');
    expect(play).toHaveBeenCalledWith(station, station.streamUrl, expect.objectContaining({signal: expect.any(AbortSignal)}));
  });

  it('uses the current Settings page when Enter follows a rapid tab round trip', async () => {
    const app = await open();
    await app.input('9'); await app.input('\r');
    expect(app.state().settingsPage).toBe('playback');
    await app.input('\u001B[D\u001B[C\r');
    expect(app.state().screen).toBe('settings');
    expect(app.state().settingsPage).toBe('playback');
  });
});

describe('Independent background discovery', () => {
  it('loads country stations immediately without reclaiming focus on completion', async () => {
    const load = pending<Station[]>();
    vi.spyOn(ProviderManager.prototype, 'countries').mockResolvedValue([country]);
    vi.spyOn(ProviderManager.prototype, 'byCountry').mockReturnValue(load.promise);
    const app = await open();
    await app.input('5'); await app.input('\r');
    expect(app.state().screen).toBe('stations');
    expect(app.state().loadingStations).toBe(true);
    await app.input(':settings\r');
    await act(async () => {load.finish([station]);});
    expect(app.state().screen).toBe('settings');
    await app.input('\u001B[D\u001B[D\u001B[D');
    expect(app.state().screen).toBe('countries');
    await app.input('\r');
    await act(async () => {load.finish([station]);});
    expect(app.state().screen).toBe('stations');
    expect(app.state().displayStations).toEqual([station]);
  });

  it('lets a delayed Explore movement finish without returning from Search', async () => {
    const nearby = vi.spyOn(ProviderManager.prototype, 'nearby').mockResolvedValue([station]);
    const app = await open();
    await app.input('3'); await app.input('d'); await app.input('\t');
    expect(app.state().screen).toBe('search');
    await act(async () => {await vi.advanceTimersByTimeAsync(220);});
    expect(app.state().screen).toBe('search');
    expect(app.state().loadingStations).toBe(false);
    expect(nearby).toHaveBeenCalledTimes(2);
  });

  it('reuses pending Explore loads and keeps Library ready', async () => {
    const load = pending<Station[]>();
    const nearby = vi.spyOn(ProviderManager.prototype, 'nearby').mockReturnValue(load.promise);
    const app = await open();
    await app.input('3');
    expect(nearby).toHaveBeenCalledTimes(1);
    await app.input('\u001B[Z');
    expect(app.state().screen).toBe('library');
    expect(app.state().loadingStations).toBe(false);
    expect(app.state().displayStations).toEqual([station]);
    await app.input('\t');
    expect(app.state().loadingStations).toBe(true);
    expect(nearby).toHaveBeenCalledTimes(1);
    await act(async () => {load.finish([station]);});
    expect(app.state().loadingStations).toBe(false);
  });

  it('reuses pending Nearby location detection without blocking other station tabs', async () => {
    const location = pending<{latitude: number; longitude: number; source: string}>();
    const detect = vi.spyOn(ProviderManager.prototype, 'detectLocation').mockReturnValue(location.promise);
    vi.spyOn(ProviderManager.prototype, 'nearby').mockResolvedValue([station]);
    const app = await open({settings: {enableNearbyLocation: true}});
    await app.input('6'); await app.input('\t'); await app.input('\u001B[Z');
    expect(detect).toHaveBeenCalledTimes(1);
    await app.input('\u001B[D\u001B[D');
    expect(app.state().screen).toBe('search');
    expect(app.state().loadingStations).toBe(false);
    await act(async () => {location.finish({latitude: 48.8, longitude: 2.3, source: 'test'});});
    expect(app.state().screen).toBe('search');
  });

  it('does not overwrite another tab selection when a Search result arrives', async () => {
    const search = pending<Station[]>();
    vi.spyOn(ProviderManager.prototype, 'search').mockReturnValue(search.promise);
    const app = await open({favorites: [station, {...station, id: 'second', name: 'Second Radio'}]});
    await app.input('2'); await app.input('\u001B[B');
    await app.input(':search jazz\r');
    await app.input('\u001B[C\u001B[C\u001B[C\u001B[C\u001B[C\u001B[C\u001B[C');
    expect(app.state().screen).toBe('library');
    expect(app.state().selected).toBe(1);
    await act(async () => {search.finish([station]);});
    expect(app.state().screen).toBe('library');
    expect(app.state().selected).toBe(1);
  });

  it('retains a background failure on its own tab and permits retrying it', async () => {
    const load = pending<Station[]>();
    const nearby = vi.spyOn(ProviderManager.prototype, 'nearby').mockReturnValueOnce(load.promise).mockResolvedValue([station]);
    const app = await open();
    await app.input('3'); await app.input('\u001B[Z');
    await act(async () => {load.fail(new Error('Directory unavailable.'));});
    expect(app.state().screen).toBe('library');
    expect(app.state().stationContext.error).toBeUndefined();
    await app.input('\t');
    expect(app.state().screen).toBe('explore');
    expect(nearby).toHaveBeenCalledTimes(2);
    expect(app.state().displayStations).toEqual([station]);
  });

  it('does not reclaim focus when a country command is still looking up the directory', async () => {
    const countries = pending<typeof country[]>();
    vi.spyOn(ProviderManager.prototype, 'countries').mockReturnValue(countries.promise);
    const byCountry = vi.spyOn(ProviderManager.prototype, 'byCountry').mockResolvedValue([station]);
    const app = await open();
    await app.input(':country CA\r');
    await app.input('2');
    await act(async () => {countries.finish([country]);});
    expect(byCountry).toHaveBeenCalledWith('CA', 120, 0);
    expect(app.state().screen).toBe('library');
    expect(app.state().loadingStations).toBe(false);
  });

  it('invalidates pending location detection when Nearby location is disabled', async () => {
    const location = pending<{latitude: number; longitude: number; source: string}>();
    vi.spyOn(ProviderManager.prototype, 'detectLocation').mockReturnValue(location.promise);
    const nearby = vi.spyOn(ProviderManager.prototype, 'nearby').mockResolvedValue([station]);
    const app = await open({settings: {enableNearbyLocation: true}});
    await app.input('6');
    expect(app.state().loadingStations).toBe(true);
    await app.input(':location off\r');
    expect(app.state().loadingStations).toBe(false);
    await act(async () => {location.finish({latitude: 48.8, longitude: 2.3, source: 'test'});});
    expect(nearby).not.toHaveBeenCalled();
    expect(app.state().displayStations).toEqual([]);
  });

  it('ignores an old country page after explicitly refreshing the same country', async () => {
    const page = pending<Station[]>();
    const refresh = pending<Station[]>();
    vi.spyOn(ProviderManager.prototype, 'countries').mockResolvedValue([{...country, stationCount: 300}]);
    const byCountry = vi.spyOn(ProviderManager.prototype, 'byCountry')
      .mockResolvedValueOnce(Array.from({length: 120}, (_, index) => ({...station, id: `first-${index}`})))
      .mockReturnValueOnce(page.promise)
      .mockReturnValueOnce(refresh.promise);
    const app = await open();
    await app.input('5'); await app.input('\r');
    await app.input('\u001B[B'.repeat(119));
    expect(byCountry).toHaveBeenLastCalledWith('CA', 120, 120);
    await app.input(':country CA\r');
    expect(byCountry).toHaveBeenLastCalledWith('CA', 120, 0);
    await act(async () => {page.finish([{...station, id: 'obsolete-page'}]);});
    expect(app.state().loadingStations).toBe(true);
    expect(app.state().displayStations.some(station => station.id === 'obsolete-page')).toBe(false);
    await act(async () => {refresh.finish([station]);});
    expect(app.state().displayStations).toEqual([station]);
    expect(app.state().loadingStations).toBe(false);
  });

  it('ignores a previous query page without clearing the loading state for the new query', async () => {
    const page = pending<Station[]>();
    const next = pending<Station[]>();
    const search = vi.spyOn(ProviderManager.prototype, 'search')
      .mockResolvedValueOnce(Array.from({length: 90}, (_, index) => ({...station, id: `first-${index}`})))
      .mockReturnValueOnce(page.promise)
      .mockReturnValueOnce(next.promise);
    const app = await open();
    await app.input(':search jazz\r');
    await app.input('\u001B[B'.repeat(89)); await app.input('\u001B[27u');
    expect(search.mock.calls.at(-1)?.[2]?.offset).toBe(90);
    await app.input(':search rock\r');
    expect(search.mock.calls.at(-1)?.[0]).toBe('rock');
    await act(async () => {page.finish([{...station, id: 'obsolete-page'}]);});
    expect(app.state().loadingStations).toBe(true);
    expect(app.state().displayStations.some(station => station.id === 'obsolete-page')).toBe(false);
    await act(async () => {next.finish([station]);});
    expect(app.state().displayStations).toEqual([station]);
    expect(app.state().loadingStations).toBe(false);
  });

  it('restarts server-filtered search after changing or clearing filters and discards an obsolete page', async () => {
    const oldPage = pending<DiscoveryPage>();
    const original = Array.from({length: 90}, (_, index) => ({...station, id: `low-${index}`, bitrate: 64}));
    const high = {...station, id: 'high-quality', bitrate: 320};
    const search = vi.mocked(ProviderManager.prototype.searchPage).mockImplementation(async (_query, _settings, options = {}) => {
      if (options.cursor) return oldPage.promise;
      return options.minBitrate === 192
        ? {items: [high], exhausted: true, sources: []}
        : {items: original, exhausted: false, nextCursor: 'unfiltered:1', sources: []};
    });
    const app = await open();
    await app.input(':search jazz\r');
    await app.input('\u001B[B'.repeat(89));
    const oldSignal = search.mock.calls.at(-1)?.[2]?.signal;
    expect(search.mock.calls.at(-1)?.[2]?.cursor).toBe('unfiltered:1');
    await app.input('\u001B[27u');
    await app.input(':bitrate 192\r');
    expect(oldSignal?.aborted).toBe(true);
    expect(search.mock.calls.at(-1)?.[2]).toMatchObject({minBitrate: 192});
    expect(search.mock.calls.at(-1)?.[2]?.cursor).toBeUndefined();
    expect(app.state().displayStations).toEqual([high]);
    await act(async () => {oldPage.finish({items: [{...high, id: 'obsolete'}], exhausted: true, sources: []});});
    expect(app.state().displayStations).toEqual([high]);
    await app.input('\u001B[27u');
    await app.input(':clear\r');
    expect(search.mock.calls.at(-1)?.[2]?.cursor).toBeUndefined();
    expect(search.mock.calls.at(-1)?.[2]?.minBitrate).toBeUndefined();
    expect(app.state().displayStations).toEqual(original);
    expect(search).toHaveBeenCalledTimes(4);
  });

  it('restarts a submitted search when the enabled directory set changes', async () => {
    const search = vi.mocked(ProviderManager.prototype.searchPage).mockImplementation(async (_query, settings) => ({
      items: [{...station, id: settings.enableRadioGarden ? 'with-garden' : 'browser-only'}], exhausted: true, sources: []
    }));
    const app = await open();
    await app.input(':search jazz\r');
    await act(async () => {
      new JsonLibraryStore(app.store.filePath).updateSettings({enableRadioGarden: true});
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls.at(-1)?.[1].enableRadioGarden).toBe(true);
    expect(search.mock.calls.at(-1)?.[2]?.cursor).toBeUndefined();
    expect(app.state().displayStations[0]?.id).toBe('with-garden');
  });

  it.each([0, 10])('continues a country cursor with only %i visible rows on the first raw page', async visibleCount => {
    vi.spyOn(ProviderManager.prototype, 'countries').mockResolvedValue([{...country, stationCount: 300}]);
    const first = Array.from({length: 120}, (_, index) => ({...station, id: `first-${index}`, bitrate: index < visibleCount ? 320 : 64}));
    const later = {...station, id: 'later-match', bitrate: 320};
    const pages = vi.mocked(ProviderManager.prototype.byCountryPage)
      .mockResolvedValueOnce({items: first, exhausted: false, nextCursor: 'raw:120', sources: []})
      .mockResolvedValueOnce({items: [later], exhausted: true, sources: []});
    const app = await open();
    await app.input(':bitrate 192\r');
    await app.input(':country CA\r');
    expect(pages).toHaveBeenCalledTimes(2);
    expect(pages.mock.calls[1]?.[1]?.cursor).toBe('raw:120');
    expect(app.state().displayStations).toHaveLength(visibleCount + 1);
    expect(app.state().displayStations.at(-1)).toEqual(later);
    expect(app.state().stationContext.stations).toHaveLength(121);
  });

  it('shows a partial directory failure while retaining available search results', async () => {
    vi.mocked(ProviderManager.prototype.searchPage).mockResolvedValue({
      items: [station], exhausted: true, sources: [
        {provider: 'radio-browser', source: 'name', consumed: 1, exhausted: true, status: 'available'},
        {provider: 'radio-garden', source: 'search-snapshot', consumed: 0, exhausted: false, status: 'unavailable', message: 'Temporary outage.'}
      ]
    });
    const app = await open({settings: {enableRadioGarden: true}});
    await app.input(':search jazz\r');
    expect(app.state().displayStations).toEqual([station]);
    expect(app.state().stationContext.error).toContain('Radio Garden');
    expect(app.frame()).toContain('Some sources are unavailable (Radio Garden)');
  });
});

describe('Output setting cancellation', () => {
  it.each((['darwin', 'linux'] as const).flatMap(platform => [false, true].map(stop => ({platform, stop}))))(
    'commits the complete receiver choice before later playback on $platform with Stop=$stop', async ({platform, stop}) => {
      vi.mocked(backends.detectPlaybackBackends).mockReturnValue(['mpv', 'airplay']);
      vi.mocked(airplay.discoverAirPlayDevices).mockResolvedValue([{id: 'receiver', name: 'Test receiver', host: '192.0.2.1', port: 7000,
        txt: [], requiresPassword: false, airplay2: false}]);
      vi.spyOn(ProviderManager.prototype, 'resolve').mockImplementation(async item => ({url: item.streamUrl!}));
      let playback: PlaybackState = {backend: 'mpv', state: 'idle', volume: 70, muted: false, ready: false};
      vi.spyOn(PlayerController.prototype, 'getState').mockImplementation(() => ({...playback}));
      vi.mocked(PlayerController.prototype.stop).mockImplementation(async () => {playback = {...playback, state: 'stopped', ready: false};});
      const choose = vi.spyOn(PlayerController.prototype, 'selectAirPlayDevice');
      const usedOutputs: string[] = [];
      const play = vi.spyOn(PlayerController.prototype, 'play').mockImplementation(async function(this: PlayerController, item, url) {
        const backend = this.diagnostics().preferredBackend === 'airplay' ? 'airplay' : 'mpv';
        usedOutputs.push(backend);
        playback = {...playback, backend, state: 'playing', ready: true, stationName: item.name, streamUrl: url};
      });
      const {gate, updates} = delayFirstSettingsSave();
      const second = {...station, id: 'second-station', name: 'Second Radio', streamUrl: 'https://example.test/second'};
      const app = await open({platform, settings: {linuxAirPlayEnabled: true, preferredBackend: 'mpv'}, favorites: [station, second]});
      await app.input('2'); await app.input('\r');
      const nextStation = app.state().displayStations[1]!;
      await app.input(':airplay\r'); await app.input('\r');
      expect(updates).toHaveBeenCalledTimes(1);
      expect(updates).toHaveBeenCalledWith({preferredBackend: 'airplay', preferredAirPlayDevice: 'receiver'});
      expect(choose).not.toHaveBeenCalledWith('receiver');
      await app.input(':library\r'); await app.input('\u001B[B\r');
      expect(app.state().screen).toBe('library');
      expect(play).toHaveBeenCalledTimes(1);
      if (stop) await app.input(':stop\r');
      await act(async () => {gate.finish();});
      expect(choose).toHaveBeenCalledWith('receiver');
      expect(app.store.snapshot().settings).toMatchObject({preferredBackend: 'airplay', preferredAirPlayDevice: 'receiver'});
      expect(app.state().library.settings).toMatchObject({preferredBackend: 'airplay', preferredAirPlayDevice: 'receiver'});
      if (stop) {
        expect(play).toHaveBeenCalledTimes(1);
        expect(playback.state).toBe('stopped');
      } else {
        expect(play).toHaveBeenCalledTimes(2);
        expect(play).toHaveBeenLastCalledWith(nextStation, nextStation.streamUrl, expect.anything());
        expect(usedOutputs).toEqual(['mpv', 'airplay']);
      }
    }
  );

  it.each([false, true])('orders a new station after a pending output save and honors Stop=%s', async stop => {
    vi.mocked(backends.detectPlaybackBackends).mockReturnValue(['mpv', 'ffplay']);
    vi.spyOn(ProviderManager.prototype, 'resolve').mockImplementation(async item => ({url: item.streamUrl!}));
    let playback: PlaybackState = {backend: 'mpv', state: 'idle', volume: 70, muted: false, ready: false};
    vi.spyOn(PlayerController.prototype, 'getState').mockImplementation(() => ({...playback}));
    vi.mocked(PlayerController.prototype.stop).mockImplementation(async () => {playback = {...playback, state: 'stopped', ready: false};});
    const usedOutputs: string[] = [];
    const play = vi.spyOn(PlayerController.prototype, 'play').mockImplementation(async (item, url) => {
      const backend = app.store.snapshot().settings.preferredBackend === 'ffplay' ? 'ffplay' : 'mpv';
      usedOutputs.push(backend);
      playback = {...playback, backend, state: 'playing', ready: true, stationName: item.name, streamUrl: url};
    });
    const {gate} = delayFirstSettingsSave();
    const second = {...station, id: 'second-station', name: 'Second Radio', streamUrl: 'https://example.test/second'};
    const app = await open({settings: {preferredBackend: 'mpv'}, favorites: [station, second]});
    await app.input('2'); await app.input('\r');
    const nextStation = app.state().displayStations[1]!;
    expect(play).toHaveBeenCalledTimes(1);
    await app.input('o');
    await app.input('\u001B[B\r');
    expect(play).toHaveBeenCalledTimes(1);
    if (stop) await app.input(':stop\r');
    await act(async () => {gate.finish();});
    expect(app.store.snapshot().settings.preferredBackend).toBe('ffplay');
    if (stop) {
      expect(play).toHaveBeenCalledTimes(1);
      expect(playback.state).toBe('stopped');
    } else {
      expect(play).toHaveBeenCalledTimes(2);
      expect(play).toHaveBeenLastCalledWith(nextStation, nextStation.streamUrl, expect.anything());
      expect(usedOutputs).toEqual(['mpv', 'ffplay']);
    }
  });

  it('applies the final rapid output cycle while an earlier retune is still loading', async () => {
    vi.mocked(backends.detectPlaybackBackends).mockReturnValue(['mpv', 'ffplay', 'vlc']);
    vi.spyOn(ProviderManager.prototype, 'resolve').mockImplementation(async item => ({url: item.streamUrl!}));
    let playback: PlaybackState = {backend: 'mpv', state: 'idle', volume: 70, muted: false, ready: false};
    vi.spyOn(PlayerController.prototype, 'getState').mockImplementation(() => ({...playback}));
    vi.mocked(PlayerController.prototype.stop).mockImplementation(async () => {playback = {...playback, state: 'stopped', ready: false};});
    const firstRetune = pending<void>();
    const play = vi.spyOn(PlayerController.prototype, 'play').mockImplementation(async (item, url) => {
      const backend = app.store.snapshot().settings.preferredBackend;
      if (backend === 'ffplay') {
        // Keep the old observed output while the first replacement is starting.
        playback = {...playback, state: 'loading', ready: false};
        await firstRetune.promise;
        return;
      }
      playback = {...playback, backend: backend === 'vlc' ? 'vlc' : 'mpv', state: 'playing', ready: true, stationName: item.name, streamUrl: url};
    });
    const app = await open({settings: {preferredBackend: 'mpv'}});
    await app.input('2'); await app.input('\r');
    await app.input('o');
    expect(play).toHaveBeenCalledTimes(2);
    expect(playback.state).toBe('loading');
    await app.input('o');
    await act(async () => {firstRetune.finish();});
    expect(app.store.snapshot().settings.preferredBackend).toBe('vlc');
    expect(playback.backend).toBe('vlc');
    expect(playback.state).toBe('playing');
  });

  it.each(['cycle', 'local-receiver', 'airplay-receiver'] as const)('does not resume after Stop interrupts a pending %s output save', async action => {
    vi.mocked(backends.detectPlaybackBackends).mockReturnValue(['mpv', 'airplay']);
    vi.mocked(airplay.discoverAirPlayDevices).mockResolvedValue([{id: 'receiver', name: 'Test receiver', host: '192.0.2.1', port: 7000,
      local: action === 'local-receiver', txt: [], requiresPassword: false, airplay2: false}]);
    vi.spyOn(ProviderManager.prototype, 'resolve').mockImplementation(async item => ({url: item.streamUrl!}));
    let playback: PlaybackState = {backend: 'mpv', state: 'idle', volume: 70, muted: false, ready: false};
    vi.spyOn(PlayerController.prototype, 'getState').mockImplementation(() => ({...playback}));
    vi.mocked(PlayerController.prototype.stop).mockImplementation(async () => {playback = {...playback, state: 'stopped', ready: false};});
    const play = vi.spyOn(PlayerController.prototype, 'play').mockImplementation(async (item, url) => {
      playback = {...playback, state: 'playing', ready: true, stationName: item.name, streamUrl: url};
    });
    const saved = pending<void>();
    const originalUpdate = LibraryRepository.prototype.updateSettings;
    const updates = vi.spyOn(LibraryRepository.prototype, 'updateSettings').mockImplementation(async function(this: LibraryRepository, settings) {
      const state = await originalUpdate.call(this, settings);
      if (settings.preferredBackend) await saved.promise;
      return state;
    });
    const app = await open({platform: 'darwin'});
    await app.input('2'); await app.input('\r');
    expect(play).toHaveBeenCalledTimes(1);
    if (action === 'cycle') await app.input('o');
    else {await app.input(':airplay\r'); await app.input('\r');}
    expect(updates.mock.calls.some(([settings]) => Boolean(settings.preferredBackend))).toBe(true);
    await app.input(':stop\r');
    expect(playback.state).toBe('stopped');
    await act(async () => {saved.finish();});
    expect(play).toHaveBeenCalledTimes(1);
    expect(playback.state).toBe('stopped');
  });
});

import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough, Writable} from 'node:stream';
import {stripVTControlCharacters} from 'node:util';
import {act} from 'react';
import {render} from 'ink';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PlayerController} from '../player/player-controller.js';
import * as backendInstall from '../player/backend-install.js';
import * as airplayDiscovery from '../player/airplay-discovery.js';
import * as session from '../agent/session.js';
import * as presence from '../alarms/tui-presence.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {JsonLibraryStore} from '../storage/store.js';
import type {PlaybackState, Station} from '../types.js';
import {App} from './App.js';
import type {AlarmTuiService} from './alarm-tui-service.js';
import * as visualizers from './visualizers/receiver-visualizers.js';

const directories: string[] = [];
const instances: ReturnType<typeof render>[] = [];
const runtime = {capabilities: {supported: true, exactWake: false, catchUpAfterWake: true, message: 'ready'}, degradedAlarmIds: new Set<string>(), message: 'Native scheduler ready.'};
const service: AlarmTuiService = {
  sync: async () => null, syncAll: async () => [], remove: async () => undefined,
  runtimeStatus: async () => runtime, activeAlarms: async () => [], prepareTerminalAccess: async () => undefined,
  verifySetup: async () => ({state: 'passed', startedAt: '2026-09-07T12:00:00.000Z', steps: []})
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  for (const name of ['TERM', 'NO_COLOR', 'RADIOCLI_ASCII', 'RADIOCLI_UNICODE', 'RADIOCLI_SCREEN_READER', 'RADIOCLI_DISABLE_ANIMATION', 'RADIO_ATLAS_DISABLE_ANIMATION', 'RADIOCLI_OFFLINE', 'RADIOCLI_LOW_BANDWIDTH']) vi.stubEnv(name, undefined);
  vi.stubEnv('INK_SCREEN_READER', 'false');
  vi.stubEnv('LC_ALL', 'en_US.UTF-8');
  vi.stubEnv('RADIOCLI_DISABLE_UPDATE_CHECK', '1');
  vi.spyOn(backendInstall, 'detectPlaybackBackends').mockReturnValue(['mpv']);
  vi.spyOn(airplayDiscovery, 'discoverAirPlayDevices').mockResolvedValue([]);
  vi.spyOn(ProviderManager.prototype, 'health').mockResolvedValue({});
  vi.spyOn(session, 'startRadioSession').mockResolvedValue({close: async () => undefined});
  vi.spyOn(presence, 'registerTuiPresence').mockReturnValue(() => undefined);
  vi.spyOn(PlayerController.prototype, 'stop').mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => { for (const instance of instances.splice(0)) { instance.unmount(); instance.cleanup(); } });
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) rmSync(directory, {recursive: true, force: true});
});

describe('App terminal integration', () => {
  it('tunes the selected retained result after its search query is cleared', async () => {
    const result: Station = {id: 'search-result', provider: 'radio-browser', name: 'Search Result FM', tags: []};
    const search = vi.spyOn(ProviderManager.prototype, 'search').mockResolvedValue([result]);
    vi.spyOn(ProviderManager.prototype, 'resolve').mockResolvedValue({url: 'https://example.test/search-result'});
    const play = vi.spyOn(PlayerController.prototype, 'play').mockResolvedValue(undefined);
    const {input, lastFrame} = await openApp(false);

    await input('4');
    await input('jazz');
    await input('\r');
    expect(lastFrame()).toContain('Search Result FM');

    for (let index = 0; index < 4; index += 1) await input('\u007f');
    expect(lastFrame()).toContain('Search Result FM');
    await input('\r');

    expect(search).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(result, 'https://example.test/search-result');
  });

  it.each([
    ['Ctrl+F', '\u0006'],
    ['legacy Meta+F', '\u001bf'],
    ['Kitty Super+F', '\u001b[102;9u']
  ])('favorites a selected Search result with %s while the query remains editable', async (_label, shortcut) => {
    const result: Station = {id: 'favorite-result', provider: 'radio-browser', name: 'Favorite Result FM', tags: []};
    vi.spyOn(ProviderManager.prototype, 'search').mockResolvedValue([result]);
    vi.spyOn(ProviderManager.prototype, 'vote').mockResolvedValue(false);
    const {store, input, lastFrame} = await openApp(false);

    await input('4');
    await input('jazz');
    await input('\r');
    await input('f');
    expect(store.isFavorite(result)).toBe(false);
    expect(lastFrame()).toContain('jazzf');
    await input(shortcut);

    expect(store.isFavorite(result)).toBe(true);
    expect(lastFrame()).toContain('Added to favorites: Favorite Result FM');
    expect(lastFrame()).toContain('jazzf');

    await act(async () => { await vi.advanceTimersByTimeAsync(4499); });
    expect(lastFrame()).toContain('Added to favorites: Favorite Result FM');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(lastFrame()).not.toContain('Added to favorites: Favorite Result FM');

    await input(shortcut);
    expect(store.isFavorite(result)).toBe(false);
    expect(lastFrame()).toContain('Removed from favorites: Favorite Result FM');
    expect(lastFrame()).toContain('jazzf');
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(lastFrame()).not.toContain('Removed from favorites: Favorite Result FM');
  });

  it('keeps plain f favoriting available in station lists and Now Playing', async () => {
    vi.spyOn(ProviderManager.prototype, 'resolve').mockResolvedValue({url: 'https://example.test/portable'});
    vi.spyOn(ProviderManager.prototype, 'vote').mockResolvedValue(false);
    vi.spyOn(PlayerController.prototype, 'play').mockResolvedValue(undefined);
    const {store, input} = await openApp(false);
    const portable = store.snapshot().favorites.find(item => item.id === 'portable')!;

    await input('2');
    await input('\r');
    await input('f');
    expect(store.isFavorite(portable)).toBe(false);

    await input('b');
    await input('1');
    await input('f');
    expect(store.isFavorite(portable)).toBe(true);
  });

  it('dismisses favorite confirmations after 4.5 seconds on every station view', async () => {
    const explore: Station = {id: 'explore', provider: 'radio-browser', name: 'Explore FM', tags: []};
    const country: Station = {id: 'country', provider: 'radio-browser', name: 'Country FM', tags: []};
    vi.spyOn(ProviderManager.prototype, 'nearby').mockResolvedValue([explore]);
    vi.spyOn(ProviderManager.prototype, 'countries').mockResolvedValue([{name: 'Canada', code: 'CA', stationCount: 1}]);
    vi.spyOn(ProviderManager.prototype, 'byCountry').mockResolvedValue([country]);
    vi.spyOn(ProviderManager.prototype, 'resolve').mockResolvedValue({url: 'https://example.test/portable'});
    vi.spyOn(ProviderManager.prototype, 'vote').mockResolvedValue(false);
    vi.spyOn(PlayerController.prototype, 'play').mockResolvedValue(undefined);
    const {input, lastFrame} = await openApp(false);

    await input('2');
    await input('\r');
    await input('f');
    await expectNoticeToExpire(lastFrame, 'Removed from favorites: Portable Radio');

    await input('b');
    await input('f');
    await expectNoticeToExpire(lastFrame, 'Added to favorites: Portable Radio');

    await input('2');
    await input('f');
    await expectNoticeToExpire(lastFrame, 'Removed from favorites: Portable Radio');

    await input('b');
    await input('3');
    await input('f');
    await expectNoticeToExpire(lastFrame, 'Added to favorites: Explore FM');

    await input('b');
    await input('5');
    await input('\r');
    await input('f');
    await expectNoticeToExpire(lastFrame, 'Added to favorites: Country FM');
  }, 20_000);

  it('blocks AirPlay navigation with a clear macOS-only notice on unsupported systems', async () => {
    const {input, lastFrame} = await openApp(false, false, 'linux');
    await input('9');
    expect(lastFrame()).not.toContain('a AirPlay');

    await input('a');
    expect(lastFrame()).toContain('AirPlay output is available only on macOS');
    expect(lastFrame()).toContain('Settings');
    expect(lastFrame()).not.toContain('Choose where AirPlay playback should go');

    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(lastFrame()).not.toContain('AirPlay output is available only on macOS');

    await input('\r');
    await input('\u001B[B');
    expect(lastFrame()).toContain('AirPlay receiver (macOS only)');
    await input('\r');
    expect(lastFrame()).toContain('AirPlay output is available only on macOS');
    expect(lastFrame()).not.toContain('Choose where AirPlay playback should go');
  });

  it('keeps AirPlay navigation available on macOS', async () => {
    const {input, lastFrame} = await openApp(false, false, 'darwin');
    await input('9');
    expect(lastFrame()).toContain('a AirPlay');
    await input('a');
    expect(lastFrame()).toContain('Choose where AirPlay playback should go');
  });

  it('keeps the TUI usable when its optional alarm presence directory is read-only', async () => {
    vi.mocked(presence.registerTuiPresence).mockImplementation(() => {throw new Error('EACCES: private runtime directory');});
    const {input, lastFrame} = await openApp(false);
    expect(lastFrame()).toContain('Alarm controls cannot register');
    await input('\u001B[B');
    await input('\r');
    expect(lastFrame()).toContain('Portable Radio');
  });

  it('finishes unmount when optional alarm presence cleanup fails', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(presence.registerTuiPresence).mockReturnValue(() => {throw new Error('EACCES: private runtime directory');});
    await openApp(false);
    expect(() => act(() => {const instance = instances.pop()!;instance.unmount();instance.cleanup();})).not.toThrow();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('could not remove its alarm-control presence marker'));
  });

  it.each(['RADIOCLI_OFFLINE', 'RADIOCLI_LOW_BANDWIDTH'])('skips automatic receiver discovery with %s while keeping library navigation', async variable => {
    vi.stubEnv(variable, '1');
    const {input, lastFrame} = await openApp(false);
    expect(airplayDiscovery.discoverAirPlayDevices).not.toHaveBeenCalled();
    await input('\u001B[B');
    await input('\r');
    expect(lastFrame()).toContain('Portable Radio');
  });

  it('uses Ink accessibility state, keeps keyboard navigation, and leaves saved preferences intact', async () => {
    setPlayback('playing');
    const visualizer = vi.spyOn(visualizers, 'buildVisualizer');
    const {store, input, frames, lastFrame} = await openApp(true);
    const saved = store.snapshot().settings;
    await input('\r');
    expect(lastFrame()).toContain('Now playing');
    expect(lastFrame()).toContain('Station: No station tuned');
    expect(visualizer).not.toHaveBeenCalled();
    const frameCount = frames.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(frames).toHaveLength(frameCount);
    await input('b');
    expect(lastFrame()).toContain('Live public radio from around the world');
    expect(lastFrame()).toContain('(selected)');
    expect(store.snapshot().settings).toEqual(saved);
    expect(saved).toMatchObject({asciiMode: false, reduceMotion: false, transparentBackground: false});
  });

  it.each([
    {env: {TERM: 'dumb'}, animated: false, redirected: false},
    {env: {RADIOCLI_SCREEN_READER: '1'}, animated: false, redirected: false},
    {env: {TERM: 'xterm-256color'}, animated: false, redirected: true},
    {env: {}, animated: true, redirected: false}
  ])('keeps the loading spinner animated=$animated for $env with redirected=$redirected without changing settings', async ({env, animated, redirected}) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    setPlayback('playing');
    vi.spyOn(ProviderManager.prototype, 'resolve').mockResolvedValue({url: 'https://example.test/portable'});
    const play = vi.spyOn(PlayerController.prototype, 'play').mockImplementation(() => new Promise<void>(() => undefined));
    const {store, input, frames} = await openApp(false, redirected);
    await input('\u001B[B');
    await input('\r');
    await input('\r');
    expect(play).toHaveBeenCalled();
    const frameCount = frames.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    if (animated) expect(frames.length).toBeGreaterThan(frameCount);
    else expect(frames).toHaveLength(frameCount);
    expect(store.snapshot().settings).toMatchObject({asciiMode: false, reduceMotion: false, transparentBackground: false});
  });
});

function setPlayback(state: 'playing' | 'loading'): void {
  const playback: PlaybackState = {backend: 'mpv', state, volume: 70, muted: false, ready: state === 'playing'};
  vi.spyOn(PlayerController.prototype, 'getState').mockReturnValue(playback);
  vi.spyOn(PlayerController.prototype, 'onChange').mockImplementation(listener => { listener(playback); return () => undefined; });
}

async function openApp(screenReader: boolean, redirected = false, platform: NodeJS.Platform = process.platform) {
  const directory = mkdtempSync(join(tmpdir(), 'radiocli-portable-app-'));
  directories.push(directory);
  vi.stubEnv('RADIOCLI_HOME', directory);
  const store = new JsonLibraryStore(join(directory, 'library.json'));
  store.updateSettings({resumeOnLaunch: false, automaticUpdateChecks: false, asciiMode: false, reduceMotion: false, transparentBackground: false});
  store.toggleFavorite({id: 'portable', provider: 'radio-browser', name: 'Portable Radio', tags: [], streamUrl: 'https://example.test/portable'});
  const frames: string[] = [];
  const stdout = Object.assign(new Writable({write(chunk, _encoding, done) { frames.push(String(chunk)); done(); }}), {columns: 100, rows: 30, ...(!redirected ? {isTTY: true, getColorDepth: () => 24} : {})}) as NodeJS.WriteStream;
  const errors: string[] = [];
  const stderr = new Writable({write(chunk, _encoding, done) { errors.push(String(chunk)); done(); }}) as NodeJS.WriteStream;
  const stdin = Object.assign(new PassThrough(), {isTTY: true, setRawMode: () => undefined, ref: () => undefined, unref: () => undefined}) as unknown as NodeJS.ReadStream;
  await act(async () => {
    instances.push(render(<App store={store} alarmService={service} platform={platform} />, {stdout, stderr, stdin, debug: true, patchConsole: false, exitOnCtrlC: false, isScreenReaderEnabled: screenReader, kittyKeyboard: {mode: 'disabled'}}));
  });
  expect(errors.join('')).toBe('');
  return {
    store, frames,
    lastFrame: () => stripVTControlCharacters(frames.slice().reverse().find(frame => frame.toLowerCase().includes('radiocli')) ?? ''),
    input: async (data: string) => { await act(async () => { (stdin as unknown as PassThrough).write(data); }); }
  };
}

async function expectNoticeToExpire(lastFrame: () => string, notice: string): Promise<void> {
  expect(lastFrame()).toContain(notice);
  await act(async () => { await vi.advanceTimersByTimeAsync(4499); });
  expect(lastFrame()).toContain(notice);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(lastFrame()).not.toContain(notice);
}

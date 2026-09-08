import {act} from 'react';
import {chmodSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render as inkRender} from 'ink-testing-library';
import {ProviderManager} from '../providers/provider-manager.js';
import {PlayerController} from '../player/player-controller.js';
import * as backendInstall from '../player/backend-install.js';
import * as airplayDiscovery from '../player/airplay-discovery.js';
import * as updates from '../update-check.js';
import * as session from '../agent/session.js';
import * as presence from '../alarms/tui-presence.js';
import * as systemActions from './system-actions.js';
import * as pageFooter from './page-footer.js';
import {JsonLibraryStore} from '../storage/store.js';
import type {Alarm, IcyNowPlaying, PlaybackState, Station} from '../types.js';
import type {AlarmTuiService, TuiActiveAlarm} from './alarm-tui-service.js';
import {App} from './App.js';

const directories: string[] = [];
const pendingInputs: Array<() => void> = [];
// Exercise App and its alarm controller without host discovery or network races.
// Individual tests can still override the injected alarm/update/MCP services.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // ink-testing-library sets columns but omits rows. Give Ink's fallback the
  // fixture size so every layout avoids host terminal commands such as tput.
  vi.stubEnv('COLUMNS', '100');
  vi.stubEnv('LINES', '24');
  vi.stubEnv('LC_ALL', 'en_US.UTF-8');
  vi.stubEnv('TERM', 'xterm-256color');
  vi.stubEnv('RADIOCLI_ASCII', undefined);
  vi.stubEnv('RADIOCLI_UNICODE', undefined);
  const testHome = mkdtempSync(join(tmpdir(), 'radiocli-alarm-tui-home-'));
  directories.push(testHome);
  vi.stubEnv('RADIOCLI_HOME', testHome);
  vi.spyOn(backendInstall, 'detectPlaybackBackends').mockReturnValue(['mpv']);
  vi.spyOn(airplayDiscovery, 'discoverAirPlayDevices').mockResolvedValue([]);
  vi.spyOn(ProviderManager.prototype, 'health').mockResolvedValue({});
  vi.spyOn(updates, 'checkForUpdate').mockImplementation(async ({currentVersion = '0.2.3'} = {}) => ({
    checkedAt: new Date().toISOString(), currentVersion, updateAvailable: false
  }));
  vi.spyOn(session, 'startRadioSession').mockResolvedValue({close: async () => undefined});
  vi.spyOn(presence, 'registerTuiPresence').mockReturnValue(() => undefined);
  // These keyboard journeys repeat the same expensive footer layout many times.
  // Keep the real layout for every distinct input; its wrapping and appearance
  // also have dedicated page-footer and visual-baseline coverage.
  const layoutFooter = pageFooter.balancedFooterLegendRows;
  const footerLayouts = new Map<string, string[]>();
  vi.spyOn(pageFooter, 'balancedFooterLegendRows').mockImplementation((...args) => {
    const key = JSON.stringify(args);
    let rows = footerLayouts.get(key);
    if (!rows) {
      rows = layoutFooter(...args);
      footerLayouts.set(key, rows);
    }
    return [...rows];
  });
});
afterEach(() => {
  pendingInputs.length = 0;
  act(() => cleanup());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const path of directories.splice(0)) rmSync(path, {recursive: true, force: true});
});
const station: Station = {id: 'kexp', provider: 'radio-browser', name: 'KEXP', tags: ['indie'], streamUrl: 'https://example.test/live'};
const runtime = {capabilities: {supported: true, exactWake: false, catchUpAfterWake: true, message: 'ready'}, degradedAlarmIds: new Set<string>(), message: 'Native scheduler ready.'};

function fixture(): {store: JsonLibraryStore; service: AlarmTuiService; calls: ReturnType<typeof callsFor>} {
  const directory = mkdtempSync(join(tmpdir(), 'radiocli-alarm-tui-')); directories.push(directory);
  const store = new JsonLibraryStore(join(directory, 'library.json'), {idGenerator: () => `alarm-${Math.random()}`});
  store.toggleFavorite(station);
  const calls = callsFor();
  return {store, calls, service: {
    sync: calls.sync,
    syncAll: calls.syncAll,
    remove: calls.remove,
    runtimeStatus: calls.runtimeStatus,
    activeAlarms: calls.activeAlarms,
    prepareTerminalAccess: calls.prepareTerminalAccess,
    verifySetup: calls.verifySetup
  }};
}
function callsFor() { return {
  sync: vi.fn(async (_alarm: Alarm) => new Date()), syncAll: vi.fn(async (alarms: readonly Alarm[]) => alarms.map(alarm => ({id: alarm.id, occurrence: new Date()}))), remove: vi.fn(async (_alarm: Alarm): Promise<void> => undefined),
  runtimeStatus: vi.fn(async (_alarms: readonly Alarm[]) => runtime), activeAlarms: vi.fn(async (): Promise<TuiActiveAlarm[]> => []),prepareTerminalAccess:vi.fn(async()=>undefined),
  verifySetup:vi.fn(async (alarm:Alarm|undefined,_settings:unknown,onUpdate:(report:unknown)=>void)=>{const report={state:'passed' as const,alarmLabel:alarm?.label,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),steps:[{id:'scheduler',label:'Native scheduler',state:'passed' as const,detail:'Disposable job registered and removed.',critical:true}]};onUpdate(report);return report;})
}; }
function addAlarm(store: JsonLibraryStore): Alarm { return store.addAlarm({label: 'Morning', enabled: true, station, schedule: {type: 'recurring', time: '06:30', weekdays: [1,2,3,4,5], timezone: 'America/Los_Angeles'}, playback: {volume: 70, fadeSeconds: 30, stopAfterMinutes: 60}, reliability: {missedRunGraceMinutes: 15, wakeIfSupported: true, keepAwakeUntilAlarm: false}}); }
// Preserve rapid duplicate keys and multi-character input as one React batch,
// matching the existing tests' write/write/settle boundaries.
function render(tree: Parameters<typeof inkRender>[0]): ReturnType<typeof inkRender> {
  let app!: ReturnType<typeof inkRender>;
  act(() => { app = inkRender(tree); });
  const write = app.stdin.write;
  app.stdin.write = input => { pendingInputs.push(() => write(input)); };
  const unmount = app.unmount;
  app.unmount = () => { act(() => unmount()); };
  return app;
}
async function settle(elapsed = 0): Promise<void> {
  await act(async () => {
    for (const write of pendingInputs.splice(0)) write();
    if (elapsed > 0) await vi.advanceTimersByTimeAsync(elapsed);
  });
}
async function moveDown(app: ReturnType<typeof render>, count: number): Promise<void> { for (let index = 0; index < count; index += 1) app.stdin.write('\u001B[B'); await settle(); }

function simulatedPlayer() {
  let state: PlaybackState = {backend: 'mpv', state: 'idle', ready: false, volume: 70, muted: false};
  const listeners = new Set<(state: PlaybackState) => void>();
  const metadataListeners = new Set<(metadata: IcyNowPlaying) => void>();
  const change = (next: Partial<PlaybackState>) => {
    state = {...state, ...next};
    for (const listener of listeners) listener({...state});
  };
  vi.spyOn(PlayerController.prototype, 'getState').mockImplementation(() => ({...state}));
  vi.spyOn(PlayerController.prototype, 'onChange').mockImplementation(listener => {
    listeners.add(listener);
    listener({...state});
    return () => { listeners.delete(listener); };
  });
  vi.spyOn(PlayerController.prototype, 'onMetadata').mockImplementation(listener => {
    metadataListeners.add(listener);
    return () => { metadataListeners.delete(listener); };
  });
  const play = vi.spyOn(PlayerController.prototype, 'play').mockImplementation(async (selected, url) => {
    change({state: 'playing', ready: true, stationName: selected.name, streamUrl: url});
  });
  const stop = vi.spyOn(PlayerController.prototype, 'stop').mockImplementation(async () => {
    change({state: 'idle', ready: false});
  });
  vi.spyOn(PlayerController.prototype, 'adjustVolume').mockImplementation(async delta => {
    change({volume: state.volume + delta});
    return {ok: true};
  });
  vi.spyOn(ProviderManager.prototype, 'resolve').mockImplementation(async selected => ({url: selected.streamUrl ?? 'https://example.test/live'}));
  return {play, stop, state: () => state, metadata: (metadata: IcyNowPlaying) => {
    for (const listener of metadataListeners) listener(metadata);
  }};
}

async function tuneLibrary(app: ReturnType<typeof render>): Promise<void> {
  app.stdin.write('2');
  await settle();
  app.stdin.write('\r');
  await settle();
}

describe('Persistence failure boundaries', () => {
  const failedSave = () => { throw new Error('Library is read-only. Set RADIOCLI_HOME to a writable directory.'); };
  // Windows ACLs and a privileged POSIX user do not enforce this chmod fixture.
  const nativePermissions = process.platform !== 'win32' && process.getuid?.() !== 0;

  it.skipIf(!nativePermissions)('tunes and navigates with a readable read-only library without inventing saved history', async () => {
    const {store, service} = fixture();
    const player = simulatedPlayer();
    const original = readFileSync(store.filePath, 'utf8');
    chmodSync(store.filePath, 0o400);
    try {
      const app = render(<App store={new JsonLibraryStore(store.filePath)} alarmService={service} />);
      await settle();
      await tuneLibrary(app);
      expect(player.play).toHaveBeenCalledOnce();
      expect(player.state()).toMatchObject({state: 'playing', ready: true});
      expect(app.lastFrame()).toContain('Library not saved');
      expect(app.lastFrame()).not.toContain('Skipping');
      expect(readFileSync(store.filePath, 'utf8')).toBe(original);
      app.stdin.write('b');
      await settle();
      expect(app.lastFrame()).toContain('Overview');
      app.stdin.write('q');
      await settle();
      expect(player.state().state).toBe('idle');
      app.unmount();
    } finally {
      chmodSync(store.filePath, 0o600);
    }
  });

  it.each([':stop\r', 'q'])('still stops playback through %j when the listening-history save fails', async input => {
    const {store, service} = fixture();
    const player = simulatedPlayer();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    await tuneLibrary(app);
    vi.spyOn(store, 'finishActiveListeningSession').mockImplementation(failedSave);

    app.stdin.write(input);
    await settle();
    expect(player.state().state).toBe('idle');
    expect(player.stop).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('honors the sleep timer when the listening-history save fails', async () => {
    const {store, service} = fixture();
    const player = simulatedPlayer();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    await tuneLibrary(app);
    vi.spyOn(store, 'finishActiveListeningSession').mockImplementation(failedSave);

    app.stdin.write(':sleep 1\r');
    await settle();
    await settle(60_000);
    expect(player.state().state).toBe('idle');
    expect(app.lastFrame()).toContain('Library not saved');
    app.unmount();
  });

  it.each(['stop', 'alarm-preempt'] as const)('honors agent %s when the listening-history save fails', async type => {
    const {store, service} = fixture();
    store.updateSettings({agentControl: {...store.snapshot().settings.agentControl!, enabled: true}});
    const player = simulatedPlayer();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    await tuneLibrary(app);
    vi.spyOn(store, 'finishActiveListeningSession').mockImplementation(failedSave);
    const handle = vi.mocked(session.startRadioSession).mock.calls[0]![0];

    await act(async () => {
      const result = await handle({type});
      expect(result).toMatchObject({ok: true, status: {station: null, playback: {state: 'idle'}}});
    });
    expect(player.state().state).toBe('idle');
    expect(app.lastFrame()).toContain('Library not saved');
    app.unmount();
  });

  it('keeps successful search results usable when search history cannot be saved', async () => {
    const {store, service} = fixture();
    vi.spyOn(ProviderManager.prototype, 'search').mockResolvedValue([station]);
    vi.spyOn(store, 'addSearch').mockImplementation(failedSave);
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    app.stdin.write(':search jazz\r');
    await settle();
    expect(app.lastFrame()).toContain('KEXP');
    expect(app.lastFrame()).toContain('Library not saved');
    expect(store.snapshot().searchHistory).toEqual([]);
    app.unmount();
  });

  it.each(['metadata', 'checkpoint'] as const)('reports failed %s persistence while keeping playback active', async source => {
    const {store, service} = fixture();
    const player = simulatedPlayer();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    await tuneLibrary(app);
    const before = store.snapshot();
    if (source === 'metadata') {
      vi.spyOn(store, 'recordTrack').mockImplementation(failedSave);
      act(() => player.metadata({title: 'A song', raw: '', updatedAt: new Date().toISOString()}));
      await settle();
    } else {
      vi.spyOn(store, 'checkpointActiveListeningSession').mockImplementation(failedSave);
      await settle(30_000);
    }
    expect(app.lastFrame()).toContain('Library not saved');
    expect(player.state().state).toBe('playing');
    expect(store.snapshot()).toEqual(before);
    app.unmount();
  });

  it('reports update-check persistence failure without rejecting the background check', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('RADIOCLI_DISABLE_UPDATE_CHECK', '0');
    const {store, service} = fixture();
    vi.spyOn(store, 'updateCheckState').mockImplementation(failedSave);
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    expect(updates.checkForUpdate).toHaveBeenCalledOnce();
    expect(app.lastFrame()).toContain('Library not saved');
    expect(store.snapshot().updateCheck).toBeUndefined();
    app.unmount();
  });

  it('reports a rejected background update check', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('RADIOCLI_DISABLE_UPDATE_CHECK', '0');
    const {store, service} = fixture();
    vi.mocked(updates.checkForUpdate).mockRejectedValueOnce(new Error('Update service unavailable.'));
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    expect(app.lastFrame()).toContain('Update service unavailable.');
    app.unmount();
  });

  it.each(['t', ':location off\r', '+'])('reports a failed explicit setting through %j without claiming success', async input => {
    const {store, service} = fixture();
    simulatedPlayer();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    const settings = store.snapshot().settings;
    vi.spyOn(store, 'updateSettings').mockImplementation(failedSave);
    app.stdin.write(input);
    await settle();
    expect(app.lastFrame()).toContain('Library is read-only');
    expect(store.snapshot().settings).toEqual(settings);
    app.stdin.write('9');
    await settle();
    expect(app.lastFrame()).toContain('Choose a category');
    app.unmount();
  });

  it('reports a failed favorite write and preserves the favorite', async () => {
    const {store, service} = fixture();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    app.stdin.write('2');
    await settle();
    vi.spyOn(store, 'toggleFavorite').mockImplementation(failedSave);
    app.stdin.write('f');
    await settle();
    expect(app.lastFrame()).toContain('Library is read-only');
    expect(app.lastFrame()).not.toContain('Removed from favorites');
    expect(store.isFavorite(station)).toBe(true);
    app.unmount();
  });

  it('reports a failed media-key save from raw input', async () => {
    const {store, service} = fixture();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    app.stdin.write(':learn next\r');
    await settle();
    vi.spyOn(store, 'updateSettings').mockImplementation(failedSave);
    app.stdin.write('x');
    await settle();
    expect(app.lastFrame()).toContain('Library is read-only');
    expect(store.snapshot().settings.mediaKeys.next).toEqual([]);
    app.unmount();
  });

  it.each([
    {key: 'O', field: 'homepage' as const, value: 'javascript:unsafe-homepage'},
    {key: 'y', field: 'streamUrl' as const, value: 'javascript:unsafe-stream'}
  ])('does not echo or dispatch an invalid $field when a desktop helper is unavailable', async ({key, field, value}) => {
    const {store, service} = fixture();
    store.toggleFavorite(station);
    store.toggleFavorite({...station, [field]: value});
    const open = vi.spyOn(systemActions, 'openExternal').mockResolvedValue(false);
    const copy = vi.spyOn(systemActions, 'copyToClipboard').mockResolvedValue(false);
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    app.stdin.write('2');
    await settle();
    app.stdin.write(key);
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    expect(app.lastFrame()).not.toContain(value);
    expect(app.lastFrame()).toMatch(/valid|safe/i);
    app.unmount();
  });
});

describe('Settings TUI integration', () => {
  it('checks once at launch and shows the available version beside the installed version', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('RADIOCLI_DISABLE_UPDATE_CHECK', '0');
    const {store, service} = fixture();
    const updateChecker = vi.fn(async () => ({
      checkedAt: '2026-09-07T12:00:00.000Z',
      currentVersion: '0.2.3',
      latestVersion: '0.3.0',
      updateAvailable: true
    }));

    const app = render(<App store={store} alarmService={service} updateChecker={updateChecker} />);
    await settle();

    expect(updateChecker).toHaveBeenCalledOnce();
    expect(app.lastFrame()).toContain('v0.3.0 available  v0.2.3');
    app.unmount();
  });

  it('does not check at launch when automatic checks are disabled', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('RADIOCLI_DISABLE_UPDATE_CHECK', '0');
    const {store, service} = fixture();
    store.updateSettings({automaticUpdateChecks: false});
    const updateChecker = vi.fn();

    const app = render(<App store={store} alarmService={service} updateChecker={updateChecker} />);
    await settle();

    expect(updateChecker).not.toHaveBeenCalled();
    app.unmount();
  });

  it('navigates Settings categories and returns through the nested hierarchy', async () => {
    const {store, service} = fixture();
    const app = render(<App store={store} alarmService={service} />);
    await settle();

    app.stdin.write('9');
    await settle();
    expect(app.lastFrame()).toContain('Choose a category');
    expect(app.lastFrame()).toContain('Updates');
    expect(app.lastFrame()).toContain('Agent control & MCP');

    app.stdin.write('\r');
    await settle();
    expect(app.lastFrame()).toContain('Settings › Playback & audio');
    expect(app.lastFrame()).toContain('Audio output');

    app.stdin.write('b');
    await settle();
    expect(app.lastFrame()).toContain('Choose a category');
    expect(app.lastFrame()).not.toContain('Settings › Playback & audio');

    await moveDown(app, 4);
    app.stdin.write('\r');
    await settle();
    expect(app.lastFrame()).toContain('Settings › Agent control & MCP');
    expect(app.lastFrame()).toContain('Allow local agent control');

    app.stdin.write('b');
    await settle();
    expect(app.lastFrame()).toContain('Choose a category');
    expect(app.lastFrame()).toContain('> Agent control & MCP');
    app.stdin.write('b');
    await settle();
    expect(app.lastFrame()).toContain('Overview');
    app.unmount();
  });

  it('sets up and removes agent integrations from the same TUI control', async () => {
    const {store, service} = fixture();
    const configure = vi.fn(async (enabled: boolean) => [{
      client: 'Codex', status: enabled ? 'configured' as const : 'removed' as const, detail: 'shared user configuration'
    }]);
    const app = render(<App store={store} alarmService={service} mcpConfigurator={configure} />);
    await settle();
    app.stdin.write('9');
    await settle();
    await moveDown(app, 4);
    app.stdin.write('\r');
    await settle();
    app.stdin.write('\r');
    await settle();
    expect(configure).toHaveBeenLastCalledWith(true, expect.any(Object), null);
    expect(store.snapshot().settings.agentControl?.enabled).toBe(true);
    expect(app.lastFrame()).toContain('Agent and voice control ready');

    app.stdin.write('\r');
    await settle();
    expect(configure).toHaveBeenLastCalledWith(false, expect.any(Object), null);
    expect(store.snapshot().settings.agentControl?.enabled).toBe(false);
    app.unmount();
  });

  it('does not run overlapping MCP setup operations after repeated Enter presses', async () => {
    const {store, service} = fixture();
    let finish!: (value: Awaited<ReturnType<NonNullable<React.ComponentProps<typeof App>['mcpConfigurator']>>>) => void;
    const configure = vi.fn(() => new Promise<Awaited<ReturnType<NonNullable<React.ComponentProps<typeof App>['mcpConfigurator']>>>>(resolve => {
      finish = resolve;
    }));
    const app = render(<App store={store} alarmService={service} mcpConfigurator={configure} />);
    await settle();
    app.stdin.write('9');
    await settle();
    await moveDown(app, 4);
    app.stdin.write('\r');
    await settle();
    app.stdin.write('\r');
    app.stdin.write('\r');
    await settle();
    expect(configure).toHaveBeenCalledOnce();
    finish([{client: 'Codex', status: 'configured', detail: 'shared user configuration'}]);
    await settle();
    expect(store.snapshot().settings.agentControl?.enabled).toBe(true);
    app.unmount();
  });
});

describe('alarm TUI integration', () => {
  it('keeps ordinary query text in Search instead of treating "a" as New alarm', async () => {
    const {store, service} = fixture();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    app.stdin.write('4');
    await settle();
    for (const character of 'ambient radio') app.stdin.write(character);
    await settle();
    expect(app.lastFrame()).toContain('ambient radio');
    expect(app.lastFrame()).toContain('Search');
    expect(app.lastFrame()).not.toContain('New alarm');
    app.unmount();
  });

  it('runs injected startup reconciliation and opens Alarms as Overview item 8', async () => {
    const {store, service, calls} = fixture(); const app = render(<App store={store} alarmService={service} />);
    await settle(); expect(calls.syncAll).toHaveBeenCalledOnce(); expect(app.lastFrame()).toContain('Alarms (beta)');
    app.stdin.write('8'); await settle(); const frame=app.lastFrame()??''; expect(frame).toContain('Alarms'); expect(frame).not.toContain('No alarms yet'); expect(frame).toContain('Create alarm'); expect(frame).toContain('terminal does not need to stay open'); expect(frame).toContain('BETA · Experimental');
    app.stdin.write('\r'); await settle(); expect(app.lastFrame()).toContain('New alarm');
    app.unmount();
  });

  it('discovers a ringing alarm before startup sync and never mutates its live native job',async()=>{const {store,service,calls}=fixture();const alarm=addAlarm(store);calls.activeAlarms.mockResolvedValue([{key:'live',status:{alarmId:alarm.id,scheduledAt:new Date().toISOString(),stationName:'KEXP',startedAt:new Date().toISOString(),state:'playing'},dismiss:vi.fn(),snooze:vi.fn(),keepPlaying:vi.fn()}]);const app=render(<App store={store} alarmService={service}/>);await settle();expect(app.lastFrame()).toContain('Alarm ringing');expect(calls.syncAll).toHaveBeenCalledWith([]);expect(calls.sync).not.toHaveBeenCalled();app.unmount();});

  it('blocks delete and excludes repair or save synchronization while an alarm is playing',async()=>{const {store,service,calls}=fixture();const alarm=addAlarm(store);calls.activeAlarms.mockResolvedValue([{key:'live',status:{alarmId:alarm.id,scheduledAt:new Date().toISOString(),stationName:'KEXP',startedAt:new Date().toISOString(),state:'playing'},dismiss:vi.fn(),snooze:vi.fn(),keepPlaying:vi.fn()}]);const app=render(<App store={store} alarmService={service}/>);await settle();app.stdin.write('b');await settle();app.stdin.write('8');await settle();app.stdin.write('x');await settle();expect(calls.remove).not.toHaveBeenCalled();expect(app.lastFrame()).toContain('before deleting');const beforeRepair=calls.syncAll.mock.calls.length;app.stdin.write('r');await settle();expect(calls.syncAll.mock.calls.slice(beforeRepair).flatMap(call=>call[0])).not.toContainEqual(expect.objectContaining({id:alarm.id}));app.stdin.write('\r');await settle();app.stdin.write('\u0013');await settle();expect(calls.sync).not.toHaveBeenCalled();expect(app.lastFrame()).toContain('Current playback was left untouched');app.unmount();});

  it('leaves native jobs untouched when active-session discovery fails during startup',async()=>{const {store,service,calls}=fixture();addAlarm(store);calls.activeAlarms.mockRejectedValueOnce(new Error('discovery unavailable'));const app=render(<App store={store} alarmService={service}/>);await settle();expect(calls.syncAll).not.toHaveBeenCalled();expect(app.lastFrame()).toContain('native jobs were left untouched');app.unmount();});

  it('exposes Create alarm as a navigable row even when alarms already exist', async () => {
    const {store, service} = fixture(); addAlarm(store); const app = render(<App store={store} alarmService={service} />); await settle();
    app.stdin.write('8'); await settle(); app.stdin.write('\u001B[A');app.stdin.write('\u001B[A'); await settle();
    expect(app.lastFrame()).toContain('› Create alarm'); expect(app.lastFrame()).not.toContain('＋ Create alarm'); app.stdin.write('\r'); await settle(); expect(app.lastFrame()).toContain('New alarm'); app.unmount();
  });

  it('exposes alarm setup verification after all saved alarms',async()=>{const {store,service,calls}=fixture();addAlarm(store);const app=render(<App store={store} alarmService={service}/>);await settle();app.stdin.write('8');await settle();app.stdin.write('\u001B[B');await settle();expect(app.lastFrame()).toContain('› Verify alarm setup');expect(app.lastFrame()).not.toContain('✓ Verify alarm setup');const frame=app.lastFrame()??'';expect(frame.indexOf('Morning ·')).toBeLessThan(frame.indexOf('Verify alarm setup'));app.stdin.write('\r');await settle();expect(calls.verifySetup).toHaveBeenCalledOnce();expect(app.lastFrame()).toContain('Alarm setup verified');expect(app.lastFrame()).toContain('Disposable job registered and removed');app.stdin.write('\r');await settle();expect(app.lastFrame()).toContain('Create alarm');app.unmount();});

  it('keeps the TUI alive until a verification has removed its temporary artifacts',async()=>{const {store,service,calls}=fixture();addAlarm(store);let finish!:(report:never)=>void;calls.verifySetup.mockImplementationOnce(async (_alarm,_settings,onUpdate)=>{const running={state:'running' as const,startedAt:new Date().toISOString(),steps:[{id:'cleanup',label:'Verification cleanup',state:'running' as const,detail:'Removing the disposable job…',critical:true}]};onUpdate(running);return new Promise(resolve=>{finish=resolve as typeof finish;});});const app=render(<App store={store} alarmService={service}/>);await settle();app.stdin.write('8');await settle();app.stdin.write('\u001B[B');await settle();app.stdin.write('\r');await settle();app.stdin.write('q');await settle();expect(app.lastFrame()).toContain('Verification in progress');expect(app.lastFrame()).toContain('cleanup finishes');finish({state:'passed',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),steps:[{id:'cleanup',label:'Verification cleanup',state:'passed',detail:'Removed.',critical:true}]} as never);await settle();expect(app.lastFrame()).toContain('Alarm setup verified');app.unmount();});

  it('lets global help, command, tab, and quit controls fall through alarm screens', async () => {
    const first=fixture();const help=render(<App store={first.store} alarmService={first.service}/>);await settle();help.stdin.write('8');await settle();help.stdin.write('?');await settle();expect(help.lastFrame()).toContain('Help');help.unmount();
    const second=fixture();const command=render(<App store={second.store} alarmService={second.service}/>);await settle();command.stdin.write('8');await settle();command.stdin.write('n');await settle();command.stdin.write(':');await settle();expect(command.lastFrame()).toContain('COMMAND :');command.unmount();
    const third=fixture();const tab=render(<App store={third.store} alarmService={third.service}/>);await settle();tab.stdin.write('8');await settle();tab.stdin.write('n');await settle();await moveDown(tab,2);tab.stdin.write('\r');await settle();expect(tab.lastFrame()).toContain('Primary station');tab.stdin.write('\t');await settle();expect(tab.lastFrame()).toContain('Now playing');tab.unmount();
    const fourth=fixture();const quit=render(<App store={fourth.store} alarmService={fourth.service}/>);await settle();quit.stdin.write('8');await settle();quit.stdin.write('q');await settle();expect(quit.lastFrame()?.trim()).toBe('');quit.unmount();
  });

  it('opens a station-prefilled editor, saves locally, and keeps degraded scheduling visible', async () => {
    const {store, service, calls} = fixture(); calls.sync.mockRejectedValueOnce(new Error('launchctl unavailable'));
    const app = render(<App store={store} alarmService={service} />); await settle();
    app.stdin.write('2'); await settle(); app.stdin.write('a'); await settle();
    expect(app.lastFrame()).toContain('New alarm'); expect(app.lastFrame()).toContain('KEXP');
    app.stdin.write('\u0013'); await settle();
    expect(store.listAlarms()).toHaveLength(1); expect(app.lastFrame()).toContain('scheduling is degraded');
    app.unmount();
  });

  it('requests terminal permission while saving but still schedules audio when permission is denied',async()=>{const {store,service,calls}=fixture();calls.prepareTerminalAccess.mockRejectedValueOnce(new Error('permission denied'));const app=render(<App store={store} alarmService={service}/>);await settle();app.stdin.write('2');await settle();app.stdin.write('a');await settle();app.stdin.write('\u0013');await settle();expect(calls.prepareTerminalAccess).toHaveBeenCalledOnce();expect(calls.sync).toHaveBeenCalledOnce();expect(store.listAlarms()).toHaveLength(1);expect(app.lastFrame()).toContain('automatic terminal controls need attention');app.unmount();});

  it('leaves the editor after durable save and never hijacks later navigation while native sync is pending', async () => {
    const {store,service,calls}=fixture();let finish!:(value:Date)=>void;calls.sync.mockImplementationOnce(()=>new Promise<Date>(resolve=>{finish=resolve;}));const app=render(<App store={store} alarmService={service}/>);await settle();app.stdin.write('2');await settle();app.stdin.write('a');await settle();app.stdin.write('\u0013');app.stdin.write('\u0013');await settle();expect(store.listAlarms()).toHaveLength(1);expect(calls.sync).toHaveBeenCalledTimes(1);expect(app.lastFrame()).toContain('Alarms');app.stdin.write('b');await settle();app.stdin.write('2');await settle();app.stdin.write('a');await settle();app.stdin.write('\u0013');await settle();expect(store.listAlarms()).toHaveLength(2);expect(calls.sync).toHaveBeenCalledTimes(2);expect(app.lastFrame()).toContain('Alarms');app.stdin.write('\t');await settle();expect(app.lastFrame()).toContain('Now playing');finish(new Date());await settle();expect(store.listAlarms()).toHaveLength(2);expect(app.lastFrame()).toContain('Now playing');app.unmount();
  });

  it('does not let background active polling move a non-alarm screen cursor', async () => {
    const {store, service, calls} = fixture();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    app.stdin.write('9');
    await settle();
    await moveDown(app, 4);
    const selectedLine = app.lastFrame()?.split('\n').find(line => line.trimStart().startsWith('> '));
    expect(selectedLine).toBeTruthy();
    expect(calls.activeAlarms).toHaveBeenCalledOnce();
    await settle(1_600);
    expect(calls.activeAlarms).toHaveBeenCalledTimes(2);
    expect(app.lastFrame()?.split('\n').find(line => line.trimStart().startsWith('> '))).toBe(selectedLine);
    app.unmount();
  });

  it('toggles, confirms deletion with a second x, and cleans the native job through the injected service', async () => {
    const {store, service, calls} = fixture(); const alarm = addAlarm(store);
    const app = render(<App store={store} alarmService={service} />); await settle(); app.stdin.write('8'); await settle();
    app.stdin.write(' '); await settle(); expect(store.getAlarm(alarm.id)?.enabled).toBe(false); expect(calls.sync).toHaveBeenCalled();
    app.stdin.write('x'); await settle(); expect(store.listAlarms()).toHaveLength(1); expect(app.lastFrame()).toContain('press x again');
    app.stdin.write('x'); await settle(); expect(store.listAlarms()).toHaveLength(0); expect(calls.remove).toHaveBeenCalledWith(expect.objectContaining({id: alarm.id}));
    app.unmount();
  });

  it('keeps a failed deletion disabled and repairable instead of orphaning native or Guard state', async () => {
    const {store, service, calls} = fixture(); const alarm = addAlarm(store); calls.remove.mockRejectedValueOnce(new Error('Guard cleanup failed'));
    const app = render(<App store={store} alarmService={service} />); await settle(); app.stdin.write('8'); await settle(); app.stdin.write('x'); await settle(); app.stdin.write('x'); await settle();
    expect(store.getAlarm(alarm.id)).toMatchObject({enabled: false}); expect(app.lastFrame()).toContain('kept disabled');
    app.stdin.write('r'); await settle(); expect(calls.syncAll.mock.calls.at(-1)?.[0]).toEqual([expect.objectContaining({id: alarm.id, enabled: false})]); app.unmount();
  });

  it('does not touch native jobs when deletion cannot first save a disabled alarm', async () => {
    const {store, service, calls} = fixture();
    const alarm = addAlarm(store);
    const player = simulatedPlayer();
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    await tuneLibrary(app);
    const original = readFileSync(store.filePath, 'utf8');
    const disable = vi.spyOn(store, 'toggleAlarm').mockImplementation(() => { throw new Error('Library is read-only'); });
    calls.remove.mockRejectedValue(new Error('Native cleanup denied'));

    app.stdin.write('b'); await settle();
    app.stdin.write('8'); await settle();
    app.stdin.write('x'); app.stdin.write('x'); await settle();

    expect(calls.remove).not.toHaveBeenCalled();
    expect(store.getAlarm(alarm.id)?.enabled).toBe(true);
    expect(readFileSync(store.filePath, 'utf8')).toBe(original);
    expect(player.state().state).toBe('playing');
    expect(app.lastFrame()).toContain('Library is read-only');
    expect(app.lastFrame()).not.toContain('kept disabled');

    // A failed attempt releases the row and permits an explicit retry.
    disable.mockRestore(); calls.remove.mockResolvedValue(undefined);
    app.stdin.write('x'); app.stdin.write('x'); await settle();
    expect(store.getAlarm(alarm.id)).toBeUndefined();
    expect(calls.remove).toHaveBeenCalledOnce();
    expect(player.state().state).toBe('playing');
    app.unmount();
  });

  it('survives native cleanup failure after storage becomes unavailable without a recovery write', async () => {
    const {store, service, calls} = fixture();
    const alarm = addAlarm(store);
    const player = simulatedPlayer();
    const app = render(<App store={store} alarmService={service} />);
    await settle(); await tuneLibrary(app);
    const disable = vi.spyOn(store, 'toggleAlarm');
    calls.remove.mockImplementationOnce(async () => {
      disable.mockImplementation(() => { throw new Error('Storage disappeared during cleanup'); });
      throw new Error('Native cleanup denied');
    });
    app.stdin.write('b'); await settle();
    app.stdin.write('8'); await settle();
    app.stdin.write('x'); app.stdin.write('x'); await settle();

    expect(disable).toHaveBeenCalledOnce();
    expect(store.getAlarm(alarm.id)?.enabled).toBe(false);
    expect(new JsonLibraryStore(store.filePath).getAlarm(alarm.id)?.enabled).toBe(false);
    expect(app.lastFrame()).toContain('Native cleanup denied');
    expect(app.lastFrame()).toContain('kept disabled');
    expect(player.state().state).toBe('playing');
    app.stdin.write('b'); await settle();
    expect(app.lastFrame()).toContain('Overview');
    app.unmount();
  });

  it('retains a disabled definition and accurate diagnostics when its final deletion write fails', async () => {
    const {store, service, calls} = fixture();
    const alarm = addAlarm(store);
    const app = render(<App store={store} alarmService={service} />);
    await settle();
    const disable = vi.spyOn(store, 'toggleAlarm');
    vi.spyOn(store, 'removeAlarm').mockImplementation(() => { throw new Error('Disk full'); });
    app.stdin.write('8'); await settle();
    app.stdin.write('x'); app.stdin.write('x'); await settle();

    expect(calls.remove).toHaveBeenCalledWith(expect.objectContaining({id: alarm.id, enabled: false}));
    expect(disable).toHaveBeenCalledOnce();
    expect(new JsonLibraryStore(store.filePath).getAlarm(alarm.id)?.enabled).toBe(false);
    expect(app.lastFrame()).toContain('Native cleanup completed');
    expect(app.lastFrame()).toContain('Disk full');
    app.unmount();
  });

  it('preserves rapid disable-enable order through a deferred native sync', async () => {
    const {store, service, calls} = fixture(); addAlarm(store); let finish!: (value: Date) => void;
    calls.sync.mockImplementationOnce(async () => new Promise<Date>(resolve => { finish = resolve; }));
    const app = render(<App store={store} alarmService={service} />); await settle(); app.stdin.write('8'); await settle(); app.stdin.write(' '); app.stdin.write(' '); await settle();
    expect(store.listAlarms()[0]?.enabled).toBe(true); expect(calls.sync).toHaveBeenCalledTimes(1); expect(calls.sync.mock.calls[0]?.[0].enabled).toBe(false);
    finish(new Date()); await settle(); expect(calls.sync).toHaveBeenCalledTimes(2); expect(calls.sync.mock.calls[1]?.[0].enabled).toBe(true); app.unmount();
  });

  it('queues delete after pending sync and blocks duplicate row mutations while cleanup runs', async () => {
    const {store, service, calls} = fixture(); const alarm = addAlarm(store); let finishSync!: (value: Date) => void; let finishRemove!: () => void;
    calls.sync.mockImplementationOnce(async () => new Promise<Date>(resolve => { finishSync = resolve; })); calls.remove.mockImplementationOnce(async () => new Promise<void>(resolve => { finishRemove = resolve; }));
    const app = render(<App store={store} alarmService={service} />); await settle(); app.stdin.write('8'); await settle(); app.stdin.write(' '); await settle(); app.stdin.write('x'); app.stdin.write('x'); await settle();
    expect(calls.remove).not.toHaveBeenCalled(); expect(store.getAlarm(alarm.id)).toBeDefined(); expect(app.lastFrame()).toContain('deleting'); app.stdin.write(' '); app.stdin.write('g'); app.stdin.write('x'); await settle(); expect(store.getAlarm(alarm.id)?.enabled).toBe(false);
    finishSync(new Date()); await settle(); expect(calls.remove).toHaveBeenCalledTimes(1); expect(store.getAlarm(alarm.id)).toBeDefined(); finishRemove(); await settle(); expect(store.getAlarm(alarm.id)).toBeUndefined(); expect(calls.remove).toHaveBeenCalledTimes(1); app.unmount();
  });

  it('excludes a pending deletion from Repair and never installs it after cleanup', async () => {
    const {store, service, calls} = fixture(); const alarmA = addAlarm(store); const alarmB = store.addAlarm({...store.getAlarm(alarmA.id)!, label: 'Second', station: {...station, id: 'second'}, enabled: true}); let finishRemove!: () => void;
    calls.remove.mockImplementationOnce(async () => new Promise<void>(resolve => { finishRemove = resolve; }));
    const app = render(<App store={store} alarmService={service} />); await settle(); app.stdin.write('8'); await settle();
    app.stdin.write('\u001B[B'); await settle(); app.stdin.write('x'); app.stdin.write('x'); await settle(); expect(calls.remove).toHaveBeenCalledWith(expect.objectContaining({id: alarmA.id}));
    const repairStart = calls.syncAll.mock.calls.length; app.stdin.write('\u001B[A'); await settle(); app.stdin.write('r'); await settle();
    const repairAlarms = calls.syncAll.mock.calls.slice(repairStart).flatMap(call => call[0]); expect(repairAlarms.map(alarm => alarm.id)).toContain(alarmB.id); expect(repairAlarms.map(alarm => alarm.id)).not.toContain(alarmA.id);
    finishRemove(); await settle(); expect(store.getAlarm(alarmA.id)).toBeUndefined(); const laterAlarms = calls.syncAll.mock.calls.slice(repairStart).flatMap(call => call[0]); expect(laterAlarms.map(alarm => alarm.id)).not.toContain(alarmA.id); app.unmount();
  });

  it('coalesces a fresh runtime status pass when a mutation occurs during a stale check', async () => {
    const {store, service, calls} = fixture(); const alarm = addAlarm(store); let finishStatus!: () => void;
    calls.runtimeStatus.mockImplementationOnce(() => new Promise(resolve => { finishStatus = () => resolve(runtime); }));
    calls.runtimeStatus.mockResolvedValue({...runtime, degradedAlarmIds: new Set([alarm.id]), message: '1 alarm needs repair.'});
    const app = render(<App store={store} alarmService={service} />); await settle(); expect(calls.runtimeStatus).toHaveBeenCalledTimes(1); app.stdin.write('8'); await settle(); app.stdin.write(' '); await settle(); expect(calls.runtimeStatus).toHaveBeenCalledTimes(1);
    finishStatus(); await settle(); expect(calls.runtimeStatus).toHaveBeenCalledTimes(2); expect(app.lastFrame()).toContain('Scheduler: Degraded'); app.unmount();
  });

  it('supports station picker save, edit cancel, and explicit repair', async () => {
    const {store, service, calls} = fixture(); const app = render(<App store={store} alarmService={service} />); await settle();
    app.stdin.write('8'); await settle(); app.stdin.write('n'); await settle();
    app.stdin.write('\u001B[B'); app.stdin.write('\u001B[B'); await settle(); app.stdin.write('\r'); await settle();
    expect(app.lastFrame()).toContain('Primary station'); app.stdin.write('\r'); await settle(); expect(app.lastFrame()).toContain('Station: KEXP');
    app.stdin.write('\u0013'); await settle(); expect(store.listAlarms()).toHaveLength(1);
    const original = store.listAlarms()[0]!; app.stdin.write('\r'); await settle(); expect(app.lastFrame()).toContain('Edit alarm');
    // Ink waits 20ms to distinguish a lone Escape from a split escape sequence.
    app.stdin.write('\u001B'); await settle(20); expect(store.getAlarm(original.id)?.label).toBe(original.label);
    app.stdin.write('r'); await settle(); expect(calls.syncAll.mock.calls.length).toBeGreaterThanOrEqual(2); expect(app.lastFrame()).toContain('synchronized'); app.unmount();
  });

  it('edits text, sliders, weekday checkboxes, toggles, and clears a fallback', async () => {
    const {store, service} = fixture(); const fallback: Station = {...station, id: 'backup', name: 'Backup'};
    const alarm = store.addAlarm({label: 'Morning', enabled: true, station, schedule: {type: 'recurring', time: '06:30', weekdays: [1,2,3,4,5], timezone: 'America/Los_Angeles'}, playback: {volume: 70, fadeSeconds: 30, stopAfterMinutes: 60, fallbackStation: fallback}, reliability: {missedRunGraceMinutes: 15, wakeIfSupported: true, keepAwakeUntilAlarm: false}});
    const app = render(<App store={store} alarmService={service} />); await settle(); app.stdin.write('8'); await settle(); app.stdin.write('\r'); await settle();
    app.stdin.write('\r'); await settle(); app.stdin.write(' edited'); await settle(); app.stdin.write('\r'); await settle();
    await moveDown(app, 1); app.stdin.write('\r'); await settle();
    await moveDown(app, 4); app.stdin.write('\r'); await settle(); app.stdin.write('\u001B[B'); await settle(); app.stdin.write(' '); await settle(); app.stdin.write('\u001B[B'); await settle(); app.stdin.write('\u001B[B'); await settle(); app.stdin.write(' '); await settle(); app.stdin.write('\r'); await settle();
    await moveDown(app, 2); app.stdin.write('\r'); await settle(); app.stdin.write('\u001B[C'); await settle(); app.stdin.write('\u001B[C'); await settle(); app.stdin.write('\u001B[C'); await settle(); app.stdin.write('\r'); await settle();
    await moveDown(app, 3); app.stdin.write('\r'); await settle(); expect(app.lastFrame()).toContain('Fallback station'); app.stdin.write('\r'); await settle();
    await moveDown(app, 3); app.stdin.write('\r'); await settle(); await moveDown(app, 1); app.stdin.write('\r'); await settle();
    app.stdin.write('\u0013'); await settle(); const updated = store.getAlarm(alarm.id)!;
    expect(updated.label).toContain('edited'); expect(updated.enabled).toBe(false); expect(updated.schedule).toMatchObject({weekdays: [1,3,5]}); expect(updated.playback.volume).toBe(85); expect(updated.playback.fallbackStation).toBeUndefined(); expect(updated.reliability).toMatchObject({wakeIfSupported: false, keepAwakeUntilAlarm: true}); app.unmount();
  });

  it('edits hours and minutes as separate arrow-controlled segments', async () => {
    const {store, service} = fixture(); addAlarm(store); const app = render(<App store={store} alarmService={service} />); await settle(); app.stdin.write('8'); await settle(); app.stdin.write('\r'); await settle();
    await moveDown(app, 4); app.stdin.write('\r'); await settle(); expect(app.lastFrame()).toContain('chooses hours');
    app.stdin.write('\u001B[A'); await settle(); app.stdin.write('\r'); await settle(); app.stdin.write('\u001B[A'); await settle();
    app.stdin.write('\r'); await settle(); expect(app.lastFrame()).toContain('Enter opens the time control'); app.stdin.write('\u0013'); await settle(); expect(store.listAlarms()[0]?.schedule).toMatchObject({time: '07:31'}); app.unmount();
  });

  it('scrolls through the alarm editor with the terminal mouse wheel',async()=>{const {store,service}=fixture();const app=render(<App store={store} alarmService={service}/>);await settle();app.stdin.write('8');await settle();app.stdin.write('n');await settle();expect(app.lastFrame()).toContain('› Label');for(let index=0;index<6;index+=1)app.stdin.write('\u001B[<65;4;8M');await settle();expect(app.lastFrame()).toContain('› Cancel');expect(app.lastFrame()).not.toContain('BASICS');app.stdin.write('\u001B[<64;4;8M');await settle();expect(app.lastFrame()).toContain('› Alarm Guard');app.unmount();});

  it('locks contradictory ringing controls while a terminal action is pending', async () => {
    const {store, service, calls} = fixture(); let finish!:()=>void;const dismiss = vi.fn(async () => undefined); const snooze = vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})); const keepPlaying = vi.fn(async () => undefined);
    calls.activeAlarms.mockResolvedValue([{key: 'active', status: {alarmId: 'wake', scheduledAt: new Date().toISOString(), stationName: 'KEXP', startedAt: new Date().toISOString(), state: 'playing'}, dismiss, snooze, keepPlaying}]);
    const app = render(<App store={store} alarmService={service} />); await settle();
    expect(app.lastFrame()).toContain('Alarm ringing'); app.stdin.write(' ');app.stdin.write('\r'); await settle(); expect(snooze).toHaveBeenCalledWith(10);expect(dismiss).not.toHaveBeenCalled();expect(keepPlaying).not.toHaveBeenCalled();expect(app.lastFrame()).toContain('already pending');finish();await settle();app.unmount();
  });

  it('uses Enter to acknowledge the alarm, keep audio running, and open Playing', async () => {
    const {store, service, calls} = fixture(); const dismiss = vi.fn(async () => undefined); const handoff=vi.fn(async()=>undefined);const preview=vi.fn(async()=>undefined);
    calls.activeAlarms.mockResolvedValue([{key: 'active', status: {alarmId: 'wake', scheduledAt: new Date().toISOString(), stationName: 'KEXP', station, startedAt: new Date().toISOString(), state: 'playing'}, dismiss, snooze: vi.fn(), keepPlaying:vi.fn(),handoff}]);
    const app = render(<App store={store} alarmService={service} alarmPreview={preview}/>); await settle(); expect(app.lastFrame()).toContain('ALARM ACTIVE'); app.stdin.write('\r'); await settle(); expect(preview).toHaveBeenCalledWith(station);expect(handoff).toHaveBeenCalledOnce();expect(dismiss).not.toHaveBeenCalled();expect(app.lastFrame()).toContain('Now playing');expect(app.lastFrame()).not.toContain('ALARM PLAYING');expect(app.lastFrame()).not.toContain('Alarm acknowledged');app.unmount();
  });

  it('returns to the alarm list after snooze instead of leaving a zero-session ringing screen',async()=>{const {store,service,calls}=fixture();addAlarm(store);const snooze=vi.fn(async()=>undefined);calls.activeAlarms.mockResolvedValue([{key:'active',status:{alarmId:store.listAlarms()[0]!.id,scheduledAt:new Date().toISOString(),stationName:'KEXP',startedAt:new Date().toISOString(),state:'playing'},dismiss:vi.fn(),snooze,keepPlaying:vi.fn()}]);const app=render(<App store={store} alarmService={service}/>);await settle();expect(app.lastFrame()).toContain('Alarm ringing');app.stdin.write(' ');await settle();expect(snooze).toHaveBeenCalledWith(10);expect(app.lastFrame()).toContain('Alarms');expect(app.lastFrame()).toContain('will ring again at');expect(app.lastFrame()).not.toContain('0 active alarms');app.unmount();});

  it('hands off the exact selected alarm when multiple sessions are active',async()=>{const {store,service,calls}=fixture();const first={key:'first',status:{alarmId:'first',scheduledAt:new Date().toISOString(),stationName:'First',station,startedAt:new Date().toISOString()},dismiss:vi.fn(),snooze:vi.fn(),keepPlaying:vi.fn(async()=>undefined),handoff:vi.fn(async()=>undefined)};const second={key:'second',status:{alarmId:'second',scheduledAt:new Date().toISOString(),stationName:'Second',station,startedAt:new Date().toISOString()},dismiss:vi.fn(),snooze:vi.fn(),keepPlaying:vi.fn(async()=>undefined),handoff:vi.fn(async()=>undefined)};calls.activeAlarms.mockResolvedValue([first,second]);const preview=vi.fn(async()=>undefined);const app=render(<App store={store} alarmService={service} alarmPreview={preview}/>);await settle();app.stdin.write('\u001B[B');await settle();expect(app.lastFrame()).toContain('Second');app.stdin.write('\r');await settle();expect(second.handoff).toHaveBeenCalled();expect(first.handoff).not.toHaveBeenCalled();expect(preview).toHaveBeenCalledWith(station);app.unmount();});

  it('discovers ringing sessions while a native status request is still slow', async () => {
    const {store, service, calls} = fixture(); let resolveStatus!: () => void;
    calls.runtimeStatus.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = () => resolve(runtime); }));
    calls.activeAlarms.mockResolvedValue([{key: 'active', status: {alarmId: 'wake', scheduledAt: new Date().toISOString(), stationName: 'KEXP', startedAt: new Date().toISOString()}, dismiss: vi.fn(), snooze: vi.fn(), keepPlaying: vi.fn()}]);
    const app = render(<App store={store} alarmService={service} />); await settle(); expect(app.lastFrame()).toContain('Alarm ringing'); expect(calls.activeAlarms).toHaveBeenCalled(); resolveStatus(); await settle(); app.unmount();
  });

  it('uses ! for active controls even from Explore and keeps test-tune injectable', async () => {
    const {store, service, calls} = fixture(); addAlarm(store); const preview = vi.fn(async () => undefined);
    calls.activeAlarms.mockResolvedValue([{key: 'active', status: {alarmId: store.listAlarms()[0]!.id, scheduledAt: new Date().toISOString(), stationName: 'KEXP', startedAt: new Date().toISOString()}, dismiss: vi.fn(), snooze: vi.fn(), keepPlaying: vi.fn()}]);
    const providers = {nearby: vi.fn(async () => []), health: vi.fn(async () => ({}))};
    const app = render(<App store={store} alarmService={service} alarmPreview={preview} providers={providers as never} />); await settle(); app.stdin.write('b'); await settle(); expect(app.lastFrame()).toContain('Overview'); app.stdin.write('3'); await settle(); expect(app.lastFrame()).toContain('Explore');
    app.stdin.write('!'); await settle(); expect(app.lastFrame()).toContain('Alarm ringing'); app.stdin.write('b'); await settle(); app.stdin.write('b'); await settle(); app.stdin.write('8'); await settle(); app.stdin.write('t'); await settle(); expect(preview).toHaveBeenCalledWith(station); app.unmount();
  });
});

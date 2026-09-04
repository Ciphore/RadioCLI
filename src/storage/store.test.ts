import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {JsonLibraryStore} from './store.js';
import {AlarmPowerGuardStore} from '../alarms/power-guard-store.js';
import {defaultReceiverStyle, receiverStyleNames, themeNames, type AlarmCreateInput, type Station} from '../types.js';

const roots: string[] = [];
const originalRadioCliHome = process.env.RADIOCLI_HOME;
const originalRadioAtlasHome = process.env.RADIO_ATLAS_HOME;

describe('JsonLibraryStore', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, {recursive: true, force: true});
    }

    restoreEnv('RADIOCLI_HOME', originalRadioCliHome);
    restoreEnv('RADIO_ATLAS_HOME', originalRadioAtlasHome);
  });

  it('enables nearby location lookup by default for new stores', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');

    const settings = new JsonLibraryStore(file).snapshot().settings;
    expect(settings.enableNearbyLocation).toBe(true);
    expect(settings.mouseSupport).toBe(true);
    expect(new JsonLibraryStore(file).snapshot().alarms).toEqual([]);
  });

  it('migrates legacy libraries without alarms to an empty alarm collection', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    writeFileSync(file, JSON.stringify({settings: {theme: 'amber'}}), 'utf8');

    expect(new JsonLibraryStore(file).snapshot().alarms).toEqual([]);
  });

  it('creates, updates, toggles, records, snoozes, lists, and removes alarms', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const store = new JsonLibraryStore(file, {
      idGenerator: () => 'alarm-id',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    const created = store.addAlarm(exampleAlarm());
    expect(created.id).toBe('alarm-id');
    expect(created.createdAt).toBe('2026-08-22T12:00:00.000Z');
    expect(store.getAlarm('alarm-id')?.label).toBe('Morning radio');
    expect(store.listAlarms()).toHaveLength(1);

    store.updateAlarm('alarm-id', {label: 'Workday wake-up', playback: {...created.playback, volume: 41}});
    expect(store.getAlarm('alarm-id')).toMatchObject({label: 'Workday wake-up', playback: {volume: 41}});
    store.toggleAlarm('alarm-id', false);
    expect(store.getAlarm('alarm-id')?.enabled).toBe(false);

    store.snoozeAlarm('alarm-id', new Date('2026-08-22T12:10:00.000Z'));
    expect(store.getAlarm('alarm-id')?.nextOverride?.at).toBe('2026-08-22T12:10:00.000Z');
    store.recordAlarmOutcome('alarm-id', {
      status: 'played',
      scheduledAt: '2026-08-22T12:10:00.000Z',
      firedAt: '2026-08-22T12:10:01.000Z',
      finishedAt: '2026-08-22T12:40:00.000Z',
      message: 'Completed normally'
    });
    expect(store.getAlarm('alarm-id')?.lastRun).toMatchObject({status: 'played', message: 'Completed normally'});
    expect(store.getAlarm('alarm-id')?.nextOverride).toBeUndefined();

    expect(store.removeAlarm('alarm-id')).toBe(true);
    expect(store.removeAlarm('missing')).toBe(false);
    expect(new JsonLibraryStore(file).snapshot().alarms).toEqual([]);
  });

  it('merges independent alarm writers, including deletion', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const initial = new JsonLibraryStore(file, {idGenerator: () => 'shared'});
    initial.addAlarm(exampleAlarm());

    const first = new JsonLibraryStore(file, {idGenerator: () => 'first'});
    const second = new JsonLibraryStore(file, {idGenerator: () => 'second'});
    first.addAlarm({...exampleAlarm(), label: 'First writer'});
    second.addAlarm({...exampleAlarm(), label: 'Second writer'});
    expect(new JsonLibraryStore(file).snapshot().alarms.map(alarm => alarm.id).sort())
      .toEqual(['first', 'second', 'shared']);

    const updater = new JsonLibraryStore(file);
    const remover = new JsonLibraryStore(file);
    updater.updateAlarm('shared', {label: 'Changed concurrently'});
    remover.removeAlarm('shared');

    expect(new JsonLibraryStore(file).snapshot().alarms.map(alarm => alarm.id).sort())
      .toEqual(['first', 'second']);
  });

  it('records a stale runner outcome without overwriting newer TUI edits', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    new JsonLibraryStore(file, {idGenerator: () => 'shared'}).addAlarm(exampleAlarm());
    const runner = new JsonLibraryStore(file, {now: () => new Date('2026-08-24T13:30:00.000Z')});
    const tui = new JsonLibraryStore(file, {now: () => new Date('2026-08-24T13:05:00.000Z')});

    tui.updateAlarm('shared', {
      label: 'Edited in TUI',
      playback: {...exampleAlarm().playback, volume: 62}
    });
    runner.recordAlarmOutcome('shared', {
      status: 'played',
      scheduledAt: '2026-08-24T13:00:00.000Z',
      firedAt: '2026-08-24T13:00:01.000Z',
      finishedAt: '2026-08-24T13:30:00.000Z'
    });

    expect(new JsonLibraryStore(file).getAlarm('shared')).toMatchObject({
      label: 'Edited in TUI',
      playback: {volume: 62},
      lastRun: {status: 'played'}
    });
  });

  it('does not resurrect an alarm deleted while a stale runner was active', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    new JsonLibraryStore(file, {idGenerator: () => 'shared'}).addAlarm(exampleAlarm());
    const runner = new JsonLibraryStore(file);
    const tui = new JsonLibraryStore(file);
    tui.removeAlarm('shared');

    expect(() => runner.recordAlarmOutcome('shared', {
      status: 'failed',
      scheduledAt: '2026-08-24T13:00:00.000Z',
      message: 'Stream failed'
    })).toThrow(/not found/i);
    expect(() => runner.snoozeAlarm('shared', new Date(Date.now() + 60_000))).toThrow(/not found/i);
    expect(new JsonLibraryStore(file).snapshot().alarms).toEqual([]);
  });

  it('rechecks generated alarm IDs under the store lock and retries collisions', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const first = new JsonLibraryStore(file, {idGenerator: () => 'collision'});
    const generated = ['collision', 'second-id'];
    const second = new JsonLibraryStore(file, {idGenerator: () => generated.shift() ?? 'second-id'});

    first.addAlarm(exampleAlarm());
    expect(second.addAlarm({...exampleAlarm(), label: 'Second'}).id).toBe('second-id');
    expect(new JsonLibraryStore(file).snapshot().alarms.map(alarm => alarm.id).sort())
      .toEqual(['collision', 'second-id']);
  });

  it('round-trips alarm definitions, history, and snooze through backup v1', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const sourceFile = join(root, 'source.json');
    const destinationFile = join(root, 'destination.json');
    const backupFile = join(root, 'alarms-backup.json');
    const guardFile = join(root, 'runtime', 'alarm-power-guards.json');
    const source = new JsonLibraryStore(sourceFile, {
      idGenerator: () => 'portable-alarm',
      now: () => new Date('2026-08-24T13:00:00.000Z')
    });
    source.addAlarm(exampleAlarm());
    source.snoozeAlarm('portable-alarm', new Date('2026-08-24T13:10:00.000Z'));
    source.recordAlarmOutcome('portable-alarm', {
      status: 'failed',
      scheduledAt: '2026-08-21T13:00:00.000Z',
      firedAt: '2026-08-21T13:00:05.000Z',
      finishedAt: '2026-08-21T13:00:06.000Z',
      message: 'Stream unavailable'
    }, {clearNextOverride: false});
    new AlarmPowerGuardStore(guardFile).request('portable-alarm', '2026-08-24T13:00:00.000Z');
    source.exportBackup(backupFile);

    const imported = new JsonLibraryStore(destinationFile).importBackup(backupFile).state;
    expect(imported.alarms).toHaveLength(1);
    expect(imported.alarms[0]).toMatchObject({
      id: 'portable-alarm',
      lastRun: {status: 'failed', message: 'Stream unavailable'},
      nextOverride: {at: '2026-08-24T13:10:00.000Z'}
    });
    expect(new AlarmPowerGuardStore(guardFile).get('portable-alarm')?.status).toBe('requested');
    expect(JSON.stringify(JSON.parse(readFileSync(backupFile, 'utf8')))).not.toMatch(/powerGuard|processId|ipc/i);
  });

  it('rejects malformed alarm time, timezone, and weekdays without writing', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const store = new JsonLibraryStore(file);

    expect(() => store.addAlarm({...exampleAlarm(), schedule: {
      type: 'recurring', time: '25:00', weekdays: [1], timezone: 'UTC'
    }})).toThrow(/time/i);
    expect(() => store.addAlarm({...exampleAlarm(), schedule: {
      type: 'recurring', time: '06:00', weekdays: [1], timezone: 'Mars/Olympus_Mons'
    }})).toThrow(/timezone/i);
    expect(() => store.addAlarm({...exampleAlarm(), schedule: {
      type: 'recurring', time: '06:00', weekdays: [] as never, timezone: 'UTC'
    }})).toThrow(/weekday/i);
    expect(store.snapshot().alarms).toEqual([]);
  });

  it('rejects snoozing at or before the current time', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const store = new JsonLibraryStore(file, {
      idGenerator: () => 'alarm-id',
      now: () => new Date('2026-08-24T13:00:00.000Z')
    });
    store.addAlarm(exampleAlarm());

    expect(() => store.snoozeAlarm('alarm-id', new Date('2026-08-24T13:00:00.000Z'))).toThrow(/future/i);
    expect(() => store.snoozeAlarm('alarm-id', new Date('2026-08-24T12:59:59.000Z'))).toThrow(/future/i);
    expect(store.getAlarm('alarm-id')?.nextOverride).toBeUndefined();
  });

  it('normalizes alarm time, weekdays, and timezone when reading legacy data', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const seed = new JsonLibraryStore(file, {idGenerator: () => 'normalized'});
    seed.addAlarm(exampleAlarm());
    const raw = JSON.parse(readFileSync(file, 'utf8')) as {alarms: Array<Record<string, unknown>>};
    raw.alarms[0] = {
      ...raw.alarms[0],
      schedule: {type: 'recurring', time: '6:00', weekdays: [5, 1, 1], timezone: 'US/Pacific'}
    };
    writeFileSync(file, JSON.stringify(raw), 'utf8');

    expect(new JsonLibraryStore(file).snapshot().alarms[0]?.schedule).toEqual({
      type: 'recurring', time: '06:00', weekdays: [1, 5], timezone: 'America/Los_Angeles'
    });
  });

  it('rejects backup imports containing duplicate alarm IDs', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const backupFile = join(root, 'duplicate.json');
    const store = new JsonLibraryStore(file, {idGenerator: () => 'kept'});
    store.addAlarm(exampleAlarm());
    store.exportBackup(backupFile);
    const backup = JSON.parse(readFileSync(backupFile, 'utf8')) as {library: {alarms: unknown[]}};
    backup.library.alarms.push(structuredClone(backup.library.alarms[0]));
    writeFileSync(backupFile, JSON.stringify(backup), 'utf8');

    expect(() => store.importBackup(backupFile)).toThrow(/duplicate alarm id/i);
    expect(store.snapshot().alarms.map(alarm => alarm.id)).toEqual(['kept']);
  });

  it('accepts 500 alarms but rejects a 501st on import and create without data loss', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const sourceFile = join(root, 'source.json');
    const destinationFile = join(root, 'destination.json');
    const backupFile = join(root, 'maximum.json');
    const source = new JsonLibraryStore(sourceFile, {idGenerator: () => 'template'});
    source.addAlarm(exampleAlarm());
    source.exportBackup(backupFile);
    const backup = JSON.parse(readFileSync(backupFile, 'utf8')) as {library: {alarms: Array<Record<string, unknown>>}};
    const template = backup.library.alarms[0] ?? {};
    backup.library.alarms = Array.from({length: 500}, (_, index) => ({...template, id: `alarm-${index}`}));
    writeFileSync(backupFile, JSON.stringify(backup), 'utf8');

    const destination = new JsonLibraryStore(destinationFile, {idGenerator: () => 'alarm-500'});
    expect(destination.importBackup(backupFile).state.alarms).toHaveLength(500);
    expect(() => destination.addAlarm(exampleAlarm())).toThrow(/500/);
    expect(destination.snapshot().alarms).toHaveLength(500);

    backup.library.alarms.push({...template, id: 'alarm-500'});
    writeFileSync(backupFile, JSON.stringify(backup), 'utf8');
    expect(() => destination.importBackup(backupFile)).toThrow(/500/);
    expect(new JsonLibraryStore(destinationFile).snapshot().alarms).toHaveLength(500);
  });

  it('persists recents, favorites, and settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const station: Station = {
      id: 'station-1',
      provider: 'radio-browser',
      name: 'Test FM',
      tags: ['test']
    };

    const store = new JsonLibraryStore(file);
    store.addRecent(station);
    store.startListeningSession(station, new Date('2026-05-24T12:00:00.000Z'));
    store.finishActiveListeningSession(new Date('2026-05-24T12:05:00.000Z'));
    store.toggleFavorite(station);
    store.addImported([{...station, id: 'custom-1', provider: 'playlist', streamUrl: 'https://example.com/live'}]);
    const activeSession = store.updateSettings({
      theme: 'amber',
      receiverStyle: 'mesh',
      preferredBackend: 'airplay',
      preferredAirPlayDevice: '5CAAFD0046D4@Office',
      mediaKeys: {previous: ['prev'], playPause: ['pause'], next: ['next']}
    });
    expect(activeSession.settings.preferredBackend).toBe('airplay');

    const reloaded = new JsonLibraryStore(file).snapshot();
    expect(reloaded.recent[0]?.station.name).toBe('Test FM');
    expect(reloaded.activity.sessions[0]?.listenedSeconds).toBe(300);
    expect(reloaded.favorites[0]?.id).toBe('station-1');
    expect(reloaded.imported[0]?.id).toBe('custom-1');
    expect(reloaded.settings.theme).toBe('amber');
    expect(reloaded.settings.receiverStyle).toBe('mesh');
    expect(reloaded.settings.receiverStyleVersion).toBe(2);
    expect(reloaded.settings.preferredBackend).toBe('auto');
    expect(reloaded.settings.preferredAirPlayDevice).toBe('5CAAFD0046D4@Office');
    expect(reloaded.settings.mediaKeys.next).toEqual(['next']);
  });

  it('recovers interrupted listening at the last heartbeat instead of the next launch', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const firstStation: Station = {id: 'first', provider: 'radio-browser', name: 'First FM', tags: []};
    const nextStation: Station = {id: 'next', provider: 'radio-browser', name: 'Next FM', tags: []};
    const store = new JsonLibraryStore(file);

    store.startListeningSession(firstStation, new Date('2026-08-09T12:00:00.000Z'));
    store.checkpointActiveListeningSession(new Date('2026-08-09T12:04:00.000Z'));
    store.startListeningSession(nextStation, new Date('2026-08-09T20:00:00.000Z'));

    const recovered = store.snapshot().activity.sessions[1];
    expect(recovered?.endedAt).toBe('2026-08-09T12:04:00.000Z');
    expect(recovered?.lastActiveAt).toBe('2026-08-09T12:04:00.000Z');
    expect(recovered?.listenedSeconds).toBe(240);
  });

  it('exports and restores the complete preferences and library backup', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const backupFile = join(root, 'portable-backup.json');
    const station: Station = {id: 'favorite', provider: 'radio-browser', name: 'Favorite FM', tags: ['jazz']};
    const store = new JsonLibraryStore(file);

    store.toggleFavorite(station);
    store.addRecent(station);
    store.addImported([{...station, id: 'custom', provider: 'playlist', streamUrl: 'https://example.com/live'}]);
    store.recordTrack(station, 'Artist - Track');
    store.addSearch('late night jazz');
    store.startListeningSession(station, new Date('2026-07-20T20:00:00.000Z'));
    store.finishActiveListeningSession(new Date('2026-07-20T20:05:00.000Z'));
    store.updateSettings({theme: 'ruby', receiverStyle: 'skyline', volume: 42});

    expect(store.exportBackup(backupFile)).toBe(backupFile);
    expect(JSON.parse(readFileSync(backupFile, 'utf8'))).toMatchObject({
      format: 'radiocli-backup',
      version: 1,
      library: {settings: {theme: 'ruby', receiverStyle: 'skyline', volume: 42}}
    });

    store.toggleFavorite(station);
    store.updateSettings({theme: 'green', volume: 70});
    const imported = store.importBackup(backupFile);

    expect(imported.state.favorites.map(item => item.id)).toContain('favorite');
    expect(imported.state.imported.map(item => item.id)).toContain('custom');
    expect(imported.state.trackHistory[0]?.title).toBe('Artist - Track');
    expect(imported.state.searchHistory).toContain('late night jazz');
    expect(imported.state.activity.sessions[0]?.listenedSeconds).toBe(300);
    expect(imported.state.settings).toMatchObject({theme: 'ruby', receiverStyle: 'skyline', volume: 42});
    expect(imported.safetyBackupPath && existsSync(imported.safetyBackupPath)).toBe(true);
    expect(new JsonLibraryStore(file).snapshot().favorites.map(item => item.id)).toContain('favorite');
  });

  it('rejects invalid imports without replacing the current library', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const backupFile = join(root, 'invalid-backup.json');
    const station: Station = {id: 'kept', provider: 'radio-browser', name: 'Keep FM', tags: []};
    const store = new JsonLibraryStore(file);
    store.toggleFavorite(station);
    writeFileSync(backupFile, JSON.stringify({not: 'a RadioCLI backup'}), 'utf8');

    expect(() => store.importBackup(backupFile)).toThrow();
    expect(store.snapshot().favorites.map(item => item.id)).toEqual(['kept']);
    expect(new JsonLibraryStore(file).snapshot().favorites.map(item => item.id)).toEqual(['kept']);
  });

  it('merges independent writers without losing library or setting changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const first = new JsonLibraryStore(file);
    const second = new JsonLibraryStore(file);
    const jazz: Station = {id: 'jazz', provider: 'radio-browser', name: 'Jazz FM', tags: []};
    const news: Station = {id: 'news', provider: 'radio-browser', name: 'News FM', tags: []};

    first.toggleFavorite(jazz);
    second.toggleFavorite(news);
    first.updateSettings({theme: 'amber'});
    second.updateSettings({volume: 35});

    const merged = new JsonLibraryStore(file).snapshot();
    expect(merged.favorites.map(station => station.id).sort()).toEqual(['jazz', 'news']);
    expect(merged.settings.theme).toBe('amber');
    expect(merged.settings.volume).toBe(35);
  });

  it('records track history per station, deduping consecutive repeats, and persists it', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const station: Station = {id: 'station-1', provider: 'radio-browser', name: 'Test FM', tags: []};
    const other: Station = {id: 'station-2', provider: 'radio-browser', name: 'Other FM', tags: []};

    const store = new JsonLibraryStore(file);
    store.recordTrack(station, 'Artist - Song One');
    store.recordTrack(station, 'Artist - Song One');
    store.recordTrack(station, '   ');
    store.recordTrack(other, 'Different - Track');
    const latest = store.recordTrack(station, 'Artist - Song Two');

    expect(latest.trackHistory.map(track => track.title)).toEqual([
      'Artist - Song Two',
      'Different - Track',
      'Artist - Song One'
    ]);

    const reloaded = new JsonLibraryStore(file).snapshot();
    expect(reloaded.trackHistory).toHaveLength(3);
    expect(reloaded.trackHistory[0]?.stationName).toBe('Test FM');
  });

  it('records search history newest-first, deduped and capped', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');

    const store = new JsonLibraryStore(file);
    store.addSearch('jazz');
    store.addSearch('   ');
    store.addSearch('tokyo');
    const latest = store.addSearch('jazz');

    expect(latest.searchHistory).toEqual(['jazz', 'tokyo']);
    expect(new JsonLibraryStore(file).snapshot().searchHistory).toEqual(['jazz', 'tokyo']);
  });

  it('treats AirPlay as a session output and restarts on automatic local playback', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    writeFileSync(
      file,
      JSON.stringify({
        recent: [],
        favorites: [],
        imported: [],
        activity: {sessions: []},
        settings: {
          theme: 'ruby',
          receiverStyle: 'mesh',
          receiverStyleVersion: 2,
          volume: 70,
          enableRadioGarden: false,
          enableNearbyLocation: false,
          preferredBackend: 'airplay',
          preferredAirPlayDevice: '5CAAFD0046D4@Office',
          tuneTimeoutSeconds: 12,
          skipBrokenStreams: true
        }
      }),
      'utf8'
    );

    const state = new JsonLibraryStore(file).snapshot();

    expect(state.settings.preferredBackend).toBe('auto');
    expect(state.settings.preferredAirPlayDevice).toBe('5CAAFD0046D4@Office');
  });

  it('backs up corrupt store files before resetting', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    writeFileSync(file, '{not json', 'utf8');
    const store = new JsonLibraryStore(file);
    expect(store.snapshot().settings.theme).toBe('green');
    expect(store.snapshot().settings.receiverStyle).toBe(defaultReceiverStyle);
    expect(store.snapshot().activity.sessions).toEqual([]);
    expect(readdirSync(root).some(name => name.startsWith('library.json.bad-'))).toBe(true);
  });

  it.each(['scope', 'spectrum', 'oscilloscope', 'motion-bars', 'radar', 'dual-ripple', 'perspective-floor', 'bloom-bars', 'running-horse', 'starlink', 'tuning-dial', 'cassette', `${'term'}${'flix'}-plasma`, 'sierpinksi', 'voronoi', 'orbits', 'chromatic', 'ferro-crown', 'origami-tide', 'tv-static', 'sunspot', 'plasma', 'metaballs', 'motion-blob', 'clifford', 'mirror', 'paris', 'kyoto', 'sahara'])(
    'migrates removed receiver style %s to the default receiver style',
    receiverStyle => {
      const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
      roots.push(root);
      const file = join(root, 'library.json');
      writeFileSync(
        file,
        JSON.stringify({
          recent: [],
          favorites: [],
          imported: [],
          activity: {sessions: []},
          settings: {
            theme: 'ruby',
            receiverStyle,
            volume: 70,
            enableRadioGarden: false,
            enableNearbyLocation: false,
            preferredBackend: 'auto',
            tuneTimeoutSeconds: 12,
            skipBrokenStreams: true
          }
        }),
        'utf8'
      );

      const state = new JsonLibraryStore(file).snapshot();
      expect(state.settings.theme).toBe('ruby');
      expect(state.settings.receiverStyle).toBe(defaultReceiverStyle);
      expect(state.settings.receiverStyleVersion).toBe(2);
      expect(state.settings.mediaKeys).toEqual({previous: [], playPause: [], next: []});
    }
  );

  it.each(['sumi-mountains', 'moonlit-tide'])(
    'migrates replaced receiver style %s to sumi-ocean',
    receiverStyle => {
      const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
      roots.push(root);
      const file = join(root, 'library.json');
      writeFileSync(
        file,
        JSON.stringify({
          recent: [],
          favorites: [],
          imported: [],
          activity: {sessions: []},
          settings: {receiverStyle, receiverStyleVersion: 2}
        }),
        'utf8'
      );

      expect(new JsonLibraryStore(file).snapshot().settings.receiverStyle).toBe('sumi-ocean');
    }
  );

  it('preserves the restored equalizer receiver style', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    writeFileSync(
      file,
      JSON.stringify({
        recent: [],
        favorites: [],
        imported: [],
        activity: {sessions: []},
        settings: {
          theme: 'violet',
          receiverStyle: 'equalizer',
          receiverStyleVersion: 2,
          volume: 70,
          enableRadioGarden: false,
          enableNearbyLocation: false,
          preferredBackend: 'auto',
          tuneTimeoutSeconds: 12,
          skipBrokenStreams: true
        }
      }),
      'utf8'
    );

    const state = new JsonLibraryStore(file).snapshot();
    expect(state.settings.theme).toBe('violet');
    expect(state.settings.receiverStyle).toBe('equalizer');
    expect(state.settings.receiverStyleVersion).toBe(2);
  });

  it('defaults missing preferred AirPlay device to undefined', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    writeFileSync(
      file,
      JSON.stringify({
        recent: [],
        favorites: [],
        imported: [],
        activity: {sessions: []},
        settings: {
          theme: 'ruby',
          receiverStyle: 'mesh',
          volume: 70,
          enableRadioGarden: false,
          enableNearbyLocation: false,
          preferredBackend: 'auto',
          tuneTimeoutSeconds: 12,
          skipBrokenStreams: true
        }
      }),
      'utf8'
    );

    expect(new JsonLibraryStore(file).snapshot().settings.preferredAirPlayDevice).toBeUndefined();
  });

  it('ignores unknown station metadata instead of resetting the whole library', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    writeFileSync(
      file,
      JSON.stringify({
        recent: [
          {
            station: {
              id: 'station-with-extra-field',
              provider: 'radio-browser',
              name: 'Extra Field FM',
              tags: [],
              experimentalDirectoryField: 'kept out of app state'
            },
            playedAt: new Date(2026, 6, 3).toISOString()
          }
        ],
        favorites: [],
        imported: [],
        activity: {sessions: []},
        settings: {
          theme: 'green',
          receiverStyle: 'pulse-grid',
          volume: 70,
          enableRadioGarden: false,
          preferredBackend: 'auto',
          tuneTimeoutSeconds: 12,
          skipBrokenStreams: true
        }
      }),
      'utf8'
    );

    const state = new JsonLibraryStore(file).snapshot();

    expect(state.recent[0]?.station.name).toBe('Extra Field FM');
    expect(state.settings.enableNearbyLocation).toBe(true);
  });

  it('persists every receiver style exposed by the UI cycle', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const store = new JsonLibraryStore(file);

    for (const receiverStyle of receiverStyleNames) {
      store.updateSettings({receiverStyle});
      expect(new JsonLibraryStore(file).snapshot().settings.receiverStyle).toBe(receiverStyle);
    }
  });

  it('persists every display color exposed by the UI cycle', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const store = new JsonLibraryStore(file);

    for (const theme of themeNames) {
      store.updateSettings({theme});
      expect(new JsonLibraryStore(file).snapshot().settings.theme).toBe(theme);
    }
  });

  it('uses the new RADIOCLI_HOME override', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    process.env.RADIOCLI_HOME = root;

    const store = new JsonLibraryStore();
    expect(store.filePath).toBe(join(root, 'radiocli.json'));
  });

  it('still accepts the old RADIO_ATLAS_HOME override for existing setups', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    process.env.RADIO_ATLAS_HOME = root;

    const store = new JsonLibraryStore();
    expect(store.filePath).toBe(join(root, 'radio-atlas.json'));
  });

});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function exampleAlarm(): AlarmCreateInput {
  return {
    label: 'Morning radio',
    enabled: true,
    station: {id: 'morning', provider: 'radio-browser', name: 'Morning FM', tags: ['news']},
    schedule: {
      type: 'recurring',
      time: '06:00',
      weekdays: [1, 2, 3, 4, 5],
      timezone: 'America/Los_Angeles'
    },
    playback: {
      volume: 35,
      fadeSeconds: 30,
      stopAfterMinutes: 60,
      fallbackStation: {id: 'fallback', provider: 'radio-browser', name: 'Backup FM', tags: []}
    },
    reliability: {missedRunGraceMinutes: 10, wakeIfSupported: false}
  };
}
